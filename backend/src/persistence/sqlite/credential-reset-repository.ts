import type { CredentialResetRepository } from "../../auth/credential-reset-repository.js";
import type { CredentialReset, NewCredentialReset } from "../../auth/credential-reset.js";
import type { SqliteDatabase } from "./database.js";
import { fromDatabaseTimestamp, toDatabaseTimestamp } from "./records.js";

interface CredentialResetRow {
  id: string;
  token_digest: string;
  account_id: string;
  issued_by_account_id: string;
  created_at: string;
  expires_at: string;
  consumed_at: string | null;
  superseded_at: string | null;
}

interface CredentialResetParameters {
  id: string;
  tokenDigest: string;
  accountId: string;
  issuedByAccountId: string;
  createdAt: string;
  expiresAt: string;
  consumedAt: string | null;
  supersededAt: string | null;
}

function toCredentialReset(row: CredentialResetRow): CredentialReset {
  return {
    id: row.id,
    tokenDigest: row.token_digest,
    accountId: row.account_id,
    issuedByAccountId: row.issued_by_account_id,
    createdAt: fromDatabaseTimestamp(row.created_at)!,
    expiresAt: fromDatabaseTimestamp(row.expires_at)!,
    consumedAt: fromDatabaseTimestamp(row.consumed_at),
    supersededAt: fromDatabaseTimestamp(row.superseded_at),
  };
}

export class SqliteCredentialResetRepository implements CredentialResetRepository {
  readonly #insert;
  readonly #findByTokenDigest;
  readonly #supersedeOutstanding;
  readonly #consume;

  constructor(database: SqliteDatabase) {
    this.#insert = database.prepare<CredentialResetParameters>(`
      INSERT INTO credential_resets (
        id, token_digest, account_id, issued_by_account_id,
        created_at, expires_at, consumed_at, superseded_at
      ) VALUES (
        @id, @tokenDigest, @accountId, @issuedByAccountId,
        @createdAt, @expiresAt, @consumedAt, @supersededAt
      )
    `);
    this.#findByTokenDigest = database.prepare<[string], CredentialResetRow>(`
      SELECT id, token_digest, account_id, issued_by_account_id,
             created_at, expires_at, consumed_at, superseded_at
      FROM credential_resets
      WHERE token_digest = ?
    `);
    this.#supersedeOutstanding = database.prepare<[string, string]>(`
      UPDATE credential_resets
      SET superseded_at = ?
      WHERE account_id = ? AND consumed_at IS NULL AND superseded_at IS NULL
    `);
    this.#consume = database.prepare<[string, string, string, string]>(`
      UPDATE credential_resets
      SET consumed_at = ?
      WHERE id = ? AND token_digest = ?
        AND consumed_at IS NULL AND superseded_at IS NULL AND expires_at > ?
    `);
  }

  create(reset: NewCredentialReset): CredentialReset {
    this.#insert.run({
      id: reset.id,
      tokenDigest: reset.tokenDigest,
      accountId: reset.accountId,
      issuedByAccountId: reset.issuedByAccountId,
      createdAt: toDatabaseTimestamp(reset.createdAt)!,
      expiresAt: toDatabaseTimestamp(reset.expiresAt)!,
      consumedAt: toDatabaseTimestamp(reset.consumedAt),
      supersededAt: toDatabaseTimestamp(reset.supersededAt),
    });
    return this.findByTokenDigest(reset.tokenDigest)!;
  }

  findByTokenDigest(tokenDigest: string): CredentialReset | null {
    const row = this.#findByTokenDigest.get(tokenDigest);
    return row ? toCredentialReset(row) : null;
  }

  supersedeOutstanding(accountId: string, supersededAt: Date): number {
    return this.#supersedeOutstanding.run(toDatabaseTimestamp(supersededAt)!, accountId).changes;
  }

  consume(id: string, tokenDigest: string, consumedAt: Date): boolean {
    const timestamp = toDatabaseTimestamp(consumedAt)!;
    return this.#consume.run(timestamp, id, tokenDigest, timestamp).changes === 1;
  }
}
