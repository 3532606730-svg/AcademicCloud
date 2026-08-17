import { useEffect, useRef, useState, type FormEvent } from "react";

import type { AcademicCloudApi, Announcement, AnnouncementInput } from "./api.ts";
import { describeError, formatDate } from "./i18n.ts";
import { useLanguage } from "./i18n-react.tsx";

export function AnnouncementFeed({
  api,
  revision,
}: {
  api: AcademicCloudApi;
  revision: number;
}) {
  const { language, t } = useLanguage();
  const [announcements, setAnnouncements] = useState<Announcement[]>([]);
  const [error, setError] = useState<unknown>(null);
  const [retry, setRetry] = useState(0);

  useEffect(() => {
    const controller = new AbortController();
    setError(null);
    api.listAnnouncements(controller.signal).then(
      setAnnouncements,
      (caught: unknown) => {
        if (!(caught instanceof DOMException && caught.name === "AbortError")) setError(caught);
      },
    );
    return () => controller.abort();
  }, [api, retry, revision]);

  if (error !== null) {
    return (
      <div className="alert alert--error announcement-feed-error" role="alert">
        {describeError(error, language)}
        <button type="button" onClick={() => setRetry((value) => value + 1)}>{t("announcements.retry")}</button>
      </div>
    );
  }
  if (announcements.length === 0) return null;

  return (
    <section className="announcement-feed" aria-labelledby="announcement-feed-title">
      <h2 id="announcement-feed-title" className="visually-hidden">{t("announcements.current")}</h2>
      {announcements.map((announcement) => (
        <article
          key={announcement.id}
          className={`announcement announcement--${announcement.severity}`}
          aria-label={t("announcements.itemAria", { severity: t(severityKey(announcement.severity)), title: announcement.title })}
        >
          <div className="announcement-heading">
            <span className="announcement-severity">{t(severityKey(announcement.severity))}</span>
            <h3>{announcement.title}</h3>
          </div>
          <p>{announcement.body}</p>
          {announcement.linkUrl !== null && (
            <a href={announcement.linkUrl} target="_blank" rel="noopener noreferrer">{t("announcements.openLink")}</a>
          )}
        </article>
      ))}
    </section>
  );
}

const EMPTY_INPUT: AnnouncementInput = {
  title: "",
  body: "",
  severity: "info",
  linkUrl: null,
  expiresAt: null,
};

function severityKey(severity: Announcement["severity"]) {
  switch (severity) {
    case "info": return "announcements.info" as const;
    case "warning": return "announcements.warning" as const;
    case "critical": return "announcements.critical" as const;
  }
}

function toLocalDateTime(iso: string | null): string {
  if (iso === null) return "";
  const date = new Date(iso);
  const local = new Date(date.getTime() - date.getTimezoneOffset() * 60_000);
  return local.toISOString().slice(0, 16);
}

function toIsoDateTime(local: string): string | null {
  if (!local) return null;
  const date = new Date(local);
  return Number.isFinite(date.getTime()) ? date.toISOString() : null;
}

function sortAnnouncements(items: Announcement[]): Announcement[] {
  return [...items].sort((left, right) =>
    right.updatedAt.localeCompare(left.updatedAt) || left.id.localeCompare(right.id));
}

export function AnnouncementAdministrationDialog({
  api,
  onClose,
  onChanged,
}: {
  api: AcademicCloudApi;
  onClose: () => void;
  onChanged: () => void;
}) {
  const { language, t } = useLanguage();
  const [announcements, setAnnouncements] = useState<Announcement[]>([]);
  const [form, setForm] = useState<AnnouncementInput>(EMPTY_INPUT);
  const [editingId, setEditingId] = useState<string | null>(null);
  const [loading, setLoading] = useState(true);
  const [busyId, setBusyId] = useState<string | null>(null);
  const [error, setError] = useState<unknown>(null);
  const dialogRef = useRef<HTMLDialogElement>(null);
  const onCloseRef = useRef(onClose);
  const busyRef = useRef(busyId !== null);
  onCloseRef.current = onClose;
  busyRef.current = busyId !== null;

  useEffect(() => {
    const dialog = dialogRef.current;
    if (!dialog) return;
    const previousFocus = document.activeElement instanceof HTMLElement ? document.activeElement : null;
    const handleCancel = (event: Event) => {
      event.preventDefault();
      if (!busyRef.current) onCloseRef.current();
    };
    const fallbackKeys = (event: KeyboardEvent) => {
      if (event.key === "Escape" && !busyRef.current) {
        event.preventDefault();
        onCloseRef.current();
        return;
      }
      if (event.key !== "Tab") return;
      const focusable = Array.from(dialog.querySelectorAll<HTMLElement>(
        "a[href], button:not([disabled]), input:not([disabled]), textarea:not([disabled]), select:not([disabled]), [tabindex]:not([tabindex='-1'])",
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
    dialog.addEventListener("cancel", handleCancel);
    if (typeof dialog.showModal === "function") {
      dialog.showModal();
    } else {
      dialog.setAttribute("open", "");
      document.addEventListener("keydown", fallbackKeys);
      dialog.querySelector<HTMLElement>("input:not([disabled]), button:not([disabled])")?.focus();
    }
    return () => {
      dialog.removeEventListener("cancel", handleCancel);
      document.removeEventListener("keydown", fallbackKeys);
      if (dialog.open && typeof dialog.close === "function") dialog.close();
      previousFocus?.focus();
    };
  }, []);

  useEffect(() => {
    let live = true;
    api.listAllAnnouncements().then(
      (items) => { if (live) setAnnouncements(items); },
      (caught: unknown) => { if (live) setError(caught); },
    ).finally(() => { if (live) setLoading(false); });
    return () => { live = false; };
  }, [api]);

  function startCreate() {
    setEditingId(null);
    setForm(EMPTY_INPUT);
    setError(null);
  }

  function startEdit(announcement: Announcement) {
    setEditingId(announcement.id);
    setForm({
      title: announcement.title,
      body: announcement.body,
      severity: announcement.severity,
      linkUrl: announcement.linkUrl,
      expiresAt: announcement.expiresAt,
    });
    setError(null);
  }

  function replace(updated: Announcement) {
    setAnnouncements((current) => sortAnnouncements([updated, ...current.filter((item) => item.id !== updated.id)]));
    onChanged();
  }

  async function submit(event: FormEvent<HTMLFormElement>) {
    event.preventDefault();
    setBusyId(editingId ?? "create");
    setError(null);
    try {
      const updated = editingId === null
        ? await api.createAnnouncement(form)
        : await api.updateAnnouncement(editingId, form);
      replace(updated);
      startCreate();
    } catch (caught: unknown) {
      setError(caught);
    } finally {
      setBusyId(null);
    }
  }

  async function changePublication(announcement: Announcement) {
    setBusyId(`publication-${announcement.id}`);
    setError(null);
    try {
      replace(announcement.isActive
        ? await api.unpublishAnnouncement(announcement.id)
        : await api.publishAnnouncement(announcement.id));
    } catch (caught: unknown) {
      setError(caught);
    } finally {
      setBusyId(null);
    }
  }

  return (
    <dialog ref={dialogRef} className="announcement-administration-modal" aria-labelledby="announcement-administration-title">
      <header>
        <h2 id="announcement-administration-title">{t("announcements.manage")}</h2>
        <button className="button button--quiet" type="button" onClick={onClose} disabled={busyId !== null} aria-label={t("announcements.closeAria")}>{t("preview.close")}</button>
      </header>
      <div className="announcement-administration-body">
        {error !== null && <div className="alert alert--error" role="alert">{describeError(error, language)}</div>}
        <form className="announcement-form" onSubmit={(event) => void submit(event)}>
          <div className="announcement-form-heading">
            <h3>{editingId === null ? t("announcements.create") : t("announcements.edit")}</h3>
            {editingId !== null && <button className="button button--quiet button--small" type="button" disabled={busyId !== null} onClick={startCreate}>{t("announcements.cancelEdit")}</button>}
          </div>
          <label htmlFor="announcement-title">{t("announcements.title")}</label>
          <input id="announcement-title" maxLength={200} required value={form.title} onChange={(event) => setForm((current) => ({ ...current, title: event.target.value }))} />
          <label htmlFor="announcement-body">{t("announcements.body")}</label>
          <textarea id="announcement-body" maxLength={4000} required rows={5} value={form.body} onChange={(event) => setForm((current) => ({ ...current, body: event.target.value }))} />
          <div className="announcement-form-grid">
            <label htmlFor="announcement-severity">
              {t("announcements.severity")}
              <select id="announcement-severity" value={form.severity} onChange={(event) => setForm((current) => ({ ...current, severity: event.target.value as Announcement["severity"] }))}>
                <option value="info">{t("announcements.info")}</option>
                <option value="warning">{t("announcements.warning")}</option>
                <option value="critical">{t("announcements.critical")}</option>
              </select>
            </label>
            <label htmlFor="announcement-expires">
              {t("announcements.expiresAt")}
              <input id="announcement-expires" type="datetime-local" value={toLocalDateTime(form.expiresAt)} onChange={(event) => setForm((current) => ({ ...current, expiresAt: toIsoDateTime(event.target.value) }))} />
            </label>
          </div>
          <label htmlFor="announcement-link">{t("announcements.link")}</label>
          <input id="announcement-link" type="url" inputMode="url" placeholder="https://" value={form.linkUrl ?? ""} onChange={(event) => setForm((current) => ({ ...current, linkUrl: event.target.value || null }))} />
          <button className="button button--primary" type="submit" disabled={busyId !== null}>{editingId === null ? t("announcements.create") : t("announcements.save")}</button>
        </form>

        <section aria-labelledby="announcement-list-title">
          <h3 id="announcement-list-title">{t("announcements.all")}</h3>
          {loading ? <p aria-busy="true">{t("shared.loadingItems")}</p> : announcements.length === 0 ? (
            <p className="account-administration-empty">{t("announcements.none")}</p>
          ) : (
            <div className="announcement-administration-list">
              {announcements.map((announcement) => (
                <article className="announcement-administration-row" key={announcement.id}>
                  <div>
                    <strong>{announcement.title}</strong>
                    <span>{t(severityKey(announcement.severity))} · {announcement.isActive ? t("announcements.active") : t("announcements.inactive")}</span>
                    {announcement.publishedAt && <span>{t("announcements.published", { date: formatDate(announcement.publishedAt, language) })}</span>}
                    {announcement.expiresAt && <span>{t("announcements.expires", { date: formatDate(announcement.expiresAt, language) })}</span>}
                  </div>
                  <div className="announcement-row-actions">
                    <button className="button button--small" type="button" disabled={busyId !== null} onClick={() => startEdit(announcement)}>{t("announcements.edit")}</button>
                    <button className={announcement.isActive ? "button button--small button--danger" : "button button--small"} type="button" disabled={busyId !== null} onClick={() => void changePublication(announcement)}>
                      {announcement.isActive ? t("announcements.unpublish") : t("announcements.publish")}
                    </button>
                  </div>
                </article>
              ))}
            </div>
          )}
        </section>
      </div>
    </dialog>
  );
}
