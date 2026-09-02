import type { CatalogSourceIdentity } from "@academiccloud/compute-contracts";

export interface CatalogInternalSourceExclusion {
  resourceId: string;
  sourceFingerprint: string;
  reason: "internal_test_fixture";
}

/**
 * Exact, source-bound identities for retained production acceptance fixtures.
 *
 * AcademicCloud did not historically persist a general internal-resource flag.
 * Until such a marker exists, this narrow registry is intentionally keyed by
 * both durable resource identity and the immutable content/revision fingerprint.
 * Filename patterns are never authority: a real user file with a similar name
 * remains eligible, and replacing bytes on one of these resource IDs requires a
 * new explicit review before the replacement can be excluded.
 */
export const CATALOG_INTERNAL_SOURCE_EXCLUSIONS: readonly CatalogInternalSourceExclusion[] = [
  {
    resourceId: "38e227dc-f641-47d4-9e8b-96781a5edad6",
    sourceFingerprint: "71rKMc-T8E111TssI9-mRiwkbJ4dd7Yfi3pFICzwDfI",
    reason: "internal_test_fixture",
  },
  {
    resourceId: "a1d77361-5f65-4161-ba3b-aa3f16a2c4c4",
    sourceFingerprint: "Y7VpgSjPyWGT4q7_ho8vfOvpu7cTNOEFjIo8rsfF0W4",
    reason: "internal_test_fixture",
  },
  {
    resourceId: "edf905ec-0d21-4f03-9787-52334975e298",
    sourceFingerprint: "6CPuJ0Z5vwOxobSqNBbfgBohxk190xMGdWiTVoSdjmI",
    reason: "internal_test_fixture",
  },
] as const;

export function findCatalogInternalSourceExclusion(
  resourceId: string,
  sourceIdentity: Pick<CatalogSourceIdentity, "sourceFingerprint">,
  exclusions: readonly CatalogInternalSourceExclusion[] = CATALOG_INTERNAL_SOURCE_EXCLUSIONS,
): CatalogInternalSourceExclusion | null {
  return exclusions.find((entry) => entry.resourceId === resourceId
    && entry.sourceFingerprint === sourceIdentity.sourceFingerprint) ?? null;
}
