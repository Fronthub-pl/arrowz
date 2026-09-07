# Lab as a layer over the CLI: live command, board store, bilingual UI

Date: 2026-09-07. Concerns the probing prototype in `prototype/` (throwaway
code, but used daily to tune the generator).

## Goals

1. The lab shows, **before** generating, the CLI command that corresponds to
   the current knobs. That command is the only canonical form of invoking
   `carve.mjs`; the lab is a layer over the CLI and demonstrates it 1:1.
2. Every generated board, from the browser and from the command line, lands
   on disk in one store together with the command that produced it.
3. The lab gets a tab that browses the stored boards by size, with a preview
   and the command next to it.
4. The lab is bilingual: Polish and English, switchable at runtime.
5. Repository language rule (see `CLAUDE.md`): everything in the repository is
   English; Polish exists only in the lab translation dictionary.

## Starting point and problem

The `--svg` mode in `carve.mjs` predates `PARAM_SPEC` and `generate()`. It has
its own defaults (e.g. `anticoil` 1 vs 6 in the engine, `pStraight` 0.6 vs
0.85), its own flag names (`--straight`, `--lateral`, `--absorb`,
`--giantspacepen`), hard-coded `headBias` and `mix`, and no `restarts`. The
command the lab prints today (`--<lowercase key>`) yields a different board
than the lab: for 25×50, seed 7, defaults, the lab gets 126 pieces and the CLI
135.

The report and benchmark modes have yet another set of defaults (presets with
`wShort` 0.50, `wMid` 0.20, `wLateral` 6, `warns` 0). Three places declare
"defaults".

The prototype and all documents were written in Polish; the language rule now
requires English in code, comments, tests, docs, branches and commits.

## Decisions

- **One flag parser for every `carve.mjs` mode.** Each `PARAM_SPEC` key is a
  flag `--<lowercase key>=value`; defaults come from `defaultParams()`. Level
  presets set only `W` and `H`. Old names get aliases (`straight`, `lateral`,
  `absorb`, `giantspacepen`; `headbias` already matches) so README examples
  keep working. Non-engine flags: `--svg[=path]`, `--cell`, `--stroke`,
  `--colored`, `--top`, `--runs`, `--only`, `--bench`, `--show`, `--insane`,
  `--mid`, `--square`, `--portrait`.
- **`--svg` mode calls the engine's `generate()`**, exactly like the lab
  worker. Same function, same defaults, same restart scheme, so the command
  reproduces the board byte for byte.
- **Store on every `--svg`.** Bare `--svg` saves only to the store,
  `--svg=path` additionally copies the SVG to that path. Report and benchmark
  modes do not save (they produce no SVG).
- **The `preview.sh` gallery and `prototype/preview/` go away.** The lab with
  its store takes over.
- **Store in `prototype/boards/`, gitignored.** A 1000×1000 board is tens of
  MB; every board is reproducible from its command.
- **One live command in the lab.** The command block under the stats (which
  described the board that was produced) goes away; the store tab shows the
  command of a specific saved board.
- **English is the source language in code; Polish is a translation.**
  `PARAM_SPEC` labels, help texts and group ids are English. Inactive-knob
  reasons are keys resolved through `INACTIVE_REASONS` (English) or the Polish
  dictionary. All lab UI strings live in `lab-i18n.mjs` for both languages.
- **Existing Polish code and documents are translated in this work** (engine,
  CLI, worker, tests, README, main design spec, implementation plans), before
  the feature commits, and the two Polish commits from this session are
  replaced by English ones.

## Components

### `prototype/command.mjs` (pure JS: browser and Node)

- `buildCommand(params, view)` returns
  `node prototype/carve.mjs --svg --w=W --h=H --seed=S [--<key>=v …] --cell=C [--stroke=S] [--colored] [--top=N]`.
  Parameter flags only for values different from `PARAM_SPEC.def`, in
  `PARAM_SPEC` order. `--stroke` only when different from 0.5.
- `parseArgs(argv)` returns `{ params, view, rest }`: `params` is the full set
  from `defaultParams()` overridden by flags (aliases honoured, values
  `Number`), `view` is `{ cell, stroke, colored, top }`, `rest` holds flags not
  recognised as engine parameters (for report and benchmark modes).
  Property: `parseArgs(buildCommand(p, v).split(' ').slice(2))` gives `params`
  equal to `p` and `view` equal to `v`.
- `boardId(params)` returns `seed<seed>-<8 hex>`; 32-bit FNV-1a of the JSON of
  engine parameters restricted to `PARAM_SPEC` keys, in `PARAM_SPEC` order.
  View options are not part of the id: the same board rendered in colour
  overwrites the same slot.

### `prototype/store.mjs` (Node)

- Directory: `process.env.ARROWZ_BOARDS_DIR` or `prototype/boards/` next to
  the module.
- Layout: `<dir>/<W>x<H>/<id>.svg` and `<id>.json`.
- `saveBoard({ svg, params, view, command, metrics, source })` creates the
  size directory, writes both files, returns meta.
- Meta (`<id>.json`):
  `{ id, W, H, seed, params, view, command, source: 'lab'|'cli', createdAt (ISO), ok, pieces, maxLen, genMs, svgBytes }`.
- `listBoards()` returns `[{ size: 'WxH', W, H, cells, boards: [meta…] }]`,
  sizes ascending by cell count (ties by W), boards newest first. Directories
  with a malformed name and files without their pair are skipped.

### `prototype/lab-server.mjs` (Node, no dependencies)

- Replaces the Python server in `lab.sh`: `node prototype/lab-server.mjs [port]`.
- Static files from `prototype/` with `Cache-Control: no-store` (as before:
  an edited engine must be visible immediately). MIME types for `.html`,
  `.mjs`, `.js`, `.svg`, `.json`, `.css`. Paths escaping the base directory are
  rejected with 403. Board SVGs are under `/boards/<WxH>/<id>.svg`.
- `GET /api/boards` → JSON from `listBoards()`.
- `POST /api/boards` → JSON `{ svg, params, view, command, metrics, source }`
  → `saveBoard` → `201` with meta. No body limit (local tool; a 1000×1000
  board is tens of MB). Write error → `500` with a message.
- Listens on `127.0.0.1` only.

### `prototype/carve.mjs`

- Parsing through `parseArgs`. `--svg` mode: `generate({...params, trace,
  debug})`; on failure a message and exit code 1; `toSvg` with `view`;
  `saveBoard(... source: 'cli')`; optional copy under `--svg=path`; the
  `--top` printout stays; finally the store path and a metrics summary.
- Report and benchmark modes: parameters from `parseArgs().params`, presets
  set only `W`, `H` (`Lmax` stays 0 = automatic). Rest of the logic unchanged.
  Format flags renamed to English: `--square`, `--portrait`; format suffixes
  `·sq`, `·pt`.

### `prototype/lab-i18n.mjs`

- Exports `EN` and `PL`, each `{ groups, groupHelp, ui }`; `PL` additionally
  has `reasons` and `params` (`{ key: { label, help } }`) — the Polish
  translation of `INACTIVE_REASONS` and of `PARAM_SPEC` texts. English for
  reasons and params is read from the engine at runtime.
- `ui` holds every visible string of `lab.html`: headings, buttons, checkbox
  labels, help texts, status messages, stats row labels, longest-table
  headers, tab names, store-tab strings. Messages with values are functions,
  e.g. `ui.generatingBig(W, H, cells)`.

### `prototype/lab.html`

- **Language switch** (`PL` / `EN` buttons in the side panel header). Default:
  `localStorage.labLang`, else `navigator.language` starting with `pl` → `pl`,
  else `en`. Switching sets `<html lang>`, updates every element with
  `data-i18n`, rebuilds parameter labels, help texts, group names and inactive
  reasons in place (inputs keep their values), re-renders the report from the
  last result, the longest table and the store list. Stored in the URL hash
  (`__view.lang`) as well, so a shared link opens in the same language.
- **Tabs** above the main area: **Lab** and **Saved boards**. The active tab is
  in the URL hash (`__view.tab`), so a reload returns to the same view.
- Side panel, under the buttons: a `#command` block with the live command
  (`buildCommand(state, viewOptions())`) and a "Copy" button. Refreshed in
  `sync`, `setParam`, `reset`, `reseed` and on view option changes.
- Imports `buildCommand` from `./command.mjs`; the `#cli` block in the report
  is removed.
- After `done` and the first `render` of a generation, the page sends
  `POST /api/boards` with `{ svg, params: runParams, view, command, metrics:
  {ok, pieces, maxLen, genMs}, source: 'lab' }`. One send per generation
  (`saveNext` flag). Success appends "· saved WxH/id" to the status; a network
  failure or `404` appends "· not saved (no store server)" without touching
  the rest of the report.
- Store tab: on entry fetches `GET /api/boards`. Size buttons with board
  counts (default: the first size, or the last one chosen). Board list for the
  chosen size: id, seed, date, pieces, source. Clicking loads
  `/boards/<size>/<id>.svg` (`fetch` → `innerHTML` into `#board`, the same
  area as in the lab, so fit and zoom work) and shows the command in the side
  column with "Copy" and "Load into lab" (sets knobs from `meta.params` and
  view options from `meta.view`, switches to the first tab, does not
  generate automatically). A "Refresh" button re-fetches the list.
- Switching tabs does not interrupt a running generation; returning to the lab
  redraws the board from the worker (`render`).

### Housekeeping

- `prototype/lab.sh`: starts `lab-server.mjs`, otherwise unchanged.
- Delete `prototype/preview.sh` and `prototype/preview/`; `.gitignore`:
  `prototype/preview/*.svg` → `prototype/boards/`.
- `prototype/README.md` (already English after translation): the lab section
  describes the live command, the store, the tab and the language switch; CLI
  examples in the new syntax; the gallery mention replaced by the store.
- Memory: the lab note in basic-memory and `arrowz-artefakty.md` (gallery →
  store, language rule).

## Tests (`node --test 'prototype/*.test.mjs'`)

- `command.test.mjs`: round trip `buildCommand` → `parseArgs` for defaults
  and for a set of changed knobs; old flag aliases; `boardId` stable,
  independent of key order and view options, different for different seeds.
- `store.test.mjs`: `saveBoard` and `listBoards` in a temp directory
  (`ARROWZ_BOARDS_DIR`); size order; overwriting the same id; skipping junk.
- `lab-server.test.mjs`: server on port 0 with a temp directory; `POST`
  saves, `GET /api/boards` returns the entry, `GET /boards/<size>/<id>.svg`
  serves the content, a path escaping the base gives 403.
- CLI vs lab: a test generates a board via `generate()` and via
  `carve.mjs --svg` (child process) with the same command and compares the id
  and the SVG byte for byte.
- `lab-i18n.test.mjs`: every `PARAM_SPEC` key and every `INACTIVE_REASONS`
  key has a Polish entry; `EN.ui` and `PL.ui` have the same key set.
- UI manually in Chrome: the command changes before generating, the save
  after generation, the tab shows the board and the command, "Load into lab"
  sets the knobs, the language switch changes every visible string.

## Out of scope

- Deleting boards from the UI (`rm -r prototype/boards/<size>`).
- Thumbnails in the list (preview on click is enough; a 1000×1000 SVG as a
  thumbnail would be expensive).
- Searching by parameters.
