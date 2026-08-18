import { useEffect, useMemo, useRef, useState, type Dispatch, type SetStateAction } from "react";

import {
  ApiError,
  type AcademicCloudApi,
  type AuthorityRole,
  type AuthorityType,
  type LibraryAuthority,
  type LibraryHolding,
  type LibraryHoldingDetails,
  type LibraryMetadataInput,
  type LibrarySummary,
  type MaterialType,
  type MetadataTypeFields,
} from "./api.ts";
import { describeError, type MessageKey } from "./i18n.ts";
import { useLanguage } from "./i18n-react.tsx";

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
}: {
  api: AcademicCloudApi;
  library: LibrarySummary;
  holding: LibraryHolding;
  returnFocus?: HTMLElement | null;
  onClose: () => void;
  onSaved: (detail: LibraryHoldingDetails) => void;
  onPreview: () => void;
  onDownload: () => void;
}) {
  const { language, t } = useLanguage();
  const [detail, setDetail] = useState<LibraryHoldingDetails | null>(null);
  const [loading, setLoading] = useState(true);
  const [editing, setEditing] = useState(false);
  const [saving, setSaving] = useState(false);
  const [error, setError] = useState<unknown>(null);
  const [notice, setNotice] = useState("");
  const [draft, setDraft] = useState(() => draftFromDetail({
    displayTitle: holding.canonicalTitle ?? holding.file.displayName,
    originalFilename: holding.file.displayName,
    metadataVersion: "",
    metadata: null,
    canEditMetadata: library.role === "manager",
    file: { id: holding.file.id, mediaType: holding.file.mediaType, sizeBytes: holding.file.sizeBytes, updatedAt: holding.file.updatedAt },
  }));
  const [authorities, setAuthorities] = useState<LibraryAuthority[]>([]);
  const [authorityType, setAuthorityType] = useState<AuthorityType>("person");
  const [authorityLabel, setAuthorityLabel] = useState("");
  const dialogRef = useResourceDialog(onClose, saving, returnFocus);

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
    } catch (caught) {
      setError(caught);
    } finally {
      setLoading(false);
    }
  }

  useEffect(() => { void loadDetails(); }, [api, library.id, holding.file.id]);

  useEffect(() => {
    if (!editing || library.role !== "manager") return;
    const controller = new AbortController();
    Promise.all(AUTHORITY_TYPES.map((type) => api.listLibraryAuthorities(library.id, type, controller.signal)))
      .then((pages) => setAuthorities(pages.flat()), (caught) => {
        if (!(caught instanceof DOMException && caught.name === "AbortError")) setError(caught);
      });
    return () => controller.abort();
  }, [api, editing, library.id, library.role]);

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
      const role = ROLES_BY_TYPE[authority.type][0]!;
      setDraft((current) => ({ ...current, authorityLinks: [...current.authorityLinks, { authorityId: authority.id, role }] }));
      setAuthorityLabel("");
      setNotice(t("metadata.authorityCreated"));
    } catch (caught) {
      setError(caught);
    } finally {
      setSaving(false);
    }
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
      setEditing(false);
      onSaved(next);
    } catch (caught) {
      if (caught instanceof ApiError && caught.code === "concurrent_change") {
        try {
          const latest = await api.getLibraryHoldingDetails(library.id, holding.file.id);
          setDetail(latest);
          setDraft(draftFromDetail(latest));
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

  const metadata = detail?.metadata;
  const displayTitle = detail?.displayTitle ?? holding.canonicalTitle ?? holding.file.displayName;
  const detailTypeLabel = metadata ? materialLabel(metadata.materialType, t) : null;

  return (
    <dialog ref={dialogRef} className="resource-details-modal" aria-labelledby="resource-details-title">
      <header>
        <div>
          <h2 id="resource-details-title">{displayTitle}</h2>
          {detailTypeLabel && <span className="resource-details-type">{detailTypeLabel}</span>}
        </div>
        <button className="button button--quiet" type="button" onClick={onClose} disabled={saving} aria-label={t("metadata.closeAria")}>{t("preview.close")}</button>
      </header>
      {loading ? <p role="status">{t("sharedLibrary.loading")}</p> : error !== null ? (
        <div className="alert alert--error" role="alert">{describeError(error, language)}</div>
      ) : detail && (
        <div className="resource-details-body">
          {notice && <div className="alert alert--success" role="status">{notice}</div>}
          {!editing ? (
            <>
              {metadata ? <MetadataReadOnly metadata={metadata} t={t} /> : <p className="muted">{t("metadata.noMetadata")}</p>}
              <fieldset className="resource-details-original">
                <legend>{t("metadata.originalFilename")}</legend>
                <p>{detail.originalFilename}</p>
              </fieldset>
              <footer className="resource-details-actions">
                <button className="button button--quiet" type="button" onClick={onPreview} disabled={!holding.file.mediaType || (!holding.file.mediaType.startsWith("image/") && holding.file.mediaType !== "application/pdf")}>{t("menu.preview")}</button>
                <button className="button" type="button" onClick={onDownload}>{t("menu.download")}</button>
                {detail.canEditMetadata && (!metadata || isMaterialType(metadata.materialType)) && <button className="button button--primary" type="button" onClick={() => setEditing(true)}>{t("metadata.edit")}</button>}
              </footer>
            </>
          ) : (
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
              onCancel={() => { setDraft(draftFromDetail(detail)); setEditing(false); setNotice(""); }}
              onSave={() => void save()}
              saving={saving}
              t={t}
            />
          )}
        </div>
      )}
    </dialog>
  );
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
            setDraft((current) => ({ ...current, authorityLinks: [...current.authorityLinks, { authorityId: authority.id, role: ROLES_BY_TYPE[authority.type][0]! }] }));
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
