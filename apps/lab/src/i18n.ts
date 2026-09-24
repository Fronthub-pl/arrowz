import { type Dict, dictionary, type Lang } from '@arrowz/engine/i18n'
import { useStore } from './state/store'

/**
 * Built once per language. `dictionary()` returns a fresh object on every call,
 * and a fresh `dict` per render would be a new dependency for every consumer
 * that closes over it.
 */
const DICTS: Record<Lang, Dict> = { en: dictionary('en'), pl: dictionary('pl') }

/**
 * The application's only dictionary access. A language change re-renders every
 * component that shows text, which is all of them: a rare, deliberate action.
 */
export function useDictionary(): Dict {
  return DICTS[useStore((state) => state.lang.lang)]
}
