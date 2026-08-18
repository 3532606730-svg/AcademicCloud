export const MATERIAL_TYPES = [
  "book",
  "article",
  "manuscript",
  "inscription",
  "archival_document",
] as const;
export type MaterialType = (typeof MATERIAL_TYPES)[number];

export const AUTHORITY_TYPES = ["person", "place", "language", "work", "institution"] as const;
export type AuthorityType = (typeof AUTHORITY_TYPES)[number];

export const AUTHORITY_ROLES = [
  "author",
  "editor",
  "translator",
  "compiler",
  "scribe",
  "sender",
  "recipient",
  "creator",
  "contributor",
  "publication_place",
  "creation_place",
  "discovery_place",
  "content_language",
  "original_language",
  "container_work",
  "series_work",
  "source_work",
  "publisher",
  "holding_institution",
  "issuing_body",
] as const;
export type AuthorityRole = (typeof AUTHORITY_ROLES)[number];

export const TYPE_FIELD_NAMES = [
  "editionStatement",
  "volumeStatement",
  "issueStatement",
  "locator",
  "shelfmark",
  "supportStatement",
  "extentStatement",
  "scriptStatement",
  "objectType",
  "materialStatement",
  "dimensionsStatement",
  "documentType",
  "fondsOrCollection",
  "seriesStatement",
  "referenceCode",
] as const;
export type TypeFieldName = (typeof TYPE_FIELD_NAMES)[number];

export const TYPE_FIELDS_BY_MATERIAL: Readonly<Record<MaterialType, readonly TypeFieldName[]>> = {
  book: ["editionStatement", "volumeStatement"],
  article: ["volumeStatement", "issueStatement", "locator"],
  manuscript: ["shelfmark", "supportStatement", "extentStatement", "scriptStatement"],
  inscription: ["objectType", "materialStatement", "dimensionsStatement", "scriptStatement"],
  archival_document: ["documentType", "fondsOrCollection", "seriesStatement", "referenceCode"],
};

export const AUTHORITY_ROLES_BY_TYPE: Readonly<Record<AuthorityType, readonly AuthorityRole[]>> = {
  person: ["author", "editor", "translator", "compiler", "scribe", "sender", "recipient", "creator", "contributor"],
  place: ["publication_place", "creation_place", "discovery_place"],
  language: ["content_language", "original_language"],
  work: ["container_work", "series_work", "source_work"],
  institution: ["publisher", "holding_institution", "issuing_body", "creator"],
};

export interface MetadataIdentifier {
  scheme: string;
  value: string;
}

export interface MetadataAuthorityLink {
  authorityId: string;
  role: AuthorityRole;
}

export interface CanonicalMetadataInput {
  materialType: MaterialType;
  canonicalTitle: string;
  subtitle?: string;
  alternativeTitles: string[];
  dateStatement?: string;
  identifiers: MetadataIdentifier[];
  typeFields: Partial<Record<TypeFieldName, string>>;
  authorityLinks: MetadataAuthorityLink[];
}

export interface CanonicalMetadata extends CanonicalMetadataInput {
  recordId: string;
  ownerDomainId: string;
  contractVersion: 1;
  revision: number;
  createdByAccountId: string;
  updatedByAccountId: string;
  createdAt: Date;
  updatedAt: Date;
}

export interface ScholarlyAuthority {
  id: string;
  ownerDomainId: string;
  type: AuthorityType;
  canonicalLabel: string;
  aliases: string[];
  revision: number;
  createdByAccountId: string;
  updatedByAccountId: string;
  createdAt: Date;
  updatedAt: Date;
}

export interface NewScholarlyAuthority extends ScholarlyAuthority {}

export interface AuthorityInput {
  type: AuthorityType;
  canonicalLabel: string;
  aliases: string[];
}
