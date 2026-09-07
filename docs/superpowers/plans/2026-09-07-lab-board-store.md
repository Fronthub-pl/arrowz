# Live command, board store and bilingual lab — implementation plan

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:subagent-driven-development (recommended) or superpowers:executing-plans to implement this plan task-by-task. Steps use checkbox (`- [ ]`) syntax for tracking.

**Goal:** The lab shows the canonical `carve.mjs` command before generating, every board (lab and CLI) lands in `prototype/boards/` with its command, a lab tab browses the store by size, and the lab UI is switchable between Polish and English.

**Architecture:** A shared pure module `command.mjs` (command text, flag parser, board id) imported by both the browser and Node. `store.mjs` writes and lists the store, `lab-server.mjs` (Node, no dependencies) serves static files plus two API endpoints. `carve.mjs` moves to the same parser and `generate()` as the lab worker, so the command reproduces the board byte for byte. `lab-i18n.mjs` holds both UI dictionaries; English texts in `PARAM_SPEC` are the source, Polish is the translation.

**Tech Stack:** Node 24 (ESM, `node:test`, `node:http`, `node:fs`), plain HTML/JS in `lab.html`, Web Worker.

**Spec:** `docs/superpowers/specs/2026-09-07-lab-board-store-design.md`

## Global Constraints

- Everything in the repository is English (see `CLAUDE.md`): code, comments, tests, docs, branch names, commit messages. Polish appears only inside `prototype/lab-i18n.mjs`.
- The prototype is throwaway code: no npm dependencies, no bundler, ESM loaded directly by the browser.
- The engine `engine.mjs` knows neither `process` nor DOM; `command.mjs` and `lab-i18n.mjs` must not use `fs`/DOM either (the browser loads them).
- Never spread arrays proportional to the number of cells (`Math.min(...arr)`) — stack overflow in the worker.
- `node --test 'prototype/*.test.mjs'` must pass after every task.
- No attribution lines in commit messages.

---

## File structure

| file | responsibility |
|---|---|
| `CLAUDE.md` (new) | repository rules: language, prototype constraints |
| `prototype/command.mjs` (new) | `buildCommand`, `parseArgs`, `boardId`, `ALIASES`, `DEFAULT_VIEW` — pure JS |
| `prototype/command.test.mjs` (new) | command ↔ params round trip, aliases, id stability |
| `prototype/store.mjs` (new) | `boardsDir`, `saveBoard`, `listBoards` — Node `fs` |
| `prototype/store.test.mjs` (new) | save, list, order, overwrite, junk |
| `prototype/lab-server.mjs` (new) | `createLabServer()` + direct run; static files, `/api/boards` |
| `prototype/lab-server.test.mjs` (new) | POST/GET API, static SVG, path protection |
| `prototype/carve.mjs` (change) | parser from `command.mjs`, `--svg` mode on `generate()` + `saveBoard` |
| `prototype/carve.test.mjs` (new) | `carve.mjs --svg` matches `generate()` byte for byte |
| `prototype/lab-i18n.mjs` (new, started by translation) | `EN`, `PL` dictionaries |
| `prototype/lab-i18n.test.mjs` (new) | dictionary completeness |
| `prototype/lab.sh` (change) | starts `lab-server.mjs` instead of Python |
| `prototype/lab.html` (change) | English source, language switch, live command, save after generation, store tab |
| `prototype/preview.sh`, `prototype/preview/` (delete) | gallery replaced by the store |
| `.gitignore`, `prototype/README.md` | housekeeping and docs |

---

### Task 0: Translate the existing prototype and documents, add `CLAUDE.md`

**Files:**
- Create: `CLAUDE.md`
- Modify (translation in place): `prototype/engine.mjs`, `prototype/carve.mjs`, `prototype/lab-worker.mjs`, `prototype/engine.test.mjs`, `prototype/lab.sh`, `prototype/preview.sh`, `prototype/README.md`, `docs/superpowers/specs/2026-09-07-arrowz-design.md`, `docs/superpowers/plans/2026-09-07-arrowz-implementation.md`, `docs/superpowers/plans/2026-09-07-arrowz/*.md` (renamed to English names)
- Create: `prototype/lab-i18n.mjs` (Polish `params`, `groups`, `reasons`; `ui` filled in Task 7)

**Interfaces:**
- Produces: `PARAM_SPEC` with English `label`/`help`, English `group` ids (`board`, `lengths`, `shape`, `difficulty`, `skeleton`, `closing`), `inactive(p)` returning reason keys; `export const INACTIVE_REASONS = { key: 'English reason', … }` in `engine.mjs`; `PL.params`, `PL.groups`, `PL.reasons` in `lab-i18n.mjs`.

- [ ] **Step 1: Translation** — done by parallel agents (comments, strings, docs). Verify:

Run: `grep -rlP '[ąćęłńóśźżĄĆĘŁŃÓŚŹŻ]' prototype docs CLAUDE.md | grep -v lab-i18n.mjs | grep -v lab.html`
Expected: no output (lab.html is translated in Task 7).

Run: `node --test prototype/engine.test.mjs`
Expected: 10 tests PASS.

- [ ] **Step 2: Commit**

```bash
git add -A
git commit -m "Translate prototype and design documents to English; add repository rules"
```

---

### Task 1: `command.mjs` — command text, parser, board id

**Files:**
- Create: `prototype/command.mjs`
- Test: `prototype/command.test.mjs`

**Interfaces:**
- Consumes: `PARAM_SPEC`, `defaultParams` from `./engine.mjs`.
- Produces:
  - `buildCommand(params, view?) : string`
  - `parseArgs(argv: string[]) : { params, view: {cell, stroke, colored, top}, rest: string[] }`
  - `boardId(params) : string` of the form `seed<seed>-<8 hex>`
  - `ALIASES : Record<string,string>`, `DEFAULT_VIEW = { cell: 12, stroke: 0.5, colored: false, top: 0 }`

- [ ] **Step 1: Write the failing test**

```js
// prototype/command.test.mjs
// The lab must mirror the CLI 1:1, so the command text has to parse back
// into the same parameters.
import { test } from 'node:test'
import assert from 'node:assert/strict'
import { buildCommand, parseArgs, boardId, DEFAULT_VIEW } from './command.mjs'
import { defaultParams, PARAM_SPEC } from './engine.mjs'

const argvOf = (cmd) => cmd.split(' ').slice(2)   // drop "node prototype/carve.mjs"

test('buildCommand: default params give only size, seed, --svg and --cell', () => {
  const p = { ...defaultParams(), W: 25, H: 50, seed: 7 }
  assert.equal(buildCommand(p), 'node prototype/carve.mjs --svg --w=25 --h=50 --seed=7 --cell=12')
})

test('buildCommand ↔ parseArgs: round trip for changed knobs and view', () => {
  const p = { ...defaultParams(), W: 100, H: 200, seed: 42, anticoil: 3, giants: 4, headBias: -1, wShort: 0.5 }
  const v = { cell: 8, stroke: 0.4, colored: true, top: 5 }
  const cmd = buildCommand(p, v)
  assert.match(cmd, /--anticoil=3 /)
  assert.match(cmd, /--headbias=-1 /)
  assert.match(cmd, / --stroke=0.4 --colored --top=5$/)
  const back = parseArgs(argvOf(cmd))
  for (const s of PARAM_SPEC) assert.equal(back.params[s.key], p[s.key], s.key)
  assert.deepEqual(back.view, v)
  assert.deepEqual(back.rest, ['--svg'])
})

test('parseArgs: old flag names are aliases, unknown flags go to rest', () => {
  const r = parseArgs(['--straight=0.6', '--lateral=6', '--absorb=0', '--giantspacepen=12', '--runs=3', '--show'])
  assert.equal(r.params.pStraight, 0.6)
  assert.equal(r.params.wLateral, 6)
  assert.equal(r.params.absorbLimit, 0)
  assert.equal(r.params.giantSpacePenalty, 12)
  assert.deepEqual(r.rest, ['--runs=3', '--show'])
  assert.deepEqual(r.view, DEFAULT_VIEW)
})

test('boardId: stable, ignores view and key order, distinguishes seeds', () => {
  const p = { ...defaultParams(), W: 25, H: 50, seed: 7 }
  const id = boardId(p)
  assert.match(id, /^seed7-[0-9a-f]{8}$/)
  const reordered = Object.fromEntries(Object.entries(p).reverse())
  assert.equal(boardId(reordered), id)
  assert.equal(boardId({ ...p, cell: 99, colored: true }), id)
  assert.notEqual(boardId({ ...p, seed: 8 }), id)
  assert.notEqual(boardId({ ...p, anticoil: 1 }), id)
})
```

- [ ] **Step 2: Run, confirm it fails**

Run: `node --test prototype/command.test.mjs`
Expected: FAIL — `Cannot find module './command.mjs'`

- [ ] **Step 3: Implementation**

```js
// prototype/command.mjs
// Shared command text and board id for the lab (browser) and carve.mjs
// (Node). Pure JS: no fs, no DOM.
//
// The command is the canonical way to invoke carve.mjs: flag = PARAM_SPEC key
// in lower case, defaults from the engine. The lab has to mirror the CLI 1:1,
// so both sides build and read the text with this code.
import { PARAM_SPEC, defaultParams } from './engine.mjs'

// Old flag names from rounds 1–7; README examples must keep working.
export const ALIASES = {
  straight: 'pStraight', lateral: 'wLateral', absorb: 'absorbLimit', giantspacepen: 'giantSpacePenalty',
}

const KEY_BY_FLAG = new Map(PARAM_SPEC.map((s) => [s.key.toLowerCase(), s.key]))
for (const [alias, key] of Object.entries(ALIASES)) KEY_BY_FLAG.set(alias, key)

export const DEFAULT_VIEW = { cell: 12, stroke: 0.5, colored: false, top: 0 }

/** Command text reproducing the board for the given parameters and view. */
export function buildCommand(params, view = {}) {
  const v = { ...DEFAULT_VIEW, ...view }
  const parts = ['node prototype/carve.mjs --svg', `--w=${params.W}`, `--h=${params.H}`, `--seed=${params.seed}`]
  for (const s of PARAM_SPEC) {
    if (s.key === 'W' || s.key === 'H' || s.key === 'seed') continue
    if (params[s.key] !== undefined && params[s.key] !== s.def) parts.push(`--${s.key.toLowerCase()}=${params[s.key]}`)
  }
  parts.push(`--cell=${v.cell}`)
  if (v.stroke !== DEFAULT_VIEW.stroke) parts.push(`--stroke=${v.stroke}`)
  if (v.colored) parts.push('--colored')
  if (v.top > 0) parts.push(`--top=${v.top}`)
  return parts.join(' ')
}

/**
 * Splits argv into engine parameters (full set with defaults), view options
 * and the rest — mode flags (--svg, --runs, --bench…) read by carve.mjs.
 */
export function parseArgs(argv) {
  const params = defaultParams()
  const view = { ...DEFAULT_VIEW }
  const rest = []
  for (const a of argv) {
    if (!a.startsWith('--')) { rest.push(a); continue }
    const eq = a.indexOf('=')
    const name = (eq < 0 ? a.slice(2) : a.slice(2, eq)).toLowerCase()
    const raw = eq < 0 ? null : a.slice(eq + 1)
    const key = KEY_BY_FLAG.get(name)
    if (key) { params[key] = Number(raw); continue }
    if (name === 'cell' || name === 'stroke' || name === 'top') { view[name] = Number(raw); continue }
    if (name === 'colored') { view.colored = true; continue }
    rest.push(a)
  }
  return { params, view, rest }
}

/**
 * Board id: seed plus a hash of the engine parameters. View options are not
 * included — the same board in colour overwrites the same slot. The same
 * command in the browser and in Node therefore lands in the same file, which
 * doubles as a determinism check of both runtimes.
 */
export function boardId(params) {
  const subset = {}
  for (const s of PARAM_SPEC) subset[s.key] = params[s.key]
  return `seed${params.seed}-${fnv1a(JSON.stringify(subset))}`
}

function fnv1a(str) {
  let h = 0x811c9dc5
  for (let i = 0; i < str.length; i++) {
    h ^= str.charCodeAt(i)
    h = Math.imul(h, 0x01000193) >>> 0
  }
  return h.toString(16).padStart(8, '0')
}
```

- [ ] **Step 4: Run the tests**

Run: `node --test prototype/command.test.mjs`
Expected: 4 tests PASS

- [ ] **Step 5: Commit**

```bash
git add prototype/command.mjs prototype/command.test.mjs
git commit -m "Add shared CLI command builder, parser and board id"
```

---

### Task 2: `store.mjs` — board store on disk

**Files:**
- Create: `prototype/store.mjs`
- Test: `prototype/store.test.mjs`

**Interfaces:**
- Consumes: `boardId` from `./command.mjs`.
- Produces:
  - `boardsDir() : string` — `ARROWZ_BOARDS_DIR` or `prototype/boards`
  - `saveBoard({ svg, params, view, command, metrics?, source }) : meta`
  - `listBoards() : [{ size, W, H, cells, boards: meta[] }]`
  - meta: `{ id, W, H, seed, params, view, command, source, createdAt, ok, pieces, maxLen, genMs, svgBytes }`

- [ ] **Step 1: Write the failing test**

```js
// prototype/store.test.mjs
import { test, beforeEach } from 'node:test'
import assert from 'node:assert/strict'
import { mkdtempSync, mkdirSync, writeFileSync, readFileSync, existsSync } from 'node:fs'
import { tmpdir } from 'node:os'
import { join } from 'node:path'
import { defaultParams } from './engine.mjs'

let dir
beforeEach(() => {
  dir = mkdtempSync(join(tmpdir(), 'arrowz-boards-'))
  process.env.ARROWZ_BOARDS_DIR = dir
})

const params = (over) => ({ ...defaultParams(), W: 25, H: 50, seed: 7, ...over })
const entry = (over = {}) => ({
  svg: '<svg/>', params: params(over.params), view: { cell: 12, stroke: 0.5, colored: false, top: 0 },
  command: 'node prototype/carve.mjs --svg --w=25 --h=50 --seed=7 --cell=12', source: 'cli',
  metrics: { ok: true, pieces: 126, maxLen: 68, genMs: 12 }, ...over,
})

test('saveBoard writes SVG and meta into the size directory', async () => {
  const { saveBoard } = await import('./store.mjs')
  const meta = saveBoard(entry())
  assert.match(meta.id, /^seed7-/)
  assert.equal(readFileSync(join(dir, '25x50', meta.id + '.svg'), 'utf8'), '<svg/>')
  const saved = JSON.parse(readFileSync(join(dir, '25x50', meta.id + '.json'), 'utf8'))
  assert.equal(saved.pieces, 126)
  assert.equal(saved.source, 'cli')
  assert.equal(saved.svgBytes, 6)
  assert.ok(saved.createdAt)
})

test('listBoards: sizes ascending by cells, boards newest first, same id overwrites', async () => {
  const { saveBoard, listBoards } = await import('./store.mjs')
  saveBoard(entry({ params: { W: 100, H: 100, seed: 1 } }))
  const first = saveBoard(entry({ params: { seed: 1 } }))
  await new Promise((r) => setTimeout(r, 5))
  saveBoard(entry({ params: { seed: 2 } }))
  await new Promise((r) => setTimeout(r, 5))
  saveBoard(entry({ svg: '<svg>2</svg>', params: { seed: 1 } }))   // same id — overwrite
  const sizes = listBoards()
  assert.deepEqual(sizes.map((s) => s.size), ['25x50', '100x100'])
  assert.equal(sizes[0].boards.length, 2)
  assert.equal(sizes[0].boards[0].seed, 1, 'overwritten entry is the newest')
  assert.equal(readFileSync(join(dir, '25x50', first.id + '.svg'), 'utf8'), '<svg>2</svg>')
})

test('listBoards skips junk: foreign directories, json without svg, broken json', async () => {
  const { saveBoard, listBoards } = await import('./store.mjs')
  mkdirSync(join(dir, 'notes'))
  mkdirSync(join(dir, '10x10'))
  writeFileSync(join(dir, '10x10', 'seed1-deadbeef.json'), '{"id":"seed1-deadbeef"}')   // no svg
  mkdirSync(join(dir, '25x50'))
  writeFileSync(join(dir, '25x50', 'broken.json'), '{not json')
  writeFileSync(join(dir, '25x50', 'broken.svg'), '<svg/>')
  saveBoard(entry())
  const sizes = listBoards()
  assert.deepEqual(sizes.map((s) => s.size), ['25x50'])
  assert.equal(sizes[0].boards.length, 1)
})

test('listBoards without a directory returns an empty list', async () => {
  process.env.ARROWZ_BOARDS_DIR = join(dir, 'missing')
  const { listBoards } = await import('./store.mjs')
  assert.ok(!existsSync(process.env.ARROWZ_BOARDS_DIR))
  assert.deepEqual(listBoards(), [])
})
```

- [ ] **Step 2: Run, confirm it fails**

Run: `node --test prototype/store.test.mjs`
Expected: FAIL — `Cannot find module './store.mjs'`

- [ ] **Step 3: Implementation**

```js
// prototype/store.mjs
// Store of generated boards: prototype/boards/<W>x<H>/<id>.svg + <id>.json.
// Shared by the CLI (carve.mjs --svg) and the lab server. The directory is
// gitignored — a 1000×1000 board is tens of MB, and the command in the meta
// reproduces any board.
import { mkdirSync, writeFileSync, readdirSync, readFileSync, statSync, existsSync } from 'node:fs'
import { join, dirname } from 'node:path'
import { fileURLToPath } from 'node:url'
import { boardId } from './command.mjs'

export function boardsDir() {
  return process.env.ARROWZ_BOARDS_DIR || join(dirname(fileURLToPath(import.meta.url)), 'boards')
}

export function saveBoard({ svg, params, view, command, metrics = {}, source }) {
  const id = boardId(params)
  const size = `${params.W}x${params.H}`
  const dir = join(boardsDir(), size)
  mkdirSync(dir, { recursive: true })
  const meta = {
    id, W: params.W, H: params.H, seed: params.seed, params, view, command, source,
    createdAt: new Date().toISOString(),
    ok: metrics.ok ?? null, pieces: metrics.pieces ?? null, maxLen: metrics.maxLen ?? null,
    genMs: metrics.genMs ?? null, svgBytes: Buffer.byteLength(svg),
  }
  writeFileSync(join(dir, `${id}.svg`), svg)
  writeFileSync(join(dir, `${id}.json`), JSON.stringify(meta, null, 2))
  return meta
}

/** Sizes ascending by cell count, boards newest first within a size. */
export function listBoards() {
  const root = boardsDir()
  if (!existsSync(root)) return []
  const sizes = []
  for (const name of readdirSync(root)) {
    const m = /^(\d+)x(\d+)$/.exec(name)
    if (!m) continue
    const dir = join(root, name)
    if (!statSync(dir).isDirectory()) continue
    const boards = []
    for (const f of readdirSync(dir)) {
      if (!f.endsWith('.json')) continue
      if (!existsSync(join(dir, f.slice(0, -5) + '.svg'))) continue
      try { boards.push(JSON.parse(readFileSync(join(dir, f), 'utf8'))) } catch { /* broken entry */ }
    }
    if (!boards.length) continue
    boards.sort((a, b) => (b.createdAt ?? '').localeCompare(a.createdAt ?? ''))
    const W = Number(m[1]), H = Number(m[2])
    sizes.push({ size: name, W, H, cells: W * H, boards })
  }
  sizes.sort((a, b) => a.cells - b.cells || a.W - b.W)
  return sizes
}
```

- [ ] **Step 4: Run the tests**

Run: `node --test prototype/store.test.mjs`
Expected: 4 tests PASS

- [ ] **Step 5: Commit**

```bash
git add prototype/store.mjs prototype/store.test.mjs
git commit -m "Add on-disk board store"
```

---

### Task 3: `lab-server.mjs` — Node server replacing Python

**Files:**
- Create: `prototype/lab-server.mjs`
- Modify: `prototype/lab.sh`
- Test: `prototype/lab-server.test.mjs`

**Interfaces:**
- Consumes: `saveBoard`, `listBoards`, `boardsDir` from `./store.mjs`.
- Produces: `createLabServer() : http.Server`; direct run `node prototype/lab-server.mjs [port]`.
- HTTP: `GET /api/boards` → JSON `listBoards()`; `POST /api/boards` (JSON `{svg, params, view, command, metrics, source}`) → `201` meta; `GET /boards/<size>/<id>.svg` → SVG from the store; other `GET` → files from `prototype/` with `Cache-Control: no-store`.

- [ ] **Step 1: Write the failing test**

```js
// prototype/lab-server.test.mjs
import { test, before, after } from 'node:test'
import assert from 'node:assert/strict'
import { mkdtempSync } from 'node:fs'
import { tmpdir } from 'node:os'
import { join } from 'node:path'
import { defaultParams } from './engine.mjs'

let server, base
before(async () => {
  process.env.ARROWZ_BOARDS_DIR = mkdtempSync(join(tmpdir(), 'arrowz-srv-'))
  const { createLabServer } = await import('./lab-server.mjs')
  server = createLabServer()
  await new Promise((r) => server.listen(0, '127.0.0.1', r))
  base = `http://127.0.0.1:${server.address().port}`
})
after(() => server.close())

test('POST /api/boards saves, GET lists, the SVG is served from the store', async () => {
  const body = { svg: '<svg>x</svg>', params: { ...defaultParams(), W: 25, H: 50, seed: 7 },
    view: { cell: 12, stroke: 0.5, colored: false, top: 0 }, command: 'node prototype/carve.mjs --svg --w=25 --h=50 --seed=7 --cell=12',
    metrics: { ok: true, pieces: 126, maxLen: 68, genMs: 10 }, source: 'lab' }
  const post = await fetch(base + '/api/boards', { method: 'POST', body: JSON.stringify(body) })
  assert.equal(post.status, 201)
  const meta = await post.json()
  assert.match(meta.id, /^seed7-/)
  const list = await (await fetch(base + '/api/boards')).json()
  assert.equal(list[0].size, '25x50')
  assert.equal(list[0].boards[0].id, meta.id)
  const svg = await fetch(`${base}/boards/25x50/${meta.id}.svg`)
  assert.equal(svg.headers.get('content-type'), 'image/svg+xml')
  assert.equal(await svg.text(), '<svg>x</svg>')
})

test('POST without svg gives 400', async () => {
  const r = await fetch(base + '/api/boards', { method: 'POST', body: JSON.stringify({ params: {} }) })
  assert.equal(r.status, 400)
})

test('static lab files without cache; paths escaping the directory are rejected', async () => {
  const html = await fetch(base + '/lab.html')
  assert.equal(html.status, 200)
  assert.equal(html.headers.get('cache-control'), 'no-store, must-revalidate')
  assert.equal((await fetch(base + '/')).status, 200)
  assert.equal((await fetch(base + '/missing.txt')).status, 404)
  assert.equal((await fetch(base + '/boards/..%2F..%2Fengine.mjs')).status, 403)
})
```

- [ ] **Step 2: Run, confirm it fails**

Run: `node --test prototype/lab-server.test.mjs`
Expected: FAIL — `Cannot find module './lab-server.mjs'`

- [ ] **Step 3: Implementation**

```js
// prototype/lab-server.mjs
// Lab server: static files from prototype/ without caching (an edited
// engine.mjs must reach the browser immediately) plus the board store under
// /api/boards and /boards/. Replaces the Python server from lab.sh because
// the browser has to be able to WRITE a board to disk. No dependencies.
// Run: node prototype/lab-server.mjs [port]
import { createServer } from 'node:http'
import { readFile } from 'node:fs/promises'
import { join, normalize, extname, dirname, resolve, sep } from 'node:path'
import { fileURLToPath } from 'node:url'
import { saveBoard, listBoards, boardsDir } from './store.mjs'

const ROOT = dirname(fileURLToPath(import.meta.url))
const MIME = {
  '.html': 'text/html; charset=utf-8', '.mjs': 'text/javascript', '.js': 'text/javascript',
  '.svg': 'image/svg+xml', '.json': 'application/json', '.css': 'text/css',
}

function send(res, status, body, type = 'application/json') {
  res.writeHead(status, { 'Content-Type': type, 'Cache-Control': 'no-store, must-revalidate' })
  res.end(body)
}

async function readBody(req) {
  const chunks = []
  for await (const c of req) chunks.push(c)
  return Buffer.concat(chunks).toString('utf8')
}

export function createLabServer() {
  return createServer(async (req, res) => {
    const url = new URL(req.url, 'http://localhost')
    try {
      if (url.pathname === '/api/boards' && req.method === 'GET') {
        return send(res, 200, JSON.stringify(listBoards()))
      }
      if (url.pathname === '/api/boards' && req.method === 'POST') {
        const body = JSON.parse(await readBody(req))
        if (typeof body.svg !== 'string' || !body.params) return send(res, 400, '{"error":"svg and params are required"}')
        return send(res, 201, JSON.stringify(saveBoard({ ...body, source: body.source ?? 'lab' })))
      }
      if (req.method !== 'GET') return send(res, 405, '{"error":"GET only"}')

      // The store may live outside prototype/ (ARROWZ_BOARDS_DIR), so /boards/
      // has its own base directory. The normalised path must stay inside it.
      const rel = decodeURIComponent(url.pathname === '/' ? '/lab.html' : url.pathname)
      const inBoards = rel.startsWith('/boards/')
      const baseDir = resolve(inBoards ? boardsDir() : ROOT)
      const file = normalize(join(baseDir, inBoards ? rel.slice('/boards/'.length) : rel.slice(1)))
      if (!file.startsWith(baseDir + sep)) return send(res, 403, '{"error":"outside base directory"}')
      const data = await readFile(file)
      return send(res, 200, data, MIME[extname(file)] ?? 'application/octet-stream')
    } catch (err) {
      if (err.code === 'ENOENT' || err.code === 'EISDIR') return send(res, 404, '{"error":"not found"}')
      return send(res, 500, JSON.stringify({ error: err.message }))
    }
  })
}

// Direct run (not when imported by tests).
if (process.argv[1] && resolve(process.argv[1]) === fileURLToPath(import.meta.url)) {
  const port = Number(process.argv[2] ?? 8777)
  createLabServer().listen(port, '127.0.0.1', () => {
    console.log(`Lab: http://localhost:${port}/lab.html   (Ctrl+C stops)`)
  })
}
```

New `prototype/lab.sh`:

```sh
#!/bin/sh
# Starts the generator lab at http://localhost:8777/lab.html
#
# A server is needed because ES modules do not load from file:// (CORS), and
# the lab saves generated boards to prototype/boards/ through POST /api/boards.
# The server disables caching — otherwise the browser keeps serving the old
# engine.mjs after an edit.
set -e
cd "$(dirname "$0")"
PORT=${1:-8777}
node lab-server.mjs "$PORT" &
SRV=$!
trap 'kill $SRV 2>/dev/null' EXIT INT TERM
sleep 1
open "http://localhost:$PORT/lab.html" 2>/dev/null || true
wait $SRV
```

- [ ] **Step 4: Run the tests**

Run: `node --test prototype/lab-server.test.mjs`
Expected: 3 tests PASS

- [ ] **Step 5: Check the direct run**

Run: `node prototype/lab-server.mjs 8799 & sleep 1; curl -s -o /dev/null -w '%{http_code}\n' http://localhost:8799/lab.html; kill %1`
Expected: `200`

- [ ] **Step 6: Commit**

```bash
git add prototype/lab-server.mjs prototype/lab-server.test.mjs prototype/lab.sh
git commit -m "Replace Python lab server with Node server backed by the board store"
```

---

### Task 4: `carve.mjs` on the shared parser, `--svg` mode on `generate()`

**Files:**
- Modify: `prototype/carve.mjs` (whole argument block and `--svg` mode; report and benchmark modes only where `params` is built)
- Test: `prototype/carve.test.mjs`

**Interfaces:**
- Consumes: `parseArgs`, `buildCommand` from `./command.mjs`; `saveBoard` from `./store.mjs`; `generate`, `toSvg`, `DIRS` from `./engine.mjs`.
- Produces: CLI `node prototype/carve.mjs --svg[=path] --w=W --h=H --seed=S [--<key>=v] [--cell=N] [--stroke=X] [--colored] [--top=N]`; output: `<W>x<H>/<id>.svg` in the store plus a metrics summary. Format flags `--square`, `--portrait`; preset suffixes `·sq`, `·pt`.

- [ ] **Step 1: Write the CLI-vs-engine test**

```js
// prototype/carve.test.mjs
// The lab must mirror the CLI 1:1: the command from the lab has to give the
// same board as the worker. We generate through generate() and through
// carve.mjs in a child process and compare the SVG byte for byte.
import { test } from 'node:test'
import assert from 'node:assert/strict'
import { execFileSync } from 'node:child_process'
import { mkdtempSync, readFileSync } from 'node:fs'
import { tmpdir } from 'node:os'
import { join, dirname } from 'node:path'
import { fileURLToPath } from 'node:url'
import { generate, toSvg, defaultParams } from './engine.mjs'
import { buildCommand, boardId } from './command.mjs'

const here = dirname(fileURLToPath(import.meta.url))

test('carve.mjs --svg reproduces the generate() board byte for byte', () => {
  const dir = mkdtempSync(join(tmpdir(), 'arrowz-cli-'))
  const params = { ...defaultParams(), W: 25, H: 50, seed: 7, anticoil: 3, giants: 2 }
  const view = { cell: 10, stroke: 0.5, colored: true, top: 3 }
  const expected = toSvg(generate(params).board, { cell: 10, colored: true, strokeRatio: 0.5, top: 3 })

  const cmd = buildCommand(params, view)          // "node prototype/carve.mjs --svg …"
  const argv = cmd.split(' ').slice(2)
  const out = execFileSync('node', [join(here, 'carve.mjs'), ...argv], {
    cwd: dirname(here), env: { ...process.env, ARROWZ_BOARDS_DIR: dir }, encoding: 'utf8',
  })
  const id = boardId(params)
  assert.match(out, new RegExp(`25x50/${id}\\.svg`))
  assert.equal(readFileSync(join(dir, '25x50', `${id}.svg`), 'utf8'), expected)
  const meta = JSON.parse(readFileSync(join(dir, '25x50', `${id}.json`), 'utf8'))
  assert.equal(meta.command, cmd)
  assert.equal(meta.source, 'cli')
})

test('carve.mjs --svg=path also writes a copy at the path', () => {
  const dir = mkdtempSync(join(tmpdir(), 'arrowz-cli-'))
  const copy = join(dir, 'copy.svg')
  execFileSync('node', [join(here, 'carve.mjs'), `--svg=${copy}`, '--w=10', '--h=10', '--seed=3'], {
    cwd: dirname(here), env: { ...process.env, ARROWZ_BOARDS_DIR: dir }, encoding: 'utf8',
  })
  const id = boardId({ ...defaultParams(), W: 10, H: 10, seed: 3 })
  assert.equal(readFileSync(copy, 'utf8'), readFileSync(join(dir, '10x10', `${id}.svg`), 'utf8'))
})
```

- [ ] **Step 2: Run, confirm it fails**

Run: `node --test prototype/carve.test.mjs`
Expected: FAIL — the old `--svg` mode yields a different board (other defaults) and does not save to the store.

- [ ] **Step 3: Rewrite the header and the `--svg` mode in `carve.mjs`**

Replace the imports and everything from `const arg = …` to the `process.exit(0)` closing the `if (svgOut)` block:

```js
// THROWAWAY PROTOTYPE — CLI layer over the engine in engine.mjs.
// Run: node prototype/carve.mjs [options]
//
// Engine parameters: --<PARAM_SPEC key in lower case>=value, defaults from
// defaultParams(). The lab builds its command with the same parser, so the
// command from the lab reproduces the board bit for bit. Modes:
//   --svg[=path]    one board → prototype/boards/ (+ a copy at path)
//   --bench=N       benchmark, N runs per level
//   (no mode)       metrics report per level, --runs=N, --only=Name, --show
import { writeFileSync } from 'node:fs'
import { generate, toSvg, DIRS, Carver, analyse, mulberry32, render } from './engine.mjs'
import { parseArgs, buildCommand } from './command.mjs'
import { saveBoard } from './store.mjs'

// Trace and debug enter the engine as functions — the engine knows no `process`.
const trace = process.env.CARVE_TRACE
  ? (i) => console.error(`    [trace] pieces ${i.pieces}, remaining ${i.remaining}, backtracks ${i.backtracks}, ${i.ms.toFixed(0)} ms`)
  : null
const debug = process.env.GIANT_DEBUG ? (msg) => console.error(msg) : null

const { params: cli, view, rest } = parseArgs(process.argv.slice(2))
// Mode flags (not engine parameters) — read from what is left after the parser.
const arg = (k, dflt) => {
  const hit = rest.find((a) => a.startsWith(`--${k}=`))
  return hit ? Number(hit.split('=')[1]) : dflt
}
const has = (flag) => rest.includes(`--${flag}`)

// --- one board into the store --------------------------------------------
const svgFlag = rest.find((a) => a === '--svg' || a.startsWith('--svg='))
if (svgFlag) {
  const svgOut = svgFlag.includes('=') ? svgFlag.slice('--svg='.length) : null
  const result = generate({ ...cli, trace, debug })
  if (!result.ok) {
    console.error(`failed to close board ${cli.W}x${cli.H} (seed ${cli.seed}): ${result.stuck.remaining} cells left`)
    process.exit(1)
  }
  const c = result.board, m = result.metrics, W = cli.W, H = cli.H
  const svg = toSvg(c, { cell: view.cell, colored: view.colored, strokeRatio: view.stroke, top: view.top })
  const meta = saveBoard({
    svg, params: cli, view, command: buildCommand(cli, view), source: 'cli',
    metrics: { ok: result.ok, pieces: c.pieces.length, maxLen: m.maxLen, genMs: result.genMs },
  })
  if (svgOut) writeFileSync(svgOut, svg)
  if (view.top > 0) {
    // Longest-piece stats: the span (how many columns and rows it crosses)
    // tells whether a piece crosses the board or coils in one region.
    const longest = [...c.pieces].sort((a, b) => b.cells.length - a.cells.length).slice(0, view.top)
    console.log(`  ${view.top} longest pieces:`)
    for (const pc of longest) {
      let minX = Infinity, maxX = -Infinity, minY = Infinity, maxY = -Infinity
      const cols = new Set(), rows = new Set()
      for (const q of pc.cells) {
        if (q.x < minX) minX = q.x
        if (q.x > maxX) maxX = q.x
        if (q.y < minY) minY = q.y
        if (q.y > maxY) maxY = q.y
        cols.add(q.x); rows.add(q.y)
      }
      const spanX = maxX - minX + 1, spanY = maxY - minY + 1
      const own = new Set(pc.cells.map((q) => q.y * W + q.x))
      let coiled = 0, bends = 0, prev = null
      for (let i = 0; i < pc.cells.length; i++) {
        const q = pc.cells[i]
        let n = 0
        for (const { dx, dy } of DIRS) {
          const ax = q.x + dx, ay = q.y + dy
          if (ax >= 0 && ay >= 0 && ax < W && ay < H && own.has(ay * W + ax)) n++
        }
        if (n >= 3) coiled++
        if (i > 0) {
          const dx = q.x - pc.cells[i - 1].x, dy = q.y - pc.cells[i - 1].y
          if (prev && (dx !== prev.dx || dy !== prev.dy)) bends++
          prev = { dx, dy }
        }
      }
      const fill = pc.cells.length / (spanX * spanY)
      console.log(`    len ${String(pc.cells.length).padStart(4)}  bbox ${String(spanX).padStart(3)}x${String(spanY).padStart(3)} (${(100 * spanX / W).toFixed(0)}% x ${(100 * spanY / H).toFixed(0)}% of board)  cols ${String(cols.size).padStart(3)}  rows ${String(rows.size).padStart(3)}  bbox density ${(100 * fill).toFixed(0)}%  bends ${bends}  coiling ${(100 * coiled / pc.cells.length).toFixed(0)}%`)
    }
  }
  console.log(`${meta.W}x${meta.H}/${meta.id}.svg${svgOut ? '  + ' + svgOut : ''}  pieces=${m.N} avgLen=${(W * H / m.N).toFixed(1)} maxLen=${m.maxLen} bends=${m.bends.toFixed(2)} coiling=${(100 * m.coil).toFixed(0)}% backtracks=${result.backtracks} restarts=${result.restartsUsed} ${(result.genMs / 1000).toFixed(2)} s`)
  process.exit(0)
}
```

Note: the former `Math.max(...xs)` is replaced by a loop — array-spread gotcha.

- [ ] **Step 4: Adapt report and benchmark modes**

Presets set only the size; `Lmax`, `wShort`, `wMid` leave the preset (engine defaults, `Lmax` 0 = automatic):

```js
const BASE = [['Easy', 25], ['Medium', 50], ['Hard', 75], ['Nightmare', 100], ['Extreme', 200]]
if (has('insane')) BASE.push(['Insane', 1000])
const midArg = arg('mid', 0)
if (midArg) BASE.push(['Mid', midArg])
const FORMATS = has('square') ? [['', 1]] : has('portrait') ? [['', 2]] : [['·sq', 1], ['·pt', 2]]
const presets = BASE.flatMap(([name, n]) => FORMATS.map(([sfx, r]) => ({ name: name + sfx, W: n, H: n * r })))

const runs = arg('runs', 3)
const only = rest.find((a) => a.startsWith('--only='))?.split('=')[1]
const show = has('show')
const bench = arg('bench', 0)
```

In the benchmark and report loops replace every `const params = { ...defaultParams(), ...pre, Lmax: …, … trace, debug }` with:

```js
const params = { ...cli, W: pre.W, H: pre.H, trace, debug }
```

`analyse(c, params.ruleB)` calls stay (`ruleB` is in `defaultParams()`); `process.argv.includes('--ruleb')` goes away — rule B is the default. Replace every other `process.argv` reference in these modes with `has(...)`/`arg(...)`.

- [ ] **Step 5: Run all tests and the modes**

Run: `node --test 'prototype/*.test.mjs'`
Expected: all PASS (engine 10, command 4, store 4, server 3, carve 2)

Run: `node prototype/carve.mjs --only=Easy·sq --runs=1 | head -5 && node prototype/carve.mjs --bench=2 --only=Easy·sq | head -4`
Expected: report and benchmark print without errors.

Run: `node prototype/carve.mjs --svg --w=25 --h=50 --seed=7 --cell=12 && command ls prototype/boards/25x50`
Expected: a line `25x50/seed7-….svg  pieces=126 …` (126 pieces, as in the lab), a `.svg` + `.json` pair in the directory.

- [ ] **Step 6: Commit**

```bash
git add prototype/carve.mjs prototype/carve.test.mjs
git commit -m "Move carve.mjs to the shared parser and save boards to the store"
```

---

### Task 5: `lab.html` — English source, live command, save after generation

**Files:**
- Modify: `prototype/lab.html` (styles, side panel, `<script>`)

**Interfaces:**
- Consumes: `buildCommand` from `./command.mjs`; `POST /api/boards` from Task 3.
- Produces: element `#command` with the command text, `#copyCommand`; functions `updateCommand()`, `saveBoardToStore(svg)`; variable `saveNext`. All comments and visible strings in English (Polish returns through the dictionary in Task 7).

- [ ] **Step 1: Translate comments and visible strings of `lab.html` to English**

Every CSS/JS comment and every visible string (headings, buttons, checkbox labels, help paragraphs, `GROUP_HELP`, status messages, stats row labels, longest-table headers, preset names) becomes English. `GROUP_HELP` keys become the English group ids (`lengths`, `shape`, `difficulty`, `skeleton`, `closing`); `OPEN_BY_DEFAULT` becomes `new Set(['board', 'skeleton'])`. The `refreshActive()` function resolves reasons through `INACTIVE_REASONS[key]` (imported from the engine). `<html lang="en">`.

Run: `grep -cP '[ąćęłńóśźżĄĆĘŁŃÓŚŹŻ]' prototype/lab.html`
Expected: `0`

- [ ] **Step 2: Panel — command block instead of the block under the stats**

In `<aside>` right after `<div class="buttons">…</div>` add:

```html
  <div class="command">
    <div class="cmdhead"><span data-i18n="commandHead">CLI command (matches the current settings)</span>
      <button id="copyCommand" data-i18n="copy">Copy</button></div>
    <pre id="command"></pre>
  </div>
```

In `<main>` remove `<div class="cli" id="cli"></div>`. In the styles remove the `.cli` rule and add:

```css
  .command { margin: 0 0 .6rem; }
  .cmdhead { display: flex; justify-content: space-between; align-items: center; gap: .5rem;
             font-size: 11.5px; color: #6a6b86; margin-bottom: .25rem; }
  .cmdhead button { padding: .1rem .45rem; font-size: 11.5px; }
  #command { margin: 0; padding: .45rem .55rem; background: #eeeef5; border-radius: 5px;
             font: 11.5px/1.45 ui-monospace, SFMono-Regular, Menlo, monospace;
             white-space: pre-wrap; word-break: break-all; user-select: all; }
```

- [ ] **Step 3: Script — import, `updateCommand`, wiring**

Imports: `import { PARAM_SPEC, INACTIVE_REASONS, defaultParams } from './engine.mjs'` and `import { buildCommand } from './command.mjs'`.

After `viewOptions()` add:

```js
// --- live command ----------------------------------------------------------
// The command matches the CURRENT knobs, not the last board: the lab is a
// layer over the CLI and must show exactly what would be run.
function updateCommand() {
  $('command').textContent = buildCommand(state, viewOptions())
}
$('copyCommand').addEventListener('click', async () => {
  await navigator.clipboard.writeText($('command').textContent)
  flashCopied($('copyCommand'))
})
// Brief confirmation on a copy button; the label comes back through the dictionary.
function flashCopied(btn) {
  btn.textContent = t('copied')
  setTimeout(() => { btn.textContent = t('copy') }, 1200)
}
```

Until Task 7 defines `t()`, use a stub `const t = (k) => ({ copy: 'Copy', copied: 'Copied' })[k] ?? k` placed above.

Call `updateCommand()`:
- in `sync` (after `refreshActive()`),
- in `setParam` (after `refreshActive()`),
- in the `for (const id of ['cell', 'stroke', 'colored', 'hilite', 'top', 'voids'])` loop — instead of `redraw` wire `() => { updateCommand(); redraw() }`,
- at the end of the script after `refreshActive()`.

In `report(msg)` remove the trailing fragment that builds `flags` and sets `$('cli').textContent`.

- [ ] **Step 4: Save after generation**

Next to `let lastDone = null` add `let saveNext = false` and `let boardsCache = null`. In `run()` after `runParams = { ...state }` add `saveNext = true`. In `onWorkerMessage`, `render` branch:

```js
  if (msg.type === 'render') {
    $('board').innerHTML = msg.svg
    lastLongest = msg.longest
    renderLongest(msg.longest)
    if (saveNext && lastDone) { saveNext = false; saveBoardToStore(msg.svg) }
  }
```

(`let lastLongest = null` next to `lastDone`; Task 7 re-renders the table from it on language switch.) The worker sends `done` before `render`, so `lastDone` is already set. Save function:

```js
// The board goes to disk through the lab server — once per generation, with
// the view as rendered. A missing store server (e.g. other static hosting)
// does not break the report; it only appends a warning to the status.
async function saveBoardToStore(svg) {
  const view = viewOptions()
  const body = {
    svg, params: runParams, view: { cell: view.cell, stroke: view.stroke, colored: view.colored, top: view.top },
    command: buildCommand(runParams, view), source: 'lab',
    metrics: { ok: lastDone.ok, pieces: lastDone.pieces, maxLen: lastDone.metrics?.maxLen ?? null, genMs: lastDone.genMs },
  }
  try {
    const r = await fetch('/api/boards', { method: 'POST', body: JSON.stringify(body) })
    if (!r.ok) throw new Error(`HTTP ${r.status}`)
    const meta = await r.json()
    $('status').insertAdjacentHTML('beforeend', ` · ${t('saved')} <code>${meta.W}x${meta.H}/${meta.id}</code>`)
    boardsCache = null   // the store tab list is stale
  } catch {
    $('status').insertAdjacentHTML('beforeend', ` · <span class="bad">${t('notSaved')}</span>`)
  }
}
```

- [ ] **Step 5: Check in the browser**

Run: `sh prototype/lab.sh` (background) and open `http://localhost:8777/lab.html`.
Check: the command is in the panel right after load; changing a knob changes the command without generating; "Copy" works; after generation the status ends with "saved 25x50/seed…"; `command ls prototype/boards/25x50` shows the pair; the id equals the one from `node prototype/carve.mjs` with that command (Task 4, Step 5).

- [ ] **Step 6: Commit**

```bash
git add prototype/lab.html
git commit -m "Show the CLI command before generating and save lab boards to the store"
```

---

### Task 6: `lab.html` — "Saved boards" tab

**Files:**
- Modify: `prototype/lab.html`

**Interfaces:**
- Consumes: `GET /api/boards`, `GET /boards/<size>/<id>.svg`, `setParam`, `applyZoom`, `updateCommand`, `saveToUrl`/`loadFromUrl`, `t()`.
- Produces: tab strip `#tabs`, panel `#library`, functions `showTab(name)`, `loadLibrary()`, `renderLibrary()`, `openBoard(meta)`; state `boardsCache`, `libSize`, `libBoard`, `activeTab`.

- [ ] **Step 1: HTML and styles**

In `<main>` before `<div class="status" …>` add:

```html
  <div class="tabs" id="tabs">
    <button data-tab="lab" class="on" data-i18n="tabLab">Lab</button>
    <button data-tab="library" data-i18n="tabLibrary">Saved boards</button>
  </div>
```

At the end of `<div id="side">` add the library panel:

```html
      <div id="library" hidden>
        <div class="libhead">
          <div class="presets" id="libSizes"></div>
          <button id="libRefresh" data-i18n="refresh">Refresh</button>
        </div>
        <div id="libList"></div>
        <div id="libDetail" hidden>
          <div class="cmdhead"><span data-i18n="boardCommand">Command of this board</span>
            <button id="libCopy" data-i18n="copy">Copy</button></div>
          <pre id="libCommand"></pre>
          <div class="buttons"><button id="libLoad" data-i18n="loadIntoLab">Load into lab</button></div>
        </div>
      </div>
```

Styles:

```css
  .tabs { display: flex; gap: .3rem; margin-bottom: .2rem; }
  .tabs button { border-radius: 5px 5px 0 0; border-bottom: none; padding: .3rem .8rem; }
  .tabs button.on { background: var(--ink); color: #fff; border-color: var(--ink); }
  body.tab-library #stats, body.tab-library #topTable { display: none; }
  .libhead { display: flex; justify-content: space-between; align-items: flex-start; gap: .5rem; }
  .libhead button { padding: .2rem .45rem; font-size: 12px; }
  #libList { margin: .4rem 0 .8rem; }
  .boardrow { display: grid; grid-template-columns: 1fr auto; gap: .2rem .8rem; padding: .35rem .5rem;
              border: 1px solid var(--line); border-radius: 5px; margin-bottom: .3rem; cursor: pointer; font-size: 12px; }
  .boardrow:hover { border-color: var(--ink); }
  .boardrow.on { border-color: var(--accent); background: #fff5f8; }
  .boardrow .id { font-family: ui-monospace, SFMono-Regular, Menlo, monospace; }
  .boardrow .meta { color: #6a6b86; grid-column: 1 / -1; }
  #libCommand { margin: 0; padding: .45rem .55rem; background: #eeeef5; border-radius: 5px;
                font: 11.5px/1.45 ui-monospace, SFMono-Regular, Menlo, monospace; white-space: pre-wrap; word-break: break-all; }
```

Note: `main` has `grid-template-rows: auto auto minmax(0, 1fr)` for three children (see the CSS comment). The tab strip is a fourth child — change to `auto auto auto minmax(0, 1fr)`, otherwise the board gets a row the height of the strip again.

- [ ] **Step 2: Tabs and library script**

Add before the "state in the URL" section:

```js
// --- tabs and board store -------------------------------------------------
// The store tab uses THE SAME board area as the lab: fit, zoom and full view
// work without a separate path. Back in the lab, the worker board returns
// through `render`.
let activeTab = 'lab'
let libSize = null         // chosen size ('25x50')
let libBoard = null        // chosen board (meta)

function showTab(name) {
  activeTab = name
  document.body.classList.toggle('tab-library', name === 'library')
  for (const b of document.querySelectorAll('#tabs button')) b.classList.toggle('on', b.dataset.tab === name)
  $('library').hidden = name !== 'library'
  if (name === 'library') loadLibrary()
  else if (lastDone && worker && !busy) redraw()
  saveToUrl()
}
for (const b of document.querySelectorAll('#tabs button')) b.addEventListener('click', () => showTab(b.dataset.tab))

async function loadLibrary(force = false) {
  if (boardsCache && !force) { renderLibrary(); return }
  try {
    const r = await fetch('/api/boards')
    if (!r.ok) throw new Error(`HTTP ${r.status}`)
    boardsCache = await r.json()
  } catch {
    boardsCache = []
    $('libList').innerHTML = `<p class="grouphelp">${t('noStoreServer')}</p>`
    return
  }
  if (!boardsCache.some((s) => s.size === libSize)) libSize = boardsCache[0]?.size ?? null
  renderLibrary()
}
$('libRefresh').addEventListener('click', () => loadLibrary(true))

function renderLibrary() {
  if (!boardsCache) return
  $('libSizes').innerHTML = ''
  for (const s of boardsCache) {
    const b = document.createElement('button')
    b.textContent = `${s.size} (${s.boards.length})`
    b.classList.toggle('primary', s.size === libSize)
    b.addEventListener('click', () => { libSize = s.size; renderLibrary() })
    $('libSizes').append(b)
  }
  const size = boardsCache.find((s) => s.size === libSize)
  if (!size) { $('libList').innerHTML = `<p class="grouphelp">${t('storeEmpty')}</p>`; return }
  $('libList').innerHTML = ''
  for (const meta of size.boards) {
    const row = document.createElement('div')
    row.className = 'boardrow' + (libBoard?.id === meta.id ? ' on' : '')
    const when = meta.createdAt ? new Date(meta.createdAt).toLocaleString(lang === 'pl' ? 'pl' : 'en-GB') : ''
    row.innerHTML = `<span class="id">${meta.id}</span><span>${when}</span>` +
      `<span class="meta">${t('piecesShort', meta.pieces ?? '?')} · ${t('longestShort', meta.maxLen ?? '?')} · ${meta.source}` +
      `${meta.ok === false ? ` · <b class="bad">${t('notClosed')}</b>` : ''}</span>`
    row.addEventListener('click', () => openBoard(meta))
    $('libList').append(row)
  }
}

async function openBoard(meta) {
  libBoard = meta
  renderLibrary()
  $('libDetail').hidden = false
  $('libCommand').textContent = meta.command
  setStatus(t('loadingBoard', `${meta.W}x${meta.H}/${meta.id}`))
  const r = await fetch(`/boards/${meta.W}x${meta.H}/${meta.id}.svg`)
  $('board').innerHTML = await r.text()
  setStatus(t('savedBoard', `${meta.W}x${meta.H}/${meta.id}`, meta.seed, meta.source))
}
$('libCopy').addEventListener('click', async () => {
  await navigator.clipboard.writeText($('libCommand').textContent)
  flashCopied($('libCopy'))
})
// Loading sets the knobs and the view but does NOT generate — the user sees
// the command first and decides.
$('libLoad').addEventListener('click', () => {
  if (!libBoard) return
  for (const spec of PARAM_SPEC) if (libBoard.params[spec.key] !== undefined) setParam(spec.key, libBoard.params[spec.key])
  const v = libBoard.view ?? {}
  if (v.cell) $('cell').value = v.cell
  if (v.stroke) $('stroke').value = v.stroke
  $('colored').checked = !!v.colored
  $('hilite').checked = (v.top ?? 0) > 0
  if (v.top > 0) $('top').value = v.top
  updateCommand()
  showTab('lab')
})
```

Until Task 7, extend the `t` stub with: `tabLab`, `tabLibrary`, `refresh`, `boardCommand`, `loadIntoLab`, `noStoreServer`, `storeEmpty`, `notClosed`, `saved`, `notSaved`, and function entries `piecesShort(n)`, `longestShort(n)`, `loadingBoard(id)`, `savedBoard(id, seed, source)`; `lang` is a `let lang = 'en'` placeholder.

- [ ] **Step 3: Tab in the URL**

In `saveToUrl()` add `tab: activeTab` to `view`. In `loadFromUrl()` after `applyZoom()` add `if (view.tab === 'library') showTab('library')`. `showTab` calls `saveToUrl`, and `loadFromUrl` is called from `hashchange` — the `writtenHash` guard already handles this.

- [ ] **Step 4: Check in the browser**

Check: the tab lists sizes with counts; clicking a board draws it in the board area and shows the command; "Load into lab" sets the knobs and the panel command equals the board's command; back in the lab the worker board returns; "Refresh" after generating in a second tab shows the new entry; the `F` key works in both tabs.

- [ ] **Step 5: Commit**

```bash
git add prototype/lab.html
git commit -m "Add a saved-boards tab browsing the store by size"
```

---

### Task 7: Bilingual lab — `lab-i18n.mjs` and the language switch

**Files:**
- Modify: `prototype/lab-i18n.mjs` (add `EN`, `PL.ui`, `PL.groupHelp`)
- Modify: `prototype/lab.html`
- Test: `prototype/lab-i18n.test.mjs`

**Interfaces:**
- Consumes: `PARAM_SPEC`, `INACTIVE_REASONS` from the engine.
- Produces: `EN = { groups, groupHelp, ui }`, `PL = { groups, groupHelp, reasons, params, ui }`; in `lab.html`: `let lang`, `t(key, ...args)`, `applyLanguage()`, buttons `#langPl`, `#langEn`, attribute `data-i18n` on every static element.

- [ ] **Step 1: Write the failing test**

```js
// prototype/lab-i18n.test.mjs
import { test } from 'node:test'
import assert from 'node:assert/strict'
import { EN, PL } from './lab-i18n.mjs'
import { PARAM_SPEC, INACTIVE_REASONS } from './engine.mjs'

test('Polish dictionary covers every parameter and inactive reason', () => {
  for (const s of PARAM_SPEC) {
    assert.ok(PL.params[s.key]?.label, `label ${s.key}`)
    assert.ok(PL.params[s.key]?.help, `help ${s.key}`)
  }
  for (const k of Object.keys(INACTIVE_REASONS)) assert.ok(PL.reasons[k], `reason ${k}`)
  for (const g of new Set(PARAM_SPEC.map((s) => s.group))) {
    assert.ok(PL.groups[g], `group ${g}`)
    assert.ok(EN.groups[g], `group ${g}`)
  }
})

test('EN and PL ui dictionaries have the same keys and the same value kinds', () => {
  const en = Object.keys(EN.ui).sort(), pl = Object.keys(PL.ui).sort()
  assert.deepEqual(pl, en)
  for (const k of en) assert.equal(typeof PL.ui[k], typeof EN.ui[k], k)
  assert.deepEqual(Object.keys(PL.groupHelp).sort(), Object.keys(EN.groupHelp).sort())
})
```

- [ ] **Step 2: Run, confirm it fails**

Run: `node --test prototype/lab-i18n.test.mjs`
Expected: FAIL — `EN` is not exported / `PL.ui` is empty.

- [ ] **Step 3: Fill the dictionaries**

In `lab-i18n.mjs` add `EN` with `groups` (`board: 'board'`, `lengths: 'lengths'`, …), `groupHelp` (moved from `GROUP_HELP` in `lab.html`), and `ui` with every visible string of `lab.html`. `PL.groupHelp` gets the original Polish `GROUP_HELP` texts, `PL.ui` the Polish counterparts. Key list for `ui` (both languages, same keys):

```
title, subtitle(engine, cli), generate, reseed, reset, downloadSvg, abort,
commandHead, copy, copied, preview, fitBoard, zoomLabel, zoomHelp, cellLabel, cellHelp,
strokeLabel, colored, hilite, voids, topLabel, autoRun, showHelp,
tabLab, tabLibrary, pressGenerate, generating, generatingBig(W, H, cells),
progress(pct, pieces, remaining, backtracks, s), workerError, generationError, aborted,
closed, solvable, unsolvable, notClosedStatus(remaining, fragments, largest),
stat_board(W, H, cells, seed), stat_pieces, stat_avgLen, stat_longest, stat_lengths,
stat_f0, stat_almost, stat_D, stat_corridor, stat_span, stat_spanTop, stat_spanMax,
stat_outDeg, stat_maxOut, stat_blockDist, stat_bends, stat_coil, stat_border, stat_multi,
stat_stall, stat_absorbed, stat_backtracks, stat_time, longestHead(n), longestHelp,
th_len, th_box, th_span, th_density, th_coil, cells, pieces,
saved, notSaved, refresh, boardCommand, loadIntoLab, noStoreServer, storeEmpty, notClosed,
piecesShort(n), longestShort(n), loadingBoard(id), savedBoard(id, seed, source),
inactivePrefix, fullView
```

Functions take the values and return the text; plain strings are strings. Preset button labels stay language-neutral (`Easy 25×50`).

- [ ] **Step 4: Language switch in `lab.html`**

In the `<aside>` header:

```html
  <div class="langs"><button id="langPl">PL</button><button id="langEn">EN</button></div>
```

with `.langs { float: right; display: flex; gap: .2rem; } .langs button { padding: .1rem .4rem; font-size: 11px; } .langs button.on { background: var(--ink); color: #fff; }`.

Every static text element gets `data-i18n="<key>"`. Script:

```js
import { EN, PL } from './lab-i18n.mjs'
const DICT = { en: EN, pl: PL }
let lang = localStorage.getItem('labLang') || (navigator.language?.toLowerCase().startsWith('pl') ? 'pl' : 'en')
function t(key, ...args) {
  const v = DICT[lang].ui[key] ?? EN.ui[key] ?? key
  return typeof v === 'function' ? v(...args) : v
}
function paramText(spec) {
  const pl = lang === 'pl' ? PL.params[spec.key] : null
  return { label: pl?.label ?? spec.label, help: pl?.help ?? spec.help }
}
function reasonText(key) { return (lang === 'pl' ? PL.reasons[key] : null) ?? INACTIVE_REASONS[key] ?? key }

function applyLanguage() {
  document.documentElement.lang = lang
  localStorage.setItem('labLang', lang)
  $('langPl').classList.toggle('on', lang === 'pl')
  $('langEn').classList.toggle('on', lang === 'en')
  for (const el of document.querySelectorAll('[data-i18n]')) el.textContent = t(el.dataset.i18n)
  for (const [group, box] of groupBoxes) {
    box.querySelector('summary').textContent = DICT[lang].groups[group] ?? group
    const gh = box.querySelector('.grouphelp')
    if (gh) gh.textContent = DICT[lang].groupHelp[group] ?? EN.groupHelp[group] ?? ''
  }
  for (const { label, spec, help } of paramRows.values()) {
    const tx = paramText(spec)
    label.textContent = tx.label
    if (help) help.textContent = tx.help
  }
  refreshActive()
  if (lastDone) report(lastDone)
  if (lastLongest) renderLongest(lastLongest)
  if (activeTab === 'library') renderLibrary()
  else if (!lastDone) setStatus(t('pressGenerate'))
  saveToUrl()
}
$('langPl').addEventListener('click', () => { lang = 'pl'; applyLanguage() })
$('langEn').addEventListener('click', () => { lang = 'en'; applyLanguage() })
```

`groupBoxes` is a `Map(group → details element)` filled while building the panel; `paramRows` entries gain a `help` element reference. `refreshActive()` uses `reasonText(why)` and `t('inactivePrefix')` for the "No effect: …" prefix (`data-why` gets the resolved text). `report()` and `renderLongest()` take every label from `t(...)`. `saveToUrl()` adds `lang` to `__view`; `loadFromUrl()` sets `lang` from `view.lang` before `applyLanguage()`. Call `applyLanguage()` once at start, after the panel is built and before `run()`.

- [ ] **Step 5: Run tests and check in the browser**

Run: `node --test 'prototype/*.test.mjs'`
Expected: all PASS.

Check in Chrome: PL/EN switch changes headings, buttons, knob labels and help texts, inactive reasons, the stats table and the longest table after a generation, the store tab strings; reload keeps the language; a link with `lang` in the hash opens in that language.

Run: `grep -cP '[ąćęłńóśźżĄĆĘŁŃÓŚŹŻ]' prototype/lab.html`
Expected: `0`

- [ ] **Step 6: Commit**

```bash
git add prototype/lab-i18n.mjs prototype/lab-i18n.test.mjs prototype/lab.html
git commit -m "Make the lab bilingual with a Polish/English switch"
```

---

### Task 8: Housekeeping — gallery, gitignore, README, memory

**Files:**
- Delete: `prototype/preview.sh`, `prototype/preview/` (whole directory, including `index.html`)
- Modify: `.gitignore`, `prototype/README.md`
- Modify: `/Users/tomek/.claude/projects/-Users-tomek-dev-arrowz/memory/arrowz-artefakty.md`; basic-memory note "Arrowz — laboratorium generatora (prototype/lab.html)"

- [ ] **Step 1: Remove the gallery and change gitignore**

```bash
git rm -r -q prototype/preview.sh prototype/preview
rm -rf prototype/preview
sed -i '' 's#^prototype/preview/\*\.svg$#prototype/boards/#' .gitignore
git status --short   # boards/ must not show up as untracked
```

- [ ] **Step 2: README**

In the lab section replace the paragraph about the URL and the command with:

```markdown
The configuration is stored in the URL, so a setting can be revisited or
shared as a link. The panel shows, **before** generating, the CLI command
matching the current knobs — the lab is a layer over `carve.mjs` and mirrors
it 1:1: the same command in a terminal gives the same board byte for byte
(`carve.test.mjs` guards this). The UI is bilingual (PL/EN switch in the
panel header; the choice is kept in `localStorage` and in the URL).

Every generated board — from the lab and from `carve.mjs --svg` — lands in
`prototype/boards/<W>x<H>/<id>.svg` with metadata and the command in
`<id>.json` (gitignored; the id is the seed plus a hash of the parameters, so
the same configuration overwrites its own entry). The **Saved boards** tab
browses the store by size, shows the command next to the board and loads its
settings into the knobs.
```

Replace the CLI example block with:

```
node prototype/carve.mjs --svg --w=25 --h=50 --seed=7 --cell=12    # one board → prototype/boards/
node prototype/carve.mjs --svg=board.svg --w=100 --h=200 --giants=4 --cell=8 --top=5
node prototype/carve.mjs                      # report on all levels
node prototype/carve.mjs --only=Easy·sq --show   # with ASCII preview
node prototype/carve.mjs --headbias=1         # tunnelling (deepest line)
node prototype/carve.mjs --wlateral=6 --pstraight=0.6 --runs=3
node prototype/carve.mjs --bench=20 --only=Extreme·sq
```

Add: "Engine parameters are `--<PARAM_SPEC key in lower case>=value`; the defaults are the same as in the lab. Old names `--straight`, `--lateral`, `--absorb`, `--giantspacepen` work as aliases. Format flags: `--square`, `--portrait`."

Replace the `preview.sh` line in the round-5 section with: "The section-F variants are reproduced with commands in the lab (Saved boards tab) — the `preview.sh` gallery was replaced by the store."

- [ ] **Step 3: Tests and commit**

Run: `node --test 'prototype/*.test.mjs'`
Expected: all PASS

```bash
git add -A
git commit -m "Replace the preview gallery with the board store and document the CLI"
```

- [ ] **Step 4: Memory**

In `arrowz-artefakty.md` replace the "Galeria podglądu" bullet with the store (`prototype/boards/`, gitignored, lab tab, id from parameters) and add to "Laboratorium" that the server is `lab-server.mjs` and the UI is bilingual. In basic-memory add to the lab note: decision "lab is a 1:1 layer over the CLI, one flag parser in `command.mjs`", the gotcha about the old default drift in `--svg` mode (126 vs 135 pieces), the decision on the board id from a parameter hash, the i18n structure. Write a session note in `sesje/`.

- [ ] **Step 5: Merge**

After the review: `git checkout main && git merge --ff-only lab-board-store && git branch -d lab-board-store`.

---

## Self-review

- **Spec coverage:** language rule and translation (T0), command and parser (T1), store (T2), server + `lab.sh` (T3), CLI on `generate()` and save on `--svg` (T4), live command and save from the lab (T5), tab (T6), bilingual UI (T7), housekeeping, README, memory, merge (T8). Byte-for-byte test (T4). Manual Chrome check (T5/T6/T7).
- **Placeholders:** none; the `t` stub in T5/T6 is explicit and replaced in T7.
- **Name consistency:** `buildCommand(params, view)`, `parseArgs(argv) → {params, view, rest}`, `boardId`, `saveBoard({svg, params, view, command, metrics, source})`, `listBoards()`, `boardsDir()`, `createLabServer()`, `t(key, ...args)`, `applyLanguage()`, `lastLongest`, `boardsCache` used identically across T1–T7. Meta fields (`id, W, H, seed, params, view, command, source, createdAt, ok, pieces, maxLen, genMs, svgBytes`) consistent between T2, T4, T5, T6.
