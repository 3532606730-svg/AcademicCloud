import assert from "node:assert/strict";
import { test } from "node:test";

import {
  CONTRIBUTOR_ROLES,
  MATERIAL_CLASSES,
  BibliographyValidationError,
  changedBibliographicFields,
  isValidIsbn,
  normalizeBibliographicProfileInput,
} from "../../src/bibliography/bibliography.js";

test("the Layer-1 taxonomy and contributor roles are one fixed validated contract", () => {
  assert.deepEqual(MATERIAL_CLASSES, [
    "scholarly_monograph", "edited_volume", "journal_article", "book_chapter",
    "thesis_dissertation", "conference_paper", "review", "reference_work",
    "dictionary_lexicon", "primary_source_modern_edition", "traditional_book",
    "archival_document", "inscription_epigraphy", "rubbing", "manuscript",
    "collected_documents", "catalogue_bibliography", "other", "unknown",
  ]);
  assert.deepEqual(CONTRIBUTOR_ROLES, [
    "author", "editor", "compiler", "translator", "annotator", "collator",
    "punctuator", "commentator", "reviser", "selector", "organizer", "other",
  ]);
  const normalized = normalizeBibliographicProfileInput({
    materialClass: "primary_source_modern_edition",
    contributors: [{ label: "陈垣", role: "collator", roleLabel: "点校" }],
    publication: { publisher: "中华书局", publicationDate: "1976" },
    series: "二十四史",
    volume: "第一册",
    language: "中文",
    carrierEdition: { editionType: "punctuated_edition", editionStatement: "1976年点校本" },
    sourceEdition: { dynasty: "明", reignTitle: "万历", reignYear: "二十四年", editionType: "recut" },
  });
  assert.equal(normalized.materialClass, "primary_source_modern_edition");
  assert.deepEqual(normalized.contributors[0], { label: "陈垣", role: "collator", roleLabel: "点校" });
  assert.throws(
    () => normalizeBibliographicProfileInput({ ...normalized, materialClass: "book" }),
    (error) => error instanceof BibliographyValidationError && error.code === "invalid_input",
  );
  assert.throws(
    () => normalizeBibliographicProfileInput({ ...normalized, contributors: [{ label: "某人", role: "主编" }] }),
    (error) => error instanceof BibliographyValidationError && error.code === "invalid_input",
  );
});

test("field authority diffs mark only populated or deliberately changed fields", () => {
  const initial = normalizeBibliographicProfileInput({
    materialClass: "traditional_book", contributors: [], publication: {}, carrierEdition: {}, sourceEdition: {},
  });
  assert.deepEqual(changedBibliographicFields(null, initial), [{ fieldName: "materialClass", scopeKey: "" }]);
  const next = { ...initial, publication: { publisher: "国家图书馆出版社" } };
  assert.deepEqual(changedBibliographicFields(initial, next), [{ fieldName: "publication.publisher", scopeKey: "" }]);
});

test("ISBN validation accepts real checksums and rejects merely plausible digit strings", () => {
  assert.equal(isValidIsbn("978-7-101-00304-8"), true);
  assert.equal(isValidIsbn("7-101-00304-4"), true);
  assert.equal(isValidIsbn("978-7-101-00304-7"), false);
  assert.equal(isValidIsbn("not-an-isbn"), false);
});
