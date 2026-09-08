// THROWAWAY PROTOTYPE — probe engine, not production code.
//
// This file is shared by the CLI (carve.mjs) and the browser lab (lab.html)
// so that two copies of the algorithm never come into existence and drift apart.
// It must not touch `process` or the DOM — everything comes in as parameters.

const DIRS = [
  { dx: 0, dy: -1, ch: '↑' }, // 0 up
  { dx: 1, dy: 0, ch: '→' },  // 1 right
  { dx: 0, dy: 1, ch: '↓' },  // 2 down
  { dx: -1, dy: 0, ch: '←' }, // 3 left
]

function mulberry32(seed) {
  let a = seed >>> 0
  return () => {
    a = (a + 0x6d2b79f5) | 0
    let t = Math.imul(a ^ (a >>> 15), 1 | a)
    t = (t + Math.imul(t ^ (t >>> 7), 61 | t)) ^ t
    return ((t ^ (t >>> 14)) >>> 0) / 4294967296
  }
}

// ---------------------------------------------------------------- board

class Carver {
  constructor(W, H, params, rng) {
    this.W = W
    this.H = H
    this.p = params
    this.rng = rng
    this.owner = new Int32Array(W * H).fill(-1) // -1 = unassigned (set R)
    this.pieces = []
    this.remaining = W * H
    if (params.voidFrac > 0) {
      let v = 0
      const target = Math.round(W * H * params.voidFrac)
      while (v < target) {
        const i = Math.floor(rng() * W * H)
        if (this.owner[i] === -1) { this.owner[i] = -2; v++ }
      }
      this.remaining -= target
    }
    this.backtracks = 0
    this.stats = { want: 0, got: 0, stall: 0, strandTrunc: 0, strandLoss: 0, n: 0 }
    // depth[d][line] = number of consecutive assigned cells from the edge inward
    this.depth = [new Int32Array(W), new Int32Array(H), new Int32Array(W), new Int32Array(H)]
    // Scratch arrays with a generation stamp: the "set" is the cells whose stamp
    // equals the current generation. Clearing costs O(1) (a new stamp), and
    // membership is an array read instead of Set.has in the leftover test's hot loop.
    this.takenStamp = new Int32Array(W * H)
    this.seenStamp = new Int32Array(W * H)
    this.degStamp = new Int32Array(W * H)
    this.degVal = new Int8Array(W * H)
    this.gen = 0
    // Scratch for the incremental creep of shortenPath (see creepUp): the
    // position of a prefix cell in its path, and for a cell seen by the
    // flood-fill replay `(entry << 1) | popped`. Both valid only under the
    // creep's own stamps in takenStamp / seenStamp.
    this.creepPos = new Int32Array(W * H)
    this.creepInfo = new Int32Array(W * H)
    // Change stamps for the absorption memo: `touched[i]` is the version at
    // which cell i last changed owner. A leftover fragment whose cells and
    // neighbours have not changed since its last failed absorption attempt,
    // and whose candidate pieces' tails have not been rewritten, would fail
    // again in exactly the same way — so it is skipped (see absorbLeftover).
    this.version = 0
    this.touched = new Int32Array(W * H)
    this.absorbMemo = new Map()  // first cell of the fragment -> { version, pieces }
    // Scratch for the absorption path search: region and used-cell membership
    // by stamp, so a candidate costs no allocation beyond its own path.
    this.absRegion = new Int32Array(W * H)
    this.absUsed = new Int32Array(W * H)
    this.absGen = 0
  }

  // Marks the cells of `cells` ({x, y} objects) as changed at a new version.
  touch(cells) {
    const v = ++this.version
    for (const c of cells) this.touched[this.idx(c.x, c.y)] = v
  }

  idx(x, y) { return y * this.W + x }
  inside(x, y) { return x >= 0 && y >= 0 && x < this.W && y < this.H }
  free(x, y) { return this.owner[this.idx(x, y)] === -1 }

  // first unassigned cell on the line, counting from the exit edge of direction d
  headCandidate(d, line) {
    const { W, H } = this
    const k = this.depth[d][line]
    if (d === 0) return k < H ? { x: line, y: k } : null
    if (d === 2) return k < H ? { x: line, y: H - 1 - k } : null
    if (d === 3) return k < W ? { x: k, y: line } : null
    return k < W ? { x: W - 1 - k, y: line } : null
  }

  recomputeLines(cells) {
    const { W, H, owner, depth } = this
    const cols = new Set(), rows = new Set()
    for (const c of cells) { cols.add(c.x); rows.add(c.y) }
    for (const x of cols) {
      let k = 0; while (k < H && owner[this.idx(x, k)] !== -1) k++
      depth[0][x] = k
      k = 0; while (k < H && owner[this.idx(x, H - 1 - k)] !== -1) k++
      depth[2][x] = k
    }
    for (const y of rows) {
      let k = 0; while (k < W && owner[this.idx(k, y)] !== -1) k++
      depth[3][y] = k
      k = 0; while (k < W && owner[this.idx(W - 1 - k, y)] !== -1) k++
      depth[1][y] = k
    }
  }

  // does the ray from (x,y) in direction d pass exclusively through cells
  // that are assigned or belong to the path being built
  rayClear(x, y, d, pathSet) {
    const { dx, dy } = DIRS[d]
    let cx = x + dx, cy = y + dy
    while (this.inside(cx, cy)) {
      const i = this.idx(cx, cy)
      if (this.owner[i] === -1 && !pathSet.has(i)) return false
      cx += dx; cy += dy
    }
    return true
  }

  // ------------------------------------------------ leftover shape test

  // Can a set of cells be decomposed into paths of length >= 2?
  //
  // Every path of k >= 2 cells splits into segments of 2 and 3 cells, so the
  // question reduces to a cover by dominoes and path-trominoes
  // (Akiyama–Avis–Era). Dynamic programming over bitmasks: the cell with the
  // lowest bit must belong to some segment, we try every segment through it
  // and memoise the losing masks.
  //
  // THE PREVIOUS VERSION WAS WRONG: it grew the path only from the starting
  // cell, so the start had to be an endpoint. An L-tromino iterated from the
  // corner and a straight triple started from the middle came out as
  // "non-decomposable", and the result depended on the order of cells in the
  // set. In the endgame the generator rejected valid paths and declared a
  // jam that did not exist. K(1,3) — e.g. the T tetromino — is the smallest
  // genuine counterexample, the plus-pentomino the next one.
  decomposable(cellSet) {
    const n = cellSet.size
    if (n === 0) return true
    if (n === 1) return false
    if (n > 30) return true // beyond the reach of 32-bit masks — assume yes
    const cells = [...cellSet]
    const bitOf = new Map()
    cells.forEach((c, i) => bitOf.set(c, i))
    // neighbours inside the set, as bit numbers
    const nb = cells.map((c) => {
      const x = c % this.W, y = (c / this.W) | 0
      const out = []
      for (const { dx, dy } of DIRS) {
        const nx = x + dx, ny = y + dy
        if (!this.inside(nx, ny)) continue
        const b = bitOf.get(this.idx(nx, ny))
        if (b !== undefined) out.push(b)
      }
      return out
    })
    // segments (masks) containing cell v: dominoes v–a, trominoes a–v–b
    // (v in the middle) and v–a–c (v at the end)
    const segs = cells.map((_, v) => {
      const out = []
      for (const a of nb[v]) {
        out.push((1 << v) | (1 << a))
        for (const b of nb[v]) if (b > a) out.push((1 << v) | (1 << a) | (1 << b))
        for (const c of nb[a]) if (c !== v) out.push((1 << v) | (1 << a) | (1 << c))
      }
      return out
    })
    const lost = new Set()
    const solve = (mask) => {
      if (mask === 0) return true
      if (lost.has(mask)) return false
      const v = 31 - Math.clz32(mask & -mask)
      for (const s of segs[v]) {
        if ((s & mask) === s && solve(mask & ~s)) return true
      }
      lost.add(mask)
      return false
    }
    return solve(n === 30 ? 0x3fffffff : (1 << n) - 1)
  }

  /**
   * LOCAL DEFECT: a free cell with at least three leaf neighbours (free cells
   * whose only free neighbour is that cell), or a pair of cells at distance
   * <= 2 whose removal leaves >= 5 isolated cells. This is Tutte's condition
   * for a path cover with |S| = 1 and |S| = 2: such a set cannot be covered by
   * paths, and adding cells anywhere else will never fix it.
   *
   * After carving a path, degrees change only at its neighbours, so a new
   * defect can appear only within radius 2 of it. The check is globally exact
   * at a cost linear in the path length — and it does not depend on the
   * fragment size limit, unlike the decomposability test.
   *
   * Assumes the path cells are marked with the stamp `takenStamp === gen`.
   */
  hasLocalDefect(cells) {
    const { W, seenStamp, gen } = this
    const { isFree, check } = this.defectKernel(gen, gen)
    for (const c of cells) {
      for (let ox = -2; ox <= 2; ox++) {
        for (let oy = -2; oy <= 2; oy++) {
          if (Math.abs(ox) + Math.abs(oy) > 2) continue
          const vx = c.x + ox, vy = c.y + oy
          if (!this.inside(vx, vy)) continue
          const vi = vy * W + vx
          if (!isFree(vi) || seenStamp[vi] === gen) continue
          seenStamp[vi] = gen
          if (check(vi, vx, vy)) return true
        }
      }
    }
    return false
  }

  /**
   * The vertex predicate of hasLocalDefect, bound to one board state: the
   * path cells are those with `takenStamp === takenGen`, free degrees are
   * memoised under `degStamp === cacheGen` (so the state must not change
   * while one kernel is in use). `check(vi, vx, vy)` reads the free state
   * within Manhattan distance 4 of the vertex and nothing else.
   */
  defectKernel(takenGen, cacheGen) {
    const { W, H, owner, takenStamp, degStamp, degVal } = this
    const isFree = (i) => owner[i] === -1 && takenStamp[i] !== takenGen
    const freeDeg = (i) => {
      if (degStamp[i] === cacheGen) return degVal[i]
      const x = i % W, y = (i / W) | 0
      let n = 0
      if (y > 0 && isFree(i - W)) n++
      if (y < H - 1 && isFree(i + W)) n++
      if (x > 0 && isFree(i - 1)) n++
      if (x < W - 1 && isFree(i + 1)) n++
      degStamp[i] = cacheGen; degVal[i] = n
      return n
    }
    const nbrs = (i, out) => {
      const x = i % W, y = (i / W) | 0
      let n = 0
      if (y > 0 && isFree(i - W)) out[n++] = i - W
      if (y < H - 1 && isFree(i + W)) out[n++] = i + W
      if (x > 0 && isFree(i - 1)) out[n++] = i - 1
      if (x < W - 1 && isFree(i + 1)) out[n++] = i + 1
      return n
    }
    const nv = new Int32Array(4), nw = new Int32Array(4), ne = new Int32Array(4)
    const check = (vi, vx, vy) => {
      const kv = nbrs(vi, nv)
      let leaves = 0, weak = 0
      for (let a = 0; a < kv; a++) {
        const d = freeDeg(nv[a])
        if (d === 1) leaves++
        if (d <= 2) weak++
      }
      if (leaves >= 3) return true
      // |S| = 2: the only candidates for isolated cells are neighbours of v
      // and w with degree <= 2, so without such neighbours the pair is out at once.
      if (weak === 0) return false
      for (let px = -2; px <= 2; px++) {
        for (let py = -2; py <= 2; py++) {
          if ((px === 0 && py === 0) || Math.abs(px) + Math.abs(py) > 2) continue
          const wx = vx + px, wy = vy + py
          if (!this.inside(wx, wy)) continue
          const wi = wy * W + wx
          if (!isFree(wi)) continue
          const kw = nbrs(wi, nw)
          let weakW = 0
          for (let a = 0; a < kw; a++) if (freeDeg(nw[a]) <= 2) weakW++
          if (weak + weakW < 5) continue
          let isolated = 0
          for (let side = 0; side < 2; side++) {
            const arr = side === 0 ? nv : nw, k = side === 0 ? kv : kw
            for (let a = 0; a < k; a++) {
              const ui = arr[a]
              if (ui === vi || ui === wi) continue
              if (side === 1) { // do not count a shared neighbour twice
                let dup = false
                for (let b = 0; b < kv; b++) if (nv[b] === ui) { dup = true; break }
                if (dup) continue
              }
              const ke = nbrs(ui, ne)
              let ok = true
              for (let b = 0; b < ke; b++) if (ne[b] !== vi && ne[b] !== wi) { ok = false; break }
              if (ok) isolated++
            }
          }
          if (isolated >= 5) return true
        }
      }
      return false
    }
    return { isFree, check }
  }

  // Does carving `cells` strand the rest: a fragment of up to `strandLimit`
  // cells that cannot be decomposed into paths, or a local defect in a fragment
  // of any size. `failed` (optional) collects the cells of fragments that
  // failed the exact test.
  wouldStrand(cells, failed = null) {
    const { W, H, owner, takenStamp, seenStamp } = this
    const gen = ++this.gen
    for (const c of cells) takenStamp[this.idx(c.x, c.y)] = gen
    if (this.hasLocalDefect(cells)) return true
    // a separate stamp for cells visited by the flood fill
    const seenGen = ++this.gen
    for (const c of cells) takenStamp[this.idx(c.x, c.y)] = seenGen
    const limit = this.p.strandLimit
    const stack = []
    for (const c of cells) {
      for (const { dx, dy } of DIRS) {
        const nx = c.x + dx, ny = c.y + dy
        if (!this.inside(nx, ny)) continue
        const start = ny * W + nx
        if (owner[start] !== -1 || takenStamp[start] === seenGen || seenStamp[start] === seenGen) continue
        const comp = []
        stack.length = 0
        stack.push(start); seenStamp[start] = seenGen
        let overflow = false
        while (stack.length) {
          const i = stack.pop()
          comp.push(i)
          if (comp.length > limit) { overflow = true; break }
          const x = i % W, y = (i / W) | 0
          const tryPush = (j) => {
            if (owner[j] === -1 && takenStamp[j] !== seenGen && seenStamp[j] !== seenGen) { seenStamp[j] = seenGen; stack.push(j) }
          }
          if (y > 0) tryPush(i - W)
          if (y < H - 1) tryPush(i + W)
          if (x > 0) tryPush(i - 1)
          if (x < W - 1) tryPush(i + 1)
        }
        if (overflow) {
          // Large fragment: decomposability is not checked (a local defect has
          // already been ruled out). Exception: a fragment that EARLIER failed
          // the exact test and grew only because the shortening loop gave path
          // cells back to it. A non-local defect does not go away because of
          // that, and letting it through would mean a pocket that cannot be
          // carved until the end of the generation.
          if (failed) for (const i of comp) if (failed.has(i)) return true
          continue
        }
        if (!this.decomposable(new Set(comp))) {
          if (failed) for (const i of comp) failed.add(i)
          return true
        }
      }
    }
    return false
  }

  /**
   * SHORTENING. `wouldStrand(path, failed)` has just returned true for the
   * whole path (and filled `failed`). Truncates `path` in place to the
   * longest length the jump-and-creep search chooses; returns false when no
   * length >= 2 passes (the caller then drops the path).
   *
   * Jumps: from the end, in steps of 1/32 of the length, until a prefix
   * passes — each jump is a full `wouldStrand` (its `failed` additions feed
   * the later jumps and the creep). Creep: from that passing prefix, one
   * cell at a time upward until the first failing prefix. The creep is
   * evaluated incrementally (creepUp) with exactly the booleans a full
   * `wouldStrand(path.slice(0, k), failed)` would return; each step costs
   * the re-run cascade around the new cell (measured: a few probes) instead
   * of a full O(k) pass.
   */
  shortenPath(path, failed) {
    // Shorten in jumps, not one cell at a time: with a path of thousands
    // of cells a linear search would cost O(L) leftover tests.
    const step = Math.max(1, Math.floor(path.length / 32))
    for (let L = path.length - step; L >= 2; L -= step) {
      const shorter = path.slice(0, L)
      if (!this.wouldStrand(shorter, failed)) {
        // creep back up one at a time so as not to lose length needlessly
        path.length = this.creepUp(path, L, Math.min(path.length, L + step), failed)
        return true
      }
    }
    return false
  }

  /**
   * The local-defect phase of `wouldStrand(prefix)` after the prefix grew by
   * one cell (cx, cy), given that the previous prefix had no defect. The
   * full check visits every free vertex within distance 2 of a prefix cell
   * and its predicate reads the state within distance 4 of the vertex, so
   * only vertices within distance 4 of the new cell can have changed, and
   * among those the full check visits exactly the ones with a prefix cell
   * within distance 2 (the new cell counts). Visiting any other vertex could
   * return true where the full check returns false, so nothing else is
   * looked at. Prefix cells are those with `takenStamp === takenGen`.
   */
  defectNear(cx, cy, takenGen) {
    const { W, takenStamp } = this
    const { isFree, check } = this.defectKernel(takenGen, ++this.gen)
    for (let ox = -4; ox <= 4; ox++) {
      for (let oy = -4; oy <= 4; oy++) {
        const r = Math.abs(ox) + Math.abs(oy)
        if (r > 4) continue
        const vx = cx + ox, vy = cy + oy
        if (!this.inside(vx, vy)) continue
        const vi = vy * W + vx
        if (!isFree(vi)) continue
        if (r > 2) {
          let near = false
          for (let px = -2; px <= 2 && !near; px++) {
            for (let py = -2; py <= 2; py++) {
              if (Math.abs(px) + Math.abs(py) > 2) continue
              const wx = vx + px, wy = vy + py
              if (this.inside(wx, wy) && takenStamp[wy * W + wx] === takenGen) { near = true; break }
            }
          }
          if (!near) continue
        }
        if (check(vi, vx, vy)) return true
      }
    }
    return false
  }

  // The plain creep: one full `wouldStrand` per prefix. Only the fallback of
  // creepUp; kept because it is the definition the incremental version must
  // reproduce.
  creepUpPlain(path, L, hi, failed) {
    let best = L
    for (let k = L + 1; k < hi; k++) {
      if (this.wouldStrand(path.slice(0, k), failed)) break
      best = k
    }
    return best
  }

  /**
   * CREEP: the longest k in [L, hi) such that every prefix of length L+1..k
   * passes `wouldStrand(path.slice(0, k), failed)`, computed without calling
   * it. Prefix L is known to pass. Passing calls never touch `failed`, and
   * the failing call's additions are never read by anyone, so only the
   * booleans matter and `failed` is treated as constant.
   *
   * Growing a passing prefix by one cell c changes the free state at c only:
   *
   * - Local defect: see defectNear.
   * - Fragments: the fragment phase of wouldStrand is a sequence of "entries"
   *   e = 4*i + d (prefix cell i, direction d), each a no-op or a capped
   *   flood fill from the neighbour cell, with seen marks shared across
   *   entries. Its result is order-dependent (an oversize fragment fails only
   *   if the window actually popped contains a `failed` cell), so the
   *   sequence is replayed, lazily: the state of the previous prefix is kept
   *   (which entry marked each cell, and each entry's marks), and an entry is
   *   re-run only if a cell of its footprint — its start, the cells it popped
   *   and their neighbours — changed free or seen state, in entry order, with
   *   the changes it makes cascading to later entries. Entries never re-run
   *   behave as before, i.e. they passed. Marks of entries later than the one
   *   being re-run are stale and count as unseen. The full sequence is run
   *   once for prefix L (linear); afterwards each step costs the cascade.
   */
  creepUp(path, L, hi, failed) {
    if (hi <= L + 1) return L
    const { W, owner, takenStamp, seenStamp, creepPos, creepInfo, degStamp } = this
    const limit = this.p.strandLimit
    const takenGen = ++this.gen
    for (let i = 0; i < L; i++) {
      const c = path[i], ci = c.y * W + c.x
      takenStamp[ci] = takenGen; creepPos[ci] = i
    }
    const creepGen = ++this.gen
    const lists = new Map() // entry -> cells it marked seen (popped or pushed)
    const stack = [], comp = [], heap = []
    let cur = -1 // entry being (re)run; only later entries can still be affected
    let curList = null
    const push = (e) => {
      heap.push(e)
      let i = heap.length - 1
      while (i > 0) {
        const p = (i - 1) >> 1
        if (heap[p] <= heap[i]) break
        const t = heap[p]; heap[p] = heap[i]; heap[i] = t; i = p
      }
    }
    const pop = () => {
      const top = heap[0], last = heap.pop()
      if (heap.length) {
        heap[0] = last
        let i = 0
        for (;;) {
          const l = 2 * i + 1, r = l + 1
          let m = i
          if (l < heap.length && heap[l] < heap[m]) m = l
          if (r < heap.length && heap[r] < heap[m]) m = r
          if (m === i) break
          const t = heap[m]; heap[m] = heap[i]; heap[i] = t; i = m
        }
      }
      return top
    }
    const addIfLater = (e) => { if (e > cur) push(e) }
    const seen = (x, e) => seenStamp[x] === creepGen && (creepInfo[x] >> 1) <= e
    const poppedEntry = (x) => (seenStamp[x] === creepGen && (creepInfo[x] & 1)) ? creepInfo[x] >> 1 : -1
    // Every later entry whose footprint contains x.
    const markDirty = (x) => {
      let g = poppedEntry(x)
      if (g >= 0) addIfLater(g)
      const xx = x % W, xy = (x / W) | 0
      for (let d = 0; d < 4; d++) {
        const nx = xx + DIRS[d].dx, ny = xy + DIRS[d].dy
        if (!this.inside(nx, ny)) continue
        const ni = ny * W + nx
        g = poppedEntry(ni)
        if (g >= 0) addIfLater(g)
        // the entry that starts at x from the prefix cell on the other side
        if (takenStamp[ni] === takenGen) addIfLater(4 * creepPos[ni] + ((d + 2) & 3))
      }
    }
    const mark = (x, e) => {
      // a stale mark of a later entry: that entry read x, so it is affected
      if (seenStamp[x] === creepGen) addIfLater(creepInfo[x] >> 1)
      seenStamp[x] = creepGen; creepInfo[x] = e << 1
      curList.push(x)
    }
    const tryPush = (j, e) => {
      if (owner[j] === -1 && takenStamp[j] !== takenGen && !seen(j, e)) { mark(j, e); stack.push(j) }
    }
    // Runs entry e in the current state; true = this prefix strands.
    const evalEntry = (e) => {
      const c = path[e >> 2], dd = DIRS[e & 3]
      const x = c.x + dd.dx, y = c.y + dd.dy
      if (!this.inside(x, y)) return false
      const start = y * W + x
      if (owner[start] !== -1 || takenStamp[start] === takenGen || seen(start, e)) return false
      curList = []
      lists.set(e, curList)
      comp.length = 0; stack.length = 0
      stack.push(start); mark(start, e)
      let overflow = false
      while (stack.length) {
        const i = stack.pop()
        comp.push(i); creepInfo[i] |= 1
        if (comp.length > limit) { overflow = true; break }
        const ix = i % W, iy = (i / W) | 0
        if (iy > 0) tryPush(i - W, e)
        if (iy < this.H - 1) tryPush(i + W, e)
        if (ix > 0) tryPush(i - 1, e)
        if (ix < W - 1) tryPush(i + 1, e)
      }
      if (overflow) {
        for (const i of comp) if (failed.has(i)) return true
        return false
      }
      return !this.decomposable(new Set(comp))
    }
    // The full sequence for prefix L, which is known to pass. Should the
    // replay ever disagree, `wouldStrand` stays the ground truth: fall back
    // to the plain creep rather than abort the generation (the lab worker
    // would die with it). The differential test in shortening.test.mjs is
    // where a disagreement is meant to surface.
    for (let e = 0; e < 4 * L; e++) {
      cur = e
      if (evalEntry(e)) return this.creepUpPlain(path, L, hi, failed)
    }
    let best = L
    for (let k = L + 1; k < hi; k++) {
      const c = path[k - 1], ci = c.y * W + c.x
      takenStamp[ci] = takenGen; creepPos[ci] = k - 1
      if (this.defectNear(c.x, c.y, takenGen)) break
      cur = -1
      markDirty(ci)
      seenStamp[ci] = 0
      for (let d = 0; d < 4; d++) push(4 * (k - 1) + d)
      let strand = false
      while (heap.length) {
        const e = pop()
        if (e <= cur) continue
        cur = e
        const old = lists.get(e)
        if (old) {
          lists.delete(e)
          for (const x of old) if (seenStamp[x] === creepGen && (creepInfo[x] >> 1) === e) seenStamp[x] = 0
        }
        curList = null
        if (evalEntry(e)) { strand = true; break }
        // cells whose seen state, as later entries observe it, changed:
        // marked now but not before, or marked before and by nobody <= e now.
        // degStamp is free scratch here (defectNear takes a fresh cache
        // generation on every step).
        const tag = ++this.gen
        if (old) for (const x of old) degStamp[x] = tag
        if (curList) for (const x of curList) if (degStamp[x] !== tag) markDirty(x)
        if (old) for (const x of old) if (!seen(x, e)) markDirty(x)
      }
      if (strand) break
      best = k
    }
    heap.length = 0
    return best
  }

  // ------------------------------------------------------------ carving

  // The giant's target length is measured in BOARD SIDES, not cells: a piece
  // that is meant to cross the board back and forth must scale with its size.
  giantLength() {
    return Math.round(this.p.giantSpan * Math.max(this.W, this.H))
  }

  // Lmax = 0 means automatic: 2.5 × the longer side, as in §7 of the spec.
  // A fixed value (formerly 125) truncated the long bucket on large boards.
  lmax() {
    return this.p.Lmax > 0 ? this.p.Lmax : Math.round(2.5 * Math.max(this.W, this.H))
  }

  targetLength(progress) {
    const { rng, p } = this
    // FLAW IN THE ORIGINAL HYPOTHESIS: I assumed long shapes only succeed late,
    // because the admissible area grows. Not true — from the very first step a
    // piece can run STRAIGHT INWARD from the edge (its ray passes through its
    // own cells). What is constrained is SIDEWAYS movement, not length. The cap
    // stays disabled.
    const cap = this.lmax()
    const r = rng()
    let lo, hi
    if (r < p.wShort) { lo = 2; hi = 6 }
    else if (r < p.wShort + p.wMid) { lo = 7; hi = 15 }
    else { // log-uniform within the long bucket
      const a = 16, b = Math.max(17, cap)
      return Math.min(cap, Math.round(a * Math.exp(rng() * Math.log(b / a))))
    }
    return Math.min(cap, lo + Math.floor(rng() * (hi - lo + 1)))
  }

  /**
   * Serpentine route for a skeleton piece.
   *
   * Random growth cannot produce a line that is both long and stretched out:
   * without Warnsdorff it traps itself after a hundred cells, with it it fills
   * the area densely, i.e. it coils. So the serpentine is laid out
   * systematically: runs parallel to the exit edge, a jump of `step` between
   * them. The channels of width `step - 1` left between the runs will later be
   * filled by ordinary pieces — and those are the ones blocked by this line,
   * so removing it unblocks half the board at once.
   */
  growSerpentine(head, neck, d, maxLen) {
    const { rng, p } = this
    const step = Math.max(2, p.giantStep)
    const advance = DIRS[(d + 2) % 4]                 // into the board
    const along = d === 0 || d === 2 ? { dx: 1, dy: 0 } : { dx: 0, dy: 1 }
    let dir = rng() < 0.5 ? 1 : -1                    // direction of the first run

    const path = [head, neck]
    const used = new Set([this.idx(head.x, head.y), this.idx(neck.x, neck.y)])
    const free = (x, y) =>
      this.inside(x, y) && this.owner[this.idx(x, y)] === -1 && !used.has(this.idx(x, y))
    const push = (x, y) => { path.push({ x, y }); used.add(this.idx(x, y)) }

    let cur = { x: neck.x, y: neck.y }
    while (path.length < maxLen) {
      // a run along the axis up to an obstacle; sometimes cut short so that the
      // serpentine's edges do not come out perfectly straight
      const runCap = rng() < p.giantJitter ? 3 + Math.floor(rng() * 12) : Infinity
      let ran = 0
      while (ran < runCap && path.length < maxLen) {
        const nx = cur.x + along.dx * dir, ny = cur.y + along.dy * dir
        if (!free(nx, ny)) break
        push(nx, ny); cur = { x: nx, y: ny }; ran++
      }
      // jump `step` cells inward and turn around
      let moved = 0
      while (moved < step && path.length < maxLen) {
        const nx = cur.x + advance.dx, ny = cur.y + advance.dy
        if (!free(nx, ny)) break
        push(nx, ny); cur = { x: nx, y: ny }; moved++
      }
      if (moved === 0) break          // nowhere to descend — end of the serpentine
      dir = -dir
    }
    return path
  }

  /**
   * Carves one piece. Normally each direction draws `headTries` heads per
   * pool; with `scanAll` every legal head of every pool is tried once, in
   * random order — the FULL SCAN that `run()` makes before it undoes anything.
   */
  carveOne(scanAll = false) {
    const { rng, p } = this
    const progress = 1 - this.remaining / (this.W * this.H)
    // NOT `sort(() => rng() - 0.5)`: the number of comparator calls depends on
    // the Array.prototype.sort implementation, so different JS engines consume a
    // different number of random draws and the same seed yields a different
    // board in Node and in the browser. A Fisher-Yates shuffle makes exactly
    // n-1 draws, always the same ones.
    const order = [0, 1, 2, 3]
    for (let i = order.length - 1; i > 0; i--) {
      const j = Math.floor(rng() * (i + 1))
      const t = order[i]; order[i] = order[j]; order[j] = t
    }

    for (const d of order) {
      const nLines = d === 0 || d === 2 ? this.W : this.H
      const back = DIRS[(d + 2) % 4]
      // pairable heads: the first unassigned cell on the line, with an unassigned cell behind it
      const heads = []
      for (let line = 0; line < nLines; line++) {
        const h = this.headCandidate(d, line)
        if (!h) continue
        const bx = h.x + back.dx, by = h.y + back.dy
        if (!this.inside(bx, by) || !this.free(bx, by)) continue
        heads.push(h)
      }
      if (!heads.length) continue

      // MIXING: some cuts prefer the deepest line (tunnelling -> low f0, but
      // straight shapes), the rest the shallowest (layers -> bends, but high f0).
      // These two goals pull in opposite directions, so we look for a ratio.
      const bias = p.mix >= 0 ? (rng() < p.mix ? 1 : -1) : p.headBias
      let ranked = heads
      if (bias !== 0) {
        // depth of a head's line = how deep the frontier has advanced in that line
        ranked = heads
          .map((c) => ({ c, dep: this.depth[d][d === 0 || d === 2 ? c.x : c.y] }))
          .sort((a, b) => (bias > 0 ? b.dep - a.dep : a.dep - b.dep))
          .map((z) => z.c)
      }
      // SEVERAL TRIES PER DIRECTION. One try is enough on a small board, where
      // there are a dozen or so candidates. At 400x400 there can be several
      // hundred legal heads, and the chance that the one drawn happens to give
      // a path passing the leftover test drops — and the generator undoes
      // hundreds of cuts instead of drawing again.
      //
      // QUARTERS. A biased cut draws from the first quarter of the ranked list
      // (the shallowest lines for layers, the deepest for tunnels). If every
      // try there fails, the next quarters are tried in turn before the
      // direction is given up: in the endgame of a large board the shallowest
      // lines are exactly the dead pockets at the frontier, while the heads of
      // the regions of thousands of free cells sit in the deeper quarters —
      // and a backtrack undoes pieces elsewhere, so it never helps (round 9).
      const quarter = Math.max(1, Math.ceil(ranked.length / 4))
      const pools = bias === 0
        ? [[...ranked]]
        : [0, 1, 2, 3].map((q) => ranked.slice(q * quarter, (q + 1) * quarter)).filter((x) => x.length)
      let carved = false
      for (const pool of pools) {
      const tries = scanAll ? pool.length : Math.min(Math.max(1, p.headTries), pool.length)
      for (let attempt = 0; attempt < tries && !carved; attempt++) {
      const pick = Math.floor(rng() * pool.length)
      const h = pool[pick]
      pool.splice(pick, 1)
      const bx = h.x + back.dx, by = h.y + back.dy
      const path = [h, { x: bx, y: by }]
      const pathSet = new Set([this.idx(h.x, h.y), this.idx(bx, by)])
      // position of a cell in the path — the spacing rule must tell "my own tail,
      // which I just came from" apart from "my own run from a hundred cells ago"
      const pathPos = new Map([[this.idx(h.x, h.y), 0], [this.idx(bx, by), 1]])
      // PROBE: every so often drive a long straight piece inward to make a step
      // in the frontier profile. Without steps all subsequent pieces are straight
      // strokes, because a bend requires matching the depth of the neighbour's frontier.
      const isProbe = rng() < p.probe
      // Giants are carved AT THE START, while the board is empty: only then does
      // the path have room to run across the whole grid. Drawing them mid-way
      // does not work — after a thousand cuts the unassigned area is already ragged.
      // The carving order is the solution order, so giants are also the first
      // to be removed in the game and their removal unblocks the rest of the board.
      const isGiant = p.giantSpan > 0 &&
        (this.pieces.length < p.giants || (p.wGiant > 0 && rng() < p.wGiant))
      const want = isGiant
        ? this.giantLength()
        : isProbe
          ? Math.max(4, Math.round(p.probeLen * (0.5 + rng())))
          : this.targetLength(progress)
      // A piece that is meant to have REACH must run straight — coiling eats
      // length without gaining ground. So for giants we swap the weights:
      // strongly straight, no Warnsdorff (it is what coils), with a self-contact penalty.
      const pStraight = isGiant ? p.giantStraight : p.pStraight
      const warns = isGiant ? p.giantWarns : p.warns
      const anticoil = isGiant ? Math.max(p.anticoil, p.giantAnticoil) : p.anticoil
      let lastDir = { dx: back.dx, dy: back.dy }

      if (isGiant && p.giantStep > 0) {
        const serp = this.growSerpentine(h, { x: bx, y: by }, d, want)
        if (serp.length >= 2) {
          path.length = 0
          pathSet.clear()
          for (const c of serp) { path.push(c); pathSet.add(this.idx(c.x, c.y)) }
        }
      }

      while (path.length < want) {
        const tail = path[path.length - 1]
        const cand = []
        for (const dd of DIRS) {
          const nx = tail.x + dd.dx, ny = tail.y + dd.dy
          if (!this.inside(nx, ny)) continue
          const i = this.idx(nx, ny)
          if (this.owner[i] !== -1 || pathSet.has(i)) continue
          if (!p.ruleB && !this.rayClear(nx, ny, d, pathSet)) continue
          // Moving INWARD (along -d) is always legal, but it cuts the path off
          // from the frontier and thus from any future bends. Moving SIDEWAYS is
          // legal only at the level of the neighbouring line's frontier — and it
          // is what builds the shape. That is why we reward sideways, not "straight".
          const inward = dd.dx === back.dx && dd.dy === back.dy
          const straight = dd.dx === lastDir.dx && dd.dy === lastDir.dy
          let w = inward ? 1 : p.wLateral
          if (straight) w *= pStraight / (1 - Math.min(0.999, pStraight))
          // One pass over the neighbours counts three things at once:
          //  deg     - free exits (Warnsdorff),
          //  foreign - neighbours belonging to ALREADY CARVED pieces (and the edge),
          //  own     - neighbours belonging to the path being built right now.
          let deg = 0, foreign = 0, own = 0
          for (const e of DIRS) {
            const ax = nx + e.dx, ay = ny + e.dy
            if (!this.inside(ax, ay)) { foreign += p.edgeHug; continue }
            const j = this.idx(ax, ay)
            if (pathSet.has(j)) own++
            else if (this.owner[j] === -1) deg++
            else foreign++
          }
          if (warns > 0) {
            // Warnsdorff: prefer the cell with the fewest free neighbours.
            // It eats dead ends before they close instead of stranding them.
            w *= Math.pow(warns, 3 - deg)
          }
          // HUG: a bonus for hugging other pieces. Hypothesis — this is what
          // should give the impression of "wrapping" instead of coiling on itself.
          if (p.hug > 1 && foreign > 0) w *= Math.pow(p.hug, foreign)
          // ANTICOIL: a penalty for touching one's own path. The tail cell we
          // come from does not count — hence own - 1.
          if (anticoil > 1 && own > 1) w *= Math.pow(anticoil, -(own - 1))

          // SPACING RULE (giants only). A snake that is meant to cross the board
          // back and forth must not turn around right next to itself — otherwise
          // it eats its own space and gets stuck. We enforce a minimum distance
          // to its own runs from at least a few steps ago; the channels left
          // between the runs will later be filled by other pieces.
          if (isGiant && p.giantSpacing > 1 && p.giantSpacePenalty > 1) {
            const k = p.giantSpacing
            const here = path.length
            let near = 0
            for (let ox = -k; ox <= k; ox++) {
              for (let oy = -k; oy <= k; oy++) {
                if (ox === 0 && oy === 0) continue
                const px = nx + ox, py = ny + oy
                if (!this.inside(px, py)) continue
                const pos = pathPos.get(this.idx(px, py))
                // The last 2k cells are the tail's natural neighbourhood — skipped.
                if (pos !== undefined && here - pos > 2 * k) near++
              }
            }
            // A PENALTY, not a ban. A ban would make turning around impossible:
            // moving from lane to lane requires crossing the spacing zone, so the
            // snake got stuck after two hundred cells regardless of the ordered length.
            if (near > 0) w *= Math.pow(p.giantSpacePenalty, -near)
          }
          cand.push({ x: nx, y: ny, dd, w })
        }
        if (!cand.length) {
          // Stall diagnostics: what surrounds the tail (own path, another
          // piece, the edge) and after how many cells. This settles whether the
          // path is closed off by its own body or by nooks of the frontier.
          let own = 0, foreign = 0, edge = 0
          for (const dd of DIRS) {
            const nx = tail.x + dd.dx, ny = tail.y + dd.dy
            if (!this.inside(nx, ny)) edge++
            else if (pathSet.has(this.idx(nx, ny))) own++
            else foreign++
          }
          const st = this.stats
          st.stallOwn = (st.stallOwn ?? 0) + own
          st.stallForeign = (st.stallForeign ?? 0) + foreign
          st.stallEdge = (st.stallEdge ?? 0) + edge
          st.stallLen = (st.stallLen ?? 0) + path.length
          st.stallSelfTrap = (st.stallSelfTrap ?? 0) + (own >= 2 ? 1 : 0)
          break
        }
        let total = cand.reduce((s, c) => s + c.w, 0), r = rng() * total, pick = cand[0]
        for (const c of cand) { r -= c.w; if (r <= 0) { pick = c; break } }
        path.push({ x: pick.x, y: pick.y })
        pathSet.add(this.idx(pick.x, pick.y))
        pathPos.set(this.idx(pick.x, pick.y), path.length - 1)
        lastDir = pick.dd
      }

      if (path.length < 2) continue
      if (isGiant && this.p.debug) {
        const grew = path.length
        this.p.debug(`  [giant] ordered ${want}, growth gave ${grew} (${grew < want ? 'STUCK' : 'full length'})`)
      }
      this.stats.want += want; this.stats.n++
      if (path.length < want) this.stats.stall++
      const beforeStrand = path.length
      // Cells of fragments that failed the exact test — shortening the path
      // must not "push" them above the test limit (see wouldStrand).
      const failed = new Set()
      if (this.wouldStrand(path, failed)) {
        if (!this.shortenPath(path, failed)) continue
        this.stats.strandTrunc++
        this.stats.strandLoss += beforeStrand - path.length
        if (isGiant && this.p.debug) {
          this.p.debug(`  [giant] leftover test trimmed ${beforeStrand} -> ${path.length}`)
        }
      }
      this.stats.got += path.length

      const id = this.pieces.length
      for (const c of path) this.owner[this.idx(c.x, c.y)] = id
      this.pieces.push({ id, cells: path, dir: d })
      this.remaining -= path.length
      this.recomputeLines(path)
      this.touch(path)
      carved = true
      }
      if (carved) break
      }
      if (carved) return true
    }
    return false
  }

  // Does ANY legal head exist in this state? If not, the generator is stalled
  // not because it is out of room, but because the free cells cannot be reached:
  // each of them has other free cells in front of it.
  legalHeadCount() {
    let n = 0
    for (let d = 0; d < 4; d++) {
      const nLines = d === 0 || d === 2 ? this.W : this.H
      const back = DIRS[(d + 2) % 4]
      for (let line = 0; line < nLines; line++) {
        const h = this.headCandidate(d, line)
        if (!h) continue
        const bx = h.x + back.dx, by = h.y + back.dy
        if (!this.inside(bx, by) || !this.free(bx, by)) continue
        n++
      }
    }
    return n
  }

  /**
   * LEFTOVER ABSORPTION — the endgame safety net.
   *
   * When no head yields a legal path, small fragments remain: sometimes
   * non-decomposable (a cross with three leaves), sometimes decomposable but
   * with no legal head order. Instead of undoing cuts blindly, we REWRITE THE
   * TAIL END of a neighbouring piece: its cells from the contact point with the
   * fragment to the tail, plus the whole fragment, are laid out as a new
   * Hamiltonian path.
   *
   * This is always legal and does not change the blocking graph:
   *  - the head, neck and ray stay the same, so the piece exits just as
   *    before; the body follows the head's track, its shape does not matter;
   *  - the tail-end cells stay with the same piece (the same index in the
   *    solution order), so the rays of later pieces that pass through them
   *    still hit an earlier piece;
   *  - no ray passes through a free cell (the head was the first unassigned
   *    cell on its line at the moment of carving, and backtracking removes only
   *    later pieces), so assigning the fragment blocks nobody new.
   *
   * Extending the tail is a special case (empty tail end) and is tried first,
   * because it is the cheapest. We only absorb fragments of up to
   * `absorbLimit` cells: a large free area needs ordinary carving, not gluing
   * into a single clump. One call absorbs one fragment and returns true so the
   * generator tries carving normally again.
   */
  absorbLeftover() {
    const limit = this.p.absorbLimit ?? 0
    if (limit <= 0) return false
    const { W, H, owner } = this
    const cellIndexIn = new Map() // "id:idx" -> position of the cell within the piece
    const posOf = (pc, i) => {
      const key = pc.id
      let m = cellIndexIn.get(key)
      if (!m) { m = new Map(); pc.cells.forEach((c, k) => m.set(this.idx(c.x, c.y), k)); cellIndexIn.set(key, m) }
      return m.get(i)
    }
    const { touched, absorbMemo } = this
    const seen = new Uint8Array(W * H)
    for (let s = 0; s < W * H; s++) {
      if (owner[s] !== -1 || seen[s]) continue
      // the fragment of free cells around s, with a size limit
      const comp = []
      const stack = [s]
      seen[s] = 1
      let tooBig = false
      // the newest change among the fragment's cells and their neighbours
      let changed = 0
      while (stack.length) {
        const i = stack.pop()
        if (!tooBig) comp.push(i)
        if (comp.length > limit) tooBig = true
        if (touched[i] > changed) changed = touched[i]
        const x = i % W, y = (i / W) | 0
        for (const { dx, dy } of DIRS) {
          const nx = x + dx, ny = y + dy
          if (!this.inside(nx, ny)) continue
          const j = this.idx(nx, ny)
          if (touched[j] > changed) changed = touched[j]
          if (owner[j] === -1 && !seen[j]) { seen[j] = 1; stack.push(j) }
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
      const cands = new Map()
      for (const i of comp) {
        const x = i % W, y = (i / W) | 0
        for (const { dx, dy } of DIRS) {
          const nx = x + dx, ny = y + dy
          if (!this.inside(nx, ny)) continue
          const o = owner[this.idx(nx, ny)]
          if (o < 0) continue
          const pc = this.pieces[o]
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
        const newTail = []
        for (let j = 0; j < found.length; j++) newTail.push({ x: found[j] % W, y: (found[j] / W) | 0 })
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

  /**
   * Hamiltonian path over the fragment `comp` plus the tail end of `pc` after
   * position `k`, starting next to the anchor `pc.cells[k]`. Returns the path
   * as cell indices, or null.
   *
   * Depth-first search with the Warnsdorff order (fewest free exits first,
   * ties in DIRS order) and a budget of 20 000 nodes shared by the starts —
   * the same order and the same budget as the original Set-based search, so
   * the same board comes out of the same seed; only the allocations are gone:
   * membership is a stamp in a typed array and the per-depth candidate lists
   * live in one preallocated buffer.
   */
  absorbPath(comp, pc, k) {
    const { W, H, absRegion, absUsed } = this
    const regionGen = ++this.absGen
    for (const i of comp) absRegion[i] = regionGen
    for (let j = k + 1; j < pc.cells.length; j++) absRegion[this.idx(pc.cells[j].x, pc.cells[j].y)] = regionGen
    const size = comp.length + (pc.cells.length - 1 - k)
    const anchor = pc.cells[k]

    // neighbours inside the region, in DIRS order (up, right, down, left)
    const nbr = (i, out) => {
      const x = i % W, y = (i / W) | 0
      let n = 0
      if (y > 0 && absRegion[i - W] === regionGen) out[n++] = i - W
      if (x < W - 1 && absRegion[i + 1] === regionGen) out[n++] = i + 1
      if (y < H - 1 && absRegion[i + W] === regionGen) out[n++] = i + W
      if (x > 0 && absRegion[i - 1] === regionGen) out[n++] = i - 1
      return n
    }
    const starts = new Int32Array(4)
    const nStarts = nbr(this.idx(anchor.x, anchor.y), starts)

    const path = new Int32Array(size)
    const next = new Int32Array(4 * (size + 1))   // per depth: up to 4 candidates
    const deg = new Int32Array(4 * (size + 1))
    const tmp = new Int32Array(4)
    let usedGen = 0
    let budget = 20000
    let len = 0

    const search = (tail, depth) => {
      if (len === size) return true
      if (--budget < 0) return false
      // Warnsdorff: neighbours with the fewest free exits first; insertion
      // sort keeps equal degrees in DIRS order, like the stable Array sort.
      const base = 4 * depth
      const n = nbr(tail, tmp)
      let cnt = 0
      for (let a = 0; a < n; a++) {
        const c = tmp[a]
        if (absUsed[c] === usedGen) continue
        // free exits of c: region neighbours not yet used
        const cx = c % W, cy = (c / W) | 0
        let d = 0
        if (cy > 0 && absRegion[c - W] === regionGen && absUsed[c - W] !== usedGen) d++
        if (cx < W - 1 && absRegion[c + 1] === regionGen && absUsed[c + 1] !== usedGen) d++
        if (cy < H - 1 && absRegion[c + W] === regionGen && absUsed[c + W] !== usedGen) d++
        if (cx > 0 && absRegion[c - 1] === regionGen && absUsed[c - 1] !== usedGen) d++
        // stable insertion: after every entry with degree <= d
        let pos = cnt
        while (pos > 0 && deg[base + pos - 1] > d) { next[base + pos] = next[base + pos - 1]; deg[base + pos] = deg[base + pos - 1]; pos-- }
        next[base + pos] = c; deg[base + pos] = d; cnt++
      }
      for (let a = 0; a < cnt; a++) {
        const c = next[base + a]
        absUsed[c] = usedGen; path[len++] = c
        if (search(c, depth + 1)) return true
        absUsed[c] = 0; len--
      }
      return false
    }

    for (let si = 0; si < nStarts; si++) {
      const s0 = starts[si]
      usedGen = ++this.absGen
      absUsed[s0] = usedGen; path[0] = s0; len = 1
      if (search(s0, 1)) return path.subarray(0, len)
      if (budget < 0) break
    }
    return null
  }

  // Jam diagnostics: what the part the generator could not close looks like.
  leftoverReport() {
    const seen = new Uint8Array(this.W * this.H)
    const sizes = []
    for (let i = 0; i < this.W * this.H; i++) {
      if (this.owner[i] !== -1 || seen[i]) continue
      let size = 0
      const stack = [i]
      while (stack.length) {
        const j = stack.pop()
        if (seen[j]) continue
        seen[j] = 1
        size++
        const x = j % this.W, y = (j / this.W) | 0
        for (const { dx, dy } of DIRS) {
          const nx = x + dx, ny = y + dy
          if (!this.inside(nx, ny)) continue
          const k = this.idx(nx, ny)
          if (this.owner[k] === -1 && !seen[k]) stack.push(k)
        }
      }
      sizes.push(size)
    }
    sizes.sort((a, b) => b - a)
    return sizes
  }

  /**
   * TARGETED backtrack: undoes back to the NEWEST piece touching the remaining
   * area, but no fewer than `atLeast` pieces.
   *
   * The carving order is the solution order, so undoing is only possible
   * chronologically — but it need not be blind. With 5000 pieces the last k
   * cuts lie in a random region of the board and removing them changes nothing
   * around the leftover; removing a neighbour of the leftover merges it with a
   * larger free area, which then carves normally. The newest neighbour is the
   * cheapest; on subsequent backtracks `atLeast` grows, so we undo deeper.
   */
  undoToFrontier(atLeast) {
    let newest = -1
    for (let i = 0; i < this.W * this.H; i++) {
      if (this.owner[i] !== -1) continue
      const x = i % this.W, y = (i / this.W) | 0
      for (const { dx, dy } of DIRS) {
        const nx = x + dx, ny = y + dy
        if (!this.inside(nx, ny)) continue
        const o = this.owner[this.idx(nx, ny)]
        if (o > newest) newest = o
      }
    }
    if (newest < 0) return 0
    const k = Math.max(atLeast, this.pieces.length - newest)
    this.undoLast(k)
    return k
  }

  undoLast(k) {
    for (let i = 0; i < k && this.pieces.length; i++) {
      const pc = this.pieces.pop()
      for (const c of pc.cells) this.owner[this.idx(c.x, c.y)] = -1
      this.remaining += pc.cells.length
      this.recomputeLines(pc.cells)
      this.touch(pc.cells)
    }
  }

  run(maxBacktracks = 200) {
    const t0 = performance.now()
    let lastLog = t0
    // The budget is deliberately small: a targeted backtrack can be deep (it
    // undoes back to the newest neighbour of the leftover, i.e. sometimes
    // thousands of pieces), so after 200 backtracks a restart with a derived
    // seed is cheaper and more effective.
    if (this.p.maxBack > 0) maxBacktracks = this.p.maxBack
    let scanMisses = 0
    while (this.remaining > 0) {
      if (this.p.trace && this.pieces.length % 500 === 0 && performance.now() - lastLog > 250) {
        lastLog = performance.now()
        this.p.trace({
          pieces: this.pieces.length,
          remaining: this.remaining,
          backtracks: this.backtracks,
          ms: lastLog - t0,
          total: this.W * this.H,
        })
      }
      if (this.carveOne()) continue
      // Before undoing anything, try absorbing the leftovers with a neighbour's
      // tail — this does not change the blocking graph, whereas a backtrack with
      // thousands of pieces hits a random region of the board.
      if (this.absorbLeftover()) continue
      // FULL SCAN of the legal heads before the first undo. The draws above
      // sample a handful of heads per direction; on a large board there are
      // hundreds, and every jam of the random 1000×1000 sweep still had
      // 208–688 legal heads when it gave up — the search starved, the
      // geometry was fine. A backtrack undoes the newest neighbour of the
      // leftover, i.e. pieces in the region being carved, so it does not put
      // the missed heads back in play; trying each of them once does.
      //
      // Two bounds keep the scan from paying for jams it cannot fix. Three
      // misses in a row switch it off until it hits again: a board whose
      // legal heads all fail the leftover test (the shredded 1000×1000 boards
      // of the sweep: 253 heads, 0 carvable) is a geometric jam, and scanning
      // it before each of hundreds of backtracks made the verdict 1.3–3.7×
      // slower. And one attempt gets as many scans as it gets undos: on a
      // shredded board with the odd carvable head the scan hits, carves one
      // piece, the draws fail again and the next scan starts over — board 94
      // did 1 268 scans (1 067 hits) in one attempt, still jammed, at twice
      // the time. The scan is the cheaper alternative to an undo, so it
      // shares the undo budget; after that the jam goes to backtracking.
      if (scanMisses < 3 && (this.stats.headScans ?? 0) < maxBacktracks) {
        this.stats.headScans = (this.stats.headScans ?? 0) + 1
        if (this.carveOne(true)) {
          this.stats.headScanHits = (this.stats.headScanHits ?? 0) + 1
          scanMisses = 0
          continue
        }
        scanMisses++
      }
      // Remember the BEST jam moment (fewest remaining cells): the state after
      // a series of undos says nothing about the cause.
      if (this.remaining < (this.stuckRemaining ?? Infinity)) {
        this.stuckRemaining = this.remaining
        this.stuckSizes = this.leftoverReport()
        this.stuckHeads = this.legalHeadCount()
      }
      if (this.backtracks >= maxBacktracks || !this.pieces.length) return false
      this.backtracks++
      if (this.undoToFrontier(1 + Math.floor(Math.log2(1 + this.backtracks))) === 0) return false
    }
    return true
  }
}

// ---------------------------------------------------------------- metrics

function analyse(board, ruleB = true) {
  const { W, H, owner, pieces } = board
  const idx = (x, y) => y * W + x
  const inside = (x, y) => x >= 0 && y >= 0 && x < W && y < H
  const N = pieces.length
  // The blocking graph lives in typed arrays: the distinct pieces crossed by
  // the rays of piece i are `edges[start[i] .. start[i + 1])`, in ray order.
  // A 1000×1000 board of 150 thousand short pieces has 25 million such pairs;
  // as a Set of ids per piece (plus the copy Kahn consumed) that graph blew
  // the Node heap after the generator had closed the board at 150 MB.
  // `stamp[o]` remembers which piece last recorded o, so a piece crossed by
  // several rays (or twice by one ray) is counted once, as the Set did.
  let edges = new Int32Array(Math.max(1024, N * 8))
  let edgeCount = 0
  const start = new Int32Array(N + 1)
  const stamp = new Int32Array(N).fill(-1)
  const addBlocker = (i, o) => {
    if (stamp[o] === i) return
    stamp[o] = i
    if (edgeCount === edges.length) { const grown = new Int32Array(edges.length * 2); grown.set(edges); edges = grown }
    edges[edgeCount++] = o
  }
  let corridorTotal = 0, corridorLines = 0
  const minDist = new Float64Array(N).fill(Infinity)

  const RULE_B = ruleB
  for (let i = 0; i < N; i++) {
    const pc = pieces[i]
    start[i] = edgeCount
    const { dx, dy } = DIRS[pc.dir]
    if (RULE_B) {
      const h = pc.cells[0]
      let x = h.x, y = h.y, lastOwn = 0, step = 0
      corridorLines++
      while (true) {
        x += dx; y += dy; step++
        if (!inside(x, y)) break
        corridorTotal++
        const o = owner[idx(x, y)]
        if (o === -2) continue
        if (o === pc.id) { lastOwn = step; continue }
        addBlocker(i, o)
        minDist[i] = Math.min(minDist[i], step - lastOwn)
      }
      continue
    }
    const lines = new Map() // line -> the cell farthest from the exit edge
    for (const c of pc.cells) {
      const key = dx === 0 ? c.x : c.y
      const depth = dx === 0 ? (dy < 0 ? c.y : H - 1 - c.y) : (dx < 0 ? c.x : W - 1 - c.x)
      const cur = lines.get(key)
      if (!cur || depth > cur.depth) lines.set(key, { c, depth })
    }
    for (const { c, depth } of lines.values()) {
      corridorTotal += depth; corridorLines++
      let x = c.x, y = c.y, lastOwn = 0, step = 0
      while (true) {
        x += dx; y += dy; step++
        if (!inside(x, y)) break
        const o = owner[idx(x, y)]
        if (o === -2) continue            // a void does not block
        if (o === pc.id) { lastOwn = step; continue }
        addBlocker(i, o)
        minDist[i] = Math.min(minDist[i], step - lastOwn)
      }
    }
  }
  start[N] = edgeCount
  const blockerCount = (i) => start[i + 1] - start[i]

  // The reverse graph — which pieces i blocks — in the same layout, each list
  // in ascending order of the blocked piece (the sums below depend on it).
  const outStart = new Int32Array(N + 1)
  for (let e = 0; e < edgeCount; e++) outStart[edges[e] + 1]++
  for (let b = 0; b < N; b++) outStart[b + 1] += outStart[b]
  const blocks = new Int32Array(edgeCount)
  const cursor = outStart.slice(0, N)
  for (let i = 0; i < N; i++) for (let e = start[i]; e < start[i + 1]; e++) blocks[cursor[edges[e]]++] = i
  const outDegree = (i) => outStart[i + 1] - outStart[i]

  // Kahn: solvable <=> the blocking graph is acyclic
  const remaining = new Int32Array(N)
  const queue = new Int32Array(N)
  let head = 0, tail = 0
  for (let i = 0; i < N; i++) { remaining[i] = blockerCount(i); if (remaining[i] === 0) queue[tail++] = i }
  const freeCount = tail
  const depthOf = new Int32Array(N)
  let done = 0, maxDepth = 0
  while (head < tail) {
    const i = queue[head++]; done++
    if (depthOf[i] > maxDepth) maxDepth = depthOf[i]
    for (let e = outStart[i]; e < outStart[i + 1]; e++) {
      const j = blocks[e]
      if (depthOf[i] + 1 > depthOf[j]) depthOf[j] = depthOf[i] + 1
      if (--remaining[j] === 0) queue[tail++] = j
    }
  }

  // ---- REACH AND UNBLOCKING POWER ----
  // The game makes sense when removing one line unblocks pieces on the other
  // side of the board. So we measure not the ribbon length, but:
  //  span       - what fraction of a board side the piece covers (reach),
  //  outDeg     - how many pieces its removal unblocks,
  //  blockDist  - how far away spatially those unblocked pieces lie.
  let spanSum = 0, outSum = 0, maxOut = 0, distSum = 0, distCount = 0
  const spans = []
  for (let i = 0; i < N; i++) {
    const pc = pieces[i]
    let minX = Infinity, maxX = -Infinity, minY = Infinity, maxY = -Infinity
    for (const c of pc.cells) {
      if (c.x < minX) minX = c.x
      if (c.x > maxX) maxX = c.x
      if (c.y < minY) minY = c.y
      if (c.y > maxY) maxY = c.y
    }
    const span = Math.max((maxX - minX + 1) / W, (maxY - minY + 1) / H)
    spans.push(span)
    spanSum += span

    outSum += outDegree(i)
    if (outDegree(i) > maxOut) maxOut = outDegree(i)
    const hi = pc.cells[0]
    for (let e = outStart[i]; e < outStart[i + 1]; e++) {
      const hj = pieces[blocks[e]].cells[0]
      distSum += Math.abs(hi.x - hj.x) + Math.abs(hi.y - hj.y)
      distCount++
    }
  }
  spans.sort((a, b) => b - a)
  const spanTop10 = spans.slice(0, Math.max(1, Math.ceil(N / 10)))
  const spanTop10Avg = spanTop10.reduce((a, b) => a + b, 0) / spanTop10.length

  let T2 = 0, almost = 0
  for (let i = 0; i < N; i++) {
    if (blockerCount(i) > 0 && minDist[i] > 2) T2++
    // On a 100% filled board "corridor clear for k cells" almost never holds,
    // because there is always someone right in front of the piece. The real
    // temptation to err is a piece blocked by EXACTLY ONE other piece — it looks
    // almost ready to leave.
    if (blockerCount(i) === 1) almost++
  }

  let bends = 0, multiLine = 0, coil = 0, cellsTotal = 0
  // "Wrapping" measures:
  //  selfAdj      - mean number of OWN neighbours per cell (coiling),
  //  neighbours   - how many distinct other pieces a piece touches,
  //  sharedBorder - the longest shared border with a single other piece,
  //                 normalised by the piece length. This is what grows when a
  //                 piece actually wraps around another.
  let selfAdjTotal = 0, neighboursTotal = 0, sharedBorderTotal = 0, longPieces = 0
  for (const pc of pieces) {
    let prev = null, b = 0
    const lines = new Set()
    for (let i = 1; i < pc.cells.length; i++) {
      const dx = pc.cells[i].x - pc.cells[i - 1].x, dy = pc.cells[i].y - pc.cells[i - 1].y
      if (prev && (dx !== prev.dx || dy !== prev.dy)) b++
      prev = { dx, dy }
    }
    const own = new Set(pc.cells.map((c) => idx(c.x, c.y)))
    const borderWith = new Map()   // id of another piece -> number of shared edges
    for (const c of pc.cells) {
      let n = 0
      for (const { dx, dy } of DIRS) {
        const ax = c.x + dx, ay = c.y + dy
        if (!inside(ax, ay)) continue
        const j = idx(ax, ay)
        if (own.has(j)) { n++; continue }
        const o = owner[j]
        if (o >= 0) borderWith.set(o, (borderWith.get(o) ?? 0) + 1)
      }
      if (n >= 3) coil++     // the path touches itself -> a clump, not a line
      selfAdjTotal += n
      cellsTotal++
    }
    // The measures are computed only on pieces long enough to have a chance of
    // wrapping anything — a domino wraps nothing by definition.
    if (pc.cells.length >= 8) {
      longPieces++
      neighboursTotal += borderWith.size
      // A loop, not Math.max(...borderWith.values()): a long piece borders as
      // many pieces as it has cells, and a spread of that size overflows the stack.
      let maxShared = 0
      for (const shared of borderWith.values()) if (shared > maxShared) maxShared = shared
      sharedBorderTotal += maxShared / pc.cells.length
    }
    for (const c of pc.cells) lines.add(DIRS[pc.dir].dx === 0 ? c.x : c.y)
    if (lines.size > 1) multiLine++
    bends += b
  }
  const hist = { '2-6': 0, '7-15': 0, '16-49': 0, '50+': 0 }
  // A loop, not Math.min(...pieces.map(...)): spreading 86 thousand arguments
  // overflows the worker stack in Chrome (1000×1000), even though it passes in Node.
  let maxLen = 0, minLen = Infinity, covered = 0
  for (const pc of pieces) {
    const L = pc.cells.length
    if (L > maxLen) maxLen = L
    if (L < minLen) minLen = L
    covered += L
    if (L <= 6) hist['2-6']++
    else if (L <= 15) hist['7-15']++
    else if (L < 50) hist['16-49']++
    else hist['50+']++
  }

  return {
    N, solvable: done === N, unsolved: N - done,
    f0: freeCount / N, T2, almost, D: maxDepth, bends: bends / N, multiLine: multiLine / N, coil: coil / cellsTotal,
    selfAdj: selfAdjTotal / cellsTotal,
    bendsPerCell: bends / cellsTotal,
    span: spanSum / N,
    spanTop10: spanTop10Avg,
    spanMax: spans[0],
    outDeg: outSum / N,
    maxOut,
    blockDist: distCount ? distSum / distCount / (W + H) : 0,
    neighbours: longPieces ? neighboursTotal / longPieces : 0,
    sharedBorder: longPieces ? sharedBorderTotal / longPieces : 0,
    longPieces,
    meanCorridorLen: corridorTotal / Math.max(1, corridorLines),
    minLen, maxLen, hist,
    coverage: covered / (W * H),
  }
}

// ---------------------------------------------------------------- render

function render(board) {
  const { W, H, owner, pieces } = board
  const idx = (x, y) => y * W + x
  const grid = Array.from({ length: H }, () => new Array(W).fill(' '))
  for (const pc of pieces) {
    const set = new Set(pc.cells.map((c) => idx(c.x, c.y)))
    pc.cells.forEach((c, i) => {
      if (i === 0) { grid[c.y][c.x] = DIRS[pc.dir].ch; return }
      let up = false, dn = false, lf = false, rt = false
      if (c.y > 0 && set.has(idx(c.x, c.y - 1))) up = true
      if (c.y < H - 1 && set.has(idx(c.x, c.y + 1))) dn = true
      if (c.x > 0 && set.has(idx(c.x - 1, c.y))) lf = true
      if (c.x < W - 1 && set.has(idx(c.x + 1, c.y))) rt = true
      const n = (up ? 1 : 0) + (dn ? 1 : 0) + (lf ? 1 : 0) + (rt ? 1 : 0)
      let ch = '●'
      if (n === 2) {
        if (up && dn) ch = '│'
        else if (lf && rt) ch = '─'
        else if (dn && rt) ch = '┌'
        else if (dn && lf) ch = '┐'
        else if (up && rt) ch = '└'
        else ch = '┘'
      } else if (n === 1) {
        ch = up || dn ? '│' : '─'
      }
      grid[c.y][c.x] = ch
    })
  }
  return grid.map((r) => r.join('')).join('\n')
}


// ---------------------------------------------------------------- SVG

// A preview for judging the look by eye. The monochrome variant is faithful
// to the original and is the proper LEGIBILITY test: the player, too, has to
// tell the pieces apart without the help of colour.
function toSvg(board, opts = {}) {
  const { cell = 16, colored = false, top = 0, voids = false } = opts
  const { W, H, pieces } = board
  // The set of ids of the N longest pieces — we draw them in red and ON TOP,
  // so that the course of a single line can be traced.
  const longest = new Set(
    [...pieces].sort((a, b) => b.cells.length - a.cells.length).slice(0, top).map((p) => p.id),
  )
  const pad = cell
  const sw = cell * (opts.strokeRatio ?? 0.5)
  const w = W * cell + pad * 2, h = H * cell + pad * 2
  const cx = (x) => pad + x * cell + cell / 2
  const cy = (y) => pad + y * cell + cell / 2
  const out = [
    `<svg xmlns="http://www.w3.org/2000/svg" width="${w}" height="${h}" viewBox="0 0 ${w} ${h}">`,
    `<rect width="${w}" height="${h}" fill="#f6f6fa"/>`,
  ]

  // Jam preview: cells the generator failed to carve. We merge them into
  // horizontal strips — with 55 thousand holes, separate rectangles would
  // produce a document that cannot be displayed.
  if (voids && board.owner) {
    const rects = []
    for (let y = 0; y < H; y++) {
      let start = -1
      for (let x = 0; x <= W; x++) {
        const empty = x < W && board.owner[y * W + x] === -1
        if (empty && start < 0) start = x
        if (!empty && start >= 0) {
          rects.push(`<rect x="${pad + start * cell}" y="${pad + y * cell}" width="${(x - start) * cell}" height="${cell}"/>`)
          start = -1
        }
      }
    }
    if (rects.length) out.push(`<g fill="#e8467c" fill-opacity=".22">${rects.join('')}</g>`)
  }

  out.push(`<g fill="none" stroke-width="${sw}" stroke-linecap="round" stroke-linejoin="round">`)
  const heads = []
  const highlight = []      // paths of the longest pieces, drawn last
  const highlightHeads = []
  // In colour mode the pink would blend into the palette, so highlighted
  // pieces are drawn thicker — legible regardless of the neighbours' colours.
  const hiWidth = (sw * (colored ? 1.5 : 1.15)).toFixed(2)
  pieces.forEach((pc, i) => {
    const isLong = longest.has(pc.id)
    const col = isLong ? '#e8467c' : colored ? `hsl(${(i * 137.508) % 360} 62% 42%)` : '#232447'
    const pts = pc.cells.map((c) => `${cx(c.x)},${cy(c.y)}`).join(' ')
    const line = `<polyline points="${pts}" stroke="${col}"/>`
    const { dx, dy } = DIRS[pc.dir]
    const hx = cx(pc.cells[0].x), hy = cy(pc.cells[0].y)
    // A narrow isosceles head: tip 0.48 of a cell past the head centre, so it
    // stays inside the head cell (0.62 looked like an overshoot, and two heads
    // facing each other in neighbouring cells overlapped), base 0.1 behind the
    // centre and 0.56 wide (a 0.84 base made two heads meeting at a right
    // angle in neighbouring cells touch).
    const tip = cell * 0.48, len = cell * 0.58, half = cell * 0.28
    const tx = hx + dx * tip, ty = hy + dy * tip
    const bx = tx - dx * len, by = ty - dy * len
    const head = `<polygon points="${tx},${ty} ${bx - dy * half},${by + dx * half} ${bx + dy * half},${by - dx * half}" fill="${col}"/>`
    if (isLong) { highlight.push(line); highlightHeads.push(head) } else { out.push(line); heads.push(head) }
  })
  out.push('</g>')
  if (highlight.length) {
    out.push(`<g fill="none" stroke-width="${hiWidth}" stroke-linecap="round" stroke-linejoin="round">`)
    out.push(...highlight)
    out.push('</g>')
  }
  out.push(`<g>${heads.join('')}${highlightHeads.join('')}</g>`, '</svg>')
  return out.join('\n')
}


/**
 * The full set of parameters with default values. A single source of truth for
 * the CLI and for the lab — adding a knob here is enough for it to appear in
 * both.
 */
// An inactive knob = it has no effect on the result under the current settings.
// The lab dims such fields and shows the reason, so that nobody measures a
// change that does not exist. `inactive(p)` returns a reason KEY from
// INACTIVE_REASONS (or null); the lab translates the key into text.
const skeletonOff = (p) => (p.giants <= 0 && p.wGiant <= 0 ? 'skeletonOff' : null)

export const PARAM_SPEC = [
  { key: 'W', label: 'width', group: 'board', min: 4, max: 1000, step: 1, def: 25,
    help: 'Number of columns. Boards up to 400×400 generate in under two seconds; 1000×1000 takes about ten.' },
  { key: 'H', label: 'height', group: 'board', min: 4, max: 1000, step: 1, def: 50,
    help: 'Number of rows. A tall board is harder than a square one with the same number of cells.' },
  { key: 'seed', label: 'seed', group: 'board', min: 0, max: 999999, step: 1, def: 7,
    help: 'The same seed with the same settings always gives the same board.' },

  { key: 'wShort', label: 'share of short pieces (2–6 cells)', group: 'lengths', min: 0, max: 1, step: 0.01, def: 0.2,
    help: 'Fraction of short pieces. Higher = more arrowheads, but a mess of little hooks. Short and medium together may not exceed 0.9.' },
  { key: 'wMid', label: 'share of medium pieces (7–15 cells)', group: 'lengths', min: 0, max: 1, step: 0.01, def: 0.08,
    help: 'Fraction of medium pieces. Whatever is left after short and medium goes to long pieces. Short and medium together may not exceed 0.9.' },
  { key: 'Lmax', label: 'maximum length (0 = 2.5 × side)', group: 'lengths', min: 0, max: 5000, step: 1, def: 0,
    help: 'The longest piece the generator tries for. 0 = 2.5 x the longer side. 1-5 cut the board into crumbs and jam, so use 0 or at least 6.' },

  { key: 'pStraight', label: 'straightness bias', group: 'shape', min: 0.6, max: 1, step: 0.01, def: 0.85,
    help: 'How readily a line keeps going straight. Higher = longer straight runs. Below 0.6 big boards stop closing. At 0.6 boards over 500x500 may jam; 0.65 is safe.' },
  { key: 'wLateral', label: 'sideways move bonus', group: 'shape', min: 0, max: 20, step: 0.5, def: 3,
    help: 'How much a line prefers turning sideways over going deeper. 0 = straight thrusts and big coils.' },
  { key: 'warns', label: 'closing off nooks', group: 'shape', min: 2, max: 16, step: 1, def: 4,
    help: 'How strongly a line fills nooks with few exits first. Higher = fewer, longer, more coiled pieces. Below 2 the rule is off and boards jam.' },
  { key: 'anticoil', label: 'coiling penalty', group: 'shape', min: 1, max: 10, step: 1, def: 6,
    help: 'How strongly a line avoids touching itself. 1 = off. Higher = fewer coils, slightly shorter pieces. Above 10 it jams with low straightness.' },
  { key: 'hug', label: 'hug bonus', group: 'shape', min: 1, max: 20, step: 1, def: 1,
    help: 'Bonus for running along already carved pieces. Little visible effect; kept for experiments.' },
  { key: 'edgeHug', label: 'edge counts as a piece', group: 'shape', min: 0, max: 4, step: 1, def: 0,
    inactive: (p) => (p.hug <= 1 ? 'hugOff' : null),
    help: 'Whether the board edge counts as a neighbouring piece for the hug bonus.' },

  { key: 'headBias', label: 'piece start (-1 layers, 0 random, 1 tunnels)', group: 'difficulty', min: -1, max: 1, step: 1, def: 0,
    inactive: (p) => (p.mix >= 0 ? 'mixOn' : null),
    help: 'Where the next piece starts: the shallowest line (layers), anywhere, or the deepest (tunnels). Tunnels = harder. All three close boards up to 400x400.' },
  { key: 'mix', label: 'layer/tunnel mixing (-1 = off)', group: 'difficulty', min: -1, max: 1, step: 0.05, def: -1,
    help: 'Fraction of pieces that start as tunnels, the rest as layers. -1 = off; otherwise 0.3-0.7, because the extremes leave boards unclosed.' },
  { key: 'probe', label: 'share of probe pieces', group: 'difficulty', min: 0, max: 1, step: 0.01, def: 0,
    help: 'Fraction of pieces whose target length is drawn around the probe length instead of the usual mix. At 1 with length 12 the board is all short pieces.' },
  { key: 'probeLen', label: 'probe length', group: 'difficulty', min: 2, max: 200, step: 1, def: 12,
    inactive: (p) => (p.probe <= 0 ? 'probeOff' : null),
    help: 'Target length of a probe, give or take half. Short probes (2) triple the piece count; long ones (200) give fewer, longer pieces.' },

  { key: 'giants', label: 'number of skeleton pieces (0 = no skeleton)', group: 'skeleton', min: 0, max: 40, step: 1, def: 0,
    help: 'How many of the first pieces are long lines crossing the board. 0 = no skeleton; 4 is a good start.' },
  { key: 'giantSpan', label: 'skeleton length (in board sides)', group: 'skeleton', min: 0, max: 200, step: 1, def: 30, inactive: skeletonOff,
    help: 'Target length of one skeleton, in board sides. The line stops earlier when it runs out of room.' },
  { key: 'giantStep', label: 'serpentine step (0 = random growth)', group: 'skeleton', min: 0, max: 40, step: 1, def: 14, inactive: skeletonOff,
    help: 'Gap between the runs of a skeleton. Small = regular stripes, large = a few highways. 0 = random growth.' },
  { key: 'giantJitter', label: 'cutting serpentine runs short', group: 'skeleton', min: 0, max: 1, step: 0.05, def: 0.6,
    inactive: (p) => skeletonOff(p) ?? (p.giantStep === 0 ? 'stepZero' : null),
    help: 'How often a skeleton run stops short of an obstacle. 0 = straight, regular edges.' },
  { key: 'wGiant', label: 'share of skeletons after the start', group: 'skeleton', min: 0, max: 0.2, step: 0.01, def: 0,
    inactive: (p) => (p.giantSpan <= 0 ? 'spanZero' : null),
    help: 'Chance that a piece carved later is also a skeleton. Above 0.2 boards get slow and stop closing at 1000x1000.' },
  // giantStraight and giantWarns act on every skeleton regardless of giantStep:
  // the serpentine only seeds the path, the tail keeps growing on these weights
  // (see growPiece), and the giants that wGiant adds later grow entirely on
  // them. So they are inactive only when there is no skeleton at all.
  { key: 'giantStraight', label: 'skeleton straightness', group: 'skeleton', min: 0.3, max: 1, step: 0.01, def: 0.94,
    inactive: skeletonOff,
    help: 'How readily a skeleton goes straight where it grows freely: the whole line with step 0, the tail after a serpentine. Below 0.3 boards stop closing.' },
  { key: 'giantWarns', label: 'closing off nooks for the skeleton', group: 'skeleton', min: 0, max: 16, step: 1, def: 0,
    inactive: skeletonOff,
    help: 'Nook rule for the skeleton alone, where it grows freely. Keep at 0: it coils the line, and a skeleton should go far.' },
  { key: 'giantAnticoil', label: 'skeleton coiling penalty', group: 'skeleton', min: 1, max: 20, step: 1, def: 6, inactive: skeletonOff,
    help: 'Self-touching penalty for the skeleton alone. The higher of this and the general one applies.' },
  { key: 'giantSpacing', label: 'skeleton spacing radius', group: 'skeleton', min: 1, max: 3, step: 1, def: 2, inactive: skeletonOff,
    help: 'How far the skeleton keeps from its own earlier runs, in cells. Above 3 it only costs time.' },
  { key: 'giantSpacePenalty', label: 'skeleton spacing strength', group: 'skeleton', min: 1, max: 40, step: 1, def: 8, inactive: skeletonOff,
    help: 'How strongly the skeleton is pushed away from itself. A penalty, not a ban, so it can turn around.' },

  { key: 'headTries', label: 'start attempts per direction', group: 'closing', min: 2, max: 16, step: 1, def: 4,
    help: 'Starting spots to try before changing direction. 1 starves the search on hard settings; above 16 only costs time.' },
  { key: 'strandLimit', label: 'exact leftover test up to N cells', group: 'closing', min: 10, max: 30, step: 1, def: 30,
    help: 'Up to what size a free fragment is checked exactly for being cuttable. Below 10 ten-cell leftovers slip through on big boards.' },
  { key: 'absorbLimit', label: 'leftover absorption up to N cells', group: 'closing', min: 12, max: 64, step: 1, def: 24,
    help: 'A fragment up to this size that cannot be carved is glued to a neighbour. Below 12 leftovers pile up and boards jam.' },
  { key: 'maxBack', label: 'backtrack budget (0 = 200)', group: 'closing', min: 0, max: 1000, step: 50, def: 0,
    help: 'How many carves may be undone in one attempt before starting over. 0 = 200, which is enough; more only delays the verdict.' },
  { key: 'restarts', label: 'allowed restarts', group: 'closing', min: 0, max: 5, step: 1, def: 3,
    help: 'How many fresh attempts with a derived seed after a failure. 0 shows the raw success rate; more than 5 almost never helps.' },
]

// Reason keys returned by `inactive(p)` in PARAM_SPEC, with their English text.
// The lab maps a key to the current language (see lab-i18n.mjs for Polish).
export const INACTIVE_REASONS = {
  skeletonOff: 'requires skeleton pieces > 0',
  hugOff: 'only works with hug bonus > 1',
  mixOn: 'superseded by layer/tunnel mixing',
  probeOff: 'only works with probe share > 0',
  stepZero: 'only works with serpentine step > 0',
  spanZero: 'requires skeleton length > 0',
}

export function defaultParams() {
  const p = { ruleB: true, voidFrac: 0 }
  for (const s of PARAM_SPEC) p[s.key] = s.def
  return p
}

// The safe envelope beyond the per-knob ranges: combinations and holes that
// the measurements showed to jam or leave boards unclosed. Each rule names the
// knobs it involves so that the lab can mark their rows. Texts are keyed like
// INACTIVE_REASONS; the lab translates them (lab-i18n PL.reasons).
export const RULES = [
  { key: 'sharesSum', keys: ['wShort', 'wMid'], check: (p) => p.wShort + p.wMid <= 0.9 + 1e-9 },
  { key: 'lmaxHole', keys: ['Lmax'], check: (p) => p.Lmax === 0 || p.Lmax >= 6 },
  { key: 'mixHole', keys: ['mix'], check: (p) => p.mix === -1 || (p.mix >= 0.3 - 1e-9 && p.mix <= 0.7 + 1e-9) },
]

export const RULE_REASONS = {
  sharesSum: 'short and medium shares together must stay at or below 0.9',
  lmaxHole: 'maximum length must be 0 (automatic) or at least 6',
  mixHole: 'mixing must be -1 (off) or between 0.3 and 0.7',
}

/**
 * Checks a full parameter set against the safe envelope. Returns [] when it is
 * valid, otherwise one entry per problem: every PARAM_SPEC key whose value is
 * not a finite number inside [min, max] gives
 * { kind: 'range', key, value, min, max }, and every RULES entry that fails
 * gives { kind: 'rule', key, keys }. Keys outside PARAM_SPEC (ruleB, voidFrac,
 * trace, debug) are ignored; step alignment is not checked.
 */
export function validateParams(params) {
  const out = []
  for (const s of PARAM_SPEC) {
    const value = params[s.key]
    if (typeof value !== 'number' || !Number.isFinite(value) || value < s.min || value > s.max) {
      out.push({ kind: 'range', key: s.key, value, min: s.min, max: s.max })
    }
  }
  for (const r of RULES) {
    if (!r.check(params)) out.push({ kind: 'rule', key: r.key, keys: r.keys })
  }
  return out
}

const LABEL_BY_KEY = new Map(PARAM_SPEC.map((s) => [s.key, s.label]))

/** One English line for a violation from validateParams(). */
export function formatViolation(v) {
  if (v.kind === 'range') return `${LABEL_BY_KEY.get(v.key) ?? v.key}: ${v.value} is outside ${v.min}..${v.max}`
  return RULE_REASONS[v.key] ?? v.key
}

/**
 * Generates a board: carves until it succeeds, restarting with a derived seed
 * on failure. Returns the board, metrics and the run — also on failure, so
 * that the lab has something to show. The merged parameters must sit inside
 * the safe envelope (validateParams), otherwise a RangeError with
 * `violations` attached is thrown before any carving starts. `unchecked`
 * skips that check; it exists for engine-internal tests only.
 */
export function generate(params, { unchecked = false } = {}) {
  const p = { ...defaultParams(), ...params }
  if (!unchecked) {
    const violations = validateParams(p)
    if (violations.length) {
      const err = new RangeError('invalid parameters: ' + violations.map(formatViolation).join('; '))
      err.violations = violations
      throw err
    }
  }
  const t0 = performance.now()
  let carver = null
  let ok = false
  let used = 0
  for (let attempt = 0; attempt <= p.restarts && !ok; attempt++) {
    used = attempt
    carver = new Carver(p.W, p.H, p, mulberry32(p.seed + attempt * 999983))
    ok = carver.run(p.maxBack > 0 ? p.maxBack : 200)
  }
  const genMs = performance.now() - t0
  const t1 = performance.now()
  const metrics = carver.pieces.length ? analyse(carver, p.ruleB) : null
  return {
    board: carver,
    metrics,
    ok,
    restartsUsed: used,
    backtracks: carver.backtracks,
    genMs,
    metricsMs: performance.now() - t1,
    // `heads` = legal heads at the moment of the smallest leftover: zero means
    // the geometry closed the board, more means the search gave up on them.
    stuck: ok ? null : { remaining: carver.stuckRemaining ?? carver.remaining, sizes: carver.stuckSizes ?? [], heads: carver.stuckHeads ?? null },
  }
}

/**
 * FNV-1a over the owner grid and the piece cell sequences: any change in which
 * cell belongs to which piece, or in the order of cells within a piece, changes
 * the hash. It is the "same board for the same seed" guarantee in one number —
 * the tests freeze recorded boards with it, and `carve.mjs --dry-run` prints
 * it so that two runtimes can be compared without writing a file.
 */
function fingerprint(board) {
  const fnv = (h, v) => Math.imul(h ^ v, 16777619) >>> 0
  let h = 2166136261
  for (let i = 0; i < board.owner.length; i++) h = fnv(h, board.owner[i] + 3)
  for (const pc of board.pieces) { h = fnv(h, pc.dir); for (const c of pc.cells) h = fnv(h, c.y * board.W + c.x) }
  return h.toString(16)
}

export { mulberry32, Carver, analyse, render, toSvg, fingerprint, DIRS }
