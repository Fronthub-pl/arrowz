// Records the SHA-256 of toSvg for every golden case. Run it ONLY on a
// commit whose toSvg is known good; the test then holds every later commit
// to the same bytes.
import { dirname, fromFileUrl, join } from '@std/path'
import { generate, toSvg } from '../engine.ts'
import { SVG_GOLDEN_CASES } from '../svg-golden.ts'

async function sha256(text: string): Promise<string> {
  const bytes = new TextEncoder().encode(text)
  const digest = await crypto.subtle.digest('SHA-256', bytes)
  return [...new Uint8Array(digest)].map((b) => b.toString(16).padStart(2, '0')).join('')
}

const hashes: Record<string, string> = {}
for (const c of SVG_GOLDEN_CASES) {
  const r = generate(c.params, c.gen)
  c.mutate?.(r.board)
  hashes[c.name] = await sha256(toSvg(r.board, c.opts))
}
const out = join(dirname(fromFileUrl(import.meta.url)), '..', 'svg-golden.json')
Deno.writeTextFileSync(out, JSON.stringify({ hashes }, null, 2) + '\n')
console.log(`recorded ${Object.keys(hashes).length} hashes to ${out}`)
