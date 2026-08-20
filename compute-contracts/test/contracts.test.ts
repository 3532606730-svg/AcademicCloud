import assert from "node:assert/strict";
import test from "node:test";

import { parseDerivedComputeResult } from "../src/index.js";

test("derived compute result validation rejects raw evidence and malformed provenance", () => {
  const base = {
    jobId: "job-1",
    attemptId: "attempt-1",
    kind: "metadata_suggestion",
    state: "succeeded",
    output: {
      status: "ready",
      window: { firstPages: 15, lastPages: 5, pageCount: 1, pageIndices: [1], complete: true },
      candidates: [],
    },
  };
  assert.deepEqual(parseDerivedComputeResult(base), base);
  assert.throws(() => parseDerivedComputeResult({ ...base, rawText: "forbidden" }), /unsupported field/u);
  assert.throws(() => parseDerivedComputeResult({
    ...base,
    output: {
      ...base.output,
      candidates: [{
        position: 0,
        fieldPath: "canonicalTitle",
        typeFieldName: null,
        authorityType: null,
        authorityRole: null,
        identifierScheme: null,
        value: "Candidate",
        sourceType: "title_page",
        sourcePageIndex: 1,
        pageClass: "title_page",
        confidence: "medium",
        precedenceRank: 10,
        evidenceExcerpt: "Candidate",
        evidenceOrigin: "ocr",
        ocrEngine: null,
        ocrConfidence: 90,
        rulesetVersion: "rf-frontmatterocr-v1",
      }],
    },
  }), /OCR candidates require/u);
});
