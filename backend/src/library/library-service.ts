import { randomUUID } from "node:crypto";

import type { AuthenticatedAccount } from "../auth/auth-service.js";
import { AuthorizationDeniedError } from "../auth/authorization.js";
import type { DriveService } from "../drive/drive-service.js";
import type { Persistence, RepositorySet } from "../persistence/contracts.js";
import { recordAuditEvent, tryRecordAuditAttempt } from "../audit/audit-service.js";
import type { AuditEventKind, AuditReasonCode } from "../audit/audit-event.js";
import type { Library, LibraryHolding, LibraryMembership, LibraryRole } from "./library.js";

export type LibraryErrorCode =
  | "not_found"
  | "authorization_denied"
  | "invalid_input"
  | "invalid_state"
  | "conflict";

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

export interface LibraryHoldingView {
  recordId: string;
  recordLabel: string;
  artifactId: string;
  versionId: string;
  file: {
    id: string;
    displayName: string;
    mediaType: string | null;
    sizeBytes: number;
  };
}

function normalizeName(value: string): string {
  const normalized = value.normalize("NFC").trim();
  if (!normalized || normalized.length > 255 || /[\x00-\x1f\x7f]/.test(normalized)) {
    throw new LibraryError("invalid_input");
  }
  return normalized;
}

function mapHolding(holding: LibraryHolding): LibraryHoldingView {
  return {
    recordId: holding.recordId,
    recordLabel: holding.recordLabel,
    artifactId: holding.artifactId,
    versionId: holding.versionId,
    file: {
      id: holding.file.id,
      displayName: holding.file.displayName,
      mediaType: holding.file.mediaType,
      sizeBytes: holding.file.sizeBytes,
    },
  };
}

function reasonFor(error: unknown): AuditReasonCode {
  if (error instanceof AuthorizationDeniedError) return "authorization_denied";
  if (error instanceof LibraryError) {
    switch (error.code) {
      case "not_found": return "not_found";
      case "authorization_denied": return "authorization_denied";
      case "invalid_input": return "invalid_input";
      case "invalid_state": return "invalid_state";
      case "conflict": return "concurrent_change";
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
      .filter(({ membership }) => this.#isEffectiveMembership(repositories, membership))
      .map(({ library, membership }) => this.#summary(library, membership.role));
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
    return repositories.libraries.listHoldings(libraryId, limit).map(mapHolding);
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

  #summary(library: Library, role: LibraryRole): LibrarySummary {
    return { id: library.id, name: library.name, role, createdAt: library.createdAt.toISOString() };
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

  #isEffectiveMembership(repositories: RepositorySet, membership: LibraryMembership): boolean {
    return repositories.accounts.findById(membership.accountId)?.state === "active";
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
