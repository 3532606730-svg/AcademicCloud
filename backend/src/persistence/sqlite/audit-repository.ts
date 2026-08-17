import type { AuditRepository } from "../../audit/audit-repository.js";
import type {
  AuditActorKind,
  AuditEvent,
  AuditEventKind,
  AuditOutcome,
  AuditReasonCode,
  AuditTargetType,
  NewAuditEvent,
} from "../../audit/audit-event.js";
import { AUDIT_MAX_RETAINED_ROWS } from "../../audit/audit-service.js";
import type { SqliteDatabase } from "./database.js";
import { fromDatabaseTimestamp, toDatabaseTimestamp } from "./records.js";

interface AuditRow {
  id: number;
  occurred_at: string;
  action: AuditEventKind;
  outcome: AuditOutcome;
  actor_kind: AuditActorKind;
  actor_account_id: string | null;
  target_type: AuditTargetType | null;
  target_id: string | null;
  reason: AuditReasonCode | null;
}

function toAuditEvent(row: AuditRow): AuditEvent {
  return {
    id: row.id,
    occurredAt: fromDatabaseTimestamp(row.occurred_at)!,
    action: row.action,
    outcome: row.outcome,
    actorKind: row.actor_kind,
    actorAccountId: row.actor_account_id,
    targetType: row.target_type,
    targetId: row.target_id,
    reason: row.reason,
  };
}

export class SqliteAuditRepository implements AuditRepository {
  readonly #insert;
  readonly #findById;
  readonly #listFirst;
  readonly #listBefore;
  readonly #prune;

  constructor(database: SqliteDatabase) {
    const columns = `
      events.id, events.occurred_at, events.action, events.outcome,
      events.actor_kind, events.actor_account_id, kinds.target_type,
      events.target_id, events.reason
    `;
    const from = `
      FROM governance_audit_events AS events
      JOIN governance_audit_event_kinds AS kinds ON kinds.kind = events.action
    `;
    this.#insert = database.prepare(`
      INSERT INTO governance_audit_events (
        occurred_at, action, outcome, actor_kind, actor_account_id, target_id, reason
      ) VALUES (
        @occurredAt, @action, @outcome, @actorKind, @actorAccountId, @targetId, @reason
      )
    `);
    this.#findById = database.prepare<[number], AuditRow>(`
      SELECT ${columns} ${from} WHERE events.id = ?
    `);
    this.#listFirst = database.prepare<[number], AuditRow>(`
      SELECT ${columns} ${from} ORDER BY events.id DESC LIMIT ?
    `);
    this.#listBefore = database.prepare<[number, number], AuditRow>(`
      SELECT ${columns} ${from} WHERE events.id < ? ORDER BY events.id DESC LIMIT ?
    `);
    this.#prune = database.prepare<[number]>(`
      DELETE FROM governance_audit_events
      WHERE id < COALESCE((
        SELECT MIN(id) FROM (
          SELECT id FROM governance_audit_events ORDER BY id DESC LIMIT ?
        )
      ), 0)
    `);
  }

  create(event: NewAuditEvent): AuditEvent {
    const result = this.#insert.run({
      occurredAt: toDatabaseTimestamp(event.occurredAt)!,
      action: event.action,
      outcome: event.outcome,
      actorKind: event.actorKind,
      actorAccountId: event.actorAccountId,
      targetId: event.targetId,
      reason: event.reason,
    });
    const id = Number(result.lastInsertRowid);
    this.#prune.run(AUDIT_MAX_RETAINED_ROWS);
    return toAuditEvent(this.#findById.get(id)!);
  }

  listBefore(beforeId: number | null, limit: number): AuditEvent[] {
    const rows = beforeId === null ? this.#listFirst.all(limit) : this.#listBefore.all(beforeId, limit);
    return rows.map(toAuditEvent);
  }
}
