import { createContext, useContext, useEffect, useMemo, useState, type ReactNode } from "react";

import {
  applyDocumentLanguage,
  isLanguage,
  persistLanguage,
  resolveInitialLanguage,
  translate,
  type Language,
  type MessageKey,
  type MessageParams,
} from "./i18n.ts";

export type Translator = (key: MessageKey, params?: MessageParams) => string;

export interface LanguageContextValue {
  language: Language;
  setLanguage: (language: Language) => void;
  t: Translator;
}

const LanguageContext = createContext<LanguageContextValue | null>(null);

export function LanguageProvider({ children }: { children: ReactNode }) {
  const [language, setLanguageState] = useState<Language>(() => resolveInitialLanguage());

  useEffect(() => {
    applyDocumentLanguage(language);
    persistLanguage(language);
  }, [language]);

  const value = useMemo<LanguageContextValue>(
    () => ({
      language,
      setLanguage: (next: Language) => {
        if (isLanguage(next)) setLanguageState(next);
      },
      t: (key, params) => translate(language, key, params),
    }),
    [language],
  );

  return <LanguageContext.Provider value={value}>{children}</LanguageContext.Provider>;
}

export function useLanguage(): LanguageContextValue {
  const value = useContext(LanguageContext);
  if (!value) throw new Error("useLanguage must be used inside LanguageProvider");
  return value;
}

// Compact bilingual switch: 中文 | EN. Both forms are always visible so the
// control is usable regardless of the current language.
export function LanguageSwitch({ labelled = false }: { labelled?: boolean }) {
  const { language, setLanguage, t } = useLanguage();
  const label = t("language.label");

  return (
    <div className="language-switch" role="group" aria-label={labelled ? label : undefined}>
      <button
        type="button"
        className={language === "zh-CN" ? "is-active" : undefined}
        aria-pressed={language === "zh-CN"}
        aria-label={labelled ? "中文" : undefined}
        onClick={() => setLanguage("zh-CN")}
      >
        中文
      </button>
      <span aria-hidden="true">|</span>
      <button
        type="button"
        className={language === "en" ? "is-active" : undefined}
        aria-pressed={language === "en"}
        aria-label={labelled ? "English" : undefined}
        onClick={() => setLanguage("en")}
      >
        EN
      </button>
    </div>
  );
}
