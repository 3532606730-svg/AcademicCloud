import { randomUUID } from "node:crypto";

import type { AuthenticatedAccount } from "../auth/auth-service.js";
import { AuthorizationDeniedError, requireOwner } from "../auth/authorization.js";
import type { Persistence, RepositorySet } from "../persistence/contracts.js";
import type { Announcement, AnnouncementContent, AnnouncementSeverity } from "./announcement.js";

const TITLE_MAX_LENGTH = 200;
const BODY_MAX_LENGTH = 4_000;
const LINK_MAX_LENGTH = 2_048;
const VALID_SEVERITIES = new Set<AnnouncementSeverity>(["info", "warning", "critical"]);

export class AnnouncementValidationError extends Error {
  constructor(readonly code: "invalid_title" | "invalid_body" | "invalid_severity" | "invalid_link" | "invalid_expiry") {
    super(code);
    this.name = "AnnouncementValidationError";
  }
}

export class AnnouncementAdministrationError extends Error {
  constructor(readonly code: "not_found" | "invalid_state") {
    super(code);
    this.name = "AnnouncementAdministrationError";
  }
}

export interface AnnouncementServiceOptions {
  persistence: Persistence;
  now?: () => Date;
  createId?: () => string;
}

export interface AnnouncementInput {
  title: string;
  body: string;
  severity: AnnouncementSeverity;
  linkUrl: string | null;
  expiresAt: Date | null;
}

function characterLength(value: string): number {
  return Array.from(value).length;
}

function validateTitle(value: string): string {
  const title = value.trim();
  if (
    characterLength(title) < 1 ||
    characterLength(title) > TITLE_MAX_LENGTH ||
    title.includes("\0") ||
    title.includes("\n") ||
    title.includes("\r")
  ) {
    throw new AnnouncementValidationError("invalid_title");
  }
  return title;
}

function validateBody(value: string): string {
  if (
    characterLength(value) < 1 ||
    characterLength(value) > BODY_MAX_LENGTH ||
    value.trim().length === 0 ||
    value.includes("\0")
  ) {
    throw new AnnouncementValidationError("invalid_body");
  }
  return value;
}

function validateSeverity(value: AnnouncementSeverity): AnnouncementSeverity {
  if (!VALID_SEVERITIES.has(value)) throw new AnnouncementValidationError("invalid_severity");
  return value;
}

function validateLink(value: string | null): string | null {
  if (value === null) return null;
  if (value !== value.trim() || value.length === 0 || value.includes("\0") || /[\r\n]/.test(value)) {
    throw new AnnouncementValidationError("invalid_link");
  }
  let parsed: URL;
  try {
    parsed = new URL(value);
  } catch {
    throw new AnnouncementValidationError("invalid_link");
  }
  if (
    parsed.protocol !== "https:" ||
    !parsed.hostname ||
    parsed.username ||
    parsed.password ||
    characterLength(parsed.href) > LINK_MAX_LENGTH
  ) {
    throw new AnnouncementValidationError("invalid_link");
  }
  return parsed.href;
}

function validateExpiry(value: Date | null, now: Date): Date | null {
  if (value === null) return null;
  if (!Number.isFinite(value.getTime()) || value.getTime() <= now.getTime()) {
    throw new AnnouncementValidationError("invalid_expiry");
  }
  return new Date(value.getTime());
}

function validateInput(input: AnnouncementInput, now: Date): AnnouncementContent {
  return {
    title: validateTitle(input.title),
    body: validateBody(input.body),
    severity: validateSeverity(input.severity),
    linkUrl: validateLink(input.linkUrl),
    expiresAt: validateExpiry(input.expiresAt, now),
  };
}

export class AnnouncementService {
  readonly #persistence: Persistence;
  readonly #now: () => Date;
  readonly #createId: () => string;

  constructor(options: AnnouncementServiceOptions) {
    this.#persistence = options.persistence;
    this.#now = options.now ?? (() => new Date());
    this.#createId = options.createId ?? randomUUID;
  }

  create(actor: AuthenticatedAccount, input: AnnouncementInput): Announcement {
    requireOwner(actor);
    const now = this.#now();
    const content = validateInput(input, now);
    return this.#persistence.runInTransaction((repositories) => {
      this.#assertCurrentOwner(actor, repositories);
      return repositories.announcements.create({
        id: this.#createId(),
        ...content,
        isActive: false,
        publishedAt: null,
        createdByAccountId: actor.id,
        createdAt: now,
        updatedAt: now,
      });
    });
  }

  edit(actor: AuthenticatedAccount, announcementId: string, input: AnnouncementInput): Announcement {
    requireOwner(actor);
    const now = this.#now();
    const content = validateInput(input, now);
    return this.#persistence.runInTransaction((repositories) => {
      this.#assertCurrentOwner(actor, repositories);
      const current = repositories.announcements.findById(announcementId);
      if (!current) throw new AnnouncementAdministrationError("not_found");
      if (!repositories.announcements.updateContent(current.id, content, now)) {
        throw new AnnouncementAdministrationError("not_found");
      }
      return repositories.announcements.findById(current.id)!;
    });
  }

  publish(actor: AuthenticatedAccount, announcementId: string): Announcement {
    requireOwner(actor);
    const now = this.#now();
    return this.#persistence.runInTransaction((repositories) => {
      this.#assertCurrentOwner(actor, repositories);
      const current = repositories.announcements.findById(announcementId);
      if (!current) throw new AnnouncementAdministrationError("not_found");
      if (current.isActive) return current;
      if (current.expiresAt && current.expiresAt.getTime() <= now.getTime()) {
        throw new AnnouncementAdministrationError("invalid_state");
      }
      if (!repositories.announcements.publish(current.id, now)) {
        throw new AnnouncementAdministrationError("not_found");
      }
      return repositories.announcements.findById(current.id)!;
    });
  }

  unpublish(actor: AuthenticatedAccount, announcementId: string): Announcement {
    requireOwner(actor);
    const now = this.#now();
    return this.#persistence.runInTransaction((repositories) => {
      this.#assertCurrentOwner(actor, repositories);
      const current = repositories.announcements.findById(announcementId);
      if (!current) throw new AnnouncementAdministrationError("not_found");
      if (!current.isActive) return current;
      if (!repositories.announcements.unpublish(current.id, now)) {
        throw new AnnouncementAdministrationError("not_found");
      }
      return repositories.announcements.findById(current.id)!;
    });
  }

  listAll(actor: AuthenticatedAccount): Announcement[] {
    this.#assertCurrentOwner(actor, this.#persistence.repositories);
    return this.#persistence.repositories.announcements.listAll();
  }

  listEffective(actor: AuthenticatedAccount): Announcement[] {
    this.#assertCurrentActiveAccount(actor, this.#persistence.repositories);
    return this.#persistence.repositories.announcements.listEffective(this.#now());
  }

  #assertCurrentOwner(actor: AuthenticatedAccount, repositories: RepositorySet): void {
    requireOwner(actor);
    const current = repositories.accounts.findById(actor.id);
    if (!current || current.state !== "active" || current.role !== "owner") {
      throw new AuthorizationDeniedError();
    }
  }

  #assertCurrentActiveAccount(actor: AuthenticatedAccount, repositories: RepositorySet): void {
    const current = repositories.accounts.findById(actor.id);
    if (!current || current.state !== "active" || current.role !== actor.role) {
      throw new AuthorizationDeniedError();
    }
  }
}
