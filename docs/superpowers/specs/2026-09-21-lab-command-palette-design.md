# The command palette, and the three hotkeys it advertises

Date: 2026-09-21. Row 7 of §10 in
`docs/superpowers/specs/2026-09-13-lab-react-app-design.md`, narrowed: that row
names three v2 additions — the run filmstrip, the parameter diff and the ⌘K
palette — and this document designs **the palette alone**. The filmstrip and
the diff keep their row; §11 records the decisions already taken for them so
they are not re-litigated when their turn comes.

The lab's visual layer is *Arrowz Workshop v2* in the Claude Design project
`7fc443c6-aaf3-4d37-a380-9812f10110b6`. Every measurement quoted in §8 was read
out of `fronthub-workshop-v2.css` and `Arrowz Workshop v2.dc.html` for this
document, not remembered.

## 1. Why this exists, and what stands reserved for it

The palette is the last undelivered piece of the lab's own specification, and
the only one with **reservations already in the code**. Four of the five were
written for row 7 as a whole; this work clears three of them and leaves two
standing for the filmstrip:

| Reservation | Anchor | This work |
|---|---|---|
| Escape is deliberately unbound, "the palette of PR 7 owns it" | `apps/lab/src/App.tsx:71` | **cleared** — Escape closes the palette |
| The guard that nothing else binds Escape | `apps/lab/src/routes/LabLayout.browser.test.tsx:201` | **split in two**, §10 |
| "⌘K joins this group in PR 7" | `apps/lab/src/shell/TopBar.tsx:52` | **cleared** — the trigger takes its place |
| Tokens on `:root` so a dialog outside the shell resolves them | `apps/lab/src/design/tokens.css:13` | **cleared** — the palette is that dialog |
| The run rail stays empty until the filmstrip fills it | `apps/lab/src/stage/Stage.tsx:6` | **stands** — not this work |

The palette is also the application's **first dialog**: a grep over
`apps/lab/src` for `role="dialog"`, `<dialog`, `aria-modal` and `createPortal`
returns nothing but the comment in `tokens.css`. There is no in-repo pattern to
follow, which is why §7 states the contract rather than pointing at a
neighbour.

Out of scope: the run filmstrip; the parameter diff; any change to the
generator, to `@arrowz/engine` beyond dictionary entries, or to
`@arrowz/board-element`.

## 2. What the mock has, and where it stops

Measured, not assumed. The mock's palette is one `<script type="text/x-dc">`
block in `Arrowz Workshop v2.dc.html` plus twelve CSS rules.

**What it does:** ⌘K/Ctrl+K toggles it (the modifier test runs *before* its
"is a field focused" guard, so it opens while typing); Escape always closes;
the backdrop closes on click and the frame stops the bubble; the input is
focused through a `setTimeout(…, 0)`; ArrowUp/ArrowDown/Enter are handled by
the **window** listener while the input's own `onKeyDown` is an explicit no-op;
hover and the keyboard share one selection index; a row jumps by switching the
left rail's group, closing, and outlining the knob for 1200 ms.

**Where it stops, and why each gap matters here:**

1. **It is a knob finder, not a command palette.** Its list is
   `ALL = GEN.concat(EL)` — 41 knob rows, no action, no preset, no navigation —
   while its own placeholder promises "jump to a knob, a group or a preset".
   The repertoire below is therefore *wider* than the mock, by decision D3, and
   building "what the mock draws" would have delivered a search box for knobs
   under the name of a palette.
2. **It caps the list at 40 rows** (`hits.slice(0, 40)`). In the mock that hides
   exactly one knob. Against this repertoire — 28 knobs, 9 preview fields, 26
   presets, the actions — the same cap would hide roughly half the palette,
   silently. Dropped by D4.
3. **Its rows are `div`s with `aria-selected`**: no dialog role, no combobox,
   no focus trap, no focus return. The lab's own spec already corrects this
   (`2026-09-13-lab-react-app-design.md` §7.2, the palette row); §7 below is
   that correction spelled out.
4. **Its jump is state-only**: no focus move, no scroll into view. D2 keeps the
   flash and adds the focus.
5. **Its footer advertises `g generate` and `[ ] seed`** — two global hotkeys
   the lab does not have. D5 builds them rather than printing a promise the
   application cannot keep.

**What is ported verbatim** is in §8. There are no transitions and no blur on
any palette selector; that is the design system's rule, not an omission, and it
is kept.

## 3. Decisions

- **D1 — the palette is the whole of this work.** The filmstrip and the diff
  stay in row 7, undelivered. Two reservations keep standing (§1), and the
  comments that name "PR 7" are rewritten to name what is actually left, so
  that no comment in the tree describes a delivery that has happened.
- **D2 — a knob jump moves the focus *and* flashes.** The palette switches the
  rail to the knob's group, closes, puts the focus on the knob's own control
  (`#knob-<key>`), and outlines it for 1200 ms. The focus is what lets the
  keyboard carry on turning the knob; the flash is what the eye needs among 28
  controls, where a focus ring alone is easy to lose.
- **D3 — the repertoire is actions, navigation, knobs and presets.** Nothing
  the palette does is new behaviour: every command calls a function the lab
  already has (§4).
- **D4 — at rest the palette lists everything, and scrolls.** No cap. The list
  box keeps the mock's `max-height: 46vh` and its own scrollbar.
- **D5 — the footer's three real hints stay, and its two fictional ones become
  real hotkeys**: `g` generates, `[` and `]` step the seed by one and run.
- **D6 — a preset row does exactly what its chip does**: every knob written
  from the option (not only the ones it names), the clamp notice raised, the
  export cell size followed, and a run started — one function, called from two
  surfaces (`apps/lab/src/run/PresetStrip.tsx:28-46`).
- **D7 — a command that cannot run stays visible and says why.** Abort with no
  run in flight, the exports with no board, Generate against a broken rule: the
  row is listed, `aria-disabled`, with the reason where a knob's value would
  be. A command that vanishes when unavailable is a command nobody can find and
  nobody can be told about. This follows the lab's own correction of the mock
  for inactive knobs (§7.2: "communicated by `opacity: .4` alone" → a reason).
  The reasons are three, and the list is closed: nothing is running (Abort), a
  carve is already going (Generate, New seed, Defaults), and the rule is broken
  (Generate, which keeps that reason even mid-carve, being the one a person has
  to do something about). "Unconditional" is meant literally — a row disabled
  by a carve in flight shows the reason in place of its hotkey, because `[ ]`
  is a hotkey and says nothing about why the row is grey.

## 4. The repertoire, and where each command already lives

`palette/commands.ts` is a **pure module**: no JSX, no DOM, no store import at
module scope. It exports one builder that takes the dictionary, a state
snapshot and a deps object, and returns typed descriptors:

```ts
interface Command {
  readonly id: string                    // stable, for tests and for the row's DOM id
  readonly section: CommandSection       // 'run' | 'go' | 'knob' | 'preset'
  readonly name: string                  // localised
  readonly note: string                  // the row's middle column: group, level, or ''
  readonly value: string                 // the row's right column: value, hotkey, or the D7 reason
  readonly disabled: boolean
  run(): void
}
```

The sections, in list order, and the existing code each one calls:

| Section | Rows | Calls |
|---|---|---|
| `run` | Generate, New seed, Defaults, Abort, full view | `run/actions.ts` (§5), `ui.toggleSolo` |
| `go` | Lab, Saved boards, Docs — element, Docs — command line; simple/advanced; Polish/English | `navigate()`, `ui.setMode`, `lang.setLang` |
| `knob` | 28 generator knobs (the `--start` pair as one row, as `KnobPanel` draws it) and the preview section's own fields — five numbers and five flags, both tables in `apps/lab/src/console/viewFields.ts` | §6 |
| `preset` | 26 options under their seven levels | `PresetStrip`'s `apply`, extracted with it (D6) |

**Filtering** is a case-insensitive substring over the row's name, its note and
— for a knob — its CLI flag from `flagOf` (`packages/engine/command.ts:153`),
so `--seed`, `seed` and `board` all find the seed. The mock matches name and
group only; the flag is added because the lab's whole vocabulary is the CLI's,
and the live command line beside the palette spells knobs that way. Within
that filtered set, a row whose name starts with the query is ranked ahead of
a row that only contains it elsewhere, with the section order (`run`, `go`,
`knob`, `preset`) still deciding ties within each of those two groups — a
query that names a knob has to surface the knob rather than an action whose
name happens to contain the same word.

**The two exports are deliberately absent from that table** (settled while
planning, 2026-09-21). Every other row calls a function that already exists as
a function; the SVG export is a closure inside `ExportButtons` holding a worker
and a busy flag, and the board file needs the layout hash that component works
out per board. A palette row could only reach them by clicking their button
through the DOM — a second path to the same action, guarded by no test — or by
a refactor of the export's worker lifecycle that this design did not scope.
They stay one click away in the run column, which is where they live.

Because this module is pure, the repertoire is tested in the cheap `node`
project: which rows exist, in what order, what each one's `disabled` says
against a given state, and what a query matches. The browser project is left
to test the dialog, not the catalogue (§10).

## 5. One home for Generate, New seed and Defaults

Today those three live as closures inside `RunColumn`
(`apps/lab/src/run/RunColumn.tsx:127-150`), where nothing else can reach them.
The palette and two hotkeys need all three, so they move to
`run/actions.ts` as functions over `RunControl`, and the column calls them.
This is the smallest refactor that avoids a second copy, and it moves no
behaviour:

- `generate(control)` — `drawIfRandom()`, then `control.start()`.
- `reseed(control)` — `setMany({ seed })` from `crypto.getRandomValues`, then
  `drawIfRandom()`, then `control.start()`.
- `defaults(control)` — `params.reset()`, `resetRecipeIfSimple()`, then
  `control.start()`.
- `stepSeed(control, delta)` — **new**, for `[` and `]`: the seed moved by
  `delta` and held inside `PARAM_SPEC`'s own bounds for `seed`, which are
  `min: 0`, `max: 2 ** 32 - 1`, `step: 1` (`packages/engine/engine.ts:2396-2406`).
  It writes through `setMany`, not `set`: `set` is the hand-typed surface that
  wakes auto-generate, and every machine path "starts its own run immediately"
  (`apps/lab/src/state/params.slice.ts:73-80`, Ruling 3). A key that both moved
  the seed through `set` and started a run would fire two runs for one press.

## 6. The knob jump

Every other command is a function call. This one has to survive a render, so it
is the only new mechanism in this work.

The path: the palette writes the knob's group into `ui.select(...)`, and — if
the simple view is on screen, where no knob exists — `ui.setMode('advanced')`
first; it stores the request as `ui.focusKnob`; it closes. `KnobPanel` (and
`ViewPanel`, for a `view-…` field) consumes the request in an effect after the
render that put the control in the tree: it focuses the node and clears the
request, so a second render cannot re-steal the focus.

The target ids already exist and need no new markup:
`#knob-<key>` on the slider (`ValueKnob.tsx:71`), on the select
(`ChoiceKnob.tsx:42`), `#knob-start` for the composite (`StartKnob.tsx:44`),
and `#view-<field>` in the preview section (`ViewPanel.tsx:75`). The preview's
flag switches are the one exception: they carry `aria-labelledby` and no id of
their own (`ViewPanel.tsx:108-117`), so each gains `id="view-<flag>"` — a line
of markup, no behaviour, and the label id it already publishes stays as it is.

The flash is a class on the knob's own box for 1200 ms, the mock's figure and
its rule (`outline: 1px solid var(--signal); outline-offset: 4px`). Its timer
is **cancellable from outside**, as `cancelNoticeFade` and `cancelPendingSave`
are (`apps/lab/src/harness/mountApp.tsx:24-25`): a module-scope timer outliving
the component that armed it is exactly what Ruling 12 was written for, and a
case that jumps and ends before the timer fires would otherwise post into the
next case.

**A jump asked for from a face that has no knobs brings the lab face with it.**
⌘K is bound on every route (§7), while the knobs belong to the lab tab alone:
`/boards` gives the console's panel slot to the library, and `/docs/*` hides
the whole workspace behind `<main hidden>`. The jump therefore navigates to
`/` before it selects the group — a person who asked for a knob asked for that
knob, not for a message about which tab they were standing on. A `go` row and
a jump both skip the navigation when the route is already the one asked for,
so neither stacks a history entry Back would have to walk through.

The navigation alone does not carry the request, and the reason is worth
stating because it is invisible in the code: react-router commits a navigation
inside a transition, one render *behind* the store write that made the
request. Measured — with the consumer ungated, a jump from `/boards` was spent
while `LibraryPanel` still held the panel slot and `#knob-seed` did not exist,
and a jump from `/docs/*` found the node inside `<main hidden>`, where
`focus()` is a no-op. `useFocusRequest` is therefore gated on the lab tab
(`selectedIndex(pathname) === 0`, the tab strip's own notion of the face), and
the request survives that one render to the commit that has the panel. On the
lab tab it is still spent whether or not the node was found: a target that
does not exist there will not exist later either.

`jsx-a11y/no-autofocus` is a gate here, so the focus is a ref in an effect —
never the attribute.

## 7. The dialog's contract

Applying §7.2 of the lab spec, which corrects the mock line by line:

- The frame is `role="dialog" aria-modal="true"`, labelled from the dictionary.
- The input is `role="combobox"` with `aria-expanded`, `aria-controls` pointing
  at the list and `aria-activedescendant` naming the active row. **The focus
  never leaves the input**: arrows move the active row, not the focus, which is
  what lets a screen reader read the row while the user keeps typing. This is
  the opposite of the mock, whose window listener drives the keys while the
  input's own handler is a no-op.
- The list is `role="listbox"`; each row is `role="option"` with
  `aria-selected` and a stable id built from the command id.
- Tab is trapped inside the frame, and closing returns the focus to the ⌘K
  button — the row §7.2 spells out.
- Hover sets the active row, as the mock does, so mouse and keyboard share one
  selection.
- Enter runs the active command; a `disabled` row (D7) consumes the key and
  does nothing.
- Escape closes. The backdrop closes on click; the frame stops the bubble.

**The hotkeys, and how they fit the one already here:**

| Key | Where | Guards |
|---|---|---|
| ⌘K / Ctrl+K | every route, **including the docs** — navigation is half its purpose | modifier required, so it collides with no typing; toggles, as the mock does |
| `g`, `[`, `]` | the workspace only, exactly where `f` lives | the full set `useSoloKey` carries: no Ctrl/⌘/Alt, no `repeat`, no `isComposing`, no `defaultPrevented`, nothing typed into a field or an editable region |
| `f` | unchanged | unchanged |

Two consequences worth stating because they are the kind of thing a later
reader re-derives wrongly:

- **`<arrowz-board>` does not swallow ⌘K.** Its own key handler returns at once
  when `metaKey || ctrlKey || altKey` is set
  (`packages/board-element/src/arrowz-board.ts:832`), so a board with the focus
  is not a hole in the shortcut.
- **The new keys fall silent while the palette is open, with no new condition.**
  The palette's search box is an `<input>`, and the field guard already refuses
  anything whose target is one (`App.tsx:89-93`). `f` typed into the palette does
  not toggle solo for the same reason.

**Not every decision here is global, and which is which is the table above.**
⌘K is bound on every route. The run keys are the workspace's, exactly as `f`
is. The footer follows the *keys*, not the dialog: the two run hints (D5) are
drawn only where the keys they name are bound, because a hint printed on the
documentation route would be the very promise "the application cannot keep"
that D5 exists to forbid. A jump is global only in the sense that it can be
asked for anywhere; it brings the lab face with it rather than working where
it stands (§6).

A refused `g` says nothing, like every other non-button trigger of a run: the
funnel refuses a broken rule silently and `RunStatusBar` is the one voice
(`apps/lab/src/run/useRun.ts:32-36`, Ruling 13).

## 8. State, and what is never remembered

`ui.slice` gains exactly two fields and their actions:

| Field | Meaning | Persisted |
|---|---|---|
| `palette: boolean` | the dialog is on screen | **no** — not `localStorage`, not the hash |
| `focusKnob: RailTarget \| null` | a jump waiting for its render (§6) | **no** |

The hash codec carries `help` and the parameters, plus `tab` for the round trip
(`apps/lab/src/state/url.ts:15,39-41`); neither new field joins it, on the same
reasoning that keeps `solo` out — a link should open the lab, not a dialog over
it.

Both fields get a line in `resetApp` (`apps/lab/src/harness/mountApp.tsx:21-38`)
together with `cancelFlash()`: a reset that does not know a field is how a case
inherits the previous one's state (harness fact 27).

## 9. The visual layer

A new `apps/lab/src/design/palette.css`, imported by `main.tsx` beside the
other six, carrying the mock's own figures:

```css
.fw-scrim { position: fixed; inset: 0; z-index: 40; background: rgba(14,15,18,.72);
            display: grid; justify-items: center; align-content: start; padding-top: 12vh; }
.fw-pal   { width: min(560px, calc(100vw - 32px)); background: var(--graphite);
            border: 1px solid var(--border-strong); }
.fw-pal input { width: 100%; height: 44px; padding: 0 14px; border: 0;
                border-bottom: 1px solid var(--border); background: var(--void);
                color: var(--ink); font: inherit; }
.fw-pal .list { max-height: 46vh; overflow-y: auto; }
.fw-pal .row  { display: grid; grid-template-columns: minmax(0,1fr) auto auto;
                gap: 12px; align-items: baseline; padding: 8px 14px; cursor: pointer; }
```

with `.row .g` in `--ash`, `.row .v` in `--signal` with `tabular-nums`, the
active row on `--surface`, the empty note and the footer in `--ash` with its
top border, and the footer's glyphs in `--mist` at weight 400. No transition
and no blur touches any of these selectors, which is the mock's state and the
design system's rule.

The ⌘K trigger is the mock's plain top-bar button carrying the glyph "⌘K",
given the accessible name §7.2 asks for, and it is dressed in this file rather
than in `shell.css` with the rest of the bar: the button is the palette's, and
the two arrive and would leave together. Every other button family in the lab
has a rule of its own (`.fw-tabrow button`, `.fw .fw-seg button`,
`.fw .fw-alt button`, `.fw .fw-presets button`); with none, this one paints as
native browser chrome on the Signal plane.

```css
.fw-top .right > button { height: 24px; padding: 0 8px;
                          border: 1px solid rgba(14,15,18,.3); background: none;
                          color: var(--void); cursor: pointer; }
.fw-top .right > button:hover { background: rgba(14,15,18,.12); }
```

The child combinator is load-bearing. `.fw-top .right` also holds the two
`Segmented` groups, and `.fw .fw-seg button` is (0,2,1) exactly as
`.fw-top .right button` would be — with `palette.css` imported after
`shell.css` in `main.tsx`, a descendant selector here would win that tie on
source order and re-dress the view and language chips. The trigger is the
container's only direct button child.

The three columns are what makes the wider repertoire fit the mock's row
without inventing a layout: the name, then the note (a knob's group, a preset's
level, a section word), then the value — a knob's current number, a command's
hotkey, or D7's reason.

**A rule of this file cannot be proved from the browser project.** That project
loads no stylesheet at all, so `getComputedStyle` there reads React's inline
style and passes with the CSS missing entirely (harness fact 38). The layout
rules are therefore pinned in the `node` project from `palette.css?raw`, the
way `design/console.test.ts` and `design/shell.test.ts` already do it, and the
browser tests assert structure (`closest('.fw-pal')`) rather than appearance.
The trigger's rule is pinned there with them, and so is the *absence* of the
descendant form of its selector: a stylesheet no test loads cannot be caught
missing a rule by any browser case, which is how the trigger shipped with no
rule at all until the whole-branch review looked at it.

## 10. Testing

**Node project** — the catalogue and the state, no browser: the repertoire's
rows, sections and order; `disabled` and its reason against several states;
the query matcher, including a CLI flag (`--seed`) and a group name; the seed
step at both bounds (0 and `2**32-1`) and its use of the machine path;
`ui.slice`'s two fields asserted against a **freshly built slice**, never
against the live store — a reset can otherwise turn the assertion into a
tautology (harness fact 41); the CSS rules of §9 from `?raw`.

**Browser project** — the dialog: ⌘K opens and the focus lands in the input;
Escape closes and the focus returns to the trigger; arrows move
`aria-activedescendant` while `document.activeElement` stays the input; Enter
runs the active command; a jump switches the group, focuses `#knob-<key>` and
flashes it; a preset row leaves the store carved from that option and a run
started; `g`, `[` and `]` work on the workspace and are refused by every guard
(a modifier, a repeat, a field, `defaultPrevented`); `f` typed into the palette
does not toggle solo.

**The Escape guard is split rather than deleted.** `LabLayout.browser.test.tsx`
asserts today that Escape does nothing ("the palette of PR 7 owns Escape"). It
becomes two cases: Escape with the palette closed still leaves solo alone, and
Escape with it open closes the palette and leaves solo alone. The negative case
the reservation left behind is the regression test for the new behaviour, which
is a better start than writing one from scratch.

**Harness facts that bind this work** (`arrowz-testy-lab-harness.md`, verified
there before being quoted here): the dictionary lives in the engine, so
`pnpm nx build engine` precedes any manual lab run (fact 4); whole-application
cases declare their own `40_000` timeout and their own viewport (facts 23, 26);
`getByText` matches whole nodes exactly (fact 33); a fixture must reset through
`useStore.setState`, never through the action under test (fact 40).

## 11. Decided here, spent when the filmstrip's turn comes

Two answers were settled while scoping this work and are recorded so the
filmstrip does not re-open them:

- **The filmstrip's thumbnail is a text tile**, not a picture: the 70px column
  shows the run's size, seed and metrics. The measurement behind it: the board's
  WebGL2 context is created without `preserveDrawingBuffer`
  (`packages/board-element/src/gl-layer.ts:126`), so `toDataURL` after the frame
  yields nothing, and the alternatives are a change to the element's public
  surface or an SVG whose size grows with the piece count — tens of megabytes at
  Insane.
- **The parameter diff compares the peeked run against the board on screen**,
  whose parameters `result.shown` already carries
  (`apps/lab/src/state/result.slice.ts:16`), rather than against the knobs,
  which move under the hand.

## 12. What this work must not quietly become

The filmstrip. The rail in `Stage.tsx` stays empty and its comment keeps saying
why. If the palette's row list starts growing a "recent runs" section, that is
the filmstrip arriving without its memory model, its column or its spec.
