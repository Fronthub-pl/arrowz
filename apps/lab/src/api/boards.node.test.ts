/// <reference types="node" />
import { defaultParams, encodeBoard, generate } from '@arrowz/engine'
import { DEFAULT_VIEW, storeRequest } from '@arrowz/engine/command'
import { spawn, type ChildProcess } from 'node:child_process'
import { mkdtempSync, rmSync } from 'node:fs'
import { tmpdir } from 'node:os'
import { join } from 'node:path'
import { fileURLToPath } from 'node:url'
import { createServer, type ViteDevServer } from 'vite'
import { afterAll, beforeAll, expect, test } from 'vitest'
import { labProxy } from '../../vite.proxy'
import { deleteBoard, listBoards, readStoredBoard, saveBoard } from './boards'

const STORE_PORT = 8790
const VITE_PORT = 8791
const STORE_ORIGIN = `http://127.0.0.1:${STORE_PORT}`
const VITE_ORIGIN = `http://127.0.0.1:${VITE_PORT}`
const REPO = fileURLToPath(new URL('../../../..', import.meta.url))
const APP = fileURLToPath(new URL('../..', import.meta.url))

let store: ChildProcess
let vite: ViteDevServer
let boardsDir: string

beforeAll(async () => {
  boardsDir = mkdtempSync(join(tmpdir(), 'arrowz-lab-'))
  store = spawn(
    'deno',
    [
      'run',
      `--allow-net=127.0.0.1:${STORE_PORT}`,
      // The grant `store.sh` gives, so that this test is what holds it: Deno
      // loads local modules and its own cache without a read grant, and every
      // run-time read the server makes is inside the store.
      `--allow-read=${boardsDir}`,
      `--allow-write=${boardsDir}`,
      '--allow-env=ARROWZ_BOARDS_DIR',
      'packages/cli/store-server.ts',
      String(STORE_PORT),
    ],
    { cwd: REPO, env: { ...process.env, ARROWZ_BOARDS_DIR: boardsDir } },
  )
  // ENOENT on `deno` must fail this hook, not surface as an uncaught error.
  store.on('error', (err) => {
    throw err
  })

  let up = false
  for (let i = 0; i < 100 && !up; i++) {
    try {
      const r = await fetch(`${STORE_ORIGIN}/api/boards`)
      await r.body?.cancel()
      up = r.ok
    } catch {
      await new Promise((done) => setTimeout(done, 100))
    }
  }
  if (!up) throw new Error(`the store server never answered on ${STORE_ORIGIN}`)

  vite = await createServer({
    root: APP,
    configFile: false,
    // host: Vite binds `localhost`, which Node 24 resolves to ::1 here, and
    // every fetch to 127.0.0.1 would be refused. strictPort: a silently
    // shifted port would make VITE_ORIGIN a lie.
    server: { host: '127.0.0.1', port: VITE_PORT, strictPort: true, proxy: labProxy(STORE_ORIGIN) },
  })
  await vite.listen()
})

afterAll(async () => {
  await vite?.close()
  store?.kill()
  rmSync(boardsDir, { recursive: true, force: true })
})

test('a GET through the proxy reaches the store', async () => {
  const r = await fetch(`${VITE_ORIGIN}/api/boards`)
  expect(r.status).toBe(200)
  expect(await r.json()).toEqual([])
})

// The store server's `refusal` rejects a write whose Origin is not its own;
// this goes red if the proxy ever gains `changeOrigin`.
test('a POST through the proxy is accepted, Origin and all', async () => {
  const params = { ...defaultParams(), W: 12, H: 12, seed: 3 }
  const result = generate(params)
  const body = storeRequest(encodeBoard(result.board), params, DEFAULT_VIEW, 'lab')

  const r = await fetch(`${VITE_ORIGIN}/api/boards`, {
    method: 'POST',
    headers: { 'Content-Type': 'application/json', Origin: VITE_ORIGIN },
    body: JSON.stringify(body),
  })

  expect(r.status).toBe(201)
  const meta = (await r.json()) as { id: string }
  expect(meta.id).toMatch(/^sha256-[0-9a-f]{64}$/)
})

test('the saved board comes back in the listing', async () => {
  const sizes = (await (await fetch(`${VITE_ORIGIN}/api/boards`)).json()) as {
    size: string
    boards: { id: string }[]
  }[]
  expect(sizes).toHaveLength(1)
  expect(sizes[0]?.size).toBe('12x12')
  expect(sizes[0]?.boards).toHaveLength(1)
})

// The library reads stored files from /store/, so the proxy covers that path.
test('the stored board file is reachable through the proxy', async () => {
  const sizes = (await (await fetch(`${VITE_ORIGIN}/api/boards`)).json()) as { boards: { id: string }[] }[]
  const id = sizes[0]?.boards[0]?.id
  const r = await fetch(`${VITE_ORIGIN}/store/12x12/${id}.board.json`)
  expect(r.status).toBe(200)
  await r.body?.cancel()
})

// /boards is the application's own route, all the way down: a board's address
// is /boards/<size>/<id>, and the store must not answer it. No proxy key
// begins with /boards, so both the tab and a board's address reach the SPA.
test('the library route and a board address are not proxied', async () => {
  for (const path of ['/boards', '/boards/12x12/sha256-0']) {
    const r = await fetch(VITE_ORIGIN + path)
    expect(r.status).toBe(200)
    expect(r.headers.get('content-type')).toMatch(/text\/html/)
    await r.body?.cancel()
  }
})

// Nothing listens here.
const DEAD_ORIGIN = 'http://127.0.0.1:8792'

// An unreachable store must resolve, not reject, and say it failed. Node cannot
// resolve `listBoards`'s relative path, so the stub supplies only the origin:
// the rejection under test is a real ECONNREFUSED from a real socket.
test('listBoards reports failure when the store is unreachable', async () => {
  const original = globalThis.fetch
  globalThis.fetch = (...args: Parameters<typeof fetch>) => original(new URL(String(args[0]), DEAD_ORIGIN), args[1])
  try {
    const outcome = await listBoards()
    expect(outcome.ok).toBe(false)
  } finally {
    globalThis.fetch = original
  }
})

test('listBoards answers with the sizes when the store is up', async () => {
  const original = globalThis.fetch
  globalThis.fetch = (...args: Parameters<typeof fetch>) => original(new URL(String(args[0]), VITE_ORIGIN), args[1])
  try {
    const outcome = await listBoards()
    expect(outcome.ok).toBe(true)
    if (outcome.ok) expect(outcome.sizes[0]?.size).toBe('12x12')
  } finally {
    globalThis.fetch = original
  }
})

// What the preview reads, handed on as `unknown` for `decodeBoard` to judge.
test('readStoredBoard fetches a stored file, and reports a missing one', async () => {
  const original = globalThis.fetch
  globalThis.fetch = (...args: Parameters<typeof fetch>) => original(new URL(String(args[0]), VITE_ORIGIN), args[1])
  try {
    const list = await listBoards()
    const id = list.ok ? list.sizes[0]?.boards[0]?.id : undefined
    if (id === undefined) throw new Error('the store has no board to read')
    const found = await readStoredBoard('12x12', id)
    expect(found.ok).toBe(true)

    const missing = await readStoredBoard('12x12', 'sha256-0')
    expect(missing.ok).toBe(false)
    if (!missing.ok) expect(missing.error).toContain('404')
  } finally {
    globalThis.fetch = original
  }
})

// The board lives in a size of its own, so the counts asserted above stay true.
test('deleteBoard removes a board, and a second delete says it was not there', async () => {
  const original = globalThis.fetch
  globalThis.fetch = (...args: Parameters<typeof fetch>) => original(new URL(String(args[0]), VITE_ORIGIN), args[1])
  try {
    const params = { ...defaultParams(), W: 16, H: 16, seed: 5 }
    const made = generate(params)
    const saved = await saveBoard(storeRequest(encodeBoard(made.board), params, DEFAULT_VIEW, 'lab'))
    if (!saved.ok) throw new Error(`the store refused the board this case needs: ${saved.error}`)

    expect(await deleteBoard('16x16', saved.meta.id)).toEqual({ ok: true, deleted: true })
    // The second press is not an error: a 404 means it is gone.
    expect(await deleteBoard('16x16', saved.meta.id)).toEqual({ ok: true, deleted: false })

    const list = await listBoards()
    expect(list.ok && list.sizes.some((entry) => entry.size === '16x16')).toBe(false)
  } finally {
    globalThis.fetch = original
  }
})
