import { useEffect, useMemo, useRef, useState } from "react";

import type {
  AcademicCloudApi,
  ContributorRole,
  EditionType,
  LibraryHolding,
  LibraryHoldingSort,
  LibrarySearchFilters,
  LibrarySearchResult,
  LibrarySummary,
  MaterialClass,
  MaterialType,
} from "./api.ts";
import { composeLibraryDisplayTitle } from "./library-display-title.ts";
import { describeError, type Language, type MessageKey } from "./i18n.ts";
import type { Translator } from "./i18n-react.tsx";

const SEARCH_DEBOUNCE_MS = 280;

const SORT_OPTIONS: ReadonlyArray<{ value: LibraryHoldingSort; key: MessageKey }> = [
  { value: "newest", key: "library.sortNewest" },
  { value: "oldest", key: "library.sortOldest" },
  { value: "title_asc", key: "library.sortTitleAsc" },
  { value: "title_desc", key: "library.sortTitleDesc" },
  { value: "size_asc", key: "library.sortSizeAsc" },
  { value: "size_desc", key: "library.sortSizeDesc" },
];

const MATERIAL_CLASSES: readonly MaterialClass[] = [
  "scholarly_monograph", "edited_volume", "journal_article", "book_chapter",
  "thesis_dissertation", "conference_paper", "review", "reference_work",
  "dictionary_lexicon", "primary_source_modern_edition", "traditional_book",
  "archival_document", "inscription_epigraphy", "rubbing", "manuscript",
  "collected_documents", "catalogue_bibliography", "other", "unknown",
];

const EDITION_OPTIONS: readonly EditionType[] = [
  "critical_edition", "annotated_edition", "collated_edition", "punctuated_edition",
  "translated_edition", "facsimile", "engraved", "recut", "other",
];

const EDITORIAL_ROLE_OPTIONS: readonly ContributorRole[] = [
  "editor", "compiler", "translator", "annotator", "collator", "punctuator",
  "commentator", "reviser", "selector", "organizer",
];

const MATERIAL_TYPE_LABEL_KEYS: Record<MaterialType, MessageKey> = {
  book: "metadata.typeBook",
  article: "metadata.typeArticle",
  manuscript: "metadata.typeManuscript",
  inscription: "metadata.typeInscription",
  archival_document: "metadata.typeArchivalDocument",
};

function materialClassKey(value: MaterialClass): MessageKey {
  return `materialClass.${value}` as MessageKey;
}

function editionTypeKey(value: EditionType): MessageKey {
  return `editionType.${value}` as MessageKey;
}

function contributorRoleKey(value: ContributorRole): MessageKey {
  return `contributorRole.${value}` as MessageKey;
}

export function librarySearchResultToHolding(result: LibrarySearchResult): LibraryHolding {
  return {
    recordId: "",
    recordLabel: result.displayName,
    canonicalTitle: result.canonicalTitle,
    authorLabels: [...result.authorLabels],
    materialClass: result.materialClass ?? null,
    contributorLabels: [...(result.contributorLabels ?? result.authorLabels)],
    editionStatement: result.editionStatement ?? null,
    catalogueDisplayTitle: result.catalogueDisplayTitle ?? "",
    artifactId: "",
    versionId: "",
    version: "",
    file: {
      id: result.fileId,
      displayName: result.displayName,
      mediaType: null,
      sizeBytes: 0,
      updatedAt: "",
    },
  };
}

function secondaryLine(result: LibrarySearchResult, t: Translator): string | null {
  const parts: string[] = [];
  if (result.date) parts.push(result.date);
  if (result.publisher) parts.push(result.publisher);
  if (result.materialClass) parts.push(t(materialClassKey(result.materialClass)));
  else if (result.materialType) parts.push(t(MATERIAL_TYPE_LABEL_KEYS[result.materialType]));
  return parts.join(" · ") || null;
}

function textFilter(value: string): string | undefined {
  return value.trim() || undefined;
}

export function LibrarySearchField({
  api,
  library,
  language,
  t,
  onOpenResult,
  onActiveChange,
  sort,
  onSortChange,
}: {
  api: AcademicCloudApi;
  library: LibrarySummary | null;
  language: Language;
  t: Translator;
  onOpenResult: (result: LibrarySearchResult) => void;
  onActiveChange?: (active: boolean) => void;
  sort?: LibraryHoldingSort;
  onSortChange?: (sort: LibraryHoldingSort) => void;
}) {
  const [query, setQuery] = useState("");
  const [materialClass, setMaterialClass] = useState<MaterialClass | "">("");
  const [contributor, setContributor] = useState("");
  const [filterLanguage, setFilterLanguage] = useState("");
  const [publisher, setPublisher] = useState("");
  const [year, setYear] = useState("");
  const [editionType, setEditionType] = useState<EditionType | "">("");
  const [dynasty, setDynasty] = useState("");
  const [reignTitle, setReignTitle] = useState("");
  const [editorialRole, setEditorialRole] = useState<ContributorRole | "">("");
  const [series, setSeries] = useState("");
  const [volume, setVolume] = useState("");
  const [status, setStatus] = useState<"idle" | "loading" | "success" | "error">("idle");
  const [results, setResults] = useState<LibrarySearchResult[]>([]);
  const [error, setError] = useState<unknown>(null);
  const [nextCursor, setNextCursor] = useState<string | null>(null);
  const [loadingMore, setLoadingMore] = useState(false);
  const [loadMoreError, setLoadMoreError] = useState<unknown>(null);

  const filters = useMemo<LibrarySearchFilters>(() => ({
    ...(materialClass ? { materialClass } : {}),
    ...(textFilter(contributor) ? { contributor: textFilter(contributor)! } : {}),
    ...(textFilter(filterLanguage) ? { language: textFilter(filterLanguage)! } : {}),
    ...(textFilter(publisher) ? { publisher: textFilter(publisher)! } : {}),
    ...(textFilter(year) ? { year: textFilter(year)! } : {}),
    ...(editionType ? { editionType } : {}),
    ...(textFilter(dynasty) ? { dynasty: textFilter(dynasty)! } : {}),
    ...(textFilter(reignTitle) ? { reignTitle: textFilter(reignTitle)! } : {}),
    ...(editorialRole ? { editorialRole } : {}),
    ...(textFilter(series) ? { series: textFilter(series)! } : {}),
    ...(textFilter(volume) ? { volume: textFilter(volume)! } : {}),
  }), [materialClass, contributor, filterLanguage, publisher, year, editionType, dynasty, reignTitle, editorialRole, series, volume]);
  const filterIdentity = JSON.stringify(filters);
  const hasFilters = Object.keys(filters).length > 0;
  const active = query.trim().length > 0 || hasFilters;

  const abortRef = useRef<AbortController | null>(null);
  const loadMoreAbortRef = useRef<AbortController | null>(null);
  const debounceRef = useRef<ReturnType<typeof setTimeout> | null>(null);
  const requestIdRef = useRef(0);
  const onActiveChangeRef = useRef(onActiveChange);
  onActiveChangeRef.current = onActiveChange;

  useEffect(() => { onActiveChangeRef.current?.(active); }, [active]);

  useEffect(() => () => {
    onActiveChangeRef.current?.(false);
    abortRef.current?.abort();
    loadMoreAbortRef.current?.abort();
    if (debounceRef.current) clearTimeout(debounceRef.current);
  }, []);

  useEffect(() => {
    const libraryId = library?.id;
    const trimmed = query.trim();
    if (!libraryId || !active) {
      abortRef.current?.abort();
      abortRef.current = null;
      loadMoreAbortRef.current?.abort();
      loadMoreAbortRef.current = null;
      if (debounceRef.current) clearTimeout(debounceRef.current);
      requestIdRef.current += 1;
      setStatus("idle");
      setResults([]);
      setError(null);
      setNextCursor(null);
      setLoadingMore(false);
      setLoadMoreError(null);
      return;
    }

    setStatus("loading");
    setError(null);
    setNextCursor(null);
    setLoadingMore(false);
    setLoadMoreError(null);
    loadMoreAbortRef.current?.abort();
    loadMoreAbortRef.current = null;
    if (debounceRef.current) clearTimeout(debounceRef.current);
    const requestId = requestIdRef.current + 1;
    requestIdRef.current = requestId;

    debounceRef.current = setTimeout(() => {
      debounceRef.current = null;
      abortRef.current?.abort();
      const controller = new AbortController();
      abortRef.current = controller;
      const request = sort
        ? api.searchLibraryHoldings(libraryId, trimmed, controller.signal, undefined, undefined, hasFilters ? filters : undefined, sort)
        : hasFilters
          ? api.searchLibraryHoldings(libraryId, trimmed, controller.signal, undefined, undefined, filters)
          : api.searchLibraryHoldings(libraryId, trimmed, controller.signal);
      request.then((page) => {
        if (requestIdRef.current !== requestId || controller.signal.aborted) return;
        setResults(page.results);
        setNextCursor(page.nextCursor);
        setStatus("success");
      }, (caught: unknown) => {
        if (requestIdRef.current !== requestId || controller.signal.aborted) return;
        setError(caught);
        setStatus("error");
      });
    }, SEARCH_DEBOUNCE_MS);

    return () => {
      if (debounceRef.current) clearTimeout(debounceRef.current);
    };
  }, [active, api, filterIdentity, hasFilters, library, query, sort]);

  function loadMore() {
    const libraryId = library?.id;
    const trimmed = query.trim();
    if (!libraryId || !active || !nextCursor || loadingMore) return;
    const requestId = requestIdRef.current;
    loadMoreAbortRef.current?.abort();
    const controller = new AbortController();
    loadMoreAbortRef.current = controller;
    setLoadingMore(true);
    setLoadMoreError(null);
    const request = sort
      ? api.searchLibraryHoldings(libraryId, trimmed, controller.signal, nextCursor, undefined, hasFilters ? filters : undefined, sort)
      : hasFilters
        ? api.searchLibraryHoldings(libraryId, trimmed, controller.signal, nextCursor, undefined, filters)
        : api.searchLibraryHoldings(libraryId, trimmed, controller.signal, nextCursor);
    request.then((page) => {
      if (requestIdRef.current !== requestId || controller.signal.aborted) return;
      setResults((current) => {
        const seen = new Set(current.map((item) => item.fileId));
        return [...current, ...page.results.filter((item) => !seen.has(item.fileId))];
      });
      setNextCursor(page.nextCursor);
    }, (caught: unknown) => {
      if (requestIdRef.current !== requestId || controller.signal.aborted) return;
      setLoadMoreError(caught);
    }).finally(() => {
      if (requestIdRef.current === requestId) setLoadingMore(false);
    });
  }

  function clearSearch(): void {
    setQuery("");
    setMaterialClass("");
    setContributor("");
    setFilterLanguage("");
    setPublisher("");
    setYear("");
    setEditionType("");
    setDynasty("");
    setReignTitle("");
    setEditorialRole("");
    setSeries("");
    setVolume("");
  }

  return (
    <div className="library-search">
      <div className="library-search-toolbar">
        <div className="library-search-field">
          <input
            type="search"
            className="library-search-input"
            aria-label={t("librarySearch.label")}
            placeholder={t("librarySearch.placeholder")}
            value={query}
            maxLength={100}
            onChange={(event) => setQuery(event.target.value)}
            onKeyDown={(event) => {
              if (event.key === "Escape") {
                event.preventDefault();
                clearSearch();
              }
            }}
          />
          {active && <button type="button" className="library-search-clear" aria-label={t("librarySearch.clear")} onClick={clearSearch}>×</button>}
        </div>
        <label className="library-search-material">
          <span className="visually-hidden">{t("librarySearch.materialClass")}</span>
          <select value={materialClass} onChange={(event) => setMaterialClass(event.target.value as MaterialClass | "")}>
            <option value="">{t("librarySearch.allMaterials")}</option>
            {MATERIAL_CLASSES.map((value) => <option key={value} value={value}>{t(materialClassKey(value))}</option>)}
          </select>
        </label>
        <label className="library-search-sort">
          <span className="visually-hidden">{t("library.sortLabel")}</span>
          <select aria-label={t("library.sortLabel")} value={sort ?? "newest"} onChange={(event) => onSortChange?.(event.target.value as LibraryHoldingSort)}>
            {SORT_OPTIONS.map((option) => <option key={option.value} value={option.value}>{t(option.key)}</option>)}
          </select>
        </label>
        <details className="library-search-advanced">
          <summary>{t("librarySearch.advanced")}</summary>
          <div className="library-search-filter-grid">
            <label>{t("librarySearch.contributor")}<input value={contributor} maxLength={128} onChange={(event) => setContributor(event.target.value)} /></label>
            <label>{t("librarySearch.publisher")}<input value={publisher} maxLength={128} onChange={(event) => setPublisher(event.target.value)} /></label>
            <label>{t("librarySearch.language")}<input value={filterLanguage} maxLength={128} onChange={(event) => setFilterLanguage(event.target.value)} /></label>
            <label>{t("librarySearch.year")}<input value={year} maxLength={128} inputMode="numeric" onChange={(event) => setYear(event.target.value)} /></label>
            <label>{t("librarySearch.editionType")}<select value={editionType} onChange={(event) => setEditionType(event.target.value as EditionType | "")}><option value="">{t("librarySearch.any")}</option>{EDITION_OPTIONS.map((value) => <option key={value} value={value}>{t(editionTypeKey(value))}</option>)}</select></label>
            <label>{t("librarySearch.dynasty")}<input value={dynasty} maxLength={128} onChange={(event) => setDynasty(event.target.value)} /></label>
            <label>{t("librarySearch.reignTitle")}<input value={reignTitle} maxLength={128} onChange={(event) => setReignTitle(event.target.value)} /></label>
            <label>{t("librarySearch.editorialRole")}<select value={editorialRole} onChange={(event) => setEditorialRole(event.target.value as ContributorRole | "")}><option value="">{t("librarySearch.any")}</option>{EDITORIAL_ROLE_OPTIONS.map((value) => <option key={value} value={value}>{t(contributorRoleKey(value))}</option>)}</select></label>
            <label>{t("librarySearch.series")}<input value={series} maxLength={128} onChange={(event) => setSeries(event.target.value)} /></label>
            <label>{t("librarySearch.volume")}<input value={volume} maxLength={128} onChange={(event) => setVolume(event.target.value)} /></label>
          </div>
        </details>
      </div>
      {active && (
        <div className="library-search-results">
          {status === "loading" && <p className="muted" role="status">{t("librarySearch.loading")}</p>}
          {status === "error" && <div className="alert alert--error" role="alert">{describeError(error, language)}</div>}
          {status === "success" && results.length === 0 && <p className="muted">{t("librarySearch.noResults")}</p>}
          {status === "success" && results.length > 0 && (
            <>
              <ul className="library-search-list" aria-label={t("librarySearch.resultsAria")}>
                {results.map((result) => {
                  const title = composeLibraryDisplayTitle({
                    canonicalTitle: result.canonicalTitle,
                    authorLabels: result.authorLabels,
                    catalogueDisplayTitle: result.catalogueDisplayTitle,
                    editionStatement: result.editionStatement,
                    fallbackDisplayName: result.displayName,
                  }, language);
                  const meta = secondaryLine(result, t);
                  return <li key={result.fileId}><button type="button" className="library-search-result" onClick={() => onOpenResult(result)}><span className="library-search-result-title">{title}</span>{meta && <span className="library-search-result-meta">{meta}</span>}</button></li>;
                })}
              </ul>
              {nextCursor !== null && (
                <div className="library-search-more">
                  <button type="button" className="button button--small" disabled={loadingMore} onClick={loadMore}>{loadingMore ? t("librarySearch.loading") : t("librarySearch.loadMore")}</button>
                  {loadMoreError !== null && <span className="library-search-more-error" role="alert">{describeError(loadMoreError, language)}</span>}
                </div>
              )}
            </>
          )}
        </div>
      )}
    </div>
  );
}
