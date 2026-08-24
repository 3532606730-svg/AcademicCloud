import type {
  Library,
  LibraryHolding,
  LibraryHoldingSort,
  LibraryMembership,
  LibraryRecycledHolding,
  LibraryRole,
  NewLibrary,
  NewLibraryMembership,
} from "./library.js";
import type { HoldingCursor } from "./search.js";
import type { StoredFileState } from "../drive/file.js";
import type { ScholarlyAttachmentState } from "../research/record.js";

export interface LibraryRepository {
  create(library: NewLibrary): Library;
  findById(id: string): Library | null;
  findDefault(): Library | null;
  listForAccount(accountId: string): Array<{ library: Library; membership: LibraryMembership }>;
  createMembership(membership: NewLibraryMembership): LibraryMembership;
  findMembership(libraryId: string, accountId: string): LibraryMembership | null;
  listMemberships(libraryId: string): LibraryMembership[];
  updateMembershipRole(libraryId: string, accountId: string, expectedRole: LibraryRole, role: LibraryRole, updatedAt: Date): LibraryMembership | null;
  deleteMembership(libraryId: string, accountId: string): boolean;
  listHoldings(libraryId: string, limit: number): LibraryHolding[];
  /** Keyset-paginated holdings after `after` (null = first page), newest first. */
  listHoldingsPage(libraryId: string, after: HoldingCursor | null, limit: number): LibraryHolding[];
  /**
   * Keyset-paginated holdings under a deterministic server-side sort. `after`
   * carries the sort's own comparison fields: primary (ISO timestamp for
   * newest/oldest, pinyin sort key for titles, size for size sorts), secondary
   * tie-break, and the stable file identity for title/size sorts.
   */
  listHoldingsSorted(
    libraryId: string,
    sort: LibraryHoldingSort,
    after: { primary: string; secondary: string; fileId: string } | null,
    limit: number,
  ): LibraryHolding[];
  findHoldingByFile(libraryId: string, fileId: string): LibraryHolding | null;
  countActiveHoldingsByFileIds(libraryId: string, fileIds: string[]): number;
  /** True when an available (pending/active) root file in the library domain already carries this name. */
  hasAvailableNameConflict(libraryId: string, displayName: string): boolean;
  listRecycledHoldings(libraryId: string): LibraryRecycledHolding[];
  findRecycledHoldingByFile(libraryId: string, fileId: string): LibraryRecycledHolding | null;
  verifyRecycledHoldingExclusive(
    libraryId: string,
    groupId: string,
    recordId: string,
    artifactId: string,
    versionId: string,
    fileId: string,
    fileState: Extract<StoredFileState, "deleted" | "purging">,
    attachmentState: ScholarlyAttachmentState,
  ): boolean;
}
