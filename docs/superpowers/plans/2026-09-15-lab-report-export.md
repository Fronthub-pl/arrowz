# The report, the exports and solo Implementation Plan

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:subagent-driven-development (recommended) or superpowers:executing-plans to implement this plan task by task. Steps use checkbox (`- [ ]`) syntax for tracking.

**Goal:** Keep the last result on screen through a run in flight, and read it four ways — the report column beside the board, the SVG and board-file exports, the frame's annotation, and a solo view that gives the board the whole lab panel — closing spec §10 row 4b.

**Architecture:** A new `result` slice holds the product (board, file, report, parameters, the store's answer, the delta baseline) apart from the `run` slice, which keeps only the process. One store-level action, `completeRun`, applies both slices' pure transitions in a single `set`. `BoardFrame` comes out of `Stage` carrying the element, the annotation and the solo toggle; `ReportPanel` is the stage's third track; `ExportButtons` is a second ghost group in the run column. Solo is a class on `.fw-lab` that hides everything but the stage and redefines both grids.

**Tech Stack:** React 19, zustand 5.0.15, Vite 8, Vitest 5 with `@vitest/browser` 5 and `vitest-browser-react` 2.3 (node + chromium browser mode), `@arrowz/engine` (`generate`, `encodeBoard`, `longestSummary`, `defaultParams`, `WorkerIn`, `WorkerOut`), `@arrowz/engine/report` (`reportRows`, `reportDelta`, `pct`, `ReportInput`), `@arrowz/engine/command` (`boardId`, `svgOptions`, `storeRequest`), `@arrowz/engine/i18n`.

**Spec:** `docs/superpowers/specs/2026-09-13-lab-react-app-design.md` — §4.1 (the PR 4b amendment: `reportDelta`), §5.1 (the PR 4b amendment: `BoardFrame`, solo, `f`), §5.2 (the report column, the exports, the solo glyph), §5.3 (the `result` slice, `completeRun`, the baseline), §7.1 (the delta and annotation colours), §8 (the PR 4b unit and browser cases), §10 row 4b.

**Previous plan:** `docs/superpowers/plans/2026-09-14-lab-simple-view.md` (PR #67).

**Branch:** `lab/report-export`, created from `lab/simple-view` at `1ffb0d6`; the spec commits `af4a833`…`a8ad9f4` are already on it. The pull request's base is `lab/simple-view`, not `main`.

## Global Constraints

- **Everything written to a file is English** — code, comments, tests, docs, commit messages. Only the conversation with the user is Polish.
- **No `any`, no non-null assertions.** ESLint enforces both in `apps/lab`; `deno lint` in `packages/`.
- **Both gates must pass before the PR:** `deno task verify` in the repository root and `pnpm nx run-many -t verify`.
- **Never import the engine's `.ts` sources from `apps/`.** After any edit under `packages/engine`, run `pnpm nx build engine` before running `apps/lab` tests.
- **English is the source language in code**, Polish is the translation. Every new UI string goes into both `ui` tables in `packages/engine/lab-i18n.ts`; `lab-i18n.test.ts` checks the key sets and value kinds match.
- **The engine and the dictionaries know neither Deno nor the DOM** (`neutral.test.ts`). Never spread an array proportional to cells or pieces into a call.
- **No attribution lines in commit messages.**
- **Do not delete or modify anything under `packages/cli/boards/`, any `dist/` by hand, or any `node_modules/`.**
- Commit after every task. Run `pnpm --dir apps/lab exec prettier --write <touched paths>` before each `apps/lab` commit and `deno fmt <touched paths>` before each `packages/` commit; both are gates.

### Harness facts, each measured

Carried from PR 4a (plan `2026-09-14-lab-simple-view.md`, "Harness facts"):

- **`render` and `renderHook` from `vitest-browser-react` are async.** `const screen = await render(<X />)`.
- **`toHaveTextContent` is exact equality**; substrings and regexes go through `toMatchTextContent(/…/)`.
- **Playwright locators are strict**: a name matching two elements throws. Use `{ exact: true }` where a name is a substring of another.
- **Browser test files are isolated for the store and `location.hash`, but not for `localStorage`**; `vitest.setup.ts` clears storage per file. Cases *within* a file share everything; every file resets by hand.
- **Chromium's locale is pinned to `en-US`** in `vitest.config.ts`.
- **`vitest-browser-react` renders without StrictMode** by default; `main.tsx` mounts with it.
- **A store write from outside a React event reaches the DOM on a microtask at the earliest.** Wrap it in `await act(async () => …)` before reading the DOM, or poll.
- **`locator.click()` waits for actionability**: clicking a disabled button stalls to the timeout instead of failing.
- **`BrowserRouter` commits navigation inside `startTransition`**: poll route-dependent DOM after a tab click.
- **`exactOptionalPropertyTypes`, `noUncheckedIndexedAccess`, `noUnusedLocals` are on**, and ESLint's `no-unused-vars` is an error.
- **`locator.element()` returns `HTMLElement | SVGElement`**.
- **React 19 has no global `JSX` namespace**: type a component's return as `ReactElement`.
- **HTML's focus fixup for a control that becomes disabled or `display: none` runs at the "update the rendering" step**: read focus after two animation frames (`RunColumn.browser.test.tsx`'s `twoFrames`), never sooner; a `useLayoutEffect` runs before it.

New in this plan, measured on 2026-09-15 with a throw-away probe mounting the whole `App` (Chrome 153, `deviceScaleFactor: 2`):

- **`page.viewport(width, height)` from `vitest/browser` resizes the test iframe**, and the size outlives the case that set it. Every layout case in this plan sets its own viewport first.
- **`.fw-lab` at 1400×900 and 860×900 is 770.2px tall** (top 129.8); the stage is 366.1px in the advanced view (38px preset strip above it) and 385.1px in the simple view.
- **With a class on `.fw-lab` hiding everything but the stage and redefining both grids** (Task 7's rules), `.fw-boardwrap` equals `.fw-lab` exactly and `<arrowz-board>` is 34px narrower and shorter, at 1400×900, 860×900 and 860×650, in both views.
- **The command box at ≤900px:** the run column row is 180.1px (advanced) and 189.5px (simple); `.fw-cmdfig` shrinks to 0px and 7.5px while `.fw-cmd` keeps its 58px and paints 72.4px and 64.8px over Generate's top edge. **Above 900px** the same collapse appears once the exports are added: at 1400×900 in the advanced view the figure shrinks to 5.5px and the box overlaps Generate by 66.9px (at 1400×1000, by 16.9px). Without the exports, 1400×900 advanced is squeezed by 11px and does not yet overlap.
- **Three candidate rules for the box**, each measured with the exports present, a short and a long command, at 1400×900, 1400×1000 and 860×900 in both views: `flex: none` on the figure at ≤900px fixes 860 but not 1400, and moves Generate 4.8px as the command grows; `min-height: auto` moves Generate 81.5px as the command grows; **`min-height: calc(1lh + 6px + 58px)` on the figure at every width** gives the figure 84.4px, no overlap anywhere (the box ends 12px above Generate, its margin and the column's gap), and Generate moves 0px as the command grows in the advanced view and at 860 in both views. (The simple view above 900px moves Generate 24.5px for a long command today, before any change; that is untouched.)
- **The report row at ≤900px**, measured at 860 wide and heights 650, 701, 740, 760, 800, 900, 1100, both views, with a 30-line report:

  | Rule for `.fw-stage` rows at ≤900px | 860×900 | 860×701–740 | 860×650 |
  |---|---|---|---|
  | none (today, no report) | board 334/353, inside | board 260 **clipped** by the wrap in the advanced view up to 740 | board 209, inside |
  | `minmax(0, 1fr) auto` + report `max-height: 73px` | board 260/279, inside; report 73 | board **clipped** at every height below 900 | report 73, board 135 |
  | `minmax(292px, 2fr) minmax(0, 1fr)` | board 260, report 73/92 | wrap **overflows the stage** by up to 25.4px into the console | report 80 |
  | **`minmax(min(292px, 100%), 2fr) minmax(0, 1fr)`**, and `minmax(0, 2fr) minmax(0, 1fr)` below 700px of height | board 260, inside; report 73/92 | report 0; board clipped exactly where it is clipped today, nothing overflows | report 80/86, board 128/141, inside |

  At 860×1100 the chosen rule gives the report 155/161px and the board 278/291px. At 901px and above the report is the third column, 352px wide (22rem), and the board 445px wide at 901.
- **Contrast of the new pairs**, by WCAG arithmetic on the token hex values: `--ink` on `--graphite` 15.45:1, `--error` on `--graphite` 4.90:1, `--ash` on `--graphite` 5.52:1, `--ink` on `--void` 16.53:1. Each is asserted again by a browser test reading computed colours.
- **Fixture boards** (`generate({ ...defaultParams(), W: 8, H: 8, seed })`): seed 1 closes with 8 pieces, longest 18; seed 2 closes with 13 pieces, longest 17. The report cases rely on both numbers.

---

## Rulings I made

Decisions this plan takes that the spec left open or states differently. An executor must not relitigate them; a reviewer should attack them.

**Ruling 1 — the command box's floor applies at every width, not only at ≤900px.** Spec §10 row 4b says the fix "applies at ≤900px only … and leaves the above-900px ruling of `run.css:104-115` intact". That sentence was written before the exports were measured: with them, 1400×900 in the advanced view overlaps Generate by 66.9px. The floor `min-height: calc(1lh + 6px + 58px)` on `.fw-cmdfig` keeps that ruling's substance at every width — the box scrolls, and Generate does not move as the command grows (measured 0px) — while the column scrolls when its fixed contents outgrow it, which it already does in the simple view. Task 8 amends §10.

**Ruling 2 — the report row at ≤900px is capped by the stage's own rows, not by a `max-height`.** Spec §5.2 asks for "a capped height" chosen by measuring at 860×900. A fixed 73px cap keeps the board whole at 860×900 and clips it at every lower height; a `292px` row minimum overflows into the console below 760px. `minmax(min(292px, 100%), 2fr) minmax(0, 1fr)` holds the board's minimum whenever the stage can afford it, gives the report a third of what is left over, and falls back to today's layout exactly where today's layout already clips (table above). Task 8 amends §5.2.

**Ruling 3 — the solo toggle is `⛶`, not `⤢`.** `⤢` is the element's own *fit* button (`arrowz-board.ts:374`), and §5.2 says the toggle is a separate glyph. Its name is `fullView` ("Full view (key F)"), and it carries `aria-pressed`.

**Ruling 4 — the delta cell prints its sign always, and a hidden word only for better or worse.** A neutral row (the piece count, the average length, f0…) has no direction, so there is nothing to say beyond the number. The hidden words are `deltaBetter` and `deltaWorse`.

**Ruling 5 — a result without metrics shows no statistics table but still shows the longest pieces.** The old lab clears both tables in `report()` (`lab-page.ts:1425-1429`), then `showLabBoard()` runs after it in the same `done` branch (`:814-816`) and redraws the longest pieces from the board. The React lab does what the page ends up showing.

**Ruling 6 — `completeRun` throws for a run that was never started.** Without `run.params` there are no parameters to show the board under, and inventing them would be a value-changing fallback. A `done` without a `started` is a bug in the caller; the throw names it.

**Ruling 7 — one SVG export at a time.** The SVG button is disabled while its throw-away worker draws; the board-file button never is, because it costs no worker. An export error sits under the two buttons in a `role="alert"` paragraph, prefixed with the new `exportError`, and is cleared by the next SVG export.

**Ruling 8 — the download anchor is attached to the document for the length of its click.** A detached anchor downloads in Chrome too, but attached, the click is an ordinary event in the document, which is what lets a test observe the name and cancel the navigation without patching a prototype.

**Ruling 9 — the `f` listener lives in `App`, is attached only while the lab route is on screen, and toggles from a focused button.** The old lab toggles from anything but an `INPUT` or `TEXTAREA` (`lab-page.ts:942-947`); this one also skips `select` and `contenteditable` (§5.1), modifiers and key repeat.

**Ruling 10 — the annotation is not in caps and takes no pointer events.** The mock's `.fw-anno` is `caps`, which would print `SEED`; the numbers are the content. `pointer-events: none`, so a drag that starts on the annotation still pans the board beneath it.

**Ruling 11 — whole-app test helpers live in `src/harness/mountApp.tsx`, used by this plan's new files.** `LabRoute.browser.test.tsx` and `triggers.browser.test.tsx` keep their own resets, each of which carries comments specific to its cases; moving them is not this PR's work.

**Ruling 12 — the statistics labels are row headers.** Each row's label is `<th scope="row">`, so a screen reader reading a value hears its label; the old lab's table had no headers at all.

---

## File Structure

**Created**

| Path | Responsibility |
|---|---|
| `apps/lab/src/state/result.slice.ts` | The product: `shown`, `baseline`, `saved`; `showResult` and `reportInputOf` as pure functions. |
| `apps/lab/src/state/result.fixtures.ts` | Two finished 8×8 runs, as `completeRun` takes them. |
| `apps/lab/src/state/result.slice.test.ts`, `apps/lab/src/state/store.test.ts` | The slice's transitions; `completeRun` across two slices. |
| `apps/lab/src/stage/BoardFrame.tsx` | `.fw-boardwrap`: the element, the annotation, the solo toggle. |
| `apps/lab/src/stage/BoardFrame.browser.test.tsx` | Annotation text, order, colour; the toggle. |
| `apps/lab/src/design/contrast.ts` | WCAG arithmetic over computed colours, shared by the colour tests. |
| `apps/lab/src/report/ReportPanel.tsx`, `StatsTable.tsx`, `LongestTable.tsx` | The stage's third column. |
| `apps/lab/src/report/ReportPanel.browser.test.tsx` | Groups, delta by row index, language switch, longest pieces, colours. |
| `apps/lab/src/design/report.css` | The report column's look. |
| `apps/lab/src/run/download.ts` | A Blob to a named file. |
| `apps/lab/src/run/ExportButtons.tsx`, `ExportButtons.browser.test.tsx` | SVG through a throw-away worker; the board file. |
| `apps/lab/src/harness/mountApp.tsx` | Reset every slice a whole-app test can move, and mount `App`. |
| `apps/lab/src/routes/LabLayout.browser.test.tsx` | Viewport-bound cases: the report row, the command box, solo, `f`. |

**Modified**

| Path | Change |
|---|---|
| `packages/engine/lab-report.ts`, `lab-report.test.ts` | `reportDelta`. |
| `packages/engine/lab-i18n.ts` | Eight `ui` keys in both languages. |
| `packages/cli/lab-page.ts` | The old lab's `report()` calls `reportDelta`. |
| `apps/lab/src/state/run.slice.ts`, `run.slice.test.ts` | Loses `board`, `file`, `report`, `saved`, `finished`, `stored`; gains `runDone`. |
| `apps/lab/src/state/store.ts` | `result` slice; `completeRun`. |
| `apps/lab/src/state/ui.slice.ts`, `ui.slice.test.ts` | `solo`, `setSolo`, `toggleSolo`. |
| `apps/lab/src/worker/useGenerator.ts` | Calls `completeRun`. |
| `apps/lab/src/App.tsx` | `useStoreSave` reads `result`; `useSoloKey`. |
| `apps/lab/src/stage/Stage.tsx`, `RunStatusBar.tsx` | `BoardFrame` and `ReportPanel`; the status reads `result`. |
| `apps/lab/src/routes/LabRoute.tsx` | `.fw-lab.solo`. |
| `apps/lab/src/run/RunColumn.tsx` | `ExportButtons`. |
| `apps/lab/src/design/shell.css`, `console.css`, `run.css`, `apps/lab/src/main.tsx` | Stage tracks, annotation, toggle, solo, export group, command-box floor, `report.css` import. |
| `apps/lab/src/design/console.browser.test.tsx` | Imports the contrast arithmetic from `contrast.ts`. |
| Every browser test that resets `run`, plus `LabRoute`, `RunStatusBar`, `RunColumn`, `useGenerator`, `Stage` tests | `result.reset()`; reads move to `result`. |
| `docs/superpowers/specs/2026-09-13-lab-react-app-design.md` | §5.2 and §10 row 4b, after Rulings 1 and 2. |

---

## Task 1: The delta moves into the engine, and the dictionary learns eight words

**Files:** Modify `packages/engine/lab-report.ts`, `packages/engine/lab-report.test.ts`, `packages/engine/lab-i18n.ts`, `packages/cli/lab-page.ts`.

**Interfaces:**
- Produces, from `@arrowz/engine/report`:
  - `interface ReportDelta { readonly text: string; readonly trend: 'better' | 'worse' | 'neutral' }`
  - `reportDelta(num: number | undefined, prev: number | undefined, better: number): ReportDelta | null`
- Produces, in both `ui` tables of `@arrowz/engine/i18n`: `reportPanel`, `statsTable`, `deltaBetter`, `deltaWorse`, `exportsGroup`, `downloadBoardFile`, `exportError` (strings) and `boardAnnotation(W: number, H: number, seed: number): string`. Existing keys the later tasks also use: `downloadSvg`, `fullView`, `longestHead`, `longestHelp`, `th_len`, `th_box`, `th_span`, `th_density`, `th_coil`.

- [ ] **Step 1: Write the failing engine tests**

In `packages/engine/lab-report.test.ts`, change the import on line 4 to:

```ts
import { genSeconds, type ReportInput, reportDelta, reportRows, type StatRow } from './lab-report.ts'
```

and append at the end of the file:

```ts
// The delta column's arithmetic, moved out of the old lab's `report()`
// (lab-page.ts:1441-1449) so both labs print the same cell. The numbers are
// chosen to be exact in binary, so no case depends on how `toFixed` rounds a
// tie.
Deno.test('reportDelta is null when either number is missing or the two are equal', () => {
  assertEquals(reportDelta(undefined, 3, 1), null)
  assertEquals(reportDelta(3, undefined, 1), null)
  assertEquals(reportDelta(3, 3, 1), null)
  // The old lab's tolerance: a float that moved by less than 1e-9 did not move.
  assertEquals(reportDelta(3 + 1e-10, 3, 1), null)
})

Deno.test('reportDelta prints a plus or a true minus, at the precision of the size of the change', () => {
  assertEquals(reportDelta(250, 100, 0)?.text, '+150')
  assertEquals(reportDelta(100, 0, 0)?.text, '+100')
  assertEquals(reportDelta(3.5, 1, 0)?.text, '+2.5')
  assertEquals(reportDelta(2, 1, 0)?.text, '+1.0')
  assertEquals(reportDelta(0.75, 0.5, 0)?.text, '+0.25')
  // U+2212, not a hyphen: the old lab's glyph, and the one a screen reader says "minus" for.
  assertEquals(reportDelta(1, 3.5, 0)?.text, '−2.5')
})

Deno.test('reportDelta says which way is better from the row, not from the sign alone', () => {
  assertEquals(reportDelta(2, 1, 1)?.trend, 'better')
  assertEquals(reportDelta(1, 2, 1)?.trend, 'worse')
  assertEquals(reportDelta(1, 2, -1)?.trend, 'better')
  assertEquals(reportDelta(2, 1, -1)?.trend, 'worse')
  assertEquals(reportDelta(2, 1, 0)?.trend, 'neutral')
  assertEquals(reportDelta(1, 2, 0)?.trend, 'neutral')
})
```

In `packages/engine/lab-i18n.test.ts`, append:

```ts
// PR 4b's words. The key-set test above already fails for a key present in one
// language only; this one fails for a key missing from both, which that test
// cannot see.
Deno.test('both ui dictionaries carry the report, export and annotation words', () => {
  const dictionaries: Dictionary[] = [EN, PL]
  const words: UiKey[] = [
    'reportPanel',
    'statsTable',
    'deltaBetter',
    'deltaWorse',
    'exportsGroup',
    'downloadBoardFile',
    'exportError',
  ]
  for (const d of dictionaries) {
    for (const k of words) {
      assertEquals(typeof d.ui[k], 'string', k)
      assert(String(d.ui[k]).length > 0, k)
    }
    const annotation = d.ui.boardAnnotation(25, 50, 7)
    assertStringIncludes(annotation, '25×50')
    assertStringIncludes(annotation, '7')
  }
})
```

- [ ] **Step 2: Run them to verify they fail**

Run (repository root): `deno test --allow-read packages/engine/lab-report.test.ts packages/engine/lab-i18n.test.ts`
Expected: FAIL — a type error naming `reportDelta` (not exported) and the eight `UiKey` literals. Not `deno task test`: that runs `packages/cli` too, including a bundle test this task never builds.

- [ ] **Step 3: Add `reportDelta`**

In `packages/engine/lab-report.ts`, insert after the `StatRow` interface (after line 34):

```ts
/** How one row moved against the baseline: the text of the delta cell and which way is better. */
export interface ReportDelta {
  /** The change with its sign — `+` or `−` (U+2212) — at the old lab's precision. */
  readonly text: string
  readonly trend: 'better' | 'worse' | 'neutral'
}

/**
 * The delta column: `num` against `prev`, the same row of the baseline. Null
 * when either is missing or the two differ by no more than 1e-9, where a
 * surface prints an empty cell. `better` is the row's own field: +1 when a
 * larger number is better, -1 when a smaller one is, 0 when neither — coiling
 * should fall, span should rise, the piece count is neutral.
 */
export function reportDelta(num: number | undefined, prev: number | undefined, better: number): ReportDelta | null {
  if (num === undefined || prev === undefined || Math.abs(num - prev) <= 1e-9) return null
  const diff = num - prev
  const abs = Math.abs(diff)
  const shown = abs >= 100 ? abs.toFixed(0) : abs >= 1 ? abs.toFixed(1) : abs.toFixed(2)
  const trend = better === 0 ? 'neutral' : (diff > 0) === (better > 0) ? 'better' : 'worse'
  return { text: `${diff > 0 ? '+' : '−'}${shown}`, trend }
}
```

- [ ] **Step 4: Add the eight words**

In `packages/engine/lab-i18n.ts`, in `EN.ui`, after `simplePanel: 'Simple settings',` (line 228), insert:

```ts
    // PR 4b: the report column and its delta, the frame's annotation, and the
    // run column's two exports. The two delta words are never visible: the
    // cell's colour and sign say it on screen, and a screen reader hears these.
    reportPanel: 'Report',
    statsTable: 'Statistics',
    deltaBetter: 'better',
    deltaWorse: 'worse',
    boardAnnotation: (W: number, H: number, seed: number) => `${W}×${H} · seed ${seed}`,
    exportsGroup: 'Export',
    downloadBoardFile: 'Download board file',
    exportError: 'Export failed:',
```

In `PL.ui`, after `simplePanel: 'Proste ustawienia',` (line 591), insert:

```ts
    reportPanel: 'Raport',
    statsTable: 'Statystyki',
    deltaBetter: 'lepiej',
    deltaWorse: 'gorzej',
    boardAnnotation: (W, H, seed) => `${W}×${H} · ziarno ${seed}`,
    exportsGroup: 'Eksport',
    downloadBoardFile: 'Pobierz plik planszy',
    exportError: 'Eksport nie powiódł się:',
```

- [ ] **Step 5: Run the engine tests to verify they pass**

Run: `deno test --allow-read packages/engine/lab-report.test.ts packages/engine/lab-i18n.test.ts packages/engine/neutral.test.ts`
Expected: PASS — `neutral.test.ts` keeps both modules free of the DOM.

- [ ] **Step 6: Switch the old lab over**

In `packages/cli/lab-page.ts`, change the report import (line 48) to:

```ts
import { genSeconds, pct, reportDelta, reportRows } from '@arrowz/engine/report'
```

and in `report()`, replace the body of the `rows.map` callback (lines 1438-1451, from `if (kind === 'separator')` through the `return \`<tr>…` line) with:

```ts
      if (kind === 'separator') return '<tr><td colspan="3" style="height:.5rem"></td></tr>'
      // The arithmetic is the engine's (`reportDelta`), shared with apps/lab.
      const change = reportDelta(num, prevStats.get(i), better)
      const cls = change === null || change.trend === 'neutral' ? '' : change.trend === 'better' ? ' up' : ' down'
      const delta = change === null ? '<td></td>' : `<td class="delta${cls}">${change.text}</td>`
      if (num !== undefined) prevStatsNext.set(i, num)
      return `<tr><td>${label}</td><td class="num">${value}</td>${delta}</tr>`
```

The comment "Deltas are keyed by row index, not label, so a language switch keeps them." above the map stays.

Run: `deno check packages/cli/lab-page.ts packages/engine/lab-report.ts packages/engine/lab-i18n.ts`
Expected: no errors.

- [ ] **Step 7: Rebuild the engine for `apps/lab`**

Run: `pnpm nx build engine`
Expected: success; `packages/engine/dist/lab-report.d.ts` declares `reportDelta`:

Run: `grep -c "reportDelta" packages/engine/dist/lab-report.d.ts`
Expected: `1` or more.

- [ ] **Step 8: Format, lint and commit**

```bash
cd /Users/tomek/dev/arrowz
deno fmt packages/engine/lab-report.ts packages/engine/lab-report.test.ts packages/engine/lab-i18n.ts packages/engine/lab-i18n.test.ts packages/cli/lab-page.ts
deno lint packages/engine/lab-report.ts packages/engine/lab-report.test.ts packages/engine/lab-i18n.ts packages/engine/lab-i18n.test.ts packages/cli/lab-page.ts
git add packages/engine/lab-report.ts packages/engine/lab-report.test.ts packages/engine/lab-i18n.ts packages/engine/lab-i18n.test.ts packages/cli/lab-page.ts
git commit -m "Move the report's delta into the engine, and add the words the report, the exports and the annotation need"
```

---

## Task 2: The result slice, and one action that finishes a run

**Files:** Create `apps/lab/src/state/result.slice.ts`, `apps/lab/src/state/result.fixtures.ts`, `apps/lab/src/state/result.slice.test.ts`, `apps/lab/src/state/store.test.ts`. Modify `apps/lab/src/state/run.slice.ts`, `apps/lab/src/state/run.slice.test.ts`, `apps/lab/src/state/store.ts`, `apps/lab/src/worker/useGenerator.ts`, `apps/lab/src/App.tsx`, `apps/lab/src/stage/RunStatusBar.tsx`, `apps/lab/src/stage/Stage.tsx`; tests `apps/lab/src/routes/LabRoute.browser.test.tsx`, `apps/lab/src/stage/RunStatusBar.browser.test.tsx`, `apps/lab/src/run/RunColumn.browser.test.tsx`, `apps/lab/src/worker/useGenerator.browser.test.tsx`, `apps/lab/src/stage/Stage.browser.test.tsx`, `apps/lab/src/run/triggers.browser.test.tsx`, `apps/lab/src/console/KnobPanel.browser.test.tsx`, `apps/lab/src/run/PresetStrip.browser.test.tsx`, `apps/lab/src/run/useRun.browser.test.tsx`, `apps/lab/src/run/useAutoRun.browser.test.tsx`, `apps/lab/src/state/useUrlHash.browser.test.tsx`.

This is one task because deleting `run.board`, `run.file`, `run.report`, `run.saved`, `run.finished` and `run.stored` breaks every reader at once; the application compiles again only when all of them read `result`.

**Interfaces:**
- Consumes: `ReportInput` from `@arrowz/engine/report` (Task 1 rebuilt `dist/`).
- Produces, from `state/result.slice.ts`:
  - `interface ShownResult { readonly board: BoardData; readonly file: BoardFile; readonly report: ReportInput; readonly params: Params }`
  - `interface Baseline { readonly report: ReportInput; readonly params: Params }`
  - `interface ResultState { shown: ShownResult | null; baseline: Baseline | null; saved: SaveOutcome | null; show(next: ShownResult): void; stored(file: BoardFile, outcome: SaveOutcome): void; reset(): void }`
  - `reportInputOf(report: ReportInput): ReportInput`, `showResult(state: ResultState, next: ShownResult): ResultState`, `createResultSlice(set)`.
- Produces, from `state/run.slice.ts`: `RunState` is now `{ phase; params; progress; message; wasAborted; started(params); progressed(info); failed(message); aborted(); reset() }`; `runDone(state: RunState): RunState`; `DoneReport` unchanged.
- Produces, from `state/store.ts`: `interface FinishedRun { board: BoardData; file: BoardFile; report: DoneReport }`; `Store` gains `result: ResultState` and `completeRun(done: FinishedRun): void`.
- Produces, from `state/result.fixtures.ts`: `interface FinishedFixture extends FinishedRun { params: Params }`, `finishedRun(seed: number, W?: number, H?: number): FinishedFixture`, `finish(run: FinishedFixture): void` (starts and completes it in the store).

- [ ] **Step 1: Write the fixtures**

`apps/lab/src/state/result.fixtures.ts`:

```ts
import { defaultParams, encodeBoard, generate, type Params } from '@arrowz/engine'
import { type FinishedRun, useStore } from './store'

/** A finished run as `completeRun` takes it, with the parameters it was started from. */
export interface FinishedFixture extends FinishedRun {
  params: Params
}

/**
 * A real carve, not a hand-built report: the report column reads every field.
 * 8×8 by default — seed 1 closes with 8 pieces and a longest of 18, seed 2 with
 * 13 and 17 (measured 2026-09-15), which the report cases rely on.
 */
export function finishedRun(seed: number, W = 8, H = 8): FinishedFixture {
  const params = { ...defaultParams(), W, H, seed }
  const result = generate(params)
  const file = encodeBoard(result.board)
  return {
    params,
    board: result.board,
    file,
    report: {
      type: 'done',
      ok: result.ok,
      metrics: result.metrics,
      backtracks: result.backtracks,
      restartsUsed: result.restartsUsed,
      genMs: result.genMs,
      metricsMs: result.metricsMs,
      totalMs: result.genMs + result.metricsMs,
      stuck: result.stuck,
      deadlock: result.deadlock,
      pieces: result.board.pieces.length,
      stats: result.board.stats,
      board: file,
    },
  }
}

/** Starts the run and finishes it, as `useGenerator` does for a real worker. */
export function finish(run: FinishedFixture): void {
  const state = useStore.getState()
  state.run.started(run.params)
  state.completeRun(run)
}
```

- [ ] **Step 2: Write the failing node tests**

`apps/lab/src/state/result.slice.test.ts`:

```ts
import { beforeEach, expect, test } from 'vitest'
import { finish, finishedRun } from './result.fixtures'
import { useStore } from './store'

const result = () => useStore.getState().result
const ONE = finishedRun(1)
const TWO = finishedRun(2)

beforeEach(() => {
  useStore.getState().run.reset()
  useStore.getState().result.reset()
})

test('a fresh store shows nothing, compares with nothing and has no answer', () => {
  expect(result().shown).toBeNull()
  expect(result().baseline).toBeNull()
  expect(result().saved).toBeNull()
})

// The worker's `done` message satisfies `ReportInput` structurally while
// carrying the board file, a multi-megabyte string at Insane (spec §5.3). A
// slice that kept the message would hold a second copy of the file in the
// report, and the baseline a third.
test('show keeps the report fields and not the board file the message carries', () => {
  finish(ONE)
  const shown = result().shown
  expect(shown?.file).toBe(ONE.file)
  expect(shown?.report.pieces).toBe(8)
  expect(shown === null ? true : 'board' in shown.report).toBe(false)
  expect(shown?.report).not.toBe(ONE.report)
})

test('the baseline is the result shown before, without its board', () => {
  finish(ONE)
  expect(result().baseline).toBeNull()
  finish(TWO)
  const baseline = result().baseline
  expect(baseline?.params.seed).toBe(1)
  expect(baseline?.report.metrics?.N).toBe(8)
  expect(baseline === null ? true : 'board' in baseline.report).toBe(false)
})

// The old lab returns before its swap when a run has no metrics
// (lab-page.ts:1425-1429), so the next run is compared with the last run that
// had some.
test('a result without metrics leaves the baseline where it was', () => {
  finish(ONE)
  finish(TWO)
  const bare = finishedRun(3)
  finish({ ...bare, report: { ...bare.report, metrics: null } })
  expect(result().baseline?.params.seed).toBe(2)
  finish(ONE)
  expect(result().baseline?.params.seed).toBe(2)
})

// `started()` used to clear the answer. Without this, the next board would read
// "closed — saved" until its own POST answered.
test('show clears the store answer of the board before', () => {
  finish(ONE)
  result().stored(ONE.file, { ok: false, error: 'no store server' })
  expect(result().saved).not.toBeNull()
  finish(TWO)
  expect(result().saved).toBeNull()
})

// The identity guard App.tsx used to keep, now in the slice: a slow POST for
// the board before must not describe the board on screen.
test('an answer for a file no longer shown is dropped', () => {
  finish(ONE)
  finish(TWO)
  result().stored(ONE.file, { ok: false, error: 'late' })
  expect(result().saved).toBeNull()
  result().stored(TWO.file, { ok: false, error: 'on time' })
  expect(result().saved).toEqual({ ok: false, error: 'on time' })
})

// By identity, not by value: two presses of Generate with the same seed carve
// equal files, and each is its own save.
test('an equal file that is not the shown object is not the shown file', () => {
  finish(ONE)
  result().stored({ ...ONE.file }, { ok: false, error: 'a copy' })
  expect(result().saved).toBeNull()
})

test('reset forgets everything', () => {
  finish(ONE)
  finish(TWO)
  result().stored(TWO.file, { ok: false, error: 'x' })
  result().reset()
  expect(result().shown).toBeNull()
  expect(result().baseline).toBeNull()
  expect(result().saved).toBeNull()
})
```

`apps/lab/src/state/store.test.ts`:

```ts
import { beforeEach, expect, test } from 'vitest'
import { finish, finishedRun } from './result.fixtures'
import { useStore } from './store'

const ONE = finishedRun(1)

beforeEach(() => {
  useStore.getState().run.reset()
  useStore.getState().result.reset()
  useStore.getState().params.reset()
})

// One `set`, so no render sees `phase: 'done'` beside the previous board
// (spec §5.3).
test('completeRun writes the run and the result in one update', () => {
  useStore.getState().run.started(ONE.params)
  let updates = 0
  const stop = useStore.subscribe(() => void updates++)
  try {
    useStore.getState().completeRun(ONE)
  } finally {
    stop()
  }
  expect(updates).toBe(1)
  expect(useStore.getState().run.phase).toBe('done')
  expect(useStore.getState().result.shown?.file).toBe(ONE.file)
})

// Replaces the run slice's old case that a new run clears the board: the
// point of PR 4b is the opposite.
test('starting the next run leaves the result on screen', () => {
  finish(ONE)
  useStore.getState().run.started({ ...ONE.params, seed: 2 })
  expect(useStore.getState().run.phase).toBe('running')
  expect(useStore.getState().result.shown?.file).toBe(ONE.file)
})

test('the result carries the parameters the run was started with, not the knobs on screen', () => {
  useStore.getState().run.started(ONE.params)
  useStore.getState().params.setMany({ W: 30 })
  useStore.getState().completeRun(ONE)
  expect(useStore.getState().result.shown?.params.W).toBe(8)
})

test('a store failure leaves the run done', () => {
  finish(ONE)
  useStore.getState().result.stored(ONE.file, { ok: false, error: 'no store server' })
  expect(useStore.getState().run.phase).toBe('done')
  expect(useStore.getState().result.saved).toEqual({ ok: false, error: 'no store server' })
})

// Ruling 6: no parameters to show the board under, and none may be invented.
test('a run that was never started cannot be completed', () => {
  expect(() => useStore.getState().completeRun(ONE)).toThrow(/never started/)
  expect(useStore.getState().result.shown).toBeNull()
})
```

- [ ] **Step 3: Run them to verify they fail**

Run: `pnpm --dir apps/lab exec vitest run --project node src/state/result.slice.test.ts src/state/store.test.ts`
Expected: FAIL — `result.slice` cannot be resolved (the fixtures import `FinishedRun` and `completeRun`, which do not exist yet).

- [ ] **Step 4: Write the result slice**

`apps/lab/src/state/result.slice.ts`:

```ts
import type { BoardData, BoardFile, Params } from '@arrowz/engine'
import type { ReportInput } from '@arrowz/engine/report'
import type { SaveOutcome } from '../api/boards'

/**
 * The board on screen and what is read off it: the report, both exports, the
 * annotation and the store save (spec §5.3). A run in flight does not touch
 * it; only a finished run replaces it.
 */
export interface ShownResult {
  readonly board: BoardData
  readonly file: BoardFile
  readonly report: ReportInput
  /** What this board was made from — not the knobs on screen, and not a run in flight. */
  readonly params: Params
}

/** What the delta column compares with: the last shown result that had metrics, without its board. */
export interface Baseline {
  readonly report: ReportInput
  readonly params: Params
}

export interface ResultState {
  shown: ShownResult | null
  baseline: Baseline | null
  /** The store's answer for `shown.file`, and for no other file. */
  saved: SaveOutcome | null
  /** The only writer of `shown` in the application; in PR 4b only `completeRun` reaches it. */
  show(next: ShownResult): void
  stored(file: BoardFile, outcome: SaveOutcome): void
  /** For the tests' resets, beside `run.reset()`. */
  reset(): void
}

/**
 * The report fields and nothing else. The worker's `done` message is a
 * `ReportInput` structurally and carries the board file too; keeping the
 * message would keep that string twice more, in the report and the baseline.
 */
export function reportInputOf(report: ReportInput): ReportInput {
  return {
    ok: report.ok,
    metrics: report.metrics,
    stats: report.stats,
    pieces: report.pieces,
    backtracks: report.backtracks,
    restartsUsed: report.restartsUsed,
    genMs: report.genMs,
    metricsMs: report.metricsMs,
    totalMs: report.totalMs,
    stuck: report.stuck,
    deadlock: report.deadlock,
  }
}

/**
 * The show transition as a pure function, so `completeRun` can apply it in the
 * same `set` as the run's. The baseline moves only past a result with metrics,
 * as the old lab's `prevStats` does (lab-page.ts:833, :1425-1429); rendering
 * never moves it, which is why `keepPrev` has no counterpart here.
 */
export function showResult(state: ResultState, next: ShownResult): ResultState {
  const before = state.shown
  return {
    ...state,
    shown: { board: next.board, file: next.file, report: reportInputOf(next.report), params: next.params },
    baseline: before !== null && before.report.metrics !== null ? { report: before.report, params: before.params } : state.baseline,
    saved: null,
  }
}

type SetStore = (fn: (state: { result: ResultState }) => { result: ResultState }) => void

export function createResultSlice(set: SetStore): ResultState {
  return {
    shown: null,
    baseline: null,
    saved: null,
    show: (next) => set((state) => ({ result: showResult(state.result, next) })),
    // Returning the state unchanged is zustand's no-op: `setState` skips an
    // update whose result is the state object itself.
    stored: (file, saved) =>
      set((state) => (state.result.shown?.file === file ? { result: { ...state.result, saved } } : state)),
    reset: () => set((state) => ({ result: { ...state.result, shown: null, baseline: null, saved: null } })),
  }
}
```

- [ ] **Step 5: Slim the run slice and add `completeRun`**

Replace `apps/lab/src/state/run.slice.ts` with:

```ts
import type { Params, TraceInfo, WorkerOut } from '@arrowz/engine'

/** The worker's `done` message, which is also what the report reads. */
export type DoneReport = Extract<WorkerOut, { type: 'done' }>

export type RunPhase = 'idle' | 'running' | 'done' | 'error'

/**
 * The process, not the product: the board a run makes lives in the result
 * slice, so a run in flight leaves the last one on screen (spec §5.3, PR 4b).
 */
export interface RunState {
  phase: RunPhase
  /** The parameters this run was started with — not the knobs on screen. */
  params: Params | null
  progress: TraceInfo | null
  message: string | null
  /**
   * Why the slice is idle. An abort and a fresh page are both `idle`, and the
   * old lab tells them apart (`dict.t('aborted')`, lab-page.ts:863-868);
   * without this the status line forgets the abort happened and prints
   * `pressGenerate`.
   */
  wasAborted: boolean
  started(params: Params): void
  progressed(info: TraceInfo): void
  failed(message: string): void
  aborted(): void
  reset(): void
}

const EMPTY = {
  phase: 'idle',
  params: null,
  progress: null,
  message: null,
  wasAborted: false,
} as const

/** The done transition as a pure function, applied by `completeRun` beside the result's. */
export function runDone(state: RunState): RunState {
  return { ...state, phase: 'done', progress: null, message: null }
}

type SetStore = (fn: (state: { run: RunState }) => { run: RunState }) => void

export function createRunSlice(set: SetStore): RunState {
  const patch = (next: Partial<RunState>) => set((state) => ({ run: { ...state.run, ...next } }))
  return {
    ...EMPTY,
    started: (params) => patch({ ...EMPTY, phase: 'running', params }),
    progressed: (progress) => patch({ progress }),
    failed: (message) => patch({ phase: 'error', progress: null, message }),
    // The only transition that leaves a mark on an otherwise empty slice: the
    // spread clears everything, then the flag goes back on.
    aborted: () => patch({ ...EMPTY, wasAborted: true }),
    reset: () => patch({ ...EMPTY }),
  }
}
```

Replace `apps/lab/src/state/store.ts` with:

```ts
import type { BoardData, BoardFile } from '@arrowz/engine'
import { create } from 'zustand'
import { createLangSlice, type LangState } from './lang.slice'
import { createParamsSlice, type ParamsState } from './params.slice'
import { createRecipeSlice, type RecipeState } from './recipe.slice'
import { createResultSlice, type ResultState, showResult } from './result.slice'
import { createRunSlice, type DoneReport, runDone, type RunState } from './run.slice'
import { createUiSlice, type UiState } from './ui.slice'
import { createViewSlice, type ViewState } from './view.slice'

/** What the worker hands over when a board is done, decoded. */
export interface FinishedRun {
  board: BoardData
  file: BoardFile
  report: DoneReport
}

/**
 * One store, one named field per slice, so a per-knob selector reaches exactly
 * its own entry. PR 4b adds `result` and the one action that spans two slices;
 * PR 5 adds `library`.
 */
export interface Store {
  run: RunState
  result: ResultState
  params: ParamsState
  view: ViewState
  ui: UiState
  lang: LangState
  recipe: RecipeState
  /**
   * The only writer that sees both the run and the result: the run's done
   * transition and the result's show transition in one `set`, so no render
   * sees `phase: 'done'` beside the previous board (spec §5.3). The slices
   * keep their narrowed setters.
   */
  completeRun(done: FinishedRun): void
}

export const useStore = create<Store>()((set) => ({
  run: createRunSlice(set),
  result: createResultSlice(set),
  params: createParamsSlice(set),
  view: createViewSlice(set),
  ui: createUiSlice(set),
  lang: createLangSlice(set),
  recipe: createRecipeSlice(set),
  completeRun: (done) =>
    set((state) => {
      const params = state.run.params
      // PR 4b, Ruling 6: without the run's own parameters there is nothing
      // true to show the board under.
      if (params === null) throw new Error('a run finished that was never started')
      return { run: runDone(state.run), result: showResult(state.result, { ...done, params }) }
    }),
}))
```

Replace `apps/lab/src/state/run.slice.test.ts` with:

```ts
import { defaultParams } from '@arrowz/engine'
import { beforeEach, expect, test } from 'vitest'
import { finishedRun } from './result.fixtures'
import { useStore } from './store'

const params = { ...defaultParams(), W: 8, H: 8, seed: 1 }
const run = () => useStore.getState().run

beforeEach(() => {
  run().reset()
  useStore.getState().result.reset()
})

test('a fresh store is idle and holds no parameters', () => {
  expect(run().phase).toBe('idle')
  expect(run().params).toBeNull()
})

test('started moves to running and pins the parameters the run uses', () => {
  run().started(params)
  expect(run().phase).toBe('running')
  expect(run().params).toEqual(params)
  expect(run().progress).toBeNull()
})

test('progress is kept while running and dropped when the run ends', () => {
  run().started(params)
  // TraceInfo, as types.ts:40-46 declares it.
  run().progressed({ pieces: 3, remaining: 40, backtracks: 0, ms: 12, total: 64 })
  expect(run().progress?.remaining).toBe(40)
  useStore.getState().completeRun(finishedRun(1))
  expect(run().progress).toBeNull()
  expect(run().phase).toBe('done')
})

test('failed carries the message', () => {
  run().started(params)
  run().failed('the envelope refuses these parameters')
  expect(run().phase).toBe('error')
  expect(run().message).toBe('the envelope refuses these parameters')
})

test('aborting a run returns to idle without an error', () => {
  run().started(params)
  run().aborted()
  expect(run().phase).toBe('idle')
  expect(run().message).toBeNull()
})

// An abort and a fresh page are both idle, and the status line has to tell
// them apart: the old lab prints `aborted`, not `pressGenerate`.
test('aborting records that it happened, and the next run forgets it', () => {
  run().started(params)
  run().aborted()
  expect(run().wasAborted).toBe(true)
  run().started(params)
  expect(run().wasAborted).toBe(false)
})

// The other half of the distinction, and the reason `aborted()` and `reset()`
// are not the same function: a reset is the opening state, not an abort.
test('reset does not record an abort', () => {
  run().started(params)
  run().aborted()
  run().reset()
  expect(run().wasAborted).toBe(false)
})
```

- [ ] **Step 6: Run the node tests to verify they pass**

Run: `pnpm --dir apps/lab exec vitest run --project node src/state`
Expected: PASS, including the untouched `params`, `view`, `ui`, `lang`, `recipe` and `url` files.

- [ ] **Step 7: Move every reader to the result**

`apps/lab/src/worker/useGenerator.ts`, line 67: replace

```ts
        actions().finished({ board, file: message.board, report: message })
```

with

```ts
        // Both slices in one update: the run is done and its board is shown
        // (spec §5.3). Until this line the last result stays on screen.
        useStore.getState().completeRun({ board, file: message.board, report: message })
```

`apps/lab/src/App.tsx`: replace the whole `useStoreSave` function and its doc comment (lines 20-66) with:

```tsx
/**
 * Saves each shown result once. `App` subscribes to one field rather than to
 * the slice, so a progress message does not re-render the shell. The guard
 * keys on the file object's identity, which is fresh per run even when two runs
 * carve the same board, so pressing Generate twice with the same seed still
 * reports a save both times. The ref survives StrictMode's double-invoked mount
 * effect, which is why the guard is a ref and not a piece of state;
 * LabRoute.browser.test.tsx mounts under StrictMode and counts the POSTs.
 *
 * A late answer for a board no longer on screen is the result slice's to drop
 * (`stored` compares the file), so this hook no longer compares anything when
 * the answer arrives.
 */
function useStoreSave() {
  const shown = useStore((state) => state.result.shown)
  const posted = useRef<BoardFile | null>(null)
  useEffect(() => {
    if (shown === null || posted.current === shown.file) return
    posted.current = shown.file
    // The stored view is the lab's view with top zeroed, as the old lab stores
    // it (`storeView()` in lab-page.ts): a saved board is a picture, and the
    // highlight is a reading aid for the run that just finished.
    //
    // `cell` is the run's own, computed here and not held in the slice: it is
    // the square a viewer opens the file at, which `carve` derives from the
    // size it carved (command.ts:513) rather than from anything typed. Writing
    // it into the slice instead would overwrite the preview field under a user
    // who had just set it.
    const { file, params, report } = shown
    const view = { ...viewOf(useStore.getState().view), top: 0, cell: exportCell(params.W, params.H) }
    const request = storeRequest(file, params, view, 'lab', {
      ok: report.ok,
      pieces: report.pieces,
      maxLen: report.metrics?.maxLen ?? null,
      genMs: report.genMs,
      restarts: report.restartsUsed,
      backtracks: report.backtracks,
      stuck: report.stuck,
    })
    void saveBoard(request).then((outcome) => useStore.getState().result.stored(file, outcome))
  }, [shown])
}
```

`apps/lab/src/stage/Stage.tsx`, line 18: replace `const board = useStore((state) => state.run.board)` with

```tsx
  const board = useStore((state) => state.result.shown?.board ?? null)
```

and in the doc comment replace "`run.progressed()` replaces `state.run` and leaves `state.view` alone" with "`run.progressed()` replaces `state.run` and leaves `state.view` and `state.result` alone".

`apps/lab/src/stage/RunStatusBar.tsx`:

1. After `const run = useStore((state) => state.run)` (line 12) insert:

```tsx
  // The board on screen and the store's answer for it: the result slice's,
  // which a run in flight leaves where it was (spec §5.3).
  const report = useStore((state) => state.result.shown?.report ?? null)
  const saved = useStore((state) => state.result.saved)
```

2. Replace the comment lines 16-19

```
  // Whether this line is speaking for a run at all. `run.saved` outlives the
  // board it describes — only `started`, `aborted` and `reset` clear it
  // (run.slice.ts:54, :61-62) — so it is a fact about the last board carved and
  // not about whatever the line happens to be saying. Appended to the refusal,
```

with

```
  // Whether this line is speaking for a run at all. `saved` is a fact about the
  // board on screen — only the result slice's `show` and `reset` clear it — and
  // not about whatever the line happens to be saying. Appended to the refusal,
```

3. Replace `} else if (run.phase !== 'done' || run.report === null) {` with `} else if (run.phase !== 'done' || report === null) {`; `} else if (run.report.ok) {` with `} else if (report.ok) {`; `} else if (run.report.deadlock) {` with `} else if (report.deadlock) {`; `const stuck = run.report.stuck` with `const stuck = report.stuck`.

4. Replace the `const saved = …` line (line 101) with:

```tsx
  const answer = !reportsRun || saved === null ? '' : ` — ${saved.ok ? dict.t('saved') : dict.t('notSaved')}`
```

and `{`${text}${saved}`}` with `{`${text}${answer}`}`.

- [ ] **Step 8: Move the tests to the result**

Add `result.reset()` beside every `run.reset()` a test file calls, with two substitutions from the repository root:

```bash
cd /Users/tomek/dev/arrowz/apps/lab/src
perl -0pi -e 's/^([ \t]*)state\.run\.reset\(\)\n/$&$1state.result.reset()\n/mg' \
  run/triggers.browser.test.tsx console/KnobPanel.browser.test.tsx run/PresetStrip.browser.test.tsx \
  run/useRun.browser.test.tsx run/useAutoRun.browser.test.tsx state/useUrlHash.browser.test.tsx \
  stage/RunStatusBar.browser.test.tsx run/RunColumn.browser.test.tsx
perl -0pi -e 's/^([ \t]*)useStore\.getState\(\)\.run\.reset\(\)\n/$&$1useStore.getState().result.reset()\n/mg' \
  routes/LabRoute.browser.test.tsx worker/useGenerator.browser.test.tsx stage/Stage.browser.test.tsx
grep -c "result.reset()" run/triggers.browser.test.tsx console/KnobPanel.browser.test.tsx run/PresetStrip.browser.test.tsx run/useRun.browser.test.tsx run/useAutoRun.browser.test.tsx state/useUrlHash.browser.test.tsx stage/RunStatusBar.browser.test.tsx run/RunColumn.browser.test.tsx routes/LabRoute.browser.test.tsx worker/useGenerator.browser.test.tsx stage/Stage.browser.test.tsx
```

Expected counts: 1 for every file except `LabRoute.browser.test.tsx` (2) and `useGenerator.browser.test.tsx` (5).

`stage/RunStatusBar.browser.test.tsx`: replace both `state.run.finished({ board: RESULT.board, file: CLOSED.board, report: CLOSED })` with `state.completeRun({ board: RESULT.board, file: CLOSED.board, report: CLOSED })`; replace `state.run.stored({ ok: false, error: 'no store server' })` with `state.result.stored(CLOSED.board, { ok: false, error: 'no store server' })`; in the comment above that case replace "`stored()` is the only thing that sets `saved` and only `started`, `aborted` and `reset` clear it (run.slice.ts:54, :58, :61-62)" with "`result.stored()` is the only thing that sets `saved`, and only the result slice's `show` and `reset` clear it". Then add, as the last case inside the `describe`:

```tsx
  // PR 4b: a run in flight keeps the last result and its answer, so the next
  // board must start without the answer of the one before — `show` clears it.
  // Without that, the next closed board reads "— not saved" before its own
  // POST has even gone out.
  it('does not carry the answer for one board onto the next', async () => {
    const state = useStore.getState()
    state.run.started(state.params.values)
    state.completeRun({ board: RESULT.board, file: CLOSED.board, report: CLOSED })
    state.result.stored(CLOSED.board, { ok: false, error: 'no store server' })
    const screen = await render(<RunStatusBar />)
    await expect.element(screen.getByRole('status')).toMatchTextContent(`${EN.t('closed')} — ${EN.t('notSaved')}`)
    const next = { ...CLOSED, board: { ...CLOSED.board } }
    await act(async () => {
      useStore.getState().run.started(useStore.getState().params.values)
      useStore.getState().completeRun({ board: RESULT.board, file: next.board, report: next })
    })
    await expect.poll(() => screen.getByRole('status').element().textContent).toBe(EN.t('closed'))
  })
```

`run/RunColumn.browser.test.tsx`: replace both `useStore.getState().run.finished({ board: RESULT.board, file: CLOSED.board, report: CLOSED })` with `useStore.getState().completeRun({ board: RESULT.board, file: CLOSED.board, report: CLOSED })`.

`worker/useGenerator.browser.test.tsx`: in the first case replace

```ts
  const { run } = useStore.getState()
  expect(run.board?.W).toBe(16)
  // BoardFile is an object (types.ts:151); its fingerprint is the board's.
  expect(run.file?.format).toBe('arrowz-board')
  expect(run.report?.pieces).toBe(run.board?.pieces.length)
```

with

```ts
  const { shown } = useStore.getState().result
  expect(shown?.board.W).toBe(16)
  // BoardFile is an object (types.ts:151); its fingerprint is the board's.
  expect(shown?.file.format).toBe('arrowz-board')
  expect(shown?.report.pieces).toBe(shown?.board.pieces.length)
```

and in the abort case replace `expect(useStore.getState().run.board).toBeNull()` with `expect(useStore.getState().result.shown).toBeNull()`.

`routes/LabRoute.browser.test.tsx`:

1. After the `mountApp` function, add:

```tsx
/**
 * Whether the store has answered for a board other than `before`. `saved` alone
 * cannot say it: a run in flight keeps the last result and its answer (PR 4b),
 * so right after a press `saved` still describes the board before it.
 */
function savedAfter(before: unknown): boolean {
  const { shown, saved } = useStore.getState().result
  return shown !== null && shown.file !== before && saved !== null
}
```

2. In the first case, replace the comment sentence "`started()` clears `file` (run.slice.ts:54) and `finished()` sets it with the phase (`:56`), so a `file` that is new and not null is also proof the run passed through `running`." with "`completeRun` gives `result.shown` the new run's own file object, so a file that is new is proof a run finished after the press.", then replace `const onLoad = useStore.getState().run.file` with `const onLoad = useStore.getState().result.shown?.file` and the poll body

```ts
          const { file } = useStore.getState().run
          return file !== null && file !== onLoad
```

with

```ts
          const file = useStore.getState().result.shown?.file
          return file !== undefined && file !== onLoad
```

3. In the in-flight case replace `expect(useStore.getState().run.board?.W).toBe(600)` with `expect(useStore.getState().result.shown?.board.W).toBe(600)`.

4. In the StrictMode case replace `await expect.poll(() => useStore.getState().run.saved !== null, { timeout: 30_000 }).toBe(true)` (the load run's, before the spy) with `await expect.poll(() => useStore.getState().result.saved !== null, { timeout: 30_000 }).toBe(true)`; replace

```ts
    const generate = screen.getByRole('button', { name: 'Generate' })
    await generate.click()
    await expect.poll(() => useStore.getState().run.saved !== null, { timeout: 30_000 }).toBe(true)
```

with

```ts
    const generate = screen.getByRole('button', { name: 'Generate' })
    const loaded = useStore.getState().result.shown?.file
    await generate.click()
    await expect.poll(() => savedAfter(loaded), { timeout: 30_000 }).toBe(true)
```

and

```ts
    await generate.click()
    await expect.poll(() => useStore.getState().run.saved !== null, { timeout: 20_000 }).toBe(true)
```

with

```ts
    const first = useStore.getState().result.shown?.file
    await generate.click()
    await expect.poll(() => savedAfter(first), { timeout: 20_000 }).toBe(true)
```

5. In "the saved board carries the view on screen", replace the comment words "rather than off `run.saved`" with "rather than off `result.saved`", the first `await expect.poll(() => useStore.getState().run.saved !== null, { timeout: 30_000 }).toBe(true)` with the same line reading `result.saved`, and

```ts
    await screen.getByRole('button', { name: 'Generate' }).click()
    await expect.poll(() => useStore.getState().run.saved !== null, { timeout: 30_000 }).toBe(true)
```

with

```ts
    const loaded = useStore.getState().result.shown?.file
    await screen.getByRole('button', { name: 'Generate' }).click()
    await expect.poll(() => savedAfter(loaded), { timeout: 30_000 }).toBe(true)
```

6. Add, directly after the case "a run in flight survives a route change, and finishes into the same element":

```tsx
// Spec §5.3, PR 4b: the old lab replaces its board only when a run is done
// (lab-page.ts:811-816), and so does this lab. Before the result slice,
// `run.started()` cleared the board and the stage sat empty for a whole carve.
// 600×600 and seed 9 for the reason the case above gives.
test('a run in flight keeps the last result on screen', async () => {
  const screen = await mountApp()
  await expect.poll(() => useStore.getState().run.phase, { timeout: 30_000 }).toBe('done')
  const element = screen.container.querySelector('arrowz-board')
  const board = element?.board
  expect(board?.W).toBe(25)
  useStore.getState().params.setMany({ W: 600, H: 600, seed: 9 })
  await screen.getByRole('button', { name: 'Generate' }).click()
  // The status line, not the store: the commit that renders `running` is the
  // one that would have taken the board off the element.
  await expect
    .element(screen.getByRole('status', { name: 'Run status' }), { timeout: 5_000 })
    .toMatchTextContent(/^(Generating|[\d.]+%)/)
  expect(element?.board).toBe(board)
  // Kept through the carve as well (Tasks 4 and 5 add their lines here).
  await expect.poll(() => useStore.getState().run.phase, { timeout: 30_000 }).toBe('done')
  expect(element?.board?.W).toBe(600)
}, 40_000)
```

- [ ] **Step 9: Check nothing reads the old fields**

Run: `grep -rnE "run\.(board|file|report|saved|finished|stored)\b|run\(\)\.(board|file|report|saved|finished|stored)\b" apps/lab/src`
Expected: no output.

Run: `pnpm nx run lab:check && pnpm nx run lab:lint`
Expected: PASS.

- [ ] **Step 10: Run the browser tests that changed**

Run: `pnpm --dir apps/lab exec vitest run --project chromium src/stage src/run src/worker src/routes src/console/KnobPanel src/state/useUrlHash`
Expected: PASS.

Then prove the new whole-app case can fail, by putting the old behaviour back for one run: in `useGenerator.ts`'s `start`, add `useStore.getState().result.reset()` on the line after `actions().started(params)`, and run `pnpm --dir apps/lab exec vitest run --project chromium src/routes/LabRoute.browser.test.tsx -t "keeps the last result"`. Expected: FAIL on `expect(element?.board).toBe(board)` (received `null`). Remove the line and rerun: PASS.

- [ ] **Step 11: Commit**

```bash
cd /Users/tomek/dev/arrowz
pnpm --dir apps/lab exec prettier --write src
git add apps/lab/src
git commit -m "Keep the last result on screen through a run, in a slice of its own finished by one action"
```

---

## Task 3: The frame comes out of the stage, and names the board on screen

**Files:** Create `apps/lab/src/stage/BoardFrame.tsx`, `apps/lab/src/stage/BoardFrame.browser.test.tsx`, `apps/lab/src/design/contrast.ts`. Modify `apps/lab/src/stage/Stage.tsx`, `apps/lab/src/design/shell.css`, `apps/lab/src/design/console.browser.test.tsx`.

**Interfaces:**
- Consumes: `result.shown` (Task 2); `boardAnnotation` (Task 1); `finishedRun`, `finish` from `state/result.fixtures.ts`.
- Produces:
  - `BoardFrame(): ReactElement` — renders `.fw-boardwrap > .fw-board > <arrowz-board>, .fw-anno`. Task 7 adds the solo toggle after the annotation.
  - From `design/contrast.ts`: `type RGB = [number, number, number]`, `contrast(front: RGB, back: RGB): number`, `shown(node: Element): { front: RGB; back: RGB }` (plus `luminance`, `parse`, `over`). Tasks 4 and 5 import `contrast` and `shown`.

- [ ] **Step 1: Lift the contrast arithmetic out of the console's test**

Create `apps/lab/src/design/contrast.ts` holding, verbatim and each with `export` added, the block of `apps/lab/src/design/console.browser.test.tsx` that runs from `type RGB = [number, number, number]` through the closing brace of `function shown(node: Element)` — `RGB`, `luminance`, `contrast`, `parse`, `over`, `shown` and their doc comments. Put this comment at the top of the new file:

```ts
// WCAG 2.1 contrast over what the browser computed, for the browser tests that
// measure a colour pair (spec §7.1: "asserted by a browser test that reads the
// computed colours, not by arithmetic in a comment"). Test-only: nothing in the
// application imports it, so the bundle never carries it.
```

In `console.browser.test.tsx`, delete that block and add `import { contrast, shown } from './contrast'` after the `useStore` import.

Run: `pnpm --dir apps/lab exec vitest run --project chromium src/design/console.browser.test.tsx`
Expected: PASS, unchanged.

- [ ] **Step 2: Write the failing frame tests**

`apps/lab/src/stage/BoardFrame.browser.test.tsx`:

```tsx
import { act } from 'react'
import { beforeEach, expect, test } from 'vitest'
import { render } from 'vitest-browser-react'
import { contrast, shown } from '../design/contrast'
import { finish, finishedRun } from '../state/result.fixtures'
import { useStore } from '../state/store'
import { BoardFrame } from './BoardFrame'
import '../design/tokens.css'
import '../design/shell.css'
import '../design/console.css'

beforeEach(() => {
  const state = useStore.getState()
  state.run.reset()
  state.result.reset()
  state.lang.setLang('en')
})

/** The frame in a box with a size, as the stage gives it one. */
async function mountFrame() {
  return render(
    <div className="fw" style={{ display: 'grid', width: '480px', height: '360px' }}>
      <BoardFrame />
    </div>,
  )
}

const annotation = (container: HTMLElement) => container.querySelector('.fw-anno')

test('the frame names nothing before there is a board', async () => {
  const screen = await mountFrame()
  expect(screen.container.querySelector('arrowz-board')).not.toBeNull()
  expect(annotation(screen.container)).toBeNull()
})

test('the annotation carries the size and seed of the board on screen', async () => {
  const screen = await mountFrame()
  await act(async () => finish(finishedRun(1)))
  await expect.poll(() => annotation(screen.container)?.textContent).toBe('8×8 · seed 1')
  expect(screen.container.querySelector('arrowz-board')?.board?.W).toBe(8)
})

// Spec §5.2: during a run the board on screen is the previous one, and so is
// what the frame says about it.
test('during a run the annotation still names the previous board', async () => {
  const screen = await mountFrame()
  await act(async () => finish(finishedRun(1)))
  await act(async () => useStore.getState().run.started({ ...finishedRun(2).params }))
  expect(annotation(screen.container)?.textContent).toBe('8×8 · seed 1')
})

test('the annotation follows the language', async () => {
  const screen = await mountFrame()
  await act(async () => finish(finishedRun(1)))
  await act(async () => useStore.getState().lang.setLang('pl'))
  await expect.poll(() => annotation(screen.container)?.textContent).toBe('8×8 · ziarno 1')
})

// The element's host is `position: relative`, opaque and `z-index: auto`
// (arrowz-board.ts:129-135), so tree order decides what paints on top: an
// annotation before the element would be under the paper, and a colour test
// alone would pass on it (spec §5.1).
test('the annotation comes after the element and is what paints at its corner', async () => {
  const screen = await mountFrame()
  await act(async () => finish(finishedRun(1)))
  const element = screen.container.querySelector('arrowz-board')
  const label = annotation(screen.container)
  if (element === null || label === null) throw new Error('the frame is not on the page')
  expect(element.compareDocumentPosition(label) & Node.DOCUMENT_POSITION_FOLLOWING).toBeTruthy()
  const box = label.getBoundingClientRect()
  const hit = document.elementFromPoint(box.left + box.width / 2, box.top + box.height / 2)
  expect(hit === label || (hit !== null && label.contains(hit))).toBe(true)
})

// §7.1, PR 4b: the mock's `--void` on `--signal` is 4.08:1; the frame inverts it.
test('the annotation reads at AA', async () => {
  const screen = await mountFrame()
  await act(async () => finish(finishedRun(1)))
  const label = annotation(screen.container)
  if (label === null) throw new Error('no annotation')
  const { front, back } = shown(label)
  expect(contrast(front, back)).toBeGreaterThanOrEqual(4.5)
})
```

- [ ] **Step 3: Run them to verify they fail**

Run: `pnpm --dir apps/lab exec vitest run --project chromium src/stage/BoardFrame.browser.test.tsx`
Expected: FAIL — `./BoardFrame` cannot be resolved.

- [ ] **Step 4: Write the frame**

`apps/lab/src/stage/BoardFrame.tsx`:

```tsx
import { boardViewOf } from '@arrowz/board-element'
import { type ReactElement, useMemo } from 'react'
import { useDictionary } from '../i18n'
import { useStore } from '../state/store'
import { viewOf } from '../state/view.slice'
import { BoardCanvas } from './BoardCanvas'

/**
 * The paper frame around the one `<arrowz-board>`, and what sits on it: the
 * annotation of the board on screen and, from Task 7, the solo toggle (spec
 * §5.1). Both come after the element in DOM order, because the element's host
 * is opaque and positioned, so tree order is what puts them on top; both are
 * absolutely positioned in `.fw-board`, so they take no height from the
 * element, and both keep to the top edge, which the element's own bar leaves
 * free (arrowz-board.ts:178-185).
 *
 * The element's view is memoised on the *slice's* identity, not rebuilt per
 * render: `run.progressed()` replaces `state.run` and leaves `state.view`
 * alone, so a run's progress messages reassign nothing on the element, while
 * editing a preview field redraws the board without generating.
 */
export function BoardFrame(): ReactElement {
  const dict = useDictionary()
  const result = useStore((state) => state.result.shown)
  const view = useStore((state) => state.view)
  const lang = useStore((state) => state.lang.lang)
  const elementView = useMemo(() => boardViewOf(viewOf(view), view.voids), [view])
  return (
    <div className="fw-boardwrap">
      <div className="fw-board">
        <BoardCanvas board={result?.board ?? null} view={elementView} interactive={false} lang={lang} />
        {result === null ? null : (
          <span className="fw-anno">
            {dict.t('boardAnnotation', result.params.W, result.params.H, result.params.seed)}
          </span>
        )}
      </div>
    </div>
  )
}
```

Replace `apps/lab/src/stage/Stage.tsx` with:

```tsx
import { BoardFrame } from './BoardFrame'

/**
 * 70px + 1fr: the mock's run rail and the board beside it. The rail is empty
 * until the filmstrip fills it (PR 7); the column stays, so the board's width
 * does not move when it arrives. Task 4 adds the report as the third track.
 */
export function Stage() {
  return (
    <div className="fw-stage">
      <div className="fw-runs" />
      <BoardFrame />
    </div>
  )
}
```

In `apps/lab/src/design/shell.css`, after the `.fw-board arrowz-board` rule (line 181), insert:

```css
/* The annotation of the board on screen (spec §5.2). After the element in DOM
   order — the element's host is positioned and opaque with `z-index: auto`
   (arrowz-board.ts:129-135), so tree order is what paints this on top — and in
   the top-left corner, because the bottom edge belongs to the element's own
   bar. `--ink` on `--void` (16.53:1), inverting the mock's `--void` on
   `--signal` (4.08:1, the open §7.1 pair). No caps: they would print `SEED`,
   and the numbers are the content (PR 4b, Ruling 10). No pointer events, so a
   drag that starts on it still pans the board. */
.fw-anno {
  position: absolute;
  top: 0;
  left: 0;
  padding: 3px 8px;
  background: var(--void);
  color: var(--ink);
  font-variant-numeric: tabular-nums;
  pointer-events: none;
}
```

- [ ] **Step 5: Run the frame and stage tests to verify they pass**

Run: `pnpm --dir apps/lab exec vitest run --project chromium src/stage`
Expected: PASS — `BoardFrame.browser.test.tsx` and `Stage.browser.test.tsx` (whose three cases now reach the element through `BoardFrame`).

Run: `pnpm nx run lab:check && pnpm nx run lab:lint`
Expected: PASS.

- [ ] **Step 6: Commit**

```bash
cd /Users/tomek/dev/arrowz
pnpm --dir apps/lab exec prettier --write src
git add apps/lab/src
git commit -m "Frame the board apart from the stage, and name the board on screen in its corner"
```

---

## Task 4: The report, as the stage's third column

**Files:** Create `apps/lab/src/report/StatsTable.tsx`, `apps/lab/src/report/LongestTable.tsx`, `apps/lab/src/report/ReportPanel.tsx`, `apps/lab/src/report/ReportPanel.browser.test.tsx`, `apps/lab/src/design/report.css`, `apps/lab/src/harness/mountApp.tsx`, `apps/lab/src/routes/LabLayout.browser.test.tsx`. Modify `apps/lab/src/stage/Stage.tsx`, `apps/lab/src/design/shell.css`, `apps/lab/src/main.tsx`, `apps/lab/src/routes/LabRoute.browser.test.tsx`.

**Interfaces:**
- Consumes: `result.shown`, `result.baseline`, `ShownResult`, `Baseline` (Task 2); `reportDelta`, `reportRows`, `pct` and the words `reportPanel`, `statsTable`, `deltaBetter`, `deltaWorse` (Task 1); `contrast`, `shown` (Task 3); `longestSummary` from `@arrowz/engine`.
- Produces:
  - `ReportPanel(): ReactElement` — `<section class="fw-report" aria-label="Report">`, always mounted, empty before a result.
  - `StatsTable({ result, baseline }: { result: ShownResult; baseline: Baseline | null }): ReactElement | null` — `table.fw-stats`, one `<tbody>` per group.
  - `LongestTable({ board }: { board: BoardData }): ReactElement | null` — `table.fw-longest`.
  - From `harness/mountApp.tsx`: `resetApp(mode: ViewMode): void`, `mountApp(mode?: ViewMode)` (returns `render`'s promise), `loadRunDone(): Promise<void>`. Task 7 adds `ui.setSolo(false)` to `resetApp`.

- [ ] **Step 1: Write the whole-app helper**

`apps/lab/src/harness/mountApp.tsx`:

```tsx
import { expect } from 'vitest'
import { render } from 'vitest-browser-react'
import { App } from '../App'
import { useStore } from '../state/store'
import type { ViewMode } from '../state/ui.slice'

/**
 * Puts back everything a whole-app case can move, for the files this PR adds
 * (PR 4b, Ruling 11). The address first: a case that navigated must not leave
 * the next on /boards, and a fragment left behind would be read as a pasted
 * link — `replaceState` also clears `history.state`, where react-router keeps
 * its record. The view slice has no reset; a case that moves it puts it back.
 */
export function resetApp(mode: ViewMode): void {
  window.history.pushState({}, '', '/')
  history.replaceState(null, '', location.pathname)
  const state = useStore.getState()
  state.run.reset()
  state.result.reset()
  state.params.reset()
  state.ui.select('board')
  state.ui.setAuto(false)
  state.ui.setHelp(true)
  state.ui.raiseClamped(false)
  state.lang.setLang('en')
  state.ui.setMode(mode)
}

/** The real `App`, address bar and all. */
export function mountApp(mode: ViewMode = 'advanced') {
  resetApp(mode)
  return render(<App />)
}

/** The page carves on load; a case that measures or presses waits for that run first. */
export async function loadRunDone(): Promise<void> {
  await expect.poll(() => useStore.getState().run.phase, { timeout: 30_000 }).toBe('done')
}
```

- [ ] **Step 2: Write the failing report tests**

`apps/lab/src/report/ReportPanel.browser.test.tsx`:

```tsx
import { act } from 'react'
import { beforeEach, expect, test } from 'vitest'
import { render } from 'vitest-browser-react'
import { contrast, shown } from '../design/contrast'
import { finish, finishedRun } from '../state/result.fixtures'
import { useStore } from '../state/store'
import { ReportPanel } from './ReportPanel'
import '../design/tokens.css'
import '../design/shell.css'
import '../design/console.css'
import '../design/report.css'

// Seed 1: 8 pieces, longest 18. Seed 2: 13 pieces, longest 17 (both close).
const ONE = finishedRun(1)
const TWO = finishedRun(2)

beforeEach(() => {
  const state = useStore.getState()
  state.run.reset()
  state.result.reset()
  state.lang.setLang('en')
  state.view.setFlag('hilite', true)
  state.view.setNumber('top', '5')
})

async function mountReport() {
  return render(
    <div className="fw" style={{ display: 'grid', width: '352px', height: '600px' }}>
      <ReportPanel />
    </div>,
  )
}

function stats(container: HTMLElement): HTMLTableElement {
  const table = container.querySelector('table.fw-stats')
  if (!(table instanceof HTMLTableElement)) throw new Error('the statistics table is not on the page')
  return table
}

/** The cells of one row of the first group: label, value, delta. Rows 1 and 3 are pieces and longest. */
function row(container: HTMLElement, at: number): HTMLTableRowElement {
  const found = stats(container).tBodies[0]?.rows[at]
  if (found === undefined) throw new Error(`no row ${at}`)
  return found
}

test('the report is a named region, empty until there is a result', async () => {
  const screen = await mountReport()
  await expect.element(screen.getByRole('region', { name: 'Report' })).toBeInTheDocument()
  expect(screen.container.querySelector('table')).toBeNull()
})

// Spec §5.2: the four separators become the boundaries of five groups.
test('twenty-three rows in five groups, labelled by row headers', async () => {
  const screen = await mountReport()
  await act(async () => finish(ONE))
  const table = stats(screen.container)
  expect(table.tBodies).toHaveLength(5)
  expect([...table.tBodies].reduce((sum, body) => sum + body.rows.length, 0)).toBe(23)
  expect(table.getAttribute('aria-label')).toBe('Statistics')
  const first = row(screen.container, 0)
  expect(first.cells[0]?.tagName).toBe('TH')
  expect(first.cells[0]?.getAttribute('scope')).toBe('row')
  expect(first.cells[1]?.textContent).toBe('8 × 8 = 64 cells, seed 1')
})

test('the first result has nothing to compare with', async () => {
  const screen = await mountReport()
  await act(async () => finish(ONE))
  for (const cell of stats(screen.container).querySelectorAll('.fw-delta')) expect(cell.textContent).toBe('')
})

// Compared by row index against the result shown before (spec §5.3). Pieces is
// neutral: its sign and nothing else. Longest is `better: 1`, and it fell.
test('the second result is compared with the first, row by row', async () => {
  const screen = await mountReport()
  await act(async () => finish(ONE))
  await act(async () => finish(TWO))
  const pieces = row(screen.container, 1).cells[2]
  const longest = row(screen.container, 3).cells[2]
  expect(pieces?.textContent).toBe('+5.0')
  expect(pieces?.className).toBe('fw-delta neutral')
  expect(longest?.textContent).toBe('−1.0 worse')
  expect(longest?.className).toBe('fw-delta worse')
  expect(longest?.querySelector('.fw-vh')?.textContent).toBe(' worse')
})

// The old lab needed `keepPrev` for this; here rendering never moves the
// baseline, so a language switch rebuilds both reports and the rows still line up.
test('a language switch keeps every delta', async () => {
  const screen = await mountReport()
  await act(async () => finish(ONE))
  await act(async () => finish(TWO))
  await act(async () => useStore.getState().lang.setLang('pl'))
  expect(row(screen.container, 1).cells[0]?.textContent).toBe('elementów')
  expect(row(screen.container, 1).cells[2]?.textContent).toBe('+5.0')
  expect(row(screen.container, 3).cells[2]?.textContent).toBe('−1.0 gorzej')
})

// Ruling 5: no statistics, but the longest pieces are the board's and stay.
test('a result without metrics shows no statistics and still shows its longest pieces', async () => {
  const screen = await mountReport()
  await act(async () => finish(ONE))
  await act(async () => finish({ ...TWO, report: { ...TWO.report, metrics: null } }))
  expect(screen.container.querySelector('table.fw-stats')).toBeNull()
  expect(screen.container.querySelector('table.fw-longest')).not.toBeNull()
})

test('the longest pieces follow the highlight count, and go with the highlight', async () => {
  const screen = await mountReport()
  await act(async () => finish(ONE))
  const longest = () => screen.container.querySelector('table.fw-longest')
  expect(longest()?.querySelectorAll('tbody tr')).toHaveLength(5)
  expect(screen.container.querySelector('#longest-head')?.textContent).toBe('5 longest')
  await act(async () => useStore.getState().view.setNumber('top', '3'))
  expect(longest()?.querySelectorAll('tbody tr')).toHaveLength(3)
  await act(async () => useStore.getState().view.setFlag('hilite', false))
  expect(longest()).toBeNull()
})

/** Measures a delta cell as the screen shows it, after checking which kind it is. */
function readsAtAA(cell: HTMLTableCellElement | undefined, kind: 'better' | 'worse' | 'neutral') {
  if (cell === undefined) throw new Error('a delta cell is missing')
  expect(cell.className).toBe(`fw-delta ${kind}`)
  const { front, back } = shown(cell)
  expect(contrast(front, back), kind).toBeGreaterThanOrEqual(4.5)
}

// §7.1, PR 4b: better `--ink`, worse `--error`, neutral `--ash`, on `--graphite`.
// Measured at the moment each class is on the cell: React keeps the `<td>`
// across results, so a cell read earlier carries whatever class it has now.
test('every kind of delta reads at AA', async () => {
  const screen = await mountReport()
  await act(async () => finish(ONE))
  await act(async () => finish(TWO))
  readsAtAA(row(screen.container, 3).cells[2], 'worse')
  readsAtAA(row(screen.container, 1).cells[2], 'neutral')
  await act(async () => finish(ONE))
  readsAtAA(row(screen.container, 3).cells[2], 'better')
})
```

`apps/lab/src/routes/LabLayout.browser.test.tsx`:

```tsx
import { expect, test } from 'vitest'
import { page } from 'vitest/browser'
import { loadRunDone, mountApp } from '../harness/mountApp'
import '../design/tokens.css'
import '../design/shell.css'
import '../design/console.css'
import '../design/run.css'
import '../design/report.css'

// Every case here is about geometry at a stated size, so each sets its own
// viewport first: the size a case sets outlives it (harness facts).

function rect(container: HTMLElement, selector: string): DOMRect {
  const found = container.querySelector(selector)
  if (found === null) throw new Error(`${selector} is not on the page`)
  return found.getBoundingClientRect()
}

// Spec §5.2 and PR 4b, Ruling 2. At 860×900 the stage is 366px (advanced) and
// 385px (simple); the board keeps its 260px minimum and the report takes what
// is left, 73px and 92px measured. The wrap clips (`shell.css`'s
// `.fw-boardwrap { overflow: hidden }`), so the board's rect alone would prove
// nothing: it has to lie inside the wrap's content box, which is the wrap's
// rect less its 16px padding, because the wrap has no border.
test.each(['advanced', 'simple'] as const)(
  'at 860×900 the report is a row under the board and takes nothing the board needs (%s)',
  async (mode) => {
    await page.viewport(860, 900)
    const screen = await mountApp(mode)
    await loadRunDone()
    const stage = rect(screen.container, '.fw-stage')
    const wrap = rect(screen.container, '.fw-boardwrap')
    const board = rect(screen.container, '.fw-board')
    const report = rect(screen.container, '.fw-report')
    expect(report.width).toBeCloseTo(stage.width, 0)
    expect(report.top).toBeGreaterThanOrEqual(wrap.bottom)
    expect(report.height).toBeGreaterThan(0)
    expect(board.height).toBeGreaterThanOrEqual(259.5)
    expect(board.top).toBeGreaterThanOrEqual(wrap.top + 15.5)
    expect(board.bottom).toBeLessThanOrEqual(wrap.bottom - 15.5)
    expect(board.left).toBeGreaterThanOrEqual(wrap.left + 15.5)
    expect(board.right).toBeLessThanOrEqual(wrap.right - 15.5)
    // A row of knobs under the stage, whole. The report lives inside the
    // stage, so this holds as long as it stays there: a report placed in the
    // lab grid instead would push the console down and cut this row.
    const panel = rect(screen.container, '.fw-console .fw-knobs')
    const knobRow = rect(screen.container, '.fw-console .fw-k .top')
    expect(knobRow.top).toBeGreaterThanOrEqual(Math.max(panel.top, stage.bottom))
    expect(knobRow.bottom).toBeLessThanOrEqual(panel.bottom)
  },
  40_000,
)

test.each(['advanced', 'simple'] as const)(
  'above 900px the report is the third column beside the board (%s)',
  async (mode) => {
    await page.viewport(1400, 900)
    const screen = await mountApp(mode)
    await loadRunDone()
    const wrap = rect(screen.container, '.fw-boardwrap')
    const report = rect(screen.container, '.fw-report')
    // 22rem at the document's 16px.
    expect(report.width).toBeCloseTo(352, 0)
    expect(report.left).toBeGreaterThanOrEqual(wrap.right)
    expect(report.top).toBeCloseTo(wrap.top, 0)
    expect(report.height).toBeCloseTo(wrap.height, 0)
  },
  40_000,
)
```

- [ ] **Step 3: Run them to verify they fail**

Run: `pnpm --dir apps/lab exec vitest run --project chromium src/report src/routes/LabLayout.browser.test.tsx`
Expected: FAIL — `./ReportPanel` and `../design/report.css` cannot be resolved.

- [ ] **Step 4: Write the two tables and the panel**

`apps/lab/src/report/StatsTable.tsx`:

```tsx
import { reportDelta, reportRows, type StatRow } from '@arrowz/engine/report'
import type { ReactElement } from 'react'
import { useDictionary } from '../i18n'
import type { Baseline, ShownResult } from '../state/result.slice'

/** The rows between separators, each with its index in the whole table — the index a delta is keyed by. */
function groupsOf(rows: readonly StatRow[]): { row: StatRow; at: number }[][] {
  const groups: { row: StatRow; at: number }[][] = [[]]
  rows.forEach((row, at) => {
    if (row.kind === 'separator') groups.push([])
    else groups[groups.length - 1]?.push({ row, at })
  })
  return groups
}

/**
 * The 23 statistics of the board on screen, in the engine's order and words,
 * with the change against the baseline (spec §5.3). Both reports are built at
 * render in the current language and compared by row index, which a language
 * switch does not move; nothing here moves the baseline.
 */
export function StatsTable({ result, baseline }: { result: ShownResult; baseline: Baseline | null }): ReactElement | null {
  const dict = useDictionary()
  const rows = reportRows(result.report, result.params, dict)
  // A run without metrics reports no rows (lab-report.ts), and the table goes.
  if (rows.length === 0) return null
  const before = baseline === null ? [] : reportRows(baseline.report, baseline.params, dict)
  return (
    <table className="fw-stats" aria-label={dict.t('statsTable')}>
      {groupsOf(rows).map((group) => (
        <tbody key={group[0]?.at ?? 0}>
          {group.map(({ row, at }) => {
            const change = reportDelta(row.num, before[at]?.num, row.better)
            return (
              <tr key={at}>
                <th scope="row">{row.label}</th>
                <td className="num">{row.value}</td>
                {/* The sign is always printed, so colour is never the only
                    carrier; a screen reader hears better or worse (Ruling 4). */}
                <td className={change === null ? 'fw-delta' : `fw-delta ${change.trend}`}>
                  {change?.text}
                  {change === null || change.trend === 'neutral' ? null : (
                    <span className="fw-vh">{` ${dict.t(change.trend === 'better' ? 'deltaBetter' : 'deltaWorse')}`}</span>
                  )}
                </td>
              </tr>
            )
          })}
        </tbody>
      ))}
    </table>
  )
}
```

`apps/lab/src/report/LongestTable.tsx`:

```tsx
import { type BoardData, longestSummary } from '@arrowz/engine'
import { pct } from '@arrowz/engine/report'
import { type ReactElement, useMemo } from 'react'
import { useDictionary } from '../i18n'
import { useStore } from '../state/store'

/**
 * The longest pieces of the board on screen, as the old lab's `renderLongest`
 * (lab-page.ts:1460-1473). The count is the highlight's own — `viewOf` folds
 * the flag into `top` — so turning the highlight off leaves nothing to list.
 * Memoised on the board and the count: `longestSummary` sorts every piece,
 * about 90 000 at Insane, and a preview field edit re-renders this.
 */
export function LongestTable({ board }: { board: BoardData }): ReactElement | null {
  const dict = useDictionary()
  const top = useStore((state) => (state.view.hilite ? state.view.top : 0))
  const longest = useMemo(() => longestSummary(board, top), [board, top])
  if (longest.length === 0) return null
  return (
    <>
      <h3 id="longest-head">{dict.t('longestHead', longest.length)}</h3>
      <p>{dict.t('longestHelp')}</p>
      <table className="fw-longest" aria-labelledby="longest-head">
        <thead>
          <tr>
            <th scope="col">{dict.t('th_len')}</th>
            <th scope="col">{dict.t('th_box')}</th>
            <th scope="col">{dict.t('th_span')}</th>
            <th scope="col">{dict.t('th_density')}</th>
            <th scope="col">{dict.t('th_coil')}</th>
          </tr>
        </thead>
        <tbody>
          {longest.map((piece, at) => (
            <tr key={at}>
              <td className="num">{piece.len}</td>
              <td className="num">{`${piece.sx}×${piece.sy}`}</td>
              <td className="num">{pct(piece.span)}</td>
              <td className="num">{pct(piece.density)}</td>
              <td className="num">{pct(piece.coil)}</td>
            </tr>
          ))}
        </tbody>
      </table>
    </>
  )
}
```

`apps/lab/src/report/ReportPanel.tsx`:

```tsx
import type { ReactElement } from 'react'
import { useDictionary } from '../i18n'
import { useStore } from '../state/store'
import { LongestTable } from './LongestTable'
import { StatsTable } from './StatsTable'

/**
 * The stage's third column (spec §5.2): the report of the result on screen, in
 * both views, scrolling inside itself. It reads the result slice, so a run in
 * flight leaves it describing the board it sits beside.
 */
export function ReportPanel(): ReactElement {
  const dict = useDictionary()
  const result = useStore((state) => state.result.shown)
  const baseline = useStore((state) => state.result.baseline)
  return (
    <section className="fw-report" aria-label={dict.t('reportPanel')}>
      {result === null ? null : (
        <>
          <StatsTable result={result} baseline={baseline} />
          <LongestTable board={result.board} />
        </>
      )}
    </section>
  )
}
```

In `apps/lab/src/stage/Stage.tsx`, add `import { ReportPanel } from '../report/ReportPanel'`, render `<ReportPanel />` after `<BoardFrame />`, and replace the doc comment's last sentence "Task 4 adds the report as the third track." with "The report is the third track above 900px and a row under both below it (shell.css)."

- [ ] **Step 5: Style the column and place it**

`apps/lab/src/design/report.css`:

```css
/* The report column (spec §5.2). Its own file, as console.css explains for its
   own: one file per surface keeps a specificity collision inside the surface
   that caused it. On `--graphite`, never on `--paper`, scrolling inside itself
   as `.fw-runs` and `.fw-run-col` do. Where it sits is the stage's business
   (shell.css). */
.fw-report {
  min-height: 0;
  overflow-y: auto;
  padding: 12px 16px;
  background: var(--graphite);
  color: var(--mist);
}
.fw-report table {
  width: 100%;
  border-collapse: collapse;
  font-variant-numeric: tabular-nums;
}
.fw-report th,
.fw-report td {
  padding: 1px 8px 1px 0;
  font-weight: 400;
  text-align: left;
  vertical-align: baseline;
}
/* The gap the old lab drew as a separator row, now the boundary of a group. */
.fw-report tbody + tbody tr:first-child > * {
  padding-top: 9px;
}
.fw-report td.num {
  color: var(--ink);
}
.fw-report thead th {
  color: var(--ash);
}
/* §7.1, PR 4b: better `--ink` (15.45:1 here), worse `--error` (4.90:1),
   neutral `--ash` (5.52:1), each measured by ReportPanel.browser.test.tsx.
   `--signal` would have been the obvious better, and it is the open §7.1 pair. */
.fw-report .fw-delta {
  white-space: nowrap;
  color: var(--ash);
}
.fw-report .fw-delta.better {
  color: var(--ink);
}
.fw-report .fw-delta.worse {
  color: var(--error);
}
.fw-report h3 {
  margin: 16px 0 4px;
  font-size: 11px;
  font-weight: 400;
  line-height: 1.6;
  letter-spacing: 0.14em;
  text-transform: uppercase;
  color: var(--ash);
}
.fw-report p {
  max-width: 74ch;
  margin: 0 0 8px;
  font-size: 11px;
  line-height: 1.6;
  color: var(--ash);
}
```

In `apps/lab/src/design/shell.css`, in the `.fw-stage` rule (lines 148-154), replace `grid-template-columns: 70px minmax(0, 1fr);` with `grid-template-columns: 70px minmax(0, 1fr) 22rem;`. After the `@media (max-height: 700px)` block that releases `.fw-board`'s minimum, insert:

```css
/* The report at 900px and below: a row under the rail and the board (spec
   §5.2; PR 4b, Ruling 2). The board's row keeps 292px — the board's 260px
   minimum, its border inside it, plus the wrap's 32px of padding — whenever the
   stage is that tall, and the report takes a third of what is left. Measured at
   860 wide: 73px of report at 900 high in the advanced view, 155px at 1100.
   `min(292px, 100%)` and not a bare 292px: in a stage shorter than that, a bare
   minimum pushed the wrap 25px out of the stage and over the console, where
   this rule leaves the report at 0px and the board exactly as it is today. A
   fixed `max-height` on the report instead clipped the board at every height
   below 900. */
@media (max-width: 900px) {
  .fw-stage {
    grid-template-columns: 70px minmax(0, 1fr);
    grid-template-rows: minmax(min(292px, 100%), 2fr) minmax(0, 1fr);
  }
  .fw-stage > .fw-report {
    grid-column: 1 / -1;
  }
}
/* Below 700px of height `.fw-board` gives up its minimum (the `max-height:
   700px` query above), so its row gives up the 292px too. */
@media (max-width: 900px) and (max-height: 700px) {
  .fw-stage {
    grid-template-rows: minmax(0, 2fr) minmax(0, 1fr);
  }
}
```

In `apps/lab/src/main.tsx`, add `import './design/report.css'` after `import './design/run.css'`.

- [ ] **Step 6: Keep the report through a run in flight**

In `apps/lab/src/routes/LabRoute.browser.test.tsx`, in "a run in flight keeps the last result on screen", capture the report before the press — after `expect(board?.W).toBe(25)` insert:

```tsx
  const report = () => screen.getByRole('region', { name: 'Report' }).element().querySelector('table.fw-stats')
  const statsBefore = report()?.textContent
  expect(statsBefore).toMatch(/25 × 50/)
```

and after `expect(element?.board).toBe(board)` insert:

```tsx
  expect(report()?.textContent).toBe(statsBefore)
```

The file imports no report stylesheet and needs none: this case reads text, not geometry.

- [ ] **Step 7: Run the tests to verify they pass**

Run: `pnpm --dir apps/lab exec vitest run --project chromium src/report src/routes src/stage`
Expected: PASS.

Prove the row minimum is what holds the board: temporarily change `minmax(min(292px, 100%), 2fr)` to `minmax(0, 2fr)` and run `pnpm --dir apps/lab exec vitest run --project chromium src/routes/LabLayout.browser.test.tsx -t "860"`. Expected: FAIL in both views on `board.bottom` — the probe measured a two-thirds row at 243px in the advanced view and 256px in the simple view, under the 292px the board and its padding need, so the wrap clips the board. Restore the line: PASS.

Run: `pnpm nx run lab:check && pnpm nx run lab:lint`
Expected: PASS.

- [ ] **Step 8: Commit**

```bash
cd /Users/tomek/dev/arrowz
pnpm --dir apps/lab exec prettier --write src
git add apps/lab/src
git commit -m "Report the board on screen beside it, with the change against the last result that had metrics"
```

---

## Task 5: The two exports of the board on screen

**Files:** Create `apps/lab/src/run/download.ts`, `apps/lab/src/run/ExportButtons.tsx`, `apps/lab/src/run/ExportButtons.browser.test.tsx`. Modify `apps/lab/src/run/RunColumn.tsx`, `apps/lab/src/design/run.css`, `apps/lab/src/routes/LabRoute.browser.test.tsx`.

**Interfaces:**
- Consumes: `result.shown` (Task 2); `downloadSvg`, `downloadBoardFile`, `exportsGroup`, `exportError` (Task 1); `contrast`, `shown` (Task 3); `boardId`, `svgOptions` from `@arrowz/engine/command`; `viewOf` from `state/view.slice.ts`; `generate.worker.ts`, which already answers `{ type: 'svg' }`.
- Produces:
  - `downloadBlob(blob: Blob, name: string): void` from `run/download.ts`.
  - `ExportButtons(): ReactElement` — `<div class="fw-ghost fw-exports" role="group" aria-label="Export">` with two buttons and, after a failed SVG export, a `role="alert"` paragraph. `RunColumn` renders it last, in both views. Task 6 measures the column with it in place.

- [ ] **Step 1: Write the failing export tests**

`apps/lab/src/run/ExportButtons.browser.test.tsx`:

```tsx
import type { WorkerOut } from '@arrowz/engine'
import { boardId } from '@arrowz/engine/command'
import { act } from 'react'
import { afterEach, beforeEach, expect, test, vi } from 'vitest'
import { render } from 'vitest-browser-react'
import { contrast, shown } from '../design/contrast'
import { finish, finishedRun } from '../state/result.fixtures'
import { useStore } from '../state/store'
import { ExportButtons } from './ExportButtons'
import '../design/tokens.css'
import '../design/shell.css'
import '../design/run.css'

const ONE = finishedRun(1)

/**
 * Every download the page starts: the Blob handed to `createObjectURL` and the
 * name on the anchor that was clicked. The anchor's click is cancelled, so no
 * file is written and no navigation happens (Ruling 8).
 */
function watchDownloads() {
  const blobs: Blob[] = []
  const names: string[] = []
  const created = vi.spyOn(URL, 'createObjectURL').mockImplementation((object) => {
    if (object instanceof Blob) blobs.push(object)
    return 'blob:export-under-test'
  })
  const onClick = (event: MouseEvent) => {
    if (!(event.target instanceof HTMLAnchorElement) || event.target.download === '') return
    names.push(event.target.download)
    event.preventDefault()
  }
  document.addEventListener('click', onClick, true)
  return {
    blobs,
    names,
    stop() {
      created.mockRestore()
      document.removeEventListener('click', onClick, true)
    },
  }
}

let downloads: ReturnType<typeof watchDownloads>

beforeEach(() => {
  const state = useStore.getState()
  state.run.reset()
  state.result.reset()
  state.lang.setLang('en')
  downloads = watchDownloads()
})

afterEach(() => {
  downloads.stop()
  vi.unstubAllGlobals()
})

async function mountButtons() {
  return render(
    <div className="fw">
      <div className="fw-run-col">
        <ExportButtons />
      </div>
    </div>,
  )
}

test('there is nothing to export before there is a board', async () => {
  const screen = await mountButtons()
  await expect.element(screen.getByRole('group', { name: 'Export' })).toBeInTheDocument()
  await expect.element(screen.getByRole('button', { name: 'Download SVG' })).toBeDisabled()
  await expect.element(screen.getByRole('button', { name: 'Download board file' })).toBeDisabled()
})

// Spec §5.2: the same text under the same name the store server writes
// (packages/cli/store.ts:94, :118).
test('the board file is the file on screen, under its board id', async () => {
  const screen = await mountButtons()
  await act(async () => finish(ONE))
  await screen.getByRole('button', { name: 'Download board file' }).click()
  expect(downloads.names).toEqual([`${boardId(ONE.params)}.board.json`])
  const blob = downloads.blobs[0]
  expect(blob?.type).toBe('application/json')
  expect(await blob?.text()).toBe(JSON.stringify(ONE.file))
})

// The old lab's name (lab-page.ts:962), drawn by a real throw-away worker.
test('the SVG is drawn off the page and saved under the board it shows', async () => {
  const screen = await mountButtons()
  await act(async () => finish(ONE))
  const button = screen.getByRole('button', { name: 'Download SVG' })
  await button.click()
  await expect.poll(() => downloads.names, { timeout: 10_000 }).toEqual(['arrowz-8x8-seed1.svg'])
  const blob = downloads.blobs[0]
  expect(blob?.type).toBe('image/svg+xml')
  expect((await blob?.text())?.startsWith('<svg')).toBe(true)
  await expect.element(button).toBeEnabled()
  expect(screen.getByRole('alert').query()).toBeNull()
})

// Beside the buttons, not in the run status (spec §5.2). A stub worker, because
// a real one cannot be made to fail to order.
test('a failed SVG export says so under the buttons, and the button comes back', async () => {
  class FailingWorker {
    onmessage: ((event: MessageEvent<WorkerOut>) => void) | null = null
    onerror: ((event: ErrorEvent) => void) | null = null
    postMessage() {
      const data: WorkerOut = { type: 'error', message: 'the codec refused it' }
      setTimeout(() => this.onmessage?.(new MessageEvent('message', { data })), 0)
    }
    terminate() {}
  }
  vi.stubGlobal('Worker', FailingWorker)
  const screen = await mountButtons()
  await act(async () => finish(ONE))
  const button = screen.getByRole('button', { name: 'Download SVG' })
  await button.click()
  await expect.element(screen.getByRole('alert')).toHaveTextContent('Export failed: the codec refused it')
  await expect.element(button).toBeEnabled()
  expect(downloads.names).toEqual([])
})

// §7.1, PR 4b: the mock's ghost buttons, `--ash` on `--graphite`.
test('the export buttons read at AA', async () => {
  const screen = await mountButtons()
  await act(async () => finish(ONE))
  for (const name of ['Download SVG', 'Download board file']) {
    const { front, back } = shown(screen.getByRole('button', { name }).element())
    expect(contrast(front, back), name).toBeGreaterThanOrEqual(4.5)
  }
})
```

- [ ] **Step 2: Run them to verify they fail**

Run: `pnpm --dir apps/lab exec vitest run --project chromium src/run/ExportButtons.browser.test.tsx`
Expected: FAIL — `./ExportButtons` cannot be resolved.

- [ ] **Step 3: Write the download and the buttons**

`apps/lab/src/run/download.ts`:

```ts
/**
 * A Blob to a named file, the way a page with no server behind it saves one —
 * shared by both exports. The anchor is in the document for the length of its
 * click, so the click is an ordinary event there (PR 4b, Ruling 8); the object
 * URL is revoked at once, as the old lab does (lab-page.ts:976).
 */
export function downloadBlob(blob: Blob, name: string): void {
  const url = URL.createObjectURL(blob)
  const anchor = document.createElement('a')
  anchor.href = url
  anchor.download = name
  document.body.append(anchor)
  anchor.click()
  anchor.remove()
  URL.revokeObjectURL(url)
}
```

`apps/lab/src/run/ExportButtons.tsx`:

```tsx
import type { WorkerIn, WorkerOut } from '@arrowz/engine'
import { boardId, svgOptions } from '@arrowz/engine/command'
import { type ReactElement, useEffect, useRef, useState } from 'react'
import { useDictionary } from '../i18n'
import { useStore } from '../state/store'
import { viewOf } from '../state/view.slice'
import { downloadBlob } from './download'

/**
 * The mock's two ghost buttons, with handlers (spec §5.2): the board on screen
 * as an SVG and as its board file. Both read the result slice, so a run in
 * flight exports the board beside it, not the one being carved.
 *
 * The SVG is drawn in a worker of its own, as the old lab draws it
 * (lab-page.ts:955-989): tens of megabytes of text at Insane, off the page's
 * thread, and not in the generation worker, which a new run terminates. One at
 * a time (Ruling 7). The board file costs no worker: it is the file itself.
 */
export function ExportButtons(): ReactElement {
  const dict = useDictionary()
  const result = useStore((state) => state.result.shown)
  const drawing = useRef<Worker | null>(null)
  const [busy, setBusy] = useState(false)
  const [error, setError] = useState<string | null>(null)

  // An export outlives nothing: leaving the page takes its worker down.
  useEffect(() => () => drawing.current?.terminate(), [])

  const exportSvg = () => {
    if (result === null || drawing.current !== null) return
    const { W, H, seed } = result.params
    const name = `arrowz-${W}x${H}-seed${seed}.svg`
    // The view of the moment, cell included: the export field is what `cell` is for.
    const view = useStore.getState().view
    const worker = new Worker(new URL('../worker/generate.worker.ts', import.meta.url), { type: 'module' })
    const end = () => {
      worker.terminate()
      drawing.current = null
      setBusy(false)
    }
    worker.onmessage = (event: MessageEvent<WorkerOut>) => {
      const message = event.data
      if (message.type === 'svg') downloadBlob(new Blob([message.svg], { type: 'image/svg+xml' }), name)
      else if (message.type === 'error') setError(message.message)
      end()
    }
    worker.onerror = (event) => {
      setError(event.message)
      end()
    }
    drawing.current = worker
    setBusy(true)
    setError(null)
    worker.postMessage({
      type: 'svg',
      board: result.file,
      options: { ...svgOptions(viewOf(view)), voids: view.voids },
    } satisfies WorkerIn)
  }

  const exportFile = () => {
    if (result === null) return
    downloadBlob(new Blob([JSON.stringify(result.file)], { type: 'application/json' }), `${boardId(result.params)}.board.json`)
  }

  return (
    <div className="fw-ghost fw-exports" role="group" aria-label={dict.t('exportsGroup')}>
      <button type="button" onClick={exportSvg} disabled={result === null || busy}>
        {dict.t('downloadSvg')}
      </button>
      <button type="button" onClick={exportFile} disabled={result === null}>
        {dict.t('downloadBoardFile')}
      </button>
      {error === null ? null : (
        <p className="fw-export-error" role="alert">
          {`${dict.t('exportError')} ${error}`}
        </p>
      )}
    </div>
  )
}
```

In `apps/lab/src/run/RunColumn.tsx`, add `import { ExportButtons } from './ExportButtons'`, and after the `{simple ? null : ( <div className="fw-ghost"> … </div> )}` block, before `</section>`, insert:

```tsx
      {/* In both views: the exports belong to the board, not to the knobs. */}
      <ExportButtons />
```

In `apps/lab/src/design/run.css`, after the `.fw-opt .lab` rule (line 60), insert:

```css
/* The mock's ghost buttons (`.fw-ghost button`), for the exports: a second
   ghost group after the switches' one, whose own 8px top padding is the gap
   between them. `--ash` on `--graphite` is 5.52:1 and moves to `--ink` on
   hover (ExportButtons.browser.test.tsx measures it). */
.fw .fw-exports button {
  flex: none;
  height: 28px;
  min-height: 28px;
  padding: 0 2px;
  border: 0;
  background: none;
  color: var(--ash);
  text-align: left;
  cursor: pointer;
}
.fw .fw-exports button:hover:not(:disabled) {
  color: var(--ink);
}
/* The same refusal as `.fw .fw-alt button:disabled`. */
.fw .fw-exports button:disabled {
  opacity: 0.5;
  cursor: default;
}
/* `--error` on `--graphite` is 4.90:1. */
.fw-export-error {
  margin: 4px 0 0;
  color: var(--error);
  overflow-wrap: anywhere;
}
```

and inside the existing `@media (pointer: coarse)` block that raises `.fw .fw-alt button` (line 61), add:

```css
  .fw .fw-exports button {
    height: 44px;
  }
```

- [ ] **Step 4: Keep the exports through a run in flight**

In `apps/lab/src/routes/LabRoute.browser.test.tsx`, in "a run in flight keeps the last result on screen", after `expect(report()?.textContent).toBe(statsBefore)` insert:

```tsx
  // Both exports stay live for the board on screen while the next one carves.
  await expect.element(screen.getByRole('button', { name: 'Download SVG' })).toBeEnabled()
  await expect.element(screen.getByRole('button', { name: 'Download board file' })).toBeEnabled()
```

- [ ] **Step 5: Run the tests to verify they pass**

Run: `pnpm --dir apps/lab exec vitest run --project chromium src/run src/routes/LabRoute.browser.test.tsx`
Expected: PASS — including `RunColumn.browser.test.tsx`, whose command-box case renders the column in a 216×300 box and still finds the box scrolling and Generate unmoved.

Run: `pnpm nx run lab:check && pnpm nx run lab:lint`
Expected: PASS.

- [ ] **Step 6: Commit**

```bash
cd /Users/tomek/dev/arrowz
pnpm --dir apps/lab exec prettier --write src
git add apps/lab/src
git commit -m "Export the board on screen as an SVG and as its board file, from the run column"
```

---

## Task 6: The command box keeps its floor

**Files:** Modify `apps/lab/src/design/run.css`, `apps/lab/src/routes/LabLayout.browser.test.tsx`.

**Interfaces:**
- Consumes: the run column with `ExportButtons` in it (Task 5); `mountApp`, `loadRunDone` (Task 4).
- Produces: `.fw-cmdfig` never shorter than its caption and the box's 58px floor, at every width (PR 4b, Ruling 1).

- [ ] **Step 1: Write the failing layout case**

Append to `apps/lab/src/routes/LabLayout.browser.test.tsx` (add `import { act } from 'react'` and `import { useStore } from '../state/store'` to its imports):

```tsx
// The ≤900px defect PR #67's browser pass found, and the same defect above
// 900px once the exports are in the column (PR 4b, Ruling 1). `.fw-cmdfig` is
// `flex: 0 1 auto` with `min-height: 0`, so the column shrinks the figure below
// its content while `.fw-cmd` keeps its 58px floor and paints behind Generate:
// measured 72.4px (860×900 advanced), 64.8px (simple), 66.9px (1400×900
// advanced, with the exports). What must hold is the run.css ruling as well:
// the box scrolls, and Generate does not move as the command grows.
const COMMAND_BOX_SIZES = [
  [860, 900, 'advanced'],
  [860, 900, 'simple'],
  [1400, 900, 'advanced'],
] as const

test.each(COMMAND_BOX_SIZES)(
  'at %i×%i (%s) the command box paints nothing over Generate, and Generate does not follow the command',
  async (width, height, mode) => {
    await page.viewport(width, height)
    const screen = await mountApp(mode)
    await loadRunDone()
    const box = () => rect(screen.container, '.fw-cmd')
    const go = () => rect(screen.container, '.fw-go')
    expect(box().bottom).toBeLessThanOrEqual(go().top)
    const goTop = go().top
    // The long command RunColumn.browser.test.tsx uses for the same question.
    await act(async () =>
      useStore.getState().params.setMany({
        W: 137,
        H: 251,
        seed: 987654,
        pStraight: 0.83,
        wShort: 0.45,
        wMid: 0.35,
        trapBias: 3,
        backbite: 6,
        giants: 4,
      }),
    )
    expect(box().bottom).toBeLessThanOrEqual(go().top)
    expect(go().top).toBe(goTop)
    const pre = screen.container.querySelector('.fw-cmd')
    if (pre === null) throw new Error('the command box is not on the page')
    expect(getComputedStyle(pre).overflowY).not.toBe('hidden')
  },
  40_000,
)
```

- [ ] **Step 2: Run it to verify it fails**

Run: `pnpm --dir apps/lab exec vitest run --project chromium src/routes/LabLayout.browser.test.tsx -t "command box"`
Expected: FAIL in all three cases on the first `toBeLessThanOrEqual` — the box's bottom sits tens of pixels below Generate's top (the figures in the comment above).

- [ ] **Step 3: Give the figure its floor**

In `apps/lab/src/design/run.css`, replace the `.fw-cmdfig` rule and its comment (lines 72-80) with:

```css
/* `<figure>` carries a browser default margin; the mock's box has none, and
   the flex column depends on it.

   The floor is the caption's line, its 6px margin and the box's own 58px
   (PR 4b, Ruling 1). Without it the column shrank the figure below its content
   — to 0px at 860×900, and to 5.5px at 1400×900 once the exports joined the
   column — while `.fw-cmd` kept its 58px and painted behind Generate. With it
   the figure is 84.4px wherever the column is short; the box still scrolls
   inside itself and Generate does not move as the command grows (measured 0px
   at 860 in both views and at 1400 in the advanced view), which is the ruling
   below. What gives instead is the column, which scrolls, as it already does
   in the simple view. `flex: none` at ≤900px was measured as the alternative
   and fixed only 860, moving Generate 4.8px for a long command. */
.fw-cmdfig {
  flex: 0 1 auto;
  min-height: calc(1lh + 6px + 58px);
  margin: 0;
  display: flex;
  flex-direction: column;
}
```

- [ ] **Step 4: Run the tests to verify they pass**

Run: `pnpm --dir apps/lab exec vitest run --project chromium src/routes/LabLayout.browser.test.tsx src/run/RunColumn.browser.test.tsx`
Expected: PASS — the three new cases, and `RunColumn`'s "leaves the whole command reachable, without moving Generate" unchanged.

- [ ] **Step 5: Commit**

```bash
cd /Users/tomek/dev/arrowz
pnpm --dir apps/lab exec prettier --write src
git add apps/lab/src
git commit -m "Keep the command box's floor in a short run column, so it never paints behind Generate"
```

---

## Task 7: Solo, from the frame's corner and from `f`

**Files:** Modify `apps/lab/src/state/ui.slice.ts`, `apps/lab/src/state/ui.slice.test.ts`, `apps/lab/src/stage/BoardFrame.tsx`, `apps/lab/src/stage/BoardFrame.browser.test.tsx`, `apps/lab/src/routes/LabRoute.tsx`, `apps/lab/src/App.tsx`, `apps/lab/src/design/shell.css`, `apps/lab/src/design/console.css`, `apps/lab/src/harness/mountApp.tsx`, `apps/lab/src/routes/LabLayout.browser.test.tsx`.

**Interfaces:**
- Consumes: `BoardFrame` (Task 3), `ReportPanel` in the stage (Task 4), `mountApp`, `loadRunDone`, `rect` (Tasks 4 and 6); the existing `fullView` word.
- Produces: `UiState` gains `solo: boolean`, `setSolo(on: boolean): void`, `toggleSolo(): void`; `.fw-lab.solo`; the toggle `button.fw-solo` named "Full view (key F)" with `aria-pressed`; `useSoloKey(onLab: boolean)` inside `App.tsx`.

- [ ] **Step 1: Write the failing slice tests**

In `apps/lab/src/state/ui.slice.test.ts`, append:

```ts
// Spec §5.3 lists solo in `ui`, and nothing remembers it: the old lab's
// `body.solo` is gone on reload too.
describe('solo', () => {
  function slice() {
    const store: { ui: UiState } = { ui: createUiSlice((fn) => Object.assign(store, fn(store))) }
    return store
  }

  it('starts off', () => {
    expect(slice().ui.solo).toBe(false)
  })

  it('toggles, and is set to what it is given', () => {
    const store = slice()
    store.ui.toggleSolo()
    expect(store.ui.solo).toBe(true)
    store.ui.toggleSolo()
    expect(store.ui.solo).toBe(false)
    store.ui.setSolo(true)
    store.ui.setSolo(true)
    expect(store.ui.solo).toBe(true)
  })
})
```

Run: `pnpm --dir apps/lab exec vitest run --project node src/state/ui.slice.test.ts`
Expected: FAIL — `toggleSolo is not a function`.

- [ ] **Step 2: Add solo to the slice**

In `apps/lab/src/state/ui.slice.ts`: in `UiState`, after `mode: ViewMode`, add

```ts
  /** The board takes the whole lab panel (spec §5.1). Never remembered, never in the hash. */
  solo: boolean
```

and after `setMode(mode: ViewMode): void` add

```ts
  setSolo(on: boolean): void
  toggleSolo(): void
```

In `createUiSlice`, after `mode: modeOf(readStored(MODE_KEY)),` add `solo: false,`, and after the `setMode` entry add:

```ts
    setSolo: (solo) => patch({ solo }),
    // Read inside the update, not from a closure: the toggle and the `f` key
    // can both fire before a render.
    toggleSolo: () => set((state) => ({ ui: { ...state.ui, solo: !state.ui.solo } })),
```

Run: `pnpm --dir apps/lab exec vitest run --project node src/state/ui.slice.test.ts`
Expected: PASS.

- [ ] **Step 3: Write the failing browser tests**

In `apps/lab/src/harness/mountApp.tsx`, in `resetApp`, after `state.ui.setMode(mode)` add `state.ui.setSolo(false)`.

In `apps/lab/src/stage/BoardFrame.browser.test.tsx`, add `state.ui.setSolo(false)` to `beforeEach`, and append:

```tsx
// Spec §5.2 and PR 4b, Ruling 3: a glyph of its own — `⤢` is the element's fit
// button — named by `fullView`, and a toggle, so it says whether it is on.
test('the solo toggle is a named toggle in the frame, after the element', async () => {
  const screen = await mountFrame()
  const toggle = screen.getByRole('button', { name: 'Full view (key F)' })
  await expect.element(toggle).toHaveAttribute('aria-pressed', 'false')
  const element = screen.container.querySelector('arrowz-board')
  if (element === null) throw new Error('no board element')
  expect(element.compareDocumentPosition(toggle.element()) & Node.DOCUMENT_POSITION_FOLLOWING).toBeTruthy()
  await toggle.click()
  expect(useStore.getState().ui.solo).toBe(true)
  await expect.element(toggle).toHaveAttribute('aria-pressed', 'true')
  await toggle.click()
  expect(useStore.getState().ui.solo).toBe(false)
})
```

Append to `apps/lab/src/routes/LabLayout.browser.test.tsx` (add `import { userEvent } from 'vitest/browser'` beside `page`):

```tsx
function twoFrames(): Promise<void> {
  return new Promise((resolve) => requestAnimationFrame(() => requestAnimationFrame(() => resolve())))
}

const SOLO_SIZES = [
  [1400, 900, 'advanced'],
  [1400, 900, 'simple'],
  [860, 900, 'advanced'],
  [860, 900, 'simple'],
] as const

// Spec §5.1: the board box fills the lab, not merely "the rest is hidden". The
// 34px are the wrap's 16px padding and the board's 1px border on each side,
// measured at every one of these sizes. And nothing is remounted: the GL
// canvas and the run column are the same nodes before, during and after.
test.each(SOLO_SIZES)(
  'at %i×%i (%s) solo gives the board the whole lab and remounts nothing',
  async (width, height, mode) => {
    await page.viewport(width, height)
    const screen = await mountApp(mode)
    await loadRunDone()
    const element = screen.container.querySelector('arrowz-board')
    const canvas = element?.shadowRoot?.querySelector('canvas')
    const column = screen.getByRole('region', { name: 'Run' }).element()
    expect(canvas).toBeTruthy()

    await screen.getByRole('button', { name: 'Full view (key F)' }).click()
    await twoFrames()
    const lab = rect(screen.container, '.fw-lab')
    const wrap = rect(screen.container, '.fw-boardwrap')
    const board = rect(screen.container, 'arrowz-board')
    for (const side of ['top', 'left', 'width', 'height'] as const) expect(wrap[side]).toBeCloseTo(lab[side], 0)
    expect(board.width).toBeCloseTo(lab.width - 34, 0)
    expect(board.height).toBeCloseTo(lab.height - 34, 0)
    expect(rect(screen.container, '.fw-report').height).toBe(0)
    expect(rect(screen.container, '.fw-console').height).toBe(0)
    // The status line stays, so a carve in flight is still reported.
    await expect.element(screen.getByRole('status', { name: 'Run status' })).toBeVisible()

    expect(element?.shadowRoot?.querySelector('canvas')).toBe(canvas)
    expect(screen.getByRole('region', { name: 'Run' }).element()).toBe(column)
    await screen.getByRole('button', { name: 'Full view (key F)' }).click()
    await expect.element(screen.getByRole('region', { name: 'Run' })).toBeVisible()
    expect(screen.getByRole('region', { name: 'Run' }).element()).toBe(column)
    expect(element?.shadowRoot?.querySelector('canvas')).toBe(canvas)
  },
  40_000,
)

/** A key the way a listener on the document receives it, for the cases a real keyboard cannot type. */
function press(target: EventTarget, init: KeyboardEventInit): void {
  target.dispatchEvent(new KeyboardEvent('keydown', { bubbles: true, ...init }))
}

const solo = () => useStore.getState().ui.solo

// Spec §5.1: `f` and `F`, and nothing else. Every refusal is followed by the
// same event without the thing refused, so a listener that ignored synthetic
// events altogether could not pass the refusals.
test('f toggles solo, and a modifier, a repeat or Escape does nothing', async () => {
  await page.viewport(1400, 900)
  const screen = await mountApp('advanced')
  await loadRunDone()
  await userEvent.keyboard('f')
  expect(solo()).toBe(true)
  await userEvent.keyboard('F')
  expect(solo()).toBe(false)

  for (const modifier of [{ ctrlKey: true }, { metaKey: true }, { altKey: true }, { repeat: true }]) {
    press(document.body, { key: 'f', ...modifier })
    expect(solo(), JSON.stringify(modifier)).toBe(false)
  }
  press(document.body, { key: 'f' })
  expect(solo()).toBe(true)

  // The palette of PR 7 owns Escape; the old lab has no such key.
  await userEvent.keyboard('{Escape}')
  expect(solo()).toBe(true)
  await screen.getByRole('button', { name: 'Full view (key F)' }).click()
  expect(solo()).toBe(false)
}, 40_000)

test('f typed into a field or an editable region is text, not a toggle', async () => {
  await page.viewport(1400, 900)
  const screen = await mountApp('advanced')
  await loadRunDone()
  await screen.getByRole('tab', { name: 'board', exact: true }).click()
  await screen.getByRole('button', { name: /^seed:/ }).click()
  await userEvent.keyboard('f')
  expect(solo()).toBe(false)
  await userEvent.keyboard('{Escape}')

  // The board group has no `<select>`; `difficulty` holds `trapBias`'s
  // ChoiceKnob and the start control, both selects (engine.ts:2517-2519).
  await screen.getByRole('tab', { name: 'difficulty', exact: true }).click()
  await expect.element(screen.getByRole('tabpanel', { name: 'difficulty' })).toBeVisible()
  const select = screen.container.querySelector('select')
  const editable = document.createElement('div')
  editable.contentEditable = 'true'
  document.body.append(editable)
  try {
    for (const target of [select, editable]) {
      if (target === null) throw new Error('no select on the board group')
      press(target, { key: 'f' })
      expect(solo(), target.nodeName).toBe(false)
    }
    press(document.body, { key: 'f' })
    expect(solo()).toBe(true)
  } finally {
    editable.remove()
  }
}, 40_000)

test('f does nothing off the lab route', async () => {
  await page.viewport(1400, 900)
  const screen = await mountApp('advanced')
  await loadRunDone()
  await screen.getByRole('tab', { name: 'Saved boards' }).click()
  await expect
    .poll(() => screen.container.querySelector('#lab-panel')?.closest('main')?.hasAttribute('hidden'))
    .toBe(true)
  await userEvent.keyboard('f')
  expect(solo()).toBe(false)
}, 40_000)

// Spec §5.1: a focus inside what solo hides would fall to <body> at the next
// rendering step; it goes to the toggle instead, which is where solo is undone.
test('a focus inside what solo hides moves to the toggle', async () => {
  await page.viewport(1400, 900)
  const screen = await mountApp('advanced')
  await loadRunDone()
  const generate = screen.getByRole('button', { name: 'Generate' }).element()
  if (!(generate instanceof HTMLButtonElement)) throw new Error('Generate is not a button')
  generate.focus()
  await userEvent.keyboard('f')
  expect(solo()).toBe(true)
  await twoFrames()
  expect(document.activeElement).toBe(screen.getByRole('button', { name: 'Full view (key F)' }).element())
}, 40_000)
```

- [ ] **Step 4: Run them to verify they fail**

Run: `pnpm --dir apps/lab exec vitest run --project chromium src/stage/BoardFrame.browser.test.tsx src/routes/LabLayout.browser.test.tsx -t "solo|f "`
Expected: FAIL — no button named "Full view (key F)"; `f` leaves `solo` false.

- [ ] **Step 5: Add the toggle, the class and the key**

In `apps/lab/src/stage/BoardFrame.tsx`: change the React import to `import { type ReactElement, useLayoutEffect, useMemo, useRef } from 'react'`; after the `elementView` line add:

```tsx
  const solo = useStore((state) => state.ui.solo)
  const toggleSolo = useStore((state) => state.ui.toggleSolo)
  const toggle = useRef<HTMLButtonElement>(null)

  // Solo hides everything in the lab but the stage's board (console.css), and
  // HTML's focus fixup would drop a focus left in there onto <body> at the next
  // rendering step. A layout effect runs before that step, while the focus is
  // still where it was; it moves to the toggle, which is how solo is undone
  // (spec §5.1). Only on the way in, and only a focus inside the lab and outside
  // this frame: the tab strip, the top bar and the run status stay on screen.
  useLayoutEffect(() => {
    const button = toggle.current
    if (!solo || button === null) return
    const active = document.activeElement
    const lab = button.closest('.fw-lab')
    const frame = button.closest('.fw-boardwrap')
    if (active !== null && lab !== null && lab.contains(active) && frame !== null && !frame.contains(active)) {
      button.focus()
    }
  }, [solo])
```

and after the annotation's `{result === null ? null : (…)}` block, still inside `.fw-board`, add:

```tsx
        {/* Its own glyph: `⤢` is the element's fit button (PR 4b, Ruling 3). */}
        <button
          ref={toggle}
          type="button"
          className="fw-solo"
          aria-label={dict.t('fullView')}
          title={dict.t('fullView')}
          aria-pressed={solo}
          onClick={toggleSolo}
        >
          ⛶
        </button>
```

Replace "and, from Task 7, the solo toggle" in the doc comment with "and the solo toggle".

In `apps/lab/src/routes/LabRoute.tsx`, after `const simple = …` add `const solo = useStore((state) => state.ui.solo)`, and replace `<div className={simple ? 'fw-lab simple' : 'fw-lab'}>` with:

```tsx
        <div className={`fw-lab${simple ? ' simple' : ''}${solo ? ' solo' : ''}`}>
```

In `apps/lab/src/App.tsx`, after `useStoreSave`, add:

```tsx
/**
 * The `f` hotkey, the application's first global one (spec §5.1): `f` and `F`
 * alike, as the old lab reads both (lab-page.ts:944) — Shift is not a modifier
 * here — and nothing with Ctrl, ⌘ or Alt (the old lab toggled on ⌘F and opened
 * the browser's find as well), no key repeat, nothing typed into a field or an
 * editable region, and nothing off the lab route: the listener exists only
 * while the lab is on screen. A focused button is not a field, so `f` on
 * Generate toggles, as it does in the old lab (PR 4b, Ruling 9). Escape is not
 * handled: the palette of PR 7 owns it.
 */
function useSoloKey(onLab: boolean) {
  useEffect(() => {
    if (!onLab) return
    const onKey = (event: KeyboardEvent) => {
      if (event.key !== 'f' && event.key !== 'F') return
      if (event.ctrlKey || event.metaKey || event.altKey || event.repeat) return
      const target = event.target
      if (target instanceof HTMLElement && (target.isContentEditable || target.closest('input, textarea, select') !== null)) {
        return
      }
      useStore.getState().ui.toggleSolo()
    }
    document.addEventListener('keydown', onKey)
    return () => document.removeEventListener('keydown', onKey)
  }, [onLab])
}
```

and in `Shell`, after `useStoreSave()`, add `useSoloKey(onLab)`.

- [ ] **Step 6: Style solo and the toggle**

In `apps/lab/src/design/shell.css`, after the `.fw-anno` rule (Task 3), insert:

```css
/* The solo toggle (spec §5.2): the frame's top-right corner, after the element
   in DOM order for the reason `.fw-anno` gives. The ring sits inside the
   button, because `.fw-board` clips (`overflow: hidden`) and the global 2px
   offset would draw it outside the frame; `--signal` on `--void` is 4.08:1,
   above the 3:1 a focus indicator needs. */
.fw .fw-solo {
  position: absolute;
  top: 0;
  right: 0;
  width: 30px;
  height: 30px;
  padding: 0;
  border: 0;
  background: var(--void);
  color: var(--ink);
  cursor: pointer;
}
.fw .fw-solo:hover {
  background: var(--surface);
}
.fw .fw-solo:focus-visible {
  outline-offset: -2px;
}
@media (pointer: coarse) {
  .fw .fw-solo {
    width: 44px;
    height: 44px;
  }
}
```

In `apps/lab/src/design/console.css`, after the `.fw-lab.simple` rule, insert:

```css
/* Solo (spec §5.1): the board takes the whole lab panel. Hidden is everything
   in the lab but the stage — the preset strip, the console, the violations,
   the clamp notice, and whatever a later PR puts beside them — and, inside the
   stage, the run rail and the report. Both grids are redefined, because a
   track keeps its size when its only item is `display: none`: the lab's rows
   become the one stage track (`.fw-lab.simple.solo` outranks `.fw-lab.simple`
   rather than tying with it), and the stage's columns and rows — including its
   ≤900px rows (shell.css) — become the one board track, as the old lab's
   `body.solo .cols` does (lab.html:140). Nothing unmounts: the GL context, the
   run column's focus and a draft being typed all live in the hidden nodes.
   Measured: `.fw-boardwrap` equals `.fw-lab` and the element is 34px smaller
   on both axes at 1400×900, 860×900 and 860×650, in both views. */
.fw-lab.solo,
.fw-lab.simple.solo {
  grid-template-rows: minmax(0, 1fr);
}
.fw-lab.solo > :not(.fw-stage),
.fw-lab.solo .fw-runs,
.fw-lab.solo .fw-report {
  display: none;
}
.fw-lab.solo .fw-stage {
  grid-template-columns: minmax(0, 1fr);
  grid-template-rows: minmax(0, 1fr);
}
```

- [ ] **Step 7: Run the tests to verify they pass**

Run: `pnpm --dir apps/lab exec vitest run --project chromium src/stage src/routes`
Expected: PASS.

Prove the grid redefinition is load-bearing: temporarily delete the `.fw-lab.solo .fw-stage` rule and rerun `pnpm --dir apps/lab exec vitest run --project chromium src/routes/LabLayout.browser.test.tsx -t "whole lab"`. Expected: FAIL on `wrap.width` (the hidden rail's 70px column and, above 900px, the report's 22rem column keep their widths). Restore it: PASS.

Run: `pnpm nx run lab:check && pnpm nx run lab:lint`
Expected: PASS.

- [ ] **Step 8: Commit**

```bash
cd /Users/tomek/dev/arrowz
pnpm --dir apps/lab exec prettier --write src
git add apps/lab/src
git commit -m "Give the board the whole lab panel from the frame's corner or the f key, remounting nothing"
```

---

## Task 8: The browser pass, the spec amendments, the gates and the pull request

**Files:** Modify `docs/superpowers/specs/2026-09-13-lab-react-app-design.md`. No application code unless the browser pass finds a defect, in which case each defect is its own commit with a test.

- [ ] **Step 1: Look at it in a browser**

Run `sh packages/cli/lab.sh` (it builds the old lab and serves the board store on `127.0.0.1:8777`, the proxy's target) and, in a second shell, `pnpm nx serve lab`. Open the lab in Chrome through the chrome-devtools MCP, sizing it with `emulate` rather than `resize_page`. At `1400x900x1` and `860x900x1`, in both views, check and record:

1. After the load run, set 600×600 and press Generate: while it carves, the board, the report, the annotation (naming the 25×50 board) and both export buttons stay; when it finishes, all four describe the 600×600 board.
2. The second board's report shows deltas, `+` or `−`, coloured by direction; switching to Polish keeps every delta and translates every label.
3. Download SVG saves `arrowz-600x600-seed9.svg`, which opens as an SVG; Download board file saves `<boardId>.board.json`, byte-identical to the file the store wrote under `packages/cli/boards/600x600/` (compare with `cmp`; read the store, do not modify it). A slow SVG export at 600×600 disables only its own button.
4. At 860×900 and 860×760 the report is a row under the board, scrolls inside itself, and the board is whole; at 860×700 the report row is 0px tall and nothing overlaps the console.
5. The command box paints nothing over Generate at 860×900 (both views) and at 1400×900 (advanced); a long command scrolls inside the box.
6. Solo from the corner button and from `f` gives the board the whole panel in both views; ⌘F opens the browser's find and leaves solo alone; Escape leaves solo on; a keyboard focus on Generate lands on the toggle; the element's zoom and pan still work in solo, and fit refits it on the way in and out.
7. The console shows no errors; list what it does show, against PR #67's browser pass (Vite's debug lines, React DevTools, "Lit is in dev mode", the `willReadFrequently` warning from `gl-color.ts:45`).

Anything failing is fixed now, test first, one commit per defect.

- [ ] **Step 2: Amend spec §5.2, §8 and §10**

The sentences below are wrapped at 80 columns in the spec; match them across the line breaks and rewrap each replacement to the same width.

In §5.2's report paragraph, replace "with a capped height, and the board keeps its own minimum except below 700px of height, where `shell.css:185-189` releases it. The cap is chosen by measuring at 860×900 and kept by a browser test" with:

"in a row sized by the stage itself — `minmax(0, 1fr)` under the board's `minmax(min(292px, 100%), 2fr)`, chosen by measuring at 860 wide from 650 to 1100 high (plan `2026-09-15-lab-report-export.md`, Ruling 2), where a fixed `max-height` clipped the board at every height below 900 and a bare 292px minimum pushed the board over the console — and the board keeps its own minimum except below 700px of height, where `shell.css:185-189` releases it and the row's 292px with it. The layout is kept by a browser test"

In §5.2's last bullet, replace "The solo toggle is a separate glyph in the frame's top-right corner" with "The solo toggle is a separate glyph, `⛶`, in the frame's top-right corner".

In §8's browser list, replace "the ≤900px command box measured before and after its fix" with "the command box at 860×900 in both views and at 1400×900 in the advanced view, measured before and after its fix".

In §10 row 4b, replace "the fix applies at ≤900px only, after the cause is measured, and leaves the above-900px ruling of `run.css:104-115` (the box scrolls, the column does not grow) intact" with "measured, the same collapse appears above 900px once the exports join the column (66.9px over Generate at 1400×900 in the advanced view), so the fix — a floor on the figure — applies at every width and keeps the ruling of `run.css:104-115`: the box scrolls, and Generate does not move as the command grows".

Run: `grep -n "applies at ≤900px only\|The cap is chosen by measuring" docs/superpowers/specs/2026-09-13-lab-react-app-design.md`
Expected: no output.

- [ ] **Step 3: Run both gates**

Run: `deno task verify` (repository root)
Expected: PASS.

Run: `pnpm nx run-many -t verify`
Expected: PASS. A failure is fixed and committed, not skipped; a failure that predates this branch is reported with `git log` evidence rather than assumed.

- [ ] **Step 4: Commit the amendments and write the PR body**

```bash
cd /Users/tomek/dev/arrowz
git add docs/superpowers/specs/2026-09-13-lab-react-app-design.md
git commit -m "Record in the spec what measuring the report row and the command box decided"
```

Write the body to `.superpowers/sdd/2026-09-15-lab-report-export/pr-body.md` (gitignored), in this order:

- What the PR adds — the result slice and `completeRun`, the report column, both exports, the annotation, solo and `f`, the command box's floor — and that it closes §10 row 4b; parity with today's lab is still PR 5.
- The twelve rulings, one line each; Rulings 1 and 2 with their measurements, because both depart from the spec's first wording.
- **Parity deltas a reviewer must judge:** a run in flight keeps the last result (the skeleton cleared it); the board file download is new; the export error sits under the buttons, not in the status; `f` ignores modifiers, repeat, `select` and `contenteditable`, where the old lab toggled on ⌘F; Escape does not leave solo; the statistics labels are row headers.
- **What this changes for test authors:** `run.board`, `run.file`, `run.report`, `run.saved`, `run.finished` and `run.stored` are gone; a test that finishes a run calls `completeRun` after `run.started`, resets `result` beside `run`, and waits for a save with a file other than the one before (`savedAfter` in `LabRoute.browser.test.tsx`), because a run in flight no longer clears the answer; layout cases set their own viewport.
- The browser pass's seven observations from Step 1.
- Follow-ups: in the simple view above 900px Generate still moves as the command grows (24.5px at 1400×900, measured before this branch's change and untouched by it); `workerError` is still unreachable from the status line; the §7.1 `--signal` pair is still open.
- What is **not** here: the library (PR 5), the docs route (PR 6), the filmstrip, the diff strip and ⌘K (PR 7).

Pushing the branch and opening the pull request are the user's call. When the user approves: `git push -u origin lab/report-export` and `gh pr create --base lab/simple-view --title "The generator lab as a React application: the report, the exports and solo" --body-file .superpowers/sdd/2026-09-15-lab-report-export/pr-body.md`.

---

## Self-Review

**Spec §10 row 4b.** The result slice and a run in flight keeping the board, report and exports — Task 2 (board), Task 4 (report), Task 5 (exports), one whole-app case growing across the three. The report column with the delta and the longest pieces — Task 4. `reportDelta` into `lab-report.ts`, with its tests and the old lab switched — Task 1. The SVG export through a throw-away worker and the board-file download — Task 5. `BoardFrame` with the annotation — Task 3; the solo toggle, the button and `f` — Task 7. The command box — Task 6. The spec's corrections — Task 8.

**§5.3's result notes.** `show()` copies the report fields (Task 2, "show keeps the report fields…"); the baseline has no `board` and moves only past a result with metrics (Task 2, two cases); `show()` clears the answer and `stored` drops a file no longer shown, by identity (Task 2, three cases); `completeRun` writes both slices in one update and throws without a started run (Task 2, `store.test.ts`); `run.started()` leaves `result.shown` (Task 2); `result.reset()` beside every `run.reset()` in a test (Task 2, Step 8); `useStoreSave` keeps its posted-once ref and no longer compares the file on answer (Task 2, Step 7); `RunStatusBar` reads `result` (Task 2).

**§8's PR 4b cases.** Kept through a run in flight — `LabRoute.browser.test.tsx`, Tasks 2, 4, 5. SVG name and type, board-file text — Task 5. Solo's board box in both views and at both widths, GL canvas and run column by identity — Task 7. `f` with a modifier, in a field, off the lab route, key repeat, Escape — Task 7. The delta, annotation and export-button colours — Tasks 4, 3, 5. The command box before and after — Task 6. A focus inside what solo hides moved to the toggle — Task 7. At 860×900 a knob row visible and the board whole at no less than its minimum — Task 4. `reportDelta`'s null cases — Task 1. The report's delta by row index, unmoved by a language switch — Task 4.

**Type consistency.** `ShownResult`, `Baseline`, `ResultState` (Task 2) are what `StatsTable`, `ReportPanel` (Task 4), `BoardFrame` (Task 3), `ExportButtons` (Task 5) and `useStoreSave` read. `FinishedRun` is `store.ts`'s and `result.fixtures.ts` extends it; `completeRun` takes it in `useGenerator`, the fixtures, `RunStatusBar` and `RunColumn` tests. `reportDelta`'s `ReportDelta.trend` values are the three class names `report.css` colours and the tests assert. `resetApp`/`mountApp`/`loadRunDone` (Task 4) gain `setSolo(false)` in Task 7, which Task 7's own slice step defines first. `rect` is defined once in `LabLayout.browser.test.tsx` (Task 4) and reused by Tasks 6 and 7; `twoFrames` is defined there in Task 7.

**Known risks, recorded rather than solved.**

1. **`1lh` needs Chrome 109, Firefox 120 or Safari 16.4.** The lab is a local tool run in a current browser; an older one loses only the command box's floor.
2. **Two sites build a worker from `generate.worker.ts`** (`useGenerator` and `ExportButtons`). Vite may emit the chunk twice in a production build; the fingerprint parity test covers the generation path only, and the SVG path is covered by Task 5's real-worker case in the browser project.
3. **`LongestTable`'s memo was not measured at Insane.** It exists because `longestSummary` sorts every piece and a preview edit re-renders the report; Task 8's pass watches for a stall at 600×600 and reports a measurement rather than guessing one at 1000×1000.
4. **The layout figures are Chrome 153's at `deviceScaleFactor: 2`.** The layout cases assert with half-pixel tolerance; a different font fallback could move the command box's caption, which `1lh` follows by construction.
