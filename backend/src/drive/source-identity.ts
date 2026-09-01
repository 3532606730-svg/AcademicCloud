import { createHash } from "node:crypto";

import type { CatalogSourceIdentity } from "@academiccloud/compute-contracts";

import type { StoredFile } from "./file.js";

/** Existing immutable source identity used by bibliography generation. */
export function catalogSourceIdentity(file: StoredFile): CatalogSourceIdentity {
  return {
    sourceFingerprint: createHash("sha256")
      .update(JSON.stringify([
        "rf-metasuggest-source-v1",
        file.id,
        file.revision,
        file.checksumAlgorithm,
        file.checksum,
      ]))
      .digest("base64url"),
    fileRevision: file.revision,
    checksumAlgorithm: file.checksumAlgorithm,
    checksum: file.checksum,
  };
}

export function sameCatalogSourceIdentity(left: CatalogSourceIdentity, right: CatalogSourceIdentity): boolean {
  return left.sourceFingerprint === right.sourceFingerprint
    && left.fileRevision === right.fileRevision
    && left.checksumAlgorithm === right.checksumAlgorithm
    && left.checksum === right.checksum;
}

export function sameStoredContent(left: StoredFile, right: StoredFile): boolean {
  return left.sizeBytes !== null
    && left.sizeBytes === right.sizeBytes
    && left.checksumAlgorithm !== null
    && left.checksumAlgorithm === right.checksumAlgorithm
    && left.checksum !== null
    && left.checksum === right.checksum;
}
