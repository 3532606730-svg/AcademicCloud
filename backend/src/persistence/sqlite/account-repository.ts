import type { Account, AccountRole, AccountState, NewAccount } from "../../auth/account.js";
import type { AccountRepository } from "../../auth/account-repository.js";
import type { SqliteDatabase } from "./database.js";
import { fromDatabaseTimestamp, toDatabaseTimestamp } from "./records.js";

interface AccountRow {
  id: string;
  login_name: string;
  password_hash: string;
  role: AccountRole;
  auth_revision: number;
  state: Exclude<AccountState, "archived">;
  archived_at: string | null;
  created_at: string;
  updated_at: string;
}

interface AccountParameters {
  id: string;
  loginName: string;
  passwordHash: string;
  role: AccountRole;
  state: Exclude<AccountState, "archived">;
  createdAt: string;
  updatedAt: string;
}

interface AccountStateParameters {
  id: string;
  expectedState: AccountState;
  storedState: Exclude<AccountState, "archived">;
  archivedAt: string | null;
  updatedAt: string;
}

function toAccount(row: AccountRow): Account {
  return {
    id: row.id,
    loginName: row.login_name,
    passwordHash: row.password_hash,
    role: row.role,
    authRevision: row.auth_revision,
    state: row.archived_at === null ? row.state : "archived",
    createdAt: fromDatabaseTimestamp(row.created_at)!,
    updatedAt: fromDatabaseTimestamp(row.updated_at)!,
  };
}

export class SqliteAccountRepository implements AccountRepository {
  readonly #insert;
  readonly #findById;
  readonly #findByLoginName;
  readonly #count;
  readonly #list;
  readonly #updateState;
  readonly #updatePassword;
  readonly #resetPassword;

  constructor(database: SqliteDatabase) {
    this.#insert = database.prepare<AccountParameters>(`
      INSERT INTO accounts (id, login_name, password_hash, role, state, created_at, updated_at)
      VALUES (@id, @loginName, @passwordHash, @role, @state, @createdAt, @updatedAt)
    `);
    this.#findById = database.prepare<[string], AccountRow>(`
      SELECT id, login_name, password_hash, role, auth_revision, state, archived_at, created_at, updated_at
      FROM accounts
      WHERE id = ?
    `);
    this.#findByLoginName = database.prepare<[string], AccountRow>(`
      SELECT id, login_name, password_hash, role, auth_revision, state, archived_at, created_at, updated_at
      FROM accounts
      WHERE login_name = ? COLLATE NOCASE
    `);
    this.#count = database.prepare<[], { count: number }>("SELECT count(*) AS count FROM accounts");
    this.#list = database.prepare<[], AccountRow>(`
      SELECT id, login_name, password_hash, role, auth_revision, state, archived_at, created_at, updated_at
      FROM accounts
      ORDER BY created_at, id
    `);
    this.#updateState = database.prepare<AccountStateParameters>(`
      UPDATE accounts
      SET state = @storedState,
          archived_at = @archivedAt,
          updated_at = @updatedAt,
          auth_revision = auth_revision + 1
      WHERE id = @id
        AND CASE WHEN archived_at IS NOT NULL THEN 'archived' ELSE state END = @expectedState
    `);
    this.#updatePassword = database.prepare<[string, string, string, string, number]>(`
      UPDATE accounts
      SET password_hash = ?, updated_at = ?, auth_revision = auth_revision + 1
      WHERE id = ? AND state = 'active' AND archived_at IS NULL
        AND password_hash = ? AND auth_revision = ?
    `);
    this.#resetPassword = database.prepare<[string, string, string, string, number]>(`
      UPDATE accounts
      SET password_hash = ?, updated_at = ?, auth_revision = auth_revision + 1
      WHERE id = ? AND state IN ('active', 'disabled') AND archived_at IS NULL
        AND password_hash = ? AND auth_revision = ?
    `);
  }

  create(account: NewAccount): Account {
    this.#insert.run({
      id: account.id,
      loginName: account.loginName,
      passwordHash: account.passwordHash,
      role: account.role,
      state: account.state,
      createdAt: toDatabaseTimestamp(account.createdAt)!,
      updatedAt: toDatabaseTimestamp(account.updatedAt)!,
    });

    return this.findById(account.id)!;
  }

  findById(id: string): Account | null {
    const row = this.#findById.get(id);
    return row ? toAccount(row) : null;
  }

  findByLoginName(loginName: string): Account | null {
    const row = this.#findByLoginName.get(loginName);
    return row ? toAccount(row) : null;
  }

  count(): number {
    return this.#count.get()!.count;
  }

  list(): Account[] {
    return this.#list.all().map(toAccount);
  }

  updateState(id: string, expectedState: AccountState, state: AccountState, updatedAt: Date): boolean {
    const timestamp = toDatabaseTimestamp(updatedAt)!;
    return this.#updateState.run({
      id,
      expectedState,
      storedState: state === "archived" ? "disabled" : state,
      archivedAt: state === "archived" ? timestamp : null,
      updatedAt: timestamp,
    }).changes === 1;
  }

  updatePassword(
    id: string,
    expectedPasswordHash: string,
    expectedAuthRevision: number,
    passwordHash: string,
    updatedAt: Date,
  ): boolean {
    return this.#updatePassword.run(
      passwordHash,
      toDatabaseTimestamp(updatedAt)!,
      id,
      expectedPasswordHash,
      expectedAuthRevision,
    ).changes === 1;
  }

  resetPassword(
    id: string,
    expectedPasswordHash: string,
    expectedAuthRevision: number,
    passwordHash: string,
    updatedAt: Date,
  ): boolean {
    return this.#resetPassword.run(
      passwordHash,
      toDatabaseTimestamp(updatedAt)!,
      id,
      expectedPasswordHash,
      expectedAuthRevision,
    ).changes === 1;
  }
}
