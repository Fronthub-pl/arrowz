# Lab view schema (PR 1) Implementation Plan

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:subagent-driven-development (recommended) or superpowers:executing-plans to implement this plan task-by-task. Steps use checkbox (`- [ ]`) syntax for tracking.

**Goal:** One schema for the lab's 18 view fields drives the slice's defaults, a single-`set` `view.apply()`, and the link codec; the link and the store lose their version-dependent legacy rules.

**Architecture:** `apps/lab/src/state/viewSchema.ts` holds the `ViewFields` interface (the one hand-written list), `VIEW_SCHEMA` (a mapped type over it, so a missing entry fails `tsc`) and four helpers built on one loop. The slice, `url.ts`, `useUrlHash.ts` and `BoardColumn.loadIntoLab` consume them. The UI metadata of the view's numbers and flags merges into one `VIEW_ROWS` in `console/viewFields.ts`. `VIEW_VERSION` leaves the engine and the CLI store.

**Tech Stack:** React 19 + Zustand + Vitest 5 (projects `node` and `chromium`) in `apps/lab`; Deno 2.9 in `packages/engine` and `packages/cli`; Nx + pnpm.

**Spec:** `docs/superpowers/specs/2026-09-26-lab-structural-refactors-design.md` (section "PR 1 — one view schema"). Read it before Task 1.

## Global Constraints

- Branch `lab/view-schema`, already created on top of `lab/glossary`; the spec is its first commit (`0973339`). Commit after every task; no attribution lines in commit messages.
- Everything in the repository is English: code, comments, tests, commit messages.
- No `any`, no non-null assertions (`!`). A type fix must not add a value-changing fallback.
- Comments say why, once: one line by default, at most 6 lines unless it is a module or API header (≤ 24 lines). No history in comments ("used to", "legacy link", "Ruling 6", PR numbers). Cite symbols, never `file.ts:NN`. `packages/engine/comments.test.ts` enforces this for `apps/lab/src`.
- The lab imports the engine from `packages/engine/dist/`: after changing `packages/engine/*.ts`, run `pnpm nx build engine` before any lab test or check.
- Lab tests: `cd apps/lab && pnpm exec vitest run --project node <file>` for `*.test.ts`, `--project chromium <file>` for `*.browser.test.tsx`. Typecheck: `pnpm nx run lab:check` from the repo root.
- Deno tests: from the repo root, `deno test --allow-read --allow-write --allow-env --allow-run --allow-net <file>`.
- Behaviour outside the spec's five intended changes stays as it is; every browser test not named in a task passes without assertion edits.

## Review Focus

1. **A link re-encodes to itself.** `encodeHash(decodeHash(h))` must equal `h` for any `h` the lab wrote, or the `hashchange` handler (which compares `location.hash` to a fresh encode) restarts a carve on Back. Pinned in Task 3 ("a written link re-encodes to the same string").
2. **Clearing the `top` box still gives 0, not the lab's starting 5.** `setNumber` keeps `viewNumberOf`, whose fallback is `DEFAULT_VIEW` (top 0), while `apply` falls back to the lab's defaults (top 5). Pinned in Task 2 ("an emptied top field falls back to the CLI's 0").
3. **A hand-written link with `pad: 0` keeps a zero margin.** 0 is a legal margin and must not read as missing. Pinned in Task 1 (reader test) and Task 3 (round trip with `pad: 0`).
4. **"Load into lab" leaves the page's colours, points, margin and voids alone.** `apply` takes a partial patch; a full-view patch there would be a silent behaviour change. Pinned in Task 4.
5. **One notification per link.** `applyPayload` must not fall back to per-field setters. Pinned in Task 2 (slice) and Task 3 (a pasted link notifies the view once).

---

## File Structure

| File | Change | Responsibility |
|---|---|---|
| `apps/lab/src/state/viewSchema.ts` | create | `ViewFields`, `ViewKey`, `VIEW_SCHEMA`, `VIEW_KEYS`, `VIEW_DEFAULTS`, `PALETTE_CAP`, `readView`, `readPatch`, `pickView` |
| `apps/lab/src/state/viewSchema.test.ts` | create | reader and helper tests (project `node`) |
| `apps/lab/src/state/view.slice.ts` | modify | state from `VIEW_DEFAULTS`, new `apply`, setters through `readPatch` |
| `apps/lab/src/state/view.slice.test.ts` | modify | `apply` tests, the `top` fallback test |
| `apps/lab/src/state/url.ts` | modify | codec as a loop over the schema, no version |
| `apps/lab/src/state/url.fixtures.ts` | modify | `VIEW` as a full view |
| `apps/lab/src/state/url.test.ts` | rewrite | codec tests without legacy |
| `apps/lab/src/state/useUrlHash.ts` | modify | `viewFor` via `pickView`, `applyPayload` via one `apply` |
| `apps/lab/src/state/useUrlHash.browser.test.tsx` | modify | legacy cases replaced |
| `apps/lab/src/library/BoardColumn.tsx` | modify | `loadIntoLab` via one `apply` |
| `apps/lab/src/library/BoardColumn.browser.test.tsx` | modify | new case: load leaves colours alone |
| `apps/lab/src/console/viewFields.ts` | modify | one `VIEW_ROWS`, `VIEW_NUMBERS`, `VIEW_FLAGS` as key lists |
| `apps/lab/src/console/viewFields.test.ts` | modify | follows the merged table |
| `apps/lab/src/console/ViewPanel.tsx` | modify | rows keyed by `ViewNumber`; `fieldOf` deleted |
| `apps/lab/src/simple/SimplePanel.tsx`, `apps/lab/src/library/BoardPreview.tsx`, `apps/lab/src/palette/commands.ts` | modify | follow the merged table |
| `packages/engine/command.ts`, `packages/engine/types.ts` | modify | delete `VIEW_VERSION`, `BoardMeta.viewVersion` |
| `packages/cli/store.ts`, `packages/cli/store.test.ts` | modify | delete the version branch and its tests |
| `packages/cli/boards/*/sha256-*.json` (2 files) | modify | delete the `"viewVersion": 2` line |

---

### Task 1: The view schema

**Files:**
- Create: `apps/lab/src/state/viewSchema.ts`
- Test: `apps/lab/src/state/viewSchema.test.ts`

**Interfaces:**
- Consumes: `DEFAULT_PAD`, `DEFAULT_POINT_COLOR`, `DEFAULT_POINT_RADIUS`, `PAD_RANGE`, `POINT_RADIUS_RANGE`, `themeOf` from `@arrowz/board-element`; `DEFAULT_VIEW`, `VIEW_RANGE` from `@arrowz/engine/command`; `ViewNumber` from `@arrowz/engine`.
- Produces (later tasks rely on these exact names):
  - `interface ViewFields` (18 fields, listed below), `type ViewKey = keyof ViewFields`
  - `const PALETTE_CAP = 8`
  - `const VIEW_SCHEMA: { readonly [K in ViewKey]: FieldSpec<ViewFields[K]> }` with `FieldSpec<T> = { def: T; read(raw: unknown): T | undefined }`
  - `const VIEW_KEYS: readonly ViewKey[]`, `const VIEW_DEFAULTS: ViewFields`
  - `function readView(raw: Readonly<Record<string, unknown>>): ViewFields` — every key, unreadable or missing → `def`
  - `function readPatch(patch: Readonly<Partial<Record<ViewKey, unknown>>>): Partial<ViewFields>` — only the keys present in `patch`, unreadable → `def`
  - `function pickView(view: ViewFields): ViewFields` — the 18 fields out of a larger object (the slice with its actions)

- [ ] **Step 1: Write the failing test**

Create `apps/lab/src/state/viewSchema.test.ts`:

```ts
import { DEFAULT_PAD, DEFAULT_POINT_COLOR, DEFAULT_POINT_RADIUS } from '@arrowz/board-element'
import { DEFAULT_VIEW, VIEW_RANGE } from '@arrowz/engine/command'
import { describe, expect, test } from 'vitest'
import { PALETTE_CAP, pickView, readPatch, readView, VIEW_DEFAULTS, VIEW_KEYS, VIEW_SCHEMA } from './viewSchema'

describe('the view schema', () => {
  test('starts where the lab starts: the page’s cell and top, the CLI’s and the element’s rest', () => {
    expect(VIEW_DEFAULTS).toEqual({
      cell: 12,
      stroke: DEFAULT_VIEW.stroke,
      headWidth: DEFAULT_VIEW.headWidth,
      headHeight: DEFAULT_VIEW.headHeight,
      top: 5,
      colored: false,
      rounded: true,
      highlightLongest: false,
      voids: true,
      showPoints: false,
      pointColor: DEFAULT_POINT_COLOR,
      pointRadius: DEFAULT_POINT_RADIUS,
      theme: '',
      palette: [],
      paper: '',
      ink: '',
      highlightColor: '',
      pad: DEFAULT_PAD,
    })
  })

  test('every field reads its own default back unchanged', () => {
    for (const key of VIEW_KEYS) expect(VIEW_SCHEMA[key].read(VIEW_DEFAULTS[key])).toEqual(VIEW_DEFAULTS[key])
  })

  test('a view number is clamped into VIEW_RANGE, and a whole one rounds', () => {
    expect(VIEW_SCHEMA.cell.read(9999)).toBe(VIEW_RANGE.cell.max)
    expect(VIEW_SCHEMA.stroke.read(-4)).toBe(VIEW_RANGE.stroke.min)
    expect(VIEW_SCHEMA.top.read(7.6)).toBe(8)
    expect(VIEW_SCHEMA.cell.read('18')).toBe(18)
  })

  test('zero is a value, not an absence', () => {
    expect(VIEW_SCHEMA.headHeight.read(0)).toBe(0)
    expect(VIEW_SCHEMA.headWidth.read(0)).toBe(0)
    expect(VIEW_SCHEMA.top.read(0)).toBe(0)
    expect(VIEW_SCHEMA.pad.read(0)).toBe(0)
  })

  test('an empty, non-numeric or non-finite number is unreadable', () => {
    for (const raw of ['', '  ', 'x', null, undefined, true, Number.NaN, Number.POSITIVE_INFINITY, {}]) {
      expect(VIEW_SCHEMA.cell.read(raw)).toBeUndefined()
      expect(VIEW_SCHEMA.pointRadius.read(raw)).toBeUndefined()
      expect(VIEW_SCHEMA.pad.read(raw)).toBeUndefined()
    }
  })

  test('the point radius and the margin are held in the element’s ranges, the margin in whole cells', () => {
    expect(VIEW_SCHEMA.pointRadius.read(3)).toBe(0.5)
    expect(VIEW_SCHEMA.pointRadius.read(-1)).toBe(0)
    expect(VIEW_SCHEMA.pad.read(99)).toBe(16)
    expect(VIEW_SCHEMA.pad.read(2.6)).toBe(3)
  })

  test('a flag reads only a boolean', () => {
    expect(VIEW_SCHEMA.rounded.read(false)).toBe(false)
    expect(VIEW_SCHEMA.rounded.read('false')).toBeUndefined()
    expect(VIEW_SCHEMA.colored.read(1)).toBeUndefined()
  })

  test('a colour is #rrggbb, lower-cased; the board colours also take "" for unset', () => {
    expect(VIEW_SCHEMA.paper.read('#AABBCC')).toBe('#aabbcc')
    expect(VIEW_SCHEMA.paper.read('')).toBe('')
    expect(VIEW_SCHEMA.paper.read('rebeccapurple')).toBeUndefined()
    expect(VIEW_SCHEMA.highlightColor.read('#abc')).toBeUndefined()
    // The dot colour has no "unset": the element draws nothing for ''.
    expect(VIEW_SCHEMA.pointColor.read('')).toBeUndefined()
    expect(VIEW_SCHEMA.pointColor.read('#070809')).toBe('#070809')
  })

  test('a theme is "" or a name the element knows', () => {
    expect(VIEW_SCHEMA.theme.read('gruvbox-dark')).toBe('gruvbox-dark')
    expect(VIEW_SCHEMA.theme.read('')).toBe('')
    expect(VIEW_SCHEMA.theme.read('drak')).toBeUndefined()
  })

  test('a palette keeps #rrggbb entries, lower-cased, up to the cap', () => {
    const nine = Array.from({ length: 9 }, (_, i) => `#${String(i).repeat(6)}`)
    expect(VIEW_SCHEMA.palette.read(nine)).toEqual(nine.slice(0, PALETTE_CAP))
    expect(VIEW_SCHEMA.palette.read(['red', '#AABBCC', 7, '#ZZZZZZ'])).toEqual(['#aabbcc'])
    expect(VIEW_SCHEMA.palette.read([])).toEqual([])
    expect(VIEW_SCHEMA.palette.read('#112233')).toBeUndefined()
  })

  test('readView fills every missing or unreadable field with its default', () => {
    expect(readView({})).toEqual(VIEW_DEFAULTS)
    expect(readView({ cell: 'x', paper: 'rebeccapurple', rounded: 'yes', pad: 7 })).toEqual({ ...VIEW_DEFAULTS, pad: 7 })
  })

  test('readView ignores keys the schema does not have', () => {
    expect(readView({ hilite: true, highlight: '#ff0000', help: false })).toEqual(VIEW_DEFAULTS)
  })

  test('readPatch returns only the keys it was given, an unreadable one as its default', () => {
    expect(readPatch({ cell: 20, paper: 'nope' })).toEqual({ cell: 20, paper: '' })
    expect(Object.keys(readPatch({ stroke: 0.7 }))).toEqual(['stroke'])
  })

  test('pickView keeps the fields and drops everything else', () => {
    const withExtras = { ...VIEW_DEFAULTS, setNumber: () => {}, lang: 'pl' }
    expect(pickView(withExtras)).toEqual(VIEW_DEFAULTS)
  })
})
```

- [ ] **Step 2: Run the test to verify it fails**

Run: `cd apps/lab && pnpm exec vitest run --project node src/state/viewSchema.test.ts`
Expected: FAIL — `Failed to resolve import "./viewSchema"`.

- [ ] **Step 3: Write the implementation**

Create `apps/lab/src/state/viewSchema.ts`. Keep the field doc comments: they move here from `ViewState` in `view.slice.ts` (Task 2 deletes them there).

```ts
import {
  DEFAULT_PAD,
  DEFAULT_POINT_COLOR,
  DEFAULT_POINT_RADIUS,
  PAD_RANGE,
  POINT_RADIUS_RANGE,
  themeOf,
} from '@arrowz/board-element'
import type { ViewNumber } from '@arrowz/engine'
import { DEFAULT_VIEW, VIEW_RANGE } from '@arrowz/engine/command'

/**
 * The lab's view: the one list of its fields. `VIEW_SCHEMA` is typed over it,
 * so a field without a default and a reader does not compile, and the slice,
 * the link and "Load into lab" all read and normalise through that table.
 */
export interface ViewFields {
  cell: number
  stroke: number
  /** 0 is the automatic width, worked out from the stroke. */
  headWidth: number
  headHeight: number
  top: number
  colored: boolean
  rounded: boolean
  highlightLongest: boolean
  /** The element's switch for empty cells; `viewOf` does not carry it and the CLI has no flag for it. */
  voids: boolean
  /** The point grid: the element's settings, not the engine's, like `voids`. */
  showPoints: boolean
  pointColor: string
  pointRadius: number
  /** Name of a built-in board theme; '' draws the element's own colours. */
  theme: string
  /**
   * The custom palette, capped at `PALETTE_CAP`. It coexists with `theme`,
   * overriding the theme's colours; empty lets the theme's own palette show.
   */
  palette: string[]
  /**
   * The board's own surface colours, or '' for "not set", which lets a theme
   * supply them. Never handed to the element as '': it sanitises after
   * precedence, so a stated empty string would beat the theme.
   */
  paper: string
  ink: string
  /** The highlight colour; same "not set" rule as `paper`. */
  highlightColor: string
  /** The margin in cells; 0 is a real margin, so there is no "not set". */
  pad: number
}

export type ViewKey = keyof ViewFields

/** The lab's cap; the element and the engine take any number of colours. */
export const PALETTE_CAP = 8

interface FieldSpec<T> {
  def: T
  /** The value normalised for the store, or `undefined` when it cannot be read. */
  read(raw: unknown): T | undefined
}

const HEX_COLOR = /^#[0-9a-f]{6}$/i

/** A number from a link or a typed field; '' and non-finite values are unreadable, not 0. */
function finite(raw: unknown): number | undefined {
  if (typeof raw === 'number') return Number.isFinite(raw) ? raw : undefined
  if (typeof raw !== 'string' || raw.trim() === '') return undefined
  const n = Number(raw.trim())
  return Number.isFinite(n) ? n : undefined
}

const clamp = (n: number, range: { min: number; max: number }) => Math.min(range.max, Math.max(range.min, n))

/** `viewNumberOf`'s clamp and rounding, without its fallback: the caller picks the default. */
function viewNumber(field: ViewNumber, def: number): FieldSpec<number> {
  const range = VIEW_RANGE[field]
  return {
    def,
    read: (raw) => {
      const n = finite(raw)
      if (n === undefined) return undefined
      const v = clamp(n, range)
      return range.whole ? Math.round(v) : v
    },
  }
}

function flag(def: boolean): FieldSpec<boolean> {
  return { def, read: (raw) => (typeof raw === 'boolean' ? raw : undefined) }
}

/** What `<input type="color">` can show, lower-cased as it reports it. */
function hex(raw: unknown): string | undefined {
  return typeof raw === 'string' && HEX_COLOR.test(raw) ? raw.toLowerCase() : undefined
}

/** A board colour: '' is "not set" and lets a theme decide. */
const optionalColour: FieldSpec<string> = { def: '', read: (raw) => (raw === '' ? '' : hex(raw)) }

export const VIEW_SCHEMA: { readonly [K in ViewKey]: FieldSpec<ViewFields[K]> } = {
  // The page's own starting cell and top; the rest are the CLI's.
  cell: viewNumber('cell', 12),
  stroke: viewNumber('stroke', DEFAULT_VIEW.stroke),
  headWidth: viewNumber('headWidth', DEFAULT_VIEW.headWidth),
  headHeight: viewNumber('headHeight', DEFAULT_VIEW.headHeight),
  top: viewNumber('top', 5),
  colored: flag(false),
  rounded: flag(true),
  highlightLongest: flag(false),
  voids: flag(true),
  showPoints: flag(false),
  pointColor: { def: DEFAULT_POINT_COLOR, read: hex },
  pointRadius: {
    def: DEFAULT_POINT_RADIUS,
    read: (raw) => {
      const n = finite(raw)
      return n === undefined ? undefined : clamp(n, POINT_RADIUS_RANGE)
    },
  },
  theme: {
    def: '',
    read: (raw) => (typeof raw === 'string' && (raw === '' || themeOf(raw) !== null) ? raw : undefined),
  },
  palette: {
    def: [],
    // Entries the colour input cannot show are dropped before the cap, so garbage cannot burn a slot.
    read: (raw) =>
      Array.isArray(raw)
        ? raw.flatMap((c) => {
          const colour = hex(c)
          return colour === undefined ? [] : [colour]
        }).slice(0, PALETTE_CAP)
        : undefined,
  },
  paper: optionalColour,
  ink: optionalColour,
  highlightColor: optionalColour,
  pad: {
    def: DEFAULT_PAD,
    read: (raw) => {
      const n = finite(raw)
      return n === undefined ? undefined : clamp(Math.round(n), PAD_RANGE)
    },
  },
}

// `Object.keys` types its result as `string[]`; the keys are exactly `ViewKey`'s.
export const VIEW_KEYS = Object.keys(VIEW_SCHEMA) as ViewKey[]

function normalise<K extends ViewKey>(key: K, raw: unknown): ViewFields[K] {
  const spec: FieldSpec<ViewFields[K]> = VIEW_SCHEMA[key]
  return spec.read(raw) ?? spec.def
}

// `Object.fromEntries` loses the pairing of key and type; every key is visited, so the object is complete.
function everyField(value: <K extends ViewKey>(key: K) => ViewFields[K]): ViewFields {
  return Object.fromEntries(VIEW_KEYS.map((key) => [key, value(key)])) as unknown as ViewFields
}

export const VIEW_DEFAULTS: ViewFields = everyField((key) => VIEW_SCHEMA[key].def)

/** A whole view from untrusted input: a link's `__view`. */
export function readView(raw: Readonly<Record<string, unknown>>): ViewFields {
  return everyField((key) => normalise(key, raw[key]))
}

function assign<K extends ViewKey>(out: Partial<ViewFields>, key: K, value: ViewFields[K]): void {
  out[key] = value
}

/** The fields a patch names, normalised; the ones it does not name stay out. */
export function readPatch(patch: Readonly<Partial<Record<ViewKey, unknown>>>): Partial<ViewFields> {
  const out: Partial<ViewFields> = {}
  for (const key of VIEW_KEYS) if (key in patch) assign(out, key, normalise(key, patch[key]))
  return out
}

/** The view out of an object that carries more: the slice with its actions. */
export function pickView(view: ViewFields): ViewFields {
  return everyField((key) => view[key])
}
```

If `deno fmt` (run by `lab:fmt`) re-indents the palette `flatMap`, accept its output.

- [ ] **Step 4: Run the test to verify it passes**

Run: `cd apps/lab && pnpm exec vitest run --project node src/state/viewSchema.test.ts`
Expected: PASS (13 tests).

Run: `pnpm nx run lab:check`
Expected: no type errors. `lab:lint` must also accept the two `as` casts; if the linter refuses `as unknown as`, write `as ViewFields` alone and re-run.

- [ ] **Step 5: Commit**

```bash
git add apps/lab/src/state/viewSchema.ts apps/lab/src/state/viewSchema.test.ts
git commit -m "Lab: one schema for the view's eighteen fields, with a reader per field"
```

---

### Task 2: The slice reads through the schema, and `view.apply()`

**Files:**
- Modify: `apps/lab/src/state/view.slice.ts` (whole file; current lines 1-196)
- Test: `apps/lab/src/state/view.slice.test.ts`

**Interfaces:**
- Consumes: `ViewFields`, `ViewKey`, `VIEW_DEFAULTS`, `PALETTE_CAP`, `readPatch` from Task 1.
- Produces: `ViewState extends ViewFields` with the existing actions unchanged in name and signature, plus `apply(patch: Partial<ViewFields>): void`. `PALETTE_CAP` stays importable from `./view.slice` (re-export) because `view.slice.test.ts` and `url.ts` import it from there. `viewOf` and `ViewFlag` unchanged.

- [ ] **Step 1: Write the failing tests**

Append to `apps/lab/src/state/view.slice.test.ts` (it already has a `view()` helper and a `beforeEach` that resets the slice; reuse them — read the top 38 lines first):

```ts
test('apply writes every field it is given in one update', () => {
  let updates = 0
  const stop = useStore.subscribe(() => void updates++)
  try {
    view().apply({ cell: 20, paper: '#010203', rounded: false, palette: ['#112233'] })
  } finally {
    stop()
  }
  expect(updates).toBe(1)
  expect(view().cell).toBe(20)
  expect(view().paper).toBe('#010203')
  expect(view().rounded).toBe(false)
  expect(view().palette).toEqual(['#112233'])
})

test('apply leaves the fields it is not given alone', () => {
  view().setPaper('#010203')
  view().setPad(7)
  view().apply({ stroke: 0.7 })
  expect(view().paper).toBe('#010203')
  expect(view().pad).toBe(7)
  expect(view().stroke).toBe(0.7)
})

test('apply normalises what it is given, as a link would be read', () => {
  view().apply({ cell: 9999, pad: 2.6, pointRadius: 3 })
  expect(view().cell).toBe(VIEW_RANGE.cell.max)
  expect(view().pad).toBe(3)
  expect(view().pointRadius).toBe(0.5)
})

// `apply` falls back to the lab's own top (5); a cleared field keeps the CLI's 0 (`viewNumberOf`).
test('an emptied top field falls back to the CLI’s 0, not to the lab’s starting 5', () => {
  view().setNumber('top', '9')
  view().setNumber('top', '')
  expect(view().top).toBe(DEFAULT_VIEW.top)
  expect(view().top).toBe(0)
})
```

Check that `DEFAULT_VIEW`, `VIEW_RANGE` and `useStore` are imported at the top of the file; add what is missing (`import { DEFAULT_VIEW, VIEW_RANGE } from '@arrowz/engine/command'`, `import { useStore } from './store'`).

- [ ] **Step 2: Run the tests to verify they fail**

Run: `cd apps/lab && pnpm exec vitest run --project node src/state/view.slice.test.ts`
Expected: FAIL — `view(...).apply is not a function` in the three `apply` tests. The `top` test passes already (it pins today's behaviour; keep it).

- [ ] **Step 3: Write the implementation**

In `apps/lab/src/state/view.slice.ts`:

1. Replace the imports and the `PALETTE_CAP` block (lines 1-17) with:

```ts
import type { View, ViewNumber } from '@arrowz/engine'
import { viewNumberOf } from '@arrowz/engine/command'
import { PALETTE_CAP, readPatch, VIEW_DEFAULTS, type ViewFields, type ViewKey } from './viewSchema'

export { PALETTE_CAP }

export type ViewFlag = 'colored' | 'rounded' | 'highlightLongest' | 'voids' | 'showPoints'
```

2. Replace `export interface ViewState {` and its 18 field declarations with `export interface ViewState extends ViewFields {`. Keep every action declaration and its doc comment as it is, and add:

```ts
  /** Writes the fields the patch names in one update, each normalised by `VIEW_SCHEMA`; the rest stay. */
  apply(patch: Partial<ViewFields>): void
```

The field doc comments now live on `ViewFields` (Task 1); delete them here.

3. Replace `createViewSlice` (lines 123-196) with:

```ts
export function createViewSlice(set: SetStore): ViewState {
  const patch = (next: Partial<ViewState>) => set((state) => ({ view: { ...state.view, ...next } }))
  // Every setter below except `setNumber` and the palette's index edits goes through the schema's readers.
  const write = (raw: Partial<Record<ViewKey, unknown>>) => patch(readPatch(raw))
  return {
    ...VIEW_DEFAULTS,
    apply: (fields) => write(fields),
    // `viewNumberOf`, not the schema: an emptied field falls back to the CLI's default, not the lab's start.
    setNumber: (field, raw) => patch({ [field]: viewNumberOf(raw, field) }),
    toggle: (flag) => set((state) => ({ view: { ...state.view, [flag]: !state.view[flag] } })),
    setFlag: (flag, on) => write({ [flag]: on }),
    setPointColor: (color) => write({ pointColor: color }),
    setPointRadius: (raw) => write({ pointRadius: raw }),
    setTheme: (name) => write({ theme: name }),
    setPaper: (color) => write({ paper: color }),
    setInk: (color) => write({ ink: color }),
    setHighlightColor: (color) => write({ highlightColor: color }),
    setPad: (n) => write({ pad: n }),
    setPalette: (colors) => write({ palette: colors }),
    addPaletteColor: () =>
      set((state) => {
        // The cap refuses silently: the reader would drop the ninth colour anyway.
        if (state.view.palette.length >= PALETTE_CAP) return { view: state.view }
        // See the interface doc above: only the empty-to-one transition turns `colored` on.
        const turnColoredOn = state.view.palette.length === 0
        return {
          view: {
            ...state.view,
            ...readPatch({ palette: [...state.view.palette, NEW_PALETTE_COLOR] }),
            ...(turnColoredOn ? { colored: true } : {}),
          },
        }
      }),
    setPaletteColor: (index, color) =>
      set((state) => ({
        view: { ...state.view, ...readPatch({ palette: state.view.palette.map((c, i) => (i === index ? color : c)) }) },
      })),
    removePaletteColor: (index) =>
      set((state) => ({
        view: { ...state.view, ...readPatch({ palette: state.view.palette.filter((_, i) => i !== index) }) },
      })),
  }
}
```

Delete `paletteUpdate` (its cap now lives in `VIEW_SCHEMA.palette.read`) and update the `setPalette` doc comment in the interface: "Replaces the whole palette, read by `VIEW_SCHEMA.palette` (the cap, `#rrggbb`). None of the palette actions touches the theme." Keep `NEW_PALETTE_COLOR` and `viewOf`.

Note on behaviour: the setters' results are unchanged for every value the UI sends (hex from `<input type="color">`, '' from the clear buttons, a known theme from the `<select>`, finite numbers). `setPointRadius('')` and `setPad(NaN)` still give the element's defaults, now as `def`.

- [ ] **Step 4: Run the tests to verify they pass**

Run: `cd apps/lab && pnpm exec vitest run --project node src/state/view.slice.test.ts src/state/viewSchema.test.ts`
Expected: PASS, including all 30 existing slice tests.

Run: `pnpm nx run lab:check`
Expected: no type errors.

- [ ] **Step 5: Commit**

```bash
git add apps/lab/src/state/view.slice.ts apps/lab/src/state/view.slice.test.ts
git commit -m "Lab: view.apply writes a view patch in one update; the setters read through the schema"
```

---

### Task 3: The link is a full view snapshot, read by the schema

This is the task that changes the link's contract (spec, intended changes 1-5). Code and tests change together in one commit.

**Files:**
- Modify: `apps/lab/src/state/url.ts` (whole file; current lines 1-170)
- Modify: `apps/lab/src/state/url.fixtures.ts`
- Rewrite: `apps/lab/src/state/url.test.ts`
- Modify: `apps/lab/src/state/useUrlHash.ts` (lines 1-68)
- Modify: `apps/lab/src/state/useUrlHash.browser.test.tsx` (lines 11-12, 282-288, 396-426)

**Interfaces:**
- Consumes: `ViewFields`, `VIEW_DEFAULTS`, `readView`, `pickView` (Task 1); `view.apply` (Task 2).
- Produces: `type HashView = ViewFields & { lang?: Lang | undefined }`; `encodeHash({ params, view: HashView, carried })` and `decodeHash(hash): HashPayload | null` keep their names and shapes; `HashPayload.view` is a complete `HashView`. `VIEW` in `url.fixtures.ts` is a complete `HashView`.

- [ ] **Step 1: Rewrite the fixture and the codec tests**

`apps/lab/src/state/url.fixtures.ts`:

```ts
import type { HashView } from './url'
import { VIEW_DEFAULTS } from './viewSchema'

/** A complete view as the lab writes it, so a round trip returns it unchanged. */
export const VIEW: HashView = { ...VIEW_DEFAULTS, highlightLongest: true, lang: 'en' }
```

Replace `apps/lab/src/state/url.test.ts` entirely:

```ts
import { defaultParams } from '@arrowz/engine'
import { describe, expect, it } from 'vitest'
import { decodeHash, encodeHash } from './url'
import { VIEW } from './url.fixtures'
import { VIEW_DEFAULTS } from './viewSchema'

/** A hand-written link: what someone pastes, not what the lab writes. */
const link = (json: Record<string, unknown>) => '#' + encodeURIComponent(JSON.stringify(json))

/** Every field away from its default, so a field the codec drops cannot pass as its default. */
const EVERY_FIELD = {
  ...VIEW,
  cell: 20,
  stroke: 0.7,
  headWidth: 0.3,
  headHeight: 0,
  top: 9,
  colored: true,
  rounded: false,
  highlightLongest: true,
  voids: false,
  showPoints: true,
  pointColor: '#070809',
  pointRadius: 0.2,
  theme: 'gruvbox-dark',
  palette: ['#112233', '#aabbcc'],
  paper: '#010203',
  ink: '#040506',
  highlightColor: '#0a0b0c',
  pad: 0,
  lang: 'pl' as const,
}

describe('the hash codec', () => {
  it('reads back what it wrote', () => {
    const params = { ...defaultParams(), W: 33, H: 66, seed: 9 }
    const back = decodeHash(encodeHash({ params, view: VIEW, carried: {} }))
    expect(back?.params.W).toBe(33)
    expect(back?.params.seed).toBe(9)
    expect(back?.view).toEqual(VIEW)
  })

  it('carries every view field through a round trip', () => {
    const back = decodeHash(encodeHash({ params: defaultParams(), view: EVERY_FIELD, carried: {} }))
    expect(back?.view).toEqual(EVERY_FIELD)
  })

  // The hashchange handler compares the address bar with a fresh encode; a drift would restart a carve on Back.
  it('a written link re-encodes to the same string', () => {
    const first = encodeHash({ params: defaultParams(), view: EVERY_FIELD, carried: { tab: 'library' } })
    const back = decodeHash(first)
    expect(back).not.toBeNull()
    if (back === null) return
    expect(encodeHash({ params: { ...defaultParams(), ...back.params }, view: back.view, carried: back.carried }))
      .toBe(first)
  })

  it('writes every field, the empty ones included, and no version', () => {
    const body = JSON.parse(decodeURIComponent(encodeHash({ params: defaultParams(), view: VIEW, carried: {} }).slice(1)))
    expect(body.__view.palette).toEqual([])
    expect(body.__view.paper).toBe('')
    expect(body.__view.highlightColor).toBe('')
    expect(body.__view.pad).toBe(VIEW_DEFAULTS.pad)
    expect(body.__view).not.toHaveProperty('viewVersion')
  })

  it('opens a link that names no view field on the defaults', () => {
    expect(decodeHash(link({ W: 40, __view: {} }))?.view).toEqual(VIEW_DEFAULTS)
    expect(decodeHash(link({ W: 40 }))?.view).toEqual(VIEW_DEFAULTS)
  })

  it('opens a field it cannot read on its default', () => {
    const back = decodeHash(
      link({ __view: { cell: 'x', rounded: 'yes', theme: 'drak', paper: 'rebeccapurple', palette: 'red', pad: null } }),
    )?.view
    expect(back?.cell).toBe(VIEW_DEFAULTS.cell)
    expect(back?.rounded).toBe(VIEW_DEFAULTS.rounded)
    expect(back?.theme).toBe('')
    expect(back?.paper).toBe('')
    expect(back?.palette).toEqual([])
    expect(back?.pad).toBe(VIEW_DEFAULTS.pad)
  })

  it('reads a head height of 0 as a head of no height', () => {
    expect(decodeHash(link({ __view: { headHeight: 0 } }))?.view.headHeight).toBe(0)
    expect(decodeHash(link({ __view: { headHeight: '0' } }))?.view.headHeight).toBe(0)
  })

  it('ignores keys the view does not have', () => {
    const back = decodeHash(link({ __view: { hilite: true, highlight: '#ff0000', help: false } }))?.view
    expect(back?.highlightLongest).toBe(false)
    expect(back?.highlightColor).toBe('')
    expect(back).not.toHaveProperty('help')
  })

  it('reads numbers written as strings', () => {
    const back = decodeHash(link({ __view: { cell: '18', stroke: '0.6', top: '7' } }))?.view
    expect(back?.cell).toBe(18)
    expect(back?.stroke).toBe(0.6)
    expect(back?.top).toBe(7)
  })

  it('clamps a hand-edited palette to the cap, drops what the colour input cannot show, and lower-cases', () => {
    const nine = Array.from({ length: 9 }, (_, i) => `#${String(i).repeat(6)}`)
    expect(decodeHash(link({ __view: { palette: nine } }))?.view.palette).toEqual(nine.slice(0, 8))
    expect(decodeHash(link({ __view: { palette: ['red', '#AABBCC', '#ZZZZZZ'] } }))?.view.palette).toEqual(['#aabbcc'])
  })

  it('reads the language as the page’s own, and carries only the tab', () => {
    const back = decodeHash(link({ __view: { lang: 'pl', tab: 'library' } }))
    expect(back?.view.lang).toBe('pl')
    expect(back?.carried).toEqual({ tab: 'library' })
  })

  it('drops a language the dictionary does not have', () => {
    expect(decodeHash(link({ __view: { lang: 'de' } }))?.view.lang).toBeUndefined()
  })

  it('answers null for an empty or unreadable hash rather than throwing', () => {
    expect(decodeHash('')).toBeNull()
    expect(decodeHash('#')).toBeNull()
    expect(decodeHash('#not-json')).toBeNull()
    expect(decodeHash('#%E0%A4%A')).toBeNull()
  })

  it('reports only the knobs the link actually named', () => {
    const back = decodeHash(link({ W: 40 }))
    expect(back?.params.W).toBe(40)
    expect(back?.params.H).toBeUndefined()
  })
})
```

- [ ] **Step 2: Run the codec tests to verify they fail**

Run: `cd apps/lab && pnpm exec vitest run --project node src/state/url.test.ts`
Expected: FAIL — at least "writes every field, the empty ones included, and no version" (today's encoder omits the empty palette and writes `viewVersion`) and "opens a link that names no view field on the defaults" (today `cell` decodes to `undefined`).

- [ ] **Step 3: Rewrite the codec**

Replace `apps/lab/src/state/url.ts` with:

```ts
import type { Lang } from '@arrowz/engine/i18n'
import { type ParamKey, type Params, readParams } from '@arrowz/engine'
import { isLang } from './lang.slice'
import { pickView, readView, type ViewFields } from './viewSchema'

/** The view a link states, and the page's language when it names one the dictionary has. */
export type HashView = ViewFields & { lang?: Lang | undefined }

/** A key the page does not read (`tab`), kept so a round trip cannot drop it. */
export interface Carried {
  tab?: unknown
}

export interface HashPayload {
  params: Partial<Record<ParamKey, number>>
  view: HashView
  carried: Carried
}

/** A JSON value that is an object, which is all the reader can assume. */
function isRecord(value: unknown): value is Record<string, unknown> {
  return typeof value === 'object' && value !== null && !Array.isArray(value)
}

/** The knobs at the top level and the whole view under `__view`, every field stated. */
export function encodeHash(input: { params: Params; view: HashView; carried: Carried }): string {
  const view = { ...pickView(input.view), lang: input.view.lang }
  const payload = { ...input.params, __view: { ...view, ...input.carried } }
  return '#' + encodeURIComponent(JSON.stringify(payload))
}

export function decodeHash(hash: string): HashPayload | null {
  const body = hash.startsWith('#') ? hash.slice(1) : hash
  if (body === '') return null
  let parsed: unknown
  try {
    parsed = JSON.parse(decodeURIComponent(body))
  } catch {
    // A bad percent-escape or non-JSON text: a truncated link just opens on the defaults.
    return null
  }
  const raw = isRecord(parsed) && isRecord(parsed.__view) ? parsed.__view : {}
  return {
    // `parsed`, not the narrowed record: the engine's reader does its own
    // narrowing, and the two must agree about a non-object hash.
    params: readParams(parsed),
    view: { ...readView(raw), lang: isLang(raw.lang) ? raw.lang : undefined },
    carried: raw.tab === undefined ? {} : { tab: raw.tab },
  }
}
```

(`lang: undefined` disappears in `JSON.stringify`, so a link without a language stays without one.)

- [ ] **Step 4: Rewrite `viewFor` and `applyPayload`**

In `apps/lab/src/state/useUrlHash.ts`, replace lines 1-68 (imports, `viewFor`, `applyPayload`) with:

```ts
import type { Lang } from '@arrowz/engine/i18n'
import { useEffect, useMemo, useRef } from 'react'
import { useLocation } from 'react-router'
import type { RunControl } from '../run/useRun'
import { useStore } from './store'
import { type Carried, decodeHash, encodeHash, type HashPayload, type HashView } from './url'
import type { ViewState } from './view.slice'
import { pickView } from './viewSchema'

/** How long a burst of edits is allowed to run before the address bar moves. */
const WRITE_DELAY_MS = 250

/** The view as the link states it, from the slice. */
function viewFor(view: ViewState, lang: Lang): HashView {
  return { ...pickView(view), lang }
}

/** Writes a decoded link into the store. The caller decides whether to run. */
function applyPayload(payload: HashPayload): void {
  const { params, view, ui, lang } = useStore.getState()
  // One `setMany`: one recompute, one render, and the machine path, so `auto`
  // does not schedule a second run behind the one this trigger starts.
  ui.raiseClamped(params.setMany(payload.params))
  const { lang: linkLang, ...fields } = payload.view
  view.apply(fields)
  // Through `setLang`, so a link's language is remembered as well as shown; a link without one keeps the page's.
  if (linkLang !== undefined) lang.setLang(linkLang)
}
```

The rest of the file (from `export interface UrlHash` on) stays unchanged.

- [ ] **Step 5: Update the browser tests of the hook**

In `apps/lab/src/state/useUrlHash.browser.test.tsx`:

1. Rename `legacyFragment` (line 11-12) to `handFragment` with the doc comment `/** A hand-written link, for \`location.hash =\`. */`, and update its uses.
2. Delete the test `'opens on the palette a legacy link names, and keeps a theme already on screen'` (line 282).
3. Replace the test `'keeps the board colours and the margin on screen when a legacy link names none of them'` (line 396) with:

```ts
  it('opens the fields a link does not name on their defaults', async () => {
    await mount(stub().control)
    useStore.getState().view.setPaper('#010203')
    useStore.getState().view.setInk('#040506')
    useStore.getState().view.setHighlightColor('#0a0b0c')
    useStore.getState().view.setPad(7)
    location.hash = handFragment({ W: 50, __view: {} })
    await vi.waitFor(() => expect(useStore.getState().params.values.W).toBe(50))
    expect(useStore.getState().view.paper).toBe('')
    expect(useStore.getState().view.ink).toBe('')
    expect(useStore.getState().view.highlightColor).toBe('')
    expect(useStore.getState().view.pad).toBe(VIEW_DEFAULTS.pad)
  })
```

4. Replace the comment and the test `'clears the board colours a link written now does not name, and keeps the margin'` (lines 410-426) with:

```ts
  it('sets every field a link states, the empty colours and the margin included', async () => {
    await mount(stub().control)
    useStore.getState().view.setPaper('#010203')
    useStore.getState().view.setPad(7)
    location.hash = encodeHash({ params: { ...defaultParams(), W: 50 }, view: { ...VIEW, pad: 2 }, carried: {} }).slice(1)
    await vi.waitFor(() => expect(useStore.getState().params.values.W).toBe(50))
    expect(useStore.getState().view.paper).toBe('')
    expect(useStore.getState().view.pad).toBe(2)
  })

  it('a pasted link notifies the store once for the whole view', async () => {
    await mount(stub().control)
    const hash = encodeHash({ params: defaultParams(), view: { ...VIEW, cell: 17, paper: '#010203' }, carried: {} })
    let viewChanges = 0
    let last = useStore.getState().view
    const stop = useStore.subscribe((state) => {
      if (state.view !== last) viewChanges++
      last = state.view
    })
    try {
      location.hash = hash.slice(1)
      await vi.waitFor(() => expect(useStore.getState().view.cell).toBe(17))
    } finally {
      stop()
    }
    expect(viewChanges).toBe(1)
  })
```

5. Add `import { VIEW_DEFAULTS } from './viewSchema'` to the imports.

- [ ] **Step 6: Run the tests**

Run: `cd apps/lab && pnpm exec vitest run --project node src/state/url.test.ts src/state/ui.slice.test.ts`
Expected: PASS.

Run: `cd apps/lab && pnpm exec vitest run --project chromium src/state/useUrlHash.browser.test.tsx src/run/triggers.browser.test.tsx src/routes/KeepHashNavigate.browser.test.tsx`
Expected: PASS. `triggers` and `KeepHashNavigate` use `VIEW` and must pass without edits.

Run: `pnpm nx run lab:check`
Expected: no type errors; `url.ts` no longer imports `VIEW_VERSION`.

- [ ] **Step 7: Commit**

```bash
git add apps/lab/src/state/url.ts apps/lab/src/state/url.fixtures.ts apps/lab/src/state/url.test.ts \
  apps/lab/src/state/useUrlHash.ts apps/lab/src/state/useUrlHash.browser.test.tsx
git commit -m "Lab link: a full view snapshot read by the schema; a missing field opens on its default

No production links exist, so the version-dependent rules go: old keys
(hilite, highlight, help) are ignored, a head height of 0 is literal, and
the empty palette and colours are written. A pasted link now applies the
view in one store update."
```

---

### Task 4: "Load into lab" applies the stored view in one update

**Files:**
- Modify: `apps/lab/src/library/BoardColumn.tsx` (`loadIntoLab`, current lines 95-111)
- Test: `apps/lab/src/library/BoardColumn.browser.test.tsx`

**Interfaces:**
- Consumes: `view.apply` (Task 2).
- Produces: nothing new.

- [ ] **Step 1: Write the failing test**

Add after the test `'load into lab sets the knobs and the view, goes to the lab, and starts nothing'` (line 119) in `apps/lab/src/library/BoardColumn.browser.test.tsx`:

```ts
// A stored board carries the CLI's seven view fields only; the page's colours, points, margin and voids stay.
test('load into lab leaves the view fields a stored board does not carry', async () => {
  const screen = await mountDetail()
  await show()
  const view = useStore.getState().view
  view.setPaper('#010203')
  view.setTheme('gruvbox-dark')
  view.setPad(7)
  view.setFlag('voids', false)
  view.setFlag('showPoints', true)
  let viewChanges = 0
  let last = useStore.getState().view
  const stop = useStore.subscribe((state) => {
    if (state.view !== last) viewChanges++
    last = state.view
  })
  try {
    await userEvent.click(screen.getByRole('button', { name: /load into lab/i }))
  } finally {
    stop()
  }
  const after = useStore.getState().view
  expect(after.stroke).toBe(stored.meta.view.stroke)
  expect(after.paper).toBe('#010203')
  expect(after.theme).toBe('gruvbox-dark')
  expect(after.pad).toBe(7)
  expect(after.voids).toBe(false)
  expect(after.showPoints).toBe(true)
  expect(viewChanges).toBe(1)
})
```

- [ ] **Step 2: Run the test to verify it fails**

Run: `cd apps/lab && pnpm exec vitest run --project chromium src/library/BoardColumn.browser.test.tsx -t "does not carry"`
Expected: FAIL on `expect(viewChanges).toBe(1)` (today 7 or 8 separate updates). The field assertions already pass: they pin behaviour that must survive.

- [ ] **Step 3: Write the implementation**

Replace the view part of `loadIntoLab` in `apps/lab/src/library/BoardColumn.tsx` (from `const saved = meta.view` to the `if (saved.top > 0) …` line) with:

```ts
    const saved = meta.view
    view.apply({
      cell: saved.cell,
      stroke: saved.stroke,
      headWidth: saved.headWidth,
      headHeight: saved.headHeight,
      rounded: saved.rounded !== false,
      colored: saved.colored,
      // A stored board carries no highlight, so this lands off; when one somehow does, its count comes with it.
      highlightLongest: saved.top > 0,
      ...(saved.top > 0 ? { top: saved.top } : {}),
    })
```

- [ ] **Step 4: Run the tests**

Run: `cd apps/lab && pnpm exec vitest run --project chromium src/library/BoardColumn.browser.test.tsx src/library/BoardPreview.browser.test.tsx`
Expected: PASS, the existing load test included, unedited.

- [ ] **Step 5: Commit**

```bash
git add apps/lab/src/library/BoardColumn.tsx apps/lab/src/library/BoardColumn.browser.test.tsx
git commit -m "Library: Load into lab applies the stored view in one update, leaving the page's own fields"
```

---

### Task 5: One metadata table for the view's rows

**Files:**
- Modify: `apps/lab/src/console/viewFields.ts` (lines 13-82)
- Modify: `apps/lab/src/console/viewFields.test.ts`
- Modify: `apps/lab/src/console/ViewPanel.tsx` (lines 11, 41-138, 258-298, 533-537, 558-560, 574, 602)
- Modify: `apps/lab/src/simple/SimplePanel.tsx` (lines 6-7, 159-160)
- Modify: `apps/lab/src/library/BoardPreview.tsx` (lines 4, ~40)
- Modify: `apps/lab/src/palette/commands.ts` (lines 5, 94-117)

**Interfaces:**
- Consumes: `ViewNumber` (`@arrowz/engine`), `ViewFlag` (`../state/view.slice`).
- Produces:
  - `interface NumberRowMeta { label: PlainUiKey; short: PlainUiKey; help: PlainUiKey; step: number; unit: UnitKey; auto?: true }`
  - `interface FlagRowMeta { label: PlainUiKey; short: PlainUiKey; help: PlainUiKey }`
  - `const VIEW_ROWS: { readonly [K in ViewNumber]: NumberRowMeta } & { readonly [K in ViewFlag]: FlagRowMeta }`
  - `const VIEW_NUMBERS: readonly ViewNumber[]` (order: cell, stroke, headWidth, headHeight, top — today's `VIEW_FIELDS` order, which the ⌘K list follows)
  - `const VIEW_FLAGS: readonly ViewFlag[]` (order: rounded, colored, highlightLongest, voids, showPoints)
  - `ViewNumberRow({ field }: { field: ViewNumber })`, `NumberRow({ field: ViewNumber, value, stroke, onSet })`
  - Deleted: `ViewField`, `VIEW_FIELDS`, `FLAG_ROWS`, the old `ViewRow`, `fieldOf`.

All five numbers have a unit today (`VIEW_ROWS` in `viewFields.ts:67-73`), so `unit` is required; check that before typing it so.

- [ ] **Step 1: Rewrite the metadata test**

Replace the first three tests of `apps/lab/src/console/viewFields.test.ts` (lines 6-40; keep the two `autoHeadWidth` tests and change only the import) with:

```ts
import { pieceShape } from '@arrowz/engine'
import { VIEW_RANGE } from '@arrowz/engine/command'
import { expect, test } from 'vitest'
import { VIEW_KEYS } from '../state/viewSchema'
import { autoHeadWidth, VIEW_FLAGS, VIEW_NUMBERS, VIEW_ROWS } from './viewFields'

test('a step is a step a whole-number field can land on', () => {
  // A fractional step on a field the store rounds makes an arrow press a no-op or a jump of one.
  for (const field of VIEW_NUMBERS) {
    const range = VIEW_RANGE[field]
    const { step } = VIEW_ROWS[field]
    expect(step).toBeGreaterThan(0)
    expect(step).toBeLessThanOrEqual(range.max - range.min)
    if (range.whole) expect(Number.isInteger(step)).toBe(true)
  }
})

test('the numbers are every number the view has', () => {
  // Against `VIEW_RANGE`'s keys, not a literal, so a new view number fails here the day it is added.
  expect([...VIEW_NUMBERS].sort()).toEqual(Object.keys(VIEW_RANGE).sort())
})

test('every row is a view field, and every number and flag has a row with a short label and a description', () => {
  const rows = Object.keys(VIEW_ROWS)
  expect(rows.sort()).toEqual([...VIEW_NUMBERS, ...VIEW_FLAGS].sort())
  for (const key of rows) expect(VIEW_KEYS).toContain(key)
  for (const key of [...VIEW_NUMBERS, ...VIEW_FLAGS]) {
    expect(VIEW_ROWS[key].short.startsWith('viewShort')).toBe(true)
    expect(VIEW_ROWS[key].help.length).toBeGreaterThan(0)
  }
  // Only the head width has an automatic value.
  expect(VIEW_NUMBERS.filter((key) => VIEW_ROWS[key].auto === true)).toEqual(['headWidth'])
  expect(VIEW_ROWS.headWidth.help).toBe('headWidthHelp')
  expect(VIEW_ROWS.stroke.unit).toBe('cells')
  expect(VIEW_ROWS.top.unit).toBe('arrows')
  expect(VIEW_ROWS.rounded.label).toBe('rounded')
})
```

- [ ] **Step 2: Run the test to verify it fails**

Run: `cd apps/lab && pnpm exec vitest run --project node src/console/viewFields.test.ts`
Expected: FAIL — `VIEW_NUMBERS` / `VIEW_FLAGS` are not exported in the new shape.

- [ ] **Step 3: Rewrite the table**

In `apps/lab/src/console/viewFields.ts`, replace lines 13-82 (from `export interface ViewField` to the end of `FLAG_ROWS`) with:

```ts
/** A view number as a row: labels, description, keyboard step and unit; bounds come from `VIEW_RANGE` at render. */
export interface NumberRowMeta {
  /** The full label, the row's tooltip and the ⌘K name. */
  label: PlainUiKey
  short: PlainUiKey
  help: PlainUiKey
  /** A keyboard convenience, not a claim about what is allowed. */
  step: number
  unit: UnitKey
  /** 0 is the automatic value, drawn as a chip in the minimum's track. */
  auto?: true
}

export interface FlagRowMeta {
  label: PlainUiKey
  short: PlainUiKey
  help: PlainUiKey
}

/**
 * The view's numbers and flags as rows, keyed by field, so a number or a flag
 * cannot be drawn without one. No bounds on purpose: a copy of `VIEW_RANGE` drifts.
 */
export const VIEW_ROWS: { readonly [K in ViewNumber]: NumberRowMeta } & { readonly [K in ViewFlag]: FlagRowMeta } = {
  cell: { label: 'cellLabel', short: 'viewShortCell', help: 'cellHelp', step: 1, unit: 'px' },
  stroke: { label: 'strokeLabel', short: 'viewShortStroke', help: 'strokeHelp', step: 0.05, unit: 'cells' },
  headWidth: {
    label: 'headWidthLabel',
    short: 'viewShortHeadWidth',
    help: 'headWidthHelp',
    step: 0.05,
    unit: 'cells',
    auto: true,
  },
  headHeight: {
    label: 'headHeightLabel',
    short: 'viewShortHeadHeight',
    help: 'headHeightHelp',
    step: 0.05,
    unit: 'cells',
  },
  top: { label: 'topLabel', short: 'viewShortTop', help: 'topHelp', step: 1, unit: 'arrows' },
  rounded: { label: 'rounded', short: 'viewShortRounded', help: 'roundedHelp' },
  colored: { label: 'colored', short: 'viewShortColored', help: 'coloredHelp' },
  highlightLongest: {
    label: 'highlightLongest',
    short: 'viewShortHighlightLongest',
    help: 'highlightLongestHelp',
  },
  voids: { label: 'voids', short: 'viewShortVoids', help: 'voidsHelp' },
  showPoints: { label: 'showPoints', short: 'viewShortShowPoints', help: 'showPointsHelp' },
}

/** The view's numbers and flags in the panel's and the palette's order. */
export const VIEW_NUMBERS: readonly ViewNumber[] = ['cell', 'stroke', 'headWidth', 'headHeight', 'top']
export const VIEW_FLAGS: readonly ViewFlag[] = ['rounded', 'colored', 'highlightLongest', 'voids', 'showPoints']
```

Keep `PlainUiKey`, `SIMPLE_VIEW_FIELDS`, `SIMPLE_VIEW_FLAGS` and `autoHeadWidth` as they are. Move `SIMPLE_VIEW_FIELDS`/`SIMPLE_VIEW_FLAGS` below the new table if the file reads better that way; do not change them.

- [ ] **Step 4: Update the consumers**

`apps/lab/src/console/ViewPanel.tsx`:
- Line 11: `import { autoHeadWidth, VIEW_ROWS } from './viewFields'`.
- `ViewNumberRow` (line 41): prop `{ field }: { field: ViewNumber }`; `state.view[field]`; `setNumber(field, String(next))`.
- `NumberRow` (line 56): prop `field: ViewNumber`; `const row = VIEW_ROWS[field]`; `const range = VIEW_RANGE[field]`; every `field.field` becomes `field`; `field.step` becomes `row.step`; the title becomes `rowTitle(dict, dict.t(row.label), range)`.
- `FlagRow` (line 265): `const row = VIEW_ROWS[flag]`; delete the `full` line; the title becomes `title={dict.t(row.label)}`.
- Delete `fieldOf` (lines 533-537); the five `<ViewNumberRow field={fieldOf('x')} />` become `<ViewNumberRow field="x" />`.
- Make sure `ViewNumber` is imported (`import type { ViewNumber } from '@arrowz/engine'`).

`apps/lab/src/simple/SimplePanel.tsx`: drop `fieldOf` from the import on line 6; line 160 becomes `<ViewNumberRow key={field} field={field} />`.

`apps/lab/src/library/BoardPreview.tsx`: drop `fieldOf` from the import on line 4; `field={fieldOf(key)}` becomes `field={key}`.

`apps/lab/src/palette/commands.ts`: the import on line 5 becomes `import { VIEW_FLAGS, VIEW_NUMBERS, VIEW_ROWS } from '../console/viewFields'`; the two loops (lines 94-117) become:

```ts
  for (const field of VIEW_NUMBERS) {
    rows.push({
      id: `view-${field}`,
      section: 'knob',
      name: deps.dict.t(VIEW_ROWS[field].label),
      note: deps.dict.t('preview'),
      value: String(state.view[field]),
      hay: field,
      disabled: false,
      run: () => jumpTo(deps, 'preview', `view-${field}`),
    })
  }
  for (const flag of VIEW_FLAGS) {
    rows.push({
      id: `view-${flag}`,
      section: 'knob',
      name: deps.dict.t(VIEW_ROWS[flag].label),
      note: deps.dict.t('preview'),
      value: deps.dict.t(state.view[flag] ? 'valueOn' : 'valueOff'),
      hay: flag,
      disabled: false,
      run: () => jumpTo(deps, 'preview', `view-${flag}`),
    })
  }
```

- [ ] **Step 5: Run the tests**

Run: `pnpm nx run lab:check`
Expected: no type errors, and `grep -rn "fieldOf\|VIEW_FIELDS\|FLAG_ROWS\|ViewField\b" apps/lab/src` prints nothing.

Run: `cd apps/lab && pnpm exec vitest run --project node src/console/viewFields.test.ts src/palette/commands.test.ts`
Expected: PASS.

Run: `cd apps/lab && pnpm exec vitest run --project chromium src/console/ViewPanel.browser.test.tsx src/simple/SimplePanel.browser.test.tsx src/library/BoardPreview.browser.test.tsx src/palette/CommandPalette.browser.test.tsx`
Expected: PASS, no assertion edits.

- [ ] **Step 6: Commit**

```bash
git add apps/lab/src/console/viewFields.ts apps/lab/src/console/viewFields.test.ts apps/lab/src/console/ViewPanel.tsx \
  apps/lab/src/simple/SimplePanel.tsx apps/lab/src/library/BoardPreview.tsx apps/lab/src/palette/commands.ts
git commit -m "Lab: one metadata table for the view's numbers and flags, keyed by field"
```

---

### Task 6: The engine and the store lose the view version

**Files:**
- Modify: `packages/engine/command.ts` (lines 242-250)
- Modify: `packages/engine/types.ts` (lines 338-339)
- Modify: `packages/cli/store.ts` (lines 11, 45-57, 73-78, 96, 177)
- Modify: `packages/cli/store.test.ts` (lines 4, 286-338)
- Modify: `packages/cli/boards/1000x1000/sha256-ffdb06d621416f33cc7f76302239f3a4c36dc83383c72bb45ca92b34a60ccf93.json`, `packages/cli/boards/25x50/sha256-12b7183d231ad6b1182d6b0bfbbf4408da267b75175e61633f5abe85aaf80b06.json` (line 112 each)

**Interfaces:**
- Consumes: nothing from earlier tasks. Task 3 must be done first: until then `apps/lab/src/state/url.ts` imports `VIEW_VERSION`.
- Produces: `fillView(view: View): View` (one parameter); `BoardMeta` without `viewVersion`.

- [ ] **Step 1: Change the store tests first**

In `packages/cli/store.test.ts`:
- Line 4: drop `VIEW_VERSION` from the import.
- The test `'a board saved with a head height of 0 reads back 0, and its meta carries the view version'` (line 286): rename to `'a board saved with a head height of 0 reads back 0, and its meta carries no view version'` and replace the `viewVersion` assertion with `assertEquals('viewVersion' in readMeta(join(dir, '25x50', \`${meta.id}.json\`)), false)`.
- Delete the three tests at lines 296-307 (`'a meta written before the view version …'`), 310-321 (`'a meta with a literal past view version …'`, with its two-line comment) and 325-337 (`'a save over a legacy meta keeps its old recipes …'`, with its two-line comment).
- Keep `'listBoards fills a legacy view without arrowhead fields with the defaults'` and `'listBoards fills legacy params …'`: missing fields are still filled.

Add one test next to the renamed one:

```ts
Deno.test('a meta without a version reads a head height of 0 as 0', async () => {
  const dir = freshDir()
  const { meta } = await saveBoard({ ...entry(), view: { ...DEFAULT_VIEW, headHeight: 0 } })
  const file = join(dir, '25x50', `${meta.id}.json`)
  Deno.writeTextFileSync(file, JSON.stringify({ ...readMeta(file), viewVersion: undefined }))
  const board = listBoards()[0]?.boards[0]
  assertEquals(board?.view.headHeight, 0)
  assertEquals(board?.sources[0]?.view.headHeight, 0, 'the recipe is read the same way')
})
```

- [ ] **Step 2: Run the store tests to verify they fail**

Run: `deno test --allow-read --allow-write --allow-env --allow-run --allow-net packages/cli/store.test.ts`
Expected: FAIL — "a meta without a version reads a head height of 0 as 0" gets 1 (the version branch), and the renamed test finds `viewVersion` in the meta.

- [ ] **Step 3: Delete the version**

- `packages/engine/command.ts`: delete the `VIEW_VERSION` doc comment and constant (lines 242-250).
- `packages/engine/types.ts`: delete `viewVersion?: number` and its doc comment (lines 338-339).
- `packages/cli/store.ts`:
  - line 11: drop `VIEW_VERSION` from the import;
  - replace `fillView` and its doc comment (lines 45-57) with:

```ts
/** A stored view with the fields a later knob added filled in with the defaults. */
function fillView(view: View): View {
  return { ...DEFAULT_VIEW, ...view }
}
```

  - in `readMeta`: delete `const versioned = meta.viewVersion !== undefined` and call `fillView(meta.view)` and `fillView(r.view)`;
  - in the meta written by `saveBoard`: delete `viewVersion: VIEW_VERSION,` (line 177).
- The two board files: delete the line `"viewVersion": 2` and the comma it leaves dangling on the line before (open each file, look at lines 110-113, keep the JSON valid).

Then `grep -rn "viewVersion\|VIEW_VERSION" packages apps --include='*.ts' --include='*.tsx' --include='*.json' | grep -v node_modules | grep -v /dist/` must print nothing.

- [ ] **Step 4: Run the gates**

Run: `deno test --allow-read --allow-write --allow-env --allow-run --allow-net packages/cli/store.test.ts packages/cli/store-server.test.ts`
Expected: PASS.

Run: `deno task verify` (repo root)
Expected: check, lint, fmt, test all green.

Run: `pnpm nx build engine && pnpm nx run lab:check`
Expected: green; the lab's `dist` no longer exports `VIEW_VERSION` and nothing in the lab needs it.

- [ ] **Step 5: Commit**

```bash
git add packages/engine/command.ts packages/engine/types.ts packages/cli/store.ts packages/cli/store.test.ts packages/cli/boards
git commit -m "Store: no view version; a head height of 0 is literal in every meta"
```

---

### Task 7: Full gates and the live pass

**Files:** none changed unless a gate fails.

- [ ] **Step 1: Comment sweep**

Run: `grep -rn "legacy\|viewVersion\|VIEW_VERSION\|predates\|written now" apps/lab/src packages/cli/store.ts packages/engine/command.ts`
Expected: no line about link or meta versions remains (the store's "legacy" test names about missing fields are fine). Fix any stale comment in the file that owns it, one line, and commit as `Comments: drop the view version from the codec's and the store's prose`.

- [ ] **Step 2: Whole-repo gate in a clean worktree**

```bash
git worktree add ../arrowz-view-schema lab/view-schema
cd ../arrowz-view-schema && corepack enable pnpm && pnpm install
pnpm nx run-many -t verify --skip-nx-cache
deno task verify
```

Expected: every target green. Record the counts (projects, lab tests, Deno tests) for the PR description. Remove the worktree afterwards with `git worktree remove ../arrowz-view-schema` (that exact path only).

- [ ] **Step 3: Live pass in Chrome**

Start on a copy of the store, never the real one:

```bash
cp -R packages/cli/boards /tmp/arrowz-boards-copy
ARROWZ_BOARDS_DIR=/tmp/arrowz-boards-copy pnpm nx serve lab
```

(`nx serve lab` starts the store itself; do not start `deno task store` separately.) At `http://localhost:8779`:
1. Change stroke, theme, one palette colour, paper and the margin; copy the address; open it in a new tab: every field matches.
2. In the new tab, paste a link with `#%7B%22W%22%3A30%7D` (only `W`): the board is 30 wide and every view field is at its default (no theme, margin 4).
3. Press Back and Forward between the two: each entry restores its own colours and no carve restarts on an entry that matches the screen.
4. Open a stored board on the Boards tab, set a theme and paper in the lab first, then "Load into lab": stroke and heads follow the board, the theme and paper stay.
5. Console: no errors.

Undo any `emulate` or viewport change before ending the pass.

- [ ] **Step 4: Push and open the PR**

```bash
git push -u origin lab/view-schema
gh pr create --base lab/glossary --title "Lab view schema: one table for the view, view.apply(), links and metas without a version" --body-file <file>
```

The body lists: the five intended changes from the spec, the gate counts, the live pass steps. No attribution lines.
