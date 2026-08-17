import type { InvitationRepository } from "../../accounts/invitation-repository.js";
import type { Invitation, NewInvitation } from "../../accounts/invitation.js";
import type { SqliteDatabase } from "./database.js";
import { fromDatabaseTimestamp, toDatabaseTimestamp } from "./records.js";

interface InvitationRow {
  id: string;
  token_digest: string;
  created_by_account_id: string;
  created_at: string;
  expires_at: string;
  consumed_at: string | null;
  consumed_by_account_id: string | null;
  revoked_at: string | null;
}

interface InvitationParameters {
  id: string;
  tokenDigest: string;
  createdByAccountId: string;
  createdAt: string;
  expiresAt: string;
  consumedAt: string | null;
  consumedByAccountId: string | null;
  revokedAt: string | null;
}

function toInvitation(row: InvitationRow): Invitation {
  return {
    id: row.id,
    tokenDigest: row.token_digest,
    createdByAccountId: row.created_by_account_id,
    createdAt: fromDatabaseTimestamp(row.created_at)!,
    expiresAt: fromDatabaseTimestamp(row.expires_at)!,
    consumedAt: fromDatabaseTimestamp(row.consumed_at),
    consumedByAccountId: row.consumed_by_account_id,
    revokedAt: fromDatabaseTimestamp(row.revoked_at),
  };
}

export class SqliteInvitationRepository implements InvitationRepository {
  readonly #insert;
  readonly #findById;
  readonly #findByTokenDigest;
  readonly #list;
  readonly #revokeUnused;
  readonly #consume;

  constructor(database: SqliteDatabase) {
    const columns = `
      id, token_digest, created_by_account_id, created_at, expires_at,
      consumed_at, consumed_by_account_id, revoked_at
    `;
    this.#insert = database.prepare<InvitationParameters>(`
      INSERT INTO invitations (
        id, token_digest, created_by_account_id, created_at, expires_at,
        consumed_at, consumed_by_account_id, revoked_at
      ) VALUES (
        @id, @tokenDigest, @createdByAccountId, @createdAt, @expiresAt,
        @consumedAt, @consumedByAccountId, @revokedAt
      )
    `);
    this.#findById = database.prepare<[string], InvitationRow>(`
      SELECT ${columns} FROM invitations WHERE id = ?
    `);
    this.#findByTokenDigest = database.prepare<[string], InvitationRow>(`
      SELECT ${columns} FROM invitations WHERE token_digest = ?
    `);
    this.#list = database.prepare<[], InvitationRow>(`
      SELECT ${columns} FROM invitations ORDER BY created_at DESC, id
    `);
    this.#revokeUnused = database.prepare<[string, string]>(`
      UPDATE invitations SET revoked_at = ?
      WHERE id = ? AND consumed_at IS NULL AND revoked_at IS NULL
    `);
    this.#consume = database.prepare<[string, string, string, string, string]>(`
      UPDATE invitations SET consumed_at = ?, consumed_by_account_id = ?
      WHERE id = ? AND token_digest = ?
        AND consumed_at IS NULL AND revoked_at IS NULL AND expires_at > ?
    `);
  }

  create(invitation: NewInvitation): Invitation {
    this.#insert.run({
      id: invitation.id,
      tokenDigest: invitation.tokenDigest,
      createdByAccountId: invitation.createdByAccountId,
      createdAt: toDatabaseTimestamp(invitation.createdAt)!,
      expiresAt: toDatabaseTimestamp(invitation.expiresAt)!,
      consumedAt: toDatabaseTimestamp(invitation.consumedAt),
      consumedByAccountId: invitation.consumedByAccountId,
      revokedAt: toDatabaseTimestamp(invitation.revokedAt),
    });
    return this.findById(invitation.id)!;
  }

  findById(id: string): Invitation | null {
    const row = this.#findById.get(id);
    return row ? toInvitation(row) : null;
  }

  findByTokenDigest(tokenDigest: string): Invitation | null {
    const row = this.#findByTokenDigest.get(tokenDigest);
    return row ? toInvitation(row) : null;
  }

  list(): Invitation[] {
    return this.#list.all().map(toInvitation);
  }

  revokeUnused(id: string, revokedAt: Date): boolean {
    return this.#revokeUnused.run(toDatabaseTimestamp(revokedAt)!, id).changes === 1;
  }

  consume(id: string, tokenDigest: string, accountId: string, consumedAt: Date): boolean {
    const timestamp = toDatabaseTimestamp(consumedAt)!;
    return this.#consume.run(timestamp, accountId, id, tokenDigest, timestamp).changes === 1;
  }
}
