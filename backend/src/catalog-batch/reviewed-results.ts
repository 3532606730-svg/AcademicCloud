import { createHash } from "node:crypto";

import { canonicalCatalogJson } from "@academiccloud/compute-contracts";

import { isValidIsbn } from "../bibliography/bibliography.js";
import { parseCatalogResultsDocument } from "./contracts.js";
import { findCatalogInternalSourceExclusion } from "./internal-resource-exclusions.js";

export interface CorrectedCatalogResultsReport {
  inputResults: number;
  fixturesExcluded: string[];
  invalidIdentifiersRemoved: number;
  dispositions: Record<"AUTO" | "REVIEW" | "UNKNOWN", number>;
}

function sha256(value: string): string {
  return createHash("sha256").update(value, "utf8").digest("hex");
}

function record(value: unknown): Record<string, unknown> {
  if (typeof value !== "object" || value === null || Array.isArray(value)) throw new TypeError("invalid catalog results document");
  return value as Record<string, unknown>;
}

/**
 * Creates a new, independently serializable review document. The supplied
 * document is never mutated and its batch/source identities remain exact.
 */
export function correctReviewedCatalogResults(value: unknown): {
  document: Record<string, unknown>;
  report: CorrectedCatalogResultsReport;
} {
  const parsed = parseCatalogResultsDocument(value);
  if (sha256(canonicalCatalogJson(parsed.sourceManifest)) !== parsed.sourceManifestSha256) {
    throw new TypeError("catalog source manifest digest mismatch");
  }
  const document = structuredClone(record(value));
  const rawResults = document.results;
  if (!Array.isArray(rawResults)) throw new TypeError("invalid catalog results document");
  const rawByResource = new Map(rawResults.map((entry) => {
    const result = record(entry);
    return [result.resourceId, result] as const;
  }));
  const fixturesExcluded: string[] = [];
  let invalidIdentifiersRemoved = 0;

  for (const result of parsed.results) {
    const raw = rawByResource.get(result.resourceId);
    if (!raw) throw new TypeError("catalog result identity mismatch");
    if (findCatalogInternalSourceExclusion(result.resourceId, result.sourceIdentity)) {
      raw.disposition = "unknown";
      raw.bibliographic = null;
      raw.confidence = 0;
      fixturesExcluded.push(result.resourceId);
      continue;
    }
    if (!result.bibliographic || result.bibliographic.importWarnings.length === 0) continue;
    const rawBibliographic = record(raw.bibliographic);
    const identifiers = rawBibliographic.identifiers;
    if (!Array.isArray(identifiers)) throw new TypeError("invalid catalog identifiers");
    rawBibliographic.identifiers = identifiers.filter((entry) => {
      const identifier = record(entry);
      const invalid = identifier.scheme === "isbn"
        && typeof identifier.value === "string"
        && !isValidIsbn(identifier.value);
      if (invalid) invalidIdentifiersRemoved += 1;
      return !invalid;
    });
  }

  const corrected = parseCatalogResultsDocument(document);
  if (corrected.batchId !== parsed.batchId
    || corrected.sourceManifestSha256 !== parsed.sourceManifestSha256
    || canonicalCatalogJson(corrected.sourceManifest) !== canonicalCatalogJson(parsed.sourceManifest)) {
    throw new TypeError("catalog source identity changed during correction");
  }
  const dispositions = { AUTO: 0, REVIEW: 0, UNKNOWN: 0 };
  for (const result of corrected.results) dispositions[result.disposition.toUpperCase() as keyof typeof dispositions] += 1;
  return {
    document,
    report: {
      inputResults: parsed.results.length,
      fixturesExcluded: fixturesExcluded.sort((left, right) => left.localeCompare(right, "en")),
      invalidIdentifiersRemoved,
      dispositions,
    },
  };
}
