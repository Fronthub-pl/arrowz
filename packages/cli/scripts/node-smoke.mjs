// Proves that dist/arrowz.mjs, the file `arrowz` runs once installed, is the
// same program under Node: it lays the board the engine lays, writes the store
// in the working directory, ends with the statuses the Deno tests see, and
// carries nothing Node could not load.
import { spawnSync } from 'node:child_process'
import { existsSync, mkdtempSync, readdirSync, readFileSync, rmSync } from 'node:fs'
import { tmpdir } from 'node:os'
import { join } from 'node:path'
import process from 'node:process'
import { fileURLToPath } from 'node:url'
import { defaultParams, generate, layoutHash } from '@fronthub/arrowz-engine'

const bundle = fileURLToPath(new URL('../dist/arrowz.mjs', import.meta.url))
let failures = 0

function check(ok, what) {
  console.log(`${ok ? 'ok  ' : 'FAIL'} ${what}`)
  if (!ok) failures++
}

/** Runs the bundle in a fresh working directory, without the caller's store. */
function arrowz(argv, env = {}) {
  const cwd = mkdtempSync(join(tmpdir(), 'arrowz-node-'))
  const inherited = { ...process.env }
  delete inherited.ARROWZ_BOARDS_DIR
  const r = spawnSync(process.execPath, [bundle, ...argv], { cwd, env: { ...inherited, ...env }, encoding: 'utf8' })
  return { status: r.status, stdout: r.stdout, stderr: r.stderr, cwd }
}

const text = readFileSync(bundle, 'utf8')
check(text.startsWith('#!/usr/bin/env node\n'), 'the bundle starts with the Node shebang')
check(!/\bDeno\./.test(text), 'the bundle uses no Deno API')
const imported = [...text.matchAll(/^import .* from "([^"]+)";$/gm)].map((m) => m[1])
const foreign = imported.filter((s) =>
  !s.startsWith('node:') && !/^@fronthub\/arrowz-engine(\/(command|simple))?$/.test(s)
)
check(
  imported.length > 0 && foreign.length === 0,
  `the bundle imports the engine and Node only (${foreign.join(', ')})`,
)

const dry = arrowz(['carve', '--width=25', '--height=25', '--dry-run'])
const line = dry.status === 0 ? JSON.parse(dry.stdout) : {}
const expected = await layoutHash(generate({ ...defaultParams(), W: 25, H: 25, seed: 7 }).board)
check(dry.status === 0 && line.id === expected, `--dry-run names the engine's layout ${expected.slice(0, 15)}…`)
check(line.command === 'arrowz carve --width=25 --height=25 --seed=7', 'the command it prints is its own')
check(readdirSync(dry.cwd).length === 0, '--dry-run writes nothing')

const saved = arrowz(['carve', '--width=8', '--height=8', '--seed=3', '--svg=copy.svg'])
const store = join(saved.cwd, 'boards', '8x8')
const files = existsSync(store) ? readdirSync(store) : []
check(
  saved.status === 0 && files.some((f) => f.endsWith('.board.json')),
  'a run saves into ./boards of the working directory',
)
check(
  files.some((f) => f.endsWith('.svg')) && existsSync(join(saved.cwd, 'copy.svg')),
  '--svg=path keeps the preview and the copy',
)

const moved = arrowz(['carve', '--width=8', '--height=8', '--seed=3'], { ARROWZ_BOARDS_DIR: 'elsewhere' })
check(moved.status === 0 && existsSync(join(moved.cwd, 'elsewhere', '8x8')), 'ARROWZ_BOARDS_DIR moves the store')

// The whole help has to arrive although the program ends right after printing it.
const help = arrowz(['carve', '--help=knobs'])
check(
  help.status === 0 && help.stdout.includes('Usage: arrowz carve') && help.stdout.trimEnd().split('\n').length > 60,
  'the help of every knob is printed whole',
)

const refused = arrowz(['carve', '--width=8'])
check(
  refused.status === 2 && refused.stderr.includes('invalid arguments') && refused.stdout === '',
  'a bad command line is refused with status 2',
)
const bare = arrowz([])
check(bare.status === 2 && bare.stderr.includes('Usage: arrowz carve'), 'no command prints the usage with status 2')

for (const run of [dry, saved, moved, help, refused, bare]) rmSync(run.cwd, { recursive: true, force: true })
console.log(failures ? `${failures} FAILED` : 'all ok')
process.exitCode = failures ? 1 : 0
