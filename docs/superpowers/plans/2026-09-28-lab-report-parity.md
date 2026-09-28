# Lab report parity and the missing ⌘K rows — Implementation Plan

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:subagent-driven-development (recommended) or superpowers:executing-plans to implement this plan task-by-task. Steps use checkbox (`- [ ]`) syntax for tracking.

**Goal:** The lab's report shows the statistics the engine measures and the lab hides, its delta colour says only which way a number moved, and ⌘K reaches every colour and element field of the Preview panel.

**Architecture:** The rows stay in the engine's pure `reportRows` (`packages/engine/lab-report.ts`) with their words in `packages/engine/lab-i18n.ts`; the lab draws them unchanged except for one more group name and the class names of the delta. The ⌘K rows are one more builder in `apps/lab/src/palette/commands.ts` that reuses `jumpTo` and the panel's existing ids.

**Tech Stack:** TypeScript, Deno 2.9 (`@std/assert`) for the engine, React 19 + Vitest browser mode (Playwright) for `apps/lab`, Nx + pnpm.

**Spec:** `docs/superpowers/specs/2026-09-28-lab-report-parity-design.md`

## Global Constraints

- Everything in the repository is in English; Polish only inside `PL` in `lab-i18n.ts`.
- Every user-facing string lives in both `EN.ui` and `PL.ui`; `lab-i18n.test.ts` requires the same keys and value kinds.
- `glossary.test.ts` refuses in the dictionaries (EN): `pieces`, `close/closed/closing`, `jam`, `carve…`, `paper`, `ink`, `backbite`, `corridor`, `fragment`, `absorb…`, `knob`, a quoted `--flag`; (PL): `fragment`, `papier`, `tusz`, `wycin/wycię`, `domkn`, `generacj`, `pokrętł`, `element…`. The `backbite` knob is "tail rework" / "przeróbka ogona"; a cell is "cell" / "komórka".
- `StatsTable` compares a run with the baseline **by row index**: every row is always present; a row with nothing to say shows `—` and has `num: undefined`.
- `CarverStats` describes the last attempt only (a restart is a new `Carver`); the help of every carver row says "In the last attempt".
- Comments say why, once, in the fewest lines (≤ 6 lines outside a header); no history, no `file.ts:NN`; `comments.test.ts` sweeps `apps/lab/src` and `packages/engine/lab-*.ts`.
- No `any`, no non-null assertions; never spread an array proportional to cells or arrows.
- Formatting: `deno fmt <files>` for touched engine files; for touched lab files `cd apps/lab && pnpm exec prettier --write <files>` (the lab's `fmt` script is `prettier --check .`).
- No attribution lines in commits.

## Review Focus

1. **A row that is sometimes meaningless** (`rework` with the knob at 0, the stall rows on a run that never stalled): it must stay in place with `—`, or every delta below it compares with its neighbour. Pinned in Task 2 (`rework` dash case, the `n = 0` case extended to every carver row).
2. **The palette jump with an empty or full palette**: no element has the id `view-palette` today, so a jump would silently do nothing; at the cap the add button is disabled and cannot take focus. Pinned in Task 4 (browser jump cases for both).
3. **A long new value at 352 px** (`stuckBy` in Polish): it must wrap inside its own track. The existing "at 352px nothing in the report runs past its row" case covers it once the row is in `WIDE_KEYS` and the case opens the new longest help (Task 2).
4. **A language switch after two runs**: deltas must still line up (same row order in both languages) and the screen-reader word must follow the language. Pinned by the updated "a language switch keeps every delta" case (Task 1) and the order test (Task 2).
5. **A not-filled board without a head count** (`stuck.heads === null`, or no shown params): the line must read exactly as today. Pinned in Task 3 (engine formatter with `null`).

---

### Task 0: Workspace

**Files:** none.

- [ ] **Step 1: Install once in the worktree**

Run (from the worktree root `/Users/tomek/dev/arrowz/.claude/worktrees/report-parity`):
```bash
corepack enable pnpm && pnpm install
```
Expected: exit 0.

- [ ] **Step 2: Baseline gates**

Run:
```bash
set -o pipefail
deno task test 2>&1 | tail -3
pnpm nx build board-element 2>&1 | tail -2
cd apps/lab && pnpm exec vitest run src/report src/palette src/stage/RunStatusBar.browser.test.tsx src/console/Console.jump.browser.test.tsx 2>&1 | tail -4
```
Expected: all pass (the first vitest run may print "Vite unexpectedly reloaded a test"; rerun once). A fresh worktree has no `packages/board-element/dist`, and `build board-element` builds the engine first. The lab tests import the engine from `packages/engine/dist/`, so **every engine change needs `pnpm nx build engine` before the lab tests see it**.

---

### Task 1: The delta colour is the direction of the change

**Files:**
- Modify: `packages/engine/lab-report.ts` (`StatRow`, `ReportDelta`, `reportDelta`, `stat`, `SEP`, every `stat(...)` call)
- Modify: `packages/engine/lab-i18n.ts` (EN and PL: `deltaBetter`/`deltaWorse` → `deltaUp`/`deltaDown`, `reportSummaryCap`, `stat_avgLen_help`, `stat_corridor_help`, `stat_time_help`, the comment above `deltaBetter`)
- Modify: `packages/engine/lab-report.test.ts`
- Modify: `packages/engine/lab-i18n.test.ts` (the `words` list of "both ui dictionaries carry the report…": `'deltaBetter'` → `'deltaUp'`, `'deltaWorse'` → `'deltaDown'`)
- Modify: `apps/lab/src/report/StatsTable.tsx`, `apps/lab/src/report/ReportSummary.tsx`, `apps/lab/src/report/StoredFacts.tsx` (comment "Not the 23 rows of a run" → "Not the rows of a run")
- Modify: `apps/lab/src/routes/Workspace.browser.test.tsx` (comment "not the run's 23 rows" → "not the run's rows")
- Modify: `apps/lab/src/design/report.css`, `apps/lab/src/design/tokens.css` (comment at the `--ok` token, line with "A better change in the report")
- Modify: `apps/lab/src/report/ReportPanel.browser.test.tsx`

**Interfaces:**
- Produces: `reportDelta(num: number | undefined, prev: number | undefined): ReportDelta | null`; `ReportDelta = { text: string; trend: 'up' | 'down' }`; `StatRow` without `better`; dictionary keys `deltaUp`, `deltaDown`.

- [ ] **Step 1: Rewrite the engine tests first**

In `packages/engine/lab-report.test.ts`:

1. Replace the three help sentences in `HELP_EN`:
```ts
  avgLen: 'Cells per arrow, on average. Higher = fewer, longer arrows.',
  corridor:
    'How many cells, on average, an arrow has to travel in the direction it points to leave the board. Higher = longer ways out.',
  time: 'How long the board took to generate and to measure. Lower = faster.',
```
2. In the pinned-rows test, delete every `better: …` field from `expected` (rows and separators), and type it as `Omit<StatRow, 'help'>[]` as today.
3. In "reportRows pins the stall row's dash when stats.n is 0", delete `better: -1,`.
4. Replace the `DIRECTION_KEYS` block and its test with:
```ts
// Rows whose value is not one number: nothing moves, so there is nothing to explain.
const NO_NUMBER: StatKey[] = ['board', 'lengths']
Deno.test('every row with a number says what a rise means, marked by =', () => {
  const params = { ...defaultParams(), W: 20, H: 20, seed: 3 }
  const r = run(20, 20, 3)
  for (const lang of ['en', 'pl'] as const) {
    for (const row of reportRows(r, params, dictionary(lang))) {
      if (row.kind === 'separator' || NO_NUMBER.includes(row.key as StatKey)) continue
      assert(row.help.includes('='), `${lang} ${row.key} has no direction clause: ${row.help}`)
    }
  }
})
```
5. In "the row order is the same in both languages…", replace the `better` line with:
```ts
  assertEquals(en.map((x) => x.key), pl.map((x) => x.key))
```
6. Delete the test "a signed row is always a comparable row, or its arrow can never be drawn".
7. In the three `reportDelta` tests, drop the third argument from every call (`reportDelta(undefined, 3)`, `reportDelta(250, 100)`, …), and replace "reportDelta says which way is better from the row, not from the sign alone" with:
```ts
Deno.test('reportDelta says only which way the number moved', () => {
  assertEquals(reportDelta(2, 1)?.trend, 'up')
  assertEquals(reportDelta(1, 2)?.trend, 'down')
  assertEquals(reportDelta(0.5, 0.25)?.trend, 'up')
})
```

- [ ] **Step 2: Run them and watch them fail**

Run: `deno test --allow-read packages/engine/lab-report.test.ts 2>&1 | tail -15`
Expected: type errors (`better` still in `StatRow`, `reportDelta` expects 3 arguments) — FAIL.

- [ ] **Step 3: Change the engine**

In `packages/engine/lab-report.ts`:

- Delete the stray one-line doc comment `/** One line of the stats table: … */` directly above the `StatKey` doc comment (it documents `StatRow`, not `StatKey`), and put it back as `StatRow`'s header:
```ts
/** One line of the stats table: its key, label, shown value, help, and the number compared with the previous run. */
export interface StatRow {
```
- In `StatRow`, delete the `better` field and its comment. Change the `help` comment to:
```ts
  /** What the row measures and what a rise means, ending in an `=` clause; '' on a separator. */
```
- Replace `ReportDelta` and `reportDelta` with:
```ts
/** How one row moved against the baseline: the text of the delta cell and its direction. */
export interface ReportDelta {
  /** The change with its sign — `+` or `−` (U+2212) — at the precision of the size of the change. */
  readonly text: string
  /** Up or down, whatever the row: what a rise means is the row's help, not its colour. */
  readonly trend: 'up' | 'down'
}

/**
 * The delta column: `num` against `prev`, the same row of the baseline. Null
 * when either is missing or the two differ by no more than 1e-9, where a
 * surface prints an empty cell.
 */
export function reportDelta(num: number | undefined, prev: number | undefined): ReportDelta | null {
  if (num === undefined || prev === undefined || Math.abs(num - prev) <= 1e-9) return null
  const diff = num - prev
  const abs = Math.abs(diff)
  const shown = abs >= 100 ? abs.toFixed(0) : abs >= 1 ? abs.toFixed(1) : abs.toFixed(2)
  return { text: `${diff > 0 ? '+' : '−'}${shown}`, trend: diff > 0 ? 'up' : 'down' }
}
```
- Replace `stat` and `SEP`:
```ts
const stat = (dict: Dict, key: StatKey, label: string, value: string | number, num?: number): StatRow => ({
  kind: 'row',
  key,
  label,
  value: String(value),
  help: dict.t(`stat_${key}_help` as const),
  num,
})
// The gap between groups of rows. `kind` is what tells it apart, so it needs
// neither a label nor a value.
const SEP: StatRow = { kind: 'separator', key: null, label: '', value: '', help: '', num: undefined }
```
- In `reportRows`'s doc comment, delete the paragraph "The third field of a row is … (the delta colour)." and put in its place: "The fifth argument of a row is the number compared with the previous run."
- In every `stat(...)` call, delete the last argument when it is the old `better` (`0`, `1` or `-1` after `num`). Each call keeps at most five arguments: `dict, key, label, value, num`. Example: `stat(dict, 'f0', dict.t('stat_f0'), pct(metrics.f0), 100 * metrics.f0)`.

In `packages/engine/lab-i18n.ts`, EN:
```ts
    // The report column and its delta, the frame's annotation, and the
    // run column's two exports. The two delta words are never visible: the
    // cell's colour and sign say it on screen, and a screen reader hears these.
    reportPanel: 'Report',
    statsTable: 'Statistics',
    deltaUp: 'up',
    deltaDown: 'down',
```
```ts
    reportSummaryCap: "vs. the previous board: green = up, red = down; a row's ? says what a change means",
```
```ts
    stat_avgLen_help: 'Cells per arrow, on average. Higher = fewer, longer arrows.',
```
```ts
    stat_corridor_help:
      'How many cells, on average, an arrow has to travel in the direction it points to leave the board. Higher = longer ways out.',
```
```ts
    stat_time_help: 'How long the board took to generate and to measure. Lower = faster.',
```
PL:
```ts
    deltaUp: 'wzrost',
    deltaDown: 'spadek',
    reportSummaryCap:
      'wobec poprzedniej planszy: zielone = wzrost, czerwone = spadek; ? przy wierszu mówi, co znaczy zmiana',
```
```ts
    stat_avgLen_help: 'Średnio komórek na strzałkę. Więcej = mniej, ale dłuższych strzałek.',
```
```ts
    stat_corridor_help:
      'Ile komórek średnio strzałka ma do przebycia w kierunku, w którym wskazuje, żeby opuścić planszę. Więcej = dłuższa droga do wyjścia.',
```
```ts
    stat_time_help: 'Ile trwało generowanie planszy i liczenie statystyk. Mniej = szybciej.',
```
Delete `deltaBetter` and `deltaWorse` in both languages, and in `packages/engine/lab-i18n.test.ts` rename them in the `words` list to `'deltaUp'` / `'deltaDown'`.

The two verdicts that no definition backs change too (EN, and the same two lines in `HELP_EN`):
```ts
    stat_spanTop_help: 'The same, for the 10% of arrows that reach furthest. Higher = arrows cross more of the board.',
    stat_spanMax_help: 'The reach of the one arrow that reaches furthest. Higher = arrows cross more of the board.',
```
PL:
```ts
    stat_spanTop_help: 'To samo dla 10% strzałek o największym zasięgu. Więcej = strzałki przecinają większą część planszy.',
    stat_spanMax_help: 'Zasięg strzałki, która sięga najdalej. Więcej = strzałki przecinają większą część planszy.',
```

Run: `deno fmt packages/engine/lab-report.ts packages/engine/lab-i18n.ts packages/engine/lab-report.test.ts`

- [ ] **Step 4: Engine tests pass**

Run:
```bash
set -o pipefail
deno test --allow-read packages/engine/lab-report.test.ts packages/engine/lab-i18n.test.ts packages/engine/glossary.test.ts 2>&1 | tail -5
```
Expected: PASS.

- [ ] **Step 5: Rewrite the lab tests**

In `apps/lab/src/report/ReportPanel.browser.test.tsx`:

- The comment and case "the second result is compared with the first, row by row" become:
```tsx
// Compared by row index against the result shown before. The colour is the
// direction alone: pieces rose (8 → 13), longest fell (18 → 17).
test('the second result is compared with the first, row by row', async () => {
  const screen = await mountReport()
  await act(async () => finish(ONE))
  await act(async () => finish(TWO))
  const pieces = row(screen.container, 1).cells[2]
  const longest = row(screen.container, 3).cells[2]
  expect(pieces?.textContent).toBe('+5.0 up')
  expect(pieces?.className).toBe('fw-delta up')
  expect(longest?.textContent).toBe('−1.0 down')
  expect(longest?.className).toBe('fw-delta down')
  expect(longest?.querySelector('.fw-vh')?.textContent).toBe(' down')
})
```
- In "a language switch keeps every delta":
```tsx
  expect(row(screen.container, 1).cells[2]?.textContent).toBe('+5.0 wzrost')
  expect(row(screen.container, 3).cells[2]?.textContent).toBe('−1.0 spadek')
```
- Replace `TOKEN`, `readsAtAA`, `shownDelta` kinds and the AA case:
```tsx
const TOKEN = { up: '--ok', down: '--error' } as const
```
`readsAtAA(cell, kind: 'up' | 'down')` and `shownDelta(container, kind: 'up' | 'down')` keep their bodies. The case:
```tsx
// Down `--error`, up `--ok` (6.6:1), on `--graphite`, measured on rows still
// on screen: after ONE then TWO, free at start rose and average length fell.
test('every kind of delta reads at AA', async () => {
  const screen = await mountReport()
  await act(async () => finish(ONE))
  await act(async () => finish(TWO))
  readsAtAA(shownDelta(screen.container, 'down'), 'down')
  readsAtAA(shownDelta(screen.container, 'up'), 'up')
})
```
- The caption expectation:
```tsx
  expect(cap?.textContent).toBe("vs. the previous board: green = up, red = down; a row's ? says what a change means")
```
- "the summary compares with the previous run as the table does":
```tsx
// The same `reportDelta` as the table: the colour is the direction; time
// reports no change at all.
test('the summary compares with the previous run as the table does', async () => {
  const screen = await mountReport()
  await act(async () => finish(ONE))
  await act(async () => finish(TWO))
  const pieces = figure(screen.container, 0).change
  const longest = figure(screen.container, 1).change
  expect(pieces.textContent).toBe('+5.0 up')
  expect(pieces.className).toBe('up')
  expect(longest.textContent).toBe('−1.0 down')
  expect(longest.className).toBe('down')
  expect(getComputedStyle(longest).color).toBe(tokenColour('--error'))
  expect(contrast(shown(longest).front, shown(longest).back)).toBeGreaterThanOrEqual(4.5)
  expect(figure(screen.container, 3).change.className).toBe('none')
  await act(async () => finish(ONE))
  expect(longest.className).toBe('up')
  expect(getComputedStyle(longest).color).toBe(tokenColour('--ok'))
  expect(contrast(shown(longest).front, shown(longest).back)).toBeGreaterThanOrEqual(4.5)
})
```
- Search the file for any other `neutral`, `better`, `worse`, `lepiej`, `gorzej` and change it the same way.

- [ ] **Step 6: Change the lab**

`apps/lab/src/report/StatsTable.tsx`:
```tsx
              const change = reportDelta(row.num, before[at]?.num)
```
```tsx
                  delta={
                    // The sign is always printed, so colour is never the only
                    // carrier; a screen reader hears up or down.
                    <td className={change === null ? 'fw-delta' : `fw-delta ${change.trend}`}>
                      {change?.text}
                      {change === null ? null : (
                        <span className="fw-vh">{` ${dict.t(change.trend === 'up' ? 'deltaUp' : 'deltaDown')}`}</span>
                      )}
                    </td>
                  }
```
`apps/lab/src/report/ReportSummary.tsx`: in the header, replace "The change is the table's own `reportDelta`, so its colour is the row's trend and never the sign." with "The change is the table's own `reportDelta`: its colour is the direction."; then:
```tsx
          const change = key === 'time' ? null : reportDelta(row.num, byKey(before, key)?.num)
```
```tsx
                  <small className={change.trend}>
                    {change.text}
                    <span className="fw-vh">{` ${dict.t(change.trend === 'up' ? 'deltaUp' : 'deltaDown')}`}</span>
                  </small>
```
`apps/lab/src/design/report.css`:
```css
/* An empty delta cell is `--ash` (5.52:1); a fall is `--error` (4.90:1),
   measured by ReportPanel.browser.test.tsx. Not `--signal`: 3.81:1, under AA. */
.fw-report .fw-delta {
  width: 1%;
  white-space: nowrap;
  color: var(--ash);
}
.fw-report .fw-delta.down {
  color: var(--error);
}
```
`.fw-rsum dd small.worse` → `.fw-rsum dd small.down`; and
```css
/* A rise is `--ok` (6.6:1 on `--graphite`), a fall `--error`; the sign stays,
   so the colour is never the only carrier. */
.fw-report .fw-delta.up,
.fw-rsum dd small.up {
  color: var(--ok);
}
```
`apps/lab/src/design/tokens.css`: the comment "A better change in the report (report.css); the mock's own value." → "A rise in the report (report.css); the mock's own value."

Run `grep -rn "better\|worse\|neutral" apps/lab/src/report apps/lab/src/design/report.css` — only unrelated prose may remain.

- [ ] **Step 7: Lab tests pass**

Run:
```bash
set -o pipefail
pnpm nx build engine 2>&1 | tail -1
cd apps/lab && pnpm exec vitest run src/report 2>&1 | tail -4 && pnpm run check 2>&1 | tail -2
```
Expected: PASS, `tsc` clean.

- [ ] **Step 8: Commit**

```bash
(cd apps/lab && pnpm exec prettier --write src/report src/design/report.css src/design/tokens.css src/routes/Workspace.browser.test.tsx)
git add packages/engine/lab-report.ts packages/engine/lab-report.test.ts packages/engine/lab-i18n.ts packages/engine/lab-i18n.test.ts apps/lab/src/report apps/lab/src/design/report.css apps/lab/src/design/tokens.css apps/lab/src/routes/Workspace.browser.test.tsx
git commit -m "Report: the delta's colour says which way the number moved, the ? says what it means"
```

---

### Task 2: The missing report rows

**Files:**
- Modify: `packages/engine/lab-report.ts` (`StatKey`, `reportRows`)
- Modify: `packages/engine/lab-i18n.ts` (EN and PL: new labels, formatters, helps, `statGroupDetail`)
- Modify: `packages/engine/lab-report.test.ts`
- Modify: `apps/lab/src/report/StatsTable.tsx` (`GROUP_NAMES`, `WIDE_KEYS`, the "23 statistics" comment)
- Modify: `apps/lab/src/report/ReportPanel.browser.test.tsx`

**Interfaces:**
- Consumes: `stat(dict, key, label, value, num?)` and `SEP` from Task 1.
- Produces: `StatKey` gains `farBlock`, `turnsPerCell`, `ownSides`, `neighbours`, `rework`, `stuckBy`, `stuckLen`, `selfTrap`, `shortened`; 32 rows and 5 separators in this order: board, pieces, avgLen, longest, lengths | f0, almost, farBlock, D, corridor | span, spanTop, spanMax, outDeg, maxOut, blockDist | bends, turnsPerCell, coil, ownSides, border, neighbours, multi | stall, absorbed, backtracks, time | rework, stuckBy, stuckLen, selfTrap, shortened.

- [ ] **Step 1: Write the failing engine tests**

In `packages/engine/lab-report.test.ts`:

1. Add to `HELP_EN` (the texts are the dictionary's, below):
```ts
  farBlock:
    'Arrows whose nearest blocker is more than 2 cells ahead of the head: what holds them is not in plain sight. More = more blockers to look for.',
  turnsPerCell:
    'Turns per cell, over the whole board: unlike bends per arrow, a long arrow weighs as much as its cells. Higher = more winding.',
  ownSides: "How many of a cell's four sides touch the same arrow, on average. Higher = arrows fold onto themselves.",
  neighbours:
    'For arrows of 8 cells or more: how many different arrows each one touches. Higher = arrows are more interwoven.',
  rework:
    'In the last attempt: how many times an arrow that hit a dead end reworked its tail and grew on, and how many times it gave up. Only with tail rework on. More done = the setting is at work.',
  stuckBy:
    'In the last attempt: what surrounded the tail of an arrow that could grow no further (the arrow itself, other arrows, or the edge), as shares of its sides. A high "itself" = arrows trap themselves.',
  stuckLen:
    'In the last attempt: how long an arrow was, on average, when it could grow no further. Higher = arrows get stuck later.',
  selfTrap:
    "In the last attempt: stops where the arrow's own body walled in at least two sides of its tail. More = arrows trap themselves more often.",
  shortened:
    'In the last attempt: the share of arrows laid that were cut back so they would not leave a gap no arrow could fill, and by how many cells on average. Lower = fewer cuts.',
```
2. In `pinnedMetrics` set `T2: 3`, `selfAdj: 0.75`, `bendsPerCell: 0.125`, `neighbours: 2.5`, `minLen: 2`. Change `pinnedParams` to `{ ...defaultParams(), W: 20, H: 20, seed: 3, backbite: 2 }`.
3. In the pinned-rows test, the stats become:
```ts
  const stats: CarverStats = {
    want: 100,
    got: 90,
    stall: 20,
    strandTrunc: 4,
    strandLoss: 10,
    n: 100,
    absorbs: 3,
    absorbed: 45,
    // 20 sides = 5 stall events: 25% · 65% · 10%, no rounding tie.
    stallOwn: 5,
    stallForeign: 13,
    stallEdge: 2,
    stallLen: 30,
    stallSelfTrap: 1,
    backbites: 5,
    backbiteGiveUps: 2,
  }
```
and `expected` becomes (full list, `help` added by the existing `map`):
```ts
  const expected: Omit<StatRow, 'help'>[] = [
    { kind: 'row', key: 'board', label: 'board', value: '20 × 20 = 400 cells, seed 3', num: undefined },
    { kind: 'row', key: 'pieces', label: 'arrows', value: '20', num: 20 },
    { kind: 'row', key: 'avgLen', label: 'average length', value: '20.0', num: 20 },
    { kind: 'row', key: 'longest', label: 'longest', value: '100 cells (25% of the board)', num: 100 },
    {
      kind: 'row',
      key: 'lengths',
      label: 'lengths',
      value: '2–100 cells · 2–6: 50% · 7–15: 30% · 16–49: 15% · 50+: 5.0%',
      num: undefined,
    },
    { kind: 'separator', key: null, label: '', value: '', num: undefined },
    { kind: 'row', key: 'f0', label: 'free at start', value: '50%', num: 50 },
    { kind: 'row', key: 'almost', label: 'traps', value: '4 (20%)', num: 4 },
    { kind: 'row', key: 'farBlock', label: 'blocked from afar', value: '3 (15%)', num: 3 },
    { kind: 'row', key: 'D', label: 'depth', value: '3', num: 3 },
    { kind: 'row', key: 'corridor', label: 'path to edge', value: '2.4', num: 2.4 },
    { kind: 'separator', key: null, label: '', value: '', num: undefined },
    { kind: 'row', key: 'span', label: 'average reach', value: '40%', num: 40 },
    { kind: 'row', key: 'spanTop', label: 'reach, top 10%', value: '60%', num: 60 },
    { kind: 'row', key: 'spanMax', label: 'reach, record', value: '80%', num: 80 },
    { kind: 'row', key: 'outDeg', label: 'blocks on average', value: '2.4 arrows', num: 2.4 },
    { kind: 'row', key: 'maxOut', label: 'blocks, record', value: '5 arrows', num: 5 },
    { kind: 'row', key: 'blockDist', label: 'blocking distance', value: '33% of width + height', num: 33 },
    { kind: 'separator', key: null, label: '', value: '', num: undefined },
    { kind: 'row', key: 'bends', label: 'bends per arrow', value: '1.50', num: 1.5 },
    { kind: 'row', key: 'turnsPerCell', label: 'turns per cell', value: '0.125', num: 0.125 },
    { kind: 'row', key: 'coil', label: 'coiling', value: '10%', num: 10 },
    { kind: 'row', key: 'ownSides', label: 'touching itself', value: '0.75', num: 0.75 },
    { kind: 'row', key: 'border', label: 'wrapping', value: '5%', num: 5 },
    { kind: 'row', key: 'neighbours', label: 'neighbours of a long arrow', value: '2.5', num: 2.5 },
    { kind: 'row', key: 'multi', label: 'bent arrows', value: '20%', num: 20 },
    { kind: 'separator', key: null, label: '', value: '', num: undefined },
    {
      kind: 'row',
      key: 'stall',
      label: 'stopped short',
      value: '20% of arrows laid, reaching 90% of the planned length',
      num: 20,
    },
    { kind: 'row', key: 'absorbed', label: 'merged leftovers', value: '3 patches (45 cells)', num: 3 },
    { kind: 'row', key: 'backtracks', label: 'backtracks / restarts', value: '7 / 2', num: 7 },
    { kind: 'row', key: 'time', label: 'time', value: 'generation 3.46 s, metrics 0.12 s', num: 3456 },
    { kind: 'separator', key: null, label: '', value: '', num: undefined },
    { kind: 'row', key: 'rework', label: 'tail reworks', value: '5 done, 2 gave up', num: 5 },
    {
      kind: 'row',
      key: 'stuckBy',
      label: 'what stopped them',
      value: 'itself 25% · other arrows 65% · edge 10%',
      num: undefined,
    },
    { kind: 'row', key: 'stuckLen', label: 'length when stuck', value: '6.0', num: 6 },
    { kind: 'row', key: 'selfTrap', label: 'stuck on themselves', value: '1 (20%)', num: 1 },
    {
      kind: 'row',
      key: 'shortened',
      label: 'shortened',
      value: '4% of arrows laid, 2.5 cells shorter on average',
      num: 4,
    },
  ]
  assertEquals(rows.length, 37)
```
4. Counts: "reportRows returns 23 rows and 4 separators" → rename to "reportRows returns 32 rows and 5 separators" with `32` and `5`; the key-uniqueness `Set` size `23` → `32`; the Polish-help `Set` size `23` → `32`.
5. `NO_NUMBER` becomes `['board', 'lengths', 'stuckBy']`.
6. Replace "reportRows pins the stall row's dash when stats.n is 0" with:
```ts
// A run that laid nothing: every carver row stays in its place with a dash
// and no number, so the delta rows below it do not shift.
Deno.test('reportRows keeps every carver row as a dash when nothing was laid', () => {
  const stats: CarverStats = { want: 0, got: 0, stall: 0, strandTrunc: 0, strandLoss: 0, n: 0, absorbs: 0, absorbed: 0 }
  const rows = reportRows({ ...pinnedBase, stats }, pinnedParams, dictionary('en'))
  for (const key of ['stall', 'stuckBy', 'stuckLen', 'selfTrap', 'shortened'] as const) {
    const found = rows.find((r) => r.key === key)
    assert(found, key)
    assertEquals([found.value, found.num], ['—', undefined], key)
  }
  assertEquals(rows.length, 37)
})

Deno.test('tail reworks read a dash with the setting off, and zero with it on and nothing to rework', () => {
  const stats: CarverStats = { want: 10, got: 10, stall: 0, strandTrunc: 0, strandLoss: 0, n: 5 }
  const off = reportRows({ ...pinnedBase, stats }, { ...pinnedParams, backbite: 0 }, dictionary('en'))
  const on = reportRows({ ...pinnedBase, stats }, pinnedParams, dictionary('en'))
  const rework = (rows: StatRow[]) => rows.find((r) => r.key === 'rework')
  assertEquals([rework(off)?.value, rework(off)?.num], ['—', undefined])
  assertEquals([rework(on)?.value, rework(on)?.num], ['0 done, 0 gave up', 0])
})
```
7. In "the Polish values follow the new words", give the stats the same fields as the pinned-rows test above (copy the object) and add:
```ts
  assertEquals(value('lengths'), '2–100 komórek · 2–6: 50% · 7–15: 30% · 16–49: 15% · 50+: 5.0%')
  assertEquals(value('rework'), '5 wykonanych, 2 porzucone')
  assertEquals(value('stuckBy'), 'ona sama 25% · inne strzałki 65% · krawędź 10%')
  assertEquals(value('shortened'), '4% ułożonych strzałek, średnio o 2.5 komórki krótszych')
```

- [ ] **Step 2: Run and watch them fail**

Run: `deno test --allow-read packages/engine/lab-report.test.ts 2>&1 | tail -15`
Expected: FAIL (unknown `StatKey`s, missing dictionary keys).

- [ ] **Step 3: Add the words**

`packages/engine/lab-i18n.ts`, EN, next to the other `stat_*` labels:
```ts
    stat_lengthsRange: (min: number, max: number) => `${min}–${max} cells`,
    stat_farBlock: 'blocked from afar',
    stat_turnsPerCell: 'turns per cell',
    stat_ownSides: 'touching itself',
    stat_neighbours: 'neighbours of a long arrow',
    stat_rework: 'tail reworks',
    stat_reworkVal: (done: number, gaveUp: number) => `${done} done, ${gaveUp} gave up`,
    stat_stuckBy: 'what stopped them',
    stat_stuckByVal: (own: string, other: string, edge: string) => `itself ${own} · other arrows ${other} · edge ${edge}`,
    stat_stuckLen: 'length when stuck',
    stat_selfTrap: 'stuck on themselves',
    stat_shortened: 'shortened',
    stat_shortenedVal: (share: string, cells: string) => `${share} of arrows laid, ${cells} cells shorter on average`,
```
EN helps, next to the other `stat_*_help`: the nine sentences of `HELP_EN` in Step 1, as `stat_farBlock_help`, `stat_turnsPerCell_help`, `stat_ownSides_help`, `stat_neighbours_help`, `stat_rework_help`, `stat_stuckBy_help`, `stat_stuckLen_help`, `stat_selfTrap_help`, `stat_shortened_help`, character for character. EN group name, after `statGroupRun`:
```ts
    statGroupDetail: 'generator in detail',
```
PL:
```ts
    stat_lengthsRange: (min, max) => `${min}–${max} ${plCells(max)}`,
    stat_farBlock: 'blokowane z daleka',
    stat_turnsPerCell: 'zakręty na komórkę',
    stat_ownSides: 'styk ze sobą',
    stat_neighbours: 'sąsiadki długiej strzałki',
    stat_rework: 'przeróbki ogona',
    stat_reworkVal: (done, gaveUp) =>
      `${done} ${plCount(done, 'wykonana', 'wykonane', 'wykonanych')}, ${gaveUp} ${
        plCount(gaveUp, 'porzucona', 'porzucone', 'porzuconych')
      }`,
    stat_stuckBy: 'co je zatrzymało',
    stat_stuckByVal: (own, other, edge) => `ona sama ${own} · inne strzałki ${other} · krawędź ${edge}`,
    stat_stuckLen: 'długość przy utknięciu',
    stat_selfTrap: 'utknięte na sobie',
    stat_shortened: 'skrócone',
    stat_shortenedVal: (share, cells) => `${share} ułożonych strzałek, średnio o ${cells} komórki krótszych`,
    stat_farBlock_help:
      'Strzałki, których najbliższa blokada stoi dalej niż 2 komórki przed grotem: tego, co je trzyma, nie widać od razu. Więcej = więcej blokad do wypatrzenia.',
    stat_turnsPerCell_help:
      'Zakręty na komórkę, na całej planszy: w odróżnieniu od zakrętów na strzałkę długa strzałka waży tyle, ile jej komórki. Więcej = bardziej kręto.',
    stat_ownSides_help:
      'Ile z czterech boków komórki styka się średnio z tą samą strzałką. Więcej = strzałki zawijają się na siebie.',
    stat_neighbours_help:
      'Dla strzałek od 8 komórek: ilu różnych strzałek dotyka każda z nich. Więcej = strzałki są bardziej splecione.',
    stat_rework_help:
      'W ostatniej próbie: ile razy strzałka, która utknęła w ślepym zaułku, przerobiła ogon i rosła dalej, a ile razy się poddała. Tylko przy włączonej przeróbce ogona. Więcej wykonanych = ustawienie działa.',
    stat_stuckBy_help:
      'W ostatniej próbie: co otaczało ogon strzałki, która nie mogła rosnąć dalej (ona sama, inne strzałki czy krawędź), jako udział boków. Wysokie „ona sama” = strzałki zamykają się same.',
    stat_stuckLen_help:
      'W ostatniej próbie: jak długa była średnio strzałka, gdy nie mogła rosnąć dalej. Więcej = strzałki utykają później.',
    stat_selfTrap_help:
      'W ostatniej próbie: zatrzymania, w których własne ciało strzałki zamknęło co najmniej dwa boki ogona. Więcej = strzałki częściej zamykają się same.',
    stat_shortened_help:
      'W ostatniej próbie: udział ułożonych strzałek skróconych, żeby nie zostawiły dziury, której żadna strzałka nie wypełni, i o ile komórek średnio. Mniej = mniej skróceń.',
    statGroupDetail: 'generator w szczegółach',
```
`plCount` gives `one` for 1, `few` for 2–4 (not 12–14) and `many` otherwise, so `'5 wykonanych, 2 porzucone'` is what Step 1 expects.

- [ ] **Step 4: Add the rows**

`packages/engine/lab-report.ts`: extend `StatKey` with the nine keys (after `'time'`, in any order the union allows; `deno fmt` keeps one per line). In `reportRows`, after `const cells = …`:
```ts
  // Each stall adds its tail's four sides to own + foreign + edge, so the sum
  // over four is the number of stalls; `stats.stall` counts short arrows instead.
  const sides = (stats.stallOwn ?? 0) + (stats.stallForeign ?? 0) + (stats.stallEdge ?? 0)
  const events = sides / 4
  const selfTrap = stats.stallSelfTrap ?? 0
```
The `lengths` value gains its range first:
```ts
      `${dict.t('stat_lengthsRange', metrics.minLen, metrics.maxLen)} · 2–6: ${pct(metrics.hist['2-6'] / metrics.N)} · 7–15: ${
        pct(metrics.hist['7-15'] / metrics.N)
      } · 16–49: ${pct(metrics.hist['16-49'] / metrics.N)} · 50+: ${(100 * metrics.hist['50+'] / metrics.N).toFixed(1)}%`,
```
After the `almost` row:
```ts
    stat(dict, 'farBlock', dict.t('stat_farBlock'), `${metrics.T2} (${pct(metrics.T2 / metrics.N)})`, metrics.T2),
```
After `bends`, `coil` and `border` respectively:
```ts
    stat(dict, 'turnsPerCell', dict.t('stat_turnsPerCell'), metrics.bendsPerCell.toFixed(3), metrics.bendsPerCell),
```
```ts
    stat(dict, 'ownSides', dict.t('stat_ownSides'), metrics.selfAdj.toFixed(2), metrics.selfAdj),
```
```ts
    stat(dict, 'neighbours', dict.t('stat_neighbours'), metrics.neighbours.toFixed(1), metrics.neighbours),
```
After the `time` row, one more group:
```ts
    SEP,
    // The knob's own switch, not the counters: with it on, a run that never
    // stalled leaves both counters unset and still reworked nothing.
    params.backbite === 0
      ? stat(dict, 'rework', dict.t('stat_rework'), '—')
      : stat(
        dict,
        'rework',
        dict.t('stat_rework'),
        dict.t('stat_reworkVal', stats.backbites ?? 0, stats.backbiteGiveUps ?? 0),
        stats.backbites ?? 0,
      ),
    stat(
      dict,
      'stuckBy',
      dict.t('stat_stuckBy'),
      sides
        ? dict.t(
          'stat_stuckByVal',
          pct((stats.stallOwn ?? 0) / sides),
          pct((stats.stallForeign ?? 0) / sides),
          pct((stats.stallEdge ?? 0) / sides),
        )
        : '—',
    ),
    stat(
      dict,
      'stuckLen',
      dict.t('stat_stuckLen'),
      events ? ((stats.stallLen ?? 0) / events).toFixed(1) : '—',
      events ? (stats.stallLen ?? 0) / events : undefined,
    ),
    stat(
      dict,
      'selfTrap',
      dict.t('stat_selfTrap'),
      events ? `${selfTrap} (${pct(selfTrap / events)})` : '—',
      events ? selfTrap : undefined,
    ),
    stat(
      dict,
      'shortened',
      dict.t('stat_shortened'),
      stats.n
        ? dict.t(
          'stat_shortenedVal',
          pct(stats.strandTrunc / stats.n),
          (stats.strandLoss / Math.max(1, stats.strandTrunc)).toFixed(1),
        )
        : '—',
      stats.n ? 100 * stats.strandTrunc / stats.n : undefined,
    ),
```
(The spec gives `selfTrap` the number `stallSelfTrap ?? 0` always; with no events the value is a dash, so the number is `undefined` too — a dash never carries a delta.)

Run `deno fmt packages/engine/lab-report.ts packages/engine/lab-i18n.ts packages/engine/lab-report.test.ts`.

- [ ] **Step 5: Engine tests pass**

Run:
```bash
set -o pipefail
deno test --allow-read packages/engine/lab-report.test.ts packages/engine/lab-i18n.test.ts packages/engine/glossary.test.ts packages/engine/comments.test.ts 2>&1 | tail -5
```
Expected: PASS. If `glossary.test.ts` refuses a word, change the word, not the guard.

- [ ] **Step 6: The lab draws six groups**

`apps/lab/src/report/StatsTable.tsx`:
```tsx
/** The name of each group, in the engine's order: one per span between its five separators. */
const GROUP_NAMES = [
  'statGroupSize',
  'statGroupBlocking',
  'statGroupReach',
  'statGroupShape',
  'statGroupRun',
  'statGroupDetail',
] as const
```
```tsx
export const WIDE_KEYS: readonly StatKey[] = [
  'board',
  'longest',
  'lengths',
  'stall',
  'absorbed',
  'time',
  'blockDist',
  'rework',
  'stuckBy',
  'shortened',
]
```
The component's doc comment: "The 23 statistics of the board on screen" → "The statistics of the board on screen".

`apps/lab/src/report/ReportPanel.browser.test.tsx` — the rows moved; data-row indices are now: pieces 1, longest 3, f0 5, almost 6, D 8, stall 23, time 26.
- the group case: `toHaveLength(5)` → `6`, `dataRows(...)` `23` → `32`, the EN heads list gains `'generator in detail'`, the PL list gains `'generator w szczegółach'`;
- `row(screen.container, 7)` (depth, in the summary case) → `row(screen.container, 8)`;
- `row(screen.container, 22)` (time) → `row(screen.container, 26)`;
- in the 352 px case, the opener of `row(screen.container, 19)` (stall) becomes both longest helps (EN `stall` 203 characters, PL `rework` 201):
```tsx
    // The longest sentences, open: stall in English, tail reworks in Polish.
    for (const at of [23, 27]) {
      const q = row(screen.container, at).cells[0]?.querySelector('button.q')
      if (q?.getAttribute('aria-expanded') === 'false') await act(async () => (q as HTMLButtonElement).click())
    }
```
- the two literal index lists: `expect(hidden).toEqual([1, 3, 7, 22])` → `[1, 3, 8, 26]`; `expect(long).toEqual([0, 3, 4, 14, 19, 20, 22])` → `[0, 3, 4, 15, 23, 24, 26, 27, 28, 31]`, its comment gaining ", tail reworks, what stopped them, shortened";
- the case `'twenty-three rows in five named groups, labelled by row headers'` → `'thirty-two rows in six named groups, labelled by row headers'`, its comment "The engine's five separators bound six groups";
- the comment "The 23 rows of a run…" (near the stored board's facts case) → "The rows of a run…";
- search the file for every other `row(screen.container, N)` and `rows[N]` with N ≥ 7 on the lab table and move it by the same map; rows 0–6 did not move. `stats(screen.container).rows[5]` at the stored board's facts table is a different table and does not move.

- [ ] **Step 7: Lab tests pass**

Run:
```bash
set -o pipefail
pnpm nx build engine 2>&1 | tail -1
cd apps/lab && pnpm exec vitest run src/report 2>&1 | tail -4 && pnpm run check 2>&1 | tail -2
```
Expected: PASS.

- [ ] **Step 8: Commit**

```bash
(cd apps/lab && pnpm exec prettier --write src/report)
git add packages/engine/lab-report.ts packages/engine/lab-report.test.ts packages/engine/lab-i18n.ts apps/lab/src/report
git commit -m "Report: tail reworks, why arrows stopped, T2, the shortest arrow and the wrapping trio"
```

---

### Task 3: Where a new arrow could still start, on a board that could not be filled

**Files:**
- Modify: `packages/engine/lab-i18n.ts` (`notClosedStatus` in EN and PL)
- Modify: `packages/engine/lab-i18n.test.ts`
- Modify: `apps/lab/src/stage/useRunState.ts`
- Modify: `apps/lab/src/stage/RunStatusBar.browser.test.tsx`

**Interfaces:**
- Produces: `notClosedStatus(remaining: string, fragments: number, largest: number, heads: number | null, exits: number): string`.

- [ ] **Step 1: Failing engine test**

Append to `packages/engine/lab-i18n.test.ts` (use its existing imports of `EN` and `PL`; add them if the file imports differently — read the top first):
```ts
Deno.test('the not-filled line names the open starts only when the run counted them', () => {
  assertEquals(
    EN.ui.notClosedStatus('12', 3, 7, null, 150),
    'The board could not be filled: at best 12 cells stayed empty, in 3 patches (largest 7). Try another seed or more straightness.',
  )
  assertEquals(
    EN.ui.notClosedStatus('12', 3, 7, 4, 150),
    'The board could not be filled: at best 12 cells stayed empty, in 3 patches (largest 7). At that moment a new arrow could still start in 4 of 150 places. Try another seed or more straightness.',
  )
  assertEquals(
    PL.ui.notClosedStatus('12', 3, 7, 4, 150),
    'Nie udało się wypełnić planszy: w najlepszym razie 12 komórek zostało pustych, w 3 łatkach (największa 7). Wtedy nowa strzałka mogła jeszcze zacząć się w 4 ze 150 miejsc. Spróbuj innego ziarna albo większej prostości.',
  )
})
```
Run: `deno test --allow-read packages/engine/lab-i18n.test.ts 2>&1 | tail -8` — Expected: FAIL (arity/type).

- [ ] **Step 2: The formatter**

EN:
```ts
    notClosedStatus: (remaining: string, fragments: number, largest: number, heads: number | null, exits: number) =>
      `The board could not be filled: at best ${remaining} cells stayed empty, in ${fragments} patches (largest ${largest}).${
        heads === null ? '' : ` At that moment a new arrow could still start in ${heads} of ${exits} places.`
      } Try another seed or more straightness.`,
```
PL (100–199 read "sto…", which takes "ze"; every other count takes "z"):
```ts
    notClosedStatus: (remaining, fragments, largest, heads, exits) =>
      `Nie udało się wypełnić planszy: w najlepszym razie ${remaining} komórek zostało pustych, w ${fragments} łatkach (największa ${largest}).${
        heads === null
          ? ''
          : ` Wtedy nowa strzałka mogła jeszcze zacząć się w ${heads} ${/^1\d\d$/.test(String(exits)) ? 'ze' : 'z'} ${exits} miejsc.`
      } Spróbuj innego ziarna albo większej prostości.`,
```
Run `deno fmt packages/engine/lab-i18n.ts packages/engine/lab-i18n.test.ts`, then:
```bash
set -o pipefail
deno test --allow-read packages/engine/lab-i18n.test.ts packages/engine/glossary.test.ts 2>&1 | tail -4
```
Expected: PASS.

- [ ] **Step 3: Failing lab test**

In `apps/lab/src/stage/RunStatusBar.browser.test.tsx`, inside the `describe` that holds "says the refusal over a finished run…", add:
```tsx
  // An 8 × 8 run has 2 × (8 + 8) = 32 places a head can stand; the stuck report is stated.
  it('names where a new arrow could still start on a board that could not be filled', async () => {
    const state = useStore.getState()
    state.run.started({ ...state.params.values, W: 8, H: 8 })
    const stuck = { remaining: 5, sizes: [3, 2], heads: 4 }
    state.completeRun({ board: RESULT.board, file: CLOSED.board, report: { ...CLOSED, ok: false, stuck } })
    const screen = await mountBar()
    await expect.element(screen.getByRole('status')).toMatchTextContent(EN.t('notClosedStatus', '5', 2, 3, 4, 32))
  })
```
Run: `pnpm nx build engine && (cd apps/lab && pnpm exec vitest run src/stage/RunStatusBar.browser.test.tsx 2>&1 | tail -6)` — Expected: FAIL (`tsc`-free vitest still runs; the text lacks the heads sentence).

- [ ] **Step 4: The status line**

`apps/lab/src/stage/useRunState.ts`, in `useRunLine`, next to `const report = …`:
```ts
  const shownParams = useStore((state) => state.result.shown?.params ?? null)
```
and the not-filled branch:
```ts
  } else {
    reportsRun = true
    const stuck = report.stuck
    // The places a head can stand are the four edges' lines: 2 × (W + H).
    const exits = shownParams === null ? 0 : 2 * (shownParams.W + shownParams.H)
    const heads = stuck === null || shownParams === null ? null : stuck.heads
    text = dict.t(
      'notClosedStatus',
      dict.fmt(stuck?.remaining ?? 0),
      stuck?.sizes.length ?? 0,
      stuck?.sizes[0] ?? 0,
      heads,
      exits,
    )
  }
```

- [ ] **Step 5: Pass and commit**

```bash
set -o pipefail
(cd apps/lab && pnpm exec vitest run src/stage 2>&1 | tail -4 && pnpm run check 2>&1 | tail -2 && pnpm exec prettier --write src/stage)
git add packages/engine/lab-i18n.ts packages/engine/lab-i18n.test.ts apps/lab/src/stage/useRunState.ts apps/lab/src/stage/RunStatusBar.browser.test.tsx
git commit -m "Lab: a board that could not be filled says where a new arrow could still start"
```

---

### Task 4: ⌘K reaches the colour and element fields

**Files:**
- Modify: `apps/lab/src/palette/commands.ts`
- Modify: `apps/lab/src/console/rows/PaletteRow.tsx` (the add button gets `id="view-palette"`)
- Modify: `packages/engine/lab-i18n.ts` (EN and PL: `valueNotSet`)
- Modify: `apps/lab/src/palette/commands.test.ts`
- Modify: `apps/lab/src/console/Console.jump.browser.test.tsx`

**Interfaces:**
- Consumes: `jumpTo(deps, 'preview', id)`, `lookOf(state.view)` and `PALETTE_CAP` from `../state/view.slice`, `PlainUiKey` from `../console/viewFields`.
- Produces: command ids `view-pad`, `view-pointColor`, `view-pointRadius`, `view-theme`, `view-palette`, `view-paper`, `view-ink`, `view-highlightColor`.

The values are worded as the panel shows them: the palette as its own count `paletteCount` ("0 / 8"), an unset colour as "not set" (with no theme the element's default is drawn, so "from the theme" would be false). Task 5 amends the spec's §2 table to match.

- [ ] **Step 1: The word for an unset colour**

EN, next to `valueOn`:
```ts
    valueNotSet: 'not set',
```
PL:
```ts
    valueNotSet: 'nie ustawiono',
```
`deno fmt packages/engine/lab-i18n.ts && pnpm nx build engine`.

- [ ] **Step 2: Failing unit tests**

In `apps/lab/src/palette/commands.test.ts`, inside `describe('the catalogue', …)`:
```ts
  it('reaches every colour and element field of the Preview panel, in its order', () => {
    const ids = buildCommands(deps(), useStore.getState())
      .filter((row) => row.section === 'knob')
      .map((row) => row.id)
    const look = [
      'view-pad',
      'view-pointColor',
      'view-pointRadius',
      'view-theme',
      'view-paper',
      'view-ink',
      'view-highlightColor',
      'view-palette',
    ]
    expect(ids.filter((id) => look.includes(id))).toEqual(look)
  })

  it('words an unset colour, an empty palette and no theme, and finds a field by its CLI flag', () => {
    const before = useStore.getState().view
    useStore.getState().view.apply({ theme: '', palette: [], paper: '', ink: '#112233' })
    try {
    const en = dictionary('en')
    const rows = buildCommands(deps(), useStore.getState())
    const value = (id: string) => rows.find((row) => row.id === id)?.value
    expect(value('view-theme')).toBe(en.t('viewThemeNone'))
    expect(value('view-palette')).toBe(en.t('paletteCount', 0, 8))
    expect(value('view-paper')).toBe(en.t('valueNotSet'))
    expect(value('view-ink')).toBe('#112233')
    expect(matchCommands(rows, '--highlight-color').map((row) => row.id)).toContain('view-highlightColor')
    expect(matchCommands(rows, '--pad').map((row) => row.id)).toContain('view-pad')
    } finally {
      useStore.getState().view.apply({ theme: before.theme, palette: before.palette, paper: before.paper, ink: before.ink })
    }
  })
```
Add `import { PALETTE_CAP } from '../state/view.slice'` to `commands.test.ts`. Check that `view.apply` accepts these fields (`ViewFields` keys: `theme`, `palette`, `paper`, `ink`) by reading `apply` in `state/view.slice.ts`; `paletteCount`'s cap is `PALETTE_CAP` (8) — import `PALETTE_CAP` instead of writing 8 if the test file can.
Run: `cd apps/lab && pnpm exec vitest run src/palette/commands.test.ts 2>&1 | tail -6` — Expected: FAIL.

- [ ] **Step 3: The rows**

`apps/lab/src/palette/commands.ts` — imports:
```ts
import type { PlainUiKey } from '../console/viewFields'
import { lookOf, PALETTE_CAP } from '../state/view.slice'
```
(merge with the existing `viewFields` import). New builder, after `knobRows`:
```ts
/**
 * The Preview panel's colour and element fields, in its order. The value is
 * worded as the panel shows it; `hay` carries the CLI's flag, so a word the
 * lab does not show (`paper`, `ink`) still finds its row.
 */
function lookRows(deps: CommandDeps, state: Store): Command[] {
  const { dict } = deps
  const look = lookOf(state.view)
  const colour = (value: string) => (value === '' ? dict.t('valueNotSet') : value)
  const row = (id: string, label: PlainUiKey, value: string, hay: string, target = id): Command => ({
    id,
    section: 'knob',
    name: dict.t(label),
    note: dict.t('preview'),
    value,
    hay,
    disabled: false,
    run: () => jumpTo(deps, 'preview', target),
  })
  return [
    row('view-pad', 'padLabel', String(look.pad), '--pad pad'),
    row('view-pointColor', 'pointColorLabel', look.pointColor, '--point-color'),
    row('view-pointRadius', 'pointRadiusLabel', String(look.pointRadius), '--point-radius'),
    row('view-theme', 'themeLabel', look.theme === '' ? dict.t('viewThemeNone') : look.theme, '--theme theme'),
    row('view-paper', 'paperLabel', colour(look.paper), '--paper paper'),
    row('view-ink', 'inkLabel', colour(look.ink), '--ink ink'),
    row('view-highlightColor', 'highlightColorLabel', colour(look.highlight), '--highlight-color highlight'),
    // At the cap the add button is disabled and cannot take the focus.
    row(
      'view-palette',
      'paletteLabel',
      dict.t('paletteCount', look.palette.length, PALETTE_CAP),
      '--palette palette',
      look.palette.length >= PALETTE_CAP ? 'view-palette-0' : 'view-palette',
    ),
  ]
}
```
and in `buildCommands`:
```ts
  return [...run, ...go, ...knobRows(deps, state), ...lookRows(deps, state), ...presetRows(deps)]
```
If `padLabel`, `pointColorLabel`, `pointRadiusLabel`, `themeLabel`, `paletteLabel`, `paperLabel`, `inkLabel` or `highlightColorLabel` is not a `PlainUiKey` (a formatter), `tsc` says so — use the row's plain label key instead.

`apps/lab/src/console/rows/PaletteRow.tsx`, the add button:
```tsx
          <button
            id="view-palette"
            type="button"
            className="kv-chip"
```
(`RowShell` with `labelAs="span"` puts no element on the id `view-palette`, so this is the only one; check with `grep -n 'htmlFor\|id=' apps/lab/src/console/rows/RowShell.tsx`.)

- [ ] **Step 4: Failing browser jump cases**

In `apps/lab/src/console/Console.jump.browser.test.tsx` add a second `describe`:
```tsx
describe('a palette jump to the colour fields', () => {
  it('lands on the add button of an empty palette, and on the first colour of a full one', async () => {
    const palette = useStore.getState().view.palette
    try {
      useStore.getState().view.setPalette([])
      await mountApp()
      await loadRunDone()
      await act(async () => {
        useStore.getState().ui.select('preview')
        useStore.getState().ui.requestFocus('view-palette')
      })
      expect(document.activeElement?.id).toBe('view-palette')
      await act(async () => {
        useStore.getState().view.setPalette(Array.from({ length: 8 }, () => '#112233'))
        useStore.getState().ui.requestFocus('view-palette-0')
      })
      expect(document.activeElement?.id).toBe('view-palette-0')
    } finally {
      useStore.getState().view.setPalette(palette)
    }
  })

  it('opens the dots block for the dot colour and keeps the focus there past the next render', async () => {
    const showPoints = useStore.getState().view.showPoints
    useStore.getState().view.setFlag('showPoints', false)
    try {
      await mountApp()
      await loadRunDone()
      await act(async () => {
        useStore.getState().ui.select('preview')
        useStore.getState().ui.requestFocus('view-pointColor')
      })
      expect(document.activeElement?.id).toBe('view-pointColor')
      await act(async () => useStore.getState().params.set('seed', 8))
      await twoFrames()
      expect(document.activeElement?.id).toBe('view-pointColor')
      expect(document.getElementById('dep-points')?.hidden).toBe(false)
    } finally {
      useStore.getState().view.setFlag('showPoints', showPoints)
    }
  })

  it('lands on the highlight colour', async () => {
    await mountApp()
    await loadRunDone()
    await act(async () => {
      useStore.getState().ui.select('preview')
      useStore.getState().ui.requestFocus('view-highlightColor')
    })
    expect(document.activeElement?.id).toBe('view-highlightColor')
  })
})
```
The first case drives the focus request, not the command's `run`: the command's choice of target is pinned by a unit case — add to `commands.test.ts`, inside `describe('the catalogue', …)`:
```ts
  it('sends a full palette to its first colour, since the add button is disabled there', () => {
    useStore.getState().view.setPalette(Array.from({ length: PALETTE_CAP }, () => '#112233'))
    const focused: (string | null)[] = []
    const unsubscribe = useStore.subscribe((state) => focused.push(state.ui.focusTarget))
    buildCommands(deps(), useStore.getState()).find((row) => row.id === 'view-palette')?.run()
    unsubscribe()
    expect(focused.at(-1)).toBe('view-palette-0')
    useStore.getState().view.setPalette([])
  })
```
(Check that `ui.focusTarget` is the field `requestFocus` sets — `ViewPanel.tsx` reads `state.ui.focusTarget` — and that `closePalette` does not clear it.)

Run:
```bash
set -o pipefail
cd apps/lab && pnpm exec vitest run src/palette src/console/Console.jump.browser.test.tsx 2>&1 | tail -6
```
Expected: PASS. Control: remove the `id` from the `PaletteRow` add button and rerun — the empty-palette case must FAIL (no element `view-palette`); put the `id` back.

- [ ] **Step 5: Commit**

```bash
set -o pipefail
(cd apps/lab && pnpm run check 2>&1 | tail -2 && pnpm exec prettier --write src/palette src/console/rows/PaletteRow.tsx src/console/Console.jump.browser.test.tsx)
git add packages/engine/lab-i18n.ts apps/lab/src/palette apps/lab/src/console/rows/PaletteRow.tsx apps/lab/src/console/Console.jump.browser.test.tsx
git commit -m "⌘K: the margin, the dots and the colours, each a jump to its row"
```

---

### Task 5: Documents and the full gate

**Files:**
- Modify: `lab-review.md`

- [ ] **Step 1: The review's statuses**

In `lab-review.md`, section "### Feature parity" table:
- the row "Gap 4: missing report rows (`backbites`, `T2`, `minLen`, …)": status `fixed on \`lab/report-parity\``, note "and the delta's colour is the direction of the change";
- the row "⌘K rows for colour and element fields (highlight, pad, …)": status `fixed on \`lab/report-parity\``, note empty.

In "### What is still open", item 4 becomes:
```md
4. **Parity gaps, as product decisions:** paste a `carve` command in
   (`parseArgs`), closing rate over N seeds, Stop that keeps the partial
   board, and opening a `.board.json`. The report rows and the ⌘K rows for
   the colour and element fields are done on `lab/report-parity`.
```

Line 21 of `lab-review.md` (the summary sentence saying about a third of the engine's metrics are missing): add "(since shown on `lab/report-parity`)" after it.

In the spec `docs/superpowers/specs/2026-09-28-lab-report-parity-design.md` §2: reorder the table as the panel draws it (margin, dot colour, dot size, theme, background, lines, highlight colour, palette), set the palette's value to "`paletteCount` (`0 / 8`)" and an unset colour's to "not set / nie ustawiono", and replace the sentence "The only new texts are the palette count and \"from the theme\"." with "The only new text is \"not set\": with no theme an unset colour is the element's default, so \"from the theme\" would be false."; in the table of §1 the label of `shortened` is "shortened / skrócone".

- [ ] **Step 2: The full gate, in a clean state**

Run from the worktree root:
```bash
set -o pipefail
deno task verify 2>&1 | tail -4
pnpm nx run-many -t verify 2>&1 | tail -6
```
Expected: both exit 0. A failure of `deno task fmt` or the lab's `fmt` is fixed by formatting the named file, then rerun.

- [ ] **Step 3: Commit**

```bash
git add lab-review.md docs/superpowers/specs/2026-09-28-lab-report-parity-design.md
git commit -m "Docs: the report rows and the ⌘K colour rows are done"
```

- [ ] **Step 4: Live pass (the controller, not a subagent)**

Per the measurement recipes (a copy of the boards dir through `ARROWZ_BOARDS_DIR`, own ports): `pnpm nx serve lab`, then in Chrome, both languages:
1. Generate twice with different `backbite` (0, then 3): the `tail reworks` row reads `—`, then counts; the deltas are green where a number rose and red where it fell, the pieces row included.
2. Open the `?` of `what stopped them` and `tail reworks` at the narrow drawer: nothing runs past its row.
3. ⌘K: type `--ink`, `margin`, `palette`, `dot`: each row jumps to its control and the control keeps the focus; with 8 palette colours the jump lands on colour 1.
4. A board that cannot be filled (e.g. a tiny board with `pStraight` 1 if it jams — find one with `deno task carve`): the status line names the open places.
