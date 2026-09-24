import { useLanguage } from "./i18n-react.tsx";

export function WorkspaceSwitch({ active, onLibrary, onResearch }: {
  active: "library" | "research"; onLibrary: () => void; onResearch: () => void;
}) {
  const { language } = useLanguage();
  return <nav className="workspace-switch" aria-label={language === "zh-CN" ? "工作区切换" : "Switch workspace"}>
    <button type="button" aria-current={active === "library" ? "page" : undefined} onClick={onLibrary}>{language === "zh-CN" ? "资料库" : "Library"}</button>
    <button type="button" aria-current={active === "research" ? "page" : undefined} onClick={onResearch}>{language === "zh-CN" ? "我的研究" : "My research"}</button>
  </nav>;
}
