import { useEffect, useMemo, useRef, useState, type Dispatch, type SetStateAction } from "react";

import {
  ApiError,
  type AcademicCloudApi,
  type AiSuggestedBibliography,
  type AuthorityRole,
  type AuthorityType,
  type BibliographicFieldAuthority,
  type BibliographicFieldName,
  type ContributorRole,
  type DerivedMetadataJob,
  type EditionType,
  type LibraryAuthority,
  type LibraryBibliographyInput,
  type LibraryHolding,
  type LibraryHoldingDetails,
  type MetadataSuggestionAcceptInput,
  type MetadataSuggestionCandidate,
  type MetadataSuggestionRun,
  type MetadataSuggestionConfidence,
  type MetadataSuggestionEvidenceOrigin,
  type MetadataSuggestionSourceType,
  type LibraryMetadataInput,
  type LibrarySummary,
  type MaterialClass,
  type MetadataCataloguingState,
  type MaterialType,
  type MetadataTypeFields,
} from "./api.ts";
import { describeError, type MessageKey } from "./i18n.ts";
import { useLanguage } from "./i18n-react.tsx";
import { deriveMetadataCataloguingState } from "./metadata-cataloguing-state.ts";

const MATERIAL_TYPES: MaterialType[] = ["book", "article", "manuscript", "inscription", "archival_document"];
const AUTHORITY_TYPES: AuthorityType[] = ["person", "place", "language", "work", "institution"];
const ROLES_BY_TYPE: Record<AuthorityType, AuthorityRole[]> = {
  person: ["author", "editor", "translator", "compiler", "scribe", "sender", "recipient", "creator", "contributor"],
  place: ["publication_place", "creation_place", "discovery_place"],
  language: ["content_language", "original_language"],
  work: ["container_work", "series_work", "source_work"],
  institution: ["publisher", "holding_institution", "issuing_body", "creator"],
};
const FIELDS_BY_TYPE: Record<MaterialType, Array<{ key: keyof MetadataTypeFields; max: number }>> = {
  book: [{ key: "editionStatement", max: 128 }, { key: "volumeStatement", max: 128 }],
  article: [{ key: "volumeStatement", max: 64 }, { key: "issueStatement", max: 64 }, { key: "locator", max: 128 }],
  manuscript: [
    { key: "shelfmark", max: 128 }, { key: "supportStatement", max: 128 },
    { key: "extentStatement", max: 128 }, { key: "scriptStatement", max: 128 },
  ],
  inscription: [
    { key: "objectType", max: 128 }, { key: "materialStatement", max: 128 },
    { key: "dimensionsStatement", max: 128 }, { key: "scriptStatement", max: 128 },
  ],
  archival_document: [
    { key: "documentType", max: 128 }, { key: "fondsOrCollection", max: 255 },
    { key: "seriesStatement", max: 255 }, { key: "referenceCode", max: 128 },
  ],
};

type LinkDraft = { authorityId: string; role: AuthorityRole };
type IdentifierDraft = { scheme: string; value: string };
type BibliographyDraft = {
  materialClass: MaterialClass;
  contributors: Array<{ id?: string; label: string; role: ContributorRole; roleLabel: string; authorityId?: string }>;
  publisher: string;
  place: string;
  publicationDate: string;
  editionNumber: string;
  printing: string;
  series: string;
  volume: string;
  language: string;
  carrierEditionType: EditionType | "";
  carrierEditionStatement: string;
  facsimileStatement: string;
  sourceDynasty: string;
  sourceReignTitle: string;
  sourceReignYear: string;
  sourceAbsoluteYear: string;
  sourcePrinter: string;
  sourceImprint: string;
  sourceBookshop: string;
  sourceInstitution: string;
  sourcePrintingPlace: string;
  sourceEditionType: EditionType | "";
  sourceEditionStatement: string;
  sourceHoldingInformation: string;
};

const MATERIAL_CLASSES: readonly MaterialClass[] = [
  "scholarly_monograph", "edited_volume", "journal_article", "book_chapter",
  "thesis_dissertation", "conference_paper", "review", "reference_work",
  "dictionary_lexicon", "primary_source_modern_edition", "traditional_book",
  "archival_document", "inscription_epigraphy", "rubbing", "manuscript",
  "collected_documents", "catalogue_bibliography", "other", "unknown",
];
const CONTRIBUTOR_ROLES: readonly ContributorRole[] = [
  "author", "editor", "compiler", "translator", "annotator", "collator",
  "punctuator", "commentator", "reviser", "selector", "organizer", "other",
];
const EDITION_TYPES: readonly EditionType[] = [
  "critical_edition", "annotated_edition", "collated_edition", "punctuated_edition",
  "translated_edition", "facsimile", "reprint", "engraved", "recut",
  "facsimile_engraved", "movable_type", "multicolor_print", "manuscript_copy",
  "hand_copy", "draft_manuscript", "facsimile_hand_copy", "lithograph",
  "letterpress", "composite_repaired", "hand_copy_repaired", "repaired", "other", "unknown",
];

const MATERIAL_LABEL_KEYS: Record<MaterialType, MessageKey> = {
  book: "metadata.typeBook",
  article: "metadata.typeArticle",
  manuscript: "metadata.typeManuscript",
  inscription: "metadata.typeInscription",
  archival_document: "metadata.typeArchivalDocument",
};
const FIELD_LABEL_KEYS: Record<keyof MetadataTypeFields, MessageKey> = {
  editionStatement: "metadata.field.editionStatement",
  volumeStatement: "metadata.field.volumeStatement",
  issueStatement: "metadata.field.issueStatement",
  locator: "metadata.field.locator",
  shelfmark: "metadata.field.shelfmark",
  supportStatement: "metadata.field.supportStatement",
  extentStatement: "metadata.field.extentStatement",
  scriptStatement: "metadata.field.scriptStatement",
  objectType: "metadata.field.objectType",
  materialStatement: "metadata.field.materialStatement",
  dimensionsStatement: "metadata.field.dimensionsStatement",
  documentType: "metadata.field.documentType",
  fondsOrCollection: "metadata.field.fondsOrCollection",
  seriesStatement: "metadata.field.seriesStatement",
  referenceCode: "metadata.field.referenceCode",
};
const ROLE_LABEL_KEYS: Record<AuthorityRole, MessageKey> = {
  author: "metadata.role.author",
  editor: "metadata.role.editor",
  translator: "metadata.role.translator",
  compiler: "metadata.role.compiler",
  scribe: "metadata.role.scribe",
  sender: "metadata.role.sender",
  recipient: "metadata.role.recipient",
  creator: "metadata.role.creator",
  contributor: "metadata.role.contributor",
  publication_place: "metadata.role.publication_place",
  creation_place: "metadata.role.creation_place",
  discovery_place: "metadata.role.discovery_place",
  content_language: "metadata.role.content_language",
  original_language: "metadata.role.original_language",
  container_work: "metadata.role.container_work",
  series_work: "metadata.role.series_work",
  source_work: "metadata.role.source_work",
  publisher: "metadata.role.publisher",
  holding_institution: "metadata.role.holding_institution",
  issuing_body: "metadata.role.issuing_body",
};

function materialLabelKey(type: MaterialType): MessageKey { return MATERIAL_LABEL_KEYS[type]; }
function fieldLabelKey(field: keyof MetadataTypeFields): MessageKey { return FIELD_LABEL_KEYS[field]; }
function roleLabelKey(role: AuthorityRole): MessageKey { return ROLE_LABEL_KEYS[role]; }
function isMaterialType(value: unknown): value is MaterialType {
  return typeof value === "string" && MATERIAL_TYPES.includes(value as MaterialType);
}
function materialLabel(value: unknown, t: ReturnType<typeof useLanguage>["t"]): string {
  return isMaterialType(value) ? t(materialLabelKey(value)) : String(value);
}
function fieldLabel(value: string, t: ReturnType<typeof useLanguage>["t"]): string {
  return value in FIELD_LABEL_KEYS ? t(fieldLabelKey(value as keyof MetadataTypeFields)) : value;
}

function materialClassLabel(value: MaterialClass, t: ReturnType<typeof useLanguage>["t"]): string {
  return t(`materialClass.${value}`);
}

function editionTypeLabel(value: EditionType, t: ReturnType<typeof useLanguage>["t"]): string {
  return t(`editionType.${value}`);
}

function contributorRoleLabel(value: ContributorRole, t: ReturnType<typeof useLanguage>["t"]): string {
  return t(`contributorRole.${value}`);
}

function bibliographyDraftFromDetail(detail: LibraryHoldingDetails): BibliographyDraft {
  const profile = detail.bibliography;
  return {
    materialClass: profile?.materialClass ?? "unknown",
    contributors: profile?.contributors.map((contributor) => ({
      id: contributor.id,
      label: contributor.label,
      role: contributor.role,
      roleLabel: contributor.roleLabel ?? "",
      ...(contributor.authorityId ? { authorityId: contributor.authorityId } : {}),
    })) ?? [],
    publisher: profile?.publication.publisher ?? "",
    place: profile?.publication.place ?? "",
    publicationDate: profile?.publication.publicationDate ?? "",
    editionNumber: profile?.publication.editionNumber ?? "",
    printing: profile?.publication.printing ?? "",
    series: profile?.series ?? "",
    volume: profile?.volume ?? "",
    language: profile?.language ?? "",
    carrierEditionType: profile?.carrierEdition.editionType ?? "",
    carrierEditionStatement: profile?.carrierEdition.editionStatement ?? "",
    facsimileStatement: profile?.carrierEdition.facsimileStatement ?? "",
    sourceDynasty: profile?.sourceEdition.dynasty ?? "",
    sourceReignTitle: profile?.sourceEdition.reignTitle ?? "",
    sourceReignYear: profile?.sourceEdition.reignYear ?? "",
    sourceAbsoluteYear: profile?.sourceEdition.absoluteYear === undefined ? "" : String(profile.sourceEdition.absoluteYear),
    sourcePrinter: profile?.sourceEdition.printer ?? "",
    sourceImprint: profile?.sourceEdition.imprint ?? "",
    sourceBookshop: profile?.sourceEdition.bookshop ?? "",
    sourceInstitution: profile?.sourceEdition.institution ?? "",
    sourcePrintingPlace: profile?.sourceEdition.printingPlace ?? "",
    sourceEditionType: profile?.sourceEdition.editionType ?? "",
    sourceEditionStatement: profile?.sourceEdition.editionStatement ?? "",
    sourceHoldingInformation: profile?.sourceEdition.holdingInformation ?? "",
  };
}

function optionalText(value: string): string | undefined {
  return value.trim() || undefined;
}

function bibliographyInput(draft: BibliographyDraft, bibliographyVersion: string): LibraryBibliographyInput | null {
  const year = draft.sourceAbsoluteYear.trim();
  const absoluteYear = year === "" ? undefined : Number(year);
  if (absoluteYear !== undefined && (!Number.isInteger(absoluteYear) || absoluteYear < -9999 || absoluteYear > 9999)) return null;
  const contributors = draft.contributors.flatMap((contributor) => {
    const label = contributor.label.trim();
    if (!label) return [];
    return [{
      ...(contributor.id ? { id: contributor.id } : {}),
      label,
      role: contributor.role,
      ...(optionalText(contributor.roleLabel) ? { roleLabel: optionalText(contributor.roleLabel)! } : {}),
      ...(contributor.authorityId ? { authorityId: contributor.authorityId } : {}),
    }];
  });
  return {
    bibliographyVersion,
    materialClass: draft.materialClass,
    contributors,
    publication: {
      ...(optionalText(draft.publisher) ? { publisher: optionalText(draft.publisher)! } : {}),
      ...(optionalText(draft.place) ? { place: optionalText(draft.place)! } : {}),
      ...(optionalText(draft.publicationDate) ? { publicationDate: optionalText(draft.publicationDate)! } : {}),
      ...(optionalText(draft.editionNumber) ? { editionNumber: optionalText(draft.editionNumber)! } : {}),
      ...(optionalText(draft.printing) ? { printing: optionalText(draft.printing)! } : {}),
    },
    ...(optionalText(draft.series) ? { series: optionalText(draft.series)! } : {}),
    ...(optionalText(draft.volume) ? { volume: optionalText(draft.volume)! } : {}),
    ...(optionalText(draft.language) ? { language: optionalText(draft.language)! } : {}),
    carrierEdition: {
      ...(draft.carrierEditionType ? { editionType: draft.carrierEditionType } : {}),
      ...(optionalText(draft.carrierEditionStatement) ? { editionStatement: optionalText(draft.carrierEditionStatement)! } : {}),
      ...(optionalText(draft.facsimileStatement) ? { facsimileStatement: optionalText(draft.facsimileStatement)! } : {}),
    },
    sourceEdition: {
      ...(optionalText(draft.sourceDynasty) ? { dynasty: optionalText(draft.sourceDynasty)! } : {}),
      ...(optionalText(draft.sourceReignTitle) ? { reignTitle: optionalText(draft.sourceReignTitle)! } : {}),
      ...(optionalText(draft.sourceReignYear) ? { reignYear: optionalText(draft.sourceReignYear)! } : {}),
      ...(absoluteYear === undefined ? {} : { absoluteYear }),
      ...(optionalText(draft.sourcePrinter) ? { printer: optionalText(draft.sourcePrinter)! } : {}),
      ...(optionalText(draft.sourceImprint) ? { imprint: optionalText(draft.sourceImprint)! } : {}),
      ...(optionalText(draft.sourceBookshop) ? { bookshop: optionalText(draft.sourceBookshop)! } : {}),
      ...(optionalText(draft.sourceInstitution) ? { institution: optionalText(draft.sourceInstitution)! } : {}),
      ...(optionalText(draft.sourcePrintingPlace) ? { printingPlace: optionalText(draft.sourcePrintingPlace)! } : {}),
      ...(draft.sourceEditionType ? { editionType: draft.sourceEditionType } : {}),
      ...(optionalText(draft.sourceEditionStatement) ? { editionStatement: optionalText(draft.sourceEditionStatement)! } : {}),
      ...(optionalText(draft.sourceHoldingInformation) ? { holdingInformation: optionalText(draft.sourceHoldingInformation)! } : {}),
    },
  };
}

function authorityKey(authority: Pick<BibliographicFieldAuthority, "fieldName" | "scopeKey">): string {
  return JSON.stringify([authority.fieldName, authority.scopeKey]);
}

const SUGGESTION_SOURCE_KEYS: Record<MetadataSuggestionSourceType, MessageKey> = {
  title_page: "metadata.suggestions.source.titlePage",
  copyright_page: "metadata.suggestions.source.copyrightPage",
  cip_page: "metadata.suggestions.source.cipPage",
  colophon: "metadata.suggestions.source.colophon",
  series_page: "metadata.suggestions.source.seriesPage",
  embedded_pdf_metadata: "metadata.suggestions.source.embedded",
  filename: "metadata.suggestions.source.filename",
};
const CATALOGUING_STATE_KEYS: Record<MetadataCataloguingState, MessageKey> = {
  not_run: "metadata.suggestions.state.notRun",
  queued: "metadata.suggestions.state.queued",
  running: "metadata.suggestions.state.running",
  failed: "metadata.suggestions.state.failed",
  filename_inference_only: "metadata.suggestions.state.filenameOnly",
  extraction_only: "metadata.suggestions.state.extractionOnly",
  ai_succeeded_reviewable: "metadata.suggestions.state.reviewable",
  applied: "metadata.suggestions.state.applied",
};
const SUGGESTION_CONFIDENCE_KEYS: Record<MetadataSuggestionConfidence, MessageKey> = {
  high: "metadata.suggestions.confidence.high",
  medium: "metadata.suggestions.confidence.medium",
  low: "metadata.suggestions.confidence.low",
};
const SUGGESTION_ORIGIN_KEYS: Record<MetadataSuggestionEvidenceOrigin, MessageKey> = {
  native_text: "metadata.suggestions.origin.nativeText",
  ocr: "metadata.suggestions.origin.ocr",
  embedded_pdf_metadata: "metadata.suggestions.origin.embedded",
  filename: "metadata.suggestions.origin.filename",
};

const EXPECTED_SUGGESTION_ERROR_CODES = new Set([
  "authentication_required",
  "invalid_origin",
  "invalid_request",
  "unsupported_media_type",
  "payload_too_large",
  "rate_limit_exceeded",
  "invalid_input",
  "conflict",
  "concurrent_change",
  "stale",
  "unsupported",
  "not_found",
  "metadata_suggestion_internal_error",
]);

function safeSuggestionError(error: unknown): ApiError {
  if (error instanceof ApiError && EXPECTED_SUGGESTION_ERROR_CODES.has(error.code)) return error;
  return new ApiError(500, "metadata_suggestion_internal_error");
}

function suggestionSourceLabel(value: MetadataSuggestionSourceType, t: ReturnType<typeof useLanguage>["t"]): string {
  return t(SUGGESTION_SOURCE_KEYS[value]);
}
function suggestionConfidenceLabel(value: MetadataSuggestionConfidence, t: ReturnType<typeof useLanguage>["t"]): string {
  return t(SUGGESTION_CONFIDENCE_KEYS[value]);
}
function suggestionJobFailureLabel(errorCode: NonNullable<DerivedMetadataJob["errorCode"]>, t: ReturnType<typeof useLanguage>["t"]): string {
  if (errorCode === "compute_dispatch_failed") return t("activity.metadataDispatchFailed");
  if (errorCode === "compute_source_stale" || errorCode === "compute_source_unavailable") return t("activity.metadataSourceFailed");
  if (errorCode === "compute_invalid_pdf" || errorCode === "compute_limit_exceeded") return t("activity.metadataPdfFailed");
  if (errorCode === "compute_ocr_unavailable") return t("activity.metadataOcrFailed");
  if (errorCode === "compute_invalid_result") return t("activity.metadataValidationFailed");
  if (errorCode === "compute_authorization_changed") return t("activity.metadataWritebackFailed");
  return t("activity.metadataTransientFailed");
}
function suggestionOriginLabel(value: MetadataSuggestionEvidenceOrigin, t: ReturnType<typeof useLanguage>["t"]): string {
  return t(SUGGESTION_ORIGIN_KEYS[value]);
}
function suggestionErrorLabel(error: unknown, t: ReturnType<typeof useLanguage>["t"]): string {
  if (error instanceof ApiError) {
    const keys: Partial<Record<string, MessageKey>> = {
      invalid_input: "metadata.suggestions.error.invalidInput",
      conflict: "metadata.suggestions.error.conflict",
      concurrent_change: "metadata.suggestions.error.concurrentChange",
      stale: "metadata.suggestions.error.stale",
      unsupported: "metadata.suggestions.error.unsupported",
      not_found: "metadata.suggestions.error.notFound",
    };
    const key = keys[error.code];
    if (key) return t(key);
  }
  return t("metadata.suggestions.error.internal");
}

function useResourceDialog(onClose: () => void, disabled: boolean, returnFocus?: HTMLElement | null) {
  const ref = useRef<HTMLDialogElement>(null);
  const closeRef = useRef(onClose);
  const disabledRef = useRef(disabled);
  closeRef.current = onClose;
  disabledRef.current = disabled;
  useEffect(() => {
    const dialog = ref.current;
    if (!dialog) return;
    const previous = returnFocus ?? (document.activeElement instanceof HTMLElement ? document.activeElement : null);
    const cancel = (event: Event) => {
      event.preventDefault();
      if (!disabledRef.current) closeRef.current();
    };
    const keydown = (event: KeyboardEvent) => {
      if (event.key === "Escape" && !disabledRef.current) {
        event.preventDefault();
        closeRef.current();
        return;
      }
      if (event.key !== "Tab") return;
      const focusable = Array.from(dialog.querySelectorAll<HTMLElement>(
        "a[href], button:not([disabled]), input:not([disabled]), select:not([disabled]), textarea:not([disabled]), [tabindex]:not([tabindex='-1'])",
      ));
      if (focusable.length === 0) return;
      const first = focusable[0];
      const last = focusable.at(-1);
      if (event.shiftKey && document.activeElement === first) {
        event.preventDefault();
        last?.focus();
      } else if (!event.shiftKey && document.activeElement === last) {
        event.preventDefault();
        first?.focus();
      }
    };
    dialog.addEventListener("cancel", cancel);
    dialog.addEventListener("keydown", keydown);
    if (typeof dialog.showModal === "function") dialog.showModal();
    else dialog.setAttribute("open", "");
    const first = dialog.querySelector<HTMLElement>("button:not([disabled]), input:not([disabled]), select:not([disabled]), textarea:not([disabled])");
    first?.focus();
    return () => {
      dialog.removeEventListener("cancel", cancel);
      dialog.removeEventListener("keydown", keydown);
      if (dialog.open && typeof dialog.close === "function") dialog.close();
      previous?.focus();
    };
  }, [returnFocus]);
  return ref;
}

function draftFromDetail(detail: LibraryHoldingDetails): {
  materialType: MaterialType;
  canonicalTitle: string;
  subtitle: string;
  alternativeTitles: string[];
  dateStatement: string;
  identifiers: IdentifierDraft[];
  typeFields: MetadataTypeFields;
  authorityLinks: LinkDraft[];
} {
  const metadata = detail.metadata;
  return {
    materialType: metadata && isMaterialType(metadata.materialType) ? metadata.materialType : "book",
    canonicalTitle: metadata?.canonicalTitle ?? "",
    subtitle: metadata?.subtitle ?? "",
    alternativeTitles: metadata?.alternativeTitles ? [...metadata.alternativeTitles] : [],
    dateStatement: metadata?.dateStatement ?? "",
    identifiers: metadata?.identifiers ? metadata.identifiers.map((item) => ({ ...item })) : [],
    typeFields: metadata?.typeFields ? { ...metadata.typeFields } : {},
    authorityLinks: metadata?.authorityLinks ? metadata.authorityLinks.map(({ id, role }) => ({ authorityId: id, role })) : [],
  };
}

export function ResourceDetailsDialog({
  api,
  library,
  holding,
  returnFocus,
  onClose,
  onSaved,
  onPreview,
  onDownload,
  onCitation,
  onSuggestionJobChange,
}: {
  api: AcademicCloudApi;
  library: LibrarySummary;
  holding: LibraryHolding;
  returnFocus?: HTMLElement | null;
  onClose: () => void;
  onSaved: (detail: LibraryHoldingDetails) => void;
  onPreview: () => void;
  onDownload: () => void;
  onCitation?: () => void;
  onSuggestionJobChange?: (job: DerivedMetadataJob) => void;
}) {
  const { language, t } = useLanguage();
  const [detail, setDetail] = useState<LibraryHoldingDetails | null>(null);
  const [loading, setLoading] = useState(true);
  const [editing, setEditing] = useState(false);
  const [editingBibliography, setEditingBibliography] = useState(false);
  const [saving, setSaving] = useState(false);
  const [savingBibliography, setSavingBibliography] = useState(false);
  const [restoringAi, setRestoringAi] = useState(false);
  const [error, setError] = useState<unknown>(null);
  const [notice, setNotice] = useState("");
  const [draft, setDraft] = useState(() => draftFromDetail({
    displayTitle: holding.canonicalTitle ?? holding.file.displayName,
    originalFilename: holding.file.displayName,
    metadataVersion: "",
    metadata: null,
    bibliographyVersion: "",
    bibliography: null,
    fieldAuthorities: [],
    canEditMetadata: library.role === "manager",
    file: { id: holding.file.id, mediaType: holding.file.mediaType, sizeBytes: holding.file.sizeBytes, updatedAt: holding.file.updatedAt },
  }));
  const [bibliographyDraft, setBibliographyDraft] = useState<BibliographyDraft>(() => bibliographyDraftFromDetail({
    displayTitle: holding.canonicalTitle ?? holding.file.displayName,
    originalFilename: holding.file.displayName,
    metadataVersion: "",
    metadata: null,
    bibliographyVersion: "",
    bibliography: null,
    fieldAuthorities: [],
    canEditMetadata: library.role === "manager",
    file: { id: holding.file.id, mediaType: holding.file.mediaType, sizeBytes: holding.file.sizeBytes, updatedAt: holding.file.updatedAt },
  }));
  const [selectedRestoreFields, setSelectedRestoreFields] = useState<Set<string>>(() => new Set());
  const [authorities, setAuthorities] = useState<LibraryAuthority[]>([]);
  const [authorityType, setAuthorityType] = useState<AuthorityType>("person");
  const [authorityLabel, setAuthorityLabel] = useState("");
  const [pendingAuthorityRole, setPendingAuthorityRole] = useState<AuthorityRole | null>(null);
  const [pendingAuthorityCandidateId, setPendingAuthorityCandidateId] = useState<string | null>(null);
  const [suggestionRun, setSuggestionRun] = useState<MetadataSuggestionRun | null>(null);
  const [suggestionJob, setSuggestionJob] = useState<DerivedMetadataJob | null>(null);
  const [cataloguingState, setCataloguingState] = useState<MetadataCataloguingState | null>(null);
  const [suggestionsLoading, setSuggestionsLoading] = useState(false);
  const [suggestionsGenerating, setSuggestionsGenerating] = useState(false);
  const [suggestionsAccepting, setSuggestionsAccepting] = useState(false);
  const [suggestionsError, setSuggestionsError] = useState<unknown>(null);
  const [selectedSuggestionIds, setSelectedSuggestionIds] = useState<Set<string>>(() => new Set());
  const dialogRef = useResourceDialog(onClose, saving || savingBibliography || restoringAi || suggestionsGenerating || suggestionsAccepting, returnFocus);

  const groupedAuthorities = useMemo(() => {
    const map = new Map<string, LibraryAuthority>();
    for (const authority of authorities) map.set(authority.id, authority);
    return map;
  }, [authorities]);

  async function loadDetails() {
    setLoading(true);
    setError(null);
    try {
      const next = await api.getLibraryHoldingDetails(library.id, holding.file.id);
      setDetail(next);
      setDraft(draftFromDetail(next));
      setBibliographyDraft(bibliographyDraftFromDetail(next));
      setSelectedRestoreFields(new Set());
    } catch (caught) {
      setError(caught);
    } finally {
      setLoading(false);
    }
  }

  useEffect(() => { void loadDetails(); }, [api, library.id, holding.file.id]);

  useEffect(() => {
    if (!api.getLibraryMetadataSuggestions) {
      setSuggestionRun(null);
      setSuggestionsError(null);
      setSelectedSuggestionIds(new Set());
      return;
    }
    const controller = new AbortController();
    setSuggestionsLoading(true);
    setSuggestionsError(null);
    api.getLibraryMetadataSuggestions(library.id, holding.file.id, controller.signal)
      .then((run) => {
        setSuggestionRun(run);
        setSelectedSuggestionIds(new Set());
      })
      .catch((caught: unknown) => {
        if (!(caught instanceof DOMException && caught.name === "AbortError")) setSuggestionsError(safeSuggestionError(caught));
      })
      .finally(() => setSuggestionsLoading(false));
    return () => controller.abort();
  }, [api, library.id, holding.file.id]);

  useEffect(() => {
    if (api.getLatestLibraryMetadataSuggestionStates) {
      const controller = new AbortController();
      api.getLatestLibraryMetadataSuggestionStates(library.id, [holding.file.id], controller.signal)
        .then((states) => {
          const summary = states[0];
          setSuggestionJob(summary?.job ?? null);
          setCataloguingState(summary?.state ?? "not_run");
          if (summary?.job) onSuggestionJobChange?.(summary.job);
        })
        .catch((caught: unknown) => {
          if (!(caught instanceof DOMException && caught.name === "AbortError")) setSuggestionsError(safeSuggestionError(caught));
        });
      return () => controller.abort();
    }
    if (!api.getLatestLibraryMetadataSuggestionJob) {
      setSuggestionJob(null);
      setCataloguingState(null);
      return;
    }
    const controller = new AbortController();
    api.getLatestLibraryMetadataSuggestionJob(library.id, holding.file.id, controller.signal)
      .then((job) => {
        setSuggestionJob(job);
        setCataloguingState(job?.state === "queued" || job?.state === "running" || job?.state === "failed"
          ? job.state : null);
        if (job) onSuggestionJobChange?.(job);
      })
      .catch((caught: unknown) => {
        if (!(caught instanceof DOMException && caught.name === "AbortError")) setSuggestionsError(safeSuggestionError(caught));
      });
    return () => controller.abort();
  }, [api, library.id, holding.file.id, onSuggestionJobChange]);

  useEffect(() => {
    if (!suggestionJob || !api.getLibraryMetadataSuggestionJob) return;
    const controller = new AbortController();
    let stopped = false;
    let timer: ReturnType<typeof setTimeout> | undefined;
    const poll = async (job: DerivedMetadataJob) => {
      if (stopped) return;
      try {
        const next = job.state === "queued" || job.state === "running"
          ? await api.getLibraryMetadataSuggestionJob!(library.id, holding.file.id, job.id, controller.signal)
          : job;
        if (stopped) return;
        setSuggestionJob(next);
        setCataloguingState(next.state === "succeeded" ? "extraction_only" : next.state);
        onSuggestionJobChange?.(next);
        if (next.state === "succeeded") {
          const [run, states] = await Promise.all([
            api.getLibraryMetadataSuggestions?.(library.id, holding.file.id, controller.signal),
            api.getLatestLibraryMetadataSuggestionStates?.(library.id, [holding.file.id], controller.signal),
          ]);
          if (!stopped && run !== undefined) {
            setSuggestionRun(run);
            setSelectedSuggestionIds(new Set());
          }
          if (!stopped && states?.[0]) setCataloguingState(states[0].state);
          return;
        }
        if (next.state === "failed") return;
        timer = setTimeout(() => void poll(next), 2_000);
      } catch (caught) {
        if (stopped || (caught instanceof DOMException && caught.name === "AbortError")) return;
        setSuggestionsError(safeSuggestionError(caught));
        timer = setTimeout(() => void poll(job), 5_000);
      }
    };
    timer = setTimeout(() => void poll(suggestionJob), suggestionJob.state === "succeeded" ? 0 : 1_000);
    return () => {
      stopped = true;
      controller.abort();
      if (timer !== undefined) clearTimeout(timer);
    };
  }, [api, library.id, holding.file.id, onSuggestionJobChange, suggestionJob?.id]);

  useEffect(() => {
    if (!editing || library.role !== "manager") return;
    const controller = new AbortController();
    Promise.all(AUTHORITY_TYPES.map((type) => api.listLibraryAuthorities(library.id, type, controller.signal)))
      .then((pages) => setAuthorities(pages.flat()), (caught) => {
        if (!(caught instanceof DOMException && caught.name === "AbortError")) setError(caught);
      });
    return () => controller.abort();
  }, [api, editing, library.id, library.role]);

  async function generateSuggestions() {
    if (!api.generateLibraryMetadataSuggestions || library.role !== "manager") return;
    setSuggestionsGenerating(true);
    setSuggestionsError(null);
    setNotice("");
    try {
      const job = await api.generateLibraryMetadataSuggestions(library.id, holding.file.id);
      setSuggestionJob(job);
      setCataloguingState(job.state === "succeeded" ? "extraction_only" : job.state);
      onSuggestionJobChange?.(job);
      setSelectedSuggestionIds(new Set());
      // Fast naming: the lightweight filename-derived run is persisted
      // synchronously with the request, so the candidates appear immediately
      // while the OCR/Compute job continues asynchronously.
      const run = await api.getLibraryMetadataSuggestions?.(library.id, holding.file.id);
      if (run !== undefined) setSuggestionRun(run);
    } catch (caught) {
      setSuggestionsError(safeSuggestionError(caught));
    } finally {
      setSuggestionsGenerating(false);
    }
  }

  function metadataForSuggestionAcceptance(): MetadataSuggestionAcceptInput["metadata"] | undefined {
    if (!detail) return undefined;
    return {
      materialType: draft.materialType,
      canonicalTitle: draft.canonicalTitle.trim(),
      subtitle: draft.subtitle.trim() || null,
      alternativeTitles: draft.alternativeTitles.map((title) => title.trim()).filter(Boolean),
      dateStatement: draft.dateStatement.trim() || null,
      identifiers: draft.identifiers.map((item) => ({ scheme: item.scheme.trim(), value: item.value.trim() })).filter((item) => item.scheme && item.value),
      typeFields: Object.fromEntries(Object.entries(draft.typeFields).filter(([, value]) => value?.trim())) as MetadataTypeFields,
      authorityLinks: draft.authorityLinks,
    };
  }

  async function acceptSuggestions() {
    if (!api.acceptLibraryMetadataSuggestions || !detail || !suggestionRun || library.role !== "manager" || selectedSuggestionIds.size === 0) return;
    setSuggestionsAccepting(true);
    setSuggestionsError(null);
    setNotice("");
    try {
      const acceptance: MetadataSuggestionAcceptInput = {
        acceptedCandidateIds: [...selectedSuggestionIds],
        metadataVersion: detail.metadataVersion,
      };
      // With no explicit edit payload the server applies the selected
      // candidates to the current canonical metadata through RF-META01. Once
      // the manager opens the ordinary editor, send that explicit draft so
      // edits and candidate acceptance remain one CAS-guarded write.
      if (editing) {
        const acceptedMetadata = metadataForSuggestionAcceptance();
        if (acceptedMetadata) acceptance.metadata = acceptedMetadata;
      }
      const response = await api.acceptLibraryMetadataSuggestions(library.id, holding.file.id, suggestionRun.id, acceptance);
      const nextDetail = response.detail;
      if (nextDetail) {
        setDetail(nextDetail);
        setDraft(draftFromDetail(nextDetail));
        setBibliographyDraft(bibliographyDraftFromDetail(nextDetail));
        setEditing(false);
        onSaved(nextDetail);
      } else {
        // The server may return only the updated run in a future compatible
        // response. Refresh the canonical detail before showing success.
        await loadDetails();
        setEditing(false);
      }
      setSuggestionRun(response.run ?? { ...suggestionRun, status: "accepted" });
      setCataloguingState("applied");
      setSelectedSuggestionIds(new Set());
      setNotice(t("metadata.suggestions.accepted"));
    } catch (caught) {
      if (caught instanceof ApiError && (caught.code === "concurrent_change" || caught.code === "stale" || caught.code === "suggestions_stale" || caught.code === "source_changed")) {
        try {
          const latest = await api.getLibraryHoldingDetails(library.id, holding.file.id);
          setDetail(latest);
          setDraft(draftFromDetail(latest));
          setBibliographyDraft(bibliographyDraftFromDetail(latest));
          setEditing(false);
          onSaved(latest);
          setSuggestionRun(null);
          setSelectedSuggestionIds(new Set());
          setNotice(t("metadata.conflictRefreshed"));
        } catch (refreshError) {
          setSuggestionsError(safeSuggestionError(refreshError));
        }
      } else {
        setSuggestionsError(safeSuggestionError(caught));
      }
    } finally {
      setSuggestionsAccepting(false);
    }
  }

  function useSuggestionInEditor(candidate: MetadataSuggestionCandidate) {
    if (!detail || !isMaterialType(draft.materialType)) return;
    setEditing(true);
    if (candidate.fieldPath === "canonicalTitle") {
      setDraft((current) => ({ ...current, canonicalTitle: candidate.value }));
    } else if (candidate.fieldPath === "subtitle") {
      setDraft((current) => ({ ...current, subtitle: candidate.value }));
    } else if (candidate.fieldPath === "dateStatement") {
      setDraft((current) => ({ ...current, dateStatement: candidate.value }));
    } else if (candidate.fieldPath === "identifier" && candidate.identifierScheme) {
      setDraft((current) => {
        const existing = current.identifiers.findIndex((item) => item.scheme.toLowerCase() === candidate.identifierScheme!.toLowerCase());
        if (existing >= 0) {
          return { ...current, identifiers: current.identifiers.map((item, index) => index === existing ? { scheme: candidate.identifierScheme!, value: candidate.value } : item) };
        }
        return current.identifiers.length >= 8
          ? current
          : { ...current, identifiers: [...current.identifiers, { scheme: candidate.identifierScheme!, value: candidate.value }] };
      });
    } else if (candidate.fieldPath === "typeField" && candidate.typeFieldName) {
      const knownField = FIELDS_BY_TYPE[draft.materialType].some(({ key }) => key === candidate.typeFieldName);
      if (knownField) setDraft((current) => ({ ...current, typeFields: { ...current.typeFields, [candidate.typeFieldName!]: candidate.value } }));
      else setNotice(t("metadata.suggestions.authorityReview"));
    } else if (candidate.fieldPath === "authority") {
      if (candidate.authorityType && candidate.authorityRole) {
        setAuthorityType(candidate.authorityType);
        setAuthorityLabel(candidate.value);
        setPendingAuthorityRole(candidate.authorityRole);
        setPendingAuthorityCandidateId(candidate.id);
      }
      setNotice(t("metadata.suggestions.resolveAuthority"));
      setSelectedSuggestionIds((current) => {
        const next = new Set(current);
        next.delete(candidate.id);
        return next;
      });
      return;
    }
    setSelectedSuggestionIds((current) => new Set(current).add(candidate.id));
  }

  function updateType(next: MaterialType) {
    if (next !== draft.materialType && FIELDS_BY_TYPE[draft.materialType].some(({ key }) => Boolean(draft.typeFields[key]?.trim()))) {
      setNotice(t("metadata.typeTransitionBlocked"));
      return;
    }
    setDraft((current) => ({ ...current, materialType: next, typeFields: {} }));
    setNotice("");
  }

  async function createAuthority() {
    if (!authorityLabel.trim()) return;
    setSaving(true);
    setError(null);
    try {
      const authority = await api.createLibraryAuthority(library.id, { type: authorityType, canonicalLabel: authorityLabel, aliases: [] });
      setAuthorities((current) => [...current, authority]);
      const role = pendingAuthorityRole && ROLES_BY_TYPE[authority.type].includes(pendingAuthorityRole)
        ? pendingAuthorityRole
        : ROLES_BY_TYPE[authority.type][0]!;
      setDraft((current) => ({ ...current, authorityLinks: [...current.authorityLinks, { authorityId: authority.id, role }] }));
      if (pendingAuthorityCandidateId) setSelectedSuggestionIds((current) => new Set(current).add(pendingAuthorityCandidateId));
      setPendingAuthorityRole(null);
      setPendingAuthorityCandidateId(null);
      setAuthorityLabel("");
      setNotice(t("metadata.authorityCreated"));
    } catch (caught) {
      setError(caught);
    } finally {
      setSaving(false);
    }
  }

  function linkAuthority(authority: LibraryAuthority): void {
    const role = pendingAuthorityRole && ROLES_BY_TYPE[authority.type].includes(pendingAuthorityRole)
      ? pendingAuthorityRole
      : ROLES_BY_TYPE[authority.type][0]!;
    setDraft((current) => ({ ...current, authorityLinks: [...current.authorityLinks, { authorityId: authority.id, role }] }));
    if (pendingAuthorityCandidateId) setSelectedSuggestionIds((current) => new Set(current).add(pendingAuthorityCandidateId));
    setPendingAuthorityRole(null);
    setPendingAuthorityCandidateId(null);
  }

  async function save() {
    if (!detail || !draft.canonicalTitle.trim()) return;
    setSaving(true);
    setError(null);
    setNotice("");
    const input: LibraryMetadataInput = {
      metadataVersion: detail.metadataVersion,
      materialType: draft.materialType,
      canonicalTitle: draft.canonicalTitle,
      subtitle: draft.subtitle.trim() || null,
      alternativeTitles: draft.alternativeTitles.map((title) => title.trim()).filter(Boolean),
      dateStatement: draft.dateStatement.trim() || null,
      identifiers: draft.identifiers.map((item) => ({ scheme: item.scheme.trim(), value: item.value.trim() })).filter((item) => item.scheme && item.value),
      typeFields: Object.fromEntries(Object.entries(draft.typeFields).filter(([, value]) => value?.trim())) as MetadataTypeFields,
      authorityLinks: draft.authorityLinks,
    };
    try {
      const next = await api.updateLibraryHoldingMetadata(library.id, holding.file.id, input);
      setDetail(next);
      setDraft(draftFromDetail(next));
      setBibliographyDraft(bibliographyDraftFromDetail(next));
      setEditing(false);
      onSaved(next);
    } catch (caught) {
      if (caught instanceof ApiError && caught.code === "concurrent_change") {
        try {
          const latest = await api.getLibraryHoldingDetails(library.id, holding.file.id);
          setDetail(latest);
          setDraft(draftFromDetail(latest));
          setBibliographyDraft(bibliographyDraftFromDetail(latest));
          setEditing(false);
          onSaved(latest);
          setNotice(t("metadata.conflictRefreshed"));
        } catch (refreshError) {
          setError(refreshError);
        }
      } else {
        setError(caught);
      }
    } finally {
      setSaving(false);
    }
  }

  async function saveBibliography() {
    if (!detail || !api.updateLibraryHoldingBibliography) return;
    const input = bibliographyInput(bibliographyDraft, detail.bibliographyVersion);
    if (!input || bibliographyDraft.contributors.some((contributor) => !contributor.label.trim())) {
      setError(new ApiError(400, "invalid_input"));
      return;
    }
    setSavingBibliography(true);
    setError(null);
    setNotice("");
    try {
      const next = await api.updateLibraryHoldingBibliography(library.id, holding.file.id, input);
      setDetail(next);
      setDraft(draftFromDetail(next));
      setBibliographyDraft(bibliographyDraftFromDetail(next));
      setEditingBibliography(false);
      setSelectedRestoreFields(new Set());
      setNotice(t("metadata.bibliographySaved"));
      onSaved(next);
    } catch (caught) {
      if (caught instanceof ApiError && caught.code === "concurrent_change") {
        try {
          const latest = await api.getLibraryHoldingDetails(library.id, holding.file.id);
          setDetail(latest);
          setDraft(draftFromDetail(latest));
          setBibliographyDraft(bibliographyDraftFromDetail(latest));
          setEditingBibliography(false);
          setSelectedRestoreFields(new Set());
          setNotice(t("metadata.conflictRefreshed"));
          onSaved(latest);
        } catch (refreshError) {
          setError(refreshError);
        }
      } else {
        setError(caught);
      }
    } finally {
      setSavingBibliography(false);
    }
  }

  async function restoreAiAuthority() {
    if (!detail || !api.restoreLibraryHoldingBibliographyAi) return;
    const fields = detail.fieldAuthorities
      .filter((authority) => authority.source === "human" && selectedRestoreFields.has(authorityKey(authority)))
      .map(({ fieldName, scopeKey }) => ({ fieldName, scopeKey }));
    if (fields.length === 0) {
      setNotice(t("metadata.restoreAiSelect"));
      return;
    }
    setRestoringAi(true);
    setError(null);
    setNotice("");
    try {
      const next = await api.restoreLibraryHoldingBibliographyAi(library.id, holding.file.id, {
        bibliographyVersion: detail.bibliographyVersion,
        fields,
      });
      setDetail(next);
      setDraft(draftFromDetail(next));
      setBibliographyDraft(bibliographyDraftFromDetail(next));
      setSelectedRestoreFields(new Set());
      setNotice(t("metadata.restoreAiDone"));
      onSaved(next);
    } catch (caught) {
      if (caught instanceof ApiError && caught.code === "concurrent_change") {
        await loadDetails();
        setNotice(t("metadata.conflictRefreshed"));
      } else {
        setError(caught);
      }
    } finally {
      setRestoringAi(false);
    }
  }

  const metadata = detail?.metadata;
  const bibliography = detail?.bibliography;
  const displayTitle = detail?.displayTitle ?? holding.canonicalTitle ?? holding.file.displayName;
  const detailTypeLabel = bibliography ? materialClassLabel(bibliography.materialClass, t) : metadata ? materialLabel(metadata.materialType, t) : null;

  return (
    <dialog ref={dialogRef} className="resource-details-modal" aria-labelledby="resource-details-title">
      <header>
        <div>
          <h2 id="resource-details-title">{displayTitle}</h2>
          {detailTypeLabel && <span className="resource-details-type">{detailTypeLabel}</span>}
        </div>
        <button className="button button--quiet" type="button" onClick={onClose} disabled={saving || savingBibliography || restoringAi} aria-label={t("metadata.closeAria")}>{t("preview.close")}</button>
      </header>
      {loading ? <p role="status">{t("sharedLibrary.loading")}</p> : error !== null ? (
        <div className="alert alert--error" role="alert">{describeError(error, language)}</div>
      ) : detail && (
        <div className="resource-details-body">
          {notice && <div className="alert alert--success" role="status">{notice}</div>}
          {!editing && !editingBibliography ? (
            <>
              {metadata ? <MetadataReadOnly metadata={metadata} t={t} /> : <p className="muted">{t("metadata.noMetadata")}</p>}
              {bibliography ? <BibliographyReadOnly bibliography={bibliography} t={t} /> : <p className="muted">{t("metadata.noBibliography")}</p>}
              <fieldset className="resource-details-original">
                <legend>{t("metadata.fileInformation")}</legend>
                <dl>
                  <ReactFact label={t("metadata.originalFilename")} value={detail.originalFilename} />
                  <ReactFact label={t("metadata.materialType")} value={holding.file.mediaType ?? "-"} />
                  <ReactFact label={t("metadata.fileSize")} value={`${holding.file.sizeBytes} bytes`} />
                </dl>
              </fieldset>
              {(api.getLibraryMetadataSuggestions || api.generateLibraryMetadataSuggestions) && (
                <MetadataSuggestionsPanel
                  run={suggestionRun}
                  job={suggestionJob}
                  authoritativeState={cataloguingState}
                  fieldAuthorities={detail.fieldAuthorities}
                  loading={suggestionsLoading}
                  generating={suggestionsGenerating}
                  accepting={suggestionsAccepting}
                  error={suggestionsError}
                  manager={library.role === "manager" && detail.canEditMetadata}
                  requiresEditor={!detail.metadata && !editing}
                  selectedIds={selectedSuggestionIds}
                  onGenerate={() => void generateSuggestions()}
                  onToggle={(candidateId) => setSelectedSuggestionIds((current) => {
                    const next = new Set(current);
                    if (next.has(candidateId)) next.delete(candidateId);
                    else next.add(candidateId);
                    return next;
                  })}
                  onUseInEditor={useSuggestionInEditor}
                  onAccept={() => void acceptSuggestions()}
                  t={t}
                  language={language}
                />
              )}
              {detail.canEditMetadata && api.restoreLibraryHoldingBibliographyAi && detail.fieldAuthorities.some((authority) => authority.source === "human") && (
                <FieldAuthorityControl
                  authorities={detail.fieldAuthorities}
                  bibliography={bibliography ?? null}
                  selected={selectedRestoreFields}
                  busy={restoringAi}
                  onToggle={(key) => setSelectedRestoreFields((current) => {
                    const next = new Set(current);
                    if (next.has(key)) next.delete(key); else next.add(key);
                    return next;
                  })}
                  onRestore={() => void restoreAiAuthority()}
                  t={t}
                />
              )}
              <footer className="resource-details-actions">
                <button className="button button--quiet" type="button" onClick={onPreview} disabled={!holding.file.mediaType || (!holding.file.mediaType.startsWith("image/") && holding.file.mediaType !== "application/pdf")}>{t("menu.preview")}</button>
                <button className="button" type="button" onClick={onDownload}>{t("menu.download")}</button>
                {api.generateLibraryCitation && onCitation && <button className="button" type="button" onClick={onCitation}>{t("citation.action")}</button>}
                {detail.canEditMetadata && (!metadata || isMaterialType(metadata.materialType)) && <button className="button button--primary" type="button" onClick={() => { setEditing(true); setNotice(""); }}>{t("metadata.edit")}</button>}
              </footer>
            </>
          ) : editing ? (
            <>
              <header className="resource-details-editor-header">
                <h3>{t("metadata.bibliographyTitle")}</h3>
                {api.updateLibraryHoldingBibliography && <button className="button button--small button--quiet" type="button" onClick={() => { setEditing(false); setEditingBibliography(true); }}>{t("metadata.editBibliography")}</button>}
              </header>
              {(api.getLibraryMetadataSuggestions || api.generateLibraryMetadataSuggestions) && (
                <MetadataSuggestionsPanel
                  run={suggestionRun}
                  job={suggestionJob}
                  authoritativeState={cataloguingState}
                  fieldAuthorities={detail.fieldAuthorities}
                  loading={suggestionsLoading}
                  generating={suggestionsGenerating}
                  accepting={suggestionsAccepting}
                  error={suggestionsError}
                  manager={library.role === "manager" && detail.canEditMetadata}
                  requiresEditor={!detail.metadata && !editing}
                  selectedIds={selectedSuggestionIds}
                  onGenerate={() => void generateSuggestions()}
                  onToggle={(candidateId) => setSelectedSuggestionIds((current) => {
                    const next = new Set(current);
                    if (next.has(candidateId)) next.delete(candidateId);
                    else next.add(candidateId);
                    return next;
                  })}
                  onUseInEditor={useSuggestionInEditor}
                  onAccept={() => void acceptSuggestions()}
                  t={t}
                  language={language}
                />
              )}
              <MetadataEditor
                draft={draft}
                setDraft={setDraft}
                onTypeChange={updateType}
                authorities={authorities}
                authoritiesById={groupedAuthorities}
                authorityType={authorityType}
                setAuthorityType={setAuthorityType}
                authorityLabel={authorityLabel}
                setAuthorityLabel={setAuthorityLabel}
                onCreateAuthority={() => void createAuthority()}
                onAuthorityLinked={linkAuthority}
                onCancel={() => { setDraft(draftFromDetail(detail)); setEditing(false); setNotice(""); }}
                onSave={() => void save()}
                saving={saving}
                t={t}
              />
            </>
          ) : (
            <BibliographyEditor
              draft={bibliographyDraft}
              setDraft={setBibliographyDraft}
              saving={savingBibliography}
              onCancel={() => { setBibliographyDraft(bibliographyDraftFromDetail(detail)); setEditingBibliography(false); setNotice(""); }}
              onSave={() => void saveBibliography()}
              t={t}
            />
          )}
        </div>
      )}
    </dialog>
  );
}

function BibliographyReadOnly({
  bibliography,
  t,
}: {
  bibliography: NonNullable<LibraryHoldingDetails["bibliography"]>;
  t: ReturnType<typeof useLanguage>["t"];
}) {
  const publication = [bibliography.publication.place, bibliography.publication.publisher, bibliography.publication.publicationDate]
    .filter(Boolean).join(" · ");
  const carrier = [
    bibliography.carrierEdition.editionType ? editionTypeLabel(bibliography.carrierEdition.editionType, t) : "",
    bibliography.carrierEdition.editionStatement,
    bibliography.carrierEdition.facsimileStatement,
  ].filter(Boolean).join(" · ");
  const source = [
    bibliography.sourceEdition.dynasty,
    bibliography.sourceEdition.reignTitle,
    bibliography.sourceEdition.reignYear,
    bibliography.sourceEdition.absoluteYear === undefined ? "" : String(bibliography.sourceEdition.absoluteYear),
    bibliography.sourceEdition.printingPlace,
    bibliography.sourceEdition.printer,
    bibliography.sourceEdition.imprint,
    bibliography.sourceEdition.bookshop,
    bibliography.sourceEdition.institution,
    bibliography.sourceEdition.editionType ? editionTypeLabel(bibliography.sourceEdition.editionType, t) : "",
    bibliography.sourceEdition.editionStatement,
    bibliography.sourceEdition.holdingInformation,
  ].filter(Boolean).join(" · ");
  return <section className="resource-bibliography" aria-labelledby="resource-bibliography-title">
    <h3 id="resource-bibliography-title">{t("metadata.bibliographyTitle")}</h3>
    <div className="resource-details-facts"><dl>
      <ReactFact label={t("librarySearch.materialClass")} value={materialClassLabel(bibliography.materialClass, t)} />
      {bibliography.contributors.length > 0 && <ReactFact label={t("metadata.contributors")} value={bibliography.contributors.map((contributor) => `${contributor.label}${contributor.roleLabel ?? contributorRoleLabel(contributor.role, t)}`).join("、")} />}
      {publication && <ReactFact label={t("metadata.publication")} value={publication} />}
      {bibliography.publication.editionNumber && <ReactFact label={t("metadata.editionNumber")} value={bibliography.publication.editionNumber} />}
      {bibliography.publication.printing && <ReactFact label={t("metadata.printing")} value={bibliography.publication.printing} />}
      {bibliography.series && <ReactFact label={t("metadata.series")} value={bibliography.series} />}
      {bibliography.volume && <ReactFact label={t("metadata.volume")} value={bibliography.volume} />}
      {bibliography.language && <ReactFact label={t("metadata.language")} value={bibliography.language} />}
      {carrier && <ReactFact label={t("metadata.carrierEdition")} value={carrier} />}
      {source && <ReactFact label={t("metadata.sourceEdition")} value={source} />}
    </dl></div>
  </section>;
}

function bibliographyFieldLabel(
  fieldName: BibliographicFieldName,
  t: ReturnType<typeof useLanguage>["t"],
): string {
  const labels: Partial<Record<BibliographicFieldName, string>> = {
    materialClass: t("librarySearch.materialClass"), canonicalTitle: t("metadata.canonicalTitle"), subtitle: t("metadata.subtitle"),
    alternativeTitles: t("metadata.alternativeTitles"), dateStatement: t("metadata.dateStatement"), identifiers: t("metadata.identifiers"),
    "publication.publisher": t("metadata.publisher"), "publication.place": t("metadata.place"), "publication.publicationDate": t("metadata.publicationDate"),
    "publication.editionNumber": t("metadata.editionNumber"), "publication.printing": t("metadata.printing"), series: t("metadata.series"),
    volume: t("metadata.volume"), language: t("metadata.language"), "carrierEdition.editionType": t("metadata.editionType"),
    "carrierEdition.editionStatement": t("metadata.editionStatement"), "carrierEdition.facsimileStatement": t("metadata.facsimileStatement"),
    "sourceEdition.dynasty": t("metadata.dynasty"), "sourceEdition.reignTitle": t("metadata.reignTitle"),
    "sourceEdition.reignYear": t("metadata.reignYear"), "sourceEdition.absoluteYear": t("metadata.absoluteYear"),
    "sourceEdition.printer": t("metadata.printer"), "sourceEdition.imprint": t("metadata.imprint"), "sourceEdition.bookshop": t("metadata.bookshop"),
    "sourceEdition.institution": t("metadata.institution"), "sourceEdition.printingPlace": t("metadata.printingPlace"),
    "sourceEdition.editionType": t("metadata.editionType"), "sourceEdition.editionStatement": t("metadata.editionStatement"),
    "sourceEdition.holdingInformation": t("metadata.holdingInformation"), "contributor.label": t("metadata.contributorName"),
    "contributor.role": t("metadata.contributorRole"), "contributor.roleLabel": t("metadata.contributorRoleLabel"),
    "contributor.authorityId": t("metadata.authorities"),
  };
  return labels[fieldName] ?? fieldName;
}

function authorityFieldLabel(
  authority: BibliographicFieldAuthority,
  bibliography: LibraryHoldingDetails["bibliography"],
  t: ReturnType<typeof useLanguage>["t"],
): string {
  const base = bibliographyFieldLabel(authority.fieldName, t);
  if (!authority.scopeKey) return base;
  const contributor = bibliography?.contributors.find((entry) => entry.id === authority.scopeKey);
  return contributor ? `${base} — ${contributor.label}` : base;
}

function FieldAuthorityControl({
  authorities,
  bibliography,
  selected,
  busy,
  onToggle,
  onRestore,
  t,
}: {
  authorities: BibliographicFieldAuthority[];
  bibliography: LibraryHoldingDetails["bibliography"];
  selected: Set<string>;
  busy: boolean;
  onToggle: (key: string) => void;
  onRestore: () => void;
  t: ReturnType<typeof useLanguage>["t"];
}) {
  const human = authorities.filter((authority) => authority.source === "human");
  return <details className="field-authority-control">
    <summary>{t("metadata.restoreAiTitle")} · {human.length}</summary>
    <p>{t("metadata.restoreAiHelp")}</p>
    <div className="field-authority-list">
      {human.map((authority) => {
        const key = authorityKey(authority);
        return <label key={key}><input type="checkbox" checked={selected.has(key)} onChange={() => onToggle(key)} />{authorityFieldLabel(authority, bibliography, t)}</label>;
      })}
    </div>
    <button className="button button--small" type="button" disabled={busy || selected.size === 0} onClick={onRestore}>{t("metadata.restoreAi")}</button>
  </details>;
}

function BibliographyEditor({
  draft,
  setDraft,
  saving,
  onCancel,
  onSave,
  t,
}: {
  draft: BibliographyDraft;
  setDraft: Dispatch<SetStateAction<BibliographyDraft>>;
  saving: boolean;
  onCancel: () => void;
  onSave: () => void;
  t: ReturnType<typeof useLanguage>["t"];
}) {
  function set<K extends keyof BibliographyDraft>(key: K, value: BibliographyDraft[K]) {
    setDraft((current) => ({ ...current, [key]: value }));
  }
  const yearValid = draft.sourceAbsoluteYear.trim() === "" || /^-?\d{1,4}$/u.test(draft.sourceAbsoluteYear.trim());
  return <div className="resource-details-editor bibliography-editor">
    <fieldset><legend>{t("metadata.bibliographyTitle")}</legend>
      <label>{t("librarySearch.materialClass")}<select value={draft.materialClass} onChange={(event) => set("materialClass", event.target.value as MaterialClass)}>{MATERIAL_CLASSES.map((value) => <option key={value} value={value}>{materialClassLabel(value, t)}</option>)}</select></label>
      <label>{t("metadata.series")}<input maxLength={255} value={draft.series} onChange={(event) => set("series", event.target.value)} /></label>
      <label>{t("metadata.volume")}<input maxLength={128} value={draft.volume} onChange={(event) => set("volume", event.target.value)} /></label>
      <label>{t("metadata.language")}<input maxLength={128} value={draft.language} onChange={(event) => set("language", event.target.value)} /></label>
    </fieldset>
    <fieldset><legend>{t("metadata.contributors")}</legend>
      {draft.contributors.map((contributor, index) => <div className="bibliography-contributor-row" key={contributor.id ?? `new-${index}`}>
        <input aria-label={t("metadata.contributorName")} maxLength={255} value={contributor.label} onChange={(event) => setDraft((current) => ({ ...current, contributors: current.contributors.map((item, itemIndex) => {
          if (itemIndex !== index) return item;
          const { authorityId: _authorityId, ...unbound } = item;
          return { ...unbound, label: event.target.value };
        }) }))} />
        <select aria-label={t("metadata.contributorRole")} value={contributor.role} onChange={(event) => setDraft((current) => ({ ...current, contributors: current.contributors.map((item, itemIndex) => itemIndex === index ? { ...item, role: event.target.value as ContributorRole } : item) }))}>{CONTRIBUTOR_ROLES.map((role) => <option key={role} value={role}>{contributorRoleLabel(role, t)}</option>)}</select>
        <input aria-label={t("metadata.contributorRoleLabel")} maxLength={64} value={contributor.roleLabel} onChange={(event) => setDraft((current) => ({ ...current, contributors: current.contributors.map((item, itemIndex) => itemIndex === index ? { ...item, roleLabel: event.target.value } : item) }))} />
        <button className="button button--small button--quiet" type="button" onClick={() => setDraft((current) => ({ ...current, contributors: current.contributors.filter((_, itemIndex) => itemIndex !== index) }))}>{t("alert.dismiss")}</button>
      </div>)}
      {draft.contributors.length < 64 && <button className="button button--small" type="button" onClick={() => setDraft((current) => ({ ...current, contributors: [...current.contributors, { label: "", role: "author", roleLabel: "" }] }))}>{t("metadata.addContributor")}</button>}
    </fieldset>
    <fieldset><legend>{t("metadata.publication")}</legend>
      <label>{t("metadata.publisher")}<input maxLength={255} value={draft.publisher} onChange={(event) => set("publisher", event.target.value)} /></label>
      <label>{t("metadata.place")}<input maxLength={255} value={draft.place} onChange={(event) => set("place", event.target.value)} /></label>
      <label>{t("metadata.publicationDate")}<input maxLength={64} value={draft.publicationDate} onChange={(event) => set("publicationDate", event.target.value)} /></label>
      <label>{t("metadata.editionNumber")}<input maxLength={128} value={draft.editionNumber} onChange={(event) => set("editionNumber", event.target.value)} /></label>
      <label>{t("metadata.printing")}<input maxLength={128} value={draft.printing} onChange={(event) => set("printing", event.target.value)} /></label>
    </fieldset>
    <fieldset><legend>{t("metadata.carrierEdition")}</legend>
      <EditionTypeSelect value={draft.carrierEditionType} onChange={(value) => set("carrierEditionType", value)} t={t} />
      <label>{t("metadata.editionStatement")}<input maxLength={512} value={draft.carrierEditionStatement} onChange={(event) => set("carrierEditionStatement", event.target.value)} /></label>
      <label>{t("metadata.facsimileStatement")}<input maxLength={512} value={draft.facsimileStatement} onChange={(event) => set("facsimileStatement", event.target.value)} /></label>
    </fieldset>
    <fieldset><legend>{t("metadata.sourceEdition")}</legend>
      <label>{t("metadata.dynasty")}<input maxLength={64} value={draft.sourceDynasty} onChange={(event) => set("sourceDynasty", event.target.value)} /></label>
      <label>{t("metadata.reignTitle")}<input maxLength={64} value={draft.sourceReignTitle} onChange={(event) => set("sourceReignTitle", event.target.value)} /></label>
      <label>{t("metadata.reignYear")}<input maxLength={64} value={draft.sourceReignYear} onChange={(event) => set("sourceReignYear", event.target.value)} /></label>
      <label>{t("metadata.absoluteYear")}<input inputMode="numeric" maxLength={5} aria-invalid={!yearValid} value={draft.sourceAbsoluteYear} onChange={(event) => set("sourceAbsoluteYear", event.target.value)} /></label>
      <label>{t("metadata.printer")}<input maxLength={255} value={draft.sourcePrinter} onChange={(event) => set("sourcePrinter", event.target.value)} /></label>
      <label>{t("metadata.imprint")}<input maxLength={255} value={draft.sourceImprint} onChange={(event) => set("sourceImprint", event.target.value)} /></label>
      <label>{t("metadata.bookshop")}<input maxLength={255} value={draft.sourceBookshop} onChange={(event) => set("sourceBookshop", event.target.value)} /></label>
      <label>{t("metadata.institution")}<input maxLength={255} value={draft.sourceInstitution} onChange={(event) => set("sourceInstitution", event.target.value)} /></label>
      <label>{t("metadata.printingPlace")}<input maxLength={255} value={draft.sourcePrintingPlace} onChange={(event) => set("sourcePrintingPlace", event.target.value)} /></label>
      <EditionTypeSelect value={draft.sourceEditionType} onChange={(value) => set("sourceEditionType", value)} t={t} />
      <label>{t("metadata.editionStatement")}<input maxLength={512} value={draft.sourceEditionStatement} onChange={(event) => set("sourceEditionStatement", event.target.value)} /></label>
      <label>{t("metadata.holdingInformation")}<input maxLength={512} value={draft.sourceHoldingInformation} onChange={(event) => set("sourceHoldingInformation", event.target.value)} /></label>
    </fieldset>
    <footer className="resource-details-actions"><button className="button button--quiet" type="button" disabled={saving} onClick={onCancel}>{t("metadata.cancel")}</button><button className="button button--primary" type="button" disabled={saving || !yearValid || draft.contributors.some((contributor) => !contributor.label.trim())} onClick={onSave}>{saving ? t("metadata.savingBibliography") : t("metadata.saveBibliography")}</button></footer>
  </div>;
}

function EditionTypeSelect({ value, onChange, t }: { value: EditionType | ""; onChange: (value: EditionType | "") => void; t: ReturnType<typeof useLanguage>["t"] }) {
  return <label>{t("metadata.editionType")}<select value={value} onChange={(event) => onChange(event.target.value as EditionType | "")}><option value="">{t("librarySearch.any")}</option>{EDITION_TYPES.map((type) => <option key={type} value={type}>{editionTypeLabel(type, t)}</option>)}</select></label>;
}

function MetadataReadOnly({ metadata, t }: { metadata: NonNullable<LibraryHoldingDetails["metadata"]>; t: ReturnType<typeof useLanguage>["t"] }) {
  const fields = Object.entries(metadata.typeFields);
  return (
    <div className="resource-details-facts">
      <dl>
        <dt>{t("metadata.materialType")}</dt><dd>{materialLabel(metadata.materialType, t)}</dd>
        <dt>{t("metadata.canonicalTitle")}</dt><dd>{metadata.canonicalTitle}</dd>
        {metadata.subtitle && <><dt>{t("metadata.subtitle")}</dt><dd>{metadata.subtitle}</dd></>}
        {metadata.dateStatement && <><dt>{t("metadata.dateStatement")}</dt><dd>{metadata.dateStatement}</dd></>}
        {metadata.alternativeTitles.length > 0 && <><dt>{t("metadata.alternativeTitles")}</dt><dd>{metadata.alternativeTitles.join(" · ")}</dd></>}
        {metadata.identifiers.length > 0 && <><dt>{t("metadata.identifiers")}</dt><dd>{metadata.identifiers.map((item) => `${item.scheme}: ${item.value}`).join(" · ")}</dd></>}
        {fields.map(([key, value]) => <ReactFact key={key} label={fieldLabel(key, t)} value={value} />)}
        {metadata.authorityLinks.length > 0 ? metadata.authorityLinks.map((link) => (
          <ReactFact key={`${link.id}:${link.role}`} label={t(roleLabelKey(link.role))} value={link.canonicalLabel} />
        )) : <><dt>{t("metadata.authorities")}</dt><dd>{t("metadata.noAuthorities")}</dd></>}
      </dl>
    </div>
  );
}

function ReactFact({ label, value }: { label: string; value: string }) {
  return <><dt>{label}</dt><dd>{value}</dd></>;
}

function suggestionFieldLabel(candidate: MetadataSuggestionCandidate, t: ReturnType<typeof useLanguage>["t"]): string {
  if (candidate.fieldPath === "canonicalTitle") return t("metadata.canonicalTitle");
  if (candidate.fieldPath === "subtitle") return t("metadata.subtitle");
  if (candidate.fieldPath === "dateStatement") return t("metadata.dateStatement");
  if (candidate.fieldPath === "identifier") return candidate.identifierScheme
    ? `${t("metadata.identifiers")} (${candidate.identifierScheme})`
    : t("metadata.identifiers");
  if (candidate.fieldPath === "typeField" && candidate.typeFieldName) return fieldLabel(candidate.typeFieldName, t);
  if (candidate.fieldPath === "authority" && candidate.authorityRole) return t(roleLabelKey(candidate.authorityRole));
  return candidate.fieldPath;
}

function suggestedValue(value: string | null | undefined, t: ReturnType<typeof useLanguage>["t"]): string {
  return value?.trim() || t("metadata.suggestions.unrecognized");
}

function suggestedList(values: readonly string[], t: ReturnType<typeof useLanguage>["t"]): string {
  return values.length > 0 ? values.join(" · ") : t("metadata.suggestions.unrecognized");
}

function suggestedContributors(
  suggestion: AiSuggestedBibliography,
  role: ContributorRole,
  t: ReturnType<typeof useLanguage>["t"],
): string {
  const labels = suggestion.canonical?.contributors
    .filter((contributor) => contributor.role === role)
    .map((contributor) => contributor.label) ?? [];
  return suggestedList(labels, t);
}

function AiSuggestedBibliographicRecord({
  suggestion,
  t,
}: {
  suggestion: AiSuggestedBibliography;
  t: ReturnType<typeof useLanguage>["t"];
}) {
  const canonical = suggestion.canonical;
  if (!canonical) return null;
  const identifiers = canonical.identifiers.map((identifier) => `${identifier.scheme.toUpperCase()}: ${identifier.value}`);
  const publicationDate = canonical.dateStatement ?? canonical.publication.publicationDate;
  return <article className="ai-bibliographic-record" aria-labelledby="ai-bibliographic-record-title">
    <header className="ai-bibliographic-record__header">
      <div>
        <p className="eyebrow">{t("metadata.suggestions.recordEyebrow")}</p>
        <h4 id="ai-bibliographic-record-title">{suggestion.displayTitle ?? canonical.canonicalTitle}</h4>
      </div>
      <span className="ai-bibliographic-record__confidence">{t("metadata.suggestions.recordConfidence", { confidence: suggestion.overallConfidence })}</span>
    </header>
    <p className="muted">{t("metadata.suggestions.recordAuthority")}</p>
    <dl className="ai-bibliographic-record__facts">
      <ReactFact label={t("librarySearch.materialClass")} value={materialClassLabel(canonical.materialClass, t)} />
      <ReactFact label={t("metadata.canonicalTitle")} value={suggestedValue(canonical.canonicalTitle, t)} />
      <ReactFact label={t("metadata.subtitle")} value={suggestedValue(canonical.subtitle, t)} />
      <ReactFact label={t("metadata.alternativeTitles")} value={suggestedList(canonical.alternativeTitles, t)} />
      <ReactFact label={t("metadata.role.author")} value={suggestedContributors(suggestion, "author", t)} />
      <ReactFact label={t("metadata.role.editor")} value={suggestedContributors(suggestion, "editor", t)} />
      <ReactFact label={t("metadata.role.translator")} value={suggestedContributors(suggestion, "translator", t)} />
      <ReactFact label={t("metadata.place")} value={suggestedValue(canonical.publication.place, t)} />
      <ReactFact label={t("metadata.publisher")} value={suggestedValue(canonical.publication.publisher, t)} />
      <ReactFact label={t("metadata.publicationDate")} value={suggestedValue(publicationDate, t)} />
      <ReactFact label={t("metadata.suggestions.editionIdentity")} value={suggestedValue(suggestion.editionStatement, t)} />
      <ReactFact label={t("metadata.volume")} value={suggestedValue(canonical.volume, t)} />
      <ReactFact label={t("metadata.identifiers")} value={suggestedList(identifiers, t)} />
    </dl>
    <details className="ai-bibliographic-record__provenance">
      <summary>{t("metadata.suggestions.structuredEvidence", { count: suggestion.fields.length })}</summary>
      <div className="ai-bibliographic-record__evidence-list">
        {suggestion.fields.map((field) => {
          const contributorIndex = field.scopeKey.startsWith("contributor:") ? Number(field.scopeKey.slice("contributor:".length)) : null;
          const contributor = contributorIndex === null ? null : canonical.contributors[contributorIndex] ?? null;
          const label = bibliographyFieldLabel(field.fieldName, t);
          return <article key={`${field.fieldName}:${field.scopeKey}`}>
            <strong>{contributor ? `${label} — ${contributor.label}` : label}</strong>
            <span>{suggestionSourceLabel(field.sourceType, t)}{field.sourcePageIndex === null ? "" : ` · ${t("metadata.suggestions.page", { page: field.sourcePageIndex })}`}</span>
            <span>{suggestionOriginLabel(field.evidenceOrigin, t)} · {t("metadata.suggestions.recordConfidence", { confidence: field.confidence })}</span>
          </article>;
        })}
      </div>
    </details>
  </article>;
}

function MetadataSuggestionsPanel({
  run,
  job,
  authoritativeState,
  fieldAuthorities,
  loading,
  generating,
  accepting,
  error,
  manager,
  requiresEditor,
  selectedIds,
  onGenerate,
  onToggle,
  onUseInEditor,
  onAccept,
  t,
  language,
}: {
  run: MetadataSuggestionRun | null;
  job: DerivedMetadataJob | null;
  authoritativeState: MetadataCataloguingState | null;
  fieldAuthorities: BibliographicFieldAuthority[];
  loading: boolean;
  generating: boolean;
  accepting: boolean;
  error: unknown;
  manager: boolean;
  requiresEditor: boolean;
  selectedIds: Set<string>;
  onGenerate: () => void;
  onToggle: (candidateId: string) => void;
  onUseInEditor: (candidate: MetadataSuggestionCandidate) => void;
  onAccept: () => void;
  t: ReturnType<typeof useLanguage>["t"];
  language: Parameters<typeof describeError>[1];
}) {
  const jobActive = job?.state === "queued" || job?.state === "running";
  const busy = loading || generating || accepting || jobActive;
  const reviewable = run?.status === "ready" || run?.status === "ambiguous";
  const cataloguingState = deriveMetadataCataloguingState({ job, run, fieldAuthorities, authoritativeState });
  return (
    <section className="metadata-suggestions" aria-labelledby="metadata-suggestions-title">
      <header className="metadata-suggestions-header">
        <h3 id="metadata-suggestions-title">{t("metadata.suggestions.title")}</h3>
        {manager && <button className="button button--small" type="button" onClick={onGenerate} disabled={busy}>
          {generating ? t("metadata.suggestions.generating") : t("metadata.suggestions.generate")}
        </button>}
      </header>
      {loading && <p className="muted" role="status">{t("metadata.suggestions.loading")}</p>}
      {error !== null && <div className="alert alert--error" role="alert">{suggestionErrorLabel(error, t)}</div>}
      {!loading && <p className={`metadata-suggestions-status metadata-suggestions-state--${cataloguingState}`} role="status">
        {t(CATALOGUING_STATE_KEYS[cataloguingState])}
        {job?.state === "failed" && job.errorCode && <span className="activity-error">{suggestionJobFailureLabel(job.errorCode, t)}</span>}
      </p>}
      {!loading && job?.state === "failed" && manager && (
        <button className="button button--small" type="button" onClick={onGenerate} disabled={generating}>{t("activity.metadataRetry")}</button>
      )}
      {run && (
        <>
          {!run.window.complete && run.candidates.length > 0 && <p className="muted">{t("metadata.suggestions.partialDescription")}</p>}
          {run.status === "ocr_deferred" && <p className="muted">{t("metadata.suggestions.ocrDeferredDescription")}</p>}
          {run.status === "unsupported" && <p className="muted">{t("metadata.suggestions.unsupportedDescription")}</p>}
          {run.status === "stale" && <p className="muted">{t("metadata.suggestions.staleDescription")}</p>}
          {run.aiBibliography?.canonical && <AiSuggestedBibliographicRecord suggestion={run.aiBibliography} t={t} />}
          {run.candidates.length > 0 && <details className="metadata-suggestions-review" open={!run.aiBibliography?.canonical}>
            <summary>{t("metadata.suggestions.fieldReview", { count: run.candidates.length })}</summary>
            <div className="metadata-suggestions-list">
            {run.candidates.map((candidate) => {
              const selected = selectedIds.has(candidate.id);
              return <article className={`metadata-suggestion${selected ? " is-selected" : ""}`} key={candidate.id}>
                <div className="metadata-suggestion-main">
                  {manager && reviewable && candidate.fieldPath !== "authority" && <input
                    type="checkbox"
                    aria-label={`${t("metadata.suggestions.selected")}: ${suggestionFieldLabel(candidate, t)} — ${candidate.value}`}
                    checked={selected}
                    onChange={() => onToggle(candidate.id)}
                    disabled={accepting}
                  />}
                  <div className="metadata-suggestion-value">
                    <strong>{suggestionFieldLabel(candidate, t)}</strong>
                    <span>{candidate.value}</span>
                  </div>
                </div>
                <dl className="metadata-suggestion-evidence">
                  <dt>{t("metadata.suggestions.source")}</dt>
                  <dd>{suggestionSourceLabel(candidate.sourceType, t)}{candidate.sourcePageIndex !== null ? ` · ${t("metadata.suggestions.page", { page: candidate.sourcePageIndex })}` : ""}</dd>
                  <dt>{t("metadata.suggestions.origin")}</dt>
                  <dd>{suggestionOriginLabel(candidate.evidenceOrigin, t)}{candidate.evidenceOrigin === "ocr" && candidate.ocrConfidence !== null ? ` · ${candidate.ocrConfidence}%` : ""}</dd>
                  <dt>{t("metadata.suggestions.confidence")}</dt>
                  <dd>{suggestionConfidenceLabel(candidate.confidence, t)}</dd>
                  {candidate.evidenceExcerpt && <><dt>{t("metadata.suggestions.evidence")}</dt><dd className="metadata-suggestion-excerpt">{candidate.evidenceExcerpt}</dd></>}
                </dl>
                {manager && reviewable && <button className="button button--small button--quiet" type="button" onClick={() => onUseInEditor(candidate)} disabled={accepting}>
                  {candidate.fieldPath === "authority" ? t("metadata.suggestions.resolveAuthority") : t("metadata.suggestions.useInEditor")}
                </button>}
              </article>;
            })}
            </div>
          {run.candidates.some((candidate) => candidate.fieldPath === "authority") && <p className="muted">{t("metadata.suggestions.authorityReview")}</p>}
          {!manager && run.candidates.length > 0 && <p className="muted">{t("metadata.suggestions.managerOnly")}</p>}
          {manager && requiresEditor && reviewable && run.candidates.length > 0 && <p className="muted">{t("metadata.suggestions.editBeforeAccept")}</p>}
          {manager && reviewable && run.candidates.length > 0 && <footer className="metadata-suggestions-actions">
            <button className="button button--primary" type="button" onClick={onAccept} disabled={accepting || requiresEditor || selectedIds.size === 0}>
              {accepting ? t("metadata.suggestions.accepting") : t("metadata.suggestions.accept")}
            </button>
          </footer>}
          </details>}
        </>
      )}
    </section>
  );
}

function MetadataEditor({
  draft,
  setDraft,
  onTypeChange,
  authorities,
  authoritiesById,
  authorityType,
  setAuthorityType,
  authorityLabel,
  setAuthorityLabel,
  onCreateAuthority,
  onAuthorityLinked,
  onCancel,
  onSave,
  saving,
  t,
}: {
  draft: ReturnType<typeof draftFromDetail>;
  setDraft: Dispatch<SetStateAction<ReturnType<typeof draftFromDetail>>>;
  onTypeChange: (type: MaterialType) => void;
  authorities: LibraryAuthority[];
  authoritiesById: Map<string, LibraryAuthority>;
  authorityType: AuthorityType;
  setAuthorityType: (type: AuthorityType) => void;
  authorityLabel: string;
  setAuthorityLabel: (value: string) => void;
  onCreateAuthority: () => void;
  onAuthorityLinked: (authority: LibraryAuthority) => void;
  onCancel: () => void;
  onSave: () => void;
  saving: boolean;
  t: ReturnType<typeof useLanguage>["t"];
}) {
  const fields = FIELDS_BY_TYPE[draft.materialType];
  function setField(key: keyof MetadataTypeFields, value: string) {
    setDraft((current) => ({ ...current, typeFields: { ...current.typeFields, [key]: value } }));
  }
  return (
    <div className="resource-details-editor">
      <fieldset>
        <legend>{t("metadata.details")}</legend>
        <label>{t("metadata.materialType")}
          <select value={draft.materialType} onChange={(event) => onTypeChange(event.target.value as MaterialType)}>
            {MATERIAL_TYPES.map((type) => <option key={type} value={type}>{t(materialLabelKey(type))}</option>)}
          </select>
        </label>
        <label>{t("metadata.canonicalTitle")}
          <input value={draft.canonicalTitle} maxLength={512} onChange={(event) => setDraft((current) => ({ ...current, canonicalTitle: event.target.value }))} />
        </label>
        <label>{t("metadata.subtitle")}
          <input value={draft.subtitle} maxLength={512} onChange={(event) => setDraft((current) => ({ ...current, subtitle: event.target.value }))} />
        </label>
        <label>{t("metadata.dateStatement")}
          <input value={draft.dateStatement} maxLength={128} onChange={(event) => setDraft((current) => ({ ...current, dateStatement: event.target.value }))} />
        </label>
      </fieldset>
      <fieldset>
        <legend>{t("metadata.alternativeTitles")}</legend>
        {draft.alternativeTitles.map((title, index) => <div className="metadata-repeat-row" key={`alternative-${index}`}>
          <input aria-label={`${t("metadata.alternativeTitles")} ${index + 1}`} maxLength={512} value={title} onChange={(event) => setDraft((current) => ({ ...current, alternativeTitles: current.alternativeTitles.map((item, itemIndex) => itemIndex === index ? event.target.value : item) }))} />
          <button className="button button--small button--quiet" type="button" onClick={() => setDraft((current) => ({ ...current, alternativeTitles: current.alternativeTitles.filter((_, itemIndex) => itemIndex !== index) }))}>{t("alert.dismiss")}</button>
        </div>)}
        {draft.alternativeTitles.length < 8 && <button className="button button--small" type="button" onClick={() => setDraft((current) => ({ ...current, alternativeTitles: [...current.alternativeTitles, ""] }))}>{t("metadata.addAlternative")}</button>}
      </fieldset>
      <fieldset>
        <legend>{t("metadata.identifiers")}</legend>
        {draft.identifiers.map((identifier, index) => <div className="metadata-repeat-row" key={`identifier-${index}`}>
          <input aria-label={t("metadata.identifierScheme")} placeholder={t("metadata.identifierScheme")} maxLength={32} value={identifier.scheme} onChange={(event) => setDraft((current) => ({ ...current, identifiers: current.identifiers.map((item, itemIndex) => itemIndex === index ? { ...item, scheme: event.target.value } : item) }))} />
          <input aria-label={t("metadata.identifierValue")} placeholder={t("metadata.identifierValue")} maxLength={128} value={identifier.value} onChange={(event) => setDraft((current) => ({ ...current, identifiers: current.identifiers.map((item, itemIndex) => itemIndex === index ? { ...item, value: event.target.value } : item) }))} />
          <button className="button button--small button--quiet" type="button" onClick={() => setDraft((current) => ({ ...current, identifiers: current.identifiers.filter((_, itemIndex) => itemIndex !== index) }))}>{t("alert.dismiss")}</button>
        </div>)}
        {draft.identifiers.length < 8 && <button className="button button--small" type="button" onClick={() => setDraft((current) => ({ ...current, identifiers: [...current.identifiers, { scheme: "", value: "" }] }))}>{t("metadata.addIdentifier")}</button>}
      </fieldset>
      <fieldset>
        <legend>{t("metadata.typeFields")}</legend>
        {fields.map(({ key, max }) => <label key={key}>{t(fieldLabelKey(key))}
          <input maxLength={max} value={draft.typeFields[key] ?? ""} onChange={(event) => setField(key, event.target.value)} />
        </label>)}
      </fieldset>
      <fieldset>
        <legend>{t("metadata.authorities")}</legend>
        {draft.authorityLinks.map((link, index) => {
          const authority = authoritiesById.get(link.authorityId);
          const roles = authority ? ROLES_BY_TYPE[authority.type] : [];
          return <div className="metadata-repeat-row" key={`${link.authorityId}-${index}`}>
            <span className="metadata-authority-label">{authority?.canonicalLabel ?? "—"}</span>
            <select aria-label={t("metadata.authorityRole")} value={link.role} onChange={(event) => setDraft((current) => ({ ...current, authorityLinks: current.authorityLinks.map((item, itemIndex) => itemIndex === index ? { ...item, role: event.target.value as AuthorityRole } : item) }))}>
              {roles.map((role) => <option key={role} value={role}>{t(roleLabelKey(role))}</option>)}
            </select>
            <button className="button button--small button--quiet" type="button" onClick={() => setDraft((current) => ({ ...current, authorityLinks: current.authorityLinks.filter((_, itemIndex) => itemIndex !== index) }))}>{t("alert.dismiss")}</button>
          </div>;
        })}
        {draft.authorityLinks.length < 32 && <div className="metadata-authority-add">
          <select aria-label={t("metadata.authorityType")} value={authorityType} onChange={(event) => setAuthorityType(event.target.value as AuthorityType)}>
            {AUTHORITY_TYPES.map((type) => <option key={type} value={type}>{type}</option>)}
          </select>
          <select aria-label={t("metadata.linkAuthority")} value="" onChange={(event) => {
            const authority = authoritiesById.get(event.target.value);
            if (!authority) return;
            onAuthorityLinked(authority);
          }}>
            <option value="">{t("metadata.linkAuthority")}</option>
            {authorities.filter((authority) => authority.type === authorityType).map((authority) => <option key={authority.id} value={authority.id}>{authority.canonicalLabel}</option>)}
          </select>
          <input aria-label={t("metadata.authorityLabel")} placeholder={t("metadata.authorityLabel")} value={authorityLabel} onChange={(event) => setAuthorityLabel(event.target.value)} />
          <button className="button button--small" type="button" onClick={onCreateAuthority} disabled={!authorityLabel.trim() || saving}>{t("metadata.addAuthority")}</button>
        </div>}
      </fieldset>
      <footer className="resource-details-actions">
        <button className="button button--quiet" type="button" onClick={onCancel} disabled={saving}>{t("metadata.cancel")}</button>
        <button className="button button--primary" type="button" onClick={onSave} disabled={saving || !draft.canonicalTitle.trim()}>{saving ? t("metadata.saving") : t("metadata.save")}</button>
      </footer>
    </div>
  );
}
