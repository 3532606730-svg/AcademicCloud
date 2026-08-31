import assert from "node:assert/strict";
import test from "node:test";

import type { IntelligentCanonicalBibliography, IntelligentBibliographicFieldName } from "@academiccloud/compute-contracts";

import {
  BibliographicIntelligenceError,
  deriveIntelligentBibliography,
  LLAMA_CLASS_RESPONSE_FORMAT,
  LLAMA_RESPONSE_FORMAT,
  loadLlamaReasonerConfig,
  parseLlamaChatCompletionResponse,
  QWEN_CONTEXT_TOKENS,
  QWEN_MAX_COMPLETION_TOKENS,
  QWEN_REASONING_INPUT_CHARACTERS,
  QWEN_REASONING_MODE,
  QWEN_REASONING_PAGE_CHARACTERS,
  type BibliographicReasoner,
} from "../src/bibliographic-intelligence.js";
import type { PdfTextInspection } from "../src/suggestion.js";

test("llama transport uses the compatible generic JSON response mode", () => {
  assert.deepEqual(LLAMA_RESPONSE_FORMAT, { type: "json_object" });
  assert.equal(LLAMA_CLASS_RESPONSE_FORMAT.type, "json_schema");
  assert.equal(LLAMA_CLASS_RESPONSE_FORMAT.json_schema.name, "academiccloud_material_class");
  assert.deepEqual(
    LLAMA_CLASS_RESPONSE_FORMAT.json_schema.schema.required,
    ["materialClass", "confidence", "evidenceCandidateIds"],
  );
});

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

function defaultClassSignals(materialClass: IntelligentCanonicalBibliography["materialClass"]): string[] {
  const signals: Record<IntelligentCanonicalBibliography["materialClass"], string[]> = {
    scholarly_monograph: ["scholarly_analysis"],
    edited_volume: ["scholarly_analysis", "edited_collection"],
    journal_article: ["serial_article"],
    book_chapter: ["chapter_container"],
    thesis_dissertation: ["thesis"],
    conference_paper: ["conference"],
    review: ["review"],
    reference_work: ["reference_work"],
    dictionary_lexicon: ["dictionary_lexicon"],
    primary_source_modern_edition: ["historical_primary_work", "edition_mediation"],
    traditional_book: ["historical_primary_work", "traditional_artifact"],
    archival_document: ["archival_document"],
    inscription_epigraphy: ["inscription_epigraphy"],
    rubbing: ["rubbing"],
    manuscript: ["manuscript"],
    collected_documents: ["historical_primary_work", "collected_documents"],
    catalogue_bibliography: ["catalogue_bibliography"],
    other: ["other_material"],
    unknown: [],
  };
  return signals[materialClass];
}

function sourceRoleLabel(role: IntelligentCanonicalBibliography["contributors"][number]["role"]): string {
  const labels: Record<typeof role, string> = {
    annotator: "annotator",
    author: "author",
    collator: "collator",
    editor: "editor",
    translator: "translator",
    compiler: "compiler",
    commentator: "commentator",
    organizer: "organizer",
    punctuator: "punctuator",
    reviser: "reviser",
    selector: "selector",
    other: "contributor",
  };
  return labels[role];
}

function fixture(canonical: IntelligentCanonicalBibliography, status: "auto_apply" | "ambiguous" = "auto_apply", warnings: string[] = []) {
  const evidencedCanonical: IntelligentCanonicalBibliography = {
    ...canonical,
    contributors: canonical.contributors.map((entry) => ({
      ...entry,
      roleLabel: entry.roleLabel ?? sourceRoleLabel(entry.role),
    })),
  };
  const pageValues = [
    evidencedCanonical.canonicalTitle,
    evidencedCanonical.subtitle,
    ...evidencedCanonical.alternativeTitles,
    evidencedCanonical.dateStatement,
    ...evidencedCanonical.identifiers.map((entry) => entry.value),
    ...evidencedCanonical.contributors.flatMap((entry) => [entry.label, entry.roleLabel]),
    ...Object.values(evidencedCanonical.publication),
    evidencedCanonical.series,
    evidencedCanonical.volume,
    evidencedCanonical.language,
    evidencedCanonical.carrierEdition.editionStatement,
    evidencedCanonical.carrierEdition.facsimileStatement,
    ...Object.entries(evidencedCanonical.sourceEdition)
      .filter(([key]) => key !== "editionType")
      .map(([, value]) => value === null ? null : String(value)),
  ].filter((value): value is string => typeof value === "string" && value.length > 0);
  const page = {
    pageIndex: 1,
    text: [`题名：${evidencedCanonical.canonicalTitle}`, ...new Set(pageValues)].join("\n"),
    evidenceOrigin: "native_text" as const,
    ocrEngine: null,
    ocrConfidence: null,
  };
  const classPage = {
    pageIndex: 2,
    text: `This bounded preface paragraph states the intellectual nature of the supplied work as ${evidencedCanonical.materialClass}. It supplies independent narrative context for classification and is not a title, publisher, publication date, identifier, edition label, or person line.`,
    evidenceOrigin: "native_text" as const,
    ocrEngine: null,
    ocrConfidence: null,
  };
  const inspection: PdfTextInspection = {
    pageCount: 2,
    pageIndices: [1, 2],
    pages: [page, classPage],
    embeddedMetadata: {},
    complete: true,
    hasUsableTextLayer: true,
  };
  const model = {
    status,
    overallConfidence: status === "auto_apply" ? 95 : 60,
    canonical: evidencedCanonical,
    classSupport: defaultClassSignals(evidencedCanonical.materialClass).map((signal) => ({
      signal,
      confidence: 95,
      sourcePageIndex: signal === "edition_mediation" || signal === "traditional_artifact" ? 1 : 2,
      evidenceOrigin: "native_text",
    })),
    fields: populatedFields(evidencedCanonical),
    warnings,
  };
  const reasoner: BibliographicReasoner = {
    async infer() {
      return {
        ...model,
        classSupport: model.classSupport.map((entry) => ({
          ...entry,
          evidenceText: inspection.pages.find((candidate) => candidate.pageIndex === entry.sourcePageIndex)!
            .text.normalize("NFKC").replace(/\s+/gu, " ").trim(),
        })),
        fields: model.fields.map((entry) => ({
          ...entry,
          evidenceText: page.text.normalize("NFKC").replace(/\s+/gu, " ").trim(),
        })),
      };
    },
  };
  return { inspection, reasoner, model };
}

test("llama GPU offload is explicit, bounded, and CPU-safe by default", () => {
  assert.equal(loadLlamaReasonerConfig({}).gpuLayers, 0);
  assert.equal(loadLlamaReasonerConfig({ NODE_ENV: "production", BIBLIOGRAPHY_LLAMA_GPU_LAYERS: "999" }).gpuLayers, 999);
  assert.throws(() => loadLlamaReasonerConfig({ BIBLIOGRAPHY_LLAMA_GPU_LAYERS: "-1" }), /BIBLIOGRAPHY_LLAMA_GPU_LAYERS/u);
  assert.throws(() => loadLlamaReasonerConfig({ BIBLIOGRAPHY_LLAMA_GPU_LAYERS: "1000" }), /BIBLIOGRAPHY_LLAMA_GPU_LAYERS/u);
  assert.throws(() => loadLlamaReasonerConfig({ BIBLIOGRAPHY_LLAMA_GPU_LAYERS: "all" }), /BIBLIOGRAPHY_LLAMA_GPU_LAYERS/u);
});

test("Qwen completion and multilingual evidence budgets fit the pinned context", () => {
  assert.equal(QWEN_CONTEXT_TOKENS, 32_768);
  assert.equal(QWEN_MAX_COMPLETION_TOKENS, 8_192);
  assert.equal(QWEN_REASONING_INPUT_CHARACTERS, 8_192);
  assert.equal(QWEN_REASONING_PAGE_CHARACTERS, 1_024);
  assert.equal(QWEN_REASONING_MODE, "off");
  assert.ok(QWEN_MAX_COMPLETION_TOKENS < QWEN_CONTEXT_TOKENS);
  assert.ok(QWEN_REASONING_INPUT_CHARACTERS + QWEN_MAX_COMPLETION_TOKENS < QWEN_CONTEXT_TOKENS);
});

test("Qwen reasoning input preserves a bounded slice from every selected page", async () => {
  const paragraph = "书名：历史史料现代整理本。校勘者：测试编辑。出版社：测试书局。二〇二六年。本篇序言说明该历史文献的形成、传抄系统、现代校勘过程、整理原则、版本依据与学术用途。";
  const pages = Array.from({ length: 8 }, (_, index) => ({
    pageIndex: index + 1,
    text: `${paragraph}${index} `.repeat(24),
    evidenceOrigin: "native_text" as const,
    ocrEngine: null,
    ocrConfidence: null,
  }));
  let prompt: Record<string, unknown> | undefined;
  await deriveIntelligentBibliography({
    pageCount: pages.length,
    pageIndices: pages.map((page) => page.pageIndex),
    pages,
    embeddedMetadata: {},
    complete: true,
    hasUsableTextLayer: true,
  }, {
    async infer(value) {
      prompt = JSON.parse(value) as Record<string, unknown>;
      return { status: "no_bibliography", overallConfidence: 0, canonical: null, classSupport: [], fields: [], warnings: [] };
    },
  });
  const suppliedPages = prompt?.pages as Array<{ pageIndex: number; text: string }>;
  assert.deepEqual(suppliedPages.map((page) => page.pageIndex), pages.map((page) => page.pageIndex));
  assert.ok(suppliedPages.every((page) => page.text.length <= QWEN_REASONING_PAGE_CHARACTERS));
  assert.ok(suppliedPages.reduce((total, page) => total + page.text.length, 0) <= QWEN_REASONING_INPUT_CHARACTERS);
});

test("truncated Qwen JSON fails explicitly", () => {
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

test("Qwen never receives corrupt OCR or suspicious bare embedded metadata as usable evidence", async () => {
  const inspection: PdfTextInspection = {
    pageCount: 1,
    pageIndices: [1],
    pages: [{
      pageIndex: 1,
      text: "ず之 fO v f 107の652 1987",
      evidenceOrigin: "ocr",
      ocrEngine: "academiccloud-paddleocr-test",
      ocrConfidence: 60,
    }],
    embeddedMetadata: { title: "Ã¥ÂÂ", author: "亦郊真" },
    complete: true,
    hasUsableTextLayer: false,
  };
  let prompt: Record<string, unknown> | undefined;
  const result = await deriveIntelligentBibliography(inspection, {
    async infer(value) {
      prompt = JSON.parse(value) as Record<string, unknown>;
      return { status: "no_bibliography", overallConfidence: 0, canonical: null, classSupport: [], fields: [], warnings: [] };
    },
  });
  assert.equal(result.status, "no_bibliography");
  assert.deepEqual(prompt?.pages, []);
  assert.deepEqual(prompt?.embeddedMetadata, {});
  assert.match(String(prompt?.task), /OCR confidence measures recognition only/u);
  assert.match(String(prompt?.task), /Embedded PDF metadata presence alone/u);
  assert.equal(inspection.embeddedMetadata.author, "亦郊真", "raw bounded provenance was mutated");
});

test("Qwen v6 sparse prompt requests positive class support without turning optional facts into a checklist", async () => {
  const inspection: PdfTextInspection = {
    pageCount: 2,
    pageIndices: [1, 2],
    pages: [{
      pageIndex: 1,
      text: "書名：某史料\n整理者：某甲\n出版社：某出版社\n出版年：1987",
      evidenceOrigin: "native_text",
      ocrEngine: null,
      ocrConfidence: null,
    }],
    embeddedMetadata: { author: "某甲" },
    complete: true,
    hasUsableTextLayer: true,
  };
  let prompt: Record<string, unknown> | undefined;
  await deriveIntelligentBibliography(inspection, {
    async infer(value) {
      prompt = JSON.parse(value) as Record<string, unknown>;
      return { status: "no_bibliography", overallConfidence: 0, canonical: null, classSupport: [], fields: [], warnings: [] };
    },
  });
  assert.equal(prompt?.classificationRules && (prompt.classificationRules as Record<string, unknown>).intellectualWorkBeforeManifestation, true);
  assert.equal((prompt?.classificationRules as Record<string, unknown>).historicalModernManifestation, "primary_source_modern_edition");
  assert.match(String(prompt?.task), /modern publisher.*neither necessary nor sufficient class support/u);
  assert.match(String(prompt?.task), /person value or embedded metadata author field alone never proves/u);
  assert.deepEqual((prompt?.classificationRules as Record<string, unknown>).primarySourceModernEditionRequires, [
    "historical_primary_work", "edition_mediation",
  ]);
  const outputContract = prompt?.outputContract as Record<string, unknown>;
  assert.equal(outputContract.topLevel, "exactly status, overallConfidence, canonical, classSupport, fields, warnings");
  assert.match(String(outputContract.canonical), /SPARSE object/u);
  assert.match(String(outputContract.canonical), /Omit unsupported keys, empty nested objects, empty arrays, null placeholders/u);
  assert.match(String(outputContract.fields), /Allowed field names are vocabulary, not a checklist/u);
  assert.equal(Object.hasOwn(outputContract, "properties"), false);
  assert.ok(JSON.stringify(outputContract).length < 2_500, "model output guidance regressed to an exhaustive schema");
  assert.ok(Array.isArray(prompt?.controlledFields));
  assert.match(String(prompt?.task), /vocabularies, NEVER checklists/u);
  assert.match(String(prompt?.task), /Never emit evidence for a null, empty, absent, or unsupported fact/u);
  assert.match(String(prompt?.task), /materialClass MUST be one controlledValues\.materialClasses value/u);
  assert.match(String(prompt?.task), /sourcePageIndex is never the pages-array position/u);
});

test("unknown work classification cannot be promoted to auto-apply by model confidence", async () => {
  const source = fixture({ ...emptyCanonical("尚待分类的资料"), materialClass: "unknown", contributors: [] });
  source.inspection.pages[0]!.text = "题名：尚待分类的资料";
  const result = await deriveIntelligentBibliography(source.inspection, source.reasoner);
  assert.equal(result.status, "ambiguous");
  assert.ok(result.warnings.includes("uncertain_material_class"));
});

test("a class-support signal emitted as materialClass downgrades to unknown", async () => {
  const source = fixture({ ...emptyCanonical("边疆史资料"), contributors: [] });
  (source.model.canonical as unknown as Record<string, unknown>).materialClass = "historical_primary_work";
  const result = await deriveIntelligentBibliography(source.inspection, source.reasoner);
  assert.equal(result.canonical?.materialClass, "unknown");
  assert.equal(result.status, "ambiguous");
  assert.ok(result.warnings.includes("uncertain_material_class"));
});

test("publisher and date cannot retain a primary-source modern-edition proposal without positive edition evidence", async () => {
  const source = fixture({
    ...emptyCanonical("A General History of Inner Asia"),
    materialClass: "primary_source_modern_edition",
    contributors: [],
    publication: {
      publisher: "Academic Press",
      place: null,
      publicationDate: "2026",
      editionNumber: null,
      printing: null,
    },
  }, "ambiguous", ["uncertain_material_class"]);
  source.inspection.pages[0]!.text = "A General History of Inner Asia\nAcademic Press\n2026";
  source.model.classSupport = ["historical_primary_work", "edition_mediation"].map((signal) => ({
    signal,
    confidence: 95,
    sourcePageIndex: 1,
    evidenceOrigin: "native_text",
  }));

  const result = await deriveIntelligentBibliography(source.inspection, source.reasoner);

  assert.equal(result.canonical?.materialClass, "unknown");
  assert.equal(result.status, "ambiguous");
  assert.ok(result.warnings.includes("uncertain_material_class"));
});

test("one page drops hallucinated author edition and language without synthesizing provenance", async () => {
  const canonical = {
    ...emptyCanonical("A General History of Inner Asia"),
    contributors: [{ label: "Invented Author", role: "author" as const, roleLabel: null }],
    publication: {
      publisher: "Academic Press",
      place: null,
      publicationDate: "2026",
      editionNumber: null,
      printing: null,
    },
    language: "Invented Language",
    carrierEdition: {
      editionType: "critical_edition" as const,
      editionStatement: "Invented Critical Edition",
      facsimileStatement: null,
    },
  };
  const inspection: PdfTextInspection = {
    pageCount: 1,
    pageIndices: [1],
    pages: [{
      pageIndex: 1,
      text: "A General History of Inner Asia\nAcademic Press\n2026",
      evidenceOrigin: "native_text",
      ocrEngine: null,
      ocrConfidence: null,
    }],
    embeddedMetadata: {},
    complete: true,
    hasUsableTextLayer: true,
  };
  const supportedFields = populatedFields(canonical).filter((field) => [
    "materialClass", "canonicalTitle", "publication.publisher", "publication.publicationDate",
  ].includes(field.fieldName));
  const reasoner: BibliographicReasoner = {
    async infer() {
      const evidenceText = inspection.pages[0]!.text;
      return {
        status: "auto_apply",
        overallConfidence: 96,
        canonical,
        classSupport: [{
          signal: "scholarly_analysis",
          confidence: 96,
          sourcePageIndex: 1,
          evidenceOrigin: "native_text",
          evidenceText,
        }],
        fields: supportedFields.map((field) => ({ ...field, evidenceText })),
        warnings: [],
      };
    },
  };

  const result = await deriveIntelligentBibliography(inspection, reasoner);
  assert.equal(result.status, "ambiguous");
  assert.equal(result.canonical?.materialClass, "unknown");
  assert.deepEqual(result.canonical?.contributors, []);
  assert.equal(result.canonical?.language, null);
  assert.deepEqual(result.canonical?.carrierEdition, {
    editionType: null,
    editionStatement: null,
    facsimileStatement: null,
  });
  assert.equal(result.canonical?.publication.publisher, "Academic Press");
  assert.equal(result.canonical?.publication.publicationDate, "2026");
  assert.ok(result.fields.every((field) => ![
    "contributor.label", "contributor.role", "language", "carrierEdition.editionType", "carrierEdition.editionStatement",
  ].includes(field.fieldName)));
});

test("an exact fact excerpt can repair a model's pages-array ordinal without inventing provenance", async () => {
  const canonical = { ...emptyCanonical("A General History of Inner Asia"), contributors: [] };
  const inspection: PdfTextInspection = {
    pageCount: 3,
    pageIndices: [1, 3],
    pages: [
      {
        pageIndex: 1,
        text: "Studies in Inner Asian history",
        evidenceOrigin: "native_text",
        ocrEngine: null,
        ocrConfidence: null,
      },
      {
        pageIndex: 3,
        text: "Title: A General History of Inner Asia",
        evidenceOrigin: "native_text",
        ocrEngine: null,
        ocrConfidence: null,
      },
    ],
    embeddedMetadata: {},
    complete: true,
    hasUsableTextLayer: true,
  };
  const result = await deriveIntelligentBibliography(inspection, {
    async infer() {
      return {
        status: "ambiguous",
        overallConfidence: 80,
        canonical,
        classSupport: [],
        fields: [{
          fieldName: "canonicalTitle",
          scopeKey: "",
          confidence: 90,
          // The model incorrectly returned the first pages-array ordinal.
          sourcePageIndex: 1,
          evidenceOrigin: "native_text",
          evidenceText: "A General History of Inner Asia",
        }],
        warnings: ["uncertain_material_class"],
      };
    },
  });
  assert.equal(result.canonical?.canonicalTitle, "A General History of Inner Asia");
  assert.equal(result.fields.find((field) => field.fieldName === "canonicalTitle")?.sourcePageIndex, 3);
  assert.equal(result.fields.find((field) => field.fieldName === "canonicalTitle")?.pageClass, "title_page");
});

test("a constrained class-only Qwen proposal can retain positive page-bound scholarly evidence", async () => {
  const inspection: PdfTextInspection = {
    pageCount: 2,
    pageIndices: [1, 2],
    pages: [
      {
        pageIndex: 1,
        text: "题名：A General History of Inner Asia",
        evidenceOrigin: "native_text",
        ocrEngine: null,
        ocrConfidence: null,
      },
      {
        pageIndex: 2,
        text: "This study examines political institutions and social change through comparative historical analysis. It develops a sustained scholarly argument from the evidence presented in each chapter.",
        evidenceOrigin: "native_text",
        ocrEngine: null,
        ocrConfidence: null,
      },
    ],
    embeddedMetadata: {},
    complete: true,
    hasUsableTextLayer: true,
  };
  let observedClassPrompt: Record<string, unknown> | undefined;
  const reasoner: BibliographicReasoner = {
    async infer() {
      const canonical = {
        ...emptyCanonical("A General History of Inner Asia"),
        materialClass: "unknown" as const,
        contributors: [],
        // A bare substring is not semantic evidence that a modern study has a
        // historical source-edition dynasty. The later supported class must
        // remove this otherwise value-matching hallucination.
        sourceEdition: { ...emptyCanonical("unused").sourceEdition, dynasty: "Asia" },
      };
      return {
        status: "ambiguous",
        overallConfidence: 90,
        canonical,
        classSupport: [],
        fields: [
          {
            fieldName: "canonicalTitle",
            scopeKey: "",
            confidence: 90,
            sourcePageIndex: 1,
            evidenceOrigin: "native_text",
            evidenceText: "A General History of Inner Asia",
          },
          {
            fieldName: "sourceEdition.dynasty",
            scopeKey: "",
            confidence: 90,
            sourcePageIndex: 1,
            evidenceOrigin: "native_text",
            evidenceText: "Asia",
          },
        ],
        warnings: ["uncertain_material_class"],
      };
    },
    async classifyMaterial(prompt) {
      observedClassPrompt = JSON.parse(prompt) as Record<string, unknown>;
      return {
        materialClass: "scholarly_monograph",
        confidence: 91,
        evidenceCandidateIds: ["page-2-chunk-1"],
      };
    },
  };

  const result = await deriveIntelligentBibliography(inspection, reasoner);

  assert.equal(result.canonical?.materialClass, "scholarly_monograph");
  assert.equal(result.fields.find((field) => field.fieldName === "materialClass")?.sourcePageIndex, 2);
  assert.equal(result.fields.find((field) => field.fieldName === "materialClass")?.sourceType, "class_support");
  assert.equal(result.warnings.includes("uncertain_material_class"), false);
  assert.equal(result.canonical?.sourceEdition.dynasty, null);
  assert.equal(result.fields.some((field) => field.fieldName.startsWith("sourceEdition.")), false);
  const candidates = observedClassPrompt?.evidenceCandidates as Array<Record<string, unknown>>;
  assert.equal(candidates.some((candidate) => candidate.candidateId === "page-2-chunk-1"), true);
});

test("a class-only proposal citing only title-page evidence remains unknown", async () => {
  const source = fixture({
    ...emptyCanonical("A General History of Inner Asia"),
    materialClass: "unknown",
    contributors: [],
  }, "ambiguous", ["uncertain_material_class"]);
  const reasoner: BibliographicReasoner = {
    infer: source.reasoner.infer,
    async classifyMaterial() {
      return {
        materialClass: "scholarly_monograph",
        confidence: 99,
        evidenceCandidateIds: ["page-1-chunk-1"],
      };
    },
  };

  const result = await deriveIntelligentBibliography(source.inspection, reasoner);

  assert.equal(result.canonical?.materialClass, "unknown");
  assert.ok(result.warnings.includes("uncertain_material_class"));
});

test("an invalid class-only candidate identity preserves the validated unknown result", async () => {
  const source = fixture({
    ...emptyCanonical("A General History of Inner Asia"),
    materialClass: "unknown",
    contributors: [],
  }, "ambiguous", ["uncertain_material_class"]);
  const reasoner: BibliographicReasoner = {
    infer: source.reasoner.infer,
    async classifyMaterial() {
      return {
        materialClass: "scholarly_monograph",
        confidence: 99,
        evidenceCandidateIds: ["not-a-supplied-candidate"],
      };
    },
  };

  const result = await deriveIntelligentBibliography(source.inspection, reasoner);

  assert.equal(result.status, "ambiguous");
  assert.equal(result.canonical?.materialClass, "unknown");
  assert.ok(result.warnings.includes("uncertain_material_class"));
});

test("positive scholarly class support retains a Qwen proposal without title-keyword dependence", async () => {
  const source = fixture({
    ...emptyCanonical("A General History of Inner Asia"),
    materialClass: "scholarly_monograph",
    contributors: [],
    publication: {
      publisher: "Academic Press",
      place: null,
      publicationDate: "2026",
      editionNumber: null,
      printing: null,
    },
  });
  source.inspection.pages[0]!.text = "A General History of Inner Asia\nAcademic Press\n2026";

  const result = await deriveIntelligentBibliography(source.inspection, source.reasoner);

  assert.equal(result.status, "auto_apply");
  assert.equal(result.canonical?.materialClass, "scholarly_monograph");
  assert.equal(result.canonical?.canonicalTitle, "A General History of Inner Asia");
  assert.equal(JSON.stringify(result).includes("evidenceText"), false, "transient excerpts must not persist");
  assert.equal(JSON.stringify(result).includes("classSupport"), false, "transient class rationale must not persist");
});

test("primary-source modern edition is retained only with both work and mediation support", async () => {
  const source = fixture({
    ...emptyCanonical("元朝秘史"),
    materialClass: "primary_source_modern_edition",
    contributors: [],
    carrierEdition: { editionType: "critical_edition", editionStatement: "点校本", facsimileStatement: null },
  });
  source.inspection.pages[0]!.text = "题名：元朝秘史\n版本：点校本";

  const result = await deriveIntelligentBibliography(source.inspection, source.reasoner);

  assert.equal(result.canonical?.materialClass, "primary_source_modern_edition");
  assert.equal(result.canonical?.carrierEdition.editionStatement, "点校本");
});

test("conflicting scholarly and historical-work support downgrades class to unknown", async () => {
  const source = fixture({
    ...emptyCanonical("A General History of Inner Asia"),
    materialClass: "scholarly_monograph",
    contributors: [],
  });
  source.inspection.pages[0]!.text = "A General History of Inner Asia";
  source.model.classSupport.push({
    signal: "historical_primary_work",
    confidence: 95,
    sourcePageIndex: 2,
    evidenceOrigin: "native_text",
  });

  const result = await deriveIntelligentBibliography(source.inspection, source.reasoner);

  assert.equal(result.canonical?.materialClass, "unknown");
  assert.equal(result.status, "ambiguous");
  assert.ok(result.warnings.includes("conflicting_evidence"));
});

test("gated embedded metadata requires exact value support and a null page identity", async () => {
  const embeddedAuthor = "Nicholas Poppe";
  const canonical = {
    ...emptyCanonical("The Secret History of the Mongols"),
    materialClass: "unknown" as const,
    contributors: [],
  };
  const inspection: PdfTextInspection = {
    pageCount: 2,
    pageIndices: [1],
    pages: [{
      pageIndex: 1,
      text: "ず之 fO v f 107の652 1987",
      evidenceOrigin: "ocr",
      ocrEngine: "academiccloud-paddleocr-test",
      ocrConfidence: 60,
    }],
    embeddedMetadata: { title: canonical.canonicalTitle, author: embeddedAuthor },
    complete: true,
    hasUsableTextLayer: false,
  };
  const model = {
    status: "ambiguous",
    overallConfidence: 95,
    canonical,
    classSupport: [],
    fields: populatedFields(canonical).map((field) => ({
      ...field,
      sourcePageIndex: null,
      evidenceOrigin: "embedded_pdf_metadata",
      evidenceText: canonical.canonicalTitle,
    })),
    warnings: [],
  };

  const result = await deriveIntelligentBibliography(inspection, { async infer() { return model; } });
  assert.equal(result.status, "ambiguous");
  assert.ok(result.fields.every((field) => (
    field.sourcePageIndex === null && field.evidenceOrigin === "embedded_pdf_metadata"
  )));

  const metadataOnlyPerson = {
    ...canonical,
    contributors: [{ label: embeddedAuthor, role: "author" as const, roleLabel: null }],
  };
  const personPruned = await deriveIntelligentBibliography(inspection, {
      async infer() {
        return {
          ...model,
          canonical: metadataOnlyPerson,
          fields: populatedFields(metadataOnlyPerson).map((field) => ({
            ...field,
            sourcePageIndex: null,
            evidenceOrigin: "embedded_pdf_metadata",
            evidenceText: field.fieldName === "canonicalTitle" ? canonical.canonicalTitle : embeddedAuthor,
          })),
        };
      },
    });
  assert.deepEqual(personPruned.canonical?.contributors, []);
  assert.ok(personPruned.fields.every((field) => !field.fieldName.startsWith("contributor.")));

  await assert.rejects(
    deriveIntelligentBibliography(inspection, {
      async infer() {
        return { ...model, fields: model.fields.map((field) => ({ ...field, sourcePageIndex: 1 })) };
      },
    }),
    (error: unknown) => error instanceof BibliographicIntelligenceError
      && error.diagnostic === "field_evidence_invalid",
  );

  let calls = 0;
  await assert.rejects(
    deriveIntelligentBibliography({ ...inspection, embeddedMetadata: {} }, {
      async infer() {
        calls += 1;
        return model;
      },
    }),
    (error: unknown) => error instanceof BibliographicIntelligenceError
      && error.diagnostic === "field_evidence_invalid",
  );
  assert.equal(calls, 2);
});

test("Qwen receives usable class pages while fact evidence stays exact-field scoped", async () => {
  const canonical = {
    ...emptyCanonical("近代中国史研究"),
    contributors: [{ label: "王明", role: "author" as const, roleLabel: "作者" }],
  };
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
      text: "This preface explains that the book analyzes problems in modern Chinese history, compares primary evidence and scholarly methods, and develops an independent argument beyond its title, publisher, date, identifier, edition, or contributor lines.",
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
        classSupport: [{
          signal: "scholarly_analysis",
          confidence: 95,
          sourcePageIndex: 2,
          evidenceOrigin: "native_text",
          evidenceText: inspection.pages[1]!.text,
        }],
        fields: populatedFields(canonical).map((field) => ({ ...field, evidenceText: titlePage.text })),
        warnings: [],
      };
    },
  };

  const result = await deriveIntelligentBibliography(inspection, reasoner);
  assert.equal(result.status, "auto_apply");
  assert.equal(inferenceCalls, 1);
  const pages = observedPrompt?.pages as Array<Record<string, unknown>>;
  assert.deepEqual(pages.map(({ pageIndex, pageClass, evidenceOrigin, fieldEvidenceEligible }) => ({ pageIndex, pageClass, evidenceOrigin, fieldEvidenceEligible })), [{
    pageIndex: 1,
    pageClass: "title_page",
    evidenceOrigin: "native_text",
    fieldEvidenceEligible: true,
  }, {
    pageIndex: 2,
    pageClass: "ordinary_body",
    evidenceOrigin: "native_text",
    fieldEvidenceEligible: false,
  }]);
  assert.deepEqual(observedPrompt?.embeddedMetadata, {});
  assert.match(String(observedPrompt?.task), /scopeKey MUST be the empty string/u);
  assert.equal(result.fields.length, populatedFields(canonical).length + 1);
  assert.equal(result.fields.find((field) => field.fieldName === "materialClass")?.sourcePageIndex, 2);
  assert.equal(result.fields.find((field) => field.fieldName === "materialClass")?.sourceType, "class_support");
  assert.ok(result.fields.filter((field) => field.fieldName !== "materialClass")
    .every((field) => field.sourcePageIndex === 1 && field.evidenceOrigin === "native_text"));
  assert.equal(new Set(result.fields.map((field) => `${field.fieldName}:${field.scopeKey}`)).size, result.fields.length);
});

test("missing field provenance gets one bounded repair pass then evidence-only pruning", async () => {
  const canonical = {
    ...emptyCanonical("近代中国史研究"),
    contributors: [{ label: "王明", role: "author" as const, roleLabel: "作者" }],
    publication: {
      publisher: null,
      place: null,
      publicationDate: null,
      editionNumber: "第1版",
      printing: null,
    },
  };
  const inspection: PdfTextInspection = {
    pageCount: 3,
    pageIndices: [1, 2, 3],
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
    }, {
      pageIndex: 3,
      text: "This preface explains that the book presents sustained scholarly analysis, compares evidence and interpretations, and develops an original historical argument independently from its title, publisher, date, edition, identifier, or contributor lines.",
      evidenceOrigin: "native_text",
      ocrEngine: null,
      ocrConfidence: null,
    }],
    embeddedMetadata: {},
    complete: true,
    hasUsableTextLayer: true,
  };
  const completeFields = populatedFields(canonical).map((field) => ({
    ...field,
    sourcePageIndex: field.fieldName === "publication.editionNumber" ? 2 : 1,
    evidenceText: field.fieldName === "publication.editionNumber"
      ? inspection.pages[1]!.text
      : inspection.pages[0]!.text,
  }));
  const incompleteFields = completeFields.filter((field) => ![
    "contributor.label",
    "publication.editionNumber",
  ].includes(field.fieldName));
  const repairPrompts: Array<Record<string, unknown>> = [];
  const mutatedRepairCanonical = {
    ...canonical,
    publication: {
      ...canonical.publication,
      editionNumber: null,
    },
  };
  const repairedFields = completeFields.filter((field) => field.fieldName !== "publication.editionNumber");
  const classSupport = [{
    signal: "scholarly_analysis",
    confidence: 95,
    sourcePageIndex: 3,
    evidenceOrigin: "native_text",
    evidenceText: inspection.pages[2]!.text,
  }];
  let calls = 0;
  const reasoner: BibliographicReasoner = {
    async infer(prompt) {
      calls += 1;
      if (calls === 2) repairPrompts.push(JSON.parse(prompt) as Record<string, unknown>);
      return {
        status: "auto_apply",
        overallConfidence: 95,
        canonical: calls === 1 ? canonical : mutatedRepairCanonical,
        classSupport,
        fields: calls === 1 ? incompleteFields : repairedFields,
        warnings: [],
      };
    },
  };

  const result = await deriveIntelligentBibliography(inspection, reasoner);
  assert.equal(result.status, "auto_apply");
  assert.equal(result.canonical?.publication.editionNumber, null);
  assert.equal(result.canonical?.publication.printing, null);
  assert.equal(calls, 2);
  const repair = repairPrompts[0]?.repair as Record<string, unknown>;
  assert.equal(repair.reason, "previous_field_evidence_invalid");
  assert.deepEqual(repair.previousCanonical, canonical);
  assert.deepEqual(repair.requiredFieldKeys, [
    "canonicalTitle:",
    "contributor.label:contributor:0",
    "contributor.role:contributor:0",
    "contributor.roleLabel:contributor:0",
    "publication.editionNumber:",
  ]);

  calls = 0;
  const persistentlyInvalid: BibliographicReasoner = {
    async infer() {
      calls += 1;
      return { status: "auto_apply", overallConfidence: 95, canonical, classSupport, fields: incompleteFields, warnings: [] };
    },
  };
  const pruned = await deriveIntelligentBibliography(inspection, persistentlyInvalid);
  assert.equal(pruned.status, "auto_apply");
  assert.deepEqual(pruned.canonical?.contributors, []);
  assert.equal(pruned.canonical?.publication.editionNumber, null);
  assert.equal(calls, 2);

  calls = 0;
  const withoutTitleEvidence: BibliographicReasoner = {
    async infer() {
      calls += 1;
      return {
        status: "auto_apply",
        overallConfidence: 95,
        canonical,
        classSupport,
        fields: incompleteFields.filter((field) => field.fieldName !== "canonicalTitle"),
        warnings: [],
      };
    },
  };
  const titleRecovered = await deriveIntelligentBibliography(inspection, withoutTitleEvidence);
  assert.equal(titleRecovered.status, "ambiguous");
  assert.equal(titleRecovered.canonical?.canonicalTitle, canonical.canonicalTitle);
  assert.equal(calls, 2);
  const titleEvidence = titleRecovered.fields.find((field) => field.fieldName === "canonicalTitle");
  assert.deepEqual({ ...titleEvidence, evidenceSha256: undefined }, {
    fieldName: "canonicalTitle",
    scopeKey: "",
    confidence: 0,
    sourcePageIndex: 1,
    evidenceOrigin: "native_text",
    sourceType: "title_page",
    pageClass: "title_page",
    evidenceSha256: undefined,
  });
  assert.match(String(titleEvidence?.evidenceSha256), /^[a-f0-9]{64}$/u);
});

test("seven bounded representative bibliographic cases remain inside the strict domain", async () => {
  const cases: Array<[string, IntelligentCanonicalBibliography, "auto_apply" | "ambiguous"]> = [];
  cases.push(["Chinese modern monograph", { ...emptyCanonical("近代中国史研究"), publication: { publisher: "学术出版社", place: "北京", publicationDate: "2026", editionNumber: null, printing: null }, language: "中文" }, "auto_apply"]);
  cases.push(["Japanese monograph", { ...emptyCanonical("近代日本史研究"), contributors: [{ label: "山田太郎", role: "author", roleLabel: null }], language: "日本語" }, "auto_apply"]);
  cases.push(["modern edited source", { ...emptyCanonical("清代档案选编"), materialClass: "primary_source_modern_edition", contributors: [{ label: "李文", role: "editor", roleLabel: null }], carrierEdition: { editionType: "critical_edition", editionStatement: "点校本", facsimileStatement: null } }, "auto_apply"]);
  cases.push(["modern facsimile", { ...emptyCanonical("宋刻本影印集"), materialClass: "primary_source_modern_edition", carrierEdition: { editionType: "facsimile", editionStatement: "影印本", facsimileStatement: "据藏本影印" }, sourceEdition: { ...emptyCanonical("x").sourceEdition, dynasty: "宋", editionType: "engraved", editionStatement: "宋刻本" } }, "auto_apply"]);
  cases.push(["traditional vertical", { ...emptyCanonical("資治通鑑"), materialClass: "traditional_book", language: "繁體中文", sourceEdition: { ...emptyCanonical("x").sourceEdition, dynasty: "清", reignTitle: "乾隆", reignYear: "十二年", absoluteYear: 1747, editionType: "engraved", editionStatement: "刻本" } }, "auto_apply"]);
  cases.push(["journal article", { ...emptyCanonical("边疆史研究的新进展"), materialClass: "journal_article", volume: "第12卷", publication: { publisher: null, place: null, publicationDate: "2025", editionNumber: null, printing: null } }, "auto_apply"]);
  cases.push(["ambiguous", { ...emptyCanonical("历史研究"), subtitle: "历史研究" }, "ambiguous"]);

  for (const [label, canonical, expected] of cases) {
    const { inspection, reasoner } = fixture(canonical, label === "ambiguous" ? "auto_apply" : "auto_apply");
    const result = await deriveIntelligentBibliography(inspection, reasoner);
    assert.equal(result.status, expected, label);
    assert.equal(result.canonical?.materialClass, canonical.materialClass, label);
    assert.equal(result.provenance.selectedPages.length, 2, label);
  }
});

test("invalid ISBN facts and publisher-shaped people are removed before auto-apply", async () => {
  const invalidIsbn = {
    ...emptyCanonical("安全题名"),
    identifiers: [{ scheme: "isbn", value: "978-0-000-00000-0" }],
  };
  const invalid = fixture(invalidIsbn);
  invalid.inspection.pageCount = 3;
  invalid.inspection.pageIndices = [1, 2, 3];
  invalid.inspection.pages.push({
    pageIndex: 3,
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
  const classPage = {
    pageIndex: 2,
    text: "This preface explains that the book presents sustained scholarly analysis, compares evidence and interpretations, and develops an original historical argument independently from its title, publisher, date, edition, identifier, or contributor lines.",
    evidenceOrigin: "native_text" as const,
    ocrEngine: null,
    ocrConfidence: null,
  };
  const inspection: PdfTextInspection = {
    pageCount: 2,
    pageIndices: [1, 2],
    pages: [page, classPage],
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
          contributors: [{ label: "王明", role: "author", roleLabel: "作者" }],
        },
        classSupport: [{
          signal: "scholarly_analysis",
          confidence: 95,
          sourcePageIndex: 2,
          evidenceOrigin: "native_text",
          evidenceText: classPage.text,
        }],
        fields: ["canonicalTitle", "contributor.label", "contributor.role", "contributor.roleLabel"].map((fieldName) => ({
          fieldName,
          scopeKey: fieldName.startsWith("contributor.") ? "contributor:0" : "",
          confidence: 95,
          sourcePageIndex: 1,
          evidenceOrigin: "native_text",
          evidenceText: page.text,
        })),
        warnings: [],
      };
    },
  };

  const result = await deriveIntelligentBibliography(inspection, reasoner);
  assert.equal(result.status, "auto_apply");
  assert.deepEqual(result.canonical?.publication, { publisher: null, place: null, publicationDate: null, editionNumber: null, printing: null });
  assert.deepEqual(result.canonical?.carrierEdition, { editionType: null, editionStatement: null, facsimileStatement: null });
  assert.equal(result.canonical?.contributors[0]?.roleLabel, "作者");
  assert.equal(result.fields.find((field) => field.fieldName === "materialClass")?.sourceType, "class_support");
  assert.ok(result.fields.filter((field) => field.fieldName !== "materialClass")
    .every((field) => field.sourceType === "title_page" && field.pageClass === "title_page"));

  const singlePageFallback: BibliographicReasoner = {
    async infer() {
      const model = await reasoner.infer("") as Record<string, unknown>;
      return { ...model, fields: [] };
    },
  };
  const literalTitleOnly = await deriveIntelligentBibliography(inspection, singlePageFallback);
  assert.equal(literalTitleOnly.status, "ambiguous");
  assert.deepEqual(literalTitleOnly.canonical?.contributors, []);
  assert.deepEqual(
    literalTitleOnly.fields.map((field) => `${field.fieldName}:${field.scopeKey}`).sort(),
    ["canonicalTitle:", "materialClass:"],
  );
  assert.equal(literalTitleOnly.fields.find((field) => field.fieldName === "canonicalTitle")?.confidence, 0);

  const nonAuthoritativeClassification: BibliographicReasoner = {
    async infer() {
      const model = await reasoner.infer("") as Record<string, unknown>;
      return {
        ...model,
        fields: (model.fields as Array<Record<string, unknown>>).map((field) => ({ ...field, pageClass: "cover" })),
      };
    },
  };
  const ignoredPageClassification = await deriveIntelligentBibliography(inspection, nonAuthoritativeClassification);
  assert.equal(ignoredPageClassification.status, "ambiguous");
  assert.deepEqual(ignoredPageClassification.canonical?.contributors, []);
  assert.deepEqual(
    ignoredPageClassification.fields.map((field) => `${field.fieldName}:${field.scopeKey}`).sort(),
    ["canonicalTitle:", "materialClass:"],
  );
  assert.equal(ignoredPageClassification.fields.find((field) => field.fieldName === "canonicalTitle")?.pageClass, "title_page");

  const contradictoryStatus: BibliographicReasoner = {
    async infer() {
      const model = await reasoner.infer("") as Record<string, unknown>;
      return { ...model, status: "no_bibliography" };
    },
  };
  const downgraded = await deriveIntelligentBibliography(inspection, contradictoryStatus);
  assert.equal(downgraded.status, "ambiguous");
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

test("empty model placeholders cannot become contributor or edition facts", async () => {
  const source = fixture({ ...emptyCanonical("边疆史研究"), contributors: [] });
  const model = source.model as Record<string, unknown>;
  model.canonical = {
    materialClass: "scholarly_monograph",
    canonicalTitle: "边疆史研究",
    contributors: [
      { label: "王明", role: "author", roleLabel: "" },
      { label: "Mongolia Society", role: "publisher", roleLabel: "publisher" },
    ],
    publication: { publisher: `P${"x".repeat(40)}\nP`, place: "", publicationDate: "", editionNumber: "", printing: "" },
    carrierEdition: { editionType: "", editionStatement: "", facsimileStatement: "" },
    sourceEdition: { absoluteYear: "", editionType: "", editionStatement: "" },
  };
  model.fields = (model.fields as Array<Record<string, unknown>>).filter((field) => (
    field.fieldName === "canonicalTitle"
  ));

  const result = await deriveIntelligentBibliography(source.inspection, source.reasoner);
  assert.equal(result.status, "auto_apply");
  assert.deepEqual(result.canonical?.contributors, []);
  assert.deepEqual(result.canonical?.carrierEdition, {
    editionType: null,
    editionStatement: null,
    facsimileStatement: null,
  });
  assert.equal(result.canonical?.publication.publisher, null);
  assert.equal(result.canonical?.sourceEdition.absoluteYear, null);
  assert.equal(result.canonical?.sourceEdition.editionType, null);
  assert.ok(result.fields.every((field) => !field.fieldName.includes("Edition")));
});

test("whole-inspection edition markers never override a positively supported Qwen work class", async () => {
  const source = fixture({
    ...emptyCanonical("A General History of Inner Asia"),
    materialClass: "scholarly_monograph",
    contributors: [],
  });
  source.inspection.pages[0]!.text = "题名：A General History of Inner Asia\n现代载体版本：点校本\n影印说明：据旧本影印";

  const result = await deriveIntelligentBibliography(source.inspection, source.reasoner);

  assert.equal(result.canonical?.materialClass, "scholarly_monograph");
  assert.deepEqual(result.canonical?.carrierEdition, {
    editionType: null,
    editionStatement: null,
    facsimileStatement: null,
  });
  assert.deepEqual(result.canonical?.sourceEdition, {
    dynasty: null,
    reignTitle: null,
    reignYear: null,
    absoluteYear: null,
    printer: null,
    imprint: null,
    bookshop: null,
    institution: null,
    printingPlace: null,
    editionType: null,
    editionStatement: null,
    holdingInformation: null,
  });
});
