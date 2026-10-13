import { assert, assertEquals } from '@std/assert'
import { dirname, fromFileUrl, join } from '@std/path'
import { defaultParams, encodeBoard } from '@fronthub/arrowz-engine'
import { COMMAND_PREFIX, DEFAULT_VIEW } from '@fronthub/arrowz-engine/command'
import { serverArgs } from './store-start.ts'

const here = dirname(fromFileUrl(import.meta.url))
const windows = Deno.build.os === 'windows'

/** The command line of the store task, so that what is tested is what `deno task store` runs. */
const config: { tasks: { store: string } } = JSON.parse(Deno.readTextFileSync(join(here, 'deno.json')))
const [, ...taskArgs] = config.tasks.store.split(' ')

/** A port nothing listens on: taken from the system, then given back. */
function freePort(): number {
  const listener = Deno.listen({ hostname: '127.0.0.1', port: 0 })
  const { port } = listener.addr
  listener.close()
  return port
}

/** Runs the store task from `cwd` on `port`, with the store directory spelled as `boards`. */
function start(cwd: string, port: number, boards: string): Deno.ChildProcess {
  const script = join(here, taskArgs.at(-1) ?? '')
  return new Deno.Command(Deno.execPath(), {
    args: [...taskArgs.slice(0, -1), script, String(port)],
    cwd,
    env: { ARROWZ_BOARDS_DIR: boards },
    stdout: 'null',
    stderr: 'null',
  }).spawn()
}

async function answers(port: number): Promise<boolean> {
  try {
    const r = await fetch(`http://127.0.0.1:${port}/api/boards`)
    await r.body?.cancel()
    return r.ok
  } catch {
    return false
  }
}

/** Whether the store comes to answer, or to stop answering, within `ms`. */
async function settles(port: number, want: boolean, ms: number): Promise<boolean> {
  for (const end = Date.now() + ms; Date.now() < end;) {
    if (await answers(port) === want) return true
    await new Promise((done) => setTimeout(done, 100))
  }
  return false
}

/** The processes `pid` started; nothing on Windows, where `stop` ends the whole tree at once. */
function startedBy(pid: number): number[] {
  if (windows) return []
  const out = new Deno.Command('pgrep', { args: ['-P', String(pid)], stdout: 'piped', stderr: 'null' }).outputSync()
  return new TextDecoder().decode(out.stdout).split('\n').filter((line) => line !== '').map(Number)
}

/** Ends `pid` if it still runs. */
function end(pid: number) {
  try {
    Deno.kill(pid, 'SIGTERM')
  } catch {
    // Already gone: the launcher ends when its server does.
  }
}

/**
 * Ends the launcher and the server it started, however far the test got, and
 * waits for the port: the store directory cannot go while the server holds it.
 */
async function stop(child: Deno.ChildProcess, port: number, servers: readonly number[] = startedBy(child.pid)) {
  if (windows) {
    const tree = ['/T', '/F', '/PID', String(child.pid)]
    await new Deno.Command('taskkill', { args: tree, stdout: 'null', stderr: 'null' }).output()
  } else {
    for (const pid of [...servers, child.pid]) end(pid)
  }
  await child.status
  await settles(port, false, 5_000)
}

Deno.test('the server is granted one port of this machine, the store and one variable', () => {
  assertEquals(serverArgs(9000, '/data/boards'), [
    'run',
    '--allow-net=127.0.0.1:9000',
    '--allow-read=/data/boards',
    '--allow-write=/data/boards',
    '--allow-env=ARROWZ_BOARDS_DIR',
    'store-server.ts',
    '9000',
    '--until-input-ends',
  ])
})

Deno.test('a relative store directory that does not exist yet is made, served and written to', async () => {
  const scratch = Deno.makeTempDirSync({ prefix: 'arrowz-start-' })
  const port = freePort()
  const child = start(scratch, port, 'not/yet')
  try {
    assert(await settles(port, true, 30_000), 'the store never answered')
    const saved = await fetch(`http://127.0.0.1:${port}/api/boards`, {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({
        board: encodeBoard({ W: 10, H: 10, owner: new Int32Array(100).fill(-1), pieces: [] }),
        params: { ...defaultParams(), W: 10, H: 10, seed: 7 },
        view: DEFAULT_VIEW,
        command: `${COMMAND_PREFIX} --width=10 --height=10 --seed=7`,
        metrics: { ok: true, pieces: 0, maxLen: 0, genMs: 1 },
        source: 'lab',
      }),
    })
    assertEquals(saved.status, 201)
    const { meta }: { meta: { id: string } } = await saved.json()
    assert(Deno.statSync(join(scratch, 'not', 'yet', '10x10', `${meta.id}.board.json`)).isFile)
  } finally {
    await stop(child, port)
    Deno.removeSync(scratch, { recursive: true })
  }
})

// Told to end, and ended outright. Windows has only the second: a process ended there is not told.
const ways: Deno.Signal[] = windows ? ['SIGKILL'] : ['SIGTERM', 'SIGKILL']
for (const way of ways) {
  Deno.test(`a launcher ended by ${way} takes the server it started with it`, async () => {
    const scratch = Deno.makeTempDirSync({ prefix: 'arrowz-start-' })
    const port = freePort()
    const child = start(scratch, port, 'boards')
    let servers: number[] = []
    try {
      assert(await settles(port, true, 30_000), 'the store never answered')
      servers = startedBy(child.pid)
      child.kill(way)
      await child.status
      assert(await settles(port, false, 5_000), 'the server outlived its launcher')
    } finally {
      await stop(child, port, servers)
      Deno.removeSync(scratch, { recursive: true })
    }
  })
}

Deno.test('a server started on its own, with no input, keeps serving', async () => {
  const scratch = Deno.realPathSync(Deno.makeTempDirSync({ prefix: 'arrowz-start-' }))
  const port = freePort()
  const server = new Deno.Command(Deno.execPath(), {
    args: serverArgs(port, scratch).filter((arg) => arg !== '--until-input-ends'),
    cwd: here,
    env: { ARROWZ_BOARDS_DIR: scratch },
    stdin: 'null',
    stdout: 'null',
    stderr: 'null',
  }).spawn()
  try {
    assert(await settles(port, true, 30_000), 'the store never answered')
    // An input that is not there ends at once: a second is long for a server that ends with it.
    await new Promise((done) => setTimeout(done, 1_000))
    assert(await answers(port), 'the server ended with its input, unasked')
  } finally {
    end(server.pid)
    await server.status
    Deno.removeSync(scratch, { recursive: true })
  }
})
