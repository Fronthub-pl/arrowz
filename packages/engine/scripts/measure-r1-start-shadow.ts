/**
 * Two gaps the R1 sweeps left open, both of them about paths no recorded row
 * ever took.
 *
 * A. DOES trapBias SHADOW `--start`? The ranking branch is a chain:
 *    `if (trapBias !== 0) ... else if (freeBias !== 0) ... else if (bias !== 0)`
 *    (engine.ts), and `bias` is the only place the carver ever reads
 *    `headBias` — and it reads it only while `mix` is below 0 (the RULES entry
 *    `startPair` says as much). So with the trap lever on, `--start` should
 *    have no effect at all, and because no draw is made for it either, the
 *    boards should be identical DOWN TO THE FINGERPRINT. That is a sharper
 *    check than any statistic: if the three `--start` settings collapse onto
 *    one hash, the flag is provably dead and the pair needs an `inactive`
 *    reason (or the ranking needs to become a secondary key). `mix` is swept
 *    too, because there the draw IS made and only its result is thrown away:
 *    the board id should change while the ranking does not.
 *
 * B. HAS THE UNDO PATH EVER RUN? Every recorded trapBias row has
 *    `backtracks: 0`, so `refreshHomo`'s rebuild branch (`upTo < from`) has
 *    never executed in a measurement. The two families below are the repo's
 *    known backtracking boards (absorb.test.ts): they are re-run with the trap
 *    lever on, and the line table is checked against a from-scratch fold of the
 *    finished board. A stale entry left behind by an undo shows up as a
 *    mismatch.
 *
 * Both parts run at small sizes on purpose: they ask whether a path is taken
 * and whether it is correct, not how a metric scales.
 *
 * Run: deno run --allow-read --allow-write packages/engine/scripts/measure-r1-start-shadow.ts [out]
 */
import { analyse, Carver, defaultParams, fingerprint, mulberry32 } from '../engine.ts'
import type { Params } from '../types.ts'

/** Indexing a typed-array list under noUncheckedIndexedAccess. */
function line(list: Int32Array[], d: number): Int32Array {
  const v = list[d]
  if (!v) throw new Error(`no line table for direction ${d}`)
  return v
}

function cellAt(list: Int32Array, i: number): number {
  const v = list[i]
  if (v === undefined) throw new Error(`index ${i} out of range`)
  return v
}

type ShadowRow = {
  part: 'shadow'
  start: string
  headBias: number
  mix: number
  trapBias: number
  seed: number
  side: number
  ok: boolean
  fingerprint: string
  N: number | null
  f0abs: number | null
  almost: number | null
}

type UndoRow = {
  part: 'undo'
  family: string
  trapBias: number
  seed: number
  side: number
  ok: boolean
  backtracks: number
  /** lines whose folded value disagrees with a from-scratch fold of the board */
  homoMismatch: number
  homoLines: number
}

/**
 * Folds the finished board into a fresh line table the same way refreshHomo
 * does, and compares it with the one the carver maintained incrementally.
 */
function homoMismatch(c: Carver): { mismatch: number; lines: number } {
  if (!c.lineHomo.length) return { mismatch: 0, lines: 0 }
  let mismatch = 0
  let lines = 0
  for (let d = 0; d < 4; d++) {
    const nLines = d === 0 || d === 2 ? c.W : c.H
    const front = line(c.depth, d)
    const homo = line(c.lineHomo, d)
    for (let ln = 0; ln < nLines; ln++) {
      lines++
      let want = -1
      const upTo = cellAt(front, ln)
      for (let k = 0; k < upTo; k++) {
        const cell = c.prefixCell(d, ln, k)
        const o = cellAt(c.owner, c.idx(cell.x, cell.y))
        if (o < 0) continue
        if (want === -1) want = o
        else if (want !== o && want !== -2) want = -2
      }
      if (cellAt(homo, ln) !== want) mismatch++
    }
  }
  return { mismatch, lines }
}

function shadow(out: (row: ShadowRow) => void): void {
  const side = 200
  const starts: { start: string; over: Partial<Params> }[] = [
    { start: 'square', over: {} },
    { start: 'tunnels', over: { headBias: 1 } },
    { start: 'layers', over: { headBias: -1 } },
    { start: 'mix 0.5', over: { mix: 0.5 } },
  ]
  for (const trapBias of [0, -1, 1]) {
    for (const s of starts) {
      for (let seed = 1; seed <= 3; seed++) {
        const p: Params = { ...defaultParams(), W: side, H: side, seed, ...s.over }
        const c = new Carver(p.W, p.H, p, mulberry32(p.seed), { trapBias })
        const ok = c.run()
        const m = ok ? analyse(c, true) : null
        out({
          part: 'shadow',
          start: s.start,
          headBias: p.headBias,
          mix: p.mix,
          trapBias,
          seed,
          side,
          ok,
          fingerprint: fingerprint(c),
          N: m ? m.N : null,
          f0abs: m ? Math.round(m.f0 * m.N) : null,
          almost: m ? m.almost : null,
        })
      }
    }
  }
}

function seedRange(n: number): number[] {
  return Array.from({ length: n }, (_, i) => i + 1)
}

function undo(out: (row: UndoRow) => void): void {
  // The repo's known backtracking families (absorb.test.ts): these are the only
  // settings that reliably undo cuts, and they sit outside the safe envelope on
  // purpose, so the carver is driven directly rather than through generate().
  const families: { name: string; side: number; seeds: number[]; over: Partial<Params>; voidFrac: number }[] = [
    { name: 'voids that backtrack', side: 40, seeds: seedRange(8), over: { maxBack: 50 }, voidFrac: 0.2 },
    {
      name: 'starved heads that backtrack',
      side: 200,
      seeds: seedRange(12),
      over: { headTries: 1, pStraight: 0.2, maxBack: 50 },
      voidFrac: 0,
    },
  ]
  for (const f of families) {
    for (const trapBias of [0, -1, 1]) {
      for (const seed of f.seeds) {
        const p: Params = { ...defaultParams(), W: f.side, H: f.side, seed, restarts: 0, ...f.over }
        const c = new Carver(p.W, p.H, p, mulberry32(p.seed), { trapBias, voidFrac: f.voidFrac })
        const ok = c.run()
        // The table lags the last cut by one carveOne; bring it level before
        // comparing, so the check sees the state an undo left behind and not
        // the one cut that follows it.
        if (trapBias !== 0) c.refreshHomo()
        const h = homoMismatch(c)
        out({
          part: 'undo',
          family: f.name,
          trapBias,
          seed,
          side: f.side,
          ok,
          backtracks: c.backtracks,
          homoMismatch: h.mismatch,
          homoLines: h.lines,
        })
      }
    }
  }
}

function main(): void {
  const path = Deno.args[0] ?? '/tmp/arrowz-measure/r1-start-shadow.jsonl'
  const rows: string[] = []
  const emit = (row: ShadowRow | UndoRow): void => {
    rows.push(JSON.stringify(row))
    console.log(JSON.stringify(row))
    Deno.writeTextFileSync(path, rows.join('\n') + '\n')
  }
  shadow(emit)
  undo(emit)
  console.error(`wrote ${rows.length} rows to ${path}`)
}

main()
