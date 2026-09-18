// The successor to packages/cli/lab-bundle.test.ts, which ran the Deno-bundled
// worker and compared its board with the engine's own. This proves the same
// thing over the artefact Vite builds — dist/assets/generate.worker-<hash>.js,
// the file a browser really loads. parity.browser.test.ts already compares the
// worker with the engine, but over the engine as Vitest transforms it: a
// tree-shaken, minified production bundle is a different artefact, and nothing
// else in the repository ever runs it.
//
// No browser is needed. The chunk touches nothing but `self.*` and
// `performance.now()`, so substituting `self` and collecting `postMessage`
// runs it in plain Node (measured 2026-09-17).
import { readdirSync } from 'node:fs'
import process from 'node:process'
import { decodeBoard, defaultParams, encodeBoard, fingerprint, generate, toSvg } from '@arrowz/engine'
import { DEFAULT_VIEW, svgOptions } from '@arrowz/engine/command'

const assets = new URL('../dist/assets/', import.meta.url)
// The chunk's name carries a content hash, so it is found by prefix. Exactly
// one must match: a second worker and a silent pick would leave this script
// passing over the wrong artefact.
const found = readdirSync(assets).filter((f) => f.startsWith('generate.worker') && f.endsWith('.js'))
if (found.length !== 1) {
  console.error(`expected exactly one built worker chunk, found ${found.length}: ${found.join(', ') || '(none)'}`)
  process.exit(1)
}

const messages = []
globalThis.self = globalThis
globalThis.postMessage = (message) => messages.push(message)
await import(new URL(found[0], assets).href)
if (typeof globalThis.onmessage !== 'function') {
  console.error('importing the worker chunk registered no onmessage handler')
  process.exit(1)
}

let failures = 0
function check(ok, what) {
  console.log(`${ok ? 'ok  ' : 'FAIL'} ${what}`)
  if (!ok) failures++
}

const params = { ...defaultParams(), W: 20, H: 20, seed: 7 }
const mine = generate(params)

// Progress messages may precede the answer; the answer is the one that is not
// progress, exactly as every caller of this protocol treats it.
globalThis.onmessage({ data: { type: 'generate', params } })
const done = messages.find((m) => m.type === 'done')
check(done !== undefined && done.ok === true, 'the built worker closes a 20x20 board')
check(
  done !== undefined && fingerprint(decodeBoard(done.board)) === fingerprint(mine.board),
  'its board is the engine’s board',
)
check(done?.board?.fingerprint === fingerprint(mine.board), 'the board file it hands over carries that fingerprint')
check(done?.pieces === mine.board.pieces.length, 'it counts the pieces the engine counts')

messages.length = 0
const options = svgOptions(DEFAULT_VIEW)
globalThis.onmessage({ data: { type: 'svg', board: encodeBoard(mine.board), options } })
const svg = messages.find((m) => m.type === 'svg')
check(svg !== undefined && svg.svg === toSvg(mine.board, options), 'it draws the SVG the engine draws')

if (failures > 0) {
  console.error(`${failures} check(s) failed: the built worker is not the engine`)
  process.exit(1)
}
console.log('the built worker carves and draws what the engine does')
