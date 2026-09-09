// The golden set recorded from Node on 2026-09-09 before the Deno rewrite:
// the same command must give the same board on every runtime, forever.
import { assertEquals } from '@std/assert'
import { dirname, fromFileUrl, join } from '@std/path'
import { defaultParams, fingerprint, generate } from './engine.ts'
import { parseArgs, parseSimpleArgs } from './command.ts'
import { simpleParams } from './lab-simple.ts'
import type { Params } from './types.ts'

interface GoldenCase {
  name: string
  argv: string[] | null
  fingerprint: string
  pieces: number
  maxLen: number | null
}
const golden = JSON.parse(Deno.readTextFileSync(join(dirname(fromFileUrl(import.meta.url)), 'fingerprints.json'))) as {
  cases: GoldenCase[]
}

function paramsOf(c: GoldenCase): Params {
  if (c.argv === null) return { ...defaultParams(), W: 40, H: 40, seed: 1, voidFrac: 0.1 }
  if (c.argv.includes('--advanced')) {
    return parseArgs(c.argv.filter((a) => a !== '--advanced' && a !== '--dry-run')).params
  }
  return simpleParams(parseSimpleArgs(c.argv).choice)
}

// Every recorded board is checked, big500 included: it costs about 1.3 s per
// run, which is worth paying to keep the whole golden set under guard.
for (const c of golden.cases) {
  Deno.test(`golden board ${c.name} reproduces the fingerprint recorded on Node`, () => {
    const r = generate(paramsOf(c), { unchecked: c.argv === null })
    assertEquals(fingerprint(r.board), c.fingerprint)
    assertEquals(r.board.pieces.length, c.pieces)
    // The unchecked case records no maxLen — it has no metrics.
    if (c.maxLen !== null) assertEquals(r.metrics?.maxLen, c.maxLen)
  })
}
