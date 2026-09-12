// The golden set recorded from Node on 2026-09-09 before the Deno rewrite:
// the same command must give the same board on every runtime, forever.
import { assert, assertEquals } from '@std/assert'
import { dirname, fromFileUrl, join } from '@std/path'
import { defaultParams, fingerprint, generate } from './engine.ts'
import { parseArgs } from './command.ts'
import { decodeBoard, encodeBoard } from './board-file.ts'
import type { GenerateOptions, Params } from './types.ts'

interface GoldenCase {
  name: string
  argv: string[] | null
  fingerprint: string
  pieces: number
  maxLen: number | null
  /**
   * The measurement options of R1 and R2, which have no flag yet. A case that
   * carries them records a board no command can ask for; when they become
   * knobs the case moves to an argv and the fingerprint must not move with it.
   */
  opts?: { trapBias?: number; backbite?: number }
}
const golden = JSON.parse(Deno.readTextFileSync(join(dirname(fromFileUrl(import.meta.url)), 'fingerprints.json'))) as {
  cases: GoldenCase[]
}

function paramsOf(c: GoldenCase): Params {
  if (c.argv === null) return { ...defaultParams(), W: 40, H: 40, seed: 1 }
  const parsed = parseArgs(c.argv.filter((a) => a !== '--dry-run'))
  if (parsed.errors.length) throw new Error(`${c.name}: ${parsed.errors.join('; ')}`)
  return parsed.params
}

/** The case without an argv is the void board: voids and the escape hatch are options, not knobs. */
function optsOf(c: GoldenCase): GenerateOptions {
  const base: GenerateOptions = c.argv === null ? { unchecked: true, voidFrac: 0.1 } : {}
  return c.opts ? { ...base, ...c.opts } : base
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

Deno.test("the trap lever at 0 is today's board, cell for cell", () => {
  // The other half of the pair. `trap-off` carries the same argv as `tunnels`
  // and the lever switched off, so the two must hash the same: at 0 the carver
  // takes no branch and makes no draw, and the knob's whole claim to being
  // safe to ship rests on that. Recording it as its own case means a change
  // that quietly costs a draw at 0 fails here by name, rather than moving nine
  // unrelated golden boards at once.
  const byName = (n: string): GoldenCase => {
    const c = golden.cases.find((x) => x.name === n)
    if (!c) throw new Error(`no golden case ${n}`)
    return c
  }
  const off = byName('trap-off'), plain = byName('tunnels')
  assertEquals(off.argv, plain.argv, 'trap-off must ask for the same board as tunnels')
  assertEquals(off.fingerprint, plain.fingerprint)
  assertEquals(off.pieces, plain.pieces)
  // And the on-cases must differ from it, or the pair would prove nothing.
  for (const n of ['trap-seek', 'trap-avoid']) {
    assert(byName(n).fingerprint !== off.fingerprint, `${n} carved the same board as off`)
  }
})
