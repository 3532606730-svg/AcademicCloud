import assert from "node:assert/strict";
import test from "node:test";

import type { IntelligentCanonicalBibliography, IntelligentBibliographicFieldName } from "@academiccloud/compute-contracts";

import {
  BibliographicIntelligenceError,
  deriveIntelligentBibliography,
  loadLlamaReasonerConfig,
  parseLlamaChatCompletionResponse,
  QWEN_CONTEXT_TOKENS,
  QWEN_MAX_COMPLETION_TOKENS,
  type BibliographicReasoner,
} from "../src/bibliographic-intelligence.js";
import type { PdfTextInspection } from "../src/suggestion.js";

function emptyCanonical(title: string): IntelligentCanonicalBibliography {
  return {
    materialClass: "scholarly_monograph",
    canonicalTitle: title,
    subtitle: null,
    alternativeTitles: [],
    dateStatement: null,
    identifiers: [],
    contributors: [{ label: "王明", role: "author", roleLabel: null }],
    publication: { publisher: null, place: null, publicationDate: null, editionNumber: null, printing: null },
    series: null,
    volume: null,
    language: null,
    carrierEdition: { editionType: null, editionStatement: null, facsimileStatement: null },
    sourceEdition: { dynasty: null, reignTitle: null, reignYear: null, absoluteYear: null, printer: null, imprint: null, bookshop: null, institution: null, printingPlace: null, editionType: null, editionStatement: null, holdingInformation: null },
  };
}

function populatedFields(canonical: IntelligentCanonicalBibliography) {
  const fields: Array<{ fieldName: IntelligentBibliographicFieldName; scopeKey: string }> = [
    { fieldName: "materialClass", scopeKey: "" },
    { fieldName: "canonicalTitle", scopeKey: "" },
  ];
  if (canonical.subtitle !== null) fields.push({ fieldName: "subtitle", scopeKey: "" });
  if (canonical.alternativeTitles.length > 0) fields.push({ fieldName: "alternativeTitles", scopeKey: "" });
  if (canonical.dateStatement !== null) fields.push({ fieldName: "dateStatement", scopeKey: "" });
  if (canonical.identifiers.length > 0) fields.push({ fieldName: "identifiers", scopeKey: "" });
  Object.entries(canonical.publication).forEach(([key, value]) => { if (value !== null) fields.push({ fieldName: `publication.${key}` as IntelligentBibliographicFieldName, scopeKey: "" }); });
  (["series", "volume", "language"] as const).forEach((key) => { if (canonical[key] !== null) fields.push({ fieldName: key, scopeKey: "" }); });
  Object.entries(canonical.carrierEdition).forEach(([key, value]) => { if (value !== null) fields.push({ fieldName: `carrierEdition.${key}` as IntelligentBibliographicFieldName, scopeKey: "" }); });
  Object.entries(canonical.sourceEdition).forEach(([key, value]) => { if (value !== null) fields.push({ fieldName: `sourceEdition.${key}` as IntelligentBibliographicFieldName, scopeKey: "" }); });
  canonical.contributors.forEach((contributor, index) => {
    fields.push({ fieldName: "contributor.label", scopeKey: `contributor:${index}` });
    fields.push({ fieldName: "contributor.role", scopeKey: `contributor:${index}` });
    if (contributor.roleLabel !== null) fields.push({ fieldName: "contributor.roleLabel", scopeKey: `contributor:${index}` });
  });
  return fields.map((field) => ({
    ...field,
    confidence: 95,
    sourcePageIndex: 1,
    evidenceOrigin: "native_text",
  }));
}

function fixture(canonical: IntelligentCanonicalBibliography, status: "auto_apply" | "ambiguous" = "auto_apply", warnings: string[] = []) {
  const page = { pageIndex: 1, text: `${canonical.canonicalTitle}\n${canonical.contributors[0]?.label ?? "编者"} 著`, evidenceOrigin: "native_text" as const, ocrEngine: null, ocrConfidence: null };
  const inspection: PdfTextInspection = {
    pageCount: 1,
    pageIndices: [1],
    pages: [page],
    embeddedMetadata: {},
    complete: true,
    hasUsableTextLayer: true,
  };
  const model = {
    status,
    overallConfidence: status === "auto_apply" ? 95 : 60,
    canonical,
    fields: populatedFields(canonical),
    warnings,
  };
  const reasoner: BibliographicReasoner = { async infer() { return model; } };
  return { inspection, reasoner };
}

test("llama GPU offload is explicit, bounded, and CPU-safe by default", () => {
  assert.equal(loadLlamaReasonerConfig({}).gpuLayers, 0);
  assert.equal(loadLlamaReasonerConfig({ NODE_ENV: "production", BIBLIOGRAPHY_LLAMA_GPU_LAYERS: "999" }).gpuLayers, 999);
  assert.throws(() => loadLlamaReasonerConfig({ BIBLIOGRAPHY_LLAMA_GPU_LAYERS: "-1" }), /BIBLIOGRAPHY_LLAMA_GPU_LAYERS/u);
  assert.throws(() => loadLlamaReasonerConfig({ BIBLIOGRAPHY_LLAMA_GPU_LAYERS: "1000" }), /BIBLIOGRAPHY_LLAMA_GPU_LAYERS/u);
  assert.throws(() => loadLlamaReasonerConfig({ BIBLIOGRAPHY_LLAMA_GPU_LAYERS: "all" }), /BIBLIOGRAPHY_LLAMA_GPU_LAYERS/u);
});

test("Qwen completion budget fits the pinned context and truncated JSON fails explicitly", () => {
  assert.equal(QWEN_CONTEXT_TOKENS, 16_384);
  assert.equal(QWEN_MAX_COMPLETION_TOKENS, 8_192);
  assert.ok(QWEN_MAX_COMPLETION_TOKENS < QWEN_CONTEXT_TOKENS);
  const truncated = new TextEncoder().encode(JSON.stringify({
    choices: [{ finish_reason: "length", message: { content: "{\"status\":\"ambiguous\"" } }],
  }));
  assert.throws(
    () => parseLlamaChatCompletionResponse(truncated),
    (error: unknown) => error instanceof BibliographicIntelligenceError
      && error.code === "invalid_result"
      && error.diagnostic === "content_truncated",
  );

  const complete = new TextEncoder().encode(JSON.stringify({
    choices: [{ finish_reason: "stop", message: { content: "```json\n{\"status\":\"ambiguous\"}\n```" } }],
  }));
  assert.deepEqual(parseLlamaChatCompletionResponse(complete), { status: "ambiguous" });
});

test("Qwen receives only authority-eligible pages and exact field scopes", async () => {
  const canonical = emptyCanonical("近代中国史研究");
  const titlePage = {
    pageIndex: 1,
    text: "题名：近代中国史研究\n作者：王明",
    evidenceOrigin: "native_text" as const,
    ocrEngine: null,
    ocrConfidence: null,
  };
  const inspection: PdfTextInspection = {
    pageCount: 2,
    pageIndices: [1, 2],
    pages: [titlePage, {
      pageIndex: 2,
      text: "本页是没有书目标签的正文段落。",
      evidenceOrigin: "native_text",
      ocrEngine: null,
      ocrConfidence: null,
    }],
    embeddedMetadata: {},
    complete: true,
    hasUsableTextLayer: true,
  };
  let observedPrompt: Record<string, unknown> | undefined;
  let inferenceCalls = 0;
  const reasoner: BibliographicReasoner = {
    async infer(prompt) {
      inferenceCalls += 1;
      observedPrompt = JSON.parse(prompt) as Record<string, unknown>;
      return {
        status: "auto_apply",
        overallConfidence: 95,
        canonical,
        fields: [],
        warnings: [],
      };
    },
  };

  const result = await deriveIntelligentBibliography(inspection, reasoner);
  assert.equal(result.status, "auto_apply");
  assert.equal(inferenceCalls, 1);
  const pages = observedPrompt?.pages as Array<Record<string, unknown>>;
  assert.deepEqual(pages.map(({ pageIndex, pageClass, evidenceOrigin }) => ({ pageIndex, pageClass, evidenceOrigin })), [{
    pageIndex: 1,
    pageClass: "title_page",
    evidenceOrigin: "native_text",
  }]);
  assert.deepEqual(observedPrompt?.embeddedMetadata, {});
  assert.match(String(observedPrompt?.task), /scopeKey MUST be the empty string/u);
  assert.equal(result.fields.length, populatedFields(canonical).length);
  assert.ok(result.fields.every((field) => field.sourcePageIndex === 1 && field.evidenceOrigin === "native_text"));
  assert.equal(new Set(result.fields.map((field) => `${field.fieldName}:${field.scopeKey}`)).size, result.fields.length);
});

test("missing field provenance gets one bounded schema-key repair pass", async () => {
  const canonical = {
    ...emptyCanonical("近代中国史研究"),
    publication: {
      publisher: null,
      place: null,
      publicationDate: null,
      editionNumber: "第1版",
      printing: null,
    },
  };
  const inspection: PdfTextInspection = {
    pageCount: 2,
    pageIndices: [1, 2],
    pages: [{
      pageIndex: 1,
      text: "题名：近代中国史研究\n作者：王明",
      evidenceOrigin: "native_text",
      ocrEngine: null,
      ocrConfidence: null,
    }, {
      pageIndex: 2,
      text: "版权页\n第1版",
      evidenceOrigin: "native_text",
      ocrEngine: null,
      ocrConfidence: null,
    }],
    embeddedMetadata: {},
    complete: true,
    hasUsableTextLayer: true,
  };
  const completeFields = populatedFields(canonical);
  const incompleteFields = completeFields.filter((field) => ![
    "materialClass",
    "contributor.label",
    "publication.editionNumber",
  ].includes(field.fieldName));
  const repairPrompts: Array<Record<string, unknown>> = [];
  let calls = 0;
  const reasoner: BibliographicReasoner = {
    async infer(prompt) {
      calls += 1;
      if (calls === 2) repairPrompts.push(JSON.parse(prompt) as Record<string, unknown>);
      return {
        status: "auto_apply",
        overallConfidence: 95,
        canonical,
        fields: calls === 1 ? incompleteFields : completeFields,
        warnings: [],
      };
    },
  };

  const result = await deriveIntelligentBibliography(inspection, reasoner);
  assert.equal(result.status, "auto_apply");
  assert.equal(calls, 2);
  const repair = repairPrompts[0]?.repair as Record<string, unknown>;
  assert.equal(repair.reason, "previous_field_evidence_invalid");
  assert.deepEqual(repair.requiredFieldKeys, [
    "canonicalTitle:",
    "contributor.label:contributor:0",
    "contributor.role:contributor:0",
    "materialClass:",
    "publication.editionNumber:",
  ]);

  calls = 0;
  const persistentlyInvalid: BibliographicReasoner = {
    async infer() {
      calls += 1;
      return { status: "auto_apply", overallConfidence: 95, canonical, fields: incompleteFields, warnings: [] };
    },
  };
  await assert.rejects(
    deriveIntelligentBibliography(inspection, persistentlyInvalid),
    (error: unknown) => error instanceof BibliographicIntelligenceError
      && error.diagnostic === "field_evidence_invalid",
  );
  assert.equal(calls, 2);
});

test("seven bounded representative bibliographic cases remain inside the strict domain", async () => {
  const cases: Array<[string, IntelligentCanonicalBibliography, "auto_apply" | "ambiguous"]> = [];
  cases.push(["Chinese modern monograph", { ...emptyCanonical("近代中国史研究"), publication: { publisher: "学术出版社", place: "北京", publicationDate: "2026", editionNumber: null, printing: null }, language: "中文" }, "auto_apply"]);
  cases.push(["Japanese monograph", { ...emptyCanonical("近代日本史研究"), contributors: [{ label: "山田太郎", role: "author", roleLabel: null }], language: "日本語" }, "auto_apply"]);
  cases.push(["modern edited source", { ...emptyCanonical("清代档案选编"), materialClass: "primary_source_modern_edition", contributors: [{ label: "李文", role: "editor", roleLabel: null }], carrierEdition: { editionType: "critical_edition", editionStatement: "点校本", facsimileStatement: null } }, "auto_apply"]);
  cases.push(["modern facsimile", { ...emptyCanonical("宋刻本影印集"), materialClass: "primary_source_modern_edition", carrierEdition: { editionType: "facsimile", editionStatement: "影印本", facsimileStatement: "据藏本影印" }, sourceEdition: { ...emptyCanonical("x").sourceEdition, dynasty: "宋", editionType: "engraved" } }, "auto_apply"]);
  cases.push(["traditional vertical", { ...emptyCanonical("資治通鑑"), materialClass: "traditional_book", language: "繁體中文", sourceEdition: { ...emptyCanonical("x").sourceEdition, dynasty: "清", reignTitle: "乾隆", reignYear: "十二年", absoluteYear: 1747, editionType: "engraved" } }, "auto_apply"]);
  cases.push(["journal article", { ...emptyCanonical("边疆史研究的新进展"), materialClass: "journal_article", volume: "第12卷", publication: { publisher: null, place: null, publicationDate: "2025", editionNumber: null, printing: null } }, "auto_apply"]);
  cases.push(["ambiguous", { ...emptyCanonical("历史研究"), subtitle: "历史研究" }, "ambiguous"]);

  for (const [label, canonical, expected] of cases) {
    const { inspection, reasoner } = fixture(canonical, label === "ambiguous" ? "auto_apply" : "auto_apply");
    const result = await deriveIntelligentBibliography(inspection, reasoner);
    assert.equal(result.status, expected, label);
    assert.equal(result.canonical?.materialClass, canonical.materialClass, label);
    assert.equal(result.provenance.selectedPages.length, 1, label);
  }
});

test("invalid ISBN facts and publisher-shaped people are removed before auto-apply", async () => {
  const invalidIsbn = {
    ...emptyCanonical("安全题名"),
    identifiers: [{ scheme: "isbn", value: "978-0-000-00000-0" }],
  };
  const invalid = fixture(invalidIsbn);
  invalid.inspection.pageCount = 2;
  invalid.inspection.pageIndices = [1, 2];
  invalid.inspection.pages.push({
    pageIndex: 2,
    text: "版权页",
    evidenceOrigin: "native_text",
    ocrEngine: null,
    ocrConfidence: null,
  });
  const withoutInvalidIsbn = await deriveIntelligentBibliography(invalid.inspection, invalid.reasoner);
  assert.equal(withoutInvalidIsbn.status, "auto_apply");
  assert.deepEqual(withoutInvalidIsbn.canonical?.identifiers, []);
  assert.ok(withoutInvalidIsbn.fields.every((field) => field.fieldName !== "identifiers"));

  const publisherAsPerson = {
    ...emptyCanonical("安全题名"),
    contributors: [{ label: "学术出版社", role: "author" as const, roleLabel: null }],
    publication: { publisher: "学术出版社", place: null, publicationDate: null, editionNumber: null, printing: null },
  };
  const { inspection, reasoner } = fixture(publisherAsPerson);
  const result = await deriveIntelligentBibliography(inspection, reasoner);
  assert.equal(result.status, "auto_apply");
  assert.deepEqual(result.canonical?.contributors, []);
  assert.equal(result.canonical?.publication.publisher, "学术出版社");
  assert.deepEqual(result.warnings, []);
});

test("sparse model facts are normalized locally before the strict shared contract", async () => {
  const page = { pageIndex: 1, text: "题名：近代中国史研究\n作者：王明", evidenceOrigin: "native_text" as const, ocrEngine: null, ocrConfidence: null };
  const inspection: PdfTextInspection = {
    pageCount: 1,
    pageIndices: [1],
    pages: [page],
    embeddedMetadata: {},
    complete: true,
    hasUsableTextLayer: true,
  };
  const reasoner: BibliographicReasoner = {
    async infer() {
      return {
        status: "auto_apply",
        overallConfidence: 95,
        canonical: {
          materialClass: "scholarly_monograph",
          canonicalTitle: "近代中国史研究",
          contributors: [{ label: "王明", role: "author" }],
        },
        fields: ["materialClass", "canonicalTitle", "contributor.label", "contributor.role"].map((fieldName) => ({
          fieldName,
          scopeKey: fieldName.startsWith("contributor.") ? "contributor:0" : "",
          confidence: 95,
          sourcePageIndex: 1,
          evidenceOrigin: "native_text",
        })),
        warnings: [],
      };
    },
  };

  const result = await deriveIntelligentBibliography(inspection, reasoner);
  assert.equal(result.status, "auto_apply");
  assert.deepEqual(result.canonical?.publication, { publisher: null, place: null, publicationDate: null, editionNumber: null, printing: null });
  assert.deepEqual(result.canonical?.carrierEdition, { editionType: null, editionStatement: null, facsimileStatement: null });
  assert.equal(result.canonical?.contributors[0]?.roleLabel, null);
  assert.ok(result.fields.every((field) => field.sourceType === "title_page" && field.pageClass === "title_page"));

  const singlePageFallback: BibliographicReasoner = {
    async infer() {
      const model = await reasoner.infer("") as Record<string, unknown>;
      return { ...model, fields: [] };
    },
  };
  const fallbackResult = await deriveIntelligentBibliography(inspection, singlePageFallback);
  assert.equal(fallbackResult.status, "auto_apply");
  assert.equal(fallbackResult.fields.length, 4);
  assert.ok(fallbackResult.fields.every((field) => field.confidence === 95 && field.sourcePageIndex === 1));

  const nonAuthoritativeClassification: BibliographicReasoner = {
    async infer() {
      const model = await reasoner.infer("") as Record<string, unknown>;
      return {
        ...model,
        fields: (model.fields as Array<Record<string, unknown>>).map((field) => ({ ...field, pageClass: "cover" })),
      };
    },
  };
  await assert.rejects(
    deriveIntelligentBibliography(inspection, nonAuthoritativeClassification),
    /invalid_result/u,
  );

  const contradictoryStatus: BibliographicReasoner = {
    async infer() {
      const model = await reasoner.infer("") as Record<string, unknown>;
      return { ...model, status: "no_bibliography" };
    },
  };
  const downgraded = await deriveIntelligentBibliography(inspection, contradictoryStatus);
  assert.equal(downgraded.status, "auto_apply");
  assert.equal(downgraded.canonical?.canonicalTitle, "近代中国史研究");

  const unsafeWarningText: BibliographicReasoner = {
    async infer() {
      const model = await reasoner.infer("") as Record<string, unknown>;
      return { ...model, warnings: ["title: source text must not persist"] };
    },
  };
  const scrubbed = await deriveIntelligentBibliography(inspection, unsafeWarningText);
  assert.equal(scrubbed.status, "ambiguous");
  assert.deepEqual(scrubbed.warnings, ["model_uncertainty"]);
});

test("explicit unconflicted labels authoritatively classify common material shapes and may promote conservative model status", async () => {
  const traditional = fixture({
    ...emptyCanonical("資治通鑑"),
    materialClass: "scholarly_monograph",
  });
  const traditionalModel = await traditional.reasoner.infer("") as Record<string, unknown>;
  traditional.reasoner = { async infer() {
    return {
      ...traditionalModel,
      status: "ambiguous",
      canonical: {
        ...(traditionalModel.canonical as Record<string, unknown>),
        publication: { publisher: "武英殿" },
      },
      warnings: ["uncertain_title", "uncertain_material_class", "uncertain_contributor", "uncertain_publication", "uncertain_edition"],
    };
  } };
  traditional.inspection.pages[0]!.text = "書名：資治通鑑\n撰者：司馬光\n歷史源版本：清乾隆十二年武英殿刻本\n版式：繁體直排";
  const traditionalResult = await deriveIntelligentBibliography(traditional.inspection, traditional.reasoner);
  assert.equal(traditionalResult.status, "auto_apply");
  assert.equal(traditionalResult.canonical?.materialClass, "traditional_book");
  assert.equal(traditionalResult.canonical?.sourceEdition.dynasty, "清");
  assert.deepEqual(traditionalResult.canonical?.contributors, [{ label: "司馬光", role: "author", roleLabel: null }]);
  assert.deepEqual(traditionalResult.canonical?.publication, { publisher: null, place: null, publicationDate: null, editionNumber: null, printing: null });

  const facsimile = fixture({ ...emptyCanonical("宋刻本影印集"), materialClass: "scholarly_monograph" });
  const facsimileModel = await facsimile.reasoner.infer("") as Record<string, unknown>;
  facsimile.reasoner = { async infer() { return { ...facsimileModel, status: "ambiguous", warnings: ["uncertain_title"] }; } };
  facsimile.inspection.pages[0]!.text = "题名：宋刻本影印集\n现代载体版本：影印本\n影印说明：据国家图书馆藏宋刻本影印";
  const facsimileResult = await deriveIntelligentBibliography(facsimile.inspection, facsimile.reasoner);
  assert.equal(facsimileResult.status, "auto_apply");
  assert.equal(facsimileResult.canonical?.materialClass, "primary_source_modern_edition");
  assert.equal(facsimileResult.canonical?.carrierEdition.editionType, "facsimile");
  assert.equal(facsimileResult.canonical?.sourceEdition.dynasty, "宋");

  const edited = fixture({
    ...emptyCanonical("清代档案选编"),
    sourceEdition: { ...emptyCanonical("x").sourceEdition, dynasty: "清", editionType: "engraved" },
  });
  edited.inspection.pages[0]!.text = "题名：清代档案选编\n编者：李文\n点校本\n出版社：中华书局\n出版日期：2024年";
  const editedResult = await deriveIntelligentBibliography(edited.inspection, edited.reasoner);
  assert.equal(editedResult.canonical?.materialClass, "primary_source_modern_edition");
  assert.equal(editedResult.canonical?.carrierEdition.editionType, "critical_edition");
  assert.equal(editedResult.canonical?.sourceEdition.dynasty, null);

  const journal = fixture({ ...emptyCanonical("模型误读"), materialClass: "scholarly_monograph", subtitle: "" });
  const journalModel = await journal.reasoner.infer("") as Record<string, unknown>;
  journal.reasoner = { async infer() { return { ...journalModel, status: "ambiguous" }; } };
  journal.inspection.pages[0]!.text = "文章题名：边疆史研究的新进展\n作者：陈新\n刊名：历史研究\n2025年第3期";
  const journalResult = await deriveIntelligentBibliography(journal.inspection, journal.reasoner);
  assert.equal(journalResult.status, "auto_apply");
  assert.equal(journalResult.canonical?.canonicalTitle, "边疆史研究的新进展");
  assert.equal(journalResult.canonical?.materialClass, "journal_article");
});
