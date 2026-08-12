import type { Account, AccountState, NewAccount } from "../../auth/account.js";
import type { AccountRepository } from "../../auth/account-repository.js";
import type { SqliteDatabase } from "./database.js";
import { fromDatabaseTimestamp, toDatabaseTimestamp } from "./records.js";

interface AccountRow {
  id: string;
  login_name: string;
  password_hash: string;
  state: AccountState;
  created_at: string;
  updated_at: string;
}

interface AccountParameters {
  id: string;
  loginName: string;
  passwordHash: string;
  state: AccountState;
  createdAt: string;
  updatedAt: string;
}

function toAccount(row: AccountRow): Account {
  return {
    id: row.id,
    loginName: row.login_name,
    passwordHash: row.password_hash,
    state: row.state,
    createdAt: fromDatabaseTimestamp(row.created_at)!,
    updatedAt: fromDatabaseTimestamp(row.updated_at)!,
  };
}

export class SqliteAccountRepository implements AccountRepository {
  readonly #insert;
  readonly #findById;
  readonly #findByLoginName;

  constructor(database: SqliteDatabase) {
    this.#insert = database.prepare<AccountParameters>(`
      INSERT INTO accounts (id, login_name, password_hash, state, created_at, updated_at)
      VALUES (@id, @loginName, @passwordHash, @state, @createdAt, @updatedAt)
    `);
    this.#findById = database.prepare<[string], AccountRow>(`
      SELECT id, login_name, password_hash, state, created_at, updated_at
      FROM accounts
      WHERE id = ?
    `);
    this.#findByLoginName = database.prepare<[string], AccountRow>(`
      SELECT id, login_name, password_hash, state, created_at, updated_at
      FROM accounts
      WHERE login_name = ? COLLATE NOCASE
    `);
  }

  create(account: NewAccount): Account {
    this.#insert.run({
      id: account.id,
      loginName: account.loginName,
      passwordHash: account.passwordHash,
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
}
