// The compiler already guarantees that EN and PL carry the same keys: the
// tables are `as const satisfies`, so a missing description is TS2741 and a
// stray one TS2353. This file therefore asserts only what a type cannot — that
// a description exists as text and was actually translated. A test that
// re-checks the compiler is a test that cannot fail (the lesson of PR 3b).
import { assert, assertEquals, assertNotEquals } from '@std/assert'
import { dirname, fromFileUrl, join } from '@std/path'
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

// Reading a sibling package from an engine test is established: neutral.test.ts
// walks ../cli the same way, and this package's test target runs with an
// unrestricted --allow-read.
const elementSrc = join(dirname(fromFileUrl(import.meta.url)), '..', 'board-element', 'src')
const modText = Deno.readTextFileSync(join(elementSrc, 'mod.ts'))
const classText = Deno.readTextFileSync(join(elementSrc, 'arrowz-board.ts'))

const sorted = (names: Iterable<string>): string[] => [...names].sort()

/**
 * Every one-line `export type X = …` of the element package. A reference table
 * may spell what an alias stands for rather than its name — `gestureMode` is
 * exactly that: the class returns `GestureMode`, the row says `'drag' | 'click'`,
 * and a reader should not have to go and look the alias up. Measured: that row
 * is the only one of eleven where the two texts differ.
 */
function typeAliases(): Map<string, string> {
  const aliases = new Map<string, string>()
  for (const entry of Deno.readDirSync(elementSrc)) {
    if (!entry.isFile || !entry.name.endsWith('.ts') || entry.name.includes('.test.')) continue
    for (const m of Deno.readTextFileSync(join(elementSrc, entry.name)).matchAll(/^export type (\w+) = (.+)$/gm)) {
      const [, name, body] = m
      if (name !== undefined && body !== undefined) aliases.set(name, body.trim())
    }
  }
  return aliases
}

const ALIASES = typeAliases()

/**
 * An alias resolved to what it stands for, anything else left alone. Applied to
 * BOTH texts being compared, so a table may name the alias or spell it out —
 * and either way the comparison still reads today's definition, which is what
 * keeps the alias itself under the guard: widen `GestureMode` and the rows that
 * spell it go red.
 */
const expand = (text: string): string => ALIASES.get(text) ?? text

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
 * The `detail` an event carries, spelled the way the tables spell it: the field
 * names for a literal, the type's own name when the detail is one (which is
 * what `viewport-change` carries). The event types are one-line aliases, so
 * they are already in ALIASES.
 */
function detailOf(eventType: string): string {
  const alias = ALIASES.get(eventType)
  assert(alias !== undefined, `no type alias for ${eventType}`)
  const inner = /^CustomEvent<([\s\S]+)>$/.exec(alias)?.[1]?.trim()
  assert(inner !== undefined, `${eventType} is not a CustomEvent`)
  if (!inner.startsWith('{')) return inner
  return `{ ${[...inner.matchAll(/(\w+)\s*:/g)].map((m) => m[1] ?? '').join(', ')} }`
}

// The `detail` column, the third blind spot of §3.3: until now an event could
// gain or lose a field of its detail with both gates green.
Deno.test('the event table spells the detail the event type carries', () => {
  const body = interfaceBody(modText, 'HTMLElementEventMap')
  const pairs = [...body.matchAll(/^\s*'([a-z-]+)'\s*:\s*(\w+)/gm)].map((m) => [m[1] ?? '', m[2] ?? ''] as const)
  assert(pairs.length > 0, 'the event map parsed to no types')
  const types = new Map(pairs)
  for (const row of ELEMENT_EVENTS) {
    const eventType = types.get(row.key)
    assert(eventType !== undefined, `no event map entry for ${row.key}`)
    assertEquals(detailOf(eventType), row.detail, `detail of ${row.key}`)
  }
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
 * The one property the class does not `declare`. `lang` is `noAccessor`, so the
 * native HTMLElement.lang stays in force and there is nothing for the class to
 * declare — the property block says exactly that where `lang` is configured.
 * The exception is BY KEY and not by rule: "a property with no declare line" as
 * a class would wave through the next property that simply forgets one.
 */
const NO_DECLARE = new Set(['lang'])

/** The declared type of each public property, read from the `declare` lines of the class. */
function declaredTypes(): Map<string, string> {
  const types = new Map<string, string>()
  for (const m of classText.matchAll(/^ {2}declare (\w+):\s*(.+)$/gm)) {
    const [, key, type] = m
    if (key !== undefined && type !== undefined) types.set(key, type.trim())
  }
  return types
}

// The `type` column, the second blind spot of §3.3: until now a property could
// widen or narrow with both gates green.
Deno.test('the property table spells the type the class declares', () => {
  const types = declaredTypes()
  assert(types.size > 0, 'the declare lines parsed to nothing')
  for (const row of ELEMENT_PROPS) {
    if (NO_DECLARE.has(row.key)) continue
    const declared = types.get(row.key)
    assert(declared !== undefined, `no declare line for ${row.key}`)
    assertEquals(expand(declared), expand(row.type), `type of ${row.key}`)
  }
  // The negative control for the exception above: a key excused here that has
  // since gained a declare line is an excuse left behind, and it would hide a
  // real mismatch for as long as nobody reads this set.
  for (const key of NO_DECLARE) {
    assert(!types.has(key), `${key} has a declare line now — take it out of NO_DECLARE`)
  }
})

/**
 * What a parsed member is: its name, which of the three shapes it has, and the
 * signature as the tables spell it — a method's whole signature, a getter's
 * return type alone, which is what `MemberRow.signature` carries for each.
 */
interface ParsedMember {
  name: string
  kind: 'method' | 'getter' | 'setter'
  signature: string
}

/**
 * Public methods, getters and setters, read as SIGNATURES — a name followed by
 * `(`, or a `get`/`set` accessor. Not "declarations": the class has eleven
 * `declare board: …` lines at the same indentation, and a rule that says
 * "declaration" matches them, along with braces and comments (109 candidates,
 * measured).
 *
 * `private` and `override` are excluded by name. TypeScript erases `private`,
 * so those members are ordinary prototype properties at runtime — which is why
 * this direction has to be read here rather than off the prototype.
 *
 * `public` is optional and explicit. The class writes none today, which is why
 * the pattern shipped without it and dropped `  public foo(` in silence — the
 * one direction this guard exists for, failing open.
 *
 * It takes the text instead of reading the file, so the rules above can be
 * asserted against a fixture. What this parser cannot see it drops in silence —
 * a member it misses is a member it cannot report as undocumented — so the
 * parser needs a test of its own, and the test below is where a missing
 * modifier shows up as a failure rather than as a green guard.
 */
function publicMembers(text: string): ParsedMember[] {
  const members: ParsedMember[] = []
  for (const line of text.split('\n')) {
    const m =
      /^ {2}(?!private\b|override\b|static\b|constructor\b)(?:public\s+)?(?:async\s+)?(?:(get|set)\s+)?(\w+)\s*\(/
        .exec(line)
    if (!m) continue
    const name = m[2]
    if (name === undefined) continue
    const kind = m[1] === 'get' ? 'getter' : m[1] === 'set' ? 'setter' : 'method'
    // From the name to the brace: this drops `public`, `async` and `get`, which
    // the tables do not spell, and keeps the parameters and the return type,
    // which they do. A getter's row is its return type alone, so the head is
    // cut at the first `):` — the one that closes an empty parameter list.
    const whole = line.slice(line.indexOf(name)).replace(/\s*\{\s*$/, '').trim()
    const signature = kind === 'getter' ? whole.slice(whole.indexOf('):') + 2).trim() : whole
    members.push({ name, kind, signature })
  }
  return members
}

// The parser's own rules, against a fixture rather than against the class: the
// class is one sample, and every modifier it happens not to use today is a hole
// nothing would report. `public` is exactly that hole — whole-branch review
// found it — and it is legal TypeScript on every member here.
Deno.test('the member parser reads every modifier a public member may carry', () => {
  const fixture = [
    '  fit(): void {',
    '  public foo(): void {',
    '  public async bar(): Promise<void> {',
    '  async baz(): Promise<void> {',
    '  get viewport(): BoardViewport | null {',
    '  public get qux(): number {',
    '  set width(v: number) {',
    '  private hidden(): void {',
    '  private get playable(): boolean {',
    '  override render() {',
    '  static override get observedAttributes(): string[] {',
    '  constructor() {',
    '  declare board: BoardData | null',
  ].join('\n')
  const found = publicMembers(fixture)
  assertEquals(sorted(found.map((member) => member.name)), ['bar', 'baz', 'fit', 'foo', 'qux', 'viewport', 'width'])
  assertEquals(found.find((member) => member.name === 'viewport')?.kind, 'getter')
  assertEquals(found.find((member) => member.name === 'width')?.kind, 'setter')
  assertEquals(found.find((member) => member.name === 'fit')?.kind, 'method')
  // The signature the row would carry, for each shape the parser accepts: the
  // modifiers are gone, a getter is its return type, a method keeps its head.
  assertEquals(found.find((member) => member.name === 'fit')?.signature, 'fit(): void')
  assertEquals(found.find((member) => member.name === 'bar')?.signature, 'bar(): Promise<void>')
  assertEquals(found.find((member) => member.name === 'viewport')?.signature, 'BoardViewport | null')
  assertEquals(found.find((member) => member.name === 'qux')?.signature, 'number')
})

Deno.test('the member table is the element public surface, both ways', () => {
  const found = publicMembers(classText)
  assert(found.length > 0, 'the class parsed to no signatures')
  assertEquals(sorted(found.map((member) => member.name)), sorted(ELEMENT_MEMBERS.map((row) => row.key)))
  // The `kind` column against the `get` the parser had in hand all along and
  // then threw away. It is the one machine column of this table a text parser
  // can reach — `signature` spells out parameter and return types, which
  // nothing here reads (§3.3) — so a getter turned method is caught, and a
  // public setter reddens rather than passing as a method, because the table
  // has no notation for one.
  for (const row of ELEMENT_MEMBERS) {
    const member = found.find((found) => found.name === row.key)
    assert(member, `no signature for ${row.key}`)
    assertEquals(member.kind, row.kind, `kind of ${row.key}`)
  }
})

// The `signature` column itself, which §3.3 of the PR 6 spec named as a blind
// spot: until now a parameter could change its type, or a method its return,
// with both gates green.
Deno.test('the member table spells the signature the class declares', () => {
  assert(ALIASES.size > 0, 'no type aliases were parsed — the comparison below would be text against text')
  const found = publicMembers(classText)
  for (const row of ELEMENT_MEMBERS) {
    const member = found.find((member) => member.name === row.key)
    assert(member, `no signature for ${row.key}`)
    assertEquals(expand(member.signature), expand(row.signature), `signature of ${row.key}`)
  }
})
