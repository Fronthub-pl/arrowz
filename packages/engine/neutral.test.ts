// The runtime-neutral modules must stay importable from a browser and from
// Angular: no Deno, DOM, Node or process API. The compiler keeps DOM out of
// them; this test keeps the rest out, and the test below keeps the DOM out of
// the CLI package too.
import { dirname, fromFileUrl, join } from '@std/path'
import { assert } from '@std/assert'

const NEUTRAL = [
  'mod.ts',
  'types.ts',
  'engine.ts',
  'geometry.ts',
  'colors.ts',
  'command.ts',
  'lab-simple.ts',
  'lab-presets.ts',
  'lab-i18n.ts',
  'lab-report.ts',
  'lab-docs.ts',
  'game.ts',
  'board-file.ts',
]
// `document.` is matched with the dot, not as a bare word: the engine comments
// use the English word "document", which a `\bdocument\b` pattern would flag.
const FORBIDDEN = [
  /\bDeno\./,
  /\bdocument\./,
  /\bwindow\./,
  /\blocalStorage\b/,
  /\bprocess\./,
  /from 'node:/,
  /\bBuffer\./,
]

Deno.test('runtime-neutral modules use no Deno, DOM, Node or process API', () => {
  const here = dirname(fromFileUrl(import.meta.url))
  for (const name of NEUTRAL) {
    const file = join(here, name)
    const text = Deno.readTextFileSync(file)
    for (const re of FORBIDDEN) assert(!re.test(text), `${name} matches ${re}`)
  }
})

// The rule "the dom lib belongs to no file here" used to carry an exception,
// and an exception cannot be tested. It has none now, so the rule becomes a
// test: nothing in the CLI package may reach for a browser. `Deno.` is
// deliberately not among the patterns — that package is a Deno program.
const DOM_ONLY = [/\bdocument\./, /\bwindow\./, /\blocalStorage\b/, /\bHTMLElement\b/, /\bnavigator\./]

Deno.test('no file in packages/cli reaches for the DOM', () => {
  const cli = join(dirname(fromFileUrl(import.meta.url)), '..', 'cli')
  const files = [...Deno.readDirSync(cli)]
    .filter((e) => e.isFile && e.name.endsWith('.ts'))
    .map((e) => e.name)
  assert(files.length > 5, `only ${files.length} TypeScript files found in packages/cli: the walk is wrong`)
  for (const name of files) {
    const text = Deno.readTextFileSync(join(cli, name))
    for (const re of DOM_ONLY) assert(!re.test(text), `packages/cli/${name} matches ${re}`)
  }
})
