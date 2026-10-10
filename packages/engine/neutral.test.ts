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
  'palette.ts',
  'look.ts',
  'command.ts',
  'lab-simple.ts',
  'lab-presets.ts',
  'lab-i18n.ts',
  'lab-report.ts',
  'lab-docs.ts',
  'game.ts',
  'board-file.ts',
  'comment-lines.ts',
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

// Nothing in the CLI package may reach for a browser. `Deno.` is not among
// these patterns: the report, the store server and the scripts are Deno programs.
const DOM_ONLY = [/\bdocument\./, /\bwindow\./, /\blocalStorage\b/, /\bHTMLElement\b/, /\bnavigator\./]

/** The files bundled into the published `arrowz`, which Node runs. */
const NODE_PROGRAM = ['arrowz.ts', 'carve.ts', 'store.ts', 'exit.ts']
// `import.meta.main` is refused with the Deno API: Node has it only from 22.18.
const DENO_ONLY = [/\bDeno\./, /\bimport\.meta\.main\b/, /from 'jsr:/]

Deno.test('the files of the published CLI use no Deno API', () => {
  const cli = join(dirname(fromFileUrl(import.meta.url)), '..', 'cli')
  for (const name of NODE_PROGRAM) {
    const text = Deno.readTextFileSync(join(cli, name))
    for (const re of DENO_ONLY) assert(!re.test(text), `packages/cli/${name} matches ${re}`)
  }
})

Deno.test('every file the published CLI imports is one of its own, the engine or a Node built-in', () => {
  const cli = join(dirname(fromFileUrl(import.meta.url)), '..', 'cli')
  for (const name of NODE_PROGRAM) {
    const text = Deno.readTextFileSync(join(cli, name))
    const specifiers = [...text.matchAll(/(?:from|import\()\s*'([^']+)'/g)].map((m) => m[1] ?? '')
    for (const s of specifiers) {
      const local = s.startsWith('./') && NODE_PROGRAM.includes(s.slice(2))
      assert(
        local || s.startsWith('node:') || /^@fronthub\/arrowz-engine(\/(command|simple))?$/.test(s),
        `${name}: ${s}`,
      )
    }
  }
})

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
