import assert from "node:assert/strict";
import { test } from "node:test";

import { extractSuggestions } from "../../src/suggestions/extractor.js";
import type { OcrAdapter, OcrRecognition } from "../../src/suggestions/ocr.js";
import {
  inspectPdfFrontMatter,
  inspectPdfFrontMatterRange,
  PdfTextInspectionError,
} from "../../src/suggestions/pdf-text.js";
import type { SuggestionCandidate } from "../../src/suggestions/suggestion.js";
import {
  REALISTIC_FIXTURES,
  type OcrScriptEntry,
  type RealisticFixture,
} from "../fixtures/realistic-fixtures.js";

type ExtractedCandidate = Omit<SuggestionCandidate, "id">;

class ScriptedOcrAdapter implements OcrAdapter {
  readonly calls: number[] = [];

  constructor(private readonly script: Readonly<Record<number, OcrScriptEntry>> = {}) {}

  async recognizePage(input: { imageBytes: Uint8Array; pageIndex: number }): Promise<OcrRecognition> {
    this.calls.push(input.pageIndex);
    const entry = this.script[input.pageIndex];
    if (!entry) {
      return { status: "no_text", text: "", confidence: null, engine: "test-ocr" };
    }
    return { status: "recognized", text: entry.text, confidence: entry.confidence, engine: "test-ocr" };
  }
}

function titleCandidate(candidates: readonly ExtractedCandidate[]): ExtractedCandidate | undefined {
  return candidates.find((candidate) => candidate.fieldPath === "canonicalTitle");
}

function values(candidates: readonly ExtractedCandidate[], role: string): string[] {
  return candidates.filter((candidate) => candidate.authorityRole === role).map((candidate) => candidate.value);
}

async function inspectFixture(fixture: RealisticFixture, bytes: Uint8Array) {
  if (fixture.kind === "large-range") {
    const requests: Array<[number, number]> = [];
    const source = {
      length: bytes.byteLength,
      async read(begin: number, end: number): Promise<Uint8Array> {
        requests.push([begin, end]);
        return bytes.slice(begin, end);
      },
    };
    const inspection = await inspectPdfFrontMatterRange(source, new ScriptedOcrAdapter(fixture.ocrScript));
    return { inspection, requests };
  }
  const inspection = await inspectPdfFrontMatter(bytes, new ScriptedOcrAdapter(fixture.ocrScript));
  return { inspection, requests: null };
}

test("A–L realistic fixture corpus runs through the full bounded pipeline", async (context) => {
  for (const fixture of REALISTIC_FIXTURES) {
    await context.test(`${fixture.id} — ${fixture.label}`, async () => {
      const bytes = fixture.build();
      assert.ok(bytes.byteLength > 0, "fixture must produce non-empty bytes");

      if (fixture.expected.inspectionError) {
        const expectedCode = fixture.expected.inspectionError;
        if (fixture.kind === "large-range") {
          const source = {
            length: bytes.byteLength,
            async read(begin: number, end: number): Promise<Uint8Array> {
              return bytes.slice(begin, end);
            },
          };
          await assert.rejects(
            () => inspectPdfFrontMatterRange(source, new ScriptedOcrAdapter(fixture.ocrScript)),
            (error: unknown) => error instanceof PdfTextInspectionError && error.code === expectedCode,
          );
        } else {
          await assert.rejects(
            () => inspectPdfFrontMatter(bytes, new ScriptedOcrAdapter(fixture.ocrScript)),
            (error: unknown) => error instanceof PdfTextInspectionError && error.code === expectedCode,
          );
        }
        return;
      }

      const { inspection, requests } = await inspectFixture(fixture, bytes);
      if (fixture.kind === "large-range") {
        assert.ok((requests?.length ?? 0) >= (fixture.expected.minRangeRequests ?? 1), "range path made no bounded reads");
        const chunkLimit = fixture.expected.maxChunkBytes ?? 2 * 1024 * 1024;
        for (const [begin, end] of requests ?? []) {
          assert.ok(end > begin && end - begin <= chunkLimit, "range read exceeded the bounded chunk size");
        }
      }

      const result = extractSuggestions({
        pages: inspection.pages,
        embeddedMetadata: inspection.embeddedMetadata,
        filename: fixture.filename,
        hasUsableTextLayer: inspection.hasUsableTextLayer,
      });
      assert.equal(result.status, fixture.expected.status, "unexpected suggestion status");

      const title = titleCandidate(result.candidates)?.value ?? null;
      assert.equal(title, fixture.expected.title ?? null, "canonicalTitle mismatch");
      if (fixture.expected.titleSourceType) {
        assert.equal(titleCandidate(result.candidates)?.sourceType, fixture.expected.titleSourceType);
      }
      if (fixture.expected.filenameConfidence) {
        assert.equal(titleCandidate(result.candidates)?.confidence, fixture.expected.filenameConfidence);
      }
      if (fixture.expected.authors) {
        assert.deepEqual(values(result.candidates, "author"), fixture.expected.authors);
      }
      if (fixture.expected.editors) {
        assert.deepEqual(values(result.candidates, "editor"), fixture.expected.editors);
      }
      if (fixture.expected.translators) {
        assert.deepEqual(values(result.candidates, "translator"), fixture.expected.translators);
      }
      if (fixture.expected.publisher !== undefined) {
        assert.equal(result.candidates.find((candidate) => candidate.authorityRole === "publisher")?.value ?? null, fixture.expected.publisher);
      }
      if (fixture.expected.publicationPlace !== undefined) {
        assert.equal(result.candidates.find((candidate) => candidate.authorityRole === "publication_place")?.value ?? null, fixture.expected.publicationPlace);
      }
      if (fixture.expected.dateStatement !== undefined) {
        assert.equal(result.candidates.find((candidate) => candidate.fieldPath === "dateStatement")?.value ?? null, fixture.expected.dateStatement);
      }
      if (fixture.expected.identifiers) {
        assert.deepEqual(
          result.candidates.filter((candidate) => candidate.fieldPath === "identifier").map((candidate) => candidate.value),
          fixture.expected.identifiers,
        );
      }
      if (fixture.expected.editionStatement !== undefined) {
        assert.equal(result.candidates.find((candidate) => candidate.typeFieldName === "editionStatement")?.value ?? null, fixture.expected.editionStatement);
      }
    });
  }
});
