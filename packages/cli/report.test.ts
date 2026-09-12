// report.ts is a measurement tool, not a board maker: it writes nothing, and
// its own flags (--runs, --bench, --only, --mid, --square, --portrait,
// --show) sit beside every engine knob and the everyday flags the shared
// parser already knows. A knob named on the command line pins it for every
// level, exactly as it pins carve.ts's one board.
import { assertEquals, assertMatch } from '@std/assert'
import { dirname, fromFileUrl, join } from '@std/path'

const here = dirname(fromFileUrl(import.meta.url))
const report = join(here, 'report.ts')
const tmp = () => Deno.makeTempDirSync({ prefix: 'arrowz-cli-' })
const entries = (dir: string): number => [...Deno.readDirSync(dir)].length

/** Runs report.ts with the board store pointed at boardsDir, though the report never touches it. */
function runReport(argv: readonly string[], boardsDir: string) {
  const r = new Deno.Command(Deno.execPath(), {
    args: ['run', '--allow-read', '--allow-write', '--allow-env', report, ...argv],
    cwd: dirname(here),
    env: { ARROWZ_BOARDS_DIR: boardsDir },
    stdout: 'piped',
    stderr: 'piped',
  }).outputSync()
  return { status: r.code, stdout: new TextDecoder().decode(r.stdout), stderr: new TextDecoder().decode(r.stderr) }
}

Deno.test('report.ts and --bench refuse invalid parameters before the first level', () => {
  const dir = tmp()
  for (const mode of [['--only=easy', '--square', '--runs=1'], ['--bench=1', '--only=easy', '--square']]) {
    const r = runReport([...mode, '--warns=1'], join(dir, 'boards'))
    assertEquals(r.status, 2, mode.join(' '))
    assertMatch(r.stderr, /^invalid arguments:\n {2}- --warns=1 is outside 2\.\.16\n/)
    assertEquals(r.stdout, '', `no report header for ${mode.join(' ')}`)
  }
  // a level size from --mid is validated like a knob
  const r = runReport(['--only=mid', '--square', '--mid=2', '--runs=1'], join(dir, 'boards'))
  assertEquals(r.status, 2)
  assertMatch(r.stderr, /--width=2 is outside 4\.\.1000/)
})

// The report and the benchmark have no other test that runs them to the end.
Deno.test('report.ts and --bench run one level to the end, and write nothing', () => {
  const dir = tmp()
  const rep = runReport(['--only=easy', '--square', '--runs=1'], join(dir, 'boards'))
  assertEquals(rep.status, 0, rep.stderr)
  assertMatch(rep.stdout, /--- Easy 25x25 \(1 runs\) ---\n {2}coverage\s+100\.00%/)
  const bench = runReport(['--bench=1', '--only=easy', '--square'], join(dir, 'boards'))
  assertEquals(bench.status, 0, bench.stderr)
  assertMatch(bench.stdout, /--- Easy 25x25 ---\n {2}time \[ms\]/)
  assertEquals(entries(dir), 0, 'the report writes nothing')
})
