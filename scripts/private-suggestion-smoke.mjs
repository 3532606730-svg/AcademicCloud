#!/usr/bin/env node
// No-persistence pre-cutover suggestion smoke harness.
//
// Reads at most five Owner-authorized PDF objects through the EXACT staged
// release's compiled suggestion pipeline and reports only anonymized metrics:
//   metadata_mutated=false  crash=false  raw_error=false
// plus per-object size/status/candidate counts. It never opens SQLite, never
// persists a suggestion run, never accepts a candidate, never mutates canonical
// metadata, and never emits titles, author labels, excerpts, object keys, or
// provider diagnostics.
//
// Run on the production host through the approved academiccloud_op runner:
//
//   ACADEMICCLOUD_RELEASE_ROOT="$(readlink -f /opt/academiccloud/current)" \
//   academiccloud_op /usr/bin/node \
//     /var/lib/academiccloud/private-suggestion-smoke.mjs \
//     <objectKey-1> ... <objectKey-5>
import { join } from "node:path";
import { pathToFileURL } from "node:url";

const releaseRoot = process.env.ACADEMICCLOUD_RELEASE_ROOT?.trim();
if (!releaseRoot) {
  throw new Error("ACADEMICCLOUD_RELEASE_ROOT is required");
}

const distUrl = (relative) => pathToFileURL(join(releaseRoot, "backend", "dist", ...relative.split("/"))).href;

const [{ loadStorageAdapter }, { PdfJsFrontMatterInspector, PdfTextInspectionError }, { extractBibliographicSuggestions }, { SUGGESTION_LIMITS }, { StorageObjectContentUnavailableError, StorageObjectReadLimitError }] =
  await Promise.all([
    import(distUrl("storage/config.js")),
    import(distUrl("suggestions/pdf-text.js")),
    import(distUrl("suggestions/extractor.js")),
    import(distUrl("suggestions/suggestion.js")),
    import(distUrl("storage/storage-adapter.js")),
  ]);

const keys = process.argv.slice(2);
if (keys.length < 1 || keys.length > 5) {
  throw new Error("pass between 1 and 5 object keys");
}

function sanitizeCode(error) {
  if (error instanceof PdfTextInspectionError) return error.code;
  if (error instanceof StorageObjectReadLimitError) return "storage_object_read_limit";
  if (error instanceof StorageObjectContentUnavailableError) return "storage_object_content_unavailable";
  if (typeof error === "object" && error !== null && "code" in error && typeof error.code === "string" && /^[a-z][a-z0-9_]{0,63}$/u.test(error.code)) {
    return error.code;
  }
  return "unexpected";
}

const storage = loadStorageAdapter(process.env, "production");
const inspector = new PdfJsFrontMatterInspector();
const results = [];

for (let index = 0; index < keys.length; index += 1) {
  const objectKey = keys[index];
  const realId = `REAL-${String(index + 1).padStart(2, "0")}`;
  try {
    const metadata = await storage.statObject(objectKey);
    if (!metadata) {
      results.push({ realId, status: "missing" });
      continue;
    }
    const source = {
      length: metadata.sizeBytes,
      read: async (begin, end) => {
        const range = await storage.readObjectRange(objectKey, begin, end);
        if (!range || range.end < end) throw new StorageObjectContentUnavailableError(objectKey);
        return range.bytes;
      },
    };
    const inspection = await inspector.inspectRange(source, SUGGESTION_LIMITS);
    const extracted = extractBibliographicSuggestions({
      pages: inspection.pages,
      embeddedMetadata: inspection.embeddedMetadata,
      filename: "REAL.pdf",
      hasUsableTextLayer: inspection.hasUsableTextLayer,
    });
    results.push({
      realId,
      status: "ok",
      sizeBytes: metadata.sizeBytes,
      suggestionStatus: extracted.status,
      candidateCount: extracted.candidates.length,
      complete: inspection.complete,
      hasUsableTextLayer: inspection.hasUsableTextLayer,
      nativePageCount: inspection.nativePageCount ?? 0,
      ocrPageCount: inspection.ocrPageCount ?? 0,
    });
  } catch (error) {
    results.push({ realId, status: "error", errorCode: sanitizeCode(error) });
  }
}

process.stdout.write(`${JSON.stringify({ metadata_mutated: false, crash: false, raw_error: false, results }, null, 2)}\n`);
