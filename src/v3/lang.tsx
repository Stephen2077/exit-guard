// Page language: EN by default, ?lang=zh to open in Chinese, and the reader's choice remembered in this browser.
import { createContext, useContext } from 'react'

export type Lang = 'en' | 'zh'
const KEY = 'exit-guard-lang'

export function initialLang(): Lang {
  const q = new URLSearchParams(location.search).get('lang')
  if (q === 'en' || q === 'zh') return q
  try {
    const saved = localStorage.getItem(KEY)
    if (saved === 'en' || saved === 'zh') return saved
  } catch {
    // storage blocked: use the default
  }
  return 'en'
}

export function saveLang(l: Lang) {
  try {
    localStorage.setItem(KEY, l)
  } catch {
    // storage blocked: the choice lasts until reload
  }
}

export const LangContext = createContext<Lang>('en')
export const useLang = () => useContext(LangContext)

// t('Check', '检查'): the text for the current language. Codes, addresses and verdict words stay as they are.
export function useT() {
  const lang = useLang()
  return (en: string, zh: string) => (lang === 'zh' ? zh : en)
}
