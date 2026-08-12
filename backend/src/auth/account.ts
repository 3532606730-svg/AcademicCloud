export const ACCOUNT_STATES = ["active", "disabled"] as const;

export type AccountState = (typeof ACCOUNT_STATES)[number];

export interface Account {
  id: string;
  loginName: string;
  passwordHash: string;
  state: AccountState;
  createdAt: Date;
  updatedAt: Date;
}

export type NewAccount = Account;
