// `arrowz` is the installed program and `carve` its one command. These run it
// the way the repository task does, under Deno; scripts/node-smoke.mjs runs
// the bundle under Node.
import { assert, assertEquals, assertStringIncludes } from '@std/assert'
import { dirname, fromFileUrl, join } from '@std/path'
import { defaultParams, generate, layoutHash } from '@fronthub/arrowz-engine'
import { helpText } from '@fronthub/arrowz-engine/command'

const here = dirname(fromFileUrl(import.meta.url))

/** Runs arrowz.ts in `cwd` with the environment given and nothing of the caller's store. */
function arrowz(
  argv: readonly string[],
  { cwd = here, env = {} }: { cwd?: string; env?: Record<string, string> } = {},
) {
  const inherited = Deno.env.toObject()
  delete inherited.ARROWZ_BOARDS_DIR
  const r = new Deno.Command(Deno.execPath(), {
    args: ['run', '--allow-read', '--allow-write', '--allow-env', join(here, 'arrowz.ts'), ...argv],
    cwd,
    clearEnv: true,
    env: { ...inherited, ...env },
    stdout: 'piped',
    stderr: 'piped',
  }).outputSync()
  return { status: r.code, stdout: new TextDecoder().decode(r.stdout), stderr: new TextDecoder().decode(r.stderr) }
}

Deno.test('arrowz carve lays the board the engine lays and writes the command that repeats it', async () => {
  const r = arrowz(['carve', '--width=8', '--height=8', '--seed=3', '--dry-run'])
  assertEquals(r.status, 0, r.stderr)
  const line = JSON.parse(r.stdout) as { id: string; command: string }
  assertEquals(line.id, await layoutHash(generate({ ...defaultParams(), W: 8, H: 8, seed: 3 }).board))
  assertEquals(line.command, 'arrowz carve --width=8 --height=8 --seed=3')
})

Deno.test('arrowz carve --help prints the help of carve and succeeds', () => {
  const r = arrowz(['carve', '--help'])
  assertEquals(r.status, 0, r.stderr)
  assertEquals(r.stdout, helpText() + '\n')
})

Deno.test('arrowz without a command says how it is called and fails', () => {
  const r = arrowz([])
  assertEquals(r.status, 2)
  assertEquals(r.stdout, '')
  assertStringIncludes(r.stderr, 'Usage: arrowz carve')
})

Deno.test('arrowz --help and -h print the same usage on stdout and succeed', () => {
  const usage = arrowz([]).stderr
  for (const flag of ['--help', '-h']) {
    const r = arrowz([flag])
    assertEquals(r.status, 0)
    assertEquals(r.stdout, usage)
    assertEquals(r.stderr, '')
  }
})

Deno.test('arrowz refuses a command it does not have, by name', () => {
  const r = arrowz(['report', '--width=8'])
  assertEquals(r.status, 2)
  assertEquals(r.stdout, '')
  assertStringIncludes(r.stderr, 'arrowz: unknown command report')
  assertStringIncludes(r.stderr, 'Usage: arrowz carve')
})

Deno.test('without ARROWZ_BOARDS_DIR the boards go to ./boards of the working directory', () => {
  const cwd = Deno.makeTempDirSync({ prefix: 'arrowz-cwd-' })
  const r = arrowz(['carve', '--width=8', '--height=8', '--seed=3'], { cwd })
  assertEquals(r.status, 0, r.stderr)
  const stored = [...Deno.readDirSync(join(cwd, 'boards', '8x8'))].map((e) => e.name)
  assert(stored.some((name) => name.endsWith('.board.json')), stored.join(', '))
})

Deno.test('ARROWZ_BOARDS_DIR moves the store, and a relative one starts at the working directory', () => {
  const cwd = Deno.makeTempDirSync({ prefix: 'arrowz-cwd-' })
  const r = arrowz(['carve', '--width=8', '--height=8', '--seed=3'], { cwd, env: { ARROWZ_BOARDS_DIR: 'elsewhere' } })
  assertEquals(r.status, 0, r.stderr)
  assert([...Deno.readDirSync(join(cwd, 'elsewhere', '8x8'))].length > 0)
  assertEquals([...Deno.readDirSync(cwd)].map((e) => e.name), ['elsewhere'])
})
