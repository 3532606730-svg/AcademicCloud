import { randomUUID } from "node:crypto";

import type { AuthenticatedAccount } from "../auth/auth-service.js";
import { AuthorizationDeniedError, requireOwner } from "../auth/authorization.js";
import { DriveError, type DriveService, type UploadStatus } from "../drive/drive-service.js";
import { driveEntryVersion } from "../drive/bulk.js";
import type { StoredFile } from "../drive/file.js";
import type { DomainRecycleGroup } from "../drive/recycle-repository.js";
import type { Persistence, RepositorySet } from "../persistence/contracts.js";
import { recordAuditEvent, tryRecordAuditAttempt } from "../audit/audit-service.js";
import type { AuditEventKind, AuditReasonCode } from "../audit/audit-event.js";
import type {
  Library,
  LibraryHolding,
  LibraryMembership,
  LibraryRecycledHolding,
  LibraryRole,
} from "./library.js";
import { libraryHoldingView, type LibraryHoldingView } from "./holding-view.js";
import {
  searchHoldings,
  SEARCH_MAX_CORPUS_SCAN,
  type LibrarySearchPage,
  type SearchableAuthority,
  type SearchableHolding,
} from "./search.js";
import type { ContributionCandidate, ContributionState, LibraryContribution } from "./contribution.js";

export type LibraryErrorCode =
  | "not_found"
  | "authorization_denied"
  | "invalid_input"
  | "invalid_state"
  | "conflict"
  | "concurrent_change";

export class LibraryError extends Error {
  constructor(readonly code: LibraryErrorCode, options?: ErrorOptions) {
    super(code, options);
    this.name = "LibraryError";
  }
}

export interface LibrarySummary {
  id: string;
  name: string;
  role: LibraryRole;
  isDefault: boolean;
  createdAt: string;
}

export interface LibraryMemberView {
  accountId: string;
  loginName: string | null;
  role: LibraryRole;
  state: "active" | "disabled" | "archived" | "missing";
  createdAt: string;
  updatedAt: string;
}

export interface LibraryRecycleFileView {
  version: string;
  canonicalTitle: string | null;
  file: {
    id: string;
    displayName: string;
    mediaType: string | null;
    sizeBytes: number;
    deletedAt: string;
  };
}

export interface ContributionView {
  id: string;
  libraryId: string;
  artifactId: string;
  state: ContributionState;
  revision: number;
  recordId: string;
  recordLabel: string;
  submitterLoginName: string | null;
  file: {
    id: string;
    displayName: string;
    mediaType: string | null;
    sizeBytes: number;
    state: "active" | "deleted" | "purging" | "purged" | "pending_upload";
  };
  submittedAt: string;
  reviewedAt: string | null;
}

function normalizeName(value: string): string {
  const normalized = value.normalize("NFC").trim();
  if (!normalized || normalized.length > 255 || /[\x00-\x1f\x7f]/.test(normalized)) {
    throw new LibraryError("invalid_input");
  }
  return normalized;
}

function mapRecycleFile(holding: LibraryRecycledHolding, file: StoredFile): LibraryRecycleFileView {
  return {
    version: driveEntryVersion(file),
    canonicalTitle: holding.canonicalTitle,
    file: {
      id: holding.file.id,
      displayName: holding.file.displayName,
      mediaType: holding.file.mediaType,
      sizeBytes: holding.file.sizeBytes,
      deletedAt: holding.file.deletedAt.toISOString(),
    },
  };
}

function assertOpaqueVersion(value: string): void {
  if (!/^[A-Za-z0-9_-]{43}$/.test(value)) throw new LibraryError("invalid_input");
}

function reasonFor(error: unknown): AuditReasonCode {
  if (error instanceof AuthorizationDeniedError) return "authorization_denied";
  if (error instanceof DriveError) {
    switch (error.code) {
      case "not_found": return "not_found";
      case "name_conflict": return "name_conflict";
      case "concurrent_change": return "concurrent_change";
      case "invalid_state": return "invalid_state";
      case "upload_incomplete": return "upload_incomplete";
      case "upload_metadata_mismatch": return "upload_metadata_mismatch";
      case "storage_unavailable": return "storage_unavailable";
      default: return "invalid_input";
    }
  }
  if (error instanceof LibraryError) {
    switch (error.code) {
      case "not_found": return "not_found";
      case "authorization_denied": return "authorization_denied";
      case "invalid_input": return "invalid_input";
      case "invalid_state": return "invalid_state";
      case "conflict": return "concurrent_change";
      case "concurrent_change": return "concurrent_change";
    }
  }
  if (error instanceof TypeError || error instanceof RangeError) return "invalid_input";
  return "storage_unavailable";
}

export class LibraryService {
  readonly #persistence: Persistence;
  readonly #drive: DriveService;
  readonly #now: () => Date;
  readonly #createId: () => string;

  constructor(
    persistence: Persistence,
    drive: DriveService,
    now: () => Date = () => new Date(),
    createId: () => string = randomUUID,
  ) {
    this.#persistence = persistence;
    this.#drive = drive;
    this.#now = now;
    this.#createId = createId;
  }

  recordAuditAttempt(
    actor: AuthenticatedAccount,
    action: Extract<AuditEventKind, "libraries.membership_add" | "libraries.membership_change" | "libraries.membership_remove">,
    error: unknown,
  ): boolean {
    const reason = reasonFor(error);
    return tryRecordAuditAttempt(this.#persistence, {
      action,
      actorKind: "account",
      actorAccountId: actor.id,
      targetId: null,
      outcome: reason === "storage_unavailable" ? "failed" : "denied",
      reason,
      occurredAt: this.#now(),
    });
  }

  recordContributionAuditAttempt(
    actor: AuthenticatedAccount,
    action: Extract<AuditEventKind, "libraries.contribution_submit" | "libraries.contribution_approve" | "libraries.contribution_reject" | "libraries.contribution_withdraw">,
    error: unknown,
  ): boolean {
    const reason = reasonFor(error);
    return tryRecordAuditAttempt(this.#persistence, {
      action,
      actorKind: "account",
      actorAccountId: actor.id,
      targetId: null,
      outcome: reason === "storage_unavailable" ? "failed" : "denied",
      reason,
      occurredAt: this.#now(),
    });
  }

  recordHoldingRecycleAuditAttempt(actor: AuthenticatedAccount, error: unknown): boolean {
    const reason = reasonFor(error);
    return tryRecordAuditAttempt(this.#persistence, {
      action: "drive.file_recycle",
      actorKind: "account",
      actorAccountId: actor.id,
      targetId: null,
      outcome: reason === "storage_unavailable" ? "failed" : "denied",
      reason,
      occurredAt: this.#now(),
    });
  }

  recordHoldingRestoreAuditAttempt(actor: AuthenticatedAccount, error: unknown): boolean {
    const reason = reasonFor(error);
    return tryRecordAuditAttempt(this.#persistence, {
      action: "drive.file_restore",
      actorKind: "account",
      actorAccountId: actor.id,
      targetId: null,
      outcome: reason === "storage_unavailable" ? "failed" : "denied",
      reason,
      occurredAt: this.#now(),
    });
  }

  recordHoldingPurgeAuditAttempt(actor: AuthenticatedAccount, error: unknown): boolean {
    const reason = reasonFor(error);
    return tryRecordAuditAttempt(this.#persistence, {
      action: "drive.file_purge_request",
      actorKind: "account",
      actorAccountId: actor.id,
      targetId: null,
      outcome: reason === "storage_unavailable" ? "failed" : "denied",
      reason,
      occurredAt: this.#now(),
    });
  }

  createLibrary(actor: AuthenticatedAccount, nameValue: string): LibrarySummary {
    const name = normalizeName(nameValue);
    return this.#persistence.runInTransaction((repositories) => {
      this.#requireActiveActor(actor, repositories);
      const now = this.#now();
      const id = this.#createId();
      const library = repositories.libraries.create({
        id,
        ownerDomainId: `library:${id}`,
        name,
        isDefault: false,
        createdByAccountId: actor.id,
        createdAt: now,
        updatedAt: now,
      });
      const membership = repositories.libraries.createMembership({
        libraryId: library.id,
        accountId: actor.id,
        role: "manager",
        createdAt: now,
        updatedAt: now,
      });
      recordAuditEvent(repositories, {
        action: "libraries.create",
        actorKind: "account",
        actorAccountId: actor.id,
        targetId: library.id,
        outcome: "succeeded",
        reason: null,
        occurredAt: now,
      });
      return this.#summary(library, membership.role);
    });
  }

  listLibraries(accountId: string): LibrarySummary[] {
    const repositories = this.#persistence.repositories;
    const account = repositories.accounts.findById(accountId);
    if (!account || account.state !== "active") return [];
    return repositories.libraries.listForAccount(accountId)
      .filter(({ library }) => library.isDefault)
      .filter(({ membership }) => this.#isEffectiveMembership(repositories, membership))
      .map(({ library, membership }) => this.#summary(library, membership.role));
  }

  async completeDefaultUpload(actor: AuthenticatedAccount, fileId: string): Promise<StoredFile> {
    const repositories = this.#persistence.repositories;
    const canonical = repositories.libraries.findDefault();
    const current = repositories.accounts.findById(actor.id);
    if (!canonical || !current || current.state !== "active" || current.role !== actor.role) {
      throw new DriveError("not_found");
    }

    // Approval moves the file out of the contributor's account domain. Keep
    // upload completion idempotent without turning a guessed shared file ID
    // into an enumeration oracle.
    const existingHolding = repositories.libraries.findHoldingByFile(canonical.id, fileId);
    if (existingHolding?.file.uploadedByAccountId === actor.id) {
      const shared = repositories.files.findByDomainId(canonical.ownerDomainId, fileId);
      if (shared?.state === "active") return shared;
    }

    try {
      return await this.#drive.completeUpload(actor.id, fileId, "account", (transaction, activated, now) => {
        this.#intakeActivatedFile(transaction, actor, canonical.id, activated, now);
      });
    } catch (error: unknown) {
      if (error instanceof DriveError) throw error;
      if (error instanceof LibraryError) {
        throw new DriveError(error.code === "not_found" || error.code === "authorization_denied" ? "not_found" : "invalid_state", { cause: error });
      }
      if (this.#isConstraint(error)) throw new DriveError("invalid_state", { cause: error });
      throw error;
    }
  }

  async getDefaultUploadStatus(actor: AuthenticatedAccount, fileId: string): Promise<UploadStatus> {
    const canonical = this.#requireDefaultUploadActor(actor, fileId);
    const existing = this.#completedDefaultUpload(actor, canonical, fileId);
    if (existing) return { kind: "complete", file: existing };
    return this.#drive.getUploadStatus(actor.id, fileId, "account", (transaction, activated, now) => {
      this.#intakeActivatedFile(transaction, actor, canonical.id, activated, now);
    });
  }

  async completeDefaultMultipartUpload(
    actor: AuthenticatedAccount,
    fileId: string,
    version: string,
  ): Promise<StoredFile> {
    const canonical = this.#requireDefaultUploadActor(actor, fileId);
    const existing = this.#completedDefaultUpload(actor, canonical, fileId);
    if (existing) return existing;
    try {
      return await this.#drive.completeMultipartUpload(
        actor.id,
        fileId,
        version,
        "account",
        (transaction, activated, now) => {
          this.#intakeActivatedFile(transaction, actor, canonical.id, activated, now);
        },
      );
    } catch (error: unknown) {
      if (error instanceof DriveError) throw error;
      if (error instanceof LibraryError) {
        throw new DriveError(error.code === "not_found" || error.code === "authorization_denied" ? "not_found" : "invalid_state", { cause: error });
      }
      if (this.#isConstraint(error)) throw new DriveError("invalid_state", { cause: error });
      throw error;
    }
  }

  #requireDefaultUploadActor(actor: AuthenticatedAccount, fileId: string): Library {
    const repositories = this.#persistence.repositories;
    const canonical = repositories.libraries.findDefault();
    const current = repositories.accounts.findById(actor.id);
    if (!canonical || !current || current.state !== "active" || current.role !== actor.role) {
      throw new DriveError("not_found");
    }
    return canonical;
  }

  #completedDefaultUpload(actor: AuthenticatedAccount, canonical: Library, fileId: string): StoredFile | null {
    const repositories = this.#persistence.repositories;
    const existingHolding = repositories.libraries.findHoldingByFile(canonical.id, fileId);
    if (existingHolding?.file.uploadedByAccountId !== actor.id) return null;
    const shared = repositories.files.findByDomainId(canonical.ownerDomainId, fileId);
    return shared?.state === "active" ? shared : null;
  }

  listMembers(actor: AuthenticatedAccount, libraryId: string): LibraryMemberView[] {
    const repositories = this.#persistence.repositories;
    this.#requireManager(actor.id, libraryId, repositories);
    return repositories.libraries.listMemberships(libraryId).map((membership) => {
      const account = repositories.accounts.findById(membership.accountId);
      return {
        accountId: membership.accountId,
        loginName: account?.loginName ?? null,
        role: membership.role,
        state: account?.state ?? "missing",
        createdAt: membership.createdAt.toISOString(),
        updatedAt: membership.updatedAt.toISOString(),
      };
    });
  }

  addMember(actor: AuthenticatedAccount, libraryId: string, accountId: string, role: LibraryRole): LibraryMemberView {
    return this.#persistence.runInTransaction((repositories) => {
      this.#requireManager(actor.id, libraryId, repositories);
      const account = repositories.accounts.findById(accountId);
      if (!account) throw new LibraryError("not_found");
      if (account.state !== "active") throw new LibraryError("invalid_state");
      if (repositories.libraries.findMembership(libraryId, accountId)) throw new LibraryError("conflict");
      const now = this.#now();
      try {
        repositories.libraries.createMembership({ libraryId, accountId, role, createdAt: now, updatedAt: now });
      } catch (error: unknown) {
        if (this.#isConstraint(error)) throw new LibraryError("conflict", { cause: error });
        throw error;
      }
      recordAuditEvent(repositories, {
        action: "libraries.membership_add",
        actorKind: "account",
        actorAccountId: actor.id,
        targetId: libraryId,
        outcome: "succeeded",
        reason: null,
        occurredAt: now,
      });
      return this.#memberView(repositories, libraryId, accountId)!;
    });
  }

  changeMemberRole(actor: AuthenticatedAccount, libraryId: string, accountId: string, role: LibraryRole): LibraryMemberView {
    return this.#persistence.runInTransaction((repositories) => {
      this.#requireManager(actor.id, libraryId, repositories);
      const current = repositories.libraries.findMembership(libraryId, accountId);
      if (!current) throw new LibraryError("not_found");
      if (current.role === role) return this.#memberView(repositories, libraryId, accountId)!;
      const now = this.#now();
      try {
        if (!repositories.libraries.updateMembershipRole(libraryId, accountId, current.role, role, now)) {
          throw new LibraryError("conflict");
        }
      } catch (error: unknown) {
        if (error instanceof LibraryError) throw error;
        if (this.#isConstraint(error)) throw new LibraryError("invalid_state", { cause: error });
        throw error;
      }
      recordAuditEvent(repositories, {
        action: "libraries.membership_change",
        actorKind: "account",
        actorAccountId: actor.id,
        targetId: libraryId,
        outcome: "succeeded",
        reason: null,
        occurredAt: now,
      });
      return this.#memberView(repositories, libraryId, accountId)!;
    });
  }

  removeMember(actor: AuthenticatedAccount, libraryId: string, accountId: string): void {
    this.#persistence.runInTransaction((repositories) => {
      this.#requireManager(actor.id, libraryId, repositories);
      const current = repositories.libraries.findMembership(libraryId, accountId);
      if (!current) throw new LibraryError("not_found");
      try {
        if (!repositories.libraries.deleteMembership(libraryId, accountId)) throw new LibraryError("conflict");
      } catch (error: unknown) {
        if (error instanceof LibraryError) throw error;
        if (this.#isConstraint(error)) throw new LibraryError("invalid_state", { cause: error });
        throw error;
      }
      recordAuditEvent(repositories, {
        action: "libraries.membership_remove",
        actorKind: "account",
        actorAccountId: actor.id,
        targetId: libraryId,
        outcome: "succeeded",
        reason: null,
        occurredAt: this.#now(),
      });
    });
  }

  listHoldings(accountId: string, libraryId: string, limit = 100): LibraryHoldingView[] {
    if (!Number.isInteger(limit) || limit < 1 || limit > 100) throw new LibraryError("invalid_input");
    const repositories = this.#persistence.repositories;
    this.#requireMember(accountId, libraryId, repositories);
    return repositories.libraries.listHoldings(libraryId, limit).map(libraryHoldingView);
  }

  searchHoldings(
    accountId: string,
    libraryId: string,
    rawQuery: string,
    limit: number,
    cursor: string | null,
  ): LibrarySearchPage {
    // Effective-authority filtering is the first step: a non-member, a
    // disabled account, or a guessed library id throws not_found before any
    // matching, counting, ranking, or pagination can observe the corpus.
    return this.#persistence.runInTransaction((repositories) => {
      const library = this.#requireMember(accountId, libraryId, repositories);
      const holdings = repositories.libraries.listHoldings(library.id, SEARCH_MAX_CORPUS_SCAN);
      const searchable = holdings.map((holding) => this.#searchableHolding(library.ownerDomainId, holding, repositories));
      return searchHoldings(searchable, rawQuery, limit, cursor);
    });
  }

  #searchableHolding(
    ownerDomainId: string,
    holding: LibraryHolding,
    repositories: RepositorySet,
  ): SearchableHolding {
    const metadata = repositories.metadata.findMetadata(ownerDomainId, holding.recordId);
    const authorities: SearchableAuthority[] = [];
    if (metadata) {
      for (const link of metadata.authorityLinks) {
        const authority = repositories.metadata.findAuthority(ownerDomainId, link.authorityId);
        if (!authority) continue;
        authorities.push({
          type: authority.type,
          role: link.role,
          label: authority.canonicalLabel,
          aliases: [...authority.aliases],
        });
      }
    }
    return {
      fileId: holding.file.id,
      displayName: holding.file.displayName,
      canonicalTitle: holding.canonicalTitle,
      metadata,
      authorLabels: [...holding.authorLabels],
      authorities,
    };
  }

  recycleHolding(actor: AuthenticatedAccount, libraryId: string, fileId: string, expectedVersion: string): void {
    this.#persistence.runInTransaction((repositories) => {
      const library = this.#requireManager(actor.id, libraryId, repositories);
      const holding = repositories.libraries.findHoldingByFile(library.id, fileId);
      if (!holding) throw new LibraryError("not_found");
      const file = repositories.files.findByDomainId(library.ownerDomainId, holding.file.id);
      if (!file || file.state !== "active") throw new LibraryError("not_found");
      assertOpaqueVersion(expectedVersion);
      if (driveEntryVersion(file) !== expectedVersion) throw new LibraryError("concurrent_change");

      const now = this.#now();
      const groupId = this.#createId();
      if (!repositories.recycle.createGroupForDomain({
        id: groupId,
        ownerDomainId: library.ownerDomainId,
        createdByAccountId: actor.id,
        rootKind: "file",
        rootId: file.id,
        folderCount: 0,
        fileCount: 1,
        createdAt: now,
      })) {
        throw new LibraryError("invalid_state");
      }
      if (!repositories.recycle.recycleFileForDomain(
        library.ownerDomainId,
        file.id,
        groupId,
        file.revision,
        now,
      )) {
        throw new LibraryError("concurrent_change");
      }
      recordAuditEvent(repositories, {
        action: "drive.file_recycle",
        actorKind: "account",
        actorAccountId: actor.id,
        targetId: file.id,
        outcome: "succeeded",
        reason: null,
        occurredAt: now,
      });
    });
  }

  listRecycle(actor: AuthenticatedAccount, libraryId: string): LibraryRecycleFileView[] {
    const repositories = this.#persistence.repositories;
    const library = this.#requireManager(actor.id, libraryId, repositories);
    return repositories.libraries.listRecycledHoldings(library.id).map((holding) => {
      const file = repositories.files.findByDomainId(library.ownerDomainId, holding.file.id);
      if (!file || file.state !== "deleted") throw new LibraryError("invalid_state");
      return mapRecycleFile(holding, file);
    });
  }

  async restoreHolding(
    actor: AuthenticatedAccount,
    libraryId: string,
    fileId: string,
    expectedVersion: string,
  ): Promise<void> {
    const repositories = this.#persistence.repositories;
    const library = this.#requireManager(actor.id, libraryId, repositories);
    const holding = repositories.libraries.findRecycledHoldingByFile(library.id, fileId);
    if (!holding) throw new LibraryError("not_found");
    const file = repositories.files.findByDomainId(library.ownerDomainId, holding.file.id);
    if (!file || file.state !== "deleted") throw new LibraryError("not_found");
    assertOpaqueVersion(expectedVersion);
    if (driveEntryVersion(file) !== expectedVersion) throw new LibraryError("concurrent_change");
    const group = this.#requireSingleFileRecycleGroup(repositories, library.ownerDomainId, file.id);

    await this.#drive.verifyAuthorizedFileForRestore(file);

    this.#persistence.runInTransaction((transaction) => {
      const currentLibrary = this.#requireManager(actor.id, libraryId, transaction);
      const currentHolding = transaction.libraries.findRecycledHoldingByFile(currentLibrary.id, fileId);
      if (!currentHolding) throw new LibraryError("not_found");
      const current = transaction.files.findByDomainId(currentLibrary.ownerDomainId, currentHolding.file.id);
      if (!current || current.state !== "deleted") throw new LibraryError("not_found");
      if (driveEntryVersion(current) !== expectedVersion) throw new LibraryError("concurrent_change");
      const currentGroup = this.#requireSingleFileRecycleGroup(
        transaction,
        currentLibrary.ownerDomainId,
        current.id,
      );
      if (currentGroup.id !== group.id) throw new LibraryError("concurrent_change");

      const now = this.#now();
      if (!transaction.recycle.restoreFileForDomain(
        currentLibrary.ownerDomainId,
        current.id,
        currentGroup.id,
        current.revision,
        now,
      )) {
        throw new LibraryError("concurrent_change");
      }
      if (!transaction.recycle.deleteGroupForDomain(currentLibrary.ownerDomainId, currentGroup.id)) {
        throw new LibraryError("invalid_state");
      }
      recordAuditEvent(transaction, {
        action: "drive.file_restore",
        actorKind: "account",
        actorAccountId: actor.id,
        targetId: current.id,
        outcome: "succeeded",
        reason: null,
        occurredAt: now,
      });
    });
  }

  async permanentlyDeleteHolding(
    actor: AuthenticatedAccount,
    libraryId: string,
    fileId: string,
    expectedVersion: string,
  ): Promise<void> {
    const owner = requireOwner(actor);
    assertOpaqueVersion(expectedVersion);
    const repositories = this.#persistence.repositories;
    const currentAccount = repositories.accounts.findById(owner.id);
    const library = repositories.libraries.findById(libraryId);
    if (!currentAccount || currentAccount.state !== "active" || currentAccount.role !== "owner" || !library) {
      throw new LibraryError("authorization_denied");
    }

    const holding = repositories.libraries.findRecycledHoldingByFile(library.id, fileId);
    const file = repositories.files.findByDomainId(library.ownerDomainId, fileId);
    if (!holding || !file || file.state !== "deleted") throw new LibraryError("not_found");
    if (driveEntryVersion(file) !== expectedVersion) throw new LibraryError("concurrent_change");
    const group = this.#requireSingleFileRecycleGroup(repositories, library.ownerDomainId, file.id);
    const research = repositories.research;
    if (!research || !repositories.libraries.verifyRecycledHoldingExclusive(
      library.id,
      group.id,
      holding.recordId,
      holding.artifactId,
      holding.versionId,
      file.id,
      "deleted",
      "attached",
    )) {
      throw new LibraryError("conflict");
    }

    try {
      await this.#drive.permanentlyDeleteFileForDomain(
        library.ownerDomainId,
        file.id,
        expectedVersion,
        owner.id,
        (transaction, current, now) => {
          const currentLibrary = transaction.libraries.findById(libraryId);
          if (!currentLibrary) throw new LibraryError("concurrent_change");
          const currentGroup = this.#requireSingleFileRecycleGroup(
            transaction,
            currentLibrary.ownerDomainId,
            file.id,
          );
          if (currentGroup.id !== group.id) throw new LibraryError("concurrent_change");

          if (current.state === "deleted") {
            if (
              driveEntryVersion(current) !== expectedVersion
              || !transaction.libraries.verifyRecycledHoldingExclusive(
                currentLibrary.id,
                currentGroup.id,
                holding.recordId,
                holding.artifactId,
                holding.versionId,
                current.id,
                "deleted",
                "attached",
              )
            ) {
              throw new LibraryError("concurrent_change");
            }
            const artifact = transaction.research?.findArtifactByStoredFileForDomain(
              currentLibrary.ownerDomainId,
              current.id,
            );
            const version = transaction.research?.findVersionForDomain(
              currentLibrary.ownerDomainId,
              holding.artifactId,
            );
            if (
              !artifact
              || artifact.id !== holding.artifactId
              || artifact.recordId !== holding.recordId
              || artifact.attachmentState !== "attached"
              || !version
              || version.id !== holding.versionId
              || version.storedFileId !== current.id
              || !transaction.research?.updateArtifactStateForDomain(
                currentLibrary.ownerDomainId,
                holding.recordId,
                holding.artifactId,
                "attached",
                "detached",
                now,
              )
            ) {
              throw new LibraryError("concurrent_change");
            }
          } else if (
            current.state !== "purging"
            || !transaction.libraries.verifyRecycledHoldingExclusive(
              currentLibrary.id,
              currentGroup.id,
              holding.recordId,
              holding.artifactId,
              holding.versionId,
              current.id,
              "purging",
              "detached",
            )
          ) {
            throw new LibraryError("concurrent_change");
          }
        },
      );
    } catch (error: unknown) {
      if (error instanceof DriveError) {
        throw error;
      }
      if (error instanceof LibraryError) {
        throw error;
      }
      throw new LibraryError("invalid_state", { cause: error });
    }
  }

  async createDownload(
    accountId: string,
    libraryId: string,
    fileId: string,
    disposition: "attachment" | "inline" = "attachment",
  ) {
    const repositories = this.#persistence.repositories;
    const library = this.#requireMember(accountId, libraryId, repositories);
    const holding = repositories.libraries.findHoldingByFile(library.id, fileId);
    if (!holding) throw new LibraryError("not_found");
    const file = repositories.files.findByDomainId(library.ownerDomainId, fileId);
    if (!file) throw new LibraryError("not_found");
    try {
      return await this.#drive.createDownloadForAuthorizedFile(file, disposition);
    } catch (error: unknown) {
      throw error;
    }
  }

  submitContribution(actor: AuthenticatedAccount, libraryId: string, artifactId: string): ContributionView {
    return this.#persistence.runInTransaction((repositories) => {
      this.#requireMember(actor.id, libraryId, repositories);
      const candidate = repositories.contributions.findCandidateForSubmission(artifactId, actor.id);
      if (!candidate || candidate.artifactState !== "attached" || candidate.file.state !== "active") {
        throw new LibraryError("not_found");
      }
      const research = repositories.research;
      if (!research || research.countArtifacts(actor.id, candidate.recordId) !== 1) {
        // A Record promotion is terminal. Promoting a subset would either
        // break the Record/Artifact composite FK or disclose unsubmitted
        // siblings, so the accelerated minimum accepts single-Artifact
        // Records only.
        throw new LibraryError("invalid_state");
      }
      if (repositories.contributions.findSubmittedByArtifact(libraryId, artifactId)) {
        throw new LibraryError("conflict");
      }
      const now = this.#now();
      let contribution: LibraryContribution;
      try {
        contribution = repositories.contributions.create({
          id: this.#createId(),
          libraryId,
          artifactId,
          contributorAccountId: actor.id,
          state: "submitted",
          revision: 0,
          submittedAt: now,
          reviewedAt: null,
          reviewedByAccountId: null,
          createdAt: now,
          updatedAt: now,
        });
      } catch (error: unknown) {
        if (this.#isConstraint(error)) throw new LibraryError("conflict", { cause: error });
        throw error;
      }
      recordAuditEvent(repositories, {
        action: "libraries.contribution_submit",
        actorKind: "account",
        actorAccountId: actor.id,
        targetId: contribution.id,
        outcome: "succeeded",
        reason: null,
        occurredAt: now,
      });
      return this.#contributionView(repositories.contributions.findCandidate(libraryId, contribution.id)!);
    });
  }

  listContributions(actor: AuthenticatedAccount, libraryId: string, limit = 100): ContributionView[] {
    if (!Number.isInteger(limit) || limit < 1 || limit > 100) throw new LibraryError("invalid_input");
    this.#requireManager(actor.id, libraryId, this.#persistence.repositories);
    return this.#persistence.repositories.contributions.listSubmitted(libraryId, limit).map((candidate) => this.#contributionView(candidate));
  }

  listMyContributions(actor: AuthenticatedAccount, libraryId: string, limit = 100): ContributionView[] {
    if (!Number.isInteger(limit) || limit < 1 || limit > 100) throw new LibraryError("invalid_input");
    this.#requireMember(actor.id, libraryId, this.#persistence.repositories);
    return this.#persistence.repositories.contributions.listForContributor(libraryId, actor.id, limit).map((candidate) => this.#contributionView(candidate));
  }

  reviewContribution(
    actor: AuthenticatedAccount,
    libraryId: string,
    contributionId: string,
    decision: "approve" | "reject",
  ): ContributionView {
    return this.#persistence.runInTransaction((repositories) => {
      this.#requireManager(actor.id, libraryId, repositories);
      const candidate = repositories.contributions.findCandidate(libraryId, contributionId);
      if (!candidate || candidate.contribution.state !== "submitted") throw new LibraryError("not_found");
      const now = this.#now();
      try {
        let updated: LibraryContribution | null;
        if (decision === "approve") {
          const contributor = repositories.accounts.findById(candidate.contribution.contributorAccountId);
          if (
            !contributor
            || contributor.state !== "active"
            || !this.#isEffectiveMember(contributor.id, libraryId, repositories)
            || candidate.artifactState !== "attached"
            || candidate.file.state !== "active"
            || candidate.file.ownerDomainId !== `account:${contributor.id}`
          ) {
            throw new LibraryError("invalid_state");
          }
          updated = repositories.contributions.promote(
            libraryId,
            contributionId,
            candidate.contribution.revision,
            contributor.id,
            candidate.recordId,
            candidate.contribution.artifactId,
            candidate.versionId,
            candidate.file.id,
            actor.id,
            now,
          );
        } else {
          updated = repositories.contributions.updateState(
            libraryId,
            contributionId,
            candidate.contribution.revision,
            "rejected",
            actor.id,
            now,
          );
        }
        if (!updated) throw new LibraryError("conflict");
        recordAuditEvent(repositories, {
          action: decision === "approve" ? "libraries.contribution_approve" : "libraries.contribution_reject",
          actorKind: "account",
          actorAccountId: actor.id,
          targetId: contributionId,
          outcome: "succeeded",
          reason: null,
          occurredAt: now,
        });
        return this.#contributionView(repositories.contributions.findCandidate(libraryId, contributionId)!);
      } catch (error: unknown) {
        if (error instanceof LibraryError) throw error;
        if (this.#isConstraint(error) || error instanceof Error && /promotion .* changed|state changed/i.test(error.message)) {
          throw new LibraryError("conflict", { cause: error });
        }
        throw error;
      }
    });
  }

  withdrawContribution(actor: AuthenticatedAccount, libraryId: string, contributionId: string): ContributionView {
    return this.#persistence.runInTransaction((repositories) => {
      this.#requireActiveActor(actor, repositories);
      const candidate = repositories.contributions.findCandidate(libraryId, contributionId);
      if (!candidate || candidate.contribution.contributorAccountId !== actor.id || candidate.contribution.state !== "submitted") {
        throw new LibraryError("not_found");
      }
      const now = this.#now();
      const updated = repositories.contributions.updateState(
        libraryId,
        contributionId,
        candidate.contribution.revision,
        "withdrawn",
        actor.id,
        now,
      );
      if (!updated) throw new LibraryError("conflict");
      recordAuditEvent(repositories, {
        action: "libraries.contribution_withdraw",
        actorKind: "account",
        actorAccountId: actor.id,
        targetId: contributionId,
        outcome: "succeeded",
        reason: null,
        occurredAt: now,
      });
      return this.#contributionView(repositories.contributions.findCandidate(libraryId, contributionId)!);
    });
  }

  async createContributionDownload(
    actor: AuthenticatedAccount,
    libraryId: string,
    contributionId: string,
    disposition: "attachment" | "inline" = "attachment",
  ) {
    const repositories = this.#persistence.repositories;
    const candidate = repositories.contributions.findCandidate(libraryId, contributionId);
    if (!candidate) throw new LibraryError("not_found");
    const isContributor = candidate.contribution.contributorAccountId === actor.id
      && repositories.accounts.findById(actor.id)?.state === "active";
    const canReview = candidate.contribution.state === "submitted"
      ? this.#isEffectiveManager(actor.id, libraryId, repositories)
      : candidate.contribution.state === "approved"
        ? this.#isEffectiveMember(actor.id, libraryId, repositories)
        : false;
    const canContributorRead = candidate.contribution.state !== "approved" && isContributor;
    if (!canContributorRead && !canReview) throw new LibraryError("not_found");
    const file = repositories.files.findByDomainId(candidate.file.ownerDomainId, candidate.file.id);
    if (!file) throw new LibraryError("not_found");
    return this.#drive.createDownloadForAuthorizedFile(file, disposition);
  }

  #summary(library: Library, role: LibraryRole): LibrarySummary {
    return {
      id: library.id,
      name: library.name,
      role,
      isDefault: library.isDefault,
      createdAt: library.createdAt.toISOString(),
    };
  }

  #intakeActivatedFile(
    repositories: RepositorySet,
    actor: AuthenticatedAccount,
    canonicalLibraryId: string,
    file: StoredFile,
    now: Date,
  ): void {
    this.#requireActiveActor(actor, repositories);
    const library = this.#requireMember(actor.id, canonicalLibraryId, repositories);
    if (!library.isDefault || file.state !== "active") throw new LibraryError("invalid_state");

    const research = repositories.research;
    if (!research) throw new LibraryError("invalid_state");
    let artifact = research.findArtifactByStoredFile(actor.id, file.id);
    if (!artifact) {
      const record = research.createRecord({
        id: this.#createId(),
        ownerId: actor.id,
        label: file.displayName,
        createdAt: now,
        updatedAt: now,
      });
      artifact = research.createArtifact({
        id: this.#createId(),
        ownerId: actor.id,
        recordId: record.id,
        attachmentState: "detached",
        createdAt: now,
        updatedAt: now,
      });
      research.createVersion({
        id: this.#createId(),
        ownerId: actor.id,
        artifactId: artifact.id,
        storedFileId: file.id,
        createdAt: now,
        updatedAt: now,
      });
      artifact = research.updateArtifactState(
        actor.id,
        record.id,
        artifact.id,
        "detached",
        "attached",
        now,
      );
      if (!artifact) throw new LibraryError("conflict");
    }

    if (artifact.attachmentState !== "attached" || research.countArtifacts(actor.id, artifact.recordId) !== 1) {
      throw new LibraryError("invalid_state");
    }
    if (repositories.contributions.findLatestByArtifact(canonicalLibraryId, artifact.id)) return;

    const contribution = repositories.contributions.create({
      id: this.#createId(),
      libraryId: canonicalLibraryId,
      artifactId: artifact.id,
      contributorAccountId: actor.id,
      state: "submitted",
      revision: 0,
      submittedAt: now,
      reviewedAt: null,
      reviewedByAccountId: null,
      createdAt: now,
      updatedAt: now,
    });

    if (actor.role === "member") {
      recordAuditEvent(repositories, {
        action: "libraries.contribution_submit",
        actorKind: "account",
        actorAccountId: actor.id,
        targetId: contribution.id,
        outcome: "succeeded",
        reason: null,
        occurredAt: now,
      });
      return;
    }

    const candidate = repositories.contributions.findCandidate(canonicalLibraryId, contribution.id);
    if (!candidate) throw new LibraryError("invalid_state");
    const promoted = repositories.contributions.promote(
      canonicalLibraryId,
      contribution.id,
      contribution.revision,
      actor.id,
      candidate.recordId,
      candidate.contribution.artifactId,
      candidate.versionId,
      candidate.file.id,
      actor.id,
      now,
    );
    if (!promoted) throw new LibraryError("conflict");
    recordAuditEvent(repositories, {
      action: "libraries.resource_admit",
      actorKind: "account",
      actorAccountId: actor.id,
      targetId: contribution.id,
      outcome: "succeeded",
      reason: null,
      occurredAt: now,
    });
  }

  #contributionView(candidate: ContributionCandidate): ContributionView {
    return {
      id: candidate.contribution.id,
      libraryId: candidate.contribution.libraryId,
      artifactId: candidate.contribution.artifactId,
      state: candidate.contribution.state,
      revision: candidate.contribution.revision,
      recordId: candidate.recordId,
      recordLabel: candidate.recordLabel,
      submitterLoginName: candidate.submitterLoginName,
      file: {
        id: candidate.file.id,
        displayName: candidate.file.displayName,
        mediaType: candidate.file.mediaType,
        sizeBytes: candidate.file.sizeBytes,
        state: candidate.file.state,
      },
      submittedAt: candidate.contribution.submittedAt.toISOString(),
      reviewedAt: candidate.contribution.reviewedAt?.toISOString() ?? null,
    };
  }

  #requireActiveActor(actor: AuthenticatedAccount, repositories: RepositorySet): void {
    const current = repositories.accounts.findById(actor.id);
    if (!current || current.state !== "active" || current.role !== actor.role) {
      throw new LibraryError("authorization_denied");
    }
  }

  #requireMember(accountId: string, libraryId: string, repositories: RepositorySet): Library {
    const account = repositories.accounts.findById(accountId);
    const library = repositories.libraries.findById(libraryId);
    const membership = library ? repositories.libraries.findMembership(libraryId, accountId) : null;
    if (!account || account.state !== "active" || !library || !membership || !this.#isEffectiveMembership(repositories, membership)) {
      throw new LibraryError("not_found");
    }
    return library;
  }

  #requireManager(accountId: string, libraryId: string, repositories: RepositorySet): Library {
    const library = this.#requireMember(accountId, libraryId, repositories);
    const membership = repositories.libraries.findMembership(libraryId, accountId);
    if (!membership || membership.role !== "manager") throw new LibraryError("not_found");
    return library;
  }

  #requireSingleFileRecycleGroup(
    repositories: RepositorySet,
    ownerDomainId: string,
    fileId: string,
  ): DomainRecycleGroup {
    const group = repositories.recycle.findGroupByRootForDomain(ownerDomainId, "file", fileId);
    if (
      !group ||
      group.folderCount !== 0 ||
      group.fileCount !== 1 ||
      repositories.recycle.listFolderIdsForDomain(ownerDomainId, group.id).length !== 0
    ) {
      throw new LibraryError("invalid_state");
    }
    const fileIds = repositories.recycle.listFileIdsForDomain(ownerDomainId, group.id);
    if (fileIds.length !== 1 || fileIds[0] !== fileId) throw new LibraryError("invalid_state");
    return group;
  }

  #isEffectiveMembership(repositories: RepositorySet, membership: LibraryMembership): boolean {
    return repositories.accounts.findById(membership.accountId)?.state === "active";
  }

  #isEffectiveMember(accountId: string, libraryId: string, repositories: RepositorySet): boolean {
    const membership = repositories.libraries.findMembership(libraryId, accountId);
    return Boolean(membership && this.#isEffectiveMembership(repositories, membership));
  }

  #isEffectiveManager(accountId: string, libraryId: string, repositories: RepositorySet): boolean {
    const membership = repositories.libraries.findMembership(libraryId, accountId);
    return Boolean(membership && membership.role === "manager" && this.#isEffectiveMembership(repositories, membership));
  }

  #memberView(repositories: RepositorySet, libraryId: string, accountId: string): LibraryMemberView | null {
    const membership = repositories.libraries.findMembership(libraryId, accountId);
    if (!membership) return null;
    const account = repositories.accounts.findById(accountId);
    return {
      accountId,
      loginName: account?.loginName ?? null,
      role: membership.role,
      state: account?.state ?? "missing",
      createdAt: membership.createdAt.toISOString(),
      updatedAt: membership.updatedAt.toISOString(),
    };
  }

  #isConstraint(error: unknown): boolean {
    return error instanceof Error && /(constraint failed|library requires|membership requires)/i.test(error.message);
  }
}
