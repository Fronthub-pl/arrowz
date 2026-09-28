# Lab correctness 2: SVG colours, view saves, worker, downloads, load into lab

Item 2 of "What is still open" in `lab-review.md` (the smaller correctness
items), re-checked against `main` at `eb48ecc`, plus one bug reported by the
user: "Load into lab" does not show the loaded board until the page reloads.

One pull request, branch `lab/correctness-2`, base `main`.

## Goal

A saved or exported board is what the person sees: the SVG carries the lab's
colours, a view save neither loses the `aborted` flag nor another board's
edit, the generator never hangs in "running" after a worker failure, a
download survives an engine that resolves it late, and "Load into lab" shows
the loaded board.

## 1. The SVG export carries the lab's colours

Today `toSvg` paints fixed colours (paper `#f6f6fa`, ink `#232447`, highlight
`#e8467c`, golden-angle hues), and the lab shows a note (`svgThemeNote`) only
while a theme is chosen. A custom palette, paper or ink is dropped silently.

### Engine

- `SvgOptions` gains four optional fields: `paper`, `ink`, `highlight` and
  `palette: string[]`. An absent field keeps today's value, so every golden
  SVG and fingerprint stays byte for byte the same; `svg-golden.test.ts` and
  `fingerprints.test.ts` are the first guard of the change.
- `toSvg` uses them where the constants stand now: the background rect, the
  ink of lines and heads, the highlight of the longest pieces. `palette`
  applies only when `colored` is on, as on the element (its rider colour is
  the ink while `colored` is off); an empty palette keeps the golden angle.
- The jam strips (`voids`) take the highlight colour, as the element draws
  them (`drawVoids` with the highlight at 22 %); the default highlight is the
  old pink, so default bytes do not move.
- `assignPalette` moves from `packages/board-element/src/palette.ts` to a new
  `packages/engine/palette.ts`, DOM- and Deno-free, so the SVG and the screen
  colour a piece from one source (the reason `colors.ts` exists). The element
  imports it from the engine and keeps re-exporting it from `mod.ts`; its
  public API does not change. The assignment stays over every piece of the
  board.
- Colour values go into SVG attributes, so `toSvg` escapes them (`&`, `"`,
  `<`). An API consumer may pass any CSS colour; no value-changing fallback
  is added.
- The Node build and `node-smoke.mjs` pick up the new file through
  `pnpm nx build engine`; `neutral.test.ts` covers it.

### Element

- The precedence in `drawView` (the element's defaults, then the named theme,
  then the stated fields) moves into a pure `resolveColours(theme, stated)` in
  `themes.ts`, exported from `mod.ts`. `drawView` uses it; the element draws
  exactly as before, which the existing theme tests show.

### Lab

- `ExportButtons` and `BoardColumn` build the colours with `resolveColours`
  from the same view fields the board gets (`theme`, `palette`, `paper`, `ink`,
  `highlightColor`, where `''` means "not set") and spread them over
  `svgOptions(...)`, the way `voids` is spread today.
- The note goes from both places, and `svgThemeNote` from both languages of
  `lab-i18n.ts`.

### Out of scope

CLI flags for colours (`--theme`, `--palette`, `--paper`, `--ink`), `pad` in
the SVG, and the point grid in the SVG. `lab-review.md`'s parity item keeps
these.

## 2. A view save keeps `aborted`

`packages/cli/store.ts` writes `aborted: metrics.aborted ?? false`, so the
lab's view save (which sends no `aborted`) rewrites a cut-short CLI run as
complete. It becomes `metrics.aborted ?? replaced?.aborted ?? false`, the
"an absent figure keeps the stored value" rule the other metrics already
follow.

## 3. A pending view save is per board

`useViewSave.ts` holds one module-scope timer, so an edit of board B within
350 ms cancels board A's pending write.

- The timer becomes a `Map` keyed by `meta.id`. An edit of B leaves A's timer
  alone; a second edit of the same board still resets its own timer, so the
  debounce stays.
- `meta.id` is the layout hash, so two recipes of one layout still share a
  timer: an edit of one within 350 ms of the other drops the first. Accepted:
  the stage edits one layout at a time, and the delete removes the whole
  layout anyway.
- `cancelPendingSave(id?: string)`: with an id it drops that board's write,
  without one every write. The delete in `BoardColumn` passes the removed
  board's id, so removing A no longer drops B's pending save. Tests keep
  calling it with no argument between cases.

## 4. The generator worker

In `useGenerator.ts`:

- Both handlers start with `if (worker.current !== made) return`: a message
  from a worker already terminated cannot complete or fail the next run.
- `onerror` calls `kill()`. A worker that failed to load (a chunk 404 after a
  deploy) is dropped, and the next `start()` builds a new one instead of
  posting to a dead worker and staying "running".

## 5. Downloads

- `downloadBlob` (`run/download.ts`) revokes the object URL on a 40 s timer
  instead of at once. 40 s is FileSaver.js's value, taken as the widely used
  safe delay, not measured here.
- The SVG download starts from the drawing worker's callback, outside the
  click. It is checked by hand in Safari and Firefox: first through
  Playwright's WebKit and Firefox engines in a throwaway script, else by the
  user. The result goes into `lab-review.md`; a rework that starts the
  download inside the click happens only if an engine is shown to block it.

## 6. "Load into lab" runs

`loadIntoLab` in `BoardColumn.tsx` writes the knobs (`params.setMany`) and the
view (`view.apply`) and navigates to `/`, with no run: `setMany` does not
move `edits`, the only thing `useAutoRun` watches. The lab then shows the old
board under the new knobs until a reload generates from the link. The no-run
rule was carried over from the old lab's `libLoad` handler.

- After `setMany` and `view.apply`, `loadIntoLab` calls `control.start()`,
  then navigates. The worker lives in `App`, so the route change does not
  interrupt the run; the old board stays on stage until the new one arrives,
  as with every run.
- It calls `control.start()`, not `generate()` from `run/actions.ts`:
  `generate()` draws the knobs first in the simple view with randomising on
  (`drawIfRandom`), which would overwrite the loaded parameters.
- `RunControl` reaches `BoardColumn` as a prop from `Workspace`, which already
  holds `control`, the way `PresetStrip` and `CommandPalette` get it.
- A board stored as `aborted` (cut short by a time budget) runs to the end
  when loaded and may come out different from the stored one: the parameters
  reproduce the recipe, not the cut-short result. Accepted as is.
- The "no run" comment above `loadIntoLab` becomes one line on why `start()`
  and not `generate()`.

## Testing

Every fix gets a test that is red without it, and each named mutation says
which assertion it turns red.

| Fix | Test | Mutation |
|---|---|---|
| 1 engine | SVG with a palette has, per piece, the colour `assignPalette` gives it; `paper`, `ink`, `highlight` land in the background, strokes and highlight; `colored: false` ignores the palette; a colour with `"` is escaped; no colour fields gives today's bytes | ignore `palette` in `toSvg` |
| 1 element | `resolveColours` for theme only, stated only, both (stated wins), neither | swap the spread order |
| 1 lab | the export with a theme and with a custom palette posts the resolved colours to the worker, in `ExportButtons` and `BoardColumn` | drop the colours from the call |
| 2 | `store.test.ts`: save with `aborted: true`, overwrite the view with no metrics, meta and recipe still say `true` | restore `?? false` |
| 3 | edit A then B within 350 ms: `saveBoard` runs twice, A with A's view and B with B's; deleting A keeps B's save | one shared timer |
| 4 | a stale `done` after `abort()` and `start()` changes nothing; after `onerror` the next `start()` makes a new `Worker` | remove the guard; remove `kill()` |
| 5 | fake timers: the URL is not revoked right after `click()`, is revoked after 40 s | revoke at once |
| 6 | the click calls `control.start` once, after `params.values` hold `meta.params`; in the simple view with randomising on, the knobs after the click are exactly `meta.params` | `start()` → `generate()` |

Gates: `deno task verify` (engine and CLI, with golden SVGs and fingerprints)
and `pnpm nx run-many -t verify`. Then a live pass in Chrome on a copy of the
store (`ARROWZ_BOARDS_DIR`): an SVG downloaded with a theme, with a custom
palette and with a dark paper matches the screen, and "Load into lab" shows
the loaded board without a reload.

## Order of work

Engine (palette module, colours in `toSvg`), element (`resolveColours`), lab
(export, note), then fixes 2–6, then `lab-review.md`: item 2 of "What is
still open" marked done, the parity item's "SVG colours" narrowed to what is
left (`pad`, colour flags in the CLI), and the result of the Safari and
Firefox check.
