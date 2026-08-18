export interface CredentialReset {
  id: string;
  tokenDigest: string;
  accountId: string;
  issuedByAccountId: string;
  createdAt: Date;
  expiresAt: Date;
  consumedAt: Date | null;
  supersededAt: Date | null;
}

export type NewCredentialReset = CredentialReset;
