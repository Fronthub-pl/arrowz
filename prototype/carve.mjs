// PROTOTYP WYRZUCALNY — sonda do specyfikacji, nie kod produkcyjny.
// Cel: zmierzyć, czy wycinanie z pełnej planszy domyka ją przy minimalnej długości 2,
// jak często musi się cofać, jaki wychodzi rozkład długości i jakie wartości
// przyjmują metryki trudności. Uruchomienie: node prototype/carve.mjs [opcje]

const DIRS = [
  { dx: 0, dy: -1, ch: '↑' }, // 0 góra
  { dx: 1, dy: 0, ch: '→' },  // 1 prawo
  { dx: 0, dy: 1, ch: '↓' },  // 2 dół
  { dx: -1, dy: 0, ch: '←' }, // 3 lewo
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

// ---------------------------------------------------------------- plansza

class Carver {
  constructor(W, H, params, rng) {
    this.W = W
    this.H = H
    this.p = params
    this.rng = rng
    this.owner = new Int32Array(W * H).fill(-1) // -1 = nieprzypisana (zbiór R)
    this.pieces = []
    this.remaining = W * H
    this.backtracks = 0
    this.stats = { want: 0, got: 0, stall: 0, strandTrunc: 0, strandLoss: 0, n: 0 }
    // depth[d][linia] = ile kolejnych przypisanych komórek od krawędzi w głąb
    this.depth = [new Int32Array(W), new Int32Array(H), new Int32Array(W), new Int32Array(H)]
  }

  idx(x, y) { return y * this.W + x }
  inside(x, y) { return x >= 0 && y >= 0 && x < this.W && y < this.H }
  free(x, y) { return this.owner[this.idx(x, y)] === -1 }

  // pierwsza nieprzypisana komórka na linii, licząc od krawędzi wyjścia kierunku d
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

  // czy promień z (x,y) w kierunku d prowadzi wyłącznie przez komórki
  // przypisane albo należące do budowanej ścieżki
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

  // ------------------------------------------------ test kształtu resztki

  // Czy zbiór komórek da się rozłożyć na ścieżki o długości >= 2?
  // Brute force dla małych fragmentów; K(1,3) — np. tetromino T — jest
  // najmniejszym spójnym kontrprzykładem, plus-pentomino kolejnym.
  decomposable(cellSet) {
    const cells = [...cellSet]
    if (cells.length === 0) return true
    if (cells.length === 1) return false
    const rest = new Set(cellSet)
    const start = cells[0]
    rest.delete(start)
    const nbrs = (i) => {
      const x = i % this.W, y = (i / this.W) | 0
      const out = []
      for (const { dx, dy } of DIRS) {
        const nx = x + dx, ny = y + dy
        if (this.inside(nx, ny)) out.push(this.idx(nx, ny))
      }
      return out
    }
    // rozwijaj ścieżkę od `start`, po długości >= 2 próbuj domknąć resztę
    const walk = (tail, used) => {
      if (used.size >= 2) {
        const remain = new Set([...cellSet].filter((c) => !used.has(c)))
        if (this.decomposable(remain)) return true
      }
      for (const n of nbrs(tail)) {
        if (!cellSet.has(n) || used.has(n)) continue
        used.add(n)
        if (walk(n, used)) return true
        used.delete(n)
      }
      return false
    }
    return walk(start, new Set([start]))
  }

  // fragmenty nieprzypisane sąsiadujące z `cells` — czy któryś jest za mały i nierozkładalny
  wouldStrand(cells) {
    const taken = new Set(cells.map((c) => this.idx(c.x, c.y)))
    const seen = new Set()
    for (const c of cells) {
      for (const { dx, dy } of DIRS) {
        const nx = c.x + dx, ny = c.y + dy
        if (!this.inside(nx, ny)) continue
        const start = this.idx(nx, ny)
        if (taken.has(start) || seen.has(start) || this.owner[start] !== -1) continue
        // flood fill do 9 komórek
        const comp = new Set(), stack = [start]
        let overflow = false
        while (stack.length) {
          const i = stack.pop()
          if (comp.has(i)) continue
          comp.add(i)
          if (comp.size > 8) { overflow = true; break }
          const x = i % this.W, y = (i / this.W) | 0
          for (const { dx: ax, dy: ay } of DIRS) {
            const px = x + ax, py = y + ay
            if (!this.inside(px, py)) continue
            const j = this.idx(px, py)
            if (this.owner[j] === -1 && !taken.has(j) && !comp.has(j)) stack.push(j)
          }
        }
        for (const i of comp) seen.add(i)
        if (overflow) continue // duży fragment — zakładamy, że da się rozłożyć
        if (!this.decomposable(comp)) return true
      }
    }
    return false
  }

  // ------------------------------------------------------------ wycinanie

  targetLength(progress) {
    const { rng, p } = this
    // BŁĄD PIERWOTNEJ HIPOTEZY: zakładałem, że długie kształty udają się dopiero
    // późno, bo obszar dopuszczalny rośnie. Nieprawda — element może od pierwszego
    // kroku biec PROSTO W GŁĄB od krawędzi (jego promień przechodzi przez komórki
    // własne). Ograniczony jest ruch W BOK, nie długość. Cap zostaje wyłączony.
    const cap = p.Lmax
    const r = rng()
    let lo, hi
    if (r < p.wShort) { lo = 2; hi = 6 }
    else if (r < p.wShort + p.wMid) { lo = 7; hi = 15 }
    else { // log-jednostajny w koszyku długim
      const a = 16, b = Math.max(17, p.Lmax)
      return Math.min(cap, Math.round(a * Math.exp(rng() * Math.log(b / a))))
    }
    return Math.min(cap, lo + Math.floor(rng() * (hi - lo + 1)))
  }

  carveOne() {
    const { rng, p } = this
    const progress = 1 - this.remaining / (this.W * this.H)
    const order = [0, 1, 2, 3].sort(() => rng() - 0.5)

    for (const d of order) {
      const nLines = d === 0 || d === 2 ? this.W : this.H
      const back = DIRS[(d + 2) % 4]
      // głowy parowalne: pierwsza nieprzypisana na linii, z nieprzypisaną komórką za nią
      const heads = []
      for (let line = 0; line < nLines; line++) {
        const h = this.headCandidate(d, line)
        if (!h) continue
        const bx = h.x + back.dx, by = h.y + back.dy
        if (!this.inside(bx, by) || !this.free(bx, by)) continue
        heads.push(h)
      }
      if (!heads.length) continue

      let h
      if (p.headBias === 0) h = heads[Math.floor(rng() * heads.length)]
      else {
        // depth linii danej głowy = jak głęboko frontier zaszedł w tej linii
        const scored = heads.map((c) => {
          const line = d === 0 || d === 2 ? c.x : c.y
          return { c, dep: this.depth[d][line] }
        })
        scored.sort((a, b) => p.headBias > 0 ? b.dep - a.dep : a.dep - b.dep)
        // wybierz z górnej ćwiartki, żeby zachować losowość
        const k = Math.max(1, Math.ceil(scored.length / 4))
        h = scored[Math.floor(rng() * k)].c
      }
      const bx = h.x + back.dx, by = h.y + back.dy
      const path = [h, { x: bx, y: by }]
      const pathSet = new Set([this.idx(h.x, h.y), this.idx(bx, by)])
      const want = this.targetLength(progress)
      let lastDir = { dx: back.dx, dy: back.dy }

      while (path.length < want) {
        const tail = path[path.length - 1]
        const cand = []
        for (const dd of DIRS) {
          const nx = tail.x + dd.dx, ny = tail.y + dd.dy
          if (!this.inside(nx, ny)) continue
          const i = this.idx(nx, ny)
          if (this.owner[i] !== -1 || pathSet.has(i)) continue
          if (!this.rayClear(nx, ny, d, pathSet)) continue
          // Ruch W GŁĄB (wzdłuż -d) jest zawsze legalny, ale odcina ścieżkę od
          // frontiera i tym samym od wszelkich przyszłych skrętów. Ruch W BOK jest
          // legalny wyłącznie na wysokości frontiera sąsiedniej linii — i to on
          // buduje kształt. Dlatego premiujemy bok, a nie „prosto".
          const inward = dd.dx === back.dx && dd.dy === back.dy
          const straight = dd.dx === lastDir.dx && dd.dy === lastDir.dy
          let w = inward ? 1 : p.wLateral
          if (straight) w *= p.pStraight / (1 - p.pStraight)
          cand.push({ x: nx, y: ny, dd, w })
        }
        if (!cand.length) break
        let total = cand.reduce((s, c) => s + c.w, 0), r = rng() * total, pick = cand[0]
        for (const c of cand) { r -= c.w; if (r <= 0) { pick = c; break } }
        path.push({ x: pick.x, y: pick.y })
        pathSet.add(this.idx(pick.x, pick.y))
        lastDir = pick.dd
      }

      if (path.length < 2) continue
      this.stats.want += want; this.stats.n++
      if (path.length < want) this.stats.stall++
      const beforeStrand = path.length
      if (this.wouldStrand(path)) {
        // spróbuj krótszego wariantu tej samej ścieżki, zanim odpuścisz kierunek
        let ok = false
        for (let L = path.length - 1; L >= 2; L--) {
          const shorter = path.slice(0, L)
          if (!this.wouldStrand(shorter)) { path.length = L; ok = true; break }
        }
        if (!ok) continue
        this.stats.strandTrunc++
        this.stats.strandLoss += beforeStrand - path.length
      }
      this.stats.got += path.length

      const id = this.pieces.length
      for (const c of path) this.owner[this.idx(c.x, c.y)] = id
      this.pieces.push({ id, cells: path, dir: d })
      this.remaining -= path.length
      this.recomputeLines(path)
      return true
    }
    return false
  }

  undoLast(k) {
    for (let i = 0; i < k && this.pieces.length; i++) {
      const pc = this.pieces.pop()
      for (const c of pc.cells) this.owner[this.idx(c.x, c.y)] = -1
      this.remaining += pc.cells.length
      this.recomputeLines(pc.cells)
    }
  }

  run(maxBacktracks = 400) {
    while (this.remaining > 0) {
      if (this.carveOne()) continue
      if (this.backtracks >= maxBacktracks || !this.pieces.length) return false
      this.backtracks++
      this.undoLast(1 + Math.floor(Math.log2(1 + this.backtracks)))
    }
    return true
  }
}

// ---------------------------------------------------------------- metryki

function analyse(board) {
  const { W, H, owner, pieces } = board
  const idx = (x, y) => y * W + x
  const inside = (x, y) => x >= 0 && y >= 0 && x < W && y < H
  const blockers = pieces.map(() => new Set())
  let corridorTotal = 0, corridorLines = 0
  const minDist = new Array(pieces.length).fill(Infinity)

  for (const pc of pieces) {
    const { dx, dy } = DIRS[pc.dir]
    const lines = new Map() // linia -> komórka najdalsza od krawędzi wyjścia
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
        if (o === pc.id) { lastOwn = step; continue }
        blockers[pc.id].add(o)
        minDist[pc.id] = Math.min(minDist[pc.id], step - lastOwn)
      }
    }
  }

  const N = pieces.length
  const freeIds = []
  for (let i = 0; i < N; i++) if (blockers[i].size === 0) freeIds.push(i)

  // Kahn: rozwiązywalna <=> graf blokowania acykliczny
  const remainingBlockers = pieces.map((_, i) => new Set(blockers[i]))
  const blocks = pieces.map(() => [])
  for (let i = 0; i < N; i++) for (const b of blockers[i]) blocks[b].push(i)
  const queue = [...freeIds]
  const depthOf = new Int32Array(N)
  let done = 0, maxDepth = 0
  const seen = new Uint8Array(N)
  for (const i of queue) seen[i] = 1
  while (queue.length) {
    const i = queue.shift(); done++
    maxDepth = Math.max(maxDepth, depthOf[i])
    for (const j of blocks[i]) {
      remainingBlockers[j].delete(i)
      depthOf[j] = Math.max(depthOf[j], depthOf[i] + 1)
      if (remainingBlockers[j].size === 0 && !seen[j]) { seen[j] = 1; queue.push(j) }
    }
  }

  let T2 = 0, almost = 0
  for (let i = 0; i < N; i++) {
    if (blockers[i].size > 0 && minDist[i] > 2) T2++
    // Przy planszy zapełnionej w 100% "korytarz czysty przez k komórek" prawie nigdy
    // nie zachodzi, bo tuż przed elementem zawsze ktoś stoi. Realną pokusą do błędu
    // jest element zablokowany przez DOKŁADNIE JEDEN obcy element — wygląda niemal
    // na gotowy do wyjazdu.
    if (blockers[i].size === 1) almost++
  }

  const hist = { '2-6': 0, '7-15': 0, '16-49': 0, '50+': 0 }
  let maxLen = 0
  for (const pc of pieces) {
    const L = pc.cells.length
    maxLen = Math.max(maxLen, L)
    if (L <= 6) hist['2-6']++
    else if (L <= 15) hist['7-15']++
    else if (L < 50) hist['16-49']++
    else hist['50+']++
  }

  return {
    N, solvable: done === N, unsolved: N - done,
    f0: freeIds.length / N, T2, almost, D: maxDepth,
    meanCorridorLen: corridorTotal / Math.max(1, corridorLines),
    minLen: Math.min(...pieces.map((p) => p.cells.length)), maxLen, hist,
    coverage: pieces.reduce((s, p) => s + p.cells.length, 0) / (W * H),
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

// ------------------------------------------------------------------ main

const arg = (k, dflt) => {
  const hit = process.argv.find((a) => a.startsWith(`--${k}=`))
  return hit ? Number(hit.split('=')[1]) : dflt
}
const show = process.argv.includes('--show')

const presets = [
  { name: 'Easy', W: 25, H: 25, Lmax: 50, wShort: 0.80, wMid: 0.195 },
  { name: 'Medium', W: 50, H: 50, Lmax: 125, wShort: 0.75, wMid: 0.24 },
  { name: 'Hard', W: 75, H: 75, Lmax: 188, wShort: 0.72, wMid: 0.267 },
  { name: 'Nightmare', W: 100, H: 100, Lmax: 300, wShort: 0.70, wMid: 0.285 },
]

const runs = arg('runs', 3)
const only = process.argv.find((a) => a.startsWith('--only='))?.split('=')[1]

console.log('PROTOTYP — wycinanie z pełnej planszy, minimalna długość 2\n')
for (const pre of presets) {
  if (only && pre.name.toLowerCase() !== only.toLowerCase()) continue
  const acc = []
  for (let r = 0; r < runs; r++) {
    const seed = 1000 + r
    const rng = mulberry32(seed)
    const params = { ...pre, pStraight: arg('straight', 0.6), wLateral: arg('lateral', 6), headBias: arg('headbias', 0) }
    const t0 = performance.now()
    let c = new Carver(pre.W, pre.H, params, rng)
    let ok = c.run()
    let restarts = 0
    while (!ok && restarts < 3) {
      restarts++
      c = new Carver(pre.W, pre.H, params, mulberry32(seed + 7777 * restarts))
      ok = c.run()
    }
    const tGen = performance.now() - t0
    if (!ok) { acc.push({ failed: true, restarts }); continue }
    const t1 = performance.now()
    const m = analyse(c)
    const tAna = performance.now() - t1
    acc.push({ ...m, tGen, tAna, backtracks: c.backtracks, restarts, st: c.stats })
    if (show && r === 0 && pre.W <= 40) console.log(render(c) + '\n')
  }
  const good = acc.filter((a) => !a.failed)
  const avg = (f) => good.reduce((s, a) => s + f(a), 0) / good.length
  console.log(`--- ${pre.name} ${pre.W}x${pre.H} (${runs} przebiegów) ---`)
  if (!good.length) { console.log('  NIE UDAŁO SIĘ domknąć planszy\n'); continue }
  console.log(`  pokrycie      ${(avg((a) => a.coverage) * 100).toFixed(2)}%   rozwiązywalne: ${good.every((a) => a.solvable) ? 'TAK' : 'NIE'}`)
  console.log(`  elementów     ${avg((a) => a.N).toFixed(0)}   długość ${avg((a) => a.minLen).toFixed(0)}..${avg((a) => a.maxLen).toFixed(0)}`)
  const h = good[0].hist
  console.log(`  rozkład dł.   2-6: ${(avg((a) => a.hist['2-6'] / a.N) * 100).toFixed(0)}%  7-15: ${(avg((a) => a.hist['7-15'] / a.N) * 100).toFixed(0)}%  16-49: ${(avg((a) => a.hist['16-49'] / a.N) * 100).toFixed(0)}%  50+: ${(avg((a) => a.hist['50+'] / a.N) * 100).toFixed(1)}%`)
  console.log(`  f0            ${avg((a) => a.f0).toFixed(3)}   T2: ${avg((a) => a.T2).toFixed(0)}   1-bloker: ${avg((a) => a.almost).toFixed(0)} (${(100*avg((a)=>a.almost/a.N)).toFixed(0)}%)   D: ${avg((a) => a.D).toFixed(0)}   korytarz: ${avg((a) => a.meanCorridorLen).toFixed(1)}`)
  console.log(`  nawroty       ${avg((a) => a.backtracks).toFixed(1)}   restarty: ${avg((a) => a.restarts).toFixed(1)}`)
  const st = good[0].st
  console.log(`  diagnostyka   śr. want ${(st.want/st.n).toFixed(1)} -> got ${(st.got/st.n).toFixed(1)}   stall ${(100*st.stall/st.n).toFixed(0)}%   strand-trunc ${(100*st.strandTrunc/st.n).toFixed(0)}% (śr. -${(st.strandLoss/Math.max(1,st.strandTrunc)).toFixed(1)})`)
  console.log(`  czas          generacja ${avg((a) => a.tGen).toFixed(0)} ms, metryki ${avg((a) => a.tAna).toFixed(0)} ms\n`)
}
