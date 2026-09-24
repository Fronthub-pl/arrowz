# Lab correctness: links, the palette, decimals, Polish strings

Date: 2026-09-25. Base: `main` = `44188ed`. Branch: `lab/correctness`.
Source: `lab-review.md` → "What is still open", item 1, every finding
re-checked against `44188ed`.

## Goal

A link opens exactly what it recorded, a stored board keeps the view it was
saved with, a Polish user can type a decimal, no English the lab wrote itself
reaches the Polish UI, and the command palette behaves as the modal it claims
to be. Links and stored boards that already exist open as they do today.

## Scope

In:

1. A view version that tells a link written by this lab from a legacy one,
   and the same version in a stored board's meta.
2. The redirects keep the hash.
3. The command palette keeps the focus and its keys.
4. `DraftNumber` accepts a decimal comma.
5. The palette's "on"/"off" and the lab's "not in the store" are translated.

Out (left in `lab-review.md`'s open list): the simple view's size rows, the
`aborted` flag cleared by a view edit, the pending view save timer, the
worker's handlers, the synchronous revoke, the SVG colour note.

## 1. The view version

### The problem

The link and the stored meta cannot say "none" for five fields, nor "0" for
the head height:

- The encoder leaves out an empty `palette`, `paper`, `ink` and
  `highlightColor`, and the decoder turns `theme: ''` into `undefined`.
  `applyPayload` keeps the page's value for `undefined`. On a `hashchange`
  (Back, or a pasted link) the page therefore keeps colours the link did not
  have, and the write-back effect then rewrites the entry with them.
- The decoder drops `headHeight: 0`, because 0 once meant "automatic".
  `VIEW_RANGE.headHeight.min` is 0 and 0 is now a head of no height, so a
  link or a reload loses it. The store's `fillView` does the same.
- An unknown theme name is kept, shown as "none" by the selector, and kept in
  the hash for good.
- `voids` is a visible switch that no link carries.

Absent cannot mean "none" in general: links written before the palette,
paper, ink and highlight colour existed also lack those keys, and must keep
the page's value.

### The design

One constant in the engine's neutral command module:

```ts
// packages/engine/command.ts
/** The version of the view a link or a stored meta was written with; absent reads as 1. */
export const VIEW_VERSION = 2
```

The same field name, `viewVersion`, is used in both places:

- **Link.** `encodeHash` writes `viewVersion: VIEW_VERSION` into `__view`,
  always writes `voids`, and still leaves out empty colours (a versioned link
  says "none" by absence).
- **Stored meta.** `saveBoard` writes `viewVersion: VIEW_VERSION` at the
  meta's top level. `BoardMeta` gets `viewVersion?: number`.

Reading, by version:

| Field | `viewVersion >= 2` | absent (legacy), unchanged from today |
| --- | --- | --- |
| `theme` | absent or unknown → `''` | absent, `''` or unknown → `undefined` (keep the page's) |
| `palette` | absent or no valid colour → `[]` | → `undefined` |
| `paper`, `ink`, `highlightColor` | absent or invalid → `''` | → `undefined` |
| `headHeight` | 0 is 0 | 0 → `undefined` (link) / default (store) |
| `voids` | `false` stays `false`; absent → `true` | always `true` |

Rules that hold in both versions: an unknown theme name never reaches the
store (validated with `themeOf` from `@arrowz/board-element`); the old keys
`hilite` and `highlight` still read as today.

`HashView` gets `viewVersion?: number` and `voids: boolean`. For a versioned
link the five colour fields always carry a value, so `applyPayload` keeps its
shape ("set everything that is not `undefined`") and gains one line,
`view.setFlag('voids', payload.view.voids)`.

**The store.** `fillView` takes the meta's version: the "0 means automatic"
exception applies only when `viewVersion` is absent. One marker per meta is
enough: `saveBoard` reads the previous meta through `readMeta`, which has
already passed every recipe in `sources` through `fillView`, so every save
rewrites all recipes in their migrated form. The long comment over
`fillView` that documents today's cost is replaced by one line stating the
rule. No file on disk is migrated; legacy metas read as today.

## 2. The redirects keep the hash

`<Navigate>` replaces the URL in a passive effect, and React runs child
effects before the parent's, so the hash is gone before `useUrlHash` reads it.

A small component, `KeepHashNavigate` (in `routes/`), renders
`<Navigate to={{ pathname: to, hash: location.hash }} replace />` from
`useLocation()`. It replaces the three redirects: `*` → `/`,
`/docs` → `/docs/element`, and an unknown docs page → `/docs/element`.

## 3. The command palette keeps the focus and its keys

Today every key is handled on the `<input>`. A click on a disabled row, the
footer or the empty-state text moves the focus off it; Escape then closes a
drawer behind the modal, `g` starts a carve and Tab walks into the page.

- The dialog frame (`.fw-pal`, `role="dialog"`) gets
  `onMouseDown={e => { if (e.target !== inputRef.current) e.preventDefault() }}`,
  so no click inside the palette takes the focus from the input. A row's
  `onClick` still fires.
- `onKeyDown` moves from the input to the frame. Keys from the input bubble
  to it unchanged, so arrows, Home, End, Enter, Escape and Tab behave as
  today, and a key pressed with the focus anywhere else in the frame is
  handled too.
- The document's hotkeys (`useSoloKey`, `useDrawerKeys`, `useRunKeys`) skip
  an event that is `defaultPrevented` or whose target is a field
  (`isHotkeyRefused`). A key from the input is already refused; the frame
  therefore calls `preventDefault()` on every key whose target is not the
  input, so no hotkey acts behind the modal whichever element holds the
  focus.

## 4. A decimal comma

`DraftNumber.commit` parses `raw.trim().replace(',', '.')`. It is the one
entry point for every numeric row, so stroke, head width and height, the
shares and the point radius all take `0,35`. Only the first comma is
replaced: `1,2,3` stays invalid.

## 5. Polish strings

- `palette/commands.ts`: the flag rows' value is
  `deps.dict.t(on ? 'valueOn' : 'valueOff')`.
- `BoardError` gets `kind: 'missing' | 'unreadable'`. `useStoredBoard` reports
  a board absent from the store as `{ name, kind: 'missing' }`; a server or
  decoder message stays `{ name, kind: 'unreadable', reason }`.
  `useRunState` words `missing` with a new dictionary key, `boardNotStored`
  (EN "Board {id} is not in the store", PL "Planszy {id} nie ma w magazynie"),
  at render time, so a language switch rewords it.

## Testing

Every new test is run on `44188ed` first and must fail there; the plan names
the assertion that fails.

| Fix | Test | Project |
| --- | --- | --- |
| View version, link | Cases in `state/url.test.ts`: a versioned link without colours decodes to `''`/`[]`; head height 0 stays 0; an unknown theme becomes `''`; `voids: false` round-trips. The existing legacy cases stay untouched. | `node` |
| Back restores colours | `state/useUrlHash.browser.test.tsx`: link A (no theme) → link B (theme and palette) → Back through a real `hashchange`: theme and palette are A's, and A's entry is not rewritten with B's. | chromium |
| View version, store | `packages/cli/store.test.ts`: a save with head height 0 reads back 0 and writes `viewVersion`; a hand-written legacy meta with 0 reads the default. | Deno |
| Redirects | The whole app mounted at `/unknown#…` and `/docs#…`: the link's knobs are in the store. A test of `KeepHashNavigate` alone would pass before the fix, because the bug is the effect order between parent and child. | chromium |
| Palette | Open ⌘K, click the disabled Abort row, press Escape: the palette closes and the report drawer stays open. The same after a click on the footer. `g` does not start a carve; the focus is in the input. | chromium |
| Decimal comma | Typing `0,35` and Enter in the stroke field sets 0.35. | chromium |
| Polish strings | The palette in PL shows "wł."; a missing board gives the Polish sentence and rewords on a language switch. The three tests that pass `reason: 'not in the store'` move to the new shape. | chromium |

Gates: `deno task verify`, then `pnpm nx run-many -t verify` in a clean
worktree. Last, a live pass in Chrome: an old `#…` link under a wrong path,
Back after a pasted themed link, head height 0 across a reload, `0,35` in PL,
and a click on a disabled palette row followed by Escape.
