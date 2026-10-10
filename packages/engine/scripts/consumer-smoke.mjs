// Uses the packages the way a stranger does: an empty project installs the
// tarballs of this release (a package the release leaves out comes from the
// registry), then the engine lays its golden board, `arrowz` names its golden
// layout and Vite builds a page with the element. Runs under Node, and under
// Deno when Deno starts it; npm installs in both cases.
//
//   node packages/engine/scripts/consumer-smoke.mjs <directory of tarballs>
import { spawnSync } from 'node:child_process'
import { existsSync, mkdtempSync, readdirSync, readFileSync, rmSync, writeFileSync } from 'node:fs'
import { tmpdir } from 'node:os'
import { join, resolve } from 'node:path'
import process from 'node:process'

const PACKAGES = ['@fronthub/arrowz-engine', '@fronthub/arrowz-board', '@fronthub/arrowz-cli']
const golden = JSON.parse(readFileSync(new URL('./consumer-golden.json', import.meta.url), 'utf8'))
const tarballs = resolve(process.argv[2] ?? 'tarballs')
const deno = 'Deno' in globalThis
/** The Deno that runs the smoke, quoted for the shell. */
const runtime = `"${process.execPath}"`
let failures = 0

function check(ok, what) {
  console.log(`${ok ? 'ok  ' : 'FAIL'} ${what}`)
  if (!ok) failures++
}

const project = mkdtempSync(join(tmpdir(), 'arrowz-consumer-'))

/** One command line through the shell: on Windows npm and npx are .cmd files, which Node starts no other way. */
function run(line) {
  const r = spawnSync(line, { cwd: project, shell: true, encoding: 'utf8' })
  if (r.status !== 0) console.log(`$ ${line}\n${r.stdout}${r.stderr}`)
  return r
}

/** What a child printed as a JSON object, or {} for anything else, so the check that reads it fails with its message. */
function jsonOf(text) {
  try {
    const value = JSON.parse(text)
    return typeof value === 'object' && value !== null && !Array.isArray(value) ? value : {}
  } catch {
    return {}
  }
}

/** The tarball of a package when this release packs it, else its name, which npm resolves from the registry. */
function specOf(name) {
  const prefix = `${name.slice(1).replace('/', '-')}-`
  const files = existsSync(tarballs) ? readdirSync(tarballs) : []
  const found = files.filter((f) => f.startsWith(prefix) && f.endsWith('.tgz'))
  if (found.length > 1) check(false, `${name} has one tarball in ${tarballs}, not ${found.join(' and ')}`)
  return found.length > 0 ? join(tarballs, found[0]) : name
}

const specs = PACKAGES.map(specOf)
const packed = PACKAGES.filter((name, i) => specs[i] !== name)
check(packed.length > 0, `the release packs ${packed.join(', ') || 'nothing'} (${tarballs})`)

writeFileSync(join(project, 'package.json'), JSON.stringify({ name: 'consumer', private: true, type: 'module' }))
const npm = run('npm --version').stdout.trim()
// Plain quotes and a bare major: cmd.exe would swallow the caret of a range such as ^8.
const install = run(`npm install --ignore-scripts ${specs.map((s) => `"${s}"`).join(' ')} vite@8`)
check(install.status === 0, `npm ${npm} installs the packages and Vite with install scripts off`)

if (install.status === 0) {
  // A tarball that npm quietly replaced with the registry's copy would test the wrong files.
  const lock = JSON.parse(readFileSync(join(project, 'package-lock.json'), 'utf8')).packages
  for (const name of PACKAGES) {
    const from = String(lock[`node_modules/${name}`]?.resolved)
    check(from.startsWith('file:') === packed.includes(name), `${name} comes from ${from.split('/').pop()}`)
  }

  writeFileSync(
    join(project, 'engine.mjs'),
    `import { defaultParams, fingerprint, generate } from '@fronthub/arrowz-engine'
import { parseArgs } from '@fronthub/arrowz-engine/command'
import * as simple from '@fronthub/arrowz-engine/simple'
const { board } = generate({ ...defaultParams(), W: 40, H: 40, seed: 1 })
const width = parseArgs(['--width=25', '--height=25']).params.W
console.log(JSON.stringify({ fingerprint: fingerprint(board), pieces: board.pieces.length, width, simple: Object.keys(simple).length }))
`,
  )
  const engine = run(`${deno ? `${runtime} run --allow-read --allow-env` : 'node'} engine.mjs`)
  const laid = engine.status === 0 ? jsonOf(engine.stdout) : {}
  check(
    laid.fingerprint === golden.fingerprint && laid.pieces === golden.pieces,
    `the engine lays the golden 40×40 board ${golden.fingerprint} (got ${laid.fingerprint}, ${laid.pieces} pieces)`,
  )
  check(laid.width === 25 && laid.simple > 0, 'the command and simple entries load')

  // --no keeps npx from fetching whatever is published under the name arrowz when the command is not installed.
  const arrowz = deno
    ? `${runtime} run --allow-read --allow-env --allow-write node_modules/@fronthub/arrowz-cli/dist/arrowz.mjs`
    : 'npx --no arrowz'
  const dry = run(`${arrowz} carve --width=25 --height=25 --dry-run`)
  const line = dry.status === 0 ? jsonOf(dry.stdout) : {}
  check(
    line.id === golden.layout,
    `arrowz carve names the golden layout ${golden.layout.slice(0, 15)}… (got ${line.id})`,
  )

  writeFileSync(
    join(project, 'index.html'),
    '<!doctype html><html><body><arrowz-board></arrowz-board><script type="module" src="./main.js"></script></body></html>',
  )
  writeFileSync(
    join(project, 'main.js'),
    `import '@fronthub/arrowz-board'
import { defaultParams, generate } from '@fronthub/arrowz-engine'
document.body.firstElementChild.board = generate({ ...defaultParams(), W: 12, H: 12, seed: 1 }).board
`,
  )
  const vite = run('npx --no vite build')
  const assets = join(project, 'dist', 'assets')
  const built = vite.status === 0 && existsSync(assets)
    ? readdirSync(assets).map((f) => readFileSync(join(assets, f), 'utf8')).join('')
    : ''
  // The GLSL header is in the board's files and in none of the engine's, and a minifier keeps a string.
  check(built.includes('#version 300 es'), 'Vite bundles the element of the board package')
}

rmSync(project, { recursive: true, force: true })
console.log(failures ? `${failures} FAILED` : 'all ok')
process.exitCode = failures ? 1 : 0
