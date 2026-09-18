import { type Docs, docsFor } from '@arrowz/engine/docs'
import { useStore } from '../state/store'

/**
 * Built once per language, for the reason `i18n.ts` gives for the dictionary:
 * `docsFor()` returns the same object every call today, but a fresh one per
 * render would be a new dependency for every consumer that closes over it.
 */
const DOCS: Record<'en' | 'pl', Docs> = { en: docsFor('en'), pl: docsFor('pl') }

export function useDocs(): Docs {
  return DOCS[useStore((state) => state.lang.lang)]
}
