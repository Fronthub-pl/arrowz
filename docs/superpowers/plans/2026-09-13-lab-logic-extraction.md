# Lab logic extraction (PR 1) Implementation Plan

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:subagent-driven-development (recommended) or superpowers:executing-plans to implement this plan task-by-task. Steps use checkbox (`- [ ]`) syntax for tracking.

**Goal:** Move ten pure fragments out of `packages/cli/lab-page.ts` into `@arrowz/engine` and `@arrowz/board-element`, give each one the unit test it never had, and extract the shared "finite number" predicate without weakening the board server's refusals.

**Architecture:** Every fragment lands in a module that is already exported, so only one new module (`packages/engine/lab-report.ts`) needs export plumbing. The old lab switches to each moved function in the same task, so `deno task verify` stays green task by task and the whole PR is a behaviour-preserving move. Nothing in the new React application is created here.

**Tech Stack:** Deno 2.9 workspace, TypeScript strict with `noUncheckedIndexedAccess` and `exactOptionalPropertyTypes`, `@std/assert` for engine tests, Vitest 5 for `board-element`, Nx for task orchestration.

**Spec:** `docs/superpowers/specs/2026-09-13-lab-react-app-design.md` (§4.1, §4.2, §4.3)

## Global Constraints

- Everything in the repository is in English: code, identifiers, comments, tests, commit messages. Conversation with the user is Polish; nothing Polish goes into files except translation dictionaries.
- No `any`, no non-null assertions. A type fix must never add a value-changing fallback in the engine.
- The engine (`packages/engine/engine.ts`) knows neither Deno nor the DOM, and neither do `command.ts`, `lab-simple.ts`, `lab-presets.ts`, `lab-i18n.ts`. `neutral.test.ts` greps for violations. The DOM lib is referenced only in `packages/cli/lab-page.ts`.
- Never spread arrays proportional to the number of cells or pieces (`Math.min(...arr)`) — it overflows the worker stack in Chrome.
- `deno task test` must pass after every change; `deno task verify` (check, lint, fmt, test, bundle) before the PR. The whole repository is verified with `pnpm nx run-many -t verify`.
- `deno fmt` settings: no semicolons, single quotes, line width 120.
- No attribution lines in commit messages or pull request descriptions.
- `packages/engine/dist/` is gitignored and produced by `pnpm nx build engine`.
- Branch off `main`; `main` is only ever updated through a pull request.

## Where each fragment lands, and why there

| Fragment | Destination | Why not elsewhere |
|---|---|---|
| `isFiniteNumber`, `readParams` | `engine.ts` → `mod.ts` | `PARAM_SPEC` lives there; no new export needed |
| `clampParam` | `engine.ts` → `mod.ts` | `snapToStep` is its neighbour |
| `longestSummary` | `engine.ts` → `mod.ts` | beside `analyse`; `LongestSummary` is already in `types.ts` |
| `viewNumberOf` | `command.ts` | `VIEW_RANGE` and `DEFAULT_VIEW` live there |
| `START_CHOICES`, `isStartChoice`, `MIX_START`, `startChoiceOf` | `command.ts` | `START` lives there and its comment already says the lab builds its control from that table |
| `storeRequest` + its type | `command.ts` + `types.ts` | `buildCommand` and `boardId` are its neighbours; `packages/cli/store.ts` cannot be imported by the engine |
| `dictionary(lang)` incl. `violation`, `fmt`, `short` | `lab-i18n.ts` | the dictionaries are there; the helpers are pure given `lang` |
| `recipeOf` | `lab-simple.ts` | beside `normalizeChoice`, which it wraps |
| report rows, `genSeconds` | **new** `lab-report.ts` | too large for `engine.ts`; needs a sixth subpath export |
| `boardView` | `packages/board-element/src/view.ts` | `BoardView` is that file's type; the engine importing it would invert the dependency |

---

### Task 1: The shared predicate and the tolerant parameter reader

The page drops a non-number and shows a default; the server refuses the POST. Only the predicate is shared — §4.2 of the spec explains why the reactions must stay apart.

**Files:**
- Modify: `packages/engine/engine.ts` (add near `validateParams`, around `:2818`)
- Modify: `packages/engine/mod.ts:8-25` (export list)
- Modify: `packages/cli/lab-page.ts:123-150` (delete `isRecord`, `readParams`; import instead)
- Modify: `packages/cli/lab-server.ts:78-79` (use the shared predicate, keep the refusal)
- Test: `packages/engine/engine.test.ts` (append)

**Interfaces:**
- Consumes: `PARAM_SPEC`, `ParamKey` from `engine.ts`
- Produces: `isFiniteNumber(v: unknown): v is number`; `readParams(raw: unknown): Partial<Record<ParamKey, number>>`

- [ ] **Step 1: Write the failing tests**

Append to `packages/engine/engine.test.ts`:

```ts
Deno.test('isFiniteNumber accepts only finite numbers', () => {
  assert(isFiniteNumber(0))
  assert(isFiniteNumber(-1.5))
  assertFalse(isFiniteNumber(Number.NaN))
  assertFalse(isFiniteNumber(Number.POSITIVE_INFINITY))
  assertFalse(isFiniteNumber('1'))
  assertFalse(isFiniteNumber(null))
  assertFalse(isFiniteNumber(undefined))
})

Deno.test('readParams keeps finite numbers under known keys and drops everything else', () => {
  const got = readParams({ W: 40, H: '50', seed: Number.NaN, nonsense: 7, pStraight: 0.8 })
  assertEquals(got, { W: 40, pStraight: 0.8 })
})

Deno.test('readParams on a non-object is empty, not a throw', () => {
  assertEquals(readParams(null), {})
  assertEquals(readParams('{}'), {})
  assertEquals(readParams([1, 2]), {})
})

Deno.test('readParams does not check the envelope: that is the caller decision', () => {
  // W below its minimum survives the read; validateParams is what refuses it.
  const spec = PARAM_SPEC.find((s) => s.key === 'W')
  assert(spec)
  const got = readParams({ W: spec.min - 1 })
  assertEquals(got.W, spec.min - 1)
  assert(validateParams({ ...defaultParams(), W: spec.min - 1 }).length > 0)
})
```

Add `assertFalse` to the file's existing `@std/assert` import if it is not there.

- [ ] **Step 2: Run the tests to verify they fail**

Run: `deno test packages/engine/engine.test.ts --filter 'readParams'`
Expected: FAIL — `readParams is not defined`.

- [ ] **Step 3: Implement in the engine**

In `packages/engine/engine.ts`, beside `validateParams`:

```ts
/**
 * A value that can be used as a knob: a number, and not NaN or an infinity.
 * The board server and the lab both need this test and must not disagree on
 * it; what they do with a failure is deliberately different — the page shows
 * a default, the server refuses the request.
 */
export function isFiniteNumber(v: unknown): v is number {
  return typeof v === 'number' && Number.isFinite(v)
}

/**
 * The knob values of an object loaded from outside — storage, a URL, a board
 * file: finite numbers under PARAM_SPEC keys only. Tolerant on purpose. It
 * does not check the envelope, so a caller that persists the result must run
 * validateParams itself.
 */
export function readParams(raw: unknown): Partial<Record<ParamKey, number>> {
  const out: Partial<Record<ParamKey, number>> = {}
  if (typeof raw !== 'object' || raw === null || Array.isArray(raw)) return out
  const rec = raw as Record<string, unknown>
  for (const spec of PARAM_SPEC) {
    const v = rec[spec.key]
    if (isFiniteNumber(v)) out[spec.key] = v
  }
  return out
}
```

Add both names to the alphabetical export block in `packages/engine/mod.ts`.

- [ ] **Step 4: Run the tests to verify they pass**

Run: `deno test packages/engine/engine.test.ts --filter 'readParams'` then `deno test packages/engine/engine.test.ts --filter 'isFiniteNumber'`
Expected: PASS.

- [ ] **Step 5: Switch the page over**

In `packages/cli/lab-page.ts`, delete `isRecord` (`:124-127`) and `readParams` (`:142-150`), add `readParams` to the `@arrowz/engine` import list, and replace `isRecord` at its remaining call sites with the engine's reader where it was guarding a params read. `stringAt` stays: it takes an already-narrowed record, so give it the narrowing inline:

```ts
function stringAt(rec: unknown, key: string): string | undefined {
  if (typeof rec !== 'object' || rec === null) return undefined
  const v = (rec as Record<string, unknown>)[key]
  return typeof v === 'string' ? v : undefined
}
```

- [ ] **Step 6: Switch the server's predicate, not its reaction**

In `packages/cli/lab-server.ts`, replace the local `isNum` (`:79`) with the engine's:

```ts
import { ..., isFiniteNumber, ... } from '@arrowz/engine'
```

and use `isFiniteNumber` where `isNum` was called. **Do not touch `checkParams` or `checkView` otherwise** — every refusal stays. `isRec` stays local: it also rejects arrays and is used for shapes the engine knows nothing about.

- [ ] **Step 7: Prove the server still refuses what it refused**

Run: `deno test --allow-read --allow-write --allow-env --allow-net packages/cli/lab-server.test.ts`
Expected: PASS, including the cases asserting 400 for a string seed and a fractional seed.

- [ ] **Step 8: Commit**

```bash
git add packages/engine/engine.ts packages/engine/mod.ts packages/engine/engine.test.ts packages/cli/lab-page.ts packages/cli/lab-server.ts
git commit -m "Share the finite-number test, keep the two reactions apart

The page and the board server both ask whether a value can be a knob.
The page answers by showing a default, the server by refusing the
request, because the seed goes into a file name. Sharing the predicate
is safe; sharing the reaction would let a fractional seed name a file."
```

---

### Task 2: `clampParam` in the engine

The comment on this function already says "pure, so it can be tested without the page" — and it has no test.

**Files:**
- Modify: `packages/engine/engine.ts` (beside `snapToStep`, around `:2881`)
- Modify: `packages/engine/mod.ts` (export list)
- Modify: `packages/cli/lab-page.ts:776-782` (delete, import instead)
- Test: `packages/engine/engine.test.ts` (append)

**Interfaces:**
- Consumes: `snapToStep`, `ParamSpec`
- Produces: `clampParam(spec: ParamSpec, value: number): { value: number; clamped: boolean }`

- [ ] **Step 1: Write the failing tests**

```ts
Deno.test('clampParam clamps into the range and reports it', () => {
  const spec = PARAM_SPEC.find((s) => s.key === 'pStraight')
  assert(spec)
  assertEquals(clampParam(spec, spec.max + 1), { value: spec.max, clamped: true })
  assertEquals(clampParam(spec, spec.min - 1), { value: spec.min, clamped: true })
})

Deno.test('clampParam snaps to the step, so the panel can never be left red', () => {
  const spec = PARAM_SPEC.find((s) => s.step > 0 && s.max > s.min + s.step)
  assert(spec)
  const between = spec.min + spec.step / 2
  const got = clampParam(spec, between)
  assertEquals(got.value, snapToStep(between, spec.step, spec.min))
  assert(got.clamped)
  assertEquals(validateParams({ ...defaultParams(), [spec.key]: got.value }).filter((v) => v.kind === 'step'), [])
})

Deno.test('clampParam falls back to the default for a non-finite value', () => {
  const spec = PARAM_SPEC.find((s) => s.key === 'seed')
  assert(spec)
  assertEquals(clampParam(spec, Number.NaN), { value: spec.def, clamped: true })
})

Deno.test('clampParam leaves a legal value alone and says so', () => {
  const spec = PARAM_SPEC.find((s) => s.key === 'W')
  assert(spec)
  assertEquals(clampParam(spec, spec.def), { value: spec.def, clamped: false })
})
```

- [ ] **Step 2: Run to verify they fail**

Run: `deno test packages/engine/engine.test.ts --filter 'clampParam'`
Expected: FAIL — `clampParam is not defined`.

- [ ] **Step 3: Move the function verbatim**

Cut `clampParam` from `packages/cli/lab-page.ts:776-782` — comment included — into `packages/engine/engine.ts` beside `snapToStep`, add `export`, and add it to `mod.ts`. Extend the doc comment with one sentence:

```ts
/**
 * ... (the existing comment) ...
 * This is the range and the step of one knob only. A cross-knob rule — a
 * straightness floor that depends on the board's size — is never clamped:
 * the surface shows it and the run refuses, so no value moves unrecorded.
 */
```

- [ ] **Step 4: Run to verify they pass**

Run: `deno test packages/engine/engine.test.ts --filter 'clampParam'`
Expected: PASS.

- [ ] **Step 5: Switch the page over and verify nothing moved**

Add `clampParam` to the page's `@arrowz/engine` import. Then:

Run: `deno task check && deno task test`
Expected: PASS, including `fingerprints.test.ts`.

- [ ] **Step 6: Commit**

```bash
git add packages/engine/engine.ts packages/engine/mod.ts packages/engine/engine.test.ts packages/cli/lab-page.ts
git commit -m "Move clampParam into the engine, with the tests it never had

Its own comment said it was pure so it could be tested without the page.
It is now, and the comment records what it deliberately does not clamp:
a cross-knob rule is shown and refused, never moved silently."
```

---

### Task 3: `viewNumberOf` in the CLI vocabulary

The page read the input inside the function, which is why it could not be tested. The DOM read stays in the page; the rule moves.

**Files:**
- Modify: `packages/engine/command.ts` (beside `VIEW_RANGE`, around `:566`)
- Modify: `packages/cli/lab-page.ts:837-844`
- Test: `packages/engine/command.test.ts` (append)

**Interfaces:**
- Consumes: `VIEW_RANGE`, `DEFAULT_VIEW`, `ViewNumber`
- Produces: `viewNumberOf(raw: string, field: ViewNumber): number`

- [ ] **Step 1: Write the failing tests**

```ts
Deno.test('viewNumberOf falls back to the default for an empty or unreadable field', () => {
  assertEquals(viewNumberOf('', 'stroke'), DEFAULT_VIEW.stroke)
  assertEquals(viewNumberOf('   ', 'stroke'), DEFAULT_VIEW.stroke)
  assertEquals(viewNumberOf('wide', 'stroke'), DEFAULT_VIEW.stroke)
})

Deno.test('viewNumberOf clamps into VIEW_RANGE', () => {
  const r = VIEW_RANGE.stroke
  assertEquals(viewNumberOf(String(r.max + 1), 'stroke'), r.max)
  assertEquals(viewNumberOf(String(r.min - 1), 'stroke'), r.min)
})

Deno.test('viewNumberOf rounds the whole-number fields only', () => {
  const whole = (Object.keys(VIEW_RANGE) as ViewNumber[]).find((f) => VIEW_RANGE[f].whole)
  const frac = (Object.keys(VIEW_RANGE) as ViewNumber[]).find((f) => !VIEW_RANGE[f].whole)
  assert(whole && frac)
  const w = VIEW_RANGE[whole]
  const mid = Math.min(w.max, w.min + 1) + 0.4
  assertEquals(viewNumberOf(String(mid), whole), Math.round(mid))
  const f = VIEW_RANGE[frac]
  const midF = (f.min + f.max) / 2
  assertEquals(viewNumberOf(String(midF), frac), midF)
})
```

- [ ] **Step 2: Run to verify they fail**

Run: `deno test packages/engine/command.test.ts --filter 'viewNumberOf'`
Expected: FAIL — `viewNumberOf is not defined`.

- [ ] **Step 3: Implement**

In `packages/engine/command.ts`, beside `VIEW_RANGE`:

```ts
/**
 * A view number as a surface should read it: an empty or unreadable field is
 * the default, anything outside the table is clamped into it, and the whole
 * fields round. Tolerant, because a person is typing — the board server reads
 * the same fields strictly, and refuses instead of clamping.
 */
export function viewNumberOf(raw: string, field: ViewNumber): number {
  const text = raw.trim()
  const n = Number(text)
  if (text === '' || !Number.isFinite(n)) return DEFAULT_VIEW[field]
  const r = VIEW_RANGE[field]
  const v = Math.min(r.max, Math.max(r.min, n))
  return r.whole ? Math.round(v) : v
}
```

- [ ] **Step 4: Run to verify they pass**

Run: `deno test packages/engine/command.test.ts --filter 'viewNumberOf'`
Expected: PASS.

- [ ] **Step 5: Switch the page over**

Replace `viewNumber` in `packages/cli/lab-page.ts:837-844` with a two-line wrapper that keeps the DOM read where the DOM lives:

```ts
function viewNumber(id: string, field: ViewNumber): number {
  return viewNumberOf(el<HTMLInputElement>(id).value, field)
}
```

Add `viewNumberOf` to the `@arrowz/engine/command` import.

Run: `deno task check && deno task test`
Expected: PASS.

- [ ] **Step 6: Commit**

```bash
git add packages/engine/command.ts packages/engine/command.test.ts packages/cli/lab-page.ts
git commit -m "Move the view-number rule beside the table that bounds it

The page read the input inside the function, so the rule could not be
tested. The DOM read stays in the page; the rule now sits next to
VIEW_RANGE and says in its comment why it clamps where the server
refuses."
```

---

### Task 4: The start vocabulary belongs to the CLI, not to the dictionary

Today the four choices come from `EN.start.options`, so the dictionary defines the vocabulary and `command.ts` translates it — backwards. `START.words` has three entries and `mixing` is the fourth state, held by `mix >= 0`.

**Files:**
- Modify: `packages/engine/command.ts:64-74` (beside `START`)
- Modify: `packages/engine/lab-i18n.ts` (type the `start.options` keys against `command.ts`)
- Modify: `packages/cli/lab-page.ts:330-333`, `:379-385`
- Test: `packages/engine/command.test.ts` (append)

**Interfaces:**
- Consumes: `START`, `Params`
- Produces: `START_CHOICES: readonly StartChoice[]` (order: `layers`, `random`, `tunnels`, `mixing`); `type StartChoice = keyof typeof START.words | 'mixing'`; `isStartChoice(v: string): v is StartChoice`; `MIX_START: number`; `startChoiceOf(params: Params): StartChoice`

- [ ] **Step 1: Write the failing tests**

```ts
Deno.test('START_CHOICES is the CLI vocabulary plus mixing, in surface order', () => {
  assertEquals([...START_CHOICES], ['layers', 'random', 'tunnels', 'mixing'])
  for (const word of Object.keys(START.words)) assert(START_CHOICES.includes(word as StartChoice))
})

Deno.test('startChoiceOf reads mixing off the share, and the rest off headBias', () => {
  const base = defaultParams()
  assertEquals(startChoiceOf({ ...base, mix: START.mix.min }), 'mixing')
  assertEquals(startChoiceOf({ ...base, mix: 0 }), 'mixing')
  for (const [word, pair] of Object.entries(START.words)) {
    assertEquals(startChoiceOf({ ...base, mix: -1, headBias: pair.headBias }), word)
  }
})

Deno.test('startChoiceOf falls back to random for a headBias no word names', () => {
  const base = defaultParams()
  assertEquals(startChoiceOf({ ...base, mix: -1, headBias: 0.37 }), 'random')
})

Deno.test('MIX_START is the middle of the share range', () => {
  assertEquals(MIX_START, (START.mix.min + START.mix.max) / 2)
})

Deno.test('every start choice has a label in both dictionaries', async () => {
  const { EN, PL } = await import('./lab-i18n.ts')
  for (const choice of START_CHOICES) {
    assert(EN.start.options[choice], `EN is missing ${choice}`)
    assert(PL.start.options[choice], `PL is missing ${choice}`)
  }
})
```

- [ ] **Step 2: Run to verify they fail**

Run: `deno test packages/engine/command.test.ts --filter 'start'`
Expected: FAIL — `START_CHOICES is not defined`.

- [ ] **Step 3: Implement in `command.ts`**

```ts
/**
 * How a surface names the start: the three words of START.words, plus mixing,
 * which is not a word but a share (mix >= 0). The vocabulary belongs here
 * beside the table; the dictionaries translate these keys rather than define
 * them.
 */
export type StartChoice = keyof typeof START.words | 'mixing'
export const START_CHOICES: readonly StartChoice[] = [
  ...(Object.keys(START.words) as (keyof typeof START.words)[]),
  'mixing',
]
export function isStartChoice(v: string): v is StartChoice {
  return (START_CHOICES as readonly string[]).includes(v)
}
/** The share mixing starts from when the stored value is no share at all: the middle of the range. */
export const MIX_START: number = (START.mix.min + START.mix.max) / 2
/** Which choice a stored pair stands for: a share is mixing, mixing off is what headBias says. */
export function startChoiceOf(params: Params): StartChoice {
  if (params.mix >= 0) return 'mixing'
  for (const [word, pair] of Object.entries(START.words)) {
    if (pair.headBias === params.headBias && isStartChoice(word)) return word
  }
  return 'random'
}
```

`START` is declared with a widened `Readonly<Record<string, …>>` type, so `keyof typeof START.words` is `string`. Narrow the declaration to keep the union useful — change `words: Readonly<Record<string, …>>` to name its three keys:

```ts
export const START: Readonly<{
  words: Readonly<Record<'layers' | 'random' | 'tunnels', Readonly<{ headBias: number; mix: number }>>>
  mix: Readonly<{ min: number; max: number }>
}> = { /* unchanged body */ }
```

- [ ] **Step 4: Type the dictionary against the vocabulary**

In `packages/engine/lab-i18n.ts`, type the `start.options` field of `Dictionary` as `Readonly<Record<StartChoice, string>>`, importing `StartChoice` as a type from `./command.ts`. A missing translation then fails `deno check`, not a test.

- [ ] **Step 5: Run to verify they pass**

Run: `deno test packages/engine/command.test.ts --filter 'start'` and `deno check packages/engine/*.ts`
Expected: PASS.

- [ ] **Step 6: Switch the page over**

In `packages/cli/lab-page.ts`, delete `type StartChoice` (`:330`), `START_CHOICES` (`:331`), `MIX_START` (`:333`), `isStartChoice` (`:334-336`) and `startChoiceOfState` (`:379-385`); import the four names from `@arrowz/engine/command` and call `startChoiceOf(state)` at the one call site. `setStart` stays in the page — it writes rows and refreshes the panel, so it is not pure and becomes a store action in the React application.

Run: `deno task check && deno task test`
Expected: PASS.

- [ ] **Step 7: Commit**

```bash
git add packages/engine/command.ts packages/engine/command.test.ts packages/engine/lab-i18n.ts packages/cli/lab-page.ts
git commit -m "Let the CLI own the start vocabulary the dictionaries translate

The four start choices came from EN.start.options, so the dictionary
defined the vocabulary and the table translated it. START.words now
names its three keys, mixing is the fourth state, and a dictionary
missing a translation fails the type check instead of a test."
```

---

### Task 5: One dictionary factory, so the language is a parameter

`t`, `paramText`, `choiceText`, `reasonText` and `fmt` are pure given `lang`, but each reads a module-level `let lang`, so none can be tested and `violationText` cannot move without them.

**Files:**
- Modify: `packages/engine/lab-i18n.ts` (add the factory at the end)
- Modify: `packages/cli/lab-page.ts:155-189`, `:444-456`, `:909`
- Test: `packages/engine/lab-i18n.test.ts` (append)

**Interfaces:**
- Consumes: `EN`, `PL`, `Dictionary`, `UiKey`, `UiArgs`, `PARAM_SPEC`, `ParamSpec`, `INACTIVE_REASONS`, `RULE_REASONS`, `stepsAround`, `Violation`, `InactiveKey`, `RuleKey`
- Produces:

```ts
export type Lang = 'en' | 'pl'
export interface Dict {
  readonly lang: Lang
  t<K extends UiKey>(key: K, ...args: UiArgs<K>): string
  paramText(spec: ParamSpec): { label: string; help: string }
  choiceText(key: ParamKey, word: string): string
  reason(key: InactiveKey | RuleKey): string
  fmt(n: number): string
  short(n: number): string
  violation(v: Violation): string
}
export function dictionary(lang: Lang): Dict
```

- [ ] **Step 1: Write the failing tests**

```ts
Deno.test('dictionary falls back to English for a key Polish lacks', () => {
  const pl = dictionary('pl')
  assertEquals(typeof pl.t('generate'), 'string')
  assertEquals(pl.lang, 'pl')
})

Deno.test('paramText prefers the Polish label and keeps the English help when there is none', () => {
  const spec = PARAM_SPEC[0]
  assert(spec)
  const en = dictionary('en').paramText(spec)
  assertEquals(en, { label: spec.label, help: spec.help })
  const pl = dictionary('pl').paramText(spec)
  assertEquals(typeof pl.label, 'string')
  assert(pl.label.length > 0)
})

Deno.test('fmt groups by locale and short abbreviates from ten thousand', () => {
  const en = dictionary('en')
  assertEquals(en.fmt(1234567), (1234567).toLocaleString('en'))
  assertEquals(en.short(9999), en.fmt(9999))
  assertEquals(en.short(10000), '10k')
  assertEquals(en.short(86000), '86k')
})

Deno.test('violation names the knob, the value and the bounds for a range break', () => {
  const spec = PARAM_SPEC.find((s) => s.key === 'W')
  assert(spec)
  const text = dictionary('en').violation({
    kind: 'range',
    key: 'W',
    value: spec.min - 1,
    min: spec.min,
    max: spec.max,
  })
  assert(text.includes(String(spec.min)), text)
  assert(text.includes(spec.label), text)
})

Deno.test('violation offers the two legal stops around a step break', () => {
  const spec = PARAM_SPEC.find((s) => s.step > 0)
  assert(spec)
  const value = spec.min + spec.step / 2
  const [below, above] = stepsAround(value, spec.step, spec.min)
  const text = dictionary('en').violation({ kind: 'step', key: spec.key, value, step: spec.step, min: spec.min })
  assert(text.includes(String(below)) && text.includes(String(above)), text)
})

Deno.test('violation reads a rule reason in both languages and appends what is needed', () => {
  // `kind: 'rule'` carries the knobs the rule spans as well as its key (types.ts:81-87).
  const ruleKey = Object.keys(RULE_REASONS)[0] as RuleKey
  const v: Violation = { kind: 'rule', key: ruleKey, keys: [], need: 0.7 }
  const en = dictionary('en').violation(v)
  const pl = dictionary('pl').violation(v)
  assert(en.includes('0.7'), en)
  assertNotEquals(en, pl)
})
```

`Violation` is a discriminated union (`types.ts:81-87`): `range` carries `value/min/max`, `step` carries `value/step/min`, and `rule` carries `key: RuleKey`, `keys: readonly ParamKey[]` and an optional `need`. The test takes its rule key from `RULE_REASONS` so it cannot name one the engine dropped.

- [ ] **Step 2: Run to verify they fail**

Run: `deno test packages/engine/lab-i18n.test.ts --filter 'dictionary'`
Expected: FAIL — `dictionary is not defined`.

- [ ] **Step 3: Implement the factory**

At the end of `packages/engine/lab-i18n.ts`, move the five helpers in from the page, replacing every read of the module-level `lang` with the factory's parameter. `short` is `fmt` with the abbreviation the progress line uses:

```ts
/**
 * The surface's text in one language. Every helper here reads the language
 * from this closure instead of a module-level variable, so a surface can hold
 * two of them and a test can hold one.
 */
export function dictionary(lang: Lang): Dict {
  const d = lang === 'pl' ? PL : EN
  const specByKey = new Map<ParamKey, ParamSpec>(PARAM_SPEC.map((s) => [s.key, s]))
  const fmt = (n: number) => n.toLocaleString(lang === 'pl' ? 'pl' : 'en')
  const t = <K extends UiKey>(key: K, ...args: UiArgs<K>): string => {
    const v = d.ui[key] ?? EN.ui[key]
    return typeof v === 'function' ? (v as (...a: unknown[]) => string)(...args) : v
  }
  const reason = (key: InactiveKey | RuleKey): string => {
    if (lang === 'pl') return PL.reasons[key]
    return Object.hasOwn(INACTIVE_REASONS, key) ? INACTIVE_REASONS[key as InactiveKey] : RULE_REASONS[key as RuleKey]
  }
  const paramText = (spec: ParamSpec) => {
    const pl = lang === 'pl' ? PL.params[spec.key] : null
    return { label: pl?.label ?? spec.label, help: pl?.help ?? spec.help }
  }
  const labelOf = (key: ParamKey) => {
    const spec = specByKey.get(key)
    return spec ? paramText(spec).label : key
  }
  return {
    lang,
    t,
    paramText,
    choiceText: (key, word) => (lang === 'pl' ? stringAt(PL.choices[key] ?? {}, word) : undefined) ?? word,
    reason,
    fmt,
    // The progress line counts pieces on boards of up to 10^6 cells; past ten
    // thousand the exact figure changes faster than it can be read.
    short: (n) => (n >= 10000 ? `${Math.round(n / 1000)}k` : fmt(n)),
    violation: (v) => {
      if (v.kind === 'range') return t('rangeViolation', labelOf(v.key), v.value, v.min, v.max)
      if (v.kind === 'step') {
        const [below, above] = stepsAround(v.value, v.step, v.min)
        return t('stepViolation', labelOf(v.key), v.value, below, above)
      }
      const text = reason(v.key)
      return v.need === undefined ? text : t('needViolation', text, v.need)
    },
  }
}
```

`stringAt` moves here too — it is the dictionary's own lookup helper. `lab-i18n.ts` gains value imports of `PARAM_SPEC`, `INACTIVE_REASONS`, `RULE_REASONS` and `stepsAround` from `./engine.ts`; that direction already exists (the dictionary imports engine types), so there is no cycle. Confirm with `deno check`.

- [ ] **Step 4: Run to verify they pass**

Run: `deno test packages/engine/lab-i18n.test.ts --filter 'dictionary'` and `deno check packages/engine/*.ts`
Expected: PASS.

- [ ] **Step 5: Switch the page over**

In `packages/cli/lab-page.ts`, delete `DICT`, `t`, `paramText`, `choiceText`, `reasonText`, `fmt`, `isInactiveKey`, `stringAt`, `specByKey`'s label duty and `violationText` (`:155-189`, `:444-456`), and hold one `let dict = dictionary(lang)` instead, refreshed in `applyLanguage` (`:500`). Replace `t(` with `dict.t(`, `fmt(` with `dict.fmt(`, `violationText(v)` with `dict.violation(v)`, and the inline `short` in the progress handler (`:909`) with `dict.short`. `isUiKey` stays: it guards `[data-i18n]` attributes, which is a DOM concern.

Run: `deno task check && deno task test`
Expected: PASS, including `lab-i18n.test.ts` and `lab-bundle.test.ts`.

- [ ] **Step 6: Verify by eye that both languages still read correctly**

Run: `sh packages/cli/lab.sh` and switch PL/EN in the browser; check a violation message, a clamped knob's reason and the progress line on a 600×600 board.
Expected: no console errors, both languages complete, the progress line abbreviates past ten thousand pieces.

- [ ] **Step 7: Commit**

```bash
git add packages/engine/lab-i18n.ts packages/engine/lab-i18n.test.ts packages/cli/lab-page.ts
git commit -m "Make the language a parameter instead of a module variable

Five text helpers read a module-level let, so none could be tested and
violationText could not move without them. dictionary(lang) closes over
the language, which lets a test hold one and a surface hold two."
```

---

### Task 6: `longestSummary` and the board-file predicate it needs

**Files:**
- Modify: `packages/engine/engine.ts` (beside `analyse`)
- Modify: `packages/engine/mod.ts`
- Modify: `packages/cli/lab-page.ts:89-120`
- Test: `packages/engine/engine.test.ts` (append)

**Interfaces:**
- Consumes: `BoardData`, `LongestSummary` (`types.ts:321`)
- Produces: `longestSummary(board: BoardData, n: number): LongestSummary[]`

- [ ] **Step 1: Write the failing tests**

```ts
Deno.test('longestSummary returns the n longest pieces, longest first', () => {
  const r = generate({ ...defaultParams(), W: 20, H: 20, seed: 3 })
  const got = longestSummary(r.board, 5)
  assertEquals(got.length, Math.min(5, r.board.pieces.length))
  for (let i = 1; i < got.length; i++) {
    const prev = got[i - 1], cur = got[i]
    assert(prev && cur && prev.len >= cur.len)
  }
})

Deno.test('longestSummary measures the box, the span and the density of a piece', () => {
  const r = generate({ ...defaultParams(), W: 20, H: 20, seed: 3 })
  const top = longestSummary(r.board, 1)[0]
  assert(top)
  assertEquals(top.span, Math.max(top.sx / r.board.W, top.sy / r.board.H))
  assertEquals(top.density, top.len / (top.sx * top.sy))
  assert(top.density > 0 && top.density <= 1)
  assert(top.coil >= 0 && top.coil <= 1)
})

Deno.test('longestSummary asks for more pieces than exist without failing', () => {
  const r = generate({ ...defaultParams(), W: 12, H: 12, seed: 1 })
  assertEquals(longestSummary(r.board, 10_000).length, r.board.pieces.length)
})

Deno.test('longestSummary leaves the board it reads untouched', () => {
  const r = generate({ ...defaultParams(), W: 16, H: 16, seed: 5 })
  const before = r.board.pieces.map((p) => p.id)
  longestSummary(r.board, 3)
  assertEquals(r.board.pieces.map((p) => p.id), before)
})
```

The last test matters: the function sorts, and sorting the caller's array in place would reorder the board.

- [ ] **Step 2: Run to verify they fail**

Run: `deno test packages/engine/engine.test.ts --filter 'longestSummary'`
Expected: FAIL — `longestSummary is not defined`.

- [ ] **Step 3: Move it verbatim, comment included**

Cut from `packages/cli/lab-page.ts:89-120` into `packages/engine/engine.ts` beside `analyse`, add `export`, add to `mod.ts`. Keep the `slice()` and its comment — the piece count reaches ~90 000 and a spread would overflow the stack.

- [ ] **Step 4: Run to verify they pass**

Run: `deno test packages/engine/engine.test.ts --filter 'longestSummary'`
Expected: PASS, including the untouched-board test.

- [ ] **Step 5: Switch the page over and verify**

Add `longestSummary` to the page's engine import.

Run: `deno task check && deno task test`
Expected: PASS.

- [ ] **Step 6: Commit**

```bash
git add packages/engine/engine.ts packages/engine/mod.ts packages/engine/engine.test.ts packages/cli/lab-page.ts
git commit -m "Move the longest-pieces summary into the engine

It reads a BoardData and returns numbers; it belongs beside analyse. One
of its new tests pins the behaviour that matters most to a caller: it
sorts a copy, so the board it was handed keeps its order."
```

---

### Task 7: `lab-report.ts` and the sixth subpath export

The report is ~100 lines of pure mapping from metrics to rows. It is too large for `engine.ts` and needs a module of its own — which means export plumbing in four places.

**Files:**
- Create: `packages/engine/lab-report.ts`
- Create: `packages/engine/lab-report.test.ts`
- Modify: `packages/engine/package.json:4-11` (exports), `packages/engine/deno.json:4-10` (exports), `packages/engine/tsconfig.build.json:18-28` (include), `packages/engine/scripts/node-smoke.mjs`, `packages/engine/neutral.test.ts:7-18` (the `NEUTRAL` list)
- Modify: `packages/cli/lab-page.ts:1258-1260`, `:1535-1643`

**Interfaces:**
- Consumes: `Metrics`, `CarverStats`, `Stuck`, `BoardMeta`, `Params` from `types.ts`; `Dict` from `lab-i18n.ts`
- Produces:

```ts
export interface StatRow {
  readonly kind: 'row' | 'separator'
  readonly label: string
  readonly value: string
  /** +1 when a larger number is better, -1 when smaller is, 0 when neither. */
  readonly better: 1 | -1 | 0
}
export interface ReportInput {
  readonly ok: boolean
  readonly metrics: Metrics | null
  readonly stats: CarverStats
  readonly pieces: number
  readonly backtracks: number
  readonly restartsUsed: number
  readonly genMs: number
  readonly metricsMs: number
  readonly totalMs: number
  readonly stuck: Stuck | null
  readonly deadlock: boolean
}
export function reportRows(run: ReportInput, params: Params, dict: Dict): StatRow[]
export function genSeconds(meta: BoardMeta, dash: string): string
```

- [ ] **Step 1: Add the export plumbing first, with a test that proves it**

The module must be reachable before anything imports it. Create `packages/engine/lab-report.ts` with one exported function and nothing else yet:

```ts
// The report of a run: metrics, carver statistics and timings as rows a
// surface can render without knowing what any of them mean. Pure: it takes
// the run, the knobs and a dictionary, and returns strings.
import type { BoardMeta } from './types.ts'

/**
 * How long a stored board took to generate, or the dash the surface uses when
 * it was saved before the timing existed. Two decimals under ten seconds, one
 * above: on a fast board the second decimal is the difference between runs.
 */
export function genSeconds(meta: BoardMeta, dash: string): string {
  return meta.genMs === null ? dash : (meta.genMs / 1000).toFixed(meta.genMs < 10000 ? 2 : 1)
}
```

This is `packages/cli/lab-page.ts:1258-1260` verbatim, with the dash as a parameter: `genMs` is a nullable field of `BoardMeta` itself, not of `meta.metrics`.

Add to `packages/engine/package.json` exports:

```json
"./report": { "types": "./dist/lab-report.d.ts", "default": "./dist/lab-report.js" }
```

Add to `packages/engine/deno.json` exports:

```json
"./report": "./lab-report.ts"
```

Add `"lab-report.ts"` to `include` in `packages/engine/tsconfig.build.json`.

Add to `packages/engine/scripts/node-smoke.mjs`, beside the existing imports:

```js
import { genSeconds } from '../dist/lab-report.js'
```

and before the final log:

```js
if (genSeconds({ genMs: 4800 }, '—') !== '4.80' || genSeconds({ genMs: null }, '—') !== '—') {
  console.error('lab-report is not emitted correctly into dist/')
  process.exit(1)
}
```

- [ ] **Step 2: Prove the sixth export resolves in all three toolchains**

Run: `deno check packages/engine/lab-report.ts`
Run: `pnpm nx build engine`
Run: `node packages/engine/scripts/node-smoke.mjs`
Expected: all three pass, and the smoke script prints its golden boards plus no `lab-report` error.

- [ ] **Step 3: Commit the plumbing on its own**

```bash
git add packages/engine/lab-report.ts packages/engine/package.json packages/engine/deno.json packages/engine/tsconfig.build.json packages/engine/scripts/node-smoke.mjs
git commit -m "Open a sixth engine subpath for the run report

A new module is reachable only after four files agree: the npm exports,
the Deno exports, the tsc include list and the Node smoke test. Doing
that first means the report itself lands in a module that already
resolves."
```

- [ ] **Step 4: Write the failing tests for the rows**

Create `packages/engine/lab-report.test.ts`:

```ts
import { assert, assertEquals } from '@std/assert'
import { defaultParams, generate } from './mod.ts'
import { dictionary } from './lab-i18n.ts'
import { genSeconds, reportRows } from './lab-report.ts'

function run(W: number, H: number, seed: number) {
  const r = generate({ ...defaultParams(), W, H, seed })
  return {
    ok: r.ok,
    metrics: r.metrics,
    stats: r.board.stats,
    pieces: r.board.pieces.length,
    backtracks: r.backtracks,
    restartsUsed: r.restartsUsed,
    genMs: r.genMs,
    metricsMs: r.metricsMs,
    totalMs: r.genMs + r.metricsMs,
    stuck: r.stuck,
    deadlock: r.deadlock,
  }
}

Deno.test('reportRows returns 23 rows and 4 separators', () => {
  const params = { ...defaultParams(), W: 20, H: 20, seed: 3 }
  const rows = reportRows(run(20, 20, 3), params, dictionary('en'))
  assertEquals(rows.filter((r) => r.kind === 'row').length, 23)
  assertEquals(rows.filter((r) => r.kind === 'separator').length, 4)
})

Deno.test('every row has a label and a value, and no row is empty', () => {
  const params = { ...defaultParams(), W: 20, H: 20, seed: 3 }
  for (const row of reportRows(run(20, 20, 3), params, dictionary('en'))) {
    if (row.kind === 'separator') continue
    assert(row.label.length > 0, JSON.stringify(row))
    assert(row.value.length > 0, JSON.stringify(row))
  }
})

Deno.test('the row order is the same in both languages, so a delta keyed by label survives a switch', () => {
  const params = { ...defaultParams(), W: 20, H: 20, seed: 3 }
  const r = run(20, 20, 3)
  const en = reportRows(r, params, dictionary('en'))
  const pl = reportRows(r, params, dictionary('pl'))
  assertEquals(en.length, pl.length)
  assertEquals(en.map((x) => x.kind), pl.map((x) => x.kind))
  assertEquals(en.map((x) => x.better), pl.map((x) => x.better))
})

Deno.test('better is only ever -1, 0 or 1', () => {
  const params = { ...defaultParams(), W: 20, H: 20, seed: 3 }
  for (const row of reportRows(run(20, 20, 3), params, dictionary('en'))) {
    assert(row.better === 1 || row.better === -1 || row.better === 0, `${row.label}: ${row.better}`)
  }
})

Deno.test('a board with no metrics still reports its rows', () => {
  const params = { ...defaultParams(), W: 20, H: 20, seed: 3 }
  const rows = reportRows({ ...run(20, 20, 3), metrics: null }, params, dictionary('en'))
  assert(rows.length > 0)
})

Deno.test('genSeconds shows two decimals under ten seconds and one above, and a dash for no timing', () => {
  assertEquals(genSeconds({ genMs: 4800 } as never, '—'), '4.80')
  assertEquals(genSeconds({ genMs: 16000 } as never, '—'), '16.0')
  assertEquals(genSeconds({ genMs: null } as never, '—'), '—')
})
```

The counts are measured: `packages/cli/lab-page.ts:1575-1620` holds 23 `stat(` calls and 4 `SEP` entries.

- [ ] **Step 5: Run to verify they fail**

Run: `deno test packages/engine/lab-report.test.ts`
Expected: FAIL — `reportRows is not defined`.

- [ ] **Step 6: Move the rows in**

Move the `stat` helper, the `SEP` marker and the whole row list from `packages/cli/lab-page.ts:1540-1618` into `lab-report.ts` as `reportRows`, replacing `t(...)` with `dict.t(...)` and `fmt(...)` with `dict.fmt(...)`. Keep the row order and every `better` sign exactly as they are. Leave in the page: the status line, the delta column against `prevStats`, and the HTML assembly (`:1619-1643`) — those are surface concerns and the React application rewrites them.

- [ ] **Step 7: Run to verify they pass**

Run: `deno test packages/engine/lab-report.test.ts`
Expected: PASS, all six tests.

- [ ] **Step 8: Switch the page over, and check the table by eye**

Have the page's `report()` call `reportRows(...)` and render the returned rows, keeping its delta column and status line.

Run: `deno task check && deno task test && deno task bundle`
Then: `sh packages/cli/lab.sh`, generate a board, switch PL/EN, generate again.
Expected: the statistics table is unchanged in both languages, and the delta column still appears on the second run.

- [ ] **Step 9: Commit**

```bash
git add packages/engine/lab-report.ts packages/engine/lab-report.test.ts packages/cli/lab-page.ts
git commit -m "Move the run report into the engine, keeping the surface's half

Rows, labels, values and better-signs are a pure mapping from metrics
and now live beside them, with a test pinning the count and one pinning
that both languages produce the same order — which is what makes a delta
column safe to key by name. The status line, the delta and the markup
stay with the surface."
```

---

### Task 8: The store request contract

`packages/cli/store.ts` declares `SaveInput`, which the engine cannot import. The wire contract moves to the engine; the CLI's input type extends it with the two fields only the CLI sends.

**Files:**
- Modify: `packages/engine/types.ts` (add the contract type)
- Modify: `packages/engine/command.ts` (add the builder beside `buildCommand`)
- Modify: `packages/cli/store.ts:10-28`
- Modify: `packages/cli/lab-page.ts:1121-1140`, `:1380-1395`
- Test: `packages/engine/command.test.ts` (append)

**Interfaces:**
- Consumes: `BoardFile`, `Params`, `View`, `Stuck`, `buildCommand`
- Produces:

```ts
export interface StoreRequest {
  readonly board: BoardFile
  readonly params: Params
  readonly view: View
  readonly command: string
  readonly source: string
  readonly metrics?: {
    readonly ok?: boolean
    readonly pieces?: number
    /** null when the run produced no metrics; the surface sends the field either way. */
    readonly maxLen?: number | null
    readonly genMs?: number
    readonly restarts?: number
    readonly backtracks?: number
    readonly stuck?: Stuck | null
  }
}
export function storeRequest(
  board: BoardFile,
  params: Params,
  view: View,
  source: string,
  metrics?: StoreRequest['metrics'],
): StoreRequest
```

- [ ] **Step 1: Write the failing tests**

```ts
Deno.test('storeRequest builds the command from the parameters it is given', () => {
  const params = { ...defaultParams(), W: 25, H: 50, seed: 7 }
  const req = storeRequest({ v: 1 } as never, params, DEFAULT_VIEW, 'lab')
  assertEquals(req.command, buildCommand(params, DEFAULT_VIEW))
  assertEquals(req.source, 'lab')
  assertEquals(req.params.seed, 7)
})

Deno.test('storeRequest carries a null maxLen through, because a run without metrics has none', () => {
  const params = defaultParams()
  const req = storeRequest({ v: 1 } as never, params, DEFAULT_VIEW, 'lab', { ok: false, maxLen: null })
  assertEquals(req.metrics?.maxLen, null)
})

Deno.test('storeRequest omits metrics entirely when none are passed', () => {
  const req = storeRequest({ v: 1 } as never, defaultParams(), DEFAULT_VIEW, 'cli')
  assertEquals(req.metrics, undefined)
})
```

- [ ] **Step 2: Run to verify they fail**

Run: `deno test packages/engine/command.test.ts --filter 'storeRequest'`
Expected: FAIL — `storeRequest is not defined`.

- [ ] **Step 3: Implement**

Add `StoreRequest` to `packages/engine/types.ts` and `storeRequest` to `packages/engine/command.ts`:

```ts
/**
 * The body of a board-store write, built where the command is built so the two
 * cannot disagree. The store's own input type adds what only the CLI sends.
 */
export function storeRequest(
  board: BoardFile,
  params: Params,
  view: View,
  source: string,
  metrics?: StoreRequest['metrics'],
): StoreRequest {
  const req: StoreRequest = { board, params, view, command: buildCommand(params, view), source }
  return metrics === undefined ? req : { ...req, metrics }
}
```

`exactOptionalPropertyTypes` is on, so build the object in two shapes rather than assigning `metrics: undefined`.

- [ ] **Step 4: Run to verify they pass**

Run: `deno test packages/engine/command.test.ts --filter 'storeRequest'`
Expected: PASS.

- [ ] **Step 5: Extend, do not narrow, on the CLI side**

In `packages/cli/store.ts`, declare:

```ts
export interface SaveInput extends StoreRequest {
  /** The SVG preview. Without it no preview is kept: one left by an earlier save of this id is removed. */
  svg?: string
  metrics?: StoreRequest['metrics'] & { aborted?: boolean }
}
```

Keep the existing comment. The relation is extension: the CLI sends `svg` and `aborted`, which the lab never does and the server refuses on `svg`.

- [ ] **Step 6: Switch the page's two bodies over**

Replace the object literal at `packages/cli/lab-page.ts:1123-1137` with `storeRequest(board, runParams, view, 'lab', { … })`, and the one at `:1385-1392` likewise.

Run: `deno task check && deno task test`
Expected: PASS, including `lab-server.test.ts` and `store.test.ts`.

- [ ] **Step 7: Commit**

```bash
git add packages/engine/types.ts packages/engine/command.ts packages/engine/command.test.ts packages/cli/store.ts packages/cli/lab-page.ts
git commit -m "Build the store request where the command is built

The body and the command in it were assembled separately at two call
sites, so they could drift. storeRequest builds both together; the CLI's
SaveInput extends the contract with the svg and aborted fields only the
CLI sends."
```

---

### Task 9: `boardView` in the board element

`BoardView` is the element's own type, so the mapping cannot live in the engine without inverting the dependency.

**Files:**
- Modify: `packages/board-element/src/view.ts`
- Modify: `packages/board-element/src/mod.ts` (export)
- Modify: `packages/cli/lab-page.ts:69-79`
- Test: `packages/board-element/src/view.test.ts` (append)

**Interfaces:**
- Consumes: `View` from `@arrowz/engine`, `BoardView` from `./view.ts`
- Produces: `boardViewOf(view: View, voids: boolean): Partial<BoardView>`

- [ ] **Step 1: Write the failing test**

Append to `packages/board-element/src/view.test.ts`:

```ts
import { describe, expect, it } from 'vitest'
import { boardViewOf } from './view.ts'
import { DEFAULT_VIEW } from '@arrowz/engine/command'

describe('boardViewOf', () => {
  it('carries the seven look fields and the voids flag', () => {
    const got = boardViewOf(DEFAULT_VIEW, true)
    expect(got).toEqual({
      stroke: DEFAULT_VIEW.stroke,
      headWidth: DEFAULT_VIEW.headWidth,
      headHeight: DEFAULT_VIEW.headHeight,
      rounded: DEFAULT_VIEW.rounded,
      colored: DEFAULT_VIEW.colored,
      top: DEFAULT_VIEW.top,
      voids: true,
    })
  })

  it('drops cell, because the element scales itself', () => {
    expect('cell' in boardViewOf(DEFAULT_VIEW, false)).toBe(false)
  })
})
```

- [ ] **Step 2: Run to verify it fails**

Run: `pnpm --filter @arrowz/board-element exec vitest run src/view.test.ts`
Expected: FAIL — `boardViewOf is not exported`.

- [ ] **Step 3: Move the function**

Cut `boardView` from `packages/cli/lab-page.ts:69-79` into `packages/board-element/src/view.ts` as `boardViewOf`, exported, with a comment saying why `cell` is dropped (it concerns the SVG export; the element scales itself). Re-export from `src/mod.ts`.

- [ ] **Step 4: Run to verify it passes**

Run: `pnpm --filter @arrowz/board-element exec vitest run src/view.test.ts`
Expected: PASS.

- [ ] **Step 5: Switch the page over**

The page imports the element by relative path (`lab-page.ts:47-51`), so add `boardViewOf` to that same import and delete the local function.

Run: `pnpm nx build board-element && deno task check && deno task test && deno task bundle`
Expected: PASS.

- [ ] **Step 6: Commit**

```bash
git add packages/board-element/src/view.ts packages/board-element/src/mod.ts packages/board-element/src/view.test.ts packages/cli/lab-page.ts
git commit -m "Move the view mapping into the element that owns BoardView

The engine cannot hold this mapping: BoardView belongs to the element,
and the element already depends on the engine. Its test pins the one
thing a caller can get wrong, which is that cell is deliberately
dropped."
```

---

### Task 10: `recipeOf` beside `normalizeChoice`

**Files:**
- Modify: `packages/engine/lab-simple.ts` (beside `normalizeChoice`, around `:180`)
- Modify: `packages/cli/lab-page.ts:600-609`
- Test: `packages/engine/lab-simple.test.ts` (append)

**Interfaces:**
- Consumes: `normalizeChoice`, `SimpleChoice`
- Produces: `export type Recipe = Omit<SimpleChoice, 'seed' | 'random'> & { random: boolean }`; `recipeOf(raw: unknown): Recipe`

- [ ] **Step 1: Write the failing tests**

```ts
Deno.test('recipeOf drops the seed, because the seed lives in the knobs', () => {
  const got = recipeOf({ ...defaultChoice(), seed: 99 })
  assertFalse('seed' in got)
})

Deno.test('recipeOf settles the randomise flag to a boolean', () => {
  assertEquals(recipeOf({}).random, false)
  assertEquals(recipeOf({ random: true }).random, true)
  assertEquals(recipeOf({ random: 'yes' }).random, false)
})

Deno.test('recipeOf survives junk and an old stored shape', () => {
  const got = recipeOf({ size: 'huge', skeleton: 'nonsense', nothing: 1 })
  assertEquals(got, { ...recipeOf(defaultChoice()), ...got })
  assertEquals(typeof got.skeleton, typeof defaultChoice().skeleton)
})

Deno.test('recipeOf on nothing at all is the default recipe', () => {
  assertEquals(recipeOf(null), recipeOf(defaultChoice()))
})
```

- [ ] **Step 2: Run to verify they fail**

Run: `deno test packages/engine/lab-simple.test.ts --filter 'recipeOf'`
Expected: FAIL — `recipeOf is not defined`.

- [ ] **Step 3: Move it, comment included**

Cut `type Recipe` and `recipeOf` from `packages/cli/lab-page.ts:602-608` into `packages/engine/lab-simple.ts` beside `normalizeChoice`, exported. `SIMPLE_KEY` and the `readJson` call stay in the page: the storage key and reading `localStorage` are surface concerns.

- [ ] **Step 4: Run to verify they pass**

Run: `deno test packages/engine/lab-simple.test.ts --filter 'recipeOf'`
Expected: PASS.

- [ ] **Step 5: Switch the page over**

Add `recipeOf` and the `Recipe` type to the `@arrowz/engine/simple` import.

Run: `deno task check && deno task test`
Expected: PASS.

- [ ] **Step 6: Commit**

```bash
git add packages/engine/lab-simple.ts packages/engine/lab-simple.test.ts packages/cli/lab-page.ts
git commit -m "Move the stored recipe beside the function that normalises it

recipeOf wraps normalizeChoice and then settles the randomise flag; it
belongs in the same module. Its tests pin what the lab relies on: no
seed in the recipe, a boolean flag, and junk from an old profile
surviving the read."
```

---

### Task 11: Close the PR — both gates, the neutrality rule, and a look at the page

**Files:**
- Modify: `packages/cli/lab-page.ts` (final tidy: unused imports, the shrunken helper block)
- Verify only: `packages/engine/neutral.test.ts`, `packages/cli/lab-bundle.test.ts`

- [ ] **Step 1: Confirm the engine is still Deno-free and DOM-free**

Run: `deno test packages/engine/neutral.test.ts`
Expected: PASS. The test walks an explicit `NEUTRAL` list (`neutral.test.ts:7-18`) and greps each file for `Deno.`, `document.`, `window.`, `localStorage`, `process.`, `from 'node:` and `Buffer.`. **`'lab-report.ts'` must be added to that list in Task 7** — without it the new module is never checked. Add it in Task 7 Step 1, with the export plumbing.

- [ ] **Step 2: Confirm the bundled worker still carves the same boards**

Run: `deno task bundle && deno test --allow-read --allow-write --allow-env --allow-run --allow-net packages/cli/lab-bundle.test.ts`
Expected: PASS, including the fingerprint comparison between the bundled worker and in-process `generate()`.

- [ ] **Step 3: Run both gates end to end**

Run: `deno task verify`
Run: `pnpm nx run-many -t verify`
Expected: both green.

- [ ] **Step 4: Count what left the page**

Run: `wc -l packages/cli/lab-page.ts`
Expected: fewer than 1668 lines. Record the new figure in the PR description — it is the measurement this PR is for.

- [ ] **Step 5: Drive the lab by hand**

Run: `sh packages/cli/lab.sh`, then: generate in simple view; switch to advanced; break a rule and confirm Generate is disabled with the violation listed; fix it and generate; check the statistics table and its delta on a second run; switch PL/EN; open a stored board from the library and load it into the lab; download an SVG.
Expected: no console errors, and no behaviour different from before the PR.

- [ ] **Step 6: Commit the tidy and open the pull request**

```bash
git add packages/cli/lab-page.ts
git commit -m "Tidy what the extraction left behind in the lab page"
```

PR description: what moved and where, the line count before and after, and one sentence per test file added. State explicitly that the board server's refusals are unchanged and that `lab-server.test.ts` still passes — a reader of §4.2 of the spec will be looking for that.

---

## Self-review

**Spec coverage.** §4.1's table has ten fragments: `isFiniteNumber`/`readParams` (Task 1), `clampParam` (2), `viewNumberOf` (3), `violationText` inside the dictionary (5), `longestSummary` (6), report rows and `genSeconds` (7), store bodies (8), `boardView` (9), `recipeOf` (10). §4.1's two corrected fragments: `startChoiceOf` (4) and `short(n, locale)` — which Task 5 implements as `dict.short`, since the locale it needs is the dictionary's. §4.3's three plumbing additions are Task 7 Step 1. §9.3's "PR 1 has no behavioural safety net of its own" is answered by a test in every task and the hand-driven pass in Task 11.

**Naming consistency.** `viewNumberOf`, `startChoiceOf`, `boardViewOf` and `storeRequest` are new names, not the page's old ones, because the page keeps thin wrappers of the same name in two cases (`viewNumber`, which still reads the DOM). `dict` is the variable, `Dict` the type, `dictionary()` the factory, used that way in Tasks 5 and 7.

**Soft spots closed before handing this over.** Three assumptions in the first draft of this plan were checked against the source and two were wrong: `genSeconds` reads `meta.genMs`, not `meta.metrics?.genMs`, and switches from two decimals to one at ten seconds; `Violation`'s `rule` arm carries `keys: readonly ParamKey[]` besides `key` and `need`. The row counts were right — 23 rows and 4 separators. `neutral.test.ts` keeps an explicit file list, so `lab-report.ts` must be added to it or the new module goes unchecked; that is now Task 7 Step 1.
