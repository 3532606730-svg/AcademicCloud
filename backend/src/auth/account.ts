export const ACCOUNT_STATES = ["active", "disabled"] as const;
export const ACCOUNT_ROLES = ["owner", "member"] as const;

export type AccountState = (typeof ACCOUNT_STATES)[number];
export type AccountRole = (typeof ACCOUNT_ROLES)[number];

export interface Account {
  id: string;
  loginName: string;
  passwordHash: string;
  role: AccountRole;
  authRevision: number;
  state: AccountState;
  createdAt: Date;
  updatedAt: Date;
}

export type NewAccount = Omit<Account, "authRevision">;
