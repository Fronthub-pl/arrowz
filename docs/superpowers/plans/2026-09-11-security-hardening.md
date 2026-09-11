# Security Hardening Implementation Plan

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:subagent-driven-development (recommended) or superpowers:executing-plans to implement this plan task-by-task. Steps use checkbox (`- [ ]`) syntax for tracking.

**Goal:** Close every finding of the 2026-09-11 security audit (F1–F11) without changing a single generated board.

**Architecture:** The engine gains one envelope rule (`wholeNumbers`), a `voidFrac` guard and a spread-free `toSvg`. The lab server validates every POST field, guards host and origin, serves three areas only and sends security headers. The lab page escapes every data value it puts into markup. Deno permissions are scoped, CI actions pinned by SHA, docs note the repo's hooks.

**Tech Stack:** TypeScript on Deno 2.9, `@std/assert`, `@std/path`, GitHub Actions.

**Spec:** `docs/superpowers/specs/2026-09-11-security-hardening-design.md`

## Global Constraints

- Everything in the repository is in English; only `lab-i18n.ts` holds Polish (the PL dictionary) and `README.pl.md` is the Polish translation of `README.md`.
- `deno task test` passes after every task; `deno task verify` (check, lint, fmt, test) passes before the PR.
- No `any`, no non-null assertions (`!`); a type fix never adds a value-changing fallback in the engine.
- `packages/engine/*.ts` knows neither Deno nor the DOM (`neutral.test.ts` greps this).
- Never spread arrays proportional to cells or pieces into a call (`push(...arr)`, `Math.min(...arr)`).
- Board output does not change: `fingerprints.test.ts`, `svg-golden.test.ts`, `packages/engine/scripts/node-smoke.mjs` stay green with no edits to their data.
- Commit subjects are full sentences in the repo's style (see `git log`), no attribution lines, no `Co-Authored-By`.
- Code style: `deno fmt` (no semicolons, single quotes, width 120).

---

### Task 1: Engine — whole-number rule, `voidFrac` guard, spread-free `toSvg`

**Files:**
- Modify: `packages/engine/types.ts:41` (`RuleKey`)
- Modify: `packages/engine/engine.ts:116-118` (Carver constructor), `:2076-2080` (`toSvg`), `:2481-2491` (`RULES`, `RULE_REASONS`), `validateParams` doc comment
- Modify: `packages/engine/lab-i18n.ts:207-211` (PL `reasons`)
- Modify: `README.md:849-870`, `README.pl.md` (the matching "refused combinations" section)
- Test: `packages/engine/envelope.test.ts`, `packages/engine/lab-i18n.test.ts:8`, `packages/engine/engine.test.ts`

**Interfaces:**
- Produces: `RuleKey` includes `'wholeNumbers'`; `RULES` has four entries in the order `sharesSum, lmaxHole, mixHole, wholeNumbers`; `validateParams({ ...defaultParams(), seed: 1.5 })` returns `[{ kind: 'rule', key: 'wholeNumbers', keys: ['W', 'H', 'seed'] }]`. Task 2 relies on this to refuse a fractional seed at the server.

- [ ] **Step 1: Write the failing tests**

In `packages/engine/envelope.test.ts`, change the rule-list test and add a rule test after the `mixHole` test:

```ts
Deno.test('envelope: the four cross-knob rules exist with a reason each', () => {
  assertEquals(RULES.map((r) => r.key), ['sharesSum', 'lmaxHole', 'mixHole', 'wholeNumbers'])
  // (body unchanged)
})

Deno.test('rule wholeNumbers: width, height and seed are whole numbers', () => {
  assertEquals(validateParams(withDefaults({ W: 10, H: 12, seed: 0 })), [])
  for (const over of [{ W: 10.5 }, { H: 12.25 }, { seed: 1.5 }]) {
    assertEquals(validateParams(withDefaults(over)), rule('wholeNumbers'), JSON.stringify(over))
  }
})
```

In `packages/engine/lab-i18n.test.ts:8`:

```ts
const ruleKeys: RuleKey[] = ['sharesSum', 'lmaxHole', 'mixHole', 'wholeNumbers']
```

In `packages/engine/engine.test.ts`, at the end, add (use the file's existing `engineExports` / `generate` / `defaultParams` imports):

```ts
// A board file can carry far more pieces than a call may take arguments:
// highlighting all of them must not spread the lines into one push().
Deno.test('toSvg highlights half a million pieces without overflowing the stack', () => {
  const { toSvg } = engineExports
  const base = generate({ ...defaultParams(), W: 12, H: 12, seed: 3 }).board
  const N = 500_000
  const pieces = Array.from({ length: N }, (_, i) => {
    const p = base.pieces[i % base.pieces.length]
    if (!p) throw new Error('the base board has no pieces')
    return { ...p, id: i }
  })
  const svg = toSvg({ W: base.W, H: base.H, owner: base.owner, pieces }, { top: N })
  assert(svg.endsWith('</svg>'))
})

Deno.test('the Carver refuses a void fraction outside [0, 1)', () => {
  for (const voidFrac of [-0.1, 1, 2, Number.NaN]) {
    assertThrows(
      () => generate({ ...defaultParams(), W: 10, H: 10, voidFrac }, { unchecked: true }),
      RangeError,
      'voidFrac',
    )
  }
})
```

Check the exact name and shape of the `unchecked` option in `generate` (`engine.ts` around `:2554`) and adapt the call if it differs; `node-smoke.mjs:15` shows a real use.

- [ ] **Step 2: Run the tests and see them fail**

Run: `deno test --allow-read --allow-run packages/engine/envelope.test.ts packages/engine/lab-i18n.test.ts packages/engine/engine.test.ts`
Expected: FAIL — the rule list lacks `wholeNumbers`; the half-million test throws `RangeError: Maximum call stack size exceeded`; the voidFrac test hangs or does not throw. If the spread test passes before the fix, raise `N` until it fails on the unfixed code and record the value in the test comment; a test that cannot be red proves nothing. For the hang, run the voidFrac test alone with a timeout (`timeout 20 deno test ... --filter 'void fraction'`) to confirm it does not return.

- [ ] **Step 3: Implement**

`packages/engine/types.ts:41`:

```ts
export type RuleKey = 'sharesSum' | 'lmaxHole' | 'mixHole' | 'wholeNumbers'
```

`packages/engine/engine.ts`, `RULES` and `RULE_REASONS`:

```ts
  { key: 'mixHole', keys: ['mix'], check: (p) => p.mix === -1 || (p.mix >= 0.3 - 1e-9 && p.mix <= 0.7 + 1e-9) },
  // A size or seed with a fraction is not a board the tools can name: the
  // seed goes into the board id and so into file names.
  {
    key: 'wholeNumbers',
    keys: ['W', 'H', 'seed'],
    check: (p) => Number.isInteger(p.W) && Number.isInteger(p.H) && Number.isInteger(p.seed),
  },
]

export const RULE_REASONS: Record<RuleKey, string> = {
  sharesSum: 'short and medium shares together must stay at or below 0.9',
  lmaxHole: 'maximum length must be 0 (automatic) or at least 6',
  mixHole: 'mixing must be -1 (off) or between 0.3 and 0.7',
  wholeNumbers: 'width, height and seed must be whole numbers',
}
```

`packages/engine/engine.ts` Carver constructor, before `if (params.voidFrac > 0) {`:

```ts
    // More voids than cells would never be placed and the loop below would not
    // end; the unchecked path skips validateParams, so the guard lives here.
    if (!(params.voidFrac >= 0 && params.voidFrac < 1)) {
      throw new RangeError(`voidFrac ${params.voidFrac} is outside [0, 1)`)
    }
```

`packages/engine/engine.ts` in `toSvg`, replace `out.push(...highlight)`:

```ts
    for (const line of highlight) out.push(line)
```

`packages/engine/lab-i18n.ts` PL `reasons`, after `mixHole`:

```ts
    wholeNumbers: 'szerokość, wysokość i ziarno muszą być liczbami całkowitymi',
```

Update the `validateParams` doc comment: it now lists four rules implicitly through `RULES`; keep the sentence that keys outside `PARAM_SPEC` are ignored. In `README.md` "Combinations that are refused": "Three rules" → "Four rules", add the row `| Whole numbers | `--width`, `--height` and `--seed` take whole numbers only. |`. Make the same change in the matching section of `README.pl.md` in Polish (row: `| Liczby całkowite | `--width`, `--height` i `--seed` przyjmują tylko liczby całkowite. |`, and the count word).

- [ ] **Step 4: Run the tests and see them pass**

Run: `deno task test`
Expected: PASS, including `fingerprints.test.ts` and `svg-golden.test.ts` untouched. Also run `node packages/engine/scripts/node-smoke.mjs` after `pnpm nx build engine` if the smoke target is how CI runs it (`packages/engine/project.json` shows the command).

- [ ] **Step 5: Commit**

```bash
git add packages/engine README.md README.pl.md
git commit -m "The engine refuses a fractional width, height or seed and a void fraction of 1 or more, and highlights any number of pieces without spreading them into one call"
```

---

### Task 2: Lab server — validate every POST field and cap the body

**Files:**
- Modify: `packages/cli/lab-server.ts:1-64`
- Modify: `packages/cli/store.ts:93` (id guard)
- Test: `packages/cli/lab-server.test.ts`, `packages/cli/store.test.ts`

**Interfaces:**
- Consumes: Task 1's `wholeNumbers` rule via `validateParams`.
- Produces: `export const MAX_BODY = 16 * 1024 * 1024` in `lab-server.ts`; POST refuses `svg` (400); `saveBoard` throws `invalid board id <id>` for an id not matching `/^seed\d+-[0-9a-f]{8}$/`.

- [ ] **Step 1: Write the failing tests**

In `packages/cli/lab-server.test.ts`, the first test posts an `svg`; the server will refuse it, so rewrite that test to save the preview through the store (as the CLI does) and to check the POST path without an SVG. Import `saveBoard` from `./store.ts` and `dirname` from `@std/path`.

```ts
Deno.test('POST /api/boards saves, GET lists, the board file is served from the store', () =>
  withServer(async (base) => {
    const board = emptyFile(25, 50)
    const body = {
      board,
      params: { ...defaultParams(), W: 25, H: 50, seed: 7 },
      view: { cell: 12, stroke: 0.5, headWidth: 0, headHeight: 0, colored: false, top: 0 },
      command: `${COMMAND_PREFIX} --advanced --board --w=25 --h=50 --seed=7 --cell=12`,
      metrics: { ok: true, pieces: 126, maxLen: 68, genMs: 10 },
      source: 'lab',
    }
    const post = await fetch(base + '/api/boards', { method: 'POST', body: JSON.stringify(body) })
    assertEquals(post.status, 201)
    const meta: BoardMeta = await post.json()
    assertMatch(meta.id, /^seed7-/)
    const list: BoardSize[] = await (await fetch(base + '/api/boards')).json()
    assertEquals(list[0]?.size, '25x50')
    assertEquals(list[0]?.boards[0]?.id, meta.id)
    const file = await fetch(`${base}/boards/25x50/${meta.id}.board.json`)
    assertEquals(file.headers.get('content-type'), 'application/json')
    assertEquals(await file.json(), board)
  }))

Deno.test('a preview saved by the CLI is served from the store as SVG', () =>
  withServer(async (base) => {
    const meta = saveBoard({
      board: emptyFile(10, 10),
      svg: '<svg>x</svg>',
      params: { ...defaultParams(), W: 10, H: 10, seed: 5 },
      view: { cell: 12, stroke: 0.5, headWidth: 0, headHeight: 1, colored: false, top: 0, rounded: true },
      command: 'x',
      source: 'cli',
    })
    const svg = await fetch(`${base}/boards/10x10/${meta.id}.svg`)
    assertEquals(svg.headers.get('content-type'), 'image/svg+xml')
    assertEquals(await svg.text(), '<svg>x</svg>')
  }))
```

`emptyFile` returns what `encodeBoard` returns; if `saveBoard` wants a `BoardFile` and the types differ, pass the same value the CLI passes (`carve.ts` calls `saveBoard`).

Add the refusal tests:

```ts
/** A valid POST body for a 10×10 board; each case below breaks one field. */
const validBody = () => ({
  board: emptyFile(10, 10),
  params: { ...defaultParams(), W: 10, H: 10, seed: 3 },
  view: { cell: 12, stroke: 0.5, headWidth: 0, headHeight: 1, colored: false, top: 0 },
  command: 'x',
  source: 'lab',
})

Deno.test('POST refuses fields the store would write or the page would show unchecked', () =>
  withServer(async (base) => {
    const store = Deno.env.get('ARROWZ_BOARDS_DIR') ?? ''
    const b = validBody()
    const cases: [unknown, string][] = [
      [{ ...b, params: { ...b.params, seed: '/../../escape' } }, 'params.seed'],
      [{ ...b, params: { ...b.params, seed: 1.5 } }, 'whole numbers'],
      [{ ...b, source: '<img src=x onerror=alert(1)>' }, 'source'],
      [{ ...b, svg: '<svg><script>alert(1)</script></svg>' }, 'svg is not accepted'],
      [{ ...b, view: { ...b.view, top: 'x' } }, 'view.top'],
      [{ ...b, view: { ...b.view, colored: 'yes' } }, 'view.colored'],
      [{ ...b, command: 'x'.repeat(5000) }, 'command'],
      [{ ...b, metrics: { pieces: '<b>' } }, 'metrics.pieces'],
      [{ ...b, metrics: { stuck: { remaining: 1, sizes: ['x'], heads: null } } }, 'metrics.stuck'],
    ]
    for (const [body, error] of cases) {
      const r = await fetch(base + '/api/boards', { method: 'POST', body: JSON.stringify(body) })
      assertEquals(r.status, 400, error)
      const got: { error: string } = await r.json()
      assert(got.error.includes(error), `${got.error} lacks ${error}`)
    }
    const beside = [...Deno.readDirSync(dirname(store))].map((e) => e.name)
    assert(!beside.some((n) => n.startsWith('escape')), 'a file was written beside the store')
    assertEquals(await (await fetch(base + '/api/boards')).json(), [])
  }))

Deno.test('POST keeps only the knobs of PARAM_SPEC', () =>
  withServer(async (base) => {
    const b = validBody()
    const body = { ...b, params: { ...b.params, ruleB: false, voidFrac: 0.5, junk: 1 } }
    const r = await fetch(base + '/api/boards', { method: 'POST', body: JSON.stringify(body) })
    assertEquals(r.status, 201)
    const meta: BoardMeta = await r.json()
    assertEquals(meta.params.ruleB, true)
    assertEquals(meta.params.voidFrac, 0)
    assert(!('junk' in meta.params))
  }))

Deno.test('POST refuses a body that is not JSON (400) or larger than the cap (413)', () =>
  withServer(async (base) => {
    const bad = await fetch(base + '/api/boards', { method: 'POST', body: '{' })
    assertEquals(bad.status, 400)
    await bad.body?.cancel()
    const big = await fetch(base + '/api/boards', { method: 'POST', body: 'x'.repeat(MAX_BODY + 1) })
    assertEquals(big.status, 413)
    await big.body?.cancel()
  }))
```

Import `MAX_BODY` with `createLabServer` from `./lab-server.ts`.

In `packages/cli/store.test.ts` add (reuse its existing helpers for a temp store and an empty board file):

```ts
Deno.test('saveBoard refuses params whose id is not seed<digits>-<hash>', () => {
  // A cast on purpose: this is the value an unchecked caller could hand over.
  const params = { ...defaultParams(), W: 10, H: 10, seed: '../x' as unknown as number }
  assertThrows(
    () => saveBoard({ board: emptyFile(10, 10), params, view: DEFAULT_VIEW, command: 'x', source: 'cli' }),
    Error,
    'invalid board id',
  )
})
```

- [ ] **Step 2: Run and see them fail**

Run: `deno test --allow-read --allow-write --allow-env --allow-net packages/cli/lab-server.test.ts packages/cli/store.test.ts`
Expected: FAIL — the refusal cases get 201, the cap test gets 201 or 500, the store test does not throw.

- [ ] **Step 3: Implement**

`packages/cli/store.ts`, right after `const id = boardId(params)`:

```ts
  // The id names three files. The server validates params before this point;
  // this is the last line should an unchecked caller reach it.
  if (!/^seed\d+-[0-9a-f]{8}$/.test(id)) throw new Error(`invalid board id ${id}`)
```

Check `fnv1a` in `packages/engine/command.ts:407-415` returns exactly eight lowercase hex digits (zero-padded); if it does not pad, use `{1,8}` and say so in the comment.

`packages/cli/lab-server.ts`: replace the imports, `PostBody` and `checkPost`, and the POST branch:

```ts
import { dirname, extname, fromFileUrl, join, normalize, resolve, SEPARATOR } from '@std/path'
import { decodeBoard, defaultParams, encodeBoard, formatViolation, PARAM_SPEC, validateParams } from '@arrowz/engine'
import type { Params, View } from '@arrowz/engine'
import { DEFAULT_VIEW } from '@arrowz/engine/command'
import { boardsDir, deleteBoard, listBoards, saveBoard, type SaveInput } from './store.ts'

/** The largest POST body read. The lab posts no SVG, and a 1000×1000 board file is about a megabyte. */
export const MAX_BODY = 16 * 1024 * 1024
/** The longest command or simple command stored. */
const MAX_TEXT = 4096
const SOURCES: readonly string[] = ['lab', 'cli']

type Rec = Record<string, unknown>
const isRec = (v: unknown): v is Rec => typeof v === 'object' && v !== null && !Array.isArray(v)
const isNum = (v: unknown): v is number => typeof v === 'number' && Number.isFinite(v)
const isText = (v: unknown): v is string => typeof v === 'string' && v.length <= MAX_TEXT
type Checked<T> = { ok: T } | { error: string }
type Metrics = NonNullable<SaveInput['metrics']>

/**
 * The params of a POST, rebuilt from the knobs of PARAM_SPEC only: ruleB,
 * voidFrac and keys the engine does not know keep their defaults, and the
 * result must pass the engine's envelope, so the store holds only boards the
 * engine would generate. The seed goes into file names; a string or a
 * fraction never gets that far.
 */
function checkParams(v: unknown): Checked<Params> {
  if (!isRec(v)) return { error: 'params are required' }
  const params = defaultParams()
  for (const s of PARAM_SPEC) {
    const value = v[s.key]
    if (!isNum(value)) return { error: `params.${s.key} must be a number` }
    params[s.key] = value
  }
  const violations = validateParams(params)
  if (violations.length) return { error: `params: ${violations.map(formatViolation).join('; ')}` }
  return { ok: params }
}

const VIEW_NUMBERS = ['cell', 'stroke', 'headWidth', 'headHeight', 'top'] as const

function checkView(v: unknown): Checked<View> {
  if (!isRec(v)) return { error: 'view is required' }
  const view: View = { ...DEFAULT_VIEW }
  for (const k of VIEW_NUMBERS) {
    const value = v[k]
    if (!isNum(value) || value < 0) return { error: `view.${k} must be a number of at least 0` }
    view[k] = value
  }
  if (typeof v.colored !== 'boolean') return { error: 'view.colored must be true or false' }
  view.colored = v.colored
  // A board saved before rounded corners existed has no rounded field.
  if (v.rounded !== undefined) {
    if (typeof v.rounded !== 'boolean') return { error: 'view.rounded must be true or false' }
    view.rounded = v.rounded
  }
  return { ok: view }
}

const METRIC_NUMBERS = ['pieces', 'maxLen', 'genMs', 'restarts', 'backtracks'] as const
const METRIC_FLAGS = ['ok', 'aborted'] as const

/** The closing report of a POST. Absent and null fields stay absent: the store writes null for them. */
function checkMetrics(v: unknown): Checked<Metrics> {
  if (v === undefined) return { ok: {} }
  if (!isRec(v)) return { error: 'metrics must be an object' }
  const metrics: Metrics = {}
  for (const k of METRIC_NUMBERS) {
    const value = v[k]
    if (value === undefined || value === null) continue
    if (!isNum(value) || value < 0) return { error: `metrics.${k} must be a number of at least 0` }
    metrics[k] = value
  }
  for (const k of METRIC_FLAGS) {
    const value = v[k]
    if (value === undefined || value === null) continue
    if (typeof value !== 'boolean') return { error: `metrics.${k} must be true or false` }
    metrics[k] = value
  }
  const stuck = v.stuck
  if (stuck !== undefined && stuck !== null) {
    const sizes = isRec(stuck) ? stuck.sizes : undefined
    const heads = isRec(stuck) ? stuck.heads : undefined
    const remaining = isRec(stuck) ? stuck.remaining : undefined
    if (!isNum(remaining) || !Array.isArray(sizes) || !sizes.every(isNum) || !(heads === null || isNum(heads))) {
      return { error: 'metrics.stuck is not a closing report' }
    }
    metrics.stuck = { remaining, sizes, heads }
  }
  return { ok: metrics }
}

/**
 * Runtime check of a POST body, field by field. Returns the SaveInput to
 * store, built from checked values only, or the reason it was refused. The
 * board is stored as encodeBoard writes it, so keys the engine does not know
 * never reach the file; a valid file encodes back to itself.
 */
function checkPost(v: unknown): Checked<SaveInput> {
  if (!isRec(v)) return { error: 'the body is not a JSON object' }
  // The lab exports its SVG in the browser and never posts one; a stored SVG
  // from a request would be markup of the requester's choosing.
  if (v.svg !== undefined) return { error: 'svg is not accepted: the lab exports its SVG in the browser' }
  const params = checkParams(v.params)
  if ('error' in params) return params
  let board
  try {
    board = decodeBoard(v.board)
  } catch (err) {
    return { error: `board: ${err instanceof Error ? err.message : String(err)}` }
  }
  if (board.W !== params.ok.W || board.H !== params.ok.H) {
    return { error: `board file is ${board.W}x${board.H}, the params ask for ${params.ok.W}x${params.ok.H}` }
  }
  const view = checkView(v.view)
  if ('error' in view) return view
  const metrics = checkMetrics(v.metrics)
  if ('error' in metrics) return metrics
  if (!isText(v.command)) return { error: `command must be a string of at most ${MAX_TEXT} characters` }
  if (v.simpleCommand !== undefined && !isText(v.simpleCommand)) {
    return { error: `simpleCommand must be a string of at most ${MAX_TEXT} characters` }
  }
  const source = v.source ?? 'lab'
  if (typeof source !== 'string' || !SOURCES.includes(source)) {
    return { error: `source must be one of ${SOURCES.join(', ')}` }
  }
  return {
    ok: {
      board: encodeBoard(board),
      params: params.ok,
      view: view.ok,
      command: v.command,
      ...(v.simpleCommand !== undefined ? { simpleCommand: v.simpleCommand } : {}),
      metrics: metrics.ok,
      source,
    },
  }
}

/** The body as text, or null when it is larger than limit bytes (declared or actual). */
async function readBody(req: Request, limit: number): Promise<string | null> {
  if (Number(req.headers.get('content-length') ?? 0) > limit) return null
  if (!req.body) return ''
  const chunks: Uint8Array[] = []
  let size = 0
  for await (const chunk of req.body) {
    size += chunk.byteLength
    if (size > limit) return null
    chunks.push(chunk)
  }
  const all = new Uint8Array(size)
  let at = 0
  for (const c of chunks) {
    all.set(c, at)
    at += c.byteLength
  }
  return new TextDecoder().decode(all)
}
```

The POST branch of `createLabServer`:

```ts
      if (url.pathname === '/api/boards' && req.method === 'POST') {
        const text = await readBody(req, MAX_BODY)
        if (text === null) return send(413, JSON.stringify({ error: `the body is larger than ${MAX_BODY} bytes` }))
        let json: unknown
        try {
          json = JSON.parse(text)
        } catch {
          return send(400, '{"error":"the body is not JSON"}')
        }
        const checked = checkPost(json)
        if ('error' in checked) return send(400, JSON.stringify({ error: checked.error }))
        return send(201, JSON.stringify(saveBoard(checked.ok)))
      }
```

The narrowing of `stuck` fields and `sizes.every(isNum)` must type-check without casts; if TypeScript does not narrow `sizes` to `number[]`, build it with `sizes.filter(isNum)` after checking the lengths match. Keep the existing `'board file is ...'`, `'params are required'`, `'board: ...'` messages: the existing 400 test asserts them.

- [ ] **Step 4: Run and see them pass**

Run: `deno task test`
Expected: PASS.

- [ ] **Step 5: Commit**

```bash
git add packages/cli/lab-server.ts packages/cli/lab-server.test.ts packages/cli/store.ts packages/cli/store.test.ts
git commit -m "The lab server stores only what it checked: params rebuilt from the knobs and validated, view, metrics, command and source by type, no SVG, a body of at most 16 MiB"
```

---

### Task 3: Lab server — host and origin guard, three served areas, security headers

**Files:**
- Modify: `packages/cli/lab-server.ts` (`send`, `createLabServer`, the static branch)
- Modify: `packages/cli/lab-page.ts:937`, `:1179` (the two POST `fetch` calls)
- Test: `packages/cli/lab-server.test.ts`

**Interfaces:**
- Consumes: Task 2's `lab-server.ts`.
- Produces: `export const LAB_CSP: string`, `export const STORE_CSP: string` in `lab-server.ts`; every POST needs `Content-Type: application/json`.

- [ ] **Step 1: Write the failing tests**

Every existing `fetch(..., { method: 'POST', ... })` in `lab-server.test.ts` gets `headers: { 'Content-Type': 'application/json' }`. Put it in one helper and use it everywhere:

```ts
const post = (base: string, body: unknown) =>
  fetch(base + '/api/boards', {
    method: 'POST',
    headers: { 'Content-Type': 'application/json' },
    body: typeof body === 'string' ? body : JSON.stringify(body),
  })
```

Add:

```ts
Deno.test('requests for another host, and writes from another origin, are refused', async () => {
  Deno.env.set('ARROWZ_BOARDS_DIR', Deno.makeTempDirSync({ prefix: 'arrowz-srv-' }))
  const handle = createLabServer()
  // DNS rebinding: a hostile domain resolved to 127.0.0.1 arrives with its own Host.
  const rebound = await handle(new Request('http://evil.example:8777/api/boards'))
  assertEquals(rebound.status, 403)
  for (const host of ['localhost:8777', '127.0.0.1:8777', '[::1]:8777']) {
    const ok = await handle(new Request(`http://${host}/api/boards`))
    assertEquals(ok.status, 200, host)
  }
  const json = { 'Content-Type': 'application/json' }
  const csrf = await handle(
    new Request('http://localhost:8777/api/boards', {
      method: 'POST',
      headers: { ...json, Origin: 'http://localhost:3000' },
      body: '{}',
    }),
  )
  assertEquals(csrf.status, 403)
  const del = await handle(
    new Request('http://localhost:8777/api/boards/10x10/seed1-00000000', {
      method: 'DELETE',
      headers: { Origin: 'null' },
    }),
  )
  assertEquals(del.status, 403)
  // A simple (no-preflight) cross-origin form post has a text/plain body.
  const plain = await handle(new Request('http://localhost:8777/api/boards', { method: 'POST', body: '{}' }))
  assertEquals(plain.status, 415)
  const same = await handle(
    new Request('http://localhost:8777/api/boards', {
      method: 'POST',
      headers: { ...json, Origin: 'http://localhost:8777' },
      body: '{}',
    }),
  )
  assertEquals(same.status, 400) // past the guard; refused by checkPost for its content
})

Deno.test('only the page, its bundle and the store are served, with security headers', () =>
  withServer(async (base) => {
    for (const path of ['/carve.ts', '/store.ts', '/deno.json', '/dist/..%2Fcarve.ts']) {
      const r = await fetch(base + path)
      assert(r.status === 404 || r.status === 403, `${path} gave ${r.status}`)
      await r.body?.cancel()
    }
    const html = await fetch(base + '/lab.html')
    assertEquals(html.headers.get('content-security-policy'), LAB_CSP)
    assertEquals(html.headers.get('x-content-type-options'), 'nosniff')
    assertEquals(html.headers.get('x-frame-options'), 'DENY')
    assertEquals(html.headers.get('referrer-policy'), 'no-referrer')
    assertEquals(html.headers.get('cross-origin-resource-policy'), 'same-origin')
    await html.body?.cancel()
    const meta = saveBoard({
      board: emptyFile(10, 10),
      svg: '<svg>x</svg>',
      params: { ...defaultParams(), W: 10, H: 10, seed: 6 },
      view: { cell: 12, stroke: 0.5, headWidth: 0, headHeight: 1, colored: false, top: 0, rounded: true },
      command: 'x',
      source: 'cli',
    })
    const svg = await fetch(`${base}/boards/10x10/${meta.id}.svg`)
    assertEquals(svg.headers.get('content-security-policy'), STORE_CSP)
    assert(STORE_CSP.includes('sandbox'))
    await svg.body?.cancel()
  }))
```

Import `LAB_CSP`, `STORE_CSP` from `./lab-server.ts`.

- [ ] **Step 2: Run and see them fail**

Run: `deno test --allow-read --allow-write --allow-env --allow-net packages/cli/lab-server.test.ts`
Expected: FAIL — `evil.example` gets 200, the cross-origin POST reaches `checkPost` (400, not 403), `/carve.ts` gets 200, the headers are missing. If `new Request` with a foreign host behaves differently than described, check what `new URL(req.url).hostname` gives inside the handler and adjust the test, not the guard.

- [ ] **Step 3: Implement**

In `packages/cli/lab-server.ts`, replace `send`:

```ts
/**
 * The lab page may load its own script, bundle, workers and API only. Inline
 * style attributes stay allowed: the page builds table rows with them.
 */
export const LAB_CSP = "default-src 'self'; script-src 'self'; style-src 'self' 'unsafe-inline'; " +
  "img-src 'self' data: blob:; worker-src 'self'; connect-src 'self'; object-src 'none'; base-uri 'none'; " +
  "form-action 'none'; frame-ancestors 'none'"
/** Stored files are data, never a page: an SVG opened on its own runs no script and reaches nothing. */
export const STORE_CSP = "default-src 'none'; style-src 'unsafe-inline'; sandbox"

function send(status: number, body: BodyInit, type = 'application/json', csp = LAB_CSP): Response {
  return new Response(body, {
    status,
    headers: {
      'Content-Type': type,
      'Cache-Control': 'no-store, must-revalidate',
      'Content-Security-Policy': csp,
      'X-Content-Type-Options': 'nosniff',
      'X-Frame-Options': 'DENY',
      'Referrer-Policy': 'no-referrer',
      'Cross-Origin-Resource-Policy': 'same-origin',
    },
  })
}

const LOCAL_HOSTS: readonly string[] = ['localhost', '127.0.0.1', '[::1]']

/**
 * Why a request is refused before routing, or null. The lab serves this
 * machine only: a Host that is not a loopback name is a page that rebound its
 * own domain to 127.0.0.1 (DNS rebinding), and a write with an Origin other
 * than the lab's is a page of another site or another local port acting in
 * the user's name (CSRF). Tools without a browser send no Origin and pass.
 * A POST must say it is JSON: a cross-origin page can only send that after a
 * CORS preflight, which this server never grants.
 */
function refusal(req: Request, url: URL): { status: number; error: string } | null {
  if (!LOCAL_HOSTS.includes(url.hostname)) return { status: 403, error: `host ${url.hostname} is not this machine` }
  if (req.method === 'GET' || req.method === 'HEAD') return null
  const origin = req.headers.get('origin')
  if (origin !== null && origin !== url.origin) return { status: 403, error: `origin ${origin} is not the lab` }
  const type = req.headers.get('content-type')?.split(';')[0]?.trim().toLowerCase()
  if (req.method === 'POST' && type !== 'application/json') {
    return { status: 415, error: 'POST needs Content-Type: application/json' }
  }
  return null
}
```

At the top of the handler, after `const url = new URL(req.url)`:

```ts
    const refused = refusal(req, url)
    if (refused) return send(refused.status, JSON.stringify({ error: refused.error }))
```

Replace the static-file part (from the comment `// The store may live outside packages/cli/` to the `403` line):

```ts
      // Three areas are served: the page, its bundle and the store, each from
      // its own base directory (the store may live outside packages/cli/, see
      // ARROWZ_BOARDS_DIR). The sources next to the page are not. The
      // normalised path must stay inside its area.
      const rel = decodeURIComponent(url.pathname === '/' ? '/lab.html' : url.pathname)
      const area = rel === '/lab.html'
        ? { base: ROOT, name: 'lab.html', csp: LAB_CSP }
        : rel.startsWith('/dist/')
        ? { base: join(ROOT, 'dist'), name: rel.slice('/dist/'.length), csp: LAB_CSP }
        : rel.startsWith('/boards/')
        ? { base: boardsDir(), name: rel.slice('/boards/'.length), csp: STORE_CSP }
        : null
      if (!area) return send(404, '{"error":"not found"}')
      const baseDir = resolve(area.base)
      const file = normalize(join(baseDir, area.name))
      if (!file.startsWith(baseDir + SEPARATOR)) return send(403, '{"error":"outside base directory"}')
```

and the final line of the static branch:

```ts
      return send(200, data, MIME[extname(file)] ?? 'application/octet-stream', area.csp)
```

In `packages/cli/lab-page.ts`, both POST calls (`:937` in `saveBoardToStore`, `:1179` in `saveLibView`) become:

```ts
    const r = await fetch('/api/boards', {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify(body),
    })
```

- [ ] **Step 4: Run and see them pass**

Run: `deno task test && deno task check`
Expected: PASS.

- [ ] **Step 5: Commit**

```bash
git add packages/cli/lab-server.ts packages/cli/lab-server.test.ts packages/cli/lab-page.ts
git commit -m "The lab server answers this machine only, refuses writes from other origins, serves the page, its bundle and the store and nothing else, and sends security headers"
```

---

### Task 4: Lab page — escape every data value put into markup

**Files:**
- Modify: `packages/engine/lab-i18n.ts` (add `escapeHtml`)
- Modify: `packages/cli/lab-page.ts` (the sites listed below)
- Test: `packages/engine/lab-i18n.test.ts`

**Interfaces:**
- Produces: `export function escapeHtml(s: string | number): string` in `packages/engine/lab-i18n.ts`.

- [ ] **Step 1: Write the failing test**

In `packages/engine/lab-i18n.test.ts`:

```ts
Deno.test('escapeHtml turns every markup character into an entity', () => {
  assertEquals(escapeHtml(`<img src=x onerror="a('&')">`), '&lt;img src=x onerror=&quot;a(&#39;&amp;&#39;)&quot;&gt;')
  assertEquals(escapeHtml(42), '42')
  assertEquals(escapeHtml('seed7-ab12cd34'), 'seed7-ab12cd34')
})
```

(import `escapeHtml` from `./lab-i18n.ts`).

- [ ] **Step 2: Run and see it fail**

Run: `deno test packages/engine/lab-i18n.test.ts`
Expected: FAIL — `escapeHtml` is not exported.

- [ ] **Step 3: Implement**

In `packages/engine/lab-i18n.ts`, near the top-level exports:

```ts
const ENTITIES: Record<string, string> = { '&': '&amp;', '<': '&lt;', '>': '&gt;', '"': '&quot;', "'": '&#39;' }

/**
 * Text for innerHTML. The lab's strings (this dictionary) are markup the page
 * trusts; a value from the store, a board file, a server reply or an error
 * message is data and passes through here before it joins them.
 */
export function escapeHtml(s: string | number): string {
  return String(s).replace(/[&<>"']/g, (c) => ENTITIES[c] ?? c)
}
```

In `packages/cli/lab-page.ts`, import `escapeHtml` from `@arrowz/engine/...` the same way the file imports the dictionary today, and apply it at every site where a data value joins markup:

| Site (line on `main`) | Change |
|---|---|
| `:692` worker `onerror` | `${escapeHtml(e.message)}` |
| `:714` `case 'error'` | `${escapeHtml(msg.message)}` |
| `:727` decode failure | `${escapeHtml(err instanceof Error ? err.message : String(err))}` |
| `:898`, `:903` export worker errors | `escapeHtml(msg.message)`, `escapeHtml(e.message)` |
| `:940` `saveBoardToStore` status | `<code>${escapeHtml(`${meta.W}x${meta.H}/${meta.id}`)}</code>` |
| `:1036-1040` `renderLibrary` row | `escapeHtml(meta.id)`, `escapeHtml(when)`, `escapeHtml(meta.source)`, and the `pieces`/`maxLen` arguments as `escapeHtml(meta.pieces ?? '?')`, `escapeHtml(meta.maxLen ?? '?')` if the `t()` argument types allow a string; otherwise escape the whole `t(...)` result for those two |
| `:1052` `showBoardStatus` | `escapeHtml` on the id inside `<code>`, on `meta.seed` and on `meta.source` |
| `:1076` `openBoard` `name` | `<code>${escapeHtml(`${meta.W}x${meta.H}/${meta.id}`)}</code>`; the `refuse` helper drops its inline `.replace(...)` and uses `escapeHtml(...)` |
| `:1187` `viewSaved` | escape the `saved` id the same way |
| `:1228` `deletedBoard` | `<code>${escapeHtml(name)}</code>` |

Then sweep the file: `grep -n 'innerHTML\|insertAdjacentHTML\|setStatus(' packages/cli/lab-page.ts` and read each hit. A value that does not come from the dictionary (`t()` with page-computed numbers) or from a literal must be escaped. Numbers computed in the page from the engine's own results (the stats table, the longest-pieces table) are not data from outside and stay as they are; say so in your report for each such site.

- [ ] **Step 4: Run and check**

Run: `deno task test && deno task check && deno task bundle`
Expected: PASS and a bundle in `packages/cli/dist/`.

- [ ] **Step 5: Commit**

```bash
git add packages/engine/lab-i18n.ts packages/engine/lab-i18n.test.ts packages/cli/lab-page.ts
git commit -m "The lab page escapes every value from the store, a board file or an error message before it joins markup"
```

---

### Task 5: Scoped Deno permissions for the lab server and the CLI

**Files:**
- Modify: `packages/cli/lab.sh:23-24`
- Modify: `packages/cli/deno.json:8,11` (`carve`, `compile`)
- Modify: `packages/cli/lab-server.ts:1-4` (header comment)

- [ ] **Step 1: Implement**

`packages/cli/lab.sh`, replace the server line:

```sh
# The server gets what it serves and nothing more: the network on this
# machine, reading its own directory and the store, writing the store only.
BOARDS=${ARROWZ_BOARDS_DIR:-$PWD/boards}
mkdir -p "$BOARDS"
deno run --allow-net=127.0.0.1 --allow-read=.,"$BOARDS" --allow-write="$BOARDS" --allow-env=ARROWZ_BOARDS_DIR \
  lab-server.ts "$PORT" &
```

`packages/cli/deno.json`:

```json
    "carve": "deno run --allow-read --allow-write --allow-env=ARROWZ_BOARDS_DIR,CARVE_TIMEOUT_S,CARVE_TRACE,GIANT_DEBUG carve.ts",
    "compile": "deno compile --allow-read --allow-write --allow-env=ARROWZ_BOARDS_DIR,CARVE_TIMEOUT_S,CARVE_TRACE,GIANT_DEBUG -o dist/carve carve.ts"
```

`packages/cli/lab-server.ts` header comment, last line:

```ts
// (GET list, POST save a board file, DELETE one) and /boards/. Run: deno task lab (lab.sh scopes the
// permissions: net on 127.0.0.1, read of packages/cli/ and the store, write of the store, one env var).
```

- [ ] **Step 2: Verify each process still runs with its narrowed permissions**

```bash
cd packages/cli
BOARDS=$(mktemp -d)
ARROWZ_BOARDS_DIR=$BOARDS deno run --allow-net=127.0.0.1 --allow-read=.,"$BOARDS" --allow-write="$BOARDS" --allow-env=ARROWZ_BOARDS_DIR lab-server.ts 8791 &
SRV=$!; sleep 2
curl -s -o /dev/null -w '%{http_code}\n' http://127.0.0.1:8791/lab.html        # 200
curl -s http://127.0.0.1:8791/api/boards                                         # []
curl -s -o /dev/null -w '%{http_code}\n' -H 'Host: evil.example' http://127.0.0.1:8791/api/boards   # 403
kill $SRV
cd ../..
ARROWZ_BOARDS_DIR=$(mktemp -d) deno task carve --width=10 --height=10 --svg      # a board and its SVG saved
CARVE_TRACE=1 deno task carve --width=10 --height=10 --dry-run > /dev/null        # no NotCapable error
deno task carve --help > /dev/null
deno task test
```

Expected: the codes in the comments, no `NotCapable`/`PermissionDenied` error, tests PASS. If the server fails because a module it imports reads an env var or a file, add that one name to the list and note it in the comment above the line.

- [ ] **Step 3: Commit**

```bash
git add packages/cli/lab.sh packages/cli/deno.json packages/cli/lab-server.ts
git commit -m "The lab server runs with the network on 127.0.0.1, read of its directory and the store, and write of the store only; the CLI reads its four environment variables by name"
```

---

### Task 6: CI pinned by SHA, Dependabot for actions, credential ignores, hooks documented

**Files:**
- Modify: `.github/workflows/ci.yml:20,25,29,31,39,55`
- Create: `.github/dependabot.yml`
- Modify: `.gitignore`
- Modify: `README.md` ("Where things live", `:1008`), `README.pl.md` (the matching section)

- [ ] **Step 1: Implement**

`.github/workflows/ci.yml` — each `uses:` pinned to the commit its tag points at today (resolved 2026-09-11 with `gh api repos/<repo>/commits/<tag> --jq .sha`):

```yaml
      - uses: actions/checkout@3d3c42e5aac5ba805825da76410c181273ba90b1 # v7
      - uses: denoland/setup-deno@22d081ff2d3a40755e97629de92e3bcbfa7cf2ed # v2
      - uses: pnpm/action-setup@b906affcce14559ad1aafd4ab0e942779e9f58b1 # v4
      - uses: actions/setup-node@249970729cb0ef3589644e2896645e5dc5ba9c38 # v6
        uses: actions/cache@55cc8345863c7cc4c66a329aec7e433d2d1c52a9 # v6
      - uses: nrwl/nx-set-shas@afb73a62d26e41464e9254689e1fd6122ee683c1 # v5
```

(keep every `with:` block as it is). Re-resolve the six SHAs with the command above before editing; if one differs, use the fresh value.

`.github/dependabot.yml`:

```yaml
# The workflow pins actions by commit; Dependabot proposes the new commit when a tag moves.
version: 2
updates:
  - package-ecosystem: github-actions
    directory: /
    schedule:
      interval: weekly
```

`.gitignore`, append:

```
# Credentials never enter the repository (the Firebase slice brings a service account).
.env
.env.*
*service-account*.json
*serviceAccount*.json
```

`README.md`, in "Where things live", add a paragraph:

```markdown
Opening the repository in Claude Code runs `jbcontext index` through the hooks in
`.claude/settings.json` (at the start and end of a session), and `.mcp.json`
starts `jbcontext mcp`. Both run a program installed on your machine, so read
them before you trust the folder.
```

`README.pl.md`, the same paragraph in Polish in the matching section:

```markdown
Otwarcie repozytorium w Claude Code uruchamia `jbcontext index` przez hooki w
`.claude/settings.json` (na początku i na końcu sesji), a `.mcp.json`
uruchamia `jbcontext mcp`. Oba wywołują program zainstalowany na Twoim
komputerze, więc przejrzyj je, zanim zaufasz temu katalogowi.
```

- [ ] **Step 2: Verify**

```bash
grep -n 'uses:' .github/workflows/ci.yml       # six lines, each @<40 hex> # vN
git check-ignore -v .env .env.local a-service-account.json   # all three ignored
deno task verify
```

Expected: six pinned lines, three ignore matches, verify PASS.

- [ ] **Step 3: Commit**

```bash
git add .github .gitignore README.md README.pl.md
git commit -m "CI actions are pinned by commit with Dependabot watching them, credentials are ignored ahead of the Firebase slice, and the READMEs say which hooks the repository runs"
```

---

## After the tasks

1. Whole-branch review (every finding F1–F11 of the spec traced to a change and a test; no board output changed: `git diff main --stat -- packages/engine/fingerprints.json packages/engine/svg-golden.json` is empty).
2. `deno task verify` and `pnpm nx run-many -t verify`.
3. Live check in Chrome: `sh packages/cli/lab.sh`; the console shows no CSP violation while generating a board, opening the Library, recolouring a stored board (the view save POST), deleting one, exporting an SVG and switching language. Then write a meta file into the store by hand with `"source": "<img src=x onerror=console.log('xss')>"` and open the Library: the text shows literally and nothing logs.
4. PR `fix/security-hardening` → `main`.
