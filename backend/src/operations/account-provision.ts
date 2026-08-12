import { randomUUID } from "node:crypto";

import type { PasswordHasher } from "../auth/password-hasher.js";
import type { Persistence } from "../persistence/contracts.js";

export function validateLoginName(value: string): string {
  if (value.length < 1 || value.length > 254 || value !== value.trim() || /\s/.test(value)) {
    throw new Error("login name must be 1-254 non-whitespace characters without surrounding space");
  }

  return value;
}

export async function provisionAccount(
  persistence: Persistence,
  passwordHasher: PasswordHasher,
  loginNameValue: string,
  password: string,
  now: () => Date = () => new Date(),
): Promise<{ id: string; loginName: string }> {
  const loginName = validateLoginName(loginNameValue);

  if (password.length < 12 || password.length > 1_024) {
    throw new Error("password must be 12-1024 characters");
  }

  if (persistence.repositories.accounts.findByLoginName(loginName)) {
    throw new Error("account already exists");
  }

  const passwordHash = await passwordHasher.hash(password);
  const timestamp = now();
  const account = persistence.repositories.accounts.create({
    id: randomUUID(),
    loginName,
    passwordHash,
    state: "active",
    createdAt: timestamp,
    updatedAt: timestamp,
  });

  return { id: account.id, loginName: account.loginName };
}
