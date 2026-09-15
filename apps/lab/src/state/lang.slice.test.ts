import { describe, expect, it } from 'vitest'
import { createLangSlice, initialLang, isLang, type LangState } from './lang.slice'

describe('the language a page opens in', () => {
  // The old lab's rule, `lab-page.ts:108-109`: a stored `pl` wins; with
  // nothing stored a Polish browser gets Polish; anything else is English —
  // including a stored value that is not a language at all.
  it.each([
    ['pl', 'en-US', 'pl'],
    ['en', 'pl-PL', 'en'],
    [null, 'pl-PL', 'pl'],
    [null, 'PL', 'pl'],
    [null, 'en-GB', 'en'],
    [null, undefined, 'en'],
    ['de', 'pl-PL', 'en'],
  ] as const)('stored %s, browser %s → %s', (stored, browser, expected) => {
    expect(initialLang(stored, browser)).toBe(expected)
  })

  it('knows the two languages the dictionary has, and nothing else', () => {
    expect(isLang('pl')).toBe(true)
    expect(isLang('en')).toBe(true)
    expect(isLang('de')).toBe(false)
    expect(isLang(undefined)).toBe(false)
  })
})

// No assertion on the slice's starting language: node's `navigator.language`
// is the machine's locale, and `initialLang` above is where the rule lives.
describe('the language slice', () => {
  it('switches when told', () => {
    const store: { lang: LangState } = { lang: createLangSlice((fn) => Object.assign(store, fn(store))) }
    store.lang.setLang('pl')
    expect(store.lang.lang).toBe('pl')
    store.lang.setLang('en')
    expect(store.lang.lang).toBe('en')
  })
})
