import type { AnnouncementRepository } from "../../announcements/announcement-repository.js";
import type { Announcement, AnnouncementContent, NewAnnouncement } from "../../announcements/announcement.js";
import type { SqliteDatabase } from "./database.js";
import { fromDatabaseTimestamp, toDatabaseTimestamp } from "./records.js";

interface AnnouncementRow {
  id: string;
  title: string;
  body: string;
  severity: Announcement["severity"];
  link_url: string | null;
  is_active: number;
  published_at: string | null;
  expires_at: string | null;
  created_by_account_id: string;
  created_at: string;
  updated_at: string;
}

function toAnnouncement(row: AnnouncementRow): Announcement {
  return {
    id: row.id,
    title: row.title,
    body: row.body,
    severity: row.severity,
    linkUrl: row.link_url,
    isActive: row.is_active === 1,
    publishedAt: fromDatabaseTimestamp(row.published_at),
    expiresAt: fromDatabaseTimestamp(row.expires_at),
    createdByAccountId: row.created_by_account_id,
    createdAt: fromDatabaseTimestamp(row.created_at)!,
    updatedAt: fromDatabaseTimestamp(row.updated_at)!,
  };
}

export class SqliteAnnouncementRepository implements AnnouncementRepository {
  readonly #insert;
  readonly #findById;
  readonly #listAll;
  readonly #listEffective;
  readonly #updateContent;
  readonly #publish;
  readonly #unpublish;

  constructor(database: SqliteDatabase) {
    const columns = `
      id, title, body, severity, link_url, is_active, published_at,
      expires_at, created_by_account_id, created_at, updated_at
    `;
    this.#insert = database.prepare(`
      INSERT INTO announcements (${columns}) VALUES (
        @id, @title, @body, @severity, @linkUrl, @isActive, @publishedAt,
        @expiresAt, @createdByAccountId, @createdAt, @updatedAt
      )
    `);
    this.#findById = database.prepare<[string], AnnouncementRow>(`
      SELECT ${columns} FROM announcements WHERE id = ?
    `);
    this.#listAll = database.prepare<[], AnnouncementRow>(`
      SELECT ${columns} FROM announcements ORDER BY updated_at DESC, id
    `);
    this.#listEffective = database.prepare<[string, string], AnnouncementRow>(`
      SELECT ${columns} FROM announcements
      WHERE is_active = 1
        AND published_at IS NOT NULL
        AND published_at <= ?
        AND (expires_at IS NULL OR expires_at > ?)
      ORDER BY published_at DESC, created_at DESC, id
    `);
    this.#updateContent = database.prepare(`
      UPDATE announcements
      SET title = @title, body = @body, severity = @severity,
          link_url = @linkUrl, expires_at = @expiresAt, updated_at = @updatedAt
      WHERE id = @id
    `);
    this.#publish = database.prepare<[string, string, string]>(`
      UPDATE announcements SET is_active = 1, published_at = ?, updated_at = ?
      WHERE id = ?
    `);
    this.#unpublish = database.prepare<[string, string]>(`
      UPDATE announcements SET is_active = 0, updated_at = ? WHERE id = ?
    `);
  }

  create(announcement: NewAnnouncement): Announcement {
    this.#insert.run({
      id: announcement.id,
      title: announcement.title,
      body: announcement.body,
      severity: announcement.severity,
      linkUrl: announcement.linkUrl,
      isActive: announcement.isActive ? 1 : 0,
      publishedAt: toDatabaseTimestamp(announcement.publishedAt),
      expiresAt: toDatabaseTimestamp(announcement.expiresAt),
      createdByAccountId: announcement.createdByAccountId,
      createdAt: toDatabaseTimestamp(announcement.createdAt)!,
      updatedAt: toDatabaseTimestamp(announcement.updatedAt)!,
    });
    return this.findById(announcement.id)!;
  }

  findById(id: string): Announcement | null {
    const row = this.#findById.get(id);
    return row ? toAnnouncement(row) : null;
  }

  listAll(): Announcement[] {
    return this.#listAll.all().map(toAnnouncement);
  }

  listEffective(now: Date): Announcement[] {
    const timestamp = toDatabaseTimestamp(now)!;
    return this.#listEffective.all(timestamp, timestamp).map(toAnnouncement);
  }

  updateContent(id: string, content: AnnouncementContent, updatedAt: Date): boolean {
    return this.#updateContent.run({
      id,
      title: content.title,
      body: content.body,
      severity: content.severity,
      linkUrl: content.linkUrl,
      expiresAt: toDatabaseTimestamp(content.expiresAt),
      updatedAt: toDatabaseTimestamp(updatedAt)!,
    }).changes === 1;
  }

  publish(id: string, publishedAt: Date): boolean {
    const timestamp = toDatabaseTimestamp(publishedAt)!;
    return this.#publish.run(timestamp, timestamp, id).changes === 1;
  }

  unpublish(id: string, updatedAt: Date): boolean {
    return this.#unpublish.run(toDatabaseTimestamp(updatedAt)!, id).changes === 1;
  }
}
