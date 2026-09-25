# Lab report copy Implementation Plan

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:subagent-driven-development (recommended) or superpowers:executing-plans to implement this plan task-by-task. Steps use checkbox (`- [ ]`) syntax for tracking.

**Goal:** Every row of the lab's report, its summary and its longest-arrows table explains itself behind a `?`, in English and Polish, with labels a player understands.

**Architecture:** The engine's pure report builder (`packages/engine/lab-report.ts`) gains a `help` field per row, read from the dictionary (`packages/engine/lab-i18n.ts`). The lab's report components (`apps/lab/src/report`) render it with the knob rows' own `useKnobHelp` hook. The lab reads the engine from `packages/engine/dist`, so the engine is rebuilt before any lab test.

**Tech Stack:** TypeScript, Deno 2.9 (engine tests), React 19 + Vitest browser mode (lab, projects `node` and `chromium`), Nx, pnpm.

**Spec:** `docs/superpowers/specs/2026-09-25-lab-report-copy-design.md` — read it first; its table "Labels, values and help" is the source of every string below.

## Global Constraints

- Everything in the repository is English; Polish only in `PL` of `lab-i18n.ts`.
- Comments say why, once; non-header blocks ≤ 6 lines; no history (PR, task, review) in comments; cite symbols, never `file.ts:NN` (guard: `packages/engine/comments.test.ts`).
- No `any`, no non-null assertions (`!`).
- The engine and `lab-*.ts` know neither Deno nor the DOM.
- The lab imports the engine only from `dist`: after changing `packages/engine`, run `pnpm nx build engine` before any lab test or check.
- Lab tests run in two Vitest projects, `node` and `chromium`; `npx vitest run <path>` from `apps/lab` runs both. The chromium project loads only the stylesheets a test imports.
- Commit after each task; no attribution lines in commit messages.
- Every task ends with `deno task test` (in `packages/engine`) and the touched lab test files green.

## Review Focus

1. A language switch while a row's help is open: the paragraph turns Polish and stays open (Task 2 test).
2. A new result while a help is open: the same row's help stays open, not a neighbour's (Task 2 test).
3. The summary's four rows leave the table: their help must be reachable from the summary, not from a hidden row (Task 3 test).
4. Polish at the L drawer's 352px with the longest Polish help open: nothing runs past its row (Task 2 test, extends the 352px case).
5. A finger: the report's `?` gets the same 32px target as the knobs' under `(pointer: coarse), (max-width: 767px)`, and a row with it keeps its label on one line (Task 2 CSS; checked in the live pass, Task 5).

---

### Task 1: Engine — labels, help, values and directions

**Files:**
- Modify: `packages/engine/lab-report.ts` (`StatRow`, `stat`, `SEP`, `reportRows`)
- Modify: `packages/engine/lab-i18n.ts` (`EN.ui`, `PL.ui`)
- Test: `packages/engine/lab-report.test.ts`
- Modify (text assertions only): `apps/lab/src/report/ReportPanel.browser.test.tsx`

**Interfaces:**
- Produces: `StatRow.help: string` (`''` on a separator); dictionary keys `stat_<StatKey>_help` for all 23 `StatKey`s in `EN.ui` and `PL.ui`. `statSumD` stays in this task (Task 3 deletes it).

- [ ] **Step 1: Write the failing engine tests**

In `packages/engine/lab-report.test.ts`:

1. Import `type StatKey` from `./lab-report.ts`.
2. Add, above the pinned test, the spec's English help, verbatim:

```ts
// The spec's sentences, verbatim: a changed word is a changed spec.
const HELP_EN: Record<StatKey, string> = {
  board: 'Width × height, the number of cells, and the seed that reproduces this board.',
  pieces: 'How many arrows the board has. More arrows = a longer game.',
  avgLen: 'Cells per arrow, on average.',
  longest: 'The longest arrow, in cells and as a share of the board.',
  lengths: 'Share of arrows by length in cells: 2–6, 7–15, 16–49 and 50 or more.',
  f0: 'Arrows you can remove on the very first move. Lower = harder.',
  almost:
    'Arrows blocked by exactly one other: they look almost free, but are not. More = more tempting mistakes.',
  D: 'The longest chain of arrows waiting on one another. Even removing every free arrow at once, clearing the board takes depth + 1 rounds. Higher = harder.',
  corridor: 'How many cells, on average, an arrow has to travel in the direction it points to leave the board.',
  span: "How much of the board's width or height an arrow stretches across, on average (the larger of the two).",
  spanTop: 'The same, for the 10% of arrows that reach furthest.',
  spanMax: 'The reach of the one arrow that reaches furthest.',
  outDeg: 'How many arrows each arrow stands in the way of, on average. Higher = removing one arrow frees more.',
  maxOut: 'The most arrows a single arrow stands in the way of.',
  blockDist:
    "How far an arrow's head is from the heads of the arrows it blocks, on average, as a share of width + height. Higher = one move matters across the board.",
  bends: 'How many times an arrow turns, on average.',
  coil: 'Share of cells where an arrow touches itself on three sides: a clump rather than a line. Lower = cleaner arrows.',
  border:
    'For arrows of 8 cells or more: how much of an arrow runs alongside a single neighbour. Higher = arrows wrap around each other.',
  multi: 'Share of arrows that are not one straight line.',
  stall:
    'How the generator worked: the share of the arrows it laid (taken-back ones included) that stopped before the length it planned for them, and how much of the planned length they reached. Lower = smoother.',
  absorbed: 'How the generator worked: small empty patches it glued onto neighbouring arrows. Fewer = a cleaner board.',
  backtracks:
    'How the generator worked: how many times it took arrows back, and how many fresh attempts it needed.',
  time: 'How long the board took to generate and to measure.',
}
```

3. Replace the `expected` array of `'reportRows pins the exact text of every row for a hand-built run'` with this one, typed `Omit<StatRow, 'help'>[]`, and compare with the help added:

```ts
  const expected: Omit<StatRow, 'help'>[] = [
    { kind: 'row', key: 'board', label: 'board', value: '20 × 20 = 400 cells, seed 3', num: undefined, better: 0 },
    { kind: 'row', key: 'pieces', label: 'arrows', value: '20', num: 20, better: 0 },
    { kind: 'row', key: 'avgLen', label: 'average length', value: '20.0', num: 20, better: 0 },
    { kind: 'row', key: 'longest', label: 'longest', value: '100 cells (25% of the board)', num: 100, better: 1 },
    {
      kind: 'row',
      key: 'lengths',
      label: 'lengths',
      value: '2–6: 50% · 7–15: 30% · 16–49: 15% · 50+: 5.0%',
      num: undefined,
      better: 0,
    },
    { kind: 'separator', key: null, label: '', value: '', num: undefined, better: 0 },
    { kind: 'row', key: 'f0', label: 'free at start', value: '50%', num: 50, better: -1 },
    { kind: 'row', key: 'almost', label: 'traps', value: '4 (20%)', num: 4, better: 1 },
    { kind: 'row', key: 'D', label: 'depth', value: '3', num: 3, better: 1 },
    { kind: 'row', key: 'corridor', label: 'path to edge', value: '2.4', num: 2.4, better: 0 },
    { kind: 'separator', key: null, label: '', value: '', num: undefined, better: 0 },
    { kind: 'row', key: 'span', label: 'average reach', value: '40%', num: 40, better: 1 },
    { kind: 'row', key: 'spanTop', label: 'reach, top 10%', value: '60%', num: 60, better: 1 },
    { kind: 'row', key: 'spanMax', label: 'reach, record', value: '80%', num: 80, better: 1 },
    { kind: 'row', key: 'outDeg', label: 'blocks on average', value: '2.4 arrows', num: 2.4, better: 1 },
    { kind: 'row', key: 'maxOut', label: 'blocks, record', value: '5 arrows', num: 5, better: 1 },
    {
      kind: 'row',
      key: 'blockDist',
      label: 'blocking distance',
      value: '33% of width + height',
      num: 33,
      better: 1,
    },
    { kind: 'separator', key: null, label: '', value: '', num: undefined, better: 0 },
    { kind: 'row', key: 'bends', label: 'bends per arrow', value: '1.50', num: 1.5, better: 1 },
    { kind: 'row', key: 'coil', label: 'coiling', value: '10%', num: 10, better: -1 },
    { kind: 'row', key: 'border', label: 'wrapping', value: '5%', num: 5, better: 1 },
    { kind: 'row', key: 'multi', label: 'bent arrows', value: '20%', num: 20, better: 1 },
    { kind: 'separator', key: null, label: '', value: '', num: undefined, better: 0 },
    {
      kind: 'row',
      key: 'stall',
      label: 'stopped short',
      value: '20% of arrows laid, reaching 90% of the planned length',
      num: 20,
      better: -1,
    },
    { kind: 'row', key: 'absorbed', label: 'merged leftovers', value: '3 patches (45 cells)', num: 3, better: -1 },
    { kind: 'row', key: 'backtracks', label: 'backtracks / restarts', value: '7 / 2', num: 7, better: -1 },
    { kind: 'row', key: 'time', label: 'time', value: 'generation 3.46 s, metrics 0.12 s', num: 3456, better: -1 },
  ]
  assertEquals(rows.length, 27)
  assertEquals(rows, expected.map((row) => ({ ...row, help: row.key === null ? '' : HELP_EN[row.key] })))
```

4. In `"reportRows pins the stall row's dash when stats.n is 0"`, find the row by key and pin the new label and help:

```ts
  const stallRow = rows.find((r) => r.key === 'stall')
  assert(stallRow)
  assertEquals(stallRow, {
    kind: 'row',
    key: 'stall',
    label: 'stopped short',
    value: '—',
    num: undefined,
    better: -1,
    help: HELP_EN.stall,
  })
```

5. Add two tests after it:

```ts
// Each row's own sentence, in Polish: not the English one left behind, and not a neighbour's.
Deno.test('every row explains itself in Polish too, each in its own sentence', () => {
  const params = { ...defaultParams(), W: 20, H: 20, seed: 3 }
  const r = run(20, 20, 3)
  const en = reportRows(r, params, dictionary('en'))
  const pl = reportRows(r, params, dictionary('pl'))
  for (const [at, row] of pl.entries()) {
    if (row.kind === 'separator') {
      assertEquals(row.help, '')
      continue
    }
    assert(row.help.length > 0, `${row.key} has no Polish help`)
    assert(row.help !== en[at]?.help, `${row.key} is still English`)
  }
  assertEquals(new Set(pl.filter((row) => row.kind === 'row').map((row) => row.help)).size, 23)
})

Deno.test('the Polish values follow the new words', () => {
  const stats: CarverStats = {
    want: 100,
    got: 90,
    stall: 20,
    strandTrunc: 0,
    strandLoss: 0,
    n: 100,
    absorbs: 3,
    absorbed: 45,
  }
  const rows = reportRows({ ...pinnedBase, stats }, pinnedParams, dictionary('pl'))
  const value = (key: StatKey) => rows.find((row) => row.key === key)?.value
  assertEquals(value('pieces'), '20')
  assertEquals(value('f0'), '50%')
  assertEquals(value('outDeg'), '2.4 strz.')
  assertEquals(value('stall'), '20% ułożonych strzałek, osiągają 90% zaplanowanej długości')
  assertEquals(value('absorbed'), '3 łatek (45 komórek)')
  assertEquals(value('time'), 'generowanie 3.46 s, statystyki 0.12 s')
})
```

- [ ] **Step 2: Run the engine tests to see them fail**

Run: `cd packages/engine && deno test lab-report.test.ts`
Expected: FAIL — `deno check` reports that `help` does not exist on `StatRow` (or, once typed, the pinned rows differ).

- [ ] **Step 3: Add `help` to the row**

In `packages/engine/lab-report.ts`:

```ts
export interface StatRow {
  readonly kind: 'row' | 'separator'
  /** The row's own name; null on a separator, which is no row. */
  readonly key: StatKey | null
  readonly label: string
  readonly value: string
  /** One or two sentences on what the row measures and, where there is one, which way is harder; '' on a separator. */
  readonly help: string
  // ...num and better unchanged
}
```

`stat` takes the dictionary so it can read the help; every call in `reportRows` passes `dict` first:

```ts
/** A row whose value may arrive as a number: the surface renders text either way. */
const stat = (dict: Dict, key: StatKey, label: string, value: string | number, num?: number, better = 0): StatRow => ({
  kind: 'row',
  key,
  label,
  value: String(value),
  help: dict.t(`stat_${key}_help` as const),
  num,
  better,
})
const SEP: StatRow = { kind: 'separator', key: null, label: '', value: '', help: '', num: undefined, better: 0 }
```

If `deno check` rejects `` `stat_${key}_help` as const `` as a `UiKey` (it must not once every key exists), stop and report: do not cast to a single key.

In `reportRows`, change three rows:

```ts
    stat(dict, 'f0', dict.t('stat_f0'), pct(metrics.f0), 100 * metrics.f0, -1),
    stat(dict, 'almost', dict.t('stat_almost'), `${metrics.almost} (${pct(metrics.almost / metrics.N)})`, metrics.almost, 1),
    stat(dict, 'D', dict.t('stat_D'), metrics.D, metrics.D, 1),
```

Update the `reportDelta` doc comment's example list if it names the piece count as neutral: "the arrow count is neutral".

- [ ] **Step 4: Write the dictionary entries**

In `packages/engine/lab-i18n.ts`, `EN.ui`, set these values (keys unchanged unless new):

```ts
    stat_pieces: 'arrows',
    stat_lengths: 'lengths',
    stat_f0: 'free at start',
    stat_almost: 'traps',
    stat_D: 'depth',
    stat_corridor: 'path to edge',
    stat_span: 'average reach',
    stat_spanTop: 'reach, top 10%',
    stat_spanMax: 'reach, record',
    stat_outDeg: 'blocks on average',
    stat_maxOut: 'blocks, record',
    stat_blockDist: 'blocking distance',
    piecesUnit: 'arrows',
    stat_bends: 'bends per arrow',
    stat_border: 'wrapping',
    stat_multi: 'bent arrows',
    stat_stall: 'stopped short',
    stat_stallVal: (pStall: string, pGot: string) => `${pStall} of arrows laid, reaching ${pGot} of the planned length`,
    stat_absorbed: 'merged leftovers',
    stat_absorbedVal: (n: number, cells: number) => `${n} patches (${cells} cells)`,
    longestHead: (n: number) => `The ${n} longest arrows`,
    longestHelp:
      'Reach = what fraction of the board side the arrow covers. Density = how tightly it fills its rectangle. Coiling = share of cells touching their own path on three sides. A snake crossing the board has a high reach and low other two; a coil the opposite.',
    th_span: 'reach',
    reportSummaryCap: "vs. the previous board: green = better, red = worse; a row's ? says which way is better",
    statGroupBlocking: 'difficulty',
    statGroupRun: 'generator',
```

and add, right after `stat_timeVal`, the 23 help entries — the `HELP_EN` strings of Step 1, one per key, named `stat_<key>_help` (e.g. `stat_board_help: 'Width × height, the number of cells, and the seed that reproduces this board.',`).

In `PL.ui`, set:

```ts
    stat_pieces: 'strzałki',
    stat_longest: 'najdłuższa',
    stat_lengths: 'długości',
    stat_f0: 'wolne na starcie',
    stat_almost: 'pułapki',
    stat_D: 'głębokość',
    stat_corridor: 'droga do krawędzi',
    stat_span: 'średni zasięg',
    stat_spanTop: 'zasięg, górne 10%',
    stat_spanMax: 'zasięg, rekord',
    stat_outDeg: 'blokuje średnio',
    stat_maxOut: 'blokuje, rekord',
    stat_blockDist: 'dystans blokad',
    piecesUnit: 'strz.',
    stat_bends: 'zakręty na strzałkę',
    stat_border: 'oplatanie',
    stat_multi: 'zgięte strzałki',
    stat_stall: 'urwane przed celem',
    stat_stallVal: (pStall, pGot) => `${pStall} ułożonych strzałek, osiągają ${pGot} zaplanowanej długości`,
    stat_absorbed: 'doklejone resztki',
    stat_absorbedVal: (n, cells) => `${n} łatek (${cells} komórek)`,
    stat_timeVal: (g, m) => `generowanie ${g} s, statystyki ${m} s`,
    stat_genVal: (g) => `generowanie ${g} s`,
    longestHead: (n) => `${n} najdłuższych strzałek`,
    longestHelp:
      'Zasięg = jaką część boku planszy strzałka obejmuje. Gęstość = jak ciasno wypełnia swój prostokąt. Zwinięcie = udział komórek dotykających własnej ścieżki z trzech stron. Wąż przecinający planszę ma wysoki zasięg i niskie dwa pozostałe; zwój — odwrotnie.',
    th_span: 'zasięg',
    reportSummaryCap: 'wobec poprzedniej planszy: zielone = lepiej, czerwone = gorzej; ? przy wierszu mówi, w którą stronę jest lepiej',
    statGroupBlocking: 'trudność',
    statGroupRun: 'generator',
```

and the 23 Polish help entries `stat_<key>_help`, verbatim from the spec's "PL help" column (e.g. `stat_D_help: 'Najdłuższy łańcuch strzałek czekających jedna na drugą. Nawet zdejmując naraz wszystkie wolne, potrzeba głębokość + 1 rund. Więcej = trudniej.',`).

- [ ] **Step 5: Run the engine gate**

Run: `cd packages/engine && deno task test`
Expected: PASS, including `lab-i18n.test.ts` (EN/PL key parity) and `comments.test.ts`.

- [ ] **Step 6: Rebuild the engine and update the lab's text assertions**

Run: `pnpm nx build engine`

In `apps/lab/src/report/ReportPanel.browser.test.tsx`, change only expected strings (the markup is unchanged in this task):

- `'twenty-three rows in five named groups…'`: EN heads `['size', 'difficulty', 'reach', 'shape', 'generator']`; PL `['rozmiar', 'trudność', 'zasięg', 'kształt', 'generator']`.
- `'a language switch keeps every delta'`: `'elementów'` → `'strzałki'`.
- `'the summary puts four figures…'`: the caption → `"vs. the previous board: green = better, red = worse; a row's ? says which way is better"`; the terms → `['arrows', 'longest', 'D', 'time']`.
- `'the summary keeps what the rows it hides used to say'`: the abbr title → `'depth'`.
- `'the longest pieces follow the highlight count…'` and `'the stored board lists its longest pieces…'`: `'5 longest'` → `'The 5 longest arrows'`.
- `'on the saved boards the report describes…'`: labels `['board', 'arrows', 'average length', 'longest', 'backtracks / restarts', 'time']`; `/longest$/` → `/longest arrows$/`.
- The comment in `'wide values are chosen by the row…'` lists rows by name: rename them (`blocking distance`, `stopped short`, `merged leftovers`, `lengths`).

- [ ] **Step 7: Run the lab's report tests and the lab check**

Run: `cd apps/lab && npx vitest run src/report && cd ../.. && pnpm nx run lab:check`
Expected: PASS (both projects). If another lab test fails on a renamed string, update its expected string the same way and name it in the commit.

- [ ] **Step 8: Commit**

```bash
git add packages/engine/lab-report.ts packages/engine/lab-i18n.ts packages/engine/lab-report.test.ts apps/lab/src/report/ReportPanel.browser.test.tsx
git commit -m "Report: every row carries its help, in player's words, and depth, traps and free-at-start say which way is harder"
```

---

### Task 2: The statistics table's `?` (run and stored board)

**Files:**
- Create: `apps/lab/src/report/StatRowView.tsx`
- Modify: `apps/lab/src/report/StatsTable.tsx`, `apps/lab/src/report/StoredFacts.tsx`
- Modify: `apps/lab/src/design/report.css`, `apps/lab/src/design/console.css`
- Test: `apps/lab/src/report/ReportPanel.browser.test.tsx`

**Interfaces:**
- Consumes: `StatRow.help`, `stat_<key>_help` (Task 1); `useKnobHelp(id: string, name: string, text: string): { button: ReactElement; paragraph: ReactElement }` from `apps/lab/src/console/KnobRow.tsx`.
- Produces: `StatRowView({ id, label, value, help, className, delta }: { id: string; label: string; value: string; help: string; className: string | undefined; delta: ReactNode })` rendering `<tr>` with `th > span.st-lab + button.q`, `td.num`, `td.fw-delta`, `td.st-help > p`. Help ids: `stat-help-<key>` (run) and `stored-help-<key>` (stored board).

- [ ] **Step 1: Write the failing browser tests**

In `ReportPanel.browser.test.tsx`, add a helper next to `row`:

```ts
/** A row's label, without its `?`. */
function labelOf(tr: HTMLTableRowElement | undefined): string | null | undefined {
  return tr?.cells[0]?.querySelector('.st-lab')?.textContent
}
```

Change the reads of a row's label to it: in `'a language switch keeps every delta'` use `expect(labelOf(row(screen.container, 1))).toBe('strzałki')`; in `'on the saved boards…'` map rows with `[labelOf(tr), tr.cells[1]?.textContent]`.

Add the tests:

```ts
// f0 is row 5, on screen and not repeated by the summary.
test("a row's ? opens its sentence under it, and closes it", async () => {
  const screen = await mountReport()
  await act(async () => finish(ONE))
  const f0 = row(screen.container, 5)
  const button = f0.cells[0]?.querySelector('button.q')
  if (!(button instanceof HTMLButtonElement)) throw new Error('f0 has no ?')
  expect(button.getAttribute('aria-label')).toBe('About free at start')
  expect(button.getAttribute('aria-expanded')).toBe('false')
  const help = document.getElementById(button.getAttribute('aria-controls') ?? '')
  expect(help?.textContent).toBe('Arrows you can remove on the very first move. Lower = harder.')
  expect(help?.classList.contains('fw-vh')).toBe(true)
  expect(f0.getBoundingClientRect().height).toBe(34)
  await act(async () => button.click())
  expect(button.getAttribute('aria-expanded')).toBe('true')
  expect(help?.classList.contains('fw-vh')).toBe(false)
  expect(help?.getBoundingClientRect().top).toBeGreaterThanOrEqual(f0.cells[0]?.getBoundingClientRect().bottom ?? Infinity)
  await act(async () => button.click())
  expect(help?.classList.contains('fw-vh')).toBe(true)
})

test('an open help follows the language and a new result, on the same row', async () => {
  const screen = await mountReport()
  await act(async () => finish(ONE))
  const button = () => row(screen.container, 5).cells[0]?.querySelector('button.q')
  await act(async () => (button() as HTMLButtonElement).click())
  await act(async () => useStore.getState().lang.setLang('pl'))
  expect(button()?.getAttribute('aria-expanded')).toBe('true')
  expect(row(screen.container, 5).querySelector('.st-help p')?.textContent).toBe(
    'Strzałki, które można zdjąć w pierwszym ruchu. Mniej = trudniej.',
  )
  await act(async () => finish(TWO))
  expect(button()?.getAttribute('aria-expanded')).toBe('true')
  expect(row(screen.container, 6).cells[0]?.querySelector('button.q')?.getAttribute('aria-expanded')).toBe('false')
})

test('a stored board explains its rows the same way', async () => {
  const stored = storedFixture(1)
  const screen = await mountReport(`/boards/8x8/${stored.meta.id}`)
  await act(async () =>
    useStore.getState().result.showPreview({ board: decodeBoard(stored.file), file: stored.file, meta: stored.meta }),
  )
  const pieces = stats(screen.container).rows[1]
  const button = pieces?.cells[0]?.querySelector('button.q')
  expect(button?.getAttribute('aria-controls')).toBe('stored-help-pieces')
  expect(document.getElementById('stored-help-pieces')?.textContent).toBe(
    'How many arrows the board has. More arrows = a longer game.',
  )
})
```

In `'at 352px nothing in the report runs past its row…'`, open the longest Polish help before the checks, inside the language loop, after `setLang`:

```ts
    // The longest sentence in either language, open: it wraps inside its own cell.
    const dist = row(screen.container, 14).cells[0]?.querySelector('button.q')
    if (dist?.getAttribute('aria-expanded') === 'false') await act(async () => (dist as HTMLButtonElement).click())
```

(Row 14 is `blockDist`; the existing loops then cover its `td.st-help`.)

- [ ] **Step 2: Run them to see them fail**

Run: `cd apps/lab && npx vitest run src/report/ReportPanel.browser.test.tsx`
Expected: FAIL — no `button.q`, no `.st-lab`.

- [ ] **Step 3: Write `StatRowView`**

`apps/lab/src/report/StatRowView.tsx`:

```tsx
import type { ReactElement, ReactNode } from 'react'
import { useKnobHelp } from '../console/KnobRow'

/**
 * One statistic: label and its `?`, value, change, and the help in a fourth
 * cell that spans the row's grid under it. A cell, not a row of its own, so
 * a row stays one `<tr>` for everything that counts them.
 */
export function StatRowView({
  id,
  label,
  value,
  help,
  className,
  delta,
}: {
  id: string
  label: string
  value: string
  help: string
  className: string | undefined
  delta: ReactNode
}): ReactElement {
  const { button, paragraph } = useKnobHelp(id, label, help)
  return (
    <tr className={className}>
      <th scope="row">
        <span className="st-lab">{label}</span>
        {button}
      </th>
      <td className="num">{value}</td>
      {delta}
      <td className="st-help">{paragraph}</td>
    </tr>
  )
}
```

- [ ] **Step 4: Use it in both tables**

`StatsTable.tsx`, inside `group.map`:

```tsx
            {group.map(({ row, at }) => {
              const change = reportDelta(row.num, before[at]?.num, row.better)
              return (
                <StatRowView
                  key={at}
                  id={`stat-help-${row.key ?? at}`}
                  label={row.label}
                  value={row.value}
                  help={row.help}
                  className={rowClass(row.key, change !== null)}
                  delta={
                    // The sign is always printed, so colour is never the only
                    // carrier; a screen reader hears better or worse.
                    <td className={change === null ? 'fw-delta' : `fw-delta ${change.trend}`}>
                      {change?.text}
                      {change === null || change.trend === 'neutral' ? null : (
                        <span className="fw-vh">{` ${dict.t(change.trend === 'better' ? 'deltaBetter' : 'deltaWorse')}`}</span>
                      )}
                    </td>
                  }
                />
              )
            })}
```

`StoredFacts.tsx`, the rows:

```tsx
          {rows.map(([key, label, value]) => (
            <StatRowView
              key={key}
              id={`stored-help-${key}`}
              label={label}
              value={value}
              help={dict.t(`stat_${key}_help` as const)}
              className={rowClass(key, false)}
              delta={<td className="fw-delta" />}
            />
          ))}
```

`StatsTable` and `StoredFacts` never mount together (`ReportPanel` shows one or the other), so their ids cannot collide.

- [ ] **Step 5: CSS**

In `apps/lab/src/design/report.css`, replace the row's `min-height` with a first grid row, and add the label, `?` and help cell:

```css
.fw-report .fw-stats tr {
  display: grid;
  grid-template-columns: minmax(0, 1fr) auto 7ch;
  /* The row's line, then the help's cell (0 high while closed). */
  grid-template-rows: minmax(34px, auto);
  column-gap: 8px;
  align-items: center;
  box-shadow: 0 1px 0 var(--border);
}
```

- `tr.grp`: replace `min-height: 0;` with `grid-template-rows: auto;`.
- `tr.long`: add `grid-template-rows: minmax(20px, auto);` (its 7px padding plus 20 is the 34 it had).
- The group boundary must not pad the help cell: change `.fw-report .fw-stats tbody + tbody tr:first-child > *` to `.fw-report .fw-stats tbody + tbody tr:first-child > :not(.st-help)`.
- Add:

```css
.fw-report .fw-stats th[scope='row'] {
  display: flex;
  align-items: center;
  gap: 4px;
  min-width: 0;
}
.fw-report .fw-stats td.st-help {
  grid-column: 1 / -1;
}
```

(merge the `display/align-items/gap/min-width` into the existing `th[scope='row']` rule that sets `color: var(--mist)`.)

In `apps/lab/src/design/console.css`, give the report's `?` the knobs' look and touch size: add `.fw .fw-report .q` to the selector lists of `.fw .kv-g .q { … }`, of `.fw .kv-g .q:hover, .fw .kv-g .q[aria-expanded='true']` (as `.fw .fw-report .q:hover, .fw .fw-report .q[aria-expanded='true']`), and of the coarse-pointer block's `.fw .kv-g .q, .fw .kv-chip`.

The test mounts `.fw` around the panel, so these selectors apply there too.

- [ ] **Step 6: Run the report tests, then the whole lab**

Run: `cd apps/lab && npx vitest run src/report`
Expected: PASS — including the existing `f0` height of 34px, the 352px case in both languages, and `hidden` rows `[1, 3, 7, 22]`.
Run: `cd ../.. && pnpm nx run lab:test && pnpm nx run lab:check && pnpm nx run lab:lint`
Expected: PASS.

- [ ] **Step 7: Commit**

```bash
git add apps/lab/src/report apps/lab/src/design/report.css apps/lab/src/design/console.css
git commit -m "Report: a ? on every row of the run's and the stored board's table opens its help"
```

---

### Task 3: The summary's `?`, and D named in words

**Files:**
- Modify: `apps/lab/src/report/ReportSummary.tsx`, `apps/lab/src/design/report.css`
- Modify: `packages/engine/lab-i18n.ts` (delete `statSumD` from `EN.ui` and `PL.ui`)
- Test: `apps/lab/src/report/ReportPanel.browser.test.tsx`

**Interfaces:**
- Consumes: `StatRow.help`, `useKnobHelp` (as in Task 2).
- Produces: summary help ids `sum-help-<key>` for `pieces`, `longest`, `D`, `time`.

- [ ] **Step 1: Write the failing tests**

In the test file, `figure()` reads the term's label: change its `term` to the `.st-lab` inside `dt`, and keep the `dt` as `box`'s first child for the markup-order check:

```ts
  const term = box?.querySelector('dt .st-lab')
```

Change the assertions:

- `'the summary puts four figures…'`: terms `['arrows', 'longest', 'depth', 'time']`.
- `'the summary keeps what the rows it hides used to say'`: replace the two `abbr` lines with

```ts
  expect(figure(screen.container, 2).term.closest('dt')?.querySelector('abbr')).toBeNull()
```

Add:

```ts
// The summary's rows leave the table, so the summary is where their help lives.
test("a summary term's ? opens its row's help under the four figures", async () => {
  const screen = await mountReport()
  await act(async () => finish(ONE))
  const depth = figure(screen.container, 2).term.closest('dt')?.querySelector('button.q')
  if (!(depth instanceof HTMLButtonElement)) throw new Error('depth has no ?')
  expect(depth.getAttribute('aria-controls')).toBe('sum-help-D')
  const help = document.getElementById('sum-help-D')
  expect(help?.classList.contains('fw-vh')).toBe(true)
  await act(async () => depth.click())
  expect(help?.classList.contains('fw-vh')).toBe(false)
  expect(help?.textContent).toMatch(/^The longest chain of arrows/)
  expect(help?.getBoundingClientRect().top).toBeGreaterThanOrEqual(summary(screen.container).getBoundingClientRect().bottom)
})
```

- [ ] **Step 2: Run to see them fail**

Run: `cd apps/lab && npx vitest run src/report/ReportPanel.browser.test.tsx`
Expected: FAIL — no `.st-lab` in `dt`, `abbr` still there.

- [ ] **Step 3: Implement**

`ReportSummary.tsx`: the term gets a `?`, and the paragraphs go after the `<dl>`, inside `.fw-rsum-wrap` (keep the value and change markup as it is). One `useKnobHelp` per summary key at the top of `ReportSummary`, in `SUMMARY_KEYS` order, each fed the row's label and help (`''` while a row is missing). Hooks at the top level, never in `map`:

```tsx
  const helpFor = (key: StatKey) => byKey(rows, key)
  const pieces = useKnobHelp('sum-help-pieces', helpFor('pieces')?.label ?? '', helpFor('pieces')?.help ?? '')
  const longest = useKnobHelp('sum-help-longest', helpFor('longest')?.label ?? '', helpFor('longest')?.help ?? '')
  const depth = useKnobHelp('sum-help-D', helpFor('D')?.label ?? '', helpFor('D')?.help ?? '')
  const time = useKnobHelp('sum-help-time', helpFor('time')?.label ?? '', helpFor('time')?.help ?? '')
  const helps: Record<(typeof SUMMARY_KEYS)[number], ReturnType<typeof useKnobHelp>> = { pieces, longest, D: depth, time }
```

These calls must come before the `if (rows.length === 0) return null` (rules of hooks), so compute `rows` and `byKey` first, then the hooks, then the early return. Type `SUMMARY_KEYS` as `readonly ['pieces', 'longest', 'D', 'time']` (`as const`) so `helps[key]` needs no cast; `StatsTable`'s `SUMMARY_KEYS.includes(key)` then needs `(SUMMARY_KEYS as readonly StatKey[]).includes(key)` — a widening, not a narrowing, so it is allowed.

The term:

```tsx
              <dt>
                <span className="st-lab">{row.label}</span>
                {helps[key].button}
              </dt>
```

After `</dl>`: `{SUMMARY_KEYS.map((key) => <Fragment key={key}>{helps[key].paragraph}</Fragment>)}`.

Delete `statSumD` from `EN.ui` and `PL.ui` in `packages/engine/lab-i18n.ts`, and the `.fw-rsum dt abbr` rule with its comment from `report.css`. Update the component's doc comment: D is shown by its row's label now; the titles of longest and time stay.

CSS, `report.css`:

```css
.fw-rsum dt {
  grid-row: 2;
  display: flex;
  align-items: center;
  gap: 4px;
  min-width: 0;
  margin-top: 2px;
  font-size: 11px;
  color: var(--mist);
}
```

- [ ] **Step 4: Rebuild the engine, run the tests**

Run: `pnpm nx build engine && cd packages/engine && deno task test && cd ../../apps/lab && npx vitest run src/report && cd ../.. && pnpm nx run lab:check && pnpm nx run lab:lint`
Expected: PASS — including the 352px case (each summary column ≥ 80px, no value overflow).

- [ ] **Step 5: Commit**

```bash
git add apps/lab/src/report apps/lab/src/design/report.css packages/engine/lab-i18n.ts
git commit -m "Report summary: a ? on each figure, and depth named in words instead of D"
```

---

### Task 4: The longest-arrows table's help behind a `?`

**Files:**
- Modify: `apps/lab/src/report/LongestTable.tsx`, `apps/lab/src/design/report.css`
- Test: `apps/lab/src/report/ReportPanel.browser.test.tsx`

**Interfaces:**
- Consumes: `useKnobHelp`; `longestHead`, `longestHelp` (Task 1).
- Produces: help id `longest-help`; heading still `h2#longest-head`, its text only the heading.

- [ ] **Step 1: Write the failing test**

```ts
test("the longest arrows' explanation is closed until its ? opens it", async () => {
  const screen = await mountReport()
  await act(async () => finish(ONE))
  const head = longestHead(screen.container)
  expect(head.textContent).toBe('The 5 longest arrows')
  const button = head.parentElement?.querySelector('button.q')
  if (!(button instanceof HTMLButtonElement)) throw new Error('the longest arrows have no ?')
  const help = document.getElementById('longest-help')
  expect(help?.classList.contains('fw-vh')).toBe(true)
  await act(async () => button.click())
  expect(help?.classList.contains('fw-vh')).toBe(false)
  expect(help?.textContent).toMatch(/^Reach = /)
})
```

- [ ] **Step 2: Run to see it fail**

Run: `cd apps/lab && npx vitest run src/report/ReportPanel.browser.test.tsx`
Expected: FAIL — no `button.q` beside the heading; the help is always shown.

- [ ] **Step 3: Implement**

`LongestTable.tsx` — the hook before the early return:

```tsx
  const head = dict.t('longestHead', longest.length)
  const { button, paragraph } = useKnobHelp('longest-help', head, dict.t('longestHelp'))
  if (longest.length === 0) return null
  return (
    <>
      <div className="fw-longest-hd">
        <h2 id="longest-head">{head}</h2>
        {button}
      </div>
      {paragraph}
      <table …unchanged…>
```

`report.css`:

```css
/* The heading and its `?` on one line; the heading keeps its own margins. */
.fw-longest-hd {
  display: flex;
  align-items: center;
  gap: 4px;
}
```

If the `h2`'s top margin (16px, `.fw-report h2`) now sits inside the flex line and misaligns the `?`, move that margin to `.fw-longest-hd` (`margin: 16px 0 4px`) and set the `h2` inside it to `margin: 0`; the heading's font test (11px, uppercase) must stay green.

- [ ] **Step 4: Run the tests**

Run: `cd apps/lab && npx vitest run src/report && cd ../.. && pnpm nx run lab:check && pnpm nx run lab:lint`
Expected: PASS.

- [ ] **Step 5: Commit**

```bash
git add apps/lab/src/report/LongestTable.tsx apps/lab/src/design/report.css apps/lab/src/report/ReportPanel.browser.test.tsx
git commit -m "Report: the longest arrows' explanation opens from a ? beside the heading"
```

---

### Task 5: Review file, full gate and live pass

**Files:**
- Modify: `lab-review.md`

- [ ] **Step 1: Record the fix**

In `lab-review.md`, "Status after the fixes", table "Labels and descriptions": set "Top 1: the report explains nothing" to `fixed in <Task 1–4 hashes>` with the note "Every row, summary figure and the longest table have a `?`; labels in player's words; depth, traps and free at start say which way is harder". Set "Top 4: one concept, many names" note to add "the report's rows follow the glossary". In "What is still open", item 1 (copy pass): replace its start with "The report is done (`lab/report-copy`); the simple view and `start.help` are next, then the glossary across the knobs and the view panel."

- [ ] **Step 2: The full gate, without the cache**

Run: `pnpm nx run-many -t verify --skip-nx-cache`
Expected: `Successfully ran target verify for 4 projects`.

- [ ] **Step 3: Live pass in Chrome**

Start the lab on a scratch store: `ARROWZ_BOARDS_DIR=$(mktemp -d) pnpm nx serve lab` (it starts the store too; do not start `deno task store` separately). In Chrome at 1440×900, then 375×812:

1. Generate a board, open the report (R). Every row and the four figures have a `?`; each opens its sentence under it; EN then PL.
2. Generate again with a new seed: green/red changes appear; the caption reads as the spec says; depth rising is green.
3. At 375×812 (coarse sizes), open the longest Polish help: nothing overflows; the `?` is a 32px target and the label stays on one line.
4. Saved boards tab: the stored board's six rows have a `?`.

Stop the server, and reset any `emulate` in the browser.

- [ ] **Step 4: Commit**

```bash
git add lab-review.md
git commit -m "Lab review: the report explains itself"
```
