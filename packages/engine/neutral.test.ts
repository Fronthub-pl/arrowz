// The runtime-neutral modules must stay importable from a browser and from
// Angular: no Deno, DOM, Node or process API. The compiler keeps DOM out
// (no dom lib outside lab-page.ts); this test keeps the rest out.
import { dirname, fromFileUrl, join } from '@std/path'
import { assert } from '@std/assert'

const NEUTRAL = ['mod.ts', 'types.ts', 'engine.ts', 'command.ts', 'lab-simple.ts', 'lab-presets.ts', 'lab-i18n.ts']
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
