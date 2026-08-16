// Typed internal localization layer. Supported languages: zh-CN and en.
// Selection: a previously saved choice wins; otherwise navigator.language
// starting with "zh" selects zh-CN and everything else selects en.
export type Language = "zh-CN" | "en";

export const LANGUAGE_STORAGE_KEY = "academiccloud.language";

const EN = {
  // login / shell
  "app.loading": "Opening your library…",
  "login.eyebrow": "Private academic workspace",
  "login.title": "A quieter home for serious work.",
  "login.subtitle": "AcademicCloud keeps your source files organized and recoverable, without turning your library into a feed.",
  "login.privacy": "Private by design · short-lived file access",
  "login.welcome": "Welcome back",
  "login.muted": "Sign in to continue to your library.",
  "login.nameLabel": "Login name",
  "login.passwordLabel": "Password",
  "login.submitting": "Signing in…",
  "login.submit": "Sign in",
  "session.expired": "Your session expired. Please sign in again.",
  // topbar / navigation
  "nav.skip": "Skip to files",
  "nav.signOut": "Sign out",
  "nav.library": "Library",
  "nav.pending": "Pending uploads",
  "nav.recycle": "Recycle bin",
  "nav.primaryAria": "Primary navigation",
  "sidebar.privateTitle": "Private storage",
  "sidebar.privateText": "Files open with short-lived links.",
  "language.label": "Language",
  // workspace
  "workspace.recoverableEyebrow": "Recoverable items",
  "workspace.filesEyebrow": "Your research files",
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
  // new folder dialog
  "folder.dialogTitle": "New folder",
  "folder.cancel": "Cancel",
  "folder.closeAria": "Close new folder dialog",
  // drag & drop
  "drop.aria": "File drop overlay",
  "drop.title": "Drop to upload to “{folder}”",
  "drop.count": "{count} files",
  "drop.directorySkipped": "{count} folders were skipped — folder upload is not supported yet.",
  "drop.onlyDirectories": "Folder upload is not supported yet; drop files instead.",
  "drop.outsideWorkspace": "Drop files into the Library workspace to upload them.",
  "upload.enqueuedCount": "{count} files added to the upload queue.",
  // upload queue
  "upload.queueTitle": "Upload activity",
  "upload.queueSummary": "{count} in progress or needing attention",
  "upload.progressAria": "{name} upload progress",
  "upload.verifyOrRetry": "Verify or retry",
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
  "phase.uploading": "Sending directly to object storage",
  "phase.verifying": "Verifying stored file",
  "phase.complete": "Complete",
  "phase.error": "Needs attention",
  "phase.cancelled": "Cancelled",
  // folders / files
  "folder.newLabel": "New folder",
  "folder.newPlaceholder": "Reading notes",
  "folder.create": "Create",
  "folder.created": "Created “{name}”.",
  "folder.renamed": "Folder renamed.",
  "folder.moved": "Folder moved to the recycle bin.",
  "folder.moveConfirm": "Move the empty folder “{name}” to the recycle bin?",
  "folder.promptRename": "New folder name",
  "folder.contentsTitle": "Contents",
  "folder.items": "{count} items",
  "folder.emptyTitle": "This folder is ready",
  "folder.emptyText": "Upload a source file or create a folder to begin.",
  "file.promptRename": "New file name",
  "file.renamed": "File renamed.",
  "file.moved": "File moved.",
  "file.recycleConfirm": "Move “{name}” to the recycle bin? The stored file will be preserved.",
  "file.recycled": "File moved to the recycle bin.",
  "file.restored": "File restored.",
  "file.downloadOpened": "A short-lived download was opened.",
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
  "pending.copy": "If an upload was interrupted, choose the exact same local file to renew its short-lived authorization and continue.",
  "pending.emptyTitle": "No pending uploads",
  "pending.emptyText": "Interrupted or unverified uploads will appear here.",
  "pending.chooseSame": "Choose same file",
  "pending.chooseSameAria": "Choose same file for {name}",
  "pending.verifyAgain": "Verify again",
  "pending.verifyAgainAria": "Verify {name} again",
  "pending.reservedAt": "Reserved {date}",
  "pending.verifyRetried": "Storage verification retried.",
  // recycle view
  "recycle.title": "Recoverable items",
  "recycle.copy": "Restoring keeps the original stored bytes. Permanent deletion cannot be undone.",
  "recycle.emptyTitle": "The recycle bin is empty",
  "recycle.emptyText": "Soft-deleted files and folders remain recoverable here.",
  "recycle.restore": "Restore",
  "recycle.restoreFolderAria": "Restore folder {name}",
  "recycle.restoreFileAria": "Restore file {name}",
  "recycle.folderDeleted": "Folder · Deleted {date}",
  "recycle.fileDeleted": "Deleted {date}",
  "recycle.deleteForever": "Delete forever",
  "recycle.deleteForeverAria": "Delete {name} forever",
  "recycle.folderRestored": "Folder restored.",
  // preview
  "preview.eyebrow": "Short-lived preview",
  "preview.close": "Close",
  "preview.closeAria": "Close preview",
  "preview.imageAlt": "Preview of {name}",
  "preview.frameTitle": "Preview of {name}",
  "preview.expires": "This link expires automatically.",
  "preview.openTab": "Open in a new tab",
  // move dialog
  "move.eyebrow": "Choose destination",
  "move.title": "Move “{name}”",
  "move.destinationBreadcrumb": "Destination breadcrumb",
  "move.noSubfolders": "This folder has no subfolders.",
  "move.destination": "Destination: {name}",
  "move.moving": "Moving…",
  "move.submit": "Move here",
  "move.folderMoved": "Folder moved.",
  "move.fileMoved": "File moved.",
  // shared
  "shared.loadingItems": "Loading items…",
  "shared.movedHere": "Moved here.",
} as const;

export type MessageKey = keyof typeof EN;

const ZH_CN: Record<MessageKey, string> = {
  "app.loading": "正在打开你的资料库…",
  "login.eyebrow": "私密学术工作空间",
  "login.title": "给认真工作一个更安静的家。",
  "login.subtitle": "AcademicCloud 让你的源文件井然有序、随时可恢复，而不会把资料库变成信息流。",
  "login.privacy": "隐私至上 · 短时有效的文件访问",
  "login.welcome": "欢迎回来",
  "login.muted": "登录以继续访问你的资料库。",
  "login.nameLabel": "登录名",
  "login.passwordLabel": "密码",
  "login.submitting": "正在登录…",
  "login.submit": "登录",
  "session.expired": "会话已过期，请重新登录。",
  "nav.skip": "跳到文件列表",
  "nav.signOut": "退出登录",
  "nav.library": "资料库",
  "nav.pending": "待处理上传",
  "nav.recycle": "回收站",
  "nav.primaryAria": "主导航",
  "sidebar.privateTitle": "私密存储",
  "sidebar.privateText": "文件通过短时有效的链接打开。",
  "language.label": "语言",
  "workspace.recoverableEyebrow": "可恢复项目",
  "workspace.filesEyebrow": "你的研究文件",
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
  "folder.dialogTitle": "新建文件夹",
  "folder.cancel": "取消",
  "folder.closeAria": "关闭新建文件夹对话框",
  "drop.aria": "文件拖放区域",
  "drop.title": "松开即可上传到「{folder}」",
  "drop.count": "{count} 个文件",
  "drop.directorySkipped": "已跳过 {count} 个文件夹——暂不支持文件夹上传。",
  "drop.onlyDirectories": "暂不支持文件夹上传，请拖入文件。",
  "drop.outsideWorkspace": "请将文件拖入资料库区域进行上传。",
  "upload.enqueuedCount": "已将 {count} 个文件加入上传队列。",
  "upload.queueTitle": "上传活动",
  "upload.queueSummary": "{count} 项正在进行或需要处理",
  "upload.progressAria": "{name} 上传进度",
  "upload.verifyOrRetry": "验证或重试",
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
  "folder.newPlaceholder": "阅读笔记",
  "folder.create": "创建",
  "folder.created": "已创建“{name}”。",
  "folder.renamed": "文件夹已重命名。",
  "folder.moved": "文件夹已移入回收站。",
  "folder.moveConfirm": "将空文件夹“{name}”移入回收站？",
  "folder.promptRename": "新的文件夹名称",
  "folder.contentsTitle": "内容",
  "folder.items": "{count} 项",
  "folder.emptyTitle": "这个文件夹已就绪",
  "folder.emptyText": "上传一个源文件或创建一个文件夹开始使用。",
  "file.promptRename": "新的文件名称",
  "file.renamed": "文件已重命名。",
  "file.moved": "文件已移动。",
  "file.recycleConfirm": "将“{name}”移入回收站？已存储的文件将被保留。",
  "file.recycled": "文件已移入回收站。",
  "file.restored": "文件已恢复。",
  "file.downloadOpened": "已打开一个短时有效的下载。",
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
  "pending.copy": "如果上传被中断，请选择完全相同的本地文件来续期其短时授权并继续。",
  "pending.emptyTitle": "没有待处理的上传",
  "pending.emptyText": "被中断或未验证的上传会显示在这里。",
  "pending.chooseSame": "选择同一文件",
  "pending.chooseSameAria": "为 {name} 选择同一文件",
  "pending.verifyAgain": "再次验证",
  "pending.verifyAgainAria": "再次验证 {name}",
  "pending.reservedAt": "预留于 {date}",
  "pending.verifyRetried": "已重试存储验证。",
  "recycle.title": "可恢复项目",
  "recycle.copy": "恢复会保留原始存储字节。永久删除无法撤销。",
  "recycle.emptyTitle": "回收站是空的",
  "recycle.emptyText": "被软删除的文件和文件夹会保留在这里以供恢复。",
  "recycle.restore": "恢复",
  "recycle.restoreFolderAria": "恢复文件夹 {name}",
  "recycle.restoreFileAria": "恢复文件 {name}",
  "recycle.folderDeleted": "文件夹 · 删除于 {date}",
  "recycle.fileDeleted": "删除于 {date}",
  "recycle.deleteForever": "永久删除",
  "recycle.deleteForeverAria": "永久删除 {name}",
  "recycle.folderRestored": "文件夹已恢复。",
  "preview.eyebrow": "短时有效的预览",
  "preview.close": "关闭",
  "preview.closeAria": "关闭预览",
  "preview.imageAlt": "{name} 的预览",
  "preview.frameTitle": "{name} 的预览",
  "preview.expires": "此链接会自动过期。",
  "preview.openTab": "在新标签页中打开",
  "move.eyebrow": "选择目标位置",
  "move.title": "移动“{name}”",
  "move.destinationBreadcrumb": "目标位置面包屑导航",
  "move.noSubfolders": "此文件夹没有子文件夹。",
  "move.destination": "目标位置：{name}",
  "move.moving": "正在移动…",
  "move.submit": "移动到这里",
  "move.folderMoved": "文件夹已移动。",
  "move.fileMoved": "文件已移动。",
  "shared.loadingItems": "正在加载项目…",
  "shared.movedHere": "已移动到这里。",
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
    invalid_origin: "该请求并非来自已配置的 AcademicCloud 站点。",
    invalid_request: "部分信息无效，请检查表单后重试。",
    unsupported_media_type: "服务器无法接受此请求格式。",
    payload_too_large: "该文件超过了服务器允许的大小。",
    rate_limit_exceeded: "尝试次数过多，请稍候再试。",
    name_conflict: "这里已存在同名项目。",
    folder_not_empty: "文件夹必须为空才能移入回收站。",
    invalid_move: "该目标位置会形成无效的文件夹结构。",
    invalid_state: "该项目状态已变化，请刷新后重试。",
    upload_incomplete: "上传尚未到达存储，请稍后重试验证。",
    upload_metadata_mismatch: "存储收到的文件与预留的上传不匹配。",
    upload_unreachable: "无法连接到对象存储，请检查网络后重试。",
    upload_timed_out: "上传超时，请重试。",
    upload_stalled: "上传长时间没有进展，请检查网络后重试。",
    upload_rejected: "对象存储拒绝了这次上传，请重试。",
    storage_unavailable: "对象存储暂时不可用，你的元数据仍然安全。",
    preview_unavailable: "在线预览暂不可用，可下载后查看。",
    preview_too_large: "文件较大，不适合在线预览，请下载后查看。",
    not_found: "该项目已不存在或对该账户不可用。",
    internal_error: "AcademicCloud 遇到了意外错误。",
  },
  en: {
    authentication_required: "Your session has expired. Please sign in again.",
    invalid_credentials: "The login name or password is incorrect.",
    authentication_busy: "Sign-in is temporarily busy. Please wait a moment and try again.",
    invalid_origin: "This request did not come from the configured AcademicCloud site.",
    invalid_request: "Some information was invalid. Check the form and try again.",
    unsupported_media_type: "The server could not accept this request format.",
    payload_too_large: "This file is larger than the server allows.",
    rate_limit_exceeded: "Too many attempts. Please wait before trying again.",
    name_conflict: "An item with that name already exists here.",
    folder_not_empty: "This folder must be empty before it can be moved to the recycle bin.",
    invalid_move: "That destination would create an invalid folder structure.",
    invalid_state: "This item changed state. Refresh the view and try again.",
    upload_incomplete: "The upload has not reached storage yet. Retry verification shortly.",
    upload_metadata_mismatch: "Storage received a file that does not match the reserved upload.",
    upload_unreachable: "Could not reach object storage. Check your connection and try again.",
    upload_timed_out: "The upload timed out. Please try again.",
    upload_stalled: "The upload stalled. Check your connection and try again.",
    upload_rejected: "Object storage rejected the upload. Please try again.",
    storage_unavailable: "Object storage is temporarily unavailable. Your metadata is still safe.",
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
