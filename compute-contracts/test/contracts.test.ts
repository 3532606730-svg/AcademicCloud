import assert from "node:assert/strict";
import test from "node:test";

import { parseDerivedComputeResult, parseIntelligentBibliographyResult } from "../src/index.js";

function bibliography() {
  return {
    contractVersion: 1,
    rulesetVersion: "l1-intelligent-library01-v1",
    status: "auto_apply",
    overallConfidence: 94,
    canonical: {
      materialClass: "scholarly_monograph",
      canonicalTitle: "近代中国史研究",
      subtitle: null,
      alternativeTitles: [],
      dateStatement: null,
      identifiers: [],
      contributors: [],
      publication: { publisher: null, place: null, publicationDate: null, editionNumber: null, printing: null },
      series: null,
      volume: null,
      language: null,
      carrierEdition: { editionType: null, editionStatement: null, facsimileStatement: null },
      sourceEdition: { dynasty: null, reignTitle: null, reignYear: null, absoluteYear: null, printer: null, imprint: null, bookshop: null, institution: null, printingPlace: null, editionType: null, editionStatement: null, holdingInformation: null },
    },
    fields: ["materialClass", "canonicalTitle"].map((fieldName) => ({
      fieldName, scopeKey: "", confidence: 96, sourceType: "title_page", sourcePageIndex: 1,
      pageClass: "title_page", evidenceOrigin: "native_text", evidenceSha256: "a".repeat(64),
    })),
    warnings: [],
    provenance: {
      ocr: {
        used: false,
        family: "PaddleOCR", packageVersion: "3.7.0", runtimeFamily: "PaddlePaddle", runtimeVersion: "3.3.1",
        detectionModel: { name: "PP-OCRv6_small_det", revision: "106c97591b235f607453300d9fc8c1cad1b25488", sha256: "5043d4ccc8d63402ccea8feefcee4db57077431a873e78d2191836a178a492da" },
        recognitionModel: { name: "PP-OCRv6_small_rec", revision: "bd619643acac4b9650c040234da8d944476ee3f1", sha256: "406e1e689c9a7fbb04178007a3fe10cf852afe7bf8bb3bc6dbb9d532b13bd907" },
        legacyFallback: false,
      },
      reasoning: {
        family: "Qwen3", name: "Qwen3-1.7B-GGUF", revision: "90862c4b9d2787eaed51d12237eafdfe7c5f6077",
        sha256: "061b54daade076b5d3362dac252678d17da8c68f07560be70818cace6590cb1a", quantization: "Q8_0", runtimeFamily: "llama.cpp", runtimeVersion: "b10218",
        runtimeRevision: "de69995", runtimeSha256: "78ec7a1964710918030e85c132a0995b10b07e4f43001bdf54fe0fd48d1eb85b",
      },
      selectedPages: [1],
      promptVersion: "l1-intelligent-library01-prompt-v1",
    },
  };
}

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

test("candidate callback validation exactly enforces SQLite persistence bounds", () => {
  const candidate = {
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
    evidenceExcerpt: "Candidate evidence",
    evidenceOrigin: "native_text",
    ocrEngine: null,
    ocrConfidence: null,
    rulesetVersion: "rf-frontmatterocr-v2",
  };
  const result = {
    jobId: "job-1",
    attemptId: "attempt-1",
    kind: "metadata_suggestion",
    state: "succeeded",
    output: {
      status: "ready",
      window: { firstPages: 15, lastPages: 5, pageCount: 1, pageIndices: [1], complete: true },
      candidates: [candidate],
    },
  };
  assert.deepEqual(parseDerivedComputeResult(result), result);
  assert.throws(() => parseDerivedComputeResult({
    ...result,
    output: { ...result.output, candidates: [{ ...candidate, evidenceExcerpt: " Candidate evidence " }] },
  }), /candidate\.evidenceExcerpt/u);
  assert.throws(() => parseDerivedComputeResult({
    ...result,
    output: { ...result.output, candidates: [{ ...candidate, precedenceRank: 256 }] },
  }), /candidate\.precedenceRank/u);
  assert.throws(() => parseDerivedComputeResult({
    ...result,
    output: { ...result.output, candidates: [{ ...candidate, typeFieldName: "editionStatement" }] },
  }), /non-type candidates/u);
});

test("intelligent bibliography contract is closed, provenance-rich, and rejects unsafe auto-apply shapes", () => {
  const value = bibliography();
  assert.deepEqual(parseIntelligentBibliographyResult(value), value);
  const v2 = {
    ...value,
    rulesetVersion: "l1-intelligent-library01-v2",
    provenance: { ...value.provenance, promptVersion: "l1-intelligent-library01-prompt-v2" },
  };
  assert.deepEqual(parseIntelligentBibliographyResult(v2), v2);
  const v3 = {
    ...value,
    rulesetVersion: "l1-intelligent-library01-v3",
    provenance: { ...value.provenance, promptVersion: "l1-intelligent-library01-prompt-v3" },
  };
  assert.deepEqual(parseIntelligentBibliographyResult(v3), v3);

  const v6 = {
    ...v3,
    rulesetVersion: "l1-intelligent-library01-v6",
  };
  assert.deepEqual(parseIntelligentBibliographyResult(v6), v6);
  const v7 = {
    ...v6,
    rulesetVersion: "l1-intelligent-library01-v7",
    provenance: { ...v6.provenance, promptVersion: "l1-intelligent-library01-prompt-v4" },
    fields: v6.fields.map((field) => field.fieldName === "materialClass" ? {
      ...field,
      sourceType: "class_support",
      pageClass: "ordinary_body",
    } : field),
  };
  assert.deepEqual(parseIntelligentBibliographyResult(v7), v7);
  assert.throws(() => parseIntelligentBibliographyResult({
    ...v7,
    fields: v6.fields,
  }), /requires class-support/u);
  assert.throws(() => parseIntelligentBibliographyResult({
    ...v7,
    fields: v7.fields.map((field) => field.fieldName === "canonicalTitle" ? {
      ...field,
      sourceType: "class_support",
      pageClass: "ordinary_body",
    } : field),
  }), /restricted to materialClass/u);
  assert.throws(() => parseIntelligentBibliographyResult({
    ...v6,
    fields: v7.fields,
  }), /historical bibliography rulesets/u);
  assert.throws(() => parseIntelligentBibliographyResult({ ...value, rawOcrText: "forbidden" }), /unsupported field/u);
  assert.throws(() => parseIntelligentBibliographyResult({ ...value, overallConfidence: 84 }), /confidence gate/u);
  assert.throws(() => parseIntelligentBibliographyResult({
    ...value,
    fields: value.fields.slice(1),
  }), /exactly cover/u);
  assert.throws(() => parseIntelligentBibliographyResult({
    ...value,
    provenance: { ...value.provenance, reasoning: { ...value.provenance.reasoning, revision: "floating-main" } },
  }), /reasoning.revision/u);
  assert.throws(() => parseIntelligentBibliographyResult({
    ...value,
    fields: value.fields.map((field) => ({ ...field, sourcePageIndex: 2 })),
  }), /outside the selected pages/u);
  assert.throws(() => parseIntelligentBibliographyResult({
    ...value,
    fields: value.fields.map((field) => ({ ...field, evidenceOrigin: "ocr" })),
  }), /requires OCR-used provenance/u);
  assert.throws(() => parseIntelligentBibliographyResult({
    ...value,
    provenance: { ...value.provenance, ocr: { ...value.provenance.ocr, legacyFallback: true } },
  }), /fallback cannot be reported/u);
  const callback = {
    jobId: "job-1", attemptId: "attempt-1", kind: "metadata_suggestion", state: "succeeded",
    output: {
      status: "ready",
      window: { firstPages: 15, lastPages: 5, pageCount: 2, pageIndices: [2], complete: true },
      candidates: [],
      bibliography: value,
    },
  };
  assert.throws(() => parseDerivedComputeResult(callback), /outside the inspected window/u);
});
