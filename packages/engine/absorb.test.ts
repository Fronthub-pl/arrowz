// The fragment scan of Carver.absorbLeftover() (prototype round 13): the
// original walked every cell of the board on every call, flood-filling every
// free fragment up to the first success, and only then let the memo of failed
// fragments skip the path search. The engine now walks a bitmap of dirty
// cells (every cell at construction, then whatever `touch()` marks: a cell
// that changed owner and its neighbours) and flood-fills only the fragments
// around them. The acceptance criterion is not "faster" but "the same
// absorbPath calls, the same absorptions, the same board" for every seed, so
// this file keeps the ORIGINAL method as the oracle and runs every board
// twice. Run: deno test --allow-read --allow-run packages/engine/
import { assert, assertEquals } from '@std/assert'
import { Carver, defaultParams, DIRS, fingerprint, mulberry32 } from './engine.ts'
import type { Cell, Params, Piece } from './types.ts'

/** Reads an index the reference guarantees to be valid; a miss is a test bug, so it throws. */
function at<T>(arr: ArrayLike<T>, i: number): T {
  const v = arr[i]
  if (v === undefined) throw new Error(`index ${i} out of ${arr.length}`)
  return v
}

/** Pops a stack the loop guarantees to be non-empty. */
function pop<T>(arr: T[]): T {
  const v = arr.pop()
  if (v === undefined) throw new Error('pop of an empty array')
  return v
}

// The ORIGINAL absorbLeftover, copied verbatim from main f200c6c. It walks
// `s = 0..W*H` with a fresh Uint8Array on every call, so it costs Θ(W*H) per
// call regardless of what changed; that is why it lives in a test now.
class RefCarver extends Carver {
  override absorbLeftover(): boolean {
    const limit = this.p.absorbLimit ?? 0
    if (limit <= 0) return false
    const { W, H, owner } = this
    const cellIndexIn = new Map<number, Map<number, number>>() // piece id -> cell index -> position within the piece
    const posOf = (pc: Piece, i: number): number | undefined => {
      const key = pc.id
      let m = cellIndexIn.get(key)
      if (!m) {
        const built = new Map<number, number>()
        pc.cells.forEach((c, k) => built.set(this.idx(c.x, c.y), k))
        cellIndexIn.set(key, built)
        m = built
      }
      return m.get(i)
    }
    const { touched, absorbMemo } = this
    const seen = new Uint8Array(W * H)
    for (let s = 0; s < W * H; s++) {
      if (owner[s] !== -1 || seen[s]) continue
      // the fragment of free cells around s, with a size limit
      const comp: number[] = []
      const stack: number[] = [s]
      seen[s] = 1
      let tooBig = false
      // the newest change among the fragment's cells and their neighbours
      let changed = 0
      while (stack.length) {
        const i = pop(stack)
        if (!tooBig) comp.push(i)
        if (comp.length > limit) tooBig = true
        const ti = at(touched, i)
        if (ti > changed) changed = ti
        const x = i % W, y = (i / W) | 0
        for (const { dx, dy } of DIRS) {
          const nx = x + dx, ny = y + dy
          if (!this.inside(nx, ny)) continue
          const j = this.idx(nx, ny)
          const tj = at(touched, j)
          if (tj > changed) changed = tj
          if (owner[j] === -1 && !seen[j]) {
            seen[j] = 1
            stack.push(j)
          }
        }
      }
      if (tooBig) continue
      // MEMO: s is the smallest index of its fragment (every free cell before
      // it already belongs to an earlier fragment), so it identifies the
      // fragment. If nothing around it changed since the last failed attempt
      // and no candidate tail was rewritten, the attempt would fail again.
      const memo = absorbMemo.get(s)
      if (memo && memo.version >= changed && memo.pieces.every((pc) => (pc.tailVersion ?? 0) <= memo.version)) continue
      // candidates: (piece, position of the contact cell); tail end = the cells after it
      const cands = new Map<string, { pc: Piece; k: number; suffix: number }>()
      for (const i of comp) {
        const x = i % W, y = (i / W) | 0
        for (const { dx, dy } of DIRS) {
          const nx = x + dx, ny = y + dy
          if (!this.inside(nx, ny)) continue
          const o = at(owner, this.idx(nx, ny))
          if (o < 0) continue
          const pc = at(this.pieces, o)
          const k = posOf(pc, this.idx(nx, ny))
          if (k === undefined || k < 1) continue // the head and neck are untouchable
          const key = `${o}:${k}`
          if (!cands.has(key)) cands.set(key, { pc, k, suffix: pc.cells.length - 1 - k })
        }
      }
      const list = [...cands.values()].filter((c) => c.suffix <= limit).sort((a, b) => a.suffix - b.suffix)
      for (const { pc, k } of list) {
        const found = this.absorbPath(comp, pc, k)
        if (!found) continue
        const newTail: Cell[] = []
        for (let j = 0; j < found.length; j++) {
          const f = at(found, j)
          newTail.push({ x: f % W, y: (f / W) | 0 })
        }
        pc.cells.length = k + 1
        pc.cells.push(...newTail)
        pc.tailVersion = this.version + 1
        for (const i of comp) owner[i] = pc.id
        this.remaining -= comp.length
        const absorbed = comp.map((i) => ({ x: i % W, y: (i / W) | 0 }))
        this.recomputeLines(absorbed)
        this.touch(absorbed)
        this.stats.absorbed = (this.stats.absorbed ?? 0) + comp.length
        this.stats.absorbs = (this.stats.absorbs ?? 0) + 1
        return true
      }
      absorbMemo.set(s, { version: this.version, pieces: list.map((c) => c.pc) })
    }
    return false
  }
}

/** One family of settings: a name, a square side, the seeds and the knobs over the defaults. */
type Family = {
  name: string
  side: number
  seeds: number[]
  params: Partial<Params>
  /** Voids present from construction: a generate() option now, not a knob. */
  voidFrac?: number
  backtracks?: boolean
}

// Absorption only runs when no head yields a path, which on boards this small
// almost never happens inside the safe envelope: the settings below starve
// the head draws on purpose (headTries 1, pStraight 0.2 — outside the
// envelope, hence Carver is built directly, like `generate(.., { unchecked })`
// would). Every family is a knob that absorbLeftover reads or that changes
// the fragments it sees: the absorption limit, layers, a skeleton, voids
// present from construction (the fragments no touch() ever seeds), and two
// families that backtrack and restart. The exact-test limit (STRAND_LIMIT)
// is a constant now, so it no longer varies across families.
const H1: Partial<Params> = { headTries: 1 }
const FAMILIES: Family[] = [
  { name: 'defaults (inside the envelope)', side: 100, seeds: [1, 2], params: {} },
  { name: 'short pieces', side: 120, seeds: [1, 2, 3], params: { ...H1, wShort: 0.6, wMid: 0.3, Lmax: 6 } },
  {
    name: 'low straightness (envelope floor)',
    side: 120,
    seeds: [1, 2, 3],
    params: { ...H1, pStraight: 0.6, warns: 2 },
  },
  { name: 'absorbLimit 12', side: 100, seeds: [1, 2, 3], params: { ...H1, absorbLimit: 12, pStraight: 0.2, warns: 2 } },
  { name: 'absorbLimit 40', side: 100, seeds: [1, 2, 3], params: { ...H1, absorbLimit: 40, pStraight: 0.2, warns: 2 } },
  { name: 'layers', side: 100, seeds: [1, 2], params: { ...H1, headBias: -1, pStraight: 0.2, warns: 2 } },
  {
    name: 'skeleton',
    side: 100,
    seeds: [1, 2, 3],
    params: { ...H1, giants: 4, giantStep: 2, pStraight: 0.2, warns: 2 },
  },
  {
    name: 'voids',
    side: 60,
    seeds: [1, 2, 3, 4],
    params: { ...H1, pStraight: 0.2, warns: 2, maxBack: 50, restarts: 1 },
    voidFrac: 0.05,
  },
  {
    name: 'voids, more of them',
    side: 60,
    seeds: [1, 2, 3, 4],
    params: { ...H1, pStraight: 0.2, warns: 2, maxBack: 50, restarts: 1 },
    voidFrac: 0.1,
  },
  {
    name: 'voids that backtrack',
    side: 40,
    seeds: [1, 4, 5],
    params: { restarts: 1, maxBack: 50 },
    voidFrac: 0.2,
    backtracks: true,
  },
  {
    name: 'starved heads (engine.test jam boards)',
    side: 200,
    seeds: [3, 4, 6],
    params: { ...H1, pStraight: 0.2, restarts: 0, maxBack: 50 },
  },
  {
    name: 'starved heads that backtrack and restart',
    side: 200,
    seeds: [1],
    params: { ...H1, pStraight: 0.2, restarts: 1, maxBack: 50 },
    backtracks: true,
  },
]

const label = (f: Family, seed: number): string => `${f.name} ${f.side}×${f.side} seed ${seed}`

/** What runLoop reports: the statistics summed over the attempts and the last board. */
type RunResult = {
  attempts: number
  absorbs: number
  absorbed: number
  backtracks: number
  scanned: number
  ok: boolean
  fp: string
}

// The generation loop of generate(), with the carver class as a parameter and
// the statistics summed over the attempts (generate() reports only the last
// carver; an absorption in a failed attempt must agree too).
function runLoop(Cls: typeof Carver, p: Params, voidFrac = 0): RunResult {
  let ok = false
  let carver: Carver | null = null
  const out: RunResult = { attempts: 0, absorbs: 0, absorbed: 0, backtracks: 0, scanned: 0, ok: false, fp: '' }
  for (let attempt = 0; attempt <= p.restarts && !ok; attempt++) {
    carver = new Cls(p.W, p.H, p, mulberry32(p.seed + attempt * 999983), { voidFrac })
    ok = carver.run(p.maxBack > 0 ? p.maxBack : 200)
    out.attempts++
    out.absorbs += carver.stats.absorbs ?? 0
    out.absorbed += carver.stats.absorbed ?? 0
    out.backtracks += carver.backtracks
    out.scanned += carver.stats.absorbScanned ?? 0
  }
  // restarts >= 0, so the loop ran at least once
  if (!carver) throw new Error('runLoop: no attempt ran')
  out.ok = ok
  out.fp = fingerprint(carver)
  return out
}

/** One absorbPath call: smallest cell of the fragment, piece, contact position, found. */
type PathCall = [number, number, number, boolean]

// Records every absorbPath call of both classes as [smallest cell of the
// fragment, piece, contact position, found]. The wrapper sits on
// Carver.prototype, which RefCarver inherits.
function recordAbsorbPaths<T>(fn: () => T): { result: T; log: PathCall[] } {
  const proto = Carver.prototype
  const real = proto.absorbPath
  const log: PathCall[] = []
  proto.absorbPath = function (this: Carver, comp: readonly number[], pc: Piece, k: number): Int32Array | null {
    let s = at(comp, 0)
    for (let i = 1; i < comp.length; i++) {
      const c = at(comp, i)
      if (c < s) s = c
    }
    const found = real.call(this, comp, pc, k)
    log.push([s, pc.id, k, found !== null])
    return found
  }
  try {
    return { result: fn(), log }
  } finally {
    proto.absorbPath = real
  }
}

Deno.test('absorbLeftover: the incremental scan makes the same absorbPath calls and the same board as the full scan', () => {
  let totalAbsorbs = 0, totalBacktracks = 0, totalCalls = 0
  for (const f of FAMILIES) {
    const fam = { absorbs: 0, absorbed: 0, backtracks: 0, calls: 0, attempts: 0 }
    for (const seed of f.seeds) {
      const p: Params = { ...defaultParams(), W: f.side, H: f.side, seed, ...f.params }
      const ref = recordAbsorbPaths(() => runLoop(RefCarver, p, f.voidFrac))
      const got = recordAbsorbPaths(() => runLoop(Carver, p, f.voidFrac))
      const name = label(f, seed)
      assertEquals(got.result.fp, ref.result.fp, `${name}: fingerprint`)
      assertEquals(got.result.ok, ref.result.ok, `${name}: closed`)
      assertEquals(got.result.attempts, ref.result.attempts, `${name}: attempts`)
      assertEquals(got.result.absorbs, ref.result.absorbs, `${name}: stats.absorbs`)
      assertEquals(got.result.absorbed, ref.result.absorbed, `${name}: stats.absorbed`)
      assertEquals(got.result.backtracks, ref.result.backtracks, `${name}: backtracks`)
      assertEquals(got.log.length, ref.log.length, `${name}: number of absorbPath calls`)
      assertEquals(got.log, ref.log, `${name}: sequence of absorbPath calls`)
      fam.absorbs += ref.result.absorbs
      fam.absorbed += ref.result.absorbed
      fam.backtracks += ref.result.backtracks
      fam.calls += ref.log.length
      fam.attempts += ref.result.attempts
    }
    console.log(
      `${f.name}: ${fam.absorbs} absorptions (${fam.absorbed} cells) in ${fam.calls} absorbPath calls, ${fam.backtracks} backtracks, ${fam.attempts} attempts over ${f.seeds.length} seeds`,
    )
    // The comparison proves nothing on a board that never absorbs: every
    // family but the in-envelope defaults must absorb, and the two
    // backtracking families must backtrack.
    if (f.params.headTries === 1) {
      assert(fam.absorbs > 0, `${f.name}: no absorption at all, the family exercises nothing`)
    }
    if (f.backtracks) assert(fam.backtracks > 0, `${f.name}: no backtrack at all`)
    totalAbsorbs += fam.absorbs
    totalBacktracks += fam.backtracks
    totalCalls += fam.calls
  }
  console.log(`total: ${totalAbsorbs} absorptions, ${totalCalls} absorbPath calls, ${totalBacktracks} backtracks`)
  // Counts recorded with the oracle on main f200c6c; pinned so that a change
  // in how often the endgame runs shows up, and so the test cannot pass vacuously.
  assert(totalAbsorbs >= 1500, `${totalAbsorbs} absorptions exercised`)
  assert(totalBacktracks >= 100, `${totalBacktracks} backtracks exercised`)
})

Deno.test('absorbLeftover: the incremental scan visits far fewer cells than the full scan', () => {
  // The old scan pops every free cell of the board once per call (and walks
  // all W*H indices on top of that); `remaining` at call time is exactly that
  // pop count. The new scan reports the cells its flood fills pop in
  // stats.absorbScanned. On the jam board most calls come while the board is
  // still largely free, so a full flood is tens of thousands of cells.
  const p: Params = { ...defaultParams(), W: 200, H: 200, seed: 3, ...H1, pStraight: 0.2, restarts: 0, maxBack: 50 }
  const proto = RefCarver.prototype
  const real = proto.absorbLeftover
  let oldPops = 0, oldWalk = 0, calls = 0
  proto.absorbLeftover = function (this: RefCarver): boolean {
    calls++
    oldPops += this.remaining
    oldWalk += this.W * this.H
    return real.call(this)
  }
  const ref = (() => {
    try {
      return runLoop(RefCarver, p)
    } finally {
      proto.absorbLeftover = real
    }
  })()
  const got = runLoop(Carver, p)
  assertEquals(got.fp, ref.fp)
  assert(ref.absorbs > 100, `${ref.absorbs} absorptions on the reference board`)
  console.log(
    `${calls} calls: old scan ${oldPops} flood pops + ${oldWalk} index walk, new scan ${got.scanned} flood pops`,
  )
  assert(got.scanned > 0, 'stats.absorbScanned is missing: the engine does not report the cells its scan visits')
  assert(got.scanned * 4 < oldPops, `new scan popped ${got.scanned} cells against ${oldPops} for the old one`)
})
