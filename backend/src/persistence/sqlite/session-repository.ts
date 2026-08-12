import type { NewSession, Session } from "../../auth/session.js";
import type { SessionRepository } from "../../auth/session-repository.js";
import type { SqliteDatabase } from "./database.js";
import { fromDatabaseTimestamp, toDatabaseTimestamp } from "./records.js";

interface SessionRow {
  token_digest: string;
  account_id: string;
  created_at: string;
  expires_at: string;
  revoked_at: string | null;
}

interface SessionParameters {
  tokenDigest: string;
  accountId: string;
  createdAt: string;
  expiresAt: string;
  revokedAt: string | null;
}

function toSession(row: SessionRow): Session {
  return {
    tokenDigest: row.token_digest,
    accountId: row.account_id,
    createdAt: fromDatabaseTimestamp(row.created_at)!,
    expiresAt: fromDatabaseTimestamp(row.expires_at)!,
    revokedAt: fromDatabaseTimestamp(row.revoked_at),
  };
}

export class SqliteSessionRepository implements SessionRepository {
  readonly #insert;
  readonly #findByTokenDigest;
  readonly #revokeByTokenDigest;

  constructor(database: SqliteDatabase) {
    this.#insert = database.prepare<SessionParameters>(`
      INSERT INTO sessions (token_digest, account_id, created_at, expires_at, revoked_at)
      VALUES (@tokenDigest, @accountId, @createdAt, @expiresAt, @revokedAt)
    `);
    this.#findByTokenDigest = database.prepare<[string], SessionRow>(`
      SELECT token_digest, account_id, created_at, expires_at, revoked_at
      FROM sessions
      WHERE token_digest = ?
    `);
    this.#revokeByTokenDigest = database.prepare<[string, string]>(`
      UPDATE sessions
      SET revoked_at = ?
      WHERE token_digest = ? AND revoked_at IS NULL
    `);
  }

  create(session: NewSession): Session {
    this.#insert.run({
      tokenDigest: session.tokenDigest,
      accountId: session.accountId,
      createdAt: toDatabaseTimestamp(session.createdAt)!,
      expiresAt: toDatabaseTimestamp(session.expiresAt)!,
      revokedAt: toDatabaseTimestamp(session.revokedAt),
    });

    return this.findByTokenDigest(session.tokenDigest)!;
  }

  findByTokenDigest(tokenDigest: string): Session | null {
    const row = this.#findByTokenDigest.get(tokenDigest);
    return row ? toSession(row) : null;
  }

  revokeByTokenDigest(tokenDigest: string, revokedAt: Date): boolean {
    const result = this.#revokeByTokenDigest.run(toDatabaseTimestamp(revokedAt)!, tokenDigest);
    return result.changes > 0;
  }
}
