# Parameter Surface Implementation Plan

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:subagent-driven-development (recommended) or superpowers:executing-plans to implement this plan task-by-task. Steps use checkbox (`- [ ]`) syntax for tracking.

**Goal:** One CLI mode with one spelling per option, sentinel numbers spelled as words, 25 knob flags instead of 31, and an engine API that asks for what it needs — without changing a single generated board.

**Architecture:** The engine keeps a numeric parameter map; every word (`auto`, `random`, `layers`) is spelling applied and undone in `command.ts`. The knob table loses four dead knobs and `giantSpacePenalty`; `headBias` and `mix` stay as stored keys but are driven by one surface flag, `--start`. `carve.ts` becomes single-mode and hands its report and bench modes to a new `report.ts`. The lab renders a new row kind for choice-valued knobs and prints the CLI's own spelling.

**Tech Stack:** TypeScript on Deno 2.9, `@std/assert`, Nx + pnpm for the Node build of the engine.

**Spec:** `docs/superpowers/specs/2026-09-12-param-surface-design.md`

## Global Constraints

- Everything in the repository is in English; only `lab-i18n.ts` holds Polish (the PL dictionary) and `README.pl.md` is the Polish translation of `README.md`.
- `deno task test` passes after every task; `deno task verify` and `pnpm nx run-many -t verify` before the PR.
- No `any`, no non-null assertions (`!`); a type fix never adds a value-changing fallback in the engine.
- `packages/engine/*.ts` knows neither Deno nor the DOM (`neutral.test.ts` greps this).
- Never spread arrays proportional to cells or pieces into a call.
- **Board output does not change.** `packages/engine/fingerprints.json` keeps every `fingerprint`, `pieces` and `maxLen` value it has today; only the `argv` of four cases is rewritten. `svg-golden.json` is untouched. `node-smoke.mjs` reproduces the same boards.
- Commit subjects are full sentences in the repo's style, no attribution lines.
- Code style: `deno fmt` (no semicolons, single quotes, width 120).

## Rulings carried into this plan

1. **`headBias` and `mix` stay in `Params` and in `PARAM_SPEC`.** They are stored in the board file and hashed into `boardId`. What merges is the *surface*: one flag `--start` writes both, and the lab shows one control. Their `PARAM_SPEC` entries gain `surface: 'start'`, which tells the help and the lab panel not to render them as their own rows. So: 26 stored knob keys, 25 knob flags.
2. **Truly removed from `PARAM_SPEC`:** `hug`, `edgeHug`, `strandLimit`, `giantWarns`, `giantSpacePenalty`. Each becomes a named constant in `engine.ts` at today's default, and disappears from `ParamKey`, the dictionaries and the lab.
3. **`giantSpacing` keeps its key** with the range 1..3, where 1 means off; the CLI spells 1 as `off`.

## File structure

| File | Responsibility after this plan |
|---|---|
| `packages/engine/engine.ts` | the generator, the 26-key knob table with `surface`, the constants that replaced the removed knobs, the envelope |
| `packages/engine/types.ts` | `ParamKey` (26), `Params` (knobs only), `GenerateOptions`, `ParamSpec` with `surface` and `control` |
| `packages/engine/command.ts` | the one parser, the word spellings, `--help` and `--help=knobs`, `buildCommand`, `boardId` |
| `packages/engine/lab-simple.ts` | the everyday bundles, `simpleParams(choice, rng, pins)` |
| `packages/engine/mod.ts` | the explicit public list |
| `packages/cli/carve.ts` | one board (or a batch), pins and their note |
| `packages/cli/report.ts` | **new** — the report and benchmark levels |
| `packages/cli/lab-page.ts` | the panel, with a choice row kind |
| `packages/engine/lab-i18n.ts` | the dictionaries, minus the removed knobs, plus `start` |

---

### Task 1: The knob table shrinks, and the boards do not move

**Files:**
- Modify: `packages/engine/types.ts` (`ParamKey`, `InactiveKey`, `RuleKey`, `ParamSpec`)
- Modify: `packages/engine/engine.ts` (`PARAM_TABLE`, the use sites of the removed knobs, `RULES`, `RULE_REASONS`, `INACTIVE_REASONS`)
- Modify: `packages/engine/lab-i18n.ts` (PL `params`, PL `reasons`)
- Test: `packages/engine/envelope.test.ts`, `packages/engine/lab-i18n.test.ts`, `packages/engine/engine.test.ts`

**Interfaces:**
- Produces: `ParamKey` without `hug`, `edgeHug`, `strandLimit`, `giantWarns`, `giantSpacePenalty`; `ParamSpec` with `surface?: 'start'`; `RULES` without `mixHole`; `INACTIVE_REASONS` without `hugOff`, `mixOn`, `spanZero`; `giantSpan` minimum 1. Tasks 2-8 build on these names.

- [ ] **Step 1: Write the failing tests**

In `packages/engine/envelope.test.ts`, replace the rule-list test and add a table test:

```ts
Deno.test('envelope: the three cross-knob rules exist with a reason each', () => {
  assertEquals(RULES.map((r) => r.key), ['sharesSum', 'lmaxHole', 'wholeNumbers'])
  for (const r of RULES) {
    assert(Array.isArray(r.keys) && r.keys.length >= 1, r.key)
    for (const k of r.keys) assert(spec(k), `${r.key} names unknown knob ${k}`)
    assertEquals(typeof RULE_REASONS[r.key], 'string', r.key)
    assertEquals(formatViolation({ kind: 'rule', key: r.key, keys: r.keys }), RULE_REASONS[r.key])
  }
})

Deno.test('envelope: the knob table holds 26 keys, and the retired ones are gone', () => {
  assertEquals(PARAM_SPEC.length, 26)
  for (const gone of ['hug', 'edgeHug', 'strandLimit', 'giantWarns', 'giantSpacePenalty']) {
    assert(!PARAM_SPEC.some((s) => String(s.key) === gone), `${gone} is still a knob`)
  }
  // headBias and mix stay stored, but the surface shows one control for both.
  for (const key of ['headBias', 'mix'] as const) assertEquals(spec(key).surface, 'start')
  assertEquals(spec('giantSpan').min, 1)
})
```

Delete the `mixHole` rule test from `envelope.test.ts` and the `mixHole` assertions from `engine.test.ts` (search for `mixHole`). In `packages/engine/lab-i18n.test.ts`:

```ts
const ruleKeys: RuleKey[] = ['sharesSum', 'lmaxHole', 'wholeNumbers']
```

Add the board-preservation guard to `envelope.test.ts`:

```ts
// The retired knobs were inert at their defaults: pinning them as constants
// must reproduce the board a default run gave before this change.
Deno.test('retiring the dead knobs leaves the default board untouched', () => {
  const r = generate({ ...defaultParams(), W: 60, H: 60, seed: 11 })
  assertEquals(fingerprint(r.board), '2a9bd4f1')
})
```

Record the real fingerprint first: run
`deno eval --no-check "import {generate,defaultParams,fingerprint} from './packages/engine/engine.ts'; console.log(fingerprint(generate({...defaultParams(),W:60,H:60,seed:11}).board))"`
**on the current commit**, before any edit, and paste that value into the test.

- [ ] **Step 2: Run them and see them fail**

Run: `deno test --allow-read --allow-run packages/engine/envelope.test.ts packages/engine/lab-i18n.test.ts`
Expected: FAIL — `PARAM_SPEC.length` is 31, `surface` does not exist, `mixHole` is still in `RULES`. The 60×60 fingerprint test passes already (it is the guard, and it must keep passing after Step 3).

- [ ] **Step 3: Implement**

`packages/engine/types.ts`: remove the five keys from the `ParamKey` union; `InactiveKey` becomes `'skeletonOff' | 'probeOff' | 'stepZero'`; `RuleKey` becomes `'sharesSum' | 'lmaxHole' | 'wholeNumbers'`; `ParamSpec` gains:

```ts
  /** Two knobs that one surface flag writes (`--start` = headBias + mix); such a knob has no row of its own. */
  surface?: 'start'
```

`packages/engine/engine.ts`:

```ts
// Retired knobs, kept as the constants their defaults always were. Each was
// inert at that value: HUG gates its own rule on `> 1`, EDGE_HUG only feeds
// that gate, STRAND_LIMIT's default was its maximum, GIANT_WARNS was
// documented as "keep at 0", and GIANT_SPACE_PENALTY only applies when the
// spacing radius is above 1.
const HUG = 1
const EDGE_HUG = 0
const STRAND_LIMIT = 30
const GIANT_WARNS = 0
const GIANT_SPACE_PENALTY = 8
```

Replace every `p.hug`, `p.edgeHug`, `p.strandLimit`, `p.giantWarns`, `p.giantSpacePenalty` (and any `params.`/`this.p.` form) with the constant. Find them with
`grep -n "hug\|edgeHug\|strandLimit\|giantWarns\|giantSpacePenalty" packages/engine/engine.ts`.
Delete those five entries from `PARAM_TABLE`; set `giantSpan`'s `min` to 1; add `surface: 'start'` to the `headBias` and `mix` entries. Delete the `mixHole` entry from `RULES` and `RULE_REASONS`, and the `hugOff`, `mixOn`, `spanZero` entries from `INACTIVE_REASONS` together with the `inactive` functions that return them.

`packages/engine/lab-i18n.ts`: delete the five `params` entries and the three `reasons` entries, and the `mixHole` reason.

- [ ] **Step 4: Run the tests**

Run: `deno task test`
Expected: PASS, `fingerprints.test.ts` and `svg-golden.test.ts` included, with no edits to their data.

- [ ] **Step 5: Commit**

```bash
git add packages/engine
git commit -m "Five knobs that did nothing at their defaults become the constants they always were, and the mixing hole rule goes with them"
```

---

### Task 2: The engine asks for what it needs

**Files:**
- Modify: `packages/engine/types.ts` (`Params`, new `GenerateOptions`)
- Modify: `packages/engine/engine.ts` (`generate`, `Carver` reads of `ruleB`/`voidFrac`)
- Modify: `packages/engine/lab-simple.ts` (`simpleParams` gains `pins`, new `presetParams`)
- Modify: `packages/engine/mod.ts` (explicit exports)
- Modify: `packages/cli/carve.ts`, `packages/cli/lab-worker.ts` (hooks move to the second argument)
- Test: `packages/engine/engine.test.ts`, `packages/engine/lab-simple.test.ts`

**Interfaces:**
- Produces:
  ```ts
  export interface GenerateOptions {
    unchecked?: boolean
    trace?: (info: TraceInfo) => void
    debug?: (msg: string) => void
    /** Test-only: the share of cells left as voids, in [0, 1). */
    voidFrac?: number
    /** Test-only: rule B of the metrics pass. */
    ruleB?: boolean
  }
  export function generate(params: Partial<Params>, opts?: GenerateOptions): GenerateResult
  export function simpleParams(
    choice: SimpleChoice,
    rng?: (() => number) | null,
    pins?: Partial<Record<ParamKey, number>>,
  ): Params
  export function presetParams(
    choice: { W: number; H: number; seed?: number; length?: number; winding?: number; skeleton?: boolean; rng?: () => number },
  ): Params
  ```
  Task 4 calls `simpleParams` with pins; Task 3 prints what these produce.

- [ ] **Step 1: Write the failing tests**

In `packages/engine/lab-simple.test.ts`:

```ts
Deno.test('a pinned knob is not drawn, and its bundle partners still are', () => {
  const choice = { ...defaultChoice(), W: 60, H: 60, lengths: 0.5, shape: 0.5 }
  const rng = () => 0.5
  const pinned = simpleParams(choice, rng, { pStraight: 0.97 })
  assertEquals(pinned.pStraight, 0.97)
  const free = simpleParams(choice, rng)
  assert(free.pStraight !== 0.97, 'the draw would have picked the pinned value anyway')
  assertEquals(pinned.wLateral, free.wLateral)
  assertEquals(pinned.warns, free.warns)
})

Deno.test('the short-plus-medium clamp moves only an unpinned partner', () => {
  const choice = { ...defaultChoice(), lengths: 0 }
  const pinned = simpleParams(choice, () => 0.99, { wShort: 0.85 })
  assertEquals(pinned.wShort, 0.85)
  assert(pinned.wShort + pinned.wMid <= 0.9 + 1e-9, `${pinned.wShort} + ${pinned.wMid}`)
  // Both pinned: the engine refuses, the same way on every run.
  const both = simpleParams(choice, () => 0.99, { wShort: 0.85, wMid: 0.2 })
  assertEquals(both.wShort, 0.85)
  assertEquals(both.wMid, 0.2)
  assert(validateParams(both).length > 0, 'two pins that break the rule must reach the envelope')
})

Deno.test('presetParams takes the CLI vocabulary and gives the same board as the lab choice', () => {
  const viaPreset = presetParams({ W: 40, H: 40, seed: 3, length: 0.25, winding: 0.75, skeleton: true })
  const viaChoice = simpleParams({ W: 40, H: 40, seed: 3, lengths: 0.25, shape: 0.75, skeleton: 'on' })
  assertEquals(viaPreset, viaChoice)
})
```

In `packages/engine/engine.test.ts`:

```ts
Deno.test('generate takes a partial parameter set and its hooks in the options', () => {
  const seen: number[] = []
  const r = generate({ W: 20, H: 20, seed: 5 }, { trace: (i) => seen.push(i.pieces) })
  assertEquals(r.ok, true)
  assert(seen.length > 0, 'the trace hook ran')
  const same = generate({ ...defaultParams(), W: 20, H: 20, seed: 5 })
  assertEquals(fingerprint(r.board), fingerprint(same.board))
})

Deno.test('voidFrac and ruleB live in the options, not in the parameters', () => {
  const r = generate({ W: 40, H: 40, seed: 1 }, { unchecked: true, voidFrac: 0.1 })
  assert(r.board.owner.some((o) => o === -2), 'voids were carved')
})
```

- [ ] **Step 2: Run and see them fail**

Run: `deno test --allow-read --allow-run packages/engine/lab-simple.test.ts packages/engine/engine.test.ts`
Expected: FAIL — `simpleParams` takes two arguments, `presetParams` does not exist, `generate`'s options carry neither hooks nor `voidFrac`.

- [ ] **Step 3: Implement**

`types.ts`: `Params` becomes `Record<ParamKey, number>` — drop `ruleB`, `voidFrac`, `trace`, `debug` — and add the `GenerateOptions` interface above `Params`.

`engine.ts`:

```ts
export function generate(params: Partial<Params>, opts: GenerateOptions = {}): GenerateResult {
  const p: Params = { ...defaultParams(), ...params }
  const { unchecked = false, trace, debug, voidFrac = 0, ruleB = true } = opts
  if (!unchecked) {
    const violations = validateParams(p)
    if (violations.length) throw new InvalidParamsError(violations)
  }
  // ...unchanged, with `new Carver(p.W, p.H, p, rng, { trace, debug, voidFrac, ruleB })`
```

`Carver`'s constructor takes the same fourth argument (an options object with the four optional fields); inside it, every `this.p.trace` / `this.p.debug` / `this.p.voidFrac` / `this.p.ruleB` reads the new field instead. `defaultParams()` drops the `{ ruleB: true, voidFrac: 0 }` cast and returns a plain knob map. `analyse(carver, p.ruleB)` becomes `analyse(carver, ruleB)`.

`lab-simple.ts`: `draw` skips pinned keys and the clamp respects them:

```ts
export function simpleParams(
  choice: SimpleChoice,
  rng: (() => number) | null = null,
  pins: Partial<Record<ParamKey, number>> = {},
): Params {
  const c = normalizeChoice(choice)
  const p: Params = { ...defaultParams(), W: c.W, H: c.H, seed: c.seed }
  const ranges = simpleRanges(c)
  for (const key of anchorKeys(ranges)) {
    const pinnedValue = pins[key]
    if (pinnedValue !== undefined) {
      p[key] = pinnedValue
      continue
    }
    const range = ranges[key]
    if (range) p[key] = draw(key, range, rng)
  }
  for (const [key, value] of Object.entries(pins)) p[key as ParamKey] = value
  // The engine caps short + medium at 0.9. A pinned share is the user's word,
  // so the clamp moves the other one; with both pinned it moves neither and
  // the envelope refuses the pair, identically on every seed.
  if (p.wShort + p.wMid > 0.9) {
    if (pins.wMid === undefined) p.wMid = Number((0.9 - p.wShort).toFixed(6))
    else if (pins.wShort === undefined) p.wShort = Number((0.9 - p.wMid).toFixed(6))
  }
  return p
}

/** The CLI's vocabulary for the simple choice: the recommended entry point for an application. */
export function presetParams(
  { W, H, seed, length, winding, skeleton, rng }: {
    W: number
    H: number
    seed?: number
    length?: number
    winding?: number
    skeleton?: boolean
    rng?: () => number
  },
): Params {
  const d = defaultChoice()
  return simpleParams({
    W,
    H,
    seed: seed ?? d.seed,
    lengths: length ?? d.lengths,
    // `winding` is the shape slider itself: 0 = straightest lines.
    shape: winding ?? d.shape,
    skeleton: skeleton ? 'on' : 'off',
  }, rng ?? null)
}
```

`mod.ts`: replace `export * from './engine.ts'` with the explicit list from the spec's §5, keeping `DIRS`, `pieceShape` and `voidStrips` public and leaving `Carver`, `mulberry32` and `render` out.

`carve.ts` and `lab-worker.ts`: hooks move from the spread into the second argument — `generate(params, { ...hooks })`. In `carve.ts` the `hooks` const becomes `Pick<GenerateOptions, 'trace' | 'debug'>`.

`carve.ts` imports `Carver`, `mulberry32`, `render` and `analyse` from `@arrowz/engine` for its report section, and `mod.ts` no longer exports the first three. The report section leaves this file in Task 5, so do not move it now: change only its import line to the workspace path

```ts
import { analyse, Carver, mulberry32, render } from '../engine/engine.ts'
```

and leave the rest of that section untouched. Task 5 moves the whole block, import line included, into `report.ts`.

- [ ] **Step 4: Run everything**

Run: `deno task test && deno task check && pnpm nx build engine && pnpm --filter @arrowz/board-element exec vitest run --project node`
Expected: PASS. The board element consumes `DIRS`, `pieceShape`, `voidStrips` and the game functions — if its build breaks, the export list is wrong, not the element.

- [ ] **Step 5: Commit**

```bash
git add packages/engine packages/cli
git commit -m "generate takes the knobs it is given and its hooks beside them, simpleParams can be pinned, and the engine exports what a consumer needs instead of everything"
```

---

### Task 3: One parser, one spelling, and words instead of sentinels

**Files:**
- Modify: `packages/engine/command.ts` (the whole flag layer)
- Test: `packages/engine/command.test.ts`

**Interfaces:**
- Produces:
  ```ts
  export interface ParsedArgs {
    params: Params
    view: View
    /** Knob keys written on the command line, in the order they appeared. */
    pins: ParamKey[]
    choice: SimpleChoice & { random: boolean }
    rest: string[]
    errors: string[]
  }
  export function parseArgs(argv: readonly string[]): ParsedArgs
  export function helpText(opts?: { knobs?: boolean }): string
  export function buildCommand(params: Params, view?: Partial<View>): string
  ```
  `parseSimpleArgs` and `buildSimpleCommand` are deleted. Task 4 consumes `ParsedArgs`; Tasks 6 and 7 call `buildCommand`.

- [ ] **Step 1: Write the failing tests**

Add to `packages/engine/command.test.ts`:

```ts
Deno.test('words are accepted and printed back', () => {
  const { params } = parseArgs(['--width=25', '--height=50', '--lmax=auto', '--maxback=auto', '--giantstep=random'])
  assertEquals(params.Lmax, 0)
  assertEquals(params.maxBack, 0)
  assertEquals(params.giantStep, 0)
  const text = buildCommand({ ...params, Lmax: 0, giantStep: 0 }, DEFAULT_VIEW)
  assert(!/--lmax=0\b/.test(text), text)
  assert(/--giantstep=random/.test(text), text)
})

Deno.test('--start writes both stored knobs', () => {
  const cases: [string, number, number][] = [
    ['layers', -1, -1],
    ['random', 0, -1],
    ['tunnels', 1, -1],
    ['0.5', 0, 0.5],
  ]
  for (const [word, headBias, mix] of cases) {
    const { params } = parseArgs(['--width=25', '--height=50', `--start=${word}`])
    assertEquals([params.headBias, params.mix], [headBias, mix], word)
  }
  assert(/--start=tunnels/.test(buildCommand(parseArgs(['--width=25', '--height=50', '--start=tunnels']).params)))
})

Deno.test('--giantspacing spells 1 as off', () => {
  assertEquals(parseArgs(['--width=9', '--height=9', '--giantspacing=off']).params.giantSpacing, 1)
  assert(/--giantspacing=off/.test(buildCommand({ ...defaultParams(), giantSpacing: 1 })))
})

Deno.test('a knob on the command line is reported as a pin, an everyday flag is not', () => {
  const { pins } = parseArgs(['--width=25', '--height=50', '--winding=0.4', '--pstraight=0.9', '--restarts=5'])
  assertEquals(pins, ['pStraight', 'restarts'])
})

Deno.test('retired spellings name their replacement, and unknown flags are refused', () => {
  const { errors } = parseArgs(['--width=25', '--height=50', '--stroke=0.4', '--advanced', '--board', '--nope=1'])
  assert(errors.some((e) => e.includes('--stroke') && e.includes('--line')), errors.join('; '))
  assert(errors.some((e) => e.includes('--advanced')), errors.join('; '))
  assert(errors.some((e) => e.includes('--board')), errors.join('; '))
  assert(errors.some((e) => e.includes('--nope')), errors.join('; '))
})

Deno.test('--help is short, --help=knobs lists every knob flag once', () => {
  const short = helpText()
  assert(!short.includes('--pstraight'), 'the short help does not list knobs')
  const knobs = helpText({ knobs: true })
  for (const s of PARAM_SPEC) {
    if (s.surface === 'start') continue
    assert(knobs.includes(`--${s.key.toLowerCase()}`), `${s.key} missing from --help=knobs`)
  }
  assert(knobs.includes('--start='), 'the merged control is listed')
  assert(!knobs.includes('--headbias'), 'a surface knob has no flag of its own')
})
```

- [ ] **Step 2: Run and see them fail**

Run: `deno test --allow-read packages/engine/command.test.ts`
Expected: FAIL — `parseArgs` has no `pins`, words are `NaN`, `--start` is unknown.

- [ ] **Step 3: Implement**

Rewrite the flag layer of `command.ts` around three tables:

```ts
/** A knob flag whose value may also be a word: the word and the number it stores. */
const WORDS: Partial<Record<ParamKey, Record<string, number>>> = {
  Lmax: { auto: 0 },
  maxBack: { auto: 0 },
  giantStep: { random: 0 },
  giantSpacing: { off: 1 },
}

/** `--start` is the one flag that writes two stored knobs. */
const START: Record<string, { headBias: number; mix: number }> = {
  layers: { headBias: -1, mix: -1 },
  random: { headBias: 0, mix: -1 },
  tunnels: { headBias: 1, mix: -1 },
}

/** Spellings that were dropped, and what to use instead; each is refused by name. */
const RETIRED: Record<string, string> = {
  advanced: 'the CLI has one mode now; drop --advanced',
  board: 'a board file is always written; drop --board',
  straight: 'use --winding=R (0 = straightest) or the knob --pstraight=R',
  stroke: 'use --line=R',
  lineweight: 'use --line=R',
  headwidth: 'use --arrow-width=R',
  arrowwidth: 'use --arrow-width=R',
  headheight: 'use --arrow-height=R',
  arrowheight: 'use --arrow-height=R',
  colorized: 'use --colored',
  w: 'use --width=N',
  h: 'use --height=N',
  lateral: 'use --wlateral=R',
  absorb: 'use --absorblimit=N',
  giantspacepen: 'the spacing strength is fixed now; use --giantspacing=off|2|3',
  headbias: 'use --start=layers|random|tunnels',
  mix: 'use --start=0.3..0.7 (or layers|random|tunnels to turn mixing off)',
}
```

`parseArgs` walks argv once. For each `--name[=value]`:
1. `RETIRED[name]` → `errors.push(`--${name} is gone: ${RETIRED[name]}`)`.
2. `name === 'start'` → look the value up in `START`, else parse it as a number in 0.3..0.7 and store `{ headBias: 0, mix: n }`; record `headBias` and `mix` in `pins`.
3. A `PARAM_SPEC` key (lower-cased, `surface !== 'start'`) → the value is a word from `WORDS[key]` or a finite number; store it and push the key to `pins`.
4. An everyday flag (`width`, `height`, `seed`, `length`, `winding`, `skeleton`, `randomized`) → write the `SimpleChoice` field; `winding` is the shape slider unchanged (0 = straightest), so **no inversion**.
5. A view flag (`cell`, `line`, `arrow-width` with the word `auto`, `arrow-height`, `colored`, `sharp`, `top`) → write the `View` field.
6. A mode flag (`svg`, `dry-run`, `count`, `max-seeds`, `help`, `-h`) → `rest`.
7. Anything else → `errors.push(`unknown flag --${name}; see --help`)`.

`width` and `height` remain required (`missing --width`). The parser builds `params` from the choice through `simpleParams(choice, choice.random ? rng : null, pins)` — but `parseArgs` stays pure, so it returns the `choice` and the `pins` and lets the caller (Task 4) draw. `params` in `ParsedArgs` is the **unrandomised** set: `simpleParams(choice, null, pinValues)`, which is what the lab and `--help` print.

`buildCommand` prints: `deno task carve --width --height --seed`, then each everyday field that differs from `defaultChoice()`, then every knob whose value differs from its default — through `WORDS` and `START`, so `Lmax: 0` prints `--lmax=auto` and `headBias/mix` print one `--start=…`. Then the view flags, hyphenated.

`helpText({ knobs })` prints the short usage block of the spec's §2 by default; with `knobs: true` the full table (flag, range with words, default, help), one row per `PARAM_SPEC` entry that is not `surface: 'start'`, plus one row for `--start`.

- [ ] **Step 4: Run**

Run: `deno task test && deno task check`
Expected: PASS for `command.test.ts`. `carve.ts`, `lab-page.ts`, `fingerprints.test.ts` and `node-smoke.mjs` still call the old functions and are fixed in Tasks 4, 6 and 7 — if `deno task check` fails only in those files, note it in your report and continue; every other failure is yours.

- [ ] **Step 5: Commit**

```bash
git add packages/engine/command.ts packages/engine/command.test.ts
git commit -m "One parser reads every flag, words stand in for the sentinel numbers, and a retired spelling is refused by name instead of ignored"
```

---

### Task 4: The CLI has one mode, and says what it pinned

**Files:**
- Modify: `packages/cli/carve.ts` (argument handling, the batch, the dry-run JSON)
- Modify: `packages/cli/store.ts` (`simpleCommand` leaves `SaveInput`)
- Modify: `packages/engine/types.ts` (`BoardMeta.simpleCommand` becomes optional-for-reading only)
- Test: `packages/cli/carve.test.ts`

**Interfaces:**
- Consumes: `ParsedArgs` and `helpText` from Task 3, `simpleParams(choice, rng, pins)` from Task 2.
- Produces: the `--dry-run` JSON gains `"pinned": string[]`; the note goes to stderr.

- [ ] **Step 1: Write the failing tests**

In `packages/cli/carve.test.ts` (it spawns the CLI; follow the existing helper):

```ts
Deno.test('a pinned knob holds while its bundle partners still vary', async () => {
  const runs = await Promise.all([7, 8].map((seed) =>
    runCarve(['--width=40', '--height=40', `--seed=${seed}`, '--winding=0.4', '--randomized', '--pstraight=0.93', '--dry-run'])
  ))
  const json = runs.map((r) => JSON.parse(r.stdout))
  for (const j of json) {
    assertEquals(j.params.pStraight, 0.93)
    assertEquals(j.pinned, ['pStraight'])
  }
  assert(json[0].params.wLateral !== json[1].params.wLateral || json[0].params.warns !== json[1].params.warns)
  assert(runs[0].stderr.includes('--pstraight=0.93 is pinned'), runs[0].stderr)
})

Deno.test('the note never lands on stdout, so --dry-run stays machine-readable', async () => {
  const r = await runCarve(['--width=20', '--height=20', '--winding=0.4', '--pstraight=0.9', '--dry-run'])
  JSON.parse(r.stdout) // throws if the note leaked
  assertEquals(r.code, 0)
})

Deno.test('a retired flag is refused with its replacement, exit code 2', async () => {
  const r = await runCarve(['--advanced', '--w=10', '--h=10', '--dry-run'])
  assertEquals(r.code, 2)
  const json = JSON.parse(r.stdout)
  assertEquals(json.ok, false)
  assert(json.errors.join(' ').includes('--advanced'), r.stdout)
})
```

- [ ] **Step 2: Run and see them fail**

Run: `deno test --allow-read --allow-write --allow-env --allow-run --allow-net packages/cli/carve.test.ts`
Expected: FAIL — `--advanced` still works, there is no `pinned` field, no note.

- [ ] **Step 3: Implement**

`carve.ts` loses the `advanced`/`simple` fork: one `parseArgs(Deno.args)` call, `errors` refused through the existing `refuseErrors`, then

```ts
const parsed = parseArgs(Deno.args)
if (parsed.errors.length) refuseErrors('invalid arguments', parsed.errors)
const pinValues = Object.fromEntries(parsed.pins.map((k) => [k, parsed.params[k]]))
const params = simpleParams(parsed.choice, parsed.choice.random ? Math.random : null, pinValues)
```

`forSeed(seed)` does the same with `{ ...parsed.choice, seed }`, so a batch redraws per seed and keeps the pins. Before the first board, print the note once:

```ts
// One line per pinned knob, on stderr: --dry-run owns stdout.
for (const key of parsed.pins) {
  const partners = bundlePartners(key).filter((k) => !parsed.pins.includes(k))
  const tail = partners.length ? `; ${bundleFlagOf(key)} still sets ${partners.join(', ')}` : ''
  console.error(`note: --${key.toLowerCase()}=${parsed.params[key]} is pinned${tail}`)
}
```

`bundlePartners` and `bundleFlagOf` come from a small table exported by `lab-simple.ts` (`BUNDLES: Record<'length' | 'winding' | 'skeleton' | 'difficulty', readonly ParamKey[]>`) — add it there, built from the same anchor objects the ranges use, so it cannot drift.

The dry-run JSON gains `pinned: parsed.pins` next to `params`. `simpleCommand` disappears: `SaveInput` drops the field, `saveBoard` stops writing it, `BoardMeta` keeps it as an optional read for older files. `writesBoards` is simply `!dryRun`.

- [ ] **Step 4: Run**

Run: `deno task test && deno task check`
Expected: PASS except `lab-page.ts` and the golden runners (Tasks 6 and 7).

- [ ] **Step 5: Commit**

```bash
git add packages/cli/carve.ts packages/cli/carve.test.ts packages/cli/store.ts packages/engine/types.ts
git commit -m "The CLI has one mode, pins the knobs it was given while the rest of a bundle keeps varying, and says so on stderr"
```

---

### Task 5: The report moves out of the board maker

**Files:**
- Create: `packages/cli/report.ts` (the levels, the benchmark and the metrics report)
- Modify: `packages/cli/carve.ts` (delete everything below the single-board section)
- Modify: `packages/cli/deno.json`, root `deno.json` (a `report` task)
- Test: `packages/cli/carve.test.ts` (move the report cases into `packages/cli/report.test.ts`)

- [ ] **Step 1: Move, do not rewrite**

`report.ts` starts with the block that `carve.ts` ends with today — from `// --- levels for the report and benchmark modes ---` to the end of the file — plus its own small argument reader (`--runs`, `--bench`, `--only`, `--mid`, `--square`, `--portrait`, `--show`, `--width`/`--height`/knobs through `parseArgs` for the shared knobs). It imports `Carver`, `mulberry32`, `render` and `analyse` from `'../engine/engine.ts'` (they are no longer public in `mod.ts`).

Tasks in `packages/cli/deno.json`:

```json
    "report": "deno run --allow-read --allow-write --allow-env=ARROWZ_BOARDS_DIR,CARVE_TIMEOUT_S,CARVE_TRACE,GIANT_DEBUG report.ts",
```

and in the root `deno.json`: `"report": "deno task --cwd=packages/cli report"`.

- [ ] **Step 2: Verify the move changed no numbers**

The old report lives in earlier commits, not in the working tree, so compare against a checkout of the branch point:

```bash
BASE=$(git merge-base main HEAD)
git worktree add /tmp/report-base "$BASE"
(cd /tmp/report-base && deno task carve --advanced --only=easy·sq --runs=1 > /tmp/report-old.txt)
deno task report --only=easy·sq --runs=1 > /tmp/report-new.txt
diff /tmp/report-old.txt /tmp/report-new.txt
git worktree remove /tmp/report-base
```

Expected: the only differences are the header lines naming the command. The numbers come from fixed seeds (1000 + run), so every measured line must match exactly. Record the diff in your report.

- [ ] **Step 3: Run and commit**

```bash
deno task test && deno task check && deno task lint && deno task fmt
git add packages/cli deno.json
git commit -m "The metrics report and the benchmark live in their own task, so the board maker's help is about making boards"
```

---

### Task 6: The lab speaks the CLI's language

**Files:**
- Modify: `packages/cli/lab-page.ts` (the panel rows, the command box, the URL hash reader)
- Modify: `packages/engine/lab-i18n.ts` (the `start` and `giantspacing` texts, EN and PL)
- Modify: `packages/engine/types.ts` (`ParamSpec.control`)
- Modify: `packages/engine/engine.ts` (`control` on the two entries)
- Test: `packages/engine/lab-i18n.test.ts`

- [ ] **Step 1: The control kind**

```ts
/** How the lab draws a knob: a number with a slider, or a fixed set of choices. */
export type ParamControl = { kind: 'number' } | { kind: 'choice'; choices: readonly { value: number; word: string }[] }
```

`ParamSpec` gains `control?: ParamControl` (absent = number). `giantSpacing` gets
`{ kind: 'choice', choices: [{ value: 1, word: 'off' }, { value: 2, word: '2' }, { value: 3, word: '3' }] }`.
The `--start` control is not a `PARAM_SPEC` row: the panel builds it from the two `surface: 'start'` entries, as a `<select>` with `layers | random | tunnels | mixing`, plus the existing number row for `mix` shown only under `mixing`.

- [ ] **Step 2: The panel**

In the row loop, a spec with `surface: 'start'` is skipped; after the loop the `shape` group gets one hand-built start row. A spec with a `choice` control gets a `<select>` instead of the number+range pair, and `paramRows` records it as `{ kind: 'choice', select }` so `setParam` and the inactive pass branch once.

Where a knob has a word for a value, the number row shows that word next to the field. The words live in `WORDS` inside `command.ts` (Task 3); export a reader for them from that file in this task — the table itself stays private:

```ts
/** The word a knob's value is spelled with, or null when it has none: `wordFor('Lmax', 0)` is 'auto'. */
export function wordFor(key: ParamKey, value: number): string | null {
  const words = WORDS[key]
  if (!words) return null
  for (const [word, v] of Object.entries(words)) if (v === value) return word
  return null
}
```

- [ ] **Step 3: The command box**

It already calls `buildCommand`, which prints the new spelling after Task 3; delete the `buildSimpleCommand` branch and the simple/advanced switch in the box, so one command is shown.

- [ ] **Step 4: Dictionaries**

EN (in `PARAM_SPEC`-adjacent tables) and PL get `start` (label "piece start" / "start elementów", help naming the four choices) and the `giantspacing` words. `lab-i18n.test.ts` keeps asserting that every `PARAM_SPEC` key has a PL label and help — add the assertion that every `choice` control has a PL word per choice.

- [ ] **Step 5: Verify in the browser**

```bash
deno task bundle && sh packages/cli/lab.sh
```

Generate a board, switch the start control through its four values, set `--giantspacing=off`, copy the command and run it in a terminal: the board id printed by the CLI must match the one in the lab's status line. Kill the server afterwards. Record both ids in your report.

- [ ] **Step 6: Commit**

```bash
git add packages/cli/lab-page.ts packages/engine
git commit -m "The lab shows one control for the piece start, spells the words the CLI accepts, and its command box prints a command that runs"
```

---

### Task 7: The golden runners and the doc images learn the new dialect

**Files:**
- Modify: `packages/engine/fingerprints.json` (the `argv` of four cases)
- Modify: `packages/engine/fingerprints.test.ts`, `packages/engine/scripts/node-smoke.mjs`
- Modify: `packages/cli/scripts/record-doc-images.ts`, `docs/images/manifest.json`

- [ ] **Step 1: Rewrite the golden argv**

| case | today | after |
|---|---|---|
| `defaults` | `["--advanced", "--dry-run"]` | `["--width=25", "--height=50", "--dry-run"]` |
| `simple` | `["--width=25", "--height=50", "--dry-run"]` | unchanged |
| `skeleton` | `["--advanced", "--dry-run", "--w=100", "--h=200", "--giants=4"]` | `["--width=100", "--height=200", "--giants=4", "--dry-run"]` |
| `tunnels` | `["--advanced", "--dry-run", "--w=100", "--h=200", "--headbias=1"]` | `["--width=100", "--height=200", "--start=tunnels", "--dry-run"]` |
| `layers` | `["--advanced", "--dry-run", "--w=100", "--h=100", "--mix=0.5"]` | `["--width=100", "--height=100", "--start=0.5", "--dry-run"]` |
| `corner` | `["--width=200", "--height=200", "--length=0", "--straight=0", "--dry-run"]` | `["--width=200", "--height=200", "--length=0", "--winding=1", "--dry-run"]` |
| `longstraight` | `["--width=200", "--height=200", "--length=1", "--straight=1", "--skeleton", "--dry-run"]` | `["--width=200", "--height=200", "--length=1", "--winding=0", "--skeleton", "--dry-run"]` |
| `big500` | `["--advanced", "--dry-run", "--w=500", "--h=500"]` | `["--width=500", "--height=500", "--dry-run"]` |

**Every `fingerprint`, `pieces` and `maxLen` value stays exactly as it is.** If one moves, the mapping is wrong — do not re-record.

- [ ] **Step 2: One parser in both runners**

```ts
function paramsOf(c: GoldenCase): Params {
  if (c.argv === null) return { ...defaultParams(), W: 40, H: 40, seed: 1 }
  const parsed = parseArgs(c.argv.filter((a) => a !== '--dry-run'))
  if (parsed.errors.length) throw new Error(`${c.name}: ${parsed.errors.join('; ')}`)
  return parsed.params
}
```

and the call becomes `generate(paramsOf(c), c.argv === null ? { unchecked: true, voidFrac: 0.1 } : {})`. Mirror the same two changes in `node-smoke.mjs` (it imports from `../dist/`).

- [ ] **Step 3: The doc images**

`record-doc-images.ts` drops the `--advanced` it prepends and the `--w=`/`--h=` spellings in `docs/images/manifest.json` become `--width=`/`--height=`. Then:

```bash
deno task docs
git diff --stat docs/images
```

Expected: the 26 reproducible images come back byte-identical (the four hand-made ones are skipped, as the script prints). A changed PNG means a changed command, not a changed renderer — fix the command.

- [ ] **Step 4: Run and commit**

```bash
deno task test && pnpm nx build engine && pnpm --filter @arrowz/engine run smoke
git add packages/engine packages/cli/scripts docs/images
git commit -m "The golden boards, the Node smoke test and the doc images are recorded with the flags the CLI now takes, and every fingerprint stands"
```

---

### Task 8: Both READMEs describe one mode

**Files:**
- Modify: `README.md` (the settings chapters, roughly lines 408-870, and the example file names)
- Modify: `README.pl.md` (the matching chapters)

- [ ] **Step 1: Rewrite**

The everyday chapter keeps its shape but loses `--straight` in favour of `--winding` (0 = straightest), and `--randomized` keeps its name. "The full set of settings" becomes one table of 25 knob flags with their ranges (words included), no `--advanced` anywhere. A new short section, "When a knob meets an everyday flag", explains in plain language: an everyday flag sets a group of knobs; naming a knob yourself pins that one and leaves the rest of the group alone; with `--randomized` the rest keeps being drawn; the CLI prints one line saying so; and the measured promise that "every everyday combination closes" covers whole groups, not half-overridden ones. The refused-combinations table loses the mixing row. Example file names (`seed7-…`) are regenerated with `deno task carve --width=25 --height=50 --dry-run` and pasted from its output.

- [ ] **Step 2: Check every command in the docs runs**

```bash
grep -ho 'deno task carve[^`]*' README.md | sort -u | while read -r cmd; do
  eval "ARROWZ_BOARDS_DIR=$(mktemp -d) $cmd --dry-run" > /dev/null 2>&1 || echo "FAILS: $cmd"
done
```

Expected: no `FAILS` lines. Do the same for `README.pl.md`.

- [ ] **Step 3: Commit**

```bash
git add README.md README.pl.md
git commit -m "The READMEs describe one mode, the words the flags take, and what pinning a knob costs"
```

---

## After the tasks

1. Whole-branch review, with the spec's §1-§10 traced to changes and tests.
2. `deno task verify` and `pnpm nx run-many -t verify`, plus `git diff main --stat -- packages/engine/fingerprints.json` showing only `argv` lines changed.
3. A live Chrome pass over the lab: generate, the start control, the library, the command box copied into a terminal.
4. Rebase onto `main` once PR #42 merges, then open the PR.
