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

export interface BibliographicAiRunEvidence {
  id: string;
  ownerDomainId: string;
  recordId: string;
  fileId: string;
  suggestionRunId: string;
  status: "auto_apply" | "ambiguous" | "no_bibliography";
  overallConfidence: number;
  structuredOutputJson: string;
  structuredOutputSha256: string;
  rulesetVersion: "l1-intelligent-library01-v1" | "l1-intelligent-library01-v2" | "l1-intelligent-library01-v3" | "l1-intelligent-library01-v4";
  promptVersion: "l1-intelligent-library01-prompt-v1" | "l1-intelligent-library01-prompt-v2" | "l1-intelligent-library01-prompt-v3";
  ocrEngineId: string;
  reasoningEngineId: string;
  selectedPages: number[];
  autoApplied: boolean;
  appliedFields: Array<{ fieldName: BibliographicFieldName; scopeKey: string }>;
  createdAt: Date;
}

export interface BibliographicRepository {
  findProfile(ownerDomainId: string, recordId: string): BibliographicProfile | null;
  findProfiles(ownerDomainId: string, recordIds: string[]): BibliographicProfile[];
  saveProfile(input: SaveBibliographicProfileInput): BibliographicProfile | null;
  listFieldAuthorities(ownerDomainId: string, recordId: string): BibliographicFieldAuthority[];
  setFieldAuthority(input: SetFieldAuthorityInput): void;
  clearFieldAuthorities(ownerDomainId: string, recordId: string, fields: Array<{ fieldName: BibliographicFieldName; scopeKey: string }>): void;
  findExactPersonAuthorities(ownerDomainId: string, label: string): ScholarlyAuthority[];
  createAiRunEvidence(evidence: BibliographicAiRunEvidence): BibliographicAiRunEvidence;
  findAiRunEvidence(ownerDomainId: string, id: string): BibliographicAiRunEvidence | null;
  findAiRunEvidenceBySuggestionRun(ownerDomainId: string, suggestionRunId: string): BibliographicAiRunEvidence | null;
}
