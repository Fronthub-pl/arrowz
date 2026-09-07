// Testy odporności generatora. Uruchomienie: node --test prototype/
//
// Prototyp jest kodem wyrzucalnym, ale generator ma domykać planszę do 200×200
// bez porażek — tego pilnują te testy, a nie oko przy laboratorium.
import { test } from 'node:test'
import assert from 'node:assert/strict'
import { Carver, defaultParams, mulberry32, generate, analyse } from './engine.mjs'

const carver = () => new Carver(10, 10, defaultParams(), mulberry32(1))
// Zbiór komórek w KOLEJNOŚCI podanej — kolejność decyduje, którą komórkę test
// bierze jako pierwszą, a błąd polegał właśnie na tym, że od tego zależał wynik.
const cells = (arr) => new Set(arr.map(([x, y]) => y * 10 + x))

test('decomposable: L-tromino niezależnie od komórki startowej', () => {
  const c = carver()
  assert.equal(c.decomposable(cells([[1, 1], [0, 1], [1, 0]])), true, 'start w narożniku')
  assert.equal(c.decomposable(cells([[0, 1], [1, 1], [1, 0]])), true, 'start na ramieniu')
})

test('decomposable: prosta trójka ze startem w środku', () => {
  assert.equal(carver().decomposable(cells([[1, 0], [0, 0], [2, 0]])), true)
})

test('decomposable: T-tetromino i plus-pentomino są nierozkładalne', () => {
  const c = carver()
  assert.equal(c.decomposable(cells([[1, 0], [0, 1], [1, 1], [2, 1]])), false)
  assert.equal(c.decomposable(cells([[1, 0], [0, 1], [1, 1], [2, 1], [1, 2]])), false)
})

test('decomposable: fragment, na którym zaklinowało się ziarno 5 na 200×200', () => {
  // ··█··
  // ··█··
  // █████
  // ·█·█·
  const shape = cells([[2, 0], [2, 1], [0, 2], [1, 2], [2, 2], [3, 2], [4, 2], [1, 3], [3, 3]])
  assert.equal(carver().decomposable(shape), true)
})

test('decomposable: pojedyncza komórka i zbiór pusty', () => {
  const c = carver()
  assert.equal(c.decomposable(cells([])), true)
  assert.equal(c.decomposable(cells([[3, 3]])), false)
})

test('hasLocalDefect: krzyż z trzema liśćmi i para po przekątnej izolująca pięć komórek', () => {
  // Plansza 10×10 cała przypisana poza wskazanymi komórkami; „ścieżka" pusta,
  // więc test ogląda otoczenie podanych komórek jako otoczenie ścieżki.
  const shapeBoard = (arr) => {
    const c = carver()
    c.owner.fill(0)
    for (const [x, y] of arr) c.owner[y * 10 + x] = -1
    c.gen++
    return c
  }
  // krzyż: środek (2,2), liście (2,1),(1,2),(3,2), czwarte ramię biegnie dalej
  let c = shapeBoard([[2, 2], [2, 1], [1, 2], [3, 2], [2, 3], [2, 4]])
  assert.equal(c.hasLocalDefect([{ x: 2, y: 2 }]), true)
  // fragment z ziarna 49: S = {(1,2),(2,1)} izoluje (0,2),(1,3),(2,0),(1,1),(2,2)
  c = shapeBoard([[2, 0], [4, 0], [1, 1], [2, 1], [3, 1], [4, 1], [0, 2], [1, 2], [2, 2], [1, 3]])
  assert.equal(c.hasLocalDefect([{ x: 1, y: 2 }]), true)
  // prosta trójka nie jest wadą
  c = shapeBoard([[1, 1], [2, 1], [3, 1]])
  assert.equal(c.hasLocalDefect([{ x: 2, y: 1 }]), false)
})

test('absorbLeftover: wchłania pojedynczą komórkę ogonem i nie zmienia grafu blokowania', () => {
  // Plansza 6×6: dwa elementy ułożone ręcznie, jedna wolna komórka przy ogonie.
  const c = new Carver(6, 6, { ...defaultParams(), absorbLimit: 8 }, mulberry32(1))
  c.owner.fill(0)
  const a = { id: 0, dir: 0, cells: [{ x: 0, y: 0 }, { x: 0, y: 1 }, { x: 0, y: 2 }] }
  const b = { id: 1, dir: 1, cells: [{ x: 5, y: 0 }, { x: 4, y: 0 }, { x: 3, y: 0 }] }
  c.pieces.push(a, b)
  for (const cell of b.cells) c.owner[cell.y * 6 + cell.x] = 1
  c.owner[3 * 6 + 0] = -1 // (0,3) wolna, przylega do ogona elementu 0
  c.remaining = 1
  const before = analyse(c).solvable
  assert.equal(c.absorbLeftover(), true)
  assert.equal(c.remaining, 0)
  assert.equal(c.owner[3 * 6 + 0], 0)
  assert.deepEqual(a.cells[a.cells.length - 1], { x: 0, y: 3 })
  assert.equal(analyse(c).solvable, before)
})

test('generate: domyka planszę w 100% i rozwiązywalnie na kilku rozmiarach i ziarnach', () => {
  const cases = [
    [25, 50, [1, 2, 3, 4, 5]],
    [100, 100, [1, 2]],
    [200, 200, [1, 5, 49]],   // 5 i 49 to ziarna, które kiedyś nie domykały
  ]
  for (const [W, H, seeds] of cases) {
    for (const seed of seeds) {
      const r = generate({ W, H, seed, restarts: 0 })
      assert.equal(r.ok, true, `${W}×${H} ziarno ${seed} nie domknęło się`)
      assert.equal(r.metrics.coverage, 1, `${W}×${H} ziarno ${seed}: pokrycie ${r.metrics.coverage}`)
      assert.equal(r.metrics.solvable, true, `${W}×${H} ziarno ${seed}: nierozwiązywalna`)
      assert.equal(r.backtracks, 0, `${W}×${H} ziarno ${seed}: ${r.backtracks} nawrotów`)
    }
  }
})

test('generate: domyka planszę bez Warnsdorffa i przy samych krótkich', () => {
  for (const over of [{ warns: 0 }, { wShort: 0.85, wMid: 0.1 }, { headBias: 1 }]) {
    const r = generate({ W: 100, H: 100, seed: 3, restarts: 0, ...over })
    assert.equal(r.ok && r.metrics.solvable && r.metrics.coverage === 1, true, JSON.stringify(over))
  }
})

test('analyse: nie przepełnia stosu przy setkach tysięcy elementów (worker w Chrome ma mały stos)', () => {
  // Plansza 2×300 000 pokryta poziomymi dominami z głową przy prawej krawędzi:
  // 300 000 elementów, wszystkie promienie puste, więc graf blokowania jest
  // pusty i test kosztuje tylko pamięć na elementy. Rozwinięcie
  // Math.min(...tablica) tej wielkości rzuca RangeError także w Node.
  const W = 2, H = 300000
  const c = new Carver(W, H, defaultParams(), mulberry32(1))
  for (let y = 0; y < H; y++) {
    c.pieces.push({ id: y, dir: 1, cells: [{ x: 1, y }, { x: 0, y }] })
    c.owner[y * W] = y; c.owner[y * W + 1] = y
  }
  c.remaining = 0
  const m = analyse(c)
  assert.equal(m.N, H)
  assert.equal(m.minLen, 2)
  assert.equal(m.maxLen, 2)
  assert.equal(m.coverage, 1)
})
