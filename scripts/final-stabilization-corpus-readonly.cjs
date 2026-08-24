"use strict";

/**
 * Privacy-safe, read-only production inventory for the final-stabilization
 * program. It emits opaque resource/job/run identities, source checksums, byte
 * counts, and aggregate states only. It never emits filenames, metadata,
 * candidate values, OCR text, URLs, capabilities, or credentials.
 *
 * The script is intended to be piped to the production host's `node -` so it
 * executes against the already-installed exact release dependency tree:
 *
 *   Get-Content scripts/final-stabilization-corpus-readonly.cjs -Raw |
 *     ssh academiccloud-prod "node -"
 *
 * Optional exact Owner checksum matches can be supplied as a JSON array in
 * OWNER_CHECKSUMS_JSON. Each item must contain algorithm, checksum, and bytes.
 */

const Database = require("/opt/academiccloud/current/node_modules/better-sqlite3");

const database = new Database("/var/lib/academiccloud/academiccloud.sqlite", {
  readonly: true,
  fileMustExist: true,
});
database.pragma("query_only = ON");

function rows(sql, parameters = []) {
  return database.prepare(sql).all(...parameters);
}

function scalar(sql, parameters = []) {
  const row = database.prepare(sql).get(...parameters);
  return row ? Object.values(row)[0] : null;
}

function ownerChecksums() {
  const raw = process.env.OWNER_CHECKSUMS_BASE64
    ? Buffer.from(process.env.OWNER_CHECKSUMS_BASE64, "base64").toString("utf8")
    : process.env.OWNER_CHECKSUMS_JSON;
  if (!raw) return [];
  const value = JSON.parse(raw);
  if (!Array.isArray(value)) throw new Error("OWNER_CHECKSUMS_JSON must be an array");
  return value.map((item) => {
    const checksum = String(item?.checksum ?? "");
    const hexadecimal = /^[a-f0-9]{32}$|^[a-f0-9]{64}$/u.test(checksum.toLowerCase());
    const base64 = /^(?:[A-Za-z0-9+/]{22}==|[A-Za-z0-9+/]{43}=)$/u.test(checksum);
    if (!item || typeof item !== "object"
      || !["md5", "sha256"].includes(String(item.algorithm).toLowerCase())
      || (!hexadecimal && !base64)
      || !Number.isSafeInteger(item.bytes) || item.bytes < 1) {
      throw new Error("OWNER_CHECKSUMS_JSON contains an invalid identity");
    }
    return {
      algorithm: String(item.algorithm).toLowerCase(),
      checksum: hexadecimal ? checksum.toLowerCase() : checksum,
      bytes: item.bytes,
    };
  });
}

const eligibility = `
  FROM libraries l
  JOIN scholarly_records sr
    ON sr.owner_domain_id = l.owner_domain_id
  JOIN scholarly_artifacts a
    ON a.owner_domain_id = sr.owner_domain_id
   AND a.record_id = sr.id
   AND a.attachment_state = 'attached'
  JOIN scholarly_artifact_versions v
    ON v.owner_domain_id = a.owner_domain_id
   AND v.artifact_id = a.id
  JOIN files f
    ON f.id = v.stored_file_id
   AND f.owner_domain_id = l.owner_domain_id
  WHERE f.state = 'active'
    AND lower(coalesce(f.media_type, '')) = 'application/pdf'
    AND f.size_bytes BETWEEN 1 AND 4294967296
`;

const resources = rows(`
  WITH eligible AS (
    SELECT l.id AS libraryId, f.id AS fileId,
           f.size_bytes AS sizeBytes, f.revision AS fileRevision,
           lower(coalesce(f.checksum_algorithm, '')) AS checksumAlgorithm,
           coalesce(f.checksum, '') AS checksum
      ${eligibility}
  ),
  ranked_jobs AS (
    SELECT j.*,
           row_number() OVER (
             PARTITION BY j.scope_id, j.resource_id
             ORDER BY CASE WHEN j.state IN ('queued', 'running') THEN 0 ELSE 1 END,
                      j.created_at DESC, j.id DESC
           ) AS rank
      FROM derived_compute_jobs j
     WHERE j.kind = 'metadata_suggestion'
  ),
  ranked_runs AS (
    SELECT r.*,
           row_number() OVER (
             PARTITION BY r.library_id, r.file_id
             ORDER BY r.created_at DESC, r.id DESC
           ) AS rank
      FROM scholarly_metadata_suggestion_runs r
  ),
  candidate_counts AS (
    SELECT c.run_id AS runId,
           count(*) AS candidateCount,
           sum(CASE WHEN c.source_type = 'filename' OR c.evidence_origin = 'filename' THEN 1 ELSE 0 END) AS filenameCandidateCount,
           sum(CASE WHEN c.source_type <> 'filename' AND c.evidence_origin <> 'filename' THEN 1 ELSE 0 END) AS nonFilenameEvidenceCount
      FROM scholarly_metadata_suggestion_candidates c
     GROUP BY c.run_id
  ),
  applied_counts AS (
    SELECT source_run_id AS runId, count(*) AS appliedFieldCount
      FROM scholarly_bibliographic_field_authority
     WHERE authority_source = 'ai' AND source_run_id IS NOT NULL
     GROUP BY source_run_id
  ),
  ai_reviewable_runs AS (
    SELECT suggestion_run_id AS runId, 1 AS aiReviewable
      FROM scholarly_bibliographic_ai_runs
     WHERE status IN ('auto_apply', 'ambiguous')
     GROUP BY suggestion_run_id
  )
  SELECT e.libraryId, e.fileId, e.sizeBytes, e.fileRevision,
         e.checksumAlgorithm, e.checksum,
         j.id AS latestJobId, j.input_version AS latestJobInputVersion,
         j.state AS latestJobState, j.attempts AS latestJobAttempts,
         j.active_attempt_id AS latestAttemptId,
         j.provider_job_id AS latestProviderJobId,
         j.result_ref AS latestJobResultRef,
         j.error_code AS latestJobErrorCode,
         j.origin AS latestJobOrigin, j.queue_priority AS latestJobPriority,
         j.created_at AS latestJobCreatedAt, j.started_at AS latestJobStartedAt,
         j.finished_at AS latestJobFinishedAt,
         r.id AS latestRunId, r.status AS latestRunStatus,
         r.page_count AS latestRunPageCount,
         json_array_length(r.page_indices) AS latestRunPageIndexCount,
         r.window_complete AS latestRunWindowComplete,
         r.created_at AS latestRunCreatedAt,
         coalesce(c.candidateCount, 0) AS candidateCount,
         coalesce(c.filenameCandidateCount, 0) AS filenameCandidateCount,
         coalesce(c.nonFilenameEvidenceCount, 0) AS nonFilenameEvidenceCount,
         coalesce(a.appliedFieldCount, 0) AS appliedFieldCount,
         coalesce(ai.aiReviewable, 0) AS aiReviewable
    FROM eligible e
    LEFT JOIN ranked_jobs j
      ON j.scope_id = e.libraryId AND j.resource_id = e.fileId AND j.rank = 1
    LEFT JOIN ranked_runs r
      ON r.library_id = e.libraryId AND r.file_id = e.fileId AND r.rank = 1
    LEFT JOIN candidate_counts c ON c.runId = r.id
    LEFT JOIN applied_counts a ON a.runId = r.id
    LEFT JOIN ai_reviewable_runs ai ON ai.runId = r.id
   ORDER BY e.libraryId, e.fileId
`);

const exactDuplicateGroups = rows(`
  SELECT lower(f.checksum_algorithm) AS checksumAlgorithm,
         f.checksum AS checksum,
         f.size_bytes AS sizeBytes,
         count(*) AS resourceCount,
         json_group_array(f.id) AS fileIds
    ${eligibility}
   AND f.checksum_algorithm IS NOT NULL
   AND f.checksum IS NOT NULL
   GROUP BY lower(f.checksum_algorithm), f.checksum, f.size_bytes
  HAVING count(*) > 1
   ORDER BY resourceCount DESC, checksumAlgorithm, checksum
`);

const ownerMatches = ownerChecksums().map((identity) => ({
  ...identity,
  matches: rows(`
    SELECT l.id AS libraryId, f.id AS fileId, f.revision AS fileRevision
      ${eligibility}
     AND lower(coalesce(f.checksum_algorithm, '')) = ?
     AND coalesce(f.checksum, '') = ?
     AND f.size_bytes = ?
     ORDER BY l.id, f.id
  `, [identity.algorithm, identity.checksum, identity.bytes]),
}));

const stateCounts = Object.fromEntries(rows(`
  SELECT coalesce(latestJobState, 'not_run') AS state, count(*) AS count
    FROM (
      SELECT e.fileId,
             (
               SELECT j.state
                 FROM derived_compute_jobs j
                WHERE j.kind = 'metadata_suggestion'
                  AND j.scope_id = e.libraryId
                  AND j.resource_id = e.fileId
                ORDER BY CASE WHEN j.state IN ('queued', 'running') THEN 0 ELSE 1 END,
                         j.created_at DESC, j.id DESC
                LIMIT 1
             ) AS latestJobState
        FROM (SELECT l.id AS libraryId, f.id AS fileId ${eligibility}) e
    )
   GROUP BY coalesce(latestJobState, 'not_run')
   ORDER BY state
`).map(({ state, count }) => [state, count]));

const semanticAnomalies = resources.filter((resource) => {
  if (resource.latestJobState !== "succeeded") return false;
  return !resource.latestJobResultRef
    || resource.latestJobResultRef !== resource.latestRunId;
}).map((resource) => ({
  libraryId: resource.libraryId,
  fileId: resource.fileId,
  latestJobId: resource.latestJobId,
  latestJobState: resource.latestJobState,
  latestJobErrorCode: resource.latestJobErrorCode,
  latestRunId: resource.latestRunId,
  latestRunStatus: resource.latestRunStatus,
  candidateCount: resource.candidateCount,
  filenameCandidateCount: resource.filenameCandidateCount,
  nonFilenameEvidenceCount: resource.nonFilenameEvidenceCount,
  aiReviewable: resource.aiReviewable === 1,
}));

const errorCounts = Object.fromEntries(resources
  .filter((resource) => resource.latestJobState === "failed")
  .reduce((counts, resource) => counts.set(
    resource.latestJobErrorCode ?? "unknown",
    (counts.get(resource.latestJobErrorCode ?? "unknown") ?? 0) + 1,
  ), new Map())
  .entries());
const errorTimingSummaries = Object.fromEntries([...resources
  .filter((resource) => resource.latestJobState === "failed")
  .reduce((groups, resource) => {
    const key = resource.latestJobErrorCode ?? "unknown";
    const group = groups.get(key) ?? [];
    group.push(resource);
    groups.set(key, group);
    return groups;
  }, new Map())
  .entries()].map(([errorCode, group]) => {
    const queueMilliseconds = group.flatMap((resource) => {
      if (!resource.latestJobCreatedAt || !resource.latestJobStartedAt) return [];
      return [Date.parse(resource.latestJobStartedAt) - Date.parse(resource.latestJobCreatedAt)];
    });
    const runMilliseconds = group.flatMap((resource) => {
      if (!resource.latestJobStartedAt || !resource.latestJobFinishedAt) return [];
      return [Date.parse(resource.latestJobFinishedAt) - Date.parse(resource.latestJobStartedAt)];
    });
    const average = (values) => values.length === 0 ? null : Math.round(values.reduce((sum, value) => sum + value, 0) / values.length);
    return [errorCode, {
      count: group.length,
      minBytes: Math.min(...group.map((resource) => resource.sizeBytes)),
      maxBytes: Math.max(...group.map((resource) => resource.sizeBytes)),
      averageBytes: Math.round(group.reduce((sum, resource) => sum + resource.sizeBytes, 0) / group.length),
      neverStarted: group.filter((resource) => !resource.latestJobStartedAt).length,
      missingProviderReceipt: group.filter((resource) => !resource.latestProviderJobId).length,
      averageQueueMilliseconds: average(queueMilliseconds),
      averageRunMilliseconds: average(runMilliseconds),
    }];
  }));
const semanticStateCounts = Object.fromEntries(resources.reduce((counts, resource) => {
  let state;
  if (resource.latestJobState === "queued" || resource.latestJobState === "running" || resource.latestJobState === "failed") {
    state = resource.latestJobState;
  } else if (resource.latestJobState === "succeeded") {
    const currentResult = resource.latestJobResultRef && resource.latestJobResultRef === resource.latestRunId;
    if (currentResult && (resource.latestRunStatus === "accepted" || resource.appliedFieldCount > 0)) state = "applied";
    else if (!currentResult) state = "extraction_only";
    else if (resource.aiReviewable === 1) state = "ai_succeeded_reviewable";
    else if (resource.nonFilenameEvidenceCount > 0
      || resource.latestRunPageCount !== null
      || resource.latestRunPageIndexCount > 0
      || resource.latestRunWindowComplete) state = "extraction_only";
    else state = "filename_inference_only";
  } else if (!resource.latestRunId) state = "not_run";
  else if (resource.latestRunStatus === "accepted" || resource.appliedFieldCount > 0) state = "applied";
  else if (resource.nonFilenameEvidenceCount > 0
    || resource.latestRunPageCount !== null
    || resource.latestRunPageIndexCount > 0
    || resource.latestRunWindowComplete) state = "extraction_only";
  else state = "filename_inference_only";
  counts.set(state, (counts.get(state) ?? 0) + 1);
  return counts;
}, new Map()).entries());

const output = {
  sqliteUserVersion: database.pragma("user_version", { simple: true }),
  migrationHistory: rows("SELECT version FROM schema_migrations ORDER BY version").map(({ version }) => version),
  productionEligibleTotal: resources.length,
  productionEligibleBytes: resources.reduce((sum, resource) => sum + resource.sizeBytes, 0),
  stateCounts,
  semanticStateCounts,
  errorCounts,
  errorTimingSummaries,
  exactDuplicateGroupCount: exactDuplicateGroups.length,
  exactDuplicateResourceCount: exactDuplicateGroups.reduce((sum, group) => sum + group.resourceCount, 0),
  exactDuplicateGroups,
  ownerMatches,
  semanticAnomalyCount: semanticAnomalies.length,
  focus: /^[A-Za-z0-9_-]{1,128}$/u.test(process.env.FOCUS_JOB_ID ?? "")
    ? resources.filter((resource) => resource.latestJobId === process.env.FOCUS_JOB_ID).map((resource) => ({
        sizeBytes: resource.sizeBytes,
        latestJobState: resource.latestJobState,
        latestJobAttempts: resource.latestJobAttempts,
        latestJobErrorCode: resource.latestJobErrorCode,
        latestJobCreatedAt: resource.latestJobCreatedAt,
        latestJobStartedAt: resource.latestJobStartedAt,
        latestJobFinishedAt: resource.latestJobFinishedAt,
        latestRunStatus: resource.latestRunStatus,
        latestRunWindowComplete: resource.latestRunWindowComplete,
        candidateCount: resource.candidateCount,
        nonFilenameEvidenceCount: resource.nonFilenameEvidenceCount,
        aiReviewable: resource.aiReviewable === 1,
      }))
    : undefined,
  focusErrors: /^compute_[a-z_]{1,64}$/u.test(process.env.FOCUS_ERROR_CODE ?? "")
    ? resources
        .filter((resource) => resource.latestJobState === "failed"
          && resource.latestJobErrorCode === process.env.FOCUS_ERROR_CODE)
        .map((resource) => ({
          latestJobId: resource.latestJobId,
          latestAttemptId: resource.latestAttemptId,
          latestProviderJobId: resource.latestProviderJobId,
          sizeBytes: resource.sizeBytes,
          latestJobAttempts: resource.latestJobAttempts,
          latestJobCreatedAt: resource.latestJobCreatedAt,
          latestJobStartedAt: resource.latestJobStartedAt,
          latestJobFinishedAt: resource.latestJobFinishedAt,
        }))
    : undefined,
  semanticAnomalies: process.env.SUMMARY_ONLY === "1" ? undefined : semanticAnomalies,
  resources: process.env.SUMMARY_ONLY === "1" ? undefined : resources,
  databaseIntegrity: scalar("PRAGMA integrity_check"),
  foreignKeyViolations: rows("PRAGMA foreign_key_check").length,
};

console.log(JSON.stringify(output, null, 2));
database.close();
