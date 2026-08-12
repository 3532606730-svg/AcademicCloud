import type { NewSession, Session } from "./session.js";

export interface SessionRepository {
  create(session: NewSession): Session;
  findByTokenDigest(tokenDigest: string): Session | null;
  revokeByTokenDigest(tokenDigest: string, revokedAt: Date): boolean;
  countExpired(before: Date, limit: number): number;
  pruneExpired(before: Date, limit: number): number;
}
