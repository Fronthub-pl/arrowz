# Pasting a `carve` command into ⌘K — Implementation Plan

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:subagent-driven-development (recommended) or superpowers:executing-plans to implement this plan task-by-task. Steps use checkbox (`- [ ]`) syntax for tracking.

**Goal:** A `deno task carve …` line pasted into the lab's ⌘K palette sets the knobs, the look and the simple view's recipe to what that line would carve and generates it; a line the parser refuses lists every problem in the page's language.

**Architecture:** The engine (`packages/engine/command.ts`) gains a shell-like `splitCommand`, typed `ArgProblem`s behind the existing English `errors`, and `drawOf`, the pinned draw the CLI already does; `carve.ts` switches to `drawOf`. The lab gets a `palette/pastedCommand.ts` module (detect, read, word the problems, load) and a command mode in `CommandPalette.tsx`; `BoardColumn`'s view mapping moves to `view.slice.ts` so both loaders share it.

**Tech Stack:** TypeScript, Deno 2.9 (`@std/assert`) for the engine and CLI, React 19 + Vitest browser mode for `apps/lab`, Nx + pnpm.

**Spec:** `docs/superpowers/specs/2026-09-28-lab-paste-command-design.md`

## Global Constraints

- Everything in files is English; Polish only in `PL` in `packages/engine/lab-i18n.ts`. Every visible lab string is a dictionary entry in both `EN.ui` and `PL.ui` (`lab-i18n.test.ts` requires the same keys and value kinds).
- `glossary.test.ts`: no dictionary string writes a flag (`/(?:^|\s)--[a-z]/`) or a retired word (EN: `pieces`, `close…`, `jam…`, `carve…`, `paper`, `ink`, `backbite`, `corridor`, `fragment`, `absorb…`, `knob`; PL: `fragment`, `papier`, `tusz`, `wycin/wycię`, `domkn`, `generacj`, `pokrętł`, `element…`). Flags reach lab text only as formatter arguments.
- The CLI's refusal texts do not change by one byte: `errors` is derived from `problems`, and every existing test in `packages/engine/command.test.ts` and `packages/cli/carve.test.ts` must pass unmodified.
- `command.ts`, `lab-simple.ts`, `lab-i18n.ts` stay neutral (no DOM, no Deno; `neutral.test.ts`).
- No `any`, no non-null assertions, no value-changing fallback in the engine; never spread arrays proportional to cells or arrows.
- Comments say why, once, in the fewest lines (≤ 6 lines outside a header); no history, no `file.ts:NN` (`comments.test.ts` sweeps `apps/lab/src` and `packages/engine/lab-*.ts`).
- Formatting: `deno fmt <files>` for engine/CLI files; `(cd apps/lab && pnpm exec prettier --write <files>)` for lab files.
- Lab tests read the engine from `packages/engine/dist`: run `pnpm nx build engine` after every engine change, before lab tests. A fresh worktree needs `corepack enable pnpm && pnpm install` and `pnpm nx build board-element` once. The first vitest run may print "Vite unexpectedly reloaded a test"; rerun once. Use `set -o pipefail` when piping to `tail`.
- No attribution lines in commits.

## Review Focus

1. **A command copied over several lines.** The palette's `<input type="text">` strips line breaks from a paste, so `… --seed=7 \` + newline + `  --colored` arrives as `--seed=7 \  --colored`: a backslash followed by whitespace must act as a line join, not as an escaped space. Pinned in Task 2 (`splitCommand` cases with the newline and with the newline already stripped) and Task 6 (browser paste of a multi-line command).
2. **A lab command round trip with quoted colours.** `buildCommand` quotes colour values (`--palette='#aa0000,#00aa00'`); pasting the lab's own line must restore the same palette, paper, ink and highlight. Pinned in Task 2 (engine round trip) and Task 6 (browser copy → change → paste).
3. **Exactly one run after loading**, in both views and with `auto` on: loading goes through machine-path setters and `control.start()`, never `generate()`. Pinned in Task 6 (a counting `control`).
4. **A pinned line in the simple view** switches to advanced and keeps the pins; an everyday-only line keeps the view. Pinned in Task 5 (unit).
5. **A broken line in Polish**: every problem listed, none in English, the row not choosable. Pinned in Task 5 (every kind worded in PL) and Task 6 (browser, PL).

---

### Task 1: Typed problems behind the parser's English errors

**Files:**
- Modify: `packages/engine/command.ts` (`RETIRED`, `ParsedArgs`, `parseArgs`, new `ArgProblem`, `RetiredWhy`, `problemText`)
- Test: `packages/engine/command.test.ts` (new cases only)

**Interfaces:**
- Produces:
```ts
export type RetiredWhy = 'oneMode' | 'boardAlways' | 'spacingFixed'
export type ArgProblem =
  | { kind: 'noValue'; arg: string }
  | { kind: 'unexpectedArgument'; arg: string }
  | { kind: 'retired'; arg: string; name: string; hint: string; use: string[]; why: RetiredWhy | null }
  | { kind: 'notStart'; arg: string; words: string[]; min: number; max: number }
  | { kind: 'outside'; arg: string; min: number; max: number }
  | { kind: 'notNumber'; arg: string; words: string[] }
  | { kind: 'notWhole'; arg: string }
  | { kind: 'notTheme'; arg: string; themes: string[] }
  | { kind: 'notColour'; arg: string }
  | { kind: 'notColourList'; arg: string }
  | { kind: 'paletteTooLong'; arg: string; cap: number }
  | { kind: 'unknownFlag'; arg: string; name: string }
  | { kind: 'missing'; arg: string; name: string }
  | { kind: 'unclosedQuote'; arg: string }
export function problemText(p: ArgProblem): string
// ParsedArgs gains: problems: ArgProblem[]  (errors stays, = problems.map(problemText))
```

- [ ] **Step 1: Failing tests**

Append to `packages/engine/command.test.ts` (add `problemText` and `type ArgProblem` to its existing import from `./command.ts`):
```ts
// One case per kind: the problem a parse reports, and the sentence the CLI prints for it.
const PROBLEM_CASES: [string[], ArgProblem, string][] = [
  [['--width=9', '--height=9', '--colored=1'], { kind: 'noValue', arg: '--colored=1' }, '--colored=1 takes no value'],
  [['--width=9', '--height=9', 'seed'], { kind: 'unexpectedArgument', arg: 'seed' }, 'unexpected argument: seed'],
  [
    ['--width=9', '--height=9', '--stroke=0.4'],
    { kind: 'retired', arg: '--stroke=0.4', name: 'stroke', hint: 'use --line=R', use: ['--line'], why: null },
    '--stroke is gone: use --line=R',
  ],
  [
    ['--width=9', '--height=9', '--advanced'],
    {
      kind: 'retired',
      arg: '--advanced',
      name: 'advanced',
      hint: 'the CLI has one mode now; drop --advanced',
      use: [],
      why: 'oneMode',
    },
    '--advanced is gone: the CLI has one mode now; drop --advanced',
  ],
  [['--width=2000', '--height=9'], { kind: 'outside', arg: '--width=2000', min: 4, max: 1000 }, '--width=2000 is outside 4..1000'],
  [['--width=9.5', '--height=9'], { kind: 'notWhole', arg: '--width=9.5' }, '--width=9.5 is not a whole number'],
  [['--width=x', '--height=9'], { kind: 'notNumber', arg: '--width=x', words: [] }, '--width=x is not a number'],
  [['--width=9', '--height=9', '--theme=nope'], { kind: 'notTheme', arg: '--theme=nope', themes: Object.keys(THEMES) }, `--theme=nope is not a theme: ${Object.keys(THEMES).join(', ')}`],
  [['--width=9', '--height=9', '--ink=red'], { kind: 'notColour', arg: '--ink=red' }, '--ink=red is not a #rrggbb colour'],
  [['--width=9', '--height=9', '--palette=red'], { kind: 'notColourList', arg: '--palette=red' }, '--palette=red is not a list of #rrggbb colours'],
  [
    ['--width=9', '--height=9', `--palette=${Array(PALETTE_CAP + 1).fill('#112233').join(',')}`],
    { kind: 'paletteTooLong', arg: `--palette=${Array(PALETTE_CAP + 1).fill('#112233').join(',')}`, cap: PALETTE_CAP },
    `--palette=${Array(PALETTE_CAP + 1).fill('#112233').join(',')} has more than ${PALETTE_CAP} colours`,
  ],
  [['--width=9', '--height=9', '--nope'], { kind: 'unknownFlag', arg: '--nope', name: 'nope' }, 'unknown flag --nope'],
  [['--width=9'], { kind: 'missing', arg: '--height', name: 'height' }, 'missing --height'],
]

Deno.test('every refusal is a typed problem, and its sentence is the one the CLI prints', () => {
  for (const [argv, problem, text] of PROBLEM_CASES) {
    const parsed = parseArgs(argv)
    assertEquals(parsed.problems, [problem], argv.join(' '))
    assertEquals(parsed.errors, [text], argv.join(' '))
    assertEquals(problemText(problem), text)
  }
})

Deno.test('a start that is neither a word nor a share names both, with the range', () => {
  const parsed = parseArgs(['--width=9', '--height=9', '--start=sideways'])
  const [problem] = parsed.problems
  assertEquals(problem?.kind, 'notStart')
  assertEquals(parsed.errors, [problem === undefined ? '' : problemText(problem)])
})

Deno.test('a knob with words lists them in its problem', () => {
  const parsed = parseArgs(['--width=9', '--height=9', '--lmax=x'])
  assertEquals(parsed.problems, [{ kind: 'notNumber', arg: '--lmax=x', words: ['auto'] }])
  assertEquals(parsed.errors, ['--lmax=x is not a number and not auto'])
})

Deno.test('an unclosed quote is worded for the CLI too', () => {
  assertEquals(problemText({ kind: 'unclosedQuote', arg: "--ink='#11" }), "a quote is not closed: --ink='#11")
})
```
Import `THEMES` and `PALETTE_CAP` the way the test file already does for other cases (grep the top of `command.test.ts`; if they are not imported, add `import { THEMES } from './look.ts'` and `PALETTE_CAP` from wherever `command.ts` imports it). Check each expected sentence against the current parser before trusting it: run `deno eval` or a quick test on the argv to read today's `errors` (e.g. whether `--width=x` gives `is not a number`), and correct the case to today's text if it differs — today's text is the contract.

- [ ] **Step 2: See them fail**

Run: `deno test --allow-read packages/engine/command.test.ts 2>&1 | tail -8`
Expected: FAIL (`problemText` not exported, `problems` not on `ParsedArgs`).

- [ ] **Step 3: Structured `RETIRED`**

Replace `RETIRED` with:
```ts
/** A retired flag: the CLI's hint, the spellings that replace it, and which prose hint it is. */
interface Retired {
  hint: string
  use: string[]
  why: RetiredWhy | null
}
const RETIRED: Record<string, Retired> = {
  advanced: { hint: 'the CLI has one mode now; drop --advanced', use: [], why: 'oneMode' },
  board: { hint: 'a board file is always written; drop --board', use: [], why: 'boardAlways' },
  straight: { hint: 'use --winding=R (0 = straightest) or the knob --pstraight=R', use: ['--winding', '--pstraight'], why: null },
  stroke: { hint: 'use --line=R', use: ['--line'], why: null },
  lineweight: { hint: 'use --line=R', use: ['--line'], why: null },
  headwidth: { hint: 'use --arrow-width=R', use: ['--arrow-width'], why: null },
  arrowwidth: { hint: 'use --arrow-width=R', use: ['--arrow-width'], why: null },
  headheight: { hint: 'use --arrow-height=R', use: ['--arrow-height'], why: null },
  arrowheight: { hint: 'use --arrow-height=R', use: ['--arrow-height'], why: null },
  colorized: { hint: 'use --colored', use: ['--colored'], why: null },
  w: { hint: 'use --width=N', use: ['--width'], why: null },
  h: { hint: 'use --height=N', use: ['--height'], why: null },
  lateral: { hint: 'use --wlateral=R', use: ['--wlateral'], why: null },
  absorb: { hint: 'use --absorblimit=N', use: ['--absorblimit'], why: null },
  giantspacepen: {
    hint: 'the spacing strength is fixed now; use --giantspacing=off|2|3',
    use: ['--giantspacing'],
    why: 'spacingFixed',
  },
  headbias: { hint: 'use --start=layers|random|tunnels', use: ['--start'], why: null },
  mix: {
    hint: `use --start=${MIX_SHARE.min}..${MIX_SHARE.max} (or layers|random|tunnels to turn mixing off)`,
    use: ['--start'],
    why: null,
  },
}
```
Grep `command.ts` and `command.test.ts` for other readers of `RETIRED` (e.g. a test that every retired hint names a live flag) and adapt them to `.hint` — keep what they assert.

- [ ] **Step 4: The type, the sentence, and the parser**

Add near `ParsedArgs` the `RetiredWhy`/`ArgProblem` types from Interfaces, and:
```ts
/** The English sentence the CLI prints for a problem; the lab words the same problem from its dictionary. */
export function problemText(p: ArgProblem): string {
  switch (p.kind) {
    case 'noValue':
      return `${p.arg} takes no value`
    case 'unexpectedArgument':
      return `unexpected argument: ${p.arg}`
    case 'retired':
      return `--${p.name} is gone: ${p.hint}`
    case 'notStart':
      return `${p.arg} is not ${p.words.join(', ')} and not a number in ${p.min}..${p.max}`
    case 'outside':
      return `${p.arg} is outside ${p.min}..${p.max}`
    case 'notNumber':
      return `${p.arg} is not a number${p.words.length ? ` and not ${p.words.join(' or ')}` : ''}`
    case 'notWhole':
      return `${p.arg} is not a whole number`
    case 'notTheme':
      return `${p.arg} is not a theme: ${p.themes.join(', ')}`
    case 'notColour':
      return `${p.arg} is not a #rrggbb colour`
    case 'notColourList':
      return `${p.arg} is not a list of #rrggbb colours`
    case 'paletteTooLong':
      return `${p.arg} has more than ${p.cap} colours`
    case 'unknownFlag':
      return `unknown flag --${p.name}`
    case 'missing':
      return `missing --${p.name}`
    case 'unclosedQuote':
      return `a quote is not closed: ${p.arg}`
  }
}
```
`ParsedArgs` gains `/** Every refusal, typed; `errors` is these as the CLI's sentences. */ problems: ArgProblem[]`.

In `parseArgs`, replace `const errors: string[] = []` with `const problems: ArgProblem[] = []` and each `errors.push(\`…\`)` with the matching `problems.push({...})`:
- `switchOn`: `{ kind: 'noValue', arg: a }`
- not a flag: `{ kind: 'unexpectedArgument', arg: a }`
- retired: `{ kind: 'retired', arg: a, name, hint: retired.hint, use: retired.use, why: retired.why }`
- start not a word/number: `{ kind: 'notStart', arg: a, words: Object.keys(START.words), min: START.mix.min, max: START.mix.max }`; start outside: `{ kind: 'outside', arg: a, min: START.mix.min, max: START.mix.max }`
- everyday not a number: `{ kind: 'notNumber', arg: a, words: [] }`; slider outside: `{ kind: 'outside', arg: a, min: 0, max: 1 }`; size not whole: `{ kind: 'notWhole', arg: a }`; size outside: `{ kind: 'outside', arg: a, min: s.min, max: s.max }`
- knob not a number: `{ kind: 'notNumber', arg: a, words: wordsOf(key) }`
- theme: `{ kind: 'notTheme', arg: a, themes: Object.keys(THEMES) }`; colour: `{ kind: 'notColour', arg: a }`; palette list: `{ kind: 'notColourList', arg: a }`; palette cap: `{ kind: 'paletteTooLong', arg: a, cap: PALETTE_CAP }`
- look and view numbers: `notNumber` (words `[]`), `notWhole`, `outside` with their ranges
- unknown: `{ kind: 'unknownFlag', arg: a, name }`
- missing: `['width', 'height'].filter(...).map((name): ArgProblem => ({ kind: 'missing', arg: `--${name}`, name }))`

and return `const all = [...missing, ...problems]` as `problems: all, errors: all.map(problemText)`. The sentence for `notStart` must equal today's (`${a} is not ${Object.keys(START.words).join(', ')} and not a number in ${share}` with `share = \`${START.mix.min}..${START.mix.max}\``).

Run `deno fmt packages/engine/command.ts packages/engine/command.test.ts`.

- [ ] **Step 5: Everything passes, texts unchanged**

```bash
set -o pipefail
deno test --allow-read packages/engine/command.test.ts 2>&1 | tail -3
deno task test 2>&1 | tail -2
```
Expected: all pass, including every pre-existing refusal-text test in `command.test.ts` and `packages/cli/carve.test.ts` (unmodified).

- [ ] **Step 6: Commit**

```bash
git add packages/engine/command.ts packages/engine/command.test.ts
git commit -m "Engine: the parser's refusals are typed problems; the CLI's sentences are built from them"
```

---

### Task 2: `splitCommand`, a pasted line as argv

**Files:**
- Modify: `packages/engine/command.ts` (new `splitCommand`)
- Test: `packages/engine/command.test.ts`

**Interfaces:**
- Consumes: `ArgProblem` (Task 1), `COMMAND_PREFIX`, `buildCommand`, `parseArgs`.
- Produces: `export function splitCommand(text: string): { argv: string[]; problems: ArgProblem[] }`

- [ ] **Step 1: Failing tests**

```ts
Deno.test('splitCommand drops the prefix and splits on any run of whitespace', () => {
  assertEquals(splitCommand('  deno   task\tcarve --width=9\n--height=9  '), { argv: ['--width=9', '--height=9'], problems: [] })
  assertEquals(splitCommand('--width=9 --height=9'), { argv: ['--width=9', '--height=9'], problems: [] })
  assertEquals(splitCommand(''), { argv: [], problems: [] })
})

Deno.test('splitCommand reads both quote kinds, also inside a token', () => {
  assertEquals(splitCommand(`--palette='#aa0000,#00aa00' --ink="#112233"`).argv, ['--palette=#aa0000,#00aa00', '--ink=#112233'])
  assertEquals(splitCommand(`--x="a \\"b\\" \\\\c"`).argv, ['--x=a "b" \\c'])
  assertEquals(splitCommand(`--x='a b'`).argv, ['--x=a b'])
})

// The palette's input strips line breaks from a paste, so the join arrives
// either with its newline or as a backslash followed by the next line's indent.
Deno.test('splitCommand joins a command copied over several lines', () => {
  const lines = 'deno task carve --width=9 \\\n  --height=9 \\\n  --colored'
  assertEquals(splitCommand(lines).argv, ['--width=9', '--height=9', '--colored'])
  assertEquals(splitCommand(lines.replaceAll('\n', '')).argv, ['--width=9', '--height=9', '--colored'])
  assertEquals(splitCommand('--width=9 \\\r\n--height=9').argv, ['--width=9', '--height=9'])
})

Deno.test('splitCommand keeps an escaped character that is not whitespace', () => {
  assertEquals(splitCommand('--x=a\\#b').argv, ['--x=a#b'])
})

Deno.test('splitCommand reports an unclosed quote with what it had read', () => {
  assertEquals(splitCommand("--width=9 --ink='#11"), {
    argv: ['--width=9'],
    problems: [{ kind: 'unclosedQuote', arg: '--ink=#11' }],
  })
})

Deno.test("a lab command, quoted colours and all, splits and parses back to its own knobs and view", () => {
  const p = { ...defaultParams(), W: 30, H: 40, seed: 5, pStraight: 0.9 }
  const v = {
    ...DEFAULT_VIEW,
    cell: 12,
    colored: true,
    palette: ['#aa0000', '#00aa00'],
    paper: '#ffffff',
    ink: '#101010',
    highlight: '#ff00ff',
    pad: 2,
  }
  const split = splitCommand(buildCommand(p, v))
  assertEquals(split.problems, [])
  const back = parseArgs(split.argv)
  assertEquals(back.problems, [])
  for (const s of PARAM_SPEC) assertEquals(back.params[s.key], p[s.key], s.key)
  assertEquals(back.view, v)
})
```
Use the file's existing imports for `defaultParams`, `DEFAULT_VIEW`, `PARAM_SPEC`, `buildCommand`, `parseArgs`; add `splitCommand`. If `back.view` differs from `v` only in a field `buildCommand` does not print for this `v`, set that field of `v` to what the existing round-trip test (`argvOf` case) uses — read it first.

- [ ] **Step 2: See them fail**

Run: `deno test --allow-read packages/engine/command.test.ts 2>&1 | tail -6` — Expected: FAIL (`splitCommand` not exported).

- [ ] **Step 3: Implement**

In `command.ts`, after `COMMAND_PREFIX`:
```ts
/**
 * One pasted line as the argv a shell would hand the CLI: whitespace separates,
 * `'…'` quotes literally, `"…"` with `\"` and `\\`, and a backslash before
 * whitespace joins a line copied over several (a text input has already
 * stripped the newline). A leading `deno task carve` is dropped.
 */
export function splitCommand(text: string): { argv: string[]; problems: ArgProblem[] } {
  const argv: string[] = []
  let token = ''
  let inToken = false
  let quote: "'" | '"' | null = null
  for (let i = 0; i < text.length; i++) {
    const c = text.charAt(i)
    if (quote === "'") {
      if (c === "'") quote = null
      else token += c
      continue
    }
    if (quote === '"') {
      const next = text.charAt(i + 1)
      if (c === '"') quote = null
      else if (c === '\\' && (next === '"' || next === '\\')) {
        token += next
        i++
      } else token += c
      continue
    }
    if (c === "'" || c === '"') {
      quote = c
      inToken = true
      continue
    }
    if (c === '\\') {
      const next = text.charAt(i + 1)
      i++
      if (next === '' || /\s/.test(next)) {
        // A line join ends the token like any whitespace.
        if (inToken) argv.push(token)
        token = ''
        inToken = false
        continue
      }
      token += next
      inToken = true
      continue
    }
    if (/\s/.test(c)) {
      if (inToken) argv.push(token)
      token = ''
      inToken = false
      continue
    }
    token += c
    inToken = true
  }
  if (quote !== null) return { argv: dropPrefix(argv), problems: [{ kind: 'unclosedQuote', arg: token }] }
  if (inToken) argv.push(token)
  return { argv: dropPrefix(argv), problems: [] }
}

/** The argv without a leading `deno task carve`, word by word, so any spacing matches. */
function dropPrefix(argv: string[]): string[] {
  const words = COMMAND_PREFIX.split(' ')
  return words.every((word, at) => argv[at] === word) ? argv.slice(words.length) : argv
}
```
Note: a backslash before `\r\n` takes the `\r` as whitespace and the `\n` as the next separator — both end the token, which is the wanted result.

`deno fmt packages/engine/command.ts packages/engine/command.test.ts`.

- [ ] **Step 4: Pass**

```bash
set -o pipefail
deno test --allow-read packages/engine/command.test.ts packages/engine/neutral.test.ts 2>&1 | tail -3
```
Expected: PASS.

- [ ] **Step 5: Commit**

```bash
git add packages/engine/command.ts packages/engine/command.test.ts
git commit -m "Engine: splitCommand reads a pasted carve line as the shell would"
```

---

### Task 3: `drawOf`, the CLI's pinned draw as an engine function

**Files:**
- Modify: `packages/engine/command.ts` (new `drawOf`)
- Modify: `packages/cli/carve.ts` (the two draw sites)
- Test: `packages/engine/command.test.ts`

**Interfaces:**
- Consumes: `drawParams`, `Move` from `./lab-simple.ts`; `ParsedArgs`.
- Produces: `export function drawOf(parsed: ParsedArgs, rng: () => number): { params: Params; moved: Move[] }`

- [ ] **Step 1: Failing tests**

```ts
Deno.test('drawOf without --randomized is the parsed knobs', () => {
  const parsed = parseArgs(['--width=30', '--height=40', '--seed=3', '--length=0.8', '--pstraight=0.9'])
  assertEquals(drawOf(parsed, () => 0.5).params, parsed.params)
})

Deno.test('drawOf with --randomized draws, and a pinned knob keeps its value', () => {
  const parsed = parseArgs(['--width=30', '--height=40', '--randomized', '--pstraight=0.9'])
  const low = drawOf(parsed, () => 0).params
  const high = drawOf(parsed, () => 0.999).params
  assertEquals(low.pStraight, 0.9)
  assertEquals(high.pStraight, 0.9)
  assert(PARAM_SPEC.some((s) => low[s.key] !== high[s.key]), 'the draw moved nothing')
})
```
Step 2: `deno test --allow-read packages/engine/command.test.ts 2>&1 | tail -5` — FAIL (`drawOf` not exported).

- [ ] **Step 3: Implement**

In `command.ts` (extend the import from `./lab-simple.ts` with `drawParams` and `type Move`):
```ts
/**
 * The knobs a parsed line carves: its choice, drawn when it says --randomized,
 * with the knobs it names pinned on top. Reading a pin back out of `params`
 * is sound because the draw never moves a pinned value (lab-simple.test.ts
 * sweeps it). Returned whole: the CLI prints `moved` as notes.
 */
export function drawOf(parsed: ParsedArgs, rng: () => number): { params: Params; moved: Move[] } {
  const pinned: Partial<Record<ParamKey, number>> = {}
  for (const key of parsed.pins) pinned[key] = parsed.params[key]
  return drawParams(parsed.choice, parsed.choice.random ? rng : null, pinned)
}
```
In `packages/cli/carve.ts`: replace the block from the comment "// The pins, by the value the parser read for each." through `const draw = drawParams(parsed.choice, parsed.choice.random ? Math.random : null, pinned)` with:
```ts
// --randomized draws like the lab: Math.random, not reproducible; the meta
// keeps the command, which is.
const draw = drawOf(parsed, Math.random)
```
and `forSeed` becomes:
```ts
/** The parameters of one seed: --randomized draws them anew for each, over the same pins. */
function forSeed(seed: number): Params {
  const d = drawOf({ ...parsed, choice: { ...parsed.choice, seed } }, Math.random)
  noteMoves(d.moved)
  return d.params
}
```
Import `drawOf` from `@arrowz/engine/command` (check how `carve.ts` imports `parseArgs` and use the same specifier); drop `drawParams` from its `@arrowz/engine/simple` import if nothing else uses it; delete `pinned` if nothing else reads it (`grep -n "pinned" packages/cli/carve.ts` — `pinned: parsed.pins` in the meta is a different field and stays).

`deno fmt packages/engine/command.ts packages/engine/command.test.ts packages/cli/carve.ts`.

- [ ] **Step 4: Pass**

```bash
set -o pipefail
deno test --allow-read packages/engine/command.test.ts 2>&1 | tail -2
deno task test 2>&1 | tail -2
deno task check 2>&1 | tail -2
```
Expected: all pass (the CLI's own carve tests prove the draw did not change).

- [ ] **Step 5: Commit**

```bash
git add packages/engine/command.ts packages/engine/command.test.ts packages/cli/carve.ts
git commit -m "Engine: drawOf is the pinned draw the CLI did by hand; carve uses it"
```

---

### Task 4: The words for a problem and for the command row

**Files:**
- Modify: `packages/engine/lab-i18n.ts` (EN and PL `ui`)
- Test: `packages/engine/lab-i18n.test.ts`

**Interfaces:**
- Produces dictionary keys (EN signatures; PL the same arity):
  `cmdLoad: string`, `cmdLoadNote: string`, `cmdDrawn: string`, `cmdIgnored: (list: string) => string`, `cmdProblems: (n: number) => string`, `cmdOr: string`,
  `argNoValue: (arg: string) => string`, `argUnexpected: (arg: string) => string`,
  `argRetiredUse: (arg: string, use: string) => string`, `argRetiredOneMode: (arg: string) => string`, `argRetiredBoard: (arg: string) => string`, `argRetiredSpacing: (arg: string, use: string) => string`,
  `argNotStart: (arg: string, words: string, min: number, max: number) => string`, `argOutside: (arg: string, min: number, max: number) => string`,
  `argNotNumber: (arg: string) => string`, `argNotNumberOrWords: (arg: string, words: string) => string`, `argNotWhole: (arg: string) => string`,
  `argNotTheme: (arg: string, themes: string) => string`, `argNotColour: (arg: string) => string`, `argNotColourList: (arg: string) => string`,
  `argPaletteTooLong: (arg: string, cap: number) => string`, `argUnknown: (arg: string) => string`, `argMissing: (flag: string) => string`, `argUnclosedQuote: (arg: string) => string`

- [ ] **Step 1: Failing test**

Append to `packages/engine/lab-i18n.test.ts` (it already imports `EN`, `PL`; check):
```ts
Deno.test('the command row and every parser problem have words in both languages', () => {
  assertEquals(EN.ui.argOutside('--width=2000', 4, 1000), '--width=2000 is outside 4..1000')
  assertEquals(PL.ui.argOutside('--width=2000', 4, 1000), '--width=2000 jest poza zakresem 4..1000')
  assertEquals(PL.ui.argRetiredUse('--stroke=0.4', '--line'), '--stroke=0.4 już nie istnieje; użyj --line')
  assertEquals(PL.ui.cmdProblems(1), '1 problem')
  assertEquals(PL.ui.cmdProblems(3), '3 problemy')
  assertEquals(PL.ui.cmdProblems(5), '5 problemów')
})
```
Step 2: `deno test --allow-read packages/engine/lab-i18n.test.ts 2>&1 | tail -5` — FAIL (type errors).

- [ ] **Step 3: The words**

EN, next to the other `cmd*` keys:
```ts
    // Pasting a carve line into the palette: its one row, and the parser's
    // problems as the lab says them (the token as typed is an argument).
    cmdLoad: 'Load this command',
    cmdLoadNote: 'command',
    cmdDrawn: 'drawn',
    cmdIgnored: (list: string) => `ignored: ${list}`,
    cmdProblems: (n: number) => (n === 1 ? '1 problem' : `${n} problems`),
    cmdOr: 'or',
    argNoValue: (arg: string) => `${arg} takes no value`,
    argUnexpected: (arg: string) => `${arg} is not a flag`,
    argRetiredUse: (arg: string, use: string) => `${arg} is gone; use ${use}`,
    argRetiredOneMode: (arg: string) => `${arg} is gone: the command has one mode now, drop it`,
    argRetiredBoard: (arg: string) => `${arg} is gone: a board file is always written, drop it`,
    argRetiredSpacing: (arg: string, use: string) => `${arg} is gone: the spacing strength is fixed now; use ${use}`,
    argNotStart: (arg: string, words: string, min: number, max: number) =>
      `${arg} is not ${words} and not a number in ${min}..${max}`,
    argOutside: (arg: string, min: number, max: number) => `${arg} is outside ${min}..${max}`,
    argNotNumber: (arg: string) => `${arg} is not a number`,
    argNotNumberOrWords: (arg: string, words: string) => `${arg} is not a number and not ${words}`,
    argNotWhole: (arg: string) => `${arg} is not a whole number`,
    argNotTheme: (arg: string, themes: string) => `${arg} is not a theme: ${themes}`,
    argNotColour: (arg: string) => `${arg} is not a #rrggbb colour`,
    argNotColourList: (arg: string) => `${arg} is not a list of #rrggbb colours`,
    argPaletteTooLong: (arg: string, cap: number) => `${arg} has more than ${cap} colours`,
    argUnknown: (arg: string) => `${arg} is not a flag this command knows`,
    argMissing: (flag: string) => `the command has no ${flag}`,
    argUnclosedQuote: (arg: string) => `a quote is not closed: ${arg}`,
```
PL:
```ts
    cmdLoad: 'Wczytaj tę komendę',
    cmdLoadNote: 'komenda',
    cmdDrawn: 'losowana',
    cmdIgnored: (list) => `pominięte: ${list}`,
    cmdProblems: (n) => `${n} ${plCount(n, 'problem', 'problemy', 'problemów')}`,
    cmdOr: 'albo',
    argNoValue: (arg) => `${arg} nie przyjmuje wartości`,
    argUnexpected: (arg) => `${arg} nie jest flagą`,
    argRetiredUse: (arg, use) => `${arg} już nie istnieje; użyj ${use}`,
    argRetiredOneMode: (arg) => `${arg} już nie istnieje: komenda ma teraz jeden tryb, usuń ją`,
    argRetiredBoard: (arg) => `${arg} już nie istnieje: plik planszy powstaje zawsze, usuń ją`,
    argRetiredSpacing: (arg, use) => `${arg} już nie istnieje: siła odstępu jest teraz stała; użyj ${use}`,
    argNotStart: (arg, words, min, max) => `${arg} to ani ${words}, ani liczba z zakresu ${min}..${max}`,
    argOutside: (arg, min, max) => `${arg} jest poza zakresem ${min}..${max}`,
    argNotNumber: (arg) => `${arg} nie jest liczbą`,
    argNotNumberOrWords: (arg, words) => `${arg} nie jest liczbą ani ${words}`,
    argNotWhole: (arg) => `${arg} nie jest liczbą całkowitą`,
    argNotTheme: (arg, themes) => `${arg} nie jest motywem: ${themes}`,
    argNotColour: (arg) => `${arg} nie jest kolorem #rrggbb`,
    argNotColourList: (arg) => `${arg} nie jest listą kolorów #rrggbb`,
    argPaletteTooLong: (arg, cap) => `${arg} ma więcej niż ${cap} kolorów`,
    argUnknown: (arg) => `${arg} to nieznana flaga`,
    argMissing: (flag) => `w komendzie brakuje ${flag}`,
    argUnclosedQuote: (arg) => `niezamknięty cudzysłów: ${arg}`,
```
`deno fmt packages/engine/lab-i18n.ts packages/engine/lab-i18n.test.ts`.

- [ ] **Step 4: Pass**

```bash
set -o pipefail
deno test --allow-read packages/engine/lab-i18n.test.ts packages/engine/glossary.test.ts packages/engine/comments.test.ts 2>&1 | tail -3
```
Expected: PASS. If the glossary refuses a word, change the word, not the guard.

- [ ] **Step 5: Commit**

```bash
git add packages/engine/lab-i18n.ts packages/engine/lab-i18n.test.ts
git commit -m "Lab words: the command row and the parser's problems, in both languages"
```

---

### Task 5: Reading, wording and loading a pasted command

**Files:**
- Create: `apps/lab/src/palette/pastedCommand.ts`
- Create: `apps/lab/src/palette/pastedCommand.test.ts`
- Modify: `apps/lab/src/state/recipe.slice.ts` (new `apply`)
- Modify: `apps/lab/src/state/view.slice.ts` (new `viewFieldsOf`)
- Modify: `apps/lab/src/library/BoardColumn.tsx` (`loadIntoLab` uses `viewFieldsOf`)

**Interfaces:**
- Consumes: `splitCommand`, `parseArgs`, `drawOf`, `COMMAND_PREFIX`, `type ArgProblem`, `type ParsedArgs` from `@arrowz/engine/command`; the Task 4 dictionary keys; `boardAnnotation(W, H, seed)` (existing key).
- Produces:
```ts
// recipe.slice.ts
apply(recipe: Recipe): void   // machine path: no edit counted
// view.slice.ts
export function viewFieldsOf(saved: View): Partial<ViewFields>
// pastedCommand.ts
export function isCommandQuery(query: string): boolean
export interface ReadCommand { readonly parsed: ParsedArgs; readonly problems: readonly ArgProblem[] }
export function readCommand(query: string): ReadCommand
export function problemWords(dict: Dict, problem: ArgProblem): string
export interface PastedRow { readonly command: Command; readonly problems: readonly string[] }
export function pastedRow(deps: CommandDeps, query: string): PastedRow
export function loadCommand(deps: CommandDeps, parsed: ParsedArgs): void
```

- [ ] **Step 1: `viewFieldsOf` (refactor, no behaviour change)**

In `view.slice.ts`, next to `lookOf`:
```ts
/** A stored or parsed view as the slice's fields: the highlight folds back into its flag and count. */
export function viewFieldsOf(saved: View): Partial<ViewFields> {
  return {
    cell: saved.cell,
    stroke: saved.stroke,
    headWidth: saved.headWidth,
    headHeight: saved.headHeight,
    rounded: saved.rounded !== false,
    colored: saved.colored,
    highlightLongest: saved.top > 0,
    ...(saved.top > 0 ? { top: saved.top } : {}),
    theme: saved.theme,
    palette: saved.palette,
    paper: saved.paper,
    ink: saved.ink,
    highlightColor: saved.highlight,
    pad: saved.pad,
    showPoints: saved.showPoints,
    pointColor: saved.pointColor,
    pointRadius: saved.pointRadius,
  }
}
```
and `BoardColumn.tsx`'s `loadIntoLab` becomes `view.apply(viewFieldsOf(meta.view))` (keep its comment about `start()` and move the "A stored board carries no highlight…" comment onto the `highlightLongest` line in `viewFieldsOf`). If `meta.view`'s type is not `View`, `tsc` says so — type the parameter as the narrower of the two that both callers satisfy.

Run `(cd apps/lab && pnpm exec vitest run src/library && pnpm run check)` — PASS (no behaviour change).

- [ ] **Step 2: `recipe.apply`**

In `RecipeState`:
```ts
  /** A whole recipe from outside (a pasted command), on the machine path: no edit is counted, so `useAutoRun` starts nothing. */
  apply(recipe: Recipe): void
```
and in `createRecipeSlice`'s return: `apply: (recipe) => write(() => recipe, false),`. Add to `recipe.slice.test.ts`:
```ts
it('applies a whole recipe without counting an edit', () => {
  const store = createStoreForTest() // use whatever the file already uses to build a fresh slice
  const before = store.getState().recipe.edits
  store.getState().recipe.apply({ W: 30, H: 40, lengths: 0.8, shape: 0.2, skeleton: 'on', random: true })
  expect(store.getState().recipe.value).toEqual({ W: 30, H: 40, lengths: 0.8, shape: 0.2, skeleton: 'on', random: true })
  expect(store.getState().recipe.edits).toBe(before)
})
```
(Read the top of `recipe.slice.test.ts` and build the slice the way its other cases do; check `Recipe`'s fields in `lab-simple.ts` and use them exactly.)

- [ ] **Step 3: Failing unit tests for the module**

`apps/lab/src/palette/pastedCommand.test.ts`:
```ts
import { buildCommand } from '@arrowz/engine/command'
import { dictionary } from '@arrowz/engine/i18n'
import { beforeEach, describe, expect, it } from 'vitest'
import type { RunControl } from '../run/useRun'
import { useStore } from '../state/store'
import { viewOf } from '../state/view.slice'
import type { CommandDeps } from './commands'
import { isCommandQuery, loadCommand, pastedRow, problemWords, readCommand } from './pastedCommand'

function deps(lang: 'en' | 'pl' = 'en') {
  const started: number[] = []
  const went: string[] = []
  const control: RunControl = { start: () => started.push(1), abort: () => {}, hold: () => {} }
  const d: CommandDeps = { control, navigate: (path) => went.push(path), dict: dictionary(lang) }
  return { d, started, went }
}

beforeEach(() => {
  useStore.setState((state) => ({ ui: { ...state.ui, mode: 'advanced', palette: true } }))
  useStore.getState().params.reset()
  useStore.getState().run.reset()
})

describe('a pasted command', () => {
  it('is recognised by its prefix or a leading flag, not by a word', () => {
    expect(isCommandQuery('deno task carve --width=9')).toBe(true)
    expect(isCommandQuery('  --width=9')).toBe(true)
    expect(isCommandQuery('width')).toBe(false)
    expect(isCommandQuery('-')).toBe(false)
  })

  it('reads a valid line into one choosable row naming its board and the ignored mode flags', () => {
    const { d } = deps()
    const row = pastedRow(d, 'deno task carve --width=30 --height=40 --seed=5 --svg --count=3')
    expect(row.problems).toEqual([])
    expect(row.command.disabled).toBe(false)
    expect(row.command.name).toBe('Load this command')
    expect(row.command.value).toBe(dictionary('en').t('boardAnnotation', 30, 40, 5))
    expect(row.command.note).toBe('ignored: --svg --count=3')
  })

  it('says drawn for a randomized line', () => {
    const row = pastedRow(deps().d, '--width=30 --height=40 --randomized')
    expect(row.command.value).toBe(`${dictionary('en').t('boardAnnotation', 30, 40, 7)} · drawn`)
  })

  it('lists every problem in Polish and cannot be chosen', () => {
    const row = pastedRow(deps('pl').d, "--width=2000 --nope --ink='#11")
    expect(row.command.disabled).toBe(true)
    expect(row.command.value).toBe('4 problemy')
    // The split's unclosed quote first, then the parser's: missing sizes lead its own list.
    expect(row.problems).toEqual([
      'niezamknięty cudzysłów: --ink=#11',
      'w komendzie brakuje --height',
      '--width=2000 jest poza zakresem 4..1000',
      '--nope to nieznana flaga',
    ])
  })

  it('words every kind of problem without English in Polish', () => {
    const pl = dictionary('pl')
    const en = dictionary('en')
    const lines = [
      '--width=9 --height=9 --colored=1',
      '--width=9 --height=9 seed',
      '--width=9 --height=9 --stroke=0.4',
      '--width=9 --height=9 --advanced',
      '--width=9 --height=9 --board',
      '--width=9 --height=9 --giantspacepen=1',
      '--width=9 --height=9 --start=sideways',
      '--width=2000 --height=9',
      '--width=9 --height=9 --lmax=x',
      '--width=9.5 --height=9',
      '--width=9 --height=9 --theme=nope',
      '--width=9 --height=9 --ink=red',
      '--width=9 --height=9 --palette=red',
      `--width=9 --height=9 --palette=${Array(9).fill('#112233').join(',')}`,
      '--width=9 --height=9 --nope',
      '--width=9',
      "--width=9 --height=9 --ink='#1",
    ]
    for (const line of lines) {
      const { problems } = readCommand(line)
      expect(problems.length, line).toBeGreaterThan(0)
      for (const p of problems) expect(problemWords(pl, p), line).not.toBe(problemWords(en, p))
    }
  })

  it('loads a lab command back: knobs, view, one run, the lab route', () => {
    const { d, started, went } = deps()
    useStore.getState().params.setMany({ W: 30, H: 40, seed: 5, pStraight: 0.9 })
    useStore.getState().view.apply({ colored: true, palette: ['#aa0000', '#00aa00'], ink: '#101010' })
    const state = useStore.getState()
    const line = buildCommand(state.params.values, viewOf(state.view))
    useStore.getState().params.reset()
    useStore.getState().view.apply({ colored: false, palette: [], ink: '' })
    const { parsed, problems } = readCommand(line)
    expect(problems).toEqual([])
    loadCommand(d, parsed)
    const after = useStore.getState()
    expect(after.params.values.pStraight).toBe(0.9)
    expect(after.params.values.W).toBe(30)
    expect(after.view.palette).toEqual(['#aa0000', '#00aa00'])
    expect(after.view.ink).toBe('#101010')
    expect(started).toEqual([1])
    expect(went).toEqual(['/'])
    expect(after.ui.palette).toBe(false)
  })

  it('switches the simple view to advanced for a line with pinned knobs, and keeps it for an everyday line', () => {
    const { d } = deps()
    useStore.getState().ui.setMode('simple')
    loadCommand(d, readCommand('--width=30 --height=40 --length=0.8').parsed)
    expect(useStore.getState().ui.mode).toBe('simple')
    expect(useStore.getState().recipe.value.lengths).toBe(0.8)
    loadCommand(d, readCommand('--width=30 --height=40 --pstraight=0.9').parsed)
    expect(useStore.getState().ui.mode).toBe('advanced')
    expect(useStore.getState().params.values.pStraight).toBe(0.9)
  })
})
```
Restore `ui.mode` in the last case (`try/finally` to the mode it found) and the view fields in the round-trip case — the store is shared across files.

- [ ] **Step 4: See them fail**

`(cd apps/lab && pnpm exec vitest run src/palette/pastedCommand.test.ts 2>&1 | tail -6)` — FAIL (module missing).

- [ ] **Step 5: The module**

`apps/lab/src/palette/pastedCommand.ts`:
```ts
import {
  type ArgProblem,
  COMMAND_PREFIX,
  drawOf,
  parseArgs,
  type ParsedArgs,
  splitCommand,
} from '@arrowz/engine/command'
import type { Dict } from '@arrowz/engine/i18n'
import { useStore } from '../state/store'
import { viewFieldsOf } from '../state/view.slice'
import type { Command, CommandDeps } from './commands'

/** A query that is a carve line: the prefix, or a leading flag. A lone dash is still a search. */
export function isCommandQuery(query: string): boolean {
  const q = query.trimStart()
  return q.startsWith(COMMAND_PREFIX) || q.startsWith('--')
}

export interface ReadCommand {
  readonly parsed: ParsedArgs
  readonly problems: readonly ArgProblem[]
}

/** The line split as a shell would, then parsed; an unclosed quote comes first. */
export function readCommand(query: string): ReadCommand {
  const split = splitCommand(query)
  const parsed = parseArgs(split.argv)
  return { parsed, problems: [...split.problems, ...parsed.problems] }
}

/** A problem as the lab says it; the token as typed is an argument, never part of the words. */
export function problemWords(dict: Dict, p: ArgProblem): string {
  const or = (list: readonly string[]) => list.join(` ${dict.t('cmdOr')} `)
  switch (p.kind) {
    case 'noValue':
      return dict.t('argNoValue', p.arg)
    case 'unexpectedArgument':
      return dict.t('argUnexpected', p.arg)
    case 'retired':
      if (p.why === 'oneMode') return dict.t('argRetiredOneMode', p.arg)
      if (p.why === 'boardAlways') return dict.t('argRetiredBoard', p.arg)
      if (p.why === 'spacingFixed') return dict.t('argRetiredSpacing', p.arg, or(p.use))
      return dict.t('argRetiredUse', p.arg, or(p.use))
    case 'notStart':
      return dict.t('argNotStart', p.arg, or(p.words), p.min, p.max)
    case 'outside':
      return dict.t('argOutside', p.arg, p.min, p.max)
    case 'notNumber':
      return p.words.length ? dict.t('argNotNumberOrWords', p.arg, or(p.words)) : dict.t('argNotNumber', p.arg)
    case 'notWhole':
      return dict.t('argNotWhole', p.arg)
    case 'notTheme':
      return dict.t('argNotTheme', p.arg, p.themes.join(', '))
    case 'notColour':
      return dict.t('argNotColour', p.arg)
    case 'notColourList':
      return dict.t('argNotColourList', p.arg)
    case 'paletteTooLong':
      return dict.t('argPaletteTooLong', p.arg, p.cap)
    case 'unknownFlag':
      return dict.t('argUnknown', p.arg)
    case 'missing':
      return dict.t('argMissing', p.arg)
    case 'unclosedQuote':
      return dict.t('argUnclosedQuote', p.arg)
  }
}

export interface PastedRow {
  readonly command: Command
  readonly problems: readonly string[]
}

/** The palette's one row in command mode, and the problems listed under it. */
export function pastedRow(deps: CommandDeps, query: string): PastedRow {
  const { dict } = deps
  const { parsed, problems } = readCommand(query)
  const { W, H, seed } = parsed.params
  const board = dict.t('boardAnnotation', W, H, seed)
  const ok = problems.length === 0
  return {
    command: {
      id: 'load-command',
      section: 'run',
      name: dict.t('cmdLoad'),
      note: parsed.rest.length > 0 ? dict.t('cmdIgnored', parsed.rest.join(' ')) : dict.t('cmdLoadNote'),
      value: ok ? (parsed.choice.random ? `${board} · ${dict.t('cmdDrawn')}` : board) : dict.t('cmdProblems', problems.length),
      hay: query,
      disabled: !ok,
      run: () => loadCommand(deps, parsed),
    },
    problems: problems.map((p) => problemWords(dict, p)),
  }
}

/**
 * Sets the lab to what the line carves and starts one run. Machine-path
 * setters only, and `start()`, not `generate()`: in the simple view with
 * randomise on, `generate` would draw over the pins just set.
 */
export function loadCommand(deps: CommandDeps, parsed: ParsedArgs): void {
  const { params, view, recipe, ui } = useStore.getState()
  ui.raiseClamped(params.setMany(drawOf(parsed, Math.random).params))
  view.apply(viewFieldsOf(parsed.view))
  const { seed: _seed, ...choice } = parsed.choice
  recipe.apply(choice)
  // The simple view shows no pins, and its randomise would drop them.
  if (parsed.pins.length > 0 && ui.mode === 'simple') ui.setMode('advanced')
  deps.navigate('/')
  ui.closePalette()
  deps.control.start()
}
```
If `Recipe` does not accept `choice` as it is after dropping `seed` (field names differ), map the fields explicitly and let `tsc` confirm. If the `_seed` rest binding trips lint (`no-unused-vars`), build the recipe object field by field instead.


- [ ] **Step 6: Pass**

```bash
set -o pipefail
pnpm nx build engine 2>&1 | tail -1
(cd apps/lab && pnpm exec vitest run src/palette src/state/recipe.slice.test.ts src/library 2>&1 | tail -4 && pnpm run check 2>&1 | tail -2 && pnpm run lint 2>&1 | tail -3)
```
Expected: PASS.

- [ ] **Step 7: Commit**

```bash
(cd apps/lab && pnpm exec prettier --write src/palette/pastedCommand.ts src/palette/pastedCommand.test.ts src/state/recipe.slice.ts src/state/recipe.slice.test.ts src/state/view.slice.ts src/library/BoardColumn.tsx)
git add apps/lab/src/palette/pastedCommand.ts apps/lab/src/palette/pastedCommand.test.ts apps/lab/src/state apps/lab/src/library/BoardColumn.tsx
git commit -m "Lab: read, word and load a pasted carve command"
```

---

### Task 6: ⌘K command mode

**Files:**
- Modify: `apps/lab/src/palette/CommandPalette.tsx`
- Modify: `apps/lab/src/design/palette.css` (the problem list)
- Test: `apps/lab/src/palette/CommandPalette.browser.test.tsx`

**Interfaces:**
- Consumes: `isCommandQuery`, `pastedRow` (Task 5).

- [ ] **Step 1: Failing browser tests**

Append to `CommandPalette.browser.test.tsx` (it mounts `CommandPalette` with a no-op `control`; give these cases a counting one):
```tsx
describe('a pasted command', () => {
  const counting = () => {
    const runs: number[] = []
    return { runs, control: { start: () => runs.push(1), abort: () => {}, hold: () => {} } satisfies RunControl }
  }

  it('shows one row, and loading it starts exactly one run', async () => {
    const { runs, control } = counting()
    const screen = render(
      <MemoryRouter initialEntries={['/']}>
        <CommandPalette control={control} />
      </MemoryRouter>,
    )
    const input = screen.container.querySelector<HTMLInputElement>('.fw-pal input')
    if (input === null) throw new Error('no input')
    await userEvent.fill(input, 'deno task carve --width=30 --height=40 --seed=5 --pstraight=0.9')
    const rows = screen.container.querySelectorAll('[role=option]')
    expect(rows).toHaveLength(1)
    expect(rows[0]?.textContent).toContain('Load this command')
    await userEvent.keyboard('{Enter}')
    expect(runs).toEqual([1])
    expect(useStore.getState().params.values.pStraight).toBe(0.9)
    expect(useStore.getState().ui.palette).toBe(false)
  })

  it('joins a command pasted over several lines', async () => {
    const screen = await mount()
    const input = screen.container.querySelector<HTMLInputElement>('.fw-pal input')
    if (input === null) throw new Error('no input')
    input.focus()
    await userEvent.paste('deno task carve --width=30 \\\n  --height=40 \\\n  --colored')
    expect(screen.container.querySelector('[role=option]')?.getAttribute('aria-disabled')).toBeNull()
  })

  it('lists every problem in Polish under a row that cannot be chosen', async () => {
    useStore.getState().lang.setLang('pl')
    const { runs, control } = counting()
    const screen = render(
      <MemoryRouter initialEntries={['/']}>
        <CommandPalette control={control} />
      </MemoryRouter>,
    )
    const input = screen.container.querySelector<HTMLInputElement>('.fw-pal input')
    if (input === null) throw new Error('no input')
    await userEvent.fill(input, '--width=2000 --nope')
    const row = screen.container.querySelector('[role=option]')
    expect(row?.getAttribute('aria-disabled')).toBe('true')
    const list = document.getElementById(row?.getAttribute('aria-describedby') ?? '')
    expect([...(list?.querySelectorAll('li') ?? [])].map((li) => li.textContent)).toEqual([
      'w komendzie brakuje --height',
      '--width=2000 jest poza zakresem 4..1000',
      '--nope to nieznana flaga',
    ])
    await userEvent.keyboard('{Enter}')
    expect(runs).toEqual([])
  })
})
```
Check `userEvent.paste` exists in this vitest version (`vitest/browser`); if not, set the value through the input's native setter and dispatch `input`, but keep the newline in the pasted text so the browser's own line-break stripping is what the case exercises. Reset `lang` to `'en'` in a `finally` in the Polish case (the file's `beforeEach` sets it, but restore anyway).

Step 2: `(cd apps/lab && pnpm exec vitest run src/palette/CommandPalette.browser.test.tsx 2>&1 | tail -6)` — FAIL.

- [ ] **Step 3: The palette**

In `PaletteDialog`: build `deps` once and reuse it for `buildCommands` and `pastedRow` (the `navigate` wrapper moves into a `useMemo` on `[control, navigate, pathname, dict]`). Then:
```tsx
  const pasted = useMemo(() => (isCommandQuery(query) ? pastedRow(deps, query) : null), [deps, query])
  const hits = useMemo(
    () => (pasted === null ? matchCommands(commands, query) : [pasted.command]),
    [pasted, commands, query],
  )
```
In the row's JSX, for the pasted row with problems add `aria-describedby="cmd-problems"`:
```tsx
              {...(pasted !== null && pasted.problems.length > 0 ? { 'aria-describedby': 'cmd-problems' } : {})}
```
and after the rows, inside `#cmd-list`:
```tsx
          {pasted !== null && pasted.problems.length > 0 ? (
            <ul id="cmd-problems" className="problems">
              {pasted.problems.map((text, at) => (
                <li key={at}>{text}</li>
              ))}
            </ul>
          ) : null}
```
(A `<ul>` inside a `role="listbox"` is not an option; if `jsx-a11y` or the a11y test objects, put the `<ul>` right after the `#cmd-list` div instead.)

`palette.css`:
```css
/* A pasted line's problems, under its one row. */
.fw-pal .problems {
  margin: 0;
  padding: 8px 16px 12px 32px;
  color: var(--error);
  font-size: 12px;
}
```
Check the `--error` token's contrast on the palette background with the file's existing AA helper if the palette tests have one; otherwise use the colour the palette already uses for `.empty` text.

- [ ] **Step 4: Pass**

```bash
set -o pipefail
(cd apps/lab && pnpm exec vitest run src/palette 2>&1 | tail -4 && pnpm run check 2>&1 | tail -2 && pnpm run lint 2>&1 | tail -3)
```
Expected: PASS.

- [ ] **Step 5: Commit**

```bash
(cd apps/lab && pnpm exec prettier --write src/palette src/design/palette.css)
git add apps/lab/src/palette apps/lab/src/design/palette.css
git commit -m "⌘K: a pasted carve line becomes one row that loads it, or lists why it cannot"
```

---

### Task 7: Documents and the full gate

**Files:**
- Modify: `lab-review.md`

- [ ] **Step 1: Statuses**

In `lab-review.md`, "### Feature parity" table: the row "Gap 1: read a command back in (`parseArgs`)" → status `fixed on \`lab/paste-command\``, note "paste a carve line into ⌘K". In "### What is still open", item 4 becomes:
```md
4. **Parity gaps, as product decisions:** closing rate over N seeds, Stop
   that keeps the partial board, and opening a `.board.json`. Pasting a
   `carve` command is done on `lab/paste-command`; the report rows and the
   ⌘K rows for the colour and element fields on `lab/report-parity`.
```

- [ ] **Step 2: Gates**

```bash
set -o pipefail
deno task verify 2>&1 | tail -2
pnpm nx run-many -t verify 2>&1 | grep -E "Successfully|failed" | tail -2
```
Expected: both green.

- [ ] **Step 3: Commit**

```bash
git add lab-review.md
git commit -m "Docs: pasting a carve command is done"
```

- [ ] **Step 4: Live pass (the controller)**

`ARROWZ_BOARDS_DIR=<copy of the main checkout's packages/cli/boards> pnpm nx serve lab`, Chrome, both languages: paste the lab's own command after changing knobs and colours (state comes back, one run); a hand-written everyday line with `--randomized` (drawn, different on a second paste); a multi-line command with backslashes; a broken line (problems listed, in Polish when PL).
