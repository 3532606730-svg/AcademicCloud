import type { AuthenticatedAccount } from "./auth-service.js";

export class AuthorizationDeniedError extends Error {
  constructor() {
    super("Authorization denied");
    this.name = "AuthorizationDeniedError";
  }
}

export function requireOwner(account: AuthenticatedAccount | null): AuthenticatedAccount & { role: "owner" } {
  if (!account || account.role !== "owner") throw new AuthorizationDeniedError();
  return account as AuthenticatedAccount & { role: "owner" };
}
