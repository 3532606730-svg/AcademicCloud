import { useEffect, useMemo, useState } from "react";

import type { AcademicCloudApi, LibraryHolding, LibraryMember, LibraryRole, LibrarySummary } from "./api.ts";
import { describeError } from "./i18n.ts";
import { useLanguage } from "./i18n-react.tsx";

function formatBytes(bytes: number): string {
  if (bytes < 1024) return `${bytes} B`;
  if (bytes < 1024 * 1024) return `${Math.round(bytes / 1024)} KB`;
  return `${(bytes / (1024 * 1024)).toFixed(1)} MB`;
}

export function SharedLibraryPanel({ api }: { api: AcademicCloudApi }) {
  const { t } = useLanguage();
  const [libraries, setLibraries] = useState<LibrarySummary[]>([]);
  const [selectedId, setSelectedId] = useState<string | null>(null);
  const [holdings, setHoldings] = useState<LibraryHolding[]>([]);
  const [members, setMembers] = useState<LibraryMember[]>([]);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState<unknown>(null);
  const [busy, setBusy] = useState(false);

  const selected = useMemo(() => libraries.find((library) => library.id === selectedId) ?? null, [libraries, selectedId]);

  useEffect(() => {
    let cancelled = false;
    setLoading(true);
    setError(null);
    api.listLibraries().then((items) => {
      if (cancelled) return;
      setLibraries(items);
      setSelectedId((current) => current && items.some((item) => item.id === current) ? current : items[0]?.id ?? null);
    }, (caught) => {
      if (!cancelled) setError(caught);
    }).finally(() => {
      if (!cancelled) setLoading(false);
    });
    return () => { cancelled = true; };
  }, [api]);

  useEffect(() => {
    if (!selectedId) {
      setHoldings([]);
      setMembers([]);
      return;
    }
    let cancelled = false;
    setLoading(true);
    Promise.all([
      api.listLibraryHoldings(selectedId),
      selected?.role === "manager" ? api.listLibraryMembers(selectedId) : Promise.resolve([]),
    ]).then(([nextHoldings, nextMembers]) => {
      if (cancelled) return;
      setHoldings(nextHoldings);
      setMembers(nextMembers);
    }, (caught) => {
      if (!cancelled) setError(caught);
    }).finally(() => {
      if (!cancelled) setLoading(false);
    });
    return () => { cancelled = true; };
  }, [api, selectedId, selected?.role]);

  async function createLibrary() {
    const name = window.prompt(t("sharedLibrary.createPrompt"))?.trim();
    if (!name) return;
    setBusy(true);
    setError(null);
    try {
      const library = await api.createLibrary(name);
      setLibraries((current) => [...current, library]);
      setSelectedId(library.id);
    } catch (caught) {
      setError(caught);
    } finally {
      setBusy(false);
    }
  }

  async function refreshMembers() {
    if (!selectedId || selected?.role !== "manager") return;
    setMembers(await api.listLibraryMembers(selectedId));
  }

  async function addMember() {
    if (!selectedId || selected?.role !== "manager") return;
    const accountId = window.prompt(t("sharedLibrary.memberIdPrompt"))?.trim();
    if (!accountId) return;
    setBusy(true);
    try {
      await api.addLibraryMember(selectedId, accountId, "member");
      await refreshMembers();
    } catch (caught) {
      setError(caught);
    } finally {
      setBusy(false);
    }
  }

  async function changeRole(member: LibraryMember, role: LibraryRole) {
    if (!selectedId || role === member.role) return;
    setBusy(true);
    try {
      await api.changeLibraryMemberRole(selectedId, member.accountId, role);
      await refreshMembers();
    } catch (caught) {
      setError(caught);
    } finally {
      setBusy(false);
    }
  }

  async function removeMember(member: LibraryMember) {
    if (!selectedId || !window.confirm(t("sharedLibrary.removeConfirm", { name: member.loginName ?? member.accountId }))) return;
    setBusy(true);
    try {
      await api.removeLibraryMember(selectedId, member.accountId);
      await refreshMembers();
    } catch (caught) {
      setError(caught);
    } finally {
      setBusy(false);
    }
  }

  async function openHolding(holding: LibraryHolding, disposition: "attachment" | "inline") {
    if (!selectedId) return;
    setBusy(true);
    setError(null);
    try {
      const authorization = await api.createLibraryDownload(selectedId, holding.file.id, disposition);
      window.open(authorization.url, "_blank", "noopener,noreferrer");
    } catch (caught) {
      setError(caught);
    } finally {
      setBusy(false);
    }
  }

  return (
    <section className="shared-library-panel" aria-labelledby="shared-library-title">
      <div className="shared-library-layout">
        <aside className="shared-library-list" aria-label={t("sharedLibrary.listAria")}>
          <div className="section-heading">
            <h2 id="shared-library-title">{t("nav.sharedLibrary")}</h2>
            <button className="button button--small" type="button" onClick={() => void createLibrary()} disabled={busy}>{t("sharedLibrary.create")}</button>
          </div>
          {loading && libraries.length === 0 ? <p role="status">{t("sharedLibrary.loading")}</p> : libraries.length === 0 ? <p>{t("sharedLibrary.empty")}</p> : (
            <div className="shared-library-library-buttons">
              {libraries.map((library) => (
                <button key={library.id} type="button" className={library.id === selectedId ? "shared-library-library is-active" : "shared-library-library"} onClick={() => setSelectedId(library.id)}>
                  <strong>{library.name}</strong><span>{library.role}</span>
                </button>
              ))}
            </div>
          )}
        </aside>
        <div className="shared-library-content">
          {error !== null && <div className="alert alert--error" role="alert">{describeError(error, "en")} <button type="button" onClick={() => setError(null)}>{t("alert.dismiss")}</button></div>}
          {!selected ? <p className="shared-library-empty">{t("sharedLibrary.selectPrompt")}</p> : (
            <>
              <header className="section-heading">
                <div><h3>{selected.name}</h3><span>{t("sharedLibrary.role", { role: selected.role })}</span></div>
                <span>{t("sharedLibrary.holdingCount", { count: holdings.length })}</span>
              </header>
              {loading ? <p role="status">{t("sharedLibrary.loading")}</p> : holdings.length === 0 ? <p className="shared-library-empty">{t("sharedLibrary.noHoldings")}</p> : (
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
              {selected.role === "manager" && (
                <section className="shared-library-members" aria-labelledby="shared-library-members-title">
                  <div className="section-heading"><h3 id="shared-library-members-title">{t("sharedLibrary.members")}</h3><button className="button button--small" type="button" onClick={() => void addMember()} disabled={busy}>{t("sharedLibrary.addMember")}</button></div>
                  <div className="shared-library-member-list">
                    {members.map((member) => (
                      <div className="shared-library-member" key={member.accountId}>
                        <span><strong>{member.loginName ?? member.accountId}</strong><small>{member.state}</small></span>
                        <select value={member.role} disabled={busy} onChange={(event) => void changeRole(member, event.target.value as LibraryRole)} aria-label={t("sharedLibrary.roleFor", { name: member.loginName ?? member.accountId })}>
                          <option value="manager">{t("sharedLibrary.manager")}</option><option value="member">{t("sharedLibrary.member")}</option>
                        </select>
                        <button className="button button--small button--quiet" type="button" disabled={busy} onClick={() => void removeMember(member)}>{t("sharedLibrary.remove")}</button>
                      </div>
                    ))}
                  </div>
                </section>
              )}
            </>
          )}
        </div>
      </div>
    </section>
  );
}
