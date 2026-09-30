# Memory Guard Implementation Plan

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:subagent-driven-development (recommended) or superpowers:executing-plans to implement this plan task-by-task. Steps use checkbox (`- [ ]`) syntax for tracking.

**Goal:** An advisory guard on Claude Code's memory: Jev flags memory items that only restate code or git history (M1), a length check flags `MEMORY.md` lines that carry content (M2), and a session-start check flags present-tense lines that went stale (M3).

**Architecture:** One new script, `packages/cli/scripts/memory-guard.ts`, holding pure check functions, a hook router and the `hook` / `audit` modes; `memory-eval.ts` re-measures M1 and M2 on a private labelled set kept outside the public repository. Two hook entries in `.claude/settings.json`: PostToolUse on memory writes, SessionStart for M3. It reuses `jev-client.ts` and `pool`, `format`, `excerpt`, `MAX_FLAGS` from `jev-guard.ts`.

**Tech Stack:** Deno 2.9, TypeScript (strict, `noUncheckedIndexedAccess`, `exactOptionalPropertyTypes`), `@std/path`, `@std/assert`, Jev `jev-1.13.0` over HTTP, `gh`, `git`.

**Spec:** `docs/superpowers/specs/2026-09-30-memory-guard-design.md`

## Global Constraints

- Advisory only: output is `hookSpecificOutput.additionalContext`; never a `permissionDecision`, never a non-zero exit from `hook`; every failure is silence.
- `MEMORY_AT = 0.64`, `MAX_MEMORY_REQUESTS = 40`, `MAX_INDEX_LINE = 130` (characters as code points, not bytes). The M1 question text is copied verbatim from the spec.
- Scope: the auto-memory under `$HOME/.claude/projects/*/memory/` and the basic-memory server `memory-arrowz`. Never the global project `main`. Session logs (`sesje/`, or a note whose title starts with a `YYYY-MM-DD` date) are exempt from M1.
- M3 reads only index lines and the first clause of each `description:` (split at the first `;`, `—` or `. `).
- The repository is public: no test, fixture or document quotes a real memory note. Labels live in `~/.config/arrowz/memory-labels.json` (override: `ARROWZ_MEMORY_LABELS`).
- Everything in the repository is English. Comments follow `CLAUDE.md` "Comments" (why, once; blocks at most 6 lines, headers at most 24); `packages/engine/comments.test.ts` walks `packages/cli`.
- No `any`, no non-null assertions. Never spread an array proportional to input size into function arguments.
- Test snippets open with the imports they add: merge them into the file's import block at the top.
- Gates: `deno task verify` after each task; `pnpm nx run-many -t verify` before the PR.

## Review Focus

1. A memory write in another session's worktree or project (`$HOME/.claude/projects/<other>/memory/x.md`) is still a memory write: M1/M2 run, since the path pattern matches any project key. Pinned in Task 4 (`autoMemoryFile` accepts any project key, rejects `memoryX/`, nested dirs and `..`).
2. `gh` missing, logged out or offline at session start: the PR part is skipped, links and paths still run, no crash, no false "not open" flags. Pinned in Task 3/4 (`openPrs: null` and a failing `run`).
3. Zero open pull requests: `gh` prints nothing, and every present-tense "open" claim must then be flagged (empty set, not "unknown"). Pinned in Task 4.
4. Polish text in `MEMORY.md`: 130 characters of Polish must not be flagged just because it is more than 130 bytes. Pinned in Task 1.
5. An edit that touches no memory item (a heading, a short line, a link) must make no Jev request at all. Pinned in Task 2 and Task 4 (the stub judge records zero calls).

---

## File Structure

| File | Responsibility |
|---|---|
| Create `packages/cli/scripts/memory-guard.ts` | item extraction, M1/M2/M3 checks, reports, hook router, `hook` and `audit` modes |
| Create `packages/cli/scripts/memory-guard.test.ts` | unit tests with a stub judge, a stub `run` and in-memory files; the settings wiring test |
| Create `packages/cli/scripts/memory-eval.ts` | `eval` against the private labels |
| Create `packages/cli/scripts/memory-eval.test.ts` | the held-out split matches the spike's |
| Modify `.claude/settings.json` | one PostToolUse entry, one SessionStart entry |
| Modify `deno.json` | tasks `memory` and `memory:eval` |
| Modify `docs/jev-guards.md` | "Memory guard" section |
| Modify `CLAUDE.md` | one sentence beside the Jev guards |

---

### Task 1: Memory items and the index-line check (M2)

**Files:**
- Create: `packages/cli/scripts/memory-guard.ts`
- Test: `packages/cli/scripts/memory-guard.test.ts`

**Interfaces:**
- Consumes: `excerpt(text, max = 80): string`, `MAX_FLAGS` (5) from `./jev-guard.ts`.
- Produces: `observations(text: string): string[]`, `paragraphs(text: string): string[]`, `type Finding = { where: string; what: string }`, `longIndexLines(text: string, where: (line: number) => string): Finding[]`, `findingsReport(title: string, found: Finding[], all?: boolean): string | null`, `MAX_INDEX_LINE = 130`.

- [ ] **Step 1: Write the failing tests**

```ts
import { assertEquals, assertStringIncludes } from '@std/assert'
import { findingsReport, longIndexLines, MAX_INDEX_LINE, observations, paragraphs } from './memory-guard.ts'

Deno.test('observations: one item per `- [category]` line, continuation lines joined, fences skipped', () => {
  const note = [
    '# Title',
    '## Observations',
    '- [decision] Keep the guard advisory',
    '  because hooks must never block #jev',
    '- [fact] second item',
    '```',
    '- [inside] a fence is not an item',
    '```',
    '- [last] third item',
    '## Relations',
    '- part_of [[Other]]',
  ].join('\n')
  assertEquals(observations(note), [
    '- [decision] Keep the guard advisory because hooks must never block #jev',
    '- [fact] second item',
    '- [last] third item',
  ])
})

Deno.test('paragraphs: body paragraphs of 80+ characters, frontmatter, headings and fences skipped', () => {
  const long = 'x'.repeat(80)
  const file = ['---', 'name: n', `description: ${long}`, '---', '', '# Heading', long, '', 'short', '', '```', long, '```', '', `${long.slice(0, 40)}`, `${long.slice(0, 40)}`].join('\n')
  assertEquals(paragraphs(file), [long, `${long.slice(0, 40)} ${long.slice(0, 40)}`])
})

Deno.test('longIndexLines: counts characters, not bytes, and only index entries', () => {
  const polish = `- [Ł](a.md) — ${'ż'.repeat(MAX_INDEX_LINE - 14)}`
  assertEquals([...polish].length, MAX_INDEX_LINE)
  assertEquals(longIndexLines(polish, (l) => `MEMORY.md:${l}`), [])
  const over = `${polish}ą`
  const prose = 'x'.repeat(200)
  assertEquals(longIndexLines(`${prose}\n${over}`, (l) => `MEMORY.md:${l}`).map((f) => f.where), ['MEMORY.md:2'])
})

Deno.test('findingsReport: null when empty, capped at five unless all', () => {
  assertEquals(findingsReport('t', []), null)
  const found = Array.from({ length: 7 }, (_, i) => ({ where: `w${i}`, what: 'bad' }))
  const short = findingsReport('t', found) ?? ''
  assertStringIncludes(short, 'memory: t:\n- w0  bad')
  assertStringIncludes(short, '(2 more not shown)')
  assertStringIncludes(findingsReport('t', found, true) ?? '', '- w6  bad')
})
```

- [ ] **Step 2: Run the tests to verify they fail**

Run: `deno test -A packages/cli/scripts/memory-guard.test.ts`
Expected: FAIL — `Module not found "file:///…/packages/cli/scripts/memory-guard.ts"`.

- [ ] **Step 3: Write the implementation**

```ts
// Advisory checks of Claude Code's memory, measured in docs/jev-guards.md: an item that only restates
// the code or git history (Jev), a MEMORY.md line that carries content instead of a pointer, and
// present-tense lines that went stale. They report and never gate.
import { excerpt, MAX_FLAGS } from './jev-guard.ts'

export const MAX_INDEX_LINE = 130

/** One deterministic finding: where it is and what is wrong. */
export type Finding = { where: string; what: string }

/** Observation lines `- [category] text` of a basic-memory note; a following plain line continues its item. */
export function observations(text: string): string[] {
  const out: string[] = []
  let cur: string | null = null
  let fence = false
  const flush = () => {
    if (cur !== null) out.push(cur)
    cur = null
  }
  for (const l of text.split('\n')) {
    if (/^\s*```/.test(l)) {
      fence = !fence
      flush()
      continue
    }
    if (fence) continue
    if (/^- \[[^\]]+\]/.test(l)) {
      flush()
      cur = l.trim()
    } else if (cur !== null && l.trim() !== '' && !/^(- |#)/.test(l)) {
      cur += ` ${l.trim()}`
    } else {
      flush()
    }
  }
  flush()
  return out
}

/** Body paragraphs of at least 80 characters, the unit M1 was measured on; frontmatter, headings and fences skipped. */
export function paragraphs(text: string): string[] {
  const body = text.replace(/^---\n[\s\S]*?\n---\n/, '')
  const out: string[] = []
  let fence = false
  let buf: string[] = []
  const flush = () => {
    const p = buf.join(' ').trim()
    if (p.length >= 80) out.push(p)
    buf = []
  }
  for (const l of body.split('\n')) {
    if (/^\s*```/.test(l)) {
      fence = !fence
      flush()
      continue
    }
    if (fence) continue
    if (l.trim() === '' || /^#/.test(l)) flush()
    else buf.push(l.trim())
  }
  flush()
  return out
}

/** Index entries longer than MAX_INDEX_LINE code points, so a Polish letter counts once. */
export function longIndexLines(text: string, where: (line: number) => string): Finding[] {
  const out: Finding[] = []
  text.split('\n').forEach((line, i) => {
    const n = Array.from(line).length
    if (line.startsWith('- [') && n > MAX_INDEX_LINE) {
      out.push({ where: where(i + 1), what: `${n} characters: ${excerpt(line)}` })
    }
  })
  return out
}

export function findingsReport(title: string, found: Finding[], all = false): string | null {
  if (found.length === 0) return null
  const shown = all ? found : found.slice(0, MAX_FLAGS)
  const lines = shown.map((f) => `- ${f.where}  ${f.what}`)
  if (found.length > shown.length) lines.push(`(${found.length - shown.length} more not shown)`)
  return `memory: ${title}:\n${lines.join('\n')}`
}
```

Note: `observations` flushes the open item at a fence line; the spike's copy appended the closing fence to it.

- [ ] **Step 4: Run the tests to verify they pass**

Run: `deno test -A packages/cli/scripts/memory-guard.test.ts`
Expected: PASS, 4 tests.

- [ ] **Step 5: Mutation check (negative control)**

Change `Array.from(line).length` to `new TextEncoder().encode(line).length` (bytes) and rerun. Expected: FAIL on `assertEquals(longIndexLines(polish, …), [])` in `longIndexLines: counts characters, not bytes`: the Polish line is 130 characters but more bytes. Revert the mutation by hand.

- [ ] **Step 6: Commit**

```bash
git add packages/cli/scripts/memory-guard.ts packages/cli/scripts/memory-guard.test.ts
git commit -m "memory-guard: extract memory items and flag long index lines

Items are what M1 was measured on: observation lines of a basic-memory
note and body paragraphs of an auto-memory file. An index line over 130
characters carries content instead of a pointer; the spike found length
alone separates them with no false alarm."
```

---

### Task 2: Items that only restate code or git history (M1)

**Files:**
- Modify: `packages/cli/scripts/memory-guard.ts`
- Test: `packages/cli/scripts/memory-guard.test.ts`

**Interfaces:**
- Consumes: `type Judge`, `type Noul` from `./jev-client.ts`; `pool`, `format`, `type Flag` from `./jev-guard.ts`.
- Produces: `MEMORY_QUESTIONS: Record<string, Noul>`, `MEMORY_AT = 0.64`, `MAX_MEMORY_REQUESTS = 40`, `askMemory(judge: Judge, item: string): Promise<Answers | null>`, `memoryFlags(judge: Judge, items: string[], where: string, cap?: number): Promise<{ flags: Flag[]; skipped: number }>`, `memoryReport(r: { flags: Flag[]; skipped: number }): string | null`.

- [ ] **Step 1: Write the failing tests** (append to the test file; add the imports to its import list)

```ts
import type { Answers, Judge } from './jev-client.ts'
import { MAX_MEMORY_REQUESTS, MEMORY_AT, memoryFlags, memoryReport } from './memory-guard.ts'

function stubJudge(answer: (state: Record<string, unknown>) => Answers | null) {
  const calls: Record<string, unknown>[] = []
  const judge: Judge = (state) => {
    calls.push(state as Record<string, unknown>)
    return Promise.resolve(answer(state as Record<string, unknown>))
  }
  return { judge, calls }
}

Deno.test('memoryFlags: flags an item strictly above MEMORY_AT and sends only the item', async () => {
  const { judge, calls } = stubJudge((s) => ({ violates: s.memory_item === 'fact' ? MEMORY_AT + 0.01 : MEMORY_AT }))
  const r = await memoryFlags(judge, ['fact', 'reason'], 'x.md')
  assertEquals(r.flags.map((f) => [f.where, f.question, f.excerpt]), [['x.md', 'code_fact', 'fact']])
  assertEquals(calls, [{ memory_item: 'fact' }, { memory_item: 'reason' }])
})

Deno.test('memoryFlags: an unanswered item is not flagged, and the cap counts what was skipped', async () => {
  const { judge, calls } = stubJudge(() => null)
  const items = Array.from({ length: MAX_MEMORY_REQUESTS + 3 }, (_, i) => `item ${i}`)
  const r = await memoryFlags(judge, items, 'x.md')
  assertEquals([r.flags.length, r.skipped, calls.length], [0, 3, MAX_MEMORY_REQUESTS])
})

Deno.test('memoryFlags: no items, no request', async () => {
  const { judge, calls } = stubJudge(() => ({ violates: 1 }))
  assertEquals((await memoryFlags(judge, [], 'x.md')).flags, [])
  assertEquals(calls.length, 0)
})

Deno.test('memoryReport: null without flags, a jev block with them and the skipped note', () => {
  assertEquals(memoryReport({ flags: [], skipped: 4 }), null)
  const out = memoryReport({ flags: [{ where: 'x.md', question: 'code_fact', p: 0.9, excerpt: 'fact' }], skipped: 2 }) ?? ''
  assertStringIncludes(out, '- x.md  code_fact p=0.90  fact')
  assertStringIncludes(out, '(2 further items were not checked)')
})
```

- [ ] **Step 2: Run the tests to verify they fail**

Run: `deno test -A packages/cli/scripts/memory-guard.test.ts`
Expected: FAIL — `does not provide an export named 'memoryFlags'`.

- [ ] **Step 3: Write the implementation** (add to `memory-guard.ts`; merge the imports into the existing import lines)

```ts
import type { Answers, Judge, Noul } from './jev-client.ts'
import { excerpt, type Flag, format, MAX_FLAGS, pool } from './jev-guard.ts'

export const MEMORY_QUESTIONS: Record<string, Noul> = {
  violates: {
    type: 'noul',
    instructions:
      'A reviewer applying this rule would delete the `memory_item`: "A memory note records a decision with its reason, a lesson, a gotcha or a non-obvious constraint — not a fact that is plainly readable from the code or the git history."',
    criteria: {
      true: 'The item is a plain fact about the code or git history and teaches nothing else.',
      false: 'The item records a reason, a lesson, a gotcha, a measurement, a user decision or a non-obvious constraint.',
    },
  },
}
// Held out: 0.4 % false alarms and a third of real violations found; see docs/jev-guards.md.
export const MEMORY_AT = 0.64
// 40 requests at 16 at a time fit the hook's 10 s at the measured ~0.35 s p95.
export const MAX_MEMORY_REQUESTS = 40
const CONCURRENCY = 16

export function askMemory(judge: Judge, item: string): Promise<Answers | null> {
  return judge({ memory_item: item }, MEMORY_QUESTIONS)
}

export async function memoryFlags(
  judge: Judge,
  items: string[],
  where: string,
  cap = MAX_MEMORY_REQUESTS,
): Promise<{ flags: Flag[]; skipped: number }> {
  const asked = items.slice(0, cap)
  const answers = await pool(asked, CONCURRENCY, (item) => askMemory(judge, item))
  const flags: Flag[] = []
  answers.forEach((a, i) => {
    const p = a?.violates ?? 0
    if (p > MEMORY_AT) flags.push({ where, question: 'code_fact', p, excerpt: asked[i] ?? '' })
  })
  return { flags, skipped: items.length - asked.length }
}

export function memoryReport(r: { flags: Flag[]; skipped: number }): string | null {
  const note = r.skipped > 0 ? `(${r.skipped} further items were not checked)` : undefined
  return format('memory items that may only restate the code or git history (keep a reason, a lesson or a trap)', r.flags, note)
}
```

- [ ] **Step 4: Run the tests to verify they pass**

Run: `deno test -A packages/cli/scripts/memory-guard.test.ts`
Expected: PASS, 8 tests.

- [ ] **Step 5: Mutation check**

Change `p > MEMORY_AT` to `p >= MEMORY_AT`. Expected: FAIL in `memoryFlags: flags an item strictly above MEMORY_AT` (the `reason` item at exactly `MEMORY_AT` gets flagged). Revert by hand.

- [ ] **Step 6: Run the whole Deno gate and commit**

Run: `deno task verify`
Expected: exit 0.

```bash
git add packages/cli/scripts/memory-guard.ts packages/cli/scripts/memory-guard.test.ts
git commit -m "memory-guard: ask Jev whether a memory item only restates code or git

One Noul per item, the spike's question verbatim, flagged above 0.64:
held out it raised one false alarm in 232 clean items and found 30 of 31
hand-made violations, but only a third of the real ones, so it is a
precise hint rather than a sweep."
```

---

### Task 3: Stale present-tense state (M3, pure part)

**Files:**
- Modify: `packages/cli/scripts/memory-guard.ts`
- Test: `packages/cli/scripts/memory-guard.test.ts`

**Interfaces:**
- Consumes: `type Finding` from Task 1.
- Produces: `openPrClaims(text: string): number[]`, `presentSegments(index: string, notes: Note[]): Array<{ where: string; text: string }>`, `type Note = { file: string; text: string }`, `type StateInput = { index: string; notes: Note[]; exists: (file: string) => boolean; openPrs: Set<number> | null; tracked: Set<string> | null }`, `staleState(s: StateInput): Finding[]`.

- [ ] **Step 1: Write the failing tests**

```ts
import { openPrClaims, presentSegments, staleState } from './memory-guard.ts'

Deno.test('openPrClaims: both word orders, Polish and English; not a negation, a list or another word', () => {
  assertEquals(openPrClaims('PR #123 otwarty (worktree x)'), [123])
  assertEquals(openPrClaims('otwarty mój PR #132'), [132])
  assertEquals(openPrClaims('open PR #7 and PR #8 open'), [7, 8])
  assertEquals(openPrClaims('PR #90 (paleta), `main` = `72fd81c`, zero otwartych PR-ów'), [])
  assertEquals(openPrClaims('no open PR #4'), [])
  assertEquals(openPrClaims('PR #111, open'), [])
  assertEquals(openPrClaims('reopened PR #5'), [])
})

Deno.test('presentSegments: every index line and only the first clause of a description', () => {
  const note = { file: 'a.md', text: '---\nname: a\ndescription: "now: PR #9 open; 2026-09-01: PR #3 open"\n---\nbody PR #4 open' }
  assertEquals(presentSegments('- [A](a.md) — x\n', [note]), [
    { where: 'MEMORY.md:1', text: '- [A](a.md) — x' },
    { where: 'MEMORY.md:2', text: '' },
    { where: 'a.md description', text: 'now: PR #9 open' },
  ])
})

Deno.test('staleState: a closed PR called open, a dead link, an untracked path', () => {
  const found = staleState({
    index: '- [A](a.md) — PR #5 open\n- [B](gone.md) — see `packages/cli/nope.ts` and `apps/lab/src`',
    notes: [],
    exists: (f) => f === 'a.md',
    openPrs: new Set([6]),
    tracked: new Set(['apps/lab/src/main.tsx']),
  })
  assertEquals(found, [
    { where: 'MEMORY.md:1', what: 'PR #5 is called open, but it is not open' },
    { where: 'MEMORY.md:2', what: 'links gone.md, which does not exist' },
    { where: 'MEMORY.md:2', what: 'names packages/cli/nope.ts, which git does not track' },
  ])
})

Deno.test('staleState: unknown PRs or files check nothing of theirs; an empty set flags every claim', () => {
  const input = { index: '- [A](a.md) — PR #5 open, `docs/x.md`', notes: [], exists: () => true }
  assertEquals(staleState({ ...input, openPrs: null, tracked: null }), [])
  assertEquals(staleState({ ...input, openPrs: new Set<number>(), tracked: null }).map((f) => f.what), [
    'PR #5 is called open, but it is not open',
  ])
})
```

- [ ] **Step 2: Run the tests to verify they fail**

Run: `deno test -A packages/cli/scripts/memory-guard.test.ts`
Expected: FAIL — `does not provide an export named 'openPrClaims'`.

- [ ] **Step 3: Write the implementation**

```ts
export type Note = { file: string; text: string }

// "PR #N … open/otwarty" within one clause, or "open/otwarty (mój|my) PR #N". A comma ends the clause:
// measured on the memory, "PR #90 (…), zero otwartych" is a negation, not a claim.
const OPEN_PR =
  /(?<!zero )(?<!no )\b(?:PR ?#(\d+)[^.;,\n—]{0,25}?\b(?:otwart\w*|open)\b|(?:otwart\w*|open)\s+(?:mój\s+|my\s+)?PR ?#(\d+))/gi

/** Pull requests that `text` calls open. */
export function openPrClaims(text: string): number[] {
  const out: number[] = []
  for (const m of text.matchAll(OPEN_PR)) out.push(Number(m[1] ?? m[2]))
  return out
}

/** The text of the memory that speaks of the present: every index line, and each description's first clause. */
export function presentSegments(index: string, notes: Note[]): Array<{ where: string; text: string }> {
  const out = index.split('\n').map((text, i) => ({ where: `MEMORY.md:${i + 1}`, text }))
  for (const n of notes) {
    const first = /^description:\s*"?(.*)$/m.exec(n.text)?.[1]?.split(/[;—]|\. /)[0]
    if (first) out.push({ where: `${n.file} description`, text: first })
  }
  return out
}

export type StateInput = {
  index: string
  notes: Note[]
  exists: (file: string) => boolean
  openPrs: Set<number> | null
  tracked: Set<string> | null
}

function trackedPath(tracked: Set<string>, path: string): boolean {
  if (tracked.has(path)) return true
  for (const t of tracked) if (t.startsWith(`${path}/`)) return true
  return false
}

/** Present-tense lines that are no longer true; a null source (gh or git unavailable) checks nothing of its own. */
export function staleState(s: StateInput): Finding[] {
  const out: Finding[] = []
  for (const seg of presentSegments(s.index, s.notes)) {
    if (s.openPrs !== null) {
      for (const n of openPrClaims(seg.text)) {
        if (!s.openPrs.has(n)) out.push({ where: seg.where, what: `PR #${n} is called open, but it is not open` })
      }
    }
    if (seg.where.startsWith('MEMORY.md')) {
      for (const m of seg.text.matchAll(/\]\(([^)\s]+\.md)\)/g)) {
        const file = m[1] ?? ''
        if (!s.exists(file)) out.push({ where: seg.where, what: `links ${file}, which does not exist` })
      }
    }
    if (s.tracked !== null) {
      for (const m of seg.text.matchAll(/`((?:apps|packages|docs)\/[^`\s*<>]+)`/g)) {
        const path = (m[1] ?? '').replace(/:\d.*$/, '').replace(/\/$/, '')
        if (!trackedPath(s.tracked, path)) out.push({ where: seg.where, what: `names ${path}, which git does not track` })
      }
    }
  }
  return out
}
```

- [ ] **Step 4: Run the tests to verify they pass**

Run: `deno test -A packages/cli/scripts/memory-guard.test.ts`
Expected: PASS, 12 tests.

- [ ] **Step 5: Mutation check**

Remove `,` from the character class `[^.;,\n—]`. Expected: FAIL in `openPrClaims` on the `PR #90 (paleta), … zero otwartych PR-ów` and `PR #111, open` cases. Revert by hand.

- [ ] **Step 6: Commit**

```bash
git add packages/cli/scripts/memory-guard.ts packages/cli/scripts/memory-guard.test.ts
git commit -m "memory-guard: find present-tense memory that is no longer true

Only index lines and the first clause of a description speak of the
present; dated entries after it are history. On the whole descriptions
the open-PR pattern hit only history and one negation; on the present
segments it, the link check and the path check flag nothing today."
```

---

### Task 4: Hook routing, session start and the hook wiring

**Files:**
- Modify: `packages/cli/scripts/memory-guard.ts`
- Modify: `.claude/settings.json`
- Modify: `deno.json`
- Test: `packages/cli/scripts/memory-guard.test.ts`

**Interfaces:**
- Consumes: everything from Tasks 1–3; `defaultJudge()` from `./jev-client.ts`.
- Produces: `type Run = (cmd: string, args: string[], cwd: string) => Promise<{ code: number; stdout: string } | null>`, `type Deps = { judge: Judge; home: string; read: (path: string) => string | null; list: (dir: string) => string[] | null; run: Run }`, `autoMemoryFile(home: string, path: string): { dir: string; file: string } | null`, `sessionStart(memoryDir: string, cwd: string, deps: Deps, all?: boolean): Promise<string | null>`, `runMemoryHook(payload: unknown, deps: Deps): Promise<string | null>`, CLI `memory-guard.ts hook`.

- [ ] **Step 1: Write the failing tests**

```ts
import { dirname, fromFileUrl, join } from '@std/path'
import { autoMemoryFile, type Deps, runMemoryHook, sessionStart } from './memory-guard.ts'

const HOME = '/h'
const MEM = '/h/.claude/projects/-p/memory'

function deps(files: Record<string, string>, judge: Judge, gh: string | null = '', git: string | null = ''): Deps & { runs: string[] } {
  const runs: string[] = []
  return {
    runs,
    judge,
    home: HOME,
    read: (p) => files[p] ?? null,
    list: (dir) => {
      const names = Object.keys(files).filter((p) => dirname(p) === dir).map((p) => p.slice(dir.length + 1))
      return names.length === 0 ? null : names
    },
    run: (cmd) => {
      runs.push(cmd)
      const out = cmd === 'gh' ? gh : git
      return Promise.resolve(out === null ? { code: 1, stdout: '' } : { code: 0, stdout: out })
    },
  }
}
const context = (out: string | null) => (out === null ? null : JSON.parse(out).hookSpecificOutput.additionalContext as string)

Deno.test('autoMemoryFile: any project key, only files directly in memory/', () => {
  assertEquals(autoMemoryFile(HOME, `${MEM}/x.md`), { dir: MEM, file: 'x.md' })
  assertEquals(autoMemoryFile(HOME, '/h/.claude/projects/-other-worktree/memory/MEMORY.md')?.file, 'MEMORY.md')
  assertEquals(autoMemoryFile(HOME, '/h/.claude/projects/-p/memoryX/x.md'), null)
  assertEquals(autoMemoryFile(HOME, `${MEM}/sub/x.md`), null)
  assertEquals(autoMemoryFile(HOME, '/h/.claude/projects/../x/memory/x.md'), null)
  assertEquals(autoMemoryFile(HOME, '/repo/docs/x.md'), null)
})

Deno.test('hook: Write of an auto-memory file asks Jev per paragraph and reports flags', async () => {
  const { judge, calls } = stubJudge(() => ({ violates: 0.9 }))
  const body = `---\nname: x\n---\n\n${'fact '.repeat(20)}\n`
  const out = await runMemoryHook(
    { hook_event_name: 'PostToolUse', tool_name: 'Write', tool_input: { file_path: `${MEM}/x.md`, content: body } },
    deps({}, judge),
  )
  assertEquals(calls.length, 1)
  assertStringIncludes(context(out) ?? '', '- x.md  code_fact p=0.90')
})

Deno.test('hook: an Edit of MEMORY.md is checked by length only, no Jev request', async () => {
  const { judge, calls } = stubJudge(() => ({ violates: 1 }))
  const line = `- [T](t.md) — ${'x'.repeat(MAX_INDEX_LINE)}`
  const out = await runMemoryHook(
    { hook_event_name: 'PostToolUse', tool_name: 'Edit', tool_input: { file_path: `${MEM}/MEMORY.md`, new_string: line } },
    deps({}, judge),
  )
  assertEquals(calls.length, 0)
  assertStringIncludes(context(out) ?? '', '- MEMORY.md (edit)  ')
})

Deno.test('hook: an edit with no memory item makes no request and no output', async () => {
  const { judge, calls } = stubJudge(() => ({ violates: 1 }))
  const out = await runMemoryHook(
    { hook_event_name: 'PostToolUse', tool_name: 'Edit', tool_input: { file_path: `${MEM}/x.md`, new_string: '## Heading\nshort' } },
    deps({}, judge),
  )
  assertEquals([out, calls.length], [null, 0])
})

Deno.test('hook: basic-memory notes are checked, session logs and other servers are not', async () => {
  const { judge, calls } = stubJudge(() => ({ violates: 0.9 }))
  const content = '## Observations\n- [fact] the file lives in engine.ts'
  const ask = (tool_name: string, tool_input: Record<string, unknown>) =>
    runMemoryHook({ hook_event_name: 'PostToolUse', tool_name, tool_input }, deps({}, judge))
  assertStringIncludes(context(await ask('mcp__memory-arrowz__write_note', { title: 'T', directory: 'wiedza', content })) ?? '', 'note "T"')
  assertEquals(await ask('mcp__memory-arrowz__write_note', { title: 'T', directory: 'sesje', content }), null)
  assertEquals(await ask('mcp__memory-arrowz__edit_note', { identifier: 'arrowz/sesje/x', operation: 'append', content }), null)
  assertEquals(await ask('mcp__memory-arrowz__edit_note', { identifier: '2026-09-30 — log', operation: 'append', content }), null)
  assertEquals(await ask('mcp__basic-memory__write_note', { title: 'T', directory: 'wiedza', content }), null)
  assertEquals(await ask('Write', { file_path: '/repo/docs/x.md', content }), null)
  assertEquals(calls.length, 1)
})

Deno.test('session start: reads the memory beside the transcript, one gh and one git call', async () => {
  const { judge } = stubJudge(() => null)
  const files = {
    [`${MEM}/MEMORY.md`]: '- [A](a.md) — PR #5 open\n- [G](gone.md) — x',
    [`${MEM}/a.md`]: '---\ndescription: "PR #6 open; old"\n---\n',
  }
  const d = deps(files, judge, '6\n', 'docs/x.md\n')
  const out = context(await runMemoryHook({ hook_event_name: 'SessionStart', transcript_path: '/h/.claude/projects/-p/s.jsonl', cwd: '/repo' }, d)) ?? ''
  assertStringIncludes(out, '- MEMORY.md:1  PR #5 is called open, but it is not open')
  assertStringIncludes(out, '- MEMORY.md:2  links gone.md, which does not exist')
  assertEquals(out.includes('PR #6'), false)
  assertEquals(d.runs.sort(), ['gh', 'git'])
})

Deno.test('session start: gh failing skips only the PR part; zero open PRs flags every claim', async () => {
  const { judge } = stubJudge(() => null)
  const files = { [`${MEM}/MEMORY.md`]: '- [A](a.md) — PR #5 open', [`${MEM}/a.md`]: 'x' }
  assertEquals(await sessionStart(MEM, '/repo', deps(files, judge, null)), null)
  assertStringIncludes(await sessionStart(MEM, '/repo', deps(files, judge, '')) ?? '', 'PR #5 is called open')
})

Deno.test('session start: no MEMORY.md, nothing to say', async () => {
  const { judge } = stubJudge(() => null)
  assertEquals(await sessionStart(MEM, '/repo', deps({}, judge)), null)
})

Deno.test('the committed settings run memory-guard on memory writes and at session start', () => {
  const root = join(dirname(fromFileUrl(import.meta.url)), '..', '..', '..')
  const hooks = JSON.parse(Deno.readTextFileSync(join(root, '.claude', 'settings.json'))).hooks
  type Entry = { matcher?: string; hooks: Array<{ command: string }> }
  const uses = (event: string) =>
    (hooks[event] as Entry[]).filter((e) => e.hooks.some((h) => h.command.includes('memory-guard.ts') && h.command.endsWith(' hook')))
  const post = uses('PostToolUse')
  assertEquals(post.length, 1)
  for (const tool of ['Edit', 'Write', 'mcp__memory-arrowz__write_note', 'mcp__memory-arrowz__edit_note']) {
    assertEquals(new RegExp(`^(?:${post[0]?.matcher})$`).test(tool), true, tool)
  }
  assertEquals(uses('SessionStart').length, 1)
})
```

- [ ] **Step 2: Run the tests to verify they fail**

Run: `deno test -A packages/cli/scripts/memory-guard.test.ts`
Expected: FAIL — `does not provide an export named 'autoMemoryFile'`.

- [ ] **Step 3: Write the implementation** (add to `memory-guard.ts`; merge imports)

```ts
import { dirname, join, relative } from '@std/path'
import { defaultJudge } from './jev-client.ts'

export type Run = (cmd: string, args: string[], cwd: string) => Promise<{ code: number; stdout: string } | null>
export type Deps = {
  judge: Judge
  home: string
  read: (path: string) => string | null
  list: (dir: string) => string[] | null
  run: Run
}

const str = (v: unknown) => (typeof v === 'string' ? v : null)
const BASIC_MEMORY_TOOLS = new Set(['mcp__memory-arrowz__write_note', 'mcp__memory-arrowz__edit_note'])
// A session log records what happened, which is its purpose: its folder or its dated title marks it.
const SESSION_LOG = /(^|\/)sesje(\/|$)|^\d{4}-\d{2}-\d{2}\b/

/** The auto-memory file `path` names, under any project key; null for any other path. */
export function autoMemoryFile(home: string, path: string): { dir: string; file: string } | null {
  const rel = relative(join(home, '.claude', 'projects'), path)
  const m = /^([^/.][^/]*)\/memory\/([^/]+\.md)$/.exec(rel)
  return m === null ? null : { dir: dirname(path), file: m[2] ?? '' }
}

const lines = (r: { code: number; stdout: string } | null) =>
  r !== null && r.code === 0 ? r.stdout.split('\n').filter((l) => l !== '') : null

export async function sessionStart(memoryDir: string, cwd: string, deps: Deps, all = false): Promise<string | null> {
  const index = deps.read(join(memoryDir, 'MEMORY.md'))
  if (index === null) return null
  const listed = deps.list(memoryDir)
  const notes: Note[] = []
  for (const file of listed ?? []) {
    if (file === 'MEMORY.md' || !file.endsWith('.md')) continue
    const text = deps.read(join(memoryDir, file))
    if (text !== null) notes.push({ file, text })
  }
  const [prs, files] = await Promise.all([
    deps.run('gh', ['pr', 'list', '--state', 'open', '--json', 'number', '-q', '.[].number'], cwd),
    deps.run('git', ['ls-files'], cwd),
  ])
  const open = lines(prs)
  const tracked = lines(files)
  const found = staleState({
    index,
    notes,
    exists: (f) => listed === null || listed.includes(f),
    openPrs: open === null ? null : new Set(open.map(Number)),
    tracked: tracked === null ? null : new Set(tracked),
  })
  return findingsReport('present-tense memory that is no longer true (fix the line, or move it into a dated entry)', found, all)
}

export async function runMemoryHook(payload: unknown, deps: Deps): Promise<string | null> {
  if (typeof payload !== 'object' || payload === null) return null
  const p = payload as { hook_event_name?: unknown; tool_name?: unknown; tool_input?: unknown; cwd?: unknown; transcript_path?: unknown }
  const input = (typeof p.tool_input === 'object' && p.tool_input !== null ? p.tool_input : {}) as Record<string, unknown>
  const event = str(p.hook_event_name)
  const tool = str(p.tool_name)
  let out: string | null = null

  if (event === 'SessionStart') {
    const transcript = str(p.transcript_path)
    if (transcript !== null) out = await sessionStart(join(dirname(transcript), 'memory'), str(p.cwd) ?? '.', deps)
  } else if (event === 'PostToolUse' && (tool === 'Write' || tool === 'Edit')) {
    const path = str(input.file_path)
    const target = path === null ? null : autoMemoryFile(deps.home, path)
    const written = tool === 'Edit' ? str(input.new_string) : str(input.content)
    if (target !== null && written !== null && target.file === 'MEMORY.md') {
      const where = tool === 'Edit' ? () => 'MEMORY.md (edit)' : (l: number) => `MEMORY.md:${l}`
      const title = `MEMORY.md lines over ${MAX_INDEX_LINE} characters (the index points; the file holds the content)`
      out = findingsReport(title, longIndexLines(written, where))
    } else if (target !== null && written !== null) {
      out = memoryReport(await memoryFlags(deps.judge, paragraphs(written), target.file))
    }
  } else if (event === 'PostToolUse' && tool !== null && BASIC_MEMORY_TOOLS.has(tool)) {
    const place = str(input.directory) ?? str(input.identifier) ?? ''
    const content = str(input.content)
    if (content !== null && !SESSION_LOG.test(place)) {
      out = memoryReport(await memoryFlags(deps.judge, observations(content), `note "${str(input.title) ?? place}"`))
    }
  }
  if (out === null || event === null) return null
  return JSON.stringify({ hookSpecificOutput: { hookEventName: event, additionalContext: out } })
}

function readOrNull(path: string): string | null {
  try {
    return Deno.readTextFileSync(path)
  } catch {
    return null
  }
}

function listOrNull(dir: string): string[] | null {
  try {
    return Array.from(Deno.readDirSync(dir)).filter((e) => e.isFile).map((e) => e.name)
  } catch {
    return null
  }
}

const run: Run = async (cmd, args, cwd) => {
  try {
    const o = await new Deno.Command(cmd, { args, cwd, stdout: 'piped', stderr: 'null' }).output()
    return { code: o.code, stdout: new TextDecoder().decode(o.stdout) }
  } catch {
    return null
  }
}

function manual(mode: string | undefined, _args: string[]): Promise<number> {
  console.error(`usage: memory-guard.ts hook | audit (got ${mode ?? 'nothing'})`)
  return Promise.resolve(2)
}

if (import.meta.main) {
  const [mode, ...args] = Deno.args
  if (mode === 'hook') {
    let out: string | null = null
    try {
      const raw = await new Response(Deno.stdin.readable).text()
      // The key is read only when M1 asks: a locked 1Password would cost 2 s on every write.
      let real: Promise<Judge | null> | null = null
      const judge: Judge = async (state, questions) => {
        real ??= defaultJudge()
        const j = await real
        return j === null ? null : j(state, questions)
      }
      const home = Deno.env.get('HOME') ?? ''
      out = await runMemoryHook(JSON.parse(raw), { judge, home, read: readOrNull, list: listOrNull, run })
    } catch {
      out = null
    }
    if (out !== null) console.log(out)
    Deno.exit(0)
  }
  Deno.exit(await manual(mode, args))
}
```

The `edit_note` of a session log by a title with no date prefix is not recognised as a log; that is the limit named in the spec's scope.

- [ ] **Step 4: Wire the hooks** in `.claude/settings.json` (4-space indent, as the file).

Append this object to the `"SessionStart"` array, after the `jbcontext` entry:

```json
            {
                "hooks": [
                    {
                        "type": "command",
                        "command": "f=\"$CLAUDE_PROJECT_DIR/packages/cli/scripts/memory-guard.ts\"; [ -f \"$f\" ] || exit 0; deno run --quiet --allow-read=\"$CLAUDE_PROJECT_DIR\",\"$HOME/.claude/projects\" --allow-run=gh,git --allow-env=HOME,ARROWZ_TYPESAFE_ENV \"$f\" hook",
                        "timeout": 10
                    }
                ]
            }
```

Append this object to the `"PostToolUse"` array, after the `Edit|Write` entry of `jev-guard.ts`:

```json
            {
                "matcher": "Edit|Write|mcp__memory-arrowz__write_note|mcp__memory-arrowz__edit_note",
                "hooks": [
                    {
                        "type": "command",
                        "command": "f=\"$CLAUDE_PROJECT_DIR/packages/cli/scripts/memory-guard.ts\"; [ -f \"$f\" ] || exit 0; deno run --quiet --allow-net=api.typesafe.ai --allow-read=\"$HOME/.config/arrowz\" --allow-env=HOME,ARROWZ_TYPESAFE_ENV \"$f\" hook",
                        "timeout": 10
                    }
                ]
            }
```

Add to `deno.json` `"tasks"`, after `"jev:eval"`:

```json
    "memory": "deno run --allow-net=api.typesafe.ai --allow-read --allow-env=HOME,ARROWZ_TYPESAFE_ENV --allow-run=gh,git packages/cli/scripts/memory-guard.ts",
```

- [ ] **Step 5: Run the tests to verify they pass**

Run: `deno test -A packages/cli/scripts/memory-guard.test.ts`
Expected: PASS, 21 tests.

- [ ] **Step 6: Mutation checks**

(a) Change the matcher in `.claude/settings.json` to `"Edit|Write"`. Expected: FAIL in `the committed settings run memory-guard…` on `mcp__memory-arrowz__write_note`. Revert.
(b) In `sessionStart`, replace `open === null ? null : …` with `new Set(open?.map(Number) ?? [])`. Expected: FAIL in `gh failing skips only the PR part` (a failing `gh` then flags PR #5). Revert.

- [ ] **Step 7: Simulate the real hooks against the real memory** (no commit; prints only)

```bash
cd <worktree>
printf '%s' "{\"hook_event_name\":\"SessionStart\",\"transcript_path\":\"$HOME/.claude/projects/-Users-tomek-dev-arrowz/x.jsonl\",\"cwd\":\"$PWD\"}" \
  | deno run --quiet --allow-read="$PWD","$HOME/.claude/projects" --allow-run=gh,git --allow-env=HOME,ARROWZ_TYPESAFE_ENV packages/cli/scripts/memory-guard.ts hook; echo "rc=$?"
```

Expected: `rc=0` and either no output or a `memory: present-tense memory…` block; read each flagged line in the memory and say in the task report whether it is really stale. The `gh`-failure path is covered by the unit test, not here.

- [ ] **Step 8: Run the Deno gate and commit**

Run: `deno task verify`
Expected: exit 0.

```bash
git add packages/cli/scripts/memory-guard.ts packages/cli/scripts/memory-guard.test.ts .claude/settings.json deno.json
git commit -m "memory-guard: run on memory writes and at session start

A write to the auto-memory or to the repository's basic-memory gets M1
or M2; the start of a session gets M3 over the memory beside its
transcript, with one gh and one git call. Its own hook entries, because
it reads ~/.claude/projects and runs gh, which the Jev guards need not."
```

---

### Task 5: Audit, eval on private labels, and the documents

**Files:**
- Modify: `packages/cli/scripts/memory-guard.ts`
- Create: `packages/cli/scripts/memory-eval.ts`
- Create: `packages/cli/scripts/memory-eval.test.ts`
- Modify: `deno.json`, `docs/jev-guards.md`, `CLAUDE.md`
- Outside the repository: `~/.config/arrowz/memory-labels.json`

**Interfaces:**
- Consumes: `askMemory`, `MEMORY_AT`, `MAX_INDEX_LINE`, `observations`, `paragraphs`, `memoryFlags`, `longIndexLines`, `findingsReport`, `sessionStart` from `memory-guard.ts`; `auc`, `rates`, `type Scored` from `./jev-eval.ts`; `pool` from `./jev-guard.ts`.
- Produces: `projectMemoryDir(home: string, root: string): string`, `heldOut(group: string): boolean`, `type Labelled`, `type Labels`, CLI `memory-guard.ts audit`, `memory-eval.ts`.

- [ ] **Step 1: Move the spike's labels outside the repository** (not committed; private)

```bash
python3 - <<'EOF'
import json, os
b = json.load(open('/tmp/jev-bcq/g3/data-3b.json')); c = json.load(open('/tmp/jev-bcq/g3/data-3c.json'))
conv = lambda xs, key: [{'id': x['id'], 'group': x['group'], 'violation': x['violation'],
  'kind': 'natural' if x['kind'] == 'natural' else 'hand-made', 'text': x['state'][key]} for x in xs]
out = {'m1': conv(b, 'memory_item'), 'm2': conv(c, 'line')}
p = os.path.expanduser('~/.config/arrowz/memory-labels.json')
json.dump(out, open(p, 'w'), ensure_ascii=False, indent=1); os.chmod(p, 0o600)
print(len(out['m1']), len(out['m2']))
EOF
```

Expected: `555 96`.

- [ ] **Step 2: Write the failing tests**

`packages/cli/scripts/memory-eval.test.ts`:

```ts
import { assertEquals } from '@std/assert'
import { heldOut } from './memory-eval.ts'

// Parities computed with the spike's own split, so eval scores the same held-out half the spec reports.
Deno.test('heldOut: the spike split, FNV-1a of `split:<group>`', () => {
  assertEquals(['arrowz-artefakty.md', 'feedback-scalanie-pr.md', 'a', 'b'].map(heldOut), [true, true, false, true])
})
```

Append to `memory-guard.test.ts`:

```ts
import { projectMemoryDir } from './memory-guard.ts'

Deno.test('projectMemoryDir: the project key replaces every character outside [A-Za-z0-9-] with a dash', () => {
  assertEquals(projectMemoryDir('/h', '/Users/t/dev/.a b'), '/h/.claude/projects/-Users-t-dev--a-b/memory')
})
```

- [ ] **Step 3: Run the tests to verify they fail**

Run: `deno test -A packages/cli/scripts/memory-eval.test.ts packages/cli/scripts/memory-guard.test.ts`
Expected: FAIL — `Module not found …memory-eval.ts` and `does not provide an export named 'projectMemoryDir'`.

- [ ] **Step 4: Implement `audit`** in `memory-guard.ts` (replace `manual`; merge imports)

```ts
import { fromFileUrl } from '@std/path'

const ROOT = fromFileUrl(new URL('../../../', import.meta.url))

export function projectMemoryDir(home: string, root: string): string {
  return join(home, '.claude', 'projects', root.replace(/\/$/, '').replace(/[^A-Za-z0-9-]/g, '-'), 'memory')
}

function notesOf(dir: string, out: string[]) {
  for (const e of listEntries(dir)) {
    if (e.name.startsWith('.') || e.name === 'sesje') continue
    const path = join(dir, e.name)
    if (e.isDirectory) notesOf(path, out)
    else if (e.name.endsWith('.md')) out.push(path)
  }
}

function listEntries(dir: string): Deno.DirEntry[] {
  try {
    return Array.from(Deno.readDirSync(dir))
  } catch {
    return []
  }
}

// A worktree's own project key has no memory, so the directories can be named.
async function audit(home: string, memoryArg?: string, notesArg?: string): Promise<number> {
  const memoryDir = memoryArg ?? projectMemoryDir(home, ROOT)
  const index = readOrNull(join(memoryDir, 'MEMORY.md'))
  if (index === null) {
    console.error(`memory: no MEMORY.md in ${memoryDir}`)
    return 1
  }
  const judge = await defaultJudge()
  const deps: Deps = { judge: judge ?? (() => Promise.resolve(null)), home, read: readOrNull, list: listOrNull, run }
  const parts: Array<string | null> = [
    findingsReport(`MEMORY.md lines over ${MAX_INDEX_LINE} characters`, longIndexLines(index, (l) => `MEMORY.md:${l}`), true),
    await sessionStart(memoryDir, ROOT, deps, true),
  ]
  if (judge === null) {
    parts.push('memory: no TYPESAFE_API_KEY, so memory items were not checked')
  } else {
    const flags: Flag[] = []
    for (const file of listOrNull(memoryDir) ?? []) {
      if (file === 'MEMORY.md' || !file.endsWith('.md')) continue
      const r = await memoryFlags(judge, paragraphs(readOrNull(join(memoryDir, file)) ?? ''), file, Infinity)
      for (const f of r.flags) flags.push(f)
    }
    const notes: string[] = []
    const notesDir = notesArg ?? join(ROOT, '.basic-memory', 'notes')
    notesOf(notesDir, notes)
    for (const path of notes) {
      const r = await memoryFlags(judge, observations(readOrNull(path) ?? ''), relative(notesDir, path), Infinity)
      for (const f of r.flags) flags.push(f)
    }
    const sorted = flags.sort((a, b) => b.p - a.p)
    parts.push(
      sorted.length === 0
        ? null
        : `jev: memory items that may only restate the code or git history:\n${
          sorted.map((f) => `- ${f.where}  p=${f.p.toFixed(2)}  ${excerpt(f.excerpt, 160)}`).join('\n')
        }`,
    )
  }
  const found = parts.filter((x): x is string => x !== null)
  console.log(found.length === 0 ? 'memory: nothing flagged' : found.join('\n\n'))
  return 0
}

async function manual(mode: string | undefined, args: string[]): Promise<number> {
  if (mode === 'audit') return await audit(Deno.env.get('HOME') ?? '', args[0], args[1])
  console.error('usage: memory-guard.ts hook | audit [memory-dir] [basic-memory-notes-dir]')
  return 2
}
```

- [ ] **Step 5: Implement `memory-eval.ts`**

```ts
// Measures the memory guard on a private labelled set kept outside this public repository
// (~/.config/arrowz/memory-labels.json), so a changed question, threshold or model is re-measured before it
// ships. Scored on the spike's held-out half; figures and bar in docs/jev-guards.md.
import { join } from '@std/path'
import { defaultJudge } from './jev-client.ts'
import { auc, rates, type Scored } from './jev-eval.ts'
import { pool } from './jev-guard.ts'
import { askMemory, MAX_INDEX_LINE, MEMORY_AT } from './memory-guard.ts'

export type Labelled = { id: string; group: string; violation: boolean; kind: 'natural' | 'hand-made'; text: string }
export type Labels = { m1: Labelled[]; m2: Labelled[] }

/** The spike's split: FNV-1a of `split:<group>`; odd hashes are the held-out half. */
export function heldOut(group: string): boolean {
  let h = 2166136261
  const s = `split:${group}`
  for (let i = 0; i < s.length; i++) h = Math.imul(h ^ s.charCodeAt(i), 16777619)
  return (h >>> 0) % 2 === 1
}

const pct = (x: number) => `${(100 * x).toFixed(1)} %`

if (import.meta.main) {
  const path = Deno.env.get('ARROWZ_MEMORY_LABELS') ?? join(Deno.env.get('HOME') ?? '', '.config', 'arrowz', 'memory-labels.json')
  let labels: Labels
  try {
    labels = JSON.parse(Deno.readTextFileSync(path))
  } catch {
    console.error(`memory eval: no labels at ${path}`)
    Deno.exit(1)
  }
  const judge = await defaultJudge()
  if (judge === null) {
    console.error('memory eval: no TYPESAFE_API_KEY')
    Deno.exit(1)
  }
  const answers = await pool(labels.m1, 16, (x) => askMemory(judge, x.text))
  const m1: Array<Scored & { held: boolean; kind: string }> = []
  labels.m1.forEach((x, i) => {
    const a = answers[i]
    if (a) m1.push({ p: a.violates ?? 0, positive: x.violation, held: heldOut(x.group), kind: x.kind })
  })
  const held = m1.filter((x) => x.held)
  const falseAlarm = rates(held.filter((x) => !x.positive), MEMORY_AT).falseAlarm
  const detection = rates(held.filter((x) => x.kind === 'hand-made'), MEMORY_AT).recall
  const natural = rates(held.filter((x) => x.kind === 'natural'), MEMORY_AT)
  const m2 = labels.m2.map((x) => ({ p: Array.from(x.text).length > MAX_INDEX_LINE ? 1 : 0, positive: x.violation }))
  const m2r = rates(m2, 0.5)
  const pass = falseAlarm <= 0.03 && detection >= 0.8
  console.log([
    '| Check | Figure |',
    '|---|---|',
    `| M1 items / answered | ${labels.m1.length} / ${m1.length} |`,
    `| M1 AUC all / held | ${auc(m1).toFixed(3)} / ${auc(held).toFixed(3)} |`,
    `| M1 held at ${MEMORY_AT} | false alarms ${pct(falseAlarm)}, hand-made detection ${pct(detection)}, natural precision ${natural.precision.toFixed(2)} recall ${natural.recall.toFixed(2)} |`,
    `| M2 at ${MAX_INDEX_LINE} characters | false alarms ${pct(m2r.falseAlarm)}, detection ${pct(m2r.recall)} |`,
    `| bar (false alarms ≤ 3 %, detection ≥ 80 %) | ${pass ? 'PASS' : 'FAIL'} |`,
  ].join('\n'))
  Deno.exit(pass ? 0 : 1)
}
```

Add to `deno.json` `"tasks"`, after `"memory"`:

```json
    "memory:eval": "deno run --allow-net=api.typesafe.ai --allow-read --allow-env packages/cli/scripts/memory-eval.ts",
```

- [ ] **Step 6: Run the tests, then the real eval and audit**

Run: `deno test -A packages/cli/scripts/memory-eval.test.ts packages/cli/scripts/memory-guard.test.ts`
Expected: PASS, 23 tests.

Run: `deno task memory:eval`
Expected: exit 0; M1 held false alarms about 0.4 % and hand-made detection about 97 % (the spike's 1/232 and 30/31; Jev may move one item either way); M2 false alarms 0.0 %, detection 100.0 %. Paste the table into the task report.

Run (from the worktree, whose own project key has no memory):
`deno task memory audit "$HOME/.claude/projects/-Users-tomek-dev-arrowz/memory" /Users/tomek/dev/arrowz/.basic-memory/notes`
Expected: exit 0, no M2 lines (the index was slimmed), M3 nothing or only lines you confirm stale, and an M1 list. Report its length; do not edit any memory in this task.

- [ ] **Step 7: Mutation check**

In `heldOut`, return `=== 0`. Expected: FAIL in `heldOut: the spike split`. Revert.

- [ ] **Step 8: Documents**

Append to `docs/jev-guards.md` (before `## Limits`), filling the M1 row from the Step 6 table:

```markdown
## Memory guard

`packages/cli/scripts/memory-guard.ts` advises on Claude Code's own memory:
the auto-memory under `~/.claude/projects/<project>/memory/` and this
repository's basic-memory notes (server `memory-arrowz`), never the global
basic-memory project. Spec: `docs/superpowers/specs/2026-09-30-memory-guard-design.md`.

| Check | When | How |
|---|---|---|
| M1: an item only restates the code or git history | a memory write (not a session log) | Jev `violates` > 0.64, at most 40 items per write |
| M2: a `MEMORY.md` line carries content | a write to `MEMORY.md` | longer than 130 characters |
| M3: present-tense memory that is no longer true | session start | an index line or a description's first clause calls a PR open that is not, links a missing file, or names an untracked path; one `gh` and one `git` call |

By hand: `deno task memory audit [memory-dir] [notes-dir]` runs all three over
the whole memory (defaults: this checkout's project memory and `.basic-memory/notes`);
`deno task memory:eval` re-measures M1 and M2 on the labelled set in
`~/.config/arrowz/memory-labels.json`, which stays outside this public
repository (override with `ARROWZ_MEMORY_LABELS`).

Measured on jev-1.13.0, 2026-09-30, on the held-out half:

| Metric | Value |
|---|---|
| M1 false alarms / hand-made detection | <from Step 6> |
| M1 on real items | precision <from Step 6>, recall <from Step 6> |
| M2 | false alarms 0 %, detection 100 % |

M1 is a precise hint, not a sweep: it misses most real violations,
especially status paragraphs. M3 reads only present-tense text; a stale
claim deeper in a note is not checked. The hooks run only in sessions
started in this repository.
```

Replace the three `<from Step 6>` markers with the printed figures before committing.

In `CLAUDE.md`, after the sentence ending "See `docs/jev-guards.md`." of the Jev guards bullet, add a new bullet:

```markdown
- The memory guard (`packages/cli/scripts/memory-guard.ts`) advises the same
  way on Claude Code's memory: on each memory write and at session start.
```

- [ ] **Step 9: Run the Deno gate and commit**

Run: `deno task verify`
Expected: exit 0.

```bash
git add packages/cli/scripts/memory-guard.ts packages/cli/scripts/memory-guard.test.ts packages/cli/scripts/memory-eval.ts packages/cli/scripts/memory-eval.test.ts deno.json docs/jev-guards.md CLAUDE.md
git commit -m "memory-guard: audit the whole memory and re-measure on private labels

The labelled set holds private notes, so it lives outside this public
repository and eval scores the spike's own held-out half to keep the
figures comparable. docs/jev-guards.md records the measured figures."
```

---

### Task 6: Whole-branch gate

- [ ] **Step 1: Full gate in a clean checkout of the branch**

```bash
set -o pipefail
git worktree add /tmp/arrowz-mg-gate tools/memory-guard --detach
cd /tmp/arrowz-mg-gate && pnpm install --frozen-lockfile >/dev/null && pnpm nx run-many -t verify --skip-nx-cache
```

Expected: `Successfully ran target verify for 4 projects`. Then `git worktree remove /tmp/arrowz-mg-gate`.

- [ ] **Step 2: Jev guards on the branch's own text**

Run: `deno task jev comments packages/cli/scripts/memory-guard.ts packages/cli/scripts/memory-eval.ts packages/cli/scripts/memory-guard.test.ts packages/cli/scripts/memory-eval.test.ts`
Expected: `jev: nothing flagged`, or flags you fix or explain in the PR.

The live hooks run from the main checkout's `.claude/settings.json`, so they take effect after the merge; the first session afterwards checks that SessionStart printed nothing false and that a memory write produced a hint.
