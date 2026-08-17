import { useEffect, useRef, useState } from "react";

import {
  type AcademicCloudApi,
  type AuditEvent,
  type AuditEventKind,
  type AuditOutcome,
  type AuditReasonCode,
} from "./api.ts";
import { describeError, formatDate } from "./i18n.ts";
import { useLanguage } from "./i18n-react.tsx";

const ACTION_LABELS: Record<AuditEventKind, [string, string]> = {
  "auth.login": ["Sign in", "登录"],
  "auth.logout": ["Sign out", "退出登录"],
  "auth.password_change": ["Password change", "修改密码"],
  "accounts.owner_bootstrap": ["Owner bootstrap", "初始化所有者"],
  "accounts.register": ["Account registration", "账户注册"],
  "accounts.invitation_create": ["Invitation created", "创建邀请"],
  "accounts.invitation_revoke": ["Invitation revoked", "撤销邀请"],
  "accounts.member_state_change": ["Member state change", "成员状态变更"],
  "announcements.create": ["Announcement created", "创建公告"],
  "announcements.edit": ["Announcement edited", "编辑公告"],
  "announcements.publish": ["Announcement published", "发布公告"],
  "announcements.unpublish": ["Announcement unpublished", "取消发布公告"],
  "announcements.delete": ["Announcement deleted", "删除公告"],
  "libraries.create": ["Shared library created", "创建共享资料库"],
  "libraries.membership_add": ["Library member added", "添加资料库成员"],
  "libraries.membership_change": ["Library member changed", "变更资料库成员"],
  "libraries.membership_remove": ["Library member removed", "移除资料库成员"],
  "libraries.contribution_submit": ["Contribution submitted", "提交贡献"],
  "libraries.contribution_approve": ["Contribution approved", "批准贡献"],
  "libraries.contribution_reject": ["Contribution rejected", "拒绝贡献"],
  "libraries.contribution_withdraw": ["Contribution withdrawn", "撤回贡献"],
  "drive.upload_activate": ["Upload activated", "激活上传"],
  "drive.folder_recycle": ["Folder recycled", "回收文件夹"],
  "drive.folder_restore": ["Folder restored", "恢复文件夹"],
  "drive.file_recycle": ["File recycled", "回收文件"],
  "drive.file_restore": ["File restored", "恢复文件"],
  "drive.file_purge_request": ["Permanent deletion requested", "请求永久删除"],
  "drive.file_purge_complete": ["Permanent deletion completed", "完成永久删除"],
};

const OUTCOME_LABELS: Record<AuditOutcome, [string, string]> = {
  succeeded: ["Succeeded", "成功"],
  denied: ["Denied", "拒绝"],
  failed: ["Failed", "失败"],
  busy: ["Busy", "繁忙"],
};

const REASON_LABELS: Record<AuditReasonCode, [string, string]> = {
  invalid_credentials: ["Invalid credentials", "凭据无效"],
  invalid_current_password: ["Invalid current password", "当前密码无效"],
  password_change_conflict: ["Password change conflict", "修改密码冲突"],
  password_unchanged: ["Password unchanged", "密码未改变"],
  invalid_invitation: ["Invalid invitation", "邀请无效"],
  login_unavailable: ["Login unavailable", "登录不可用"],
  authorization_denied: ["Authorization denied", "授权拒绝"],
  not_found: ["Not found", "未找到"],
  invalid_target: ["Invalid target", "目标无效"],
  invalid_state: ["Invalid state", "状态无效"],
  invalid_input: ["Invalid input", "输入无效"],
  rate_limit_exceeded: ["Rate limit exceeded", "超过频率限制"],
  kdf_overloaded: ["Password protection busy", "密码保护繁忙"],
  storage_unavailable: ["Storage unavailable", "存储不可用"],
  upload_incomplete: ["Upload incomplete", "上传未完成"],
  upload_metadata_mismatch: ["Upload metadata mismatch", "上传元数据不匹配"],
  name_conflict: ["Name conflict", "名称冲突"],
  concurrent_change: ["Concurrent change", "并发变更"],
};

function label(pair: [string, string], language: "en" | "zh-CN"): string {
  return language === "zh-CN" ? pair[1] : pair[0];
}

function useAuditDialog(onClose: () => void) {
  const dialogRef = useRef<HTMLDialogElement>(null);
  const onCloseRef = useRef(onClose);
  onCloseRef.current = onClose;
  useEffect(() => {
    const dialog = dialogRef.current;
    if (!dialog) return;
    const previousFocus = document.activeElement instanceof HTMLElement ? document.activeElement : null;
    const cancel = (event: Event) => {
      event.preventDefault();
      onCloseRef.current();
    };
    const fallbackKeys = (event: KeyboardEvent) => {
      if (event.key === "Escape") {
        event.preventDefault();
        onCloseRef.current();
        return;
      }
      if (event.key !== "Tab") return;
      const focusable = Array.from(dialog.querySelectorAll<HTMLElement>(
        "a[href], button:not([disabled]), input:not([disabled]), [tabindex]:not([tabindex='-1'])",
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
    if (typeof dialog.showModal === "function") {
      dialog.showModal();
    } else {
      dialog.setAttribute("open", "");
      document.addEventListener("keydown", fallbackKeys);
      dialog.querySelector<HTMLElement>("button:not([disabled])")?.focus();
    }
    return () => {
      dialog.removeEventListener("cancel", cancel);
      document.removeEventListener("keydown", fallbackKeys);
      if (dialog.open && typeof dialog.close === "function") dialog.close();
      previousFocus?.focus();
    };
  }, []);
  return dialogRef;
}

function eventTarget(event: AuditEvent): string {
  if (!event.targetKind || !event.targetId) return "—";
  return `${event.targetKind} · ${event.targetId}`;
}

export function AuditDialog({ api, onClose }: { api: AcademicCloudApi; onClose: () => void }) {
  const { language, t } = useLanguage();
  const dialogRef = useAuditDialog(onClose);
  const [events, setEvents] = useState<AuditEvent[]>([]);
  const [nextBeforeId, setNextBeforeId] = useState<number | null>(null);
  const [loading, setLoading] = useState(true);
  const [loadingOlder, setLoadingOlder] = useState(false);
  const [error, setError] = useState<unknown>(null);

  async function load(beforeId?: number, append = false) {
    if (append) setLoadingOlder(true);
    else setLoading(true);
    setError(null);
    try {
      const page = await api.listAuditEvents(beforeId, 50);
      setEvents((current) => append ? [...current, ...page.events] : page.events);
      setNextBeforeId(page.nextBeforeId);
    } catch (caught: unknown) {
      setError(caught);
    } finally {
      if (append) setLoadingOlder(false);
      else setLoading(false);
    }
  }

  useEffect(() => { void load(); }, [api]);

  return (
    <dialog ref={dialogRef} className="audit-modal" aria-labelledby="audit-title">
      <header>
        <h2 id="audit-title">{t("audit.title")}</h2>
        <button className="button button--quiet" type="button" onClick={onClose} aria-label={t("audit.closeAria")}>
          {t("preview.close")}
        </button>
      </header>
      <div className="audit-body">
        {error !== null && (
          <div className="alert alert--error" role="alert">
            <span>{t("audit.error")} {describeError(error, language)}</span>
            <button className="button button--small" type="button" onClick={() => void load()}>{t("audit.retry")}</button>
          </div>
        )}
        {loading ? <p className="audit-state" role="status">{t("audit.loading")}</p> : error !== null && events.length === 0 ? null : events.length === 0 ? (
          <p className="audit-state">{t("audit.empty")}</p>
        ) : (
          <div className="audit-table-wrap">
            <table className="audit-table">
              <thead><tr>
                <th scope="col">{t("audit.time")}</th>
                <th scope="col">{t("audit.action")}</th>
                <th scope="col">{t("audit.outcome")}</th>
                <th scope="col">{t("audit.actor")}</th>
                <th scope="col">{t("audit.target")}</th>
                <th scope="col">{t("audit.reason")}</th>
              </tr></thead>
              <tbody>{events.map((event) => (
                <tr key={event.id}>
                  <td><time dateTime={event.occurredAt}>{formatDate(event.occurredAt, language)}</time></td>
                  <td>{label(ACTION_LABELS[event.action] ?? [event.action, event.action], language)}</td>
                  <td><span className={`audit-outcome audit-outcome--${event.outcome}`}>{label(OUTCOME_LABELS[event.outcome], language)}</span></td>
                  <td>{event.actorKind === "account" ? `account · ${event.actorAccountId}` : label(event.actorKind === "system" ? ["System", "系统"] : ["Anonymous", "匿名"], language)}</td>
                  <td>{eventTarget(event)}</td>
                  <td>{event.reason ? label(REASON_LABELS[event.reason] ?? [event.reason, event.reason], language) : "—"}</td>
                </tr>
              ))}</tbody>
            </table>
          </div>
        )}
        {!loading && nextBeforeId !== null && (
          <button className="button button--quiet audit-load-older" type="button" disabled={loadingOlder} onClick={() => void load(nextBeforeId, true)}>
            {loadingOlder ? t("audit.loading") : t("audit.loadOlder")}
          </button>
        )}
      </div>
    </dialog>
  );
}
