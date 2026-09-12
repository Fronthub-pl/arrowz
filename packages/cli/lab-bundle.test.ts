// The lab is the one thing the gates BUILT but never RAN. `deno task bundle`
// (nx cli:bundle, and the CI run) proves the page and the worker compile;
// nothing has ever executed the result, so a worker that answers nothing, or a
// page that throws on its first lookup, would ship through a green board.
// PR #50 broke `deno task docs` the same way, and docs got a cheap guard in
// readme.test.ts rather than a browser. This is the same trade for the lab:
// the worker is bundled and actually run, in Deno, and the page's fixed
// lookups are checked against the HTML it runs in.
//
// What this does NOT cover: the page's own behaviour in a browser. That needs
// a browser, and the board element already owns that harness.
import { assert, assertEquals } from '@std/assert'
import { dirname, fromFileUrl, join, toFileUrl } from '@std/path'
import { decodeBoard, defaultParams, encodeBoard, fingerprint, generate, toSvg } from '@arrowz/engine'
import { DEFAULT_VIEW, svgOptions } from '@arrowz/engine/command'
import type { WorkerIn, WorkerOut } from '@arrowz/engine'

const here = dirname(fromFileUrl(import.meta.url))
const read = (name: string): string => Deno.readTextFileSync(join(here, name))

/** The bundle task itself, so the names below are the ones the task really writes. */
const bundleTask: string = (JSON.parse(read('deno.json')) as { tasks: Record<string, string> }).tasks.bundle ?? ''

/**
 * Bundles ONE entry point into a temporary directory, the way `deno task
 * bundle` bundles both, and returns the file it wrote. The temporary directory
 * keeps the developer's dist/ (which lab.sh watches) out of the test's way.
 */
function bundleOne(entry: string): { file: string; dir: string } {
  const dir = Deno.makeTempDirSync({ prefix: 'arrowz-bundle-' })
  const out = new Deno.Command('deno', {
    args: ['bundle', '--platform', 'browser', '--outdir', dir, entry],
    cwd: here,
    stdout: 'piped',
    stderr: 'piped',
  }).outputSync()
  assert(out.success, `deno bundle ${entry} failed:\n${new TextDecoder().decode(out.stderr)}`)
  return { file: join(dir, entry.replace(/\.ts$/, '.js')), dir }
}

/** Sends one message to the bundled worker and waits for the answer that is not progress. */
function ask(file: string, message: WorkerIn): Promise<WorkerOut> {
  const worker = new Worker(toFileUrl(file), { type: 'module' })
  const answer = new Promise<WorkerOut>((resolve, reject) => {
    const timer = setTimeout(() => reject(new Error('the bundled worker never answered')), 30_000)
    worker.onmessage = (event: MessageEvent<WorkerOut>) => {
      // Progress is a running report, not the answer; a small board may send none.
      if (event.data.type === 'progress') return
      clearTimeout(timer)
      resolve(event.data)
    }
    worker.onerror = (event) => {
      clearTimeout(timer)
      reject(new Error(`the bundled worker threw: ${event.message}`))
    }
  })
  worker.postMessage(message)
  return answer.finally(() => worker.terminate())
}

Deno.test('the bundled worker carves the board the engine carves, and draws the SVG the engine draws', async () => {
  const { file, dir } = bundleOne('lab-worker.ts')
  try {
    const params = { ...defaultParams(), W: 20, H: 20, seed: 7 }
    const done = await ask(file, { type: 'generate', params })
    assertEquals(done.type, 'done', `worker said: ${JSON.stringify(done).slice(0, 200)}`)
    if (done.type !== 'done') return
    assert(done.ok, 'the bundled worker did not close a 20x20 board')
    // Cell for cell the same board as an in-process call: the bundle carries
    // the engine, and a bundler that dropped or reordered a module would show
    // up here rather than on someone's screen.
    const mine = generate(params)
    assertEquals(fingerprint(decodeBoard(done.board)), fingerprint(mine.board))
    assertEquals(done.pieces, mine.board.pieces.length)

    // The second message type, on the board the page would hold.
    const svg = await ask(file, {
      type: 'svg',
      board: encodeBoard(mine.board),
      options: svgOptions(DEFAULT_VIEW),
    })
    assertEquals(svg.type, 'svg')
    if (svg.type !== 'svg') return
    assertEquals(svg.svg, toSvg(mine.board, svgOptions(DEFAULT_VIEW)))
  } finally {
    Deno.removeSync(dir, { recursive: true })
  }
})

Deno.test('every element the page looks up by name is in the page it runs in', () => {
  // el() throws on a miss, at module level, so one renamed id in lab.html is a
  // blank lab -- and nothing in the gates opens the lab.
  const page = read('lab-page.ts')
  const html = read('lab.html')
  const asked = [...page.matchAll(/\bel(?:<[^>]*>)?\('([\w-]+)'\)/g)].map((m) => m[1])
  const have = new Set([...html.matchAll(/\bid="([\w-]+)"/g)].map((m) => m[1]))
  assert(asked.length > 40, `only ${asked.length} lookups found: the pattern stopped matching`)
  assertEquals(asked.filter((id) => id !== undefined && !have.has(id)), [], 'lookups with no element in lab.html')
})

Deno.test('the names the bundle writes are the names the page and the worker ask for', () => {
  // Three files have to agree on two names. They are spelled out in the task,
  // in the <script> tag and in the Worker URL, and nothing has ever compared
  // them: a renamed entry point leaves a lab that loads nothing and says
  // nothing.
  assert(bundleTask.includes('--outdir dist'), `the bundle task writes elsewhere: ${bundleTask}`)
  for (const entry of ['lab-page.ts', 'lab-worker.ts']) {
    assert(bundleTask.includes(entry), `${entry} is not an entry point of the bundle task`)
  }
  assert(read('lab.html').includes('src="./dist/lab-page.js"'), 'lab.html loads another page bundle')
  assert(read('lab-page.ts').includes("new URL('./lab-worker.js', import.meta.url)"), 'the page starts another worker')
})
