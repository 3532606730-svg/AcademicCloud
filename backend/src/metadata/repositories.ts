import type {
  AuthorityType,
  CanonicalMetadata,
  CanonicalMetadataInput,
  NewScholarlyAuthority,
  ScholarlyAuthority,
} from "./metadata.js";

export interface SaveMetadataInput extends CanonicalMetadataInput {
  recordId: string;
  ownerDomainId: string;
  actorAccountId: string;
  expectedRevision: number | null;
  now: Date;
}

export interface UpdateAuthorityInput {
  ownerDomainId: string;
  authorityId: string;
  canonicalLabel: string;
  aliases: string[];
  expectedRevision: number;
  actorAccountId: string;
  now: Date;
}

export interface CanonicalMetadataRepository {
  findMetadata(ownerDomainId: string, recordId: string): CanonicalMetadata | null;
  saveMetadata(input: SaveMetadataInput): CanonicalMetadata | null;
  findAuthority(ownerDomainId: string, authorityId: string): ScholarlyAuthority | null;
  listAuthorities(ownerDomainId: string, type: AuthorityType, beforeId: string | null, limit: number): ScholarlyAuthority[];
  createAuthority(authority: NewScholarlyAuthority): ScholarlyAuthority;
  updateAuthority(input: UpdateAuthorityInput): ScholarlyAuthority | null;
}
