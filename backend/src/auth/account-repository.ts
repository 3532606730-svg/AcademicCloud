import type { Account, NewAccount } from "./account.js";

export interface AccountRepository {
  create(account: NewAccount): Account;
  findById(id: string): Account | null;
  findByLoginName(loginName: string): Account | null;
}
