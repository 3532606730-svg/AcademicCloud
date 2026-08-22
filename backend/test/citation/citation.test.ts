import assert from "node:assert/strict";
import { test } from "node:test";

import { CitationError, normalizeCitationRequest } from "../../src/citation/citation.js";

test("citation input preserves structured historical locators and rejects ambiguous shapes", () => {
  assert.deepEqual(normalizeCitationRequest({
    style: "lishi-yanjiu",
    locators: [
      { type: "page_range", value: "8a–9b" },
      { type: "juan", value: "五" },
      { type: "folio", value: "12", side: "verso" },
      { type: "archive_call_number", value: "甲-12" },
      { type: "custom", label: "函", value: "三" },
    ],
  }), {
    style: "lishi-yanjiu",
    locators: [
      { type: "page_range", value: "8a–9b" },
      { type: "juan", value: "五" },
      { type: "folio", value: "12", side: "verso" },
      { type: "archive_call_number", value: "甲-12" },
      { type: "custom", label: "函", value: "三" },
    ],
  });
  for (const invalid of [
    { style: "unknown", locators: [] },
    { style: "lishi-yanjiu", locators: [{ type: "page", value: "1", side: "recto" }] },
    { style: "lishi-yanjiu", locators: [{ type: "custom", value: "1" }] },
    { style: "lishi-yanjiu", locators: [{ type: "page", value: "1", label: "页" }] },
    { style: "lishi-yanjiu", locators: [{ type: "page", value: "bad\nvalue" }] },
  ]) {
    assert.throws(() => normalizeCitationRequest(invalid), CitationError);
  }
});
