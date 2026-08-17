import { createHash, randomBytes, randomUUID } from "node:crypto";

import type { Account, AccountState } from "../auth/account.js";
import { validateLoginName, validatePassword } from "../auth/account-validation.js";
import type { AuthenticatedAccount } from "../auth/auth-service.js";
import { AuthorizationDeniedError, requireOwner } from "../auth/authorization.js";
import type { PasswordHasher } from "../auth/password-hasher.js";
import type { Persistence, RepositorySet } from "../persistence/contracts.js";
import type { Invitation } from "./invitation.js";

const INVITATION_TOKEN_BYTES = 32;
export const INVITATION_DURATION_MILLISECONDS = 7 * 24 * 60 * 60 * 1_000;
const RAW_INVITATION_TOKEN = /^[A-Za-z0-9_-]{43}$/;

export class InvalidInvitationError extends Error {
  constructor() {
    super("Invitation is invalid");
    this.name = "InvalidInvitationError";
  }
}

export class AccountConflictError extends Error {
  constructor() {
    super("Account login name is unavailable");
    this.name = "AccountConflictError";
  }
}

export class AccountAdministrationError extends Error {
  constructor(readonly code: "not_found" | "invalid_target" | "invalid_state") {
    super(code);
    this.name = "AccountAdministrationError";
  }
}

export interface SafeAccount {
  id: string;
  loginName: string;
  role: Account["role"];
  state: Account["state"];
  createdAt: Date;
}

export interface SafeInvitation {
  id: string;
  createdByAccountId: string;
  createdAt: Date;
  expiresAt: Date;
  consumedAt: Date | null;
  consumedByAccountId: string | null;
  revokedAt: Date | null;
  status: "available" | "expired" | "consumed" | "revoked";
}

export interface CreatedInvitation {
  invitation: SafeInvitation;
  rawToken: string;
}

export interface AccountAdministrationOptions {
  persistence: Persistence;
  passwordHasher: PasswordHasher;
  now?: () => Date;
  createInvitationToken?: () => string;
  createId?: () => string;
}

export function digestInvitationToken(rawToken: string): string {
  return createHash("sha256").update(rawToken, "utf8").digest("hex");
}

function safeAccount(account: Account): SafeAccount {
  return {
    id: account.id,
    loginName: account.loginName,
    role: account.role,
    state: account.state,
    createdAt: account.createdAt,
  };
}

function invitationStatus(invitation: Invitation, now: Date): SafeInvitation["status"] {
  if (invitation.consumedAt) return "consumed";
  if (invitation.revokedAt) return "revoked";
  if (invitation.expiresAt.getTime() <= now.getTime()) return "expired";
  return "available";
}

function safeInvitation(invitation: Invitation, now: Date): SafeInvitation {
  return {
    id: invitation.id,
    createdByAccountId: invitation.createdByAccountId,
    createdAt: invitation.createdAt,
    expiresAt: invitation.expiresAt,
    consumedAt: invitation.consumedAt,
    consumedByAccountId: invitation.consumedByAccountId,
    revokedAt: invitation.revokedAt,
    status: invitationStatus(invitation, now),
  };
}

function invitationIsAvailable(invitation: Invitation | null, now: Date): invitation is Invitation {
  return Boolean(
    invitation &&
    !invitation.consumedAt &&
    !invitation.revokedAt &&
    invitation.expiresAt.getTime() > now.getTime(),
  );
}

function isUniqueConstraint(error: unknown): boolean {
  return error instanceof Error && /UNIQUE constraint failed/i.test(error.message);
}

export class AccountAdministrationService {
  readonly #persistence: Persistence;
  readonly #passwordHasher: PasswordHasher;
  readonly #now: () => Date;
  readonly #createInvitationToken: () => string;
  readonly #createId: () => string;

  constructor(options: AccountAdministrationOptions) {
    this.#persistence = options.persistence;
    this.#passwordHasher = options.passwordHasher;
    this.#now = options.now ?? (() => new Date());
    this.#createInvitationToken = options.createInvitationToken ??
      (() => randomBytes(INVITATION_TOKEN_BYTES).toString("base64url"));
    this.#createId = options.createId ?? randomUUID;
  }

  createInvitation(actor: AuthenticatedAccount): CreatedInvitation {
    this.#assertCurrentOwner(actor, this.#persistence.repositories);
    const now = this.#now();
    const rawToken = this.#createInvitationToken();
    if (!RAW_INVITATION_TOKEN.test(rawToken)) throw new Error("invitation token generator returned an invalid token");
    const invitation = this.#persistence.repositories.invitations.create({
      id: this.#createId(),
      tokenDigest: digestInvitationToken(rawToken),
      createdByAccountId: actor.id,
      createdAt: now,
      expiresAt: new Date(now.getTime() + INVITATION_DURATION_MILLISECONDS),
      consumedAt: null,
      consumedByAccountId: null,
      revokedAt: null,
    });
    return { invitation: safeInvitation(invitation, now), rawToken };
  }

  listInvitations(actor: AuthenticatedAccount): SafeInvitation[] {
    this.#assertCurrentOwner(actor, this.#persistence.repositories);
    const now = this.#now();
    return this.#persistence.repositories.invitations.list().map((invitation) => safeInvitation(invitation, now));
  }

  revokeInvitation(actor: AuthenticatedAccount, invitationId: string): SafeInvitation {
    this.#assertCurrentOwner(actor, this.#persistence.repositories);
    return this.#persistence.runInTransaction((repositories) => {
      this.#assertCurrentOwner(actor, repositories);
      const invitation = repositories.invitations.findById(invitationId);
      if (!invitation) throw new AccountAdministrationError("not_found");
      if (invitation.consumedAt || invitation.revokedAt || invitation.expiresAt.getTime() <= this.#now().getTime()) {
        throw new AccountAdministrationError("invalid_state");
      }
      const now = this.#now();
      if (!repositories.invitations.revokeUnused(invitation.id, now)) {
        throw new AccountAdministrationError("invalid_state");
      }
      return safeInvitation(repositories.invitations.findById(invitation.id)!, now);
    });
  }

  async registerMember(rawToken: string, loginNameValue: string, password: string): Promise<SafeAccount> {
    if (!RAW_INVITATION_TOKEN.test(rawToken)) throw new InvalidInvitationError();
    const tokenDigest = digestInvitationToken(rawToken);
    if (!invitationIsAvailable(this.#persistence.repositories.invitations.findByTokenDigest(tokenDigest), this.#now())) {
      throw new InvalidInvitationError();
    }
    const loginName = validateLoginName(loginNameValue);
    validatePassword(password);
    if (this.#persistence.repositories.accounts.findByLoginName(loginName)) throw new AccountConflictError();
    const passwordHash = await this.#passwordHasher.hash(password);

    try {
      return this.#persistence.runInTransaction((repositories) => {
        const now = this.#now();
        const invitation = repositories.invitations.findByTokenDigest(tokenDigest);
        if (!invitationIsAvailable(invitation, now)) throw new InvalidInvitationError();
        if (repositories.accounts.findByLoginName(loginName)) throw new AccountConflictError();
        const account = repositories.accounts.create({
          id: this.#createId(),
          loginName,
          passwordHash,
          role: "member",
          state: "active",
          createdAt: now,
          updatedAt: now,
        });
        if (!repositories.invitations.consume(invitation.id, tokenDigest, account.id, now)) {
          throw new InvalidInvitationError();
        }
        return safeAccount(account);
      });
    } catch (error: unknown) {
      if (error instanceof InvalidInvitationError || error instanceof AccountConflictError) throw error;
      if (isUniqueConstraint(error)) throw new AccountConflictError();
      throw error;
    }
  }

  listAccounts(actor: AuthenticatedAccount): SafeAccount[] {
    this.#assertCurrentOwner(actor, this.#persistence.repositories);
    return this.#persistence.repositories.accounts.list().map(safeAccount);
  }

  setMemberState(actor: AuthenticatedAccount, accountId: string, state: AccountState): SafeAccount {
    requireOwner(actor);
    return this.#persistence.runInTransaction((repositories) => {
      this.#assertCurrentOwner(actor, repositories);
      const target = repositories.accounts.findById(accountId);
      if (!target) throw new AccountAdministrationError("not_found");
      if (target.id === actor.id || target.role !== "member") {
        throw new AccountAdministrationError("invalid_target");
      }
      if (target.state === state) return safeAccount(target);
      const now = this.#now();
      if (!repositories.accounts.updateState(target.id, target.state, state, now)) {
        throw new AccountAdministrationError("invalid_state");
      }
      if (state === "disabled") repositories.sessions.revokeAllByAccountId(target.id, now);
      return safeAccount(repositories.accounts.findById(target.id)!);
    });
  }

  #assertCurrentOwner(actor: AuthenticatedAccount, repositories: RepositorySet): void {
    requireOwner(actor);
    const current = repositories.accounts.findById(actor.id);
    if (!current || current.state !== "active" || current.role !== "owner") {
      throw new AuthorizationDeniedError();
    }
  }
}
