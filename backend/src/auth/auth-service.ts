import { createHash, randomBytes } from "node:crypto";

import type { Account } from "./account.js";
import { validatePassword } from "./account-validation.js";
import type { PasswordHasher } from "./password-hasher.js";
import type { Persistence } from "../persistence/contracts.js";
import { recordAuditEvent, tryRecordAuditAttempt } from "../audit/audit-service.js";

const SESSION_SECRET_BYTES = 32;
export const SESSION_DURATION_MILLISECONDS = 7 * 24 * 60 * 60 * 1_000;

// A non-secret, fixed Argon2id hash used to equalize the unknown-account path.
const UNKNOWN_ACCOUNT_PASSWORD_HASH =
  "$argon2id$v=19$m=65536,p=1,t=3$QWNhZGVtaWNDbG91ZER1bW15$uy4ToZQux26i7kYBxeX2jHNs2JXLKtpKe9P9rStvyK8";

export class InvalidCredentialsError extends Error {
  constructor() {
    super("Invalid login credentials");
    this.name = "InvalidCredentialsError";
  }
}

export class PasswordChangeError extends Error {
  constructor(readonly code: "invalid_current_password" | "password_change_conflict" | "password_unchanged") {
    super(code);
    this.name = "PasswordChangeError";
  }
}

export interface AuthenticatedAccount {
  id: string;
  loginName: string;
  role: Account["role"];
}

export interface LoginResult {
  account: AuthenticatedAccount;
  sessionSecret: string;
  expiresAt: Date;
}

export interface AuthServiceOptions {
  persistence: Persistence;
  passwordHasher: PasswordHasher;
  now?: () => Date;
  createSessionSecret?: () => string;
}

export function digestSessionSecret(secret: string): string {
  return createHash("sha256").update(secret, "utf8").digest("hex");
}

function toAuthenticatedAccount(account: Account): AuthenticatedAccount {
  return { id: account.id, loginName: account.loginName, role: account.role };
}

export class AuthService {
  readonly #persistence: Persistence;
  readonly #passwordHasher: PasswordHasher;
  readonly #now: () => Date;
  readonly #createSessionSecret: () => string;

  constructor(options: AuthServiceOptions) {
    this.#persistence = options.persistence;
    this.#passwordHasher = options.passwordHasher;
    this.#now = options.now ?? (() => new Date());
    this.#createSessionSecret =
      options.createSessionSecret ?? (() => randomBytes(SESSION_SECRET_BYTES).toString("base64url"));
  }

  async login(loginName: string, password: string): Promise<LoginResult> {
    const account = this.#persistence.repositories.accounts.findByLoginName(loginName);
    const passwordMatches = await this.#passwordHasher.verify(
      account?.passwordHash ?? UNKNOWN_ACCOUNT_PASSWORD_HASH,
      password,
    );

    if (!account || account.state !== "active" || !passwordMatches) {
      tryRecordAuditAttempt(this.#persistence, {
        action: "auth.login",
        actorKind: "anonymous",
        actorAccountId: null,
        targetId: null,
        outcome: "denied",
        reason: "invalid_credentials",
        occurredAt: this.#now(),
      });
      throw new InvalidCredentialsError();
    }

    const now = this.#now();
    const expiresAt = new Date(now.getTime() + SESSION_DURATION_MILLISECONDS);
    const sessionSecret = this.#createSessionSecret();

    let authenticatedAccount: AuthenticatedAccount;
    try {
      authenticatedAccount = this.#persistence.runInTransaction((repositories) => {
        const current = repositories.accounts.findById(account.id);
        if (
          !current ||
          current.state !== "active" ||
          current.passwordHash !== account.passwordHash ||
          current.authRevision !== account.authRevision
        ) {
          throw new InvalidCredentialsError();
        }
        repositories.sessions.create({
          tokenDigest: digestSessionSecret(sessionSecret),
          accountId: current.id,
          createdAt: now,
          expiresAt,
          revokedAt: null,
        });
        recordAuditEvent(repositories, {
          action: "auth.login",
          actorKind: "account",
          actorAccountId: current.id,
          targetId: current.id,
          outcome: "succeeded",
          reason: null,
          occurredAt: now,
        });
        return toAuthenticatedAccount(current);
      });
    } catch (error: unknown) {
      if (error instanceof InvalidCredentialsError) {
        tryRecordAuditAttempt(this.#persistence, {
          action: "auth.login",
          actorKind: "anonymous",
          actorAccountId: null,
          targetId: null,
          outcome: "denied",
          reason: "invalid_credentials",
          occurredAt: this.#now(),
        });
      }
      throw error;
    }

    return {
      account: authenticatedAccount,
      sessionSecret,
      expiresAt,
    };
  }

  resolveSession(sessionSecret: string): AuthenticatedAccount | null {
    const session = this.#persistence.repositories.sessions.findByTokenDigest(digestSessionSecret(sessionSecret));
    const now = this.#now();

    if (!session || session.revokedAt || session.expiresAt.getTime() <= now.getTime()) {
      return null;
    }

    const account = this.#persistence.repositories.accounts.findById(session.accountId);
    return account?.state === "active" ? toAuthenticatedAccount(account) : null;
  }

  logout(sessionSecret: string): void {
    const tokenDigest = digestSessionSecret(sessionSecret);
    const now = this.#now();
    this.#persistence.runInTransaction((repositories) => {
      const session = repositories.sessions.findByTokenDigest(tokenDigest);
      if (
        !session ||
        session.revokedAt ||
        session.expiresAt.getTime() <= now.getTime() ||
        !repositories.sessions.revokeByTokenDigest(tokenDigest, now)
      ) return;
      recordAuditEvent(repositories, {
        action: "auth.logout",
        actorKind: "account",
        actorAccountId: session.accountId,
        targetId: null,
        outcome: "succeeded",
        reason: null,
        occurredAt: now,
      });
    });
  }

  async changePassword(
    actor: AuthenticatedAccount,
    currentPassword: string,
    newPassword: string,
  ): Promise<void> {
    try {
      validatePassword(newPassword);
      if (currentPassword === newPassword) throw new PasswordChangeError("password_unchanged");

      const snapshot = this.#persistence.repositories.accounts.findById(actor.id);
      if (!snapshot || snapshot.state !== "active" || snapshot.role !== actor.role) {
        throw new PasswordChangeError("password_change_conflict");
      }

      if (!await this.#passwordHasher.verify(snapshot.passwordHash, currentPassword)) {
        throw new PasswordChangeError("invalid_current_password");
      }

      // Both expensive KDF operations stay outside the write transaction. The
      // hash + authentication revision captured above form the durable CAS
      // token that rejects password, disable/enable, and login-state races.
      const newPasswordHash = await this.#passwordHasher.hash(newPassword);

      this.#persistence.runInTransaction((repositories) => {
        const current = repositories.accounts.findById(snapshot.id);
        if (
          !current ||
          current.state !== "active" ||
          current.role !== actor.role ||
          current.passwordHash !== snapshot.passwordHash ||
          current.authRevision !== snapshot.authRevision
        ) {
          throw new PasswordChangeError("password_change_conflict");
        }

        const now = this.#now();
        if (!repositories.accounts.updatePassword(
          current.id,
          snapshot.passwordHash,
          snapshot.authRevision,
          newPasswordHash,
          now,
        )) {
          throw new PasswordChangeError("password_change_conflict");
        }

        // Password mutation, session revocation, and governance audit commit
        // or roll back as one unit.
        repositories.sessions.revokeAllByAccountId(current.id, now);
        recordAuditEvent(repositories, {
          action: "auth.password_change",
          actorKind: "account",
          actorAccountId: current.id,
          targetId: null,
          outcome: "succeeded",
          reason: null,
          occurredAt: now,
        });
      });
    } catch (error: unknown) {
      if (error instanceof PasswordChangeError) {
        tryRecordAuditAttempt(this.#persistence, {
          action: "auth.password_change",
          actorKind: "account",
          actorAccountId: actor.id,
          targetId: null,
          outcome: "denied",
          reason: error.code,
          occurredAt: this.#now(),
        });
      }
      throw error;
    }
  }

  recordLoginBusy(reason: "rate_limit_exceeded" | "kdf_overloaded"): boolean {
    return tryRecordAuditAttempt(this.#persistence, {
      action: "auth.login",
      actorKind: "anonymous",
      actorAccountId: null,
      targetId: null,
      outcome: "busy",
      reason,
      occurredAt: this.#now(),
    });
  }

  recordPasswordChangeBusy(
    actor: AuthenticatedAccount,
    reason: "rate_limit_exceeded" | "kdf_overloaded" = "kdf_overloaded",
  ): boolean {
    return tryRecordAuditAttempt(this.#persistence, {
      action: "auth.password_change",
      actorKind: "account",
      actorAccountId: actor.id,
      targetId: null,
      outcome: "busy",
      reason,
      occurredAt: this.#now(),
    });
  }
}
