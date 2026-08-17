import { randomUUID } from "node:crypto";

import { validateLoginName, validatePassword } from "../auth/account-validation.js";
import type { PasswordHasher } from "../auth/password-hasher.js";
import type { Persistence } from "../persistence/contracts.js";
import { recordAuditEvent } from "../audit/audit-service.js";

export { validateLoginName } from "../auth/account-validation.js";

export async function provisionAccount(
  persistence: Persistence,
  passwordHasher: PasswordHasher,
  loginNameValue: string,
  password: string,
  now: () => Date = () => new Date(),
): Promise<{ id: string; loginName: string }> {
  const loginName = validateLoginName(loginNameValue);
  validatePassword(password);
  if (persistence.repositories.accounts.count() !== 0) throw new Error("first Owner already exists");

  const passwordHash = await passwordHasher.hash(password);
  const timestamp = now();
  const account = persistence.runInTransaction((repositories) => {
    if (repositories.accounts.count() !== 0) throw new Error("first Owner already exists");
    const account = repositories.accounts.create({
      id: randomUUID(),
      loginName,
      passwordHash,
      role: "owner",
      state: "active",
      createdAt: timestamp,
      updatedAt: timestamp,
    });
    recordAuditEvent(repositories, {
      action: "accounts.owner_bootstrap",
      outcome: "succeeded",
      actorKind: "system",
      actorAccountId: null,
      targetId: account.id,
      reason: null,
      occurredAt: timestamp,
    });
    return account;
  });

  return { id: account.id, loginName: account.loginName };
}
