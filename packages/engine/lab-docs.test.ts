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

import { assertEquals } from '@std/assert'
import { dirname, fromFileUrl, join } from '@std/path'

// Reading a sibling package from an engine test is established: neutral.test.ts
// walks ../cli the same way, and this package's test target runs with an
// unrestricted --allow-read.
const elementSrc = join(dirname(fromFileUrl(import.meta.url)), '..', 'board-element', 'src')
const modText = Deno.readTextFileSync(join(elementSrc, 'mod.ts'))
const classText = Deno.readTextFileSync(join(elementSrc, 'arrowz-board.ts'))

const sorted = (names: Iterable<string>): string[] => [...names].sort()

/**
 * The body of one `interface X { … }` block. The end is the first closing brace
 * after the header, NOT a brace at some indentation: `mod.ts` declares two
 * interfaces inside one `declare global`, and an indentation rule breaks the
 * moment either of them moves. An unbounded search is worse still — it would
 * swallow `'arrowz-board': ArrowzBoard` from HTMLElementTagNameMap next door.
 */
function interfaceBody(text: string, name: string): string {
  const head = text.indexOf(`interface ${name} {`)
  assert(head >= 0, `no interface ${name}`)
  const open = text.indexOf('{', head)
  const close = text.indexOf('}', open)
  assert(close > open, `interface ${name} is not closed`)
  return text.slice(open + 1, close)
}

Deno.test('the event table is the element event map, both ways', () => {
  const body = interfaceBody(modText, 'HTMLElementEventMap')
  const found = [...body.matchAll(/^\s*'([a-z-]+)'\s*:/gm)].map((m) => m[1] ?? '')
  // A parser that silently matches nothing would compare two empty sets against
  // a documented table and only half of this test would notice.
  assert(found.length > 0, 'the event map parsed to nothing')
  assertEquals(sorted(found), sorted(ELEMENT_EVENTS.map((row) => row.key)))
})

/**
 * The keys of `static properties` that are not internal reactive state. Read
 * from the declaration and not from the class at runtime: Lit rewrites these
 * objects in place when it finalises the class, adding `attribute: false` to
 * every `state` entry, so the runtime shape is not what the author wrote.
 */
function declaredProps(): { key: string; attribute: string | null }[] {
  const body = classText.slice(classText.indexOf('static override properties = {'))
  const block = body.slice(0, body.indexOf('\n  }'))
  const rows: { key: string; attribute: string | null }[] = []
  // Entry by entry rather than line by line. `deno fmt` breaks any entry past
  // 120 columns across several lines, and a line-based reader would then stop
  // seeing that property — silently, since a property it cannot see is a
  // property it cannot report as undocumented. Measured during review:
  // `pointRadius` is already at 94 columns.
  for (const m of block.matchAll(/^\s{4}(\w+):\s*\{([\s\S]*?)\},\s*$/gm)) {
    const [, key, opts] = m
    if (key === undefined || opts === undefined) continue
    if (/\bstate:\s*true\b/.test(opts)) continue
    const named = /attribute:\s*'([a-z-]+)'/.exec(opts)
    const off = /attribute:\s*false/.test(opts)
    rows.push({ key, attribute: off ? null : (named?.[1] ?? key.toLowerCase()) })
  }
  return rows
}

Deno.test('the property table is the element declaration, both ways', () => {
  const declared = declaredProps()
  assert(declared.length > 0, 'the property block parsed to nothing')
  assertEquals(sorted(declared.map((r) => r.key)), sorted(ELEMENT_PROPS.map((r) => r.key)))
  for (const row of ELEMENT_PROPS) {
    const found = declared.find((r) => r.key === row.key)
    assert(found, `no declaration for ${row.key}`)
    assertEquals(row.attribute, found.attribute, `attribute of ${row.key}`)
  }
})

/**
 * Public methods and getters, read as SIGNATURES — a name followed by `(`, or a
 * `get`/`set` accessor. Not "declarations": the class has eleven `declare board:
 * …` lines at the same indentation, and a rule that says "declaration" matches
 * them, along with braces and comments (109 candidates, measured).
 *
 * `private` and `override` are excluded by name. TypeScript erases `private`,
 * so those members are ordinary prototype properties at runtime — which is why
 * this direction has to be read here rather than off the prototype.
 */
function publicSignatures(): string[] {
  const names: string[] = []
  for (const line of classText.split('\n')) {
    const m = /^ {2}(?!private\b|override\b|static\b|constructor\b)(?:async\s+)?(?:(get|set)\s+)?(\w+)\s*\(/.exec(line)
    if (!m) continue
    const name = m[2]
    if (name !== undefined) names.push(name)
  }
  return names
}

Deno.test('the member table is the element public surface, both ways', () => {
  const found = publicSignatures()
  assert(found.length > 0, 'the class parsed to no signatures')
  assertEquals(sorted(found), sorted(ELEMENT_MEMBERS.map((row) => row.key)))
})
