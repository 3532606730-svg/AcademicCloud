import assert from "node:assert/strict";
import { test } from "node:test";

import type { DerivedJobRecord } from "../../src/jobs/job.js";
import type { SuggestionRunStateEvidence } from "../../src/suggestions/repositories.js";
import { deriveMetadataCataloguingState } from "../../src/suggestions/suggestion-service.js";

const JOB: Pick<DerivedJobRecord, "state" | "resultRef"> = {
  state: "succeeded",
  resultRef: "run-computed",
};
const FILENAME: SuggestionRunStateEvidence = {
  id: "run-filename",
  fileId: "file-1",
  status: "ready",
  pageCount: null,
  pageIndices: [],
  windowComplete: false,
  candidateCount: 1,
  nonFilenameCandidateCount: 0,
  aiReviewable: false,
  applied: false,
};
const EXTRACTED: SuggestionRunStateEvidence = {
  ...FILENAME,
  id: "run-computed",
  pageCount: 100,
  pageIndices: [1, 2],
  windowComplete: true,
};
const REVIEWABLE: SuggestionRunStateEvidence = {
  ...EXTRACTED,
  candidateCount: 2,
  nonFilenameCandidateCount: 1,
  aiReviewable: true,
};

test("cataloguing projection distinguishes all eight authoritative states", () => {
  assert.equal(deriveMetadataCataloguingState(null, null), "not_run");
  assert.equal(deriveMetadataCataloguingState({ state: "queued", resultRef: null }, FILENAME), "queued");
  assert.equal(deriveMetadataCataloguingState({ state: "running", resultRef: null }, FILENAME), "running");
  assert.equal(deriveMetadataCataloguingState({ state: "failed", resultRef: null }, FILENAME), "failed");
  assert.equal(deriveMetadataCataloguingState(JOB, EXTRACTED), "extraction_only");
  assert.equal(
    deriveMetadataCataloguingState(JOB, { ...EXTRACTED, nonFilenameCandidateCount: 1 }),
    "extraction_only",
  );
  assert.equal(deriveMetadataCataloguingState(JOB, REVIEWABLE), "ai_succeeded_reviewable");
  assert.equal(deriveMetadataCataloguingState(JOB, { ...REVIEWABLE, applied: true }), "applied");
  assert.equal(
    deriveMetadataCataloguingState({ state: "succeeded", resultRef: FILENAME.id }, FILENAME),
    "filename_inference_only",
  );
});
