import type { Lang } from '@arrowz/engine/i18n'
import { readStored, writeStored } from './storage'

/** The old lab's key, so a preference set in one lab opens the other in the same language. */
export const LANG_KEY = 'labLang'

export function isLang(value: unknown): value is Lang {
  return value === 'pl' || value === 'en'
}

/**
 * The language a page opens in before any link is read — `lab-page.ts:108-109`.
 * A link's language is not an input here: `useUrlHash` applies it on top, the
 * way it applies the link's knobs (Ruling 6).
 */
export function initialLang(stored: string | null, browser: string | undefined): Lang {
  if (isLang(stored)) return stored
  return stored === null && browser !== undefined && browser.toLowerCase().startsWith('pl') ? 'pl' : 'en'
}

export interface LangState {
  lang: Lang
  /** Switches the page's language and remembers it, whoever asked: the switch or a link. */
  setLang(lang: Lang): void
}

type SetStore = (fn: (state: { lang: LangState }) => { lang: LangState }) => void

export function createLangSlice(set: SetStore): LangState {
  const browser = typeof navigator === 'undefined' ? undefined : navigator.language
  return {
    lang: initialLang(readStored(LANG_KEY), browser),
    setLang: (lang) => {
      writeStored(LANG_KEY, lang)
      set((state) => ({ lang: { ...state.lang, lang } }))
    },
  }
}
