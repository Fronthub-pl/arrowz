# Lab docs: live boards and the command-line page (PR 4) Implementation Plan

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:subagent-driven-development (recommended) or superpowers:executing-plans to implement this plan task-by-task. Steps use checkbox (`- [ ]`) syntax for tracking.

**Goal:** Live boards on the Docs pages (`::board`, `:::compare`), generated from CLI commands on a worker of the docs' own, mounted only near the view, with measured stats, Copy and Open in lab; and the full command-line page, `/docs/cli`, written from `packages/cli/README.md` in English and Polish, with its knob, rule and environment tables built from code.

**Architecture:** A board directive's `cmd` goes through the CLI's own `splitCommand` → `parseArgs` → `drawOf` (`docs/boards.ts`), which the content guard runs over every page. A `DocsBoardsProvider` in the Docs chunk owns a queue (`docs/docsQueue.ts`) that feeds `generate.worker.ts` one board at a time and keeps finished runs for the session, keyed by `boardId`. `DocsBoard` watches its frame with an `IntersectionObserver` rooted on the panel: near the view it asks for its board and mounts `<arrowz-board>`; out of it, the element unmounts and gives its WebGL context back. A plain wheel over a board scrolls the page; ⌘/Ctrl + wheel zooms it; under a coarse pointer the board is a still picture. Open in lab is the ⌘K paste path (`loadCommand`), reached through a `RunControlContext` the shell provides.

**Tech Stack:** React 19, react-router 8, Vitest 5 (`node` + `chromium` projects), mdast with `micromark-extension-directive` (PR 1's parser), `@lit/react` (`BoardCanvas`), Deno 2.9 for the engine and the CLI guards.

**Spec:** `docs/superpowers/specs/2026-10-05-lab-docs-from-readmes-design.md` (PR 4 of §6; §1.2, §2.3, §2.4, §3.1, §4.1–§4.4, §5.1, §5.2, §5.4). Bead `arrowz-kkey.4`.

## Decisions this plan takes where the spec is loose

1. **A plain wheel scrolls the page; ⌘/Ctrl + wheel and a trackpad pinch zoom the board; under a coarse pointer a docs board is a still picture.** The user's choice (2026-10-05). `<arrowz-board>` zooms on every wheel turn (`onWheel` calls `preventDefault`) and its canvas has `touch-action: none`, so on a page of ~30 boards the page would stop scrolling under the pointer. The lab handles it on its side, with no change to the element: the frame swallows a plain wheel in the capture phase, and under `(pointer: coarse)` the element gets `pointer-events: none` and an empty `controls` slot. Open in lab is how a phone looks closer.
2. **The session cache is keyed by `boardId(params)`, not by `cmd`.** `--colored`, `--line` and the other picture flags do not change the board, so the README's comparisons share boards: 30 commands on the two pages lay 24 different boards (measured). The spec's intent — coming back draws at once, never a second request — holds either way.
3. **The README's "thirty-by-thirty window into the million-cell board" gets no board of its own.** The 1000×1000 board is live (behind its button) and zooms; the prose says so.
4. **"Five things to try" stays a `sh` block.** The README has no pictures there; the page adds no boards where the README has none.
5. **The Arrowz page gets its two pictures as live boards:** the 40×40 hero under the lead and the 8×8 coloured board in "The puzzle" (README `hero.png`, `tiny-colorized.png`).
6. **Open in lab is a button that does what pasting the command into ⌘K does** (`loadCommand`): knobs, view, recipe, the advanced view if the command pins a knob, `/`, one run. The lab then writes its own link into the address, as after any run. Disabled while a series runs, as the palette row is.
7. **Copy is named after the nearest heading, `##` or `###`.** The help moves under one section with two `###` (`--help`, `--help=knobs`); named after the `##`, both buttons would read "Copy: What --help prints".
8. **The prose writes no measured number; the stats lines under the boards do.** The README's numbers have drifted already (`--probe=1 --probelen=4` lays 239 arrows today, the README says 253). Counts that only describe the code ("twelve everyday flags", "five picture flags" — both wrong in the README: seven and sixteen) are left out too.
9. **The report's own flags and the everyday flags' bundles are prose tables.** Their sources (`REPORT_FLAGS` in `packages/cli`, the bundles in `lab-simple.ts`'s drawing) have no table form the lab can import; §7 of the spec leaves prose facts unchecked.
10. **In the knob table the group column is translated, the flag, range, step and default are not**, and the description is the lab's own knob help (`dict.paramText(spec).help`, `dict.d.start.help` for `--start`).

## Global Constraints

- Everything in the repository is in English; the Polish lives only in `apps/lab/docs-content/pl/`, the `PL` dictionary of `packages/engine/lab-i18n.ts`, and the `PL` table of `packages/engine/lab-docs.ts`.
- No `any`, no non-null assertions; no `Math.min(...arr)` / `Math.max(...arr)` over cells or pieces.
- Comments: say why, once; non-header blocks ≤ 6 lines, module/API headers ≤ 24 lines; cite symbols, never `file.ts:NN`; no PR, task, review or history references (`packages/engine/comments.test.ts`).
- The glossary (`packages/engine/glossary.test.ts`), for every docs page's prose and every description in `lab-docs.ts`: English never piece(s), close/closed, jam, giant(s), probe(s), carve (outside `deno task carve`), anticoil, paper, ink, corridor, fragment, absorb…, lateral, jitter, backbite, point grid; no `--flag` outside a code span on any page; "knob" only on the CLI page and never in `lab-docs.ts`. Polish never element/elementy (except the component on the element page), domkn…, zaklin…, zacina/zacię…, sond…, wycię/wycin…, papier, tusz, generacj…, fragment…, siatka punktów; "pokrętło" only on the CLI page and never in `lab-docs.ts`. The guard matches substrings: run it, do not trust your eyes. Directive lines (`::…`, `:::…`) are not prose to the guard, so a board's label is checked by Jev, not by the glossary.
- `lab-docs.ts` is under `neutral.test.ts`: no `Deno.`, no `localStorage`, no DOM name in it, descriptions included.
- Markdown rules (PR 1): `#` is the page title, first; every `##` carries `{#id}`, the same in both languages; a literal `<` is `\<`; a colon followed by a letter or digit is `\:` in prose; links are `docs:<page>#<id>` or `https://`; a note (`>`) holds paragraphs only. No link in the prose may be named like a page ("Arrowz", "Lab", "Command line", "Board element") — whole-app tests look those names up.
- `apps/lab` reads the engine from `packages/engine/dist/`: after editing `packages/engine/*.ts`, run `pnpm nx build engine` before any lab test.
- On this worktree `pnpm install` is done; run `pnpm nx build engine && pnpm nx build board-element` once before the first lab test.
- Prettier (`printWidth: 120`, no semicolons, single quotes) checks everything in `apps/lab`, its `.md` files included: `pnpm exec prettier --write <files>` from `apps/lab` before each commit. Prettier leaves directives alone and aligns GFM tables (measured). `deno fmt <files>` for `.ts` files under `packages/`; the root `deno.json` excludes `**/*.md`.
- `pnpm run check` and `pnpm run lint` (from `apps/lab`) before every lab commit; `deno task check` and `deno task lint` (from `packages/engine`, and `packages/cli` when touched) before every engine/CLI commit.
- Tests: `pnpm exec vitest run --project node <files>` and `pnpm exec vitest run --project chromium <files>` from `apps/lab`; `deno test -A <files>` from `packages/engine` or `packages/cli`.
- Never delete or change anything under `packages/cli/boards/`, `dist/` or `node_modules/` — gitignored is not worthless.
- Mutations: commit first, mutate, run, undo by hand — never `git checkout` a file with uncommitted work.
- Every task ends with a commit of exactly the files it lists (`git add <paths>`, never `git add -A`). No attribution lines in commit messages or the PR description; the PR body cites `Bead: arrowz-kkey.4`.
- Jev (`deno task jev:docs`) advises and never gates; its flags are triaged by a person (Task 10).

## Review Focus

1. **Scrolling a long page with the wheel, or with a finger.** A plain wheel over a board must scroll the panel and leave the board's zoom alone; ⌘/Ctrl + wheel must zoom it; under a coarse pointer the board takes no pointer at all and shows no corner buttons — Task 6 "a plain wheel over a board is the page's, a ⌘/Ctrl wheel is the board's" and "a still board takes no pointer and draws no controls".
2. **Scrolling straight to the end of the CLI page.** The boards scrolled past must not make the last board wait behind them, and at no moment may more boards exist than the page's budget — Task 4 "withdrawing a waiting request drops it from the queue" and Task 6 "scrolling a page of thirty boards keeps at most twelve and asks once per board".
3. **Generating in the Docs tab while the lab holds a board.** A docs board must not touch the `run` or `result` slices, so the lab's board and its report stay as they were — Task 5 "a docs board leaves the lab's run and result alone".
4. **A language switch with boards on screen.** The labels and the stats relabel; nothing is generated again — Task 5 "a language switch relabels the stats and asks the worker for nothing".
5. **A board that fails, or comes back not complete.** The failure shows its message and Try again generates once more; a board that is not complete says so and draws its empty cells — Task 5 "a failed board says why and Try again asks again" and "a board that is not complete says so".

---

## File Structure

| File | Responsibility |
|---|---|
| `packages/engine/command.ts` (+ `command.test.ts`) | `ENV_VARS`, `EnvVar`; `environment()` joins them (Task 1). |
| `packages/engine/lab-report.ts` (+ `lab-report.test.ts`) | `STAT_KEYS`, `StatKey` derived from it (Task 1). |
| `packages/engine/lab-docs.ts` (+ `lab-docs.test.ts`), `packages/engine/README.md` | `Docs.env`, six column names (Task 1). |
| `packages/engine/glossary.test.ts`, `packages/cli/readme.test.ts` | The env descriptions use no retired word; `ENV_VARS` is the tasks' `--allow-env` grant (Task 1). |
| `apps/lab/src/docs/DocsTable.tsx`, `apps/lab/src/docs/shape.ts`, `apps/lab/src/docs/tables.test.ts`, `apps/lab/src/docs/content.test.ts` | `::table{of="knobs"|"rules"|"env"}` (Task 2). |
| `apps/lab/src/docs/DocsMarkdown.tsx` | Copy named after the nearest heading (Task 2); `::board` and `:::compare` (Task 5). |
| `apps/lab/src/docs/boards.ts` (+ `boards.test.ts`) | A board command read with the CLI's code; stats and `about` names (Task 3). |
| `apps/lab/src/docs/shape.ts` (+ `shape.test.ts`) | Directive rules with labels, free attributes and the `compare` container (Task 3). |
| `apps/lab/src/docs/docsQueue.ts` (+ `docsQueue.test.ts`) | One worker, one board at a time, the session cache (Task 4). |
| `apps/lab/src/harness/docsWorkers.ts` | Fake workers for the queue's tests and the page tests (Task 4). |
| `apps/lab/src/docs/DocsBoards.tsx`, `apps/lab/src/docs/useNear.ts`, `apps/lab/src/docs/DocsBoard.tsx` (+ `DocsBoard.browser.test.tsx`) | The provider, the near-the-view signal, the board with its caption, stats and command (Task 5). |
| `apps/lab/src/routes/DocsBody.tsx` | Provides the boards to the page (Task 5). |
| `packages/engine/lab-i18n.ts` | `docsBoardGenerate`, `docsBoardTryAgain`, `docsBoardFailed`, `docsOpenInLab` (Tasks 5, 7). |
| `apps/lab/src/design/docs.css` | The board's frame, the comparison grid, the stats, the still board (Tasks 5, 6). |
| `apps/lab/src/docs/useCoarsePointer.ts`, `apps/lab/src/docs/DocsBoardScroll.browser.test.tsx` | The wheel, the coarse pointer, the mount budget (Task 6). |
| `apps/lab/src/run/RunControlContext.ts`, `apps/lab/src/App.tsx`, `apps/lab/src/docs/OpenInLab.browser.test.tsx` | Open in lab (Task 7). |
| `packages/cli/scripts/jev-docs.ts` (+ test), `packages/cli/scripts/jev-ci.ts` (+ test) | Jev reads tables, `~~~`, notes, headings and the env descriptions; findings carry their file and line (Task 8). |
| `apps/lab/docs-content/{en,pl}/cli.md`, `apps/lab/docs-content/{en,pl}/arrowz.md` | The pages (Task 9). |
| `apps/lab/src/docs/CliPage.browser.test.tsx`, `ArrowzPage.browser.test.tsx`, `routes/DocsLayout.browser.test.tsx`, `routes/DocsNav.browser.test.tsx` | Tests against the new pages (Task 9). |
| `docs/jev-guards.md` | Thresholds re-measured on the CLI page (Task 10). |

Suggested models for subagent-driven execution: Sonnet for Tasks 1, 2, 8; Opus for Tasks 3–7 and 9 (the queue, the board's life cycle and the longest prose); Fable for the whole-branch review.

---

### Task 1: The engine's lists — environment variables, report rows, env descriptions

**Files:**
- Modify: `packages/engine/command.ts`, `packages/engine/lab-report.ts`, `packages/engine/lab-docs.ts`, `packages/engine/README.md`
- Test: `packages/engine/command.test.ts`, `packages/engine/lab-report.test.ts`, `packages/engine/lab-docs.test.ts`, `packages/engine/glossary.test.ts`, `packages/cli/readme.test.ts`, `apps/lab/src/docs/content.test.ts`

**Interfaces:**
- Produces: `export const ENV_VARS: readonly { name, usage }[]` (as const) and `export type EnvVar` in `@arrowz/engine/command`; `export const STAT_KEYS` (as const, the table's order) and `export type StatKey = (typeof STAT_KEYS)[number]` in `@arrowz/engine/report`; `Docs.env: Record<EnvVar, string>` and `Docs.colGroup`, `colFlag`, `colRange`, `colStep`, `colFlags`, `colVariable` (all `string`) in `@arrowz/engine/docs`.

- [ ] **Step 0: Bead metadata**

```bash
bd update arrowz-kkey.4 --set-metadata plan=lab/docs-cli:docs/superpowers/plans/2026-10-05-lab-docs-cli.md \
  --set-metadata docs=packages/cli/README.md,README.md
```

- [ ] **Step 1: Write the failing tests**

In `packages/engine/command.test.ts`, add (import `ENV_VARS` from `./command.ts` beside the file's other imports from it):

```ts
// The help's last two lines, as they print today: `environment()` joins ENV_VARS
// and wraps at the same place, so moving the list into data changes no output.
Deno.test('the help names every environment variable, on the same two lines', () => {
  for (const knobs of [false, true]) {
    assertEquals(helpText({ knobs }).split('\n').slice(-2), [
      'Environment: ARROWZ_BOARDS_DIR (board store), CARVE_TRACE=1 (progress on stderr), GIANT_DEBUG=1,',
      'CARVE_TIMEOUT_S=N (abort after N seconds; the board built so far is stored as incomplete).',
    ])
  }
  assertEquals(
    ENV_VARS.map((v) => v.name),
    ['ARROWZ_BOARDS_DIR', 'CARVE_TRACE', 'GIANT_DEBUG', 'CARVE_TIMEOUT_S'],
  )
})
```

In `packages/engine/lab-report.test.ts`, add (import `STAT_KEYS` beside `reportRows`; `run` is the file's own helper):

```ts
Deno.test('STAT_KEYS is every row reportRows returns, in its order', () => {
  const rows = reportRows(run(20, 20, 7), { ...defaultParams(), W: 20, H: 20, seed: 7 }, dictionary('en'))
  assertEquals(
    rows.filter((row) => row.kind === 'row').map((row) => row.key),
    [...STAT_KEYS],
  )
})
```

(Use the file's existing imports for `defaultParams` and `dictionary`; if `run` returns something other than a `ReportInput`, build the input the way the test `'reportRows returns 32 rows and 5 separators'` does.)

In `packages/engine/lab-docs.test.ts`:
- in `'every lab table description is in both languages, and translated'`, change the group list to `['keys', 'palette', 'linkFields', 'env'] as const` and the count to `assertEquals(seen, 10 + 17 + 19 + 4)`;
- in the comment above `'the frame around the tables is translated too'`, replace `Fifteen strings exist
// today (fourteen \`col*\` and \`infoLabel\`)` with `Twenty-one strings exist
// today (twenty \`col*\` and \`infoLabel\`)`, and change `assert(frame.length > 14,` to `assert(frame.length > 20,`.

In `packages/engine/glossary.test.ts`, in `docsRows`, add `'env'` to the group list: `(['props', 'members', 'events', 'slots', 'keys', 'palette', 'linkFields', 'env'] as const)`.

In `packages/cli/readme.test.ts`, import `ENV_VARS` from `@arrowz/engine/command` with the file's other imports from it, and after `'every variable the CLI README names is one a task may read'` add:

```ts
// The help and the Docs page list ENV_VARS; the runtime lets the CLI read the grant.
Deno.test('ENV_VARS is exactly what the tasks may read', () => {
  assertEquals(ENV_VARS.map((v) => v.name).sort(), [...envGranted].sort())
})
```

In `apps/lab/src/docs/content.test.ts`, in `'every %s description is plain inline Markdown'`, add `docs.env` to the list of groups.

- [ ] **Step 2: Run them to see them fail**

```bash
cd packages/engine && deno test -A command.test.ts lab-report.test.ts lab-docs.test.ts glossary.test.ts
```

Expected: FAIL at type check — `ENV_VARS` and `STAT_KEYS` are not exported, `env` is not a key of `Docs`.

- [ ] **Step 3: `ENV_VARS`**

In `packages/engine/command.ts`, replace the function `environment()` and its JSDoc with:

```ts
/**
 * The variables `carve` and `report` read, in the order `--help` names them,
 * each as the help writes it. The tasks' `--allow-env` grants are these names
 * (packages/cli/readme.test.ts), and the Docs page's table lists them.
 */
export const ENV_VARS = [
  { name: 'ARROWZ_BOARDS_DIR', usage: 'ARROWZ_BOARDS_DIR (board store)' },
  { name: 'CARVE_TRACE', usage: 'CARVE_TRACE=1 (progress on stderr)' },
  { name: 'GIANT_DEBUG', usage: 'GIANT_DEBUG=1' },
  {
    name: 'CARVE_TIMEOUT_S',
    usage: 'CARVE_TIMEOUT_S=N (abort after N seconds; the board built so far is stored as incomplete)',
  },
] as const

export type EnvVar = (typeof ENV_VARS)[number]['name']

/** Where `environment()` wraps: the width its two lines have always had. */
const ENV_WIDTH = 100

/** The environment variables, named the same way in both help texts. */
function environment(): string {
  const lines: string[] = []
  let line = 'Environment:'
  ENV_VARS.forEach((v, i) => {
    const item = `${v.usage}${i === ENV_VARS.length - 1 ? '.' : ','}`
    if (line.length + 1 + item.length > ENV_WIDTH) {
      lines.push(line)
      line = item
    } else line = `${line} ${item}`
  })
  lines.push(line)
  return lines.join('\n')
}
```

- [ ] **Step 4: `STAT_KEYS`**

In `packages/engine/lab-report.ts`, replace the whole `export type StatKey = | 'board' | …` union (keep its JSDoc above it, and append one sentence to it: `` `STAT_KEYS` lists them in the table's order. ``) with:

```ts
export const STAT_KEYS = [
  'board',
  'pieces',
  'avgLen',
  'longest',
  'lengths',
  'f0',
  'almost',
  'farBlock',
  'D',
  'corridor',
  'span',
  'spanTop',
  'spanMax',
  'outDeg',
  'maxOut',
  'blockDist',
  'bends',
  'turnsPerCell',
  'coil',
  'ownSides',
  'border',
  'neighbours',
  'multi',
  'stall',
  'absorbed',
  'backtracks',
  'time',
  'rework',
  'stuckBy',
  'stuckLen',
  'selfTrap',
  'shortened',
] as const

export type StatKey = (typeof STAT_KEYS)[number]
```

- [ ] **Step 5: The env descriptions and the six column names**

In `packages/engine/lab-docs.ts`, add `import type { EnvVar } from './command.ts'` after the existing imports. In `interface Docs`, after `readonly linkFields: Record<LinkField, string>`, add:

```ts
  /** The environment variables of the CLI page's table, by name (`ENV_VARS`). */
  readonly env: Record<EnvVar, string>
```

and after `readonly colField: string` add:

```ts
  /** The knob table's columns; the default and the description are the shared `colDefault`, `colDescription`. */
  readonly colGroup: string
  readonly colFlag: string
  readonly colRange: string
  readonly colStep: string
  /** The rule table's first column: the flags a rule is about. */
  readonly colFlags: string
  readonly colVariable: string
```

In `EN`, after `linkFields: { … },` add:

```ts
  env: {
    ARROWZ_BOARDS_DIR: 'Where boards are saved, instead of `packages/cli/boards/`.',
    CARVE_TRACE: "Set to `1`, prints the generator's progress on stderr while it works.",
    GIANT_DEBUG: 'Set to `1`, prints on stderr how each arrow of the skeleton was grown.',
    CARVE_TIMEOUT_S: 'Gives up a board after that many seconds; `carve` saves what it laid so far, marked not complete.',
  },
```

and after `colField: 'Field',`:

```ts
  colGroup: 'Group',
  colFlag: 'Flag',
  colRange: 'Range',
  colStep: 'Step',
  colFlags: 'Flags',
  colVariable: 'Variable',
```

In `PL`, the same places:

```ts
  env: {
    ARROWZ_BOARDS_DIR: 'Gdzie zapisywać plansze zamiast `packages/cli/boards/`.',
    CARVE_TRACE: 'Ustawiona na `1` wypisuje na stderr postęp generatora w trakcie pracy.',
    GIANT_DEBUG: 'Ustawiona na `1` wypisuje na stderr, jak rosła każda strzałka szkieletu.',
    CARVE_TIMEOUT_S: 'Przerywa planszę po tylu sekundach; `carve` zapisuje to, co zdążył ułożyć, jako niepełną.',
  },
```

```ts
  colGroup: 'Grupa',
  colFlag: 'Flaga',
  colRange: 'Zakres',
  colStep: 'Krok',
  colFlags: 'Flagi',
  colVariable: 'Zmienna',
```

- [ ] **Step 6: The engine README**

```bash
cd packages/engine && deno test -A readme.test.ts
```

Expected: FAIL, printing the rows it expects for `ENV_VARS`, `EnvVar`, `STAT_KEYS`, the changed `StatKey` and the changed `Docs`. Add or replace those rows in `packages/engine/README.md`, in the tables of their entry points (`command`, `report`, `docs`), with the descriptions: `ENV_VARS` — "The environment variables `carve` and `report` read, each with the words `--help` prints for it."; `EnvVar` — "The name of one of them."; `STAT_KEYS` — "Every row of the statistics table, by key, in the table's order.". Re-run until it passes.

- [ ] **Step 7: Run them to see them pass**

```bash
cd packages/engine && deno test -A command.test.ts lab-report.test.ts lab-docs.test.ts glossary.test.ts readme.test.ts neutral.test.ts comments.test.ts && deno task check && deno task lint
cd ../cli && deno test -A readme.test.ts && deno task check
cd ../.. && pnpm nx build engine && cd apps/lab && pnpm exec vitest run --project node src/docs/content.test.ts
```

Expected: PASS everywhere.

- [ ] **Step 8: Mutations**

Commit first (Step 9), then one at a time, undoing each by hand: (a) set `ENV_WIDTH = 120` — the help test fails; (b) swap `'time'` and `'backtracks'` in `STAT_KEYS` — the order test fails; (c) write "pieces" into the English `GIANT_DEBUG` description — the glossary test fails.

- [ ] **Step 9: Commit**

```bash
deno fmt packages/engine/command.ts packages/engine/command.test.ts packages/engine/lab-report.ts packages/engine/lab-report.test.ts packages/engine/lab-docs.ts packages/engine/lab-docs.test.ts packages/engine/glossary.test.ts packages/cli/readme.test.ts
cd apps/lab && pnpm exec prettier --write src/docs/content.test.ts && cd ../..
git add packages/engine/command.ts packages/engine/command.test.ts packages/engine/lab-report.ts packages/engine/lab-report.test.ts packages/engine/lab-docs.ts packages/engine/lab-docs.test.ts packages/engine/glossary.test.ts packages/engine/README.md packages/cli/readme.test.ts apps/lab/src/docs/content.test.ts
git commit -m "engine: the environment variables and the report's rows as lists, and the CLI page's env descriptions"
```

---

### Task 2: The knob, rule and environment tables; Copy named after its heading

**Files:**
- Modify: `apps/lab/src/docs/DocsTable.tsx`, `apps/lab/src/docs/shape.ts`, `apps/lab/src/docs/DocsMarkdown.tsx`, `apps/lab/src/design/docs.css`
- Test: `apps/lab/src/docs/tables.test.ts`, `apps/lab/src/docs/content.test.ts`, `apps/lab/src/docs/DocsMarkdown.browser.test.tsx`

**Interfaces:**
- Consumes: `KNOB_ROWS`, `RULE_ROWS`, `ENV_VARS`, `flagOf` (`@arrowz/engine/command`); `PARAM_SPEC` (`@arrowz/engine`); `Docs.env`, `colGroup` … `colVariable` (Task 1); `Dict.paramText`, `Dict.reason`, `Dict.d.groups`, `Dict.d.start` (`@arrowz/engine/i18n`).
- Produces: `::table{of="knobs"}`, `::table{of="rules"}`, `::table{of="env"}`; `export function knobHelp(dict: Dict, row: KnobRow): string` in `DocsTable.tsx`.

- [ ] **Step 1: Write the failing tests**

In `apps/lab/src/docs/tables.test.ts`, add:

```ts
import { ENV_VARS, KNOB_ROWS } from '@arrowz/engine/command'
import { knobHelp } from './DocsTable'

test('the env descriptions are the variables the CLI reads', () => {
  expect(sorted(Object.keys(docs.env))).toEqual(sorted(ENV_VARS.map((v) => v.name)))
})

// The knob table's descriptions are the lab's knob help: one per row, in both languages, translated.
test('every knob row has the lab’s help, in both languages', () => {
  for (const row of KNOB_ROWS) {
    const en = knobHelp(dictionary('en'), row)
    const pl = knobHelp(dictionary('pl'), row)
    expect(en, row.flag).not.toBe('')
    expect(pl, row.flag).not.toBe('')
    expect(pl, row.flag).not.toBe(en)
  }
})
```

In `apps/lab/src/docs/content.test.ts`, after `'every %s description is plain inline Markdown'`, add:

```ts
// The knob help and the rule reasons are the lab's dictionary, written for a
// title attribute, not for Markdown; the page draws them through the parser.
test.each(LANGS)('every %s knob help and rule reason is plain inline Markdown', (lang) => {
  const dict = dictionary(lang)
  const texts = [...KNOB_ROWS.map((row) => knobHelp(dict, row)), ...RULE_ROWS.map((row) => dict.reason(row.key))]
  for (const text of texts) {
    expect(parseDocs(text).children.map((node) => node.type), text).toEqual(['paragraph'])
    for (const node of inlineOf(text)) expect(['text', 'inlineCode', 'emphasis', 'strong'], text).toContain(node.type)
  }
})
```

(imports: `dictionary` from `@arrowz/engine/i18n`, `KNOB_ROWS`, `RULE_ROWS` from `@arrowz/engine/command`, `knobHelp` from `./DocsTable`.)

In `apps/lab/src/docs/DocsMarkdown.browser.test.tsx`, add:

```ts
test('the knob table has a row per knob, its machine columns as the CLI prints them', async () => {
  const screen = await show('# T\n\n## Every knob {#knobs}\n\n::table{of="knobs"}')
  const rows = [...screen.container.querySelectorAll('table[aria-labelledby="docs-knobs"] tbody tr')]
  expect(rows).toHaveLength(KNOB_ROWS.length)
  const first = [...(rows[0]?.querySelectorAll('td') ?? [])].map((td) => td.textContent)
  const row = KNOB_ROWS[0]
  if (row === undefined) throw new Error('no knob rows')
  expect(first.slice(0, 5)).toEqual([dictionary('en').d.groups[row.group], row.flag, row.values, row.step, row.def])
})

test('the knob, rule and env tables follow the language', async () => {
  const screen = await show(
    '# T\n\n## K {#knobs}\n\n::table{of="knobs"}\n\n## R {#rules}\n\n::table{of="rules"}\n\n## E {#env}\n\n::table{of="env"}',
  )
  await act(async () => useStore.getState().lang.setLang('pl'))
  const pl = dictionary('pl')
  const lastCell = (id: string) =>
    screen.container.querySelector(`table[aria-labelledby="docs-${id}"] tbody tr td:last-child`)?.textContent
  const knob = KNOB_ROWS[0]
  const rule = RULE_ROWS[0]
  if (knob === undefined || rule === undefined) throw new Error('no rows')
  await expect.poll(() => lastCell('knobs')).toBe(plainOf(knobHelp(pl, knob)))
  expect(lastCell('rules')).toBe(plainOf(pl.reason(rule.key)))
  expect(lastCell('env')).toBe(plainOf(docsFor('pl').env.ARROWZ_BOARDS_DIR))
  expect(screen.container.querySelector('table[aria-labelledby="docs-env"] th')?.textContent).toBe('Zmienna')
})

test('--start reads the start help, not the help of one of its two knobs', async () => {
  const screen = await show('# T\n\n## K {#knobs}\n\n::table{of="knobs"}')
  const start = [...screen.container.querySelectorAll('tbody tr')].find(
    (tr) => tr.querySelector('td:nth-child(2)')?.textContent === '--start',
  )
  expect(start?.querySelector('td:last-child')?.textContent).toBe(plainOf(dictionary('en').d.start.help))
})

test('a code block is copied under the name of its nearest heading', async () => {
  const screen = await show('# T\n\n## Part {#part}\n\n```sh\na\n```\n\n### Detail\n\n```sh\nb\n```')
  await expect.element(screen.getByRole('button', { name: 'Copy: Part' })).toBeVisible()
  await expect.element(screen.getByRole('button', { name: 'Copy: Detail' })).toBeVisible()
})
```

with, near the top of the file:

```ts
/** What a description reads as on the page: its inline Markdown without the markup. */
const plainOf = (text: string) => plainText(inlineOf(text))
```

(imports: `KNOB_ROWS`, `RULE_ROWS` from `@arrowz/engine/command`; `docsFor` from `@arrowz/engine/docs`; `inlineOf`, `plainText` from `./markdown`; `knobHelp` from `./DocsTable`.)

- [ ] **Step 2: Run them to see them fail**

```bash
cd apps/lab && pnpm exec vitest run --project node src/docs/tables.test.ts src/docs/content.test.ts
pnpm exec vitest run --project chromium src/docs/DocsMarkdown.browser.test.tsx
```

Expected: FAIL — `knobHelp` is not exported; the new tables render nothing; the second Copy is named `Copy: Part`.

- [ ] **Step 3: Name the tables**

In `apps/lab/src/docs/shape.ts`, add `'knobs', 'rules', 'env'` to the end of `DIRECTIVES.table.of`.

- [ ] **Step 4: Draw them**

In `apps/lab/src/docs/DocsTable.tsx`, add the imports:

```ts
import { PARAM_SPEC } from '@arrowz/engine'
import { ENV_VARS, flagOf, KNOB_ROWS, type KnobRow, RULE_ROWS } from '@arrowz/engine/command'
import type { Dict } from '@arrowz/engine/i18n'
```

and, after `described`, add:

```ts
/**
 * A knob row's description: the help the lab shows for that knob, in the
 * page's language. `--start` stands for two knobs, so it reads the start help.
 */
export function knobHelp(dict: Dict, row: KnobRow): string {
  if (row.flag === '--start') return dict.d.start.help
  const spec = PARAM_SPEC.find((s) => flagOf(s.key) === row.flag)
  return spec === undefined ? row.help : dict.paramText(spec).help
}
```

Before the final `return null` of `DocsTable`, add:

```tsx
  if (of === 'knobs')
    return (
      // Six columns, two of them prose: on a phone the table scrolls by itself, not the panel.
      <div className="fw-docs-scroll">
        <table className="fw-docs-table" aria-labelledby={labelledBy}>
          <thead>
            <tr>
              <th scope="col">{docs.colGroup}</th>
              <th scope="col">{docs.colFlag}</th>
              <th scope="col">{docs.colRange}</th>
              <th scope="col">{docs.colStep}</th>
              <th scope="col">{docs.colDefault}</th>
              <th scope="col">{docs.colDescription}</th>
            </tr>
          </thead>
          <tbody>
            {KNOB_ROWS.map((row) => (
              <tr key={row.flag}>
                <td>{dict.d.groups[row.group]}</td>
                <Mono text={row.flag} column="attr" />
                <Mono text={row.values} column="expr" />
                <Mono text={row.step} column="expr" />
                <Mono text={row.def} column="expr" />
                <td>
                  <InlineMarkdown text={knobHelp(dict, row)} />
                </td>
              </tr>
            ))}
          </tbody>
        </table>
      </div>
    )
  if (of === 'rules')
    return (
      <table className="fw-docs-table" aria-labelledby={labelledBy}>
        <thead>
          <tr>
            <th scope="col">{docs.colFlags}</th>
            <th scope="col">{docs.colDescription}</th>
          </tr>
        </thead>
        <tbody>
          {RULE_ROWS.map((row) => (
            <tr key={row.key}>
              <Mono text={row.flags.join(', ')} column="attr" />
              <td>
                <InlineMarkdown text={dict.reason(row.key)} />
              </td>
            </tr>
          ))}
        </tbody>
      </table>
    )
  if (of === 'env')
    return (
      <table className="fw-docs-table" aria-labelledby={labelledBy}>
        <thead>
          <tr>
            <th scope="col">{docs.colVariable}</th>
            <th scope="col">{docs.colDescription}</th>
          </tr>
        </thead>
        <tbody>
          {ENV_VARS.map((v) => (
            <tr key={v.name}>
              <Mono text={v.name} column="type" />
              <td>
                <InlineMarkdown text={docs.env[v.name]} />
              </td>
            </tr>
          ))}
        </tbody>
      </table>
    )
```

Update the component's JSDoc: "the element's, from the shared rows, the CLI's, from the command line's own tables, or the lab's, from the lab's own code."

In `apps/lab/src/design/docs.css`, after the `.fw-docs-table .mono` rule, add:

```css
/* A table wider than the page scrolls inside this box, so the panel never does. */
.fw-docs-scroll {
  max-width: 100%;
  overflow-x: auto;
}
```

If the knob help or a rule reason fails the Markdown test of Step 1 (a `*`, `_` or `<` in the dictionary text), stop and report it: the fix is in the dictionary's text, which is a decision for the controller.

- [ ] **Step 5: Copy named after the nearest heading**

In `apps/lab/src/docs/DocsMarkdown.tsx`, replace `interface Placed` and `placed` with:

```ts
interface Placed {
  readonly node: RootContent
  /** The section the block sits in: a table is labelled by it. */
  readonly section: DocsSection | null
  /** The nearest heading above the block, `##` or `###`: Copy is named after it. */
  readonly title: string
}

function placed(root: Root): Placed[] {
  const out: Placed[] = []
  let section: DocsSection | null = null
  let title = ''
  for (const node of root.children) {
    const id = node.type === 'heading' && node.depth === 2 ? sectionIdOf(node) : undefined
    if (node.type === 'heading' && id !== undefined) {
      section = { id: SECTION_PREFIX + id, title: plainText(node.children) }
      title = section.title
    }
    if (node.type === 'heading' && node.depth === 3) title = plainText(node.children)
    out.push({ node, section, title })
  }
  return out
}
```

Pass `title={block.title}` from `DocsMarkdown` to `Block`; give `Block`, `CodeView` and `Directive` a `title: string` prop; in `CodeView` use `section={title}` for both `DocsBlock`s (drop `const title = section?.title ?? ''`), and in `Directive`'s `help` branch use `section={title}`. Tables keep `labelledBy={section?.id}`.

- [ ] **Step 6: Run them to see them pass**

```bash
cd apps/lab && pnpm exec vitest run --project node src/docs
pnpm exec vitest run --project chromium src/docs src/routes
pnpm run check && pnpm run lint
```

Expected: PASS. The existing element and CLI page tests still name their Copy buttons after `##` sections, which have no `###` above their blocks.

- [ ] **Step 7: Commit, then mutate**

```bash
cd apps/lab && pnpm exec prettier --write src/docs/DocsTable.tsx src/docs/shape.ts src/docs/DocsMarkdown.tsx src/docs/tables.test.ts src/docs/content.test.ts src/docs/DocsMarkdown.browser.test.tsx src/design/docs.css && cd ../..
git add apps/lab/src/docs/DocsTable.tsx apps/lab/src/docs/shape.ts apps/lab/src/docs/DocsMarkdown.tsx apps/lab/src/docs/tables.test.ts apps/lab/src/docs/content.test.ts apps/lab/src/docs/DocsMarkdown.browser.test.tsx apps/lab/src/design/docs.css
git commit -m "lab: the Docs tables of every knob, the rules between them and the CLI's environment variables"
```

Mutations, each undone by hand: (a) in `knobHelp`, return `row.help` always — the language test fails; (b) drop the `--start` branch — the start test fails; (c) in `placed`, stop updating `title` at `###` — the Copy test fails.

---

### Task 3: The board directives' grammar, checked with the CLI's own parser

**Files:**
- Create: `apps/lab/src/docs/boards.ts`, `apps/lab/src/docs/boards.test.ts`
- Modify: `apps/lab/src/docs/shape.ts`
- Test: `apps/lab/src/docs/shape.test.ts`

**Interfaces:**
- Consumes: `splitCommand`, `parseArgs`, `drawOf`, `problemText`, `boardId`, `ParsedArgs` (`@arrowz/engine/command`); `validateParams`, `formatViolation`, `Params`, `View` (`@arrowz/engine`); `STAT_KEYS`, `StatKey` (Task 1).
- Produces, in `boards.ts`:
  - `export const DOCS_BOARD_MAX = 500`
  - `export interface DocsBoardSpec { readonly cmd: string; readonly parsed: ParsedArgs; readonly params: Params; readonly view: View; readonly key: string }`
  - `export function readBoardCmd(cmd: string): { spec: DocsBoardSpec | null; problems: string[] }`
  - `export function statKeysOf(value: string | null | undefined): StatKey[]`
  - `export function statsProblem(value: string): string | null`
  - `export function aboutProblem(value: string): string | null`
  - `export function aboutOf(attributes: Record<string, string | null | undefined> | null | undefined): number | null` — the seconds of a `manual` board, null for one that generates by itself.
- Produces, in `shape.ts`: `problemsOf` accepts `::board[label]{cmd stats? manual? about?}` and `:::compare{stats?}` holding two or more `::board`s; `shapeOf` lists `:::compare{…}`.

- [ ] **Step 1: Write the failing tests**

Create `apps/lab/src/docs/boards.test.ts`:

```ts
import { boardId } from '@arrowz/engine/command'
import { describe, expect, test } from 'vitest'
import { aboutOf, aboutProblem, readBoardCmd, statKeysOf, statsProblem } from './boards'

describe('readBoardCmd', () => {
  test('reads the flags with the CLI’s parser: knobs, view and the cache key', () => {
    const { spec, problems } = readBoardCmd('--width=30 --height=20 --seed=42 --length=0 --colored --line=0.2')
    expect(problems).toEqual([])
    expect(spec?.params.W).toBe(30)
    expect(spec?.params.H).toBe(20)
    expect(spec?.params.seed).toBe(42)
    expect(spec?.view.colored).toBe(true)
    expect(spec?.view.stroke).toBe(0.2)
    expect(spec?.key).toBe(spec === null ? '' : boardId(spec.params))
  })

  test('picture flags do not change the key: the board is the same', () => {
    const plain = readBoardCmd('--width=20 --height=20 --seed=7').spec
    const colored = readBoardCmd('--width=20 --height=20 --seed=7 --colored --line=0.9').spec
    expect(colored?.key).toBe(plain?.key)
  })

  test.each([
    ['deno task carve --width=20 --height=20', 'the flags only'],
    ['--width=20 --height=20 --randomized', '--randomized'],
    ['--width=20 --height=20 --svg', 'no modes'],
    ['--width=20', 'missing --height'],
    ['--width=20 --height=20 --pstraight=0.2', 'outside'],
    ['--width=20 --height=20 --bogus', 'unknown flag'],
    ["--width=20 --height='20", 'quote'],
  ])('refuses %s', (cmd, needle) => {
    const { spec, problems } = readBoardCmd(cmd)
    expect(spec).toBeNull()
    expect(problems.join(' | ')).toContain(needle)
  })
})

test('statKeysOf keeps the report rows it names, in order', () => {
  expect(statKeysOf('pieces  avgLen time')).toEqual(['pieces', 'avgLen', 'time'])
  expect(statKeysOf(undefined)).toEqual([])
})

test('statsProblem names what is not a report row, and an empty list', () => {
  expect(statsProblem('pieces f0')).toBeNull()
  expect(statsProblem('pieces arrows')).toContain('arrows')
  expect(statsProblem(' ')).not.toBeNull()
})

test('about is a whole number of seconds', () => {
  expect(aboutProblem('10')).toBeNull()
  expect(aboutProblem('0')).not.toBeNull()
  expect(aboutProblem('ten')).not.toBeNull()
  expect(aboutOf({ manual: '', about: '10' })).toBe(10)
  expect(aboutOf({ cmd: '--width=4 --height=4' })).toBeNull()
})
```

In `apps/lab/src/docs/shape.test.ts`, add (use the file's existing helpers; `problemsOf(parseDocs(md), DOCS_PAGES)`):

```ts
const problems = (md: string) => problemsOf(parseDocs(`# T\n\n## A {#a}\n\n${md}`), DOCS_PAGES)

describe('board directives', () => {
  test.each([
    '::board[A board]{cmd="--width=20 --height=20"}',
    '::board[Stats]{cmd="--width=20 --height=20" stats="pieces avgLen"}',
    '::board[Big]{cmd="--width=1000 --height=1000" manual about="10"}',
    ':::compare{stats="pieces"}\n::board[a]{cmd="--width=20 --height=20"}\n::board[b]{cmd="--width=20 --height=20 --seed=8"}\n:::',
    ':::compare\n::board[a]{cmd="--width=20 --height=20"}\n::board[b]{cmd="--width=1000 --height=1000" manual about="10"}\n:::',
  ])('accepts %s', (md) => {
    expect(problems(md)).toEqual([])
  })

  test.each([
    ['::board{cmd="--width=20 --height=20"}', 'needs a label'],
    ['::board[x]', 'needs cmd'],
    ['::board[x]{cmd="--width=20 --height=20 --randomized"}', '--randomized'],
    ['::board[x]{cmd="--width=600 --height=20"}', 'manual'],
    ['::board[x]{cmd="--width=20 --height=20" manual}', 'about'],
    ['::board[x]{cmd="--width=20 --height=20" about="10"}', 'manual'],
    ['::board[x]{cmd="--width=20 --height=20" stats="arrows"}', 'arrows'],
    ['::board[x]{cmd="--width=20 --height=20" size="2"}', 'takes no size'],
    ['::table[x]{of="knobs"}', 'takes no label'],
    [':::compare\n::board[a]{cmd="--width=20 --height=20"}\n:::', 'two boards'],
    [':::compare\n::board[a]{cmd="--width=20 --height=20" stats="pieces"}\n::board[b]{cmd="--width=20 --height=20"}\n:::', 'stats'],
    [':::compare\n::board[a]{cmd="--width=20 --height=20"}\nSome prose.\n:::', 'holds boards only'],
    [':::row\n::board[a]{cmd="--width=20 --height=20"}\n:::', 'not a docs directive'],
  ])('refuses %s', (md, needle) => {
    expect(problems(md).join(' | ')).toContain(needle)
  })

  test('the shape of a page lists a comparison and its boards, attributes sorted, labels out', () => {
    const md = ':::compare{stats="pieces"}\n::board[a]{cmd="--width=20 --height=20"}\n::board[b]{cmd="--width=20 --height=20 --seed=8"}\n:::'
    const shape = shapeOf(parseDocs(`# T\n\n${md}`))
    expect(shape).toEqual([
      '#',
      ':::compare{stats=pieces}',
      '::board{cmd=--width=20 --height=20}',
      '::board{cmd=--width=20 --height=20 --seed=8}',
    ])
  })
})
```

(If the file has no `describe` import, add it; `DOCS_PAGES` from `./pages`.)

- [ ] **Step 2: Run them to see them fail**

```bash
cd apps/lab && pnpm exec vitest run --project node src/docs/boards.test.ts src/docs/shape.test.ts
```

Expected: FAIL — `./boards` does not exist; `::board` is "not a docs directive"; `containerDirective is not shown by the docs renderer`.

- [ ] **Step 3: `boards.ts`**

Create `apps/lab/src/docs/boards.ts`:

```ts
/**
 * A live board's command, read the way the CLI reads it: `splitCommand`,
 * `parseArgs`, `drawOf`, the path a command pasted into ⌘K takes. The page's
 * board is then the board its printed command makes. The content guard
 * (`problemsOf` in shape.ts) runs `readBoardCmd` over every page, so a
 * command that does not parse never ships; the renderer reads it again.
 */
import { formatViolation, type Params, validateParams, type View } from '@arrowz/engine'
import { boardId, drawOf, parseArgs, type ParsedArgs, problemText, splitCommand } from '@arrowz/engine/command'
import { STAT_KEYS, type StatKey } from '@arrowz/engine/report'

/** The longest side a board on a page generates by itself; a larger one waits for its button (`manual`). */
export const DOCS_BOARD_MAX = 500

export interface DocsBoardSpec {
  /** The flags as the page writes them; the page shows them after `deno task carve`. */
  readonly cmd: string
  readonly parsed: ParsedArgs
  readonly params: Params
  readonly view: View
  /** The session cache's key: `boardId`, so commands that differ only in the picture share one board. */
  readonly key: string
}

/** Never called: a board on a page refuses `--randomized`, so `drawOf` has nothing to draw. */
const NO_DRAW = (): number => 0

export function readBoardCmd(cmd: string): { spec: DocsBoardSpec | null; problems: string[] } {
  const split = splitCommand(cmd)
  const problems = split.problems.map(problemText)
  if (!/^\s*--/.test(cmd)) problems.push(`cmd holds the flags only, without deno task carve: ${cmd}`)
  const parsed = parseArgs(split.argv)
  problems.push(...parsed.errors)
  if (parsed.choice.random) problems.push('a board on a page is the one its command makes: no --randomized')
  if (parsed.rest.length > 0) problems.push(`no modes on a page: ${parsed.rest.join(' ')}`)
  if (problems.length > 0) return { spec: null, problems }
  const { params } = drawOf(parsed, NO_DRAW)
  const violations = validateParams(params).map(formatViolation)
  if (violations.length > 0) return { spec: null, problems: violations }
  return { spec: { cmd, parsed, params, view: parsed.view, key: boardId(params) }, problems: [] }
}

const isStatKey = (word: string): word is StatKey => STAT_KEYS.some((key) => key === word)

/** The report rows a `stats` attribute names, in its order; a word that is none is dropped (the guard names it). */
export function statKeysOf(value: string | null | undefined): StatKey[] {
  return (value ?? '').split(/\s+/).filter(isStatKey)
}

export function statsProblem(value: string): string | null {
  const words = value.split(/\s+/).filter((word) => word !== '')
  if (words.length === 0) return 'stats names at least one report row'
  const unknown = words.filter((word) => !isStatKey(word))
  return unknown.length === 0 ? null : `stats: ${unknown.join(', ')} is not a report row`
}

export function aboutProblem(value: string): string | null {
  return /^[1-9]\d*$/.test(value) ? null : `about="${value}" is not a whole number of seconds`
}

/** The seconds a `manual` board's button promises; null for a board that generates by itself. */
export function aboutOf(attributes: Record<string, string | null | undefined> | null | undefined): number | null {
  if (attributes === null || attributes === undefined || !('manual' in attributes)) return null
  const seconds = Number(attributes['about'])
  return Number.isInteger(seconds) && seconds > 0 ? seconds : null
}
```

- [ ] **Step 4: The rules in `shape.ts`**

In `apps/lab/src/docs/shape.ts`, replace the `DIRECTIVES` constant and `directiveProblems` with the code below, and import what it uses (`ContainerDirective` beside `LeafDirective` from `mdast-util-directive`; `aboutProblem`, `DOCS_BOARD_MAX`, `readBoardCmd`, `statsProblem` from `./boards`):

```ts
/** What an attribute may hold: one of a list, or whatever `check` lets through (it returns the problem). */
type AttributeRule = readonly string[] | ((value: string) => string | null)

interface DirectiveRule {
  /** `[…]` after the name: a board's caption. The other directives take none. */
  readonly label: boolean
  readonly required: Readonly<Record<string, AttributeRule>>
  readonly optional: Readonly<Record<string, AttributeRule>>
}

const cmdProblem = (value: string): string | null => {
  const { problems } = readBoardCmd(value)
  return problems.length === 0 ? null : `cmd: ${problems.join('; ')}`
}

/** Each leaf directive by name: its label, and the values each attribute may take. */
export const DIRECTIVES: Readonly<Record<string, DirectiveRule>> = {
  table: {
    label: false,
    required: {
      of: [
        'element-props',
        'element-members',
        'element-events',
        'element-slots',
        'keys',
        'palette',
        'link-fields',
        'knobs',
        'rules',
        'env',
      ],
    },
    optional: {},
  },
  help: { label: false, required: { form: ['short', 'knobs'] }, optional: {} },
  play: { label: false, required: { board: RULE_BOARD_NAMES }, optional: {} },
  board: {
    label: true,
    required: { cmd: cmdProblem },
    // `manual` is a bare word: the parser reads it as an empty value.
    optional: { stats: statsProblem, manual: [''], about: aboutProblem },
  },
}

/** `:::compare` holds boards side by side; its `stats` speak for every board in it. */
export const CONTAINERS: Readonly<Record<string, DirectiveRule>> = {
  compare: { label: false, required: {}, optional: { stats: statsProblem } },
}

type Directive = LeafDirective | ContainerDirective

function ruleProblems(rule: AttributeRule, value: string): string | null {
  if (typeof rule === 'function') return rule(value)
  return rule.includes(value) ? null : `"${value}" is not one of ${rule.join(', ')}`
}

function attributeProblems(node: Directive, rule: DirectiveRule, at: string): string[] {
  const out: string[] = []
  const attributes = node.attributes ?? {}
  const mark = node.type === 'containerDirective' ? ':::' : '::'
  for (const [key, value] of Object.entries(attributes)) {
    // hasOwn first: `::toString` or `constructor="x"` would read Object.prototype.
    const allowed = Object.hasOwn(rule.required, key)
      ? rule.required[key]
      : Object.hasOwn(rule.optional, key)
        ? rule.optional[key]
        : undefined
    if (allowed === undefined) {
      out.push(`${at}: ${mark}${node.name} takes no ${key}`)
      continue
    }
    const problem = ruleProblems(allowed, value ?? '')
    if (problem !== null) out.push(`${at}: ${key}: ${problem}`)
  }
  for (const key of Object.keys(rule.required)) if (!(key in attributes)) out.push(`${at}: ${mark}${node.name} needs ${key}`)
  return out
}

function boardProblems(node: LeafDirective, at: string): string[] {
  const attributes = node.attributes ?? {}
  const out: string[] = []
  const manual = 'manual' in attributes
  if (manual !== 'about' in attributes) out.push(`${at}: manual and about go together`)
  const spec = readBoardCmd(attributes['cmd'] ?? '').spec
  if (spec !== null && !manual && Math.max(spec.params.W, spec.params.H) > DOCS_BOARD_MAX)
    out.push(`${at}: a board larger than ${DOCS_BOARD_MAX}×${DOCS_BOARD_MAX} waits for its button: add manual about="…"`)
  return out
}

function leafProblems(node: LeafDirective, at: string): string[] {
  const rule = Object.hasOwn(DIRECTIVES, node.name) ? DIRECTIVES[node.name] : undefined
  if (rule === undefined) return [`${at}: ::${node.name} is not a docs directive`]
  const out = attributeProblems(node, rule, at)
  if (rule.label && node.children.length === 0) out.push(`${at}: ::${node.name} needs a label`)
  if (!rule.label && node.children.length > 0) out.push(`${at}: ::${node.name} takes no label`)
  if (node.name === 'board') out.push(...boardProblems(node, at))
  return out
}

function containerProblems(node: ContainerDirective, at: string): string[] {
  const rule = Object.hasOwn(CONTAINERS, node.name) ? CONTAINERS[node.name] : undefined
  if (rule === undefined) return [`${at}: :::${node.name} is not a docs directive`]
  const out = attributeProblems(node, rule, at)
  const boards = node.children.filter((child) => child.type === 'leafDirective' && child.name === 'board')
  if (boards.length !== node.children.length) out.push(`${at}: :::${node.name} holds boards only`)
  if (boards.length < 2) out.push(`${at}: :::${node.name} needs two boards or more`)
  for (const child of boards)
    if (child.type === 'leafDirective' && 'stats' in (child.attributes ?? {}))
      out.push(`${at}: a board in :::${node.name} takes its stats from the comparison`)
  return out
}
```

In `problemsOf`: add `'containerDirective'` to `SHOWN`; replace `if (node.type === 'leafDirective') out.push(...directiveProblems(node, at))` with:

```ts
    if (node.type === 'leafDirective') out.push(...leafProblems(node, at))
    if (node.type === 'containerDirective') out.push(...containerProblems(node, at))
```

In `shapeOf`, after the `leafDirective` line, add:

```ts
    if (node.type === 'containerDirective') out.push(`:::${node.name}{${attributesOf(node.attributes)}}`)
```

Update the module header of `shape.ts`: the directives' rules are `DIRECTIVES` and `CONTAINERS`, and a board's command is checked by `readBoardCmd` (boards.ts).

- [ ] **Step 5: Run them to see them pass**

```bash
cd apps/lab && pnpm exec vitest run --project node src/docs
pnpm run check && pnpm run lint
```

Expected: PASS, the content guard over the four existing pages included.

- [ ] **Step 6: Commit, then mutate**

```bash
cd apps/lab && pnpm exec prettier --write src/docs/boards.ts src/docs/boards.test.ts src/docs/shape.ts src/docs/shape.test.ts && cd ../..
git add apps/lab/src/docs/boards.ts apps/lab/src/docs/boards.test.ts apps/lab/src/docs/shape.ts apps/lab/src/docs/shape.test.ts
git commit -m "lab: a docs board's command is read and checked with the CLI's own parser"
```

Mutations, each undone by hand: (a) drop the `parsed.choice.random` check — the `--randomized` case fails; (b) make `DOCS_BOARD_MAX` 1000 — the `manual` case fails; (c) remove the `stats` check in `containerProblems` — its case fails.

---

### Task 4: The docs queue — one worker, one board at a time, kept for the session

**Files:**
- Create: `apps/lab/src/docs/docsQueue.ts`, `apps/lab/src/docs/docsQueue.test.ts`, `apps/lab/src/harness/docsWorkers.ts`

**Interfaces:**
- Consumes: `WorkerIn`, `WorkerOut`, `BoardData`, `Params`, `decodeBoard`, `encodeBoard`, `generate`, `defaultParams` (`@arrowz/engine`); `ReportInput` (`@arrowz/engine/report`).
- Produces, in `docsQueue.ts`:
  - `export interface DocsRun { readonly board: BoardData; readonly report: ReportInput; readonly params: Params }`
  - `export type DocsJob = { readonly state: 'waiting' } | { readonly state: 'running' } | { readonly state: 'done'; readonly run: DocsRun } | { readonly state: 'failed'; readonly message: string }`
  - `export interface WorkerLike { postMessage(message: WorkerIn): void; terminate(): void; onmessage: ((event: MessageEvent<WorkerOut>) => void) | null; onerror: ((event: ErrorEvent) => void) | null }`
  - `export interface DocsQueue { cached(key: string): DocsRun | undefined; request(key: string, params: Params, listener: (job: DocsJob) => void): () => void; dispose(): void }`
  - `export function createDocsQueue(makeWorker: () => WorkerLike, cache?: Map<string, DocsRun>): DocsQueue` — the default cache is the session's.
- Produces, in `harness/docsWorkers.ts`:
  - `export function doneMessage(params: Params, ok?: boolean): WorkerOut` — a real board from `generate`, as the worker would post it; `ok: false` marks it not complete.
  - `export class FakeWorker implements WorkerLike { posted: WorkerIn[]; terminated: boolean; answer(out: WorkerOut): void; fail(message: string): void }`
  - `export function fakeWorkers(): { make: () => FakeWorker; made: FakeWorker[] }`
  - `export function answeringWorkers(): { make: () => WorkerLike; posted: Params[] }` — answers every `generate` on the next task with `doneMessage(params)`.
  - `export function silentQueue(): DocsQueue` — a queue whose worker never answers, for page tests that look at the prose only.

- [ ] **Step 1: The fakes**

Create `apps/lab/src/harness/docsWorkers.ts`:

```ts
/**
 * Workers for the Docs boards' tests: one that a test answers by hand, one
 * that answers every request with a real board, and a queue that never
 * answers. A real board, from the engine's `generate`, so what the element
 * draws and what the stats read is what the worker would have posted.
 */
import { encodeBoard, generate, type Params, type WorkerIn, type WorkerOut } from '@arrowz/engine'
import { createDocsQueue, type DocsQueue, type WorkerLike } from '../docs/docsQueue'

export function doneMessage(params: Params, ok = true): WorkerOut {
  const result = generate(params)
  return {
    type: 'done',
    ok: ok && result.ok,
    metrics: result.metrics,
    backtracks: result.backtracks,
    restartsUsed: result.restartsUsed,
    genMs: result.genMs,
    metricsMs: result.metricsMs,
    totalMs: result.genMs + result.metricsMs,
    stuck: result.stuck,
    deadlock: result.deadlock,
    aborted: result.aborted,
    pieces: result.board.pieces.length,
    stats: result.board.stats,
    board: encodeBoard(result.board),
  }
}

export class FakeWorker implements WorkerLike {
  posted: WorkerIn[] = []
  terminated = false
  onmessage: ((event: MessageEvent<WorkerOut>) => void) | null = null
  onerror: ((event: ErrorEvent) => void) | null = null
  postMessage(message: WorkerIn): void {
    this.posted.push(message)
  }
  terminate(): void {
    this.terminated = true
  }
  answer(out: WorkerOut): void {
    this.onmessage?.(new MessageEvent('message', { data: out }))
  }
  fail(message: string): void {
    // Node has no ErrorEvent, and the queue reads only `message` off it.
    this.onerror?.({ message } as ErrorEvent)
  }
}

export function fakeWorkers(): { make: () => FakeWorker; made: FakeWorker[] } {
  const made: FakeWorker[] = []
  return {
    made,
    make: () => {
      const worker = new FakeWorker()
      made.push(worker)
      return worker
    },
  }
}

export function answeringWorkers(): { make: () => WorkerLike; posted: Params[] } {
  const posted: Params[] = []
  return {
    posted,
    make: () => {
      const worker = new FakeWorker()
      worker.postMessage = (message) => {
        if (message.type !== 'generate') return
        posted.push(message.params)
        // On the next task, as a real worker's answer arrives: never inside `request`.
        setTimeout(() => worker.answer(doneMessage(message.params)), 0)
      }
      return worker
    },
  }
}

export function silentQueue(): DocsQueue {
  return createDocsQueue(() => new FakeWorker(), new Map())
}
```

`MessageEvent` exists in Node 22 and in the browser; `ErrorEvent` only in the browser, hence the one cast in the file.

- [ ] **Step 2: Write the failing tests**

Create `apps/lab/src/docs/docsQueue.test.ts`:

```ts
import { defaultParams, type Params } from '@arrowz/engine'
import { boardId } from '@arrowz/engine/command'
import { beforeEach, expect, test } from 'vitest'
import { doneMessage, fakeWorkers } from '../harness/docsWorkers'
import { createDocsQueue, type DocsJob, type DocsRun } from './docsQueue'

const board = (W: number, seed = 7): Params => ({ ...defaultParams(), W, H: W, seed })
const keyOf = (params: Params) => boardId(params)

let workers: ReturnType<typeof fakeWorkers>
let cache: Map<string, DocsRun>
beforeEach(() => {
  workers = fakeWorkers()
  cache = new Map()
})

/** Every state a listener heard, in order. */
function heard(): { states: DocsJob['state'][]; listener: (job: DocsJob) => void } {
  const states: DocsJob['state'][] = []
  return { states, listener: (job) => states.push(job.state) }
}

const generated = (i = 0) =>
  (workers.made[i]?.posted ?? []).flatMap((m) => (m.type === 'generate' ? [m.params.W] : []))

test('one board at a time, in the order they were asked for', () => {
  const queue = createDocsQueue(workers.make, cache)
  const a = board(6)
  const b = board(8)
  queue.request(keyOf(a), a, () => {})
  queue.request(keyOf(b), b, () => {})
  expect(generated()).toEqual([6])
  workers.made[0]?.answer(doneMessage(a))
  expect(generated()).toEqual([6, 8])
})

test('a listener hears waiting or running, then done with the board', () => {
  const queue = createDocsQueue(workers.make, cache)
  const a = board(6)
  const b = board(8)
  const first = heard()
  const second = heard()
  queue.request(keyOf(a), a, first.listener)
  queue.request(keyOf(b), b, second.listener)
  workers.made[0]?.answer(doneMessage(a))
  expect(first.states).toEqual(['running', 'done'])
  expect(second.states).toEqual(['waiting', 'running'])
  expect(queue.cached(keyOf(a))?.board.W).toBe(6)
})

test('a board made this session answers at once, without the worker', () => {
  const queue = createDocsQueue(workers.make, cache)
  const a = board(6)
  queue.request(keyOf(a), a, () => {})
  workers.made[0]?.answer(doneMessage(a))
  const again = heard()
  queue.request(keyOf(a), a, again.listener)
  expect(again.states).toEqual(['done'])
  expect(generated()).toEqual([6])
})

test('withdrawing a waiting request drops it from the queue', () => {
  const queue = createDocsQueue(workers.make, cache)
  const a = board(6)
  const b = board(8)
  const c = board(10)
  queue.request(keyOf(a), a, () => {})
  const withdraw = queue.request(keyOf(b), b, () => {})
  queue.request(keyOf(c), c, () => {})
  withdraw()
  workers.made[0]?.answer(doneMessage(a))
  expect(generated()).toEqual([6, 10])
})

test('withdrawing the running request still keeps its board', () => {
  const queue = createDocsQueue(workers.make, cache)
  const a = board(6)
  const listener = heard()
  const withdraw = queue.request(keyOf(a), a, listener.listener)
  withdraw()
  workers.made[0]?.answer(doneMessage(a))
  expect(listener.states).toEqual(['running'])
  expect(queue.cached(keyOf(a))).toBeDefined()
})

test('two requests for one board share one run', () => {
  const queue = createDocsQueue(workers.make, cache)
  const a = board(6)
  const one = heard()
  const two = heard()
  queue.request(keyOf(a), a, one.listener)
  queue.request(keyOf(a), a, two.listener)
  workers.made[0]?.answer(doneMessage(a))
  expect(generated()).toEqual([6])
  expect(one.states.at(-1)).toBe('done')
  expect(two.states.at(-1)).toBe('done')
})

test('an error fails that board only, the next one runs, and asking again asks the worker again', () => {
  const queue = createDocsQueue(workers.make, cache)
  const a = board(6)
  const b = board(8)
  const failed = heard()
  queue.request(keyOf(a), a, failed.listener)
  queue.request(keyOf(b), b, () => {})
  workers.made[0]?.answer({ type: 'error', message: 'no room' })
  expect(failed.states).toEqual(['running', 'failed'])
  expect(generated()).toEqual([6, 8])
  workers.made[0]?.answer(doneMessage(b))
  queue.request(keyOf(a), a, () => {})
  expect(generated()).toEqual([6, 8, 6])
})

test('a worker that fails to load is replaced on the next request', () => {
  const queue = createDocsQueue(workers.make, cache)
  const a = board(6)
  const failed = heard()
  queue.request(keyOf(a), a, failed.listener)
  workers.made[0]?.fail('could not load')
  expect(failed.states).toEqual(['running', 'failed'])
  expect(workers.made[0]?.terminated).toBe(true)
  queue.request(keyOf(a), a, () => {})
  expect(workers.made).toHaveLength(2)
  expect(generated(1)).toEqual([6])
})

// StrictMode runs every cleanup once on mount: the provider disposes, then
// its boards ask again. A disposed queue must start a fresh worker.
test('dispose stops the worker and forgets the queue, and the queue still works after', () => {
  const queue = createDocsQueue(workers.make, cache)
  const a = board(6)
  const b = board(8)
  const dropped = heard()
  queue.request(keyOf(a), a, dropped.listener)
  queue.request(keyOf(b), b, () => {})
  queue.dispose()
  expect(workers.made[0]?.terminated).toBe(true)
  workers.made[0]?.answer(doneMessage(a))
  expect(dropped.states).toEqual(['running'])
  expect(queue.cached(keyOf(a))).toBeUndefined()
  queue.request(keyOf(b), b, () => {})
  expect(generated(1)).toEqual([8])
})

test('a board that is not complete is kept as it came', () => {
  const queue = createDocsQueue(workers.make, cache)
  const a = board(6)
  queue.request(keyOf(a), a, () => {})
  workers.made[0]?.answer(doneMessage(a, false))
  expect(queue.cached(keyOf(a))?.report.ok).toBe(false)
})
```

```bash
cd apps/lab && pnpm exec vitest run --project node src/docs/docsQueue.test.ts
```

Expected: FAIL — `./docsQueue` does not exist.

- [ ] **Step 3: The queue**

Create `apps/lab/src/docs/docsQueue.ts`:

```ts
/**
 * The Docs tab's boards, generated one at a time on a worker of their own and
 * kept for the session. Apart from the lab's run (`useGenerator`): nothing
 * here touches the store, so a board made on a page neither stops nor
 * replaces the lab's.
 *
 * Requests are served in the order they come, which is the order frames come
 * near the view. One withdrawn before its turn leaves the queue, so a reader
 * who scrolls past a board does not wait behind it; one withdrawn while it
 * runs still finishes into the cache. Two boards with one key share one run.
 *
 * `generate()` is synchronous inside the worker, so a second message would
 * only queue behind the first: the queue posts the next job when the last
 * one answers. `dispose` terminates the worker and forgets every job, and the
 * next request starts a new worker, as StrictMode's remount needs.
 */
import { type BoardData, decodeBoard, type Params, type WorkerIn, type WorkerOut } from '@arrowz/engine'
import type { ReportInput } from '@arrowz/engine/report'

export interface DocsRun {
  readonly board: BoardData
  readonly report: ReportInput
  readonly params: Params
}

export type DocsJob =
  | { readonly state: 'waiting' }
  | { readonly state: 'running' }
  | { readonly state: 'done'; readonly run: DocsRun }
  | { readonly state: 'failed'; readonly message: string }

/** What the queue needs of a `Worker`; the tests hand it a fake. */
export interface WorkerLike {
  postMessage(message: WorkerIn): void
  terminate(): void
  onmessage: ((event: MessageEvent<WorkerOut>) => void) | null
  onerror: ((event: ErrorEvent) => void) | null
}

export interface DocsQueue {
  /** The run this session made for `key`, if it has. */
  cached(key: string): DocsRun | undefined
  /** Asks for a board; the listener hears each state. Returns the withdrawal. */
  request(key: string, params: Params, listener: (job: DocsJob) => void): () => void
  dispose(): void
}

/** The session's finished boards, by `DocsBoardSpec.key`: coming back to a page draws them at once. */
const SESSION = new Map<string, DocsRun>()

interface Job {
  readonly key: string
  readonly params: Params
  readonly listeners: Set<(job: DocsJob) => void>
}

const messageOf = (err: unknown): string => (err instanceof Error ? err.message : String(err))

function reportOf(message: Extract<WorkerOut, { type: 'done' }>): ReportInput {
  const { ok, metrics, stats, pieces, backtracks, restartsUsed, genMs, metricsMs, totalMs, stuck, deadlock, aborted } =
    message
  return { ok, metrics, stats, pieces, backtracks, restartsUsed, genMs, metricsMs, totalMs, stuck, deadlock, aborted }
}

export function createDocsQueue(makeWorker: () => WorkerLike, cache: Map<string, DocsRun> = SESSION): DocsQueue {
  const waiting: Job[] = []
  let running: Job | null = null
  let worker: WorkerLike | null = null

  const tell = (job: Job, state: DocsJob) => {
    for (const listener of [...job.listeners]) listener(state)
  }

  const kill = () => {
    worker?.terminate()
    worker = null
  }

  const finish = (outcome: DocsJob) => {
    const job = running
    running = null
    if (job !== null) {
      if (outcome.state === 'done') cache.set(job.key, outcome.run)
      tell(job, outcome)
    }
    next()
  }

  const ensure = (): WorkerLike => {
    if (worker !== null) return worker
    const made = makeWorker()
    made.onmessage = (event) => {
      // A terminated worker's message can still be queued; it belongs to no job now.
      if (worker !== made || running === null) return
      const message = event.data
      if (message.type === 'error') finish({ state: 'failed', message: message.message })
      if (message.type !== 'done') return
      let board: BoardData
      try {
        board = decodeBoard(message.board)
      } catch (err) {
        finish({ state: 'failed', message: messageOf(err) })
        return
      }
      finish({ state: 'done', run: { board, report: reportOf(message), params: running.params } })
    }
    made.onerror = (event) => {
      if (worker !== made) return
      // Dropped, not kept: a worker that failed to load would take the next job and never answer.
      kill()
      finish({ state: 'failed', message: event.message })
    }
    worker = made
    return made
  }

  const next = () => {
    if (running !== null) return
    const job = waiting.shift()
    if (job === undefined) return
    running = job
    tell(job, { state: 'running' })
    ensure().postMessage({ type: 'generate', params: job.params })
  }

  return {
    cached: (key) => cache.get(key),
    request(key, params, listener) {
      const hit = cache.get(key)
      if (hit !== undefined) {
        listener({ state: 'done', run: hit })
        return () => {}
      }
      const shared = running !== null && running.key === key ? running : waiting.find((job) => job.key === key)
      const job = shared ?? { key, params, listeners: new Set() }
      if (shared === undefined) waiting.push(job)
      job.listeners.add(listener)
      listener({ state: job === running ? 'running' : 'waiting' })
      next()
      return () => {
        job.listeners.delete(listener)
        if (job.listeners.size > 0 || job === running) return
        const at = waiting.indexOf(job)
        if (at >= 0) waiting.splice(at, 1)
      }
    },
    dispose() {
      kill()
      running = null
      waiting.length = 0
    },
  }
}
```

Note `next` is used by `finish` before its `const` line: both are closures called only after `createDocsQueue` returns, so the order of declaration is safe; if the linter objects (`no-use-before-define`), move `next` above `finish` and `ensure` below it, keeping the same bodies.

- [ ] **Step 4: Run them to see them pass**

```bash
cd apps/lab && pnpm exec vitest run --project node src/docs/docsQueue.test.ts && pnpm run check && pnpm run lint
```

Expected: PASS.

- [ ] **Step 5: Commit, then mutate**

```bash
cd apps/lab && pnpm exec prettier --write src/docs/docsQueue.ts src/docs/docsQueue.test.ts src/harness/docsWorkers.ts && cd ../..
git add apps/lab/src/docs/docsQueue.ts apps/lab/src/docs/docsQueue.test.ts apps/lab/src/harness/docsWorkers.ts
git commit -m "lab: the Docs boards' queue, one worker and one board at a time, kept for the session"
```

Mutations, each undone by hand: (a) in the withdrawal, skip the `splice` — "withdrawing a waiting request" fails; (b) in `onerror`, skip `kill()` — "a worker that fails to load" fails; (c) cache `failed` outcomes too — the "asking again" half of the error test fails.

---

### Task 5: The live board — frame, caption, stats, command, and the renderer's `::board` and `:::compare`

**Files:**
- Create: `apps/lab/src/docs/DocsBoards.tsx`, `apps/lab/src/docs/useNear.ts`, `apps/lab/src/docs/DocsBoard.tsx`, `apps/lab/src/docs/DocsBoard.browser.test.tsx`
- Modify: `apps/lab/src/docs/DocsMarkdown.tsx`, `apps/lab/src/routes/DocsBody.tsx`, `apps/lab/src/design/docs.css`, `packages/engine/lab-i18n.ts`

**Interfaces:**
- Consumes: Task 3's `readBoardCmd`, `statKeysOf`, `aboutOf`, `DocsBoardSpec`; Task 4's `createDocsQueue`, `DocsQueue`, `DocsJob`, `DocsRun`, and the harness; `reportRows` (`@arrowz/engine/report`); `boardViewOf`, `ArrowzBoard` (`@arrowz/board-element`); `BoardCanvas`; `CommandText`; `useCopy`; `COMMAND_PREFIX`.
- Produces:
  - `DocsBoards.tsx`: `export function DocsBoardsProvider({ root, queue, children }: { root: RefObject<HTMLElement | null> | null; queue?: DocsQueue; children: ReactNode }): ReactElement`, `export function useDocsBoards(): { queue: DocsQueue; root: RefObject<HTMLElement | null> | null }`.
  - `useNear.ts`: `export const NEAR_MARGIN = '25% 0px'`, `export function useNear(target: RefObject<Element | null>, root: RefObject<HTMLElement | null> | null): boolean`.
  - `DocsBoard.tsx`: `export function DocsBoard(props: { label: readonly PhrasingContent[]; cmd: string; stats: readonly StatKey[]; about: number | null }): ReactElement | null`, `export function DocsCompare({ node }: { node: ContainerDirective }): ReactElement`, `export function BoardView(props: { run: DocsRun; spec: DocsBoardSpec; still: boolean }): ReactElement`, and the `still` prop of the frame, which Task 6 feeds from `useCoarsePointer`.
  - Dictionary keys: `docsBoardGenerate: (s: number) => string`, `docsBoardTryAgain: string`, `docsBoardFailed: (message: string) => string`, `docsBoardCopy: (label: string) => string`.

- [ ] **Step 1: Write the failing tests**

Create `apps/lab/src/docs/DocsBoard.browser.test.tsx`:

```tsx
import type { ArrowzBoard } from '@arrowz/board-element'
import { act } from 'react'
import { MemoryRouter } from 'react-router'
import { afterEach, beforeEach, expect, test, vi } from 'vitest'
import { render } from 'vitest-browser-react'
import { answeringWorkers, doneMessage, fakeWorkers } from '../harness/docsWorkers'
import { useStore } from '../state/store'
import { readBoardCmd } from './boards'
import { DocsBoardsProvider } from './DocsBoards'
import { createDocsQueue, type DocsQueue } from './docsQueue'
import { DocsMarkdown } from './DocsMarkdown'
import { parseDocs } from './markdown'
// The frame takes its size from docs.css; without the sheets it has none.
import '../design/index.css'

beforeEach(() => useStore.getState().lang.setLang('en'))
afterEach(() => vi.restoreAllMocks())

function show(markdown: string, queue: DocsQueue) {
  return render(
    <MemoryRouter initialEntries={['/docs/cli']}>
      <div className="fw-docs-body" style={{ width: '720px' }}>
        <DocsBoardsProvider root={null} queue={queue}>
          <DocsMarkdown root={parseDocs(markdown)} />
        </DocsBoardsProvider>
      </div>
    </MemoryRouter>,
  )
}

const BOARD = '# T\n\n## A {#a}\n\n::board[A small board]{cmd="--width=12 --height=12 --seed=7" stats="pieces avgLen"}'
const element = (container: HTMLElement) => container.querySelector<ArrowzBoard>('arrowz-board')

test('a board is generated, drawn, captioned and measured', async () => {
  const workers = answeringWorkers()
  const screen = await show(BOARD, createDocsQueue(workers.make, new Map()))
  await expect.element(screen.getByRole('figure', { name: 'A small board' })).toBeVisible()
  await expect.poll(() => element(screen.container)?.board?.W).toBe(12)
  const params = readBoardCmd('--width=12 --height=12 --seed=7').spec?.params
  if (params === undefined) throw new Error('the command does not parse')
  const expected = doneMessage(params)
  if (expected.type !== 'done') throw new Error('not a done message')
  const stats = [...screen.container.querySelectorAll('.fw-docs-stats > div')].map((d) => [
    d.querySelector('dt')?.textContent,
    d.querySelector('dd')?.textContent,
  ])
  expect(stats).toEqual([
    ['arrows', String(expected.pieces)],
    ['average length', (144 / expected.pieces).toFixed(1)],
  ])
  expect(screen.container.querySelector('.fw-docs-board pre.fw-cmd')?.textContent).toBe(
    'deno task carve --width=12 --height=12 --seed=7',
  )
  expect(workers.posted).toHaveLength(1)
})
```

Continue the same file with these cases, each with its own fake as named:

```tsx
test('Copy writes the whole command', async () => {
  const write = vi.fn(() => Promise.resolve())
  vi.spyOn(navigator, 'clipboard', 'get').mockReturnValue({ writeText: write } as unknown as Clipboard)
  const screen = await show(BOARD, createDocsQueue(answeringWorkers().make, new Map()))
  await screen.getByRole('button', { name: 'Copy: A small board' }).click()
  expect(write).toHaveBeenLastCalledWith('deno task carve --width=12 --height=12 --seed=7')
})

test('the board looks as its command says, not as the lab is set', async () => {
  useStore.getState().view.setFlag('colored', false)
  const screen = await show(
    '# T\n\n::board[Look]{cmd="--width=12 --height=12 --seed=7 --colored --line=0.9 --pad=2 --sharp"}',
    createDocsQueue(answeringWorkers().make, new Map()),
  )
  await expect.poll(() => element(screen.container)?.board?.W).toBe(12)
  const el = element(screen.container)
  expect(el?.view.colored).toBe(true)
  expect(el?.view.stroke).toBe(0.9)
  expect(el?.view.rounded).toBe(false)
  expect(el?.pad).toBe(2)
  expect(el?.play).toBe(false)
  expect(el?.interactive).toBe(false)
})

test('a manual board waits for its button and promises the seconds', async () => {
  const workers = fakeWorkers()
  const screen = await show(
    '# T\n\n::board[Big]{cmd="--width=600 --height=600 --seed=7" manual about="10"}',
    createDocsQueue(workers.make, new Map()),
  )
  const button = screen.getByRole('button', { name: 'Generate (about 10 s)' })
  await expect.element(button).toBeVisible()
  expect(workers.made).toHaveLength(0)
  await button.click()
  expect(workers.made[0]?.posted.map((m) => m.type)).toEqual(['generate'])
  await expect.element(screen.getByText('Generating…')).toBeVisible()
})

test('a failed board says why and Try again asks again', async () => {
  const workers = fakeWorkers()
  const screen = await show(BOARD, createDocsQueue(workers.make, new Map()))
  await expect.poll(() => workers.made[0]?.posted.length).toBe(1)
  await act(async () => workers.made[0]?.answer({ type: 'error', message: 'no room left' }))
  await expect.element(screen.getByRole('alert')).toHaveTextContent('no room left')
  await screen.getByRole('button', { name: 'Try again' }).click()
  expect(workers.made[0]?.posted.length).toBe(2)
})

test('a board that is not complete says so and draws its empty cells', async () => {
  const workers = fakeWorkers()
  const screen = await show(BOARD, createDocsQueue(workers.make, new Map()))
  await expect.poll(() => workers.made[0]?.posted.length).toBe(1)
  const params = readBoardCmd('--width=12 --height=12 --seed=7').spec?.params
  if (params === undefined) throw new Error('the command does not parse')
  await act(async () => workers.made[0]?.answer(doneMessage(params, false)))
  await expect.element(screen.getByText('Board incomplete.')).toBeVisible()
  expect(element(screen.container)?.view.voids).toBe(true)
})

test('a comparison draws its boards side by side, each with the comparison’s stats', async () => {
  const screen = await show(
    '# T\n\n:::compare{stats="pieces"}\n::board[`--seed=7`]{cmd="--width=12 --height=12 --seed=7"}\n::board[`--seed=8`]{cmd="--width=12 --height=12 --seed=8"}\n:::',
    createDocsQueue(answeringWorkers().make, new Map()),
  )
  await expect.poll(() => screen.container.querySelectorAll('.fw-docs-compare arrowz-board').length).toBe(2)
  const figures = [...screen.container.querySelectorAll('.fw-docs-compare figure')]
  expect(figures.map((f) => f.getAttribute('aria-label'))).toEqual(['--seed=7', '--seed=8'])
  for (const figure of figures) expect(figure.querySelectorAll('.fw-docs-stats dt')).toHaveLength(1)
  const [a, b] = figures.map((f) => f.getBoundingClientRect())
  if (a === undefined || b === undefined) throw new Error('two figures')
  expect(a.top).toBeCloseTo(b.top, 0)
  expect(b.left).toBeGreaterThan(a.right)
})

test('a language switch relabels the stats and asks the worker for nothing', async () => {
  const workers = answeringWorkers()
  const screen = await show(BOARD, createDocsQueue(workers.make, new Map()))
  await expect.poll(() => element(screen.container)?.board?.W).toBe(12)
  await act(async () => useStore.getState().lang.setLang('pl'))
  await expect.poll(() => screen.container.querySelector('.fw-docs-stats dt')?.textContent).toBe('strzałki')
  expect(workers.posted).toHaveLength(1)
})

test('a docs board leaves the lab’s run and result alone', async () => {
  const before = { run: useStore.getState().run, result: useStore.getState().result }
  const screen = await show(BOARD, createDocsQueue(answeringWorkers().make, new Map()))
  await expect.poll(() => element(screen.container)?.board?.W).toBe(12)
  expect(useStore.getState().run).toBe(before.run)
  expect(useStore.getState().result).toBe(before.result)
})

test('leaving the Docs tab terminates the docs worker', async () => {
  const workers = fakeWorkers()
  const screen = await show(BOARD, createDocsQueue(workers.make, new Map()))
  await expect.poll(() => workers.made[0]?.posted.length).toBe(1)
  screen.unmount()
  expect(workers.made[0]?.terminated).toBe(true)
})

test('the frame has the board’s proportions before the board exists', async () => {
  const screen = await show(
    '# T\n\n::board[Tall]{cmd="--width=20 --height=40 --seed=7"}',
    createDocsQueue(fakeWorkers().make, new Map()),
  )
  const frame = screen.container.querySelector<HTMLElement>('.fw-docs-frame')
  if (frame === null) throw new Error('no frame')
  const r = frame.getBoundingClientRect()
  // The default margin is four cells on every side: 28 by 48.
  expect(r.width / r.height).toBeCloseTo(28 / 48, 2)
  expect(element(screen.container)).toBeNull()
})
```

- [ ] **Step 2: Run them to see them fail**

```bash
cd apps/lab && pnpm exec vitest run --project chromium src/docs/DocsBoard.browser.test.tsx
```

Expected: FAIL — `./DocsBoards` does not exist.

- [ ] **Step 3: The dictionary**

In `packages/engine/lab-i18n.ts`, after `docsPlayRestart` in `EN.ui`:

```ts
    docsBoardGenerate: (s: number) => `Generate (about ${s} s)`,
    docsBoardTryAgain: 'Try again',
    docsBoardFailed: (message: string) => `It did not generate: ${message}`,
    docsBoardCopy: (label: string) => `Copy: ${label}`,
```

and after `docsPlayRestart` in `PL.ui`:

```ts
    docsBoardGenerate: (s) => `Generuj (ok. ${s} s)`,
    docsBoardTryAgain: 'Spróbuj jeszcze raz',
    docsBoardFailed: (message) => `Nie wygenerowano: ${message}`,
    docsBoardCopy: (label) => `Kopiuj: ${label}`,
```

```bash
cd packages/engine && deno test -A lab-i18n.test.ts glossary.test.ts && deno task check && cd ../.. && pnpm nx build engine
```

- [ ] **Step 4: The provider and the near-the-view signal**

Create `apps/lab/src/docs/DocsBoards.tsx`:

```tsx
import { createContext, type ReactElement, type ReactNode, type RefObject, useContext, useEffect, useMemo, useState } from 'react'
import { createDocsQueue, type DocsQueue } from './docsQueue'

interface DocsBoardsValue {
  readonly queue: DocsQueue
  /** The box that scrolls, which `useNear` measures against; the viewport when null. */
  readonly root: RefObject<HTMLElement | null> | null
}

const DocsBoardsContext = createContext<DocsBoardsValue | null>(null)

const makeWorker = () => new Worker(new URL('../worker/generate.worker.ts', import.meta.url), { type: 'module' })

/**
 * The Docs pages' boards: one queue and its worker for as long as the Docs
 * tab is open, terminated when it closes. `queue` is a seam for the tests.
 */
export function DocsBoardsProvider({
  root,
  queue,
  children,
}: {
  root: RefObject<HTMLElement | null> | null
  queue?: DocsQueue
  children: ReactNode
}): ReactElement {
  const [own] = useState(() => queue ?? createDocsQueue(makeWorker))
  useEffect(() => () => own.dispose(), [own])
  const value = useMemo(() => ({ queue: own, root }), [own, root])
  return <DocsBoardsContext value={value}>{children}</DocsBoardsContext>
}

export function useDocsBoards(): DocsBoardsValue {
  const value = useContext(DocsBoardsContext)
  if (value === null) throw new Error('a docs board needs a DocsBoardsProvider above it')
  return value
}
```

Create `apps/lab/src/docs/useNear.ts`:

```ts
import { type RefObject, useEffect, useState } from 'react'

/**
 * How far past the panel's top and bottom edges a board counts as near: a
 * quarter of the panel each way. Near, it is generated and mounted; away, it
 * unmounts and gives back its WebGL context, of which a page gets about
 * sixteen. The scroll test holds the count this margin gives.
 */
export const NEAR_MARGIN = '25% 0px'

export function useNear(target: RefObject<Element | null>, root: RefObject<HTMLElement | null> | null): boolean {
  const [near, setNear] = useState(false)
  useEffect(() => {
    const element = target.current
    if (element === null) return
    const observer = new IntersectionObserver(
      (entries) => {
        const last = entries.at(-1)
        if (last !== undefined) setNear(last.isIntersecting)
      },
      { root: root?.current ?? null, rootMargin: NEAR_MARGIN },
    )
    observer.observe(element)
    return () => observer.disconnect()
  }, [target, root])
  return near
}
```

- [ ] **Step 5: The board**

Create `apps/lab/src/docs/DocsBoard.tsx`:

```tsx
/**
 * A live board on a Docs page (`::board`, and each board of a `:::compare`):
 * its command read by the CLI's code, its board generated by the docs' queue
 * when its frame comes near the view, and `<arrowz-board>` mounted only while
 * it is near. The frame takes the board's proportions, margin included,
 * before the board exists, so the page does not move under the reader.
 *
 * The board looks as its command says (`View` from the flags), not as the lab
 * is set; it pans and zooms and does not play. Under it: the label, the
 * report rows the directive names, and the command with Copy.
 */
import { boardViewOf } from '@arrowz/board-element'
import { COMMAND_PREFIX } from '@arrowz/engine/command'
import { reportRows, type StatKey } from '@arrowz/engine/report'
import type { PhrasingContent } from 'mdast'
import type { ContainerDirective } from 'mdast-util-directive'
import { type CSSProperties, type ReactElement, useEffect, useMemo, useRef, useState } from 'react'
import { useDictionary } from '../i18n'
import { CommandText } from '../run/CommandText'
import { useCopy } from '../run/useCopy'
import { BoardCanvas } from '../stage/BoardCanvas'
import { useStore } from '../state/store'
import { aboutOf, type DocsBoardSpec, readBoardCmd, statKeysOf } from './boards'
import { useDocsBoards } from './DocsBoards'
import type { DocsJob, DocsRun } from './docsQueue'
import { Inline } from './Inline'
import { plainText } from './markdown'
import { useNear } from './useNear'

export interface DocsBoardProps {
  readonly label: readonly PhrasingContent[]
  readonly cmd: string
  readonly stats: readonly StatKey[]
  /** The seconds a `manual` board's button promises; null for a board that generates by itself. */
  readonly about: number | null
}

export function DocsBoard({ cmd, ...rest }: DocsBoardProps): ReactElement | null {
  const spec = useMemo(() => readBoardCmd(cmd).spec, [cmd])
  // The content guard refuses a command that does not parse; nothing is drawn for one.
  return spec === null ? null : <LiveBoard spec={spec} {...rest} />
}

export function DocsCompare({ node }: { node: ContainerDirective }): ReactElement {
  const stats = statKeysOf(node.attributes?.['stats'])
  return (
    <div className="fw-docs-compare">
      {node.children.map((child, i) =>
        child.type === 'leafDirective' && child.name === 'board' ? (
          <DocsBoard
            key={i}
            label={child.children}
            cmd={child.attributes?.['cmd'] ?? ''}
            stats={stats}
            about={aboutOf(child.attributes)}
          />
        ) : null,
      )}
    </div>
  )
}

function LiveBoard({
  spec,
  label,
  stats,
  about,
  still = false,
}: Omit<DocsBoardProps, 'cmd'> & { spec: DocsBoardSpec; still?: boolean }): ReactElement {
  const dict = useDictionary()
  const { queue, root } = useDocsBoards()
  const frame = useRef<HTMLDivElement>(null)
  const near = useNear(frame, root)
  const [asked, setAsked] = useState(about === null)
  const [attempt, setAttempt] = useState(0)
  const [job, setJob] = useState<DocsJob>(() => {
    const hit = queue.cached(spec.key)
    return hit === undefined ? { state: 'waiting' } : { state: 'done', run: hit }
  })
  useEffect(() => {
    if (!near || !asked) return
    return queue.request(spec.key, spec.params, setJob)
  }, [near, asked, attempt, queue, spec])
  const run = job.state === 'done' ? job.run : null
  const { W, H } = spec.params
  const pad = spec.view.pad
  const ratio = (W + 2 * pad) / (H + 2 * pad)
  const name = plainText(label)
  return (
    <figure className="fw-docs-board" aria-label={name}>
      <div
        ref={frame}
        className="fw-docs-frame"
        style={{ aspectRatio: `${W + 2 * pad} / ${H + 2 * pad}`, '--ar': String(ratio) } as CSSProperties}
      >
        {near && run !== null ? (
          <BoardView run={run} spec={spec} still={still} />
        ) : !asked ? (
          <button type="button" className="fw-btn" onClick={() => setAsked(true)}>
            {dict.t('docsBoardGenerate', about ?? 0)}
          </button>
        ) : job.state === 'failed' ? (
          <div className="fw-docs-wait">
            <p role="alert">{dict.t('docsBoardFailed', job.message)}</p>
            <button type="button" className="fw-btn" onClick={() => setAttempt((n) => n + 1)}>
              {dict.t('docsBoardTryAgain')}
            </button>
          </div>
        ) : near ? (
          <span className="fw-docs-wait">{dict.t('generating')}</span>
        ) : null}
      </div>
      <figcaption>
        <Inline nodes={label} />
      </figcaption>
      {stats.length > 0 ? <Stats keys={stats} run={run} /> : null}
      {run !== null && !run.report.ok ? <p className="fw-docs-boardnote">{dict.t('notClosedShort')}</p> : null}
      <BoardCommand spec={spec} name={name} />
    </figure>
  )
}

/** The element for a finished board, under the command's look; exported for the still-board test. */
export function BoardView({ run, spec, still }: { run: DocsRun; spec: DocsBoardSpec; still: boolean }): ReactElement {
  const lang = useStore((state) => state.lang.lang)
  const view = spec.view
  // Colours only where the command states them: an empty field would beat the theme (see `BoardFrame`).
  const elementView = useMemo(
    () => ({
      ...boardViewOf(view, !run.report.ok),
      ...(view.palette.length > 0 ? { palette: view.palette } : {}),
      ...(view.paper === '' ? {} : { paper: view.paper }),
      ...(view.ink === '' ? {} : { ink: view.ink }),
      ...(view.highlight === '' ? {} : { highlight: view.highlight }),
    }),
    [view, run],
  )
  return (
    <BoardCanvas
      className={still ? 'still' : undefined}
      board={run.board}
      view={elementView}
      lang={lang}
      enableColors
      theme={view.theme}
      showPoints={view.showPoints}
      pointColor={view.pointColor}
      pointRadius={view.pointRadius}
      pad={view.pad}
    >
      {/* An empty bar in the controls slot: a still board shows no buttons it could not take. */}
      {still ? <span slot="controls" /> : null}
    </BoardCanvas>
  )
}

function Stats({ keys, run }: { keys: readonly StatKey[]; run: DocsRun | null }): ReactElement {
  const dict = useDictionary()
  const rows = run === null ? [] : reportRows(run.report, run.params, dict)
  return (
    <dl className="fw-docs-stats">
      {keys.map((key) => {
        const row = rows.find((r) => r.key === key)
        const value =
          row === undefined
            ? '—'
            : key === 'time'
              ? dict.t('statSumSeconds', ((row.num ?? 0) / 1000).toFixed(2))
              : row.value
        return (
          <div key={key}>
            <dt>{row?.label ?? dict.t(`stat_${key}` as const)}</dt>
            <dd>{value}</dd>
          </div>
        )
      })}
    </dl>
  )
}

function BoardCommand({ spec, name }: { spec: DocsBoardSpec; name: string }): ReactElement {
  const dict = useDictionary()
  const { copied, copy } = useCopy()
  const command = `${COMMAND_PREFIX} ${spec.cmd}`
  return (
    <div className="fw-docs-boardcmd">
      <pre className="fw-cmd">
        <CommandText command={command} />
      </pre>
      <div className="fw-docs-boardacts">
        <button type="button" className="fw-btn" aria-label={dict.t('docsBoardCopy', name)} onClick={() => copy(command)}>
          {copied ? dict.t('copied') : dict.t('copy')}
        </button>
      </div>
    </div>
  )
}
```

If `dict.t(\`stat_${key}\` as const)` does not type-check for every `StatKey` (a `stat_<key>` label missing for one), use `row?.label ?? key` instead and say so in the report.

`BoardCanvas` takes `className` and children as any `@lit/react` component does; if the type check refuses `children`, report it before working around it.

- [ ] **Step 6: The renderer and the panel**

In `apps/lab/src/docs/DocsMarkdown.tsx`, import `DocsBoard`, `DocsCompare` from `./DocsBoard` and `aboutOf`, `statKeysOf` from `./boards`. In `Block`, add before `default`:

```tsx
    case 'containerDirective':
      return node.name === 'compare' ? <DocsCompare node={node} /> : null
```

In `Directive`, before the `help` branch:

```tsx
  if (node.name === 'board')
    return (
      <DocsBoard
        label={node.children}
        cmd={attributes['cmd'] ?? ''}
        stats={statKeysOf(attributes['stats'])}
        about={aboutOf(attributes)}
      />
    )
```

Add `containerDirective` and the board directives to the module header's list.

In `apps/lab/src/routes/DocsBody.tsx`, wrap the grid's page column: `<DocsBoardsProvider root={panel}>` around `<DocsPageView page={page} />` (import from `../docs/DocsBoards`), and add to the JSDoc: "The pages' live boards share one queue while the tab is open (`DocsBoardsProvider`)."

The existing page tests render `DocsPageView` without a provider; until Task 9 no page has a board, so they pass unchanged.

- [ ] **Step 7: The styles**

In `apps/lab/src/design/docs.css`, after the `.fw-docs-playline` rule, add:

```css
/* A live board: the frame keeps the board's proportions (`aspect-ratio` and
   `--ar` from DocsBoard) and is never taller than 60% of the window, so a tall
   board narrows instead of filling the screen. The element fills the frame. */
.fw-docs-board {
  margin: 12px 0 16px;
}
.fw-docs-frame {
  position: relative;
  display: grid;
  place-items: center;
  width: min(100%, calc(60vh * var(--ar)));
  background: var(--graphite);
  box-shadow: 0 0 0 1px var(--border);
}
.fw-docs-frame > arrowz-board {
  position: absolute;
  inset: 0;
  display: block;
}
.fw-docs-wait {
  display: grid;
  gap: 8px;
  justify-items: center;
  padding: 12px;
  font-size: 12px;
  color: var(--mist);
}
.fw-docs-board figcaption {
  margin-top: 6px;
  font-size: 12px;
}
.fw-docs-stats {
  display: flex;
  flex-wrap: wrap;
  gap: 4px 16px;
  margin: 4px 0 0;
  font-size: 12px;
}
.fw-docs-stats div {
  display: flex;
  gap: 6px;
}
.fw-docs-stats dt {
  color: var(--ash);
}
.fw-docs-stats dd {
  margin: 0;
  font-variant-numeric: tabular-nums;
}
.fw-docs-boardnote {
  color: var(--signal);
}
.fw-docs-boardcmd {
  margin-top: 6px;
}
.fw-docs-boardcmd .fw-cmd {
  min-height: 0;
}
.fw-docs-boardacts {
  display: flex;
  gap: 8px;
  margin-top: 6px;
}
/* Boards side by side, as many as fit at 180px and up; one under another on a phone. */
.fw-docs-compare {
  display: grid;
  grid-template-columns: repeat(auto-fit, minmax(180px, 1fr));
  gap: 16px;
  margin: 12px 0 16px;
}
.fw-docs-compare .fw-docs-board {
  margin: 0;
}
```

Use only tokens `docs.css` already uses (`--graphite`, `--border`, `--mist`, `--ash`, `--signal`); if one does not exist, take the nearest that does and say which.

- [ ] **Step 8: Run them to see them pass**

```bash
cd apps/lab && pnpm exec vitest run --project chromium src/docs src/routes
pnpm exec vitest run --project node src/docs
pnpm run check && pnpm run lint
```

Expected: PASS.

- [ ] **Step 9: Commit, then mutate**

```bash
cd packages/engine && deno fmt lab-i18n.ts && cd ../../apps/lab
pnpm exec prettier --write src/docs/DocsBoards.tsx src/docs/useNear.ts src/docs/DocsBoard.tsx src/docs/DocsBoard.browser.test.tsx src/docs/DocsMarkdown.tsx src/routes/DocsBody.tsx src/design/docs.css && cd ../..
git add packages/engine/lab-i18n.ts apps/lab/src/docs/DocsBoards.tsx apps/lab/src/docs/useNear.ts apps/lab/src/docs/DocsBoard.tsx apps/lab/src/docs/DocsBoard.browser.test.tsx apps/lab/src/docs/DocsMarkdown.tsx apps/lab/src/routes/DocsBody.tsx apps/lab/src/design/docs.css
git commit -m "lab: live boards on the Docs pages, generated near the view, with their stats and command"
```

Mutations, each undone by hand: (a) drop `!run.report.ok` from `boardViewOf` — the not-complete case's `voids` assertion fails; (b) let the effect run without `asked` — the manual case fails; (c) build `elementView` from the lab's view slice instead of `spec.view` — the look case fails.

---

### Task 6: The page scrolls, a still board on touch, and the mount budget

**Files:**
- Create: `apps/lab/src/docs/useCoarsePointer.ts`, `apps/lab/src/docs/DocsBoardScroll.browser.test.tsx`
- Modify: `apps/lab/src/docs/DocsBoard.tsx`, `apps/lab/src/design/docs.css`

**Interfaces:**
- Consumes: Task 5's `LiveBoard`, `BoardView`, `DocsBoardsProvider`; the harness's `answeringWorkers`, `doneMessage`.
- Produces: `export function useCoarsePointer(): boolean`; the frame's wheel rule; `.fw-docs-frame > arrowz-board.still { pointer-events: none }`.

- [ ] **Step 1: Write the failing tests**

Create `apps/lab/src/docs/DocsBoardScroll.browser.test.tsx`:

```tsx
import type { ArrowzBoard } from '@arrowz/board-element'
import { useRef } from 'react'
import { MemoryRouter } from 'react-router'
import { beforeEach, expect, test } from 'vitest'
import { page } from 'vitest/browser'
import { render } from 'vitest-browser-react'
import { twoFrames } from '../harness/frames'
import { answeringWorkers, doneMessage } from '../harness/docsWorkers'
import { useStore } from '../state/store'
import { readBoardCmd } from './boards'
import { BoardView } from './DocsBoard'
import { DocsBoardsProvider } from './DocsBoards'
import { createDocsQueue, type DocsQueue } from './docsQueue'
import { DocsMarkdown } from './DocsMarkdown'
import { parseDocs } from './markdown'
import '../design/index.css'

beforeEach(() => useStore.getState().lang.setLang('en'))

/** The panel's stand-in: a box that scrolls, as `.fw-docs` does in the shell. */
function Scrolling({ markdown, queue }: { markdown: string; queue: DocsQueue }) {
  const box = useRef<HTMLDivElement>(null)
  return (
    <div ref={box} data-testid="box" style={{ height: '600px', width: '760px', overflowY: 'auto' }}>
      <div className="fw-docs-body">
        <DocsBoardsProvider root={box} queue={queue}>
          <DocsMarkdown root={parseDocs(markdown)} />
        </DocsBoardsProvider>
      </div>
    </div>
  )
}

const mount = (markdown: string, queue: DocsQueue) =>
  render(
    <MemoryRouter initialEntries={['/docs/cli']}>
      <Scrolling markdown={markdown} queue={queue} />
    </MemoryRouter>,
  )

/** Ten comparisons of three, the CLI page's densest shape, with prose between. */
const THIRTY = Array.from({ length: 10 }, (_, row) => {
  const boards = [0, 1, 2]
    .map((i) => `::board[b${row * 3 + i}]{cmd="--width=20 --height=20 --seed=${row * 3 + i}"}`)
    .join('\n')
  return `Paragraph ${row}.\n\n:::compare{stats="pieces"}\n${boards}\n:::`
}).join('\n\n')

/** The most boards the page may hold at once: well under the browser's sixteen contexts. */
const BUDGET = 12

test('scrolling a page of thirty boards keeps at most twelve and asks once per board', async () => {
  await page.viewport(1280, 800)
  const workers = answeringWorkers()
  const screen = await mount(`# T\n\n## A {#a}\n\n${THIRTY}`, createDocsQueue(workers.make, new Map()))
  const box = screen.container.querySelector<HTMLElement>('[data-testid="box"]')
  if (box === null) throw new Error('no box')
  let most = 0
  for (let top = 0; top <= box.scrollHeight; top += 150) {
    box.scrollTo({ top })
    await twoFrames()
    await new Promise((resolve) => setTimeout(resolve, 20))
    most = Math.max(most, box.querySelectorAll('arrowz-board').length)
  }
  expect(most).toBeGreaterThan(0)
  expect(most).toBeLessThanOrEqual(BUDGET)
  const asked = workers.posted.length
  box.scrollTo({ top: 0 })
  await expect.poll(() => box.querySelector<ArrowzBoard>('figure[aria-label="b0"] arrowz-board')?.board?.W).toBe(20)
  // Coming back draws from the session's boards: not one more request.
  expect(workers.posted.length).toBe(asked)
  expect(new Set(workers.posted.map((p) => p.seed)).size).toBe(workers.posted.length)
}, 60_000)

test('a plain wheel over a board is the page’s, a ⌘/Ctrl wheel is the board’s', async () => {
  await page.viewport(1280, 800)
  const screen = await mount(
    '# T\n\n::board[w]{cmd="--width=20 --height=20 --seed=7"}',
    createDocsQueue(answeringWorkers().make, new Map()),
  )
  const element = screen.container.querySelector<ArrowzBoard>('arrowz-board')
  await expect.poll(() => screen.container.querySelector<ArrowzBoard>('arrowz-board')?.viewport).toBeTruthy()
  const board = screen.container.querySelector<ArrowzBoard>('arrowz-board')
  const canvas = board?.shadowRoot?.querySelector('canvas')
  const before = board?.viewport?.cellPx
  if (board === null || board === undefined || canvas === null || canvas === undefined || before === undefined)
    throw new Error('no drawn board')
  const r = canvas.getBoundingClientRect()
  const wheel = (init: WheelEventInit) =>
    new WheelEvent('wheel', {
      deltaY: -120,
      clientX: r.left + r.width / 2,
      clientY: r.top + r.height / 2,
      bubbles: true,
      composed: true,
      cancelable: true,
      ...init,
    })
  const plain = wheel({})
  canvas.dispatchEvent(plain)
  await twoFrames()
  expect(plain.defaultPrevented).toBe(false)
  expect(board.viewport?.cellPx).toBe(before)
  const zoom = wheel({ ctrlKey: true })
  canvas.dispatchEvent(zoom)
  await twoFrames()
  expect(zoom.defaultPrevented).toBe(true)
  expect(board.viewport?.cellPx).toBeGreaterThan(before)
  expect(element).toBe(board)
})

// The runner cannot emulate a coarse pointer, so the still board is drawn directly.
test('a still board takes no pointer and draws no controls', async () => {
  const spec = readBoardCmd('--width=12 --height=12 --seed=7').spec
  if (spec === null) throw new Error('the command does not parse')
  const message = doneMessage(spec.params)
  if (message.type !== 'done') throw new Error('not done')
  const queue = createDocsQueue(answeringWorkers().make, new Map())
  const run = await new Promise<Parameters<typeof BoardView>[0]['run']>((resolve) =>
    queue.request(spec.key, spec.params, (job) => {
      if (job.state === 'done') resolve(job.run)
    }),
  )
  const screen = await render(
    <div className="fw-docs-frame" style={{ width: '300px', aspectRatio: '1' }}>
      <BoardView run={run} spec={spec} still />
    </div>,
  )
  const board = screen.container.querySelector<ArrowzBoard>('arrowz-board')
  expect(board?.querySelector('[slot="controls"]')).not.toBeNull()
  expect(board === null ? '' : getComputedStyle(board).pointerEvents).toBe('none')
})
```

Remove the unused `element` variable and its last assertion if the linter flags it; it guards that the same element was measured before and after.

- [ ] **Step 2: Run them to see them fail**

```bash
cd apps/lab && pnpm exec vitest run --project chromium src/docs/DocsBoardScroll.browser.test.tsx
```

Expected: the wheel case FAILS (`defaultPrevented` is true, the board zoomed); the still case FAILS (`pointer-events` is `auto`). The scroll case may already pass; if it fails, record the measured `most` and stop: the margin, not the budget, is what to discuss.

- [ ] **Step 3: The wheel, and the coarse pointer**

Create `apps/lab/src/docs/useCoarsePointer.ts`:

```ts
import { useSyncExternalStore } from 'react'

const COARSE = '(pointer: coarse)'

function media(): MediaQueryList | null {
  return typeof window === 'undefined' || typeof window.matchMedia !== 'function' ? null : window.matchMedia(COARSE)
}

function subscribe(onChange: () => void): () => void {
  const list = media()
  list?.addEventListener('change', onChange)
  return () => list?.removeEventListener('change', onChange)
}

/** A finger rather than a mouse: a docs board is then a still picture, and the finger scrolls the page. */
export function useCoarsePointer(): boolean {
  return useSyncExternalStore(subscribe, () => media()?.matches ?? false, () => false)
}
```

In `apps/lab/src/docs/DocsBoard.tsx`: in `DocsBoard`, pass `still={useCoarsePointer()}` to `LiveBoard` (call the hook at the top of `DocsBoard`, before the early return, so hook order never changes), and in `LiveBoard`, after the `useEffect` that requests, add:

```tsx
  useEffect(() => {
    const element = frame.current
    if (element === null) return
    // The element zooms on every wheel turn; on a page of boards a plain wheel
    // scrolls the page instead. Captured here, the board never sees it; with
    // ⌘ or Ctrl (Chromium sends a trackpad pinch that way) it still zooms.
    const pass = (event: WheelEvent) => {
      if (!event.ctrlKey && !event.metaKey) event.stopPropagation()
    }
    element.addEventListener('wheel', pass, { capture: true })
    return () => element.removeEventListener('wheel', pass, { capture: true })
  }, [])
```

In `apps/lab/src/design/docs.css`, after `.fw-docs-frame > arrowz-board`, add:

```css
/* Under a coarse pointer the board is a picture: the finger scrolls the page (DocsBoard). */
.fw-docs-frame > arrowz-board.still {
  pointer-events: none;
}
```

- [ ] **Step 4: Run them to see them pass**

```bash
cd apps/lab && pnpm exec vitest run --project chromium src/docs
pnpm run check && pnpm run lint
```

Expected: PASS. In the scroll test, record the measured `most` in the test's comment over `BUDGET` ("measured: N at 1280×800").

- [ ] **Step 5: Commit, then mutate**

```bash
cd apps/lab && pnpm exec prettier --write src/docs/useCoarsePointer.ts src/docs/DocsBoardScroll.browser.test.tsx src/docs/DocsBoard.tsx src/design/docs.css && cd ../..
git add apps/lab/src/docs/useCoarsePointer.ts apps/lab/src/docs/DocsBoardScroll.browser.test.tsx apps/lab/src/docs/DocsBoard.tsx apps/lab/src/design/docs.css
git commit -m "lab: a Docs board leaves the wheel to the page and is a still picture under a finger"
```

Mutations, each undone by hand: (a) `NEAR_MARGIN = '200% 0px'` — the budget assertion fails (record the count); (b) listen in the bubble phase (`capture: false`) — the wheel case fails; (c) mount the element whatever `near` says — the budget fails.

---

### Task 7: Open in lab

**Files:**
- Create: `apps/lab/src/run/RunControlContext.ts`, `apps/lab/src/docs/OpenInLab.browser.test.tsx`
- Modify: `apps/lab/src/App.tsx`, `apps/lab/src/docs/DocsBoard.tsx`, `packages/engine/lab-i18n.ts`

**Interfaces:**
- Consumes: `loadCommand(deps: CommandDeps, parsed: ParsedArgs)` (`palette/pastedCommand.ts`), `RunControl` (`run/useRun.ts`), `DocsBoardSpec.parsed` (Task 3), `decodeHash` (`state/url.ts`).
- Produces: `export const RunControlContext: Context<RunControl | null>`; the button `Open in lab: <label>` under every docs board; dictionary keys `docsOpenInLab: string`, `docsOpenInLabFor: (label: string) => string`.

- [ ] **Step 1: Write the failing test**

Create `apps/lab/src/docs/OpenInLab.browser.test.tsx`:

```tsx
import { expect, test } from 'vitest'
import { page } from 'vitest/browser'
import { render } from 'vitest-browser-react'
import { App } from '../App'
import { resetApp } from '../harness/mountApp'
import { useStore } from '../state/store'
import { decodeHash } from '../state/url'
import '../design/index.css'

const LABEL = 'Open in lab: A 40 by 40 board'

// The Arrowz page's first board is in view on arrival: no scrolling to reach it.
test('Open in lab lands on the lab with the board’s settings and generates it', async () => {
  await page.viewport(1280, 800)
  resetApp('simple')
  history.replaceState(null, '', '/docs/arrowz')
  const screen = await render(<App />)
  await screen.getByRole('button', { name: LABEL }).click()
  await expect.poll(() => location.pathname).toBe('/')
  const { values } = useStore.getState().params
  expect([values.W, values.H, values.seed]).toEqual([40, 40, 7])
  await expect.poll(() => decodeHash(location.hash)?.params.W).toBe(40)
  await expect.poll(() => useStore.getState().result.shown?.params.W).toBe(40)
}, 40_000)

test('Open in lab waits while a series runs, as the palette row does', async () => {
  await page.viewport(1280, 800)
  resetApp('advanced')
  history.replaceState(null, '', '/docs/arrowz')
  const screen = await render(<App />)
  useStore.setState((state) => ({ series: { ...state.series, phase: 'running' } }))
  await expect.element(screen.getByRole('button', { name: LABEL })).toBeDisabled()
}, 40_000)
```

This test needs the hero board of Task 9. Write it now, run it in Task 9 Step 8; in this task, check the button with a component test instead — add to `DocsBoard.browser.test.tsx`:

```tsx
test('Open in lab loads the command into the lab through the run control', async () => {
  const start = vi.fn()
  const control: RunControl = { start, abort: () => {}, hold: () => {}, checkSeeds: () => {} }
  const screen = await render(
    <MemoryRouter initialEntries={['/docs/cli']}>
      <RunControlContext value={control}>
        <div className="fw-docs-body" style={{ width: '720px' }}>
          <DocsBoardsProvider root={null} queue={createDocsQueue(answeringWorkers().make, new Map())}>
            <DocsMarkdown root={parseDocs(BOARD)} />
          </DocsBoardsProvider>
        </div>
      </RunControlContext>
    </MemoryRouter>,
  )
  await screen.getByRole('button', { name: 'Open in lab: A small board' }).click()
  expect(start).toHaveBeenCalledTimes(1)
  const { values } = useStore.getState().params
  expect([values.W, values.H, values.seed]).toEqual([12, 12, 7])
})

test('without a run control there is no Open in lab', async () => {
  const screen = await show(BOARD, createDocsQueue(answeringWorkers().make, new Map()))
  await expect.element(screen.getByRole('figure', { name: 'A small board' })).toBeVisible()
  expect(screen.container.querySelector('.fw-docs-boardacts button:nth-child(2)')).toBeNull()
})
```

(imports: `RunControl` from `../run/useRun`, `RunControlContext` from `../run/RunControlContext`; `RunControl` is `start`, `abort`, `hold`, `checkSeeds`.)

```bash
cd apps/lab && pnpm exec vitest run --project chromium src/docs/DocsBoard.browser.test.tsx
```

Expected: FAIL — `RunControlContext` does not exist.

- [ ] **Step 2: The context**

Create `apps/lab/src/run/RunControlContext.ts`:

```ts
import { createContext } from 'react'
import type { RunControl } from './useRun'

/** The lab's run, for what renders outside the workspace and still starts one: the Docs boards' Open in lab. */
export const RunControlContext = createContext<RunControl | null>(null)
```

In `apps/lab/src/App.tsx`, in `Shell`'s return, wrap the outer `<div className=…>` in `<RunControlContext value={control}> … </RunControlContext>` (import it from `./run/RunControlContext`).

- [ ] **Step 3: The button**

In `packages/engine/lab-i18n.ts`, beside the Task 5 keys: EN `docsOpenInLab: 'Open in lab',` and `docsOpenInLabFor: (label: string) => \`Open in lab: ${label}\`,`; PL `docsOpenInLab: 'Otwórz w laboratorium',` and `docsOpenInLabFor: (label) => \`Otwórz w laboratorium: ${label}\`,` (the lab's own word, as `loadIntoLab` says it). Then `pnpm nx build engine`.

In `apps/lab/src/docs/DocsBoard.tsx`, in `BoardCommand`, add:

```tsx
  const control = useContext(RunControlContext)
  const navigate = useNavigate()
  const seriesRunning = useStore((state) => state.series.phase === 'running')
```

and after the Copy button:

```tsx
        {control === null ? null : (
          <button
            type="button"
            className="fw-btn"
            aria-label={dict.t('docsOpenInLabFor', name)}
            disabled={seriesRunning}
            onClick={() => loadCommand({ control, navigate: (path) => void navigate(path), dict }, spec.parsed)}
          >
            {dict.t('docsOpenInLab')}
          </button>
        )}
```

(imports: `useContext` from react, `useNavigate` from react-router, `loadCommand` from `../palette/pastedCommand`, `RunControlContext` from `../run/RunControlContext`). Add a sentence to the module header: "Open in lab is what pasting the command into ⌘K does (`loadCommand`)."

- [ ] **Step 4: Run them to see them pass**

```bash
cd apps/lab && pnpm exec vitest run --project chromium src/docs/DocsBoard.browser.test.tsx src/palette src/routes
pnpm run check && pnpm run lint
```

Expected: PASS (the App-level `OpenInLab.browser.test.tsx` waits for Task 9).

- [ ] **Step 5: Commit**

```bash
cd packages/engine && deno fmt lab-i18n.ts && cd ../../apps/lab
pnpm exec prettier --write src/run/RunControlContext.ts src/App.tsx src/docs/DocsBoard.tsx src/docs/DocsBoard.browser.test.tsx src/docs/OpenInLab.browser.test.tsx && cd ../..
git add packages/engine/lab-i18n.ts apps/lab/src/run/RunControlContext.ts apps/lab/src/App.tsx apps/lab/src/docs/DocsBoard.tsx apps/lab/src/docs/DocsBoard.browser.test.tsx apps/lab/src/docs/OpenInLab.browser.test.tsx
git commit -m "lab: Open in lab under every Docs board, as pasting its command into the palette"
```

Mutation, undone by hand: pass `drawOf(spec.parsed, Math.random).params` straight to `params.setMany` and skip `control.start()` — the component test's `start` assertion fails.

---

### Task 8: Jev reads the CLI page whole, and says where

**Files:**
- Modify: `packages/cli/scripts/jev-docs.ts`, `packages/cli/scripts/jev-docs.test.ts`, `packages/cli/scripts/jev-ci.ts`, `packages/cli/scripts/jev-ci.test.ts`

**Interfaces:**
- Consumes: `docsFor(lang).env` (Task 1).
- Produces: `proseBlocks` and `sectionProse` that read a GFM table's rows as prose (the separator row left out), split a note at a `>` line, know `~~~` fences, and count heading text as prose; `where` repo-relative (`apps/lab/docs-content/en/cli.md:12`, `packages/engine/lab-docs.ts env.CARVE_TRACE`); `export function docsFinding(flag: Flag): Finding` in `jev-ci.ts`.

- [ ] **Step 1: Write the failing tests**

In `packages/cli/scripts/jev-docs.test.ts`, add:

```ts
Deno.test('proseBlocks reads a table row as prose and skips its separator', () => {
  const md = '# T\n\n| Flag | Does |\n|---|---|\n| `--only` | one level only |\n'
  assertEquals(proseBlocks(md).map((b) => b.text), ['T', 'Flag · Does', '`--only` · one level only'])
})

Deno.test('proseBlocks splits a note at its blank > line', () => {
  const md = '> First paragraph.\n>\n> Second paragraph.\n'
  assertEquals(proseBlocks(md).map((b) => b.text), ['First paragraph.', 'Second paragraph.'])
})

Deno.test('proseBlocks knows ~~~ fences', () => {
  const md = 'Before.\n\n~~~text\nnot prose\n~~~\n\nAfter.\n'
  assertEquals(proseBlocks(md).map((b) => b.text), ['Before.', 'After.'])
})

Deno.test('sectionProse counts the heading as prose of its section', () => {
  const sections = sectionProse('# Title\n\n## Part {#part}\n\nText.\n')
  assertEquals(sections.get('lead'), 'Title\n')
  assertEquals(sections.get('part'), 'Part\nText.\n')
})

Deno.test('a section only one language has is compared with nothing', async () => {
  const { judge, calls } = stubJudge(() => quiet)
  await checkDocs(judge, { page: 'cli', en: '# T\n', pl: '# T\n\n## Tylko {#only}\n\nTekst.\n', source: 'README' })
  assert(calls.some((c) => c.key === 'apps/lab/docs-content/pl/cli.md #only' && c.en === ''))
})

Deno.test('checkDocs reads the env descriptions with the CLI page, and says where from the repository root', async () => {
  const { judge, calls } = stubJudge(() => quiet)
  await checkDocs(judge, { page: 'cli', en: PAGE, pl: PAGE, source: 'README' })
  assert(calls.some((c) => c.key === 'packages/engine/lab-docs.ts env.CARVE_TRACE'))
})
```

(`stubJudge`, `quiet` and `PAGE` are the file's own helpers; if `proseBlocks` keeps headings out today, the first test's `'T'` shows the change — headings become prose blocks.) Update the existing `'proseBlocks keeps prose only…'`, `'sectionProse groups…'` and `where`-matching expectations to the new behaviour: headings included, `where` repo-relative; and in `'docsPagesOf names the pages a change touches'` keep `['cli', 'element', 'lab']` (the env descriptions now make `lab-docs.ts` touch the CLI page too).

In `packages/cli/scripts/jev-ci.test.ts`, add:

```ts
Deno.test('a docs finding carries its file and line when its where has them', () => {
  const flag = { where: 'apps/lab/docs-content/en/cli.md:12', question: 'history', p: 0.9, excerpt: 'x' }
  assertEquals(docsFinding(flag), { flag, file: 'apps/lab/docs-content/en/cli.md', line: 12 })
  const pair = { ...flag, where: 'apps/lab/docs-content/pl/cli.md #knobs' }
  assertEquals(docsFinding(pair), { flag: pair, file: 'apps/lab/docs-content/pl/cli.md' })
  const row = { ...flag, where: 'packages/engine/lab-docs.ts env.CARVE_TRACE' }
  assertEquals(docsFinding(row), { flag: row, file: 'packages/engine/lab-docs.ts' })
})
```

```bash
cd packages/cli && deno test -A scripts/jev-docs.test.ts scripts/jev-ci.test.ts
```

Expected: FAIL.

- [ ] **Step 2: Implement**

In `packages/cli/scripts/jev-docs.ts`:
- `DESCRIPTION_GROUPS` gains `cli: ['env']`.
- `proseBlocks`: a fence is a line starting with ```` ``` ```` or `~~~` (track which one opened it, and close only on the same); a line that is `>` or `> ` alone flushes; a line starting with `|` is a table row: a separator row (`/^\|[\s:|-]+\|?\s*$/`) is skipped, any other row is its own block, its cells trimmed and joined with ` · `; a heading line (`#`, `##`, `###`) is its own block, its text without the `#`s and without a trailing `{#id}`. Directive lines (`::`, `:::`) stay out.
- `sectionProse`: the same fence rule; a `##` line starts its section and adds its title (without `{#id}`) as the section's first line; a `#` or `###` line adds its text to the current section; table rows as in `proseBlocks`.
- `checkDocs`: `const file = (lang: string) => \`apps/lab/docs-content/${lang}/${input.page}.md\``; description rows are `where: \`packages/engine/lab-docs.ts ${row.key}\``; the pairs walk the union of both languages' section ids, EN order first, then any id only Polish has, with `''` for the missing side.

In `packages/cli/scripts/jev-ci.ts`, add and export:

```ts
/** A docs flag's `where` as a file and a line: `path:line`, `path #section` or `path key`. */
export function docsFinding(flag: Flag): Finding {
  const line = /^(\S+):(\d+)$/.exec(flag.where)
  if (line?.[1] !== undefined && line[2] !== undefined) return { flag, file: line[1], line: Number(line[2]) }
  const file = /^(\S+\.(?:md|ts))\s/.exec(flag.where)?.[1]
  return file === undefined ? { flag } : { flag, file }
}
```

and in the docs loop replace `findings.push({ flag })` with `findings.push(docsFinding(flag))`.

```bash
cd packages/cli && deno test -A scripts && deno task check && deno task lint
```

Expected: PASS.

- [ ] **Step 3: Commit**

```bash
deno fmt packages/cli/scripts/jev-docs.ts packages/cli/scripts/jev-docs.test.ts packages/cli/scripts/jev-ci.ts packages/cli/scripts/jev-ci.test.ts
git add packages/cli/scripts/jev-docs.ts packages/cli/scripts/jev-docs.test.ts packages/cli/scripts/jev-ci.ts packages/cli/scripts/jev-ci.test.ts
git commit -m "cli: Jev reads docs tables, notes, headings and ~~~ fences, and its CI findings point at their line"
```

---

### Task 9: The command-line page, and the Arrowz page's two pictures

**Files:**
- Modify: `apps/lab/docs-content/en/cli.md`, `apps/lab/docs-content/pl/cli.md`, `apps/lab/docs-content/en/arrowz.md`, `apps/lab/docs-content/pl/arrowz.md`
- Test: `apps/lab/src/docs/CliPage.browser.test.tsx` (rewritten), `apps/lab/src/docs/ArrowzPage.browser.test.tsx`, `apps/lab/src/routes/DocsLayout.browser.test.tsx`, `apps/lab/src/routes/DocsNav.browser.test.tsx`, `apps/lab/src/docs/OpenInLab.browser.test.tsx` (Task 7, first run)

**Interfaces:**
- Consumes: every directive and table of Tasks 2–7; `silentQueue` (Task 4) for tests that look at the prose only.
- Produces: `/docs/cli` with sections `start`, `making`, `everyday`, `knobs`, `saved`, `env`, `standalone`, `trouble`, `words`, `help`, in that order; `#knobs` keeps its id (the Arrowz and Lab pages link to it).

- [ ] **Step 1: Write the failing tests**

Rewrite `apps/lab/src/docs/CliPage.browser.test.tsx`:

```tsx
import { helpText } from '@arrowz/engine/command'
import { act } from 'react'
import { MemoryRouter } from 'react-router'
import { afterEach, beforeEach, expect, test, vi } from 'vitest'
import { render } from 'vitest-browser-react'
import { silentQueue } from '../harness/docsWorkers'
import { useStore } from '../state/store'
import { DocsBoardsProvider } from './DocsBoards'
import { DocsPageView } from './DocsPageView'
// A component test loads no stylesheet of its own; without the cascade the
// overflow assertion below reads `visible`.
import '../design/index.css'

beforeEach(() => useStore.getState().lang.setLang('en'))
afterEach(() => vi.restoreAllMocks())

// The page's prose and tables only: its boards wait on a worker that never answers.
const mount = () =>
  render(
    <MemoryRouter initialEntries={['/docs/cli']}>
      <div className="fw-docs-body">
        <DocsBoardsProvider root={null} queue={silentQueue()}>
          <DocsPageView page="cli" />
        </DocsBoardsProvider>
      </div>
    </MemoryRouter>,
  )

const SECTIONS = ['start', 'making', 'everyday', 'knobs', 'saved', 'env', 'standalone', 'trouble', 'words', 'help']

test('the page has its ten sections, in order', async () => {
  const screen = await mount()
  expect([...screen.container.querySelectorAll('h3')].map((h) => h.id)).toEqual(SECTIONS.map((id) => `docs-${id}`))
})

test('the knob, rule and environment tables are on the page', async () => {
  const screen = await mount()
  for (const id of ['knobs', 'env'])
    expect(screen.container.querySelector(`table[aria-labelledby="docs-${id}"]`), id).not.toBeNull()
  expect(screen.container.querySelectorAll('table[aria-labelledby="docs-knobs"]')).toHaveLength(2)
})

/** The two help blocks: the terminal blocks that start as `--help` does. */
const helpBlocks = (container: HTMLElement) =>
  [...container.querySelectorAll('pre.fw-docs-term')].filter((pre) => pre.textContent?.startsWith('Usage:'))

test('both help forms are on the page, uncoloured, the knob table scrolling by itself', async () => {
  const screen = await mount()
  const blocks = helpBlocks(screen.container)
  expect(blocks.map((b) => b.textContent)).toEqual([helpText(), helpText({ knobs: true })])
  for (const block of blocks) expect(block.querySelectorAll('[class^="tk-"]')).toHaveLength(0)
  const knobs = blocks[1]
  if (knobs === undefined) throw new Error('the knob block is not on the page')
  expect(getComputedStyle(knobs).overflowX).toBe('auto')
  expect(knobs.scrollWidth).toBeGreaterThan(knobs.clientWidth)
})

test('each help block copies its own text', async () => {
  const write = vi.fn(() => Promise.resolve())
  vi.spyOn(navigator, 'clipboard', 'get').mockReturnValue({ writeText: write } as unknown as Clipboard)
  const screen = await mount()
  await screen.getByRole('button', { name: 'Copy: --help=knobs' }).click()
  expect(write).toHaveBeenLastCalledWith(helpText({ knobs: true }))
  await screen.getByRole('button', { name: 'Copy: --help', exact: true }).click()
  expect(write).toHaveBeenLastCalledWith(helpText())
})

test('every board on the page is a figure with its command under it', async () => {
  const screen = await mount()
  const figures = [...screen.container.querySelectorAll('figure.fw-docs-board')]
  // One under the dry run, twenty-nine in the comparisons.
  expect(figures).toHaveLength(30)
  for (const figure of figures)
    expect(figure.querySelector('pre.fw-cmd')?.textContent, figure.getAttribute('aria-label') ?? '').toMatch(
      /^deno task carve --width=\d+ --height=\d+/,
    )
})

test('in Polish the frame speaks Polish and the help does not', async () => {
  const screen = await mount()
  await act(async () => useStore.getState().lang.setLang('pl'))
  await expect.poll(() => screen.container.querySelector('#docs-knobs')?.textContent).toBe('Wszystkie pokrętła')
  expect(helpBlocks(screen.container)[0]?.textContent).toBe(helpText())
})
```

In `apps/lab/src/docs/ArrowzPage.browser.test.tsx`: wrap `mount`'s page in `<DocsBoardsProvider root={null} queue={silentQueue()}>`; in `'the rule is played on its three boards…'` change `figures(screen.container)` to read only `figure.fw-docs-play` (`[...container.querySelectorAll('figure.fw-docs-play')]`), and add:

```tsx
test('the page shows the README’s two pictures as live boards', async () => {
  const screen = await mount()
  expect(
    [...screen.container.querySelectorAll('figure.fw-docs-board')].map((f) => f.getAttribute('aria-label')),
  ).toEqual(['A 40 by 40 board', 'A small board, each arrow in its own colour'])
})
```

In `apps/lab/src/routes/DocsLayout.browser.test.tsx`:
- in `openDocs`, the markers become `arrowz: ['.fw-docs-body arrowz-board[play]', 3]` and `cli: ['#docs-help', 1]`; update the comment above them ("the CLI page its help section");
- in `'at 1280×800 the CLI help scrolls sideways inside its own block'`, select the two help blocks as `CliPage.browser.test.tsx`'s `helpBlocks` does (copy the helper);
- in `'a section of the other page opens that page at its heading'`, replace the poll on `pre.fw-docs-term` with `await expect.poll(() => screen.container.querySelector('#docs-knobs')).not.toBeNull()`;
- in the eight-width loop, the markers become `arrowz: '.fw-docs-body arrowz-board[play]'` and `cli: '#docs-help'`.

In `apps/lab/src/routes/DocsNav.browser.test.tsx`, replace the CLI group of the column with the ten section titles of the English page (`Getting started`, `Making boards`, `Everyday settings`, `Every knob`, `Where boards are saved`, `Environment variables`, `A standalone program`, `When something goes wrong`, `Words`, `What --help prints`), each with `'/docs/cli'`.

```bash
cd apps/lab && pnpm exec vitest run --project chromium src/docs/CliPage.browser.test.tsx src/docs/ArrowzPage.browser.test.tsx src/routes/DocsNav.browser.test.tsx
```

Expected: FAIL — the page has two sections.

- [ ] **Step 2: The English CLI page**

Replace `apps/lab/docs-content/en/cli.md` with:

````md
# The command line

The command line makes boards. `deno task carve` lays a board and saves it, `deno task report` measures the generator over many boards, and `deno task compile` builds the command as one program that runs on its own. Every command on this page runs from the repository's root folder.

The boards on this page are made in your browser, by the generator the command runs, from the command printed under each one. **Open in lab** opens that command in the lab.

## Getting started {#start}

The command line needs [Deno](https://deno.com/) 2.9 or newer, and nothing else:

```sh
curl -fsSL https://deno.land/install.sh | sh     # macOS and Linux
irm https://deno.land/install.ps1 | iex          # Windows (PowerShell)
```

Get the code and make a first board, from inside the `arrowz` folder:

```sh
git clone https://github.com/Fronthub-pl/arrowz.git
cd arrowz
deno task carve --width=25 --height=25 --svg
```

The board lands in `packages/cli/boards/25x25/`: the board file a game reads (`.board.json`), a note on how it was made (`.json`) and, because of `--svg`, a picture to open in a browser.

## Making boards {#making}

Everything runs through the `carve` task. The everyday flags and the knobs stand side by side on one command line, and no flag changes what another one means. The command prints its own instructions; both forms are at the end of this page, under [What `--help` prints](docs:cli#help).

```sh
deno task carve --help          # the short form: everyday flags, output, picture (-h too)
deno task carve --help=knobs    # the full table: every knob, its range and default
```

### A board

```sh
deno task carve --width=40 --height=40 --seed=7
```

This writes two files into `packages/cli/boards/40x40/`, both named `sha256-…` after the arrows on the board:

- `….board.json` — the board: every arrow, cell by cell, packed small. This is the file a game loads.
- `….json` — a small text file recording how the board was made.

The name comes from the arrows, not from the settings. Another seed, or other settings that happen to lay the very same arrows, land in the same files, and the small file lists every command that made them. So "has this board been made before?" is the same question as "is its file there?".

### A picture as well

```sh
deno task carve --width=40 --height=40 --svg
deno task carve --width=40 --height=40 --svg=my-board.svg
```

`--svg` adds a picture, `….svg`, next to the board file. `--svg=my-board.svg` does the same and also drops a copy at `my-board.svg`.

### Five things to try

Copy any of these. Each one saves a board into `packages/cli/boards/`; add `--svg` to get a picture as well, or `--dry-run` to see the numbers without writing a file. Every flag here is explained under [Everyday settings](docs:cli#everyday).

```sh
# small enough to follow every arrow by eye
deno task carve --width=12 --height=12 --colored

# a dense field of tiny arrows
deno task carve --width=40 --height=40 --length=0 --colored

# a few long snakes instead
deno task carve --width=40 --height=40 --length=1 --winding=0 --colored

# a skeleton of very long arrows crossing the whole board
deno task carve --width=80 --height=80 --skeleton --colored

# a tall board, which is harder to play than a square one
deno task carve --width=40 --height=80
```

### Many boards at once

```sh
deno task carve --width=100 --height=200 --seed=1 --count=50
```

This makes 50 different boards, on the seeds 1, 2, 3 and so on. A seed whose board is not complete is skipped and not saved, and so is a seed that lays a board already in the store — its command is added to that board's file instead — and the next seed is tried, until there are 50. After twice as many seeds as boards it gives up; `--max-seeds=200` moves that limit. The last line says how many boards were written, which seeds were skipped, and why. The same command always makes the same boards.

### Describing a board without saving it

```sh
deno task carve --width=30 --height=30 --seed=7 --dry-run
```

This builds the board, writes nothing, and prints one line describing it, in a format meant for programs rather than people. Trimmed to the interesting parts:

```json
{
  "W": 30,
  "H": 30,
  "seed": 7,
  "ok": true,
  "pieces": 87,
  "avgLen": 10.34,
  "maxLen": 44,
  "solvable": true,
  "genMs": 11,
  "pinned": [],
  "command": "deno task carve --width=30 --height=30 --seed=7"
}
```

Read it as: `ok` says the board is complete, `pieces` is how many arrows it holds, `avgLen` and `maxLen` are the average and the longest arrow in cells, `solvable` says the puzzle has a solution, and `genMs` is how many milliseconds it took. `command` makes the same board again. `pinned` lists the knobs you named yourself — none here; see [Every knob](docs:cli#knobs). Here is that board, measured just now:

::board[The board this command describes]{cmd="--width=30 --height=30 --seed=7" stats="pieces avgLen longest time"}

This is the fastest way to try a setting: you see how many arrows you get and how long it took, without a single file on disk.

### A board that is not complete

Rarely, at large sizes, the generator gives up before every cell is covered. The board is saved all the same, the description says `"ok": false`, and the command ends with status code 1, so that a script notices. Add `--svg` and the picture shows the uncovered cells tinted pink. A run that takes too long can be cut short:

```sh
CARVE_TIMEOUT_S=60 deno task carve --width=1000 --height=1000
```

That stops after a minute and saves whatever was laid by then, marked `"aborted": true`.

### The measurements report

```sh
deno task report --only=easy --square --runs=1
```

`deno task report` builds boards at chosen sizes and prints a page of measurements about them. It is a tool for tuning the generator; you do not need it to make boards. Its output starts like this:

```text
--- Easy 25x25 (1 runs) ---
  coverage      100.00%   solvable: YES
  pieces        72   length 2..42
  length dist.  2-6: 63%  7-15: 22%  16-49: 15%  50+: 0.0%
  ...
  time          generation 22 ms, metrics 2 ms
```

The two lines worth knowing: `coverage 100.00%` means no cell was left uncovered, and `solvable: YES` means the puzzle can be finished.

With no `--only` it walks through every difficulty level in turn, up to 1000×1000, which takes a long time. It takes the knobs `carve` takes, and these flags of its own:

| Flag | What it does |
| --- | --- |
| `--only=NAME` | one level only, by its name as the report prints it (`easy·sq`, `hard·pt`, …) |
| `--square` | square boards only; `easy` then names the square one |
| `--portrait` | portrait boards, twice as tall as wide, only |
| `--mid=N` | adds an N×N level between the fixed ones, for finding where boards stop being complete |
| `--runs=N` | boards per level, 3 by default |
| `--show` | prints, as text, the first board of each level at most 40 cells wide |
| `--bench=N` | measures speed instead: N runs per level, with timing statistics |

### Asking for something impossible

The generator refuses settings it knows will not work before it starts, not after ten minutes of trying:

```sh
deno task carve --width=30 --height=30 --pstraight=0.2 --svg=/tmp/x.svg
```

```text
invalid arguments:
  - --pstraight=0.2 is outside 0.6..1
see --help
```

The command ends with status code 2. A status code is the number a program leaves behind when it finishes, and scripts read it to learn how things went: 0 means everything went fine, 1 that the generator gave up, and 2 that you asked for something out of range.

## Everyday settings {#everyday}

The everyday flags are the ones you reach for first: the size, the seed, and four that change the puzzle. The picture flags after them change nothing about the puzzle, only how it is drawn.

### Size — `--width` and `--height`

How many cells across and down. Both are required, each anything from 4 to 1000. A 400×400 board is ready in under two seconds; 1000×1000 takes about ten. A tall board is harder to play than a square one with the same number of cells, because arrows have further to travel.

:::compare
::board[`--width=20 --height=40`]{cmd="--width=20 --height=40 --seed=7"}
::board[`--width=100 --height=100`]{cmd="--width=100 --height=100 --seed=7"}
:::

### How big a board can get

The ceiling is 1000×1000, a million cells. Past about two hundred cells a side the arrows stop being visible one by one at this size, and the board turns into fabric. Zoom into one — ⌘ or Ctrl with the wheel, or the buttons in its corner — and the puzzle is the same as on a small board. The million-cell board takes about ten seconds, so it waits for its button.

:::compare{stats="pieces avgLen longest time"}
::board[200×200]{cmd="--width=200 --height=200 --seed=7"}
::board[500×500]{cmd="--width=500 --height=500 --seed=7"}
::board[1000×1000]{cmd="--width=1000 --height=1000 --seed=7" manual about="10"}
:::

The average arrow barely grows with the board, so a bigger board buys you more arrows rather than longer ones. The single longest arrow does grow.

### Seed — `--seed`

A number from 0 to 4294967295 that picks which board you get. With everything else unchanged, the same seed always gives the same board, and a different seed a different board of the same character. Default: 7.

:::compare
::board[`--seed=7`]{cmd="--width=20 --height=20 --seed=7"}
::board[`--seed=42`]{cmd="--width=20 --height=20 --seed=42"}
:::

### Arrow length — `--length`

A value from 0 to 1. Default: `0.75`. Turn it **down** and the board fills with short arrows: many of them, each with its own arrowhead, packed together like a field of little hooks. Turn it **up** and the board is made of a few long snakes, their arrowheads few and far between. On a 30×30 board with seed 7:

:::compare{stats="pieces avgLen"}
::board[`--length=0`]{cmd="--width=30 --height=30 --seed=7 --length=0 --colored"}
::board[default (`0.75`)]{cmd="--width=30 --height=30 --seed=7 --colored"}
::board[`--length=1`]{cmd="--width=30 --height=30 --seed=7 --length=1 --colored"}
:::

More arrows is not automatically harder; it is a different kind of hard. Short arrows give you many things to look at; long arrows give you fewer, but each one reaches further and blocks more.

### Winding — `--winding`

A value from 0 to 1. Default: `0.5`. It sets how eagerly an arrow keeps going straight instead of turning: `0` is the straightest a board gets, `1` the most winding. Turn it **down** and arrows run in long straight strokes; turn it **up** and they wriggle, turning every few cells and worming into small nooks.

:::compare{stats="pieces bends"}
::board[`--winding=0`]{cmd="--width=30 --height=30 --seed=7 --winding=0 --colored"}
::board[default (`0.5`)]{cmd="--width=30 --height=30 --seed=7 --colored"}
::board[`--winding=1`]{cmd="--width=30 --height=30 --seed=7 --winding=1 --colored"}
:::

Pushing it to either end gives _fewer_ arrows than the middle: straight arrows run further before they stop, and winding arrows take more cells each while they fill the corners. The busiest boards are the ones in between.

### Skeleton — `--skeleton`

An on/off switch, off by default. Switched on, the generator first lays a handful of very long arrows, the skeleton, snaking back and forth across the whole board, then fills the channels between them with ordinary arrows. It is the only way to get really long arrows: left to itself, the generator rarely makes one that crosses the whole board.

:::compare{stats="pieces longest"}
::board[without]{cmd="--width=60 --height=60 --seed=7 --colored"}
::board[`--skeleton`]{cmd="--width=60 --height=60 --seed=7 --skeleton --colored"}
:::

### Fresh luck every time — `--randomized`

Normally a value of `--length` or `--winding` means one exact set of knobs. With `--randomized` each value stands for a range, and the generator draws a fresh set from inside it on every run, so the same seed gives a different board every time: the extra roll of the dice is not decided by the seed. Nothing is lost. The settings actually drawn are written into the board's file as a full command, so any board you like can be made again exactly.

```sh
deno task carve --width=40 --height=40 --randomized
```

Naming a knob beside `--randomized` pins that one knob and leaves the rest still drawn; see [Every knob](docs:cli#knobs).

### How the picture is drawn

These flags change nothing about the puzzle, only how it looks. The boards on this page draw them as the command line does, apart from `--cell`: a board here fits its frame and zooms.

**`--colored`** gives every arrow its own colour: no help for playing, a great help for understanding. The comparisons on this page use it.

:::compare
::board[normal]{cmd="--width=20 --height=20 --seed=7"}
::board[`--colored`]{cmd="--width=20 --height=20 --seed=7 --colored"}
:::

**`--line`** is how thick the lines are, as a share of one cell. Default `0.5`: a line fills half its cell.

:::compare
::board[`--line=0.2`]{cmd="--width=20 --height=20 --seed=7 --line=0.2"}
::board[`--line=0.9`]{cmd="--width=20 --height=20 --seed=7 --line=0.9"}
:::

Look at the arrowheads. On a thin line the arrowhead is a proper triangle, wider than the line. Once the line gets thick there is no room for a wider triangle, so the arrowhead becomes a sharpened point.

**`--arrow-width`** and **`--arrow-height`** size the arrowheads by hand, in cells, and they behave differently. `--arrow-width` defaults to `auto`, worked out from the line's thickness; a number is a width in cells. `--arrow-height` has no automatic mode: it is always taken as written, and defaults to `1`, one whole cell. `--arrow-height=0` gives an arrowhead of no height at all.

:::compare
::board[`--arrow-width=0.6 --arrow-height=0.6`]{cmd="--width=20 --height=20 --seed=7 --arrow-width=0.6 --arrow-height=0.6"}
::board[`--arrow-width=0.9 --arrow-height=1.2`]{cmd="--width=20 --height=20 --seed=7 --arrow-width=0.9 --arrow-height=1.2"}
:::

**`--sharp`** takes the rounding off: a line turns its corners at an angle instead of in a curve, and its blunt end is square instead of a rounded cap.

**`--theme`** paints the board in one of the lab's twelve colour themes (`--theme=gruvbox-dark`, `--theme=catppuccin-latte`, …); an unknown name is refused with the list. **`--paper`**, **`--ink`** and **`--highlight-color`** each set one colour as `#rrggbb` — the background, the arrows, and the arrows `--top` marks — and win over the theme's. **`--palette`** gives the arrow colours for `--colored`, up to eight, separated by commas.

**`--pad`** is the margin around the board, in cells, from 0 to 16 (default 4, as the lab draws it). **`--points`** puts a dot in the middle of every cell, the lab's dot grid; **`--point-color`** and **`--point-radius`** (in cells, up to 0.5) change the dot.

**`--cell`** is the size of one cell in the picture, in pixels, from 1 to 200; left out, it is worked out so that the longer side comes to about 1600 pixels. **`--top`** marks the N longest arrows (up to 1000) in the highlight colour and prints their measurements under the summary.

The lab's live command carries all of these, so copying it makes the picture the lab exports.

## Every knob {#knobs}

The everyday flags are shortcuts. Behind each of them sit several knobs, and you can set any knob directly, on the same command line as the everyday flags. Turning `--length` down, for instance, really means "raise the share of short arrows and lower the share of medium ones": two knobs at once.

You do not need this section to use the command line. It is here because "what does this knob actually do?" deserves an answer.

```sh
deno task carve --width=40 --height=40 --seed=7 --pstraight=0.95 --svg
```

Name a knob, and it takes over from whichever everyday flag would otherwise have set it.

### When a knob meets an everyday flag

An everyday flag does not set one knob; it sets a whole bundle of them:

| Everyday flag | Knobs it sets |
| --- | --- |
| `--length` | `wshort`, `wmid` |
| `--winding` | `pstraight`, `wlateral`, `warns`, `anticoil` |
| `--skeleton` | `giants`, `giantspan`, `giantstep`, `giantjitter`, `wgiant` |
| _(always: the difficulty baseline)_ | half of `--start`, `probe`, `probelen` |

`--start` is a small case of the same rule: it sets the baseline half above, plus the mix of layers and tunnels that nothing else sets. Ten knobs belong to no bundle, so naming one of them was never ambiguous: `lmax`, `backbite`, `trapbias`, `giantstraight`, `giantanticoil`, `giantspacing`, `headtries`, `absorblimit`, `maxback`, `restarts`.

**A knob written on the command line wins, and pins only itself.** Without `--randomized`, an everyday flag picks one value for each knob in its bundle; a knob you name replaces that one value and leaves the rest of the bundle as the everyday flag set it. With `--randomized`, the everyday flags draw their bundles from the measured safe ranges on every run; a knob you name is pinned instead of drawn, and the rest of its bundle keeps being drawn around it, seed after seed.

The command line says so when it happens, once per run, on stderr, and adds the same fact to the `--dry-run` line, so a script can see it without reading stderr:

```sh
deno task carve --width=30 --height=30 --randomized --pstraight=0.9 --dry-run
```

```text
note: --pstraight=0.9 is pinned; --winding still sets wLateral, anticoil, warns
```

```json
{ "...": "...", "pinned": ["pStraight"], "...": "..." }
```

A pin can also name a knob that changes nothing under the rest of your settings: a skeleton knob without a skeleton, or the target length while the target share is 0. The lab dims such a row; the command line says it on a line of its own, in the same words:

```sh
deno task carve --width=30 --height=30 --probelen=30 --dry-run
```

```text
note: --probelen=30 is pinned; the difficulty baseline still sets headBias, probe
note: --probelen=30 has no effect here: needs target share > 0
```

That second line is left out of a `--count` batch drawn with `--randomized`: there every board gets knobs of its own, drawn afresh rather than from the seed, so one note for the whole run could not speak for all of them.

When the draw has to move a value of its own to keep a rule, it says which one and where it went. Naming a share bigger than what is left under the cap makes the everyday flag's share give way:

```sh
deno task carve --width=30 --height=30 --length=0 --wmid=0.5 --dry-run
```

```text
note: --wmid=0.5 is pinned; --length still sets wShort
note: --wshort moved from 0.75 to 0.4: short and medium shares together must stay at or below 0.9
```

What pinning costs: the safe ranges in the table below were measured as whole bundles, so a half-pinned bundle stays inside them but is no longer covered by the promise that _every_ everyday combination fills its board. The ranges still have the last word: a pinned value outside its own range, or a combination that breaks a rule, is refused exactly as it would be otherwise.

### The knobs

All of them, grouped as `deno task carve --help=knobs` groups them. **Step** is the distance between the values a knob takes: a value between two steps is refused, as one outside the range is, because neither the lab's slider nor a printed command could reach it again. The table comes from the command line's own code, so it says what the command takes.

::table{of="knobs"}

### What some of them look like

Four knobs side by side, each on a 30×30 board with seed 7. Three of them change the picture; the fourth changes something you cannot see.

**`--warns` — filling awkward corners first**

:::compare{stats="pieces bends"}
::board[`--warns=2`]{cmd="--width=30 --height=30 --seed=7 --warns=2 --colored"}
::board[`--warns=16`]{cmd="--width=30 --height=30 --seed=7 --warns=16 --colored"}
:::

**`--wlateral` — turning sideways instead of pushing on**

:::compare{stats="pieces avgLen"}
::board[`--wlateral=0`]{cmd="--width=30 --height=30 --seed=7 --wlateral=0 --colored"}
::board[`--wlateral=20`]{cmd="--width=30 --height=30 --seed=7 --wlateral=20 --colored"}
:::

**`--probe` — one target length for every arrow**

:::compare{stats="pieces longest"}
::board[`--probe=1 --probelen=4`]{cmd="--width=30 --height=30 --seed=7 --probe=1 --probelen=4 --colored"}
::board[`--probe=1 --probelen=200`]{cmd="--width=30 --height=30 --seed=7 --probe=1 --probelen=200 --colored"}
:::

**`--start` — the knob you cannot see**

:::compare{stats="pieces f0"}
::board[`--start=layers`]{cmd="--width=30 --height=30 --seed=7 --start=layers --colored"}
::board[`--start=tunnels`]{cmd="--width=30 --height=30 --seed=7 --start=tunnels --colored"}
:::

The two `--start` boards look much alike, and that is the point: this knob barely touches the drawing. What it changes is how many arrows are free at any moment, and that is what makes a board easy or hard. The default, `--start=random`, sits between the two. A number from 0.3 to 0.7 mixes `layers` and `tunnels` instead of choosing one: it is the share of arrows that start as tunnels.

### Combinations that are refused

Some rules cannot be written as a range from one value to another, so they are checked on their own:

::table{of="rules"}

Break a rule, put a knob outside its range, or land between two of its steps, and the generator refuses before laying anything, tells you which value was wrong, and ends with status code 2. It never quietly rounds your number into range: `--maxback=75` is refused rather than nudged to 50 or 100, because a value no slider and no printed command can reach would make the board impossible to make again.

The everyday flags cannot break these rules: every value of every everyday flag, at every board size, gives a valid combination, as long as you leave the knobs in its bundle to the everyday flag. What pinning one of them costs is said above.

## Where boards are saved {#saved}

By default boards go into `packages/cli/boards/`, in a folder per size:

```text
packages/cli/boards/
  25x25/
    sha256-0dc74eef….board.json   the board
    sha256-0dc74eef….json         what it was made from
    sha256-0dc74eef….svg          the picture, only with --svg
  40x40/
    ...
```

The file name comes from the arrows on the board. The same arrows from another seed or other settings share one set of files, and the `.json` file lists every command that made them. Colours and line thickness are not part of the name, so changing only those writes to the same name and replaces the picture.

Point it somewhere else with the `ARROWZ_BOARDS_DIR` variable:

```sh
export ARROWZ_BOARDS_DIR=~/arrowz-boards
deno task carve --width=25 --height=25
```

The `.json` file next to each board holds every setting used, when the board was made, how long it took and how many arrows it has. It also holds a `command` line that makes the same board again, exactly. If you keep one thing from a board, keep that line.

> Boards are not part of the repository: `packages/cli/boards/` is left out of it on purpose. A 1000×1000 board file is about a megabyte, and its picture tens of megabytes.

## Environment variables {#env}

`carve` and `report` read these variables, and nothing else from the environment:

::table{of="env"}

## A standalone program {#standalone}

If you would rather have one file you can run without calling Deno each time:

```sh
deno task compile
```

That writes a self-contained program to `packages/cli/dist/carve`. It takes exactly the options the `carve` task takes, and is shorter to type:

```sh
./packages/cli/dist/carve --width=25 --height=25 --dry-run
```

One catch. The standalone program does not know where the repository is, so it cannot work out where to save boards. Before asking it to save anything, tell it where to put them:

```sh
export ARROWZ_BOARDS_DIR=~/arrowz-boards
./packages/cli/dist/carve --width=25 --height=25
```

Without that, saving fails with an error about a directory it cannot create. Describing a board rather than saving it (`--dry-run`) works either way.

## When something goes wrong {#trouble}

**`deno task` says it could not find `deno.json`** — you are outside the project folder. `cd` into the `arrowz` folder and try again.

**`Requires env access`** — you ran `deno run packages/cli/carve.ts` directly. Deno does not let a program read your files or settings unless it is told to. Use the `carve` task, which grants exactly what it needs.

**`unknown flag …`** — the command does not know that flag at all. Check the spelling against `--help` or `--help=knobs`.

**`--straight is gone: use --winding=R …`** (or `--advanced`, `--board`, `--w`/`--h`, `--colorized`, `--lineweight`, `--headwidth`/`--arrowwidth`, `--headheight`/`--arrowheight`, `--lateral`, `--absorb`, `--headbias`, `--mix`) — an old spelling. The message names the flag that replaced it; use that instead.

**`invalid arguments: --pstraight=0.2 is outside 0.6..1`** — a value is out of range, between two of a knob's steps, or breaks a rule. Every line starts with the flag to change, and a broken rule names every flag it is about. Nothing was generated and nothing was written.

**`failed to close board …`** — the generator tried, took arrows back, started over, and still could not fill the board. Almost always a knob marked **Careful:** in [the knob table](docs:cli#knobs) is to blame. Move it back towards its default, or try another seed. The board is in `packages/cli/boards/` all the same; add `--svg` and the picture shows the uncovered cells tinted pink, so you can see where it got stuck.

**`failed to close board …: covered, but the rays make a cycle`** — every cell is covered, and still no arrow can ever leave: two arrows point at each other, or a longer ring of them does. This is a bug in the generator, not a setting you chose. Nothing you can type makes it, because the generator gives every arrow its path to the edge before anything stands in it. If you ever see this line, the board is still saved to `packages/cli/boards/`; please keep it and report it, because it is the board that should not exist.

**One board takes forever** — set `CARVE_TIMEOUT_S` to a number of seconds, and the generator stops there and saves what it had laid:

```sh
CARVE_TIMEOUT_S=60 deno task carve --width=1000 --height=1000
```

**The report takes forever** — `deno task report` with nothing else walks every difficulty level up to 1000×1000, three times each. Add `--only=easy --square --runs=1`. `--only=easy` on its own matches nothing: it needs `--square` or `--portrait` beside it.

**Wondering what it is doing** — set `CARVE_TRACE=1`, and it reports its progress as it goes:

```sh
CARVE_TRACE=1 deno task carve --width=200 --height=200
```

```text
    [trace] pieces 7000, remaining 2516, backtracks 0, 252 ms
```

## Words {#words}

The words of the puzzle itself — arrow, arrowhead, path to the edge, free, seed — are on the [puzzle's page](docs:arrowz#words). These belong to the generator:

- **skeleton** — a few very long arrows laid first, snaking across the whole board. In the code: `giants`.
- **layers / tunnels** — two ways of choosing where the next arrow starts. Layers peel the board from the outside and make it easy; tunnels dig inward and make it hard.
- **stuck** — the generator has painted itself into a corner while building, so no arrow can be added. It takes some arrows back, or starts over.
- **complete** — a board where every cell is covered by an arrow. A board that is not complete is still saved, marked `"ok": false`.
- **trap** — an arrow blocked by exactly one other, so it looks free when it is not. `--trapbias` asks for more or fewer of them.
- **target length** — the length some arrows are drawn around, instead of the usual mix of short, medium and long. In the code: `probe`.
- **safe range** — the measured limits of each setting. Outside them boards stop working, and the command refuses rather than let you find out the slow way.

## What `--help` prints {#help}

The command's own help, both forms, printed by the function the terminal calls, so the two cannot disagree. It stays in English, as the terminal prints it.

### `--help`

::help{form="short"}

### `--help=knobs`

::help{form="knobs"}
````

Before writing the claims, check each against its source and fix the page (not the source) where they differ: the `--count` behaviour against `packages/cli/carve.ts`; the `report` flags against `packages/cli/report-flags.ts` and `report.ts`; the note lines and the refusal text against `packages/cli/README.md` (which `packages/cli/readme.test.ts` holds to the CLI); the ranges against `VIEW_RANGE`, `PAD_RANGE`, `POINT_RADIUS_RANGE`, `PALETTE_CAP` and `THEMES`. Report every difference you find, fixed or not.

- [ ] **Step 3: The Polish CLI page**

Write `apps/lab/docs-content/pl/cli.md` as a translation of Step 2, keeping: every heading's `{#id}`; every directive line with its attributes character for character (only the `[label]` is translated, and a label that is only code, like `` `--seed=7` ``, stays as it is); every code block identical except the `#` comments of `sh` blocks; the same lists, tables and notes, in the same places; the same `docs:` link targets. The terms, as the lab says them: arrow — strzałka; arrowhead — grot; path to the edge — droga do krawędzi; complete / not complete — pełna / niepełna; stuck — utknąć; skeleton — szkielet; target length — zadana długość; target share — ile zadanych; knob — pokrętło (this page only); setting — ustawienie; flag — flaga; seed — ziarno; board — plansza; lay / make a board — ułożyć / zrobić planszę; layers / tunnels — warstwy / tunele; trap — pułapka; safe range — bezpieczny zakres; status code — kod wyjścia; the lab — laboratorium (as the Lab page and the dictionary say it); Open in lab — Otwórz w laboratorium; the report — raport; dot grid — siatka kropek; background — tło. Section titles: Pierwsze kroki · Robienie plansz · Ustawienia na co dzień · Wszystkie pokrętła · Gdzie zapisują się plansze · Zmienne środowiskowe · Samodzielny program · Gdy coś idzie nie tak · Słowa · Co wypisuje `--help`. The page's title: `# Wiersz poleceń`. Check every Polish term against `packages/engine/lab-i18n.ts` (`PL`) and `apps/lab/docs-content/pl/lab.md` before using it; where they differ from this list, follow the dictionary and say so.

- [ ] **Step 4: The Arrowz page's two boards**

In `apps/lab/docs-content/en/arrowz.md`, after the lead paragraph (before the `>` note), add:

```md
::board[A 40 by 40 board]{cmd="--width=40 --height=40 --seed=7"}
```

and in "The puzzle", after its first paragraph, add:

```md
Here is a small one, eight cells by eight, with every arrow in its own colour:

::board[A small board, each arrow in its own colour]{cmd="--width=8 --height=8 --seed=7 --colored"}
```

In `apps/lab/docs-content/pl/arrowz.md`, the same places:

```md
::board[Plansza 40 na 40]{cmd="--width=40 --height=40 --seed=7"}
```

```md
Oto mała plansza, osiem komórek na osiem, z każdą strzałką we własnym kolorze:

::board[Mała plansza, każda strzałka we własnym kolorze]{cmd="--width=8 --height=8 --seed=7 --colored"}
```

- [ ] **Step 5: Format, then the guards**

```bash
cd apps/lab && pnpm exec prettier --write docs-content/en/cli.md docs-content/pl/cli.md docs-content/en/arrowz.md docs-content/pl/arrowz.md
pnpm exec vitest run --project node src/docs
cd ../../packages/engine && deno test -A glossary.test.ts
```

Expected: PASS — both languages parse, share one shape, every `cmd` reads, every link lands; no retired word. A glossary failure names its line: reword the sentence, do not add an exception.

- [ ] **Step 6: The page tests**

```bash
cd apps/lab && pnpm exec vitest run --project chromium src/docs src/routes
```

Expected: PASS, `OpenInLab.browser.test.tsx` included (its first run: the hero board is now on the Arrowz page).

- [ ] **Step 7: Read it in a real browser, briefly**

```bash
mkdir -p /tmp/lab-docs-cli-store && cp -R packages/cli/boards/. /tmp/lab-docs-cli-store/
ARROWZ_BOARDS_DIR=/tmp/lab-docs-cli-store pnpm nx serve lab
```

Open `/docs/cli` at 1440×900: scroll the whole page with the wheel (it must not stop on a board), press the 1000×1000 board's button, Copy one command, press Open in lab on one board. Report anything that looks wrong; the full live run is Task 10's. Stop the server afterwards.

- [ ] **Step 8: Commit**

```bash
cd apps/lab && pnpm exec prettier --write src/docs/CliPage.browser.test.tsx src/docs/ArrowzPage.browser.test.tsx src/routes/DocsLayout.browser.test.tsx src/routes/DocsNav.browser.test.tsx && pnpm run check && pnpm run lint && cd ../..
git add apps/lab/docs-content/en/cli.md apps/lab/docs-content/pl/cli.md apps/lab/docs-content/en/arrowz.md apps/lab/docs-content/pl/arrowz.md apps/lab/src/docs/CliPage.browser.test.tsx apps/lab/src/docs/ArrowzPage.browser.test.tsx apps/lab/src/routes/DocsLayout.browser.test.tsx apps/lab/src/routes/DocsNav.browser.test.tsx
git commit -m "lab: the Docs page Command line in full, with live boards, and the Arrowz page's two pictures"
```

---

### Task 10: Jev on the page, the gates, the live run, the PR

**Files:**
- Modify: `docs/jev-guards.md`; the pages, if Jev's triage changes them.

- [ ] **Step 1: Ask Jev, triage, measure**

```bash
deno task jev:docs cli
deno task jev:docs arrowz
```

Probe that Jev answered (a stub that counts calls and nulls, as in the PR 2 session: "nothing flagged" does not tell a missing answer apart). Triage each flag by hand: a real contradiction with `packages/cli/README.md` or a real EN/PL difference is fixed in the Markdown or `lab-docs.ts` (re-run Task 9 Step 5); anything else goes into the PR body as "seen, kept, because …".

Re-measure the four thresholds on the CLI page, the first long one, with a few hand-made faults (a changed default, a sentence about an earlier version, an unexplained internal term, a Polish section that says something else): record clean and faulty scores per question. In `docs/jev-guards.md`, "Docs pages": add a "Measured on jev-…, 2026-10-0x, over the CLI page" paragraph with the numbers, keep the earlier paragraph as it is, and change a threshold only if the numbers say so — and then in `jev-docs.ts` too.

- [ ] **Step 2: The whole repository**

```bash
cd packages/engine && deno task verify
cd ../cli && deno task verify
cd ../.. && pnpm nx run-many -t verify
```

Expected: all green; the lab's `verify` includes `build`, `smoke` and `worker-smoke.mjs`, which must still find exactly one `generate.worker` chunk.

- [ ] **Step 3: Live, in a real browser**

With the store copy of Task 9 Step 7 (`ARROWZ_BOARDS_DIR=/tmp/lab-docs-cli-store pnpm nx serve lab`), at 1440×900 and 375×812, in English and Polish:
- `/docs/cli`: every section in the column; scroll to the end with the wheel, then back — the page never stops on a board, boards appear as they come near and come back at once; count the `<arrowz-board>` elements at the densest place (`document.querySelectorAll('arrowz-board').length` in the console) and record the number;
- ⌘ + wheel zooms a board; a plain drag pans it;
- the 1000×1000 button generates in about ten seconds and the lab tab, meanwhile, keeps its board;
- Open in lab on a `--start=tunnels` board: the lab is in the advanced view with `start` pinned, and generates;
- at 375×812 a finger (DevTools touch emulation) scrolls the page over a board, and the board shows no corner buttons;
- `/docs/arrowz`: the hero and the small coloured board.

Stop the server afterwards and kill what it leaves (`ps … | grep -E "lab-docs-cli|nx/dist/src/daemon|vite preview"`); remove `/tmp/lab-docs-cli-store` and `/tmp/lab-docs-cli`.

- [ ] **Step 4: Follow-ups as beads**

Create a bead, with an estimate and links, for each thing found and left: the README's stale numbers and counts (decision 8 — `packages/cli/README.md` says "Twelve flags… five" and `--probelen=4` 253 arrows); anything from the live run that is not this PR's.

- [ ] **Step 5: Bead and PR**

```bash
bd update arrowz-kkey.4 --append-notes "Plan executed; PR body cites Bead: arrowz-kkey.4."
```

Then superpowers:finishing-a-development-branch; the PR body (written to a file, passed as `--body-file` with an absolute path) lists the ten decisions at the top of this plan, the measured board count and Jev thresholds, and cites `Bead: arrowz-kkey.4`.
