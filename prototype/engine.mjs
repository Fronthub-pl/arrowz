// PROTOTYP WYRZUCALNY — silnik sondy, nie kod produkcyjny.
//
// Ten plik jest wspólny dla CLI (carve.mjs) i laboratorium w przeglądarce
// (lab.html), żeby nie powstały dwie kopie algorytmu, które się rozjadą.
// Nie wolno mu dotykać `process` ani DOM — wszystko wchodzi parametrami.

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
          if (comp.size > this.p.strandLimit) { overflow = true; break }
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

  // Cel długości giganta liczymy w BOKACH PLANSZY, nie w komórkach: element,
  // który ma przecinać planszę tam i z powrotem, musi skalować się z rozmiarem.
  giantLength() {
    return Math.round(this.p.giantSpan * Math.max(this.W, this.H))
  }

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

  /**
   * Trasa serpentynowa dla elementu szkieletowego.
   *
   * Losowy wzrost nie potrafi dać linii jednocześnie długiej i rozciągniętej:
   * bez Warnsdorffa zamyka się we własnej pułapce po stu komórkach, z nim
   * wypełnia obszar gęsto, czyli się zwija. Serpentynę prowadzimy więc
   * systematycznie: biegi równoległe do krawędzi wyjścia, skok `step` między
   * nimi. Kanały o szerokości `step - 1`, które zostają między przebiegami,
   * wypełnią później zwykłe elementy — i to one będą zablokowane przez tę
   * linię, więc jej zdjęcie odblokuje pół planszy naraz.
   */
  growSerpentine(head, neck, d, maxLen) {
    const { rng, p } = this
    const step = Math.max(2, p.giantStep)
    const advance = DIRS[(d + 2) % 4]                 // w głąb planszy
    const along = d === 0 || d === 2 ? { dx: 1, dy: 0 } : { dx: 0, dy: 1 }
    let dir = rng() < 0.5 ? 1 : -1                    // kierunek pierwszego biegu

    const path = [head, neck]
    const used = new Set([this.idx(head.x, head.y), this.idx(neck.x, neck.y)])
    const free = (x, y) =>
      this.inside(x, y) && this.owner[this.idx(x, y)] === -1 && !used.has(this.idx(x, y))
    const push = (x, y) => { path.push({ x, y }); used.add(this.idx(x, y)) }

    let cur = { x: neck.x, y: neck.y }
    while (path.length < maxLen) {
      // bieg wzdłuż osi, aż do przeszkody; czasem urwany wcześniej, żeby brzegi
      // serpentyny nie wychodziły idealnie proste
      const runCap = rng() < p.giantJitter ? 3 + Math.floor(rng() * 12) : Infinity
      let ran = 0
      while (ran < runCap && path.length < maxLen) {
        const nx = cur.x + along.dx * dir, ny = cur.y + along.dy * dir
        if (!free(nx, ny)) break
        push(nx, ny); cur = { x: nx, y: ny }; ran++
      }
      // przeskok o `step` w głąb i zawrót
      let moved = 0
      while (moved < step && path.length < maxLen) {
        const nx = cur.x + advance.dx, ny = cur.y + advance.dy
        if (!free(nx, ny)) break
        push(nx, ny); cur = { x: nx, y: ny }; moved++
      }
      if (moved === 0) break          // nie ma dokąd zejść — koniec serpentyny
      dir = -dir
    }
    return path
  }

  carveOne() {
    const { rng, p } = this
    const progress = 1 - this.remaining / (this.W * this.H)
    // NIE `sort(() => rng() - 0.5)`: liczba wywołań komparatora zależy od
    // implementacji Array.prototype.sort, więc różne silniki JS zużywają różną
    // liczbę losowań i to samo ziarno daje inną planszę w Node i w przeglądarce.
    // Tasowanie Fishera-Yatesa robi dokładnie n-1 losowań, zawsze te same.
    const order = [0, 1, 2, 3]
    for (let i = order.length - 1; i > 0; i--) {
      const j = Math.floor(rng() * (i + 1))
      const t = order[i]; order[i] = order[j]; order[j] = t
    }

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

      // MIESZANIE: część wycięć preferuje linię najgłębszą (tuneluje -> niskie f0,
      // ale proste kształty), reszta najpłytszą (warstwy -> skręty, ale wysokie f0).
      // Te dwa cele ciągną w przeciwne strony, więc szukamy proporcji.
      const bias = p.mix >= 0 ? (rng() < p.mix ? 1 : -1) : p.headBias
      let ranked = heads
      if (bias !== 0) {
        // depth linii danej głowy = jak głęboko frontier zaszedł w tej linii
        ranked = heads
          .map((c) => ({ c, dep: this.depth[d][d === 0 || d === 2 ? c.x : c.y] }))
          .sort((a, b) => (bias > 0 ? b.dep - a.dep : a.dep - b.dep))
          .map((z) => z.c)
      }
      // KILKA PRÓB NA KIERUNEK. Jedna próba wystarcza na małej planszy, gdzie
      // kandydatów jest kilkanaście. Przy 400x400 legalnych głów bywa kilkaset,
      // a szansa, że akurat ta jedna wylosowana da ścieżkę przechodzącą test
      // resztki, spada — i generator cofa setki wycięć zamiast losować ponownie.
      const pool = bias === 0 ? [...ranked] : ranked.slice(0, Math.max(1, Math.ceil(ranked.length / 4)))
      const tries = Math.min(Math.max(1, p.headTries), pool.length)
      let carved = false
      for (let attempt = 0; attempt < tries && !carved; attempt++) {
      const pick = Math.floor(rng() * pool.length)
      const h = pool[pick]
      pool.splice(pick, 1)
      const bx = h.x + back.dx, by = h.y + back.dy
      const path = [h, { x: bx, y: by }]
      const pathSet = new Set([this.idx(h.x, h.y), this.idx(bx, by)])
      // pozycja komórki w ścieżce — reguła odstępu musi odróżnić „własny ogon,
      // z którego właśnie przyszedłem" od „własny przebieg sprzed stu komórek"
      const pathPos = new Map([[this.idx(h.x, h.y), 0], [this.idx(bx, by), 1]])
      // SONDA: co jakiś czas wbij długi prosty element w głąb, żeby zrobić schodek
      // w profilu frontiera. Bez schodków wszystkie kolejne elementy są prostymi
      // kreskami, bo skręt wymaga zrównania głębokości z frontierem sąsiada.
      const isProbe = rng() < p.probe
      // Giganty wycinamy NA STARCIE, póki plansza jest pusta: tylko wtedy ścieżka
      // ma dokąd biec przez całą siatkę. Losowanie ich w trakcie nie działa —
      // po tysiącu wycięć obszar nieprzypisany jest już poszarpany.
      // Kolejność wycinania jest kolejnością rozwiązania, więc giganty są też
      // pierwsze do zdjęcia w grze i ich usunięcie odblokowuje resztę planszy.
      const isGiant = p.giantSpan > 0 &&
        (this.pieces.length < p.giants || rng() < p.wGiant)
      const want = isGiant
        ? this.giantLength()
        : isProbe
          ? Math.max(4, Math.round(p.probeLen * (0.5 + rng())))
          : this.targetLength(progress)
      // Element, który ma mieć ZASIĘG, musi biec prosto — zwijanie zjada
      // długość bez zdobywania terenu. Dla gigantów podmieniamy więc wagi:
      // mocno prosto, bez Warnsdorffa (to on zwija), z karą za samostyczność.
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
          // Ruch W GŁĄB (wzdłuż -d) jest zawsze legalny, ale odcina ścieżkę od
          // frontiera i tym samym od wszelkich przyszłych skrętów. Ruch W BOK jest
          // legalny wyłącznie na wysokości frontiera sąsiedniej linii — i to on
          // buduje kształt. Dlatego premiujemy bok, a nie „prosto".
          const inward = dd.dx === back.dx && dd.dy === back.dy
          const straight = dd.dx === lastDir.dx && dd.dy === lastDir.dy
          let w = inward ? 1 : p.wLateral
          if (straight) w *= pStraight / (1 - Math.min(0.999, pStraight))
          // Jednym przebiegiem po sąsiadach liczymy trzy rzeczy naraz:
          //  deg     - wolne wyjścia (Warnsdorff),
          //  foreign - sąsiedzi należący do JUŻ WYCIĘTYCH elementów (i krawędź),
          //  own     - sąsiedzi należący do budowanej właśnie ścieżki.
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
            // Warnsdorff: preferuj komórkę o najmniejszej liczbie wolnych sąsiadów.
            // Zjada ślepe uliczki, zanim się zamkną, zamiast je osierocać.
            w *= Math.pow(warns, 3 - deg)
          }
          // HUG: premia za przyleganie do cudzych elementów. Hipoteza — to ona
          // ma dawać wrażenie „opakowywania" zamiast zwijania się przy sobie.
          if (p.hug > 1 && foreign > 0) w *= Math.pow(p.hug, foreign)
          // ANTICOIL: kara za dotykanie własnej ścieżki. Komórka ogona, z której
          // przychodzimy, nie liczy się — stąd own - 1.
          if (anticoil > 1 && own > 1) w *= Math.pow(anticoil, -(own - 1))

          // REGUŁA ODSTĘPU (tylko giganty). Wąż, który ma przecinać planszę tam
          // i z powrotem, nie może zawracać tuż obok siebie — inaczej zjada
          // własną przestrzeń i utyka. Wymuszamy minimalny dystans do własnych
          // przebiegów sprzed co najmniej kilku kroków; kanały, które zostają
          // między przebiegami, wypełnią później inne elementy.
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
                // Ostatnie 2k komórek to naturalne sąsiedztwo ogona — pomijamy.
                if (pos !== undefined && here - pos > 2 * k) near++
              }
            }
            // KARA, nie zakaz. Zakaz uniemożliwiałby zawracanie: przejście
            // z pasa do pasa wymaga przecięcia strefy odstępu, więc wąż utykał
            // po dwustu komórkach niezależnie od zamówionej długości.
            if (near > 0) w *= Math.pow(p.giantSpacePenalty, -near)
          }
          cand.push({ x: nx, y: ny, dd, w })
        }
        if (!cand.length) break
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
        this.p.debug(`  [gigant] zamówiono ${want}, wzrost dał ${grew} (${grew < want ? 'UTKNĄŁ' : 'pełna długość'})`)
      }
      this.stats.want += want; this.stats.n++
      if (path.length < want) this.stats.stall++
      const beforeStrand = path.length
      if (this.wouldStrand(path)) {
        // Skracamy skokowo, nie po jednej komórce: przy ścieżce o tysiącach
        // komórek liniowe szukanie kosztowałoby O(L) testów resztki.
        let ok = false
        const step = Math.max(1, Math.floor(path.length / 32))
        for (let L = path.length - step; L >= 2; L -= step) {
          const shorter = path.slice(0, L)
          if (!this.wouldStrand(shorter)) {
            // dociągnij w górę po jednej, żeby nie tracić długości bez potrzeby
            let best = L
            for (let k = L + 1; k < Math.min(path.length, L + step); k++) {
              if (this.wouldStrand(path.slice(0, k))) break
              best = k
            }
            path.length = best; ok = true; break
          }
        }
        if (!ok) continue
        this.stats.strandTrunc++
        this.stats.strandLoss += beforeStrand - path.length
        if (isGiant && this.p.debug) {
          this.p.debug(`  [gigant] test resztki obciął ${beforeStrand} -> ${path.length}`)
        }
      }
      this.stats.got += path.length

      const id = this.pieces.length
      for (const c of path) this.owner[this.idx(c.x, c.y)] = id
      this.pieces.push({ id, cells: path, dir: d })
      this.remaining -= path.length
      this.recomputeLines(path)
      carved = true
      }
      if (carved) return true
    }
    return false
  }

  // Czy w tym stanie istnieje JAKAKOLWIEK legalna głowa? Jeśli nie, generator
  // stoi nie dlatego, że brakuje miejsca, tylko dlatego, że do wolnych komórek
  // nie da się dojechać: każda z nich ma przed sobą inne wolne komórki.
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

  // Diagnostyka zaklinowania: jak wygląda to, czego generator nie umiał domknąć.
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
   * Nawrót UKIERUNKOWANY: cofa do najstarszego elementu stykającego się
   * z pozostałym obszarem, zamiast ślepo zdejmować ostatnie k wycięć.
   *
   * Kolejność wycinania jest kolejnością rozwiązania, więc cofać można tylko
   * chronologicznie — ale nie trzeba cofać na oślep. Elementy blokujące
   * końcówkę zwykle powstały niedawno, więc taki nawrót jest tani, a trafia
   * w rejon problemu. Ślepe cofanie przy 17 000 elementów to loteria.
   */
  undoToFrontier(maxUndo) {
    const touching = new Set()
    for (let i = 0; i < this.W * this.H; i++) {
      if (this.owner[i] !== -1) continue
      const x = i % this.W, y = (i / this.W) | 0
      for (const { dx, dy } of DIRS) {
        const nx = x + dx, ny = y + dy
        if (!this.inside(nx, ny)) continue
        const o = this.owner[this.idx(nx, ny)]
        if (o >= 0) touching.add(o)
      }
    }
    if (!touching.size) return 0
    let minId = Infinity
    for (const id of touching) if (id < minId) minId = id
    const target = Math.max(minId, this.pieces.length - maxUndo)
    const k = this.pieces.length - target
    if (k > 0) this.undoLast(k)
    return k
  }

  undoLast(k) {
    for (let i = 0; i < k && this.pieces.length; i++) {
      const pc = this.pieces.pop()
      for (const c of pc.cells) this.owner[this.idx(c.x, c.y)] = -1
      this.remaining += pc.cells.length
      this.recomputeLines(pc.cells)
    }
  }

  run(maxBacktracks = 3000) {
    const t0 = performance.now()
    let lastLog = t0
    // Budżet nawrotów musi skalować się z planszą: 3000 wystarcza na 40 000
    // komórek, ale przy milionie to ułamek jednego procentu wycięć.
    if (this.p.maxBack > 0) maxBacktracks = this.p.maxBack
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
      // Zapamiętaj NAJLEPSZY moment zaklinowania (najmniej pozostałych komórek):
      // stan po serii cofnięć niczego nie mówi o przyczynie.
      if (this.remaining < (this.stuckRemaining ?? Infinity)) {
        this.stuckRemaining = this.remaining
        this.stuckSizes = this.leftoverReport()
        this.stuckHeads = this.legalHeadCount()
      }
      if (this.backtracks >= maxBacktracks || !this.pieces.length) return false
      this.backtracks++
      if (this.p.frontierUndo > 0) {
        if (this.undoToFrontier(this.p.frontierUndo) === 0) return false
      } else {
        this.undoLast(1 + Math.floor(Math.log2(1 + this.backtracks)))
      }
    }
    return true
  }
}

// ---------------------------------------------------------------- metryki

function analyse(board, ruleB = true) {
  const { W, H, owner, pieces } = board
  const idx = (x, y) => y * W + x
  const inside = (x, y) => x >= 0 && y >= 0 && x < W && y < H
  const blockers = pieces.map(() => new Set())
  let corridorTotal = 0, corridorLines = 0
  const minDist = new Array(pieces.length).fill(Infinity)

  const RULE_B = ruleB
  for (const pc of pieces) {
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
        blockers[pc.id].add(o)
        minDist[pc.id] = Math.min(minDist[pc.id], step - lastOwn)
      }
      continue
    }
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
        if (o === -2) continue            // pustka nie blokuje
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

  // ---- ZASIĘG I SIŁA ODBLOKOWYWANIA ----
  // Gra ma sens, gdy zdjęcie jednej linii odblokowuje elementy po drugiej stronie
  // planszy. Mierzymy więc nie długość taśmy, tylko:
  //  span       - jaką część boku planszy element obejmuje (zasięg),
  //  outDeg     - ile elementów odblokowuje jego zdjęcie,
  //  blockDist  - jak daleko przestrzennie leżą te odblokowane elementy.
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

    outSum += blocks[i].length
    if (blocks[i].length > maxOut) maxOut = blocks[i].length
    const hi = pc.cells[0]
    for (const j of blocks[i]) {
      const hj = pieces[j].cells[0]
      distSum += Math.abs(hi.x - hj.x) + Math.abs(hi.y - hj.y)
      distCount++
    }
  }
  spans.sort((a, b) => b - a)
  const spanTop10 = spans.slice(0, Math.max(1, Math.ceil(N / 10)))
  const spanTop10Avg = spanTop10.reduce((a, b) => a + b, 0) / spanTop10.length

  let T2 = 0, almost = 0
  for (let i = 0; i < N; i++) {
    if (blockers[i].size > 0 && minDist[i] > 2) T2++
    // Przy planszy zapełnionej w 100% "korytarz czysty przez k komórek" prawie nigdy
    // nie zachodzi, bo tuż przed elementem zawsze ktoś stoi. Realną pokusą do błędu
    // jest element zablokowany przez DOKŁADNIE JEDEN obcy element — wygląda niemal
    // na gotowy do wyjazdu.
    if (blockers[i].size === 1) almost++
  }

  let bends = 0, multiLine = 0, coil = 0, cellsTotal = 0
  // Miary „opakowywania":
  //  selfAdj      - średnia liczba WŁASNYCH sąsiadów na komórkę (zwijanie),
  //  neighbours   - z iloma różnymi obcymi elementami styka się element,
  //  sharedBorder - najdłuższa wspólna granica z pojedynczym obcym elementem,
  //                 znormalizowana przez długość elementu. To ona rośnie, gdy
  //                 element faktycznie owija się wokół innego.
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
    const borderWith = new Map()   // id obcego elementu -> liczba wspólnych krawędzi
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
      if (n >= 3) coil++     // ścieżka dotyka samej siebie -> kłębek, nie linia
      selfAdjTotal += n
      cellsTotal++
    }
    // Miary liczymy tylko na elementach dostatecznie długich, żeby miały szansę
    // cokolwiek owinąć — domino nie opakuje niczego z definicji.
    if (pc.cells.length >= 8) {
      longPieces++
      neighboursTotal += borderWith.size
      const maxShared = borderWith.size ? Math.max(...borderWith.values()) : 0
      sharedBorderTotal += maxShared / pc.cells.length
    }
    for (const c of pc.cells) lines.add(DIRS[pc.dir].dx === 0 ? c.x : c.y)
    if (lines.size > 1) multiLine++
    bends += b
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
    f0: freeIds.length / N, T2, almost, D: maxDepth, bends: bends / N, multiLine: multiLine / N, coil: coil / cellsTotal,
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


// ---------------------------------------------------------------- SVG

// Podgląd do oceny wyglądu wzrokiem. Wariant monochromatyczny jest wierny
// oryginałowi i jest właściwym testem CZYTELNOŚCI: gracz też musi odróżnić
// elementy od siebie bez pomocy koloru.
function toSvg(board, opts = {}) {
  const { cell = 16, colored = false, top = 0, voids = false } = opts
  const { W, H, pieces } = board
  // Zbiór identyfikatorów N najdłuższych elementów — rysujemy je na czerwono
  // i NA WIERZCHU, żeby dało się prześledzić przebieg pojedynczej linii.
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

  // Podgląd zaklinowania: komórki, których generator nie zdołał wyciąć.
  // Sklejamy je w poziome pasy — przy 55 tysiącach dziur osobne prostokąty
  // dałyby dokument nie do wyświetlenia.
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
  const highlight = []      // ścieżki najdłuższych elementów, rysowane na końcu
  const highlightHeads = []
  // W trybie kolorowym różowy zlewałby się z paletą, więc wyróżnione rysujemy
  // grubiej — czytelne niezależnie od koloru sąsiadów.
  const hiWidth = (sw * (colored ? 1.5 : 1.15)).toFixed(2)
  pieces.forEach((pc, i) => {
    const isLong = longest.has(pc.id)
    const col = isLong ? '#e8467c' : colored ? `hsl(${(i * 137.508) % 360} 62% 42%)` : '#232447'
    const pts = pc.cells.map((c) => `${cx(c.x)},${cy(c.y)}`).join(' ')
    const line = `<polyline points="${pts}" stroke="${col}"/>`
    const { dx, dy } = DIRS[pc.dir]
    const hx = cx(pc.cells[0].x), hy = cy(pc.cells[0].y)
    const tip = cell * 0.62, len = cell * 0.62, half = cell * 0.42
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
 * Komplet parametrów z wartościami domyślnymi. Jedno miejsce prawdy dla CLI
 * i dla laboratorium — dopisanie pokrętła tutaj wystarcza, żeby pojawiło się
 * w obu.
 */
export const PARAM_SPEC = [
  { key: 'W', label: 'szerokość', group: 'plansza', min: 4, max: 1000, step: 1, def: 25,
    help: 'Liczba kolumn siatki. Powyżej 300×300 generator przestaje domykać planszę przy domyślnych ustawieniach — pomaga podniesienie prób głowy na kierunek.' },
  { key: 'H', label: 'wysokość', group: 'plansza', min: 4, max: 1000, step: 1, def: 50,
    help: 'Liczba wierszy. Format pionowy (n×2n) sam podnosi trudność: wąska plansza ma krótsze korytarze poziome, więc mniej elementów ma czystą drogę do krawędzi.' },
  { key: 'seed', label: 'ziarno', group: 'plansza', min: 0, max: 999999, step: 1, def: 7,
    help: 'To samo ziarno daje bitowo tę samą planszę. Na tym opiera się weryfikacja wyniku po stronie serwera: odtwarza rozgrywkę z ziarna i sekwencji ruchów.' },

  { key: 'wShort', label: 'waga krótkich (2–6)', group: 'długości', min: 0, max: 1, step: 0.01, def: 0.5,
    help: 'Udział elementów najkrótszych. Wysoko = gęsto rozsiane groty, ale sama sieczka z haczyków. Przy 0,85 plansza traci długie linie zupełnie.' },
  { key: 'wMid', label: 'waga średnich (7–15)', group: 'długości', min: 0, max: 1, step: 0.01, def: 0.2,
    help: 'Typowe zawijasy, główna masa planszy. Reszta wagi (1 minus krótkie minus średnie) przypada na koszyk długi, losowany log-jednostajnie.' },
  { key: 'Lmax', label: 'długość maksymalna', group: 'długości', min: 16, max: 5000, step: 1, def: 125,
    help: 'Górna granica losowanej długości. Rzadko bywa wiążąca: ponad połowa ścieżek utyka przed celem, więc podnoszenie tej wartości zwykle nic nie daje.' },

  { key: 'pStraight', label: 'skłonność do prostej', group: 'kształt', min: 0, max: 1, step: 0.01, def: 0.6,
    help: 'Jak chętnie ścieżka kontynuuje w tym samym kierunku. Wyżej = dłuższe proste odcinki i większy zasięg, ale ścieżka szybciej wchodzi w ślepy zaułek.' },
  { key: 'wLateral', label: 'premia za ruch w bok', group: 'kształt', min: 0, max: 20, step: 0.5, def: 3,
    help: 'Ruch w bok buduje kształt, ruch w głąb odcina ścieżkę od frontiera i od przyszłych skrętów. Dlatego bok jest premiowany, a nie „prosto”.' },
  { key: 'warns', label: 'siła Warnsdorffa', group: 'kształt', min: 0, max: 16, step: 1, def: 4,
    help: 'Idź tam, gdzie zostaje najmniej wolnych wyjść. WYMAGANE: przy 0 jedna plansza na trzydzieści nie domyka się wcale. Ceną jest zwijanie — to ta reguła ciągnie linię z powrotem do siebie.' },
  { key: 'anticoil', label: 'kara za zwijanie', group: 'kształt', min: 1, max: 20, step: 1, def: 1,
    help: 'Kara za dotykanie własnej ścieżki, 1 = wyłączona. Przy 6 zwinięcie spada z 44% do 27%, ale elementy się skracają — trzeba wtedy podnieść udział długich, żeby porównanie było uczciwe.' },
  { key: 'hug', label: 'premia za przyleganie', group: 'kształt', min: 1, max: 20, step: 1, def: 1,
    help: 'Premia za sąsiedztwo z elementami już wyciętymi. Zmierzone jako niemal bezużyteczne: dokłada 1–2 punkty ponad samą karę za zwijanie.' },
  { key: 'edgeHug', label: 'krawędź liczy się jak element', group: 'kształt', min: 0, max: 4, step: 1, def: 0,
    help: 'Czy krawędź planszy ma być traktowana jak sąsiedni element przy premii za przyleganie. Podnosi skłonność linii do biegu wzdłuż brzegu.' },

  { key: 'headBias', label: 'wybór głowy (-1 warstwy, 1 tunele)', group: 'trudność', min: -1, max: 1, step: 1, def: 0,
    help: 'Skąd brać głowę: z linii najpłytszej (warstwy) czy najgłębszej (tunele). Tunelowanie POŁOWI f0 i PODWAJA głębokość blokowania — to główny regulator trudności.' },
  { key: 'mix', label: 'mieszanie warstw i tuneli (-1 = wyłączone)', group: 'trudność', min: -1, max: 1, step: 0.05, def: -1,
    help: 'Ułamek wycięć prowadzonych tunelami, reszta warstwami. Pozwala trafić między dwa skrajne zachowania zamiast wybierać jedno.' },
  { key: 'probe', label: 'udział sond w głąb', group: 'trudność', min: 0, max: 1, step: 0.01, def: 0,
    help: 'Co jaki ułamek wycięć wbijać długi prosty element w głąb, żeby zrobić schodek w profilu frontiera. Zmierzone: nie daje nic ponad karę za zwijanie.' },
  { key: 'probeLen', label: 'długość sondy', group: 'trudność', min: 2, max: 200, step: 1, def: 12,
    help: 'Docelowa długość takiego wbicia. Działa tylko przy niezerowym udziale sond.' },

  { key: 'giants', label: 'ile elementów szkieletowych', group: 'szkielet', min: 0, max: 40, step: 1, def: 0,
    help: 'Ile pierwszych wycięć prowadzić jako szkielet. Muszą powstawać na starcie: po tysiącu wycięć obszar wolny jest już poszarpany i nie ma gdzie biec. Są też pierwsze do zdjęcia w grze, więc ich usunięcie odblokowuje resztę planszy.' },
  { key: 'giantSpan', label: 'długość szkieletu (w bokach planszy)', group: 'szkielet', min: 0, max: 200, step: 1, def: 0,
    help: 'Docelowa długość szkieletu liczona w bokach planszy, nie w komórkach — dzięki temu skaluje się z rozmiarem. 0 wyłącza mechanizm.' },
  { key: 'giantStep', label: 'skok serpentyny (0 = wzrost losowy)', group: 'szkielet', min: 0, max: 40, step: 1, def: 0,
    help: 'Odstęp między kolejnymi biegami serpentyny i główne pokrętło jej wyglądu. Skok 3 daje regularne pasy („linie na kartce”), skok 14 — autostrady przecinające planszę, między którymi zostaje labirynt. Przy 0 szkielet rośnie losowo i utyka po ~400 komórkach.' },
  { key: 'giantJitter', label: 'urywanie biegów serpentyny', group: 'szkielet', min: 0, max: 1, step: 0.05, def: 0.15,
    help: 'Jak często bieg serpentyny urywa się przed przeszkodą. Bez tego brzegi wychodzą idealnie proste i widać regularność.' },
  { key: 'wGiant', label: 'udział szkieletów poza startem', group: 'szkielet', min: 0, max: 0.5, step: 0.01, def: 0,
    help: 'Prawdopodobieństwo, że element wycinany w trakcie też będzie szkieletem. Zmierzone jako mało skuteczne — na poszarpanym obszarze szkielet nie ma dokąd rosnąć.' },
  { key: 'giantStraight', label: 'prostość szkieletu (wzrost losowy)', group: 'szkielet', min: 0, max: 1, step: 0.01, def: 0.94,
    help: 'Skłonność szkieletu do prostej, gdy rośnie losowo (skok serpentyny = 0). Przy serpentynie nie ma znaczenia.' },
  { key: 'giantWarns', label: 'Warnsdorff szkieletu', group: 'szkielet', min: 0, max: 16, step: 1, def: 0,
    help: 'Siła Warnsdorffa dla szkieletu, osobno od reszty. Domyślnie 0, bo to ta reguła zwija linię, a szkielet ma iść daleko.' },
  { key: 'giantAnticoil', label: 'kara za zwijanie szkieletu', group: 'szkielet', min: 1, max: 20, step: 1, def: 6,
    help: 'Kara za samostyczność, osobna dla szkieletu. Stosowana jest wyższa z tej i ogólnej.' },
  { key: 'giantSpacing', label: 'promień odstępu szkieletu', group: 'szkielet', min: 1, max: 6, step: 1, def: 2,
    help: 'W jakim promieniu szkielet ma unikać własnych wcześniejszych przebiegów. Kanały, które przez to zostają, wypełniają potem zwykłe elementy.' },
  { key: 'giantSpacePenalty', label: 'siła odstępu szkieletu', group: 'szkielet', min: 1, max: 40, step: 1, def: 8,
    help: 'Jak mocno karać zbliżenie do siebie. Musi być KARĄ, nie zakazem: zakaz uniemożliwia zawracanie, bo przejście z pasa do pasa wymaga przecięcia strefy odstępu.' },

  { key: 'headTries', label: 'prób głowy na kierunek', group: 'domykanie', min: 1, max: 32, step: 1, def: 4,
    help: 'Ile głów wypróbować, zanim generator porzuci kierunek. Przy 1 (pierwotne zachowanie) plansza 400×400 zaklinowuje się z 27 tys. wolnych komórek; przy 4 — ze 171.' },
  { key: 'strandLimit', label: 'limit testu resztki', group: 'domykanie', min: 2, max: 24, step: 1, def: 8,
    help: 'Do jakiego rozmiaru fragmentu sprawdzać, czy da się go rozłożyć na ścieżki ≥2. Podnoszenie powyżej 8 POGARSZA: test odrzuca za dużo ścieżek i generator ma mniej ruchów.' },
  { key: 'frontierUndo', label: 'nawrót ukierunkowany (0 = zwykły)', group: 'domykanie', min: 0, max: 2000, step: 10, def: 0,
    help: 'Przy zaklinowaniu cofaj do najstarszego elementu stykającego się z wolnym obszarem, zamiast zdejmować ostatnie kilka wycięć. Przy tysiącach elementów ślepe cofanie trafia w losowy rejon planszy.' },
  { key: 'maxBack', label: 'budżet nawrotów (0 = 3000)', group: 'domykanie', min: 0, max: 200000, step: 500, def: 0,
    help: 'Ile razy generator może się cofnąć, zanim uzna próbę za straconą. Duże wartości potrafią kosztować minuty i rzadko ratują sytuację.' },
  { key: 'restarts', label: 'dopuszczalne restarty', group: 'domykanie', min: 0, max: 10, step: 1, def: 3,
    help: 'Ile razy zacząć od nowa z pochodnym ziarnem po nieudanej próbie. Restart jest zwykle skuteczniejszy niż kolejne tysiące nawrotów.' },
]

export function defaultParams() {
  const p = { ruleB: true, voidFrac: 0 }
  for (const s of PARAM_SPEC) p[s.key] = s.def
  return p
}

/**
 * Generuje planszę: wycina do skutku, w razie porażki restartuje z pochodnym
 * ziarnem. Zwraca planszę, metryki i przebieg — również przy porażce, żeby
 * laboratorium miało co pokazać.
 */
export function generate(params) {
  const p = { ...defaultParams(), ...params }
  const t0 = performance.now()
  let carver = null
  let ok = false
  let used = 0
  for (let attempt = 0; attempt <= p.restarts && !ok; attempt++) {
    used = attempt
    carver = new Carver(p.W, p.H, p, mulberry32(p.seed + attempt * 999983))
    ok = carver.run(p.maxBack > 0 ? p.maxBack : 3000)
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
    stuck: ok ? null : { remaining: carver.stuckRemaining ?? carver.remaining, sizes: carver.stuckSizes ?? [] },
  }
}

export { mulberry32, Carver, analyse, render, toSvg, DIRS }
