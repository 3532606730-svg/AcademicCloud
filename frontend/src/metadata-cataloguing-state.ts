import type {
  BibliographicFieldAuthority,
  DerivedMetadataJob,
  MetadataCataloguingState,
  MetadataSuggestionRun,
} from "./api.ts";

export interface MetadataCataloguingProjectionInput {
  job: DerivedMetadataJob | null;
  run: MetadataSuggestionRun | null;
  fieldAuthorities?: readonly BibliographicFieldAuthority[];
  authoritativeState?: MetadataCataloguingState | null;
}

/**
 * Project the current user-visible AI state without treating a fast filename
 * fallback as proof that OCR/reasoning succeeded. The newest job wins over an
 * older run, and an exact resultRef/sourceRunId link is required for genuine
 * reviewable or applied AI success.
 */
export function deriveMetadataCataloguingState({
  job,
  run,
  fieldAuthorities = [],
  authoritativeState = null,
}: MetadataCataloguingProjectionInput): MetadataCataloguingState {
  if (job?.state === "queued") return "queued";
  if (job?.state === "running") return "running";
  if (job?.state === "failed") return "failed";

  const currentResult = run !== null && (job === null || job.resultRef === run.id);
  const applied = run !== null && (
    run.status === "accepted"
    || fieldAuthorities.some((authority) => authority.source === "ai" && authority.sourceRunId === run.id)
  );
  if (currentResult && applied) return "applied";
  // Only Core can bind the current suggestion run to immutable structured AI
  // evidence. Candidate source alone proves extraction, not Qwen success.
  if (authoritativeState === "ai_succeeded_reviewable") return authoritativeState;

  const nonFilenameCandidateCount = run?.candidates.filter((candidate) => (
    candidate.sourceType !== "filename" && candidate.evidenceOrigin !== "filename"
  )).length ?? 0;
  const extractionObserved = run !== null && (
    run.window.pageCount !== null || run.window.pageIndices.length > 0 || run.window.complete
  );

  if (job?.state === "succeeded") {
    if (!run || !currentResult) return "extraction_only";
    return nonFilenameCandidateCount > 0 || extractionObserved ? "extraction_only" : "filename_inference_only";
  }

  if (!run) return "not_run";
  if (applied) return "applied";
  if (nonFilenameCandidateCount > 0 || extractionObserved) return "extraction_only";
  return "filename_inference_only";
}
