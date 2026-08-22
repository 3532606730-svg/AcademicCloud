import type { ScholarlyAuthority } from "../metadata/metadata.js";
import type {
  BibliographicFieldAuthority,
  BibliographicFieldName,
  BibliographicProfile,
  BibliographicProfileInput,
} from "./bibliography.js";

export interface SaveBibliographicProfileInput extends BibliographicProfileInput {
  recordId: string;
  ownerDomainId: string;
  actorAccountId: string;
  expectedRevision: number | null;
  now: Date;
}
export interface SetFieldAuthorityInput {
  recordId: string;
  ownerDomainId: string;
  fieldName: BibliographicFieldName;
  scopeKey: string;
  source: "human" | "ai";
  sourceRunId?: string;
  actorAccountId?: string;
  now: Date;
}

export interface BibliographicRepository {
  findProfile(ownerDomainId: string, recordId: string): BibliographicProfile | null;
  saveProfile(input: SaveBibliographicProfileInput): BibliographicProfile | null;
  listFieldAuthorities(ownerDomainId: string, recordId: string): BibliographicFieldAuthority[];
  setFieldAuthority(input: SetFieldAuthorityInput): void;
  clearFieldAuthorities(ownerDomainId: string, recordId: string, fields: Array<{ fieldName: BibliographicFieldName; scopeKey: string }>): void;
  findExactPersonAuthorities(ownerDomainId: string, label: string): ScholarlyAuthority[];
}
