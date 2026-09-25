# Lab simple view copy Implementation Plan

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:subagent-driven-development (recommended) or superpowers:executing-plans to implement this plan task-by-task. Steps use checkbox (`- [ ]`) syntax for tracking.

**Goal:** Every control of the lab's simple view explains itself behind a `?`, its labels say what they do, a sentence tells a player where to find a harder board, and `start.help` says tunnels are harder — in English and Polish.

**Architecture:** Strings live in the engine's dictionary (`packages/engine/lab-i18n.ts`, `simple` and `start`). The simple view's components (`apps/lab/src/simple`) render the new help with the knob rows' own `useKnobHelp` hook; `Segmented` (`apps/lab/src/shell`) gains an optional `describedBy`. The lab reads the engine from `packages/engine/dist`, so the engine is rebuilt before any lab test.

**Tech Stack:** TypeScript, Deno 2.9 (engine tests), React 19 + Vitest browser mode (lab, projects `node` and `chromium`), Nx, pnpm.

**Spec:** `docs/superpowers/specs/2026-09-25-lab-simple-copy-design.md` — read it first; its dictionary table is the source of every string below.

## Global Constraints

- Everything in the repository is English; Polish only in `PL` of `lab-i18n.ts`.
- Comments say why, once; non-header blocks ≤ 6 lines; no history (PR, task, review, round) in comments; cite symbols, never `file.ts:NN` (guard: `packages/engine/comments.test.ts`).
- No `any`, no non-null assertions (`!`).
- The engine and `lab-*.ts` know neither Deno nor the DOM.
- The lab imports the engine only from `dist`: after changing `packages/engine`, run `pnpm nx build engine` before any lab test or check.
- Lab tests run in two Vitest projects, `node` and `chromium`; `npx vitest run <path>` from `apps/lab` runs both. The chromium project loads only the stylesheets a test imports (`SimplePanel.browser.test.tsx` imports `tokens.css`, `shell.css`, `console.css`).
- Only the simple view's strings follow the glossary; `start.help` keeps "piece" (the rest is a later PR).
- Commit after each task; no attribution lines in commit messages.
- Before every commit: `deno fmt packages/engine` and `pnpm --dir apps/lab exec prettier --write src`, then `pnpm nx run lab:fmt` must pass (it only checks).

## Review Focus

1. A language switch while a slider's help is open: the paragraph turns Polish and stays open (Task 2 test).
2. The new `?` narrows the label's track: the Polish labels `dł. strzałek` and `krętość` must still show whole, not ellipsised, at 720px and at XS (Task 3 test; `.kv-lab` has `text-overflow: ellipsis`, so the check is `scrollWidth <= clientWidth` on `.kv-lab`, which can fail because `.kv-lab` has `min-width: 0` and `overflow: hidden`).
3. Two ids in one `aria-describedby`: an existing test reads it with `getElementById(attr)`, which returns `null` for `"a b"`; the test must split it (Task 2).
4. The hint is a `<p>`, not a `.kv-row` and not a `.kv-help`: the panel's row count (14) and the harness poll on `.kv-g .kv-help.fw-vh` must not see it (Task 3 test and the `LayoutInvariants` run in Task 4).
5. A finger at 375px: the new `?` buttons are `.kv-g .q`, which `touchTargets` skips like every knob's `?`; the live pass confirms they are tappable and the label stays on one line (Task 4).

---

### Task 1: Dictionary — simple view strings and `start.help`

**Files:**
- Modify: `packages/engine/lab-i18n.ts` (`EN.simple`, `EN.start`, `PL.simple`, `PL.start`)
- Modify: `packages/engine/lab-simple.ts` (file header comment only)
- Test: `packages/engine/lab-simple.test.ts`, `packages/engine/lab-i18n.test.ts`

**Interfaces:**
- Produces: `Dictionary['simple']` keys `lengthsHelp`, `shapeHelp`, `skeletonHelp`, `harder` (all `string`), in `EN` and `PL`. Changed values of `simple.lengths`, `simple.shape`, `simple.ends.shape`, `simple.randomizeHelp`, `start.help`.

- [ ] **Step 1: Write the failing engine tests**

In `packages/engine/lab-simple.test.ts`, in the test `'both dictionaries label every simple choice, slider end, size and view string'`, extend `viewStrings`:

```ts
  const viewStrings: (keyof Dictionary['simple'])[] = [
    'viewSimple',
    'viewAdvanced',
    'randomize',
    'randomizeHelp',
    'lengthsHelp',
    'shapeHelp',
    'skeletonHelp',
    'harder',
  ]
```

Add a new test after it:

```ts
// The spec's sentences, verbatim: a changed word is a changed spec.
Deno.test('the simple view speaks of arrows and winding, in both languages', () => {
  assertEquals(EN.simple.lengths, 'arrow length')
  assertEquals(EN.simple.shape, 'winding')
  assertEquals(EN.simple.ends.shape, ['straightest', 'most winding'])
  assertEquals(PL.simple.lengths, 'dł. strzałek')
  assertEquals(PL.simple.shape, 'krętość')
  assertEquals(PL.simple.ends.shape, ['najprostsze', 'najbardziej kręte'])
  assertEquals(
    EN.simple.harder,
    'Want it harder? In Advanced, pick a tunnels preset, or set the start to tunnels in the difficulty group.',
  )
  assertEquals(
    PL.simple.harder,
    'Chcesz trudniej? W widoku zaawansowanym wybierz preset z tunelami albo w grupie trudność ustaw start na tunele.',
  )
  // The hint names the group and the preset mode by their visible words.
  for (const d of [EN, PL]) {
    assert(d.simple.harder.includes(d.groups.difficulty), 'the hint names the difficulty group')
    assert(d.simple.harder.includes(d.start.options.tunnels), 'the hint names tunnels')
  }
  assert(PL.simple.randomizeHelp.includes(`„${PL.ui.generate}”`), 'the PL help quotes the Generate button')
  for (const d of [EN, PL]) {
    for (const k of ['lengthsHelp', 'shapeHelp', 'skeletonHelp', 'randomizeHelp'] as const) {
      assert(!/\b(piece|element|knob|pokrętł)/i.test(d.simple[k]), `${k} uses the glossary`)
    }
  }
})
```

The file already imports `assert`, `assertEquals` from `@std/assert` and `type Dictionary, EN, PL` from `./lab-i18n.ts`. The Generate button's label is `ui.generate` (`'Generuj'` in `PL`).

In `packages/engine/lab-i18n.test.ts`, in the loop `for (const d of dictionaries)` that checks `d.start`, add after the inner `for`:

```ts
    // The one sentence a player needs from this knob; the CLI's help says it too.
    assert(/Tunnels = harder\.|Tunele = trudniej\./.test(d.start.help), 'the start help says tunnels are harder')
```

- [ ] **Step 2: Run tests to verify they fail**

Run: `cd packages/engine && deno test lab-simple.test.ts lab-i18n.test.ts`
Expected: FAIL — `deno check` reports that `'lengthsHelp'` (and the other new keys) are not assignable to `keyof Dictionary['simple']` and do not exist on `EN.simple`/`PL.simple`.

- [ ] **Step 3: Write the strings**

In `packages/engine/lab-i18n.ts`, `EN.simple` becomes:

```ts
  simple: {
    viewSimple: 'Simple',
    viewAdvanced: 'Advanced',
    lengths: 'arrow length',
    shape: 'winding',
    skeleton: 'skeleton',
    options: {
      skeleton: { off: 'no skeleton', on: 'with a skeleton' },
    },
    ends: {
      lengths: ['very short', 'very long'],
      shape: ['straightest', 'most winding'],
    },
    lengthsHelp:
      "Left: many short arrows. Right: fewer, longer ones. The number is the slider's position from 0 to 100, not a setting; the detailed settings follow from it.",
    shapeHelp:
      "Left: long straight arrows. Right: arrows that bend and wind a lot. The number is the slider's position from 0 to 100, not a setting; the detailed settings follow from it.",
    skeletonHelp: 'Starts the board with a few very long arrows snaking across it; the rest fills in around them.',
    randomize: 'randomise the settings on every generate',
    // The row's short label; the sentence above is its title.
    randomizeShort: 'randomise',
    randomizeHelp:
      'Each Generate picks fresh settings within a safe range for this size and these choices, so you get a new board every time, even with the same seed. See the picked values in Advanced.',
    // No presets in this view, so the hint sends the player to the advanced one.
    harder: 'Want it harder? In Advanced, pick a tunnels preset, or set the start to tunnels in the difficulty group.',
  },
```

`EN.start.help`:

```ts
    help:
      'Where the next piece starts: the shallowest line (layers), anywhere (random) or the deepest (tunnels). Tunnels = harder. Mixing starts that fraction of pieces as tunnels.',
```

`PL.simple` becomes:

```ts
  simple: {
    viewSimple: 'Prosty',
    viewAdvanced: 'Zaawansowany',
    lengths: 'dł. strzałek',
    shape: 'krętość',
    skeleton: 'szkielet',
    options: {
      skeleton: { off: 'bez szkieletu', on: 'ze szkieletem' },
    },
    ends: {
      lengths: ['bardzo krótkie', 'bardzo długie'],
      shape: ['najprostsze', 'najbardziej kręte'],
    },
    lengthsHelp:
      'W lewo: dużo krótkich strzałek. W prawo: mniej, ale dłuższych. Liczba to pozycja suwaka od 0 do 100, nie ustawienie; szczegółowe ustawienia wynikają z niej.',
    shapeHelp:
      'W lewo: długie proste strzałki. W prawo: strzałki, które dużo skręcają i się wiją. Liczba to pozycja suwaka od 0 do 100, nie ustawienie; szczegółowe ustawienia wynikają z niej.',
    skeletonHelp:
      'Zaczyna planszę od kilku bardzo długich strzałek wijących się przez planszę; reszta wypełnia miejsce wokół nich.',
    randomize: 'losuj ustawienia przy każdym generowaniu',
    randomizeShort: 'losuj',
    randomizeHelp:
      'Każde „Generuj” dobiera nowe ustawienia w bezpiecznym zakresie dla tego rozmiaru i wyborów, więc za każdym razem dostajesz inną planszę, nawet przy tym samym ziarnie. Wybrane wartości zobaczysz w widoku zaawansowanym.',
    harder:
      'Chcesz trudniej? W widoku zaawansowanym wybierz preset z tunelami albo w grupie trudność ustaw start na tunele.',
  },
```

`PL.start.help`:

```ts
    help:
      'Skąd startuje kolejny element: najpłytsza linia (warstwy), losowo albo najgłębsza (tunele). Tunele = trudniej. Mieszanie startuje tunelami tę część elementów.',
```

`Dictionary` is `Widen<typeof EN>` and `PL` is a `Translation` (`Dictionary & …`), so the new `EN` keys are required in `PL` by the type checker; no type edits.

In `packages/engine/lab-simple.ts`, the header's second line: `// allows), two sliders (piece length, line shape), a skeleton switch and a` becomes `// allows), two sliders (arrow length, winding), a skeleton switch and a`.

- [ ] **Step 4: Run the engine tests**

Run: `cd packages/engine && deno task test`
Expected: PASS, including `lab-i18n.test.ts` (EN/PL key parity), `lab-simple.test.ts` and `comments.test.ts`.

- [ ] **Step 5: Build the engine and run the lab's tests that read these strings**

Run: `pnpm nx build engine && cd apps/lab && npx vitest run src/simple src/console/StartKnob.browser.test.tsx && cd ../.. && pnpm nx run lab:check`
Expected: PASS. The existing simple tests read labels from `EN.d.simple`, not literals; if one fails on a renamed literal, update its expected string and name it in the commit.

- [ ] **Step 6: Format and commit**

Run: `deno fmt packages/engine && pnpm --dir apps/lab exec prettier --write src && pnpm nx run lab:fmt`

```bash
git add packages/engine/lab-i18n.ts packages/engine/lab-simple.ts packages/engine/lab-simple.test.ts packages/engine/lab-i18n.test.ts
git commit -m "Simple view strings: arrows and winding, help for every control, a hint for a harder board; start help says tunnels are harder"
```

---

### Task 2: A `?` on the two sliders and the skeleton

**Files:**
- Modify: `apps/lab/src/simple/PositionSlider.tsx`
- Modify: `apps/lab/src/simple/SimplePanel.tsx` (`SkeletonRow`)
- Modify: `apps/lab/src/shell/Segmented.tsx`
- Test: `apps/lab/src/simple/SimplePanel.browser.test.tsx`

**Interfaces:**
- Consumes: `dict.d.simple.lengthsHelp`, `shapeHelp`, `skeletonHelp` (Task 1); `useKnobHelp(id, name, text)` from `../console/KnobRow`, returning `{ button, paragraph, open }`.
- Produces: help paragraphs with ids `simple-lengths-help`, `simple-shape-help`, `simple-skeleton-help`; `Segmented` prop `describedBy?: string | undefined`.

- [ ] **Step 1: Change the two tests that pin the old shape, and add the new cases**

In `SimplePanel.browser.test.tsx`, the test `'shows a recipe slider’s value as text, with its end words as its description'` asserts the row has no `.q` and reads `aria-describedby` as one id. Replace it with:

```ts
  it('shows a recipe slider’s value as text, described by its end words and its help', async () => {
    const screen = await render(<SimplePanel control={stub().control} />)
    const input = screen.container.querySelector<HTMLInputElement>('#simple-shape')
    const row = input?.closest('.kv-row')
    if (!input || !(row instanceof HTMLElement)) throw new Error('no shape row')
    expect(row.querySelector('.vc button, .kv-end')).toBeNull()
    expect(row.querySelector('.vc')?.textContent).toBe(String(Math.round(state().recipe.value.shape * 100)))
    expect(input.getAttribute('aria-describedby')).toBe('simple-shape-ends simple-shape-help')
    const ends = document.getElementById('simple-shape-ends')
    expect(ends?.className).toBe('kv-ends')
    expect([...(ends?.children ?? [])].map((word) => word.textContent)).toEqual([...EN.d.simple.ends.shape])
    expect(row.contains(ends)).toBe(true)
  })
```

Add, after the test `'keeps the end words inside a narrow track, in English and Polish'`:

```ts
  it('opens each simple control’s own help under its ?, and only that one', async () => {
    const screen = await render(<SimplePanel control={stub().control} />)
    const rows = [
      { id: 'simple-lengths-help', name: EN.d.simple.lengths, text: EN.d.simple.lengthsHelp },
      { id: 'simple-shape-help', name: EN.d.simple.shape, text: EN.d.simple.shapeHelp },
      { id: 'simple-skeleton-help', name: EN.d.simple.skeleton, text: EN.d.simple.skeletonHelp },
    ]
    for (const { id, name, text } of rows) {
      const help = document.getElementById(id)
      expect(help?.textContent, id).toBe(text)
      expect(help?.classList.contains('fw-vh'), id).toBe(true)
      const q = screen.getByRole('button', { name: EN.t('aboutKnob', name) })
      expect(q.element().getAttribute('aria-controls'), id).toBe(id)
      expect(q.element().closest('.kv-row')?.contains(help), id).toBe(true)
      await q.click()
      expect(q.element().getAttribute('aria-expanded'), id).toBe('true')
      expect(help?.classList.contains('fw-vh'), id).toBe(false)
      for (const other of rows.filter((r) => r.id !== id)) {
        expect(document.getElementById(other.id)?.classList.contains('fw-vh'), `${id} opened ${other.id}`).toBe(true)
      }
      await q.click()
      expect(help?.classList.contains('fw-vh'), id).toBe(true)
    }
  })

  it('keeps a slider’s help open across a language switch, in the new language', async () => {
    const screen = await render(<SimplePanel control={stub().control} />)
    await screen.getByRole('button', { name: EN.t('aboutKnob', EN.d.simple.lengths) }).click()
    await act(async () => state().lang.setLang('pl'))
    const help = document.getElementById('simple-lengths-help')
    expect(help?.textContent).toBe(dictionary('pl').d.simple.lengthsHelp)
    expect(help?.classList.contains('fw-vh')).toBe(false)
    await act(async () => state().lang.setLang('en'))
  })

  it('describes the skeleton’s choice by its help', async () => {
    const screen = await render(<SimplePanel control={stub().control} />)
    const group = screen.getByRole('radiogroup', { name: EN.d.simple.skeleton })
    expect(group.element().getAttribute('aria-describedby')).toBe('simple-skeleton-help')
  })
```

- [ ] **Step 2: Run the tests to verify they fail**

Run: `cd apps/lab && npx vitest run src/simple/SimplePanel.browser.test.tsx`
Expected: FAIL — `aria-describedby` is `simple-shape-ends`; no element `#simple-lengths-help`; no `?` button named "About arrow length" (whatever `aboutKnob` renders); the radiogroup has no `aria-describedby`.

- [ ] **Step 3: `Segmented` takes a description**

In `apps/lab/src/shell/Segmented.tsx`, add the prop after `labelledBy` in the destructuring and in the props type:

```ts
  /** The id of a paragraph that explains the choice. */
  describedBy?: string | undefined
```

and on the `radiogroup` `div`, after `aria-labelledby={labelledBy}`:

```tsx
      aria-describedby={describedBy}
```

- [ ] **Step 4: `PositionSlider` gets its `?`**

In `apps/lab/src/simple/PositionSlider.tsx`:

1. Import `useKnobHelp` beside `KnobLine, KnobTrack`: `import { KnobLine, KnobTrack, useKnobHelp } from '../console/KnobRow'`.
2. Above the component, a lookup (a template string would be typed `string`, and `string` does not index the dictionary):

```ts
const HELP = { lengths: 'lengthsHelp', shape: 'shapeHelp' } as const satisfies Record<RecipeSlider, string>
```

   After `const id = \`simple-${slider}\``, add:

```ts
  const helpId = `${id}-help`
  const { button, paragraph } = useKnobHelp(helpId, label, dict.d.simple[HELP[slider]])
```

3. `help={null}` becomes `help={button}`.
4. `describedBy={\`${id}-ends\`}` becomes `describedBy={\`${id}-ends ${helpId}\`}`, and its comment stays as it is.
5. After the closing `/>` of `KnobLine`, inside the row `div`, add `{paragraph}`.
6. In the component header, the last paragraph becomes:

```ts
 * A knob row with no numeric ends, and the value is text, because there is
 * nothing to type. The end words stand under the track and describe it; the
 * `?` says what the number is.
```

- [ ] **Step 5: `SkeletonRow` gets its `?`**

In `apps/lab/src/simple/SimplePanel.tsx`, `SkeletonRow`:

```tsx
function SkeletonRow({ control }: { control: RunControl }): ReactElement {
  const dict = useDictionary()
  const skeleton = useStore((state) => state.recipe.value.skeleton)
  const setSkeleton = useStore((state) => state.recipe.setSkeleton)
  const helpId = 'simple-skeleton-help'
  const { button, paragraph } = useKnobHelp(helpId, dict.d.simple.skeleton, dict.d.simple.skeletonHelp)
  return (
    <div className="kv-row">
      <KnobLine
        label={
          <span className="kv-lab" id="simple-skeleton-label">
            {dict.d.simple.skeleton}
          </span>
        }
        help={button}
        wide
        control={
          <Segmented
            label={dict.d.simple.skeleton}
            labelledBy="simple-skeleton-label"
            describedBy={helpId}
            value={skeleton}
            options={SIMPLE_CHOICES.skeleton.map((value) => ({ value, label: dict.d.simple.options.skeleton[value] }))}
            onChange={(next) => {
              setSkeleton(next)
              applyRecipe(false)
              control.start()
            }}
          />
        }
      />
      {paragraph}
    </div>
  )
}
```

- [ ] **Step 6: Run the tests**

Run: `cd apps/lab && npx vitest run src/simple src/shell`
Expected: PASS, including the unchanged `'stands the skeleton’s choice at the right edge of the row'` and the three end-word layout cases (the paragraph sits after `.ln`, outside the row's grid line).

- [ ] **Step 7: Format and commit**

Run: `pnpm --dir apps/lab exec prettier --write src && pnpm nx run lab:fmt && pnpm nx run lab:check && pnpm nx run lab:lint`

```bash
git add apps/lab/src/simple apps/lab/src/shell/Segmented.tsx
git commit -m "Simple view: the two sliders and the skeleton explain themselves under a ?"
```

---

### Task 3: The hint for a harder board, and labels that fit beside their `?`

**Files:**
- Modify: `apps/lab/src/simple/SimplePanel.tsx` (`SimplePanel`)
- Modify: `apps/lab/src/design/console.css`
- Test: `apps/lab/src/simple/SimplePanel.browser.test.tsx`

**Interfaces:**
- Consumes: `dict.d.simple.harder` (Task 1); the `?` buttons of Task 2.
- Produces: `<p className="kv-note" id="simple-harder">` as the last child of the board section.

- [ ] **Step 1: Write the failing tests**

Add to `SimplePanel.browser.test.tsx`:

```ts
  it('ends the board section with where to find a harder board, in English and Polish', async () => {
    const screen = await render(<SimplePanel control={stub().control} />)
    const board = screen.getByRole('group', { name: 'board' }).element()
    const hint = document.getElementById('simple-harder')
    expect(hint?.tagName).toBe('P')
    expect(hint?.parentElement).toBe(board)
    expect(board.lastElementChild).toBe(hint)
    expect(hint?.textContent).toBe(EN.d.simple.harder)
    expect(hint?.classList.contains('kv-row') || hint?.classList.contains('kv-help')).toBe(false)
    await act(async () => state().lang.setLang('pl'))
    expect(hint?.textContent).toBe(dictionary('pl').d.simple.harder)
    await act(async () => state().lang.setLang('en'))
  })

  // `.kv-lab` ellipsises; with the `?` beside it, a long label would lose its end.
  it('shows the simple labels whole beside their ?, at 720px and at XS, in English and Polish', async () => {
    for (const [viewport, width] of [
      [1440, 720],
      [375, 340],
    ] as const) {
      await page.viewport(viewport, 900)
      const screen = await render(
        <div style={{ width: `${width}px`, containerType: 'inline-size' }}>
          <SimplePanel control={stub().control} />
        </div>,
      )
      for (const lang of ['en', 'pl'] as const) {
        await act(async () => state().lang.setLang(lang))
        const labels = [
          screen.container.querySelector('label[for="simple-lengths"]'),
          screen.container.querySelector('label[for="simple-shape"]'),
          screen.container.querySelector('#simple-skeleton-label'),
        ]
        for (const lab of labels) {
          if (!(lab instanceof HTMLElement)) throw new Error('no label')
          expect(lab.scrollWidth, `${viewport} ${lang}: ${lab.textContent}`).toBeLessThanOrEqual(lab.clientWidth)
        }
      }
      // The check can fail: the old Polish label does not fit beside its `?`.
      const lab = screen.container.querySelector('label[for="simple-lengths"]')
      if (!(lab instanceof HTMLElement)) throw new Error('no label')
      const text = lab.textContent
      lab.textContent = 'długość elementów'
      expect(lab.scrollWidth, `${viewport}: the old label`).toBeGreaterThan(lab.clientWidth)
      lab.textContent = text
      screen.unmount()
    }
    await act(async () => state().lang.setLang('en'))
  })
```

The existing test `'is two named sections of knob rows on the advanced view’s grid'` keeps `toHaveLength(14)`: the hint is not a `.kv-row`, so the count must not move.

- [ ] **Step 2: Run the tests to verify they fail**

Run: `cd apps/lab && npx vitest run src/simple/SimplePanel.browser.test.tsx`
Expected: FAIL on the hint (`#simple-harder` is `null`). The label test PASSES already: Task 1's short labels and Task 2's `?` are in place, and the test guards them from here on. Its last block is its own negative control — the old 17-character label must overflow at both widths. If that control fails (the old label fits), the check is blind at that width: report it with the measured `scrollWidth`/`clientWidth` instead of weakening it.

- [ ] **Step 3: Render the hint**

In `SimplePanel`, after `<RandomRow />` inside the board `Section`:

```tsx
          <p className="kv-note" id="simple-harder">
            {dict.d.simple.harder}
          </p>
```

In `apps/lab/src/design/console.css`, after the `.kv-help:not(.fw-vh)` rule:

```css
/* A sentence at the end of a section, not a row: the help's type, the row's gap. */
.kv-note {
  max-width: 60ch;
  margin: 0;
  padding: 10px 0 0;
  color: var(--ash);
  font-size: 11px;
  line-height: 1.6;
  text-wrap: pretty;
}
```

- [ ] **Step 4: Run the tests**

Run: `cd apps/lab && npx vitest run src/simple src/routes/LayoutInvariants.browser.test.tsx`
Expected: PASS. `LayoutInvariants` covers the simple view's states (`simple-inspect`, `simple-play`) at every band; a finding there about `#simple-harder` or the new `?` is a real defect of this task — fix the CSS, not the harness.

- [ ] **Step 5: Format and commit**

Run: `pnpm --dir apps/lab exec prettier --write src && pnpm nx run lab:fmt && pnpm nx run lab:check && pnpm nx run lab:lint`

```bash
git add apps/lab/src/simple apps/lab/src/design/console.css
git commit -m "Simple view: a sentence says where to find a harder board"
```

---

### Task 4: Review file, full gate and live pass

**Files:**
- Modify: `lab-review.md`

- [ ] **Step 1: Record the fix**

In `lab-review.md`, "Status after the fixes", table "Labels and descriptions":

- "Top 6: Simple view explains least": `fixed in <Task 1–3 hashes>`, note "Both sliders and the skeleton have a `?`; labels say arrow length and winding; the number is explained; a sentence points to a harder board. The skeleton's help claims nothing about time: measured, it costs none."
- "Also found: `start.help` drops "Tunnels = harder"": `fixed in <Task 1 hash>`.

In "What is still open", item 1 (copy pass): replace its first sentence with "The report and the simple view are done (`lab/report-copy`, `lab/simple-copy`); the glossary across the knobs and the view panel is next." Keep the sentence about the saved boards' list.

- [ ] **Step 2: The full gate, without the cache**

Run: `pnpm nx run-many -t verify --skip-nx-cache`
Expected: `Successfully ran target verify for 4 projects`.

- [ ] **Step 3: Live pass in Chrome**

Start the lab on a scratch store: `ARROWZ_BOARDS_DIR=$(mktemp -d) pnpm nx serve lab` (it starts the store too; do not start `deno task store` separately). In Chrome, simple view:

1. 1440×900, Polish: the three `?` open their sentences under their rows; `dł. strzałek` and `krętość` show whole; the hint sits under "losuj" and reads as a note, not a control.
2. Switch to English with a help open: it stays open, in English.
3. 375×812 with touch emulation, English: each `?` opens with a tap; labels on one line; the hint wraps inside the panel.
4. Advanced view, difficulty group: the start knob's `?` says "Tunnels = harder."

Stop the server, and reset any `emulate` in the browser.

- [ ] **Step 4: Commit**

```bash
git add lab-review.md
git commit -m "Lab review: the simple view explains itself"
```
