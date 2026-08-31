import assert from "node:assert/strict";
import test from "node:test";

import type { IntelligentCanonicalBibliography, IntelligentBibliographicFieldName } from "@academiccloud/compute-contracts";

import {
  adaptNuExtractBibliographyResponse,
  adaptNuExtractClassResponse,
  BibliographicIntelligenceError,
  buildNuExtractChatCompletionRequest,
  deriveIntelligentBibliography,
  LLAMA_RESPONSE_FORMAT,
  loadLlamaReasonerConfig,
  NUEXTRACT_BIBLIOGRAPHY_TEMPLATE,
  NUEXTRACT_CLASS_TEMPLATE,
  NUEXTRACT_CONTEXT_TOKENS,
  NUEXTRACT_MAX_COMPLETION_TOKENS,
  NUEXTRACT_REASONING_INPUT_CHARACTERS,
  NUEXTRACT_REASONING_MODEL,
  NUEXTRACT_REASONING_MODE,
  NUEXTRACT_REASONING_PAGE_CHARACTERS,
  NUEXTRACT_SHARED_MODEL_PATH,
  NUEXTRACT_TEMPERATURE,
  parseLlamaChatCompletionResponse,
  type BibliographicReasoner,
} from "../src/bibliographic-intelligence.js";
import type { PdfTextInspection } from "../src/suggestion.js";

test("NuExtract adapter uses native templates over generic JSON transport", () => {
  assert.deepEqual(LLAMA_RESPONSE_FORMAT, { type: "json_object" });
  const bibliography = buildNuExtractChatCompletionRequest("bounded evidence", "bibliography", 1024);
  assert.equal(bibliography.model, "NuExtract3-4B-GGUF");
  assert.equal(bibliography.temperature, NUEXTRACT_TEMPERATURE);
  assert.deepEqual(bibliography.messages, [{ role: "user", content: "bounded evidence" }]);
  assert.deepEqual(bibliography.response_format, LLAMA_RESPONSE_FORMAT);
  assert.equal(bibliography.chat_template_kwargs.enable_thinking, false);
  assert.match(bibliography.chat_template_kwargs.instructions, /bibliographic facts/u);
  assert.deepEqual(JSON.parse(bibliography.chat_template_kwargs.template), NUEXTRACT_BIBLIOGRAPHY_TEMPLATE);
  assert.equal(bibliography.messages.some((message) => message.role !== "user"), false);

  const materialClass = buildNuExtractChatCompletionRequest("class evidence", "class", 512);
  assert.deepEqual(JSON.parse(materialClass.chat_template_kwargs.template), NUEXTRACT_CLASS_TEMPLATE);
  assert.match(materialClass.chat_template_kwargs.instructions, /Classify the intellectual work/u);
  assert.deepEqual(materialClass.response_format, { type: "json_object" });
});

test("NuExtract native facts project exactly into the frozen v11 model shape", () => {
  const native = {
    canonical: {
      canonicalTitle: "北方民族史研究",
      subtitle: null,
      alternativeTitles: [],
      dateStatement: null,
      identifiers: [],
      contributors: [{ label: "王明", role: "author", roleLabel: "作者" }],
      publication: {},
      series: null,
      volume: null,
      language: null,
      carrierEdition: {},
      sourceEdition: {},
    },
  };
  const prompt = JSON.stringify({
    pages: [{
      pageIndex: 1,
      pageClass: "title_page",
      evidenceOrigin: "native_text",
      fieldEvidenceEligible: true,
      text: "书名：北方民族史研究\n作者：王明",
    }],
    embeddedMetadata: {},
  });
  const projected = adaptNuExtractBibliographyResponse(native, prompt);
  assert.deepEqual(projected.canonical, {
    materialClass: "unknown",
    canonicalTitle: "北方民族史研究",
    contributors: [{ label: "王明", role: "author", roleLabel: "作者" }],
  });
  assert.deepEqual((projected.fields as Array<Record<string, unknown>>).map((field) => [field.fieldName, field.scopeKey]), [
    ["canonicalTitle", ""],
    ["contributor.label", "contributor:0"],
    ["contributor.role", "contributor:0"],
    ["contributor.roleLabel", "contributor:0"],
  ]);
  assert.equal(projected.status, "ambiguous");
  assert.equal(projected.overallConfidence, 0);
  assert.deepEqual(projected.classSupport, []);
  assert.ok((projected.fields as Array<Record<string, unknown>>).every((field) => field.confidence === 0));
  assert.deepEqual(adaptNuExtractClassResponse({
    materialClass: "scholarly_monograph",
    evidenceCandidateIds: ["p2-c0"],
  }), {
    materialClass: "scholarly_monograph",
    confidence: 0,
    evidenceCandidateIds: ["p2-c0"],
  });
});

test("NuExtract adapter rejects malformed or contradictory native facts without coercion", () => {
  const prompt = JSON.stringify({
    pages: [{ pageIndex: 1, pageClass: "title_page", evidenceOrigin: "native_text", fieldEvidenceEligible: true, text: "题名：受控题名" }],
    embeddedMetadata: {},
  });
  const canonical = {
    canonicalTitle: "受控题名", alternativeTitles: [], identifiers: [], contributors: [],
    publication: {}, carrierEdition: {}, sourceEdition: {},
  };
  assert.throws(
    () => adaptNuExtractBibliographyResponse({ canonical: { ...canonical, publication: { publisher: 42 } } }, prompt),
    (error: unknown) => error instanceof BibliographicIntelligenceError && error.diagnostic === "canonical_schema_invalid",
  );
  assert.throws(
    () => adaptNuExtractBibliographyResponse({ canonical }, "not-json"),
    (error: unknown) => error instanceof BibliographicIntelligenceError && error.diagnostic === "field_evidence_invalid",
  );
  assert.throws(
    () => adaptNuExtractBibliographyResponse({ canonical: {
      ...canonical,
      contributors: [{ label: "王明", role: null, roleLabel: "作者" }],
    } }, prompt),
    (error: unknown) => error instanceof BibliographicIntelligenceError && error.diagnostic === "canonical_schema_invalid",
  );
  const unsupported = adaptNuExtractBibliographyResponse({ canonical: {
    ...canonical,
    publication: { publisher: "无证据出版社" },
  } }, prompt);
  assert.equal((unsupported.canonical as { publication?: unknown }).publication, undefined);
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
  const production = loadLlamaReasonerConfig({ NODE_ENV: "production", BIBLIOGRAPHY_LLAMA_GPU_LAYERS: "999" });
  assert.equal(production.gpuLayers, 999);
  assert.equal(production.modelPath, NUEXTRACT_SHARED_MODEL_PATH);
  assert.equal(loadLlamaReasonerConfig({ BIBLIOGRAPHY_NUEXTRACT_MODEL_PATH: "/tmp/model.gguf" }).modelPath, "/tmp/model.gguf");
  assert.throws(
    () => loadLlamaReasonerConfig({ NODE_ENV: "production", BIBLIOGRAPHY_NUEXTRACT_MODEL_PATH: "/tmp/model.gguf" }),
    /cannot be overridden/u,
  );
  assert.throws(
    () => loadLlamaReasonerConfig({ NODE_ENV: "production", BIBLIOGRAPHY_QWEN_MODEL_PATH: "/tmp/stale.gguf" }),
    /cannot be overridden/u,
  );
  assert.throws(() => loadLlamaReasonerConfig({ BIBLIOGRAPHY_LLAMA_GPU_LAYERS: "-1" }), /BIBLIOGRAPHY_LLAMA_GPU_LAYERS/u);
  assert.throws(() => loadLlamaReasonerConfig({ BIBLIOGRAPHY_LLAMA_GPU_LAYERS: "1000" }), /BIBLIOGRAPHY_LLAMA_GPU_LAYERS/u);
  assert.throws(() => loadLlamaReasonerConfig({ BIBLIOGRAPHY_LLAMA_GPU_LAYERS: "all" }), /BIBLIOGRAPHY_LLAMA_GPU_LAYERS/u);
});

test("NuExtract completion and multilingual evidence budgets fit the pinned context", () => {
  assert.deepEqual(NUEXTRACT_REASONING_MODEL, {
    family: "NuExtract3",
    name: "NuExtract3-4B-GGUF",
    repository: "numind/NuExtract3-GGUF",
    revision: "28a1aae6288c5d50bdf999ca2e572240966d669b",
    filename: "NuExtract3-Q5_K_M.gguf",
    sha256: "1e6792f3402347785eb54e965255329e96204233b4bbf717c67a99f267736383",
    byteSize: 3_161_424_864,
    quantization: "Q5_K_M",
    architecture: "qwen35",
  });
  assert.equal(NUEXTRACT_CONTEXT_TOKENS, 32_768);
  assert.equal(NUEXTRACT_MAX_COMPLETION_TOKENS, 8_192);
  assert.equal(NUEXTRACT_REASONING_INPUT_CHARACTERS, 8_192);
  assert.equal(NUEXTRACT_REASONING_PAGE_CHARACTERS, 1_024);
  assert.equal(NUEXTRACT_REASONING_MODE, "off");
  assert.equal(NUEXTRACT_TEMPERATURE, 0.2);
  assert.ok(NUEXTRACT_MAX_COMPLETION_TOKENS < NUEXTRACT_CONTEXT_TOKENS);
  assert.ok(NUEXTRACT_REASONING_INPUT_CHARACTERS + NUEXTRACT_MAX_COMPLETION_TOKENS < NUEXTRACT_CONTEXT_TOKENS);
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
  assert.ok(suppliedPages.every((page) => page.text.length <= NUEXTRACT_REASONING_PAGE_CHARACTERS));
  assert.ok(suppliedPages.reduce((total, page) => total + page.text.length, 0) <= NUEXTRACT_REASONING_INPUT_CHARACTERS);
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

test("Qwen v7 sparse prompt prioritizes primary content without turning optional facts into a checklist", async () => {
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
  assert.equal((prompt?.classificationRules as Record<string, unknown>).historicalSourceWithModernMediationOutranksScholarlyParatext, true);
  assert.equal((prompt?.classificationRules as Record<string, unknown>).scholarlyMonographRequiresPrimaryPurposeOfModernAnalysis, true);
  assert.match(String(prompt?.task), /modern publisher.*neither necessary nor sufficient class support/u);
  assert.match(String(prompt?.task), /historical source text.*remains primary_source_modern_edition.*introduction contains scholarly analysis/u);
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

test("a class-support signal emitted as the known materialClass field fails strict enum validation", async () => {
  const source = fixture({ ...emptyCanonical("边疆史资料"), contributors: [] });
  (source.model.canonical as unknown as Record<string, unknown>).materialClass = "historical_primary_work";
  await assert.rejects(
    deriveIntelligentBibliography(source.inspection, source.reasoner),
    (error: unknown) => error instanceof BibliographicIntelligenceError
      && error.diagnostic === "canonical_schema_invalid",
  );
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

test("canonical title evidence is never recovered from page resemblance", async () => {
  const canonical = {
    ...emptyCanonical("元朝秘史（校勘本）"),
    materialClass: "unknown" as const,
    contributors: [],
  };
  const page = {
    pageIndex: 1,
    text: "题名：元朝秘史 校勘本",
    evidenceOrigin: "native_text" as const,
    ocrEngine: null,
    ocrConfidence: null,
  };
  const inspection: PdfTextInspection = {
    pageCount: 1,
    pageIndices: [1],
    pages: [page],
    embeddedMetadata: {},
    complete: true,
    hasUsableTextLayer: true,
  };
  let calls = 0;
  await assert.rejects(
    deriveIntelligentBibliography(inspection, {
      async infer() {
        calls += 1;
        return {
          status: "ambiguous",
          overallConfidence: 80,
          canonical,
          classSupport: [],
          fields: [],
          warnings: ["uncertain_material_class"],
        };
      },
    }),
    (error: unknown) => error instanceof BibliographicIntelligenceError
      && error.diagnostic === "field_evidence_invalid",
  );
  assert.equal(calls, 2, "one bounded repair pass may run, but it cannot synthesize title provenance");
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
  await assert.rejects(
    deriveIntelligentBibliography(inspection, withoutTitleEvidence),
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
  await assert.rejects(
    deriveIntelligentBibliography(inspection, singlePageFallback),
    (error: unknown) => error instanceof BibliographicIntelligenceError
      && error.diagnostic === "field_evidence_invalid",
  );

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
  assert.equal(ignoredPageClassification.status, "auto_apply");
  assert.equal(ignoredPageClassification.canonical?.contributors[0]?.label, "王明");
  assert.ok(ignoredPageClassification.fields.every((field) => field.pageClass !== "cover"));

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
  await assert.rejects(
    deriveIntelligentBibliography(inspection, unsafeWarningText),
    (error: unknown) => error instanceof BibliographicIntelligenceError
      && error.diagnostic === "result_schema_invalid",
  );
});

test("final model projection drops only unknown keys and keeps known malformed data fail closed", async () => {
  const source = fixture({ ...emptyCanonical("受控题名"), contributors: [] });
  const base = await source.reasoner.infer("") as Record<string, unknown>;
  const reasonerFor = (model: Record<string, unknown>): BibliographicReasoner => ({
    async infer() { return structuredClone(model); },
  });
  const clone = (): Record<string, unknown> => structuredClone(base);

  const withUnknownKeys = clone();
  withUnknownKeys.filename = "不得成为事实的文件名";
  withUnknownKeys.debug = { ignored: true };
  const unknownCanonical = withUnknownKeys.canonical as Record<string, unknown>;
  unknownCanonical.unrecognizedOptionalFact = "discard me";
  (unknownCanonical.publication as Record<string, unknown>).unrecognizedPublisherAlias = "discard me";
  (withUnknownKeys.fields as Array<Record<string, unknown>>)[0]!.pageClass = "model supplied but untrusted";
  (withUnknownKeys.classSupport as Array<Record<string, unknown>>)[0]!.rationale = "untrusted extra";
  const projected = await deriveIntelligentBibliography(source.inspection, reasonerFor(withUnknownKeys));
  assert.equal(projected.status, "auto_apply");
  assert.equal(projected.canonical?.canonicalTitle, "受控题名");
  assert.equal(Object.hasOwn(projected, "filename"), false);
  assert.equal(Object.hasOwn(projected.canonical as object, "unrecognizedOptionalFact"), false);
  assert.equal(Object.hasOwn(projected.canonical!.publication, "unrecognizedPublisherAlias"), false);
  assert.ok(projected.fields.every((field) => String(field.pageClass) !== "model supplied but untrusted"));

  const wrongKnownType = clone();
  ((wrongKnownType.canonical as Record<string, unknown>).publication as Record<string, unknown>).publisher = 42;
  await assert.rejects(
    deriveIntelligentBibliography(source.inspection, reasonerFor(wrongKnownType)),
    (error: unknown) => error instanceof BibliographicIntelligenceError
      && error.diagnostic === "canonical_schema_invalid",
  );

  const wrongTopLevelType = clone();
  wrongTopLevelType.status = 42;
  await assert.rejects(
    deriveIntelligentBibliography(source.inspection, reasonerFor(wrongTopLevelType)),
    (error: unknown) => error instanceof BibliographicIntelligenceError
      && error.diagnostic === "result_schema_invalid",
  );

  const invalidKnownEnum = clone();
  ((invalidKnownEnum.canonical as Record<string, unknown>).carrierEdition as Record<string, unknown>).editionType = "校注本";
  await assert.rejects(
    deriveIntelligentBibliography(source.inspection, reasonerFor(invalidKnownEnum)),
    (error: unknown) => error instanceof BibliographicIntelligenceError
      && error.diagnostic === "canonical_schema_invalid",
  );

  const missingTitle = clone();
  delete (missingTitle.canonical as Record<string, unknown>).canonicalTitle;
  await assert.rejects(
    deriveIntelligentBibliography(source.inspection, reasonerFor(missingTitle)),
    (error: unknown) => error instanceof BibliographicIntelligenceError
      && error.diagnostic === "canonical_schema_invalid",
  );

  const invalidTitleEvidence = clone();
  invalidTitleEvidence.overallConfidence = 100;
  const titleEvidence = (invalidTitleEvidence.fields as Array<Record<string, unknown>>)
    .find((field) => field.fieldName === "canonicalTitle")!;
  titleEvidence.evidenceText = "embedded-or-filename replacement title";
  const inspectionWithReplacementMetadata = {
    ...source.inspection,
    embeddedMetadata: { title: "embedded-or-filename replacement title" },
  };
  await assert.rejects(
    deriveIntelligentBibliography(inspectionWithReplacementMetadata, reasonerFor(invalidTitleEvidence)),
    (error: unknown) => error instanceof BibliographicIntelligenceError
      && error.diagnostic === "field_evidence_invalid",
  );

  const malformedEvidence = clone();
  const malformedTitle = (malformedEvidence.fields as Array<Record<string, unknown>>)
    .find((field) => field.fieldName === "canonicalTitle")!;
  malformedTitle.confidence = "95";
  await assert.rejects(
    deriveIntelligentBibliography(source.inspection, reasonerFor(malformedEvidence)),
    (error: unknown) => error instanceof BibliographicIntelligenceError
      && error.diagnostic === "field_evidence_invalid",
  );

  const unsupportedOptionalFact = clone();
  ((unsupportedOptionalFact.canonical as Record<string, unknown>).publication as Record<string, unknown>).publisher = "无证据出版社";
  const pruned = await deriveIntelligentBibliography(source.inspection, reasonerFor(unsupportedOptionalFact));
  assert.equal(pruned.canonical?.publication.publisher, null);
  assert.ok(pruned.fields.every((field) => field.fieldName !== "publication.publisher"));

  const malformedClassSupport = clone();
  (malformedClassSupport.classSupport as Array<Record<string, unknown>>)[0]!.signal = 42;
  const unpromoted = await deriveIntelligentBibliography(source.inspection, reasonerFor(malformedClassSupport));
  assert.equal(unpromoted.canonical?.materialClass, "unknown");
  assert.equal(unpromoted.status, "ambiguous");
  assert.ok(unpromoted.warnings.includes("uncertain_material_class"));
});

test("empty model placeholders cannot become contributor or edition facts", async () => {
  const source = fixture({ ...emptyCanonical("边疆史研究"), contributors: [] });
  const model = source.model as Record<string, unknown>;
  model.canonical = {
    materialClass: "scholarly_monograph",
    canonicalTitle: "边疆史研究",
    contributors: [
      { label: "王明", role: "author", roleLabel: "" },
    ],
    publication: { publisher: "", place: "", publicationDate: "", editionNumber: "", printing: "" },
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
