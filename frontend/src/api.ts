import { ERROR_MESSAGES } from "./i18n.ts";

export interface Account {
  id: string;
  loginName: string;
  role: "owner" | "member";
}

export interface ManagedAccount extends Account {
  state: "active" | "disabled" | "archived";
  createdAt: string;
}

export interface Invitation {
  id: string;
  createdByAccountId: string;
  createdAt: string;
  expiresAt: string;
  consumedAt: string | null;
  consumedByAccountId: string | null;
  revokedAt: string | null;
  status: "available" | "expired" | "consumed" | "revoked";
}

export interface CredentialResetIssue {
  reset: {
    id: string;
    accountId: string;
    createdAt: string;
    expiresAt: string;
  };
  rawToken: string;
}

export interface Announcement {
  id: string;
  title: string;
  body: string;
  severity: "info" | "warning" | "critical";
  linkUrl: string | null;
  isActive: boolean;
  publishedAt: string | null;
  expiresAt: string | null;
  createdByAccountId: string;
  createdAt: string;
  updatedAt: string;
}

export interface AnnouncementInput {
  title: string;
  body: string;
  severity: Announcement["severity"];
  linkUrl: string | null;
  expiresAt: string | null;
}

export type AuditEventKind =
  | "auth.login" | "auth.logout" | "auth.password_change" | "auth.credential_reset"
  | "accounts.owner_bootstrap" | "accounts.register" | "accounts.invitation_create"
  | "accounts.invitation_revoke" | "accounts.member_state_change" | "accounts.credential_reset_issue"
  | "announcements.create" | "announcements.edit" | "announcements.publish" | "announcements.unpublish" | "announcements.delete"
  | "libraries.create" | "libraries.membership_add" | "libraries.membership_change" | "libraries.membership_remove"
  | "libraries.contribution_submit" | "libraries.contribution_approve" | "libraries.contribution_reject" | "libraries.contribution_withdraw"
  | "libraries.resource_admit" | "libraries.corpus_transition" | "libraries.metadata_update"
  | "libraries.authority_create" | "libraries.authority_update"
  | "drive.upload_activate" | "drive.folder_recycle" | "drive.folder_restore"
  | "drive.file_recycle" | "drive.file_restore" | "drive.file_purge_request" | "drive.file_purge_complete";
export type AuditOutcome = "succeeded" | "denied" | "failed" | "busy";
export type AuditActorKind = "account" | "system" | "anonymous";
export type AuditTargetType = "account" | "invitation" | "announcement" | "library" | "contribution" | "credential_reset" | "file" | "folder" | "scholarly_record" | "authority";
export type AuditReasonCode =
  | "invalid_credentials" | "invalid_current_password" | "password_change_conflict" | "password_unchanged"
  | "invalid_invitation" | "login_unavailable" | "authorization_denied" | "not_found" | "invalid_target"
  | "invalid_state" | "invalid_input" | "rate_limit_exceeded" | "kdf_overloaded" | "storage_unavailable"
  | "upload_incomplete" | "upload_metadata_mismatch" | "name_conflict" | "concurrent_change" | "invalid_credential_reset";
export interface AuditEvent {
  id: number;
  occurredAt: string;
  action: AuditEventKind;
  outcome: AuditOutcome;
  actorKind: AuditActorKind;
  actorAccountId: string | null;
  targetKind: AuditTargetType | null;
  targetId: string | null;
  reason: AuditReasonCode | null;
}
export interface AuditPage {
  events: AuditEvent[];
  nextBeforeId: number | null;
  retentionPolicy: "latest_20000_events";
}

export type FolderState = "active" | "deleted";
export type FileState = "pending_upload" | "active" | "deleted" | "purging" | "purged";

export interface FolderEntry {
  id: string;
  parentId: string | null;
  name: string;
  state: FolderState;
  createdAt: string;
  updatedAt: string;
  deletedAt: string | null;
  version: string;
}

export interface FileEntry {
  id: string;
  folderId: string | null;
  displayName: string;
  mediaType: string;
  sizeBytes: number;
  checksumAlgorithm: "md5";
  checksum: string;
  state: FileState;
  createdAt: string;
  updatedAt: string;
  activatedAt: string | null;
  deletedAt: string | null;
  purgedAt: string | null;
  version: string;
  uploadKind?: "multipart" | "legacy";
}

export type BulkAction = "move" | "recycle" | "restore" | "favorite_add" | "favorite_remove";
export type BulkResourceKind = "folder" | "file";

export interface BulkItem {
  kind: BulkResourceKind;
  id: string;
  version: string;
}

export interface BulkOperationInput {
  action: BulkAction;
  items: BulkItem[];
  destinationFolderId?: string | null;
}

export interface BulkOperationResult {
  action: BulkAction;
  atomic: true;
  items: Array<BulkItem & { outcome: "succeeded" }>;
}

export type ScholarlyAttachmentState = "attached" | "detached";
export type ScholarlyAvailability = "available" | "unavailable" | "tombstoned";

export interface ScholarlyRecordSummary {
  id: string;
  label: string;
  createdAt: string;
  updatedAt: string;
  artifactCount: number;
}

export interface ScholarlyRecord extends ScholarlyRecordSummary {
  artifacts: ScholarlyArtifact[];
  nextBeforeArtifactId: string | null;
}

export interface ScholarlyRecordPage {
  records: ScholarlyRecordSummary[];
  nextBeforeId: string | null;
}

export interface ScholarlyArtifact {
  id: string;
  recordId: string;
  attachmentState: ScholarlyAttachmentState;
  createdAt: string;
  updatedAt: string;
  version: {
    id: string;
    createdAt: string;
    updatedAt: string;
    file: {
      id: string;
      displayName: string;
      state: FileState;
      availability: ScholarlyAvailability;
    } | null;
  } | null;
}

export type LibraryRole = "manager" | "member";

export interface LibrarySummary {
  id: string;
  name: string;
  role: LibraryRole;
  isDefault: boolean;
  createdAt: string;
}

export interface LibraryMember {
  accountId: string;
  loginName: string | null;
  role: LibraryRole;
  state: "active" | "disabled" | "archived" | "missing";
  createdAt: string;
  updatedAt: string;
}

export interface LibraryHolding {
  recordId: string;
  recordLabel: string;
  canonicalTitle: string | null;
  authorLabels: string[];
  materialClass?: MaterialClass | null;
  contributorLabels?: string[];
  editionStatement?: string | null;
  catalogueDisplayTitle?: string;
  artifactId: string;
  versionId: string;
  version: string;
  file: {
    id: string;
    displayName: string;
    mediaType: string | null;
    sizeBytes: number;
    updatedAt: string;
  };
}

export interface LibrarySearchResult {
  fileId: string;
  canonicalTitle: string | null;
  authorLabels: string[];
  contributorLabels: string[];
  date: string | null;
  publisher: string | null;
  materialClass: MaterialClass | null;
  materialType: MaterialType | null;
  language: string | null;
  editionStatement: string | null;
  catalogueDisplayTitle: string;
  displayName: string;
}

export interface LibrarySearchPage {
  results: LibrarySearchResult[];
  nextCursor: string | null;
}

export type MaterialType = "book" | "article" | "manuscript" | "inscription" | "archival_document";
export type MaterialClass =
  | "scholarly_monograph" | "edited_volume" | "journal_article" | "book_chapter"
  | "thesis_dissertation" | "conference_paper" | "review" | "reference_work"
  | "dictionary_lexicon" | "primary_source_modern_edition" | "traditional_book"
  | "archival_document" | "inscription_epigraphy" | "rubbing" | "manuscript"
  | "collected_documents" | "catalogue_bibliography" | "other" | "unknown";
export type ContributorRole =
  | "author" | "editor" | "compiler" | "translator" | "annotator" | "collator"
  | "punctuator" | "commentator" | "reviser" | "selector" | "organizer" | "other";
export type EditionType =
  | "critical_edition" | "annotated_edition" | "collated_edition" | "punctuated_edition"
  | "translated_edition" | "facsimile" | "reprint" | "engraved" | "recut"
  | "facsimile_engraved" | "movable_type" | "multicolor_print" | "manuscript_copy"
  | "hand_copy" | "draft_manuscript" | "facsimile_hand_copy" | "lithograph"
  | "letterpress" | "composite_repaired" | "hand_copy_repaired" | "repaired" | "other" | "unknown";
export interface LibrarySearchFilters {
  materialClass?: MaterialClass;
  contributor?: string;
  language?: string;
  publisher?: string;
  year?: string;
  editionType?: EditionType;
  dynasty?: string;
  reignTitle?: string;
  editorialRole?: ContributorRole;
  series?: string;
  volume?: string;
}
export type LibrarySearchSort = "relevance" | LibraryHoldingSort;
export type AuthorityType = "person" | "place" | "language" | "work" | "institution";
export type AuthorityRole =
  | "author" | "editor" | "translator" | "compiler" | "scribe" | "sender" | "recipient" | "creator" | "contributor"
  | "publication_place" | "creation_place" | "discovery_place" | "content_language" | "original_language"
  | "container_work" | "series_work" | "source_work" | "publisher" | "holding_institution" | "issuing_body";
export type MetadataTypeFields = Partial<Record<
  | "editionStatement" | "volumeStatement" | "issueStatement" | "locator"
  | "shelfmark" | "supportStatement" | "extentStatement" | "scriptStatement"
  | "objectType" | "materialStatement" | "dimensionsStatement"
  | "documentType" | "fondsOrCollection" | "seriesStatement" | "referenceCode",
  string
>>;
export interface MetadataIdentifier { scheme: string; value: string; }
export interface LibraryAuthority {
  id: string;
  type: AuthorityType;
  canonicalLabel: string;
  aliases: string[];
  version: string;
}
export interface LibraryMetadataAuthorityLink extends LibraryAuthority { role: AuthorityRole; }
export interface LibraryMetadata {
  contractVersion: 1;
  materialType: MaterialType;
  canonicalTitle: string;
  subtitle: string | null;
  alternativeTitles: string[];
  dateStatement: string | null;
  identifiers: MetadataIdentifier[];
  typeFields: MetadataTypeFields;
  authorityLinks: LibraryMetadataAuthorityLink[];
}
export interface BibliographicContributor {
  id: string;
  label: string;
  role: ContributorRole;
  roleLabel?: string;
  authorityId?: string;
}
export interface BibliographicPublication {
  publisher?: string;
  place?: string;
  publicationDate?: string;
  editionNumber?: string;
  printing?: string;
}
export interface BibliographicCarrierEdition {
  editionType?: EditionType;
  editionStatement?: string;
  facsimileStatement?: string;
}
export interface BibliographicSourceEdition {
  dynasty?: string;
  reignTitle?: string;
  reignYear?: string;
  absoluteYear?: number;
  printer?: string;
  imprint?: string;
  bookshop?: string;
  institution?: string;
  printingPlace?: string;
  editionType?: EditionType;
  editionStatement?: string;
  holdingInformation?: string;
}
export interface LibraryBibliographicProfile {
  contractVersion: 1;
  materialClass: MaterialClass;
  contributors: BibliographicContributor[];
  publication: BibliographicPublication;
  series?: string;
  volume?: string;
  language?: string;
  carrierEdition: BibliographicCarrierEdition;
  sourceEdition: BibliographicSourceEdition;
}
export type BibliographicFieldName =
  | "materialClass" | "canonicalTitle" | "subtitle" | "alternativeTitles" | "dateStatement" | "identifiers"
  | "publication.publisher" | "publication.place" | "publication.publicationDate" | "publication.editionNumber" | "publication.printing"
  | "series" | "volume" | "language"
  | "carrierEdition.editionType" | "carrierEdition.editionStatement" | "carrierEdition.facsimileStatement"
  | "sourceEdition.dynasty" | "sourceEdition.reignTitle" | "sourceEdition.reignYear" | "sourceEdition.absoluteYear"
  | "sourceEdition.printer" | "sourceEdition.imprint" | "sourceEdition.bookshop" | "sourceEdition.institution"
  | "sourceEdition.printingPlace" | "sourceEdition.editionType" | "sourceEdition.editionStatement" | "sourceEdition.holdingInformation"
  | "contributor.label" | "contributor.role" | "contributor.roleLabel" | "contributor.authorityId";
export interface BibliographicFieldAuthority {
  fieldName: BibliographicFieldName;
  scopeKey: string;
  source: "human" | "ai";
  sourceRunId?: string;
  establishedAt: string;
}
export interface LibraryHoldingDetails {
  displayTitle: string;
  originalFilename: string;
  metadataVersion: string;
  metadata: LibraryMetadata | null;
  bibliographyVersion: string;
  bibliography: LibraryBibliographicProfile | null;
  fieldAuthorities: BibliographicFieldAuthority[];
  canEditMetadata: boolean;
  file: Pick<LibraryHolding["file"], "id" | "mediaType" | "sizeBytes" | "updatedAt">;
}
export interface LibraryMetadataInput {
  metadataVersion: string;
  materialType: MaterialType;
  canonicalTitle: string;
  subtitle: string | null;
  alternativeTitles: string[];
  dateStatement: string | null;
  identifiers: MetadataIdentifier[];
  typeFields: MetadataTypeFields;
  authorityLinks: Array<{ authorityId: string; role: AuthorityRole }>;
}
export type LibraryBibliographyInput = Omit<LibraryBibliographicProfile, "contractVersion" | "contributors"> & {
  bibliographyVersion: string;
  contributors: Array<Omit<BibliographicContributor, "id"> & { id?: string }>;
};

export type CitationStyleId = "chicago-notes-bibliography" | "lishi-yanjiu" | "wenshizhe" | "gb-t-7714-2025";
export type CitationLocatorType =
  | "page" | "page_range" | "volume" | "fascicle" | "chapter" | "juan"
  | "folio" | "line" | "item" | "document_number" | "archive_call_number" | "custom";
export interface CitationLocator {
  type: CitationLocatorType;
  value: string;
  side?: "recto" | "verso";
  label?: string;
}
export interface CitationResult {
  style: {
    id: CitationStyleId;
    label: string;
    processor: "citeproc-js";
    processorVersion: string;
    revision: string;
    source: string;
    sourceRevision: string;
    sha256: string;
    verifiedAt: string;
    compliance: "official" | "production_subset";
    supportsShortNote: boolean;
  };
  completeness: "structured" | "partial";
  materialClass: MaterialClass | null;
  locators: CitationLocator[];
  cslItem: Record<string, unknown> & { id: string; type: string; title: string; "title-short": string };
  outputs: {
    citation: string;
    fullNote: string | null;
    shortNote: string | null;
    bibliography: string;
  };
}

export type LibraryHoldingSort =
  | "newest"
  | "oldest"
  | "title_asc"
  | "title_desc"
  | "size_desc"
  | "size_asc";

export interface LibraryHoldingsPage {
  holdings: LibraryHolding[];
  nextCursor: string | null;
}

export interface BatchNamingPreviewItem {
  fileId: string;
  displayName: string;
  canonicalTitle: string | null;
  metadataVersion: string;
  sourceVersion: string;
  materialType: MaterialType | null;
  mediaType: string | null;
  proposedTitle: string | null;
  proposedConfidence: "medium" | "low" | null;
  proposedSource: "filename" | null;
  status: "available" | "unavailable";
}

export interface BatchNamingPreview {
  items: BatchNamingPreviewItem[];
}

export interface BatchNamingItemInput {
  fileId: string;
  metadataVersion: string;
  sourceVersion: string;
  canonicalTitle: string;
  materialType: MaterialType;
}

export type BatchNamingResultStatus =
  | "applied"
  | "stale"
  | "conflict"
  | "invalid_input"
  | "not_found";

export interface BatchNamingResultItem {
  fileId: string;
  status: BatchNamingResultStatus;
}

/**
 * Bounded, deterministic bibliographic suggestion evidence.  These values
 * intentionally mirror the server contract but do not expose object keys,
 * raw PDF bytes, or private research state to the browser.
 */
export type MetadataSuggestionStatus =
  | "ready"
  | "ambiguous"
  | "no_suggestions"
  | "ocr_deferred"
  | "unsupported"
  | "stale"
  | "accepted";
export type MetadataSuggestionSourceType =
  | "title_page"
  | "copyright_page"
  | "cip_page"
  | "colophon"
  | "series_page"
  | "embedded_pdf_metadata"
  | "filename";
export type MetadataSuggestionPageClass =
  | "cover"
  | "half_title"
  | "title_page"
  | "copyright_page"
  | "cip_page"
  | "colophon"
  | "series_page"
  | "contents_preface"
  | "ordinary_body"
  | "unknown";
export type MetadataSuggestionFieldPath =
  | "canonicalTitle"
  | "subtitle"
  | "dateStatement"
  | "identifier"
  | "typeField"
  | "authority";
export type MetadataSuggestionConfidence = "high" | "medium" | "low";
export type MetadataSuggestionEvidenceOrigin =
  | "native_text"
  | "ocr"
  | "embedded_pdf_metadata"
  | "filename";
export interface MetadataSuggestionCandidate {
  id: string;
  position: number;
  fieldPath: MetadataSuggestionFieldPath;
  typeFieldName: keyof MetadataTypeFields | null;
  authorityType: AuthorityType | null;
  authorityRole: AuthorityRole | null;
  identifierScheme: string | null;
  value: string;
  sourceType: MetadataSuggestionSourceType;
  sourcePageIndex: number | null;
  pageClass: MetadataSuggestionPageClass | null;
  confidence: MetadataSuggestionConfidence;
  precedenceRank: number;
  evidenceExcerpt: string | null;
  evidenceOrigin: MetadataSuggestionEvidenceOrigin;
  ocrEngine: string | null;
  ocrConfidence: number | null;
  rulesetVersion: string;
}
export interface MetadataSuggestionWindow {
  firstPages: number;
  lastPages: number;
  pageCount: number | null;
  pageIndices: number[];
  complete: boolean;
}
export interface AiSuggestedBibliographicCanonical {
  materialClass: MaterialClass;
  canonicalTitle: string;
  subtitle: string | null;
  alternativeTitles: string[];
  dateStatement: string | null;
  identifiers: MetadataIdentifier[];
  contributors: Array<{ label: string; role: ContributorRole; roleLabel: string | null }>;
  publication: {
    publisher: string | null;
    place: string | null;
    publicationDate: string | null;
    editionNumber: string | null;
    printing: string | null;
  };
  series: string | null;
  volume: string | null;
  language: string | null;
  carrierEdition: {
    editionType: EditionType | null;
    editionStatement: string | null;
    facsimileStatement: string | null;
  };
  sourceEdition: {
    dynasty: string | null;
    reignTitle: string | null;
    reignYear: string | null;
    absoluteYear: number | null;
    printer: string | null;
    imprint: string | null;
    bookshop: string | null;
    institution: string | null;
    printingPlace: string | null;
    editionType: EditionType | null;
    editionStatement: string | null;
    holdingInformation: string | null;
  };
}
export interface AiSuggestedBibliographicFieldEvidence {
  fieldName: BibliographicFieldName;
  scopeKey: string;
  confidence: number;
  sourceType: Exclude<MetadataSuggestionSourceType, "filename"> | "class_support";
  sourcePageIndex: number | null;
  pageClass: MetadataSuggestionPageClass | null;
  evidenceOrigin: Exclude<MetadataSuggestionEvidenceOrigin, "filename">;
  evidenceSha256: string;
}
export interface AiSuggestedBibliography {
  id: string;
  contractVersion: 1;
  rulesetVersion: "l1-intelligent-library01-v1" | "l1-intelligent-library01-v2" | "l1-intelligent-library01-v3" | "l1-intelligent-library01-v4" | "l1-intelligent-library01-v5" | "l1-intelligent-library01-v6" | "l1-intelligent-library01-v7" | "l1-intelligent-library01-v8" | "l1-intelligent-library01-v9" | "l1-intelligent-library01-v10";
  status: "auto_apply" | "ambiguous" | "no_bibliography";
  overallConfidence: number;
  displayTitle: string | null;
  editionStatement: string | null;
  canonical: AiSuggestedBibliographicCanonical | null;
  fields: AiSuggestedBibliographicFieldEvidence[];
  warnings: string[];
  provenance: {
    ocr: { used: boolean; family: "PaddleOCR"; packageVersion: string; runtimeFamily: string; runtimeVersion: string; legacyFallback: boolean; detectionModel: { name: string; revision: string; sha256: string }; recognitionModel: { name: string; revision: string; sha256: string } };
    reasoning: { family: "Qwen3"; name: string; revision: string; sha256: string; quantization: string; runtimeFamily: string; runtimeVersion: string; runtimeRevision: string; runtimeSha256: string };
    selectedPages: number[];
    promptVersion: "l1-intelligent-library01-prompt-v1" | "l1-intelligent-library01-prompt-v2" | "l1-intelligent-library01-prompt-v3" | "l1-intelligent-library01-prompt-v4" | "l1-intelligent-library01-prompt-v5" | "l1-intelligent-library01-prompt-v6" | "l1-intelligent-library01-prompt-v7";
  };
  autoApplied: boolean;
  appliedFields: Array<{ fieldName: BibliographicFieldName; scopeKey: string }>;
  createdAt: string;
}
export interface MetadataSuggestionRun {
  id: string;
  libraryId: string;
  fileId: string;
  status: MetadataSuggestionStatus;
  rulesetVersion: string;
  sourceVersion: string;
  window: MetadataSuggestionWindow;
  candidates: MetadataSuggestionCandidate[];
  createdAt: string;
  aiBibliography?: AiSuggestedBibliography;
}
export interface MetadataSuggestionResponse {
  run: MetadataSuggestionRun | null;
}
export type DerivedMetadataJobState = "queued" | "running" | "succeeded" | "failed";
export type DerivedMetadataJobErrorCode =
  | "compute_dispatch_failed"
  | "compute_source_stale"
  | "compute_source_unavailable"
  | "compute_timeout"
  | "compute_limit_exceeded"
  | "compute_invalid_pdf"
  | "compute_unsupported"
  | "compute_ocr_unavailable"
  | "compute_invalid_result"
  | "compute_authorization_changed"
  | "compute_internal_error";
export interface DerivedMetadataJob {
  id: string;
  kind: "metadata_suggestion";
  resourceId: string;
  state: DerivedMetadataJobState;
  progress: number;
  attempts: number;
  resultRef: string | null;
  errorCode: DerivedMetadataJobErrorCode | null;
  createdAt: string;
  startedAt: string | null;
  finishedAt: string | null;
  deadlineAt: string;
  queuePriority?: 10 | 100;
  origin?: "admission" | "interactive" | "backfill";
}
export type MetadataCataloguingState =
  | "not_run"
  | "queued"
  | "running"
  | "failed"
  | "filename_inference_only"
  | "extraction_only"
  | "ai_succeeded_reviewable"
  | "applied";
export interface MetadataCataloguingSummary {
  fileId: string;
  state: MetadataCataloguingState;
  job: DerivedMetadataJob | null;
}
export type LibraryMetadataWithoutVersion = Omit<LibraryMetadataInput, "metadataVersion">;
export interface MetadataSuggestionAcceptInput {
  acceptedCandidateIds: string[];
  metadataVersion: string;
  /**
   * Optional explicit edit.  If present, the server validates and writes it
   * through the RF-META01 CAS contract; omission means accept the selected
   * candidates as proposed by the server.
   */
  metadata?: LibraryMetadataWithoutVersion;
}
export interface MetadataSuggestionAcceptResponse {
  detail?: LibraryHoldingDetails;
  run?: MetadataSuggestionRun;
}

export interface LibraryRecycleFile {
  version: string;
  canonicalTitle: string | null;
  file: {
    id: string;
    displayName: string;
    mediaType: string | null;
    sizeBytes: number;
    deletedAt: string;
  };
}

export interface LibraryContribution {
  id: string;
  libraryId: string;
  artifactId: string;
  state: "submitted" | "approved" | "rejected" | "withdrawn";
  revision: number;
  recordId: string;
  recordLabel: string;
  submitterLoginName: string | null;
  file: {
    id: string;
    displayName: string;
    mediaType: string | null;
    sizeBytes: number;
    state: FileState;
  };
  submittedAt: string;
  reviewedAt: string | null;
}

export interface UploadAuthorization {
  method: "POST";
  url: string;
  fields: Readonly<Record<string, string>>;
  expiresAt: string;
}

export interface MultipartPartAuthorization {
  method: "PUT";
  url: string;
  headers: Readonly<Record<string, string>>;
  expiresAt: string;
}

export interface MultipartTransfer {
  kind: "multipart";
  file: FileEntry;
  state: "uploading" | "paused" | "completing";
  version: string;
  partSizeBytes: number;
  totalParts: number;
  completedParts: Array<{ partNumber: number; sizeBytes: number; etag: string }>;
  completedBytes: number;
  expiresAt: string;
}

export type UploadTransfer = MultipartTransfer
  | { kind: "legacy"; file: FileEntry }
  | { kind: "complete"; file: FileEntry };

export interface DownloadAuthorization {
  method: "GET";
  url: string;
  expiresAt: string;
  sizeBytes?: number;
  etag?: string;
  acceptRanges?: "bytes";
}

export interface EntriesResponse {
  folder: FolderEntry | null;
  folders: FolderEntry[];
  files: FileEntry[];
}

export interface RecycleResponse {
  folders: FolderEntry[];
  files: FileEntry[];
}

export interface FavoriteFolderEntry extends FolderEntry {
  /** Root-first ancestor chain used to open the real folder in the Library. */
  ancestors: FolderEntry[];
}

export interface FavoriteLibraryHolding {
  library: LibrarySummary;
  holding: LibraryHolding;
}

export interface FavoritesResponse {
  files: FileEntry[];
  folders: FavoriteFolderEntry[];
  /** Optional only for compatibility with older test/API fakes. */
  libraryHoldings?: FavoriteLibraryHolding[];
}

export class ApiError extends Error {
  readonly status: number;
  readonly code: string;

  constructor(status: number, code: string) {
    // English fallback message; the UI renders localized text by code via
    // describeError in i18n.ts. Backend error codes remain stable.
    super(ERROR_MESSAGES.en[code] ?? `Request failed (${status}).`);
    this.name = "ApiError";
    this.status = status;
    this.code = code;
  }
}

type Fetcher = typeof fetch;

export interface AcademicCloudApi {
  getSession(signal?: AbortSignal): Promise<Account>;
  login(loginName: string, password: string): Promise<Account>;
  registerMember(inviteToken: string, loginName: string, password: string): Promise<ManagedAccount>;
  redeemCredentialReset(token: string, newPassword: string): Promise<void>;
  logout(): Promise<void>;
  createInvitation(): Promise<{ invitation: Invitation; rawToken: string }>;
  listInvitations(): Promise<Invitation[]>;
  revokeInvitation(invitationId: string): Promise<Invitation>;
  listAccounts(includeArchived?: boolean): Promise<ManagedAccount[]>;
  setAccountState(accountId: string, state: "active" | "disabled" | "archived"): Promise<ManagedAccount>;
  issueCredentialReset(accountId: string): Promise<CredentialResetIssue>;
  listAnnouncements(signal?: AbortSignal): Promise<Announcement[]>;
  listAllAnnouncements(): Promise<Announcement[]>;
  createAnnouncement(input: AnnouncementInput): Promise<Announcement>;
  updateAnnouncement(announcementId: string, input: AnnouncementInput): Promise<Announcement>;
  publishAnnouncement(announcementId: string): Promise<Announcement>;
  unpublishAnnouncement(announcementId: string): Promise<Announcement>;
  deleteAnnouncement(announcementId: string): Promise<void>;
  listAuditEvents(beforeId?: number, limit?: number, signal?: AbortSignal): Promise<AuditPage>;
  listEntries(folderId: string | null, signal?: AbortSignal): Promise<EntriesResponse>;
  listPending(folderId: string | null, signal?: AbortSignal): Promise<FileEntry[]>;
  listRecycle(signal?: AbortSignal): Promise<RecycleResponse>;
  listFavorites(signal?: AbortSignal): Promise<FavoritesResponse>;
  bulkOperation(input: BulkOperationInput): Promise<BulkOperationResult>;
  listScholarlyRecords(signal?: AbortSignal, beforeId?: string, limit?: number): Promise<ScholarlyRecordPage>;
  getScholarlyRecord(recordId: string, signal?: AbortSignal, beforeArtifactId?: string, limit?: number): Promise<ScholarlyRecord>;
  createScholarlyRecord(label: string): Promise<ScholarlyRecord>;
  attachFileToScholarlyRecord(recordId: string, fileId: string): Promise<ScholarlyRecord>;
  detachScholarlyArtifact(recordId: string, artifactId: string): Promise<ScholarlyRecord>;
  listLibraries(signal?: AbortSignal): Promise<LibrarySummary[]>;
  listLibraryMembers(libraryId: string): Promise<LibraryMember[]>;
  addLibraryMember(libraryId: string, accountId: string, role: LibraryRole): Promise<LibraryMember>;
  changeLibraryMemberRole(libraryId: string, accountId: string, role: LibraryRole): Promise<LibraryMember>;
  removeLibraryMember(libraryId: string, accountId: string): Promise<void>;
  listLibraryHoldings(libraryId: string, signal?: AbortSignal): Promise<LibraryHolding[]>;
  listLibraryHoldingsSorted?(libraryId: string, sort: LibraryHoldingSort, cursor: string | null, signal?: AbortSignal): Promise<LibraryHoldingsPage>;
  previewLibraryBatchNaming?(libraryId: string, fileIds: string[], signal?: AbortSignal): Promise<BatchNamingPreview>;
  applyLibraryBatchNaming?(libraryId: string, items: BatchNamingItemInput[]): Promise<{ results: BatchNamingResultItem[] }>;
  searchLibraryHoldings(libraryId: string, query: string, signal?: AbortSignal, cursor?: string, limit?: number, filters?: LibrarySearchFilters, sort?: LibrarySearchSort): Promise<LibrarySearchPage>;
  getLibraryHoldingDetails(libraryId: string, fileId: string, signal?: AbortSignal): Promise<LibraryHoldingDetails>;
  updateLibraryHoldingMetadata(libraryId: string, fileId: string, input: LibraryMetadataInput): Promise<LibraryHoldingDetails>;
  updateLibraryHoldingBibliography?(libraryId: string, fileId: string, input: LibraryBibliographyInput): Promise<LibraryHoldingDetails>;
  restoreLibraryHoldingBibliographyAi?(
    libraryId: string,
    fileId: string,
    input: { bibliographyVersion: string; fields: Array<{ fieldName: BibliographicFieldName; scopeKey: string }> },
  ): Promise<LibraryHoldingDetails>;
  generateLibraryCitation?(
    libraryId: string,
    fileId: string,
    input: { style: CitationStyleId; locators: CitationLocator[] },
  ): Promise<CitationResult>;
  /** Metadata suggestions are optional for compatibility with older API fakes. */
  generateLibraryMetadataSuggestions?(libraryId: string, fileId: string): Promise<DerivedMetadataJob>;
  getLatestLibraryMetadataSuggestionJob?(
    libraryId: string,
    fileId: string,
    signal?: AbortSignal,
  ): Promise<DerivedMetadataJob | null>;
  getLatestLibraryMetadataSuggestionStates?(
    libraryId: string,
    fileIds: string[],
    signal?: AbortSignal,
  ): Promise<MetadataCataloguingSummary[]>;
  getLibraryMetadataSuggestionJob?(
    libraryId: string,
    fileId: string,
    jobId: string,
    signal?: AbortSignal,
  ): Promise<DerivedMetadataJob>;
  getLibraryMetadataSuggestions?(libraryId: string, fileId: string, signal?: AbortSignal): Promise<MetadataSuggestionRun | null>;
  acceptLibraryMetadataSuggestions?(
    libraryId: string,
    fileId: string,
    runId: string,
    input: MetadataSuggestionAcceptInput,
  ): Promise<MetadataSuggestionAcceptResponse>;
  listLibraryAuthorities(libraryId: string, type: AuthorityType, signal?: AbortSignal): Promise<LibraryAuthority[]>;
  createLibraryAuthority(libraryId: string, input: { type: AuthorityType; canonicalLabel: string; aliases: string[] }): Promise<LibraryAuthority>;
  createLibraryDownload(libraryId: string, fileId: string, disposition?: "attachment" | "inline"): Promise<DownloadAuthorization>;
  recycleLibraryHolding(libraryId: string, fileId: string, version: string): Promise<void>;
  listLibraryRecycle(libraryId: string, signal?: AbortSignal): Promise<LibraryRecycleFile[]>;
  restoreLibraryHolding(libraryId: string, fileId: string, version: string): Promise<void>;
  submitLibraryContribution(libraryId: string, artifactId: string): Promise<LibraryContribution>;
  listLibraryContributions(libraryId: string): Promise<LibraryContribution[]>;
  listMyLibraryContributions(libraryId: string): Promise<LibraryContribution[]>;
  reviewLibraryContribution(libraryId: string, contributionId: string, decision: "approve" | "reject"): Promise<LibraryContribution>;
  withdrawLibraryContribution(libraryId: string, contributionId: string): Promise<LibraryContribution>;
  createContributionDownload(libraryId: string, contributionId: string, disposition?: "attachment" | "inline"): Promise<DownloadAuthorization>;
  setFileFavorite(fileId: string, favorite: boolean): Promise<void>;
  setFolderFavorite(folderId: string, favorite: boolean): Promise<void>;
  createFolder(name: string, parentId: string | null): Promise<FolderEntry>;
  updateFolder(folderId: string, update: { name?: string; parentId?: string | null }): Promise<FolderEntry>;
  deleteFolder(folderId: string): Promise<void>;
  permanentlyDeleteFolder(folderId: string, version: string): Promise<void>;
  restoreFolder(folderId: string): Promise<FolderEntry>;
  createUpload(input: {
    folderId: string | null;
    displayName: string;
    mediaType: string;
    sizeBytes: number;
    checksum: { algorithm: "md5"; value: string };
  }): Promise<{ file: FileEntry; transfer: MultipartTransfer } | { file: FileEntry; upload: UploadAuthorization }>;
  renewUpload(fileId: string): Promise<UploadAuthorization>;
  completeUpload(fileId: string): Promise<FileEntry>;
  getUploadStatus?(fileId: string): Promise<UploadTransfer>;
  authorizeUploadPart?(
    fileId: string,
    partNumber: number,
    input: { version: string; sizeBytes: number; contentMd5: string },
  ): Promise<MultipartPartAuthorization>;
  pauseUpload?(fileId: string, version: string): Promise<MultipartTransfer>;
  resumeUpload?(fileId: string, version: string): Promise<MultipartTransfer>;
  completeMultipartUpload?(fileId: string, version: string): Promise<FileEntry>;
  abandonMultipartUpload?(fileId: string, version: string): Promise<void>;
  abandonLegacyUpload?(fileId: string): Promise<void>;
  createDownload(fileId: string, disposition?: "attachment" | "inline"): Promise<DownloadAuthorization>;
  updateFile(fileId: string, update: { displayName?: string; folderId?: string | null }): Promise<FileEntry>;
  deleteFile(fileId: string): Promise<void>;
  restoreFile(fileId: string): Promise<FileEntry>;
  permanentlyDeleteFile(fileId: string, version: string): Promise<void>;
  permanentlyDeleteLibraryHolding(libraryId: string, fileId: string, version: string): Promise<void>;
}

export class ApiClient implements AcademicCloudApi {
  readonly #fetch: Fetcher;
  readonly #onUnauthorized: () => void;

  constructor(options: { fetcher?: Fetcher; onUnauthorized?: () => void } = {}) {
    this.#fetch = options.fetcher ?? globalThis.fetch.bind(globalThis);
    this.#onUnauthorized = options.onUnauthorized ?? (() => undefined);
  }

  async #request<T>(path: string, init: RequestInit = {}): Promise<T> {
    const headers = new Headers(init.headers);
    headers.set("Accept", "application/json");
    const response = await this.#fetch(path, {
      ...init,
      credentials: "same-origin",
      headers,
    });

    if (!response.ok) {
      let code = "request_failed";
      try {
        const body = (await response.json()) as { error?: unknown };
        if (typeof body.error === "string") {
          code = body.error;
        }
      } catch {
        // A proxy or network edge may return a non-JSON error page.
      }
      if (response.status === 401 && code === "authentication_required") {
        this.#onUnauthorized();
      }
      throw new ApiError(response.status, code);
    }

    if (response.status === 204) {
      return undefined as T;
    }

    return (await response.json()) as T;
  }

  // JSON body request: the body is REQUIRED by the type signature, so an
  // accidental "Content-Type: application/json with an empty body" request
  // (rejected by the Fastify JSON parser with 400) cannot be constructed.
  #jsonBody<T>(path: string, method: "POST" | "PATCH" | "PUT", body: unknown): Promise<T> {
    return this.#request<T>(path, {
      method,
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify(body),
    });
  }

  // Bodyless action: sends NO Content-Type and NO body. Fastify routes for
  // these actions are bodyless by contract (POST/PUT/DELETE alike).
  #action<T>(path: string, method: "POST" | "PUT" | "DELETE"): Promise<T> {
    return this.#request<T>(path, { method });
  }

  async getSession(signal?: AbortSignal): Promise<Account> {
    const response = await this.#request<{ account: Account }>(
      "/api/auth/session",
      signal ? { signal } : {},
    );
    return response.account;
  }

  async login(loginName: string, password: string): Promise<Account> {
    const response = await this.#jsonBody<{ account: Account }>("/api/auth/login", "POST", { loginName, password });
    return response.account;
  }

  async registerMember(inviteToken: string, loginName: string, password: string): Promise<ManagedAccount> {
    const response = await this.#jsonBody<{ account: ManagedAccount }>("/api/auth/register", "POST", {
      inviteToken,
      loginName,
      password,
    });
    return response.account;
  }

  redeemCredentialReset(token: string, newPassword: string): Promise<void> {
    return this.#jsonBody<void>("/api/auth/credential-reset", "POST", { token, newPassword });
  }

  logout(): Promise<void> {
    return this.#action<void>("/api/auth/logout", "POST");
  }

  createInvitation(): Promise<{ invitation: Invitation; rawToken: string }> {
    return this.#action("/api/accounts/invitations", "POST");
  }

  async listInvitations(): Promise<Invitation[]> {
    return (await this.#request<{ invitations: Invitation[] }>("/api/accounts/invitations")).invitations;
  }

  async revokeInvitation(invitationId: string): Promise<Invitation> {
    return (await this.#action<{ invitation: Invitation }>(
      `/api/accounts/invitations/${encodeURIComponent(invitationId)}`,
      "DELETE",
    )).invitation;
  }

  async listAccounts(includeArchived = false): Promise<ManagedAccount[]> {
    const path = includeArchived ? "/api/accounts?includeArchived=true" : "/api/accounts";
    return (await this.#request<{ accounts: ManagedAccount[] }>(path)).accounts;
  }

  async setAccountState(accountId: string, state: "active" | "disabled" | "archived"): Promise<ManagedAccount> {
    return (await this.#jsonBody<{ account: ManagedAccount }>(
      `/api/accounts/${encodeURIComponent(accountId)}/state`,
      "PATCH",
      { state },
    )).account;
  }

  issueCredentialReset(accountId: string): Promise<CredentialResetIssue> {
    return this.#action<CredentialResetIssue>(
      `/api/accounts/${encodeURIComponent(accountId)}/credential-reset`,
      "POST",
    );
  }

  async listAnnouncements(signal?: AbortSignal): Promise<Announcement[]> {
    return (await this.#request<{ announcements: Announcement[] }>(
      "/api/announcements",
      signal ? { signal } : {},
    )).announcements;
  }

  async listAllAnnouncements(): Promise<Announcement[]> {
    return (await this.#request<{ announcements: Announcement[] }>("/api/announcements/admin")).announcements;
  }

  async createAnnouncement(input: AnnouncementInput): Promise<Announcement> {
    return (await this.#jsonBody<{ announcement: Announcement }>(
      "/api/announcements",
      "POST",
      input,
    )).announcement;
  }

  async updateAnnouncement(announcementId: string, input: AnnouncementInput): Promise<Announcement> {
    return (await this.#jsonBody<{ announcement: Announcement }>(
      `/api/announcements/${encodeURIComponent(announcementId)}`,
      "PATCH",
      input,
    )).announcement;
  }

  publishAnnouncement(announcementId: string): Promise<Announcement> {
    return this.#action<{ announcement: Announcement }>(
      `/api/announcements/${encodeURIComponent(announcementId)}/publish`,
      "POST",
    ).then((response) => response.announcement);
  }

  unpublishAnnouncement(announcementId: string): Promise<Announcement> {
    return this.#action<{ announcement: Announcement }>(
      `/api/announcements/${encodeURIComponent(announcementId)}/unpublish`,
      "POST",
    ).then((response) => response.announcement);
  }

  deleteAnnouncement(announcementId: string): Promise<void> {
    return this.#action<void>(`/api/announcements/${encodeURIComponent(announcementId)}`, "DELETE");
  }

  listAuditEvents(beforeId?: number, limit?: number, signal?: AbortSignal): Promise<AuditPage> {
    const query = new URLSearchParams();
    if (beforeId !== undefined) query.set("beforeId", String(beforeId));
    if (limit !== undefined) query.set("limit", String(limit));
    const suffix = query.size > 0 ? `?${query.toString()}` : "";
    return this.#request<AuditPage>(`/api/audit/events${suffix}`, signal ? { signal } : {});
  }

  async listEntries(folderId: string | null, signal?: AbortSignal): Promise<EntriesResponse> {
    return this.#request<EntriesResponse>(drivePath("entries", folderId), signal ? { signal } : {});
  }

  async listPending(folderId: string | null, signal?: AbortSignal): Promise<FileEntry[]> {
    const response = await this.#request<{ files: FileEntry[] }>(
      drivePath("uploads", folderId),
      signal ? { signal } : {},
    );
    return response.files;
  }

  listRecycle(signal?: AbortSignal): Promise<RecycleResponse> {
    return this.#request<RecycleResponse>("/api/drive/recycle", signal ? { signal } : {});
  }

  listFavorites(signal?: AbortSignal): Promise<FavoritesResponse> {
    return this.#request<FavoritesResponse>("/api/favorites", signal ? { signal } : {});
  }

  bulkOperation(input: BulkOperationInput): Promise<BulkOperationResult> {
    return this.#jsonBody<BulkOperationResult>("/api/drive/bulk", "POST", input);
  }

  listScholarlyRecords(signal?: AbortSignal, beforeId?: string, limit?: number): Promise<ScholarlyRecordPage> {
    const query = new URLSearchParams();
    if (beforeId !== undefined) query.set("beforeId", beforeId);
    if (limit !== undefined) query.set("limit", String(limit));
    const suffix = query.size > 0 ? `?${query.toString()}` : "";
    return this.#request<ScholarlyRecordPage>(
      `/api/research/records${suffix}`,
      signal ? { signal } : {},
    );
  }

  async getScholarlyRecord(
    recordId: string,
    signal?: AbortSignal,
    beforeArtifactId?: string,
    limit?: number,
  ): Promise<ScholarlyRecord> {
    const query = new URLSearchParams();
    if (beforeArtifactId !== undefined) query.set("beforeArtifactId", beforeArtifactId);
    if (limit !== undefined) query.set("limit", String(limit));
    const suffix = query.size > 0 ? `?${query.toString()}` : "";
    const response = await this.#request<{ record: ScholarlyRecord }>(
      `/api/research/records/${encodeURIComponent(recordId)}${suffix}`,
      signal ? { signal } : {},
    );
    return response.record;
  }

  async createScholarlyRecord(label: string): Promise<ScholarlyRecord> {
    const response = await this.#jsonBody<{ record: ScholarlyRecord }>(
      "/api/research/records",
      "POST",
      { label },
    );
    return response.record;
  }

  async attachFileToScholarlyRecord(recordId: string, fileId: string): Promise<ScholarlyRecord> {
    const response = await this.#jsonBody<{ record: ScholarlyRecord }>(
      `/api/research/records/${encodeURIComponent(recordId)}/artifacts`,
      "POST",
      { fileId },
    );
    return response.record;
  }

  async detachScholarlyArtifact(recordId: string, artifactId: string): Promise<ScholarlyRecord> {
    const response = await this.#request<{ record: ScholarlyRecord }>(
      `/api/research/records/${encodeURIComponent(recordId)}/artifacts/${encodeURIComponent(artifactId)}`,
      { method: "DELETE" },
    );
    return response.record;
  }

  async listLibraries(signal?: AbortSignal): Promise<LibrarySummary[]> {
    return (await this.#request<{ libraries: LibrarySummary[] }>("/api/libraries", signal ? { signal } : {})).libraries;
  }

  async listLibraryMembers(libraryId: string): Promise<LibraryMember[]> {
    return (await this.#request<{ members: LibraryMember[] }>(
      `/api/libraries/${encodeURIComponent(libraryId)}/members`,
    )).members;
  }

  async addLibraryMember(libraryId: string, accountId: string, role: LibraryRole): Promise<LibraryMember> {
    return (await this.#jsonBody<{ member: LibraryMember }>(
      `/api/libraries/${encodeURIComponent(libraryId)}/members`,
      "POST",
      { accountId, role },
    )).member;
  }

  async changeLibraryMemberRole(libraryId: string, accountId: string, role: LibraryRole): Promise<LibraryMember> {
    return (await this.#jsonBody<{ member: LibraryMember }>(
      `/api/libraries/${encodeURIComponent(libraryId)}/members/${encodeURIComponent(accountId)}`,
      "PATCH",
      { role },
    )).member;
  }

  removeLibraryMember(libraryId: string, accountId: string): Promise<void> {
    return this.#request<void>(
      `/api/libraries/${encodeURIComponent(libraryId)}/members/${encodeURIComponent(accountId)}`,
      { method: "DELETE" },
    );
  }

  async listLibraryHoldings(libraryId: string, signal?: AbortSignal): Promise<LibraryHolding[]> {
    return (await this.#request<{ holdings: LibraryHolding[] }>(
      `/api/libraries/${encodeURIComponent(libraryId)}/holdings`,
      signal ? { signal } : {},
    )).holdings;
  }

  async listLibraryHoldingsSorted(
    libraryId: string,
    sort: LibraryHoldingSort,
    cursor: string | null,
    signal?: AbortSignal,
  ): Promise<{ holdings: LibraryHolding[]; nextCursor: string | null }> {
    const params = new URLSearchParams({ sort, limit: "100" });
    if (cursor) params.set("cursor", cursor);
    return this.#request<{ holdings: LibraryHolding[]; nextCursor: string | null }>(
      `/api/libraries/${encodeURIComponent(libraryId)}/holdings?${params.toString()}`,
      signal ? { signal } : {},
    );
  }

  async previewLibraryBatchNaming(
    libraryId: string,
    fileIds: string[],
    signal?: AbortSignal,
  ): Promise<BatchNamingPreview> {
    const params = new URLSearchParams({ fileIds: fileIds.join(",") });
    return this.#request<BatchNamingPreview>(
      `/api/libraries/${encodeURIComponent(libraryId)}/holdings/batch-naming?${params.toString()}`,
      signal ? { signal } : {},
    );
  }

  applyLibraryBatchNaming(libraryId: string, items: BatchNamingItemInput[]): Promise<{ results: BatchNamingResultItem[] }> {
    return this.#jsonBody<{ results: BatchNamingResultItem[] }>(
      `/api/libraries/${encodeURIComponent(libraryId)}/holdings/batch-naming`,
      "POST",
      { items },
    );
  }

  async searchLibraryHoldings(
    libraryId: string,
    query: string,
    signal?: AbortSignal,
    cursor?: string,
    limit?: number,
    filters?: LibrarySearchFilters,
    sort?: LibrarySearchSort,
  ): Promise<LibrarySearchPage> {
    const params = new URLSearchParams({ q: query });
    if (cursor) params.set("cursor", cursor);
    if (limit !== undefined) params.set("limit", String(limit));
    if (sort !== undefined) params.set("sort", sort);
    if (filters) {
      for (const [key, value] of Object.entries(filters)) {
        if (value !== undefined && value !== "") params.set(key, value);
      }
    }
    return this.#request<LibrarySearchPage>(
      `/api/libraries/${encodeURIComponent(libraryId)}/holdings/search?${params.toString()}`,
      signal ? { signal } : {},
    );
  }

  getLibraryHoldingDetails(libraryId: string, fileId: string, signal?: AbortSignal): Promise<LibraryHoldingDetails> {
    return this.#request<LibraryHoldingDetails>(
      `/api/libraries/${encodeURIComponent(libraryId)}/holdings/${encodeURIComponent(fileId)}/details`,
      signal ? { signal } : {},
    );
  }

  updateLibraryHoldingMetadata(libraryId: string, fileId: string, input: LibraryMetadataInput): Promise<LibraryHoldingDetails> {
    return this.#jsonBody<LibraryHoldingDetails>(
      `/api/libraries/${encodeURIComponent(libraryId)}/holdings/${encodeURIComponent(fileId)}/metadata`,
      "PUT",
      input,
    );
  }

  updateLibraryHoldingBibliography(libraryId: string, fileId: string, input: LibraryBibliographyInput): Promise<LibraryHoldingDetails> {
    return this.#jsonBody<LibraryHoldingDetails>(
      `/api/libraries/${encodeURIComponent(libraryId)}/holdings/${encodeURIComponent(fileId)}/bibliography`,
      "PUT",
      input,
    );
  }

  restoreLibraryHoldingBibliographyAi(
    libraryId: string,
    fileId: string,
    input: { bibliographyVersion: string; fields: Array<{ fieldName: BibliographicFieldName; scopeKey: string }> },
  ): Promise<LibraryHoldingDetails> {
    return this.#jsonBody<LibraryHoldingDetails>(
      `/api/libraries/${encodeURIComponent(libraryId)}/holdings/${encodeURIComponent(fileId)}/bibliography/restore-ai`,
      "POST",
      input,
    );
  }

  generateLibraryCitation(
    libraryId: string,
    fileId: string,
    input: { style: CitationStyleId; locators: CitationLocator[] },
  ): Promise<CitationResult> {
    return this.#jsonBody<CitationResult>(
      `/api/libraries/${encodeURIComponent(libraryId)}/holdings/${encodeURIComponent(fileId)}/citation`,
      "POST",
      input,
    );
  }

  async generateLibraryMetadataSuggestions(libraryId: string, fileId: string): Promise<DerivedMetadataJob> {
    const response = await this.#action<{ job: DerivedMetadataJob }>(
      `/api/libraries/${encodeURIComponent(libraryId)}/holdings/${encodeURIComponent(fileId)}/metadata/suggestions`,
      "POST",
    );
    return response.job;
  }

  async getLatestLibraryMetadataSuggestionJob(
    libraryId: string,
    fileId: string,
    signal?: AbortSignal,
  ): Promise<DerivedMetadataJob | null> {
    return (await this.#request<{ job: DerivedMetadataJob | null }>(
      `/api/libraries/${encodeURIComponent(libraryId)}/holdings/${encodeURIComponent(fileId)}/metadata/suggestion-jobs/latest`,
      signal ? { signal } : {},
    )).job;
  }

  async getLatestLibraryMetadataSuggestionStates(
    libraryId: string,
    fileIds: string[],
    signal?: AbortSignal,
  ): Promise<MetadataCataloguingSummary[]> {
    const query = new URLSearchParams({ fileIds: fileIds.join(",") });
    return (await this.#request<{ states: MetadataCataloguingSummary[] }>(
      `/api/libraries/${encodeURIComponent(libraryId)}/metadata/suggestion-states?${query.toString()}`,
      signal ? { signal } : {},
    )).states;
  }

  async getLibraryMetadataSuggestionJob(
    libraryId: string,
    fileId: string,
    jobId: string,
    signal?: AbortSignal,
  ): Promise<DerivedMetadataJob> {
    return (await this.#request<{ job: DerivedMetadataJob }>(
      `/api/libraries/${encodeURIComponent(libraryId)}/holdings/${encodeURIComponent(fileId)}/metadata/suggestion-jobs/${encodeURIComponent(jobId)}`,
      signal ? { signal } : {},
    )).job;
  }

  async getLibraryMetadataSuggestions(
    libraryId: string,
    fileId: string,
    signal?: AbortSignal,
  ): Promise<MetadataSuggestionRun | null> {
    const response = await this.#request<MetadataSuggestionResponse | MetadataSuggestionRun>(
      `/api/libraries/${encodeURIComponent(libraryId)}/holdings/${encodeURIComponent(fileId)}/metadata/suggestions`,
      signal ? { signal } : {},
    );
    return "run" in response ? response.run : response;
  }

  acceptLibraryMetadataSuggestions(
    libraryId: string,
    fileId: string,
    runId: string,
    input: MetadataSuggestionAcceptInput,
  ): Promise<MetadataSuggestionAcceptResponse> {
    return this.#jsonBody<MetadataSuggestionAcceptResponse>(
      `/api/libraries/${encodeURIComponent(libraryId)}/holdings/${encodeURIComponent(fileId)}/metadata/suggestions/${encodeURIComponent(runId)}/accept`,
      "POST",
      input,
    );
  }

  async listLibraryAuthorities(libraryId: string, type: AuthorityType, signal?: AbortSignal): Promise<LibraryAuthority[]> {
    return (await this.#request<{ authorities: LibraryAuthority[] }>(
      `/api/libraries/${encodeURIComponent(libraryId)}/authorities?type=${encodeURIComponent(type)}`,
      signal ? { signal } : {},
    )).authorities;
  }

  async createLibraryAuthority(
    libraryId: string,
    input: { type: AuthorityType; canonicalLabel: string; aliases: string[] },
  ): Promise<LibraryAuthority> {
    return (await this.#jsonBody<{ authority: LibraryAuthority }>(
      `/api/libraries/${encodeURIComponent(libraryId)}/authorities`,
      "POST",
      input,
    )).authority;
  }

  async createLibraryDownload(
    libraryId: string,
    fileId: string,
    disposition: "attachment" | "inline" = "attachment",
  ): Promise<DownloadAuthorization> {
    const query = new URLSearchParams({ disposition });
    return (await this.#request<{ download: DownloadAuthorization }>(
      `/api/libraries/${encodeURIComponent(libraryId)}/holdings/${encodeURIComponent(fileId)}/download?${query.toString()}`,
    )).download;
  }

  recycleLibraryHolding(libraryId: string, fileId: string, version: string): Promise<void> {
    return this.#request<void>(
      `/api/libraries/${encodeURIComponent(libraryId)}/holdings/${encodeURIComponent(fileId)}/recycle`,
      {
        method: "POST",
        headers: { "content-type": "application/json" },
        body: JSON.stringify({ version }),
      },
    );
  }

  async listLibraryRecycle(libraryId: string, signal?: AbortSignal): Promise<LibraryRecycleFile[]> {
    return (await this.#request<{ files: LibraryRecycleFile[] }>(
      `/api/libraries/${encodeURIComponent(libraryId)}/recycle`,
      signal ? { signal } : {},
    )).files;
  }

  restoreLibraryHolding(libraryId: string, fileId: string, version: string): Promise<void> {
    return this.#request<void>(
      `/api/libraries/${encodeURIComponent(libraryId)}/recycle/${encodeURIComponent(fileId)}/restore`,
      {
        method: "POST",
        headers: { "content-type": "application/json" },
        body: JSON.stringify({ version }),
      },
    );
  }

  async submitLibraryContribution(libraryId: string, artifactId: string): Promise<LibraryContribution> {
    return (await this.#jsonBody<{ contribution: LibraryContribution }>(
      `/api/libraries/${encodeURIComponent(libraryId)}/contributions`,
      "POST",
      { artifactId },
    )).contribution;
  }

  async listLibraryContributions(libraryId: string): Promise<LibraryContribution[]> {
    return (await this.#request<{ contributions: LibraryContribution[] }>(
      `/api/libraries/${encodeURIComponent(libraryId)}/contributions`,
    )).contributions;
  }

  async listMyLibraryContributions(libraryId: string): Promise<LibraryContribution[]> {
    return (await this.#request<{ contributions: LibraryContribution[] }>(
      `/api/libraries/${encodeURIComponent(libraryId)}/contributions/mine`,
    )).contributions;
  }

  async reviewLibraryContribution(
    libraryId: string,
    contributionId: string,
    decision: "approve" | "reject",
  ): Promise<LibraryContribution> {
    return (await this.#action<{ contribution: LibraryContribution }>(
      `/api/libraries/${encodeURIComponent(libraryId)}/contributions/${encodeURIComponent(contributionId)}/${decision}`,
      "POST",
    )).contribution;
  }

  async withdrawLibraryContribution(libraryId: string, contributionId: string): Promise<LibraryContribution> {
    return (await this.#action<{ contribution: LibraryContribution }>(
      `/api/libraries/${encodeURIComponent(libraryId)}/contributions/${encodeURIComponent(contributionId)}/withdraw`,
      "POST",
    )).contribution;
  }

  async createContributionDownload(
    libraryId: string,
    contributionId: string,
    disposition: "attachment" | "inline" = "attachment",
  ): Promise<DownloadAuthorization> {
    const query = new URLSearchParams({ disposition });
    return (await this.#request<{ download: DownloadAuthorization }>(
      `/api/libraries/${encodeURIComponent(libraryId)}/contributions/${encodeURIComponent(contributionId)}/download?${query.toString()}`,
    )).download;
  }

  setFileFavorite(fileId: string, favorite: boolean): Promise<void> {
    return this.#action<void>(
      `/api/favorites/files/${encodeURIComponent(fileId)}`,
      favorite ? "PUT" : "DELETE",
    );
  }

  setFolderFavorite(folderId: string, favorite: boolean): Promise<void> {
    return this.#action<void>(
      `/api/favorites/folders/${encodeURIComponent(folderId)}`,
      favorite ? "PUT" : "DELETE",
    );
  }

  async createFolder(name: string, parentId: string | null): Promise<FolderEntry> {
    const response = await this.#jsonBody<{ folder: FolderEntry }>("/api/drive/folders", "POST", { name, parentId });
    return response.folder;
  }

  async updateFolder(folderId: string, update: { name?: string; parentId?: string | null }): Promise<FolderEntry> {
    const response = await this.#jsonBody<{ folder: FolderEntry }>(
      `/api/drive/folders/${encodeURIComponent(folderId)}`,
      "PATCH",
      update,
    );
    return response.folder;
  }

  deleteFolder(folderId: string): Promise<void> {
    return this.#request<void>(`/api/drive/folders/${encodeURIComponent(folderId)}`, { method: "DELETE" });
  }

  permanentlyDeleteFolder(folderId: string, version: string): Promise<void> {
    return this.#request<void>(`/api/drive/folders/${encodeURIComponent(folderId)}/permanent`, {
      method: "DELETE",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({ version }),
    });
  }

  restoreFolder(folderId: string): Promise<FolderEntry> {
    return this.#action<{ folder: FolderEntry }>(
      `/api/drive/folders/${encodeURIComponent(folderId)}/restore`,
      "POST",
    ).then((response) => response.folder);
  }

  async createUpload(input: {
    folderId: string | null;
    displayName: string;
    mediaType: string;
    sizeBytes: number;
    checksum: { algorithm: "md5"; value: string };
  }): Promise<{ file: FileEntry; transfer: MultipartTransfer }> {
    return this.#jsonBody("/api/drive/uploads", "POST", input);
  }

  renewUpload(fileId: string): Promise<UploadAuthorization> {
    return this.#action<{ upload: UploadAuthorization }>(
      `/api/drive/uploads/${encodeURIComponent(fileId)}/authorization`,
      "POST",
    ).then((response) => response.upload);
  }

  completeUpload(fileId: string): Promise<FileEntry> {
    return this.#action<{ file: FileEntry }>(
      `/api/drive/uploads/${encodeURIComponent(fileId)}/complete`,
      "POST",
    ).then((response) => response.file);
  }

  getUploadStatus(fileId: string): Promise<UploadTransfer> {
    return this.#request<{ transfer: UploadTransfer }>(
      `/api/drive/uploads/${encodeURIComponent(fileId)}/status`,
    ).then((response) => response.transfer);
  }

  authorizeUploadPart(
    fileId: string,
    partNumber: number,
    input: { version: string; sizeBytes: number; contentMd5: string },
  ): Promise<MultipartPartAuthorization> {
    return this.#jsonBody<{ authorization: MultipartPartAuthorization }>(
      `/api/drive/uploads/${encodeURIComponent(fileId)}/parts/${partNumber}/authorization`,
      "POST",
      input,
    ).then((response) => response.authorization);
  }

  pauseUpload(fileId: string, version: string): Promise<MultipartTransfer> {
    return this.#jsonBody<{ transfer: MultipartTransfer }>(
      `/api/drive/uploads/${encodeURIComponent(fileId)}/pause`,
      "POST",
      { version },
    ).then((response) => response.transfer);
  }

  resumeUpload(fileId: string, version: string): Promise<MultipartTransfer> {
    return this.#jsonBody<{ transfer: MultipartTransfer }>(
      `/api/drive/uploads/${encodeURIComponent(fileId)}/resume`,
      "POST",
      { version },
    ).then((response) => response.transfer);
  }

  completeMultipartUpload(fileId: string, version: string): Promise<FileEntry> {
    return this.#jsonBody<{ file: FileEntry }>(
      `/api/drive/uploads/${encodeURIComponent(fileId)}/multipart/complete`,
      "POST",
      { version },
    ).then((response) => response.file);
  }

  abandonMultipartUpload(fileId: string, version: string): Promise<void> {
    return this.#request<void>(`/api/drive/uploads/${encodeURIComponent(fileId)}/multipart`, {
      method: "DELETE",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({ version }),
    });
  }

  abandonLegacyUpload(fileId: string): Promise<void> {
    return this.#request<void>(`/api/drive/uploads/${encodeURIComponent(fileId)}/legacy`, { method: "DELETE" });
  }

  async createDownload(fileId: string, disposition: "attachment" | "inline" = "attachment"): Promise<DownloadAuthorization> {
    const response = await this.#request<{ download: DownloadAuthorization }>(
      `/api/drive/files/${encodeURIComponent(fileId)}/download?disposition=${disposition}`,
    );
    return response.download;
  }

  async updateFile(fileId: string, update: { displayName?: string; folderId?: string | null }): Promise<FileEntry> {
    const response = await this.#jsonBody<{ file: FileEntry }>(
      `/api/drive/files/${encodeURIComponent(fileId)}`,
      "PATCH",
      update,
    );
    return response.file;
  }

  deleteFile(fileId: string): Promise<void> {
    return this.#request<void>(`/api/drive/files/${encodeURIComponent(fileId)}`, { method: "DELETE" });
  }

  restoreFile(fileId: string): Promise<FileEntry> {
    return this.#action<{ file: FileEntry }>(
      `/api/drive/files/${encodeURIComponent(fileId)}/restore`,
      "POST",
    ).then((response) => response.file);
  }

  permanentlyDeleteFile(fileId: string, version: string): Promise<void> {
    return this.#request<void>(`/api/drive/files/${encodeURIComponent(fileId)}/permanent`, {
      method: "DELETE",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({ version }),
    });
  }

  permanentlyDeleteLibraryHolding(libraryId: string, fileId: string, version: string): Promise<void> {
    return this.#request<void>(
      `/api/libraries/${encodeURIComponent(libraryId)}/recycle/${encodeURIComponent(fileId)}/permanent`,
      {
        method: "DELETE",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ version }),
      },
    );
  }
}

function drivePath(resource: "entries" | "uploads", folderId: string | null): string {
  return folderId === null
    ? `/api/drive/${resource}`
    : `/api/drive/${resource}?folderId=${encodeURIComponent(folderId)}`;
}
