// Two languages, chosen like the old pages (localStorage "dgit-prefs".lang, else the browser language).
import { createContext, useCallback, useContext, useMemo, useState, type ReactNode } from 'react';

export type Lang = 'zh' | 'en';
export type Theme = 'light' | 'dark' | 'system';
const KEY = 'dgit-prefs';

function readPrefs(): { lang?: string; theme?: string } {
  try {
    return JSON.parse(localStorage.getItem(KEY) || '{}');
  } catch {
    return {};
  }
}
function writePrefs(p: { lang?: string; theme?: string }) {
  try {
    localStorage.setItem(KEY, JSON.stringify({ ...readPrefs(), ...p }));
  } catch {
    // private mode
  }
}
const navLang = (): Lang => ((navigator.language || '').toLowerCase().startsWith('zh') ? 'zh' : 'en');

interface Ctx {
  lang: Lang;
  setLang: (l: Lang) => void;
  theme: Theme;
  setTheme: (t: Theme) => void;
  t: (en: string, zh: string) => string;
}
const I18n = createContext<Ctx | null>(null);

const mq = () => window.matchMedia('(prefers-color-scheme: dark)');
function applyTheme(t: Theme) {
  document.documentElement.classList.toggle('dark', t === 'dark' || (t === 'system' && mq().matches));
}

export function I18nProvider({ children }: { children: ReactNode }) {
  const p = readPrefs();
  const [lang, setLangS] = useState<Lang>(p.lang === 'en' || p.lang === 'zh' ? p.lang : navLang());
  const [theme, setThemeS] = useState<Theme>(p.theme === 'light' || p.theme === 'dark' ? p.theme : 'system');
  const setLang = useCallback((l: Lang) => {
    setLangS(l);
    writePrefs({ lang: l });
    document.documentElement.lang = l === 'zh' ? 'zh-CN' : 'en';
  }, []);
  const setTheme = useCallback((t: Theme) => {
    setThemeS(t);
    writePrefs({ theme: t });
    applyTheme(t);
  }, []);
  useMemo(() => {
    // follow the OS while on "system"
    const m = mq();
    const on = () => applyTheme(readPrefs().theme === 'light' || readPrefs().theme === 'dark' ? (readPrefs().theme as Theme) : 'system');
    m.addEventListener?.('change', on);
  }, []);
  const t = useCallback((en: string, zh: string) => (lang === 'zh' ? zh : en), [lang]);
  return <I18n.Provider value={{ lang, setLang, theme, setTheme, t }}>{children}</I18n.Provider>;
}

export function useI18n() {
  const c = useContext(I18n);
  if (!c) throw new Error('I18nProvider missing');
  return c;
}
export const useT = () => useI18n().t;
