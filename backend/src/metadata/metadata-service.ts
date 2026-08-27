import { createHash, randomUUID } from "node:crypto";

import type { AuthenticatedAccount } from "../auth/auth-service.js";
import type { Persistence, RepositorySet } from "../persistence/contracts.js";
import { recordAuditEvent, tryRecordAuditAttempt } from "../audit/audit-service.js";
import type { AuditEventKind, AuditReasonCode } from "../audit/audit-event.js";
import type { Library, LibraryHolding, LibraryMembership } from "../library/library.js";
import { composeCatalogueDisplay } from "../library/catalogue-display.js";
import {
  BIBLIOGRAPHIC_FIELD_NAMES,
  BibliographyValidationError,
  changedBibliographicFields,
  normalizeBibliographicProfileInput,
  type BibliographicFieldAuthority,
  type BibliographicFieldName,
  type BibliographicProfile,
  type BibliographicProfileInput,
} from "../bibliography/bibliography.js";
import {
  AUTHORITY_ROLES,
  AUTHORITY_ROLES_BY_TYPE,
  AUTHORITY_TYPES,
  MATERIAL_TYPES,
  TYPE_FIELDS_BY_MATERIAL,
  TYPE_FIELD_NAMES,
  type AuthorityInput,
  type AuthorityRole,
  type AuthorityType,
  type CanonicalMetadata,
  type CanonicalMetadataInput,
  type MaterialType,
  type ScholarlyAuthority,
  type TypeFieldName,
} from "./metadata.js";

export type MetadataErrorCode =
  | "not_found"
  | "authorization_denied"
  | "invalid_input"
  | "conflict"
  | "concurrent_change"
  | "incompatible_type_transition";

export class MetadataError extends Error {
  constructor(readonly code: MetadataErrorCode, options?: ErrorOptions) {
    super(code, options);
    this.name = "MetadataError";
  }
}

export interface PublicAuthority {
  id: string;
  type: AuthorityType;
  canonicalLabel: string;
  aliases: string[];
  version: string;
}

export interface PublicMetadataAuthorityLink extends PublicAuthority {
  role: AuthorityRole;
}

export interface PublicMetadata {
  contractVersion: 1;
  materialType: MaterialType;
  canonicalTitle: string;
  subtitle: string | null;
  alternativeTitles: string[];
  dateStatement: string | null;
  identifiers: Array<{ scheme: string; value: string }>;
  typeFields: Partial<Record<TypeFieldName, string>>;
  authorityLinks: PublicMetadataAuthorityLink[];
}

export interface MetadataDetail {
  displayTitle: string;
  originalFilename: string;
  metadataVersion: string;
  metadata: PublicMetadata | null;
  bibliographyVersion: string;
  bibliography: PublicBibliographicProfile | null;
  fieldAuthorities: PublicFieldAuthority[];
  canEditMetadata: boolean;
  file: {
    id: string;
    mediaType: string | null;
    sizeBytes: number;
    updatedAt: string;
  };
}

export interface PublicBibliographicProfile extends BibliographicProfileInput {
  contractVersion: 1;
  contributors: BibliographicProfile["contributors"];
}

export interface PublicFieldAuthority {
  fieldName: BibliographicFieldName;
  scopeKey: string;
  source: "human" | "ai";
  sourceRunId?: string;
  establishedAt: string;
}

export interface AuthorityPage {
  authorities: PublicAuthority[];
  nextBeforeId: string | null;
}

const CONTROL_CHARACTERS = /[\u0000-\u001f\u007f-\u009f]/u;
const OPAQUE_VERSION = /^[A-Za-z0-9_-]{43}$/u;
const SAFE_ID = /^[A-Za-z0-9_-]{1,128}$/u;
const IDENTIFIER_SCHEME = /^[a-z][a-z0-9._-]{0,31}$/u;

const FIELD_LIMITS: Readonly<Record<TypeFieldName, number>> = {
  editionStatement: 128,
  volumeStatement: 128,
  issueStatement: 64,
  locator: 128,
  shelfmark: 128,
  supportStatement: 128,
  extentStatement: 128,
  scriptStatement: 128,
  objectType: 128,
  materialStatement: 128,
  dimensionsStatement: 128,
  documentType: 128,
  fondsOrCollection: 255,
  seriesStatement: 255,
  referenceCode: 128,
};

function normalizeText(value: unknown, maximum: number): string {
  if (typeof value !== "string") throw new MetadataError("invalid_input");
  const normalized = value.normalize("NFC").trim();
  if (!normalized || [...normalized].length > maximum || CONTROL_CHARACTERS.test(normalized)) {
    throw new MetadataError("invalid_input");
  }
  return normalized;
}

function isPlainObject(value: unknown): value is Record<string, unknown> {
  return typeof value === "object" && value !== null && !Array.isArray(value);
}

function optionalText(value: unknown, maximum: number): string | undefined {
  if (value === undefined || value === null) return undefined;
  return normalizeText(value, maximum);
}

function enumValue<T extends readonly string[]>(value: unknown, values: T): T[number] {
  if (typeof value !== "string" || !(values as readonly string[]).includes(value)) {
    throw new MetadataError("invalid_input");
  }
  return value as T[number];
}

function normalizeMetadataInput(value: unknown): CanonicalMetadataInput {
  if (!isPlainObject(value)) throw new MetadataError("invalid_input");
  const allowedKeys = new Set(["materialType", "canonicalTitle", "subtitle", "alternativeTitles", "dateStatement", "identifiers", "typeFields", "authorityLinks"]);
  if (Object.keys(value).some((key) => !allowedKeys.has(key))) throw new MetadataError("invalid_input");
  const materialType = enumValue(value.materialType, MATERIAL_TYPES);
  const canonicalTitle = normalizeText(value.canonicalTitle, 512);
  const subtitle = optionalText(value.subtitle, 512);
  const dateStatement = optionalText(value.dateStatement, 128);
  const alternativeValue = value.alternativeTitles;
  if (!Array.isArray(alternativeValue) || alternativeValue.length > 8) throw new MetadataError("invalid_input");
  const alternativeTitles = alternativeValue.map((item) => normalizeText(item, 512));
  const titleSet = new Set([canonicalTitle, ...(subtitle ? [subtitle] : [])]);
  const alternatives = new Set<string>();
  for (const title of alternativeTitles) {
    if (titleSet.has(title) || alternatives.has(title)) throw new MetadataError("invalid_input");
    alternatives.add(title);
  }

  if (!Array.isArray(value.identifiers) || value.identifiers.length > 8) throw new MetadataError("invalid_input");
  const identifiers = value.identifiers.map((item): { scheme: string; value: string } => {
    if (!isPlainObject(item)) throw new MetadataError("invalid_input");
    const scheme = normalizeText(item.scheme, 32).toLowerCase();
    const identifierValue = normalizeText(item.value, 128);
    if (!IDENTIFIER_SCHEME.test(scheme)) throw new MetadataError("invalid_input");
    return { scheme, value: identifierValue };
  });
  const identifierKeys = new Set(identifiers.map((identifier) => `${identifier.scheme}\u0000${identifier.value}`));
  if (identifierKeys.size !== identifiers.length) throw new MetadataError("invalid_input");

  if (!isPlainObject(value.typeFields)) throw new MetadataError("invalid_input");
  const allowedFields = new Set(TYPE_FIELDS_BY_MATERIAL[materialType]);
  const typeFields: Partial<Record<TypeFieldName, string>> = {};
  for (const [key, fieldValue] of Object.entries(value.typeFields)) {
    if (!(TYPE_FIELD_NAMES as readonly string[]).includes(key) || !allowedFields.has(key as TypeFieldName)) {
      throw new MetadataError("invalid_input");
    }
    typeFields[key as TypeFieldName] = normalizeText(fieldValue, FIELD_LIMITS[key as TypeFieldName]);
  }

  if (!Array.isArray(value.authorityLinks) || value.authorityLinks.length > 32) throw new MetadataError("invalid_input");
  const authorityLinks = value.authorityLinks.map((item): { authorityId: string; role: AuthorityRole } => {
    if (!isPlainObject(item) || typeof item.authorityId !== "string" || !SAFE_ID.test(item.authorityId)) throw new MetadataError("invalid_input");
    const role = enumValue(item.role, AUTHORITY_ROLES);
    return { authorityId: item.authorityId, role };
  });
  const linkKeys = new Set(authorityLinks.map((link) => `${link.authorityId}\u0000${link.role}`));
  if (linkKeys.size !== authorityLinks.length) throw new MetadataError("invalid_input");

  return {
    materialType,
    canonicalTitle,
    ...(subtitle === undefined ? {} : { subtitle }),
    alternativeTitles,
    ...(dateStatement === undefined ? {} : { dateStatement }),
    identifiers,
    typeFields,
    authorityLinks,
  };
}

function normalizeAuthorityInput(value: unknown): AuthorityInput {
  if (!isPlainObject(value)) throw new MetadataError("invalid_input");
  const allowedKeys = new Set(["type", "canonicalLabel", "aliases"]);
  if (Object.keys(value).some((key) => !allowedKeys.has(key))) throw new MetadataError("invalid_input");
  const type = enumValue(value.type, AUTHORITY_TYPES);
  if (!Array.isArray(value.aliases) || value.aliases.length > 8) throw new MetadataError("invalid_input");
  const canonicalLabel = normalizeText(value.canonicalLabel, 255);
  const aliases = value.aliases.map((alias) => normalizeText(alias, 255));
  const seen = new Set<string>();
  for (const alias of aliases) {
    if (alias === canonicalLabel || seen.has(alias)) throw new MetadataError("invalid_input");
    seen.add(alias);
  }
  return { type, canonicalLabel, aliases };
}

function authorityVersion(authority: ScholarlyAuthority): string {
  return createHash("sha256")
    .update(JSON.stringify(["authority", authority.id, authority.revision, authority.updatedAt.toISOString()]))
    .digest("base64url");
}

function metadataVersion(recordId: string, metadata: CanonicalMetadata | null): string {
  return createHash("sha256")
    .update(JSON.stringify([
      "metadata",
      recordId,
      metadata === null ? "absent" : [metadata.revision, metadata.updatedAt.toISOString()],
    ]))
    .digest("base64url");
}

function bibliographyVersion(recordId: string, profile: BibliographicProfile | null): string {
  return createHash("sha256")
    .update(JSON.stringify([
      "bibliography",
      recordId,
      profile === null ? "absent" : [profile.revision, profile.updatedAt.toISOString()],
    ]))
    .digest("base64url");
}

function publicBibliography(profile: BibliographicProfile): PublicBibliographicProfile {
  return {
    contractVersion: 1,
    materialClass: profile.materialClass,
    contributors: profile.contributors.map((contributor) => ({ ...contributor })),
    publication: { ...profile.publication },
    ...(profile.series === undefined ? {} : { series: profile.series }),
    ...(profile.volume === undefined ? {} : { volume: profile.volume }),
    ...(profile.language === undefined ? {} : { language: profile.language }),
    carrierEdition: { ...profile.carrierEdition },
    sourceEdition: { ...profile.sourceEdition },
  };
}

function publicFieldAuthority(authority: BibliographicFieldAuthority): PublicFieldAuthority {
  return {
    fieldName: authority.fieldName,
    scopeKey: authority.scopeKey,
    source: authority.source,
    ...(authority.sourceRunId === undefined ? {} : { sourceRunId: authority.sourceRunId }),
    establishedAt: authority.establishedAt.toISOString(),
  };
}

function publicAuthority(authority: ScholarlyAuthority): PublicAuthority {
  return {
    id: authority.id,
    type: authority.type,
    canonicalLabel: authority.canonicalLabel,
    aliases: [...authority.aliases],
    version: authorityVersion(authority),
  };
}

function reasonFor(error: unknown): AuditReasonCode {
  if (error instanceof MetadataError) {
    switch (error.code) {
      case "authorization_denied": return "authorization_denied";
      case "not_found": return "not_found";
      case "invalid_input": return "invalid_input";
      case "conflict": return "invalid_state";
      case "concurrent_change":
      case "incompatible_type_transition": return "concurrent_change";
    }
  }
  return "storage_unavailable";
}

function isConstraintError(error: unknown): boolean {
  return error instanceof Error && /constraint|unique|foreign key/i.test(error.message);
}

export class CanonicalMetadataService {
  readonly #persistence: Persistence;
  readonly #now: () => Date;
  readonly #createId: () => string;

  constructor(
    persistence: Persistence,
    now: () => Date = () => new Date(),
    createId: () => string = randomUUID,
  ) {
    this.#persistence = persistence;
    this.#now = now;
    this.#createId = createId;
  }

  recordAuditAttempt(
    actor: AuthenticatedAccount,
    action: Extract<AuditEventKind, "libraries.metadata_update" | "libraries.authority_create" | "libraries.authority_update">,
    error: unknown,
  ): boolean {
    return tryRecordAuditAttempt(this.#persistence, {
      action,
      actorKind: "account",
      actorAccountId: actor.id,
      targetId: null,
      outcome: reasonFor(error) === "storage_unavailable" ? "failed" : "denied",
      reason: reasonFor(error),
      occurredAt: this.#now(),
    });
  }

  getDetails(actor: AuthenticatedAccount, libraryId: string, fileId: string): MetadataDetail {
    return this.#persistence.runInTransaction((repositories) => {
      const { library, membership, holding } = this.#resolveMemberHolding(actor, libraryId, fileId, repositories);
      return this.#detail(repositories, library, membership, holding);
    });
  }

  updateMetadata(actor: AuthenticatedAccount, libraryId: string, fileId: string, expectedVersion: string, value: unknown): MetadataDetail {
    if (!OPAQUE_VERSION.test(expectedVersion)) throw new MetadataError("invalid_input");
    const input = normalizeMetadataInput(value);
    return this.#persistence.runInTransaction((repositories) => {
      const { library, membership, holding } = this.#resolveMemberHolding(actor, libraryId, fileId, repositories);
      if (membership.role !== "manager") throw new MetadataError("not_found");
      const current = repositories.metadata.findMetadata(library.ownerDomainId, holding.recordId);
      if (metadataVersion(holding.recordId, current) !== expectedVersion) throw new MetadataError("concurrent_change");
      if (current && current.materialType !== input.materialType && Object.keys(current.typeFields).length > 0) {
        throw new MetadataError("incompatible_type_transition");
      }
      for (const link of input.authorityLinks) {
        const authority = repositories.metadata.findAuthority(library.ownerDomainId, link.authorityId);
        if (!authority || !AUTHORITY_ROLES_BY_TYPE[authority.type].includes(link.role)) {
          throw new MetadataError("not_found");
        }
      }
      const saved = repositories.metadata.saveMetadata({
        ...input,
        recordId: holding.recordId,
        ownerDomainId: library.ownerDomainId,
        actorAccountId: actor.id,
        expectedRevision: current?.revision ?? null,
        now: this.#now(),
      });
      if (!saved) throw new MetadataError("concurrent_change");
      const now = this.#now();
      for (const fieldName of changedLegacyHumanFields(current, saved)) {
        repositories.bibliography.setFieldAuthority({
          recordId: holding.recordId,
          ownerDomainId: library.ownerDomainId,
          fieldName,
          scopeKey: "",
          source: "human",
          actorAccountId: actor.id,
          now,
        });
      }
      recordAuditEvent(repositories, {
        action: "libraries.metadata_update",
        actorKind: "account",
        actorAccountId: actor.id,
        targetId: holding.recordId,
        outcome: "succeeded",
        reason: null,
        occurredAt: now,
      });
      return this.#detail(repositories, library, membership, holding);
    });
  }

  updateBibliography(
    actor: AuthenticatedAccount,
    libraryId: string,
    fileId: string,
    expectedVersion: string,
    value: unknown,
  ): MetadataDetail {
    if (!OPAQUE_VERSION.test(expectedVersion)) throw new MetadataError("invalid_input");
    let normalized: BibliographicProfileInput;
    try {
      normalized = normalizeBibliographicProfileInput(value);
    } catch (error: unknown) {
      if (error instanceof BibliographyValidationError) throw new MetadataError("invalid_input", { cause: error });
      throw error;
    }
    return this.#persistence.runInTransaction((repositories) => {
      const { library, membership, holding } = this.#resolveMemberHolding(actor, libraryId, fileId, repositories);
      if (membership.role !== "manager") throw new MetadataError("not_found");
      const current = repositories.bibliography.findProfile(library.ownerDomainId, holding.recordId);
      if (bibliographyVersion(holding.recordId, current) !== expectedVersion) throw new MetadataError("concurrent_change");
      const currentIds = new Set(current?.contributors.map((contributor) => contributor.id) ?? []);
      const input: BibliographicProfileInput = {
        ...normalized,
        contributors: normalized.contributors.map((contributor) => ({
          ...contributor,
          id: contributor.id && currentIds.has(contributor.id) ? contributor.id : this.#createId(),
        })),
      };
      for (const contributor of input.contributors) {
        if (!contributor.authorityId) continue;
        const authority = repositories.metadata.findAuthority(library.ownerDomainId, contributor.authorityId);
        if (!authority || authority.type !== "person"
          || (authority.canonicalLabel !== contributor.label && !authority.aliases.includes(contributor.label))) {
          throw new MetadataError("not_found");
        }
      }
      const saved = repositories.bibliography.saveProfile({
        ...input,
        recordId: holding.recordId,
        ownerDomainId: library.ownerDomainId,
        actorAccountId: actor.id,
        expectedRevision: current?.revision ?? null,
        now: this.#now(),
      });
      if (!saved) throw new MetadataError("concurrent_change");
      const now = this.#now();
      for (const field of changedBibliographicFields(current, saved)) {
        repositories.bibliography.setFieldAuthority({
          recordId: holding.recordId,
          ownerDomainId: library.ownerDomainId,
          fieldName: field.fieldName,
          scopeKey: field.scopeKey,
          source: "human",
          actorAccountId: actor.id,
          now,
        });
      }
      recordAuditEvent(repositories, {
        action: "libraries.metadata_update",
        actorKind: "account",
        actorAccountId: actor.id,
        targetId: holding.recordId,
        outcome: "succeeded",
        reason: null,
        occurredAt: now,
      });
      return this.#detail(repositories, library, membership, holding);
    });
  }

  resetBibliographicFieldAuthority(
    actor: AuthenticatedAccount,
    libraryId: string,
    fileId: string,
    expectedVersion: string,
    fields: unknown,
  ): MetadataDetail {
    if (!OPAQUE_VERSION.test(expectedVersion) || !Array.isArray(fields) || fields.length < 1 || fields.length > 64) {
      throw new MetadataError("invalid_input");
    }
    const registry = new Set<string>(BIBLIOGRAPHIC_FIELD_NAMES);
    const normalized = fields.map((entry): { fieldName: BibliographicFieldName; scopeKey: string } => {
      if (!isPlainObject(entry) || typeof entry.fieldName !== "string" || !registry.has(entry.fieldName)
        || typeof entry.scopeKey !== "string" || (entry.scopeKey !== "" && !SAFE_ID.test(entry.scopeKey))) {
        throw new MetadataError("invalid_input");
      }
      const fieldName = entry.fieldName as BibliographicFieldName;
      if (fieldName.startsWith("contributor.") !== Boolean(entry.scopeKey)) throw new MetadataError("invalid_input");
      return { fieldName, scopeKey: entry.scopeKey };
    });
    return this.#persistence.runInTransaction((repositories) => {
      const { library, membership, holding } = this.#resolveMemberHolding(actor, libraryId, fileId, repositories);
      if (membership.role !== "manager") throw new MetadataError("not_found");
      const current = repositories.bibliography.findProfile(library.ownerDomainId, holding.recordId);
      if (bibliographyVersion(holding.recordId, current) !== expectedVersion) throw new MetadataError("concurrent_change");
      repositories.bibliography.clearFieldAuthorities(library.ownerDomainId, holding.recordId, normalized);
      recordAuditEvent(repositories, {
        action: "libraries.metadata_update",
        actorKind: "account",
        actorAccountId: actor.id,
        targetId: holding.recordId,
        outcome: "succeeded",
        reason: null,
        occurredAt: this.#now(),
      });
      return this.#detail(repositories, library, membership, holding);
    });
  }

  findUniqueExactPersonAuthority(ownerDomainId: string, label: string): ScholarlyAuthority | null {
    const normalized = normalizeText(label, 255);
    const matches = this.#persistence.repositories.bibliography.findExactPersonAuthorities(ownerDomainId, normalized);
    return matches.length === 1 ? matches[0]! : null;
  }

  listAuthorities(actor: AuthenticatedAccount, libraryId: string, type: AuthorityType, beforeId: string | null, limit = 100): AuthorityPage {
    if (!Number.isInteger(limit) || limit < 1 || limit > 100) throw new MetadataError("invalid_input");
    enumValue(type, AUTHORITY_TYPES);
    return this.#persistence.runInTransaction((repositories) => {
      const library = this.#requireMember(actor, libraryId, repositories);
      const authorities = repositories.metadata.listAuthorities(library.ownerDomainId, type, beforeId, limit + 1);
      const hasMore = authorities.length > limit;
      const visible = authorities.slice(0, limit);
      return { authorities: visible.map(publicAuthority), nextBeforeId: hasMore ? visible.at(-1)!.id : null };
    });
  }

  createAuthority(actor: AuthenticatedAccount, libraryId: string, value: unknown): PublicAuthority {
    const input = normalizeAuthorityInput(value);
    return this.#persistence.runInTransaction((repositories) => {
      const library = this.#requireManager(actor, libraryId, repositories);
      const now = this.#now();
      let authority: ScholarlyAuthority;
      try {
        authority = repositories.metadata.createAuthority({
          id: this.#createId(),
          ownerDomainId: library.ownerDomainId,
          type: input.type,
          canonicalLabel: input.canonicalLabel,
          aliases: input.aliases,
          revision: 1,
          createdByAccountId: actor.id,
          updatedByAccountId: actor.id,
          createdAt: now,
          updatedAt: now,
        });
      } catch (error: unknown) {
        if (isConstraintError(error)) throw new MetadataError("conflict", { cause: error });
        throw error;
      }
      recordAuditEvent(repositories, {
        action: "libraries.authority_create",
        actorKind: "account",
        actorAccountId: actor.id,
        targetId: authority.id,
        outcome: "succeeded",
        reason: null,
        occurredAt: now,
      });
      return publicAuthority(authority);
    });
  }

  updateAuthority(actor: AuthenticatedAccount, libraryId: string, authorityId: string, expectedVersion: string, value: unknown): PublicAuthority {
    if (!OPAQUE_VERSION.test(expectedVersion) || !SAFE_ID.test(authorityId)) throw new MetadataError("invalid_input");
    const input = normalizeAuthorityInput(value);
    return this.#persistence.runInTransaction((repositories) => {
      const library = this.#requireManager(actor, libraryId, repositories);
      const current = repositories.metadata.findAuthority(library.ownerDomainId, authorityId);
      if (!current) throw new MetadataError("not_found");
      if (current.type !== input.type) throw new MetadataError("invalid_input");
      if (authorityVersion(current) !== expectedVersion) throw new MetadataError("concurrent_change");
      let updated: ScholarlyAuthority | null;
      try {
        updated = repositories.metadata.updateAuthority({
          ownerDomainId: library.ownerDomainId,
          authorityId,
          canonicalLabel: input.canonicalLabel,
          aliases: input.aliases,
          expectedRevision: current.revision,
          actorAccountId: actor.id,
          now: this.#now(),
        });
      } catch (error: unknown) {
        if (isConstraintError(error)) throw new MetadataError("conflict", { cause: error });
        throw error;
      }
      if (!updated) throw new MetadataError("concurrent_change");
      recordAuditEvent(repositories, {
        action: "libraries.authority_update",
        actorKind: "account",
        actorAccountId: actor.id,
        targetId: authorityId,
        outcome: "succeeded",
        reason: null,
        occurredAt: this.#now(),
      });
      return publicAuthority(updated);
    });
  }

  #resolveMemberHolding(
    actor: AuthenticatedAccount,
    libraryId: string,
    fileId: string,
    repositories: RepositorySet,
  ): { library: Library; membership: LibraryMembership; holding: LibraryHolding } {
    const library = this.#requireMember(actor, libraryId, repositories);
    const holding = repositories.libraries.findHoldingByFile(library.id, fileId);
    if (!holding) throw new MetadataError("not_found");
    const membership = repositories.libraries.findMembership(library.id, actor.id);
    if (!membership) throw new MetadataError("not_found");
    return { library, membership, holding };
  }

  #requireMember(actor: AuthenticatedAccount, libraryId: string, repositories: RepositorySet): Library {
    const account = repositories.accounts.findById(actor.id);
    const library = repositories.libraries.findById(libraryId);
    const membership = library ? repositories.libraries.findMembership(libraryId, actor.id) : null;
    if (!account || account.state !== "active" || account.role !== actor.role || !library || !membership) {
      throw new MetadataError("not_found");
    }
    const effective = repositories.accounts.findById(membership.accountId);
    if (!effective || effective.state !== "active") throw new MetadataError("not_found");
    return library;
  }

  #requireManager(actor: AuthenticatedAccount, libraryId: string, repositories: RepositorySet): Library {
    const library = this.#requireMember(actor, libraryId, repositories);
    const membership = repositories.libraries.findMembership(libraryId, actor.id);
    if (!membership || membership.role !== "manager") throw new MetadataError("not_found");
    return library;
  }

  #detail(
    repositories: RepositorySet,
    library: Library,
    membership: LibraryMembership,
    holding: LibraryHolding,
  ): MetadataDetail {
    const metadata = repositories.metadata.findMetadata(library.ownerDomainId, holding.recordId);
    const bibliography = repositories.bibliography.findProfile(library.ownerDomainId, holding.recordId);
    const fieldAuthorities = repositories.bibliography.listFieldAuthorities(library.ownerDomainId, holding.recordId);
    const publicMetadata = metadata ? this.#publicMetadata(repositories, metadata) : null;
    const display = composeCatalogueDisplay({
      canonicalTitle: publicMetadata?.canonicalTitle ?? null,
      fallbackDisplayName: holding.file.displayName,
      legacyAuthorLabels: holding.authorLabels,
      bibliography,
    });
    return {
      displayTitle: display.title,
      originalFilename: holding.file.displayName,
      metadataVersion: metadataVersion(holding.recordId, metadata),
      metadata: publicMetadata,
      bibliographyVersion: bibliographyVersion(holding.recordId, bibliography),
      bibliography: bibliography ? publicBibliography(bibliography) : null,
      fieldAuthorities: fieldAuthorities.map(publicFieldAuthority),
      canEditMetadata: membership.role === "manager",
      file: {
        id: holding.file.id,
        mediaType: holding.file.mediaType,
        sizeBytes: holding.file.sizeBytes,
        updatedAt: holding.file.updatedAt.toISOString(),
      },
    };
  }

  #publicMetadata(repositories: RepositorySet, metadata: CanonicalMetadata): PublicMetadata {
    return {
      contractVersion: 1,
      materialType: metadata.materialType,
      canonicalTitle: metadata.canonicalTitle,
      subtitle: metadata.subtitle ?? null,
      alternativeTitles: [...metadata.alternativeTitles],
      dateStatement: metadata.dateStatement ?? null,
      identifiers: metadata.identifiers.map((identifier) => ({ ...identifier })),
      typeFields: { ...metadata.typeFields },
      authorityLinks: metadata.authorityLinks.map((link) => {
        const authority = repositories.metadata.findAuthority(metadata.ownerDomainId, link.authorityId);
        if (!authority) throw new MetadataError("invalid_input");
        return { ...publicAuthority(authority), role: link.role };
      }),
    };
  }
}

function changedLegacyHumanFields(previous: CanonicalMetadata | null, next: CanonicalMetadata): BibliographicFieldName[] {
  const fields: BibliographicFieldName[] = [];
  if (!previous || previous.canonicalTitle !== next.canonicalTitle) fields.push("canonicalTitle");
  if (!previous || previous.subtitle !== next.subtitle) fields.push("subtitle");
  if (!previous || JSON.stringify(previous.alternativeTitles) !== JSON.stringify(next.alternativeTitles)) fields.push("alternativeTitles");
  if (!previous || previous.dateStatement !== next.dateStatement) fields.push("dateStatement");
  if (!previous || JSON.stringify(previous.identifiers) !== JSON.stringify(next.identifiers)) fields.push("identifiers");
  return fields;
}

export { normalizeAuthorityInput, normalizeMetadataInput, metadataVersion, bibliographyVersion, authorityVersion };
