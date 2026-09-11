// The golden set recorded from Node on 2026-09-09 before the Deno rewrite:
// the same command must give the same board on every runtime, forever.
import { assert, assertEquals } from '@std/assert'
import { dirname, fromFileUrl, join } from '@std/path'
import { defaultParams, fingerprint, generate } from './engine.ts'
import { parseArgs, parseSimpleArgs } from './command.ts'
import { simpleParams } from './lab-simple.ts'
import { decodeBoard, encodeBoard } from './board-file.ts'
import type { GenerateOptions, Params } from './types.ts'

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
  if (c.argv === null) return { ...defaultParams(), W: 40, H: 40, seed: 1 }
  if (c.argv.includes('--advanced')) {
    return parseArgs(c.argv.filter((a) => a !== '--advanced' && a !== '--dry-run')).params
  }
  return simpleParams(parseSimpleArgs(c.argv).choice)
}

/** The case without an argv is the void board: voids and the escape hatch are options, not knobs. */
function optsOf(c: GoldenCase): GenerateOptions {
  return c.argv === null ? { unchecked: true, voidFrac: 0.1 } : {}
}

// Every recorded board is checked, big500 included: it costs about 1.3 s per
// run, which is worth paying to keep the whole golden set under guard.
// The file of the largest golden board, measured when the format was made
// (2026-09-11). The encoding is deterministic, so this is its exact size; a
// ceiling rather than an equality, so a tighter encoding still passes.
const BIG500_FILE_BYTES = 221956

for (const c of golden.cases) {
  Deno.test(`golden board ${c.name} reproduces the fingerprint recorded on Node and survives the board file`, () => {
    const r = generate(paramsOf(c), optsOf(c))
    assertEquals(fingerprint(r.board), c.fingerprint)
    assertEquals(r.board.pieces.length, c.pieces)
    // The unchecked case records no maxLen — it has no metrics.
    if (c.maxLen !== null) assertEquals(r.metrics?.maxLen, c.maxLen)
    // The file keeps the fingerprint, and the ids the fingerprint cannot see.
    const text = JSON.stringify(encodeBoard(r.board))
    const back = decodeBoard(JSON.parse(text))
    assertEquals(fingerprint(back), c.fingerprint)
    assertEquals(back.pieces.map((p) => p.id), r.board.pieces.map((p) => p.id))
    if (c.name === 'big500') {
      assert(text.length <= BIG500_FILE_BYTES, `big500 file grew to ${text.length} bytes`)
    }
  })
}
