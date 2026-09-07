// PROTOTYP WYRZUCALNY — warstwa CLI nad silnikiem z engine.mjs.
// Uruchomienie: node prototype/carve.mjs [opcje]
import { writeFileSync } from 'node:fs'
import { Carver, analyse, mulberry32, render, toSvg, DIRS } from './engine.mjs'

// ------------------------------------------------------------------ main

// Ślad i debug wchodzą do silnika jako funkcje — silnik nie zna `process`.
const trace = process.env.CARVE_TRACE
  ? (i) => console.error(`    [trace] elementów ${i.pieces}, zostało ${i.remaining}, nawrotów ${i.backtracks}, ${i.ms.toFixed(0)} ms`)
  : null
const debug = process.env.GIANT_DEBUG ? (msg) => console.error(msg) : null

const arg = (k, dflt) => {
  const hit = process.argv.find((a) => a.startsWith(`--${k}=`))
  return hit ? Number(hit.split('=')[1]) : dflt
}
const show = process.argv.includes('--show')

// Dwa niezależne pokrętła: poziom (rozmiar bazowy) i format (1:1 albo 1:2).
// Format pionowy odpowiada ekranowi telefonu i referencyjnemu zrzutowi.
const BASE = [['Easy', 25], ['Medium', 50], ['Hard', 75], ['Nightmare', 100], ['Extreme', 200]]
// Poziom "I wanna die": milion komórek. Dostępny tylko za jawną flagą, bo jeden
// przebieg trwa dziesiątki sekund i nie ma sensu w domyślnym raporcie.
if (process.argv.includes('--insane')) BASE.push(['Insane', 1000])
// Skala pośrednia — do znalezienia granicy domykalności.
const midArg = process.argv.find((a) => a.startsWith('--mid='))
if (midArg) BASE.push(['Mid', Number(midArg.split('=')[1])])
const FORMATS = process.argv.includes('--kwadrat') ? [['', 1]]
  : process.argv.includes('--pionowy') ? [['', 2]]
  : [['·kw', 1], ['·pion', 2]]
const presets = BASE.flatMap(([name, n]) =>
  FORMATS.map(([sfx, r]) => ({
    name: name + sfx, W: n, H: n * r,
    Lmax: Math.round(2.5 * n * r), wShort: 0.50, wMid: 0.20,
  })))

const runs = arg('runs', 3)
const only = process.argv.find((a) => a.startsWith('--only='))?.split('=')[1]

const svgOut = process.argv.find((a) => a.startsWith('--svg='))?.split('=')[1]
if (svgOut) {
  const W = arg('w', arg('size', 25)), H = arg('h', arg('size', 50))
  const params = { W, H, Lmax: arg('lmax', Math.round(2.5 * Math.max(W, H))),
    wShort: arg('wshort', 0.10), wMid: arg('wmid', 0.70),
    pStraight: arg('straight', 0.6), wLateral: arg('lateral', 3), headBias: 0,
    probe: arg('probe', 0), probeLen: arg('probelen', 12), mix: -1, voidFrac: 0, ruleB: true, warns: arg('warns', 4),
    hug: arg('hug', 1), anticoil: arg('anticoil', 1), edgeHug: arg('edgehug', 0),
        wGiant: arg('wgiant', 0), giantSpan: arg('giantspan', 0),
        giantStraight: arg('giantstraight', 0.94), giantWarns: arg('giantwarns', 0),
        giantAnticoil: arg('giantanticoil', 6), giantSpacing: arg('giantspacing', 2), giants: arg('giants', 0), giantSpacePenalty: arg('giantspacepen', 8),
        giantStep: arg('giantstep', 0), giantJitter: arg('giantjitter', 0.15), maxBack: arg('maxback', 0), headTries: arg('headtries', 1), frontierUndo: arg('frontierundo', 0), strandLimit: arg('strandlimit', 8), trace, debug }
  let c, ok = false, seed = arg('seed', 7)
  for (let t = 0; t < 6 && !ok; t++) { c = new Carver(W, H, params, mulberry32(seed + t * 4242)); ok = c.run() }
  if (!ok) { console.error('nie udało się wygenerować'); process.exit(1) }
  const m = analyse(c, params.ruleB)
  const top = arg('top', 0)
  writeFileSync(svgOut, toSvg(c, { cell: arg('cell', 16), colored: process.argv.includes('--colored'), strokeRatio: arg('stroke', 0.5), top }))
  if (top > 0) {
    // Statystyki najdłuższych: zasięg (ile kolumn i wierszy przecina) mówi,
    // czy element przecina planszę, czy kłębi się w jednym rejonie.
    const longest = [...c.pieces].sort((a, b) => b.cells.length - a.cells.length).slice(0, top)
    console.log(`  ${top} najdłuższych elementów:`)
    for (const pc of longest) {
      const xs = pc.cells.map((q) => q.x), ys = pc.cells.map((q) => q.y)
      const spanX = Math.max(...xs) - Math.min(...xs) + 1
      const spanY = Math.max(...ys) - Math.min(...ys) + 1
      const cols = new Set(xs).size, rows = new Set(ys).size
      const own = new Set(pc.cells.map((q) => q.y * W + q.x))
      let coiled = 0, bends = 0, prev = null
      for (let i = 0; i < pc.cells.length; i++) {
        const q = pc.cells[i]
        let n = 0
        for (const { dx, dy } of DIRS) {
          const ax = q.x + dx, ay = q.y + dy
          if (ax >= 0 && ay >= 0 && ax < W && ay < H && own.has(ay * W + ax)) n++
        }
        if (n >= 3) coiled++
        if (i > 0) {
          const dx = q.x - pc.cells[i - 1].x, dy = q.y - pc.cells[i - 1].y
          if (prev && (dx !== prev.dx || dy !== prev.dy)) bends++
          prev = { dx, dy }
        }
      }
      // Rozciągnięcie: jaką część planszy obejmuje prostokąt otaczający element.
      const fill = pc.cells.length / (spanX * spanY)
      console.log(`    dł. ${String(pc.cells.length).padStart(4)}  bbox ${String(spanX).padStart(3)}x${String(spanY).padStart(3)} (${(100 * spanX / W).toFixed(0)}% x ${(100 * spanY / H).toFixed(0)}% planszy)  kolumn ${String(cols).padStart(3)}  wierszy ${String(rows).padStart(3)}  gęstość w bbox ${(100 * fill).toFixed(0)}%  skrętów ${bends}  zwinięcie ${(100 * coiled / pc.cells.length).toFixed(0)}%`)
    }
  }
  console.log(`${svgOut}  ${W}x${H} warns=${params.warns} hug=${params.hug} anticoil=${params.anticoil}  elem=${m.N} śr.dł=${(W*H/m.N).toFixed(1)} skrętów=${(m.bends).toFixed(2)} zwinięcie=${(100*m.coil).toFixed(0)}% selfAdj=${m.selfAdj.toFixed(2)} granica=${(100*m.sharedBorder).toFixed(0)}%`)
  process.exit(0)
}
const bench = arg('bench', 0)
if (bench > 0) {
  console.log(`BENCHMARK — ${bench} przebiegów na poziom\n`)
  for (const pre of presets) {
    if (only && pre.name.toLowerCase() !== only.toLowerCase()) continue
    const times = [], backs = [], lens = [], maxLens = []
    let fails = 0, restartsTotal = 0
    for (let r = 0; r < bench; r++) {
      const params = { ...pre, Lmax: arg('lmax', pre.Lmax), wShort: arg('wshort', pre.wShort), wMid: arg('wmid', pre.wMid),
        pStraight: arg('straight', 0.6), wLateral: arg('lateral', 3), headBias: arg('headbias', 0),
        probe: 0, probeLen: 12, mix: -1, voidFrac: 0,
        ruleB: process.argv.includes('--ruleb'), warns: arg('warns', 4),
        hug: arg('hug', 1), anticoil: arg('anticoil', 1), edgeHug: arg('edgehug', 0),
        wGiant: arg('wgiant', 0), giantSpan: arg('giantspan', 0),
        giantStraight: arg('giantstraight', 0.94), giantWarns: arg('giantwarns', 0),
        giantAnticoil: arg('giantanticoil', 6), giantSpacing: arg('giantspacing', 2), giants: arg('giants', 0), giantSpacePenalty: arg('giantspacepen', 8),
        giantStep: arg('giantstep', 0), giantJitter: arg('giantjitter', 0.15), maxBack: arg('maxback', 0), headTries: arg('headtries', 1), frontierUndo: arg('frontierundo', 0), strandLimit: arg('strandlimit', 8), trace, debug }
      const t0 = performance.now()
      const seed = 50000 + r
      let c = new Carver(pre.W, pre.H, params, mulberry32(seed))
      let ok = c.run(), rs = 0
      while (!ok && rs < 5) { rs++; c = new Carver(pre.W, pre.H, params, mulberry32(seed + 999983 * rs)); ok = c.run() }
      const dt = performance.now() - t0
      if (!ok) { fails++; continue }
      times.push(dt); backs.push(c.backtracks); restartsTotal += rs
      lens.push(c.pieces.reduce((a, x) => a + x.cells.length, 0) / c.pieces.length)
      maxLens.push(Math.max(...c.pieces.map((x) => x.cells.length)))
    }
    times.sort((a, b) => a - b); backs.sort((a, b) => a - b)
    const q = (arr, pp) => arr[Math.min(arr.length - 1, Math.floor(arr.length * pp))]
    const mean = (a) => a.reduce((x, y) => x + y, 0) / a.length
    console.log(`--- ${pre.name} ${pre.W}x${pre.H} ---`)
    console.log(`  czas [ms]   p50 ${q(times,0.5).toFixed(0)}   p90 ${q(times,0.9).toFixed(0)}   p99 ${q(times,0.99).toFixed(0)}   max ${times[times.length-1].toFixed(0)}`)
    console.log(`  nawroty     p50 ${q(backs,0.5)}   p90 ${q(backs,0.9)}   p99 ${q(backs,0.99)}   max ${backs[backs.length-1]}`)
    console.log(`  długość     średnia ${mean(lens).toFixed(2)}   maksymalna (śr.) ${mean(maxLens).toFixed(0)}`)
    console.log(`  odporność   restarty ${restartsTotal}   porażki ${fails}/${bench}\n`)
  }
  process.exit(0)
}
console.log('PROTOTYP — wycinanie z pełnej planszy, minimalna długość 2\n')
for (const pre of presets) {
  if (only && pre.name.toLowerCase() !== only.toLowerCase()) continue
  const acc = []
  for (let r = 0; r < runs; r++) {
    const seed = 1000 + r
    const rng = mulberry32(seed)
    const params = { ...pre, Lmax: arg('lmax', pre.Lmax), wShort: arg('wshort', pre.wShort), wMid: arg('wmid', pre.wMid), pStraight: arg('straight', 0.6), wLateral: arg('lateral', 6), headBias: arg('headbias', 0), probe: arg('probe', 0), probeLen: arg('probelen', 12), mix: arg('mix', -1), voidFrac: arg('void', 0), ruleB: process.argv.includes('--ruleb'), warns: arg('warns', 0),
      hug: arg('hug', 1), anticoil: arg('anticoil', 1), edgeHug: arg('edgehug', 0),
        wGiant: arg('wgiant', 0), giantSpan: arg('giantspan', 0),
        giantStraight: arg('giantstraight', 0.94), giantWarns: arg('giantwarns', 0),
        giantAnticoil: arg('giantanticoil', 6), giantSpacing: arg('giantspacing', 2), giants: arg('giants', 0), giantSpacePenalty: arg('giantspacepen', 8),
        giantStep: arg('giantstep', 0), giantJitter: arg('giantjitter', 0.15), maxBack: arg('maxback', 0), headTries: arg('headtries', 1), frontierUndo: arg('frontierundo', 0), strandLimit: arg('strandlimit', 8), trace, debug }
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
    if (!ok) {
      const sizes = c.stuckSizes ?? c.leftoverReport()
      const hist = { '1': 0, '2-5': 0, '6-20': 0, '21-100': 0, '100+': 0 }
      for (const z of sizes) {
        if (z === 1) hist['1']++
        else if (z <= 5) hist['2-5']++
        else if (z <= 20) hist['6-20']++
        else if (z <= 100) hist['21-100']++
        else hist['100+']++
      }
      console.log(`  ZAKLINOWANIE  w najlepszym momencie zostało ${c.stuckRemaining ?? c.remaining} komórek w ${sizes.length} fragmentach; największy ${sizes[0]}`)
      console.log(`                legalnych głów w tym momencie: ${c.stuckHeads ?? '?'} (z ${2 * (c.W + c.H)} możliwych)`)
      console.log(`                rozmiary: pojedyncze ${hist['1']}, 2-5: ${hist['2-5']}, 6-20: ${hist['6-20']}, 21-100: ${hist['21-100']}, 100+: ${hist['100+']}`)
      acc.push({ failed: true, restarts, remaining: c.remaining }); continue
    }
    const t1 = performance.now()
    const m = analyse(c, params.ruleB)
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
  console.log(`  KSZTAŁT       skrętów/elem ${avg((a) => a.bends).toFixed(2)}   wieloliniowych ${(100 * avg((a) => a.multiLine)).toFixed(0)}%   zwinięcie ${(100 * avg((a) => a.coil)).toFixed(0)}%`)
  console.log(`  ZASIĘG        średni ${(100 * avg((a) => a.span)).toFixed(0)}% boku   górne 10%: ${(100 * avg((a) => a.spanTop10)).toFixed(0)}%   rekord ${(100 * avg((a) => a.spanMax)).toFixed(0)}%`)
  console.log(`  ODBLOKOWANIA  średnio ${avg((a) => a.outDeg).toFixed(1)} elem./zdjęcie   rekord ${avg((a) => a.maxOut).toFixed(0)}   średni dystans ${(100 * avg((a) => a.blockDist)).toFixed(0)}% obwodu`)
  console.log(`  OPAKOWYWANIE  skrętów/kom ${avg((a) => a.bendsPerCell).toFixed(3)}   własnych sąsiadów/kom ${avg((a) => a.selfAdj).toFixed(2)}   sąsiadów obcych/elem ${avg((a) => a.neighbours).toFixed(1)}   najdłuższa wspólna granica ${(100 * avg((a) => a.sharedBorder)).toFixed(0)}% długości`)
  console.log(`  nawroty       ${avg((a) => a.backtracks).toFixed(1)}   restarty: ${avg((a) => a.restarts).toFixed(1)}`)
  const st = good[0].st
  console.log(`  diagnostyka   śr. want ${(st.want/st.n).toFixed(1)} -> got ${(st.got/st.n).toFixed(1)}   stall ${(100*st.stall/st.n).toFixed(0)}%   strand-trunc ${(100*st.strandTrunc/st.n).toFixed(0)}% (śr. -${(st.strandLoss/Math.max(1,st.strandTrunc)).toFixed(1)})`)
  console.log(`  czas          generacja ${avg((a) => a.tGen).toFixed(0)} ms, metryki ${avg((a) => a.tAna).toFixed(0)} ms\n`)
}
