import { useEffect, useState } from "react";
import { useLanguage } from "./i18n-react.tsx";
import { configureLocalLibrary, loadLocalLibrary, unlinkLocalLibrary, LOCAL_LIBRARY_EVENT, type DirectoryPicker } from "./local-library.ts";

export function LocalLibraryFolder({ accountId }: { accountId: string }) {
  const { language } = useLanguage(); const zh = language === "zh-CN";
  const [name, setName] = useState(""); const [message, setMessage] = useState(""); const [busy, setBusy] = useState(false);
  useEffect(() => {
    let alive = true;
    const refresh = () => { void loadLocalLibrary(accountId).then((folder) => { if (alive) setName(folder?.name ?? ""); }); };
    refresh(); window.addEventListener(LOCAL_LIBRARY_EVENT, refresh);
    return () => { alive = false; window.removeEventListener(LOCAL_LIBRARY_EVENT, refresh); };
  }, [accountId]);
  const choose = async () => {
    const picker = (window as Window & { showDirectoryPicker?: DirectoryPicker }).showDirectoryPicker;
    if (!picker) { setMessage(zh ? "此浏览器不支持目录授权，可用 Chrome / Edge 设置；当前仍可选择单个本地原件。" : "Use Chrome or Edge to link a folder. Individual local files remain available here."); return; }
    try {
      setBusy(true); setMessage(zh ? "请在文件夹选择窗口中选择资料夹。" : "Choose your library folder in the folder picker.");
      const directory = await picker({ id: "academiccloud-library", mode: "readwrite" });
      setBusy(true);
      if (!await configureLocalLibrary(accountId, directory)) throw new Error(zh ? "浏览器未能记住目录，请使用普通下载。" : "Could not remember the folder. Use standard downloads.");
      setName(directory.name); setMessage(zh ? "已关联资料夹。" : "Folder linked.");
    } catch (error) {
      if (error instanceof DOMException && error.name === "AbortError") { setMessage(""); return; }
      setMessage(error instanceof Error ? error.message : (zh ? "目录关联失败，请重试。" : "Could not link folder."));
    } finally { setBusy(false); }
  };
  return <div className="local-library-folder">
    <button type="button" className="button button--small button--quiet" disabled={busy} onClick={() => void choose()} title={name || (zh ? "选择本地资料总目录" : "Choose a local library folder")}>{zh ? "本地资料夹" : "Local folder"}{name ? ` · ${name}` : ""}</button>
    {name && <button type="button" className="button button--small button--quiet" disabled={busy} onClick={() => { void unlinkLocalLibrary(accountId).then(() => { setName(""); setMessage(zh ? "已取消下载目录关联，磁盘文件保留。" : "Folder unlinked; files on disk are preserved."); }).catch(() => setMessage(zh ? "取消关联失败，请重试。" : "Could not unlink folder.")); }} aria-label={zh ? "取消本地资料夹关联" : "Unlink local folder"}>×</button>}
    {message && <span role="status" className="local-library-message">{message}<button type="button" aria-label={zh ? "关闭目录提示" : "Dismiss folder message"} onClick={() => setMessage("")}>×</button></span>}
  </div>;
}
