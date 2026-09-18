// The compiler already guarantees that EN and PL carry the same keys: the
// tables are `as const satisfies`, so a missing description is TS2741 and a
// stray one TS2353. This file therefore asserts only what a type cannot — that
// a description exists as text and was actually translated. A test that
// re-checks the compiler is a test that cannot fail (the lesson of PR 3b).
import { assert, assertNotEquals } from '@std/assert'
import { type Docs, docsFor, ELEMENT_EVENTS, ELEMENT_MEMBERS, ELEMENT_PROPS } from './lab-docs.ts'

Deno.test('every row has a description in both languages, and none is empty', () => {
  const en = docsFor('en')
  const pl = docsFor('pl')
  for (const row of ELEMENT_PROPS) {
    assert(en.props[row.key].trim().length > 0, `EN prop ${row.key}`)
    assert(pl.props[row.key].trim().length > 0, `PL prop ${row.key}`)
  }
  for (const row of ELEMENT_MEMBERS) {
    assert(en.members[row.key].trim().length > 0, `EN member ${row.key}`)
    assert(pl.members[row.key].trim().length > 0, `PL member ${row.key}`)
  }
  for (const row of ELEMENT_EVENTS) {
    assert(en.events[row.key].trim().length > 0, `EN event ${row.key}`)
    assert(pl.events[row.key].trim().length > 0, `PL event ${row.key}`)
  }
})

// A Polish description equal to the English one is an untranslated string that
// the compiler is happy with: same key, same type, wrong language.
Deno.test('no Polish description is a copy of its English source', () => {
  const en = docsFor('en')
  const pl = docsFor('pl')
  for (const row of ELEMENT_PROPS) assert(pl.props[row.key] !== en.props[row.key], `prop ${row.key}`)
  for (const row of ELEMENT_MEMBERS) assert(pl.members[row.key] !== en.members[row.key], `member ${row.key}`)
  for (const row of ELEMENT_EVENTS) assert(pl.events[row.key] !== en.events[row.key], `event ${row.key}`)
})

// The frame around the tables — the leads, the section headings, the column
// labels, the README pointer — is text too, and the three tests above do not
// touch it: they walk rows. Measured during review, every one of those strings
// could have stayed English in the Polish docs with nothing going red.
//
// The key list is derived from the object rather than written out, so a field
// added to `Docs` later cannot slip past this test the way the whole frame
// slipped past the ones above.
Deno.test('the frame around the tables is translated too', () => {
  const en = docsFor('en')
  const pl = docsFor('pl')
  const frame = (Object.keys(en) as (keyof Docs)[]).filter((key) => typeof en[key] === 'string')
  assert(frame.length > 10, `only ${frame.length} frame strings found — the filter is wrong`)
  for (const key of frame) {
    const enText = en[key]
    const plText = pl[key]
    if (typeof enText !== 'string' || typeof plText !== 'string') continue
    assert(enText.trim().length > 0, `EN ${key}`)
    assert(plText.trim().length > 0, `PL ${key}`)
    assertNotEquals(plText, enText, `${key} is still English in the Polish docs`)
  }
})
