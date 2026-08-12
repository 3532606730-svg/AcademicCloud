import { createHash, randomBytes } from "node:crypto";

import type { Account } from "./account.js";
import type { AccountRepository } from "./account-repository.js";
import type { PasswordHasher } from "./password-hasher.js";
import type { SessionRepository } from "./session-repository.js";

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

export interface AuthenticatedAccount {
  id: string;
  loginName: string;
}

export interface LoginResult {
  account: AuthenticatedAccount;
  sessionSecret: string;
  expiresAt: Date;
}

export interface AuthServiceOptions {
  accounts: AccountRepository;
  sessions: SessionRepository;
  passwordHasher: PasswordHasher;
  now?: () => Date;
  createSessionSecret?: () => string;
}

export function digestSessionSecret(secret: string): string {
  return createHash("sha256").update(secret, "utf8").digest("hex");
}

function toAuthenticatedAccount(account: Account): AuthenticatedAccount {
  return { id: account.id, loginName: account.loginName };
}

export class AuthService {
  readonly #accounts: AccountRepository;
  readonly #sessions: SessionRepository;
  readonly #passwordHasher: PasswordHasher;
  readonly #now: () => Date;
  readonly #createSessionSecret: () => string;

  constructor(options: AuthServiceOptions) {
    this.#accounts = options.accounts;
    this.#sessions = options.sessions;
    this.#passwordHasher = options.passwordHasher;
    this.#now = options.now ?? (() => new Date());
    this.#createSessionSecret =
      options.createSessionSecret ?? (() => randomBytes(SESSION_SECRET_BYTES).toString("base64url"));
  }

  async login(loginName: string, password: string): Promise<LoginResult> {
    const account = this.#accounts.findByLoginName(loginName);
    const passwordMatches = await this.#passwordHasher.verify(
      account?.passwordHash ?? UNKNOWN_ACCOUNT_PASSWORD_HASH,
      password,
    );

    if (!account || account.state !== "active" || !passwordMatches) {
      throw new InvalidCredentialsError();
    }

    const now = this.#now();
    const expiresAt = new Date(now.getTime() + SESSION_DURATION_MILLISECONDS);
    const sessionSecret = this.#createSessionSecret();

    this.#sessions.create({
      tokenDigest: digestSessionSecret(sessionSecret),
      accountId: account.id,
      createdAt: now,
      expiresAt,
      revokedAt: null,
    });

    return {
      account: toAuthenticatedAccount(account),
      sessionSecret,
      expiresAt,
    };
  }

  resolveSession(sessionSecret: string): AuthenticatedAccount | null {
    const session = this.#sessions.findByTokenDigest(digestSessionSecret(sessionSecret));
    const now = this.#now();

    if (!session || session.revokedAt || session.expiresAt.getTime() <= now.getTime()) {
      return null;
    }

    const account = this.#accounts.findById(session.accountId);
    return account?.state === "active" ? toAuthenticatedAccount(account) : null;
  }

  logout(sessionSecret: string): void {
    this.#sessions.revokeByTokenDigest(digestSessionSecret(sessionSecret), this.#now());
  }
}
