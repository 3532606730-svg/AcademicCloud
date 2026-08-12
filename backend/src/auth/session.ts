export interface Session {
  tokenDigest: string;
  accountId: string;
  createdAt: Date;
  expiresAt: Date;
  revokedAt: Date | null;
}

export type NewSession = Session;
