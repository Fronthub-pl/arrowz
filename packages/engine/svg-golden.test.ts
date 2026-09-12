// toSvg must stay byte-identical: the CLI test, the README images and the
// board element's geometry all assume the shapes it draws never drift.
import { assertEquals, assertStringIncludes } from '@std/assert'
import { dirname, fromFileUrl, join } from '@std/path'
import { generate, toSvg } from './engine.ts'
import { SVG_GOLDEN_CASES } from './svg-golden.ts'

const golden = JSON.parse(Deno.readTextFileSync(join(dirname(fromFileUrl(import.meta.url)), 'svg-golden.json'))) as {
  hashes: Record<string, string>
}

async function sha256(text: string): Promise<string> {
  const digest = await crypto.subtle.digest('SHA-256', new TextEncoder().encode(text))
  return [...new Uint8Array(digest)].map((b) => b.toString(16).padStart(2, '0')).join('')
}

for (const c of SVG_GOLDEN_CASES) {
  Deno.test(`toSvg golden ${c.name} keeps its recorded hash`, async () => {
    const r = generate(c.params, c.gen)
    c.mutate?.(r.board)
    const svg = toSvg(r.board, c.opts)
    assertEquals(await sha256(svg), golden.hashes[c.name])
    // The mutated case exists to reach the void strips: prove they are drawn.
    if (c.name === 'voids-strips') assertStringIncludes(svg, 'fill="#e8467c" fill-opacity=".22"')
  })
}
