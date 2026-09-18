// Proves that the tsc emission in dist/ is the same engine: every golden
// board of fingerprints.json except big500 (21 771 pieces, left to the Deno
// test) must reproduce its fingerprint under Node, directly and through the
// board file.
import { readFileSync } from 'node:fs'
import process from 'node:process'
import { decodeBoard, defaultParams, encodeBoard, fingerprint, generate, layoutHash } from '../dist/mod.js'
import { parseArgs } from '../dist/command.js'
import { genSeconds } from '../dist/lab-report.js'
import { docsFor } from '../dist/lab-docs.js'

const golden = JSON.parse(readFileSync(new URL('../fingerprints.json', import.meta.url), 'utf8'))

function paramsOf(c) {
  if (c.argv === null) return { ...defaultParams(), W: 40, H: 40, seed: 1 }
  const parsed = parseArgs(c.argv.filter((a) => a !== '--dry-run'))
  if (parsed.errors.length) throw new Error(`${c.name}: ${parsed.errors.join('; ')}`)
  return parsed.params
}

/** The case without an argv is the void board: voids and the escape hatch are options, not knobs. */
function optsOf(c) {
  return c.argv === null ? { unchecked: true, voidFrac: 0.1 } : {}
}

let failures = 0

/** Every check reports in one format and counts once, so the summary at the end reads the only counter there is. */
function check(ok, what) {
  console.log(`${ok ? 'ok  ' : 'FAIL'} ${what}`)
  if (!ok) failures++
}

for (const c of golden.cases) {
  if (c.name === 'big500') continue
  const r = generate(paramsOf(c), optsOf(c))
  const got = fingerprint(r.board)
  // The unchecked case records no maxLen — it has no metrics.
  const maxLenOk = c.maxLen === null || r.metrics?.maxLen === c.maxLen
  // A Cloud Function will read these files: the file must round-trip in Node too.
  const back = decodeBoard(JSON.parse(JSON.stringify(encodeBoard(r.board))))
  const fileOk = fingerprint(back) === c.fingerprint
  // Web Crypto under Node names the layout exactly as Deno does.
  const hashOk = (await layoutHash(r.board)) === c.layoutHash && (await layoutHash(back)) === c.layoutHash
  const ok = got === c.fingerprint && r.board.pieces.length === c.pieces && maxLenOk && fileOk && hashOk
  check(
    ok,
    `${c.name} ${got} (${r.board.pieces.length} pieces, maxLen ${r.metrics?.maxLen}, file ${
      fileOk ? 'ok' : 'FAIL'
    }, layout ${hashOk ? 'ok' : 'FAIL'})`,
  )
}
// The module has to be in dist/ and it has to evaluate under Node. tsc alone
// proves neither: tsconfig.build.json carries `lib: dom`, so a stray DOM
// reference type-checks and only fails here, on import.
check(docsFor('pl').props.board !== docsFor('en').props.board, 'lab-docs is translated in dist')
check(
  genSeconds({ genMs: 4800 }, '—') === '4.80' && genSeconds({ genMs: null }, '—') === '—',
  'lab-report is emitted correctly into dist/',
)
// Every failure above is named on its own line, so the summary counts rather
// than diagnoses: it used to say "golden board(s) differ" about a failing
// documentation check, which named the wrong file to go and look at.
if (failures > 0) {
  console.error(`${failures} check(s) failed under Node`)
  process.exit(1)
}
console.log('all checks pass under Node')
