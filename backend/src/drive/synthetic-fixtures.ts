import type { Folder } from "./folder.js";

/**
 * Durable identity of the single failed PROD-03C2 acceptance fixture retained
 * in production. The run id and exact root-folder name are frozen in
 * docs/deployment/l1-ux01-production-gate.md and the acceptance harness. This
 * is intentionally an exact identity, never a prefix or synthetic-name rule.
 */
export const LEGACY_PROD03C2_FIXTURE = Object.freeze({
  id: "production-e2e:e73af1945d52:root-folder",
  runId: "e73af1945d52",
  folderName: "prod03c2-e2e-e73af1945d52",
});

export function isLegacyProd03c2FixtureFolder(
  folder: Pick<Folder, "name" | "parentId"> | null | undefined,
): boolean {
  return folder?.parentId === null && folder.name === LEGACY_PROD03C2_FIXTURE.folderName;
}
