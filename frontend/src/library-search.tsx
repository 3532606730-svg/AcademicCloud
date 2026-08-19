import { useEffect, useRef, useState } from "react";

import type {
  AcademicCloudApi,
  LibraryHolding,
  LibrarySearchResult,
  LibrarySummary,
  MaterialType,
} from "./api.ts";
import { composeLibraryDisplayTitle } from "./library-display-title.ts";
import { describeError, type Language, type MessageKey } from "./i18n.ts";
import type { Translator } from "./i18n-react.tsx";

const SEARCH_DEBOUNCE_MS = 280;

const MATERIAL_TYPE_LABEL_KEYS: Record<MaterialType, MessageKey> = {
  book: "metadata.typeBook",
  article: "metadata.typeArticle",
  manuscript: "metadata.typeManuscript",
  inscription: "metadata.typeInscription",
  archival_document: "metadata.typeArchivalDocument",
};

/**
 * Convert a bounded metadata/name search result into the minimal holding
 * shape `ResourceDetailsDialog` expects. The dialog re-fetches real details by
 * `file.id`, so empty identity fields and a null media type are acceptable.
 */
export function librarySearchResultToHolding(result: LibrarySearchResult): LibraryHolding {
  return {
    recordId: "",
    recordLabel: result.displayName,
    canonicalTitle: result.canonicalTitle,
    authorLabels: [...result.authorLabels],
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
  if (result.materialType) parts.push(t(MATERIAL_TYPE_LABEL_KEYS[result.materialType]));
  return parts.join(" · ") || null;
}

export function LibrarySearchField({
  api,
  library,
  language,
  t,
  onOpenResult,
  onActiveChange,
}: {
  api: AcademicCloudApi;
  library: LibrarySummary | null;
  language: Language;
  t: Translator;
  onOpenResult: (result: LibrarySearchResult) => void;
  onActiveChange?: (active: boolean) => void;
}) {
  const [query, setQuery] = useState("");
  const [status, setStatus] = useState<"idle" | "loading" | "success" | "error">("idle");
  const [results, setResults] = useState<LibrarySearchResult[]>([]);
  const [error, setError] = useState<unknown>(null);

  const abortRef = useRef<AbortController | null>(null);
  const debounceRef = useRef<ReturnType<typeof setTimeout> | null>(null);
  const requestIdRef = useRef(0);
  const onActiveChangeRef = useRef(onActiveChange);
  onActiveChangeRef.current = onActiveChange;

  const active = query.trim().length > 0;

  useEffect(() => {
    onActiveChangeRef.current?.(active);
  }, [active]);

  // Cancel any in-flight search and release the parent's "search active"
  // flag when this field leaves the catalogue (unmount).
  useEffect(() => {
    return () => {
      onActiveChangeRef.current?.(false);
      abortRef.current?.abort();
      if (debounceRef.current) clearTimeout(debounceRef.current);
    };
  }, []);

  useEffect(() => {
    const libraryId = library?.id;
    const trimmed = query.trim();

    if (!libraryId || !trimmed) {
      abortRef.current?.abort();
      abortRef.current = null;
      if (debounceRef.current) {
        clearTimeout(debounceRef.current);
        debounceRef.current = null;
      }
      requestIdRef.current += 1;
      setStatus("idle");
      setResults([]);
      setError(null);
      return;
    }

    setStatus("loading");
    setError(null);
    if (debounceRef.current) clearTimeout(debounceRef.current);

    const requestId = requestIdRef.current + 1;
    requestIdRef.current = requestId;

    debounceRef.current = setTimeout(() => {
      debounceRef.current = null;
      abortRef.current?.abort();
      const controller = new AbortController();
      abortRef.current = controller;
      api.searchLibraryHoldings(libraryId, trimmed, controller.signal).then(
        (page) => {
          if (requestIdRef.current !== requestId || controller.signal.aborted) return;
          setResults(page.results);
          setStatus("success");
        },
        (caught: unknown) => {
          if (requestIdRef.current !== requestId || controller.signal.aborted) return;
          setError(caught);
          setStatus("error");
        },
      );
    }, SEARCH_DEBOUNCE_MS);

    return () => {
      if (debounceRef.current) {
        clearTimeout(debounceRef.current);
        debounceRef.current = null;
      }
    };
  }, [api, library, query]);

  return (
    <div className="library-search">
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
              setQuery("");
            }
          }}
        />
        {active && (
          <button
            type="button"
            className="library-search-clear"
            aria-label={t("librarySearch.clear")}
            onClick={() => setQuery("")}
          >
            ×
          </button>
        )}
      </div>
      {active && (
        <div className="library-search-results">
          {status === "loading" && <p className="muted" role="status">{t("librarySearch.loading")}</p>}
          {status === "error" && (
            <div className="alert alert--error" role="alert">{describeError(error, language)}</div>
          )}
          {status === "success" && results.length === 0 && (
            <p className="muted">{t("librarySearch.noResults")}</p>
          )}
          {status === "success" && results.length > 0 && (
            <ul className="library-search-list" aria-label={t("librarySearch.resultsAria")}>
              {results.map((result) => {
                const title = composeLibraryDisplayTitle(
                  {
                    canonicalTitle: result.canonicalTitle,
                    authorLabels: result.authorLabels,
                    fallbackDisplayName: result.displayName,
                  },
                  language,
                );
                const meta = secondaryLine(result, t);
                return (
                  <li key={result.fileId}>
                    <button
                      type="button"
                      className="library-search-result"
                      onClick={() => onOpenResult(result)}
                    >
                      <span className="library-search-result-title">{title}</span>
                      {meta && <span className="library-search-result-meta">{meta}</span>}
                    </button>
                  </li>
                );
              })}
            </ul>
          )}
        </div>
      )}
    </div>
  );
}
