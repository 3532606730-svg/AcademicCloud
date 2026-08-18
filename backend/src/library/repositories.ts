import type {
  Library,
  LibraryHolding,
  LibraryMembership,
  LibraryRecycledHolding,
  LibraryRole,
  NewLibrary,
  NewLibraryMembership,
} from "./library.js";

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
  findHoldingByFile(libraryId: string, fileId: string): LibraryHolding | null;
  listRecycledHoldings(libraryId: string): LibraryRecycledHolding[];
  findRecycledHoldingByFile(libraryId: string, fileId: string): LibraryRecycledHolding | null;
}
