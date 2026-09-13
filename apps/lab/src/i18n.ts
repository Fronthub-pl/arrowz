import { dictionary, type Dict } from '@arrowz/engine/i18n'

const EN = dictionary('en')

/**
 * The application's only dictionary access. PR 4 adds the `lang` slice and
 * makes this read it; until then every component already gets its text from
 * the dictionary rather than from a literal, so PR 4 changes this file and
 * nothing else.
 */
export function useDictionary(): Dict {
  return EN
}
