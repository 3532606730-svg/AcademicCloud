import type { CredentialReset, NewCredentialReset } from "./credential-reset.js";

export interface CredentialResetRepository {
  create(reset: NewCredentialReset): CredentialReset;
  findByTokenDigest(tokenDigest: string): CredentialReset | null;
  supersedeOutstanding(accountId: string, supersededAt: Date): number;
  consume(id: string, tokenDigest: string, consumedAt: Date): boolean;
}
