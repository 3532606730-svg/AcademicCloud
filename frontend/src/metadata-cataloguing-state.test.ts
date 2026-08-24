import { describe, expect, it } from "vitest";

import type { DerivedMetadataJob, MetadataSuggestionRun } from "./api.ts";
import { deriveMetadataCataloguingState } from "./metadata-cataloguing-state.ts";

const BASE_JOB: DerivedMetadataJob = {
  id: "job-1",
  kind: "metadata_suggestion",
  resourceId: "file-1",
  state: "succeeded",
  progress: 100,
  attempts: 1,
  resultRef: "run-computed",
  errorCode: null,
  createdAt: "2026-08-24T00:00:00.000Z",
  startedAt: "2026-08-24T00:01:00.000Z",
  finishedAt: "2026-08-24T00:02:00.000Z",
  deadlineAt: "2026-08-24T02:00:00.000Z",
};

const FILENAME_RUN: MetadataSuggestionRun = {
  id: "run-filename",
  libraryId: "library-1",
  fileId: "file-1",
  status: "ready",
  rulesetVersion: "rf-metasuggest-v2",
  sourceVersion: "s".repeat(43),
  window: { firstPages: 15, lastPages: 5, pageCount: null, pageIndices: [], complete: false },
  candidates: [{
    id: "run-filename:0",
    position: 0,
    fieldPath: "canonicalTitle",
    typeFieldName: null,
    authorityType: null,
    authorityRole: null,
    identifierScheme: null,
    value: "Filename title",
    sourceType: "filename",
    sourcePageIndex: null,
    pageClass: null,
    confidence: "medium",
    precedenceRank: 900,
    evidenceExcerpt: "Filename title",
    evidenceOrigin: "filename",
    ocrEngine: null,
    ocrConfidence: null,
    rulesetVersion: "rf-metasuggest-v2",
  }],
  createdAt: "2026-08-24T00:00:00.000Z",
};

const COMPUTED_RUN: MetadataSuggestionRun = {
  ...FILENAME_RUN,
  id: "run-computed",
  window: { ...FILENAME_RUN.window, pageCount: 120, pageIndices: [1, 2], complete: true },
};

const REVIEWABLE_RUN: MetadataSuggestionRun = {
  ...COMPUTED_RUN,
  candidates: [{
    ...FILENAME_RUN.candidates[0]!,
    id: "run-computed:0",
    value: "Evidence title",
    sourceType: "title_page",
    sourcePageIndex: 1,
    pageClass: "title_page",
    evidenceOrigin: "ocr",
    ocrEngine: "PP-OCRv6-small",
    ocrConfidence: 96,
  }],
};

describe("metadata cataloguing state projection", () => {
  it.each([
    ["not run", { job: null, run: null }, "not_run"],
    ["queued over filename fallback", { job: { ...BASE_JOB, state: "queued", resultRef: null }, run: FILENAME_RUN }, "queued"],
    ["running over filename fallback", { job: { ...BASE_JOB, state: "running", resultRef: null }, run: FILENAME_RUN }, "running"],
    ["failed over filename fallback", { job: { ...BASE_JOB, state: "failed", resultRef: null, errorCode: "compute_internal_error" }, run: FILENAME_RUN }, "failed"],
    ["extraction only", { job: BASE_JOB, run: COMPUTED_RUN }, "extraction_only"],
    ["extracted candidates without AI evidence", { job: BASE_JOB, run: REVIEWABLE_RUN }, "extraction_only"],
    ["real AI success", { job: BASE_JOB, run: REVIEWABLE_RUN, authoritativeState: "ai_succeeded_reviewable" }, "ai_succeeded_reviewable"],
    ["applied success", {
      job: BASE_JOB,
      run: REVIEWABLE_RUN,
      fieldAuthorities: [{ fieldName: "canonicalTitle", scopeKey: "", source: "ai", sourceRunId: REVIEWABLE_RUN.id, establishedAt: "2026-08-24T00:02:00.000Z" }],
    }, "applied"],
    ["filename inference only", { job: { ...BASE_JOB, resultRef: FILENAME_RUN.id }, run: FILENAME_RUN }, "filename_inference_only"],
  ] as const)("distinguishes %s", (_label, input, expected) => {
    expect(deriveMetadataCataloguingState(input)).toBe(expected);
  });
});
