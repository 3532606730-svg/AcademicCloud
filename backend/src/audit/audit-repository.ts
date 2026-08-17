import type { AuditEvent, NewAuditEvent } from "./audit-event.js";

export interface AuditRepository {
  create(event: NewAuditEvent): AuditEvent;
  listBefore(beforeId: number | null, limit: number): AuditEvent[];
}
