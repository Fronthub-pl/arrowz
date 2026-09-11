// Proves that the tsc emission in dist/ is the same engine: every golden
// board of fingerprints.json except big500 (21 771 pieces, left to the Deno
// test) must reproduce its fingerprint under Node, directly and through the
// board file.
import { readFileSync } from 'node:fs'
import process from 'node:process'
import { decodeBoard, defaultParams, encodeBoard, fingerprint, generate } from '../dist/mod.js'
import { parseArgs, parseSimpleArgs } from '../dist/command.js'
import { simpleParams } from '../dist/lab-simple.js'

const golden = JSON.parse(readFileSync(new URL('../fingerprints.json', import.meta.url), 'utf8'))

function paramsOf(c) {
  if (c.argv === null) return { ...defaultParams(), W: 40, H: 40, seed: 1 }
  if (c.argv.includes('--advanced')) {
    return parseArgs(c.argv.filter((a) => a !== '--advanced' && a !== '--dry-run')).params
  }
  return simpleParams(parseSimpleArgs(c.argv).choice)
}

/** The case without an argv is the void board: voids and the escape hatch are options, not knobs. */
function optsOf(c) {
  return c.argv === null ? { unchecked: true, voidFrac: 0.1 } : {}
}

let failures = 0
for (const c of golden.cases) {
  if (c.name === 'big500') continue
  const r = generate(paramsOf(c), optsOf(c))
  const got = fingerprint(r.board)
  // The unchecked case records no maxLen — it has no metrics.
  const maxLenOk = c.maxLen === null || r.metrics?.maxLen === c.maxLen
  // A Cloud Function will read these files: the file must round-trip in Node too.
  const back = decodeBoard(JSON.parse(JSON.stringify(encodeBoard(r.board))))
  const fileOk = fingerprint(back) === c.fingerprint
  const ok = got === c.fingerprint && r.board.pieces.length === c.pieces && maxLenOk && fileOk
  console.log(
    `${ok ? 'ok  ' : 'FAIL'} ${c.name} ${got} (${r.board.pieces.length} pieces, maxLen ${r.metrics?.maxLen}, file ${
      fileOk ? 'ok' : 'FAIL'
    })`,
  )
  if (!ok) failures++
}
if (failures > 0) {
  console.error(`${failures} golden board(s) differ under Node`)
  process.exit(1)
}
console.log('all golden boards reproduce under Node')
