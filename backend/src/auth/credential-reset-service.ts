import { createHash, randomBytes, randomUUID } from "node:crypto";

import { recordAuditEvent, tryRecordAuditAttempt } from "../audit/audit-service.js";
import { validatePassword } from "./account-validation.js";
import type { AuthenticatedAccount } from "./auth-service.js";
import { AuthorizationDeniedError, requireOwner } from "./authorization.js";
import type { PasswordHasher } from "./password-hasher.js";
import type { Persistence, RepositorySet } from "../persistence/contracts.js";

const CREDENTIAL_RESET_TOKEN_BYTES = 32;
const RAW_CREDENTIAL_RESET_TOKEN = /^[A-Za-z0-9_-]{43}$/;
export const CREDENTIAL_RESET_DURATION_MILLISECONDS = 30 * 60 * 1_000;

export class CredentialResetError extends Error {
  constructor(readonly code: "not_found" | "invalid_target" | "invalid_state" | "invalid_credential_reset") {
    super(code);
    this.name = "CredentialResetError";
  }
}

export interface CreatedCredentialReset {
  reset: {
    id: string;
    accountId: string;
    createdAt: Date;
    expiresAt: Date;
  };
  rawToken: string;
}

export interface CredentialResetServiceOptions {
  persistence: Persistence;
  passwordHasher: PasswordHasher;
  now?: () => Date;
  createToken?: () => string;
  createId?: () => string;
}

export function digestCredentialResetToken(rawToken: string): string {
  return createHash("sha256").update(rawToken, "utf8").digest("hex");
}

export class CredentialResetService {
  readonly #persistence: Persistence;
  readonly #passwordHasher: PasswordHasher;
  readonly #now: () => Date;
  readonly #createToken: () => string;
  readonly #createId: () => string;

  constructor(options: CredentialResetServiceOptions) {
    this.#persistence = options.persistence;
    this.#passwordHasher = options.passwordHasher;
    this.#now = options.now ?? (() => new Date());
    this.#createToken = options.createToken
      ?? (() => randomBytes(CREDENTIAL_RESET_TOKEN_BYTES).toString("base64url"));
    this.#createId = options.createId ?? randomUUID;
  }

  issue(actor: AuthenticatedAccount, accountId: string): CreatedCredentialReset {
    requireOwner(actor);
    return this.#persistence.runInTransaction((repositories) => {
      this.#assertCurrentOwner(actor, repositories);
      const target = repositories.accounts.findById(accountId);
      if (!target) throw new CredentialResetError("not_found");
      if (target.id === actor.id || target.role !== "member") {
        throw new CredentialResetError("invalid_target");
      }
      if (target.state !== "active" && target.state !== "disabled") {
        throw new CredentialResetError("invalid_state");
      }

      const rawToken = this.#createToken();
      if (!RAW_CREDENTIAL_RESET_TOKEN.test(rawToken)) {
        throw new Error("credential reset token generator returned an invalid token");
      }
      const now = this.#now();
      repositories.credentialResets.supersedeOutstanding(target.id, now);
      const reset = repositories.credentialResets.create({
        id: this.#createId(),
        tokenDigest: digestCredentialResetToken(rawToken),
        accountId: target.id,
        issuedByAccountId: actor.id,
        createdAt: now,
        expiresAt: new Date(now.getTime() + CREDENTIAL_RESET_DURATION_MILLISECONDS),
        consumedAt: null,
        supersededAt: null,
      });
      recordAuditEvent(repositories, {
        action: "accounts.credential_reset_issue",
        actorKind: "account",
        actorAccountId: actor.id,
        targetId: reset.id,
        outcome: "succeeded",
        reason: null,
        occurredAt: now,
      });
      return {
        reset: {
          id: reset.id,
          accountId: reset.accountId,
          createdAt: reset.createdAt,
          expiresAt: reset.expiresAt,
        },
        rawToken,
      };
    });
  }

  async redeem(rawToken: string, newPassword: string): Promise<void> {
    try {
      if (!RAW_CREDENTIAL_RESET_TOKEN.test(rawToken)) {
        throw new CredentialResetError("invalid_credential_reset");
      }
      validatePassword(newPassword);

      // The KDF remains outside the write transaction. It runs for every
      // syntactically valid capability, so response shape and work do not
      // disclose whether a digest exists.
      const passwordHash = await this.#passwordHasher.hash(newPassword);
      this.#persistence.runInTransaction((repositories) => {
        const now = this.#now();
        const tokenDigest = digestCredentialResetToken(rawToken);
        const reset = repositories.credentialResets.findByTokenDigest(tokenDigest);
        if (
          !reset || reset.consumedAt || reset.supersededAt
          || reset.expiresAt.getTime() <= now.getTime()
        ) {
          throw new CredentialResetError("invalid_credential_reset");
        }
        const account = repositories.accounts.findById(reset.accountId);
        if (
          !account || account.role !== "member"
          || (account.state !== "active" && account.state !== "disabled")
        ) {
          throw new CredentialResetError("invalid_credential_reset");
        }
        if (!repositories.accounts.resetPassword(
          account.id,
          account.passwordHash,
          account.authRevision,
          passwordHash,
          now,
        )) {
          throw new CredentialResetError("invalid_credential_reset");
        }
        if (!repositories.credentialResets.consume(reset.id, tokenDigest, now)) {
          throw new CredentialResetError("invalid_credential_reset");
        }
        repositories.sessions.revokeAllByAccountId(account.id, now);
        recordAuditEvent(repositories, {
          action: "auth.credential_reset",
          actorKind: "anonymous",
          actorAccountId: null,
          targetId: reset.id,
          outcome: "succeeded",
          reason: null,
          occurredAt: now,
        });
      });
    } catch (error: unknown) {
      if (error instanceof CredentialResetError) {
        tryRecordAuditAttempt(this.#persistence, {
          action: "auth.credential_reset",
          actorKind: "anonymous",
          actorAccountId: null,
          targetId: null,
          outcome: "denied",
          reason: "invalid_credential_reset",
          occurredAt: this.#now(),
        });
      }
      throw error;
    }
  }

  recordIssueAttempt(actor: AuthenticatedAccount, error: unknown): boolean {
    const reason = error instanceof AuthorizationDeniedError
      ? "authorization_denied"
      : error instanceof CredentialResetError
        ? error.code
        : "storage_unavailable";
    return tryRecordAuditAttempt(this.#persistence, {
      action: "accounts.credential_reset_issue",
      actorKind: "account",
      actorAccountId: actor.id,
      targetId: null,
      outcome: reason === "storage_unavailable" ? "failed" : "denied",
      reason,
      occurredAt: this.#now(),
    });
  }

  recordRedemptionBusy(reason: "rate_limit_exceeded" | "kdf_overloaded"): boolean {
    return tryRecordAuditAttempt(this.#persistence, {
      action: "auth.credential_reset",
      actorKind: "anonymous",
      actorAccountId: null,
      targetId: null,
      outcome: "busy",
      reason,
      occurredAt: this.#now(),
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
