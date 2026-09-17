# The board library, part two: the detail under the list — Implementation Plan

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:subagent-driven-development (recommended) or superpowers:executing-plans to implement this plan task by task. Steps use checkbox (`- [ ]`) syntax for tracking.

**Goal:** Give a stored board the detail the old lab has — its command with a copy button, its three view numbers and two view flags editable and written back to the store 350 ms later, *load into lab*, and a two-click delete — and with it close spec §10 row 5b, which is where parity with today's lab is reached.

**Architecture:** The console's panel track becomes `LibraryPanel`, a two-row grid: the list scrolls, `BoardDetail` stays put beneath it. An edited view moves `result.preview.meta.view` through one new action, because `BoardFrame` already draws a stored board from that meta — so the redraw is free and there is no second copy of a stored board's view. `ViewNumberField` and `ViewFlagSwitch` lose their store reads and take a value and a callback, which is what lets the lab's console and the library's detail share one field. Library messages that report an *event* rather than a state (`loadingBoard`, `viewSaved`, `deletedBoard`, and the two failures) reach the status line through `library.notice`, because a line computed from state alone has nowhere to put an event.

**Tech Stack:** React 19, react-router 8.3.1 (`useNavigate`, `useMatch`), zustand 5.0.15, Vite 8, Vitest 5 with `@vitest/browser` 5 and `vitest-browser-react` 2.3 (`node`, `node-integration` and `chromium` projects), `@arrowz/engine` (`BoardMeta`, `BoardFile`, `View`, `readParams`, `storeRequest`, `VIEW_RANGE`, `viewNumberOf`), Deno 2.9 for `packages/`.

**Spec:** `docs/superpowers/specs/2026-09-13-lab-react-app-design.md` — §5.1 (the PR 5b amendment: `LibraryPanel`'s two rows and the single `useLibraryList` call), §5.3 (the edited view lives in `preview.meta`; the notice and why a source tag is still not needed), §5.6 (one answer about an unlisted size; a deleted board replaces its address), §7.2 (the three regions sharing one name), §10 row 5b. The spec amendment is commit `1a15ea8` on this branch.

**Previous plan:** `docs/superpowers/plans/2026-09-16-lab-board-library.md` (PR #71, and its debt PR #72).

**Branch:** `lab/board-detail`, created from `lab/library-debt` at `6a50273`. **The pull request's base is `lab/library-debt`, not `main`:** PR #71 and PR #72 are both open, and this is the fourth branch of that stack. Three of the debts PR 5a recorded for 5b — the dropped listing's `loading`, the unreachable size fallback in `BoardList`, and `boardError` as a string contract — were already paid in #72 and must not be re-done here.

## Global Constraints

- **Everything written to a file is English** — code, identifiers, comments, tests, docs, branch names, commit messages. Only the conversation with the user is Polish.
- **No `any`, no non-null assertions.** ESLint enforces both in `apps/lab`; `deno lint` in `packages/`.
- **Both gates must pass before the PR:** `deno task verify` in the repository root and `pnpm nx run-many -t verify`.
- **Never import the engine's `.ts` sources from `apps/`.** After any edit under `packages/engine`, run `pnpm nx build engine` before running `apps/lab` tests by hand — otherwise a new dictionary key exists neither in the types nor at run time, and `dict.t()` answers `undefined`.
- **English is the source language in code**, Polish is the translation. **This plan adds three UI strings** (Task 9) and they go into both `ui` tables in `packages/engine/lab-i18n.ts`; `lab-i18n.test.ts` checks that the key sets and the value kinds match. Every other word it needs is already there: `boardCommand`, `copy`, `copied`, `loadIntoLab`, `deleteBoard`, `confirmDelete`, `deleteFailed`, `viewSaved`, `deletedBoard`, `notSaved`, `loadingBoard`, `clamped`, `strokeLabel`, `headWidthLabel`, `headHeightLabel`, `headHelp`, `rounded`, `colored`.
- **The engine and the dictionaries know neither Deno nor the DOM** (`neutral.test.ts`). Never spread an array proportional to cells or pieces into a call.
- **No attribution lines in commit messages.**
- **Do not delete or modify anything under `packages/cli/boards/`, any `dist/` by hand, or any `node_modules/`.**
- Commit after every task. Run `pnpm --dir apps/lab exec prettier --write <touched paths>` before each `apps/lab` commit and `deno fmt <touched paths>` before each `packages/` commit; both are gates. `deno fmt` excludes `docs/` and `**/*.md`, so the plan and the spec are never reformatted.
- **The old lab is not touched by this plan.** `lab.html` and `lab-page.ts` keep their own library; PR 8 retires them.

### Commands

| What | Command |
|---|---|
| Builds before any lab test | `pnpm nx build engine && pnpm nx build board-element` |
| Lab types | `pnpm --dir apps/lab run check` |
| Lab tests, one file | `pnpm --dir apps/lab exec vitest run src/<path>` |
| Lab tests, all | `pnpm nx test lab` |
| CLI/engine tests | `deno task test` |
| One Deno test file | `deno test -A packages/cli/lab-server.test.ts` |
| Both gates | `deno task verify` && `pnpm nx run-many -t verify` |

**Both builds, not just the engine.** `apps/lab`'s browser tests import the board element, and `tsc` cannot resolve `@arrowz/board-element` until it is built.

**A cold optimizer cache is not a flake.** `apps/lab/vitest.config.ts` already carries `optimizeDeps: { include: ['react-dom/client'] }` (commit `f9df57b`) for it. If a full run ever aborts with `The iframe "…" did not become ready within 60000ms` naming a file the task did not touch, check that line before debugging anything else; `rm -rf apps/lab/node_modules/.vite` reproduces the cold state on demand.

### Harness facts, each measured

Carried from PR 3a, 3b, 4a, 4b and 5a. Every one of these broke a plan written from reasoning:

- **`render` and `renderHook` from `vitest-browser-react` are async.** `const screen = await render(<X />)`.
- **`toHaveTextContent` is exact equality**; substrings and regexes go through `toMatchTextContent(/…/)`.
- **Playwright locators are strict**: a name matching two elements throws. In the whole app, `getByRole('tab', { name: /board/ })` matches both the `board` knob group and the *Saved boards* tab; pass `{ exact: true }`.
- **Tab names come from the dictionary:** `tabLab: 'Lab'`, `tabLibrary: 'Saved boards'`, `tabDocs: 'Docs'`.
- **`getByRole` skips hidden elements**; pass `{ includeHidden: true }` when the point is the identity of a deliberately hidden node.
- **`expect.element(...)` retries to the timeout**: a momentary state read that way waits itself out. Read a momentary state once, synchronously, after asserting the condition that creates it.
- **`BrowserRouter` commits navigation inside `React.startTransition`**: after a click that navigates, assert through `await expect.element(...)` or `await expect.poll(...)`, never a synchronous read.
- **Browser test files are isolated for the store and `location.hash`, but not for `localStorage`.** Cases *within* a file share everything: every file resets by hand.
- **`resetApp` does not reset a slice it does not know about.** A new slice field means a new line there and in the private `mountApp` helpers of the test files that have one.
- **The `chromium` project sets no `testTimeout`** — the `60_000` belongs to `node-integration`. A whole-app case that waits for a carve passes its own timeout, usually `40_000`.
- **A component that starts fetching on mount races the case's own state.** Stub it: `vi.spyOn(globalThis, 'fetch').mockImplementation(() => new Promise(() => {}))` in `beforeEach`, `vi.restoreAllMocks()` in `afterEach`.
- **A store write from outside a React event reaches the DOM on a microtask at the earliest.** Wrap it in `await act(async () => …)` before reading the DOM, or poll.
- **Fake timers need a recipe:** install them *after* `renderHook`, without `shouldAdvanceTime`; wrap every write in `await act(...)`; advance with `await vi.advanceTimersByTimeAsync(...)`; assert with bare `expect`, never `expect.element` — it stands on `expect.poll` and hangs on a frozen clock.
- **`renderHook` cannot see a defect that needs a re-render.** Its host component subscribes to nothing, so a store change never re-renders it — and an effect whose cleanup runs per render therefore never runs at all. Review round 2 measured a hook that posted twice per edit in the application while its `renderHook` suite stayed green. When the claim is about effects, cleanups or dependency arrays, mount an owner that selects the state the hook writes, as `BoardDetail` selects `result.preview`.
- **`renderHook(...).rerender` takes the hook's props, not a new wrapper** — its signature is `(props?: Props) => Promise<void>`. A `MemoryRouter` passed as `wrapper` fixes the address at mount, so "walking" between routes by re-rendering with a different wrapper changes nothing and the case is vacuous. Review round 3 measured exactly that passing with its repair reverted. Navigate for real: a host component that calls `useNavigate()`.
- **A component that returns `null` has not unmounted.** `BoardDetail`'s own gate renders nothing when the address names another board, but the instance lives on — only `LibraryPanel`'s `key` replaces it. Any claim about unmount behaviour (a timer cancelled, state thrown away) must be measured through the parent that re-keys, never through the component alone.
- **`locator.click()` waits for actionability**: clicking a disabled button stalls to the timeout instead of failing.
- **`locator.element()` returns `HTMLElement | SVGElement`** and `querySelector('.x')` returns `Element`, which has no `style` or `.value`: narrow with `querySelector<HTMLInputElement>(...)`. `pnpm --dir apps/lab run check` catches this; `vitest run` does not.
- **`let x: T | null = null` assigned inside a closure narrows to `null`.** Write `let x = null as T | null`.
- **`exactOptionalPropertyTypes`, `noUncheckedIndexedAccess` and `noUnusedLocals` are on**, and ESLint's `no-unused-vars` is an error: an unused import in a test file fails `verify`.
- **React 19 has no global `JSX` namespace**: type a component's return as `ReactElement`.
- **A property reaching `<arrowz-board>` does not prove the board looks like that.** Assert the element's own effect: `element.shadowRoot?.querySelector('button.colors')?.getAttribute('aria-pressed')`, as `BoardFrame.browser.test.tsx` does.
- **`toBeVisible()` does not mean on screen.** An element scrolled out of an `overflow: auto` box passes it, and so does one below the viewport's bottom edge. Review round 2 measured the detail's two buttons 39 px off-screen at 860×900 with every assertion green. When the claim is "a person can reach this", read `getBoundingClientRect().bottom` against the container's and against `window.innerHeight`.
- **A `null` slot does not keep its index in the DOM.** Assert "did not remount" by node identity (`expect(node()).toBe(before)`), never by position.
- **Whole-app tests run at 414×896 by default**, where `@media (max-width: 900px)` already applies. Every geometry case calls `await page.viewport(w, h)` first, and the viewport outlives the case that set it.
- **A variant rule appended after the media-query block loses on order** at equal specificity. `.fw-lib-panel`'s rules go *before* the `@media (max-width: 900px)` block in `console.css`, and any new `.fw-lab` variant must be added to the solo rule.

New in this plan, read from the source on 2026-09-17 (verify, do not trust):

- **`VIEW_RANGE` is `{ min, max, whole }` per field** (`command.ts:608-620`): `stroke` 0.05–2, `headWidth` 0–3, `headHeight` 0–3, all `whole: false`. `viewNumberOf(raw, field)` clamps and rounds through it and is exported from `@arrowz/engine/command`.
- **`readParams(raw: unknown): Partial<Record<ParamKey, number>>`** is exported from `@arrowz/engine`; `url.ts` already uses it.
- **`params.setMany` does not raise `edits`,** and `useAutoRun` watches `edits` alone — which is why *load into lab* cannot start a run by accident.
- **`storeRequest(board, params, view, source, metrics?)`** (`command.ts:543-552`) builds the POST body and computes `command` itself from the params and the view.
- **The store server already deletes:** `DELETE /api/boards/:size/:id` answers 200 `{"deleted":true}` or 404 `{"deleted":false}` (`lab-server.ts`, the `del` branch). `vite.proxy.ts` proxies all of `/api/`, methods included, so nothing there changes.
- **`storedFixture(seed, W = 8, H = 8)` returns `{ meta, file }`** with `view: { ...DEFAULT_VIEW, top: 0 }` and a real carve; `sizesFixture()` returns `8x8` (two boards) and `6x6` (one).
- **`ClampNotice` is rendered only on the lab tab** (`Workspace.tsx`: `{lab ? <ClampNotice … /> : null}`), so *load into lab* must navigate before the user can see what it raised — which it does anyway.

---

## Rulings I made

Decisions this plan takes that the spec left open or states differently. An executor must not relitigate them; a reviewer should attack them.

**Ruling 1 — `LibraryPanel` is a container, and **both** its rows are bounded.** Spec §5.1 (PR 5b) puts the detail under the list in a two-row grid. `.fw-lib-list` owns `overflow-y: auto` today; if it kept it, the detail would sit below a scrolled region and the panel as a whole would grow past its track.

The obvious grid — `minmax(0, 1fr)` and `auto` — is wrong, and review round 1 measured how wrong. An `auto` row is content-sized with no ceiling, and the detail's content is taller than half a 385 px console: at 1400×900 the list came out **30 px** tall (no row fully visible, of forty), and at 860×900 it came out **0 px** while the detail overflowed the console *and the document* by 75 px. "The list scrolls under a detail that stays" was true only in the sense that there was no list left to scroll.

So the list row gets a floor and the detail row gets a ceiling: `grid-template-rows: minmax(min(200px, 45%), 1fr) minmax(0, auto)`, with `min-height: 0; overflow-y: auto` on the detail itself. `minmax(0, auto)` lets the detail shrink below its content and scroll on its own; the floor keeps two rows of list wherever the panel is tall enough, and gives way to 45% of a short one rather than taking the panel over.

Two corrections from review round 2, both measured. **The floor is 200 px, not 140:** the list's own Refresh head takes 34 px and its padding 24, and a row is about 62, so 140 px showed *one* row, not the two the first draft claimed. And **the `auto` row was not the whole story at 1400×900** — with the help paragraph dropped, the old grid and the new one both gave 150 px of list there, so at that width the entire 120 px came from the paragraph. The grid change earns its keep where the field grid wraps: at 860×900 the old grid gave 63 px against the new one's floor, and below about 1046 px of panel width it is the only thing standing between the list and zero.

**Ruling 16 — the detail's two buttons are pinned to the bottom of its scrolling box.** Bounding the row is not enough. Review round 2 measured the buttons at every viewport but 1400×900 and wider sitting *below the window*: at 860×900 `Load into lab` and `Delete from disk` were 39 px past the bottom edge, reachable only by scrolling inside the detail, and no assertion saw it — Playwright's `toBeVisible()` passes for an element scrolled out of an `overflow: auto` box, and the plan's other assertion reads the detail's box rather than its content. So `.fw-lib-buttons` is `position: sticky; bottom: 0` on the detail's own background: the fields scroll under them, the two actions never leave the screen, and Task 11 asserts their rectangle rather than the box's.

**Ruling 17 — the library's `headHeight` shows no help paragraph, and that is a trade, not parity.** The first draft of this ruling said the old lab does not show one there either. **That is false**: `lab.html`'s `libView` carries `<p class="help" data-i18n="headHelp">` beside `libHeadHeight`, and `help` is checked by default, so the old lab does show it. Review round 1 asserted the opposite and this plan repeated it without opening the file — exactly the failure this repository has a rule against. What is true is the measurement: that paragraph is nine lines in a 190 px column, every cell of a grid row is as tall as the tallest, and it adds 120 px to the detail at 1400 and 138 at 860 — in a panel that is half a 385 px console. It is dropped deliberately, for room, in a surface where the same explanation already sits one tab away in the lab's own preview panel. Restoring it is a one-line change to `LIBRARY_VIEW_FIELDS` if the trade is judged wrong.

`min-height: 0` on the list row matters for the usual reason — a grid item's automatic minimum size is its content, so without it the row refuses to shrink and nothing scrolls.

**Ruling 2 — the two shared fields become controlled by their caller, and **all three** owners are converted in the same task.** There are three, not two: `ViewPanel`, `SimplePanel` (the simple view renders the very same components) and the library's new `BoardDetail`. Review round 1 applied the first draft of this task and measured what leaving `SimplePanel` out costs — `tsc` red with two `TS2739`s, and at run time a simple-view field that opens empty and throws `onCommit is not a function` on blur. Its own test suite stayed green through all of it, because no case there commits a view field; this task adds one. `ViewNumberField` and `ViewFlagSwitch` read the `view` slice directly today. Reusing them from the detail means one of two things: a prop pair, or a context. The prop pair wins because the field's test then needs no provider and the component becomes pure; the commitment recorded in PR #65 and in `ViewPanel.tsx`'s own comment is satisfied either way, but only the prop pair leaves the component readable on its own. `viewNumberOf` moves *into* the field, so a caller receives an already-clamped number and no caller can forget to clamp — which also removes the `useStore.getState()` re-read the component uses today to show what the store kept.

**Ruling 3 — the library's field list is its own constant, not `SIMPLE_VIEW_FIELDS`.** Both are `stroke`, `headWidth`, `headHeight`, and the coincidence is exactly the trap: the simple view holds that trio because `cell` and `top` are advanced, the library holds it because a stored board has no highlight and its `cell` belongs to the export it was saved with. Sharing the constant would mean a change to the simple view silently changed the library.

**Ruling 4 — an edited view moves `preview.meta.view`, and nothing else.** `BoardFrame` draws a stored board from `preview.meta.view`, so that is the value the stage reads; a second slice would be a second truth. `result` gains `previewView(view: View)`, which replaces the view inside `preview.meta` and leaves `board` and `file` untouched. It is a no-op when there is no preview, for the same reason `stored` and `exported` are no-ops for a file that is no longer shown.

**Ruling 5 — `library.notice` carries what the library did, and only what is *over* fades.** `savedBoard` is a state (the board the address names) and the status line computes it. The slice holds `notice`, and `RunStatusBar` reads it ahead of the preview branch.

Three notices report something finished and fade after 1200 ms: `viewSaved`, `deletedBoard`, `deleteFailed`. Two describe a state and are cleared by their own outcome: `loading`, because a fetch is still going, and `saveFailed`, because the picture on the stage is not what the store holds and stays that way until a save lands or another board is opened.

Review round 2 measured both halves of the first draft being wrong. The fade's `clearTimeout` on unmount killed the `deleted` notice's own timer — the detail raises it and then navigates, which unmounts the detail — so the line said "Deleted …" indefinitely. And `saveFailed` faded after 1.2 s, leaving the stage showing an edit, the command box showing the store's command, and nothing on screen explaining the difference. So the timer has **no unmount cleanup**: it writes only the store and only takes back the object it put up, which makes an unmounted raiser harmless.

**Ruling 6 — the detail is absent, not disabled, when the address names no board.** The old lab hides three boxes with `hidden` (`showLibDetail`). Rendering the detail with empty fields would offer a Delete button with nothing to delete and a command box with no command.

**Ruling 7 — one function answers "which listed size is this address about", and both the chips and the list call it.** Spec §5.6 (PR 5b). It lives in `apps/lab/src/library/openEntry.ts` and returns the entry plus `mismatch`: whether the address *named* a size the store does not list. **Two fallbacks, not one**, and round 2 caught the first draft collapsing them: an address with no size at all (`/boards`) is not a disagreement — PR 5a's own case asserts the first chip is pressed there, because the list is showing that size's rows and something has to say so. A disagreement is only `/boards/10x10/<id>` against a store holding `8x8`, and that is the case where no chip may be pressed while the rows still show. `mismatch` is therefore true only when `size !== null` and the listing has no such entry.

**Ruling 8 — a failed view save does not revert the board on screen.** The view is already in `preview.meta` and on the stage; a save that fails says `notSaved` and leaves the picture alone, as the old lab does (`saveLibView`'s `catch` sets the status and nothing else). Reverting would throw away the user's edit because a server is down.

**Ruling 9 — *load into lab* copies the view as well as the knobs, and `hilite` comes from `view.top > 0`.** Parity with `lab-page.ts`'s `libLoad` handler, which sets `cell`, `stroke`, `headWidth`, `headHeight`, `rounded`, `colored`, and `hilite` from `v.top > 0`. A stored board's `top` is 0, so `hilite` lands off; that is the old lab's behaviour and not an oversight.

**Ruling 12 — the debounce timer lives in the module, not in the component, and the delete cancels it.** Round 1 measured the loss this repairs: an edit, 200 ms, then another board chosen — `BoardDetail` is keyed on the address (Ruling 10), so it unmounts and a timer owned by its effect dies with it. Round 1's repair was a flush in the cleanup, and **round 2 measured that repair doing far worse than the bug**:

- The effect's dependencies were `notify` and `refresh`, both fresh functions on every render, so React ran the cleanup *on every render*. The 350 ms debounce therefore never fired at all: one edit posted twice within 2 ms, and every later re-render — `setCopied`, `setArmed`, a language switch — posted again.
- And the flush ran after the delete, because the delete navigates and the key changes. Measured against a real store: `DELETE` removed the board, the flush re-POSTed it, and `packages/cli/store.ts`'s `saveBoard` treats a board it cannot find as a new one and **writes the file back**. The board returned to the disk and to the very listing the delete refreshed.

So the timer goes where the old lab keeps it: module scope in `useViewSave.ts`, with `schedule(view, …)` and `cancelPending()`. Unmounting a component cannot cancel it, which is the behaviour Ruling 12 wanted in the first place; no effect, no dependency array, nothing to run per render. Task 8's delete calls `cancelPending()` before it asks the store to delete, so the one sequence where a write must not survive is the one sequence that stops it.

**Ruling 13 — after a failed save the command box goes on showing the store's command, and the status line keeps saying so.** `meta.command` is built from the params and the view the store holds, so after `notSaved` it disagrees with the picture on the stage — Copy hands over a command that does not reproduce what is drawn. Leaving it is right: the box is labelled "Command of this board", and the board is what the store has. The picture is the user's unsaved edit (Ruling 8). What makes the disagreement legible is the line, and that is why `saveFailed` does not fade (Ruling 5, as round 2 amended it): the one sentence explaining why the box and the picture differ must not disappear while both are still on screen.

**Ruling 14 — a new listing does not re-fetch the board already on the stage.** Two reviewers reached this from opposite sides. `useStoredBoard`'s effect depends on `metas`, and `listed()` always stores a fresh array, so every refresh — including the one `write()` makes after a successful save — fetched the open board's file again. One reviewer measured what came back: the *listing's* view, overwriting an edit made while that fetch was in flight. The other measured what it did to the line: `loading` raised over `viewSaved`, so against a local store the "saved" message was never readable at all.

So the effect returns early when the board the address names is the board `result.preview` already holds: no second `GET`, no `loading`, and nothing to overwrite the view with. **That early return clears a `loading` notice on its way out** — round 2 measured the fifth exit the first draft missed: open A, click B, click back to A while B's file is still in flight, and the line said "Loading B…" for ever, because the cancelled fetch cleared nothing and the new effect returned before reaching a clear. When the address's board is already drawn, no fetch of it is outstanding, so clearing that one word is always right; nothing else is touched, or the `viewSaved` a save's own refresh lands on would go with it.

This narrows PR 5a's Ruling 4a, which accepted the refetch to guarantee "the preview never describes a meta the listing has replaced". That guarantee is worth less than it looked: the only thing that rewrites a meta is a save, and `write()` already hands the store's own answer to `showPreview`. The remaining gap is a meta changed by *another* window, and round 2 measured how it shows: the row is built from the listing and the detail from `preview.meta`, so the command box, the three fields and the row disagree on screen until the board is reopened. That is the accepted cost, named here rather than discovered later.

**Ruling 15 — the detail shows the board the address names, or nothing.** `useStoredBoard` deliberately leaves the previous board on the stage until the next file arrives, so between the click and the picture the address names B while `preview.meta` is still A. The stage may live with that — it is one board replacing another — but the detail must not: keyed on the address (Ruling 10) it would put A's command and A's view fields under B's heading, and a two-click delete finished inside that window would remove the board the user had just clicked away from. So `BoardDetail` renders `null` unless `preview.meta` is the board the address names, which is Ruling 6's reasoning applied to a case Ruling 6 did not see. **The comparison is the id alone.** Round 2 measured the size half rejecting a board the store really lists: `listBoards` names a size after its directory, so a folder called `08x08` lists boards whose `W` is 8, and `${meta.W}x${meta.H} !== open.size` then hid the detail of a board the stage and the status line were both describing. A layout hash already binds the board to its dimensions; comparing the id says everything the size half was trying to say, and says it about the board rather than about a folder's name.

**Ruling 11 — a 404 from the delete is an outcome, not an error.** The server answers 200 `{"deleted":true}` when it removed the files and 404 `{"deleted":false}` when there was nothing to remove. To someone who has just pressed Delete twice, or who is looking at a listing another process has emptied, both mean *the board is not there any more*: the detail navigates away and says `deletedBoard` either way. So `DeleteOutcome` is `{ ok: true; deleted: boolean } | { ok: false; error: string }`, and only a refused connection or a 5xx is `ok: false` — the shape `listBoards` and `saveBoard` already use, where `ok` means "the store answered", not "the answer was yes".

**Ruling 10 — the two-click arming is component state, and a new board disarms it.** The old lab disarms on choosing another board and on a language switch (`disarmDelete`). Here the address is the selection, so arming is keyed on the open board: `BoardDetail` is given `key={`${size}/${id}`}` by its parent, and a different board is a different component instance with no armed state to carry. The language switch needs nothing, because the button's label is read from the dictionary at render and the armed flag is not language-dependent.

---

## File Structure

**Created**

| File | Responsibility |
|---|---|
| `apps/lab/src/library/LibraryPanel.tsx` | The panel's two rows: the list that scrolls, the detail that stays. Calls `useLibraryList` once and hands `refresh` down (§5.1). |
| `apps/lab/src/library/BoardDetail.tsx` | One stored board's detail: command and copy, three numbers, two flags, load into lab, two-click delete. |
| `apps/lab/src/library/BoardDetail.browser.test.tsx` | What the detail shows, what it copies, what it loads, and what two clicks delete. |
| `apps/lab/src/library/notices.ts` | Raises a library notice and, when what it reports is over, takes it back 1200 ms later (Ruling 5). A module, not a hook: it owns nothing a component owns. |
| `apps/lab/src/library/useViewSave.ts` | The 350 ms debounce from an edited view to the store, and the notice either way. |
| `apps/lab/src/library/useViewSave.browser.test.tsx` | The debounce boundary, the late answer, and the failure that keeps the picture. |
| `apps/lab/src/library/libraryFields.ts` | The library's own three fields and two flags (Ruling 3). |
| `apps/lab/src/library/openEntry.ts` | Which listed size an address is about, and whether that is a fallback (Ruling 7). |
| `apps/lab/src/library/openEntry.test.ts` | Its four cases, as a unit test. |

**Modified**

| File | Change |
|---|---|
| `apps/lab/src/api/boards.ts` | `deleteBoard(size, id): Promise<DeleteOutcome>`. |
| `apps/lab/src/api/boards.node.test.ts` | The delete against a real store: a board goes, a second delete answers 404. |
| `apps/lab/src/state/library.slice.ts` | `notice: LibraryNotice \| null`, `notify`, `clearNotice`; `reset` clears it. |
| `apps/lab/src/state/library.slice.test.ts` | The notice's transitions. |
| `apps/lab/src/state/result.slice.ts` | `previewView(view)` (Ruling 4). |
| `apps/lab/src/state/result.slice.test.ts` | It moves the meta's view, leaves `board` and `file`, and is a no-op without a preview. |
| `apps/lab/src/console/ViewPanel.tsx` | `ViewNumberField` and `ViewFlagSwitch` take a value and a callback (Ruling 2); `ViewPanel` supplies the lab's. |
| `apps/lab/src/console/ViewPanel.browser.test.tsx` | Follows the new signatures. |
| `apps/lab/src/simple/SimplePanel.tsx` | The third owner of the shared fields; same pair of props (Ruling 2). |
| `apps/lab/src/simple/SimplePanel.browser.test.tsx` | One case that actually commits a view field, which this suite never had. |
| `apps/lab/src/console/Console.tsx` | The library face renders `LibraryPanel`. |
| `apps/lab/src/library/BoardList.tsx` | Takes `refresh` as a prop; asks `openEntry` which size it is showing. |
| `apps/lab/src/library/SizeChips.tsx` | Asks `openEntry` too, so the chips and the list cannot disagree (Ruling 7). |
| `apps/lab/src/library/LibraryPanel.browser.test.tsx` | Mounts the panel, not the two components side by side. |
| `apps/lab/src/library/useStoredBoard.ts` | Raises the `loading` notice while a board file is in flight, and clears it on either outcome. |
| `apps/lab/src/library/useStoredBoard.browser.test.tsx` | The loading notice appears and goes. |
| `apps/lab/src/stage/RunStatusBar.tsx` | Reads `library.notice` ahead of the preview branch (Ruling 5). |
| `apps/lab/src/stage/RunStatusBar.browser.test.tsx` | Each notice's line, and that a run's status is unaffected off the library tab. |
| `apps/lab/src/design/library.css` | The panel's two rows, the detail's block, the armed Delete. |
| `apps/lab/src/harness/mountApp.tsx` | `resetApp` clears the notice. |
| `apps/lab/src/routes/Workspace.browser.test.tsx` | One end-to-end case: open a stored board, restyle it, load it back into the lab (Task 11). |
| `packages/engine/lab-i18n.ts` | Three accessible names: the size group, the list, the detail (§7.2). |
| `docs/superpowers/specs/2026-09-13-lab-react-app-design.md` | §7.2 says three entries, which is what the regions need. |

---

## Task 1: The store client learns to delete

**Files:**
- Modify: `apps/lab/src/api/boards.ts`
- Test: `apps/lab/src/api/boards.node.test.ts` (append one case; do not reorder the file)

**Interfaces:**
- Consumes: nothing new.
- Produces: `deleteBoard(size: string, id: string): Promise<DeleteOutcome>` and `export type DeleteOutcome = { ok: true; deleted: boolean } | { ok: false; error: string }`, used by Task 8.

**Background the implementer needs:** the server's `refusal()` refuses a non-GET whose `Origin` *differs* from its own and lets a missing `Origin` through ("Tools without a browser send no Origin and pass"), so a `fetch` from Node needs no header and one from the browser carries the right one through the proxy. `vite.proxy.ts` forwards all of `/api/`, methods included.

- [ ] **Step 1: Write the failing test**

Append to `apps/lab/src/api/boards.node.test.ts`. It must go at the end: the cases above it assert the listing holds exactly one size, and this one adds a size of its own and removes it again, leaving the store as it found it.

```ts
// What the detail's second click does (PR 5b). The board is created and
// removed inside the case, in a size of its own, so the counts asserted above
// stay true however this file grows.
test('deleteBoard removes a board, and a second delete says it was not there', async () => {
  const original = globalThis.fetch
  globalThis.fetch = (...args: Parameters<typeof fetch>) => original(new URL(String(args[0]), VITE_ORIGIN), args[1])
  try {
    const params = { ...defaultParams(), W: 16, H: 16, seed: 5 }
    const made = generate(params)
    const saved = await saveBoard(storeRequest(encodeBoard(made.board), params, DEFAULT_VIEW, 'lab'))
    if (!saved.ok) throw new Error(`the store refused the board this case needs: ${saved.error}`)

    expect(await deleteBoard('16x16', saved.meta.id)).toEqual({ ok: true, deleted: true })
    // Ruling 11: the second press is not an error. The store says 404 and the
    // caller learns the same thing it learned the first time — it is gone.
    expect(await deleteBoard('16x16', saved.meta.id)).toEqual({ ok: true, deleted: false })

    const list = await listBoards()
    expect(list.ok && list.sizes.some((entry) => entry.size === '16x16')).toBe(false)
  } finally {
    globalThis.fetch = original
  }
})
```

Add `deleteBoard` and `saveBoard` to the import from `./boards` at the top of the file; `defaultParams`, `generate`, `encodeBoard`, `DEFAULT_VIEW` and `storeRequest` are already imported there.

- [ ] **Step 2: Run it and watch it fail**

Run: `pnpm --dir apps/lab exec vitest run --project node-integration src/api/boards.node.test.ts`
Expected: FAIL at type-check or import time — `deleteBoard` is not exported.

- [ ] **Step 3: Implement**

Append to `apps/lab/src/api/boards.ts`:

```ts
/** Whether the store still holds the board, or why it could not be asked. */
export type DeleteOutcome = { ok: true; deleted: boolean } | { ok: false; error: string }

/**
 * Removes one stored board. A 404 is an outcome, not a failure (Ruling 11):
 * pressing Delete on a board another window has already removed means the same
 * thing to the caller as removing it here — it is not there. `ok: false` is
 * kept for a store that could not be reached or answered with a fault, which
 * is the distinction every other call in this module makes.
 *
 * Both segments are encoded: an id is a hash and a size is `WxH`, so neither
 * carries a slash today, and a path built by concatenation that stops being
 * true later is the kind of thing this file should not leave lying around.
 */
export async function deleteBoard(size: string, id: string): Promise<DeleteOutcome> {
  let response: Response
  try {
    response = await fetch(`/api/boards/${encodeURIComponent(size)}/${encodeURIComponent(id)}`, { method: 'DELETE' })
  } catch (err) {
    return { ok: false, error: err instanceof Error ? err.message : String(err) }
  }
  if (response.status === 404) return { ok: true, deleted: false }
  if (!response.ok) return { ok: false, error: `the store answered ${response.status}` }
  return { ok: true, deleted: true }
}
```

- [ ] **Step 4: Run it and watch it pass**

Run: `pnpm --dir apps/lab exec vitest run --project node-integration src/api/boards.node.test.ts`
Expected: PASS, every case in the file.

- [ ] **Step 5: Commit**

```bash
pnpm --dir apps/lab exec prettier --write src/api/boards.ts src/api/boards.node.test.ts
git add apps/lab/src/api/boards.ts apps/lab/src/api/boards.node.test.ts
git commit -m "Let the store client delete a board, reporting a 404 as gone"
```

---

## Task 2: The library slice carries a notice

**Files:**
- Modify: `apps/lab/src/state/library.slice.ts`, `apps/lab/src/harness/mountApp.tsx`
- Test: `apps/lab/src/state/library.slice.test.ts` (append)

**Interfaces:**
- Consumes: nothing new.
- Produces, used by Tasks 7, 8 and 9:
  - `export type LibraryNotice = { kind: 'loading'; name: string } | { kind: 'viewSaved'; name: string } | { kind: 'deleted'; name: string } | { kind: 'saveFailed' } | { kind: 'deleteFailed' }`
  - `notice: LibraryNotice | null` on `LibraryState`
  - `notify(notice: LibraryNotice): void` and `clearNotice(): void`

**Why this exists (Ruling 5):** `RunStatusBar` computes its line from state, and four of the library's five messages report an event. `savedBoard` stays computed from `preview`; these do not.

- [ ] **Step 1: Write the failing test**

Append to `apps/lab/src/state/library.slice.test.ts`:

```ts
// Ruling 5: an event has nowhere to live in a line computed from state, so the
// slice carries one. It is deliberately not a stack — the newest message is the
// only one worth saying, exactly as the old lab's `setStatus` overwrites.
test('a notice replaces the one before it, and can be taken back', () => {
  reset()
  const library = () => useStore.getState().library

  expect(library().notice).toBeNull()

  library().notify({ kind: 'loading', name: '8x8/sha256-0' })
  expect(library().notice).toEqual({ kind: 'loading', name: '8x8/sha256-0' })

  library().notify({ kind: 'viewSaved', name: '8x8/sha256-0' })
  expect(library().notice?.kind).toBe('viewSaved')

  library().clearNotice()
  expect(library().notice).toBeNull()
})

// The two live beside each other: a board file that would not read is a state
// the line keeps saying, while a notice is a thing that just happened.
test('a notice does not disturb a board failure, or the sizes', () => {
  reset()
  const library = () => useStore.getState().library
  library().listed(sizesFixture())
  library().boardFailed({ name: '8x8/sha256-0', reason: 'HTTP 404' })

  library().notify({ kind: 'deleteFailed' })

  expect(library().boardError?.reason).toBe('HTTP 404')
  expect(library().sizes).toHaveLength(2)
})

test('reset takes the notice away with everything else', () => {
  reset()
  const library = () => useStore.getState().library
  library().notify({ kind: 'deleted', name: '8x8/sha256-0' })
  library().reset()
  expect(library().notice).toBeNull()
})
```

- [ ] **Step 2: Run it and watch it fail**

Run: `pnpm --dir apps/lab exec vitest run --project node src/state/library.slice.test.ts`
Expected: FAIL — `notify` is not a function.

- [ ] **Step 3: Implement**

In `apps/lab/src/state/library.slice.ts`, above `LibraryState`:

```ts
/**
 * Something the library did, as opposed to something it is. The status line
 * computes a stored board's own description from `result.preview`; these five
 * report an event, and a line computed from state alone has nowhere to put one
 * (spec §5.3, PR 5b). `loading` is the only one cleared by its own outcome
 * rather than by a timer — it describes a fetch that is still going.
 *
 * `name` is the `<size>/<id>` the dictionary's formatter puts inside its
 * sentence, carried as data for the same reason `BoardError` carries its two
 * halves apart: the words belong to the dictionary.
 */
export type LibraryNotice =
  | { kind: 'loading'; name: string }
  | { kind: 'viewSaved'; name: string }
  | { kind: 'deleted'; name: string }
  | { kind: 'saveFailed' }
  | { kind: 'deleteFailed' }
```

Add to the `LibraryState` interface, after `boardError`:

```ts
  /** What the library has just done, which the status line says once. */
  notice: LibraryNotice | null
  notify(notice: LibraryNotice): void
  clearNotice(): void
```

And in `createLibrarySlice`, beside the other fields:

```ts
    notice: null,
    notify: (notice) => patch({ notice }),
    clearNotice: () => patch({ notice: null }),
```

Add `notice: null` to the object `reset` passes to `patch`.

- [ ] **Step 4: Reset it in the harness**

In `apps/lab/src/harness/mountApp.tsx`, `resetApp` already calls `state.library.reset()`, which now clears the notice — **verify this by reading the function, and add nothing if it is already there.** A whole-app case that leaves a notice behind would otherwise decide the status line of the next one.

- [ ] **Step 5: Run it and watch it pass**

Run: `pnpm --dir apps/lab exec vitest run --project node src/state/library.slice.test.ts`
Expected: PASS.

- [ ] **Step 6: Commit**

```bash
pnpm --dir apps/lab exec prettier --write src/state/library.slice.ts src/state/library.slice.test.ts
git add apps/lab/src/state/library.slice.ts apps/lab/src/state/library.slice.test.ts
git commit -m "Give the library a notice, because an event has no home in a computed line"
```

---

## Task 3: A stored board's view can be changed

**Files:**
- Modify: `apps/lab/src/state/result.slice.ts`
- Test: `apps/lab/src/state/result.slice.test.ts` (append)

**Interfaces:**
- Consumes: `StoredBoard` (already in the slice).
- Produces: `previewView(view: View): void` on `ResultState`, used by Tasks 6 and 7.

**Why here and not in a new slice (Ruling 4):** `BoardFrame` draws a stored board from `preview.meta.view`. The value the stage reads is the value an edit must move.

- [ ] **Step 1: Write the failing test**

Append to `apps/lab/src/state/result.slice.test.ts`:

```ts
// Ruling 4: the stage draws a stored board from `preview.meta.view`, so that is
// what an edited field moves. The board and the file are untouched — nothing
// was regenerated, and the very same file goes back to the store.
test('a new preview view moves the meta, and leaves the board and the file', () => {
  const { meta, file } = storedFixture(3)
  const board = decodeBoard(file)
  result().showPreview({ board, file, meta })

  result().previewView({ ...meta.view, stroke: 0.9, colored: true })

  const after = useStore.getState().result.preview
  expect(after?.meta.view.stroke).toBe(0.9)
  expect(after?.meta.view.colored).toBe(true)
  expect(after?.board).toBe(board)
  expect(after?.file).toBe(file)
  // Everything else the meta knows is still the meta's: this is an edit to one
  // field of it, not a new meta built from a view.
  expect(after?.meta.id).toBe(meta.id)
  expect(after?.meta.command).toBe(meta.command)
})

// The same guard `stored` and `exported` have: an answer for a board nobody is
// looking at changes nothing.
test('a new preview view without a preview does nothing', () => {
  useStore.getState().result.reset()
  const before = useStore.getState().result
  result().previewView({ ...storedFixture(3).meta.view, stroke: 0.9 })
  expect(useStore.getState().result).toBe(before)
})
```

- [ ] **Step 2: Run it and watch it fail**

Run: `pnpm --dir apps/lab exec vitest run --project node src/state/result.slice.test.ts`
Expected: FAIL — `previewView` is not a function.

- [ ] **Step 3: Implement**

Add to the `ResultState` interface, after `clearPreview`:

```ts
  /**
   * A new view for the stored board on screen. The board and its file are
   * untouched: nothing is regenerated, and the same file goes back to the
   * store with the new view in its meta (Ruling 4). A no-op with no preview,
   * as `stored` and `exported` are for a file no longer shown.
   */
  previewView(view: View): void
```

Import the type — `import type { BoardData, BoardFile, BoardMeta, Params, View } from '@arrowz/engine'` — and implement in `createResultSlice`, beside `showPreview`:

```ts
    previewView: (view) =>
      set((state) =>
        state.result.preview === null
          ? state
          : { result: { ...state.result, preview: { ...state.result.preview, meta: { ...state.result.preview.meta, view } } } },
      ),
```

- [ ] **Step 4: Run it and watch it pass**

Run: `pnpm --dir apps/lab exec vitest run --project node src/state/result.slice.test.ts`
Expected: PASS.

- [ ] **Step 5: Commit**

```bash
pnpm --dir apps/lab exec prettier --write src/state/result.slice.ts src/state/result.slice.test.ts
git add apps/lab/src/state/result.slice.ts apps/lab/src/state/result.slice.test.ts
git commit -m "Let a stored board's view change, in the meta the stage draws from"
```

---

## Task 4: One view field, two owners

**Files:**
- Modify: `apps/lab/src/console/ViewPanel.tsx`, `apps/lab/src/simple/SimplePanel.tsx`
- Test: `apps/lab/src/console/ViewPanel.browser.test.tsx` (append two cases; every existing case must go on passing unchanged), `apps/lab/src/simple/SimplePanel.browser.test.tsx` (append one)

**Interfaces:**
- Consumes: `VIEW_RANGE`, `viewNumberOf` from `@arrowz/engine/command`.
- Produces, used by Task 6:
  - `ViewNumberField({ field, value, onCommit }: { field: ViewField; value: number; onCommit(value: number): void })`
  - `ViewFlagSwitch({ flag, label, on, onToggle }: { flag: ViewFlag; label: …; on: boolean; onToggle(): void })`

**Why (Ruling 2, and the commitment in PR #65):** the library needs the same three numbers with the same bounds. `carve.test.ts` guards the old lab's eight fields against `VIEW_RANGE` today and dies with `lab.html` in PR 8; reusing this component is what keeps the library's three measured after that. The components must therefore stop reading the store, so the detail can own its values.

- [ ] **Step 1: Write the failing test**

Append to `apps/lab/src/console/ViewPanel.browser.test.tsx`:

```ts
// Ruling 2: the field is the caller's now. A second owner (the library's
// detail, Task 6) gives it a different value and a different sink, and the
// clamp has to happen inside the field — otherwise each owner would have to
// remember to clamp, and one of them would not.
test('a field hands its owner an already-clamped number', async () => {
  let got = null as number | null
  const screen = await render(
    <ViewNumberField field={{ field: 'stroke', label: 'strokeLabel', step: 0.05 }} value={0.5} onCommit={(v) => (got = v)} />,
  )
  const stroke = screen.getByRole('spinbutton', { name: /stroke/i })
  await userEvent.fill(stroke, '9')
  await userEvent.tab()
  // 2 is `VIEW_RANGE.stroke.max`; the owner never sees the 9 that was typed.
  expect(got).toBe(2)
  // And the lab's own slice was not touched by a field nobody pointed at it.
  expect(view().stroke).toBe(0.5)
})

test('a flag switch reports a press without writing any store', async () => {
  let presses = 0
  const screen = await render(
    <ViewFlagSwitch flag="colored" label="colored" on={false} onToggle={() => (presses += 1)} />,
  )
  await screen.getByRole('switch', { name: /colour the arrows/i }).click()
  expect(presses).toBe(1)
  expect(view().colored).toBe(false)
})
```

Import `ViewNumberField` and `ViewFlagSwitch` beside `ViewPanel` at the top of the file.

- [ ] **Step 2: Run it and watch it fail**

Run: `pnpm --dir apps/lab exec vitest run src/console/ViewPanel.browser.test.tsx`
Expected: FAIL — the components ignore the props and still write the store, so `got` stays `null` and `view().stroke` moves.

- [ ] **Step 3: Implement**

In `apps/lab/src/console/ViewPanel.tsx`, change `ViewNumberField` to take its value and its sink, and to clamp on the way out. Replace the component's head and its `commit`:

```tsx
export function ViewNumberField({
  field,
  value,
  onCommit,
}: {
  field: ViewField
  value: number
  onCommit(value: number): void
}) {
  const dict = useDictionary()
  const ref = useRef<HTMLInputElement>(null)
  // The engine's own bounds, not a copy of them: `commit` clamps through
  // `viewNumberOf`, which reads the same table, so the box cannot declare a
  // ceiling different from the one it enforces.
  const range = VIEW_RANGE[field.field]

  useEffect(() => {
    const node = ref.current
    if (node && document.activeElement !== node) node.value = String(value)
  }, [value])

  // The clamp lives here rather than in each owner: the lab's slice clamps in
  // `setNumber` and the library's detail has no slice to clamp in, so a field
  // that handed on what was typed would leave one of its two owners to
  // remember. The box then shows what was actually kept.
  const commit = () => {
    const node = ref.current
    if (!node) return
    const kept = viewNumberOf(node.value, field.field)
    onCommit(kept)
    node.value = String(kept)
  }
```

The JSX below is unchanged except that `defaultValue={String(value)}` stays as it is. Change the import line to `import { VIEW_RANGE, viewNumberOf } from '@arrowz/engine/command'` and drop `useStore` if nothing else in the file uses it.

Change `ViewFlagSwitch` the same way:

```tsx
export function ViewFlagSwitch({
  flag,
  label,
  on,
  onToggle,
}: {
  flag: ViewFlag
  label: (typeof VIEW_FLAGS)[number]['label']
  on: boolean
  onToggle(): void
}) {
  const dict = useDictionary()
  return (
    <div className="fw-k">
      <div className="row">
        <span className="lab" id={`view-${flag}-label`}>
          {dict.t(label)}
        </span>
        <button
          type="button"
          className="fw-sw"
          role="switch"
          aria-checked={on}
          aria-labelledby={`view-${flag}-label`}
          onClick={onToggle}
        />
      </div>
    </div>
  )
}
```

`ViewPanel` becomes the first owner, and it is where the lab's store reads move to:

```tsx
export function ViewPanel() {
  const dict = useDictionary()
  const view = useStore((state) => state.view)
  return (
    <div className="fw-knobs" role="tabpanel" id={panelId('preview')} aria-labelledby={tabId('preview')}>
      <div className="fw-khd">
        <b>{dict.t('preview')}</b>
      </div>
      <div className="fw-grid">
        {VIEW_FIELDS.map((field) => (
          <ViewNumberField
            key={field.field}
            field={field}
            value={view[field.field]}
            onCommit={(value) => view.setNumber(field.field, String(value))}
          />
        ))}
        {VIEW_FLAGS.map(({ flag, label }) => (
          <ViewFlagSwitch key={flag} flag={flag} label={label} on={view[flag]} onToggle={() => view.toggle(flag)} />
        ))}
      </div>
    </div>
  )
}
```

`setNumber` takes the typed string and runs `viewNumberOf` itself; passing it an already-clamped number as a string is idempotent, so the slice keeps its tolerant entry point and the panel needs no second one. Review round 1 proved that rather than assuming it: `viewNumberOf(String(viewNumberOf(raw, f)), f)` against the built engine, over 36 hand-picked edge strings and 200 000 random ones per field in decimal, exponential and fixed forms — zero differences under `Object.is`, `cell` and `top`'s `whole: true` included.

- [ ] **Step 3b: Convert the third owner, `SimplePanel`**

`apps/lab/src/simple/SimplePanel.tsx` renders the same two components and must change with them (Ruling 2), or `verify` goes red on `tsc` while the simple view's own tests stay green over a field that opens empty and throws on blur. It already selects `setMany`; add the view slice beside it:

```tsx
  const view = useStore((state) => state.view)
```

and pass the same pair through its two `map` bodies, leaving the surrounding JSX alone:

```tsx
        {fields.map((field) => (
          <ViewNumberField
            key={field.field}
            field={field}
            value={view[field.field]}
            onCommit={(value) => view.setNumber(field.field, String(value))}
          />
        ))}
        {flags.map(({ flag, label }) => (
          <ViewFlagSwitch key={flag} flag={flag} label={label} on={view[flag]} onToggle={() => view.toggle(flag)} />
        ))}
```

Then give that owner the case it never had, appended to `apps/lab/src/simple/SimplePanel.browser.test.tsx`:

```ts
// The third owner of the shared field (Ruling 2). No case here committed a view
// field before, which is why `tsc` was the only thing between this panel and a
// field that opens empty and throws `onCommit is not a function` on blur.
test('a view field in the simple panel still writes the lab’s view', async () => {
  const screen = await render(<SimplePanel control={/* the control this file already builds */} />)
  const stroke = screen.getByRole('spinbutton', { name: /stroke/i })
  await userEvent.fill(stroke, '0.8')
  await userEvent.tab()
  expect(useStore.getState().view.stroke).toBe(0.8)
})
```

Copy the `control` expression from the cases already in that file rather than inventing a helper.

- [ ] **Step 4: Run the whole console suite**

Run: `pnpm --dir apps/lab exec vitest run src/console/`
Expected: PASS, including the two cases that existed before — "a number field commits on blur, clamped to what the CLI takes" and "every number field declares the bounds the engine actually takes". If the second fails, the `min`/`max` attributes stopped coming from `VIEW_RANGE`; that is the regression this whole task exists to make impossible, so fix the component, never the test.

- [ ] **Step 5: Type-check**

Run: `pnpm --dir apps/lab run check`
Expected: clean. `vitest run` does not catch a locator typed as `HTMLElement` where `HTMLInputElement` was meant.

- [ ] **Step 6: Commit**

```bash
pnpm --dir apps/lab exec prettier --write src/console/ViewPanel.tsx src/console/ViewPanel.browser.test.tsx src/simple/SimplePanel.tsx src/simple/SimplePanel.browser.test.tsx
git add apps/lab/src/console apps/lab/src/simple
git commit -m "Hand the view field its value, so a third owner can have one too"
```

---

## Task 5: The panel becomes two rows

**Files:**
- Create: `apps/lab/src/library/LibraryPanel.tsx`
- Modify: `apps/lab/src/library/BoardList.tsx`, `apps/lab/src/console/Console.tsx`, `apps/lab/src/design/library.css`
- Test: `apps/lab/src/library/LibraryPanel.browser.test.tsx` (its `mountPanel` helper changes; every existing case must go on passing)

**Interfaces:**
- Consumes: `useLibraryList`, `BoardList`.
- Produces: `LibraryPanel(): ReactElement`, and `BoardList({ refresh }: { refresh(): void })` — the list no longer fetches for itself. Task 6 fills the panel's second row.

**Why (Ruling 1):** the detail has to stay on screen while the rows scroll, and only one component may call `useLibraryList`.

- [ ] **Step 1: Write the failing test**

In `apps/lab/src/library/LibraryPanel.browser.test.tsx`, replace the `mountPanel` helper so it mounts the panel rather than the list directly:

```tsx
async function mountPanel(path = '/boards') {
  return render(
    <MemoryRouter initialEntries={[path]}>
      <div className="fw">
        <SizeChips />
        <LibraryPanel />
        <Address />
      </div>
    </MemoryRouter>,
  )
}
```

Import `LibraryPanel` and drop the now-unused `BoardList` import — `noUnusedLocals` is a gate. Then append:

```ts
// No geometry case here. The panel's second row is empty until Task 6 builds
// the detail, so a case written at this commit can only measure a grid with one
// occupied track — which is how the first two attempts at it passed over a
// 30px list and then over no list at all (review rounds 1 and 2). Ruling 1 is
// measured where the detail exists: Task 6, and again in the real console at
// 860x900 in Task 11.

// The hook's guard only stops a second fetch once an answer is in, so two
// callers against an empty cache would both fetch (spec §5.1, PR 5b).
// One caller, one fetch per mount. Not "exactly one ever": under StrictMode the
// mount effect runs twice and `useLibraryList`'s guard sees `sizes === null`
// both times, because the first answer has not landed — so the application
// fetches twice and drops the first answer (`listDropped`). That is the hook's
// own behaviour, unchanged by this plan, and `vitest-browser-react` renders
// without StrictMode, so this case measures the panel and not that.
test('the listing is fetched once per mount, however many children want refreshing', async () => {
  const calls = vi.spyOn(globalThis, 'fetch')
  await mountPanel()
  await expect.poll(() => calls.mock.calls.filter(([url]) => String(url).includes('/api/boards')).length).toBe(1)
})
```

Add nothing else to this file's imports. The geometry case moved to Task 6, so `page` is not used here, and an unused import fails `tsc` under `noUnusedLocals` — review round 3 hit exactly that at the next task's type check.

- [ ] **Step 2: Run it and watch it fail**

Run: `pnpm --dir apps/lab exec vitest run src/library/LibraryPanel.browser.test.tsx`
Expected: FAIL — there is no `LibraryPanel` module.

- [ ] **Step 3: Implement the panel**

Create `apps/lab/src/library/LibraryPanel.tsx`:

```tsx
import { type ReactElement } from 'react'
import { useDictionary } from '../i18n'
import { BoardList } from './BoardList'
import { useLibraryList } from './useLibraryList'

/**
 * The console's panel track in the library face: the rows in a row that
 * scrolls, and the detail in one that does not (spec §5.1, PR 5b). The old lab
 * scatters the same controls across the aside and the list; one block under the
 * list is what Ruling 1 of the previous plan left room for.
 *
 * `useLibraryList` is called here and nowhere else. Its guard only stops a
 * second fetch after an answer has arrived, so two children calling it against
 * an empty cache would both fetch; `refresh` goes down instead.
 */
export function LibraryPanel(): ReactElement {
  const dict = useDictionary()
  const { refresh } = useLibraryList()
  return (
    <section className="fw-lib-panel" aria-label={dict.t('tabLibrary')}>
      <BoardList refresh={refresh} />
    </section>
  )
}
```

(The `aria-label` here is the one §7.2 splits apart in Task 10; leave it as `tabLibrary` for now so this task adds no dictionary key.)

In `BoardList.tsx`, take `refresh` as a prop and delete the `useLibraryList` call and its import:

```tsx
export function BoardList({ refresh }: { refresh(): void }): ReactElement {
```

In `Console.tsx`, the library face renders the panel: replace `<BoardList />` with `<LibraryPanel />` and swap the import. Leave the comment above the component, and extend its last sentence to say the detail now lives inside that panel.

- [ ] **Step 4: Implement the rows**

In `apps/lab/src/design/library.css`, add **above** any media query in the file:

```css
/* The panel's two rows (spec §5.1, PR 5b). Both are bounded, and Ruling 1 says
   why: an `auto` detail row is content-sized with no ceiling, and measured at
   860x900 it left no list at all and overflowed the console by 75px. The floor
   is 200px because the list's Refresh head takes 34 and its padding 24, so
   140 showed one row where two were claimed; 45% gives way on a short panel.
   `minmax(0, auto)` lets the detail shrink below its content and scroll. */
.fw-lib-panel {
  display: grid;
  grid-template-rows: minmax(min(200px, 45%), 1fr) minmax(0, auto);
  min-height: 0;
  background: var(--void);
}
```

`.fw-lib-list` keeps `overflow-y: auto` and `min-height: 0`; it is now a grid item of the panel rather than of the console.

- [ ] **Step 5: Run the library and console suites**

Run: `pnpm --dir apps/lab exec vitest run src/library/ src/console/`
Expected: PASS, the seven older panel cases included.

- [ ] **Step 6: Commit**

```bash
pnpm --dir apps/lab exec prettier --write src/library/LibraryPanel.tsx src/library/BoardList.tsx src/console/Console.tsx src/design/library.css src/library/LibraryPanel.browser.test.tsx
git add apps/lab/src/library apps/lab/src/console/Console.tsx apps/lab/src/design/library.css
git commit -m "Split the library panel into a scrolling list and a row beneath it"
```

---

## Task 6: The detail itself — command, fields, and load into lab

**Files:**
- Create: `apps/lab/src/library/libraryFields.ts`, `apps/lab/src/library/BoardDetail.tsx`, `apps/lab/src/library/BoardDetail.browser.test.tsx`
- Modify: `apps/lab/src/library/LibraryPanel.tsx`, `apps/lab/src/design/library.css`

**Interfaces:**
- Consumes: `ViewNumberField`, `ViewFlagSwitch` (Task 4), `result.preview`, `useInLibrary`, `readParams`, `params.setMany`, `ui.raiseClamped`, the `view` slice's `setNumber`/`setFlag`.
- Produces: `BoardDetail(): ReactElement | null`. Task 7 gives it a `refresh` prop and a view sink; Task 8 gives it the delete.

**What it shows:** the meta's own `command` with a Copy button, the three numbers and two flags of the stored view, *Load into lab*, and (from Task 8) Delete. It renders `null` when the address names no board (Ruling 6).

- [ ] **Step 1: Write the failing test**

Create `apps/lab/src/library/BoardDetail.browser.test.tsx`:

```tsx
import { decodeBoard } from '@arrowz/engine'
import { act, type ReactNode } from 'react'
import { MemoryRouter, useLocation } from 'react-router'
import { page, userEvent } from 'vitest/browser'
import { render } from 'vitest-browser-react'
import { afterEach, beforeEach, expect, test, vi } from 'vitest'
import { storedFixture } from '../state/library.fixtures'
import { useStore } from '../state/store'
import { BoardDetail } from './BoardDetail'
import { LibraryPanel } from './LibraryPanel'
// The geometry case measures the real cascade, so it needs the real
// stylesheets — without them `.fw-lib-list` never scrolls and the case passes
// on a layout that does not exist (review round 3).
import '../design/tokens.css'
import '../design/console.css'
import '../design/library.css'

const stored = storedFixture(1)

beforeEach(() => {
  const state = useStore.getState()
  state.result.reset()
  state.library.reset()
  state.params.reset()
  state.lang.setLang('en')
  vi.spyOn(globalThis, 'fetch').mockImplementation(() => new Promise(() => {}))
})

afterEach(() => {
  vi.restoreAllMocks()
})

function Address() {
  return <p data-testid="address">{useLocation().pathname}</p>
}

async function mountDetail(path = `/boards/8x8/${stored.meta.id}`, children?: ReactNode) {
  return render(
    <MemoryRouter initialEntries={[path]}>
      <div className="fw">
        <BoardDetail />
        <Address />
        {children}
      </div>
    </MemoryRouter>,
  )
}

/** Puts a stored board on the stage, the way `useStoredBoard` would. */
async function show() {
  await act(async () =>
    useStore.getState().result.showPreview({ board: decodeBoard(stored.file), file: stored.file, meta: stored.meta }),
  )
}

// Ruling 6: nothing to describe, nothing to show — and no Delete button
// pointing at no board.
test('there is no detail until the address’s board is on the stage', async () => {
  const screen = await mountDetail()
  expect(screen.container.querySelector('.fw-lib-detail')).toBeNull()
  await show()
  await expect.element(screen.getByRole('button', { name: /load into lab/i })).toBeVisible()
})

// Ruling 15, and the reason the case above mounts at the board's address: a
// preview alone is not enough. Review round 2 measured the first version of
// that case waiting fifteen seconds at `/boards` for a detail that Ruling 15
// forbids — the plan asserted the opposite of its own ruling.
test('a preview the address does not name shows no detail', async () => {
  const screen = await mountDetail('/boards')
  await show()
  expect(screen.container.querySelector('.fw-lib-detail')).toBeNull()
})

// Ruling 15 compares the id and nothing else. The store names a size after its
// directory, so a folder called `08x08` lists boards whose `W` is 8 — and a
// `WxH` comparison would hide the detail of a board the stage and the status
// line are both describing. No other fixture exercises this (review round 3).
test('a size the directory spells differently still gets its detail', async () => {
  const screen = await mountDetail(`/boards/08x08/${stored.meta.id}`)
  await show()
  await expect.element(screen.getByRole('button', { name: /load into lab/i })).toBeVisible()
})

test('the detail prints the command the store holds for this board', async () => {
  const screen = await mountDetail()
  await show()
  await expect.element(screen.getByText(stored.meta.command)).toBeVisible()
})

// Parity: the library's three numbers and two flags, and no more. `cell` and
// `top` are not here — a stored board carries no highlight, and its cell is the
// export it was saved with (Ruling 3).
test('the stored view is offered as three numbers and two switches', async () => {
  const screen = await mountDetail()
  await show()
  const numbers = [...screen.container.querySelectorAll<HTMLInputElement>('.fw-lib-detail input[type="number"]')]
  expect(numbers.map((input) => input.id)).toEqual(['view-stroke', 'view-headWidth', 'view-headHeight'])
  expect(numbers[0]?.value).toBe(String(stored.meta.view.stroke))
  expect(screen.container.querySelectorAll('.fw-lib-detail [role="switch"]')).toHaveLength(2)
})

// Ruling 9, and the old lab's own comment: "Loading sets the knobs and the view
// but does NOT generate". `setMany` leaves `edits` alone, which is the only
// thing `useAutoRun` watches, so no run can start from this.
test('load into lab sets the knobs and the view, goes to the lab, and starts nothing', async () => {
  const screen = await mountDetail()
  await show()
  const edits = useStore.getState().params.edits

  await userEvent.click(screen.getByRole('button', { name: /load into lab/i }))

  expect(useStore.getState().params.values.seed).toBe(stored.meta.params.seed)
  expect(useStore.getState().view.stroke).toBe(stored.meta.view.stroke)
  // A stored view's `top` is 0, so the highlight lands off — the old lab's
  // behaviour, not an oversight.
  expect(useStore.getState().view.hilite).toBe(false)
  expect(useStore.getState().params.edits).toBe(edits)
  await expect.element(screen.getByTestId('address')).toHaveTextContent('/')
})

// Ruling 1, measured where the detail exists. Two earlier versions of this
// case passed over a broken layout — one mounted the panel with no height at
// all, the other measured the detail's box while its buttons sat below the
// window. This one asks the only question that matters: can the two actions be
// reached? `toBeVisible()` cannot answer it (harness facts).
test('the detail keeps its buttons on screen while the list scrolls', async () => {
  await page.viewport(860, 900)
  const screen = await render(
    <MemoryRouter initialEntries={[`/boards/8x8/${stored.meta.id}`]}>
      <div className="fw" style={{ height: '380px', display: 'grid', gridTemplateRows: 'minmax(0, 1fr)' }}>
        <LibraryPanel />
      </div>
    </MemoryRouter>,
  )
  // Numbered from 02, and that is not arbitrary: `storedFixture(1)` builds its
  // id as `sha256-` + `01` repeated, so it ends in `01` — and a row generated
  // with that suffix *is* the board this case also shows. The task review of
  // this plan measured the first version: 41 entries of which two shared an id,
  // a duplicate React key, and two rows both carrying `aria-current`.
  const many = Array.from({ length: 40 }, (_, i) => ({
    ...stored.meta,
    id: `${stored.meta.id.slice(0, -2)}${String(i + 2).padStart(2, '0')}`,
  }))
  await act(async () => {
    useStore.getState().library.listed([{ size: '8x8', W: 8, H: 8, cells: 64, boards: [stored.meta, ...many] }])
  })
  await show()

  const panel = screen.container.querySelector<HTMLElement>('.fw-lib-panel')
  const list = screen.container.querySelector<HTMLElement>('.fw-lib-list')
  const buttons = screen.container.querySelector<HTMLElement>('.fw-lib-buttons')
  if (panel === null || list === null || buttons === null) throw new Error('the panel is missing a row')
  expect(list.scrollHeight).toBeGreaterThan(list.clientHeight)
  // The floor, so there is a list at all: without it this case cannot see the
  // grid change, only the sticky buttons (measured by review round 3's
  // mutations 9 and 10, which each tripped one case and not the other).
  expect(list.clientHeight).toBeGreaterThanOrEqual(120)
  expect(buttons.getBoundingClientRect().bottom).toBeLessThanOrEqual(panel.getBoundingClientRect().bottom + 1)
})
```

- [ ] **Step 2: Run it and watch it fail**

Run: `pnpm --dir apps/lab exec vitest run src/library/BoardDetail.browser.test.tsx`
Expected: FAIL — no `BoardDetail` module.

- [ ] **Step 3: Implement the field list**

Create `apps/lab/src/library/libraryFields.ts`:

```ts
import type { ViewField } from '../console/viewFields'
import type { ViewFlag } from '../state/view.slice'

/**
 * What a stored board's view offers for editing: the same three numbers the old
 * lab's `libStroke`, `libHeadWidth` and `libHeadHeight` offer, and the two flags
 * beside them.
 *
 * Its own constant, and not `SIMPLE_VIEW_FIELDS`, though the three names
 * coincide (Ruling 3). The simple view holds this trio because `cell` and `top`
 * are advanced; the library holds it because a stored board carries no
 * highlight and its `cell` is the export it was saved with. Sharing one list
 * would make a change to the simple view a silent change here.
 */
export const LIBRARY_VIEW_FIELDS: readonly ViewField[] = [
  { field: 'stroke', label: 'strokeLabel', step: 0.05 },
  { field: 'headWidth', label: 'headWidthLabel', step: 0.05 },
  // No `help` on `headHeight`, and this is a trade rather than parity
  // (Ruling 17): the old lab's library *does* show that paragraph
  // (`lab.html`'s `libView`), with `help` checked by default. It is nine lines
  // in a 190px column, a grid row is as tall as its tallest cell, and it adds
  // 120px to the detail at 1400 and 138px at 860 — in a panel that is half a
  // 385px console. The same explanation is one tab away in the lab's preview.
  { field: 'headHeight', label: 'headHeightLabel', step: 0.05 },
]

export const LIBRARY_VIEW_FLAGS: readonly { flag: ViewFlag; label: 'rounded' | 'colored' }[] = [
  { flag: 'rounded', label: 'rounded' },
  { flag: 'colored', label: 'colored' },
]
```

- [ ] **Step 4: Implement the detail**

Create `apps/lab/src/library/BoardDetail.tsx`:

```tsx
import { readParams } from '@arrowz/engine'
import { type ReactElement, useEffect, useRef, useState } from 'react'
import { useNavigate } from 'react-router'
import { ViewFlagSwitch, ViewNumberField } from '../console/ViewPanel'
import { useDictionary } from '../i18n'
import { useStore } from '../state/store'
import { LIBRARY_VIEW_FIELDS, LIBRARY_VIEW_FLAGS } from './libraryFields'
import { useOpenBoard } from './useOpenBoard'

/**
 * One stored board's detail, under the list (spec §5.1, §10 row 5b). It is the
 * old lab's three boxes — `libCommandBox`, `libView` and `libDetail` — gathered
 * into one, because here they are one thing: what this board is and what can be
 * done with it.
 *
 * Absent rather than disabled when the address names no board (Ruling 6): an
 * empty command box and a Delete button with nothing to delete are worse than
 * nothing at all.
 */
export function BoardDetail(): ReactElement | null {
  const dict = useDictionary()
  const preview = useStore((state) => state.result.preview)
  const open = useOpenBoard()
  const navigate = useNavigate()
  const [copied, setCopied] = useState(false)
  const timer = useRef<ReturnType<typeof setTimeout> | undefined>(undefined)

  // A component unmounted inside the confirmation window must not write state
  // afterwards; StrictMode makes that happen in tests.
  useEffect(() => () => clearTimeout(timer.current), [])

  // Ruling 15: not merely "is there a preview", but "is it this address's".
  // The hook leaves the board before this one on the stage until the next file
  // lands, and in that window the detail would describe — and offer to delete —
  // the board the user has just clicked away from.
  //
  // The id alone. A layout hash already binds the board to its dimensions,
  // while the address's size is a directory name: review round 2 measured a
  // folder called `08x08` listing boards whose `W` is 8, where a `WxH`
  // comparison hid the detail of a board the stage and the line both described.
  if (preview === null || preview.meta.id !== open.id) return null
  const meta = preview.meta

  const copy = () => {
    const clipboard = navigator.clipboard
    // Undefined outside a secure context, where the interface is not exposed
    // at all — the same guard `LiveCommand` carries, and for the same reason:
    // the button staying on its normal label is the honest signal.
    if (clipboard === undefined) return
    void clipboard
      .writeText(meta.command)
      .then(() => {
        setCopied(true)
        clearTimeout(timer.current)
        timer.current = setTimeout(() => setCopied(false), 1200)
      })
      .catch(() => {})
  }

  // Ruling 9, parity with the old lab's `libLoad`: the knobs, then the view,
  // then the lab — and no run. `setMany` is the machine path and does not move
  // `edits`, which is the only thing `useAutoRun` watches.
  const loadIntoLab = () => {
    const { params, ui, view } = useStore.getState()
    ui.raiseClamped(params.setMany(readParams(meta.params)))
    const stored = meta.view
    view.setNumber('cell', String(stored.cell))
    view.setNumber('stroke', String(stored.stroke))
    view.setNumber('headWidth', String(stored.headWidth))
    view.setNumber('headHeight', String(stored.headHeight))
    view.setFlag('rounded', stored.rounded !== false)
    view.setFlag('colored', stored.colored)
    // A stored board carries no highlight, so this lands off; when one somehow
    // does, its count comes with it, as the old lab copies it.
    view.setFlag('hilite', stored.top > 0)
    if (stored.top > 0) view.setNumber('top', String(stored.top))
    void navigate('/')
  }

  return (
    <div className="fw-lib-detail">
      <figure className="fw-cmdfig" aria-label={dict.t('boardCommand')}>
        <figcaption className="fw-cmdhd">
          <span className="caps">{dict.t('boardCommand')}</span>
          <button type="button" onClick={copy}>
            {copied ? dict.t('copied') : dict.t('copy')}
          </button>
        </figcaption>
        <pre className="fw-cmd">{meta.command}</pre>
      </figure>
      <div className="fw-grid">
        {LIBRARY_VIEW_FIELDS.map((field) => (
          <ViewNumberField key={field.field} field={field} value={meta.view[field.field]} onCommit={() => {}} />
        ))}
        {LIBRARY_VIEW_FLAGS.map(({ flag, label }) => (
          <ViewFlagSwitch
            key={flag}
            flag={flag}
            label={label}
            on={flag === 'rounded' ? meta.view.rounded !== false : meta.view.colored}
            onToggle={() => {}}
          />
        ))}
      </div>
      <div className="fw-lib-buttons">
        <button type="button" onClick={loadIntoLab}>
          {dict.t('loadIntoLab')}
        </button>
      </div>
    </div>
  )
}
```

The two empty callbacks are deliberate and last exactly one task: Task 7 replaces them with the view sink. Leave a `// Task 7 gives these a sink.` comment on the line above the grid so a reviewer of this commit does not read them as a bug.

Render it from `LibraryPanel`, under the list:

```tsx
      <BoardList refresh={refresh} />
      <BoardDetail />
```

- [ ] **Step 5: Style it**

Append to `library.css`, still above any media query:

```css
/* The detail's own block: the row the panel keeps (Ruling 1). `min-height: 0`
   and `overflow-y: auto` are what let the bounded row actually bound it — the
   pair Ruling 1 stands on, and review round 2 measured what their absence
   costs: at 860x900 the content ran 64px past the box, unreachable, and the
   document itself overflowed by 65px. */
.fw-lib-detail {
  display: grid;
  gap: 10px;
  padding: 12px 16px;
  border-top: 1px solid var(--border);
  background: var(--graphite);
  min-height: 0;
  overflow-y: auto;
}
/* Pinned to the bottom of that scrolling box (Ruling 16). Below about 1046px of
   panel width the field grid wraps to two rows and the buttons were pushed off
   the viewport at every size review round 2 measured but 1400x900 and wider —
   a detail whose two actions cannot be reached is not a detail. Sticky keeps
   them on screen while the fields scroll under them; the background is the
   detail's own, so the fields do not show through. */
.fw-lib-buttons {
  position: sticky;
  bottom: 0;
  display: flex;
  gap: 8px;
  padding-top: 8px;
  background: var(--graphite);
}
```

- [ ] **Step 6: Run and commit**

Run: `pnpm --dir apps/lab exec vitest run src/library/` then `pnpm --dir apps/lab run check`
Expected: PASS and clean.

```bash
pnpm --dir apps/lab exec prettier --write src/library src/design/library.css
git add apps/lab/src/library apps/lab/src/design/library.css
git commit -m "Show a stored board's command and view, and load it back into the lab"
```

---

## Task 7: An edited view redraws now and reaches the store later

**Files:**
- Create: `apps/lab/src/library/notices.ts`, `apps/lab/src/library/useViewSave.ts`, `apps/lab/src/library/useViewSave.browser.test.tsx`
- Modify: `apps/lab/src/library/BoardDetail.tsx`, `apps/lab/src/library/LibraryPanel.tsx`

**Interfaces:**
- Consumes: `result.previewView` (Task 3), `library.notify`/`clearNotice` (Task 2), `saveBoard`, `storeRequest`.
- Produces:
  - `raiseNotice(notice: LibraryNotice): void` and `cancelNoticeFade(): void` in `notices.ts` — raise a notice, and fade it 1200 ms later unless it describes a state (Ruling 5). Task 8 raises notices too.
  - `cancelPendingSave(): void` — drops a write that has not happened yet. Task 8 calls it before deleting (Ruling 12).
  - `useViewSave(refresh: () => void): (view: View) => void` — redraw now, store 350 ms later.

**The sequence, which is the old lab's `onLibViewInput` and `saveLibView`:** an edit moves `preview.meta.view` (the stage redraws from it), a 350 ms timer restarts, and when it fires the same file goes back to the store with the new view in its meta. Nothing is regenerated. A save that fails says so and **leaves the picture alone** (Ruling 8).

- [ ] **Step 1: Write the failing test**

Create `apps/lab/src/library/useViewSave.browser.test.tsx`:

```tsx
import { decodeBoard, type View } from '@arrowz/engine'
import { act, useState, type ReactNode } from 'react'
import { MemoryRouter } from 'react-router'
import { userEvent } from 'vitest/browser'
import { render, renderHook } from 'vitest-browser-react'
import { afterEach, beforeEach, expect, test, vi } from 'vitest'
import { storedFixture } from '../state/library.fixtures'
import { useStore } from '../state/store'
import { cancelNoticeFade, raiseNotice } from './notices'
import { cancelPendingSave, useViewSave } from './useViewSave'

const stored = storedFixture(1)
/** A second board, for the cases about an edit finished on a different one. */
const other = storedFixture(2)
const at = ({ children }: { children: ReactNode }) => <MemoryRouter initialEntries={['/boards']}>{children}</MemoryRouter>

beforeEach(() => {
  useStore.getState().result.reset()
  useStore.getState().library.reset()
  useStore.getState().result.showPreview({ board: decodeBoard(stored.file), file: stored.file, meta: stored.meta })
})

afterEach(() => {
  // Both module timers, so a case cannot leave one ticking into the next: the
  // save's, and the fade's — `notices.ts` and `useViewSave.ts` each own one.
  cancelPendingSave()
  cancelNoticeFade()
  vi.useRealTimers()
  vi.restoreAllMocks()
})

// The boundary itself. Fake timers go in after `renderHook` and without
// `shouldAdvanceTime`, and every assertion is a bare `expect` — `expect.element`
// stands on `expect.poll` and would hang on a frozen clock.
test('the store is written 350 ms after the last edit, not before', async () => {
  const posts = vi.spyOn(globalThis, 'fetch').mockImplementation(() => new Promise(() => {}))
  const { result } = await renderHook(() => useViewSave(() => {}), { wrapper: at })
  vi.useFakeTimers()

  await act(async () => result.current({ ...stored.meta.view, stroke: 0.8 }))
  // The picture moves at once; only the store waits.
  expect(useStore.getState().result.preview?.meta.view.stroke).toBe(0.8)
  await act(async () => await vi.advanceTimersByTimeAsync(349))
  expect(posts.mock.calls.filter(([, init]) => init?.method === 'POST')).toHaveLength(0)
  await act(async () => await vi.advanceTimersByTimeAsync(1))
  expect(posts.mock.calls.filter(([, init]) => init?.method === 'POST')).toHaveLength(1)
})

// Review round 2, and the reason this case cannot use `renderHook`: that host
// subscribes to nothing, so it never re-renders, and the defect this pins —
// an effect whose cleanup ran per render, killing the debounce and posting on
// every later render — was invisible to every other case in this file.
test('an edit posts once, whatever the owner re-renders in between', async () => {
  const posts = vi.spyOn(globalThis, 'fetch').mockImplementation(() => new Promise(() => {}))
  function Owner() {
    // Selecting the state the hook writes is the whole point: this is what
    // `BoardDetail` does, and what makes the re-renders real.
    const stroke = useStore((state) => state.result.preview?.meta.view.stroke)
    const commit = useViewSave(() => {})
    const [bumps, bump] = useState(0)
    return (
      <div>
        <button type="button" onClick={() => commit({ ...stored.meta.view, stroke: 0.8 })}>
          edit
        </button>
        <button type="button" onClick={() => bump(bumps + 1)}>
          bump
        </button>
        <span>{`${String(stroke)} ${bumps}`}</span>
      </div>
    )
  }
  const screen = await render(
    <MemoryRouter initialEntries={['/boards']}>
      <Owner />
    </MemoryRouter>,
  )
  await userEvent.click(screen.getByRole('button', { name: 'edit' }))
  await userEvent.click(screen.getByRole('button', { name: 'bump' }))
  await userEvent.click(screen.getByRole('button', { name: 'bump' }))
  // Real timers, and a wait long enough for the debounce twice over: polling
  // for "exactly one" would pass the moment the first arrived.
  await new Promise((done) => setTimeout(done, 800))
  expect(posts.mock.calls.filter(([, init]) => init?.method === 'POST')).toHaveLength(1)
})

// Ruling 12: the timer is the module's, so it survives the detail being
// unmounted — and `cancelPendingSave` is the one thing that stops it.
test('a cancelled save never reaches the store', async () => {
  const posts = vi.spyOn(globalThis, 'fetch').mockImplementation(() => new Promise(() => {}))
  const { result } = await renderHook(() => useViewSave(() => {}), { wrapper: at })
  await act(async () => result.current({ ...stored.meta.view, stroke: 0.8 }))
  cancelPendingSave()
  await new Promise((done) => setTimeout(done, 600))
  expect(posts.mock.calls.filter(([, init]) => init?.method === 'POST')).toHaveLength(0)
})

// Round 2: the identity guard used to swallow the message as well as the
// stage write, so a save that landed after the board changed said nothing at
// all — and the row kept the command of a view the store no longer held.
test('a save that lands after the board changed still reports itself', async () => {
  const saved = { ...stored.meta, view: { ...stored.meta.view, stroke: 0.8 } }
  // The POST is held open, and that is the whole point: clearing the preview
  // *before* the timer fires would make `write()` return on `preview === null`
  // and nothing would ever be posted — review round 3 measured the first
  // version of this case failing that way against correct code, which means it
  // pinned nothing.
  let release = (_: Response) => {}
  const held = new Promise<Response>((resolve) => (release = resolve))
  const posts = vi.spyOn(globalThis, 'fetch').mockReturnValue(held)
  let refreshed = 0
  const { result } = await renderHook(() => useViewSave(() => (refreshed += 1)), { wrapper: at })

  await act(async () => result.current({ ...stored.meta.view, stroke: 0.8 }))
  await expect.poll(() => posts.mock.calls.filter(([, init]) => init?.method === 'POST').length).toBe(1)

  // Now the stage moves on, exactly as choosing another board does — while the
  // answer is still in flight.
  await act(async () => useStore.getState().result.clearPreview())
  await act(async () => release(new Response(JSON.stringify(saved), { status: 201 })))

  await expect.poll(() => useStore.getState().library.notice?.kind).toBe('viewSaved')
  expect(refreshed).toBe(1)
  // And the board that replaced it is not overwritten by the answer.
  expect(useStore.getState().result.preview).toBeNull()
})

// Ruling 5, the half no timer takes back: a refusal describes the state of the
// stage against the store, so it stays until a save lands or another board is
// opened. Round 3 found nothing pinning it.
test('a failed save keeps saying so, because the picture still disagrees with the store', async () => {
  vi.spyOn(globalThis, 'fetch').mockRejectedValue(new Error('connect ECONNREFUSED'))
  const { result } = await renderHook(() => useViewSave(() => {}), { wrapper: at })

  await act(async () => result.current({ ...stored.meta.view, stroke: 0.8 }))
  await expect.poll(() => useStore.getState().library.notice?.kind).toBe('saveFailed')
  // Past the 1200 ms fade the other three notices take.
  await new Promise((done) => setTimeout(done, 1500))
  expect(useStore.getState().library.notice?.kind).toBe('saveFailed')
})

// The Critical this task's review found, and the reason `write` is handed the
// board it was given rather than the one on the stage. One click on another
// row does two things at once: it blurs the field, which commits the edit and
// arms the timer, and it changes the address — and a local store answers well
// inside the 350 ms pause. Reading the board at write time therefore posted A's
// view onto B's file: A's edit lost, B's stored view overwritten, the message
// naming B, and nothing on screen to show for any of it.
test('an edit finished by clicking another board is written to the board that was edited', async () => {
  const posts = [] as { board: unknown; view: View }[]
  vi.spyOn(globalThis, 'fetch').mockImplementation((_input, init) => {
    if (init?.method !== 'POST') return new Promise(() => {})
    posts.push(JSON.parse(String(init.body)) as { board: unknown; view: View })
    return Promise.resolve(new Response(JSON.stringify(stored.meta), { status: 201 }))
  })
  const { result } = await renderHook(() => useViewSave(() => {}), { wrapper: at })

  await act(async () => result.current({ ...stored.meta.view, stroke: 0.9 }))
  // The stage moves to the other board inside the pause, as the click does.
  await act(async () => {
    useStore
      .getState()
      .result.showPreview({ board: decodeBoard(other.file), file: other.file, meta: other.meta })
  })
  await expect.poll(() => posts.length).toBe(1)

  // The request carries the edited board's file and the edited view — not
  // whichever board happens to be on the stage when the timer fires.
  expect(posts[0]?.board).toEqual(stored.file)
  expect(posts[0]?.view.stroke).toBe(0.9)
  // And the board that replaced it is left exactly as it was.
  expect(useStore.getState().result.preview?.meta.id).toBe(other.meta.id)
  expect(useStore.getState().result.preview?.meta.view.stroke).toBe(other.meta.view.stroke)
})

// `notices.ts` exists to take an event notice back, and nothing measured that:
// this task's review found that deleting its whole `setTimeout` block, or
// inverting its identity guard, left every other case green. Task 8's `deleted`
// notice leans on this same branch — and the `deleted` fade is the one the
// plan's own history records as broken once already.
test('an event notice fades after 1200 ms, and a kept one never does', async () => {
  vi.useFakeTimers()

  await act(async () => raiseNotice({ kind: 'deleted', name: '8x8/x' }))
  await act(async () => await vi.advanceTimersByTimeAsync(1199))
  expect(useStore.getState().library.notice?.kind).toBe('deleted')
  await act(async () => await vi.advanceTimersByTimeAsync(1))
  expect(useStore.getState().library.notice).toBeNull()

  // `saveFailed` describes a state, so no clock takes it away (Ruling 5).
  await act(async () => raiseNotice({ kind: 'saveFailed' }))
  await act(async () => await vi.advanceTimersByTimeAsync(3000))
  expect(useStore.getState().library.notice?.kind).toBe('saveFailed')
})

// The identity guard inside the fade: a newer notice owns the line, and the
// timer of the one it replaced must not take it away.
test('a notice that superseded another is not cleared by the older one’s timer', async () => {
  vi.useFakeTimers()

  await act(async () => raiseNotice({ kind: 'deleted', name: '8x8/a' }))
  await act(async () => await vi.advanceTimersByTimeAsync(1100))
  await act(async () => raiseNotice({ kind: 'viewSaved', name: '8x8/b' }))
  // Past the moment the first one's timer would have fired.
  await act(async () => await vi.advanceTimersByTimeAsync(200))
  expect(useStore.getState().library.notice?.kind).toBe('viewSaved')
})

test('a burst of edits writes once', async () => {
  const posts = vi.spyOn(globalThis, 'fetch').mockImplementation(() => new Promise(() => {}))
  const { result } = await renderHook(() => useViewSave(() => {}), { wrapper: at })
  vi.useFakeTimers()

  for (const stroke of [0.6, 0.7, 0.8]) {
    await act(async () => result.current({ ...stored.meta.view, stroke }))
    await act(async () => await vi.advanceTimersByTimeAsync(100))
  }
  await act(async () => await vi.advanceTimersByTimeAsync(350))
  expect(posts.mock.calls.filter(([, init]) => init?.method === 'POST')).toHaveLength(1)
})

// Ruling 8: the edit is already on the stage and the user made it. A store that
// is down says so and takes nothing away.
test('a failed save keeps the picture and says so', async () => {
  vi.spyOn(globalThis, 'fetch').mockRejectedValue(new Error('connect ECONNREFUSED'))
  const { result } = await renderHook(() => useViewSave(() => {}), { wrapper: at })

  await act(async () => result.current({ ...stored.meta.view, stroke: 0.8 }))
  await expect.poll(() => useStore.getState().library.notice?.kind).toBe('saveFailed')
  expect(useStore.getState().result.preview?.meta.view.stroke).toBe(0.8)
})

// The store answers with the meta it wrote, and the list has to hear about it:
// the old lab reloads with `force` so the row shows the new view's command.
test('a save that lands takes the store’s meta and refreshes the list', async () => {
  const saved = { ...stored.meta, view: { ...stored.meta.view, stroke: 0.8 }, command: 'deno task carve --stroke=0.8' }
  vi.spyOn(globalThis, 'fetch').mockResolvedValue(new Response(JSON.stringify(saved), { status: 201 }))
  let refreshed = 0
  const { result } = await renderHook(() => useViewSave(() => (refreshed += 1)), { wrapper: at })

  await act(async () => result.current({ ...stored.meta.view, stroke: 0.8 }))
  await expect.poll(() => useStore.getState().library.notice?.kind).toBe('viewSaved')
  expect(useStore.getState().result.preview?.meta.command).toBe('deno task carve --stroke=0.8')
  expect(refreshed).toBe(1)
})
```

- [ ] **Step 2: Run it and watch it fail**

Run: `pnpm --dir apps/lab exec vitest run src/library/useViewSave.browser.test.tsx`
Expected: FAIL — no `useViewSave` module.

- [ ] **Step 3: Implement the fading notice**

Create `apps/lab/src/library/notices.ts`:

```ts
import type { LibraryNotice } from '../state/library.slice'
import { useStore } from '../state/store'

/** How long a message about something that has finished happening stays up. */
const LINGER_MS = 1200

/**
 * The two notices that describe a state rather than an event (Ruling 5). Their
 * own outcome clears them: a fetch that lands, a save that succeeds, a board
 * that is closed.
 */
const KEPT: readonly LibraryNotice['kind'][] = ['loading', 'saveFailed']

/**
 * Module scope, not a ref, and there is deliberately no effect and no cleanup.
 * Review round 2 measured the alternative: a `clearTimeout` on unmount killed
 * the `deleted` notice's own timer, because the detail raises that notice and
 * then navigates — which unmounts the detail — so the line said "Deleted …"
 * for ever. This timer touches only the store and only takes back the object it
 * put up, so an unmounted raiser costs nothing at all.
 */
let timer: ReturnType<typeof setTimeout> | undefined

/**
 * Raises a library notice, and takes it back 1200 ms later when what it reports
 * is over (Ruling 5), so the status line goes back to describing the board on
 * screen rather than keeping a sentence about something that has finished.
 */
export function raiseNotice(notice: LibraryNotice): void {
  useStore.getState().library.notify(notice)
  clearTimeout(timer)
  timer = undefined
  if (KEPT.includes(notice.kind)) return
  timer = setTimeout(() => {
    // Only take back the message this call put up: a newer one is someone
    // else's, and its own timer will see to it.
    if (useStore.getState().library.notice === notice) useStore.getState().library.clearNotice()
  }, LINGER_MS)
}

/** For tests, which must not leak a pending fade into the case after them. */
export function cancelNoticeFade(): void {
  clearTimeout(timer)
  timer = undefined
}
```

A module and not a hook, because it holds nothing a component owns — and because a hook invited the effect whose cleanup caused the defect above.

- [ ] **Step 4: Implement the save**

Create `apps/lab/src/library/useViewSave.ts`:

```ts
import type { BoardFile, View } from '@arrowz/engine'
import { storeRequest } from '@arrowz/engine/command'
import { saveBoard } from '../api/boards'
import type { StoredBoard } from '../state/result.slice'
import { useStore } from '../state/store'
import { raiseNotice } from './notices'

/** The old lab's own pause between the last keystroke and the write. */
const SETTLE_MS = 350

/**
 * An edited view of a stored board: the element redraws at once, and after a
 * pause the same board file goes back to the store with the new view in its
 * meta (`onLibViewInput` and `saveLibView` in `lab-page.ts`). Nothing is
 * regenerated, and the command in the meta still reproduces the board.
 */
/**
 * Module scope, as the old lab keeps `libTimer` (Ruling 12). Not a ref inside
 * the component: the detail is keyed on the address, so choosing another board
 * unmounts it, and a timer owned by that instance would die with the edit. And
 * not an effect either — review round 2 measured a cleanup written to flush
 * such a timer running on *every render*, because its dependencies were fresh
 * functions: the debounce never fired, one edit posted twice, and every later
 * re-render posted again.
 */
let timer: ReturnType<typeof setTimeout> | undefined

/**
 * Drops a write that has not happened yet. The delete calls this before asking
 * the store to remove the board: measured against a real store, a pending save
 * that survived a delete re-POSTed the board, and `store.ts`'s `saveBoard`
 * treats a board it cannot find as a new one — so the deleted board came back
 * to the disk and to the listing (Rulings 11 and 12).
 */
export function cancelPendingSave(): void {
  clearTimeout(timer)
  timer = undefined
}

export function useViewSave(refresh: () => void): (view: View) => void {
  return (view) => {
    useStore.getState().result.previewView(view)
    // The board this edit belongs to, captured now — with the edit already in
    // its meta. The timer fires 350 ms later, and by then the stage may be
    // showing a different board: a single click on another row both blurs the
    // field (which commits) and changes the address, and a local store answers
    // well inside the pause. Reading the board at write time therefore sent one
    // board's view to another board's file (measured in this task's review).
    const edited = useStore.getState().result.preview
    if (edited === null) return
    clearTimeout(timer)
    timer = setTimeout(() => {
      timer = undefined
      void write(refresh, edited, view)
    }, SETTLE_MS)
  }
}

async function write(refresh: () => void, edited: StoredBoard, posted: View): Promise<void> {
  // Everything comes from the board that was edited, captured when the edit was
  // committed — never from the stage as it stands now. The stage is a moving
  // target between the keystroke and the timer, and the file this request names
  // decides which board the store overwrites.
  const { meta, file, board } = edited
  const name = `${meta.W}x${meta.H}/${meta.id}`
  // The page holds the file as `unknown` because it reads nothing in it;
  // `decodeBoard` accepted it when it loaded and it goes back untouched, so
  // the contract's `BoardFile` is what it is — the old lab says the same.
  const request = storeRequest(file as BoardFile, meta.params, posted, meta.source, {
    ok: meta.ok,
    pieces: meta.pieces,
    maxLen: meta.maxLen,
    genMs: meta.genMs,
  })
  const outcome = await saveBoard(request)
  if (!outcome.ok) {
    raiseNotice({ kind: 'saveFailed' })
    return
  }
  // Only the *stage* is gated, and on two things: that it is still this board,
  // and that it still carries this edit. The board check keeps an answer for A
  // from redrawing B; the view check keeps an older answer from putting its
  // view back over a newer edit — `previewView` stores the caller's object, so
  // a newer edit is a different object, and `layoutHash` is view-blind, so
  // `meta.id` alone cannot tell two saves of one board apart.
  //
  // The message and the refresh are NOT gated. Round 2 measured that mistake:
  // a save whose answer arrived after the board changed said nothing at all —
  // no `viewSaved`, no `saveFailed` on failure, and a row left showing the
  // command of a view the store no longer holds.
  const current = useStore.getState().result.preview
  if (current !== null && current.meta.id === meta.id && current.meta.view === posted) {
    useStore.getState().result.showPreview({ board, file, meta: outcome.meta })
  }
  raiseNotice({ kind: 'viewSaved', name })
  // The store keeps `createdAt` on an overwrite, so the row stays in place; the
  // listing is refreshed for the new meta alone.
  refresh()
}
```

- [ ] **Step 5: Wire the detail to it**

`LibraryPanel` passes `refresh` to `BoardDetail`, and `BoardDetail` takes it, calls `useViewSave(refresh)` and replaces the two empty callbacks:

```tsx
export function BoardDetail({ refresh }: { refresh(): void }): ReactElement | null {
  …
  const commitView = useViewSave(refresh)
```

```tsx
          <ViewNumberField
            key={field.field}
            field={field}
            value={meta.view[field.field]}
            onCommit={(value) => commitView({ ...meta.view, [field.field]: value })}
          />
```

```tsx
          <ViewFlagSwitch
            key={flag}
            flag={flag}
            label={label}
            on={flag === 'rounded' ? meta.view.rounded !== false : meta.view.colored}
            onToggle={() =>
              commitView(
                flag === 'rounded'
                  ? { ...meta.view, rounded: meta.view.rounded === false }
                  : { ...meta.view, colored: !meta.view.colored },
              )
            }
          />
```

Delete the `// Task 7 gives these a sink.` comment.

**The detail's own test file must follow the signature.** `BoardDetail` now requires `refresh`, so `mountDetail` in `BoardDetail.browser.test.tsx` renders `<BoardDetail refresh={() => {}} />`. Without this the file stops compiling and `pnpm --dir apps/lab run check` is red — `vitest run` alone would not say so.

- [ ] **Step 6: Run and commit**

Run: `pnpm --dir apps/lab exec vitest run src/library/` and `pnpm --dir apps/lab run check`
Expected: PASS and clean.

```bash
pnpm --dir apps/lab exec prettier --write src/library
git add apps/lab/src/library
git commit -m "Write an edited view back to the store, 350 ms after the last change"
```

---

## Task 8: Two clicks delete

**Files:**
- Modify: `apps/lab/src/library/BoardDetail.tsx`, `apps/lab/src/library/LibraryPanel.tsx`, `apps/lab/src/design/library.css`
- Test: `apps/lab/src/library/BoardDetail.browser.test.tsx` (append)

**Interfaces:**
- Consumes: `deleteBoard` (Task 1), `raiseNotice` and `cancelPendingSave` (Task 7).
- Produces: nothing new for later tasks.

**The behaviour, from the old lab's `disarmDelete` and its click handler:** the first click arms the button and changes its label to `confirmDelete`; the second removes the files. A different board disarms it — here by being a different component instance (Ruling 10). A 404 counts as gone (Ruling 11).

- [ ] **Step 1: Write the failing test**

Append to `apps/lab/src/library/BoardDetail.browser.test.tsx`:

```ts
test('the first click arms delete, and the second removes the board', async () => {
  const calls = vi.spyOn(globalThis, 'fetch').mockResolvedValue(new Response('{"deleted":true}', { status: 200 }))
  const screen = await mountDetail()
  await show()

  const button = screen.getByRole('button', { name: /delete from disk/i })
  await userEvent.click(button)
  // Armed: the label asks, and nothing has been sent.
  await expect.element(screen.getByRole('button', { name: /really delete/i })).toBeVisible()
  expect(calls.mock.calls.filter(([, init]) => init?.method === 'DELETE')).toHaveLength(0)

  await userEvent.click(screen.getByRole('button', { name: /really delete/i }))
  await expect.poll(() => calls.mock.calls.filter(([, init]) => init?.method === 'DELETE').length).toBe(1)
  expect(String(calls.mock.calls.find(([, init]) => init?.method === 'DELETE')?.[0])).toContain(
    `/api/boards/8x8/${stored.meta.id}`,
  )
  // Spec §5.6: the address is replaced, not pushed — Back must not walk into a
  // board that is no longer on disk.
  await expect.element(screen.getByTestId('address')).toHaveTextContent('/boards')
  expect(useStore.getState().library.notice?.kind).toBe('deleted')
})

// Ruling 11: pressing Delete on a board another window already removed means
// the same thing to the person looking at it — it is not there.
test('a board that was already gone still counts as deleted', async () => {
  vi.spyOn(globalThis, 'fetch').mockResolvedValue(new Response('{"deleted":false}', { status: 404 }))
  const screen = await mountDetail()
  await show()
  await userEvent.click(screen.getByRole('button', { name: /delete from disk/i }))
  await userEvent.click(screen.getByRole('button', { name: /really delete/i }))
  await expect.poll(() => useStore.getState().library.notice?.kind).toBe('deleted')
})

test('a store that cannot be reached says so and keeps the board', async () => {
  vi.spyOn(globalThis, 'fetch').mockRejectedValue(new Error('connect ECONNREFUSED'))
  const screen = await mountDetail()
  await show()
  await userEvent.click(screen.getByRole('button', { name: /delete from disk/i }))
  await userEvent.click(screen.getByRole('button', { name: /really delete/i }))
  await expect.poll(() => useStore.getState().library.notice?.kind).toBe('deleteFailed')
  expect(useStore.getState().result.preview).not.toBeNull()
})

// Rulings 11 and 12 together, and the worst defect review round 2 found: a view
// edit still on its timer used to be written *after* the delete, and the store
// takes a board it cannot find for a new one — so the deleted board came back
// to the disk. Measured there against a real store; pinned here by the order
// of the requests.
test('deleting cancels a view edit that has not been written yet', async () => {
  const calls = vi.spyOn(globalThis, 'fetch').mockResolvedValue(new Response('{"deleted":true}', { status: 200 }))
  const screen = await mountDetail()
  await show()

  const stroke = screen.container.querySelector<HTMLInputElement>('#view-stroke')
  if (stroke === null) throw new Error('the detail offered no stroke field')
  await userEvent.fill(stroke, '0.9')
  await userEvent.tab()

  await userEvent.click(screen.getByRole('button', { name: /delete from disk/i }))
  await userEvent.click(screen.getByRole('button', { name: /really delete/i }))

  // Past the debounce, so a surviving timer would have fired by now.
  await new Promise((done) => setTimeout(done, 600))
  const methods = calls.mock.calls.map(([, init]) => init?.method ?? 'GET')
  expect(methods).toContain('DELETE')
  expect(methods).not.toContain('POST')
})

// Ruling 5's fade, through the one mount that can see it. The detail raises
// `deleted` and then navigates; only `LibraryPanel`'s `key` unmounts it, and a
// bare `BoardDetail` merely renders `null` — so a case mounted the usual way
// stays green whether or not the fade survives its raiser (review round 3).
test('the deleted notice fades even though the detail that raised it is gone', async () => {
  vi.spyOn(globalThis, 'fetch').mockImplementation((input, init) => {
    if (init?.method === 'DELETE') return Promise.resolve(new Response('{"deleted":true}', { status: 200 }))
    return new Promise(() => {})
  })
  const screen = await render(
    <MemoryRouter initialEntries={[`/boards/8x8/${stored.meta.id}`]}>
      <div className="fw">
        <LibraryPanel />
      </div>
    </MemoryRouter>,
  )
  await act(async () => {
    useStore.getState().library.listed([{ size: '8x8', W: 8, H: 8, cells: 64, boards: [stored.meta] }])
  })
  await show()

  await userEvent.click(screen.getByRole('button', { name: /delete from disk/i }))
  await userEvent.click(screen.getByRole('button', { name: /really delete/i }))
  await expect.poll(() => useStore.getState().library.notice?.kind).toBe('deleted')
  await expect.poll(() => screen.container.querySelector('.fw-lib-detail')).toBeNull()

  // Past the fade: the raiser is unmounted, and the notice must still go.
  await new Promise((done) => setTimeout(done, 1500))
  expect(useStore.getState().library.notice).toBeNull()
})
```

- [ ] **Step 2: Run it and watch it fail**

Run: `pnpm --dir apps/lab exec vitest run src/library/BoardDetail.browser.test.tsx`
Expected: FAIL — there is no Delete button.

- [ ] **Step 3: Implement**

In `BoardDetail.tsx`, add the arming state beside `copied`:

```tsx
  const [armed, setArmed] = useState(false)
```

and the handler, above the `return`:

```tsx
  // Two clicks, as the old lab asks: the first arms, the second removes. A
  // different board is a different instance of this component (Ruling 10), so
  // there is no armed flag to carry across boards and nothing to disarm.
  const remove = () => {
    if (!armed) {
      setArmed(true)
      return
    }
    setArmed(false)
    // Before anything reaches the store: a view save still waiting on its timer
    // would otherwise land after the delete and write the board back to disk,
    // which review round 2 measured against a real store (Rulings 11 and 12).
    cancelPendingSave()
    const name = `${meta.W}x${meta.H}/${meta.id}`
    void deleteBoard(`${meta.W}x${meta.H}`, meta.id).then((outcome) => {
      if (!outcome.ok) {
        raiseNotice({ kind: 'deleteFailed' })
        return
      }
      // Whether the store had it or not, it is gone now (Ruling 11). The
      // address is replaced rather than pushed: the board it names is off the
      // disk, and Back must not offer it again (spec §5.6).
      raiseNotice({ kind: 'deleted', name })
      void navigate('/boards', { replace: true })
      refresh()
    })
  }
```

and the button, beside *Load into lab*:

```tsx
        <button type="button" className={armed ? 'danger armed' : 'danger'} onClick={remove}>
          {armed ? dict.t('confirmDelete') : dict.t('deleteBoard')}
        </button>
```

Import `deleteBoard` from `../api/boards`, `raiseNotice` from `./notices`, and `cancelPendingSave` from `./useViewSave`.

In `LibraryPanel.tsx`, give the detail its identity so a different board is a different instance:

```tsx
  const open = useOpenBoard()
  …
      <BoardDetail key={`${open.size ?? ''}/${open.id ?? ''}`} refresh={refresh} />
```

- [ ] **Step 4: Style the armed state**

Append to `library.css`, above any media query — the old lab's own treatment (`button.danger.armed`):

```css
/* Armed: the second press is the destructive one, and it says so in `--error`
   rather than in `--warn`, which §7.1 reserves for a value that moved. */
.fw .fw-lib-buttons .danger.armed {
  border-color: var(--error);
  background: var(--error);
  color: var(--void);
}
```

- [ ] **Step 5: Run and commit**

Run: `pnpm --dir apps/lab exec vitest run src/library/` and `pnpm --dir apps/lab run check`

```bash
pnpm --dir apps/lab exec prettier --write src/library src/design/library.css
git add apps/lab/src/library apps/lab/src/design/library.css
git commit -m "Delete a stored board on the second click, and leave its address behind"
```

---

## Task 9: The status line speaks for what just happened

**Files:**
- Modify: `apps/lab/src/stage/RunStatusBar.tsx`, `apps/lab/src/library/useStoredBoard.ts`
- Test: `apps/lab/src/stage/RunStatusBar.browser.test.tsx`, `apps/lab/src/library/useStoredBoard.browser.test.tsx` (append to both)

**Interfaces:**
- Consumes: `library.notice` (Task 2).
- Produces: nothing new.

**Why (Ruling 5, spec §5.3):** four messages report events and one reports a fetch in flight. `loadingBoard` has been in the dictionary and unused since PR 5a, which deliberately left the third status state to this PR.

- [ ] **Step 1: Write the failing tests**

Append to `apps/lab/src/stage/RunStatusBar.browser.test.tsx`, inside the `describe`:

```ts
  // Ruling 5: the newest thing the library did outranks the description of the
  // board on screen, and gives way again when its own timer takes it back.
  it('says what the library has just done, ahead of the board it is showing', async () => {
    const { meta, file } = storedFixture(1)
    const screen = await mountBar(`/boards/8x8/${meta.id}`)
    await act(async () => useStore.getState().result.showPreview({ board: decodeBoard(file), file, meta }))
    await expect.element(screen.getByRole('status')).toMatchTextContent(/Saved board/)

    await act(async () => useStore.getState().library.notify({ kind: 'viewSaved', name: `8x8/${meta.id}` }))
    await expect.element(screen.getByRole('status')).toMatchTextContent(/Saved the new view/)

    await act(async () => useStore.getState().library.clearNotice())
    await expect.element(screen.getByRole('status')).toMatchTextContent(/Saved board/)
  })

  it('names the library’s four remaining messages', async () => {
    const screen = await mountBar('/boards')
    for (const [notice, words] of [
      [{ kind: 'loading', name: '8x8/x' }, /Loading 8x8\/x/],
      [{ kind: 'deleted', name: '8x8/x' }, /Deleted 8x8\/x/],
      // Not `new RegExp(EN.ui.notSaved)`: that string is `not saved (no store
      // server)`, whose brackets a regular expression reads as a group, so it
      // would match a sentence the dictionary does not contain.
      [{ kind: 'saveFailed' }, /not saved/],
      [{ kind: 'deleteFailed' }, /Could not delete/],
    ] as const) {
      await act(async () => useStore.getState().library.notify(notice))
      await expect.element(screen.getByRole('status')).toMatchTextContent(words)
    }
  })

  // The library's messages belong to the library. A notice left behind must not
  // speak over a carve on the lab tab.
  it('says nothing of the library while the lab is the tab', async () => {
    const screen = await mountBar('/')
    await act(async () => useStore.getState().library.notify({ kind: 'deleted', name: '8x8/x' }))
    // From the dictionary, not a regex: the string is `Press "Generate".`, and
    // review round 1 measured `/Press Generate/` failing on the quotation marks.
    await expect.element(screen.getByRole('status')).toMatchTextContent(EN.t('pressGenerate'))
  })
```

Append to `apps/lab/src/library/useStoredBoard.browser.test.tsx`, adding `render` and `userEvent` to its imports and `useNavigate` to its `react-router` import — the walk case below navigates for real, because `renderHook`'s `rerender` cannot:

```ts
// The silence PR 5a left on purpose: between the click and the picture the line
// said nothing about the board being fetched.
test('a board being fetched says so, and stops saying it when it arrives', async () => {
  stubStore({ [first.meta.id]: first.file })
  useStore.getState().library.listed([{ size: '8x8', W: 8, H: 8, cells: 64, boards: [first.meta] }])
  await renderHook(() => useStoredBoard(), at(`/boards/8x8/${first.meta.id}`))
  await expect.poll(() => useStore.getState().result.preview?.meta.id).toBe(first.meta.id)
  expect(useStore.getState().library.notice).toBeNull()
})

// The fifth exit (Ruling 14). Review round 2 measured "Loading B…" left on the
// line for ever: B's fetch is cancelled by the walk back to A, and the effect
// that runs for A returns early because A is already drawn.
test('walking away from a board still loading, and back, leaves no loading notice', async () => {
  stubStore({ [first.meta.id]: first.file })
  useStore
    .getState()
    .library.listed([{ size: '8x8', W: 8, H: 8, cells: 64, boards: [first.meta, second.meta] }])
  // A host that really navigates. `renderHook(...).rerender` takes the hook's
  // *props* — its signature is `(props?: Props) => Promise<void>` — so handing
  // it a fresh `MemoryRouter` wrapper changes nothing and the address never
  // moves: review round 3 measured the first version of this case staying
  // green with the repair reverted, which makes it no case at all.
  function Walk() {
    useStoredBoard()
    const navigate = useNavigate()
    return (
      <div>
        <button type="button" onClick={() => void navigate(`/boards/8x8/${first.meta.id}`)}>
          A
        </button>
        <button type="button" onClick={() => void navigate(`/boards/8x8/${second.meta.id}`)}>
          B
        </button>
      </div>
    )
  }
  const screen = await render(
    <MemoryRouter initialEntries={[`/boards/8x8/${first.meta.id}`]}>
      <Walk />
    </MemoryRouter>,
  )
  await expect.poll(() => useStore.getState().result.preview?.meta.id).toBe(first.meta.id)

  // B's file never answers; then straight back to A, which is on the stage.
  stubStore({})
  await userEvent.click(screen.getByRole('button', { name: 'B' }))
  await expect.poll(() => useStore.getState().library.notice?.kind).toBe('loading')
  await userEvent.click(screen.getByRole('button', { name: 'A' }))

  await expect.poll(() => useStore.getState().library.notice).toBeNull()
  expect(useStore.getState().result.preview?.meta.id).toBe(first.meta.id)
})

test('a board that fails to load leaves no loading notice behind', async () => {
  stubStore({})
  useStore.getState().library.listed([{ size: '8x8', W: 8, H: 8, cells: 64, boards: [first.meta] }])
  await renderHook(() => useStoredBoard(), at(`/boards/8x8/${first.meta.id}`))
  await expect.poll(() => useStore.getState().library.boardError).not.toBeNull()
  expect(useStore.getState().library.notice).toBeNull()
})
```

- [ ] **Step 2: Run them and watch them fail**

Run: `pnpm --dir apps/lab exec vitest run src/stage/RunStatusBar.browser.test.tsx src/library/useStoredBoard.browser.test.tsx`
Expected: FAIL — the bar ignores the notice.

- [ ] **Step 3: Implement the bar**

In `RunStatusBar.tsx`, read the notice beside the rest:

```tsx
  const notice = useStore((state) => state.library.notice)
```

and put its branch first, above the `boardError` branch:

```tsx
  // Ruling 5: an event outranks the description of a state, because it is the
  // thing that just happened and the line is the one place to say it. It gives
  // way on its own, 1200 ms later (`notices.ts`), except for `loading` and
  // `saveFailed`, which describe a state and are cleared by their outcome.
  if (inLibrary && notice !== null) {
    text =
      notice.kind === 'loading'
        ? dict.t('loadingBoard', notice.name)
        : notice.kind === 'viewSaved'
          ? dict.t('viewSaved', notice.name)
          : notice.kind === 'deleted'
            ? dict.t('deletedBoard', notice.name)
            : notice.kind === 'saveFailed'
              ? dict.t('notSaved')
              : dict.t('deleteFailed')
  } else if (inLibrary && boardError !== null) {
```

- [ ] **Step 4: Implement the loading notice**

`useStoredBoard.ts` changes in three places, and review round 1 measured a defect in each of them before they were written this way.

**First, the effect returns early for the board already on the stage (Ruling 14).** Immediately after the meta lookup succeeds, before anything is raised or cleared:

```ts
    // A new listing is not a reason to fetch a board that is already drawn:
    // `listed()` stores a fresh array on every refresh, including the one a
    // view save makes, and re-fetching brought back the listing's view over an
    // edit in flight and flashed `loading` over `viewSaved` (Ruling 14).
    if (useStore.getState().result.preview?.meta.id === id) {
      // The fifth exit, and the one review round 2 measured stranding a word:
      // open A, click B, click back to A while B's file is still in flight —
      // B's cancelled fetch clears nothing and this return used to happen
      // before any clear, so the line said "Loading B…" for ever over a drawn
      // board A. Nothing else is touched: an unconditional clear here would
      // erase the `viewSaved` that a save's own refresh lands on.
      if (useStore.getState().library.notice?.kind === 'loading') useStore.getState().library.clearNotice()
      return
    }
```

**Second, the notice is raised where the fetch starts** — beside the existing `boardFailed(null)`:

```ts
    useStore.getState().library.boardFailed(null)
    useStore.getState().library.notify({ kind: 'loading', name: `${size}/${id}` })
```

**Third, every exit clears it, and there are four, not two.** Call `clearNotice()` before `showPreview`, before the `boardFailed` of a failed read, before the `boardFailed` of a failed decode, **and before the `boardFailed({ reason: 'not in the store' })` that sits outside the async block** — a board dropped from the listing while its file was in flight otherwise leaves "Loading …" on screen for good, over the very error the line should be printing. Refresh does not clear it either, because it takes the same branch.

**And the early "no board named" branch clears only a `loading` notice:**

```ts
    if (size === null || id === null) {
      useStore.getState().result.clearPreview()
      useStore.getState().library.boardFailed(null)
      // Only the word about a fetch. The delete navigates to `/boards` and this
      // branch runs immediately after it — an unconditional clear here erased
      // the `deleted` notice within one commit, measured by review round 1.
      if (useStore.getState().library.notice?.kind === 'loading') useStore.getState().library.clearNotice()
      return
    }
```

- [ ] **Step 5: Run and commit**

Run: `pnpm --dir apps/lab exec vitest run src/stage/ src/library/`

```bash
pnpm --dir apps/lab exec prettier --write src/stage/RunStatusBar.tsx src/library/useStoredBoard.ts src/stage/RunStatusBar.browser.test.tsx src/library/useStoredBoard.browser.test.tsx
git add apps/lab/src/stage apps/lab/src/library
git commit -m "Let the status line say what the library just did, and what it is fetching"
```

---

## Task 10: One answer about a size, and three names instead of one

**Files:**
- Create: `apps/lab/src/library/openEntry.ts`, `apps/lab/src/library/openEntry.test.ts`
- Modify: `apps/lab/src/library/SizeChips.tsx`, `apps/lab/src/library/BoardList.tsx`, `apps/lab/src/library/LibraryPanel.tsx`, `apps/lab/src/library/BoardDetail.tsx`, `packages/engine/lab-i18n.ts`
- Test: `apps/lab/src/library/LibraryPanel.browser.test.tsx` (append)

**Interfaces:**
- Produces: `openEntry(sizes: BoardSize[] | null, size: string | null): { entry: BoardSize | null; mismatch: boolean }`.

**The two debts (spec §5.6 and §7.2), both recorded by PR 5a's review of itself.**

- [ ] **Step 1: Write the failing unit test**

Create `apps/lab/src/library/openEntry.test.ts`:

```ts
import { expect, test } from 'vitest'
import { sizesFixture } from '../state/library.fixtures'
import { openEntry } from './openEntry'

// One instance, held: `sizesFixture()` carves real boards, so two calls differ
// in `genMs` and a `toEqual` between them could never pass.
const SIZES = sizesFixture()

test('the address names a listed size', () => {
  expect(openEntry(SIZES, '6x6')).toEqual({ entry: SIZES[1], mismatch: false })
})

test('no size in the address falls back to the first, and says it is a fallback', () => {
  const found = openEntry(SIZES, null)
  expect(found.entry?.size).toBe('8x8')
  // Not a mismatch: nothing was asked for, so the first size's chip is the one
  // that describes the rows being shown. PR 5a's own case asserts it is pressed,
  // and review round 2 caught the first draft of this function breaking that.
  expect(found.mismatch).toBe(false)
})

// The disagreement PR 5a's review found: the list fell back to the first size's
// rows while no chip was pressed, so the two halves of the panel described
// different sizes. One function, one answer (spec §5.6).
test('a size the store does not list falls back, and says so', () => {
  const found = openEntry(SIZES, '10x10')
  expect(found.entry?.size).toBe('8x8')
  expect(found.mismatch).toBe(true)
})

test('an empty store has no entry at all', () => {
  expect(openEntry([], '8x8')).toEqual({ entry: null, mismatch: false })
  expect(openEntry(null, '8x8')).toEqual({ entry: null, mismatch: false })
})
```

- [ ] **Step 2: Run it and watch it fail**

Run: `pnpm --dir apps/lab exec vitest run --project node src/library/openEntry.test.ts`

- [ ] **Step 3: Implement**

Create `apps/lab/src/library/openEntry.ts`:

```ts
import type { BoardSize } from '@arrowz/engine'

/**
 * Which listed size an address is about, and whether the listing really holds
 * it. Both halves of the panel ask this one function, so they cannot answer
 * differently: before PR 5b the list fell back to the first size's rows while
 * the chips, reading the address alone, pressed nothing — the disagreement
 * spec §5.6 settles.
 *
 * `exact` is false both when the address names no size and when it names one
 * the store does not list. The rows are shown either way — there is something
 * to look at — and no chip is pressed, because none of them is what the address
 * asked for.
 */
export function openEntry(
  sizes: BoardSize[] | null,
  size: string | null,
): { entry: BoardSize | null; mismatch: boolean } {
  if (sizes === null || sizes.length === 0) return { entry: null, mismatch: false }
  const named = size === null ? undefined : sizes.find((entry) => entry.size === size)
  if (named !== undefined) return { entry: named, mismatch: false }
  // A `mismatch` only when the address *named* a size the listing has not got.
  // An address with no size is not a disagreement: the list shows the first
  // size's rows and its chip says so, which is what PR 5a's own case asserts.
  return { entry: sizes[0] ?? null, mismatch: size !== null }
}
```

In `BoardList.tsx`, replace the inline fallback with `const { entry } = openEntry(sizes, open.size)`, keeping the rest as it is. In `SizeChips.tsx`, replace `const current = open.size ?? sizes?.[0]?.size ?? null` with:

```tsx
  const { entry, mismatch } = openEntry(sizes, open.size)
  // The chip of the size whose rows are showing — unless the address asked for
  // a size the store has not got, in which case no chip is what was asked for
  // and none is pressed (spec §5.6).
  const current = mismatch ? null : entry?.size ?? null
```

- [ ] **Step 4: Add the three names**

In `packages/engine/lab-i18n.ts`, add to the `EN` `ui` table beside `boardCommand`:

```ts
    sizeGroup: 'Board sizes',
    boardRows: 'Boards of this size',
    boardDetail: 'The open board',
```

and to the `PL` table in the same place:

```ts
    sizeGroup: 'Rozmiary plansz',
    boardRows: 'Plansze tego rozmiaru',
    boardDetail: 'Otwarta plansza',
```

Then give each region its own name, and take the shared one away:

- `SizeChips`' `role="group"` takes `dict.t('sizeGroup')` in place of `tabLibrary`.
- `BoardList`'s `<section>` takes `dict.t('boardRows')` in place of `tabLibrary`.
- `BoardDetail`'s root `<div className="fw-lib-detail">` becomes `<section className="fw-lib-detail" aria-label={dict.t('boardDetail')}>`.
- `LibraryPanel`'s `<section>` loses its `aria-label` entirely, and its `useDictionary` call with it if nothing else in the file needs one. A `<section>` without an accessible name is not a region in the tree, so the panel stops being a fourth thing called "Saved boards" and the list and the detail inside it keep their own names.
- The tab keeps `tabLibrary`, which is the one place that name belongs.

- [ ] **Step 5: Build the engine and check the dictionary gate**

Run: `pnpm nx build engine && deno test -A packages/engine/lab-i18n.test.ts`
Expected: PASS — "EN and PL ui dictionaries have the same keys and the same value kinds" is the case that fails if one table got two of the three.

- [ ] **Step 6: Prove the disagreement is gone**

Append to `apps/lab/src/library/LibraryPanel.browser.test.tsx`:

```ts
// Spec §5.6: either both fall back or neither does. A store holding 8x8 and 6x6
// against an address naming 10x10 used to show the 8x8 rows under an unpressed
// chip strip.
test('an address naming a size the store has not got presses no chip, and still lists rows', async () => {
  const screen = await mountPanel('/boards/10x10/sha256-0')
  await act(async () => useStore.getState().library.listed(sizesFixture()))
  expect(screen.container.querySelectorAll('.fw-lib-row').length).toBeGreaterThan(0)
  const pressed = [...screen.container.querySelectorAll('.fw-lib-chips button')].filter(
    (chip) => chip.getAttribute('aria-pressed') === 'true',
  )
  expect(pressed).toHaveLength(0)
})

test('the three regions of the library have three different names', async () => {
  const screen = await mountPanel()
  await act(async () => useStore.getState().library.listed(sizesFixture()))
  await expect.element(screen.getByRole('group', { name: 'Board sizes' })).toBeInTheDocument()
  await expect.element(screen.getByRole('region', { name: 'Boards of this size' })).toBeInTheDocument()
})
```

- [ ] **Step 7: Run and commit**

Run: `pnpm --dir apps/lab exec vitest run src/library/`

```bash
deno fmt packages/engine/lab-i18n.ts
pnpm --dir apps/lab exec prettier --write src/library
git add packages/engine/lab-i18n.ts apps/lab/src/library
git commit -m "Answer once about an unlisted size, and name the library's regions apart"
```

---

## Task 11: The whole tab, end to end — and the spec's amendment

**Files:**
- Modify: `apps/lab/src/routes/Workspace.browser.test.tsx` (append), `docs/superpowers/specs/2026-09-13-lab-react-app-design.md`

**Interfaces:** none — this task proves the others meet.

- [ ] **Step 1: Write the end-to-end case**

Append to `apps/lab/src/routes/Workspace.browser.test.tsx`:

```ts
// The detail through the real application: a row opens a board, the detail
// describes it, an edited field redraws it and reaches the store, and the
// address survives all of it. The store is stubbed — `boards.node.test.ts` is
// where a real one is exercised.
test('a stored board can be opened, restyled and loaded back into the lab', async () => {
  // Its own viewport, because the one before it outlives its case: without this
  // the case inherits 860×900 from a neighbour, and at 414×896 PR 5a recorded
  // Playwright refusing row clicks as intercepted by `<arrowz-board>`.
  await page.viewport(1400, 900)
  const { meta, file } = storedFixture(1)
  const sizes = [{ size: '8x8', W: 8, H: 8, cells: 64, boards: [meta] }]
  vi.spyOn(globalThis, 'fetch').mockImplementation((input, init) => {
    const url = String(input)
    if (init?.method === 'POST') return Promise.resolve(new Response(JSON.stringify(meta), { status: 201 }))
    if (url.includes('/api/boards')) return Promise.resolve(new Response(JSON.stringify(sizes), { status: 200 }))
    if (url.includes('/store/')) return Promise.resolve(new Response(JSON.stringify(file), { status: 200 }))
    return Promise.resolve(new Response('{}', { status: 404 }))
  })
  const screen = await mountApp()
  await loadRunDone()

  await userEvent.click(screen.getByRole('tab', { name: 'Saved boards', exact: true }))
  // Wait for the rows before reading them: the tab click navigates, and a
  // navigation commits inside `startTransition` (harness facts). Review round 3
  // measured both of this file's new cases failing on a synchronous read here.
  await expect.poll(() => screen.container.querySelector('.fw-lib-row')).not.toBeNull()
  const row = screen.container.querySelector<HTMLElement>('.fw-lib-row')
  if (row === null) throw new Error('the listing showed no row')
  await userEvent.click(row)

  // The detail describes the board the address names.
  await expect.element(screen.getByText(meta.command)).toBeVisible()
  await expect.element(screen.getByRole('status')).toMatchTextContent(/Saved board/)

  // An edited field redraws the stored board without generating anything.
  const phase = useStore.getState().run.phase
  const stroke = screen.container.querySelector<HTMLInputElement>('.fw-lib-detail #view-stroke')
  if (stroke === null) throw new Error('the detail offered no stroke field')
  await userEvent.fill(stroke, '0.9')
  await userEvent.tab()
  await expect.poll(() => useStore.getState().result.preview?.meta.view.stroke).toBe(0.9)
  expect(useStore.getState().run.phase).toBe(phase)

  // And the lab's own board is waiting where it was left.
  await userEvent.click(screen.getByRole('button', { name: /load into lab/i }))
  await expect.element(screen.getByRole('tab', { name: 'Lab', exact: true })).toHaveAttribute('aria-selected', 'true')
  expect(useStore.getState().result.shown).not.toBeNull()
}, 40_000)
```

Add `storedFixture` and `useStore` to the file's imports if they are not there.

- [ ] **Step 1b: Measure the panel where it is actually squeezed**

Task 5's case measures a panel in a fixed box; this one measures the real console at the width where review round 1 found it broken. Append to the same file:

```ts
// Ruling 1, at the size that exposed it: at 860x900 the first version of this
// layout left no list at all and hung the detail 75px below the console.
test('at 860x900 the list still scrolls and the detail stays inside the console', async () => {
  await page.viewport(860, 900)
  const { meta, file } = storedFixture(1)
  const many = Array.from({ length: 40 }, (_, i) => ({ ...meta, id: `${meta.id.slice(0, -2)}${String(i).padStart(2, '0')}` }))
  vi.spyOn(globalThis, 'fetch').mockImplementation((input) => {
    const url = String(input)
    if (url.includes('/api/boards')) {
      return Promise.resolve(new Response(JSON.stringify([{ size: '8x8', W: 8, H: 8, cells: 64, boards: many }]), { status: 200 }))
    }
    if (url.includes('/store/')) return Promise.resolve(new Response(JSON.stringify(file), { status: 200 }))
    return Promise.resolve(new Response('{}', { status: 404 }))
  })
  const screen = await mountApp()
  await loadRunDone()
  await userEvent.click(screen.getByRole('tab', { name: 'Saved boards', exact: true }))
  // Wait for the rows before reading them: the tab click navigates, and a
  // navigation commits inside `startTransition` (harness facts). Review round 3
  // measured both of this file's new cases failing on a synchronous read here.
  await expect.poll(() => screen.container.querySelector('.fw-lib-row')).not.toBeNull()
  const row = screen.container.querySelector<HTMLElement>('.fw-lib-row')
  if (row === null) throw new Error('the listing showed no row')
  await userEvent.click(row)
  await expect.element(screen.getByRole('button', { name: /load into lab/i })).toBeVisible()

  const list = screen.container.querySelector<HTMLElement>('.fw-lib-list')
  const detail = screen.container.querySelector<HTMLElement>('.fw-lib-detail')
  const console_ = screen.container.querySelector<HTMLElement>('.fw-console')
  if (list === null || detail === null || console_ === null) throw new Error('the library face is incomplete')
  expect(list.clientHeight).toBeGreaterThanOrEqual(120)
  expect(list.scrollHeight).toBeGreaterThan(list.clientHeight)
  expect(detail.getBoundingClientRect().bottom).toBeLessThanOrEqual(console_.getBoundingClientRect().bottom + 1)
  // The buttons, not the box that contains them (Ruling 16): the box was inside
  // the console at every size measured while `Load into lab` sat below the
  // window, and `toBeVisible()` says nothing about that.
  const buttons = screen.container.querySelector<HTMLElement>('.fw-lib-buttons')
  if (buttons === null) throw new Error('the detail showed no buttons')
  expect(buttons.getBoundingClientRect().bottom).toBeLessThanOrEqual(window.innerHeight)
  // And nothing pushed the document itself out of shape.
  expect(document.scrollingElement === null ? 0 : document.scrollingElement.scrollHeight - document.scrollingElement.clientHeight).toBe(0)
}, 40_000)
```

The viewport outlives the case that set it, so the case after this one sets its own.

- [ ] **Step 2: Run the whole lab suite**

Run: `pnpm nx test lab`
Expected: PASS. If the run aborts on an iframe timeout naming a file no task here touched, read the cold-optimizer paragraph under **Commands** before debugging anything.

- [ ] **Step 3: Amend the spec's §7.2 row**

The row added by the spec commit says "two new dictionary entries"; Task 10 adds three, because the detail is a region too. Change the row's correction column to read: *each is named for what it is, from three new dictionary entries — the size group, the rows, and the open board's detail; PR 5b adds them, being the PR that already writes to both `ui` tables*.

- [ ] **Step 4: Both gates**

Run: `deno task verify` then `pnpm nx run-many -t verify`
Expected: both green. Record the test counts in the commit message.

- [ ] **Step 5: Commit**

```bash
pnpm --dir apps/lab exec prettier --write src/routes/Workspace.browser.test.tsx
git add apps/lab/src/routes/Workspace.browser.test.tsx docs/superpowers/specs/2026-09-13-lab-react-app-design.md
git commit -m "Prove the detail through the whole application, and correct §7.2's count"
```

---

## Before the pull request

1. **Both gates green** at the final commit, recorded with their counts.
2. **A browser pass by hand.** `sh packages/cli/lab.sh` in one terminal (the store server), `pnpm nx serve lab` in another — `lab:serve` alone gives no store, and every save then answers 502. At 1400×900 and 860×900:
   - the detail appears with the first board opened and is gone again on `/boards` with no board named;
   - the command is the meta's, and Copy says *Copied* for about a second;
   - the list scrolls under a detail that does not move — the point of Ruling 1, and nothing but this pass measures it at 860×900;
   - dragging `stroke` redraws the board at once, and about a third of a second after the last change the status line says the view was saved; the row's own line follows;
   - turning `colour the arrows` on colours the board — the flag that §10's old row forgot;
   - stopping the store server and editing a field says "not saved" and **leaves the picture as edited** (Ruling 8);
   - *Load into lab* lands on the Lab tab with the knobs and the view of the stored board, no run started, and the lab's own board still on the stage;
   - Delete asks on the first click, removes on the second, and Back does not walk into the board that was removed;
   - opening a board on a slow store shows *Loading …* rather than silence.
3. **The old lab still works**: `deno task lab`, open `/lab.html`, open the Saved boards tab, edit a stored board's stroke and confirm it saves — this PR does not touch it, and that is the claim being checked.
4. **The stack's bases.** This branch's PR is based on `lab/library-debt`. If #71 or #72 merges first, rebase before asking for review and say so in the PR body.

---

## What review round 1 changed

Three reviewers applied this plan in their own worktrees and measured it. Every item below is a measurement, not an opinion, and each is folded into the task it belongs to; they are listed here so a second reviewer can see what has already been attacked.

**Eight claims went red.**

1. **`SimplePanel` is a third owner of the shared view field**, and Task 4 did not mention it. Applied as first written, `pnpm --dir apps/lab run check` came out with two `TS2739`s, and at run time the simple view's stroke field opened empty and threw `onCommit is not a function` on blur — while its own suite stayed green, because no case there ever committed a view field. Task 4 gains Step 3b and that case; Ruling 2 says three owners.
2. **The panel's `auto` detail row ate the list.** Measured in the whole application: at 1400×900 the list was 30px tall with none of forty rows fully visible; at 860×900 it was 0px and the detail hung 75px below the console *and* the document. The rows become `minmax(min(140px, 50%), 1fr) minmax(0, auto)` with the detail scrolling itself (Ruling 1, rewritten around the measurement).
3. **The library's `headHeight` carried a help paragraph the old lab does not show there**, and in a 190px column it made every cell of the row as tall as itself — 120px of the height that left no list at 1400, 138px at 860. Dropped from `LIBRARY_VIEW_FIELDS`, which is also the parity the field list claims.
4. **Task 5's layout case could not fail.** It mounted the panel in a bare `<div className="fw">`, so the panel was content-sized, nothing scrolled, and the assertions read the stylesheet rather than the geometry — green in all three layouts measured, the broken one included. Replaced by a case in a fixed box, and Task 11 gains a whole-app case at 860×900.
5. **The late-answer guard could not tell two saves of one board apart.** `layoutHash` reads the layout, not the view, so every save of a board answers with the same `id`. Measured: an older save's answer put its view back on the stage and into the next write, so the newer edit was lost from the screen *and* from the store. The guard now compares the posted view's identity (Ruling 12's neighbourhood; the code is in Task 7).
6. **Every refresh re-fetched the open board's file**, because `useStoredBoard` depends on `metas` and `listed()` always stores a new array. Two reviewers found it from opposite ends: one measured the listing's view overwriting an edit in flight, the other measured `loading` flashing over `viewSaved` so the "saved" message was never readable. Ruling 14: the effect returns early for the board already on the stage.
7. **`clearNotice()` in the "no board named" branch erased the `deleted` notice** the delete had just raised — the navigation to `/boards` runs that branch immediately after. And the `not in the store` branch cleared nothing, so a board dropped from the listing mid-fetch left "Loading …" up for good, over the error the line should have printed. Task 9 now names all four exits and clears only a `loading` notice in the early branch.
8. **`toMatchTextContent(/Press Generate/)` cannot match `Press "Generate".`** — the dictionary string carries quotation marks. It reads from the dictionary now, as every other case in that file does.

**Two risks became rulings.** A pending view save was dropped when the detail unmounted, which is what choosing another board does (Ruling 12: the cleanup writes rather than cancels, from the closure). And the detail, keyed on the address but rendering `preview.meta`, showed the previous board's command and view — and would have deleted *that* board — in the window before the next file lands (Ruling 15: it renders nothing unless the preview is the address's board).

**What held.** The free redraw from `preview.meta` (measured on the element's own `button.colors`, and `element.board` unchanged); the clamp's idempotence through `String` (200 000 random values per field, zero differences); `#view-stroke` never duplicated across the three faces; `deleteBoard` against the real store, including a DELETE with no `Origin` accepted and one with a foreign `Origin` refused 403; the three new dictionary keys against every case in `lab-i18n.test.ts`; and the `group`/`region` roles the a11y case asks for, in both languages.

---

## What review round 2 changed

Three reviewers attacked **the repairs above**, by measurement and by mutation. Round 2 was worth more than round 1: it found that five of the repairs were wrong, one of them destructively, and that the plan's tests pinned almost none of them.

**The repair that was worse than the bug it fixed.** Round 1's flush-on-unmount (Ruling 12, first form) was an effect whose dependencies — `notify` and `refresh` — are fresh functions on every render. React therefore ran its cleanup *per render*, so:

- the 350 ms debounce never fired; one edit posted twice within 2 ms, and every later re-render (`setCopied`, `setArmed`, a language switch) posted again;
- and after a delete, the flush re-POSTed the board. Measured against a real store: `store.ts`'s `saveBoard` treats a board it cannot find as new and **writes the file back**, so the deleted board returned to the disk and to the listing the delete had just refreshed.

The timer now lives in module scope, as the old lab's `libTimer` does, and the delete calls `cancelPendingSave()` first. No effect, no dependency array, nothing per render.

**Four more repairs went red.**

1. **The identity guard silenced the messages it was not meant to touch.** A save whose answer arrived after the board changed said nothing — no `viewSaved`, no `notSaved`, and no refresh, so the row kept the command of a view the store no longer held. Only `showPreview` is gated now.
2. **The `deleted` notice never faded**, because `useFadingNotice`'s unmount cleanup killed its timer — the detail raises that notice and then navigates, which unmounts the detail. The fade is a module (`notices.ts`) with no cleanup, and `saveFailed` joins `loading` as a notice that does not fade at all: it describes a state, and round 2 measured the line going back to "Saved board …" 1.2 s after a refusal, over an edit the store had rejected.
3. **Ruling 14's early return stranded `loading`** on an A → B → A walk — the fifth exit. It clears a `loading` notice on its way out.
4. **Ruling 15's size half hid a real board.** `listBoards` names a size after its directory, so a folder called `08x08` lists boards whose `W` is 8; the comparison is the id alone now.

**And two claims about the plan's own machinery.** `openEntry` treated "no size in the address" as a disagreement and broke a PR 5a case that asserts the first chip is pressed on `/boards` — `mismatch` is now true only for a size the listing has not got. And the parity sentence behind dropping `headHelp` was **false**: `lab.html`'s `libView` does carry that paragraph, with `help` checked by default. Round 1 asserted otherwise and this plan repeated it without opening the file. The drop stands as a measured trade (Ruling 17), not as parity.

**The mutation results are the reason to trust the tests now and not before.** Reverting each round-1 repair left the plan's suites green in five cases out of seven: the flush, the identity guard, the early return, the unconditional `clearNotice`, and the detail's gate — which was worse than green, because weakening the gate made the whole suite pass, so an executor following TDD would have removed it. Only the two exits Task 9 names by hand were pinned. Every repair above therefore ships with a case that goes red when it is reverted.

**What held.** The identity guard itself against two saves of one board, in both orders (the stage ends on the newer view); a save landing after `showPreview` replaced the meta with an equal-contents object (no legitimate save is dropped); Ruling 14 across leaving and re-entering the tab; `deleteBoard` against the real store; the three dictionary keys and the two region names in both languages; the field components' conversion, including a red case when `SimplePanel` is left unwired; and the panel grid at 900×600, 1400×500, 2560×1400, in the simple view, and in solo.

---

## What review round 3 changed

One reviewer, one mandate: apply all eleven tasks, then revert each round-2 repair and see whether anything goes red. **Eight of twelve mutations were caught, four survived**, and applying the plan turned up five defects that would have stopped an executor before any of that mattered.

**Five things that did not apply as written.** Each is fixed in the task it belongs to.

1. Task 5 told the executor to import `page`, which nothing in that file uses once the geometry case moved to Task 6 — `tsc` red under `noUnusedLocals`.
2. Task 6's test header omitted `page`, `LibraryPanel` and every stylesheet. Without `library.css` the list never scrolls, so the geometry case passed on a layout that does not exist.
3. Task 7's test header omitted `useState`, `render`, `userEvent` and `cancelPendingSave`.
4. Task 7's "a save that lands after the board changed" was **red against correct code**: it cleared the preview before the timer fired, so `write()` returned on `preview === null` and no POST was ever made. It holds the answer on a deferred now, and only in that form does it pin anything.
5. Task 11's two cases read `.fw-lib-row` synchronously after a tab click — against the plan's own harness fact about `startTransition`. Both now poll first, and the first also sets its own viewport instead of inheriting a neighbour's.

**Four repairs had no test, and now have one.** `saveFailed` not fading; the `deleted` notice fading even though its raiser unmounts itself (measurable only through `LibraryPanel`, because a bare `BoardDetail` returns `null` without unmounting); Ruling 14's `loading` clear, whose case was *vacuous* — `renderHook`'s `rerender` takes hook props, so re-rendering with a different `MemoryRouter` never moved the address; and the gate's id-only comparison, which no fixture exercised because every fixture spells its size `8x8`.

**Two repairs were only half-pinned:** the grid's floor was caught by Task 11's case alone and the sticky buttons by Task 6's alone. Each case gained the other's assertion.

**What this round proves about the ones that held.** Reverting the module-scope timer goes red in three separate cases; removing `cancelPendingSave` from the delete goes red in the case written for it; `openEntry`'s `mismatch` is pinned by PR 5a's own chip case *and* the new unit case; and weakening the detail's gate — the mutation that made the whole suite pass in round 2 — is now caught.

