import type { StoredFile } from "../drive/file.js";

/** ADR-047: diagnosed damaged bytes, not filename or revision heuristics. */
export const RECOVERY_SOURCE_EXCLUSIONS = [
  { resourceId: "04b21cf5-736e-45ed-acfa-e954caf46e58", sizeBytes: 9666560, checksumAlgorithm: "md5", checksum: "qQpSsPFYkJuVFEjdvY78gA==" },
  { resourceId: "2e3916d2-8c9c-4d66-98e1-aed2999aede8", sizeBytes: 9797632, checksumAlgorithm: "md5", checksum: "CFf+HjdnNGmOiJWOmwnVGw==" },
  { resourceId: "3af74979-6a97-463c-a599-7984db02d8ea", sizeBytes: 10780672, checksumAlgorithm: "md5", checksum: "CdNi3KZZRXUKLKA0kICu0w==" },
  { resourceId: "841aa79e-4228-4470-abd1-ad0187c5c489", sizeBytes: 11042816, checksumAlgorithm: "md5", checksum: "zDfqYefSQGeJihhBUI+0qw==" },
  { resourceId: "84556d9b-96ba-4418-a61e-e3c29307801a", sizeBytes: 7471104, checksumAlgorithm: "md5", checksum: "t0ofx/7jVQrI0OiD0HfVXg==" },
  { resourceId: "bfed1bec-3aa2-42c6-a64d-8d1972ea090b", sizeBytes: 9633792, checksumAlgorithm: "md5", checksum: "/aQkWn60CdT72zcGl6qkWg==" },
] as const;

export function requiresRecoverySourceReplacement(file: Pick<StoredFile, "id" | "sizeBytes" | "checksumAlgorithm" | "checksum">): boolean {
  return RECOVERY_SOURCE_EXCLUSIONS.some((source) => source.resourceId === file.id
    && source.sizeBytes === file.sizeBytes && source.checksumAlgorithm === file.checksumAlgorithm
    && source.checksum === file.checksum);
}
