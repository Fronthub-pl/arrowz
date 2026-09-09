# Deno + TypeScript Rewrite Implementation Plan

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:subagent-driven-development (recommended) or superpowers:executing-plans to implement this plan task-by-task. Steps use checkbox (`- [ ]`) syntax for tracking.

**Goal:** Turn `prototype/` from Node `.mjs` into strictly typed TypeScript on Deno 2.9 without changing a single generated board.

**Architecture:** Phase 0 (one agent, sequential) records golden outputs from Node, formats the tree, adds `deno.json` and the type contract (`types.ts`, `engine.d.ts`), and converts the four small runtime-neutral modules. Phase 1 runs three streams in parallel worktrees against that contract: A engine, B Deno side (store, server, CLI), D browser (page, worker, bundle). Phase 2 (one agent) integrates, removes the `engine.d.ts` bridge, proves the golden set on Deno, and updates the docs.

**Tech Stack:** Deno 2.9.6 (`deno test`, `deno check`, `deno lint`, `deno fmt`, `deno bundle`, `deno compile`), TypeScript 6 strict, JSR `@std/assert` and `@std/path`. No npm, no Node.

**Spec:** `docs/superpowers/specs/2026-09-09-deno-typescript-rewrite-design.md`

## Global Constraints

- Everything in the repository is English (code, comments, tests, docs, commits); the chat is Polish. No attribution lines in commits or PRs.
- Boards are bit-identical before and after: the golden set of Task 1 must be reproduced in Task 12; the fingerprint tests in `engine.test`, `shortening.test`, `absorb.test`, `envelope.test` stay green.
- `compilerOptions`: `strict`, `noUncheckedIndexedAccess`, `exactOptionalPropertyTypes`. Lint: `recommended` + `no-explicit-any` + `no-non-null-assertion`. No `any`, no `!`, no `as unknown as` outside the two places this plan names.
- Engine rule for type fixes: never add a value-changing fallback (`?? 0`, `?? -1`, `|| 0`) to satisfy the compiler. Use a real check that already exists in the algorithm or the throwing `at()` helper (Task 9).
- The engine (`engine.ts`) and the modules `command.ts`, `lab-simple.ts`, `lab-presets.ts`, `lab-i18n.ts`, `types.ts` use no `Deno.`, DOM, `process` or `node:` API (guarded by `neutral.test.ts`, Task 10).
- `deno fmt` config: no semicolons, single quotes, line width 120. Every commit passes `deno fmt --check` on `.ts` files.
- Deno permissions live in `deno.json` tasks; the canonical command prefix is `deno task carve`.
- Work happens on branch `deno-typescript` (already holds the spec). Phase 1 streams use worktrees under `.claude/worktrees/` (gitignored) with branches `deno-engine`, `deno-side`, `deno-browser`; they are merged back into `deno-typescript` in Task 12.

---

## File structure

| File | Responsibility | Phase / stream |
| --- | --- | --- |
| `deno.json`, `deno.lock`, `.gitignore` | toolchain, tasks, pins | 0 |
| `prototype/fingerprints.json` | golden set recorded from Node (Task 1), read by `fingerprints.test.ts` | 0 |
| `prototype/types.ts` | shared domain types, `ParamKey` union | 0 |
| `prototype/engine.d.ts` | build-time contract for `engine.mjs`; deleted in Task 12 | 0 |
| `prototype/lab-presets.ts` + test | preset tree | 0 |
| `prototype/lab-i18n.ts` + test | EN source dictionary, PL translation, `Dictionary` type | 0 |
| `prototype/lab-simple.ts` + test | simple choice → params | 0 |
| `prototype/command.ts` + test | command text, parsers, `COMMAND_PREFIX` | 0 |
| `prototype/engine.ts` + 4 tests | generator, metrics, renderer | 1 A |
| `prototype/store.ts`, `lab-server.ts`, `carve.ts` + 3 tests, `neutral.test.ts` | Deno side | 1 B |
| `prototype/lab-page.ts`, `lab-worker.ts`, `lab.html`, `lab.sh` | browser | 1 D |
| `prototype/fingerprints.test.ts` | permanent golden guard | 2 |
| `CLAUDE.md`, `prototype/README.md` | docs | 2 |

Naming: the browser page script is `lab-page.ts` (not `lab.ts`) so it cannot be confused with `lab.sh` or the lab server.

---

# Phase 0 — golden set, formatting, contract, small modules

### Task 1: Record the golden set from Node

**Files:**
- Create: `prototype/fingerprints.json`
- Create (outside the repo): `/tmp/arrowz-golden/record.sh`, `/tmp/arrowz-golden/*.json`, `/tmp/arrowz-golden/tests.txt`, `/tmp/arrowz-golden/help*.txt`

**Interfaces:**
- Produces: `prototype/fingerprints.json` — `{ cases: { name: string; argv: string[] | null; fingerprint: string; pieces: number; maxLen: number | null }[] }`; Task 12 and `fingerprints.test.ts` read it.

- [ ] **Step 1: Write the recording script**

```sh
mkdir -p /tmp/arrowz-golden && cat > /tmp/arrowz-golden/record.sh <<'EOF'
#!/bin/sh
# Records --dry-run JSON lines from the CURRENT checkout. $1 = runtime label (node|deno).
set -e
cd "$(git rev-parse --show-toplevel)"
RT=$1; OUT=/tmp/arrowz-golden/$RT; mkdir -p "$OUT"
if [ "$RT" = node ]; then RUN="node prototype/carve.mjs"; else RUN="deno task carve"; fi
run() { name=$1; shift; $RUN "$@" | grep '^{' > "$OUT/$name.json"; echo "$name: $(jq -r .fingerprint "$OUT/$name.json")"; }
run defaults      --advanced --dry-run
run simple        --width=25 --height=50 --dry-run
run skeleton      --advanced --dry-run --w=100 --h=200 --giants=4
run tunnels       --advanced --dry-run --w=100 --h=200 --headbias=1
run layers        --advanced --dry-run --w=100 --h=100 --mix=0.5
run corner        --width=200 --height=200 --length=0 --straight=0 --dry-run
run longstraight  --width=200 --height=200 --length=1 --straight=1 --skeleton --dry-run
run big500        --advanced --dry-run --w=500 --h=500
EOF
chmod +x /tmp/arrowz-golden/record.sh
```

- [ ] **Step 2: Run it on Node and record the void case, the test list and the help texts**

```sh
cd /Users/tomek/dev/arrowz
/tmp/arrowz-golden/record.sh node
node --input-type=module -e "
import { generate, defaultParams, fingerprint } from './prototype/engine.mjs'
const r = generate({ ...defaultParams(), W: 40, H: 40, seed: 1, voidFrac: 0.1 }, { unchecked: true })
console.log(JSON.stringify({ fingerprint: fingerprint(r.board), pieces: r.board.pieces.length, ok: r.ok }))
" > /tmp/arrowz-golden/node/voids.json
node --test 'prototype/*.test.mjs' 2>&1 | tee /tmp/arrowz-golden/tests-node.txt | tail -8
node --test --test-reporter=tap 'prototype/*.test.mjs' 2>/dev/null | grep -E '^ok|^not ok' | sed -E 's/^(ok|not ok) [0-9]+ - //' | sort > /tmp/arrowz-golden/tests.txt
wc -l /tmp/arrowz-golden/tests.txt
node prototype/carve.mjs --help > /tmp/arrowz-golden/help-simple.txt
node prototype/carve.mjs --advanced --help > /tmp/arrowz-golden/help-advanced.txt
```

Expected: eight fingerprints printed (`big500` = `298c749e`), all Node tests pass, `tests.txt` holds one title per test.

- [ ] **Step 3: Write `prototype/fingerprints.json` from the recordings**

```sh
cd /Users/tomek/dev/arrowz && jq -n '
  def c(name; argv): { name: name, argv: argv,
    fingerprint: (input | .fingerprint), pieces: (input | .pieces), maxLen: (input | .maxLen // null) };
  { cases: [
    c("defaults";     ["--advanced","--dry-run"]),
    c("simple";       ["--width=25","--height=50","--dry-run"]),
    c("skeleton";     ["--advanced","--dry-run","--w=100","--h=200","--giants=4"]),
    c("tunnels";      ["--advanced","--dry-run","--w=100","--h=200","--headbias=1"]),
    c("layers";       ["--advanced","--dry-run","--w=100","--h=100","--mix=0.5"]),
    c("corner";       ["--width=200","--height=200","--length=0","--straight=0","--dry-run"]),
    c("longstraight"; ["--width=200","--height=200","--length=1","--straight=1","--skeleton","--dry-run"]),
    c("big500";       ["--advanced","--dry-run","--w=500","--h=500"]),
    c("voids";        null)
  ] }' /tmp/arrowz-golden/node/defaults.json /tmp/arrowz-golden/node/simple.json \
       /tmp/arrowz-golden/node/skeleton.json /tmp/arrowz-golden/node/tunnels.json \
       /tmp/arrowz-golden/node/layers.json /tmp/arrowz-golden/node/corner.json \
       /tmp/arrowz-golden/node/longstraight.json /tmp/arrowz-golden/node/big500.json \
       /tmp/arrowz-golden/node/voids.json > prototype/fingerprints.json
jq '.cases | length' prototype/fingerprints.json
```

Expected: `9`. The `voids` case has `argv: null` and is reproduced through `generate` in `fingerprints.test.ts` with `{ W: 40, H: 40, seed: 1, voidFrac: 0.1 }` and `{ unchecked: true }`.

- [ ] **Step 4: Commit**

```bash
git add prototype/fingerprints.json
git commit -m "Golden fingerprints recorded from Node before the Deno rewrite"
```

---

### Task 2: Format the `.mjs` tree with `deno fmt` (no behaviour change)

**Files:**
- Create: `deno.json` (fmt section only for now; Task 3 completes it)
- Modify: every `prototype/*.mjs`

- [ ] **Step 1: Create the minimal `deno.json`**

```json
{
  "fmt": {
    "semiColons": false,
    "singleQuote": true,
    "lineWidth": 120,
    "exclude": ["**/*.md", "prototype/lab.html", "prototype/boards/", "prototype/dist/", "docs/"]
  }
}
```

- [ ] **Step 2: Format and prove nothing changed**

```sh
cd /Users/tomek/dev/arrowz
cp -r /tmp/arrowz-golden/node /tmp/arrowz-golden/node-before-fmt
deno fmt prototype/
git diff --stat | tail -1
node --test 'prototype/*.test.mjs' 2>&1 | tail -4
/tmp/arrowz-golden/record.sh node
diff <(cd /tmp/arrowz-golden/node-before-fmt && for f in *.json; do echo "$f $(jq -r .fingerprint $f)"; done) \
     <(cd /tmp/arrowz-golden/node && for f in *.json; do echo "$f $(jq -r .fingerprint $f)"; done) && echo FINGERPRINTS_UNCHANGED
```

Expected: all Node tests pass and `FINGERPRINTS_UNCHANGED` is printed (the eight CLI cases re-recorded after formatting equal the ones from Task 1).

- [ ] **Step 3: Commit**

```bash
git add deno.json prototype/
git commit -m "Format the prototype with deno fmt; no behaviour change"
```

---

### Task 3: `deno.json`, `.gitignore`, `types.ts`

**Files:**
- Modify: `deno.json`, `.gitignore`
- Create: `prototype/types.ts`, `deno.lock`

**Interfaces:**
- Produces: every type in `types.ts` below; all later tasks import from `./types.ts` with `import type`.

- [ ] **Step 1: Write the full `deno.json`**

```json
{
  "compilerOptions": {
    "strict": true,
    "noUncheckedIndexedAccess": true,
    "exactOptionalPropertyTypes": true
  },
  "imports": {
    "@std/assert": "jsr:@std/assert@^1",
    "@std/path": "jsr:@std/path@^1"
  },
  "fmt": {
    "semiColons": false,
    "singleQuote": true,
    "lineWidth": 120,
    "exclude": ["**/*.md", "prototype/lab.html", "prototype/boards/", "prototype/dist/", "docs/"]
  },
  "lint": {
    "rules": { "tags": ["recommended"], "include": ["no-explicit-any", "no-non-null-assertion"] }
  },
  "exclude": ["docs/", "prototype/boards/", "prototype/dist/"],
  "tasks": {
    "test": "deno test --allow-read --allow-write --allow-env --allow-run --allow-net prototype/",
    "check": "deno check prototype/*.ts",
    "lint": "deno lint",
    "fmt": "deno fmt --check",
    "verify": "deno task check && deno task lint && deno task fmt && deno task test",
    "carve": "deno run --allow-read --allow-write --allow-env prototype/carve.ts",
    "bundle": "deno bundle --platform browser --outdir prototype/dist --sourcemap linked prototype/lab-page.ts prototype/lab-worker.ts",
    "lab": "sh prototype/lab.sh",
    "compile": "deno compile --allow-read --allow-write --allow-env -o prototype/dist/carve prototype/carve.ts"
  }
}
```

- [ ] **Step 2: Add `prototype/dist/` to `.gitignore`**

```sh
printf 'prototype/dist/\n' >> /Users/tomek/dev/arrowz/.gitignore
```

- [ ] **Step 3: Write `prototype/types.ts`**

```ts
// Shared domain types of the prototype. Nothing here depends on a runtime
// value: the engine, the CLI, the store, the lab page and the worker all
// import from this file, so a misspelt key anywhere fails to compile.

/** The knob keys of PARAM_SPEC. Listed once; engine.ts asserts its table has exactly these keys. */
export type ParamKey =
  | 'W' | 'H' | 'seed'
  | 'wShort' | 'wMid' | 'Lmax'
  | 'pStraight' | 'wLateral' | 'warns' | 'anticoil' | 'hug' | 'edgeHug'
  | 'headBias' | 'mix' | 'probe' | 'probeLen'
  | 'giants' | 'giantSpan' | 'giantStep' | 'giantJitter' | 'wGiant' | 'giantStraight' | 'giantWarns'
  | 'giantAnticoil' | 'giantSpacing' | 'giantSpacePenalty'
  | 'headTries' | 'strandLimit' | 'absorbLimit' | 'maxBack' | 'restarts'

export type ParamGroup = 'board' | 'lengths' | 'shape' | 'difficulty' | 'skeleton' | 'closing'
export type InactiveKey = 'skeletonOff' | 'hugOff' | 'mixOn' | 'probeOff' | 'stepZero' | 'spanZero'
export type RuleKey = 'sharesSum' | 'lmaxHole' | 'mixHole'

export interface TraceInfo {
  pieces: number
  remaining: number
  backtracks: number
  ms: number
  total: number
}

/** A full engine parameter set: every knob, the two engine-only fields, and the optional hooks. */
export type Params = Record<ParamKey, number> & {
  ruleB: boolean
  voidFrac: number
  trace?: (info: TraceInfo) => void
  debug?: (msg: string) => void
}

export interface ParamSpec {
  key: ParamKey
  label: string
  group: ParamGroup
  min: number
  max: number
  step: number
  def: number
  help: string
  inactive?: (p: Params) => InactiveKey | null
}

export type Violation =
  | { kind: 'range'; key: ParamKey; value: unknown; min: number; max: number }
  | { kind: 'rule'; key: RuleKey; keys: readonly ParamKey[] }

export interface Cell {
  x: number
  y: number
}

export interface Piece {
  id: number
  cells: Cell[]
  dir: number
  /** Set by absorbLeftover when a tail is rewritten; read by the absorption memo. */
  tailVersion?: number
}

export interface CarverStats {
  want: number
  got: number
  stall: number
  strandTrunc: number
  strandLoss: number
  n: number
  absorbed?: number
  absorbs?: number
  absorbScanned?: number
  headScans?: number
  headScanHits?: number
}

/** The public surface of a carved board that analyse, render, toSvg and fingerprint read. */
export interface Board {
  W: number
  H: number
  owner: Int32Array
  pieces: Piece[]
  stats: CarverStats
  backtracks: number
  remaining: number
}

export type HistBucket = '2-6' | '7-15' | '16-49' | '50+'

export interface Metrics {
  N: number
  solvable: boolean
  unsolved: number
  f0: number
  T2: number
  almost: number
  D: number
  bends: number
  multiLine: number
  coil: number
  selfAdj: number
  bendsPerCell: number
  span: number
  spanTop10: number
  spanMax: number
  outDeg: number
  maxOut: number
  blockDist: number
  neighbours: number
  sharedBorder: number
  longPieces: number
  meanCorridorLen: number
  minLen: number
  maxLen: number
  hist: Record<HistBucket, number>
  coverage: number
}

export interface Stuck {
  remaining: number
  sizes: number[]
  heads: number | null
}

export interface GenerateResult {
  board: Board
  metrics: Metrics | null
  ok: boolean
  restartsUsed: number
  backtracks: number
  genMs: number
  metricsMs: number
  stuck: Stuck | null
}

export interface SvgOptions {
  cell?: number
  colored?: boolean
  top?: number
  voids?: boolean
  strokeRatio?: number
  headWidth?: number
  headHeight?: number
}

/** View options of the lab and the CLI (the shape of DEFAULT_VIEW). */
export interface View {
  cell: number
  stroke: number
  headWidth: number
  headHeight: number
  colored: boolean
  top: number
}

export type Range = { lo: number; hi: number; def: number } | { pick: readonly number[]; def: number }

export interface SimpleChoice {
  W: number
  H: number
  lengths: number
  shape: number
  skeleton: 'off' | 'on'
  seed: number
  random?: boolean
}

export type PresetMode = 'square' | 'portrait' | 'tunnels' | 'skeleton' | 'serpentine'

export interface Preset {
  id: string
  mode: PresetMode
  params: Partial<Record<ParamKey, number>>
}

export interface PresetLevel {
  id: string
  options: Preset[]
}

/** One stored board: the JSON next to the SVG in prototype/boards/<WxH>/. */
export interface BoardMeta {
  id: string
  W: number
  H: number
  seed: number
  params: Params
  view: View
  command: string
  simpleCommand?: string
  source: string
  createdAt: string
  updatedAt: string
  ok: boolean | null
  pieces: number | null
  maxLen: number | null
  genMs: number | null
  svgBytes: number
}

export interface BoardSize {
  size: string
  W: number
  H: number
  cells: number
  boards: BoardMeta[]
}

export interface LongestSummary {
  len: number
  sx: number
  sy: number
  span: number
  density: number
  coil: number
}

export type WorkerIn =
  | { type: 'generate'; params: Params; view: View; tag?: string }
  | { type: 'render'; view: View; tag?: string }

export type WorkerOut =
  | { type: 'progress'; info: TraceInfo }
  | { type: 'error'; message: string }
  | {
    type: 'done'
    ok: boolean
    metrics: Metrics | null
    backtracks: number
    restartsUsed: number
    genMs: number
    metricsMs: number
    totalMs: number
    stuck: Stuck | null
    pieces: number
    stats: CarverStats
  }
  | { type: 'render'; svg: string; longest: LongestSummary[]; tag?: string }
```

Note: `trace` and `debug` cannot cross `postMessage`; the worker adds them after receiving `params`, as today.

- [ ] **Step 4: Check, lock, commit**

```sh
cd /Users/tomek/dev/arrowz
deno check prototype/types.ts && deno fmt --check prototype/types.ts && deno lint prototype/types.ts
deno cache prototype/types.ts   # writes deno.lock (empty of remotes for now; @std lands with the first test)
git add deno.json deno.lock .gitignore prototype/types.ts
git commit -m "Deno toolchain: deno.json with strict TypeScript, tasks and the shared domain types"
```

If `deno.lock` is not created yet, commit it in Task 5 together with the first `@std/assert` import.

---

### Task 4: `engine.d.ts` — the build-time contract

**Files:**
- Create: `prototype/engine.d.ts`

**Interfaces:**
- Produces: the exact export list of `engine.ts`. Streams B and D import `./engine.mjs` with `// @ts-types="./engine.d.ts"`; stream A must make `engine.ts` satisfy this file (Task 9 step 9).

- [ ] **Step 1: Write `prototype/engine.d.ts`**

```ts
// Build-time declaration of engine.mjs, used through `// @ts-types="./engine.d.ts"`
// until engine.ts exists. Every method of Carver is public: the tests subclass
// the carver and replace absorbPath on the prototype.
import type {
  Board, CarverStats, Cell, GenerateResult, InactiveKey, Metrics, Params, ParamSpec, Piece, RuleKey,
  SvgOptions, Violation,
} from './types.ts'

export const DIRS: readonly { dx: number; dy: number }[]
export function mulberry32(seed: number): () => number

export class InvalidParamsError extends RangeError {
  readonly violations: readonly Violation[]
  constructor(violations: readonly Violation[])
}

export class Carver implements Board {
  constructor(W: number, H: number, params: Params, rng: () => number)
  W: number
  H: number
  p: Params
  rng: () => number
  owner: Int32Array
  pieces: Piece[]
  remaining: number
  backtracks: number
  stats: CarverStats
  version: number
  touched: Int32Array
  absorbMemo: Map<number, { version: number; pieces: Piece[] }>
  stuckRemaining?: number
  stuckSizes?: number[]
  stuckHeads?: number
  idx(x: number, y: number): number
  inside(x: number, y: number): boolean
  touch(cells: readonly Cell[]): void
  recomputeLines(cells: readonly Cell[]): void
  decomposable(cellSet: ReadonlySet<number>): boolean
  hasLocalDefect(cells: readonly Cell[]): boolean
  wouldStrand(cells: readonly Cell[], failed?: Set<number> | null): boolean
  legalHeadCount(): number
  absorbLeftover(): boolean
  absorbPath(comp: readonly number[], pc: Piece, k: number): Int32Array | null
  leftoverReport(): number[]
  run(maxBacktracks?: number): boolean
}

export const PARAM_SPEC: readonly ParamSpec[]
export const INACTIVE_REASONS: Record<InactiveKey, string>
export const RULES: readonly { key: RuleKey; keys: readonly ParamKey[]; check: (p: Params) => boolean }[]
export const RULE_REASONS: Record<RuleKey, string>
export function defaultParams(): Params
export function validateParams(params: Params): Violation[]
export function formatViolation(v: Violation): string
export function generate(params: Params, opts?: { unchecked?: boolean }): GenerateResult
export function analyse(board: Board, ruleB?: boolean): Metrics
export function render(board: Board): string
export function toSvg(board: Board, opts?: SvgOptions): string
export function fingerprint(board: Board): string
```

Add `ParamKey` to the import list (it is used by `RULES`).

- [ ] **Step 2: Verify the directive types a consumer**

```sh
cd /Users/tomek/dev/arrowz && cat > prototype/_probe.ts <<'EOF'
// @ts-types="./engine.d.ts"
import { defaultParams, generate } from './engine.mjs'
const r = generate({ ...defaultParams(), W: 10, H: 10 })
const bad: string = r.board.W
console.log(bad)
EOF
deno check prototype/_probe.ts; rm prototype/_probe.ts
```

Expected: exactly one error, `Type 'number' is not assignable to type 'string'` — the contract is in force.

- [ ] **Step 3: Commit**

```bash
git add prototype/engine.d.ts
git commit -m "engine.d.ts: the typed contract of the engine for the parallel rewrite"
```

---

### Task 5: `lab-presets.ts` — the pattern module and the test-port pattern

**Files:**
- Rename: `prototype/lab-presets.mjs` → `prototype/lab-presets.ts`
- Rename: `prototype/lab-presets.test.mjs` → `prototype/lab-presets.test.ts`
- Modify: `prototype/lab-simple.mjs`, `prototype/envelope.test.mjs` (import path only)

**Interfaces:**
- Produces: `PRESETS: readonly PresetLevel[]`, `findPreset(params: Params): Preset | null`.

- [ ] **Step 1: Rename and type the module**

```sh
cd /Users/tomek/dev/arrowz && git mv prototype/lab-presets.mjs prototype/lab-presets.ts && git mv prototype/lab-presets.test.mjs prototype/lab-presets.test.ts
```

Replace the contents of `prototype/lab-presets.ts` with:

```ts
// Presets for the lab: a tree of difficulty levels, each with a few options.
// An option is a full configuration = engine defaults + these overrides, so
// choosing one never inherits knobs left over from the previous experiment.
// Labels come from the dictionaries (lab-i18n.ts) by level id and mode.
import type { Params, Preset, PresetLevel } from './types.ts'

function level(id: string, side: number, tall: number): PresetLevel {
  return {
    id,
    options: [
      { id: `${id}-square`, mode: 'square', params: { W: side, H: side } },
      { id: `${id}-portrait`, mode: 'portrait', params: { W: side, H: tall } },
      { id: `${id}-tunnels`, mode: 'tunnels', params: { W: side, H: tall, headBias: 1 } },
      { id: `${id}-skeleton`, mode: 'skeleton', params: { W: side, H: tall, giants: 4 } },
    ],
  }
}

export const PRESETS: readonly PresetLevel[] = [
  level('easy', 25, 50),
  level('medium', 50, 100),
  level('hard', 75, 150),
  level('nightmare', 100, 200),
  level('extreme', 200, 400),
  {
    id: 'huge',
    options: [
      { id: 'huge-400', mode: 'square', params: { W: 400, H: 400 } },
      { id: 'huge-400-skeleton', mode: 'skeleton', params: { W: 400, H: 400, giants: 4 } },
      // Winding skeletons: every run is cut short (jitter 1), so no line goes
      // wall to wall, and a step of 3 keeps the snake long. Measured at 400×400,
      // seed 7: longest skeleton 2481 cells with 365 bends and a longest straight
      // run of 42 (defaults: 4065 cells, 72 bends, a run of 399).
      { id: 'huge-400-serpentine', mode: 'serpentine', params: { W: 400, H: 400, giants: 4, giantStep: 3, giantJitter: 1 } },
    ],
  },
  // The project ceiling: a million cells, ~90 000 pieces. Square only, like
  // Extreme in the game — a 1000×2000 portrait would double a generation that
  // already takes ~10 s in Node and ~27 s in a Chrome worker.
  {
    id: 'insane',
    options: [
      { id: 'insane-square', mode: 'square', params: { W: 1000, H: 1000 } },
      { id: 'insane-tunnels', mode: 'tunnels', params: { W: 1000, H: 1000, headBias: 1 } },
      { id: 'insane-skeleton', mode: 'skeleton', params: { W: 1000, H: 1000, giants: 4 } },
    ],
  },
]

/** Typed Object.keys for a preset's overrides. */
function overrideKeys(p: Preset): (keyof Preset['params'])[] {
  return Object.keys(p.params) as (keyof Preset['params'])[]
}

/**
 * The option matching the current parameters, or null. The most specific
 * match wins: "portrait" is a subset of "tunnels", so with tunnels on the
 * tunnels option is the answer. Knobs outside the preset are ignored.
 */
export function findPreset(params: Params): Preset | null {
  let best: Preset | null = null
  for (const l of PRESETS) {
    for (const o of l.options) {
      const keys = overrideKeys(o)
      const matches = keys.every((k) => params[k] === o.params[k])
      if (matches && keys.length > (best ? overrideKeys(best).length : 0)) best = o
    }
  }
  return best
}
```

`Object.keys` returns `string[]`; the single `as (keyof …)[]` in `overrideKeys` is the one typed-keys helper the module needs (the object literal is ours, so the cast is sound). This is the pattern for every "keys of a record" loop in the other modules: one small helper with the cast, never an inline `as` at the use site.

- [ ] **Step 2: Fix the two remaining `.mjs` importers**

```sh
cd /Users/tomek/dev/arrowz
sed -i '' "s#from './lab-presets.mjs'#from './lab-presets.ts'#" prototype/lab-simple.mjs prototype/envelope.test.mjs prototype/lab-simple.test.mjs
grep -rn "lab-presets.mjs" prototype/ ; echo "(no output above = clean)"
```

`prototype/lab.html` still imports `./lab-presets.mjs`; the lab is down until stream D (Task 11) — expected, see the note after Task 8.

- [ ] **Step 3: Port the test — the pattern for every test port**

Rules, applied to `prototype/lab-presets.test.ts` now and to every other test file later:

1. `import { test } from 'node:test'` → delete; `test('title', () => …)` → `Deno.test('title', () => …)`. Titles unchanged.
2. `import assert from 'node:assert/strict'` → `import { assert, assertEquals, assertMatch, assertNotEquals, assertThrows } from '@std/assert'`; then `assert.equal(a, b, msg)` → `assertEquals(a, b, msg)`, `assert.deepEqual` → `assertEquals`, `assert.ok(x, msg)` → `assert(x, msg)`, `assert.match(s, re, msg)` → `assertMatch(s, re, msg)`, `assert.notEqual` → `assertNotEquals`, `assert.throws(fn, matcher)` → `assertThrows(fn, ErrorClass?, msgIncludes?)` (see the specific call sites in Tasks 8 and 9).
3. Imports of modules already `.ts` use `.ts`; imports of modules still `.mjs` keep `.mjs` **with** the `// @ts-types` line for the engine (Task 4).
4. Test helpers get parameter types; a helper that reads a record with a string key gets a typed-keys helper like `overrideKeys` above.
5. `deno test --allow-read prototype/x.test.ts` green, `deno check prototype/x.test.ts` clean, `deno lint prototype/x.test.ts` clean.

Header of the ported `lab-presets.test.ts`:

```ts
import { assert, assertEquals } from '@std/assert'
import { findPreset, PRESETS } from './lab-presets.ts'
// @ts-types="./engine.d.ts"
import { defaultParams, PARAM_SPEC, validateParams } from './engine.mjs'
import { EN, PL } from './lab-i18n.mjs'
import type { ParamKey, ParamSpec } from './types.ts'

const specs = new Map<ParamKey, ParamSpec>(PARAM_SPEC.map((s) => [s.key, s]))
const overrideKeys = (p: { params: Partial<Record<ParamKey, number>> }) => Object.keys(p.params) as ParamKey[]
```

The `Object.entries(o.params)` loop becomes `for (const k of overrideKeys(o)) { const v = o.params[k]; const s = specs.get(k); assert(s && v !== undefined, …); assert(v >= s.min && v <= s.max, …) }`. `lab-i18n.mjs` is still untyped at this point (Task 6 fixes it); `EN.presets.levels[level.id]`-style reads compile because JS imports are inferred — if inference makes one of them an error, add `// @ts-expect-error i18n typed in Task 6` on that line and remove it in Task 6.

- [ ] **Step 4: Run, lint, commit**

```sh
cd /Users/tomek/dev/arrowz
deno test --allow-read prototype/lab-presets.test.ts && deno check prototype/lab-presets.ts prototype/lab-presets.test.ts && deno lint prototype/lab-presets.ts prototype/lab-presets.test.ts && deno fmt --check prototype/lab-presets.ts prototype/lab-presets.test.ts
git add -A prototype/ deno.lock
git commit -m "lab-presets in TypeScript; its test on Deno.test"
```

Expected: 5 tests pass (the titles from `tests.txt` that start with "every preset"/"preset"/"findPreset").

---

### Task 6: `lab-i18n.ts` with a `Dictionary` type

**Files:**
- Rename: `prototype/lab-i18n.mjs` → `prototype/lab-i18n.ts`; `prototype/lab-i18n.test.mjs` → `prototype/lab-i18n.test.ts`
- Modify: `prototype/lab-presets.test.ts`, `prototype/lab-simple.test.mjs` (import path)

**Interfaces:**
- Produces: `EN: Dictionary`, `PL: Translation`, types `Dictionary`, `Translation`, `UiKey`, `UiArgs<K>`.

- [ ] **Step 1: Rename**

```sh
cd /Users/tomek/dev/arrowz && git mv prototype/lab-i18n.mjs prototype/lab-i18n.ts && git mv prototype/lab-i18n.test.mjs prototype/lab-i18n.test.ts
sed -i '' "s#from './lab-i18n.mjs'#from './lab-i18n.ts'#" prototype/lab-presets.test.ts prototype/lab-simple.test.mjs
```

- [ ] **Step 2: Reorder and type the module**

The file currently defines `PL` first, then `EN`. Move `EN` above `PL` (the type derives from `EN`). Replace the two `export const` headers and add the types between them:

```ts
// English is the source language and lives in PARAM_SPEC / lab.html / EN;
// PL only holds the translation, checked against EN's shape by the compiler.
import type { InactiveKey, ParamKey, RuleKey } from './types.ts'

export const EN = {
  // …the existing EN object, unchanged…
} as const

/** A string leaf stays a string; a function leaf keeps its exact parameter list. */
type Widen<T> = T extends string ? string
  : T extends (...args: infer A) => string ? (...args: A) => string
  : { [K in keyof T]: Widen<T[K]> }

/** The shape every language must have: EN's keys, with leaves widened. */
export type Dictionary = Widen<typeof EN>
export type UiKey = keyof Dictionary['ui']
/** Arguments of a ui entry: none for a string, the function's parameters otherwise. */
export type UiArgs<K extends UiKey> = Dictionary['ui'][K] extends (...args: infer A) => string ? A : []

/** The translation carries what EN does not: knob texts and reason texts live in the engine tables in English. */
export type Translation = Dictionary & {
  reasons: Record<InactiveKey | RuleKey, string>
  params: Record<ParamKey, { label: string; help: string }>
}

export const PL: Translation = {
  // …the existing PL object, unchanged…
}
```

Then `deno check prototype/lab-i18n.ts`. Every error is one of: a PL key missing (add the translation — but there should be none, the Node test proved coverage), a PL function with a different arity than EN (make them equal), or a reason/param key that is not in the engine tables (fix the key). No error may be silenced.

- [ ] **Step 3: Port the test**

Apply the pattern of Task 5 step 3. The four tests keep their titles. Typed-keys helpers needed:

```ts
import type { InactiveKey, ParamKey, RuleKey } from './types.ts'
const ruleKeys: RuleKey[] = ['sharesSum', 'lmaxHole', 'mixHole']
const reasonKeys = (o: Record<string, string>) => Object.keys(o) as (InactiveKey | RuleKey)[]
const uiKeys = (d: Dictionary) => Object.keys(d.ui) as UiKey[]
```

`assert.equal(INACTIVE_REASONS.stepNonZero, undefined, …)` reads a key that no longer exists; keep the assertion as `assert(!('stepNonZero' in INACTIVE_REASONS), 'stepNonZero was removed from the engine')`. `typeof PL.ui[k]` comparisons stay as they are. The `rangeViolation` call: `d.ui.rangeViolation('straightness bias', 0.4, 0.6, 1)` type-checks against EN's signature.

- [ ] **Step 4: Run, lint, commit**

```sh
cd /Users/tomek/dev/arrowz
deno test --allow-read prototype/lab-i18n.test.ts prototype/lab-presets.test.ts && deno check prototype/lab-i18n.ts prototype/lab-i18n.test.ts prototype/lab-presets.test.ts && deno lint prototype/lab-i18n.ts prototype/lab-i18n.test.ts && deno fmt --check prototype/lab-i18n.ts prototype/lab-i18n.test.ts
git add -A prototype/
git commit -m "lab-i18n in TypeScript: PL is checked against the shape of EN"
```

---

### Task 7: `lab-simple.ts`

**Files:**
- Rename: `prototype/lab-simple.mjs` → `prototype/lab-simple.ts`; `prototype/lab-simple.test.mjs` → `prototype/lab-simple.test.ts`
- Modify: `prototype/command.mjs`, `prototype/carve.mjs`, `prototype/carve.test.mjs`, `prototype/command.test.mjs` (import path)

**Interfaces:**
- Consumes: `Params`, `ParamKey`, `ParamSpec`, `Range`, `SimpleChoice` from `types.ts`; `PARAM_SPEC`, `defaultParams` from the engine via `@ts-types`.
- Produces: `SIMPLE_SIZES: readonly { id: string; W: number; H: number }[]`, `SIMPLE_CHOICES: { skeleton: readonly ['off', 'on'] }`, `SIMPLE_SLIDERS`, `exportCell(W: number, H: number): number`, `defaultChoice(): SimpleChoice`, `normalizeChoice(raw: unknown): SimpleChoice`, `simpleRanges(choice: SimpleChoice): Partial<Record<ParamKey, Range>>`, `simpleParams(choice: SimpleChoice, rng?: (() => number) | null): Params`.

- [ ] **Step 1: Rename and fix importers**

```sh
cd /Users/tomek/dev/arrowz && git mv prototype/lab-simple.mjs prototype/lab-simple.ts && git mv prototype/lab-simple.test.mjs prototype/lab-simple.test.ts
sed -i '' "s#from './lab-simple.mjs'#from './lab-simple.ts'#" prototype/command.mjs prototype/carve.mjs prototype/carve.test.mjs prototype/command.test.mjs
```

- [ ] **Step 2: Type the module**

Header:

```ts
import type { ParamKey, Params, ParamSpec, Range, SimpleChoice } from './types.ts'
// @ts-types="./engine.d.ts"
import { defaultParams, PARAM_SPEC } from './engine.mjs'
import { PRESETS } from './lab-presets.ts'

const specByKey = new Map<ParamKey, ParamSpec>(PARAM_SPEC.map((s) => [s.key, s]))
/** A knob's spec; every key used in this file is a PARAM_SPEC key, so a miss is a programming error. */
function specOf(key: ParamKey): ParamSpec {
  const s = specByKey.get(key)
  if (!s) throw new Error(`unknown parameter ${key}`)
  return s
}
```

Concrete typings, top to bottom:

- `const r = (lo: number, hi: number, def: number): Range => ({ lo, hi, def })`.
- `type Anchor = Partial<Record<ParamKey, Range>>`; `LENGTH_ANCHORS: readonly Anchor[]`, `SHAPE_ANCHORS: readonly Anchor[]`, `SHAPE_ANCHORS_BIG: readonly (Anchor | null)[]`, `SKELETON: Record<SimpleChoice['skeleton'], Anchor>`, `DIFFICULTY: Anchor`, `DIFFICULTY_BIG: Anchor`.
- `SIMPLE_CHOICES = { skeleton: ['off', 'on'] } as const satisfies { skeleton: readonly SimpleChoice['skeleton'][] }`.
- `SIMPLE_SLIDERS = { lengths: { anchors: LENGTH_ANCHORS }, shape: { anchors: SHAPE_ANCHORS, big: SHAPE_ANCHORS_BIG } } as const`; `type SliderKey = keyof typeof SIMPLE_SLIDERS` (`'lengths' | 'shape'`).
- `OLD_NAMES: Record<SliderKey, Record<string, number>>`.
- `normalizeChoice(raw: unknown): SimpleChoice` — narrow once at the top: `const src: Record<string, unknown> = typeof raw === 'object' && raw !== null ? (raw as Record<string, unknown>) : {}`. This is one of the two sanctioned `as` narrowings of `unknown` (the other is in `lab-page.ts` for JSON from the URL/localStorage). Build the result field by field into a `SimpleChoice`; the "extra fields ride along" behaviour keeps `random` only: `const random = src.random === true`. (The lab and the CLI never passed anything else through; `parseSimpleArgs` sets `random` explicitly.)
- `lerpRanges(anchors: readonly Anchor[], t: number): Anchor` — `const a = anchors[i]`, `const b = anchors[i + 1]`; both may be `undefined` under `noUncheckedIndexedAccess`; `anchors` always has ≥ 2 entries, so: `if (!a || !b) throw new Error('lerpRanges needs two anchors')`. Inside, `const ra = a[key]`, `const rb = b[key]`; the anchors of one slider all name the same keys, so `if (!ra || !rb) throw new Error(…)` likewise. `'pick' in ra` narrows the union.
- `snapRange(key: ParamKey, range: Range): Range` with `specOf(key)`.
- `simpleRanges(choice: SimpleChoice): Partial<Record<ParamKey, Range>>` — the merged object is an `Anchor`; iterate with a typed-keys helper `anchorKeys(a: Anchor) => Object.keys(a) as ParamKey[]`.
- `bigShape(t: number): Anchor | null`; the mapped `SHAPE_ANCHORS_BIG[3]` / `[4]` reads throw if `null`/`undefined` (they are literals in this file).
- `draw(key: ParamKey, range: Range, rng: (() => number) | null): number`; `range.pick[…]` may be `undefined`: `const v = range.pick[Math.min(range.pick.length - 1, Math.floor(rng() * range.pick.length))]; if (v === undefined) throw new Error('empty pick list'); return v`.
- `simpleParams(choice: SimpleChoice, rng: (() => number) | null = null): Params` — `const p: Params = { ...defaultParams(), W: c.W, H: c.H, seed: c.seed }`; `for (const key of anchorKeys(ranges)) { const range = ranges[key]; if (range) p[key] = draw(key, range, rng) }`.

- [ ] **Step 3: Port the test**

Pattern of Task 5. Typed helpers: `specs = new Map<ParamKey, ParamSpec>(…)`, `const choice = (over: Partial<SimpleChoice>): SimpleChoice => ({ ...defaultChoice(), ...over })`, `rangeKeys = (r: Partial<Record<ParamKey, Range>>) => Object.keys(r) as ParamKey[]`. Tests that pass old-style choices (`{ size: '100x200', lengths: 'short' }`) into `normalizeChoice` pass them as `unknown` — that is the declared parameter type, no cast needed. Reads of `SIMPLE_SIZES[i]` and `SIMPLE_SIZES[i - 1]` in the sortedness loop need `const a = SIMPLE_SIZES[i - 1], b = SIMPLE_SIZES[i]; assert(a && b)` before the comparison.

- [ ] **Step 4: Run, lint, commit**

```sh
cd /Users/tomek/dev/arrowz
deno test --allow-read prototype/lab-simple.test.ts && deno check prototype/lab-simple.ts prototype/lab-simple.test.ts && deno lint prototype/lab-simple.ts prototype/lab-simple.test.ts && deno fmt --check prototype/lab-simple.ts prototype/lab-simple.test.ts
git add -A prototype/
git commit -m "lab-simple in TypeScript"
```

---

### Task 8: `command.ts` with `COMMAND_PREFIX`

**Files:**
- Rename: `prototype/command.mjs` → `prototype/command.ts`; `prototype/command.test.mjs` → `prototype/command.test.ts`
- Modify: `prototype/store.mjs`, `prototype/carve.mjs`, `prototype/carve.test.mjs` (import path)

**Interfaces:**
- Produces: `COMMAND_PREFIX = 'deno task carve'`, `ALIASES: Record<string, ParamKey>`, `DEFAULT_VIEW: View`, `helpText(opts?: { advanced?: boolean }): string`, `buildCommand(params: Params, view?: Partial<View>): string`, `parseArgs(argv: readonly string[]): { params: Params; view: View; rest: string[] }`, `parseSimpleArgs(argv: readonly string[]): { choice: SimpleChoice & { random: boolean }; view: View; rest: string[]; errors: string[] }`, `buildSimpleCommand(choice: SimpleChoice, view?: Partial<View>): string`, `boardId(params: Params): string`.

- [ ] **Step 1: Rename and fix importers**

```sh
cd /Users/tomek/dev/arrowz && git mv prototype/command.mjs prototype/command.ts && git mv prototype/command.test.mjs prototype/command.test.ts
sed -i '' "s#from './command.mjs'#from './command.ts'#" prototype/store.mjs prototype/carve.mjs prototype/carve.test.mjs
```

- [ ] **Step 2: Type the module**

Header and the prefix:

```ts
import type { ParamKey, Params, SimpleChoice, View } from './types.ts'
// @ts-types="./engine.d.ts"
import { defaultParams, PARAM_SPEC, RULE_REASONS, RULES } from './engine.mjs'
import { defaultChoice, exportCell } from './lab-simple.ts'

/** How the CLI is invoked from anywhere inside the repository; the lab prints it and the store records it. */
export const COMMAND_PREFIX = 'deno task carve'

export const ALIASES: Record<string, ParamKey> = {
  straight: 'pStraight', lateral: 'wLateral', absorb: 'absorbLimit', giantspacepen: 'giantSpacePenalty',
}
const KEY_BY_FLAG = new Map<string, ParamKey>(PARAM_SPEC.map((s) => [s.key.toLowerCase(), s.key]))
for (const [alias, key] of Object.entries(ALIASES)) KEY_BY_FLAG.set(alias, key)

export const DEFAULT_VIEW: View = { cell: 12, stroke: 0.5, headWidth: 0, headHeight: 0, colored: false, top: 0 }
```

Replace every `'node prototype/carve.mjs'` literal (three usage lines in `helpText`, the first element of `parts` in `buildCommand` and `buildSimpleCommand`) with `COMMAND_PREFIX` / `` `Usage: ${COMMAND_PREFIX} …` ``.

Typings: `MODE_FLAGS`, `VIEW_FLAGS`, `SIMPLE_FLAGS`, `SIMPLE_MODE_FLAGS` are `readonly [string, string][]`; `list(rows: readonly (readonly string[])[], indent?: string)` — `Math.max(...rows.map(([f]) => f.length))` spreads a list of ~15 flags, fine (the rule forbids spreads proportional to cells or pieces). In `helpText`, `rows[i]` and `PARAM_SPEC[i]` inside the `for` loop become one `for (const [i, s] of PARAM_SPEC.entries())` with `const row = rows[i]; if (!row) continue`. `widths[i]` in `line` → `widths[i] ?? 0` is a formatting default only (not a board value), allowed.

`parseArgs`: `view[name] = Number(raw)` where `name` is `'cell' | 'stroke' | 'top'` — narrow with `if (name === 'cell' || name === 'stroke' || name === 'top') view[name] = Number(raw)` (already the shape). `params[key] = Number(raw)` with `key: ParamKey` compiles.

`parseSimpleArgs`: the two maps get discriminated targets:

```ts
type NumberTarget = ['choice', 'W' | 'H' | 'seed' | 'lengths' | 'shape'] | ['view', 'stroke' | 'headWidth' | 'headHeight']
const SIMPLE_NUMBER = new Map<string, NumberTarget>([…as today…])
type SwitchTarget = ['choice', 'skeleton', 'on'] | ['choice', 'random', true] | ['view', 'colored', true]
const SIMPLE_SWITCH = new Map<string, SwitchTarget>([…])
```

and the assignment `(target === 'choice' ? choice : view)[key] = value` becomes an explicit `if (t[0] === 'choice') choice[t[1]] = t[2] else view[t[1]] = t[2]` per branch (the tuple unions narrow correctly per element). `choice` is typed `SimpleChoice & { random: boolean }`.

`boardId`: `const subset: Partial<Record<ParamKey, number>> = {}; for (const s of PARAM_SPEC) subset[s.key] = params[s.key]`.

- [ ] **Step 3: Port the test**

Pattern of Task 5. `argvOf` becomes `const argvOf = (cmd: string) => cmd.slice(COMMAND_PREFIX.length + 1).split(' ')`. Every expected string that started with `'node prototype/carve.mjs'` starts with `` `${COMMAND_PREFIX}` `` instead (write them as template literals). The two regexes `/^Usage: node prototype\/carve\.mjs …/` become `new RegExp('^Usage: ' + COMMAND_PREFIX.replace(/ /g, '\\s') + ' --advanced ')` etc. `assert.throws` occurrences (if any in this file) → `assertThrows(() => …, RangeError, 'substring')`.

- [ ] **Step 4: Run, lint, commit**

```sh
cd /Users/tomek/dev/arrowz
deno test --allow-read prototype/command.test.ts prototype/lab-simple.test.ts prototype/lab-i18n.test.ts prototype/lab-presets.test.ts && deno check prototype/command.ts prototype/command.test.ts && deno lint prototype/command.ts prototype/command.test.ts && deno fmt --check prototype/command.ts prototype/command.test.ts
git add -A prototype/
git commit -m "command in TypeScript; the canonical command prefix becomes deno task carve"
```

**State after Task 8 (say this in the phase-0 report):** `deno test` green for the four ported test files; `node --test prototype/engine.test.mjs prototype/absorb.test.mjs prototype/shortening.test.mjs` still green (they import only `engine.mjs`); `envelope`, `carve`, `store`, `lab-server` tests are red under both runtimes until Tasks 9–10; the browser lab is down until Task 11. Push the branch: `git push -u origin deno-typescript`.

---

# Phase 1 — three parallel streams

Each stream runs in its own worktree created from `deno-typescript` after Task 8:

```sh
cd /Users/tomek/dev/arrowz
git worktree add .claude/worktrees/deno-engine  -b deno-engine  deno-typescript
git worktree add .claude/worktrees/deno-side    -b deno-side    deno-typescript
git worktree add .claude/worktrees/deno-browser -b deno-browser deno-typescript
```

**Stream brief (goes verbatim into every agent prompt):** you own only the files of your task; do not edit `types.ts`, `engine.d.ts`, `deno.json` (except stream D's `bundle` task) or another stream's files — if the contract is missing something, write it into your final report under "contract gaps" and continue with a local, clearly commented type. Never end your turn to wait for anyone. Definition of done: `deno check` clean on your files, your tests green under `deno test`, `deno lint` and `deno fmt --check` clean, no `any`, no `!`, no `as unknown as` beyond the sanctioned places, commits on your branch with English messages and no attribution lines. Report: what changed, test counts, golden results, contract gaps.

### Task 9 (stream A): `engine.ts` and the four engine tests

**Files:**
- Rename: `prototype/engine.mjs` → `prototype/engine.ts`; `engine.test.mjs`, `absorb.test.mjs`, `shortening.test.mjs`, `envelope.test.mjs` → `.test.ts`
- Create: `prototype/engine-contract.test.ts`

**Interfaces:**
- Consumes: `types.ts`, `engine.d.ts` (the target), `fingerprints.json`.
- Produces: `engine.ts` with exactly the exports of `engine.d.ts` (Task 4).

Do the steps in order; the fingerprint tests run after every group of methods so a behaviour change is caught at the method that caused it.

- [ ] **Step 1: Rename and keep a Node oracle**

```sh
cd /Users/tomek/dev/arrowz/.claude/worktrees/deno-engine
cp prototype/engine.mjs /tmp/arrowz-golden/engine-oracle.mjs   # untouched copy for differential runs
git mv prototype/engine.mjs prototype/engine.ts
for t in engine absorb shortening envelope; do git mv prototype/$t.test.mjs prototype/$t.test.ts; done
```

- [ ] **Step 2: Header, helper, class fields**

At the top of `engine.ts`:

```ts
import type {
  Board, CarverStats, Cell, GenerateResult, InactiveKey, Metrics, ParamKey, Params, ParamSpec, Piece, RuleKey,
  SvgOptions, TraceInfo, Violation,
} from './types.ts'

/**
 * Reads an index the algorithm guarantees to be valid. Under
 * noUncheckedIndexedAccess every `arr[i]` is `T | undefined`; a silent
 * `?? 0` would change a board, so an impossible miss throws instead.
 */
function at<T>(arr: ArrayLike<T>, i: number): T {
  const v = arr[i]
  if (v === undefined) throw new RangeError(`index ${i} out of ${arr.length}`)
  return v
}
```

Typed arrays (`Int32Array`, `Int8Array`, `Uint8Array`) index as `number` without `undefined` — `at()` is for `Cell[]`, `Piece[]`, `number[][]` and `Map.get`. For `Map.get` use the same shape inline: `const m = memo.get(s); if (!m) …` where the algorithm already branches on absence, otherwise a local `mapAt(map, key)` twin of `at`.

`class Carver implements Board` with declared fields (every field the constructor assigns, typed from what it assigns: `Int32Array`, `Int8Array`, `Uint8Array`, `number`, `Piece[]`, `Map<number, { version: number; pieces: Piece[] }>`, `Int32Array[]` for `depth`, `CarverStats` for `stats`, `stuckRemaining?: number`, `stuckSizes?: number[]`, `stuckHeads?: number`, `p: Params`, `rng: () => number`). No `private`/`protected` anywhere: `absorb.test` subclasses `Carver` and swaps `absorbPath` on the prototype. `constructor(W: number, H: number, params: Params, rng: () => number)`.

- [ ] **Step 3: Methods, in file order, one group at a time**

Type each method's parameters from its call sites (`Cell[]`, `readonly Cell[]`, `Set<number>`, `number`, `Piece`, `Int32Array`), give inner closures explicit parameter types, and resolve every `possibly undefined` with an existing check or `at()`. Closure-heavy spots: `defectKernel` returns `{ isFree, check }` — declare `type DefectKernel = { isFree: (i: number) => boolean; check: (x: number, y: number) => boolean }` (match the real names and arities in the file) and annotate the return. `creepUp`/`creepUpPlain` take `path: Cell[]`, `L: number`, `hi: number`, `failed: Set<number> | null`. `growSerpentine(head: Cell, neck: Cell, d: number, maxLen: number)`. `absorbPath` returns `Int32Array | null` (a `subarray`). `leftoverReport(): number[]`. `run(maxBacktracks = 200): boolean`; the `this.p.trace({...})` call is typed by `TraceInfo`.

After each group (constructor + geometry helpers; defect kernel + strand; creep + shorten; lengths + serpentine; carveOne; absorption; undo + run) run:

```sh
deno check prototype/engine.ts 2>&1 | grep -c 'ERROR'      # must go down, never up
```

The behaviour check during this step is the differential run against the oracle: a Deno one-liner generating with `engine.ts` and a Node one-liner with `/tmp/arrowz-golden/engine-oracle.mjs` on the same params must print the same fingerprint. Script it once as `/tmp/arrowz-golden/diff-engine.sh "<json params>"` and run it from the worktree root (the Deno import is relative to the cwd):

```sh
cat > /tmp/arrowz-golden/diff-engine.sh <<'EOF'
#!/bin/sh
P=$1
A=$(node --input-type=module -e "import { generate, defaultParams, fingerprint } from '/tmp/arrowz-golden/engine-oracle.mjs'; const r = generate({ ...defaultParams(), ...$P }, { unchecked: true }); console.log(fingerprint(r.board))")
B=$(deno eval "import { generate, defaultParams, fingerprint } from './prototype/engine.ts'; const r = generate({ ...defaultParams(), ...$P }, { unchecked: true }); console.log(fingerprint(r.board))")
[ "$A" = "$B" ] && echo "same $A for $P" || { echo "DIFF node=$A deno=$B for $P"; exit 1; }
EOF
chmod +x /tmp/arrowz-golden/diff-engine.sh
/tmp/arrowz-golden/diff-engine.sh '{ "W": 60, "H": 60, "seed": 2 }'
/tmp/arrowz-golden/diff-engine.sh '{ "W": 100, "H": 100, "seed": 2, "giants": 4, "giantStep": 2, "giantSpan": 30, "wGiant": 0.2 }'
/tmp/arrowz-golden/diff-engine.sh '{ "W": 100, "H": 100, "seed": 1, "headTries": 1, "pStraight": 0.2, "warns": 2, "absorbLimit": 40 }'
/tmp/arrowz-golden/diff-engine.sh '{ "W": 60, "H": 60, "seed": 3, "voidFrac": 0.1, "headTries": 1, "pStraight": 0.2, "warns": 2, "maxBack": 50, "restarts": 1 }'
```

Run these four after every group (they cover skeleton, absorption, voids, backtracking). `deno eval` type-checks nothing, so it works while `deno check` still reports errors elsewhere.

- [ ] **Step 4: `analyse`, `render`, `toSvg`, `fingerprint`**

`analyse(board: Board, ruleB = true): Metrics` — declare `const hist: Record<HistBucket, number> = { '2-6': 0, '7-15': 0, '16-49': 0, '50+': 0 }`; the Kahn queue and the typed-array edge lists index as numbers; `spans[0]` for `spanMax` → `at(spans, 0)` is wrong when `N === 0` — check what the function does for an empty board today (it returns early or divides by zero); keep that exact behaviour: if today `spans[0]` is `undefined` for `N === 0` and ends up as `undefined` in the metrics, write `spanMax: spans[0] ?? Number.NaN` only if a test proves `N === 0` never reaches here; otherwise `at`. `render(board: Board): string`, `toSvg(board: Board, opts: SvgOptions = {}): string` (the `opts.headWidth > 0` comparisons become `(opts.headWidth ?? 0) > 0` — a comparison default, not a board value), `fingerprint(board: Board): string`.

- [ ] **Step 5: `PARAM_SPEC`, reasons, rules, `defaultParams`, validation, `generate`**

```ts
const skeletonOff = (p: Params): InactiveKey | null => (p.giants <= 0 && p.wGiant <= 0 ? 'skeletonOff' : null)

export const PARAM_SPEC = [
  { key: 'W', label: 'width', group: 'board', min: 4, max: 1000, step: 1, def: 25, help: '…' },
  // …unchanged rows…
] as const satisfies readonly ParamSpec[]

// The key set of the table must equal ParamKey in both directions.
type SpecKey = (typeof PARAM_SPEC)[number]['key']
type Equal<A, B> = [A] extends [B] ? ([B] extends [A] ? true : false) : false
const _paramKeysMatch: Equal<SpecKey, ParamKey> = true
void _paramKeysMatch

export const INACTIVE_REASONS: Record<InactiveKey, string> = { /* unchanged */ }

export function defaultParams(): Params {
  const p = { ruleB: true, voidFrac: 0 } as Params   // filled by the loop below, key by key
  for (const s of PARAM_SPEC) p[s.key] = s.def
  return p
}
```

The `as Params` in `defaultParams` is the one sanctioned cast in the engine: the loop assigns every key of the union (the type-level assertion above guarantees the table has them all). Declare `PARAM_SPEC`'s type as the `as const` table; consumers see `readonly ParamSpec[]` through `engine.d.ts` and later through the module itself (the `as const` type is assignable to it).

`RULES: readonly { key: RuleKey; keys: readonly ParamKey[]; check: (p: Params) => boolean }[]`, `RULE_REASONS: Record<RuleKey, string>`, `validateParams(params: Params): Violation[]`, `formatViolation(v: Violation): string` (`LABEL_BY_KEY: Map<ParamKey, string>`).

```ts
export class InvalidParamsError extends RangeError {
  readonly violations: readonly Violation[]
  constructor(violations: readonly Violation[]) {
    super('invalid parameters: ' + violations.map(formatViolation).join('; '))
    this.name = 'InvalidParamsError'
    this.violations = violations
  }
}

export function generate(params: Params, { unchecked = false }: { unchecked?: boolean } = {}): GenerateResult {
  const p: Params = { ...defaultParams(), ...params }
  if (!unchecked) {
    const violations = validateParams(p)
    if (violations.length) throw new InvalidParamsError(violations)
  }
  // …unchanged loop; `carver` starts as `let carver: Carver | null = null` and the
  // loop always runs at least once (restarts ≥ 0), so after it: if (!carver) throw new Error('unreachable')…
}
```

The message text of the error is unchanged (`envelope.test` matches on `invalid parameters:`).

Export list at the end: `export { analyse, Carver, DIRS, fingerprint, mulberry32, render, toSvg }` plus the `export function`/`export const` declarations above — the set must equal `engine.d.ts`.

- [ ] **Step 6: `deno check` clean, differential runs green**

```sh
deno check prototype/engine.ts && deno lint prototype/engine.ts && deno fmt --check prototype/engine.ts
for p in '{ "W": 60, "H": 60, "seed": 2 }' '{ "W": 150, "H": 150, "seed": 7 }' '{ "W": 200, "H": 200, "seed": 5 }' '{ "W": 100, "H": 100, "seed": 2, "giants": 4, "giantStep": 2, "giantSpan": 30, "wGiant": 0.2 }' '{ "W": 100, "H": 100, "seed": 1, "headTries": 1, "pStraight": 0.2, "warns": 2, "absorbLimit": 40 }' '{ "W": 60, "H": 60, "seed": 3, "voidFrac": 0.1, "headTries": 1, "pStraight": 0.2, "warns": 2, "maxBack": 50, "restarts": 1 }' '{ "W": 100, "H": 100, "seed": 1, "headBias": -1, "headTries": 1, "pStraight": 0.2, "warns": 2 }'; do /tmp/arrowz-golden/diff-engine.sh "$p" || exit 1; done
```

Expected: `same …` seven times. Commit: `git commit -am "engine in TypeScript: types added, algorithm untouched"`.

- [ ] **Step 7: Port the four tests**

Pattern of Task 5 step 3, plus:

- `engine.test.ts`: `const cells = (arr: [number, number][]) => new Set(arr.map(([x, y]) => y * 10 + x))`. The memory-limit test spawns Deno instead of Node:

```ts
const script = `
  import { Carver, defaultParams, mulberry32, analyse } from ${JSON.stringify(new URL('./engine.ts', import.meta.url).href)}
  …same body…
`
const r = new Deno.Command(Deno.execPath(), {
  args: ['run', '--allow-read', '--v8-flags=--max-old-space-size=256', '-'],
  stdin: 'piped', stdout: 'piped', stderr: 'piped',
}).spawn()
const w = r.stdin.getWriter()
await w.write(new TextEncoder().encode(script))
await w.close()
const out = await r.output()
assertEquals(out.code, 0, `analyse died under a 256 MB heap:\n${new TextDecoder().decode(out.stderr)}`)
const last = new TextDecoder().decode(out.stdout).trim().split('\n').pop()
assert(last, 'no output')
assertEquals(JSON.parse(last), { N: 80000, solvable: true, f0: 0.005, outDeg: 99.5, maxOut: 199, D: 199, almost: 400 })
```

  The test becomes `async`. `import * as engineExports from './engine.ts'` and the export-list assertion stay; add `'InvalidParamsError'` to the expected list if the test enumerates exports.
- `absorb.test.ts`: `class RefCarver extends Carver { override absorbLeftover(): boolean { … } }` — the body is typed like the engine's (`posOf(pc: Piece, i: number): number | undefined`, `cands: Map<string, { pc: Piece; k: number; suffix: number }>`). `recordAbsorbPaths<T>(fn: () => T): { result: T; log: [number, number, number, boolean][] }` swaps `Carver.prototype.absorbPath` with a typed function of the same signature (`function (this: Carver, comp: readonly number[], pc: Piece, k: number): Int32Array | null`). `runLoop(Cls: typeof Carver, p: Params)`; `out.ok`/`out.fp` are declared in the initial object literal (`ok: false`, `fp: ''`) so the type is fixed.
- `shortening.test.ts` and `envelope.test.ts`: the pinned tables get explicit types (`{ W: number; H: number; seed: number; params: Partial<Params>; fp: string; pieces: number; trunc: number; loss: number }[]`); `assert.throws(() => generate(bad), /invalid parameters/)` → `assertThrows(() => generate(bad), InvalidParamsError, 'invalid parameters')`; a test that reads `err.violations` narrows with `instanceof InvalidParamsError`.

```sh
deno test --allow-read --allow-run prototype/engine.test.ts prototype/absorb.test.ts prototype/shortening.test.ts prototype/envelope.test.ts
```

Expected: every title of these four files from `/tmp/arrowz-golden/tests.txt` passes. Commit: `git commit -am "Engine tests on Deno.test"`.

- [ ] **Step 8: Contract test**

`prototype/engine-contract.test.ts`:

```ts
// engine.ts must expose exactly what engine.d.ts promised to the other streams.
import * as engine from './engine.ts'
import type * as Contract from './engine.d.ts'

Deno.test('engine.ts satisfies engine.d.ts', () => {
  const asContract: typeof Contract = engine
  void asContract
})
```

`deno check prototype/engine-contract.test.ts` must be clean. (Task 12 deletes this file with `engine.d.ts`.)

- [ ] **Step 9: Golden cases through `generate`**

```sh
deno eval '
import { generate, defaultParams, fingerprint } from "./prototype/engine.ts"
import { parseArgs, parseSimpleArgs } from "./prototype/command.ts"
import { simpleParams } from "./prototype/lab-simple.ts"
const g = JSON.parse(Deno.readTextFileSync("prototype/fingerprints.json"))
for (const c of g.cases) {
  let p
  if (c.argv === null) p = { ...defaultParams(), W: 40, H: 40, seed: 1, voidFrac: 0.1 }
  else if (c.argv.includes("--advanced")) p = parseArgs(c.argv.filter((a) => a !== "--advanced")).params
  else p = simpleParams(parseSimpleArgs(c.argv).choice)
  const r = generate(p, { unchecked: true })
  const fp = fingerprint(r.board)
  console.log(fp === c.fingerprint ? "ok  " : "DIFF", c.name, fp, c.fingerprint)
}'
```

Expected: nine `ok`. Note: `command.ts` and `lab-simple.ts` still import `engine.mjs` in this worktree — `deno eval` does not type-check, and the engine they load is the oracle copy left as `engine.mjs`? No: `engine.mjs` was renamed. Before running, `sed -i '' "s#engine.mjs#engine.ts#; /@ts-types/d" prototype/command.ts prototype/lab-simple.ts` in this worktree only (Task 12 does it for real), then commit that as the last commit of the stream: `git commit -am "Engine consumers in the engine worktree point at engine.ts"`.

- [ ] **Step 10: Report**

Test count per file, the nine golden results, `deno check`/`lint`/`fmt` status, contract gaps (anything `engine.d.ts` had wrong).

---

### Task 10 (stream B): `store.ts`, `lab-server.ts`, `carve.ts`, their tests, `neutral.test.ts`

**Files:**
- Rename: `store.mjs`, `lab-server.mjs`, `carve.mjs` and their `.test.mjs` files → `.ts`
- Create: `prototype/neutral.test.ts`

**Interfaces:**
- Consumes: `engine.mjs` via `@ts-types="./engine.d.ts"`; `command.ts`, `lab-simple.ts`; `types.ts`.
- Produces: `boardsDir(): string`, `saveBoard(input: SaveInput): BoardMeta`, `deleteBoard(size: string, id: string): boolean`, `listBoards(): BoardSize[]`, `createLabServer(): (req: Request) => Promise<Response>`.

- [ ] **Step 1: Rename**

```sh
cd /Users/tomek/dev/arrowz/.claude/worktrees/deno-side
for f in store lab-server carve; do git mv prototype/$f.mjs prototype/$f.ts; git mv prototype/$f.test.mjs prototype/$f.test.ts; done
```

- [ ] **Step 2: `store.ts` (full file)**

```ts
// Store of generated boards: prototype/boards/<W>x<H>/<id>.svg + <id>.json.
// Shared by the CLI (carve.ts --svg) and the lab server. The directory is
// gitignored — a 1000×1000 board is tens of MB, and the command in the meta
// reproduces any board.
import { dirname, fromFileUrl, join } from '@std/path'
import type { BoardMeta, BoardSize, Params, View } from './types.ts'
import { boardId } from './command.ts'

export interface SaveInput {
  svg: string
  params: Params
  view: View
  command: string
  simpleCommand?: string
  metrics?: { ok?: boolean; pieces?: number; maxLen?: number; genMs?: number }
  source: string
}

export function boardsDir(): string {
  return Deno.env.get('ARROWZ_BOARDS_DIR') || join(dirname(fromFileUrl(import.meta.url)), 'boards')
}

function exists(path: string): boolean {
  try {
    Deno.statSync(path)
    return true
  } catch {
    return false
  }
}

/** The JSON of a stored board, or null when the file is missing or broken. */
function readMeta(file: string): BoardMeta | null {
  try {
    return JSON.parse(Deno.readTextFileSync(file)) as BoardMeta
  } catch {
    return null
  }
}

export function saveBoard({ svg, params, view, command, simpleCommand, metrics = {}, source }: SaveInput): BoardMeta {
  const id = boardId(params)
  const size = `${params.W}x${params.H}`
  const dir = join(boardsDir(), size)
  Deno.mkdirSync(dir, { recursive: true })
  // The same id means the same board (the id hashes the parameters). An
  // overwrite — recolouring in the lab, regenerating from the CLI — keeps the
  // original createdAt, so the board stays in its place in the list, and
  // records the write in updatedAt.
  const now = new Date().toISOString()
  const metaFile = join(dir, `${id}.json`)
  const createdAt = readMeta(metaFile)?.createdAt ?? now
  const meta: BoardMeta = {
    id, W: params.W, H: params.H, seed: params.seed, params, view, command,
    ...(simpleCommand ? { simpleCommand } : {}),
    source, createdAt, updatedAt: now,
    ok: metrics.ok ?? null, pieces: metrics.pieces ?? null, maxLen: metrics.maxLen ?? null,
    genMs: metrics.genMs ?? null, svgBytes: new TextEncoder().encode(svg).byteLength,
  }
  Deno.writeTextFileSync(join(dir, `${id}.svg`), svg)
  Deno.writeTextFileSync(metaFile, JSON.stringify(meta, null, 2))
  return meta
}

/**
 * Removes one board (svg + json). Returns false when there was nothing to
 * remove. A size directory left empty is removed too, so the list does not
 * keep an empty size. Names are validated: they come straight from a URL.
 */
export function deleteBoard(size: string, id: string): boolean {
  if (!/^\d+x\d+$/.test(size) || !/^[\w-]+$/.test(id)) throw new Error(`invalid board name ${size}/${id}`)
  const dir = join(boardsDir(), size)
  let removed = false
  for (const ext of ['.svg', '.json']) {
    const file = join(dir, id + ext)
    if (exists(file)) {
      Deno.removeSync(file)
      removed = true
    }
  }
  if (exists(dir) && [...Deno.readDirSync(dir)].length === 0) Deno.removeSync(dir)
  return removed
}

/** Sizes ascending by cell count, boards newest first within a size. */
export function listBoards(): BoardSize[] {
  const root = boardsDir()
  if (!exists(root)) return []
  const sizes: BoardSize[] = []
  for (const entry of Deno.readDirSync(root)) {
    const m = /^(\d+)x(\d+)$/.exec(entry.name)
    if (!m || !entry.isDirectory) continue
    const dir = join(root, entry.name)
    const boards: BoardMeta[] = []
    for (const f of Deno.readDirSync(dir)) {
      if (!f.name.endsWith('.json')) continue
      if (!exists(join(dir, f.name.slice(0, -5) + '.svg'))) continue
      const meta = readMeta(join(dir, f.name))
      if (meta) boards.push(meta)
    }
    if (!boards.length) continue
    boards.sort((a, b) => (b.createdAt ?? '').localeCompare(a.createdAt ?? ''))
    const W = Number(m[1]), H = Number(m[2])
    sizes.push({ size: entry.name, W, H, cells: W * H, boards })
  }
  sizes.sort((a, b) => a.cells - b.cells || a.W - b.W)
  return sizes
}
```

The `as BoardMeta` on parsed JSON is the sanctioned narrowing of `unknown` for on-disk data (the file was written by this module). The JSON written is field-for-field what Node wrote.

- [ ] **Step 3: `lab-server.ts` (full file)**

```ts
// Lab server: static files from prototype/ without caching (a rebuilt bundle
// must reach the browser immediately) plus the board store under /api/boards
// (GET list, POST save, DELETE one) and /boards/. Run: deno task lab, or
// deno run --allow-net --allow-read --allow-write --allow-env prototype/lab-server.ts [port]
import { dirname, extname, fromFileUrl, join, normalize, resolve, SEPARATOR } from '@std/path'
import { boardsDir, deleteBoard, listBoards, saveBoard, type SaveInput } from './store.ts'

const ROOT = dirname(fromFileUrl(import.meta.url))
const MIME: Record<string, string> = {
  '.html': 'text/html; charset=utf-8', '.mjs': 'text/javascript', '.js': 'text/javascript', '.map': 'application/json',
  '.svg': 'image/svg+xml', '.json': 'application/json', '.css': 'text/css',
}

function send(status: number, body: BodyInit, type = 'application/json'): Response {
  return new Response(body, { status, headers: { 'Content-Type': type, 'Cache-Control': 'no-store, must-revalidate' } })
}

/** What the lab posts: a SaveInput whose source may be missing (the server fills in 'lab'). */
type PostBody = Omit<SaveInput, 'source'> & { source?: string }

/** Runtime check of a POST body: the two fields the store cannot do without. */
function isPostBody(v: unknown): v is PostBody {
  if (typeof v !== 'object' || v === null) return false
  const o = v as { svg?: unknown; params?: unknown }
  return typeof o.svg === 'string' && typeof o.params === 'object' && o.params !== null
}

export function createLabServer(): (req: Request) => Promise<Response> {
  return async (req) => {
    const url = new URL(req.url)
    try {
      if (url.pathname === '/api/boards' && req.method === 'GET') return send(200, JSON.stringify(listBoards()))
      if (url.pathname === '/api/boards' && req.method === 'POST') {
        const body: unknown = JSON.parse(await req.text())
        if (!isPostBody(body)) return send(400, '{"error":"svg and params are required"}')
        return send(201, JSON.stringify(saveBoard({ ...body, source: body.source ?? 'lab' })))
      }
      // Segments are matched on the raw path and decoded one by one, so an
      // encoded slash cannot smuggle a directory step into a name.
      const del = req.method === 'DELETE' ? /^\/api\/boards\/([^/]+)\/([^/]+)$/.exec(url.pathname) : null
      if (del) {
        const [, size = '', id = ''] = del
        let ok: boolean
        try {
          ok = deleteBoard(decodeURIComponent(size), decodeURIComponent(id))
        } catch (err) {
          return send(400, JSON.stringify({ error: err instanceof Error ? err.message : String(err) }))
        }
        return send(ok ? 200 : 404, JSON.stringify({ deleted: ok }))
      }
      if (req.method !== 'GET') return send(405, '{"error":"GET only"}')

      // The store may live outside prototype/ (ARROWZ_BOARDS_DIR), so /boards/
      // has its own base directory. The normalised path must stay inside it.
      const rel = decodeURIComponent(url.pathname === '/' ? '/lab.html' : url.pathname)
      const inBoards = rel.startsWith('/boards/')
      const baseDir = resolve(inBoards ? boardsDir() : ROOT)
      const file = normalize(join(baseDir, inBoards ? rel.slice('/boards/'.length) : rel.slice(1)))
      if (!file.startsWith(baseDir + SEPARATOR)) return send(403, '{"error":"outside base directory"}')
      let info: Deno.FileInfo
      try {
        info = await Deno.stat(file)
      } catch {
        const hint = rel.startsWith('/dist/') ? ' (run: deno task bundle)' : ''
        return send(404, JSON.stringify({ error: `not found${hint}` }))
      }
      if (!info.isFile) return send(404, '{"error":"not found"}')
      const data = await Deno.readFile(file)
      return send(200, data, MIME[extname(file)] ?? 'application/octet-stream')
    } catch (err) {
      return send(500, JSON.stringify({ error: err instanceof Error ? err.message : String(err) }))
    }
  }
}

if (import.meta.main) {
  const port = Number(Deno.args[0] ?? 8777)
  Deno.serve({ port, hostname: '127.0.0.1', onListen: () => console.log(`Lab: http://localhost:${port}/lab.html   (Ctrl+C stops)`) }, createLabServer())
}
```

The `as { svg?: unknown; params?: unknown }` inside the guard is a shape probe on `unknown` (the sanctioned narrowing at an I/O boundary), not a trust cast. `MIME[…] ?? 'application/octet-stream'` is a content-type default, allowed.

- [ ] **Step 4: `carve.ts`**

Deno substitutions (every other line stays):

```ts
import type { Cell, Params, Piece } from './types.ts'
// @ts-types="./engine.d.ts"
import { analyse, Carver, DIRS, fingerprint, generate, mulberry32, render, toSvg, validateParams, formatViolation } from './engine.mjs'
import { buildCommand, buildSimpleCommand, boardId, helpText, parseArgs, parseSimpleArgs } from './command.ts'
import { simpleParams } from './lab-simple.ts'
import { saveBoard } from './store.ts'

const trace = Deno.env.get('CARVE_TRACE')
  ? (i: TraceInfo) => console.error(`    [trace] pieces ${i.pieces}, remaining ${i.remaining}, backtracks ${i.backtracks}, ${i.ms.toFixed(0)} ms`)
  : undefined
const debug = Deno.env.get('GIANT_DEBUG') ? (msg: string) => console.error(msg) : undefined

const argvIn = Deno.args
const advanced = argvIn.includes('--advanced')
```

`trace`/`debug` are `undefined` instead of `null` so they fit the optional hooks of `Params` under `exactOptionalPropertyTypes`; spread them as `...(trace ? { trace } : {})` and `...(debug ? { debug } : {})` where `{ ...params, trace, debug }` appears today (three places: the one-board run, the benchmark, the report).

The two parser paths get separate typed results instead of the `parsed = advanced ? … : …` union:

```ts
const simple = advanced ? null : parseSimpleArgs(argvIn)
const adv = advanced ? parseArgs(argvIn.filter((a) => a !== '--advanced')) : null
const view = (simple ?? adv)?.view ?? DEFAULT_VIEW   // one of the two is always set
const rest = (simple ?? adv)?.rest ?? []
```

(import `DEFAULT_VIEW` from `command.ts`). `process.exit(n)` → `Deno.exit(n)`; `refuse(error: string, items: readonly unknown[], format?: (v: Violation) => string)` — split into `refuseErrors(error: string, items: readonly string[])` and `refuseViolations(items: readonly Violation[])` so no `format ? … : …` on an untyped list. `Buffer.byteLength(svg)` → `new TextEncoder().encode(svg).byteLength`. `writeFileSync(svgOut, svg)` → `Deno.writeTextFileSync(svgOut, svg)`. `params` after the parse is `Params` on both paths (`adv.params` or `simpleParams(simple.choice, simple.choice.random ? Math.random : null)`); `if (!result.ok)` branch: `result.stuck` is `Stuck | null` — narrow with `const stuck = result.stuck; if (!stuck) throw new Error('unreachable: not ok without stuck')` before printing. `const m = result.metrics` is `Metrics | null`; the ok path has metrics (`generate` computes them when pieces exist) — narrow the same way. The report/benchmark loops type `BASE` as `[string, number, 'square'?][]`, `FORMATS` as `[string, number][]`, `acc` as `(Metrics & { tGen: number; tAna: number; backtracks: number; restarts: number; st: CarverStats } | { failed: true; restarts: number; remaining: number })[]`, and `good` filters with a type guard `(a): a is MetricsRun => !('failed' in a)`. Any `Math.max(...c.pieces.map(...))` in the benchmark spreads per piece — that violates the repository rule already; replace with a loop (`let max = 0; for (const x of c.pieces) if (x.cells.length > max) max = x.cells.length`) — behaviour identical, and note it in the report.

- [ ] **Step 5: Port the three tests**

Pattern of Task 5, plus:

- `store.test.ts`: static import `import { deleteBoard, listBoards, saveBoard } from './store.ts'`; the `beforeEach` becomes a helper `function freshDir(): string { const dir = Deno.makeTempDirSync({ prefix: 'arrowz-boards-' }); Deno.env.set('ARROWZ_BOARDS_DIR', dir); return dir }` called at the top of every test. `readFileSync(p, 'utf8')` → `Deno.readTextFileSync(p)`, `existsSync` → a local `exists` like the store's, `mkdirSync`/`writeFileSync` → `Deno.mkdirSync`/`Deno.writeTextFileSync`. The `command` strings in fixtures use `COMMAND_PREFIX`.
- `lab-server.test.ts`: one `Deno.test` per existing title, each doing its own server:

```ts
async function withServer(fn: (base: string) => Promise<void>) {
  Deno.env.set('ARROWZ_BOARDS_DIR', Deno.makeTempDirSync({ prefix: 'arrowz-srv-' }))
  const server = Deno.serve({ port: 0, hostname: '127.0.0.1', onListen: () => {} }, createLabServer())
  try {
    await fn(`http://127.0.0.1:${server.addr.port}`)
  } finally {
    await server.shutdown()
  }
}
Deno.test('POST /api/boards saves, GET lists, the SVG is served from the store', () =>
  withServer(async (base) => { …same body with assertEquals… }))
```

  `await post.json()` is `any` from the lib — assign to a typed const: `const meta: BoardMeta = await post.json()`; `list: BoardSize[]`. The `/boards/..%2F..%2Fengine.mjs` traversal probe keeps its text (the path only needs to escape). Add to the static-files test:

```ts
const dist = await fetch(base + '/dist/lab-page.js')
assert(dist.status === 200 || (await dist.text()).includes('deno task bundle'), 'a missing bundle must say how to build it')
```
- `carve.test.ts`: the runner helpers become

```ts
const here = dirname(fromFileUrl(import.meta.url))
const carve = join(here, 'carve.ts')
function runCarve(argv: readonly string[], boardsDir: string) {
  const r = new Deno.Command(Deno.execPath(), {
    args: ['run', '--allow-read', '--allow-write', '--allow-env', carve, ...argv],
    cwd: dirname(here), env: { ARROWZ_BOARDS_DIR: boardsDir }, stdout: 'piped', stderr: 'piped',
  }).outputSync()
  return { status: r.code, stdout: new TextDecoder().decode(r.stdout), stderr: new TextDecoder().decode(r.stderr) }
}
```

  `execFileSync('node', [carve.mjs, ...argv])` → `runCarve(argv, dir)` (throw on non-zero where the old call threw: `assertEquals(r.status, 0, r.stderr)`); `cmd.split(' ').slice(2)` → `cmd.slice(COMMAND_PREFIX.length + 1).split(' ')`; `dryRun` wraps `runCarve` and parses the first `{` line as before. Regexes on `meta.command` use `COMMAND_PREFIX`.

- [ ] **Step 6: `neutral.test.ts`**

```ts
// The runtime-neutral modules must stay importable from a browser and from
// Angular: no Deno, DOM, Node or process API. The compiler keeps DOM out
// (no dom lib outside lab-page.ts); this test keeps the rest out.
import { dirname, fromFileUrl, join } from '@std/path'
import { assert } from '@std/assert'

const NEUTRAL = ['types.ts', 'engine.ts', 'command.ts', 'lab-simple.ts', 'lab-presets.ts', 'lab-i18n.ts']
const FORBIDDEN = [/\bDeno\./, /\bdocument\b/, /\bwindow\./, /\blocalStorage\b/, /\bprocess\./, /from 'node:/, /\bBuffer\./]

Deno.test('runtime-neutral modules use no Deno, DOM, Node or process API', () => {
  const here = dirname(fromFileUrl(import.meta.url))
  for (const name of NEUTRAL) {
    const file = join(here, name)
    let text: string
    try {
      text = Deno.readTextFileSync(file)
    } catch {
      text = Deno.readTextFileSync(file.replace(/\.ts$/, '.mjs'))   // engine.mjs until integration
    }
    for (const re of FORBIDDEN) assert(!re.test(text), `${name} matches ${re}`)
  }
})
```

- [ ] **Step 7: Run, lint, golden, commit, report**

```sh
deno test --allow-read --allow-write --allow-env --allow-run --allow-net prototype/store.test.ts prototype/lab-server.test.ts prototype/carve.test.ts prototype/neutral.test.ts
deno check prototype/store.ts prototype/lab-server.ts prototype/carve.ts prototype/*.test.ts 2>&1 | grep -v engine   # engine tests belong to stream A
deno lint prototype/store.ts prototype/lab-server.ts prototype/carve.ts && deno fmt --check prototype/
/tmp/arrowz-golden/record.sh deno && for n in defaults simple skeleton tunnels layers corner longstraight big500; do a=$(jq -r .fingerprint /tmp/arrowz-golden/node/$n.json); b=$(jq -r .fingerprint /tmp/arrowz-golden/deno/$n.json); [ "$a" = "$b" ] && echo "same $n $a" || echo "DIFF $n node=$a deno=$b"; done
git add -A prototype/ && git commit -m "store, lab server and CLI on Deno APIs; their tests on Deno.test"
```

Expected: eight `same` (the CLI still runs the untouched `engine.mjs` here, so a difference would be a parser or view bug). Report: tests, golden, the `Math.max` spread replacement, contract gaps.

---

### Task 11 (stream D): `lab-page.ts`, `lab-worker.ts`, `lab.html`, `lab.sh`, bundle

**Files:**
- Create: `prototype/lab-page.ts`
- Rename: `prototype/lab-worker.mjs` → `prototype/lab-worker.ts`
- Modify: `prototype/lab.html` (lines 300–1306: the inline script), `prototype/lab.sh`

**Interfaces:**
- Consumes: `engine.mjs` via `@ts-types`, `command.ts`, `lab-i18n.ts` (`UiKey`, `UiArgs`), `lab-presets.ts`, `lab-simple.ts`, `types.ts` (`WorkerIn`, `WorkerOut`, `BoardSize`, `BoardMeta`, `View`, `Params`, `SimpleChoice`).
- Produces: `prototype/dist/lab-page.js`, `prototype/dist/lab-worker.js` (built, not committed).

- [ ] **Step 1: `lab-worker.ts` (full file)**

```ts
/// <reference no-default-lib="true" />
/// <reference lib="deno.worker" />
// Laboratory worker: all generation happens here so that the interface stays
// responsive. A 1000×1000 board takes tens of seconds to compute — on the main
// thread it would freeze the tab.
//
// The worker keeps the last generated board on its side, so switching the
// colour or the number of highlighted pieces redraws the SVG without
// regenerating.
// @ts-types="./engine.d.ts"
import { generate, toSvg } from './engine.mjs'
import type { Board, LongestSummary, Metrics, Params, View, WorkerIn, WorkerOut } from './types.ts'

let last: { board: Board; metrics: Metrics | null; params: Params } | null = null

const post = (m: WorkerOut) => self.postMessage(m)

function longestSummary(board: Board, n: number): LongestSummary[] {
  const W = board.W
  const longest = [...board.pieces].sort((a, b) => b.cells.length - a.cells.length).slice(0, n)
  return longest.map((pc) => {
    let minX = Infinity, maxX = -Infinity, minY = Infinity, maxY = -Infinity
    const own = new Set(pc.cells.map((c) => c.y * W + c.x))
    let coil = 0
    for (const c of pc.cells) {
      if (c.x < minX) minX = c.x
      if (c.x > maxX) maxX = c.x
      if (c.y < minY) minY = c.y
      if (c.y > maxY) maxY = c.y
      let touch = 0
      for (const [dx, dy] of [[0, -1], [1, 0], [0, 1], [-1, 0]] as const) {
        if (own.has((c.y + dy) * W + (c.x + dx))) touch++
      }
      if (touch >= 3) coil++
    }
    const sx = maxX - minX + 1
    const sy = maxY - minY + 1
    return {
      len: pc.cells.length, sx, sy,
      span: Math.max(sx / board.W, sy / board.H),
      density: pc.cells.length / (sx * sy),
      coil: coil / pc.cells.length,
    }
  })
}

// `tag` comes back with the SVG so the page can tell a preview apart from a
// render made for the store (no highlight).
function render(view: View, tag?: string) {
  if (!last) return
  const svg = toSvg(last.board, {
    cell: view.cell, colored: view.colored, strokeRatio: view.stroke, headWidth: view.headWidth,
    headHeight: view.headHeight, top: view.top, voids: true,
  })
  post({ type: 'render', svg, longest: longestSummary(last.board, view.top), ...(tag ? { tag } : {}) })
}

self.onmessage = (event: MessageEvent<WorkerIn>) => {
  const msg = event.data
  if (msg.type === 'render') {
    render(msg.view, msg.tag)
    return
  }
  const started = performance.now()
  let result
  try {
    result = generate({
      ...msg.params,
      // Progress is sent as it happens: on large boards the user has to
      // see that something is going on, and be able to abort.
      trace: (info) => post({ type: 'progress', info }),
    })
  } catch (err) {
    // Includes the InvalidParamsError generate() throws for parameters outside
    // the safe envelope: its message lists the violations and the page shows it.
    post({ type: 'error', message: err instanceof Error ? err.message : String(err) })
    return
  }
  last = { board: result.board, metrics: result.metrics, params: msg.params }
  post({
    type: 'done',
    ok: result.ok, metrics: result.metrics, backtracks: result.backtracks, restartsUsed: result.restartsUsed,
    genMs: result.genMs, metricsMs: result.metricsMs, totalMs: performance.now() - started,
    stuck: result.stuck, pieces: result.board.pieces.length, stats: result.board.stats,
  })
  render(msg.view)
}
```

Check the current `lab-worker.mjs` for the exact `voids` value it passes (`view.voids`) and keep it: if the page sends `voids` inside `view`, add `voids: boolean` to the `render` message rather than hard-coding — match what `lab.html` sends today.

- [ ] **Step 2: Extract the page script**

```sh
cd /Users/tomek/dev/arrowz/.claude/worktrees/deno-browser
git mv prototype/lab-worker.mjs prototype/lab-worker.ts
# lines 301..1305 of lab.html are the script body (300 = <script type="module">, 1306 = </script>)
sed -n '301,1305p' prototype/lab.html > prototype/lab-page.ts
python3 - <<'PY'
p = 'prototype/lab.html'
lines = open(p).read().split('\n')
head, tail = lines[:299], lines[1306:]
open(p, 'w').write('\n'.join(head + ['<script type="module" src="./dist/lab-page.js"></script>'] + tail))
PY
grep -n "script" prototype/lab.html
```

Verify the line numbers first (`grep -n '<script type="module">' prototype/lab.html` must print 300 and `grep -n '</script>' prototype/lab.html` 1306; adjust if the fmt commit moved nothing — HTML was excluded from fmt, so they hold).

- [ ] **Step 3: Type the page**

Prepend to `lab-page.ts`:

```ts
/// <reference lib="dom" />
/// <reference lib="dom.iterable" />
// The generator lab page. Built by `deno task bundle` into dist/lab-page.js;
// lab.html loads that file. Everything the page knows about parameters comes
// from PARAM_SPEC, so the panel cannot drift from the engine.
import type { BoardMeta, BoardSize, Params, ParamKey, ParamSpec, SimpleChoice, View, WorkerIn, WorkerOut } from './types.ts'
// @ts-types="./engine.d.ts"
import { defaultParams, INACTIVE_REASONS, PARAM_SPEC, RULE_REASONS, validateParams } from './engine.mjs'
import { buildCommand } from './command.ts'
import { EN, PL, type Dictionary, type UiArgs, type UiKey } from './lab-i18n.ts'
import { findPreset, PRESETS } from './lab-presets.ts'
import { defaultChoice, exportCell, normalizeChoice, SIMPLE_CHOICES, SIMPLE_SLIDERS, simpleParams } from './lab-simple.ts'

/** An element by id; the ids are fixed in lab.html, so a miss is a bug, not a state. */
function el<T extends HTMLElement = HTMLElement>(id: string): T {
  const e = document.getElementById(id)
  if (!e) throw new Error(`missing element #${id}`)
  return e as T
}
const state: Params = { ...defaultParams() }
const DICT: Record<'en' | 'pl', Dictionary> = { en: EN, pl: PL }
let lang: 'en' | 'pl' = localStorage.getItem('labLang') === 'pl' || (localStorage.getItem('labLang') === null && navigator.language.toLowerCase().startsWith('pl')) ? 'pl' : 'en'
function t<K extends UiKey>(key: K, ...args: UiArgs<K>): string {
  const v = DICT[lang].ui[key] ?? EN.ui[key]
  return typeof v === 'function' ? (v as (...a: UiArgs<K>) => string)(...args) : v
}
```

Remove the old first six `import` lines and the `$`/`state`/`DICT`/`lang`/`t` definitions they replace. The `as T` in `el` and the `as (...a: UiArgs<K>) => string` in `t` are the two sanctioned casts of this file (DOM element kind, and a union-of-functions call that TypeScript cannot resolve generically). Then, top to bottom:

- every `$('id')` → `el('id')`, with the element type where a property is read: `el<HTMLInputElement>('sRandom').checked`, `el<HTMLSelectElement>('presets').value`, `el<HTMLButtonElement>(…)`.
- `paramText(spec: ParamSpec)`, `reasonText(key: string)` (keys come from engine tables typed `InactiveKey | RuleKey`, from `Violation.key`), `fmt(n: number)`.
- the panel maps: `groups: Map<ParamGroup, ParamSpec[]>`, `paramRows: Map<ParamKey, { row: HTMLElement; num: HTMLInputElement; range: HTMLInputElement }>` (match the actual shape stored today), `specByKey: Map<ParamKey, ParamSpec>`, `groupBoxes: Map<ParamGroup, HTMLElement>`, `presetOptions: Map<string, HTMLOptionElement>`, `sizeInputs: Map<'W' | 'H', { num: HTMLInputElement; range: HTMLInputElement }>`, `sliders: Map<'lengths' | 'shape', HTMLInputElement>`, `segButtons: { group: 'skeleton'; value: 'off' | 'on'; button: HTMLButtonElement }[]`.
- `violations: Violation[]`, `simpleChoice: SimpleChoice`, `runParams: Params`, `lastDone: Extract<WorkerOut, { type: 'done' }> | null`, `lastLongest: LongestSummary[] | null`, `boardsCache: BoardSize[] | null`, `libBoard: BoardMeta | null`, `prevStats: Map<string, number>`.
- the worker: `new Worker(new URL('./lab-worker.js', import.meta.url), { type: 'module' })`, `w.onmessage = (e: MessageEvent<WorkerOut>) => onWorkerMessage(e.data)`, `function onWorkerMessage(msg: WorkerOut)` with a `switch (msg.type)`; `w.postMessage(msg satisfies WorkerIn)` at the two send sites.
- reading the URL hash / localStorage / `/api/boards` JSON: parse into `unknown`, then `normalizeChoice(raw)` for the simple choice (it takes `unknown`) and a small `readParams(raw: unknown): Partial<Record<ParamKey, number>>` helper that keeps only finite numbers under known keys (this replaces the untyped `Object.assign`-style read; `clampParam` still pulls values into range afterwards). Fetch results: `const list: BoardSize[] = await res.json()`.
- `setParam(key: ParamKey, value: number)`, `clampParam(spec: ParamSpec, value: number)`, `viewOptions(): View`, `storeView(): View`, `libView(meta: BoardMeta): View`.
- `setStatus(html: string)`, `showTab(name: 'lab' | 'library')`, `showView(mode: 'simple' | 'advanced')`.

Iterate `deno check prototype/lab-page.ts` until clean. Where an element or map read can genuinely be absent (a preset id typed by hand, a missing board), keep the existing null path; where it cannot, throw via `el`/a check. No `?? 0`-style defaults on parameter values.

- [ ] **Step 4: `lab.sh`**

```sh
#!/bin/sh
# Starts the generator lab at http://localhost:8777/lab.html
#
# A server is needed because ES modules do not load from file:// (CORS), and
# the lab saves generated boards to prototype/boards/ through POST /api/boards.
# The page and the worker are TypeScript: `deno task bundle` builds them into
# prototype/dist/ once, then rebuilds on every edit; the server never caches.
set -e
cd "$(dirname "$0")/.."
PORT=${1:-8777}
deno task bundle
deno task bundle --watch &
WATCH=$!
deno run --allow-net --allow-read --allow-write --allow-env prototype/lab-server.ts "$PORT" &
SRV=$!
trap 'kill $WATCH $SRV 2>/dev/null' EXIT INT TERM
sleep 1
open "http://localhost:$PORT/lab.html" 2>/dev/null || true
wait $SRV
```

- [ ] **Step 5: Build, check, smoke**

```sh
cd /Users/tomek/dev/arrowz/.claude/worktrees/deno-browser
deno task bundle && ls -la prototype/dist/
deno check prototype/lab-page.ts prototype/lab-worker.ts && deno lint prototype/lab-page.ts prototype/lab-worker.ts && deno fmt --check prototype/lab-page.ts prototype/lab-worker.ts
```

`lab-server.mjs` in this worktree is still the Node server; run it with Node for the smoke (`node prototype/lab-server.mjs 8778 &`) — it serves `dist/` like any file. In Chrome at `http://localhost:8778/lab.html`: simple view generates 25×50 and 200×200; advanced view loads `insane-square` and generates it with progress in the worker; save a board, open it from the library, delete it; switch language; the command shown for defaults equals `deno task carve --advanced --svg --w=25 --h=50 --seed=7 --cell=12`. Read the console for errors (`read_console_messages` with pattern `Error|TypeError`). Kill the Node server.

- [ ] **Step 6: Commit and report**

```sh
git add -A prototype/ && git commit -m "Lab page and worker in TypeScript, bundled into dist/; lab.sh builds and watches"
```

Report: bundle sizes, smoke results, contract gaps.

---

# Phase 2 — integration, proof, docs

### Task 12: Integrate the streams and remove the bridge

**Files:**
- Merge branches `deno-engine`, `deno-side`, `deno-browser` into `deno-typescript`
- Delete: `prototype/engine.d.ts`, `prototype/engine-contract.test.ts`
- Modify: every `// @ts-types` importer (`command.ts`, `lab-simple.ts`, `carve.ts`, `lab-worker.ts`, `lab-page.ts`, the tests)
- Create: `prototype/fingerprints.test.ts`

- [ ] **Step 1: Merge**

```sh
cd /Users/tomek/dev/arrowz && git switch deno-typescript
git merge --no-ff deno-side -m "Merge stream B: store, server and CLI on Deno"
git merge --no-ff deno-browser -m "Merge stream D: lab page and worker in TypeScript"
git merge --no-ff deno-engine -m "Merge stream A: engine in TypeScript"
```

Conflicts are limited to `command.ts`/`lab-simple.ts` (stream A's last commit pointed them at `engine.ts`) — take stream A's version.

- [ ] **Step 2: Switch every consumer to `engine.ts`**

```sh
grep -rln "engine.mjs" prototype/ | xargs sed -i '' "s#'./engine.mjs'#'./engine.ts'#; /@ts-types=\".\/engine.d.ts\"/d"
git rm prototype/engine.d.ts prototype/engine-contract.test.ts
grep -rn "engine.mjs\|ts-types" prototype/ ; echo "(no output = clean)"
```

Update `neutral.test.ts`: remove the `.mjs` fallback (read `engine.ts` directly).

- [ ] **Step 3: Full verification**

```sh
deno task verify 2>&1 | tail -15
deno test --allow-read --allow-write --allow-env --allow-run --allow-net --reporter=tap prototype/ 2>/dev/null | grep -E '^ok|^not ok' | sed -E 's/^(ok|not ok) [0-9]+ - //' | sort > /tmp/arrowz-golden/tests-deno.txt
diff /tmp/arrowz-golden/tests.txt /tmp/arrowz-golden/tests-deno.txt
```

Expected: `verify` green; the diff shows only the added titles (`runtime-neutral modules …`, and the fingerprint test from step 4 once written) — no title from the Node list missing. If the TAP reporter names differ in format, compare counts and eyeball the `deno test` summary against `tests-node.txt`.

- [ ] **Step 4: Golden proof and the permanent guard**

```sh
/tmp/arrowz-golden/record.sh deno
STRIP='del(.genMs, .metricsMs, .command, .simpleCommand)'
for n in defaults simple skeleton tunnels layers corner longstraight big500; do
  diff <(jq -S "$STRIP" /tmp/arrowz-golden/node/$n.json) <(jq -S "$STRIP" /tmp/arrowz-golden/deno/$n.json) && echo "same $n"
  jq -r '.command' /tmp/arrowz-golden/deno/$n.json | grep -q '^deno task carve ' || echo "PREFIX $n"
done
diff <(deno task carve --help 2>/dev/null | sed 's#deno task carve#node prototype/carve.mjs#') /tmp/arrowz-golden/help-simple.txt && echo HELP_SIMPLE_SAME
diff <(deno task carve --advanced --help 2>/dev/null | sed 's#deno task carve#node prototype/carve.mjs#') /tmp/arrowz-golden/help-advanced.txt && echo HELP_ADVANCED_SAME
```

Expected: eight `same`, both `HELP_*_SAME`. Then `prototype/fingerprints.test.ts`:

```ts
// The golden set recorded from Node on 2026-09-09 before the Deno rewrite:
// the same command must give the same board on every runtime, forever.
import { assertEquals } from '@std/assert'
import { dirname, fromFileUrl, join } from '@std/path'
import { defaultParams, fingerprint, generate } from './engine.ts'
import { parseArgs, parseSimpleArgs } from './command.ts'
import { simpleParams } from './lab-simple.ts'
import type { Params } from './types.ts'

interface GoldenCase {
  name: string
  argv: string[] | null
  fingerprint: string
  pieces: number
}
const golden = JSON.parse(Deno.readTextFileSync(join(dirname(fromFileUrl(import.meta.url)), 'fingerprints.json'))) as { cases: GoldenCase[] }

function paramsOf(c: GoldenCase): Params {
  if (c.argv === null) return { ...defaultParams(), W: 40, H: 40, seed: 1, voidFrac: 0.1 }
  if (c.argv.includes('--advanced')) return parseArgs(c.argv.filter((a) => a !== '--advanced' && a !== '--dry-run')).params
  return simpleParams(parseSimpleArgs(c.argv).choice)
}

for (const c of golden.cases) {
  if (c.name === 'big500') continue   // 1.3 s; covered by the CLI comparison in the plan, not by every test run
  Deno.test(`golden board ${c.name} reproduces the fingerprint recorded on Node`, () => {
    const r = generate(paramsOf(c), { unchecked: c.argv === null })
    assertEquals(fingerprint(r.board), c.fingerprint)
    assertEquals(r.board.pieces.length, c.pieces)
  })
}
```

`deno test --allow-read prototype/fingerprints.test.ts` → 8 pass.

- [ ] **Step 5: Bundle, compile, lab smoke**

```sh
deno task bundle && deno task compile && ./prototype/dist/carve --advanced --dry-run | jq -r .fingerprint
```

Expected: the `defaults` fingerprint from `fingerprints.json`. Then `sh prototype/lab.sh` and the Chrome smoke of Task 11 step 5 against the Deno server; stop it.

- [ ] **Step 6: Commit**

```sh
git add -A && git commit -m "Integrate the Deno streams: engine.ts everywhere, golden fingerprints guarded by a test"
```

---

### Task 13: Documentation and the PR

**Files:**
- Modify: `CLAUDE.md`, `prototype/README.md`

- [ ] **Step 1: `CLAUDE.md`**

Replace the Prototype section:

```markdown
## Prototype

- The prototype is TypeScript on Deno 2.9: `deno task test` must pass after
  every change, and `deno task verify` (check, lint, fmt, test) before a PR.
- The engine (`prototype/engine.ts`) knows neither Deno nor the DOM, and so do
  `command.ts`, `lab-simple.ts`, `lab-presets.ts`, `lab-i18n.ts`: the DOM lib
  is referenced only in `lab-page.ts`, and `neutral.test.ts` greps the rest.
  Never spread arrays proportional to the number of cells or pieces
  (`Math.min(...arr)`) — it overflows the worker stack in Chrome.
- No `any`, no non-null assertions; a type fix must never add a value-changing
  fallback in the engine (`fingerprints.test.ts` guards the boards).
- The lab page and worker are bundled by `deno task bundle` into
  `prototype/dist/` (gitignored); `sh prototype/lab.sh` builds, watches and serves.
- No attribution lines in commit messages or PR descriptions.
```

and in the Language section change `prototype/lab-i18n.mjs` to `prototype/lab-i18n.ts`.

- [ ] **Step 2: `prototype/README.md`**

Insert after the title:

```markdown
## Toolchain

Deno 2.9 (`deno --version`), no Node. `deno task test` runs every test,
`deno task verify` adds type check, lint and format check. The CLI is
`deno task carve …` (see `--help`); `deno task compile` builds a single
binary at `prototype/dist/carve`. The lab page and worker are TypeScript,
bundled by `deno task bundle` into `prototype/dist/`; `sh prototype/lab.sh`
builds once, rebuilds on every edit and serves without caching. The
generator is unchanged by the rewrite: `fingerprints.json` holds nine boards
recorded on Node, and `fingerprints.test.ts` reproduces them.
```

Then every command in the file: `node prototype/carve.mjs` → `deno task carve`; `node --test 'prototype/*.test.mjs'` → `deno task test`; `node prototype/lab-server.mjs` → `deno run --allow-net --allow-read --allow-write --allow-env prototype/lab-server.ts`; file names `engine.mjs`/`carve.mjs`/`lab-simple.mjs`/`lab-presets.mjs`/`lab-i18n.mjs`/`command.mjs`/`store.mjs`/`lab-worker.mjs` → `.ts`. Measurement sentences ("~10 s in Node") stay as history.

```sh
grep -nE "node |\.mjs" CLAUDE.md prototype/README.md prototype/*.ts prototype/lab.sh prototype/lab.html
```

Expected: only historical measurement sentences in the README (e.g. "~10 s in Node"); no runnable Node command, no `.mjs` file reference.

- [ ] **Step 3: Commit, push, PR**

```sh
git add CLAUDE.md prototype/README.md && git commit -m "Docs: the prototype runs on Deno; commands, file names and the toolchain paragraph"
git push -u origin deno-typescript
/opt/homebrew/bin/gh pr create --title "Rewrite the prototype in TypeScript on Deno" --body "$(cat <<'EOF'
Every prototype module is strict TypeScript on Deno 2.9; Node is gone. Boards are unchanged: nine fingerprints recorded on Node before the first edit are reproduced by the Deno CLI and frozen in fingerprints.test.ts.

- deno.json with tasks (test, verify, carve, bundle, lab, compile), strict + noUncheckedIndexedAccess, lint forbidding any and non-null assertions
- types.ts: Params, Board, Piece, View, SimpleChoice, BoardMeta, worker messages
- engine.ts: types added, algorithm untouched; InvalidParamsError instead of a RangeError with a property
- store/lab-server/carve on Deno APIs; the canonical command is `deno task carve …`
- lab page script extracted to lab-page.ts and bundled with the worker into dist/
- docs updated; spec in docs/superpowers/specs/2026-09-09-deno-typescript-rewrite-design.md
EOF
)"
```

- [ ] **Step 4: Clean up worktrees after the merge**

```sh
git worktree remove .claude/worktrees/deno-engine && git worktree remove .claude/worktrees/deno-side && git worktree remove .claude/worktrees/deno-browser
git branch -d deno-engine deno-side deno-browser
```

Done when the PR is merged by the user and `main` fast-forwards.
