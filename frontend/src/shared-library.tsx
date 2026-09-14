import { useEffect, useMemo, useRef, useState, type ReactNode } from "react";

import type { AcademicCloudApi, LibraryContribution, LibraryHolding, LibraryHoldingSort, LibrarySummary } from "./api.ts";
import { describeError } from "./i18n.ts";
import { useLanguage } from "./i18n-react.tsx";
import { readViewPreference, writeViewPreference } from "./view-context.ts";

function preferredLibrary(libraries: LibrarySummary[]): LibrarySummary | null {
  return libraries.find((library) => library.isDefault) ?? libraries[0] ?? null;
}

/**
 * The normal Library surface. RF-SHAREDDEFAULT01 makes the default Library
 * the canonical corpus; this component therefore presents holdings directly
 * instead of exposing a second top-level "Shared Library" product chooser.
 * Sorting is server-authoritative with stable keyset pagination; the panel
 * never reorders a locally loaded page.
 */
export function SharedLibraryPanel({
  api,
  accountId,
  revision = 0,
  renderCatalogue,
  onCatalogueChange,
}: {
  api: AcademicCloudApi;
  accountId?: string;
  revision?: number;
  renderCatalogue: (state: {
    library: LibrarySummary | null;
    holdings: LibraryHolding[];
    loading: boolean;
    nextCursor: string | null;
    loadingMore: boolean;
    sort: LibraryHoldingSort;
    onSortChange: (sort: LibraryHoldingSort) => void;
    onLoadMore: () => void;
  }) => ReactNode;
  onCatalogueChange?: (state: { library: LibrarySummary | null; holdings: LibraryHolding[] }) => void;
}) {
  const { language, t } = useLanguage();
  const [library, setLibrary] = useState<LibrarySummary | null>(null);
  const [holdings, setHoldings] = useState<LibraryHolding[]>([]);
  const [sort, setSort] = useState<LibraryHoldingSort>(() => {
    const saved = readViewPreference(accountId, "sort", "newest");
    return ["newest", "oldest", "title_asc", "title_desc", "size_asc", "size_desc"].includes(saved)
      ? saved as LibraryHoldingSort : "newest";
  });
  useEffect(() => { writeViewPreference(accountId, "sort", sort); }, [accountId, sort]);
  const [nextCursor, setNextCursor] = useState<string | null>(null);
  const [loadingMore, setLoadingMore] = useState(false);
  const [contributions, setContributions] = useState<LibraryContribution[]>([]);
  const [contributionsLoading, setContributionsLoading] = useState(false);
  const [contributionsError, setContributionsError] = useState<unknown>(null);
  const [contributionsRevision, setContributionsRevision] = useState(0);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState<unknown>(null);
  const [busy, setBusy] = useState(false);
  const catalogueRequestVersion = useRef(0);

  useEffect(() => {
    onCatalogueChange?.({ library, holdings });
  }, [holdings, library, onCatalogueChange]);

  useEffect(() => {
    let cancelled = false;
    setLoading(true);
    setError(null);
    api.listLibraries().then((items) => {
      if (!cancelled) setLibrary(preferredLibrary(items));
    }, (caught) => {
      if (!cancelled) setError(caught);
    }).finally(() => {
      if (!cancelled) setLoading(false);
    });
    return () => { cancelled = true; };
  }, [api]);

  useEffect(() => {
    catalogueRequestVersion.current += 1;
    setLoadingMore(false);
    if (!library) {
      setHoldings([]);
      return;
    }
    let cancelled = false;
    setLoading(true);
    setError(null);
    const loadHoldings = api.listLibraryHoldingsSorted
      ? api.listLibraryHoldingsSorted(library.id, sort, null)
      : api.listLibraryHoldings(library.id).then((items) => ({ holdings: items, nextCursor: null }));
    loadHoldings.then((page) => {
      if (cancelled) return;
      setHoldings(page.holdings);
      setNextCursor(page.nextCursor);
    }, (caught) => {
      if (!cancelled) setError(caught);
    }).finally(() => {
      if (!cancelled) setLoading(false);
    });
    return () => {
      cancelled = true;
      catalogueRequestVersion.current += 1;
    };
  }, [api, library, revision, sort]);

  useEffect(() => {
    setContributions([]);
    setContributionsError(null);
    if (!library || library.role === "manager") {
      setContributionsLoading(false);
      return;
    }
    let cancelled = false;
    setContributionsLoading(true);
    // Submission history is supplementary: it neither gates Library results
    // nor gets refetched when the researcher only changes catalogue sorting.
    api.listMyLibraryContributions(library.id).then((items) => {
      if (!cancelled) setContributions(items);
    }, (caught) => {
      if (!cancelled) setContributionsError(caught);
    }).finally(() => {
      if (!cancelled) setContributionsLoading(false);
    });
    return () => { cancelled = true; };
  }, [api, library, revision, contributionsRevision]);

  function loadMore() {
    if (!library || !nextCursor || loading || loadingMore) return;
    const requestVersion = catalogueRequestVersion.current;
    setLoadingMore(true);
    setError(null);
    const load = api.listLibraryHoldingsSorted
      ? api.listLibraryHoldingsSorted(library.id, sort, nextCursor)
      : Promise.resolve({ holdings: [], nextCursor: null });
    load.then((page) => {
      if (requestVersion !== catalogueRequestVersion.current) return;
      setHoldings((current) => [...current, ...page.holdings]);
      setNextCursor(page.nextCursor);
    }, (caught) => {
      if (requestVersion !== catalogueRequestVersion.current) return;
      setError(caught);
    }).finally(() => {
      if (requestVersion === catalogueRequestVersion.current) setLoadingMore(false);
    });
  }

  async function withdrawContribution(contribution: LibraryContribution) {
    if (!library) return;
    setBusy(true);
    setError(null);
    try {
      const updated = await api.withdrawLibraryContribution(library.id, contribution.id);
      setContributions((current) => current.map((item) => item.id === updated.id ? updated : item));
    } catch (caught) {
      setError(caught);
    } finally {
      setBusy(false);
    }
  }

  return (
    <div className="shared-library-panel">
      {error !== null && <div className="alert alert--error" role="alert">{describeError(error, language)} <button type="button" onClick={() => setError(null)}>{t("alert.dismiss")}</button></div>}
      {renderCatalogue({
        library,
        holdings,
        loading,
        nextCursor,
        loadingMore,
        sort,
        onSortChange: (nextSort) => {
          setSort(nextSort);
          setHoldings([]);
          setNextCursor(null);
        },
        onLoadMore: loadMore,
      })}
      {library && library.role !== "manager" && (contributions.length > 0 || contributionsLoading || contributionsError !== null) && (
        <section className="shared-library-members" aria-labelledby="shared-library-my-contributions-title">
          <div className="section-heading"><h3 id="shared-library-my-contributions-title">{t("sharedLibrary.myContributions")}</h3>{contributions.length > 0 && <span>{contributions.length}</span>}</div>
          {contributionsLoading && <p className="muted" role="status">{t("sharedLibrary.loading")}</p>}
          {contributionsError !== null && <div className="alert alert--error" role="alert">{describeError(contributionsError, language)} <button type="button" onClick={() => setContributionsRevision((value) => value + 1)}>{t("sharedLibrary.retryContributions")}</button></div>}
          <div className="shared-library-member-list">
            {contributions.map((contribution) => (
              <article className="shared-library-member" key={contribution.id}>
                <span><strong>{contribution.file.displayName}</strong><small>{contribution.recordLabel} · {contribution.state}</small></span>
                {contribution.state === "submitted" && <button className="button button--small button--danger" type="button" disabled={busy} onClick={() => void withdrawContribution(contribution)}>{t("sharedLibrary.withdraw")}</button>}
              </article>
            ))}
          </div>
        </section>
      )}
    </div>
  );
}

/** Owner-only contribution review, embedded in the unified administration dialog. */
export function ContributionReviewPanel({ api, onChanged }: { api: AcademicCloudApi; onChanged: () => void }) {
  const { language, t } = useLanguage();
  const [libraries, setLibraries] = useState<LibrarySummary[]>([]);
  const [selectedId, setSelectedId] = useState<string | null>(null);
  const [contributions, setContributions] = useState<LibraryContribution[]>([]);
  const [loading, setLoading] = useState(true);
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState<unknown>(null);

  const selected = useMemo(() => libraries.find((library) => library.id === selectedId) ?? null, [libraries, selectedId]);

  useEffect(() => {
    let cancelled = false;
    setLoading(true);
    api.listLibraries().then((items) => {
      if (cancelled) return;
      const manageable = items.filter((library) => library.role === "manager");
      setLibraries(manageable);
      setSelectedId(preferredLibrary(manageable)?.id ?? null);
    }, (caught) => {
      if (!cancelled) setError(caught);
    }).finally(() => {
      if (!cancelled) setLoading(false);
    });
    return () => { cancelled = true; };
  }, [api]);

  useEffect(() => {
    if (!selectedId) {
      setContributions([]);
      return;
    }
    let cancelled = false;
    setContributions([]);
    setLoading(true);
    setError(null);
    api.listLibraryContributions(selectedId).then((items) => {
      if (!cancelled) setContributions(items);
    }, (caught) => {
      if (!cancelled) setError(caught);
    }).finally(() => {
      if (!cancelled) setLoading(false);
    });
    return () => { cancelled = true; };
  }, [api, selectedId]);

  async function openContribution(contribution: LibraryContribution, disposition: "attachment" | "inline") {
    if (!selectedId) return;
    setBusy(true);
    setError(null);
    try {
      const authorization = await api.createContributionDownload(selectedId, contribution.id, disposition);
      window.open(authorization.url, "_blank", "noopener,noreferrer");
    } catch (caught) {
      setError(caught);
    } finally {
      setBusy(false);
    }
  }

  async function decideContribution(contribution: LibraryContribution, decision: "approve" | "reject") {
    if (!selectedId) return;
    setBusy(true);
    setError(null);
    try {
      await api.reviewLibraryContribution(selectedId, contribution.id, decision);
      setContributions((current) => current.filter((item) => item.id !== contribution.id));
      onChanged();
    } catch (caught) {
      setError(caught);
    } finally {
      setBusy(false);
    }
  }

  return (
    <div className="owner-administration-panel">
      {error !== null && <div className="alert alert--error" role="alert">{describeError(error, language)} <button type="button" onClick={() => setError(null)}>{t("alert.dismiss")}</button></div>}
      {libraries.length > 1 && (
        <div className="owner-library-selector" aria-label={t("sharedLibrary.listAria")}>
          {libraries.map((library) => (
            <button key={library.id} type="button" className={library.id === selectedId ? "button button--small" : "button button--small button--quiet"} disabled={busy} onClick={() => setSelectedId(library.id)}>{library.name}</button>
          ))}
        </div>
      )}
      {loading ? <p role="status">{t("sharedLibrary.loading")}</p> : !selected ? (
        <p className="shared-library-empty">{t("sharedLibrary.empty")}</p>
      ) : contributions.length === 0 ? (
        <p className="shared-library-empty">{t("sharedLibrary.noContributions")}</p>
      ) : (
        <div className="shared-library-member-list">
          {contributions.map((contribution) => (
            <article className="shared-library-member" key={contribution.id}>
              <span><strong>{contribution.file.displayName}</strong><small>{contribution.recordLabel} · {t("sharedLibrary.submitter", { name: contribution.submitterLoginName ?? "—" })}</small></span>
              <div className="shared-library-actions">
                <button className="button button--small button--quiet" type="button" disabled={busy} onClick={() => void openContribution(contribution, "inline")}>{t("menu.preview")}</button>
                <button className="button button--small button--quiet" type="button" disabled={busy} onClick={() => void openContribution(contribution, "attachment")}>{t("menu.download")}</button>
                <button className="button button--small" type="button" disabled={busy} onClick={() => void decideContribution(contribution, "approve")}>{t("sharedLibrary.approve")}</button>
                <button className="button button--small button--danger" type="button" disabled={busy} onClick={() => void decideContribution(contribution, "reject")}>{t("sharedLibrary.reject")}</button>
              </div>
            </article>
          ))}
        </div>
      )}
    </div>
  );
}
