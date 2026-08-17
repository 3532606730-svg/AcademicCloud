import type { Invitation, NewInvitation } from "./invitation.js";

export interface InvitationRepository {
  create(invitation: NewInvitation): Invitation;
  findById(id: string): Invitation | null;
  findByTokenDigest(tokenDigest: string): Invitation | null;
  list(): Invitation[];
  revokeUnused(id: string, revokedAt: Date): boolean;
  consume(id: string, tokenDigest: string, accountId: string, consumedAt: Date): boolean;
}
