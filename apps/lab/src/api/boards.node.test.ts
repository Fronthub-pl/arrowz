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
      '--allow-read',
      `--allow-write=${boardsDir}`,
      '--allow-env=ARROWZ_BOARDS_DIR',
      'packages/cli/lab-server.ts',
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
  if (!up) throw new Error(`the lab server never answered on ${STORE_ORIGIN}`)

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

// The whole point of the task. The server refuses a write whose Origin is not
// its own (lab-server.ts:76-77); this proves the proxy leaves the pair
// consistent, and it is what would go red if changeOrigin were ever added.
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
  expect(meta.id).toMatch(/^seed3-[0-9a-f]{8}$/)
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

// PR 5 reads the stored files from /boards/, so the proxy covers that path.
test('the stored board file is reachable through the proxy', async () => {
  const sizes = (await (await fetch(`${VITE_ORIGIN}/api/boards`)).json()) as { boards: { id: string }[] }[]
  const id = sizes[0]?.boards[0]?.id
  const r = await fetch(`${VITE_ORIGIN}/boards/12x12/${id}.board.json`)
  expect(r.status).toBe(200)
})

// The SPA owns /boards; only /boards/ is the store's. A prefix key without the
// slash would proxy the Saved boards route itself, and a reload or a deep link
// would land on the store's 404 instead of the application.
test('the /boards route itself is not proxied', async () => {
  const r = await fetch(`${VITE_ORIGIN}/boards`)
  expect(r.status).toBe(200)
  expect(r.headers.get('content-type')).toMatch(/text\/html/)
})
