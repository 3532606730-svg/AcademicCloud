import type { Account, AccountState, NewAccount } from "./account.js";

export interface AccountRepository {
  create(account: NewAccount): Account;
  findById(id: string): Account | null;
  findByLoginName(loginName: string): Account | null;
  count(): number;
  list(): Account[];
  updateState(id: string, expectedState: AccountState, state: AccountState, updatedAt: Date): boolean;
  updatePassword(
    id: string,
    expectedPasswordHash: string,
    expectedAuthRevision: number,
    passwordHash: string,
    updatedAt: Date,
  ): boolean;
}
