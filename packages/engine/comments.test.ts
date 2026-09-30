// Guards the comment rule in CLAUDE.md ("Comments say why, once, in the
// fewest lines") over the lab, the board element, the engine and the CLI:
// no history markers in comment text, no block over 6 lines, and no module or
// API header over 24. Only comment text is scanned, so test names and
// dictionary strings may name a round or a ruling freely. Two blind spots: an
// apostrophe in JSX text hides a comment later on its line, and a bare URL in
// JSX text reads as a `//` comment.
import { dirname, fromFileUrl, join, relative, SEPARATOR } from '@std/path'
import { assert, assertEquals } from '@std/assert'
import { commentBlocks, commentLines, MAX_BLOCK, MAX_HEADER } from './comment-lines.ts'

export const MARKERS = [
  /\bPR ?#?\d/,
  /\b[Rr]ound \d/,
  /\bRuling [0-9A-Z]/,
  /harness fact|\(fact \d/,
  /[Rr]eview round/,
  /\b[\w-]+\.(ts|tsx|css|mjs):\d+/,
  /\bTask \d/,
  /\b[Hh]andoff \d/,
  /\b(main|commit) \(?[0-9a-f]{7,40}\b/,
  // Bare plan-ruling tags (an R and a number). Measured over the scoped corpus: every
  // hit was a ruling or spec-item reference, none a CSS/colour/math identifier,
  // so the plain form needs no narrowing.
  /\bR\d+\b/,
]

// A `/** */` block is an API header when the next non-blank line opens one of these: a declaration,
// a method (its line holds `):` or ends with `{` without an arrow) or a property signature.
const DECLARATION = new RegExp(
  [
    String.raw`^(export|default|declare|function|class|abstract|const|let|var|interface|type|enum|namespace)\b`,
    String.raw`^(async\s+)?function\b`,
    String.raw`^(public|private|protected|static|readonly|override|get|set|async)\s`,
    String.raw`^#?[\w$]+\??\s*:`,
    String.raw`^['"][^'"]*['"]\??\s*:`,
  ].join('|'),
)
const METHOD = /^(?!(if|for|while|switch|catch|return|await|new)\b)#?[\w$]+\s*(<[^>]*>)?\(/

export function isDeclaration(line: string): boolean {
  const t = line.trim()
  if (DECLARATION.test(t)) return true
  return METHOD.test(t) && (t.includes('):') || (t.endsWith('{') && !t.includes('=>')))
}

export type Offence = { line: number; kind: 'marker' | 'block'; what: string }

/** Offences of one file, in line order. */
export function offences(source: string, css: boolean): Offence[] {
  const found: Offence[] = []
  const comments = commentLines(source, css)
  for (const c of comments) {
    for (const re of MARKERS) {
      if (re.test(c.text)) found.push({ line: c.line, kind: 'marker', what: `${re} ${c.text.trim()}` })
    }
  }
  // A block is a run of consecutive comment-only lines. A header is the file's first block, or a
  // JSDoc block right above a declaration; headers may run to MAX_HEADER lines, other blocks to MAX_BLOCK.
  const src = source.split('\n')
  let firstBlock = true
  for (const b of commentBlocks(source, css)) {
    const size = b.end - b.start + 1
    const jsdoc = src.slice(b.start - 1, b.end).some((l) => l.trim().startsWith('/**'))
    const after = src.slice(b.end).find((l) => l.trim() !== '')
    const header = firstBlock || (jsdoc && after !== undefined && isDeclaration(after))
    const max = header ? MAX_HEADER : MAX_BLOCK
    if (size > max) {
      const label = header ? 'header block' : 'block'
      found.push({ line: b.start, kind: 'block', what: `${label} of ${size} lines (max ${max})` })
    }
    firstBlock = false
  }
  return found.sort((a, b) => a.line - b.line)
}

const here = dirname(fromFileUrl(import.meta.url))
const root = join(here, '..', '..')

function walk(dir: string, exts: string[], out: string[]) {
  for (const e of Deno.readDirSync(dir)) {
    const path = join(dir, e.name)
    if (e.isDirectory && e.name !== 'node_modules' && e.name !== 'dist') walk(path, exts, out)
    else if (e.isFile && exts.some((x) => e.name.endsWith(x))) out.push(path)
  }
}

function scopedFiles(): string[] {
  const files: string[] = []
  walk(join(root, 'apps', 'lab', 'src'), ['.ts', '.tsx', '.css'], files)
  walk(join(root, 'packages', 'board-element', 'src'), ['.ts'], files)
  walk(here, ['.ts', '.mjs'], files)
  walk(join(root, 'packages', 'cli'), ['.ts'], files)
  return files.sort()
}

function report(kind: Offence['kind']): string[] {
  const lines: string[] = []
  for (const file of scopedFiles()) {
    const found = offences(Deno.readTextFileSync(file), file.endsWith('.css'))
    for (const o of found) {
      if (o.kind !== kind) continue
      lines.push(`${relative(root, file)}:${o.line} ${o.what}`)
    }
  }
  return lines
}

Deno.test('the comment guard walks the lab, the board element, the engine and the CLI', () => {
  const files = scopedFiles()
  assert(files.length > 220, `only ${files.length} files found: the walk is wrong`)
  assert(files.some((f) => f.endsWith('.css')), 'no stylesheet found: the walk is wrong')
  for (
    const f of [
      'engine/lab-i18n.ts',
      'engine/engine.ts',
      'engine/scripts/node-smoke.mjs',
      'cli/carve.ts',
      'cli/scripts/jev-guard.ts',
    ]
  ) {
    assert(files.some((p) => p.endsWith(f.split('/').join(SEPARATOR))), `${f} not found: the walk is wrong`)
  }
  assert(!files.some((f) => f.includes(`${join('engine', 'dist')}`)), 'the walk entered the engine build output')
})

Deno.test({
  name: 'comments carry no history markers',
  fn: () => {
    const found = report('marker')
    assert(found.length === 0, `${found.length} comment markers:\n${found.join('\n')}`)
  },
})

Deno.test({
  name: `comment blocks stay within ${MAX_BLOCK} lines, headers within ${MAX_HEADER}`,
  fn: () => {
    const found = report('block')
    assert(found.length === 0, `${found.length} long comment blocks:\n${found.join('\n')}`)
  },
})

Deno.test('extractor: a // inside a string or a URL is not a comment', () => {
  assertEquals(commentLines('const a = \'// PR 5\'\nconst u = "https://x.dev/PR 5"'), [])
  assertEquals(offences("it('Ruling 6 and round 3', () => {})", false), [])
})

Deno.test('extractor: a trailing comment counts, and only its comment part', () => {
  assertEquals(commentLines("const a = 'round 1' // PR 5 fixed this"), [
    { line: 1, text: ' PR 5 fixed this', alone: false },
  ])
  assertEquals(offences("const a = 'round 1' // PR 5", false).length, 1)
})

Deno.test('extractor: template literals, including nested ones, are code', () => {
  assertEquals(commentLines('const t = `a ${f(`// PR 5`)} // round 2 ${x}`\n'), [])
  assertEquals(commentLines('const t = `${a}` // PR 5\n').map((c) => c.line), [1])
})

Deno.test('extractor: regex literals with quotes or slashes are code', () => {
  assertEquals(commentLines("const r = /'/\nconst s = /https:\\/\\//g // round 4"), [
    { line: 2, text: ' round 4', alone: false },
  ])
  assertEquals(commentLines('const half = a / 2 // Ruling A').map((c) => c.text), [' Ruling A'])
})

Deno.test('extractor: JSX {/* */} and CSS /* */ are comments, CSS // is not', () => {
  assertEquals(offences('<div>\n  {/* PR 5 */}\n</div>', false).map((o) => o.line), [2])
  assertEquals(offences('</div> {/* round 2 */}', false).length, 1)
  assertEquals(offences('a { b: url(https://x/PR 5); }\n/* see shell.css:12 */', true).map((o) => o.line), [2])
})

Deno.test('rule: task labels are markers, a task queue is not', () => {
  assertEquals(offences('// Task 7 changed the layout', false).length, 1)
  assertEquals(offences('// the task queue drains here', false).length, 0)
})

Deno.test('rule: handoff labels are markers, an ordinary handoff is not', () => {
  assertEquals(offences('// handoff 2 moved this drawer', false).length, 1)
  assertEquals(offences('// a smooth handoff between threads', false).length, 0)
})

Deno.test('rule: a commit on main is a marker, a hex colour is not', () => {
  assertEquals(offences('// copied verbatim from main f200c6c', false).length, 1)
  assertEquals(offences('// recorded on main (96b9d4a) before the envelope', false).length, 1)
  assertEquals(offences('// the paper is #f200c6c in the main palette', false).length, 0)
})

Deno.test('rule: a bare plan-ruling tag is a marker, a run-together identifier is not', () => {
  assertEquals(offences('// spec R7 forbids hiding the readout', false).length, 1)
  assertEquals(offences('// the IR2 sensor reads infrared', false).length, 0)
})

const lines = (k: number, text: string) => Array.from({ length: k }, () => text).join('\n')
const jsdoc = (k: number) => ['/**', ...Array.from({ length: k - 2 }, () => ' * why'), ' */'].join('\n')

Deno.test('rule: a mid-file block over 6 lines fails, the first block is a header', () => {
  assertEquals(offences(`${lines(20, '// why')}\ncode()\n${lines(6, '// why')}\ncode()`, false), [])
  assertEquals(offences(`// h\ncode()\n${lines(7, '// why')}\ncode()`, false).map((o) => o.line), [3])
  assertEquals(offences(`${lines(25, '// why')}\ncode()`, false).map((o) => o.what), [
    'header block of 25 lines (max 24)',
  ])
  // A blank line ends a block, so two runs of 6 are two blocks.
  assertEquals(offences(`// h\ncode()\n${lines(6, '// why')}\n\n${lines(6, '// why')}`, false), [])
})

Deno.test('rule: a JSDoc block above a declaration is a header of up to 24 lines', () => {
  assertEquals(offences(`// h\ncode()\n${jsdoc(8)}\nexport function f() {}`, false), [])
  assertEquals(offences(`// h\ncode()\n${jsdoc(24)}\n\n  readonly x: number`, false), [])
  assertEquals(offences(`// h\ncode()\n${jsdoc(25)}\nexport const a = 1`, false).map((o) => o.what), [
    'header block of 25 lines (max 24)',
  ])
  assertEquals(offences(`// h\ncode()\n${jsdoc(7)}\n\nrender(root)`, false).map((o) => o.line), [3])
  assertEquals(offences(`// h\ncode()\n${lines(8, '// why')}\nexport const a = 1`, false).length, 1)
})

Deno.test('rule: what counts as a declaration after a JSDoc block', () => {
  const yes = [
    'export function f() {}',
    'export default App',
    'function f(a: number) {',
    'async function f() {',
    'const a = 1',
    'let b',
    'interface I {',
    'type T = number',
    'class C {',
    '  private x = 1',
    '  static make(): C {',
    '  get size() {',
    '  measure(a: number): number {',
    '  paint() {',
    '  onChange?: (v: string) => void',
    '  label: string',
    "  'aria-label': string",
    '  #timer: number | undefined',
  ]
  const no = [
    'render(root)',
    'useEffect(() => {',
    'if (a) {',
    "it('works', () => {",
    'expect(a).toBe(1)',
    'x = 5',
    'return a',
    'await flush()',
  ]
  for (const line of yes) assert(isDeclaration(line), `should be a declaration: ${line}`)
  for (const line of no) assert(!isDeclaration(line), `should not be a declaration: ${line}`)
})
