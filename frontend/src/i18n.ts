// Typed internal localization layer. Supported languages: zh-CN and en.
// Selection: a previously saved choice wins; otherwise navigator.language
// starting with "zh" selects zh-CN and everything else selects en.
//
// Zero-descriptive-copy policy: every visible string must identify an
// object/place, label an input, expose an action, report current state,
// report an actionable error, or request confirmation for a consequential
// action. Marketing prose, onboarding copy, and decorative claims are
// forbidden (ARIA-only names may stay functional).
export type Language = "zh-CN" | "en";

export const LANGUAGE_STORAGE_KEY = "academiccloud.language";

const EN = {
  // login / shell
  "app.loading": "Opening your library…",
  "login.nameLabel": "Login name",
  "login.passwordLabel": "Password",
  "login.submitting": "Signing in…",
  "login.submit": "Sign in",
  "registration.title": "Create account",
  "registration.confirmPassword": "Confirm password",
  "registration.submitting": "Creating account…",
  "registration.submit": "Create account",
  "registration.cancel": "Back to sign in",
  "session.expired": "Your session expired. Please sign in again.",
  // topbar / navigation
  "nav.skip": "Skip to files",
  "nav.signOut": "Sign out",
  "nav.library": "Library",
  "nav.pending": "Pending",
  "nav.recycle": "Recycle",
  "nav.favorites": "Favorites",
  "nav.backAria": "Back to {name}",
  "nav.primaryAria": "Primary navigation",
  "account.menuAria": "Account menu",
  "account.menuLabel": "Account",
  "account.manage": "Manage accounts",
  "password.change": "Change password",
  "password.closeAria": "Close password change",
  "password.current": "Current password",
  "password.new": "New password",
  "password.confirm": "Confirm new password",
  "password.cancel": "Cancel",
  "password.save": "Change password",
  "password.saving": "Changing password…",
  "accounts.title": "Account administration",
  "accounts.closeAria": "Close account administration",
  "accounts.members": "Accounts",
  "accounts.owner": "Owner",
  "accounts.member": "Member",
  "accounts.active": "Active",
  "accounts.disabled": "Disabled",
  "accounts.disable": "Disable",
  "accounts.enable": "Enable",
  "accounts.invitations": "Invitations",
  "accounts.createInvitation": "Create invitation",
  "accounts.oneTimeLink": "One-time invitation link",
  "accounts.dismissLink": "Dismiss link",
  "accounts.noInvitations": "No invitations",
  "accounts.invitationAvailable": "Available",
  "accounts.invitationExpired": "Expired",
  "accounts.invitationConsumed": "Used",
  "accounts.invitationRevoked": "Revoked",
  "accounts.expires": "Expires {date}",
  "accounts.revoke": "Revoke",
  "announcements.manage": "Manage announcements",
  "announcements.closeAria": "Close announcement administration",
  "announcements.current": "Current announcements",
  "announcements.itemAria": "{severity} announcement: {title}",
  "announcements.openLink": "Open link",
  "announcements.retry": "Retry",
  "announcements.info": "Information",
  "announcements.warning": "Warning",
  "announcements.critical": "Critical",
  "announcements.create": "Create announcement",
  "announcements.edit": "Edit",
  "announcements.cancelEdit": "Cancel edit",
  "announcements.save": "Save",
  "announcements.title": "Title",
  "announcements.body": "Body",
  "announcements.severity": "Severity",
  "announcements.expiresAt": "Expires at",
  "announcements.link": "Link",
  "announcements.all": "Announcements",
  "announcements.none": "No announcements",
  "announcements.active": "Published",
  "announcements.inactive": "Unpublished",
  "announcements.published": "Published {date}",
  "announcements.expires": "Expires {date}",
  "announcements.publish": "Publish",
  "announcements.unpublish": "Unpublish",
  "audit.manage": "Governance audit",
  "audit.title": "Governance and security audit",
  "audit.closeAria": "Close governance audit",
  "audit.empty": "No governance events",
  "audit.loadOlder": "Load older events",
  "audit.loading": "Loading audit events…",
  "audit.error": "Could not load audit events.",
  "audit.retry": "Retry",
  "audit.time": "Time",
  "audit.action": "Action",
  "audit.outcome": "Outcome",
  "audit.actor": "Actor",
  "audit.target": "Target",
  "audit.reason": "Reason",
  "language.label": "Language",
  // workspace
  "workspace.uploadFiles": "Upload files",
  "workspace.itemSummary": "{files} files · {folders} folders",
  "workspace.newFolder": "New folder",
  "breadcrumb.aria": "Breadcrumb",
  "alert.dismiss": "Dismiss",
  // row action menu
  "menu.openAria": "Open actions for {name}",
  "menu.aria": "Actions for {name}",
  "menu.trash": "Move to trash",
  "menu.preview": "Preview",
  "menu.download": "Download",
  "menu.rename": "Rename",
  "menu.move": "Move",
  "menu.previewAria": "Preview {name}",
  "menu.downloadAria": "Download {name}",
  "menu.renameFolderAria": "Rename folder {name}",
  "menu.moveFolderAria": "Move folder {name}",
  "menu.trashFolderAria": "Move folder {name} to trash",
  "menu.renameFileAria": "Rename file {name}",
  "menu.moveFileAria": "Move file {name}",
  "menu.trashFileAria": "Move file {name} to trash",
  // favorites
  "favorites.emptyTitle": "No favorites yet",
  "fav.addAria": "Add {name} to favorites",
  "fav.removeAria": "Remove {name} from favorites",
  // new folder dialog
  "folder.dialogTitle": "New folder",
  "folder.cancel": "Cancel",
  "folder.closeAria": "Close new folder dialog",
  // drag & drop
  "drop.aria": "File drop overlay",
  "drop.title": "Drop to upload to “{folder}”",
  "drop.count": "{count} files",
  "drop.directorySkipped": "{count} folders were skipped.",
  "drop.notUploaded": "Not uploaded.",
  "upload.enqueuedCount": "{count} files added to the upload queue.",
  // upload queue
  "upload.queueTitle": "Upload activity",
  "upload.queueSummary": "{count} in progress or needing attention",
  "upload.progressAria": "{name} upload progress",
  "upload.retry": "Retry",
  "upload.verifyRetryAria": "Verify stored copy or retry {name}",
  "upload.dismissAria": "Dismiss {name} upload status",
  "upload.cancel": "Cancel",
  "upload.cancelAria": "Cancel {name} upload",
  "upload.emptyFile": "Empty files cannot be uploaded.",
  "upload.sameFileMismatch": "Choose the same file originally reserved for this pending upload.",
  "upload.uploaded": "Uploaded “{name}”.",
  "upload.speedEta": "{speed} · {eta}",
  "upload.etaSeconds": "About {seconds} sec remaining",
  // upload phases
  "phase.queued": "Queued",
  "phase.checksum": "Calculating checksum",
  "phase.reserving": "Requesting secure upload",
  "phase.uploading": "Sending to object storage",
  "phase.verifying": "Verifying stored file",
  "phase.complete": "Complete",
  "phase.error": "Needs attention",
  "phase.cancelled": "Cancelled",
  // folders / files
  "folder.newLabel": "New folder",
  "folder.create": "Create",
  "folder.created": "Created “{name}”.",
  "folder.renamed": "Folder renamed.",
  "folder.moved": "Folder moved to the recycle bin.",
  "folder.moveConfirm": "Move “{name}” and its active contents to the recycle bin?",
  "folder.promptRename": "New folder name",
  "folder.contentsTitle": "Contents",
  "folder.items": "{count} items",
  "folder.emptyTitle": "This folder is empty",
  "folder.kind": "Folder",
  "file.kindPdf": "PDF",
  "file.kindImage": "Image",
  "file.kindText": "Text",
  "file.kindFile": "File",
  "file.promptRename": "New file name",
  "file.renamed": "File renamed.",
  "file.moved": "File moved.",
  "file.recycleConfirm": "Move “{name}” to the recycle bin?",
  "file.recycled": "File moved to the recycle bin.",
  "file.restored": "File restored.",
  "file.downloadOpened": "Download started.",
  "file.permanentDeleted": "File permanently deleted.",
  "file.permanentConfirm": "Permanently delete “{name}”? This removes the stored object and cannot be undone.",
  // entry table
  "table.aria": "Folder contents",
  "table.name": "Name",
  "table.size": "Size",
  "table.updated": "Updated",
  "table.actions": "Actions",
  "table.rename": "Rename",
  "table.move": "Move",
  "table.recycle": "Recycle",
  "table.preview": "Preview",
  "table.download": "Download",
  "table.renameFolderAria": "Rename folder {name}",
  "table.moveFolderAria": "Move folder {name}",
  "table.recycleFolderAria": "Recycle folder {name}",
  "table.previewAria": "Preview {name}",
  "table.downloadAria": "Download {name}",
  "table.renameFileAria": "Rename file {name}",
  "table.moveFileAria": "Move file {name}",
  "table.recycleFileAria": "Recycle file {name}",
  // pending view
  "pending.title": "Reserved uploads",
  "pending.refresh": "Refresh",
  "pending.emptyTitle": "No pending uploads",
  "pending.chooseSame": "Choose same file",
  "pending.chooseSameAria": "Choose same file for {name}",
  "pending.verifyAgain": "Verify again",
  "pending.verifyAgainAria": "Verify {name} again",
  "pending.reservedAt": "Reserved {date}",
  "pending.verifyRetried": "Storage verification retried.",
  // recycle view
  "recycle.title": "Recoverable items",
  "recycle.emptyTitle": "Recycle bin is empty",
  "recycle.restore": "Restore",
  "recycle.restoreFolderAria": "Restore folder {name}",
  "recycle.restoreFileAria": "Restore file {name}",
  "recycle.folderDeleted": "Folder · Deleted {date}",
  "recycle.fileDeleted": "Deleted {date}",
  "recycle.deleteForever": "Delete forever",
  "recycle.deleteForeverAria": "Delete {name} forever",
  "recycle.folderRestored": "Folder restored.",
  // preview
  "preview.close": "Close",
  "preview.closeAria": "Close preview",
  "preview.imageAlt": "Preview of {name}",
  "preview.frameTitle": "Preview of {name}",
  "preview.open": "Open",
  // move dialog
  "move.title": "Move “{name}”",
  "move.destinationBreadcrumb": "Destination breadcrumb",
  "move.noSubfolders": "This folder has no subfolders.",
  "move.destination": "Destination: {name}",
  "move.moving": "Moving…",
  "move.submit": "Move here",
  "move.folderMoved": "Folder moved.",
  "move.fileMoved": "File moved.",
  // bounded atomic bulk actions
  "bulk.toolbarAria": "Selected item actions",
  "bulk.selectAria": "Select {name}",
  "bulk.selected": "{count} selected",
  "bulk.move": "Move",
  "bulk.recycle": "Move to trash",
  "bulk.restore": "Restore",
  "bulk.favoriteAdd": "Add favorites",
  "bulk.favoriteRemove": "Remove favorites",
  "bulk.clear": "Clear selection",
  "bulk.recycleConfirm": "Move {count} selected items to the recycle bin? Active contents of selected folders are included.",
  "bulk.completed": "Updated {count} selected items.",
  "bulk.failedAtomic": "No selected item was changed.",
  // shared
  "shared.loadingItems": "Loading items…",
} as const;

export type MessageKey = keyof typeof EN;

const ZH_CN: Record<MessageKey, string> = {
  "app.loading": "正在打开你的资料库…",
  "login.nameLabel": "登录名",
  "login.passwordLabel": "密码",
  "login.submitting": "正在登录…",
  "login.submit": "登录",
  "registration.title": "创建账户",
  "registration.confirmPassword": "确认密码",
  "registration.submitting": "正在创建账户…",
  "registration.submit": "创建账户",
  "registration.cancel": "返回登录",
  "session.expired": "会话已过期，请重新登录。",
  "nav.skip": "跳到文件列表",
  "nav.signOut": "退出登录",
  "nav.library": "资料库",
  "nav.pending": "待处理",
  "nav.recycle": "回收站",
  "nav.favorites": "收藏",
  "nav.backAria": "返回“{name}”",
  "nav.primaryAria": "主导航",
  "account.menuAria": "账户菜单",
  "account.menuLabel": "账户",
  "account.manage": "管理账户",
  "password.change": "修改密码",
  "password.closeAria": "关闭修改密码",
  "password.current": "当前密码",
  "password.new": "新密码",
  "password.confirm": "确认新密码",
  "password.cancel": "取消",
  "password.save": "修改密码",
  "password.saving": "正在修改…",
  "accounts.title": "账户管理",
  "accounts.closeAria": "关闭账户管理",
  "accounts.members": "账户",
  "accounts.owner": "所有者",
  "accounts.member": "成员",
  "accounts.active": "已启用",
  "accounts.disabled": "已停用",
  "accounts.disable": "停用",
  "accounts.enable": "启用",
  "accounts.invitations": "邀请",
  "accounts.createInvitation": "创建邀请",
  "accounts.oneTimeLink": "一次性邀请链接",
  "accounts.dismissLink": "关闭链接",
  "accounts.noInvitations": "没有邀请",
  "accounts.invitationAvailable": "可使用",
  "accounts.invitationExpired": "已过期",
  "accounts.invitationConsumed": "已使用",
  "accounts.invitationRevoked": "已撤销",
  "accounts.expires": "到期时间：{date}",
  "accounts.revoke": "撤销",
  "announcements.manage": "管理公告",
  "announcements.closeAria": "关闭公告管理",
  "announcements.current": "当前公告",
  "announcements.itemAria": "{severity}公告：{title}",
  "announcements.openLink": "打开链接",
  "announcements.retry": "重试",
  "announcements.info": "通知",
  "announcements.warning": "警告",
  "announcements.critical": "重要",
  "announcements.create": "创建公告",
  "announcements.edit": "编辑",
  "announcements.cancelEdit": "取消编辑",
  "announcements.save": "保存",
  "announcements.title": "标题",
  "announcements.body": "正文",
  "announcements.severity": "级别",
  "announcements.expiresAt": "到期时间",
  "announcements.link": "链接",
  "announcements.all": "公告",
  "announcements.none": "没有公告",
  "announcements.active": "已发布",
  "announcements.inactive": "未发布",
  "announcements.published": "发布时间：{date}",
  "announcements.expires": "到期时间：{date}",
  "announcements.publish": "发布",
  "announcements.unpublish": "取消发布",
  "audit.manage": "治理审计",
  "audit.title": "治理与安全审计",
  "audit.closeAria": "关闭治理审计",
  "audit.empty": "没有治理事件",
  "audit.loadOlder": "加载更早事件",
  "audit.loading": "正在加载审计事件…",
  "audit.error": "无法加载审计事件。",
  "audit.retry": "重试",
  "audit.time": "时间",
  "audit.action": "操作",
  "audit.outcome": "结果",
  "audit.actor": "操作者",
  "audit.target": "目标",
  "audit.reason": "原因",
  "language.label": "语言",
  "workspace.uploadFiles": "上传文件",
  "workspace.itemSummary": "{files} 个文件 · {folders} 个文件夹",
  "workspace.newFolder": "新建文件夹",
  "breadcrumb.aria": "面包屑导航",
  "alert.dismiss": "关闭",
  "menu.openAria": "打开 {name} 的操作菜单",
  "menu.aria": "{name} 的操作",
  "menu.trash": "移入回收站",
  "menu.preview": "预览",
  "menu.download": "下载",
  "menu.rename": "重命名",
  "menu.move": "移动",
  "menu.previewAria": "预览 {name}",
  "menu.downloadAria": "下载 {name}",
  "menu.renameFolderAria": "重命名文件夹 {name}",
  "menu.moveFolderAria": "移动文件夹 {name}",
  "menu.trashFolderAria": "将文件夹 {name} 移入回收站",
  "menu.renameFileAria": "重命名文件 {name}",
  "menu.moveFileAria": "移动文件 {name}",
  "menu.trashFileAria": "将文件 {name} 移入回收站",
  "favorites.emptyTitle": "还没有收藏",
  "fav.addAria": "收藏 {name}",
  "fav.removeAria": "取消收藏 {name}",
  "folder.dialogTitle": "新建文件夹",
  "folder.cancel": "取消",
  "folder.closeAria": "关闭新建文件夹对话框",
  "drop.aria": "文件拖放区域",
  "drop.title": "松开即可上传到「{folder}」",
  "drop.count": "{count} 个文件",
  "drop.directorySkipped": "已跳过 {count} 个文件夹。",
  "drop.notUploaded": "未上传。",
  "upload.enqueuedCount": "已将 {count} 个文件加入上传队列。",
  "upload.queueTitle": "上传活动",
  "upload.queueSummary": "{count} 项正在进行或需要处理",
  "upload.progressAria": "{name} 上传进度",
  "upload.retry": "重试",
  "upload.verifyRetryAria": "验证已存储副本或重试 {name}",
  "upload.dismissAria": "关闭 {name} 的上传状态",
  "upload.cancel": "取消",
  "upload.cancelAria": "取消 {name} 的上传",
  "upload.emptyFile": "无法上传空文件。",
  "upload.sameFileMismatch": "请选择当初为该待处理上传预留的同一个文件。",
  "upload.uploaded": "已上传“{name}”。",
  "upload.speedEta": "{speed} · {eta}",
  "upload.etaSeconds": "剩余约 {seconds} 秒",
  "phase.queued": "排队等待",
  "phase.checksum": "正在计算校验值",
  "phase.reserving": "正在准备安全上传",
  "phase.uploading": "正在上传",
  "phase.verifying": "正在验证云端文件",
  "phase.complete": "上传完成",
  "phase.error": "需要处理",
  "phase.cancelled": "已取消",
  "folder.newLabel": "新建文件夹",
  "folder.create": "创建",
  "folder.created": "已创建“{name}”。",
  "folder.renamed": "文件夹已重命名。",
  "folder.moved": "文件夹已移入回收站。",
  "folder.moveConfirm": "将“{name}”及其中仍有效的内容移入回收站？",
  "folder.promptRename": "新的文件夹名称",
  "folder.contentsTitle": "内容",
  "folder.items": "{count} 项",
  "folder.emptyTitle": "文件夹为空",
  "folder.kind": "文件夹",
  "file.kindPdf": "PDF",
  "file.kindImage": "图片",
  "file.kindText": "文本",
  "file.kindFile": "文件",
  "file.promptRename": "新的文件名称",
  "file.renamed": "文件已重命名。",
  "file.moved": "文件已移动。",
  "file.recycleConfirm": "将“{name}”移入回收站？",
  "file.recycled": "文件已移入回收站。",
  "file.restored": "文件已恢复。",
  "file.downloadOpened": "已开始下载。",
  "file.permanentDeleted": "文件已永久删除。",
  "file.permanentConfirm": "永久删除“{name}”？这将移除已存储的对象，且无法撤销。",
  "table.aria": "文件夹内容",
  "table.name": "名称",
  "table.size": "大小",
  "table.updated": "更新时间",
  "table.actions": "操作",
  "table.rename": "重命名",
  "table.move": "移动",
  "table.recycle": "回收",
  "table.preview": "预览",
  "table.download": "下载",
  "table.renameFolderAria": "重命名文件夹 {name}",
  "table.moveFolderAria": "移动文件夹 {name}",
  "table.recycleFolderAria": "回收文件夹 {name}",
  "table.previewAria": "预览 {name}",
  "table.downloadAria": "下载 {name}",
  "table.renameFileAria": "重命名文件 {name}",
  "table.moveFileAria": "移动文件 {name}",
  "table.recycleFileAria": "回收文件 {name}",
  "pending.title": "已预留的上传",
  "pending.refresh": "刷新",
  "pending.emptyTitle": "没有待处理的上传",
  "pending.chooseSame": "选择同一文件",
  "pending.chooseSameAria": "为 {name} 选择同一文件",
  "pending.verifyAgain": "再次验证",
  "pending.verifyAgainAria": "再次验证 {name}",
  "pending.reservedAt": "预留于 {date}",
  "pending.verifyRetried": "已重试存储验证。",
  "recycle.title": "可恢复项目",
  "recycle.emptyTitle": "回收站为空",
  "recycle.restore": "恢复",
  "recycle.restoreFolderAria": "恢复文件夹 {name}",
  "recycle.restoreFileAria": "恢复文件 {name}",
  "recycle.folderDeleted": "文件夹 · 删除于 {date}",
  "recycle.fileDeleted": "删除于 {date}",
  "recycle.deleteForever": "永久删除",
  "recycle.deleteForeverAria": "永久删除 {name}",
  "recycle.folderRestored": "文件夹已恢复。",
  "preview.close": "关闭",
  "preview.closeAria": "关闭预览",
  "preview.imageAlt": "{name} 的预览",
  "preview.frameTitle": "{name} 的预览",
  "preview.open": "打开",
  "move.title": "移动“{name}”",
  "move.destinationBreadcrumb": "目标位置面包屑导航",
  "move.noSubfolders": "此文件夹没有子文件夹。",
  "move.destination": "目标位置：{name}",
  "move.moving": "正在移动…",
  "move.submit": "移动到这里",
  "move.folderMoved": "文件夹已移动。",
  "move.fileMoved": "文件已移动。",
  "bulk.toolbarAria": "所选项目操作",
  "bulk.selectAria": "选择 {name}",
  "bulk.selected": "已选择 {count} 项",
  "bulk.move": "移动",
  "bulk.recycle": "移入回收站",
  "bulk.restore": "恢复",
  "bulk.favoriteAdd": "添加收藏",
  "bulk.favoriteRemove": "取消收藏",
  "bulk.clear": "清除选择",
  "bulk.recycleConfirm": "将所选 {count} 项移入回收站？所选文件夹中的有效内容也会一并移入。",
  "bulk.completed": "已更新所选 {count} 项。",
  "bulk.failedAtomic": "所选项目均未发生更改。",
  "shared.loadingItems": "正在加载项目…",
};

export const MESSAGES: Readonly<Record<Language, Readonly<Record<MessageKey, string>>>> = {
  "zh-CN": ZH_CN,
  en: EN,
};

export type MessageParams = Readonly<Record<string, string | number>>;

export function translate(language: Language, key: MessageKey, params?: MessageParams): string {
  const template = MESSAGES[language][key];
  if (!params) return template;
  return template.replace(/\{(\w+)\}/g, (match, name: string) =>
    name in params ? String(params[name]) : match,
  );
}

export function isLanguage(value: unknown): value is Language {
  return value === "zh-CN" || value === "en";
}

export interface LanguageEnvironment {
  localStorage?: Pick<Storage, "getItem">;
  navigator?: { language?: string };
}

export function resolveInitialLanguage(environment: LanguageEnvironment = {}): Language {
  const storage = environment.localStorage ?? safeLocalStorage();
  const navigatorLanguage = environment.navigator?.language ?? safeNavigatorLanguage();

  const stored = storage?.getItem(LANGUAGE_STORAGE_KEY);
  if (isLanguage(stored)) return stored;

  return navigatorLanguage.toLowerCase().startsWith("zh") ? "zh-CN" : "en";
}

export function persistLanguage(language: Language): void {
  try {
    window.localStorage.setItem(LANGUAGE_STORAGE_KEY, language);
  } catch {
    // Storage can be unavailable in private browsing; the selection still
    // applies for this session.
  }
}

export function applyDocumentLanguage(language: Language): void {
  document.documentElement.lang = language;
}

function safeLocalStorage(): Pick<Storage, "getItem"> | undefined {
  try {
    return typeof window !== "undefined" ? window.localStorage : undefined;
  } catch {
    return undefined;
  }
}

function safeNavigatorLanguage(): string {
  try {
    return typeof navigator !== "undefined" ? navigator.language : "en";
  } catch {
    return "en";
  }
}

// Backend error codes remain stable; only their presentation is localized.
export const ERROR_MESSAGES: Readonly<Record<Language, Readonly<Record<string, string>>>> = {
  "zh-CN": {
    authentication_required: "会话已过期，请重新登录。",
    invalid_credentials: "登录名或密码不正确。",
    authentication_busy: "登录暂时繁忙，请稍候再试。",
    invalid_invitation: "该邀请无效、已使用、已撤销或已过期。",
    login_unavailable: "该登录名不可用。",
    forbidden: "当前账户无权执行此操作。",
    invalid_target: "无法对该账户执行此操作。",
    invalid_announcement: "公告内容、链接或时间无效。",
    password_mismatch: "两次输入的密码不一致。",
    invalid_current_password: "当前密码不正确。",
    password_change_conflict: "账户状态或密码已变化，请重新登录后再试。",
    password_unchanged: "新密码必须与当前密码不同。",
    password_change_busy: "密码验证暂时繁忙，请稍候再试。",
    invalid_origin: "该请求并非来自已配置的 AcademicCloud 站点。",
    invalid_request: "部分信息无效，请检查表单后重试。",
    unsupported_media_type: "服务器无法接受此请求格式。",
    payload_too_large: "该文件超过了服务器允许的大小。",
    rate_limit_exceeded: "尝试次数过多，请稍候再试。",
    name_conflict: "这里已存在同名项目。",
    folder_not_empty: "文件夹必须为空才能移入回收站。",
    invalid_move: "该目标位置会形成无效的文件夹结构。",
    invalid_state: "该项目状态已变化，请刷新后重试。",
    concurrent_change: "所选项目已发生变化；本批次未执行，请刷新后重试。",
    upload_incomplete: "上传尚未到达存储，请稍后重试验证。",
    upload_metadata_mismatch: "存储收到的文件与预留的上传不匹配。",
    upload_unreachable: "无法连接到对象存储，请检查网络后重试。",
    upload_timed_out: "上传超时，请重试。",
    upload_stalled: "上传长时间没有进展，请检查网络后重试。",
    upload_rejected: "对象存储拒绝了这次上传，请重试。",
    storage_unavailable: "对象存储暂时不可用，请稍后重试。",
    preview_unavailable: "在线预览暂不可用，可下载后查看。",
    preview_too_large: "文件较大，不适合在线预览，请下载后查看。",
    not_found: "该项目已不存在或对该账户不可用。",
    internal_error: "AcademicCloud 遇到了意外错误。",
  },
  en: {
    authentication_required: "Your session has expired. Please sign in again.",
    invalid_credentials: "The login name or password is incorrect.",
    authentication_busy: "Sign-in is temporarily busy. Please wait a moment and try again.",
    invalid_invitation: "This invitation is invalid, used, revoked, or expired.",
    login_unavailable: "That login name is unavailable.",
    forbidden: "This account is not allowed to perform that action.",
    invalid_target: "That account cannot be changed.",
    invalid_announcement: "The announcement content, link, or time is invalid.",
    password_mismatch: "The passwords do not match.",
    invalid_current_password: "The current password is incorrect.",
    password_change_conflict: "The account or password changed. Sign in again and retry.",
    password_unchanged: "The new password must differ from the current password.",
    password_change_busy: "Password verification is temporarily busy. Please try again shortly.",
    invalid_origin: "This request did not come from the configured AcademicCloud site.",
    invalid_request: "Some information was invalid. Check the form and try again.",
    unsupported_media_type: "The server could not accept this request format.",
    payload_too_large: "This file is larger than the server allows.",
    rate_limit_exceeded: "Too many attempts. Please wait before trying again.",
    name_conflict: "An item with that name already exists here.",
    folder_not_empty: "This folder must be empty before it can be moved to the recycle bin.",
    invalid_move: "That destination would create an invalid folder structure.",
    invalid_state: "This item changed state. Refresh the view and try again.",
    concurrent_change: "A selected item changed. The batch was not applied; refresh and try again.",
    upload_incomplete: "The upload has not reached storage yet. Retry verification shortly.",
    upload_metadata_mismatch: "Storage received a file that does not match the reserved upload.",
    upload_unreachable: "Could not reach object storage. Check your connection and try again.",
    upload_timed_out: "The upload timed out. Please try again.",
    upload_stalled: "The upload stalled. Check your connection and try again.",
    upload_rejected: "Object storage rejected the upload. Please try again.",
    storage_unavailable: "Object storage is temporarily unavailable. Please try again shortly.",
    preview_unavailable: "Online preview is currently unavailable. You can download the file instead.",
    preview_too_large: "This file is too large for inline preview. Download it to view.",
    not_found: "The item no longer exists or is not available to this account.",
    internal_error: "AcademicCloud encountered an unexpected error.",
  },
};

export function describeError(error: unknown, language: Language): string {
  if (error instanceof Error && error.name === "ApiError" && "code" in error && typeof (error as { code: unknown }).code === "string") {
    const code = (error as { code: string }).code;
    return ERROR_MESSAGES[language][code] ?? ERROR_MESSAGES.en[code] ?? `Request failed. (${code})`;
  }
  if (error instanceof DOMException && error.name === "AbortError") {
    return language === "zh-CN" ? "操作已取消。" : "The operation was cancelled.";
  }
  // Coded frontend failures (e.g. direct-upload transport errors) render
  // through the same localized catalog instead of leaking raw English
  // infrastructure messages into a zh-CN interface.
  if (error instanceof Error && "code" in error && typeof (error as { code: unknown }).code === "string") {
    const code = (error as { code: string }).code;
    const localized = ERROR_MESSAGES[language][code];
    if (localized) return localized;
  }
  if (error instanceof Error && error.message) {
    return error.message;
  }
  return language === "zh-CN" ? "无法完成该操作。" : "The operation could not be completed.";
}

export function formatDate(value: string | null, language: Language): string {
  if (!value) return "—";
  const date = new Date(value);
  return Number.isNaN(date.getTime())
    ? "—"
    : new Intl.DateTimeFormat(language, { dateStyle: "medium" }).format(date);
}

export function formatCount(language: Language, count: number): string {
  return new Intl.NumberFormat(language).format(count);
}
