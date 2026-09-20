# Lab colours and the point grid: design

Date: 2026-09-20. Branch base: `main` after the palette stack (#87 into
`engine/one-palette`, then #86 into `main`) is merged.

This document covers four changes the user reported on the same day, after
living with the palette work:

1. The lab has no controls for the point grid, while the element's own demo
   page has three.
2. A theme paints the board's paper, but the frame around it stays light.
3. A custom palette offers no way to say what the background should be.
4. `pnpm nx serve lab` does not start the board store, and no Nx target does.

None of the four is a regression of the palette work. Items 2 and 3 are gaps
the themes made *visible*: while the only paper was `DEFAULT_VIEW.paper`, it
matched the literal in the host's CSS, and the seam could not be seen.

## 1. Why these four belong in one change

Three of them are the same sentence said three times: **a colour the user
chose does not reach every surface that should show it.** The paper reaches
the board quad but not the host, not the lab's frame, and there is no way to
state it at all without a theme. The fourth (the store target) is unrelated
and rides along only because it is four lines; §9 says what to do if that
turns out to be wrong.

## 2. The state before this change

Measured 2026-09-20 by reading the files, not from recollection.

| Fact | Where |
| --- | --- |
| Paper is a `BoardView` field, defaulting to `#f6f6fa` | `packages/board-element/src/view.ts:23,44` |
| The canvas clears to **transparent**, then paints paper as one quad over the board plus margin | `gl-layer.ts:544`, `gl-passes.ts:146-151` |
| The host hard-codes a light background, bound to nothing | `arrowz-board.ts:153` |
| The lab's frame hard-codes another | `apps/lab/src/design/shell.css:190`, `tokens.css:23` |
| No test reads `getComputedStyle` on the host, so the two copies of `#f6f6fa` are unrelated | grep over the package's tests |
| Precedence resolves in one place: defaults, then theme, then what the host stated | `arrowz-board.ts:587-594` |
| Colour sanitising runs **after** that merge | `sanitize.ts:21-38`, esp. `:29-31` |
| The element writes to `this.style` nowhere; the package has no custom property at all | grep over `packages/board-element/src` |
| The point grid's three attributes exist and are live | `arrowz-board.ts:111-113` |
| Their radius is clamped by literals, and `sanitize.ts` is not exported | `sanitize.ts:45-48`, `mod.ts` |
| They are absent from the geometry key, so they never rebuild anything | `arrowz-board.ts:94-96`, `gl-layer.ts:366-368` |
| Colour and radius are per-frame uniforms (`u_dot`, `u_radius`) | `gl-passes.ts:186-187` |
| The lab never sets them, and `show-points` defaults to false, so the lab draws no dots at all | `arrowz-board.ts:42-43`, `BoardFrame.tsx:111` |
| The lab's controls for them never existed in any generation of the lab | `git log --all -S"show-points" -- apps` is empty |
| A custom palette clears the chosen theme | `apps/lab/src/state/view.slice.ts:97-100` |
| The link carries `theme` and `palette` and no other colour | `apps/lab/src/state/url.ts:6-30` |
| No Nx target starts the store; `serve` depends only on `^build` | `apps/lab/project.json:23-28`, `packages/cli/project.json` |
| The CLI writes boards to disk directly and has no `--allow-net` | `packages/cli/carve.ts:58`, `store.ts:181-185`, `deno.json:8` |

### 2.1 One thing that had to be measured, not read

A test for the host's background reads `getComputedStyle`, and this repository
has already shipped a look-at-the-paint test that passed while reading an
inline style, because the lab's browser project loads no stylesheets.

**Measured 2026-09-20 with a throwaway probe in this package, since deleted:**
Lit's `static styles` do reach the host in the package's `chromium` project
(`getComputedStyle(host).backgroundColor` reported `rgb(246, 246, 250)`), and a
custom property set on the host inherits into the shadow root. The package has
two vitest projects (`vitest.config.ts:8-65`) and the browser one runs real
Chrome through Playwright, which is why it differs from the lab's.

A test written per §7 can therefore fail, and that is established by
measurement rather than by argument.

## 3. Rulings

These were decided by the user in conversation and are binding on the plan.

- **Ruling 1.** The element *announces* its paper as a CSS custom property on
  its own host; it does not paint a background imperatively and does not ask
  the consumer to compute the colour a second time.
- **Ruling 2.** The frame around the board takes the paper's colour, in both
  the element's host and the lab's board frame.
- **Ruling 3.** The point grid gets three controls in the lab: visibility,
  colour, radius.
- **Ruling 4.** The element exports the radius bounds; the lab reads them at
  the point of render. The engine's view table (`VIEW_RANGE`) is not touched,
  and the only engine file this change edits at all is the dictionary.
- **Ruling 5.** A custom paper and ink **override a theme field by field**;
  they do not switch the theme off. The theme keeps supplying everything the
  user did not state.
- **Ruling 6.** One rule for every colour: a custom palette **also** stops
  clearing the theme. This repeals the current mutual exclusion.
- **Ruling 7.** The store becomes an Nx target the lab's `serve` depends on.

### 3.1 What Ruling 6 repeals, and why it is safe

The exclusion exists because the element gives a stated `view` field
precedence over the theme, so holding both would show a theme in the picker
that the board does not draw. Ruling 5 changes the premise: with fields
overridden one at a time, a chosen theme **is** still drawing everything the
user did not override, so the picker tells the truth.

The invariant that replaces it: *the lab never states a colour field the user
did not set.* §5.4 is how that is enforced.

## 4. Design

### 4.1 The element announces its paper (Rulings 1, 2)

`:host` stops naming a literal and reads the property, keeping today's value
as the fallback so an element with no theme looks unchanged:

```css
:host { background: var(--arrowz-paper, #f6f6fa); }
```

The value is written from the return of `drawView()`
(`arrowz-board.ts:587-594`), which is the paper **after** precedence and
**after** sanitising, so it is the colour actually painted. The write hangs
off `updated()` below line 451, whose early return (`:445-448`) already
passes exactly the changes that can move the paper (`view`, `theme`,
`enableColors`, `coloredOverride`, `board`, `pad`) and stops the ones that
cannot.

This is the package's first write to the host's style. The nearest existing
pattern for imperative DOM work is `refreshCursor()`
(`arrowz-board.ts:705-716`): called from `updated()` and from handlers, never
from `render()`.

### 4.2 The lab's frame follows (Ruling 2)

One declaration, `shell.css:190`:

```css
.fw-board { background: var(--arrowz-paper, var(--paper)); }
```

The fallback must stay. `--paper` (`tokens.css:23`) has exactly one use in the
repository -- this rule -- and `tokens.test.ts:8-27` pins the token list and
its order, so nothing is added to `tokens.css`. A grep for the name finds two
further hits that are not uses: the guard's own list (`tokens.test.ts:18`) and
a comment in `design/report.css:3`.

`.fw-anno` and `.fw-solo` sit on `.fw-board` with their own dark background
(`shell.css:207-240`), so their contrast does not depend on this.

### 4.3 The point grid (Rulings 3, 4)

The cheapest path in the element: none of the three attributes is in the
geometry key, none is a `BoardView` field, and `setPoints`
(`gl-layer.ts:381-388`) only schedules a frame. The radius reaches the shader
as the `u_radius` uniform (`gl-passes.ts:187`, with the colour's `u_dot` on
`:186`), so a continuous control needs no throttling.
`pointColor` costs one `rgbaOf` per change; `pointRadius` costs nothing.

- **Visibility** follows the `voids` precedent: a lab flag that is not a field
  of the engine's `View`, handed to the element as its own prop rather than
  through `boardViewOf`.
- **Colour** follows the palette editor's colour row
  (`ViewPanel.tsx:190-208`): a visually hidden label plus a controlled
  `<input type="color">`.
- **Radius** may **not** go through `ViewNumberField`, which reads
  `VIEW_RANGE[field.field]` (`ViewPanel.tsx:43`) from the engine's table. Per
  Ruling 4 the element exports its own bounds instead, as a named constant
  beside `drawablePointRadius` (`sanitize.ts:45-48`, where `0` and `0.5` are
  literals today), re-exported from `mod.ts` exactly as `MIN_POINT_CELL_PX`
  already is (`mod.ts:42`). The package has a single entry point, so
  `package.json` needs no change. The lab reads the constant at render, never
  copying the numbers, which is the rule `viewFields.ts:20-31` states.

Adding the radius to the engine's `VIEW_RANGE` was considered and rejected:
`command.test.ts:343-355` would then require a CLI flag for it, and
`store-server.ts:109-123` validates `Object.keys(VIEW_RANGE)` as **required**
fields of a stored board, so a new key would invalidate every board already in
the store.

The element's README carries a third, unguarded copy of the bound
(`packages/board-element/README.md:141`); §7 binds it.

### 4.4 Paper and ink in the lab (Rulings 5, 6)

The lab gains `paper` and `ink` in its view slice and two colour inputs in the
console's editor, beside the arrow colours.

Both start as `''`, and `''` is the slice's spelling of "the user has not set
this" -- the same role `theme: ''` already plays (`view.slice.ts:116`). It is
never handed to the element, and the conditional below is what stops it.

**They are handed to the element conditionally**, in the shape
`BoardFrame.tsx:57` already uses for the palette:

```ts
const paperOverride = useMemo(() => (view.paper === '' ? {} : { paper: view.paper }), [view.paper])
```

This is not a style preference. `drawableView` runs *after* the precedence
merge (`sanitize.ts:29-31`), so a stated `paper: ''` beats the theme and then
falls to `DEFAULT_VIEW.paper` -- turning a dark theme light. An unstated field
is the only spelling of "let the theme decide", and the same trap was already
found once in review, on the library-preview branch of this very component.

Both branches of `BoardFrame` must carry it: the live view and the library
preview (`BoardFrame.tsx:58-71`). The palette review's first finding was
exactly a colour that reached one branch and not the other.

Ruling 6 removes the theme-clearing from `paletteUpdate`
(`view.slice.ts:97-100`). The cap stays; only the `theme: ''` half goes.

### 4.5 The link

`HashView` (`url.ts:6-30`) gains `paper`, `ink`, `showPoints`, `pointColor`
and `pointRadius`. The file's convention is strict and is kept: `undefined`
means "the link did not say" and never "clear this", which is why the palette
is omitted rather than written as `[]` (`url.ts:66-69`). Hand-written colours
are validated with the existing `HEX_COLOR` shape and lower-cased
(`url.ts:74-96`).

Because Ruling 6 lets a theme and a palette coexist, the ordering workaround
in `useUrlHash.ts:52-58` (theme first so the palette wins) is no longer load
bearing, and the plan should say whether it is simplified or left alone.

### 4.6 The store target (Ruling 7)

```jsonc
// packages/cli/project.json
"store": {
  "executor": "nx:run-commands",
  "continuous": true,
  "cache": false,
  "options": { "cwd": "packages/cli", "command": "sh store.sh" }
}
```
```jsonc
// apps/lab/project.json:23-28
"serve": { ..., "dependsOn": ["^build", "cli:store"] }
```

`continuous: true` is what lets a dependent task start beside a process that
never exits; without it `serve` would wait forever. Confirmed against Nx's
current documentation for the version in use: `package.json:12` declares
`^23.2.0` and the lockfile resolves `nx@23.2.0`.

Three things make this safe, each checked:

- `nx.json:24-82` has no `store` entry, so the target inherits no caching.
- `nx.json:14` already excludes `{projectRoot}/boards/**` from the default
  input, so saved boards do not invalidate the CLI's cached tasks.
- `verify` lists its dependencies explicitly (`packages/cli/project.json:18`),
  so a continuous target cannot creep into the gate and hang it.

**The store stays optional at runtime.** `apps/lab/src/api/boards.ts:11-16`
reports a missing store as a value, never a throw, because the lab must run
from any static host. This change is about the convenience of `nx serve`, and
the plan must not turn the degradation into a hard requirement.

## 5. What changes, by file

**`packages/board-element`**
- `arrowz-board.ts` -- `:host` reads the property (`:153`); a write of
  `--arrowz-paper` from the `drawView()` result, called in `updated()`.
- `sanitize.ts` -- the radius bounds become a named, exported constant used by
  `drawablePointRadius`.
- `mod.ts` -- re-export of that constant, beside `:42`.
- `README.md:141` -- the prose bound becomes guarded (§7).

**`apps/lab`**
- `state/view.slice.ts` -- `paper`, `ink`, `showPoints`, `pointColor`,
  `pointRadius` and their actions; `paletteUpdate` stops clearing the theme.
- `stage/BoardFrame.tsx` -- conditional colour overrides on **both** branches;
  the three point props on the element.
- `console/ViewPanel.tsx` -- two colour inputs for paper and ink; the grid's
  switch, colour and radius. The radius gets a local number field, because
  `ViewNumberField` is bound to the engine's table.
- `state/url.ts`, `state/useUrlHash.ts` -- the five new keys.
- `design/shell.css:190` -- the frame's background.

**`packages/engine`**
- `lab-i18n.ts` only: label and help keys in EN and PL. No engine logic, no
  `VIEW_RANGE`, no `PARAM_SPEC`.

**Nx**
- `packages/cli/project.json`, `apps/lab/project.json` per §4.6.

## 6. Out of scope

- The simple view and the library detail keep their opt-in lists
  (`viewFields.ts:45-46`, `libraryFields.ts:15-29`). The simple view gets a
  picker, not an editor, and `SimplePanel.browser.test.tsx:193-198` pins the
  absence of colour inputs there.
- SVG export still does not reproduce a theme. That price was recorded with
  the palette work and is unchanged.
- The store stays a Deno task; moving it to Node, or into Vite as middleware,
  is not part of this.

## 7. Testing and guards

The point of this section is that every new claim has something that can
falsify it.

- **The host's background.** A browser test in the package asserting
  `getComputedStyle(host).backgroundColor` follows the theme. §2.1 measured
  that this can fail, which is the precondition for writing it.
- **The property itself.** A custom property is **not** a Lit property, so it
  falls outside every documentation guard: `ELEMENT_PROPS`
  (`packages/engine/lab-docs.ts:43-59`), the declaration parser
  (`lab-docs.test.ts:159-177`) and the test that calls it (`:179-188`), and
  `docs-api.browser.test.ts:19-85`. It needs its own test or it becomes a
  fourth unguarded copy of a colour.
- **The lab's frame.** `BoardFrame.browser.test.tsx:11-13` imports all three
  stylesheets and renders `.fw-board` directly (only `BoardFrame.tsx:107`
  renders it), so that is where the cascade on this selector is asserted. It
  is **not** the only file that could react: a dozen lab test files import the
  stylesheets, and `LabLayout.browser.test.tsx:6-8` reads the same selector
  through the layout (`:34-35,62,153`), so a change to this rule may surface
  there too. A second test pinning the rule's text through `?raw` (the pattern
  of `design/console.test.ts`) catches removal of the fallback.
- **The radius bound.** One test that the lab's field declares the element's
  exported bounds, plus binding the README's prose copy.
- **The conditional override.** A test that an unset paper leaves a chosen
  theme's paper on the board -- the assertion that would have caught the trap
  in §4.4 -- and one for the library-preview branch.
- **Ruling 6.** The assertions that pin the exclusion are inverted, not
  deleted, in four files: `view.slice.test.ts:82,112,120`,
  `ViewPanel.browser.test.tsx:211-230,271-279`,
  `useUrlHash.browser.test.tsx:329-341` and
  `BoardFrame.browser.test.tsx:224-239`. Each becomes a statement that the two
  now coexist. `url.test.ts` holds no exclusion assertion at all and nothing in
  it is inverted: `:114-116` pins that an empty palette is left out of the
  link, which §4.5 keeps. It gains new tests for the new keys instead.
- **Dictionary parity** is automatic: `lab-i18n.test.ts:60-65` compares key
  sets and value kinds across EN and PL. Keys that must never vanish from
  *both* go in the list at `lab-i18n.test.ts:236-247`.
- **Counting tests will go red and must be updated deliberately:**
  `ViewPanel.browser.test.tsx:39-43` (five numbers, four switches),
  `:65-84` (every number field maps to a `VIEW_RANGE` key -- the radius field
  must be excluded from that mapping, not added to the table),
  `:223-224,237-245` (colour input counts), and `viewFields.test.ts:19-25`.

## 8. Risks

- **The `VIEW_RANGE` shortcut.** The radius will look like it belongs in the
  engine's table. §4.3 records the cost of that: a CLI flag and the
  invalidation of every stored board.
- **Empty means stated.** §4.4. The failure is silent and visual: a dark theme
  quietly turning light.
- **Ruling 6 touches roughly a dozen assertions across four files.** If the
  plan finds more than that, it should stop and say so rather than widen
  quietly.
- **Port 8777 lives in two places.** `store.sh:9` takes it as a default the
  first argument overrides (`PORT=${1:-8777}`); `vite.proxy.ts:4` is a plain
  literal, so the lab's end of the pair is not overridable at all. A
  continuous target makes a second `nx serve lab` meet an occupied port more
  often, and this repository has already seen a Vite process outlive the Nx
  task that started it. The plan should state what the user sees when the port
  is taken.

## 9. If this proves too wide

§4.6 is independent of everything else and can be split into its own pull
request at any point; nothing in §4.1-4.5 depends on it. Ruling 6 is the next
natural seam, since §4.4 works without it -- the difference is only whether a
custom arrow palette also keeps the theme.
