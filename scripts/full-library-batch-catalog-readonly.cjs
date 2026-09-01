"use strict";

/**
 * Privacy-safe, read-only inventory for the ADR-039 production export phase.
 * It emits aggregate counts plus opaque resource IDs only. It never emits
 * filenames, metadata values, source bytes, URLs, capabilities, or secrets.
 */

const Database = require("/opt/academiccloud/current/node_modules/better-sqlite3");

const database = new Database("/var/lib/academiccloud/academiccloud.sqlite", {
  readonly: true,
  fileMustExist: true,
});
database.pragma("query_only = ON");

const rows = (sql, parameters = []) => database.prepare(sql).all(...parameters);
const scalar = (sql, parameters = []) => {
  const row = database.prepare(sql).get(...parameters);
  return row ? Object.values(row)[0] : null;
};

const baseResources = `
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
`;

const resources = rows(`
  WITH attached AS (
    SELECT DISTINCT l.id AS libraryId, sr.id AS recordId, f.id AS fileId,
           f.state AS fileState, lower(coalesce(f.media_type, '')) AS mediaType,
           f.size_bytes AS sizeBytes, f.revision AS fileRevision
      ${baseResources}
  ),
  eligible AS (
    SELECT *
      FROM attached
     WHERE fileState = 'active'
       AND mediaType = 'application/pdf'
       AND sizeBytes BETWEEN 1 AND 4294967296
       AND fileRevision >= 0
       AND length(fileId) BETWEEN 1 AND 128
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
  SELECT e.libraryId, e.fileId,
         j.state AS latestJobState, j.result_ref AS latestJobResultRef,
         r.id AS latestRunId, r.status AS latestRunStatus,
         coalesce(a.appliedFieldCount, 0) AS appliedFieldCount,
         coalesce(ai.aiReviewable, 0) AS aiReviewable
    FROM eligible e
    LEFT JOIN ranked_jobs j
      ON j.scope_id = e.libraryId AND j.resource_id = e.fileId AND j.rank = 1
    LEFT JOIN ranked_runs r
      ON r.library_id = e.libraryId AND r.file_id = e.fileId AND r.rank = 1
    LEFT JOIN applied_counts a ON a.runId = r.id
    LEFT JOIN ai_reviewable_runs ai ON ai.runId = r.id
   ORDER BY e.libraryId, e.fileId
`);

const semanticState = (resource) => {
  if (["queued", "running", "failed"].includes(resource.latestJobState)) return resource.latestJobState;
  if (resource.latestJobState === "succeeded") {
    const currentResult = resource.latestJobResultRef && resource.latestJobResultRef === resource.latestRunId;
    if (currentResult && (resource.latestRunStatus === "accepted" || resource.appliedFieldCount > 0)) return "applied";
    if (!currentResult) return "extraction_only";
    if (resource.aiReviewable === 1) return "ai_succeeded_reviewable";
    return "extraction_only";
  }
  if (!resource.latestRunId) return "not_run";
  if (resource.latestRunStatus === "accepted" || resource.appliedFieldCount > 0) return "applied";
  return "extraction_only";
};

const processedStates = new Set(["applied", "ai_succeeded_reviewable"]);
const processed = resources.filter((resource) => processedStates.has(semanticState(resource)));
const eligible = resources.filter((resource) => !processedStates.has(semanticState(resource)));
const attachedStateCounts = Object.fromEntries(rows(`
  SELECT fileState, count(*) AS count
    FROM (
      SELECT DISTINCT f.id AS fileId, f.state AS fileState ${baseResources}
    )
   GROUP BY fileState
   ORDER BY fileState
`).map(({ fileState, count }) => [fileState, count]));
const activeMediaTypeCounts = Object.fromEntries(rows(`
  SELECT mediaType, count(*) AS count
    FROM (
      SELECT DISTINCT f.id AS fileId, lower(coalesce(f.media_type, '')) AS mediaType
        ${baseResources}
       WHERE f.state = 'active'
    )
   GROUP BY mediaType
   ORDER BY mediaType
`).map(({ mediaType, count }) => [mediaType, count]));
const totalLibraryResources = scalar(`SELECT count(*) FROM (SELECT DISTINCT f.id ${baseResources})`);
const batchSize = Math.min(100, eligible.length);

const output = {
  task: "ACADEMICCLOUD-FULL-LIBRARY-BATCH-CATALOG",
  totalLibraryResources,
  attachedStateCounts,
  activeMediaTypeCounts,
  stableEligiblePdfResources: resources.length,
  alreadyProcessed: processed.length,
  eligibleForCatalog: eligible.length,
  batchSize,
  estimatedBatchCount: batchSize === 0 ? 0 : Math.ceil(eligible.length / batchSize),
  processedResourceIds: processed.map(({ libraryId, fileId }) => ({ libraryId, fileId })),
  firstBatchResourceIds: eligible.slice(0, batchSize).map(({ libraryId, fileId }) => ({ libraryId, fileId })),
  databaseIntegrity: database.pragma("integrity_check", { simple: true }),
  foreignKeyViolations: rows("PRAGMA foreign_key_check").length,
};

console.log(JSON.stringify(output, null, 2));
database.close();
