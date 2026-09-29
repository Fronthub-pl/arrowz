# Jev Guards Implementation Plan

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:subagent-driven-development (recommended) or superpowers:executing-plans to implement this plan task-by-task. Steps use checkbox (`- [ ]`) syntax for tracking.

**Goal:** Advisory Claude Code hooks that ask Jev (TypeSafe System One) whether a new comment, a commit message or pull request body, or a Polish dictionary string breaks a written rule of this repository, and report the answer without ever blocking.

**Architecture:** `packages/cli/scripts/jev-client.ts` is the only code that knows HTTP and the key; `jev-guard.ts` holds three guards as functions over an injected `Judge`, plus a `hook` mode that reads Claude Code's hook JSON from stdin; `jev-eval.ts` re-measures each guard on labelled data from git. `commentLines` moves out of a test file into `packages/engine/comment-lines.ts` so both comment guards share one extractor.

**Tech Stack:** Deno 2.9 (TypeScript, `deno test`, `@std/path`, `@std/assert`), the TypeSafe HTTP API (`POST https://api.typesafe.ai/v1/systemone`, model `jev-1.13.0`), Claude Code hooks in `.claude/settings.json`.

**Spec:** `docs/superpowers/specs/2026-09-29-jev-guards-design.md` (commit `f8db56b`). Read it before Task 1.

Two refinements of the spec, both forced by facts checked while planning: the hook command reads from `$CLAUDE_PROJECT_DIR` (plus `/tmp` for `git commit -F` files) instead of `.`, because hooks run in whatever directory the session has `cd`-ed into; and a `Write` judges at most 120 comment blocks, because the hook's timeout is 10 s (Review Focus 5).

## Global Constraints

- Everything in the repository is English: code, comments, test names, docs, commit messages. No Polish text in any new file; tests and fixtures that need Polish take it from `PL` at run time or spell characters as `\u` escapes.
- Code style: `deno fmt` (single quotes, no semicolons, line width 120); `deno lint` with `no-explicit-any` and `no-non-null-assertion`; `strict`, `noUncheckedIndexedAccess`, `exactOptionalPropertyTypes`.
- Comments follow `CLAUDE.md` "Comments": say why, once; one line by default; no history, no task or review references; cite symbols, never `file.ts:NN`.
- The model is pinned: `jev-1.13.0`, never `jev-latest`.
- Code in this plan that spells `\uXXXX` must reach disk as those six ASCII characters. The Write tool decodes JSON escapes into real letters, so after writing such a file run `grep -nP "[\x{0105}\x{0107}\x{0119}\x{0142}\x{0144}\x{00f3}\x{015b}\x{017a}\x{017c}\x{0141}]" <file>` and turn any hit back into its `\u` escape (with `sed` or `python3`) before running tests.
- Deno 2.9.7 types `setTimeout` as returning `Timeout`: annotate a stored timer as `ReturnType<typeof setTimeout>`.
- Smoke payloads with `\n` inside JSON go through `printf '%s' '…'`, never `echo`: zsh's `echo` turns `\n` into a newline and the hook silently drops the broken JSON.
- No network call inside `deno test`: every test stubs `fetch` or `Judge`. No file named `*.test.ts` may reach `api.typesafe.ai`.
- Every hook failure (missing key, network, HTTP error, timeout, malformed payload, unreadable file) prints nothing and exits 0. No hook ever returns `permissionDecision` or exits 2.
- Client deadline: 8000 ms across attempts, at most 5000 ms per attempt, up to 4 attempts, backoff 250 ms doubling on 429 and 529. Hook `timeout`: 10 (seconds).
- Key file: `ARROWZ_TYPESAFE_ENV`, default `$HOME/.config/arrowz/typesafe.env`, variable `TYPESAFE_API_KEY`. The mount is a FIFO: never test it with `stat().isFile`.
- Comment guard: blocks of at most 6 lines plus trailing comments; flag when `violates > 0.85` or `max(history, spec_ref) > 0.9`.
- Output: at most 5 flags, highest `p` first, English, prefix `jev: `.
- Commits: no attribution lines (`CLAUDE.md`).
- Gates after every task: `deno task test` from the worktree root; before the branch is done: `deno task verify` and `pnpm nx run-many -t verify`.

## Review Focus

1. **A `Write` payload names its text `content`**: the hook must judge `tool_input.content`, and fall back to reading the file. Pinned in Task 6 (`hook: a Write is judged from its content`); confirmed live in Task 8 Step 6.
2. **An `Edit` whose `new_string` occurs twice in the file, or not at all** (a `replace_all`): line numbers cannot be known; the flag must say `(edit, line N)` instead of a wrong `file:line`. Pinned in Task 6.
3. **A chained command** (`cd x && git commit -m "…" && git push`): only the commit's own words are the message. Pinned in Task 4.
4. **1Password locked while the key FIFO is read**: the read blocks; `readKey` must give up after 2 s so the hook stays silent instead of hanging to its timeout. Pinned in Task 2.
5. **A `Write` of a file with more comment blocks than can be judged in 10 s**: at most 120 requests, 16 at a time, and a note saying how many were not checked. Pinned in Task 3.

---

## File Structure

| File | Responsibility |
|---|---|
| `packages/engine/comment-lines.ts` (create) | `commentLines`, `CommentLine`, new `commentBlocks`, `CommentBlock`: pure comment extraction, moved from `comments.test.ts` |
| `packages/engine/comment-lines.test.ts` (create) | tests of `commentBlocks` |
| `packages/engine/comments.test.ts` (modify) | imports the extractor; `offences` uses `commentBlocks` |
| `packages/engine/neutral.test.ts` (modify) | `comment-lines.ts` joins `NEUTRAL` |
| `packages/engine/deno.json` (modify) | export `./comment-lines` for Deno only (`tsconfig.build.json` keeps it out of `dist`) |
| `packages/cli/scripts/jev-client.ts` (create) | key reading, `makeJudge`, `defaultJudge` |
| `packages/cli/scripts/jev-client.test.ts` (create) | stubbed-`fetch` tests |
| `packages/cli/scripts/jev-guard.ts` (create) | guards, formatting, hook dispatch, CLI |
| `packages/cli/scripts/jev-guard.test.ts` (create) | stubbed-`Judge` tests, one subprocess test |
| `packages/cli/scripts/jev-eval.ts` (create) | labelled sets, metrics, threshold pick, CLI |
| `packages/cli/scripts/jev-eval.test.ts` (create) | offline metric and fixture tests |
| `.claude/settings.json` (modify) | `PreToolUse` and `PostToolUse` hooks |
| `deno.json` (modify) | tasks `jev` and `jev:eval` |
| `docs/jev-guards.md` (create) | setup, measured figures, re-measuring |
| `CLAUDE.md` (modify) | one line under "Packages" |

**Before Task 1 (controller, done 2026-09-29):** the 1Password Environment "TypeSafe AI" is mounted at `$HOME/.config/arrowz/typesafe.env` (a FIFO holding `TYPESAFE_API_KEY`). Only Task 8 needs it.

---

### Task 1: Move the comment extractor into `comment-lines.ts`

**Files:**
- Create: `packages/engine/comment-lines.ts`, `packages/engine/comment-lines.test.ts`
- Modify: `packages/engine/comments.test.ts` (the extractor now at the top, from `type Line` through the end of `commentLines`; the block loop in `offences`), `packages/engine/neutral.test.ts` (`NEUTRAL`), `packages/engine/deno.json` (`exports`)

**Interfaces:**
- Produces: `export type CommentLine = { line: number; text: string; alone: boolean }`; `export function commentLines(source: string, css = false): CommentLine[]` (unchanged behaviour: `text` excludes the `//`, `/*`, `*/` markers; `alone` is true when the line holds no code but braces); `export type CommentBlock = { start: number; end: number; text: string }` (1-based, inclusive; `text` is the lines' `text` joined by `\n`); `export function commentBlocks(source: string, css = false): CommentBlock[]`. Import path for other packages: `@arrowz/engine/comment-lines`.

- [ ] **Step 1: Write the failing test**

Create `packages/engine/comment-lines.test.ts`:

```ts
import { assertEquals } from '@std/assert'
import { commentBlocks } from './comment-lines.ts'

Deno.test('commentBlocks: consecutive comment-only lines form one block', () => {
  const src = 'const a = 1\n// one\n// two\nconst b = 2\n// three\n'
  assertEquals(commentBlocks(src), [
    { start: 2, end: 3, text: ' one\n two' },
    { start: 5, end: 5, text: ' three' },
  ])
})

Deno.test('commentBlocks: a trailing comment is not part of any block', () => {
  assertEquals(commentBlocks('// head\nconst a = 1 // tail\n// next'), [
    { start: 1, end: 1, text: ' head' },
    { start: 3, end: 3, text: ' next' },
  ])
})

Deno.test('commentBlocks: a /* */ block spans its lines', () => {
  assertEquals(commentBlocks('/**\n * Doc.\n */\nexport const x = 1').map((b) => [b.start, b.end]), [[1, 3]])
})
```

- [ ] **Step 2: Run test to verify it fails**

Run: `deno test --allow-read packages/engine/comment-lines.test.ts`
Expected: FAIL, module `./comment-lines.ts` not found.

- [ ] **Step 3: Move the extractor and add `commentBlocks`**

Create `packages/engine/comment-lines.ts`. Its first lines:

```ts
// Comment text of TS/TSX and CSS sources, line by line: the extractor behind the
// comment guard (`comments.test.ts`) and the Jev comment guard.
```

Then move, **verbatim and in order**, everything in `packages/engine/comments.test.ts` from `type Line = { comment: string; code: string; inComment: boolean }` through the closing `}` of `export function commentLines` (the `REGEX_AFTER` and `REGEX_KEYWORDS` constants and their comments go with it). Delete those lines from `comments.test.ts`. Then append to `comment-lines.ts`:

```ts
/** A run of consecutive comment-only lines, 1-based and inclusive. */
export type CommentBlock = { start: number; end: number; text: string }

/** Comment-only lines grouped into blocks, in line order; trailing comments belong to none. */
export function commentBlocks(source: string, css = false): CommentBlock[] {
  const blocks: CommentBlock[] = []
  let cur: CommentBlock | null = null
  for (const c of commentLines(source, css)) {
    if (!c.alone) continue
    if (cur !== null && c.line === cur.end + 1) {
      cur.end = c.line
      cur.text += `\n${c.text}`
      continue
    }
    if (cur !== null) blocks.push(cur)
    cur = { start: c.line, end: c.line, text: c.text }
  }
  if (cur !== null) blocks.push(cur)
  return blocks
}
```

In `packages/engine/comments.test.ts`, add below the `@std/assert` import:

```ts
import { commentBlocks, commentLines } from './comment-lines.ts'
```

and replace the block-grouping part of `offences` (from `const src = source.split('\n')` through the final `close()` call) with:

```ts
  const src = source.split('\n')
  let firstBlock = true
  for (const b of commentBlocks(source, css)) {
    const size = b.end - b.start + 1
    const jsdoc = src.slice(b.start - 1, b.end).some((l) => l.trim().startsWith('/**'))
    const after = src.slice(b.end).find((l) => l.trim() !== '')
    const header = firstBlock || (jsdoc && after !== undefined && isDeclaration(after))
    const max = header ? MAX_HEADER : MAX_BLOCK
    if (size > max) {
      const label = header ? 'header block' : 'block'
      found.push({ line: b.start, kind: 'block', what: `${label} of ${size} lines (max ${max})` })
    }
    firstBlock = false
  }
```

Keep the comment line above it (`// A block is a run of consecutive comment-only lines. …`) in place.

In `packages/engine/neutral.test.ts` add `'comment-lines.ts',` to `NEUTRAL` after `'board-file.ts',`.

In `packages/engine/deno.json` add to `exports`, after `"./docs": "./lab-docs.ts"`: `"./comment-lines": "./comment-lines.ts"`. Do **not** touch `package.json` or `tsconfig.build.json`.

- [ ] **Step 4: Run tests to verify they pass**

Run: `deno task test`
Expected: PASS, including every `comments.test.ts` case unchanged and the three new `commentBlocks` cases.

Mutation check (then revert): in `commentBlocks` change `c.line === cur.end + 1` to `c.line === cur.end + 2`. Expected: the first new test fails. Revert.

- [ ] **Step 5: Check the build is unchanged**

Run: `grep -c comment-lines packages/engine/tsconfig.build.json packages/engine/package.json`
Expected: `0` for both: `tsconfig.build.json` lists the emitted files by name, so `comment-lines.ts` stays out of `dist` and the Node exports are unchanged (no `node_modules` needed for this check).

- [ ] **Step 6: Commit**

```bash
deno fmt packages/engine/comment-lines.ts packages/engine/comment-lines.test.ts packages/engine/comments.test.ts packages/engine/neutral.test.ts packages/engine/deno.json
git add packages/engine/comment-lines.ts packages/engine/comment-lines.test.ts packages/engine/comments.test.ts packages/engine/neutral.test.ts packages/engine/deno.json
git commit -m "Engine: the comment extractor leaves the test file as comment-lines.ts

A test file cannot be imported without registering its tests again, and the
Jev comment guard needs the same extractor and the same idea of a block."
```

---

### Task 2: `jev-client.ts`

**Files:**
- Create: `packages/cli/scripts/jev-client.ts`, `packages/cli/scripts/jev-client.test.ts`

**Interfaces:**
- Produces:
  - `export const MODEL = 'jev-1.13.0'`, `export const ENDPOINT = 'https://api.typesafe.ai/v1/systemone'`
  - `export type Noul = { type: 'noul'; instructions: string; criteria?: { true: string; false: string } }`
  - `export type Answers = Record<string, number>` (question id → probability of yes)
  - `export type Judge = (state: unknown, questions: Record<string, Noul>) => Promise<Answers | null>`
  - `export function keyPath(): string`
  - `export function parseKey(text: string): string | null`
  - `export function readKey(path?: string, timeoutMs?: number, read?: (p: string) => Promise<string>): Promise<string | null>`
  - `export type ClientOptions = { key: string; fetch?: typeof fetch; deadlineMs?: number; attemptMs?: number; backoffMs?: number }`
  - `export function makeJudge(opts: ClientOptions): Judge`
  - `export function defaultJudge(): Promise<Judge | null>`

- [ ] **Step 1: Write the failing tests**

Create `packages/cli/scripts/jev-client.test.ts`:

```ts
import { assertEquals } from '@std/assert'
import { ENDPOINT, makeJudge, MODEL, type Noul, parseKey, readKey } from './jev-client.ts'

const Q: Record<string, Noul> = { a: { type: 'noul', instructions: 'Is it?' } }
const ok = (answers: unknown) => new Response(JSON.stringify({ answers }), { status: 200 })

function stub(responses: Array<Response | Error>) {
  const calls: Array<{ url: string; init: RequestInit | undefined }> = []
  const f: typeof fetch = (input, init) => {
    calls.push({ url: String(input), init })
    const r = responses.shift()
    if (r === undefined) return Promise.reject(new Error('no response left'))
    return r instanceof Error ? Promise.reject(r) : Promise.resolve(r)
  }
  return { f, calls }
}

Deno.test('parseKey: the value of TYPESAFE_API_KEY, comments and quotes ignored', () => {
  assertEquals(parseKey('# mounted\nOTHER=1\nTYPESAFE_API_KEY="abc"\n'), 'abc')
  assertEquals(parseKey('export TYPESAFE_API_KEY=xyz'), 'xyz')
  assertEquals(parseKey('TYPESAFE_API_KEY=\n'), null)
  assertEquals(parseKey('# nothing here'), null)
})

Deno.test('readKey: a missing file gives null', async () => {
  assertEquals(await readKey('/nonexistent/typesafe.env'), null)
})

Deno.test('readKey: a read that never ends (a locked 1Password FIFO) gives null in time', async () => {
  const t0 = Date.now()
  assertEquals(await readKey('x', 30, () => new Promise<string>(() => {})), null)
  assertEquals(Date.now() - t0 < 1000, true)
})

Deno.test('judge: posts the pinned model, the state and the questions with the bearer key', async () => {
  const { f, calls } = stub([ok({ a: { type: 'noul', noul: 0.25 } })])
  assertEquals(await makeJudge({ key: 'k1', fetch: f })({ text: 'hi' }, Q), { a: 0.25 })
  assertEquals(calls[0]?.url, ENDPOINT)
  const headers = new Headers(calls[0]?.init?.headers)
  assertEquals(headers.get('authorization'), 'Bearer k1')
  assertEquals(JSON.parse(String(calls[0]?.init?.body)), { model: MODEL, state: { text: 'hi' }, questions: Q })
})

Deno.test('judge: retries 429 and 529, then answers', async () => {
  const { f, calls } = stub([
    new Response('', { status: 429 }),
    new Response('', { status: 529 }),
    ok({ a: { noul: 0.9 } }),
  ])
  assertEquals(await makeJudge({ key: 'k', fetch: f, backoffMs: 1 })({}, Q), { a: 0.9 })
  assertEquals(calls.length, 3)
})

Deno.test('judge: any other failure is null, not an exception', async () => {
  for (const r of [new Response('no', { status: 401 }), new Response('bad', { status: 422 }), new Error('offline')]) {
    assertEquals(await makeJudge({ key: 'k', fetch: stub([r]).f })({}, Q), null)
  }
  assertEquals(await makeJudge({ key: 'k', fetch: stub([ok({ a: { noul: 'x' } })]).f })({}, Q), null)
  assertEquals(await makeJudge({ key: 'k', fetch: stub([ok({})]).f })({}, Q), null)
})

Deno.test('judge: a request that hangs is abandoned at the deadline', async () => {
  const hang: typeof fetch = (_input, init) =>
    new Promise((_ok, no) => init?.signal?.addEventListener('abort', () => no(new Error('aborted'))))
  const t0 = Date.now()
  assertEquals(await makeJudge({ key: 'k', fetch: hang, deadlineMs: 60, attemptMs: 40 })({}, Q), null)
  assertEquals(Date.now() - t0 < 1000, true)
})
```

- [ ] **Step 2: Run tests to verify they fail**

Run: `deno test --allow-read packages/cli/scripts/jev-client.test.ts`
Expected: FAIL, module `./jev-client.ts` not found.

- [ ] **Step 3: Write the implementation**

Create `packages/cli/scripts/jev-client.ts`:

```ts
// Jev (TypeSafe System One) over HTTP: the only module that knows the endpoint and the key.
// Every failure is `null`, because the guards built on it must never break the work they watch.

export const MODEL = 'jev-1.13.0'
export const ENDPOINT = 'https://api.typesafe.ai/v1/systemone'

export type Noul = { type: 'noul'; instructions: string; criteria?: { true: string; false: string } }
/** Question id → probability of yes. */
export type Answers = Record<string, number>
export type Judge = (state: unknown, questions: Record<string, Noul>) => Promise<Answers | null>

export function keyPath(): string {
  return Deno.env.get('ARROWZ_TYPESAFE_ENV') ?? `${Deno.env.get('HOME') ?? ''}/.config/arrowz/typesafe.env`
}

/** The value of `TYPESAFE_API_KEY` in a `.env` text, quotes stripped; null when absent or empty. */
export function parseKey(text: string): string | null {
  for (const line of text.split('\n')) {
    const m = /^\s*(?:export\s+)?TYPESAFE_API_KEY\s*=\s*(.*?)\s*$/.exec(line)
    if (!m) continue
    const value = (m[1] ?? '').replace(/^(['"])(.*)\1$/, '$2')
    return value === '' ? null : value
  }
  return null
}

// The mount is a FIFO served by 1Password; while the app is locked a read blocks, so it is raced.
export async function readKey(
  path = keyPath(),
  timeoutMs = 2000,
  read: (p: string) => Promise<string> = (p) => Deno.readTextFile(p),
): Promise<string | null> {
  let timer: ReturnType<typeof setTimeout> | undefined
  const late = new Promise<null>((ok) => {
    timer = setTimeout(() => ok(null), timeoutMs)
  })
  try {
    const text = await Promise.race([read(path), late])
    return text === null ? null : parseKey(text)
  } catch {
    return null
  } finally {
    clearTimeout(timer)
  }
}

export type ClientOptions = {
  key: string
  fetch?: typeof fetch
  deadlineMs?: number
  attemptMs?: number
  backoffMs?: number
}

const ATTEMPTS = 4

function parseAnswers(body: unknown, ids: string[]): Answers | null {
  if (typeof body !== 'object' || body === null) return null
  const answers = (body as { answers?: unknown }).answers
  if (typeof answers !== 'object' || answers === null) return null
  const out: Answers = {}
  for (const id of ids) {
    const a = (answers as Record<string, unknown>)[id]
    const p = typeof a === 'object' && a !== null ? (a as { noul?: unknown }).noul : undefined
    if (typeof p !== 'number' || !Number.isFinite(p)) return null
    out[id] = p
  }
  return out
}

export function makeJudge(opts: ClientOptions): Judge {
  const doFetch = opts.fetch ?? fetch
  const deadlineMs = opts.deadlineMs ?? 8000
  const attemptMs = opts.attemptMs ?? 5000
  const backoffMs = opts.backoffMs ?? 250
  return async (state, questions) => {
    const end = Date.now() + deadlineMs
    const body = JSON.stringify({ model: MODEL, state, questions })
    for (let attempt = 0; attempt < ATTEMPTS; attempt++) {
      const left = end - Date.now()
      if (left <= 0) return null
      const abort = new AbortController()
      const timer = setTimeout(() => abort.abort(), Math.min(attemptMs, left))
      try {
        const res = await doFetch(ENDPOINT, {
          method: 'POST',
          headers: { authorization: `Bearer ${opts.key}`, 'content-type': 'application/json' },
          body,
          signal: abort.signal,
        })
        if (res.status === 429 || res.status === 529) {
          await res.body?.cancel()
          const wait = backoffMs * 2 ** attempt
          if (Date.now() + wait >= end) return null
          await new Promise((ok) => setTimeout(ok, wait))
          continue
        }
        if (!res.ok) {
          await res.body?.cancel()
          return null
        }
        return parseAnswers(await res.json(), Object.keys(questions))
      } catch {
        return null
      } finally {
        clearTimeout(timer)
      }
    }
    return null
  }
}

export async function defaultJudge(): Promise<Judge | null> {
  const key = await readKey()
  return key === null ? null : makeJudge({ key })
}
```

- [ ] **Step 4: Run tests to verify they pass**

Run: `deno test --allow-read packages/cli/scripts/jev-client.test.ts && deno task test`
Expected: PASS.

Mutation checks (one at a time, each then reverted):
- In `readKey`, replace `Promise.race([read(path), late])` with `read(path)`. Expected: the FIFO test hangs or fails.
- In `makeJudge`, change `res.status === 429 || res.status === 529` to `res.status === 429`. Expected: the retry test fails (null instead of `{ a: 0.9 }`).
- In `parseAnswers`, delete the `typeof p !== 'number'` check. Expected: the "any other failure" test fails.

- [ ] **Step 5: Commit**

```bash
deno fmt packages/cli/scripts/jev-client.ts packages/cli/scripts/jev-client.test.ts
git add packages/cli/scripts/jev-client.ts packages/cli/scripts/jev-client.test.ts
git commit -m "CLI scripts: a Jev client that answers or stays silent

The guards built on it run inside Claude Code hooks, so a missing key, a
locked 1Password mount, an HTTP error or a slow answer must end as null
within 8 seconds, never as an exception."
```

---

### Task 3: `jev-guard.ts` core and the comment guard

**Files:**
- Create: `packages/cli/scripts/jev-guard.ts`, `packages/cli/scripts/jev-guard.test.ts`

**Interfaces:**
- Consumes: `commentBlocks`, `commentLines` from `@arrowz/engine/comment-lines` (Task 1); `Answers`, `Judge`, `Noul` from `./jev-client.ts` (Task 2).
- Produces:
  - `export type Flag = { where: string; question: string; p: number; excerpt: string }`
  - `export const MAX_FLAGS = 5`, `export const MAX_COMMENT_REQUESTS = 120`, `export const VIOLATES_AT = 0.85`, `export const HISTORY_AT = 0.9`
  - `export type Shipped = { comments: boolean; message: boolean; i18n: boolean }`, `export const SHIPPED: Shipped` (Task 8 sets the final values; the dictionary guard is off by decision)
  - `export function pool<T, R>(items: T[], limit: number, fn: (item: T) => Promise<R>): Promise<R[]>`
  - `export function excerpt(text: string, max?: number): string`
  - `export function format(title: string, flags: Flag[], note?: string): string | null`
  - `export function ruleSection(markdown: string, heading: string): string | null`
  - `export type Commented = { line: number; text: string; code: string }`
  - `export function commentsOf(source: string, css: boolean): Commented[]`
  - `export const COMMENT_QUESTIONS: Record<string, Noul>`
  - `export function askComment(judge: Judge, rule: string, file: string, c: Commented): Promise<Answers | null>`
  - `export function commentFlag(where: string, c: Commented, a: Answers): Flag | null`
  - `export function comments(judge: Judge, rule: string, file: string, source: string, place: (line: number) => string): Promise<{ flags: Flag[]; skipped: number }>`
  - `export function commentReport(r: { flags: Flag[]; skipped: number }): string | null`

- [ ] **Step 1: Write the failing tests**

Create `packages/cli/scripts/jev-guard.test.ts`:

```ts
import { assertEquals, assertStringIncludes } from '@std/assert'
import type { Answers, Judge } from './jev-client.ts'
import {
  commentFlag,
  commentReport,
  comments,
  commentsOf,
  excerpt,
  type Flag,
  format,
  MAX_COMMENT_REQUESTS,
  ruleSection,
} from './jev-guard.ts'

export function stubJudge(answer: (state: Record<string, unknown>) => Answers | null) {
  const calls: Record<string, unknown>[] = []
  const judge: Judge = (state) => {
    const s = state as Record<string, unknown>
    calls.push(s)
    return Promise.resolve(answer(s))
  }
  return { judge, calls }
}

const quiet = { violates: 0.1, history: 0.1, spec_ref: 0.1 }

Deno.test('ruleSection: one ## section, up to the next top-level or second-level heading', () => {
  const md = '# Rules\n## Language\nen\n## Comments\nsay why\n\n### Detail\nkept\n## Next\nno\n# Tools\nno'
  assertEquals(ruleSection(md, 'Comments'), '## Comments\nsay why\n\n### Detail\nkept')
  assertEquals(ruleSection(md, 'Missing'), null)
})

Deno.test('commentsOf: short blocks and trailing comments, with the code that follows', () => {
  const long = Array.from({ length: 7 }, (_, i) => `// long ${i}`).join('\n')
  const src = `// short one\n// short two\nconst a = 1\n${long}\nconst b = 2 // tail\n`
  assertEquals(commentsOf(src, false), [
    { line: 1, text: ' short one\n short two', code: 'const a = 1' },
    { line: 11, text: ' tail', code: 'const b = 2 // tail' },
  ])
})

Deno.test('commentFlag: past a threshold, named after the question with the highest p', () => {
  const c = { line: 1, text: 'x', code: '' }
  assertEquals(commentFlag('f:1', c, { violates: 0.9, history: 0.95, spec_ref: 0.2 })?.question, 'history')
  assertEquals(commentFlag('f:1', c, { violates: 0.9, history: 0.1, spec_ref: 0.1 })?.question, 'violates')
  assertEquals(commentFlag('f:1', c, { violates: 0.5, history: 0.2, spec_ref: 0.93 })?.question, 'spec_ref')
})

Deno.test('commentFlag: exactly at a threshold is not a flag', () => {
  const c = { line: 1, text: 'x', code: '' }
  assertEquals(commentFlag('f:1', c, { violates: 0.85, history: 0.9, spec_ref: 0.9 }), null)
})

Deno.test('comments: no comment, no request', async () => {
  const { judge, calls } = stubJudge(() => quiet)
  assertEquals((await comments(judge, 'rule', 'a.ts', 'const a = 1\n', (l) => `a.ts:${l}`)).flags, [])
  assertEquals(calls.length, 0)
})

Deno.test('comments: each comment is asked with the rule, the file and the next line of code', async () => {
  const { judge, calls } = stubJudge(() => ({ violates: 0.9, history: 0.1, spec_ref: 0.1 }))
  const r = await comments(judge, 'RULE', 'a.ts', '\n// Ruling 5 said so\nconst a = 1\n', (l) => `a.ts:${l + 10}`)
  assertEquals(calls, [{ rule: 'RULE', file: 'a.ts', comment: 'Ruling 5 said so', code: 'const a = 1' }])
  assertEquals(r.flags, [{ where: 'a.ts:12', question: 'violates', p: 0.9, excerpt: ' Ruling 5 said so' }])
})

Deno.test('comments: an unanswered question is silence', async () => {
  const { judge } = stubJudge(() => null)
  assertEquals((await comments(judge, 'r', 'a.ts', '// x\n', String)).flags, [])
})

Deno.test('comments: a file with too many blocks is judged in part, and says so', async () => {
  const src = Array.from({ length: MAX_COMMENT_REQUESTS + 10 }, (_, i) => `// c${i}\nconst v${i} = ${i}`).join('\n')
  const { judge, calls } = stubJudge(() => quiet)
  const r = await comments(judge, 'r', 'a.ts', src, String)
  assertEquals(calls.length, MAX_COMMENT_REQUESTS)
  assertEquals(r.skipped, 10)
  const flagged = { flags: [{ where: 'a', question: 'violates', p: 0.9, excerpt: 'x' }], skipped: 10 }
  assertStringIncludes(commentReport(flagged) ?? '', '10 further comments were not checked')
})

Deno.test('format: highest p first, five at most, the rest counted', () => {
  const flags: Flag[] = [0.86, 0.99, 0.9, 0.95, 0.87, 0.97, 0.88].map((p, i) => ({
    where: `f:${i}`,
    question: 'violates',
    p,
    excerpt: `c${i}`,
  }))
  const out = format('title', flags) ?? ''
  const lines = out.split('\n')
  assertEquals(lines[0], 'jev: title:')
  assertEquals(lines[1], '- f:1  violates p=0.99  c1')
  assertEquals(lines.filter((l) => l.startsWith('- ')).length, 5)
  assertEquals(lines.at(-1), '(2 more not shown)')
  assertEquals(format('title', []), null)
})

Deno.test('excerpt: one line, cut at 80 characters', () => {
  assertEquals(excerpt('a\n  b'), 'a b')
  assertEquals(excerpt('x'.repeat(100)).length, 80)
  assertEquals(excerpt('x'.repeat(100)).endsWith('…'), true)
})
```

- [ ] **Step 2: Run tests to verify they fail**

Run: `deno test --allow-read packages/cli/scripts/jev-guard.test.ts`
Expected: FAIL, module `./jev-guard.ts` not found.

- [ ] **Step 3: Write the implementation**

Create `packages/cli/scripts/jev-guard.ts`:

```ts
// Advisory checks of the repository's written rules, answered by Jev: comments,
// commit messages and PR bodies, and the Polish dictionary. They report and never
// gate; thresholds are measured by jev-eval.ts (see docs/jev-guards.md).
import { commentBlocks, commentLines } from '@arrowz/engine/comment-lines'
import type { Answers, Judge, Noul } from './jev-client.ts'

export type Flag = { where: string; question: string; p: number; excerpt: string }

export const MAX_FLAGS = 5
// Longer blocks are the regex guard's (`MAX_BLOCK` in comments.test.ts).
const MAX_LINES = 6
// 120 requests at 16 at a time fit the hook's 10 s timeout at the measured ~0.35 s p95.
export const MAX_COMMENT_REQUESTS = 120
const CONCURRENCY = 16

export type Shipped = { comments: boolean; message: boolean; i18n: boolean }
// Which guards the hook runs; a guard that missed its measured bar stays off (docs/jev-guards.md).
export const SHIPPED: Shipped = { comments: true, message: true, i18n: false }

/** Runs `fn` over `items`, at most `limit` at a time, results in input order. */
export async function pool<T, R>(items: T[], limit: number, fn: (item: T) => Promise<R>): Promise<R[]> {
  const out: R[] = new Array(items.length)
  let next = 0
  const worker = async () => {
    while (next < items.length) {
      const i = next++
      out[i] = await fn(items[i] as T)
    }
  }
  await Promise.all(Array.from({ length: Math.min(limit, items.length) }, worker))
  return out
}

export function excerpt(text: string, max = 80): string {
  const one = text.replace(/\s+/g, ' ').trim()
  return one.length > max ? `${one.slice(0, max - 1)}…` : one
}

export function format(title: string, flags: Flag[], note?: string): string | null {
  if (flags.length === 0) return null
  const top = flags.slice().sort((a, b) => b.p - a.p).slice(0, MAX_FLAGS)
  const lines = top.map((f) => `- ${f.where}  ${f.question} p=${f.p.toFixed(2)}  ${excerpt(f.excerpt)}`)
  if (flags.length > top.length) lines.push(`(${flags.length - top.length} more not shown)`)
  if (note !== undefined) lines.push(note)
  return `jev: ${title}:\n${lines.join('\n')}`
}

/** One `## heading` section of a Markdown text, heading included; null when absent. */
export function ruleSection(markdown: string, heading: string): string | null {
  const lines = markdown.split('\n')
  const start = lines.findIndex((l) => l.trim() === `## ${heading}`)
  if (start === -1) return null
  let end = lines.length
  for (let i = start + 1; i < lines.length; i++) {
    if (/^#{1,2} /.test(lines[i] ?? '')) {
      end = i
      break
    }
  }
  return lines.slice(start, end).join('\n').trim()
}

export type Commented = { line: number; text: string; code: string }

/** Blocks of at most six lines and trailing comments, each with the line of code it sits on or above. */
export function commentsOf(source: string, css: boolean): Commented[] {
  const src = source.split('\n')
  const out: Commented[] = []
  for (const b of commentBlocks(source, css)) {
    if (b.end - b.start + 1 > MAX_LINES) continue
    const code = src.slice(b.end).find((l) => l.trim() !== '') ?? ''
    out.push({ line: b.start, text: b.text, code: code.trim() })
  }
  for (const c of commentLines(source, css)) {
    if (!c.alone) out.push({ line: c.line, text: c.text, code: (src[c.line - 1] ?? '').trim() })
  }
  return out.sort((a, b) => a.line - b.line)
}

export const COMMENT_QUESTIONS: Record<string, Noul> = {
  violates: {
    type: 'noul',
    instructions: 'A reviewer applying `rule` would rewrite or delete the `comment`.',
    criteria: {
      true: 'The comment breaks the rule in some way and would be changed.',
      false: 'The comment already follows the rule and would be kept as it is.',
    },
  },
  history: {
    type: 'noul',
    instructions:
      'The `comment` narrates the history of the work: a pull request, review round, fix round, task number, handoff, ruling, plan step, or how the code used to be.',
    criteria: {
      true: 'It refers to the process or past versions of the code.',
      false: 'It speaks only about the code as it is now.',
    },
  },
  spec_ref: {
    type: 'noul',
    instructions:
      "The `comment` points to a spec or plan section (such as 'spec §5.1' or 'Spec D2') instead of, or in addition to, stating the constraint in its own words.",
  },
}
export const VIOLATES_AT = 0.85
export const HISTORY_AT = 0.9

export function askComment(judge: Judge, rule: string, file: string, c: Commented): Promise<Answers | null> {
  return judge({ rule, file, comment: c.text.trim(), code: c.code }, COMMENT_QUESTIONS)
}

export function commentFlag(where: string, c: Commented, a: Answers): Flag | null {
  const fired: Array<[string, number]> = []
  const violates = a.violates ?? 0
  const history = a.history ?? 0
  const specRef = a.spec_ref ?? 0
  if (violates > VIOLATES_AT) fired.push(['violates', violates])
  if (Math.max(history, specRef) > HISTORY_AT) {
    fired.push(history >= specRef ? ['history', history] : ['spec_ref', specRef])
  }
  const best = fired.sort((x, y) => y[1] - x[1])[0]
  return best === undefined ? null : { where, question: best[0], p: best[1], excerpt: c.text }
}

export async function comments(
  judge: Judge,
  rule: string,
  file: string,
  source: string,
  place: (line: number) => string,
): Promise<{ flags: Flag[]; skipped: number }> {
  const all = commentsOf(source, file.endsWith('.css'))
  const checked = all.slice(0, MAX_COMMENT_REQUESTS)
  const answers = await pool(checked, CONCURRENCY, (c) => askComment(judge, rule, file, c))
  const flags: Flag[] = []
  checked.forEach((c, i) => {
    const a = answers[i]
    const f = a ? commentFlag(place(c.line), c, a) : null
    if (f) flags.push(f)
  })
  return { flags, skipped: all.length - checked.length }
}

export function commentReport(r: { flags: Flag[]; skipped: number }): string | null {
  const n = r.flags.length
  const note = r.skipped > 0 ? `(${r.skipped} further comments were not checked)` : undefined
  return format(`${n} comment${n === 1 ? '' : 's'} may break the comment rule (CLAUDE.md, Comments)`, r.flags, note)
}
```

- [ ] **Step 4: Run tests to verify they pass**

Run: `deno test --allow-read packages/cli/scripts/jev-guard.test.ts && deno task test`
Expected: PASS.

Mutation checks (one at a time, each reverted):
- `violates > VIOLATES_AT` → `violates >= VIOLATES_AT`. Expected: "exactly at a threshold" fails.
- In `commentsOf`, delete the `MAX_LINES` `continue`. Expected: the `commentsOf` test fails.
- In `comments`, replace `all.slice(0, MAX_COMMENT_REQUESTS)` with `all`. Expected: "too many blocks" fails.

- [ ] **Step 5: Commit**

```bash
deno fmt packages/cli/scripts/jev-guard.ts packages/cli/scripts/jev-guard.test.ts
git add packages/cli/scripts/jev-guard.ts packages/cli/scripts/jev-guard.test.ts
git commit -m "CLI scripts: the Jev comment guard

Asks violates, history and spec_ref about each short comment and flags at
the thresholds measured on the comment sweep (violates > 0.85: precision
0.98). Long blocks stay the regex guard's."
```

---

### Task 4: The message guard

**Files:**
- Modify: `packages/cli/scripts/jev-guard.ts` (append), `packages/cli/scripts/jev-guard.test.ts` (append)

**Interfaces:**
- Consumes: `Flag`, `format` (Task 3); `Answers`, `Judge`, `Noul` (Task 2).
- Produces:
  - `export type MessageKind = 'commit' | 'pr'`
  - `export function words(s: string): string[]`
  - `export function messageFromCommand(command: string, cwd: string, read: (path: string) => string | null): { kind: MessageKind; text: string } | null`
  - `export const MESSAGE_QUESTIONS: Record<string, Noul>` (one question, `not_english`), `export const MESSAGE_AT: { not_english: number }` (0.8)
  - `export function askMessage(judge: Judge, kind: MessageKind, text: string): Promise<Answers | null>`
  - `export function messageFlags(kind: MessageKind, text: string, a: Answers | null, at?: { not_english: number }): Flag[]`
  - `export function message(judge: Judge, kind: MessageKind, text: string): Promise<Flag[]>`
  - `export function messageReport(kind: MessageKind, flags: Flag[]): string | null`

- [ ] **Step 1: Write the failing tests**

Append to `packages/cli/scripts/jev-guard.test.ts` (and add `messageFlags`, `messageFromCommand`, `messageReport`, `message`, `words` to its import from `./jev-guard.ts`):

```ts
const noFiles = () => null

Deno.test('words: quotes, escapes, and a stop at the first control operator', () => {
  assertEquals(words(`-m "say \\"hi\\"" -q && git push`), ['-m', 'say "hi"', '-q'])
  assertEquals(words(`-m 'a b'; echo x`), ['-m', 'a b'])
  assertEquals(words('-m "unterminated'), ['-m'])
})

Deno.test('messageFromCommand: -m, repeated -m, -am and --message=', () => {
  assertEquals(messageFromCommand('git commit -m "Title"', '/r', noFiles), { kind: 'commit', text: 'Title' })
  assertEquals(messageFromCommand('git commit -m A -m "B c"', '/r', noFiles)?.text, 'A\n\nB c')
  assertEquals(messageFromCommand('git commit -am "All"', '/r', noFiles)?.text, 'All')
  assertEquals(messageFromCommand('git commit --message=Eq', '/r', noFiles)?.text, 'Eq')
})

Deno.test('messageFromCommand: a $(cat <<EOF) heredoc inside -m', () => {
  const cmd = `git commit -m "$(cat <<'EOF'\nTitle line\n\nWhy it matters.\nEOF\n)"`
  assertEquals(messageFromCommand(cmd, '/r', noFiles)?.text, 'Title line\n\nWhy it matters.')
})

Deno.test('messageFromCommand: only the commit of a chained command', () => {
  const cmd = 'cd packages && git add x && git commit -q -m "Only this" && git push origin HEAD'
  assertEquals(messageFromCommand(cmd, '/r', noFiles)?.text, 'Only this')
})

Deno.test('messageFromCommand: -F reads the file against cwd, -F - reads the stdin heredoc', () => {
  const read = (p: string) => (p === '/r/sub/msg.txt' ? 'From file' : null)
  assertEquals(messageFromCommand('git commit -F sub/msg.txt', '/r', read)?.text, 'From file')
  assertEquals(messageFromCommand("git commit -F - <<'EOF'\nPiped\nEOF", '/r', noFiles)?.text, 'Piped')
  assertEquals(messageFromCommand('git commit -F missing.txt', '/r', read), null)
})

Deno.test('messageFromCommand: gh pr create and edit bodies', () => {
  assertEquals(messageFromCommand('gh pr create --title T --body "Body"', '/r', noFiles), { kind: 'pr', text: 'Body' })
  assertEquals(messageFromCommand('gh pr edit 12 -b B2', '/r', noFiles)?.text, 'B2')
  const read = (p: string) => (p === '/tmp/b.md' ? 'File body' : null)
  assertEquals(messageFromCommand('gh pr create --body-file /tmp/b.md', '/r', read)?.text, 'File body')
})

Deno.test('messageFromCommand: nothing to read is null', () => {
  assertEquals(messageFromCommand('git commit --amend --no-edit', '/r', noFiles), null)
  assertEquals(messageFromCommand('git status', '/r', noFiles), null)
  assertEquals(messageFromCommand('gh pr view 3', '/r', noFiles), null)
})

Deno.test('messageFlags: an attribution line is flagged by code, without Jev', () => {
  const flags = messageFlags('commit', 'Fix\n\nCo-Authored-By: someone <a@b>', null)
  assertEquals(flags.map((f) => f.question), ['attribution'])
})

Deno.test('messageFlags: letters alone flag nothing, since messages may quote the Polish dictionary', () => {
  assertEquals(messageFlags('commit', 'Lab: the label now reads "\u0105\u0142"', null), [])
})

Deno.test('messageFlags: not_english strictly past its threshold', () => {
  const at = { not_english: 0.8 }
  assertEquals(messageFlags('pr', 'Update', { not_english: 0.85 }, at), [
    { where: 'PR body', question: 'not_english', p: 0.85, excerpt: 'Update' },
  ])
  assertEquals(messageFlags('pr', 'Update', { not_english: 0.8 }, at), [])
})

Deno.test('message: asks with the kind spelled out, and reports under the message title', async () => {
  const { judge, calls } = stubJudge(() => ({ not_english: 0.99 }))
  const flags = await message(judge, 'commit', 'Update')
  assertEquals(calls, [{ kind: 'commit message', text: 'Update' }])
  assertStringIncludes(messageReport('commit', flags) ?? '', 'the commit message may break the message rules')
})
```

- [ ] **Step 2: Run tests to verify they fail**

Run: `deno test --allow-read packages/cli/scripts/jev-guard.test.ts`
Expected: FAIL, `words` (and the rest) not exported.

- [ ] **Step 3: Write the implementation**

Add `import { isAbsolute, join } from '@std/path'` at the top of `jev-guard.ts`, then append:

```ts
export type MessageKind = 'commit' | 'pr'

/** Shell words of `s` up to the first unquoted `;`, `&`, `|` or newline; an unterminated quote ends the list. */
export function words(s: string): string[] {
  const out: string[] = []
  let cur = ''
  let has = false
  let i = 0
  while (i < s.length) {
    const c = s[i] ?? ''
    if (c === "'") {
      const end = s.indexOf("'", i + 1)
      if (end === -1) return out
      cur += s.slice(i + 1, end)
      has = true
      i = end + 1
      continue
    }
    if (c === '"') {
      i++
      let closed = false
      while (i < s.length) {
        const d = s[i] ?? ''
        const e = s[i + 1] ?? ''
        if (d === '\\' && '"\\$`'.includes(e) && e !== '') {
          cur += e
          i += 2
          continue
        }
        i++
        if (d === '"') {
          closed = true
          break
        }
        cur += d
      }
      if (!closed) return out
      has = true
      continue
    }
    if (c === '\\' && i + 1 < s.length) {
      cur += s[i + 1] ?? ''
      has = true
      i += 2
      continue
    }
    if (/\s/.test(c) || c === ';' || c === '&' || c === '|') {
      if (has) out.push(cur)
      cur = ''
      has = false
      if (c !== ' ' && c !== '\t') return out
      i++
      continue
    }
    cur += c
    has = true
    i++
  }
  if (has) out.push(cur)
  return out
}

const GIT_COMMIT = /\bgit\s+(?:-C\s+\S+\s+)?commit\b/
const GH_PR = /\bgh\s+pr\s+(?:create|edit)\b/
// `-m "$(cat <<'EOF' … EOF )"`: the message is the heredoc's body.
const SUBSTITUTED = /^\$\(\s*cat\s+<<-?\s*['"]?(\w+)['"]?\s*\n([\s\S]*?)\n[ \t]*\1[ \t]*\n?\s*\)$/
// `-F - <<'EOF'`: the message arrives on stdin.
const STDIN = /<<-?\s*['"]?(\w+)['"]?[^\n]*\n([\s\S]*?)\n[ \t]*\1[ \t]*(?:\n|$)/

const unwrap = (v: string) => SUBSTITUTED.exec(v)?.[2] ?? v

export function messageFromCommand(
  command: string,
  cwd: string,
  read: (path: string) => string | null,
): { kind: MessageKind; text: string } | null {
  const commit = GIT_COMMIT.exec(command)
  const hit = commit ?? GH_PR.exec(command)
  if (!hit) return null
  const kind: MessageKind = commit ? 'commit' : 'pr'
  const rest = command.slice(hit.index + hit[0].length)
  const ws = words(rest)
  const texts: string[] = []
  const fromFile = (path: string) => {
    if (path === '-') return STDIN.exec(rest)?.[2] ?? null
    return read(isAbsolute(path) ? path : join(cwd, path))
  }
  const textFlag = kind === 'commit' ? (w: string) => /^-[a-zA-Z]*m$/.test(w) || w === '--message' : (w: string) =>
    w === '--body' || w === '-b'
  const fileFlag = kind === 'commit' ? (w: string) => /^-[a-zA-Z]*F$/.test(w) || w === '--file' : (w: string) =>
    w === '--body-file' || w === '-F'
  const textEq = kind === 'commit' ? '--message=' : '--body='
  const fileEq = kind === 'commit' ? '--file=' : '--body-file='
  for (let i = 0; i < ws.length; i++) {
    const w = ws[i] ?? ''
    const next = ws[i + 1]
    if (textFlag(w) && next !== undefined) {
      texts.push(unwrap(next))
      i++
    } else if (fileFlag(w) && next !== undefined) {
      const t = fromFile(next)
      if (t !== null) texts.push(t)
      i++
    } else if (w.startsWith(textEq)) {
      texts.push(unwrap(w.slice(textEq.length)))
    } else if (w.startsWith(fileEq)) {
      const t = fromFile(w.slice(fileEq.length))
      if (t !== null) texts.push(t)
    }
  }
  const text = texts.join('\n\n').trim()
  return text === '' ? null : { kind, text }
}

export const MESSAGE_QUESTIONS: Record<string, Noul> = {
  not_english: {
    type: 'noul',
    instructions:
      'The `text` is written, fully or partly, in a language other than English, for example Polish with or without diacritics. Code identifiers, file names and quoted interface strings do not count.',
  },
}
// Measured by jev-eval.ts on jev-1.13.0 (docs/jev-guards.md).
export const MESSAGE_AT = { not_english: 0.8 }

const ATTRIBUTION = /^\s*(?:co-authored-by:|.*\bgenerated with\b).*$/im
// No Polish-letter rule: messages may quote the Polish dictionary, which a letter regex cannot tell from Polish prose.

const whereOf = (kind: MessageKind) => (kind === 'commit' ? 'commit message' : 'PR body')

export function askMessage(judge: Judge, kind: MessageKind, text: string): Promise<Answers | null> {
  return judge({ kind: kind === 'commit' ? 'commit message' : 'pull request description', text }, MESSAGE_QUESTIONS)
}

export function messageFlags(kind: MessageKind, text: string, a: Answers | null, at = MESSAGE_AT): Flag[] {
  const where = whereOf(kind)
  const first = text.split('\n').find((l) => l.trim() !== '') ?? ''
  const flags: Flag[] = []
  const attribution = ATTRIBUTION.exec(text)
  if (attribution) flags.push({ where, question: 'attribution', p: 1, excerpt: attribution[0] })
  const notEnglish = a?.not_english ?? 0
  if (notEnglish > at.not_english) flags.push({ where, question: 'not_english', p: notEnglish, excerpt: first })
  return flags
}

export async function message(judge: Judge, kind: MessageKind, text: string): Promise<Flag[]> {
  return messageFlags(kind, text, await askMessage(judge, kind, text))
}

export function messageReport(kind: MessageKind, flags: Flag[]): string | null {
  return format(`the ${whereOf(kind)} may break the message rules (CLAUDE.md)`, flags)
}
```

- [ ] **Step 4: Run tests to verify they pass**

Run: `deno test --allow-read packages/cli/scripts/jev-guard.test.ts && deno task test`
Expected: PASS.

Mutation checks (one at a time, each reverted):
- In `words`, change `if (c !== ' ' && c !== '\t') return out` to `i++; continue` only (never stop). Expected: the `words: quotes, escapes, and a stop…` test fails.
- Replace `unwrap(next)` with `next`. Expected: the heredoc test fails.
- In `messageFlags`, change `notEnglish > at.not_english` to `>=`. Expected: the "strictly past its threshold" test fails.

- [ ] **Step 5: Commit**

```bash
deno fmt packages/cli/scripts/jev-guard.ts packages/cli/scripts/jev-guard.test.ts
git add packages/cli/scripts/jev-guard.ts packages/cli/scripts/jev-guard.test.ts
git commit -m "CLI scripts: the Jev message guard for commits and PR bodies

Attribution lines are caught by code; whether the text is English is
Jev's question, because messages may quote the Polish dictionary and a
letter regex flagged 14 of 360 real messages for doing so."
```

---

### Task 5: The dictionary guard

**Files:**
- Modify: `packages/cli/scripts/jev-guard.ts` (append), `packages/cli/scripts/jev-guard.test.ts` (append)

**Interfaces:**
- Consumes: `Flag`, `format`, `pool` (Task 3); `EN`, `PL` from `@arrowz/engine/i18n`; `PARAM_SPEC`, `INACTIVE_REASONS`, `RULE_REASONS` from `@arrowz/engine` (both loaded by dynamic import so the other guards do not pay for the engine).
- Produces:
  - `export type Pair = { key: string; en: string; pl: string }`
  - `export function walkPairs(en: unknown, pl: unknown, prefix: string, out: Pair[]): void`
  - `export function dictionaryPairs(): Promise<Pair[]>`
  - `export const PAIR_QUESTIONS: Record<string, Noul>`, `export const DIFFERS_AT: number`
  - `export function askPair(judge: Judge, pair: Pair): Promise<Answers | null>`
  - `export function pairFlag(pair: Pair, a: Answers, at?: number): Flag | null`
  - `export function i18n(judge: Judge, pairs: Pair[]): Promise<Flag[]>`
  - `export function i18nReport(flags: Flag[]): string | null`

- [ ] **Step 1: Write the failing tests**

Append to `packages/cli/scripts/jev-guard.test.ts` (add `dictionaryPairs`, `i18n`, `i18nReport`, `pairFlag`, `type Pair`, `walkPairs` to the import):

```ts
Deno.test('walkPairs: string leaves by key path; functions and keys missing in PL are skipped', () => {
  const out: Pair[] = []
  walkPairs({ a: 'A', b: { c: 'C', f: () => 'x' }, gone: 'G' }, { a: 'a', b: { c: 'c', f: () => 'y' } }, '', out)
  assertEquals(out, [{ key: 'a', en: 'A', pl: 'a' }, { key: 'b.c', en: 'C', pl: 'c' }])
})

Deno.test('dictionaryPairs: the dictionary, the knob texts and the reasons, never an untranslated pair', async () => {
  const pairs = await dictionaryPairs()
  assertEquals(pairs.length > 300, true)
  assertEquals(pairs.some((p) => p.key === 'params.W.label'), true)
  assertEquals(pairs.some((p) => p.key.startsWith('reasons.')), true)
  assertEquals(pairs.some((p) => p.key.startsWith('ui.')), true)
  assertEquals(pairs.every((p) => p.en.trim() !== p.pl.trim()), true)
})

Deno.test('pairFlag: flagged as differs = 1 - same_meaning, strictly past the threshold', () => {
  const pair = { key: 'ui.x', en: 'Width', pl: 'y' }
  assertEquals(pairFlag(pair, { same_meaning: 0.2 }, 0.7), {
    where: 'lab-i18n.ts ui.x',
    question: 'differs',
    p: 0.8,
    excerpt: 'y',
  })
  assertEquals(pairFlag(pair, { same_meaning: 0.3 }, 0.7), null)
})

Deno.test('i18n: asks each pair with its key, English and Polish', async () => {
  const { judge, calls } = stubJudge(() => ({ same_meaning: 0.05 }))
  const flags = await i18n(judge, [{ key: 'k', en: 'E', pl: 'P' }])
  assertEquals(calls, [{ key: 'k', en: 'E', pl: 'P' }])
  assertStringIncludes(i18nReport(flags) ?? '', '1 Polish string may not say what the English says')
})
```

Note on the `pairFlag` expectation: `1 - 0.2` is `0.8` in floating point; if `assertEquals` reports `0.8000000000000000x`, round `p` in `pairFlag` with `Math.round((1 - s) * 1000) / 1000` (the implementation below already does).

- [ ] **Step 2: Run tests to verify they fail**

Run: `deno test --allow-read packages/cli/scripts/jev-guard.test.ts`
Expected: FAIL, `walkPairs` not exported.

- [ ] **Step 3: Write the implementation**

Append to `jev-guard.ts`:

```ts
export type Pair = { key: string; en: string; pl: string }

export function walkPairs(en: unknown, pl: unknown, prefix: string, out: Pair[]): void {
  if (typeof en === 'string') {
    if (typeof pl === 'string') out.push({ key: prefix, en, pl })
    return
  }
  if (typeof en !== 'object' || en === null || typeof pl !== 'object' || pl === null) return
  for (const [k, v] of Object.entries(en)) {
    walkPairs(v, (pl as Record<string, unknown>)[k], prefix === '' ? k : `${prefix}.${k}`, out)
  }
}

/** Every English source text with its Polish translation; identical pairs (units, symbols) left out. */
export async function dictionaryPairs(): Promise<Pair[]> {
  const { EN, PL } = await import('@arrowz/engine/i18n')
  const { PARAM_SPEC, INACTIVE_REASONS, RULE_REASONS } = await import('@arrowz/engine')
  const out: Pair[] = []
  walkPairs(EN, PL, '', out)
  for (const s of PARAM_SPEC) {
    const pl = (PL.params as Record<string, { label: string; help: string } | undefined>)[s.key]
    if (pl === undefined) continue
    out.push({ key: `params.${s.key}.label`, en: s.label, pl: pl.label })
    out.push({ key: `params.${s.key}.help`, en: s.help, pl: pl.help })
  }
  const reasons: Record<string, string> = { ...INACTIVE_REASONS, ...RULE_REASONS }
  for (const [k, en] of Object.entries(reasons)) {
    const pl = (PL.reasons as Record<string, string | undefined>)[k]
    if (pl !== undefined) out.push({ key: `reasons.${k}`, en, pl })
  }
  return out.filter((p) => p.en.trim() !== p.pl.trim())
}

export const PAIR_QUESTIONS: Record<string, Noul> = {
  same_meaning: {
    type: 'noul',
    instructions:
      'The Polish text `pl` says the same as the English text `en`: a reader of either learns the same facts, numbers, conditions and instructions.',
    criteria: {
      true: 'The two texts carry the same meaning, even if worded differently.',
      false: 'One text says something the other does not, or contradicts it.',
    },
  },
}
// Provisional; jev-eval.ts measures the final value (docs/jev-guards.md).
export const DIFFERS_AT = 0.7

export function askPair(judge: Judge, pair: Pair): Promise<Answers | null> {
  return judge({ key: pair.key, en: pair.en, pl: pair.pl }, PAIR_QUESTIONS)
}

export function pairFlag(pair: Pair, a: Answers, at = DIFFERS_AT): Flag | null {
  const differs = Math.round((1 - (a.same_meaning ?? 1)) * 1000) / 1000
  return differs > at ? { where: `lab-i18n.ts ${pair.key}`, question: 'differs', p: differs, excerpt: pair.pl } : null
}

export async function i18n(judge: Judge, pairs: Pair[]): Promise<Flag[]> {
  const checked = pairs.slice(0, MAX_COMMENT_REQUESTS)
  const answers = await pool(checked, CONCURRENCY, (p) => askPair(judge, p))
  const flags: Flag[] = []
  checked.forEach((p, i) => {
    const a = answers[i]
    const f = a ? pairFlag(p, a) : null
    if (f) flags.push(f)
  })
  return flags
}

export function i18nReport(flags: Flag[]): string | null {
  const n = flags.length
  return format(`${n} Polish string${n === 1 ? '' : 's'} may not say what the English says`, flags)
}
```

- [ ] **Step 4: Run tests to verify they pass**

Run: `deno test --allow-read packages/cli/scripts/jev-guard.test.ts && deno task test`
Expected: PASS. If `deno check` rejects a cast in `dictionaryPairs`, keep the cast's target type and adjust only the source expression; do not add `any` or `!`.

Mutation checks (one at a time, each reverted):
- In `dictionaryPairs`, remove the final `.filter(...)`. Expected: "never an untranslated pair" fails.
- In `pairFlag`, change `differs > at` to `differs >= at`. Expected: the boundary assertion fails.

- [ ] **Step 5: Commit**

```bash
deno fmt packages/cli/scripts/jev-guard.ts packages/cli/scripts/jev-guard.test.ts
git add packages/cli/scripts/jev-guard.ts packages/cli/scripts/jev-guard.test.ts
git commit -m "CLI scripts: the Jev dictionary guard

Pairs every English source text (EN, PARAM_SPEC, the reasons) with its
Polish translation and asks whether they say the same; the dictionary is
loaded only when this guard runs."
```

---

### Task 6: Hook dispatch, the CLI, the hooks and the task

**Files:**
- Modify: `packages/cli/scripts/jev-guard.ts` (append), `packages/cli/scripts/jev-guard.test.ts` (append), `.claude/settings.json`, `deno.json` (root)

**Interfaces:**
- Consumes: everything in Tasks 2–5; `defaultJudge`, `keyPath` (Task 2).
- Produces:
  - `export type Deps = { judge: Judge; root: string; read: (path: string) => string | null; shipped?: Shipped }`
  - `export function runHook(payload: unknown, deps: Deps): Promise<string | null>` (the JSON line to print, or null)
  - CLI: `deno run … jev-guard.ts hook` (stdin), `comments <file…>`, `message [--pr] <file>`, `i18n`

- [ ] **Step 1: Write the failing tests**

Append to `packages/cli/scripts/jev-guard.test.ts` (add `runHook` and `type Shipped` to the import; add `import { fromFileUrl } from '@std/path'` at the top):

```ts
const ROOT = '/repo'
const CLAUDE_MD = '# R\n## Comments\nSay why.\n# Tools\n'
const files: Record<string, string> = { '/repo/CLAUDE.md': CLAUDE_MD }
const read = (p: string) => files[p] ?? null
const ALL: Shipped = { comments: true, message: true, i18n: true }
const deps = (judge: Judge, shipped: Shipped = ALL) => ({ judge, root: ROOT, read, shipped })

const edit = (file_path: string, new_string: string) => ({
  hook_event_name: 'PostToolUse',
  tool_name: 'Edit',
  tool_input: { file_path, old_string: 'x', new_string },
})

Deno.test('hook: a commit message is judged before the command runs, without a permission decision', async () => {
  const { judge } = stubJudge(() => ({ not_english: 0.95 }))
  const payload = {
    hook_event_name: 'PreToolUse',
    tool_name: 'Bash',
    cwd: ROOT,
    tool_input: { command: 'git commit -m "Update"' },
  }
  const out = JSON.parse((await runHook(payload, deps(judge))) ?? 'null')
  assertEquals(out.hookSpecificOutput.hookEventName, 'PreToolUse')
  assertEquals('permissionDecision' in out.hookSpecificOutput, false)
  assertStringIncludes(out.hookSpecificOutput.additionalContext, 'not_english p=0.95')
})

Deno.test('hook: an Edit judges the comments it wrote, at their line in the file', async () => {
  files['/repo/apps/lab/src/a.ts'] = 'const a = 1\nconst b = 2\n// Review round 2 said so\nconst c = 3\n'
  const { judge, calls } = stubJudge(() => ({ violates: 0.95, history: 0.2, spec_ref: 0.1 }))
  const out = await runHook(edit('/repo/apps/lab/src/a.ts', '// Review round 2 said so\nconst c = 3'), deps(judge))
  assertEquals(calls.length, 1)
  assertStringIncludes(out ?? '', 'apps/lab/src/a.ts:3  violates p=0.95')
})

Deno.test('hook: an Edit whose text occurs twice gives the line within the edit', async () => {
  files['/repo/apps/lab/src/b.ts'] = '// same\nx\n// same\nx\n'
  const { judge } = stubJudge(() => ({ violates: 0.95, history: 0.1, spec_ref: 0.1 }))
  const out = await runHook(edit('/repo/apps/lab/src/b.ts', '// same\nx'), deps(judge))
  assertStringIncludes(out ?? '', 'apps/lab/src/b.ts (edit, line 1)')
})

Deno.test('hook: a Write is judged from its content', async () => {
  const { judge, calls } = stubJudge(() => ({ violates: 0.95, history: 0.1, spec_ref: 0.1 }))
  const payload = {
    hook_event_name: 'PostToolUse',
    tool_name: 'Write',
    tool_input: { file_path: '/repo/packages/cli/new.ts', content: '// A new file\nexport const a = 1\n' },
  }
  assertStringIncludes((await runHook(payload, deps(judge))) ?? '', 'packages/cli/new.ts:1')
  assertEquals(calls.length, 1)
})

Deno.test('hook: files out of scope make no request', async () => {
  const { judge, calls } = stubJudge(() => ({ violates: 0.99, history: 0.99, spec_ref: 0.99 }))
  for (const path of ['/repo/README.md', '/repo/node_modules/x/a.ts', '/elsewhere/apps/a.ts', '/repo/packages/engine/dist/a.js']) {
    assertEquals(await runHook(edit(path, '// comment\nx'), deps(judge)), null)
  }
  assertEquals(calls.length, 0)
})

Deno.test('hook: malformed payloads and unanswered questions are silence', async () => {
  const { judge } = stubJudge(() => null)
  for (const p of [null, 'text', 42, {}, { hook_event_name: 'PostToolUse', tool_name: 'Edit' }]) {
    assertEquals(await runHook(p, deps(judge)), null)
  }
  assertEquals(await runHook(edit('/repo/apps/lab/src/a.ts', '// x\ny'), deps(judge)), null)
})

Deno.test('hook: an edit of lab-i18n.ts judges the pairs whose text it wrote', async () => {
  const target = (await dictionaryPairs()).find((p) => p.key === 'params.W.help')
  const { judge, calls } = stubJudge((s) => ('en' in s ? { same_meaning: 0.9 } : null))
  await runHook(edit('/repo/packages/engine/lab-i18n.ts', `help: ${JSON.stringify(target?.pl)}`), deps(judge))
  assertEquals(calls.some((c) => c.key === 'params.W.help'), true)
})

Deno.test('hook: a guard that did not ship stays silent', async () => {
  const { judge, calls } = stubJudge(() => ({ not_english: 0.99 }))
  const payload = { hook_event_name: 'PreToolUse', tool_name: 'Bash', tool_input: { command: 'git commit -m x' } }
  assertEquals(await runHook(payload, deps(judge, { ...ALL, message: false })), null)
  assertEquals(calls.length, 0)
})

Deno.test('hook: with no key file the script prints nothing and exits 0', async () => {
  const child = new Deno.Command(Deno.execPath(), {
    args: ['run', '--allow-read', '--allow-env', fromFileUrl(new URL('./jev-guard.ts', import.meta.url)), 'hook'],
    env: { ARROWZ_TYPESAFE_ENV: '/nonexistent/typesafe.env' },
    stdin: 'piped',
    stdout: 'piped',
    stderr: 'piped',
  }).spawn()
  const w = child.stdin.getWriter()
  await w.write(new TextEncoder().encode(JSON.stringify(edit('/x/apps/a.ts', '// c\nx'))))
  await w.close()
  const { code, stdout } = await child.output()
  assertEquals(code, 0)
  assertEquals(new TextDecoder().decode(stdout), '')
})
```

The i18n hook test takes the Polish text of `params.W.help` from `dictionaryPairs()` at run time, so no Polish is written into the test file; the written text must *contain* a pair's text for the pair to be judged.

- [ ] **Step 2: Run tests to verify they fail**

Run: `deno test --allow-read --allow-env --allow-run packages/cli/scripts/jev-guard.test.ts`
Expected: FAIL, `runHook` not exported.

- [ ] **Step 3: Write the implementation**

Change the `@std/path` import of `jev-guard.ts` to `import { fromFileUrl, isAbsolute, join, relative } from '@std/path'` and add `import { defaultJudge, keyPath } from './jev-client.ts'` beside the type import. Append:

```ts
export type Deps = { judge: Judge; root: string; read: (path: string) => string | null; shipped?: Shipped }

function inScope(rel: string): boolean {
  if (rel.startsWith('..') || isAbsolute(rel)) return false
  if (/(^|\/)(node_modules|dist)\//.test(rel)) return false
  return /\.(ts|tsx|css)$/.test(rel) && /(^|\/)(apps|packages)\//.test(rel)
}

/** The 0-based line where `fragment` starts in `file`, or null when it is absent or not unique. */
function lineOf(file: string | null, fragment: string): number | null {
  if (file === null) return null
  const at = file.indexOf(fragment)
  if (at === -1 || file.indexOf(fragment, at + 1) !== -1) return null
  return file.slice(0, at).split('\n').length - 1
}

const str = (v: unknown) => (typeof v === 'string' ? v : null)

export async function runHook(payload: unknown, deps: Deps): Promise<string | null> {
  if (typeof payload !== 'object' || payload === null) return null
  const p = payload as { hook_event_name?: unknown; tool_name?: unknown; tool_input?: unknown; cwd?: unknown }
  const input = (typeof p.tool_input === 'object' && p.tool_input !== null ? p.tool_input : {}) as Record<
    string,
    unknown
  >
  const event = str(p.hook_event_name)
  const shipped = deps.shipped ?? SHIPPED
  const parts: string[] = []
  const add = (s: string | null) => {
    if (s !== null) parts.push(s)
  }

  if (event === 'PreToolUse' && p.tool_name === 'Bash' && shipped.message) {
    const command = str(input.command)
    const msg = command === null ? null : messageFromCommand(command, str(p.cwd) ?? deps.root, deps.read)
    if (msg !== null) add(messageReport(msg.kind, await message(deps.judge, msg.kind, msg.text)))
  }

  if (event === 'PostToolUse' && (p.tool_name === 'Edit' || p.tool_name === 'Write')) {
    const path = str(input.file_path)
    const rel = path === null ? '' : relative(deps.root, path)
    if (path !== null && inScope(rel)) {
      const written = p.tool_name === 'Edit' ? str(input.new_string) : str(input.content) ?? deps.read(path)
      if (written !== null && shipped.comments) {
        const rule = ruleSection(deps.read(join(deps.root, 'CLAUDE.md')) ?? '', 'Comments')
        const start = p.tool_name === 'Edit' ? lineOf(deps.read(path), written) : 0
        const place = start === null ? (l: number) => `${rel} (edit, line ${l})` : (l: number) => `${rel}:${l + start}`
        if (rule !== null) add(commentReport(await comments(deps.judge, rule, rel, written, place)))
      }
      if (written !== null && shipped.i18n && rel.endsWith('lab-i18n.ts')) {
        const pairs = (await dictionaryPairs()).filter((x) => written.includes(x.pl) || written.includes(x.en))
        if (pairs.length > 0) add(i18nReport(await i18n(deps.judge, pairs)))
      }
    }
  }

  if (parts.length === 0 || event === null) return null
  return JSON.stringify({ hookSpecificOutput: { hookEventName: event, additionalContext: parts.join('\n\n') } })
}

const ROOT = fromFileUrl(new URL('../../../', import.meta.url))

function readOrNull(path: string): string | null {
  try {
    return Deno.readTextFileSync(path)
  } catch {
    return null
  }
}

async function manual(mode: string | undefined, args: string[]): Promise<number> {
  const usage = 'usage: jev-guard.ts hook | comments <file…> | message [--pr] <file> | i18n'
  if (mode !== 'comments' && mode !== 'message' && mode !== 'i18n') {
    console.error(usage)
    return 2
  }
  const judge = await defaultJudge()
  if (judge === null) {
    console.error(`jev: no TYPESAFE_API_KEY in ${keyPath()}`)
    return 1
  }
  const outputs: Array<string | null> = []
  if (mode === 'comments') {
    const rule = ruleSection(readOrNull(join(ROOT, 'CLAUDE.md')) ?? '', 'Comments') ?? ''
    for (const file of args) {
      const source = readOrNull(file)
      if (source === null) {
        console.error(`jev: cannot read ${file}`)
        continue
      }
      const rel = relative(ROOT, file)
      outputs.push(commentReport(await comments(judge, rule, rel, source, (l) => `${rel}:${l}`)))
    }
  } else if (mode === 'message') {
    const kind: MessageKind = args.includes('--pr') ? 'pr' : 'commit'
    const file = args.find((a) => a !== '--pr')
    const body = file === undefined ? null : readOrNull(file)
    if (body === null) {
      console.error(usage)
      return 2
    }
    outputs.push(messageReport(kind, await message(judge, kind, body)))
  } else {
    outputs.push(i18nReport(await i18n(judge, await dictionaryPairs())))
  }
  const found = outputs.filter((o): o is string => o !== null)
  console.log(found.length === 0 ? 'jev: nothing flagged' : found.join('\n\n'))
  return 0
}

if (import.meta.main) {
  const [mode, ...args] = Deno.args
  if (mode === 'hook') {
    let out: string | null = null
    try {
      // Read the payload first: exiting before Claude Code has written it would break its pipe.
      const raw = await new Response(Deno.stdin.readable).text()
      // The key is read only when a guard asks: a locked 1Password would cost 2 s on every edit.
      let real: Promise<Judge | null> | null = null
      const judge: Judge = async (state, questions) => {
        real ??= defaultJudge()
        const j = await real
        return j === null ? null : j(state, questions)
      }
      out = await runHook(JSON.parse(raw), { judge, root: ROOT, read: readOrNull })
    } catch {
      out = null
    }
    if (out !== null) console.log(out)
    // A key read still blocked on the 1Password FIFO would keep the process alive.
    Deno.exit(0)
  }
  Deno.exit(await manual(mode, args))
}
```

Note: `i18n` checks at most `MAX_COMMENT_REQUESTS` pairs per call, so manual `i18n` over the full dictionary (about 400 pairs) checks the first 120. `jev-eval.ts` (Task 7) calls `askPair` directly and covers them all.

- [ ] **Step 4: Run tests to verify they pass**

Run: `deno task test`
Expected: PASS.

Mutation checks (one at a time, each reverted):
- In `lineOf`, remove `|| file.indexOf(fragment, at + 1) !== -1`. Expected: "occurs twice" fails.
- In `runHook`, replace `str(input.content) ?? deps.read(path)` with `deps.read(path)`. Expected: "a Write is judged from its content" fails.
- In the `import.meta.main` block, replace `Deno.exit(0)` with `Deno.exit(1)`. Expected: the subprocess test fails.

- [ ] **Step 5: Register the hooks and the task**

Replace `.claude/settings.json` with:

```json
{
    "hooks": {
        "SessionStart": [
            {
                "matcher": "",
                "hooks": [
                    {
                        "type": "command",
                        "command": "jbcontext index --silent --only-incremental",
                        "async": true
                    }
                ]
            }
        ],
        "SessionEnd": [
            {
                "matcher": "",
                "hooks": [
                    {
                        "type": "command",
                        "command": "jbcontext index --silent --only-incremental",
                        "async": true
                    }
                ]
            }
        ],
        "PreToolUse": [
            {
                "matcher": "Bash",
                "hooks": [
                    {
                        "type": "command",
                        "if": "Bash(git commit *)",
                        "command": "f=\"$CLAUDE_PROJECT_DIR/packages/cli/scripts/jev-guard.ts\"; [ -f \"$f\" ] || exit 0; deno run --quiet --allow-net=api.typesafe.ai --allow-read=\"$CLAUDE_PROJECT_DIR\",\"$HOME/.config/arrowz\",/tmp,/private/tmp --allow-env=HOME,ARROWZ_TYPESAFE_ENV \"$f\" hook",
                        "timeout": 10
                    },
                    {
                        "type": "command",
                        "if": "Bash(gh pr *)",
                        "command": "f=\"$CLAUDE_PROJECT_DIR/packages/cli/scripts/jev-guard.ts\"; [ -f \"$f\" ] || exit 0; deno run --quiet --allow-net=api.typesafe.ai --allow-read=\"$CLAUDE_PROJECT_DIR\",\"$HOME/.config/arrowz\",/tmp,/private/tmp --allow-env=HOME,ARROWZ_TYPESAFE_ENV \"$f\" hook",
                        "timeout": 10
                    }
                ]
            }
        ],
        "PostToolUse": [
            {
                "matcher": "Edit|Write",
                "hooks": [
                    {
                        "type": "command",
                        "command": "f=\"$CLAUDE_PROJECT_DIR/packages/cli/scripts/jev-guard.ts\"; [ -f \"$f\" ] || exit 0; deno run --quiet --allow-net=api.typesafe.ai --allow-read=\"$CLAUDE_PROJECT_DIR\",\"$HOME/.config/arrowz\",/tmp,/private/tmp --allow-env=HOME,ARROWZ_TYPESAFE_ENV \"$f\" hook",
                        "timeout": 10
                    }
                ]
            }
        ]
    }
}
```

`/tmp` and `/private/tmp` are there for `git commit -F /tmp/…` message files; on macOS `/tmp` resolves to `/private/tmp`.

In the root `deno.json`, add to `tasks` after `"compile"`:

```json
"jev": "deno run --allow-net=api.typesafe.ai --allow-read --allow-env=HOME,ARROWZ_TYPESAFE_ENV packages/cli/scripts/jev-guard.ts",
"jev:eval": "deno run --allow-net=api.typesafe.ai --allow-read --allow-env --allow-run=git,gh packages/cli/scripts/jev-eval.ts"
```

(`jev-eval.ts` arrives in Task 7; the task entry is harmless until then.)

- [ ] **Step 6: Check the hook script end to end without a key**

Run: `printf '%s' '{"hook_event_name":"PostToolUse","tool_name":"Edit","tool_input":{"file_path":"/x/apps/a.ts","new_string":"// c"}}' | ARROWZ_TYPESAFE_ENV=/nonexistent deno run --quiet --allow-read --allow-env packages/cli/scripts/jev-guard.ts hook; echo "exit=$?"`
Expected: only `exit=0`.

Run: `deno task jev bogus; echo "exit=$?"`
Expected: the usage line on stderr and `exit=2`.

- [ ] **Step 7: Commit**

```bash
deno fmt packages/cli/scripts/jev-guard.ts packages/cli/scripts/jev-guard.test.ts deno.json
git add packages/cli/scripts/jev-guard.ts packages/cli/scripts/jev-guard.test.ts .claude/settings.json deno.json
git commit -m "Jev guards: hooks that advise on comments, messages and the dictionary

PreToolUse on git commit and gh pr, PostToolUse on Edit and Write. They
answer through additionalContext only, never a permission decision, and a
missing key or any failure is silence, so the hooks cannot stop the work."
```

---

### Task 7: `jev-eval.ts`

**Files:**
- Create: `packages/cli/scripts/jev-eval.ts`, `packages/cli/scripts/jev-eval.test.ts`

**Interfaces:**
- Consumes: `askComment`, `commentFlag`, `commentsOf`, `askMessage`, `messageFlags`, `MESSAGE_AT`, `askPair`, `dictionaryPairs`, `pool`, `ruleSection`, `type Commented`, `type Pair` (Tasks 3–5); `defaultJudge`, `type Answers`, `type Judge` (Task 2).
- Produces:
  - `export type Scored = { p: number; positive: boolean }`
  - `export function auc(items: Scored[]): number`
  - `export function rates(items: Scored[], at: number): { precision: number; recall: number; falseAlarm: number; flagged: number }`
  - `export function pickThreshold(items: Scored[], bar: number): number | null`
  - `export function stripDiacritics(s: string): string`
  - `export function badMessages(polish: string[]): string[]`
  - `export function mutations(pairs: Pair[], per?: number): Pair[]`
  - CLI: `deno task jev:eval comments | message | i18n`

- [ ] **Step 1: Write the failing tests**

Create `packages/cli/scripts/jev-eval.test.ts`:

```ts
import { assertAlmostEquals, assertEquals } from '@std/assert'
import { auc, badMessages, mutations, pickThreshold, rates, type Scored, stripDiacritics } from './jev-eval.ts'

const s = (p: number, positive: boolean): Scored => ({ p, positive })

Deno.test('auc: 1 when every positive outranks every negative, 0.5 for ties', () => {
  assertEquals(auc([s(0.9, true), s(0.8, true), s(0.1, false)]), 1)
  assertEquals(auc([s(0.5, true), s(0.5, false)]), 0.5)
  assertAlmostEquals(auc([s(0.9, true), s(0.2, true), s(0.5, false)]), 0.5)
})

Deno.test('rates: strictly above the threshold is flagged', () => {
  const r = rates([s(0.9, true), s(0.6, true), s(0.7, false), s(0.1, false)], 0.6)
  assertEquals(r, { precision: 0.5, recall: 0.5, falseAlarm: 0.5, flagged: 2 })
})

Deno.test('pickThreshold: the lowest 0.01 step from 0.5 that keeps false alarms at the bar', () => {
  const items = [s(0.95, false), s(0.62, false), ...Array.from({ length: 98 }, () => s(0.1, false))]
  assertEquals(pickThreshold(items, 0.01), 0.62)
  assertEquals(pickThreshold([s(0.999, false)], 0), null)
})

Deno.test('stripDiacritics: Polish letters lose their marks, the stroked l included', () => {
  assertEquals(stripDiacritics('a\u0142b \u00f3c\u017a \u0141\u0105'), 'alb ocz La')
})

Deno.test('badMessages: fifteen, from strings the threshold was not picked on, no diacritics left', () => {
  const polish = Array.from({ length: 40 }, (_, i) => `w${i} aa bb cc d\u0105 e\u0142`)
  const bad = badMessages(polish)
  assertEquals(bad.length, 15)
  assertEquals(bad.some((b) => b.includes('w0 ')), false)
  assertEquals(bad.some((b) => /[\u0105\u0107\u0119\u0142\u0144\u00f3\u015b\u017a\u017c]/.test(b)), false)
})

Deno.test('mutations: every mutated pair changes the Polish and names its mutation', () => {
  const pairs = Array.from({ length: 10 }, (_, i) => ({ key: `k${i}`, en: `Up to ${i}00 cells`, pl: `xx ${i}00 yy zz ww` }))
  const out = mutations(pairs, 3)
  assertEquals(out.filter((m) => m.key.endsWith('(swapped)')).length, 3)
  assertEquals(out.filter((m) => m.key.endsWith('(truncated)')).length, 3)
  assertEquals(out.filter((m) => m.key.endsWith('(number)')).length, 3)
  for (const m of out) {
    const base = pairs.find((p) => m.key.startsWith(`${p.key} `))
    assertEquals(base !== undefined && base.pl !== m.pl, true)
  }
})
```

- [ ] **Step 2: Run tests to verify they fail**

Run: `deno test --allow-read packages/cli/scripts/jev-eval.test.ts`
Expected: FAIL, module `./jev-eval.ts` not found.

- [ ] **Step 3: Write the implementation**

Create `packages/cli/scripts/jev-eval.ts`:

```ts
// Measures the Jev guards on labelled data, so a changed question, threshold or
// model is re-measured before it ships. Figures and bars: docs/jev-guards.md.
import { fromFileUrl } from '@std/path'
import { type Answers, defaultJudge, type Judge } from './jev-client.ts'
import {
  askComment,
  askMessage,
  askPair,
  commentFlag,
  type Commented,
  commentsOf,
  dictionaryPairs,
  MESSAGE_AT,
  messageFlags,
  type Pair,
  pool,
  ruleSection,
} from './jev-guard.ts'

export type Scored = { p: number; positive: boolean }

export function auc(items: Scored[]): number {
  const pos = items.filter((x) => x.positive).map((x) => x.p)
  const neg = items.filter((x) => !x.positive).map((x) => x.p)
  if (pos.length === 0 || neg.length === 0) return NaN
  let wins = 0
  for (const a of pos) for (const b of neg) wins += a > b ? 1 : a === b ? 0.5 : 0
  return wins / (pos.length * neg.length)
}

export function rates(items: Scored[], at: number) {
  let tp = 0, fp = 0, fn = 0, tn = 0
  for (const x of items) {
    const flagged = x.p > at
    if (flagged && x.positive) tp++
    else if (flagged) fp++
    else if (x.positive) fn++
    else tn++
  }
  return {
    precision: tp + fp === 0 ? 1 : tp / (tp + fp),
    recall: tp + fn === 0 ? 0 : tp / (tp + fn),
    falseAlarm: fp + tn === 0 ? 0 : fp / (fp + tn),
    flagged: tp + fp,
  }
}

/** The lowest threshold on a 0.01 grid from 0.5 at which false alarms stay at or under `bar`. */
export function pickThreshold(items: Scored[], bar: number): number | null {
  for (let t = 50; t < 100; t++) {
    if (rates(items, t / 100).falseAlarm <= bar) return t / 100
  }
  return null
}

export function stripDiacritics(s: string): string {
  return s.normalize('NFD').replace(/[\u0300-\u036f]/g, '').replace(/\u0142/g, 'l').replace(/\u0141/g, 'L')
}

// Hand-made violations: easier than real ones, so detection measured on them is optimistic. The first
// fifteen long strings fed the measurement that picked MESSAGE_AT, so these start after them.
export function badMessages(polish: string[]): string[] {
  const long = polish.filter((t) => t.split(/\s+/).length >= 5).slice(15, 30).map(stripDiacritics)
  return long.map((t, i) => (i % 2 === 0 ? t : `Lab: fix the stage\n\n${t}`))
}

export function mutations(pairs: Pair[], per = 30): Pair[] {
  const long = pairs.filter((p) => p.pl.split(/\s+/).length >= 4)
  const out: Pair[] = []
  const half = Math.max(1, Math.floor(long.length / 2))
  for (let i = 0; i < Math.min(per, long.length); i++) {
    const a = long[i] as Pair
    const b = long[(i + half) % long.length] as Pair
    if (a.pl !== b.pl) out.push({ key: `${a.key} (swapped)`, en: a.en, pl: b.pl })
  }
  for (const a of long.slice(0, per)) {
    const w = a.pl.split(/\s+/)
    out.push({ key: `${a.key} (truncated)`, en: a.en, pl: w.slice(0, Math.ceil(w.length / 2)).join(' ') })
  }
  for (const a of pairs.filter((p) => /\d/.test(p.en) && /\d/.test(p.pl)).slice(0, per)) {
    out.push({ key: `${a.key} (number)`, en: a.en, pl: a.pl.replace(/\d+([.,]\d+)?/g, '').replace(/\s+/g, ' ').trim() })
  }
  return out
}

const ROOT = fromFileUrl(new URL('../../../', import.meta.url))
// The comment sweep: before it, and after the commit that restored what it cut too far.
const BEFORE = '446c853'
const AFTER = 'e7b0d50'
const SWEPT = (f: string) =>
  /^apps\/lab\/src\/.*\.(ts|tsx|css)$/.test(f) || /^packages\/board-element\/src\/.*\.ts$/.test(f) ||
  /^packages\/engine\/lab-[^/]+\.ts$/.test(f)

async function run(cmd: string, args: string[]): Promise<string> {
  const out = await new Deno.Command(cmd, { args, cwd: ROOT, stdout: 'piped', stderr: 'piped' }).output()
  if (!out.success) throw new Error(`${cmd} ${args.join(' ')}: ${new TextDecoder().decode(out.stderr)}`)
  return new TextDecoder().decode(out.stdout)
}

async function labelComments(): Promise<Array<{ file: string; c: Commented; changed: boolean }>> {
  const files = async (rev: string) => (await run('git', ['ls-tree', '-r', '--name-only', rev])).split('\n').filter(SWEPT)
  const norm = (t: string) => t.replace(/\s+/g, ' ').trim()
  const kept = new Set<string>()
  for (const f of await files(AFTER)) {
    for (const c of commentsOf(await run('git', ['show', `${AFTER}:${f}`]), f.endsWith('.css'))) kept.add(norm(c.text))
  }
  const out: Array<{ file: string; c: Commented; changed: boolean }> = []
  for (const f of await files(BEFORE)) {
    for (const c of commentsOf(await run('git', ['show', `${BEFORE}:${f}`]), f.endsWith('.css'))) {
      out.push({ file: f, c, changed: !kept.has(norm(c.text)) })
    }
  }
  return out
}

const pct = (x: number) => `${(x * 100).toFixed(1)}%`
const line = (label: string, r: ReturnType<typeof rates>) =>
  `${label.padEnd(24)} precision ${r.precision.toFixed(3)}  recall ${r.recall.toFixed(3)}  false alarms ${pct(r.falseAlarm)}  flagged ${r.flagged}`

async function evalComments(judge: Judge): Promise<boolean> {
  const rule = ruleSection(await Deno.readTextFile(`${ROOT}CLAUDE.md`), 'Comments') ?? ''
  const labelled = await labelComments()
  const answers = await pool(labelled, 16, (x) => askComment(judge, rule, x.file, x.c))
  const rows = labelled.flatMap((x, i) => {
    const a = answers[i]
    return a ? [{ ...x, a }] : []
  })
  const scored = (f: (a: Answers) => number) => rows.map((r) => ({ p: f(r.a), positive: r.changed }))
  const shipped = rows.map((r) => ({ p: commentFlag('', r.c, r.a) ? 1 : 0, positive: r.changed }))
  console.log(`blocks ${labelled.length}, answered ${rows.length}, changed ${rows.filter((r) => r.changed).length}`)
  console.log(`AUC violates ${auc(scored((a) => a.violates ?? 0)).toFixed(3)}`)
  console.log(`AUC max(history, spec_ref) ${auc(scored((a) => Math.max(a.history ?? 0, a.spec_ref ?? 0))).toFixed(3)}`)
  for (const t of [0.7, 0.85, 0.9]) console.log(line(`violates > ${t}`, rates(scored((a) => a.violates ?? 0), t)))
  const r = rates(shipped, 0.5)
  console.log(line('shipped rule', r))
  const pass = r.precision >= 0.95
  console.log(`bar: precision >= 0.95 -> ${pass ? 'PASS' : 'FAIL'}`)
  return pass
}

async function evalMessage(judge: Judge): Promise<boolean> {
  // Held out: MESSAGE_AT was picked on the 300 newest commits and the 60 newest PR bodies.
  const commits = (await run('git', ['log', '--no-merges', '--skip=300', '--format=%B%x00', 'HEAD'])).split('\0')
    .map((t) => t.trim()).filter((t) => t !== '')
  const prs = JSON.parse(await run('gh', ['pr', 'list', '--state', 'merged', '--limit', '500', '--json', 'number,body'])) as Array<
    { number: number; body: string }
  >
  const older = prs.sort((a, b) => b.number - a.number).slice(60)
  const good = [...commits, ...older.map((p) => p.body.trim()).filter((t) => t !== '')]
  const { PL } = await import('@arrowz/engine/i18n')
  const bad = badMessages(Object.values(PL.ui).filter((v): v is string => typeof v === 'string'))
  const goodA = await pool(good, 16, (t) => askMessage(judge, 'commit', t))
  const badA = await pool(bad, 16, (t) => askMessage(judge, 'commit', t))
  const items: Scored[] = [
    ...goodA.flatMap((a) => (a ? [{ p: a.not_english ?? 0, positive: false }] : [])),
    ...badA.flatMap((a) => (a ? [{ p: a.not_english ?? 0, positive: true }] : [])),
  ]
  const fa = good.filter((t, i) => messageFlags('commit', t, goodA[i] ?? null).length > 0).length / good.length
  const det = bad.filter((t, i) => messageFlags('commit', t, badA[i] ?? null).length > 0).length / bad.length
  console.log(`held out: ${commits.length} commits, ${older.length} PRs, ${bad.length} hand-made; not_english AUC ${auc(items).toFixed(3)}`)
  console.log(`at MESSAGE_AT ${JSON.stringify(MESSAGE_AT)}: false alarms ${pct(fa)}, detection ${pct(det)}`)
  const pass = fa <= 0.03 && det >= 0.8
  console.log(`bar: false alarms <= 3% and detection >= 80% -> ${pass ? 'PASS' : 'FAIL'}`)
  return pass
}

async function evalI18n(judge: Judge): Promise<boolean> {
  const good = await dictionaryPairs()
  const bad = mutations(good)
  const goodA = await pool(good, 16, (p) => askPair(judge, p))
  const badA = await pool(bad, 16, (p) => askPair(judge, p))
  const differs = (a: Answers | null) => 1 - (a?.same_meaning ?? 1)
  const items: Scored[] = [
    ...goodA.flatMap((a) => (a ? [{ p: differs(a), positive: false }] : [])),
    ...badA.flatMap((a) => (a ? [{ p: differs(a), positive: true }] : [])),
  ]
  const pick = pickThreshold(items, 0.03)
  console.log(`pairs ${good.length}, mutations ${bad.length}, AUC ${auc(items).toFixed(3)}`)
  if (pick === null) {
    console.log('no threshold keeps false alarms <= 3% -> FAIL')
    return false
  }
  const r = rates(items, pick)
  console.log(line(`differs > ${pick}`, r))
  for (const kind of ['swapped', 'truncated', 'number']) {
    const sub = bad.flatMap((m, i) => (m.key.endsWith(`(${kind})`) && badA[i] ? [differs(badA[i] ?? null) > pick] : []))
    console.log(`  ${kind}: detected ${sub.filter(Boolean).length} of ${sub.length}`)
  }
  const pass = r.falseAlarm <= 0.03 && r.recall >= 0.8
  console.log(`bar: false alarms <= 3% and detection >= 80% -> ${pass ? 'PASS' : 'FAIL'}`)
  return pass
}

if (import.meta.main) {
  const which = Deno.args[0]
  const judge = await defaultJudge()
  if (judge === null) {
    console.error('jev-eval: no TYPESAFE_API_KEY (see docs/jev-guards.md)')
    Deno.exit(1)
  }
  const evaluate = which === 'comments'
    ? evalComments
    : which === 'message'
    ? evalMessage
    : which === 'i18n'
    ? evalI18n
    : null
  if (evaluate === null) {
    console.error('usage: jev-eval.ts comments | message | i18n')
    Deno.exit(2)
  }
  Deno.exit((await evaluate(judge)) ? 0 : 3)
}
```

Note: `evalComments` reads `CLAUDE.md` with `${ROOT}CLAUDE.md` because `ROOT` ends with `/`. `evalMessage` asks every message as a commit message; PR bodies are judged the same way by the guard apart from the `kind` field.

- [ ] **Step 4: Run tests to verify they pass**

Run: `deno test --allow-read packages/cli/scripts/jev-eval.test.ts && deno task test && deno task check && deno task lint`
Expected: PASS. `deno task check` covers `packages/cli/scripts/*.ts`.

Mutation checks (one at a time, each reverted):
- In `rates`, change `x.p > at` to `x.p >= at`. Expected: the `rates` test fails.
- In `stripDiacritics`, delete `.replace(/\u0142/g, 'l')`. Expected: the diacritics test fails.

- [ ] **Step 5: Commit**

```bash
deno fmt packages/cli/scripts/jev-eval.ts packages/cli/scripts/jev-eval.test.ts
git add packages/cli/scripts/jev-eval.ts packages/cli/scripts/jev-eval.test.ts
git commit -m "CLI scripts: jev-eval measures each Jev guard on labelled data

Comments on the sweep's before and after, messages on real history plus
hand-made violations, the dictionary on its pairs plus mutations. A guard
ships only past its bar, and any change to a question is re-measured."
```

---

### Task 8: Live measurement, thresholds, documentation

This task calls the real API (cost: well under $1) and needs `$HOME/.config/arrowz/typesafe.env`.

**Files:**
- Modify: `packages/cli/scripts/jev-guard.ts` (`MESSAGE_AT`, `DIFFERS_AT`, `SHIPPED`, and the two "Provisional" comments)
- Create: `docs/jev-guards.md`
- Modify: `CLAUDE.md` (one line under "## Packages")

- [ ] **Step 1: Measure the comment guard**

Run: `deno task jev:eval comments 2>&1 | tee /tmp/jev-eval-comments.txt`
Expected: `bar: precision >= 0.95 -> PASS` (the spike measured 0.98 with a paraphrased rule). If FAIL: set `SHIPPED.comments = false` and record the figures; do not change the questions.

- [ ] **Step 2: Measure the message guard on held-out data**

Run: `deno task jev:eval message 2>&1 | tee /tmp/jev-eval-message.txt`
Do not change `MESSAGE_AT` (0.8 was picked in the dry run; this run only validates it). If the bar printed FAIL: set `SHIPPED.message = false`.

- [ ] **Step 3: Measure the dictionary guard and record its threshold**

Run: `deno task jev:eval i18n 2>&1 | tee /tmp/jev-eval-i18n.txt`
Set `DIFFERS_AT` to the printed `differs > <pick>` value and replace its comment with `// Measured by jev-eval.ts on jev-1.13.0 (docs/jev-guards.md).`. `SHIPPED.i18n` stays `false` whatever the bar prints: the owner decided after the dry run (78.9 % against 80 %) that the dictionary guard runs by hand only.

- [ ] **Step 4: Re-run the unit tests**

Run: `deno task test`
Expected: PASS. The hook tests pass `shipped` explicitly, so the values in `SHIPPED` do not affect them.

- [ ] **Step 5: Write `docs/jev-guards.md` and the `CLAUDE.md` line**

`docs/jev-guards.md` contains, in this order:
1. What the guards are (two sentences) and that they advise only.
2. Setup: in the 1Password app, Environments → "TypeSafe AI" → Local .env file at `~/.config/arrowz/typesafe.env` (the file is a FIFO; `ARROWZ_TYPESAFE_ENV` overrides the path). Without it the hooks are silent.
3. The hooks (`PreToolUse` on `git commit` and `gh pr`, `PostToolUse` on `Edit`/`Write`) and the manual commands (`deno task jev comments <file…>`, `deno task jev message [--pr] <file>`, `deno task jev i18n`).
4. A table per guard with the figures from the three `/tmp/jev-eval-*.txt` files, the date (2026-09-29 or the day of the run), the model `jev-1.13.0`, whether it shipped, and the sentence "Detection on hand-made violations is optimistic: they are easier than real ones." under the message and dictionary tables.
5. Re-measuring: `deno task jev:eval comments|message|i18n`; required after changing any question, threshold or `MODEL`.

In `CLAUDE.md`, append under "## Packages", after the last bullet:

```markdown
- The Jev guards (`packages/cli/scripts/jev-guard.ts`) advise through Claude Code
  hooks on comments, commit and PR messages and the Polish dictionary; they never
  gate, and without the key they are silent. See `docs/jev-guards.md`.
```

- [ ] **Step 6: Live smoke of the hook with the key**

Run each and check the output by eye:

```bash
printf '%s' '{"hook_event_name":"PreToolUse","tool_name":"Bash","cwd":"'"$PWD"'","tool_input":{"command":"git commit -m \"Tippfehler in der Beschreibung korrigiert\""}}' | deno task jev hook
printf '%s' '{"hook_event_name":"PostToolUse","tool_name":"Write","tool_input":{"file_path":"'"$PWD"'/apps/lab/src/zz.ts","content":"// Review round 2 moved this here (Ruling 14).\nexport const a = 1\n"}}' | deno task jev hook
```

Expected: the first prints a `PreToolUse` JSON flagging `not_english` (if the message guard shipped); the second prints a `PostToolUse` JSON flagging `apps/lab/src/zz.ts:1` (history or violates). No file `zz.ts` is created (the hook only reads the payload).

- [ ] **Step 7: Commit**

```bash
deno fmt packages/cli/scripts/jev-guard.ts
git add packages/cli/scripts/jev-guard.ts docs/jev-guards.md CLAUDE.md
git commit -m "Jev guards: measured thresholds, and how to set them up

Thresholds are the ones jev-eval.ts measured on jev-1.13.0; a guard that
missed its bar is switched off in SHIPPED rather than tuned on the same data."
```

---

### Final gate (controller)

- [ ] `deno task verify` in the worktree: PASS.
- [ ] `pnpm nx run-many -t verify` in the worktree (after `pnpm install` if `node_modules` is missing): PASS.
- [ ] `git grep -n -i "jev-latest"`: only in `docs/` prose, never in code.
- [ ] `git grep -nP "[\x{0105}\x{0107}\x{0119}\x{0142}\x{0144}\x{00f3}\x{015b}\x{017a}\x{017c}]" -- packages/cli/scripts docs/jev-guards.md CLAUDE.md .claude/settings.json`: no matches (no Polish text in new files).
- [ ] After merge, in a new Claude Code session on `main`: one real `Edit` adding a comment with a history marker under `apps/lab/src` shows a `jev:` system reminder; this confirms the `Edit` payload fields (`file_path`, `new_string`) live. Revert the edit.
