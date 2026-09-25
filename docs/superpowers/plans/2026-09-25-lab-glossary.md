# Lab glossary Implementation Plan

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:subagent-driven-development (recommended) or superpowers:executing-plans to implement this plan task-by-task. Steps use checkbox (`- [ ]`) syntax for tracking.

**Goal:** Every text a player reads in the lab, the CLI's help and the READMEs uses one word per concept (arrow, complete/stuck, skeleton, target length, background, arrow colour…), knob help stops warning about unreachable values, the preset panel says a level sets the size only, and a guard keeps the retired words out — in English and Polish.

**Architecture:** English knob texts live in `PARAM_TABLE` (`packages/engine/engine.ts`), which feeds the lab, `--help=knobs` and the engine's own error messages; everything else is `EN`/`PL` in `packages/engine/lab-i18n.ts`. Three small mechanisms change: an English choice-word table (`EN_CHOICES`) behind `dictionary().choiceText`, five unit keys instead of seven, and two head help keys instead of one. The preset panel (`apps/lab/src/run/PresetStrip.tsx`) gains a caption and per-mode descriptions. A new Deno test, `packages/engine/glossary.test.ts`, refuses the retired words. The lab reads the engine from `packages/engine/dist`, so the engine is rebuilt before any lab test.

**Tech Stack:** TypeScript, Deno 2.9 (engine and CLI tests), React 19 + Vitest browser mode (lab, projects `node` and `chromium`), Nx, pnpm.

**Spec:** `docs/superpowers/specs/2026-09-25-lab-glossary-design.md` — read it first. **Every new string in this plan is copied verbatim from the spec's tables**; a task names the table, the plan does not restate the text. Where a string in a test below differs from the spec, the spec wins and the test is fixed to match it.

## Global Constraints

- Everything in the repository is English; Polish only in `PL` of `lab-i18n.ts` and in `README.pl.md`.
- Comments say why, once; non-header blocks ≤ 6 lines; no history (PR, task, review, round) in comments; cite symbols, never `file.ts:NN` (guard: `packages/engine/comments.test.ts`).
- No `any`, no non-null assertions (`!`).
- The engine and `lab-*.ts` know neither Deno nor the DOM (`neutral.test.ts`).
- Keys never change: `ParamKey`s, dictionary keys other than those this plan renames (`units.*`, `ui.headHelp`, `ui.title`, `ui.subtitle`), flags, CLI words (`--trapbias=off`, `--giantstep=random`, `--start=mixing`), link fields and stored metas.
- `MAX_HELP` = 170 characters for every `PARAM_SPEC` help, `PL.params` help and group help; short labels ≤ 12 characters; units ≤ 6 characters (all in `packages/engine/lab-i18n.test.ts`). Every number in an English help or label appears in the Polish one (same file).
- The lab imports the engine only from `dist`: after changing `packages/engine`, run `pnpm nx build engine` before any lab test or check.
- Lab tests run in two Vitest projects, `node` and `chromium`; `npx vitest run <path>` from `apps/lab` runs both. The chromium project loads only the stylesheets a test imports.
- A red test that pins an **old string** is updated to the spec's new string. A red test for any other reason is a defect: stop and report it, do not change product code to make it pass.
- Commit after each task; no attribution lines in commit messages.
- Before every commit: `deno fmt packages` and `pnpm --dir apps/lab exec prettier --write src`, then `pnpm nx run lab:fmt` must pass (it only checks).

## Review Focus

1. Polish, a special value: the `giantStep` chip reads "losowo" in its text and its `aria-label`, and the command box still prints `--giantstep=random` (Task 1 test).
2. The ⌘K palette's value column shows the same word as the knob ("normal" / "normalnie" for `trapBias` 0), while a search for the flag (`trapbias`, `giants`, `probe`) still finds the row through `hay` (Task 1 test).
3. The preset caption is a child of the `display: grid` panel: it must span every column at 7 columns and at 4 (`max-width: 1479px`), and the five hidden descriptions must not become grid cells (Task 4 test).
4. New short labels and units in a 12ch label track and a 44 px value track: "coil penalty", "leftover max", "target share", "× side", "strz." whole, not ellipsised, at 1440 and at 375 in both languages (Task 8 live pass; the ≤ 12 / ≤ 6 character tests are necessary, not sufficient).
5. The rail's group name "when stuck" / "gdy utknie" and the heading "look" / "wygląd" at XS, where the rail folds (Task 8 live pass), and in `violationsInGroup`, which prints the group's name.

---

### Task 1: Dictionary mechanisms — choice words, units, head help

**Files:**
- Modify: `packages/engine/lab-i18n.ts` (`EN.units`, `PL.units`, `EN.ui.headHelp` → `headWidthHelp` + `headHeightHelp`, same in `PL.ui`, `PL.choices`, new exported `EN_CHOICES`, `dictionary().choiceText`)
- Modify: `apps/lab/src/console/knobLayout.ts` (`UNIT_OF`)
- Modify: `apps/lab/src/console/viewFields.ts` (`VIEW_ROWS`)
- Modify: `apps/lab/src/console/ValueKnob.tsx` (the special chip)
- Modify: `apps/lab/src/palette/commands.ts` (the knob row's `value`)
- Test: `packages/engine/lab-i18n.test.ts`, `apps/lab/src/console/ValueKnob.browser.test.tsx`, `apps/lab/src/console/viewFields.test.ts`, `apps/lab/src/simple/SimplePanel.browser.test.tsx`, `apps/lab/src/palette/commands.test.ts`

**Interfaces:**
- Produces: `export const EN_CHOICES: Partial<Record<ParamKey, Record<string, string>>>` in `lab-i18n.ts`, which is the package's `./i18n` entry itself (`deno.json` and `package.json` exports), so `import { EN_CHOICES } from '@arrowz/engine/i18n'` works. `Dictionary['units']` keys exactly `cells | times | arrows | sides | px`. `UiKey`s `headWidthHelp` and `headHeightHelp`; `headHelp` no longer exists. `dict.choiceText(key, word)` returns the display word in both languages.

- [ ] **Step 1: Write the failing engine tests**

In `packages/engine/lab-i18n.test.ts`:

1. In `'both dictionaries cover the fixed-choice knobs and the start control'`, replace the stale-choices line with a check that also accepts knobs whose minimum has a word, and require their Polish word (import `wordFor` from `./command.ts`):

```ts
  // A knob whose minimum is a word (`--lmax=auto`, `--giantstep=random`) shows
  // that word on its chip, so Polish may translate it too.
  const specialKeys = new Set<ParamKey>()
  for (const s of PARAM_SPEC) {
    const special = wordFor(s.key, s.min)
    if (special === null || s.control?.kind === 'choice') continue
    specialKeys.add(s.key)
    assert(PL.choices[s.key]?.[special], `Polish word for the ${s.key} chip`)
  }
  for (const k of Object.keys(PL.choices)) {
    assert(choiceKeys.has(k as ParamKey) || specialKeys.has(k as ParamKey), `stale choices ${k}`)
  }
```

2. Replace `'choiceText looks up a real Polish word for a real choice pair'` with:

```ts
Deno.test('choiceText shows the display word in both languages, and the CLI word stays the flag', () => {
  const en = dictionary('en')
  const pl = dictionary('pl')
  assertEquals(en.choiceText('trapBias', 'off'), 'normal')
  assertEquals(pl.choiceText('trapBias', 'off'), 'normalnie')
  assertEquals(en.choiceText('trapBias', 'seek'), 'seek')
  assertEquals(en.choiceText('giantStep', 'random'), 'random')
  assertEquals(pl.choiceText('giantStep', 'random'), 'losowo')
  assertEquals(pl.choiceText('Lmax', 'auto'), 'auto')
  assertEquals(wordFor('trapBias', 0), 'off')
  assertEquals(wordFor('giantStep', 0), 'random')
})
```

3. Add:

```ts
// Symbols instead of words: "2 prób" and "30 boki" were Polish that does not inflect.
Deno.test('the units are the five the rows use, and the Polish ones need no inflection', () => {
  assertEquals(Object.keys(EN.units).sort(), ['arrows', 'cells', 'px', 'sides', 'times'])
  assertEquals(Object.keys(PL.units).sort(), ['arrows', 'cells', 'px', 'sides', 'times'])
  assertEquals(EN.units.times, '×')
  assertEquals(PL.units, { cells: 'kom.', times: '×', arrows: 'strz.', sides: '× bok', px: 'px' })
})

Deno.test('the head width and the head length each have their own help', () => {
  for (const lang of ['en', 'pl'] as const) {
    const d = dictionary(lang)
    assertNotEquals(d.t('headWidthHelp'), d.t('headHeightHelp'))
  }
  assertEquals(
    dictionary('en').t('headHeightHelp'),
    'How long the arrowhead is, measured along the arrow, in cells. 0 = a flat end with no point.',
  )
})
```

- [ ] **Step 2: Run them to verify they fail**

Run: `cd packages/engine && deno test lab-i18n.test.ts`
Expected: FAIL — `normal` is `off`, `units` has seven keys, `headWidthHelp` is not a `UiKey` (a type error from `deno test`'s check is a failure too).

- [ ] **Step 3: Implement in `lab-i18n.ts`**

- `EN.units` → `{ cells: 'cells', times: '×', arrows: 'arrows', sides: '× side', px: 'px' }`; `PL.units` → `{ cells: 'kom.', times: '×', arrows: 'strz.', sides: '× bok', px: 'px' }`. Keep the comment above `units`.
- In `EN.ui` and `PL.ui`, delete `headHelp` and add `headWidthHelp` and `headHeightHelp` with the texts of the spec's "View panel" table.
- `PL.choices` → `{ giantSpacing: { off: 'bez odstępu', '2': '2', '3': '3' }, trapBias: { avoid: 'unikaj', off: 'normalnie', seek: 'szukaj' }, giantStep: { random: 'losowo' }, Lmax: { auto: 'auto' } }`. Update its comment: the key is the CLI word, the value the lab shows, for choice knobs and for a chip's special word.
- Add after `EN`:

```ts
/**
 * English display words where the CLI's word is not the one a player should
 * read (`--trapbias=off` is the generator's own trap count). The command box
 * keeps the CLI word; see `choiceText`.
 */
export const EN_CHOICES: Partial<Record<ParamKey, Record<string, string>>> = {
  trapBias: { off: 'normal' },
}
```

- In `dictionary()`, `choiceText`:

```ts
    choiceText: (key, word) => stringAt((lang === 'pl' ? PL.choices : EN_CHOICES)[key] ?? {}, word) ?? word,
```

and reword the comment above it: a choice is written on the command line as its CLI word; both languages may show another.

- [ ] **Step 4: Run the engine tests**

Run: `cd packages/engine && deno test lab-i18n.test.ts && deno task test`
Expected: PASS. If another engine test pinned `headHelp` or a unit word, update it to the new key/text.

- [ ] **Step 5: Write the failing lab tests**

`apps/lab/src/console/ValueKnob.browser.test.tsx` — add (import `act` from `react`):

```ts
test('the special chip speaks the page language, and choosing it still writes the minimum', async () => {
  params().reset()
  await act(async () => useStore.getState().lang.setLang('pl'))
  try {
    const screen = await render(<ValueKnob spec={specOf('giantStep')} />)
    const chip = screen.getByRole('button', { name: /^losowo \(/ })
    await expect.element(chip).toHaveTextContent('losowo')
    await chip.click()
    expect(params().values.giantStep).toBe(0)
    expect(screen.container.querySelector('.kv-val')?.textContent).toContain('losowo')
  } finally {
    await act(async () => useStore.getState().lang.setLang('en'))
  }
})
```

`apps/lab/src/console/viewFields.test.ts` — in `'every preview number has a row: a short label and a description'`, add:

```ts
  expect(VIEW_ROWS.headWidth.help).toBe('headWidthHelp')
  expect(VIEW_ROWS.headHeight.help).toBe('headHeightHelp')
  expect(VIEW_ROWS.stroke.unit).toBe('cells')
  expect(VIEW_ROWS.top.unit).toBe('arrows')
```

`apps/lab/src/palette/commands.test.ts` — add inside `describe('the catalogue', …)`, after `'shows a knob its current value and hides its flag in the search text'`:

```ts
  it('words a choice knob’s value as the knob does, and still finds it by its flag', () => {
    useStore.getState().params.setMany({ trapBias: 0 })
    const row = (lang: 'en' | 'pl') =>
      buildCommands({ ...deps(), dict: dictionary(lang) }, useStore.getState()).find(
        (r) => r.id === 'knob-trapBias',
      )
    expect(row('en')?.value).toBe('normal')
    expect(row('pl')?.value).toBe('normalnie')
    expect(row('en')?.hay).toContain('--trapbias')
    const hits = matchCommands(buildCommands(deps(), useStore.getState()), 'giants').map((r) => r.id)
    expect(hits).toContain('knob-giants')
  })
```

Read `matchCommands`' signature in `commands.ts` first; if it takes its arguments in another order or returns another shape, call it the way the file's existing `matchCommands` tests do.

`apps/lab/src/simple/SimplePanel.browser.test.tsx` — in `'head height points at its help in its own row, which its ? opens'`: `EN.t('headHelp')` → `EN.t('headHeightHelp')`. (The `aboutKnob` name changes in Task 3.)

- [ ] **Step 6: Run them to verify they fail**

Run: `pnpm nx build engine && cd apps/lab && npx vitest run src/console/ValueKnob.browser.test.tsx src/console/viewFields.test.ts src/palette/commands.test.ts`
Expected: FAIL — the chip reads `random`; `VIEW_ROWS` still names `headHelp` and `units`; the palette value is `off`. The lab's type check (`pnpm nx run lab:check`) fails too on the deleted unit keys.

- [ ] **Step 7: Implement in the lab**

`knobLayout.ts` `UNIT_OF`:

```ts
export const UNIT_OF: Partial<Record<ParamKey, UnitKey>> = {
  W: 'cells',
  H: 'cells',
  Lmax: 'cells',
  backbite: 'times',
  probeLen: 'cells',
  giants: 'arrows',
  giantSpan: 'sides',
  giantStep: 'cells',
  headTries: 'times',
  absorbLimit: 'cells',
  maxBack: 'arrows',
}
```

`viewFields.ts` `VIEW_ROWS`:

```ts
export const VIEW_ROWS: Readonly<Record<ViewNumber, ViewRow>> = {
  cell: { short: 'viewShortCell', help: 'cellHelp', unit: 'px' },
  stroke: { short: 'viewShortStroke', help: 'strokeHelp', unit: 'cells' },
  headWidth: { short: 'viewShortHeadWidth', help: 'headWidthHelp', unit: 'cells', auto: true },
  headHeight: { short: 'viewShortHeadHeight', help: 'headHeightHelp', unit: 'cells' },
  top: { short: 'viewShortTop', help: 'topHelp', unit: 'arrows' },
}
```

`ValueKnob.tsx`: after `const special = wordFor(spec.key, bounds.min)`, add `const specialText = special === null ? null : dict.choiceText(spec.key, special)`, and use `specialText` for `DraftNumber`'s `word`, the chip's text and its `aria-label` (`${specialText} (${name})`). `isSpecial` still tests `special !== null`.

`commands.ts`, the knob row: `value: wordFor(spec.key, value) ?? String(value)` becomes

```ts
      value: (() => {
        const word = wordFor(spec.key, value)
        return word === null ? String(value) : deps.dict.choiceText(spec.key, word)
      })(),
```

or an equivalent local `const` above the object literal, matching the file's style.

- [ ] **Step 8: Run the lab tests and the lab check**

Run: `cd apps/lab && npx vitest run src/console src/palette src/simple && pnpm nx run lab:check`
Expected: PASS. A red that pins the old `random`/`auto` chip name in English stays green (English words are unchanged); a red that pins `units`/`tries` text is updated.

- [ ] **Step 9: Commit**

```bash
deno fmt packages && pnpm --dir apps/lab exec prettier --write src && pnpm nx run lab:fmt
git add packages/engine apps/lab/src
git commit -m "Lab dictionary: choice words shown in both languages, units that do not inflect, a help for each head row"
```

---

### Task 2: Generator knobs — labels, help, groups, start, reasons and rules

**Files:**
- Modify: `packages/engine/engine.ts` (`PARAM_TABLE` labels and helps, `INACTIVE_REASONS`, `RULE_REASONS`)
- Modify: `packages/engine/lab-i18n.ts` (`EN.short`, `PL.short`, `PL.params`, `PL.reasons`, `EN/PL.groups.closing`, `EN/PL.groupHelp`, `EN/PL.start`, `EN/PL.simple.harder`, and in `ui`: `needsSkeleton`, `needsProbe`, `depProbe`, `mixCap`, `ruleBound`, `rangeViolation`, `stepViolation`, `cmdBroken`)
- Test: `packages/engine/lab-i18n.test.ts`, `packages/engine/lab-simple.test.ts`, `packages/engine/envelope.test.ts`, lab tests listed in Step 5

**Interfaces:**
- Consumes: Task 1's dictionary shape.
- Produces: the spec's "Generator knobs", "The start control", "Groups" and "Reasons, rules and violations" tables, in force. `ruleBound(n)` returns `Minimum for this board: n` / `Minimum dla tej planszy: n` (Polish keeps `n.toLocaleString('pl')`).

- [ ] **Step 1: Write the failing engine tests**

In `packages/engine/lab-i18n.test.ts`:

- `'the rule marker states the bound it marks'`: expect `'Minimum for this board: 0.75'` and `'Minimum dla tej planszy: 0,75'`.
- Add:

```ts
// The glossary's knob words, verbatim from the spec: a changed word is a changed spec.
Deno.test('the knobs speak of arrows, skeletons and target lengths, in both languages', () => {
  const label = (key: ParamKey) => PARAM_SPEC.find((s) => s.key === key)?.label
  assertEquals(label('giants'), 'number of skeleton arrows (0 = no skeleton)')
  assertEquals(label('probe'), 'share of arrows with a target length')
  assertEquals(EN.short.anticoil, 'coil penalty')
  assertEquals(EN.short.absorbLimit, 'leftover max')
  assertEquals(PL.short.pStraight, 'prostość')
  assertEquals(PL.short.giantStep, 'przerwa')
  assertEquals(EN.groups.closing, 'when stuck')
  assertEquals(PL.groups.closing, 'gdy utknie')
  assertEquals(EN.start.options.mixing, 'mix')
  assertEquals(PL.start.options.mixing, 'mieszane')
  assertEquals(dictionary('en').reason('skeletonOff'), 'needs skeletons > 0 or late chance > 0')
  assertEquals(dictionary('pl').reason('stepZero'), 'bez wpływu przy przerwie „losowo”')
})

// A help that warned about a value its own slider cannot reach sent a player
// looking for a danger zone that is not there.
Deno.test('no knob help names a number outside its own range as a threshold', () => {
  const warns = /\b(?:below|above|under|over|more than|less than|poniżej|powyżej|więcej niż|mniej niż)\s+(-?\d+(?:[.,]\d+)?)/gi
  for (const s of PARAM_SPEC) {
    for (const help of [s.help, PL.params[s.key].help]) {
      for (const m of help.matchAll(warns)) {
        const n = Number((m[1] ?? '').replace(',', '.'))
        assert(n > s.min && n < s.max, `${s.key}: "${m[0]}" is not strictly inside ${s.min}..${s.max}`)
      }
    }
  }
})
```

`warns` (range 2..16) says "below 4" and `anticoil` (1..10) "above 6" — both strictly inside, so the new texts pass; the old ones ("below 2", "above 10", "below 0.6", "below 12", "above 16", "more than 5", "above 0.2", "above 3") fail. A knob help that names a board size (`1000×1000`) is not matched: the pattern needs one of the comparison words right before the number.

In `packages/engine/lab-simple.test.ts`, the two `harder` strings: EN `…or set arrow start to tunnels in the “difficulty” group.`, PL unchanged (spec: `simple.harder` EN changes, PL `=`).

In `packages/engine/envelope.test.ts`, the match `straightness bias: 0\.3 is outside 0\.6\.\.1` becomes `straightness: 0\.3 is outside 0\.6\.\.1` (the engine's `formatViolation` keeps its own "is outside" wording and takes the new label).

- [ ] **Step 2: Run them to verify they fail**

Run: `cd packages/engine && deno test lab-i18n.test.ts lab-simple.test.ts envelope.test.ts`
Expected: FAIL on the new assertions and on the threshold test (eight knobs).

- [ ] **Step 3: Implement**

Copy verbatim from the spec:
- "Short labels" → `EN.short`, `PL.short` (`=` rows untouched).
- "Labels and help" → `PARAM_TABLE` `label`/`help` (EN) and `PL.params` (PL). W and H unchanged. Keep each row's code comments; where a comment above a `help` quotes the old wording, reword the comment so it states the constraint, not the old text.
- "The start control" → `EN.start`, `PL.start`, `EN.simple.harder`. The start option **keys** stay `layers | random | tunnels | mixing`; only the `mixing` value changes.
- "Groups" → `EN/PL.groups.closing`, `EN/PL.groupHelp`.
- "Reasons, rules and violations" → `INACTIVE_REASONS`, `RULE_REASONS` (EN, `engine.ts`; the `startPair` text keeps its `${MIX_SHARE.min} to ${MIX_SHARE.max}` interpolation in place of "0.3 to 0.7"), `PL.reasons`, and the `ui` keys named in **Files**. `rangeViolation` EN: `` `${label}: ${value} — allowed ${min} to ${max}` ``; PL `` `${label}: ${value} — dozwolone od ${min} do ${max}` ``. `stepViolation` EN: `` `${label}: ${value} is not an allowed step; the nearest are ${below} and ${above}` ``; PL `` `${label}: ${value} to niedozwolony krok; najbliższe to ${below} i ${above}` ``.

- [ ] **Step 4: Run the engine suite**

Run: `cd packages/engine && deno task test`
Expected: PASS, including `MAX_HELP`, "every number … appears in the Polish one", the start help's `Tunnels = harder.` and the short-label lengths. A failure of `MAX_HELP` or the number test means a string was not copied verbatim: compare with the spec.

- [ ] **Step 5: Update the lab tests that pin the old knob strings**

Rebuild (`pnpm nx build engine`), then change exactly these, to the spec's new text:
- `src/console/ChoiceKnob.browser.test.tsx`: `'About trap bias'` → `'About traps'`; combobox `'trap bias'` → `'traps'`; `'5 is outside -1..1'` → `'5 — allowed -1 to 1'`.
- `src/console/KnobPanel.browser.test.tsx`: `'anticoil'` label → `'coil penalty'`; `/piece start/i` → `/arrow start/i`; slider `'mixing'` → `'tunnel share'`.
- `src/console/StartKnob.browser.test.tsx`: `/piece start/i` and `'piece start'` → arrow start; `'About piece start'` → `'About arrow start'`; the option word list `['layers', 'random', 'tunnels', 'mixing']` → `['layers', 'random', 'tunnels', 'mix']`; `selectOptions(…, 'mixing')`: keep if it selects by `value` (the key), change to `'mix'` if it selects by text — read `StartKnob.tsx`'s `<option value=…>` first.
- `src/console/ValueKnob.browser.test.tsx`: every `'nook closing'` / `/^nook closing:/` → `'nooks first'` / `/^nooks first:/`; `'Rule bound'` → `'Minimum for this board'`, `'Rule bound: 1'` → `'Minimum for this board: 1'`; `/^max length:/` and `'auto (max length)'` stay (the short label `max length` is unchanged).
- `src/console/KnobRow.browser.test.tsx`: `'Rule bound: 0.7'` → `'Minimum for this board: 0.7'`.
- `src/console/GroupRail.browser.test.tsx`: the tab name `'closing'` in the group list → `'when stuck'`.
- `src/palette/commands.test.ts`: `'rule broken'` → `'invalid settings'`.

Run: `cd apps/lab && npx vitest run src/console src/palette src/run src/simple`
Expected: PASS. Any other red: read it; if it pins a string this task changed, update it and add it to the commit message body; otherwise stop and report.

- [ ] **Step 6: Commit**

```bash
deno fmt packages && pnpm --dir apps/lab exec prettier --write src && pnpm nx run lab:fmt
git add packages/engine apps/lab/src
git commit -m "Knobs speak the glossary: arrows, skeletons, target lengths, when stuck; no help warns about a value its slider cannot reach"
```

---

### Task 3: View panel, statuses, library and the rest of the lab's strings

**Files:**
- Modify: `packages/engine/lab-i18n.ts` (`EN.ui`, `PL.ui`: every key of the spec's "View panel" and "Statuses, library and the rest" tables; delete `title` and `subtitle`)
- Test: `packages/engine/lab-i18n.test.ts`, lab tests listed in Step 4

**Interfaces:**
- Consumes: Task 1 (`headWidthHelp`, `headHeightHelp` already exist).
- Produces: the two tables in force. `ui.title` and `ui.subtitle` no longer exist.

- [ ] **Step 1: Confirm the two keys to delete have no reader**

Run: `git grep -n "'title'\|'subtitle'\|t('title')\|t('subtitle')\|\.title\b.*dict\|ui\.title\|ui\.subtitle" -- apps/lab/src packages/engine packages/cli ':!*.test.*'`
Expected: no dictionary read of `ui.title` or `ui.subtitle`. If one exists, keep that key and reword it instead of deleting it.

- [ ] **Step 2: Write the failing engine tests**

In `packages/engine/lab-i18n.test.ts`:
- `'the board mode counts cells and mistakes in both languages, Polish in its three forms'`: `'Element #3 · …'` → `'Strzałka #3 · …'` (three lines), `'zablokowany przez #4 …'` → `'zablokowana przez #4 …'` (two lines). Read the EN expectations in the same test and change `Piece #` → `Arrow #` if present.
- `'the console rail names itself and its two sections in both languages'`: keep `assertNotEquals(railGenerator, railElement)`; add `assertEquals(dictionary('en').t('railElement'), 'look')` and `assertEquals(dictionary('pl').t('railElement'), 'wygląd')`.
- Add:

```ts
Deno.test('a board is complete or incomplete, and the saved list counts arrows', () => {
  const en = dictionary('en')
  const pl = dictionary('pl')
  assertEquals(en.t('closed'), 'Board complete: every cell filled.')
  assertEquals(pl.t('notClosed'), 'niepełna')
  assertEquals(en.t('piecesShort', 120), '120 arrows')
  assertEquals(pl.t('piecesShort', 120), '120 strz.')
  assertEquals(pl.t('longestShort', 69), 'najdłuższa 69')
  assert(!('title' in EN.ui) && !('subtitle' in EN.ui), 'the two unread keys are gone')
})
```

- [ ] **Step 3: Run, implement, run**

Run: `cd packages/engine && deno test lab-i18n.test.ts` → FAIL.
Implement: copy the "View panel" and "Statuses, library and the rest" tables verbatim into `EN.ui` and `PL.ui` (`=` cells untouched; `progress`/`progressRest`: only `pieces` → `arrows` in EN and `elem.` → `strz.` in PL; `backtracks`/`nawroty` stay). Delete `title` and `subtitle` from both.
Run: `cd packages/engine && deno task test` → PASS.

- [ ] **Step 4: Update the lab tests that pin the old strings**

Rebuild (`pnpm nx build engine`), then, to the spec's new text:
- `src/console/ViewPanel.browser.test.tsx`: switch `'point grid'` → `'dot grid'`; switch `'longest'` → `'mark longest'` (both occurrences).
- `src/simple/SimplePanel.browser.test.tsx`: in the flag-name list `['rounded', 'multicolour', 'longest']` → `['rounded', 'multicolour', 'mark longest']`; `EN.t('aboutKnob', 'head height')` → `EN.t('aboutKnob', 'head length')`; the `'off'` value text stays.
- `src/console/useFocusRequest.browser.test.tsx`: `userEvent.keyboard('stroke width')` → `userEvent.keyboard('line thickness')`.
- `src/library/LibraryFace.browser.test.tsx`: `'not closed'` → `'incomplete'`.
- `src/stage/BoardMode.browser.test.tsx`: `'Choose a piece to inspect it.'` → `'Choose an arrow to inspect it.'`; every `Piece #` → `Arrow #` (including the `RegExp` template); the Polish block: `'Wskaż strzałkę, aby ją zbadać.'`, `Strzałka #…`, `wolna`, `zablokowana przez …`.
- `src/routes/LabLayout.browser.test.tsx`, `src/routes/Workspace.browser.test.tsx`, `src/run/RunColumn.browser.test.tsx`, `src/stage/RunStatusBar.browser.test.tsx`: `/Board closed/` → `/Board complete/`; `/^Board closed 100%\./` → `/^Board complete: every cell filled\./`; `/^Board closed 100%\.(?: — (?:not )?saved.*)?$/` → `/^Board complete: every cell filled\.(?: — (?:not )?saved.*)?$/` (and the same shape for the `— (not )?saved` variant); `'52 elem. · zostało 734 · nawroty 18 · 1,4 s'` → `'52 strz. · zostało 734 · nawroty 18 · 1,4 s'`; `'41,3% · 52 elem. · …'` → `'41,3% · 52 strz. · …'`.
- `src/routes/DocsNav.browser.test.tsx`: link `'Element'` → `'Board element'`.

Run: `cd apps/lab && npx vitest run`
Expected: PASS except any test this list missed that pins a string changed here — update it, name it in the commit body. A red for another reason: stop and report.

- [ ] **Step 5: Commit**

```bash
deno fmt packages && pnpm --dir apps/lab exec prettier --write src && pnpm nx run lab:fmt
git add packages/engine apps/lab/src
git commit -m "View panel, statuses and the saved list speak the glossary: arrow colour, background, dot grid, empty cells, complete boards"
```

---

### Task 4: Preset panel — caption, mode words and mode descriptions

**Files:**
- Modify: `packages/engine/lab-i18n.ts` (`presets.caption`, `presets.modeHelp`, `presets.modes.portrait`, PL `presets.modes.serpentine`)
- Modify: `apps/lab/src/run/PresetStrip.tsx`
- Modify: `apps/lab/src/design/run.css` (the caption's grid span and type)
- Test: `packages/engine/lab-i18n.test.ts`, `apps/lab/src/run/PresetStrip.browser.test.tsx`, `apps/lab/src/routes/LayoutInvariants.browser.test.tsx`

**Interfaces:**
- Produces: `Dictionary['presets']['caption']: string`, `Dictionary['presets']['modeHelp']: Record<'square' | 'portrait' | 'tunnels' | 'skeleton' | 'serpentine', string>` (same keys as `presets.modes`).

- [ ] **Step 1: Write the failing engine test**

In `'the preset picker and the two drawers speak both languages'` (or a new test beside it):

```ts
  for (const d of [EN, PL]) {
    assert(d.presets.caption.length > 0, 'preset caption')
    assertEquals(Object.keys(d.presets.modeHelp).sort(), Object.keys(d.presets.modes).sort())
  }
  assertEquals(EN.presets.modes.portrait, 'tall')
  assertEquals(PL.presets.modes.serpentine, 'kręty szkielet')
```

Run: `cd packages/engine && deno test lab-i18n.test.ts` → FAIL. Implement from the spec's "Preset panel" table. Run → PASS. Then `pnpm nx build engine`.

- [ ] **Step 2: Write the failing lab tests**

In `apps/lab/src/run/PresetStrip.browser.test.tsx`:
- The trigger text `'presetEasy portrait25×50▼'` → `'presetEasy tall25×50▼'`.
- Add, inside `describe('PresetStrip', …)`:

```ts
  it('says above the columns that a level sets the size only, and describes each mode', async () => {
    const screen = await render(<PresetStrip control={stub().control} />)
    await open(screen)
    const panel = screen.getByRole('group', { name: 'Presets' }).element()
    const caption = panel.querySelector('.fw-pp-cap')
    expect(caption?.textContent).toBe(
      "Levels set the board's size only; the options change how arrows are laid.",
    )
    expect(panel.getAttribute('aria-describedby')).toBe(caption?.id)
    const tunnels = screen.getByRole('button', { name: 'Hard 75×150 tunnels' }).element()
    const id = tunnels.getAttribute('aria-describedby') ?? ''
    expect(document.getElementById(id)?.textContent).toBe('Arrows start deep inside, buried behind others: harder.')
    expect(tunnels.getAttribute('title')).toBe('Arrows start deep inside, buried behind others: harder.')
  })

  // The panel is a grid: a caption that took one cell would push the Easy
  // column to the second track, and hidden descriptions must take none.
  it.each([1440, 1200])('keeps one column per level beside the caption at %d px', async (width) => {
    await page.viewport(width, 900)
    const screen = await render(<PresetStrip control={stub().control} />)
    await open(screen)
    const panel = screen.container.querySelector('.fw-pp-panel')
    const caption = panel?.querySelector('.fw-pp-cap')
    const cols = [...(panel?.querySelectorAll('.fw-pp-col') ?? [])]
    expect(cols).toHaveLength(PRESETS.length)
    const capBox = caption?.getBoundingClientRect()
    const panelBox = panel?.getBoundingClientRect()
    expect(capBox && panelBox && capBox.width).toBeGreaterThan((panelBox?.width ?? 0) - 4)
    const first = cols[0]?.getBoundingClientRect()
    expect(first && panelBox && Math.abs(first.left - panelBox.left)).toBeLessThan(3)
  })
```

The accessible names in the existing `'names each row in full, twenty-six names and no two the same'` test change only for portrait rows (`… tall`); if it lists names literally, update them, otherwise it stays green.

In `apps/lab/src/routes/LayoutInvariants.browser.test.tsx`: `/Ogromny szkielet z serpentynami/` → `/Ogromny kręty szkielet/`.

Run: `cd apps/lab && npx vitest run src/run/PresetStrip.browser.test.tsx` → FAIL (no caption; the trigger says portrait after Step 1's rebuild it says tall, so only the new cases fail).

- [ ] **Step 3: Implement**

`PresetStrip.tsx`: with `const captionId = \`${panelId}-cap\``, render as the panel's first child

```tsx
        <p id={captionId} className="fw-pp-cap">
          {dict.d.presets.caption}
        </p>
```

set `aria-describedby={captionId}` on `.fw-pp-panel`, and add after the columns

```tsx
        <div hidden>
          {MODES.map((mode) => (
            <span key={mode} id={`${panelId}-mode-${mode}`}>
              {dict.d.presets.modeHelp[mode]}
            </span>
          ))}
        </div>
```

with, at module level, `const MODES: readonly PresetMode[] = ['square', 'portrait', 'tunnels', 'skeleton', 'serpentine']` (`import type { PresetMode } from '@arrowz/engine'`; the dictionary's `modeHelp` is keyed by the same union, so a missing mode is a type error). Each option button gets `title={dict.d.presets.modeHelp[option.mode]}` and `aria-describedby={\`${panelId}-mode-${option.mode}\`}`. A `hidden` element referenced by `aria-describedby` still supplies the description (accname computes hidden referenced nodes), and a `hidden` child of a grid takes no track.

`run.css`, beside `.fw-pp-col`:

```css
/* One line across every column, in the panel's own colours. */
.fw-pp-cap {
  grid-column: 1 / -1;
  margin: 0;
  padding: 8px 12px;
  background: var(--graphite);
  font-size: 12px;
}
```

Match the colour and size tokens the `.fw-pp-col h3` rule uses (read it) instead of the literals above if they differ. Update the width comment above the `max-width: 1479px` rule only if the widest row changed: "winding skeleton 400×400" is still the widest English row; the Polish "kręty szkielet" is shorter than before.

- [ ] **Step 4: Run the tests**

Run: `cd apps/lab && npx vitest run src/run src/routes/LayoutInvariants.browser.test.tsx`
Expected: PASS, including the existing centring test.

- [ ] **Step 5: Commit**

```bash
deno fmt packages && pnpm --dir apps/lab exec prettier --write src && pnpm nx run lab:fmt
git add packages/engine apps/lab/src
git commit -m "Preset panel: a caption says levels set the size only, and each mode describes itself"
```

---

### Task 5: The CLI's help

**Files:**
- Modify: `packages/engine/command.ts` (`EVERYDAY_FLAGS`, `OUTPUT_FLAGS`, `PICTURE_FLAGS`, the merged `--start` row of `KNOB_ROWS`, the pinning paragraph in `helpText`, `environment()`)
- Test: `packages/engine/command.test.ts`

**Interfaces:**
- Consumes: Task 2's `PARAM_TABLE` texts (they print in `--help=knobs` unchanged by this task).
- Produces: the spec's "CLI help" table in force.

- [ ] **Step 1: Write the failing test**

In `packages/engine/command.test.ts`:

```ts
Deno.test('the help speaks the glossary: arrows, complete boards, arrow start', () => {
  const text = helpText({ knobs: true })
  assertStringIncludes(text, 'arrow length, 0 = very short, 1 = very long (default 0.75)')
  assertStringIncludes(text, 'a skeleton of very long arrows first')
  assertStringIncludes(text, 'where an arrow starts, and the tunnel share')
  assertStringIncludes(text, 'the board built so far is stored as incomplete')
  assertStringIncludes(text, 'every everyday combination fills its board.')
})
```

Run: `cd packages/engine && deno test command.test.ts` → FAIL.

- [ ] **Step 2: Implement**

Copy the spec's "CLI help" table into the named places. `--arrow-height=R` keeps its `${DEFAULT_VIEW.headHeight}` interpolation: `` `arrowhead length along the arrow, in cells (default ${DEFAULT_VIEW.headHeight})` ``. The `--start` help keeps `${MIX_SHARE.min}..${MIX_SHARE.max}` in place of `0.3..0.7`. Flags, value columns and `START.words` are untouched.

- [ ] **Step 3: Run the engine and CLI suites**

Run: `cd packages/engine && deno task test && cd ../cli && deno task test`
Expected: PASS. `packages/cli/readme.test.ts` compares flags, ranges, steps and defaults, none of which changed. `carve.test.ts`'s `not closed` expectations are CLI runtime output, out of scope, and stay.

- [ ] **Step 4: Commit**

```bash
deno fmt packages
git add packages/engine
git commit -m "CLI help speaks the glossary: arrow length, a skeleton of very long arrows, incomplete boards"
```

---

### Task 6: The guard

**Files:**
- Create: `packages/engine/glossary.test.ts`

**Interfaces:**
- Consumes: `EN`, `PL`, `EN_CHOICES` (`./lab-i18n.ts`); `PARAM_SPEC`, `INACTIVE_REASONS`, `RULE_REASONS` (`./engine.ts`); `helpText` (`./command.ts`).

- [ ] **Step 1: Write the guard**

```ts
// One word per concept for everything a player reads: the retired words of
// the glossary in docs/superpowers/specs/2026-09-25-lab-glossary-design.md
// may not come back into the lab's dictionaries, the knob texts or the CLI's
// help. An exception names its key and why.
import { assert } from '@std/assert'
import { helpText } from './command.ts'
import { INACTIVE_REASONS, PARAM_SPEC, RULE_REASONS } from './engine.ts'
import { EN, EN_CHOICES, PL } from './lab-i18n.ts'

const EN_RETIRED = [
  /\bpieces?\b/i,
  /\bclos(?:e|ed|es|ing)\b/i,
  /\bjam(?:s|med|ming)?\b/i,
  /\bgiants?\b/i,
  /\bprobes?\b/i,
  /\bcarv(?:e|ed|es|ing)\b/i,
  /\banticoil\b/i,
  /\bpaper\b/i,
  /\bink\b/i,
  /\bgrid units?\b/i,
  /\bserpentine\b/i,
  /\bbackbite\b/i,
  /\bcorridor\b/i,
  /\bfragments?\b/i,
  /\babsorb/i,
  /\blateral\b/i,
  /\bjitter\b/i,
  /golden-angle/i,
  /\bpoint grid\b/i,
]
// "knob" is the CLI's own word for a setting (its "Knobs." section and
// "knob" column), so it is refused in the lab's strings only.
const LAB_ONLY = [/\bknobs?\b/i, /(?:^|\s)--[a-z]/]
const PL_RETIRED = [
  /\belement(?:y|u|ów|em|ami|ach|ie|owi)?\b/i,
  /domkn/i,
  /zaklin/i,
  /zacina/i,
  /zacię/i,
  /\bsond/i,
  /wycię/i,
  /wycin/i,
  /\bprostota\b/i,
  /podziałk/i,
  /\bpapier/i,
  /\btusz/i,
  /kolor rysunku/i,
  /antyzwij/i,
  /wchłan/i,
  /serpentyn/i,
  /kubeł/i,
  /koszyk/i,
  /\bfragment/i,
  /generacj/i,
  /pokrętł/i,
  /siatk\S* punktów/i,
]

/** A dictionary path whose value may keep a retired word, and why. */
const ALLOWED: Record<string, string> = {
  'EN.ui.cmdHintClose': '"close" the palette, a verb about the dialog',
  'EN.ui.cmdPlaceholder': '"knob" in the palette search hint, where a developer types',
  'PL.ui.cmdPlaceholder': '"pokrętła" in the palette search hint, as in English',
  'PL.ui.docsElement': '"Element planszy", the web component',
  'EN.ui.storeEmpty': 'the command deno task carve',
  'PL.ui.storeEmpty': 'the command deno task carve',
}

/** Every string a dictionary can produce, keyed by its path; a function is called with 2 for each parameter. */
function leaves(value: unknown, path: string, out: [string, string][]): [string, string][] {
  if (typeof value === 'string') out.push([path, value])
  else if (typeof value === 'function') out.push([path, String(value(...Array(value.length).fill(2)))])
  else if (Array.isArray(value)) value.forEach((v, i) => leaves(v, `${path}.${i}`, out))
  else if (value !== null && typeof value === 'object') {
    for (const [k, v] of Object.entries(value)) leaves(v, `${path}.${k}`, out)
  }
  return out
}

function refuse(texts: [string, string][], patterns: RegExp[]): void {
  for (const [path, text] of texts) {
    if (Object.hasOwn(ALLOWED, path)) continue
    for (const re of patterns) assert(!re.test(text), `${path} uses a retired word (${re}): "${text}"`)
  }
}

const enTexts = (): [string, string][] => [
  ...leaves(EN, 'EN', []),
  ...leaves(EN_CHOICES, 'EN_CHOICES', []),
  ...PARAM_SPEC.flatMap((s): [string, string][] => [
    [`PARAM_SPEC.${s.key}.label`, s.label],
    [`PARAM_SPEC.${s.key}.help`, s.help],
  ]),
  ...leaves(INACTIVE_REASONS, 'INACTIVE_REASONS', []),
]

Deno.test('the English lab strings and knob texts use no retired word', () => {
  refuse(enTexts(), [...EN_RETIRED, ...LAB_ONLY])
})

// RULE_REASONS print in the CLI's refusals too, so they get the CLI's list.
Deno.test('the rule reasons use no retired word', () => {
  refuse(leaves(RULE_REASONS, 'RULE_REASONS', []), EN_RETIRED)
})

Deno.test('the Polish lab strings use no retired word', () => {
  refuse(leaves(PL, 'PL', []), PL_RETIRED)
})

Deno.test('the CLI help uses no retired word outside flag, variable and group names', () => {
  const text = helpText({ knobs: true })
    .replace(/--[a-z-]+/g, ' ')
    .replace(/\b[A-Z_]{3,}\b/g, ' ')
    .replace(/\[[a-z]+\]/g, ' ')
    .replace(/deno task carve/g, ' ')
  refuse(text.split('\n').map((line, i): [string, string] => [`helpText line ${i + 1}`, line]), EN_RETIRED)
})
```

Adjust only what the first run proves wrong **in the guard** (for example a regex that matches inside a longer word the glossary keeps, such as `\bsond` against a word it did not mean). A hit on a real retired word is a missed string: fix the string to the spec's glossary, not the guard.

- [ ] **Step 2: Run it**

Run: `cd packages/engine && deno test glossary.test.ts`
Expected: PASS. Every failure names a path and a word; each one is either a string Tasks 2–5 missed (fix it from the spec; if the spec has no row for it, write it with the glossary's word and name it in the commit body) or a legitimate exception (add it to `ALLOWED` with its reason).

- [ ] **Step 3: Mutation check — the guard can fail**

Temporarily set `EN.ui.pieceFree` to `'free piece'` and `PL.ui.pieceFree` to `'wolny element'`; run `deno test glossary.test.ts`; expected: two failures naming `EN.ui.pieceFree` and `PL.ui.pieceFree`. Temporarily add `' A piece.'` to `RULE_REASONS.sharesSum`; expected: one failure naming `RULE_REASONS.sharesSum`. Revert all three (`git diff` shows only the new test file) and run again: PASS.

- [ ] **Step 4: Commit**

```bash
deno fmt packages
git add packages/engine/glossary.test.ts packages/engine/lab-i18n.ts packages/engine/engine.ts packages/engine/command.ts
git commit -m "Glossary guard: the retired words may not come back into the lab, the knob texts or the CLI help"
```

---

### Task 7: READMEs

**Files:**
- Modify: `README.md`, `README.pl.md`

**Interfaces:**
- Consumes: the glossary table of the spec.

- [ ] **Step 1: Rewrite the word lists**

Replace the tables under `## Word list` (`README.md`) and `## Słowniczek` (`README.pl.md`) with rows for: arrow (in code *piece*), arrowhead / grot (the tip; in code *head*), path to edge / droga do krawędzi (in code *corridor*), free / wolna, seed / ziarno, skeleton / szkielet (in code *giants*), layers / tunnels, stuck / utknąć, complete / pełna, trap / pułapka, target length / zadana długość (in code *probe*), safe range / bezpieczny zakres. Keep the two-column shape and each row's plain-language explanation; reuse the existing sentences where they still hold (free, seed, layers/tunnels, safe range). Delete "The code and the English text call it a *piece*; the Polish text calls it an *element*." and its Polish twin.

- [ ] **Step 2: Sweep the prose and tables**

Run: `git grep -n -iE '\bpieces?\b|\bclos(e|ed|es|ing)\b|\bjam|squares?|highway|backbone|\blane\b' README.md` and `git grep -n -iE 'element|domkn|zaci|zaklin|kwadrat|autostrad|pas\b' README.pl.md`.
For each hit in prose or in the knob/rule tables' description columns, use the glossary word. Leave verbatim: flag names, JSON fields (`"pieces": 87`), quoted CLI output and error messages (the "When something goes wrong" section quotes `failed to close board …`), the `[trace]` lines, and "square" as a board shape (a 25×25 board is square). The knob table's "**Careful:**" clauses keep naming only values their flag takes.

- [ ] **Step 3: Run the README guard**

Run: `cd packages/cli && deno test readme.test.ts`
Expected: PASS.

- [ ] **Step 4: Commit**

```bash
git add README.md README.pl.md
git commit -m "READMEs follow the lab's glossary: skeleton, path to edge, stuck, complete, cells"
```

---

### Task 8: Review file, full gate and live pass

**Files:**
- Modify: `lab-review.md` ("What is still open", item 1; the glossary rows it lists)

- [ ] **Step 1: Update `lab-review.md`**

In "What is still open", item 1 says the glossary is next: replace it with one sentence that the copy pass is done (report, simple view, glossary on `lab/glossary`), and renumber nothing else. In the "Labels and descriptions" section, add after the "Terminology glossary proposal" table one line: "Shipped on `lab/glossary`; `packages/engine/glossary.test.ts` holds the retired words."

- [ ] **Step 2: Full gate, no cache**

Run: `pnpm nx run-many -t verify --skip-nx-cache`
Expected: every project green. Also `cd packages/engine && deno task verify` and `cd packages/cli && deno task verify`.

- [ ] **Step 3: Live pass in Chrome (done by the session, not a subagent)**

Against a copy of the store (`cp -R packages/cli/boards /tmp/arrowz-boards-glossary` and `ARROWZ_BOARDS_DIR=/tmp/arrowz-boards-glossary pnpm nx serve lab`), in English and Polish, at 1440×900 and at 375×812 with touch:
- the preset panel: caption over all columns, a mode's `title` on hover, "tall" / "pionowa", "kręty szkielet";
- the rail: "when stuck" / "gdy utknie", the heading "look" / "wygląd";
- every group's rows: short labels and units whole ("coil penalty", "leftover max", "× side", "× bok", "strz."), trap choice "normal" / "normalnie", the `giantStep` chip "losowo";
- the view panel's rows ("thickness", "head length", "mark longest", "empty cells", "arrow colour" / "kolor strz.");
- a board that does not fill (1000×1000 with restarts 0 and a low straightness is refused by the rule, so use the smallest `absorbLimit` and `maxBack` 50 on 400×400 with seeds until one fails, or abort a run) and its status line;
- the saved boards' list line ("120 arrows" / "120 strz.").
At the end, remove any emulation so the page is left at its normal size.

- [ ] **Step 4: Commit**

```bash
git add lab-review.md
git commit -m "Lab review: the copy pass is done"
```

---

## Self-review notes

- Spec coverage: Glossary → Tasks 2, 3, 6; Mechanisms (choices, units, head help) → Task 1; Preset panel → Task 4; Generator knobs, start, groups, reasons → Task 2; View panel, statuses, library → Task 3; CLI help → Task 5; READMEs → Task 7; Guard → Task 6; Tests → each task; Live pass → Task 8; Out of scope → Global Constraints (CLI runtime messages stay, `carve.test.ts`) and Task 7 (verbatim quotes).
- Review Focus lines → Task 1 Steps 5/7 (1, 2), Task 4 Step 2 (3), Task 8 Step 3 (4, 5).
