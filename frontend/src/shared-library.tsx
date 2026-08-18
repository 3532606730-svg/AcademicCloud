import { useEffect, useMemo, useState } from "react";

import type { AcademicCloudApi, LibraryContribution, LibraryHolding, LibrarySummary } from "./api.ts";
import { describeError } from "./i18n.ts";
import { useLanguage } from "./i18n-react.tsx";

function formatBytes(bytes: number): string {
  if (bytes < 1024) return `${bytes} B`;
  if (bytes < 1024 * 1024) return `${Math.round(bytes / 1024)} KB`;
  return `${(bytes / (1024 * 1024)).toFixed(1)} MB`;
}

function preferredLibrary(libraries: LibrarySummary[]): LibrarySummary | null {
  return libraries.find((library) => library.isDefault) ?? libraries[0] ?? null;
}

/**
 * The normal Library surface. RF-SHAREDDEFAULT01 makes the default Library
 * the canonical corpus; this component therefore presents holdings directly
 * instead of exposing a second top-level "Shared Library" product chooser.
 */
export function SharedLibraryPanel({ api, revision = 0 }: { api: AcademicCloudApi; revision?: number }) {
  const { language, t } = useLanguage();
  const [library, setLibrary] = useState<LibrarySummary | null>(null);
  const [holdings, setHoldings] = useState<LibraryHolding[]>([]);
  const [contributions, setContributions] = useState<LibraryContribution[]>([]);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState<unknown>(null);
  const [busy, setBusy] = useState(false);

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
    if (!library) {
      setHoldings([]);
      setContributions([]);
      return;
    }
    let cancelled = false;
    setLoading(true);
    setError(null);
    Promise.all([
      api.listLibraryHoldings(library.id),
      library.role === "manager" ? Promise.resolve([]) : api.listMyLibraryContributions(library.id),
    ]).then(([nextHoldings, nextContributions]) => {
      if (cancelled) return;
      setHoldings(nextHoldings);
      setContributions(nextContributions);
    }, (caught) => {
      if (!cancelled) setError(caught);
    }).finally(() => {
      if (!cancelled) setLoading(false);
    });
    return () => { cancelled = true; };
  }, [api, library, revision]);

  async function openHolding(holding: LibraryHolding, disposition: "attachment" | "inline") {
    if (!library) return;
    setBusy(true);
    setError(null);
    try {
      const authorization = await api.createLibraryDownload(library.id, holding.file.id, disposition);
      window.open(authorization.url, "_blank", "noopener,noreferrer");
    } catch (caught) {
      setError(caught);
    } finally {
      setBusy(false);
    }
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
    <section className="shared-library-panel" aria-labelledby="library-holdings-title">
      <div className="library-catalogue-heading">
        <div>
          <h2 id="library-holdings-title">{t("sharedLibrary.holdings")}</h2>
          {library && <p>{t("sharedLibrary.canonicalSummary")}</p>}
        </div>
        {!loading && library && <span>{t("sharedLibrary.holdingCount", { count: holdings.length })}</span>}
      </div>
      {error !== null && <div className="alert alert--error" role="alert">{describeError(error, language)} <button type="button" onClick={() => setError(null)}>{t("alert.dismiss")}</button></div>}
      {loading ? <p role="status">{t("sharedLibrary.loading")}</p> : !library ? (
        <p className="shared-library-empty">{t("sharedLibrary.empty")}</p>
      ) : holdings.length === 0 ? (
        <p className="shared-library-empty">{t("sharedLibrary.noHoldings")}</p>
      ) : (
        <div className="shared-library-holdings" aria-label={t("sharedLibrary.holdingsAria")}>
          {holdings.map((holding) => (
            <article className="shared-library-holding" key={holding.artifactId}>
              <div><strong>{holding.file.displayName}</strong><span>{holding.recordLabel} · {formatBytes(holding.file.sizeBytes)}</span></div>
              <div className="shared-library-actions">
                <button className="button button--small" type="button" disabled={busy} onClick={() => void openHolding(holding, "inline")}>{t("menu.preview")}</button>
                <button className="button button--small button--quiet" type="button" disabled={busy} onClick={() => void openHolding(holding, "attachment")}>{t("menu.download")}</button>
              </div>
            </article>
          ))}
        </div>
      )}
      {library?.role !== "manager" && contributions.length > 0 && (
        <section className="shared-library-members" aria-labelledby="shared-library-my-contributions-title">
          <div className="section-heading"><h3 id="shared-library-my-contributions-title">{t("sharedLibrary.myContributions")}</h3><span>{contributions.length}</span></div>
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
    </section>
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
