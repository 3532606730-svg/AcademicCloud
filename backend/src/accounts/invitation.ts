export interface Invitation {
  id: string;
  tokenDigest: string;
  createdByAccountId: string;
  createdAt: Date;
  expiresAt: Date;
  consumedAt: Date | null;
  consumedByAccountId: string | null;
  revokedAt: Date | null;
}

export type NewInvitation = Invitation;
