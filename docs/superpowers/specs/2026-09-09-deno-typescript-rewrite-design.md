# Arrowz — rewriting the prototype in TypeScript on Deno

Date: 2026-09-09
Status: approved for implementation planning

## 1. Goal and scope

The prototype under `prototype/` (generator engine, CLI, board store, lab
server, browser lab and worker, 12 test files) is plain JavaScript (`.mjs`) run
by Node 24. It becomes fully typed TypeScript run by Deno 2.9, with no Node
left anywhere in the repository.

What "fully typed" means here:

- `strict` plus `noUncheckedIndexedAccess` and `exactOptionalPropertyTypes`;
- no `any`, no non-null assertion `!` — both enforced by `deno lint`;
- the parameter set, the board, the view, the simple-view choice, the board
  meta and the worker messages are named types shared by every module, so a
  misspelt key anywhere on the CLI → URL → worker → store path fails to compile.

What does **not** change:

- the generator's behaviour: the same command gives the same board byte for
  byte, proven by fingerprints recorded on Node before the first edit (§9);
- the file set and its responsibilities: every `.mjs` becomes a `.ts` of the
  same name; the only new modules are `types.ts` and `lab-page.ts` (the script
  taken out of `lab.html`);
- the tests: every existing test survives 1:1, ported to `Deno.test`;
- the repository rules (English everywhere, bilingual lab, engine without
  `process` or DOM) — some of them become compiler errors instead of
  conventions.

The rewrite stays a prototype in `prototype/`. The runtime-neutral modules
(§5) use no Deno, DOM or Node API, so the future Angular 22 client can import
them unchanged; the `core/` layout of the product is decided together with the
Angular scaffold, not here.

## 2. Decisions

| Decision | Choice | Why |
| --- | --- | --- |
| Role of the code | Prototype in `prototype/`, engine runtime-neutral | Keeps the lab and CLI as they are; Angular imports the typed engine later without a second cleanup. |
| TypeScript in the browser | `deno bundle --platform browser` into gitignored `prototype/dist/` | The browser loads JS only. One build step, source maps, no npm; the same command shape exists in esbuild as a fallback. |
| Node | Dropped entirely; `deno compile` as an optional artefact | One runtime to maintain. The compiled CLI already works (measured 2026-09-09: same fingerprints, 68 MB). |
| Strictness | `strict` + `noUncheckedIndexedAccess` + `exactOptionalPropertyTypes`, lint forbids `any` and `!` | The engine indexes typed arrays everywhere; unchecked access is where silent `undefined` hides. |
| Migration strategy | Contract first, then three parallel streams, then integration | The engine (2 013 lines) is the critical path; a written contract lets the CLI/store stream and the browser stream run beside it. |
| Formatting | `deno fmt` adopted; a fmt-only commit on the `.mjs` files comes first | The formatter breaks one-line `{ a; b }` blocks the engine is full of. Formatting before typing keeps the typing diff readable and removes style from the agents' hands. |
| Canonical command | `deno task carve …` (prefix exported from `command.ts`) | Shortest runnable text; permissions live in `deno.json`, not in every stored board. Old `node prototype/carve.mjs` commands in the gitignored store stop working, which is acceptable for throwaway output. |

## 3. Repository layout and toolchain

```
deno.json                 tasks, compilerOptions, fmt, lint, imports, exclude
deno.lock                 committed
prototype/
  types.ts                shared domain types (§4)
  engine.ts               generator, metrics, renderer, PARAM_SPEC, rules
  command.ts              command text, parsers, help, board id
  lab-simple.ts           simple view: choice → parameters
  lab-presets.ts          preset tree
  lab-i18n.ts             EN source dictionary, PL translation
  store.ts                board store on disk            (Deno API)
  lab-server.ts           static files + /api/boards     (Deno API)
  carve.ts                CLI                            (Deno API)
  lab-page.ts             the lab page script            (browser, from lab.html)
  lab-worker.ts           the generation worker          (browser)
  lab.html                markup and CSS only; loads ./dist/lab-page.js
  lab.sh                  bundle once, then watch + server
  *.test.ts               the 12 existing test files plus fingerprints.test.ts
  dist/                   gitignored bundle output (lab-page.js, lab-worker.js, maps, carve binary)
  boards/                 gitignored board store (unchanged)
```

`deno.json` at the repository root, so every task runs from any directory in
the repo and the config is found by `deno test`, `deno check` and the IDE:

```jsonc
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
  "fmt": { "semiColons": false, "singleQuote": true, "lineWidth": 120 },
  "lint": {
    "rules": { "tags": ["recommended"], "include": ["no-explicit-any", "no-non-null-assertion"] }
  },
  "exclude": ["docs/", "prototype/boards/", "prototype/dist/"],
  "tasks": {
    "test":    "deno test --allow-read --allow-write --allow-env --allow-run --allow-net prototype/",
    "check":   "deno check prototype/*.ts",
    "lint":    "deno lint",
    "fmt":     "deno fmt --check",
    "verify":  "deno task check && deno task lint && deno task fmt && deno task test",
    "carve":   "deno run --allow-read --allow-write --allow-env prototype/carve.ts",
    "bundle":  "deno bundle --platform browser --outdir prototype/dist --sourcemap linked prototype/lab-page.ts prototype/lab-worker.ts",
    "lab":     "sh prototype/lab.sh",
    "compile": "deno compile --allow-read --allow-write --allow-env -o prototype/dist/carve prototype/carve.ts"
  }
}
```

The exact version pins land in `deno.lock`. `lint` and `fmt` also cover the
test files. `deno bundle` prints an "experimental" notice; that is accepted for
a prototype.

Library references are per file, not global: `lab-page.ts` starts with
`/// <reference lib="dom" />` (and `dom.iterable`), `lab-worker.ts` with
`/// <reference no-default-lib="true" />` and `/// <reference lib="deno.worker" />`.
Every other file sees Deno's default `deno.window` library, which has no
`document`, so DOM use in the engine or the store is a compile error (verified
with Deno 2.9.6: both files type-check in one `deno check` run).

## 4. The type contract

### 4.1 `types.ts`

Cross-module types that depend on no runtime value. All fields are required
unless marked optional; numbers are plain `number`.

- `ParamKey` — the explicit union of the 31 knob keys of `PARAM_SPEC`
  (`'W' | 'H' | 'seed' | 'wShort' | …`). Listed here once; the engine asserts
  at type level that `(typeof PARAM_SPEC)[number]['key']` equals `ParamKey`
  in both directions, so a knob cannot exist in one place without the other.
- `ParamSpec` — `{ key: ParamKey; label: string; group: ParamGroup; min: number; max: number; step: number; def: number; help: string; inactive?: (p: Params) => InactiveKey | null }`
  (the optional field name follows the engine's actual table).
- `Params` — `Record<ParamKey, number> & { ruleB: boolean; voidFrac: number; trace?: (info: TraceInfo) => void; debug?: (msg: string) => void }`.
  `defaultParams()` returns a `Params`; the lab state, the CLI and the worker
  carry a `Params`, never a partial one.
- `TraceInfo` — `{ pieces: number; remaining: number; backtracks: number; ms: number; total: number }`.
- `RuleKey` — `'sharesSum' | 'lmaxHole' | 'mixHole'`; `InactiveKey` — the keys of `INACTIVE_REASONS`.
- `Violation` — `{ kind: 'range'; key: ParamKey; value: unknown; min: number; max: number } | { kind: 'rule'; key: RuleKey; keys: readonly ParamKey[] }`.
- `Cell` — `{ x: number; y: number }`; `Piece` — `{ id: number; cells: Cell[]; dir: number }`.
- `CarverStats` — the counters the engine keeps (`want, got, stall, strandTrunc, strandLoss, n` required; `absorbed, absorbs, absorbScanned, headScans, headScanHits` optional).
- `Board` — the public surface of `Carver` that `analyse`, `toSvg`, `render`
  and `fingerprint` read: `{ W; H; owner: Int32Array; pieces: Piece[]; stats: CarverStats; backtracks: number; remaining: number }`.
  `Carver implements Board`; consumers take `Board`, not `Carver`.
- `Metrics` — the object `analyse` returns (`N, solvable, unsolved, f0, T2, almost, D, bends, multiLine, coil, selfAdj, bendsPerCell, span, spanTop10, spanMax, outDeg, maxOut, blockDist, neighbours, sharedBorder, longPieces, meanCorridorLen, minLen, maxLen, hist, coverage`), `hist` as `Record<'2-6' | '7-15' | '16-49' | '50+', number>`.
- `Stuck` — `{ remaining: number; sizes: number[]; heads: number | null }`.
- `GenerateResult` — `{ board: Board; metrics: Metrics | null; ok: boolean; restartsUsed: number; backtracks: number; genMs: number; metricsMs: number; stuck: Stuck | null }`.
- `SvgOptions` — `{ cell?: number; colored?: boolean; top?: number; voids?: boolean; strokeRatio?: number; headWidth?: number; headHeight?: number }`.
- `View` — `{ cell: number; stroke: number; headWidth: number; headHeight: number; colored: boolean; top: number }` (the shape of `DEFAULT_VIEW`).
- `Range` — `{ lo: number; hi: number; def: number } | { pick: readonly number[]; def: number }`.
- `SimpleChoice` — `{ W: number; H: number; lengths: number; shape: number; skeleton: 'off' | 'on'; seed: number; random?: boolean }`;
  `normalizeChoice(raw: unknown): SimpleChoice`.
- `Preset` — `{ id: string; mode: 'square' | 'portrait' | 'tunnels' | 'skeleton' | 'serpentine'; params: Partial<Record<ParamKey, number>> }`; `PresetLevel` — `{ id: string; options: Preset[] }`.
- `BoardMeta` — what `saveBoard` writes and `listBoards` returns per board:
  `{ id; W; H; seed; params: Params; view: View; command: string; simpleCommand?: string; source: string; createdAt: string; updatedAt: string; ok: boolean | null; pieces: number | null; maxLen: number | null; genMs: number | null; svgBytes: number }`.
  `BoardSize` — `{ size: string; W; H; cells: number; boards: BoardMeta[] }`.
- `WorkerIn` — `{ type: 'generate'; params: Params; view: View; tag?: string } | { type: 'render'; view: View; tag?: string }`.
- `WorkerOut` — `{ type: 'progress'; info: TraceInfo } | { type: 'error'; message: string } | { type: 'done'; ok; metrics; backtracks; restartsUsed; genMs; metricsMs; totalMs; stuck; pieces; stats } | { type: 'render'; svg: string; longest: LongestSummary[]; tag?: string }`.
- `Dictionary` — the shape of `EN`: `groups`, `groupHelp`, `presets`, `simple`, `ui`, each a record of string keys to strings (nested where the page nests them). `EN` is written first and `Dictionary` is `typeof EN` with every leaf widened to `string`; `PL` is declared as `Dictionary & { reasons: Record<InactiveKey | RuleKey, string>; params: Record<ParamKey, { label: string; help: string }> }` — the English label, help and reason texts live in `PARAM_SPEC`, `INACTIVE_REASONS` and `RULE_REASONS`, so only the translation carries those two sections. A Polish string missing for any English key, a Polish function with more parameters than its English original, or a Polish knob text for a key the engine does not have, is a compile error; a Polish function with fewer parameters still compiles.

### 4.2 `engine.d.ts` — the build-time contract

During the parallel phase the engine is still `engine.mjs`. Consumers in the
other streams import it with a `@ts-types` directive:

```ts
// @ts-types="./engine.d.ts"
import { generate, toSvg } from './engine.mjs'
```

`engine.d.ts` declares every export of the engine with its final signature
(§5.1). The engine stream must make `engine.ts` satisfy it; the integration
phase switches the imports to `./engine.ts`, deletes `engine.d.ts` and the
directives. Verified on Deno 2.9.6: the directive types a local `.mjs` import
and a deliberate type error in the consumer is reported.

The same trick is not needed for `command`, `lab-simple`, `lab-presets` and
`lab-i18n`: they are converted in phase 0 (§11), before the streams start.

## 5. Module map

### 5.1 Runtime-neutral modules

No `Deno.`, no DOM, no `node:` imports, no `process`. A test greps these files
for those tokens (§6) on top of the per-file library references.

**`engine.ts`** — exports as today, typed:

```ts
export const DIRS: readonly { dx: number; dy: number }[]
export function mulberry32(seed: number): () => number
export class Carver implements Board { constructor(W: number, H: number, params: Params, rng: () => number); run(maxBacktracks?: number): boolean; /* …every method the tests call, with the parameter types the tests pass… */ }
export const PARAM_SPEC: readonly ParamSpec[]      // `as const satisfies` + key-set assertion against ParamKey
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

`generate` throws a `RangeError` with a `violations: Violation[]` property;
that becomes a named class `InvalidParamsError extends RangeError` so callers
narrow with `instanceof` instead of reading an untyped property. Internals:
`{x, y}` path objects, closures in `defectKernel`, `Map` memos and typed-array
scratch stay exactly as they are — the rewrite adds types, it does not
restructure the algorithm. Every index into an array or `Map.get` that the
compiler now flags as possibly `undefined` is resolved by the pattern that
keeps the emitted code identical in behaviour: a local `const v = arr[i]` with
an explicit check where a check is genuinely possible, or a small typed helper
(`at(arr, i)`) that throws on `undefined` where the algorithm guarantees the
index is valid. No `!`, no `as number`.

**`command.ts`** — `COMMAND_PREFIX = 'deno task carve'` exported and used by
`buildCommand`, `buildSimpleCommand`, `helpText` and the tests; `parseArgs(argv: readonly string[]): { params: Params; view: View; rest: string[] }`;
`parseSimpleArgs(argv): { choice: SimpleChoice & { random: boolean }; view: View; rest: string[]; errors: string[] }`;
`boardId(params: Params): string`; `ALIASES`, `DEFAULT_VIEW: View`, `helpText({ advanced?: boolean })`.

**`lab-simple.ts`** — `SIMPLE_SIZES`, `SIMPLE_CHOICES`, `SIMPLE_SLIDERS`,
`exportCell(W, H)`, `defaultChoice(): SimpleChoice`, `normalizeChoice(raw: unknown): SimpleChoice`,
`simpleRanges(choice): Partial<Record<ParamKey, Range>>`, `simpleParams(choice, rng?: (() => number) | null): Params`.

**`lab-presets.ts`** — `PRESETS: readonly PresetLevel[]`, `findPreset(params: Params): Preset | null`.

**`lab-i18n.ts`** — `EN` (source, `satisfies Dictionary`), `PL: Dictionary`.

### 5.2 Deno-side modules

**`store.ts`** — `Deno.mkdirSync`, `Deno.readTextFileSync`, `Deno.writeTextFileSync`,
`Deno.readDirSync`, `Deno.statSync`, `Deno.removeSync`; `Deno.env.get('ARROWZ_BOARDS_DIR')`;
`@std/path` for `join`/`dirname`/`fromFileUrl`; `new TextEncoder().encode(svg).byteLength`
replaces `Buffer.byteLength`. Signatures: `boardsDir(): string`,
`saveBoard(input: { svg: string; params: Params; view: View; command: string; simpleCommand?: string; metrics?: Partial<Pick<BoardMeta, 'ok' | 'pieces' | 'maxLen' | 'genMs'>>; source: string }): BoardMeta`,
`deleteBoard(size: string, id: string): boolean`, `listBoards(): BoardSize[]`.
The JSON files on disk keep their exact shape, so boards saved by the Node
version still list and open.

**`lab-server.ts`** — `Deno.serve({ port, hostname: '127.0.0.1' }, handler)` with
`Request`/`Response`; `createLabServer(): (req: Request) => Promise<Response>`
exported for the test, `Deno.serve` called under `import.meta.main`. Routes,
status codes, headers (`Cache-Control: no-store`), the path-traversal guards
and the MIME map are unchanged (plus `.map` for source maps, minus the dead
`.mjs` entry); `dist/` is served like any other file under
`prototype/`. A request for `/dist/…` that finds no file answers 404 with the
message `run: deno task bundle`, so a missing build is diagnosed in the browser
instead of a blank page.

**`carve.ts`** — `Deno.args`, `Deno.env.get`, `Deno.exit`; `Deno.writeTextFileSync`
for `--svg=path`; `import.meta.main` guards the run. Output text, exit codes
(0 ok, 1 unclosed, 2 bad input), the `--dry-run` JSON line and the report and
benchmark modes are unchanged, except that the usage lines and the
`command` field carry the new prefix (§8).

### 5.3 Browser modules

**`lab-page.ts`** — the `<script type="module">` of `lab.html` moved verbatim
into a file and typed: the `state` is a `Params`, `simpleChoice` a
`SimpleChoice`, the worker channel `WorkerIn`/`WorkerOut`, the library a
`BoardSize[]`; element lookups go through one `el<T extends HTMLElement>(id: string): T` helper
that throws on a missing id (the ids are fixed in the markup, a missing one is
a bug). Worker creation becomes `new Worker(new URL('./lab-worker.js', import.meta.url), { type: 'module' })`
— both bundles sit in `dist/`, so the relative URL resolves after bundling.
`lab.html` keeps its markup and CSS and replaces the inline script with
`<script type="module" src="./dist/lab-page.js"></script>`.

**`lab-worker.ts`** — `self.onmessage = (e: MessageEvent<WorkerIn>) => …`,
`post(m: WorkerOut)`; `InvalidParamsError` is reported through the `error`
message as today.

## 6. Tests

- Every `x.test.mjs` becomes `x.test.ts`; `import { test } from 'node:test'`
  becomes `Deno.test`, `node:assert/strict` becomes `@std/assert`
  (`assertEquals`, `assertStrictEquals`, `assertMatch`, `assertThrows`, `assert`).
  `before`/`after`/`beforeEach` become explicit setup in the test body or a
  `Deno.test` with steps.
- Child processes: `carve.test` runs the CLI with
  `new Deno.Command(Deno.execPath(), { args: ['run', '--allow-read', '--allow-write', '--allow-env', carvePath, ...argv], env, stdout: 'piped', stderr: 'piped' }).outputSync()`;
  argv comes from splitting the command text after `COMMAND_PREFIX`. The
  worker memory-limit test in `engine.test` runs
  `Deno.execPath() run --v8-flags=--max-old-space-size=256 -` with the script on stdin.
- `lab-server.test` calls `createLabServer()` directly with `Request` objects
  where it can, and `Deno.serve` on port 0 for the end-to-end case.
- Temporary directories: `Deno.makeTempDirSync({ prefix: 'arrowz-…' })`; the
  store reads `ARROWZ_BOARDS_DIR` at call time as today, so tests set it with
  `Deno.env.set` before importing nothing — the import order trick with
  dynamic `import()` disappears.
- New `neutral.test.ts`: reads the runtime-neutral files (§5.1) and asserts
  none contains `Deno.`, `document`, `window.`, `localStorage`, `process.` or
  `from 'node:`.
- New `fingerprints.test.ts`: the golden set of §9 as a permanent guard
  (each case under two seconds on the development machine).
- Every test file keeps its name, every test its title, so the count and the
  list reported by `deno test` match the Node list recorded in phase 0.

## 7. The lab in the browser

`lab.sh` becomes:

```sh
#!/bin/sh
# Starts the generator lab at http://localhost:8777/lab.html
set -e
cd "$(dirname "$0")/.."
PORT=${1:-8777}
deno task bundle                              # once, so the first load has a build
deno task bundle --watch &                    # rebuild on every edit
WATCH=$!
deno run --allow-net --allow-read --allow-write --allow-env prototype/lab-server.ts "$PORT" &
SRV=$!
trap 'kill $WATCH $SRV 2>/dev/null' EXIT INT TERM
sleep 1
open "http://localhost:$PORT/lab.html" 2>/dev/null || true
wait $SRV
```

The server keeps `Cache-Control: no-store`, so a rebuilt bundle reaches the
browser on the next reload exactly as an edited `engine.mjs` did. Each bundle
carries its own copy of the engine (the page needs `PARAM_SPEC` and the
validators, the worker needs `generate` and `toSvg`); the duplication is a few
tens of kilobytes and irrelevant.

## 8. Canonical command text

`COMMAND_PREFIX` is `deno task carve`. Full form:
`deno task carve --advanced --svg --w=25 --h=50 --seed=7 --cell=12`; simple
form: `deno task carve --width=25 --height=50 --seed=7`. `deno task` finds the
root `deno.json` from any directory inside the repository and appends the
flags to the task, so the text is runnable as printed. `helpText` prints the
same prefix in its usage lines. The `command` and `simpleCommand` fields of
every board saved after the change use it; `carve.test` keeps proving that the
stored command reproduces the board byte for byte.

## 9. Verification

### 9.1 Golden set, recorded before the first edit

A script (kept in the plan, not in the repo) runs the Node CLI with
`--dry-run` for these commands and stores the JSON lines in
`/tmp/arrowz-golden/`:

1. `--advanced --dry-run` (defaults, 25×50, seed 7)
2. `--width=25 --height=50 --dry-run` (simple default; must equal 1)
3. `--advanced --dry-run --w=100 --h=200 --giants=4` (skeleton preset)
4. `--advanced --dry-run --w=100 --h=200 --headbias=1` (tunnels)
5. `--advanced --dry-run --w=100 --h=100 --mix=0.5` (layers mixing)
6. `--width=200 --height=200 --length=0 --straight=0 --dry-run` (the slow corner)
7. `--width=200 --height=200 --length=1 --straight=1 --skeleton --dry-run`
8. `--advanced --dry-run --w=500 --h=500` (the 500×500 reference: fingerprint `298c749e` per the 2026-09-09 note)
9. `generate({ ...defaultParams(), W: 40, H: 40, seed: 1, voidFrac: 0.1 })` through a one-line Node script (`voidFrac` has no CLI flag): fingerprint and piece count

Also recorded: `node --test 'prototype/*.test.mjs'` summary (test count, names)
and `--help` / `--advanced --help` text.

### 9.2 Acceptance criteria

- `deno task verify` passes: `deno check`, `deno lint`, `deno fmt --check`,
  `deno test` — all tests green, same count and titles as the Node list.
- The Deno CLI reproduces every golden JSON line of §9.1 with the same
  `fingerprint`, `pieces`, `maxLen`, `bends`, `coiling`, `f0`, `backtracks`,
  `restarts` and `svgBytes` (timing fields excluded); `fingerprints.test.ts`
  freezes cases 1–7 and 9.
- `--help` texts equal the recorded ones except for the command prefix.
- `deno task bundle` builds; `sh prototype/lab.sh` opens the lab; in Chrome:
  the simple view generates 25×50 and 200×200, the advanced view loads the
  `insane-square` preset and generates it in the worker with progress, a board
  is saved and appears in the library, opens from it and is deleted, the
  language switch works, and the command shown equals the one the CLI prints
  for the same board.
- `deno task compile` produces `prototype/dist/carve` and it reproduces golden
  case 1.
- `grep -rn "node " CLAUDE.md prototype/README.md prototype/*.ts prototype/lab.sh`
  finds no remaining Node invocation.

## 10. Documentation and repository rules

- `CLAUDE.md`: the test command becomes `deno task test` (and `deno task verify`
  before a PR); file names `engine.mjs` → `engine.ts`, `lab-i18n.mjs` →
  `lab-i18n.ts`; the "engine knows neither `process` nor DOM" rule stays and
  gains "the compiler enforces it: no `dom` lib outside `lab-page.ts`".
- `prototype/README.md`: the 35 `node …` invocations become their Deno forms;
  a short "Toolchain" paragraph at the top (Deno version, tasks, bundle, why
  `dist/`); the rounds' measurements stay as they are, as history.
- `.gitignore`: `prototype/dist/`.
- `docs/superpowers/plans/2026-09-07-arrowz/*`: untouched (they describe the
  product, not the prototype).

## 11. Phases and parallel streams

**Phase 0 — contract (single agent, on `deno-typescript`).**
Commit A: golden set recorded (§9.1). Commit B: `deno fmt` over the `.mjs`
files, tests and fingerprints re-run and unchanged. Commit C: `deno.json`,
`deno.lock`, `.gitignore`, `types.ts`, `engine.d.ts`, `lab-presets.ts`,
`lab-i18n.ts`, `lab-simple.ts`, `command.ts` with their four tests on
`Deno.test`; the remaining modules still `.mjs`, importing the engine with
`@ts-types`. `deno check` and the ported tests green.

**Phase 1 — three streams in worktrees, one contract.** Each agent receives:
this spec, the file ownership below, the exact export signatures (§5), the
rule "never end the turn to wait for someone; if blocked, write the blocker
into your report and continue with what you can", and the definition of done:
`deno check` on the owned files, the owned tests green under `deno test`,
lint and fmt clean, no `any`, no `!`.

| Stream | Owns | Done when |
| --- | --- | --- |
| A engine | `engine.ts`, `engine.test.ts`, `absorb.test.ts`, `shortening.test.ts`, `envelope.test.ts` | satisfies `engine.d.ts` (a type test `const _: typeof import('./engine.d.ts') = engineModule`), the four tests green, golden cases 1–7 and 9 reproduced through `generate` |
| B Deno side | `store.ts`, `lab-server.ts`, `carve.ts`, `store.test.ts`, `lab-server.test.ts`, `carve.test.ts`, `neutral.test.ts` | CLI golden lines reproduced (through `engine.mjs` + `@ts-types` until integration), tests green |
| D browser | `lab-page.ts`, `lab-worker.ts`, `lab.html`, `lab.sh`, `deno.json` task `bundle` only | `deno task bundle` builds, `deno check` on both files, lab smoke in Chrome against the phase-0 server |

No stream edits `types.ts` or `engine.d.ts`; a gap in the contract is
reported, and the integrating agent changes it.

**Phase 2 — integration (single agent).** Merge the three worktrees, switch
every `@ts-types` import to `./engine.ts`, delete `engine.d.ts` and
`engine.mjs`, run `deno task verify`, the golden comparison, the lab smoke and
the compile check; write `fingerprints.test.ts`; update the docs (§10); open
the PR.

## 12. Risks

- **Formatting changes behaviour.** It cannot: `deno fmt` rewrites whitespace
  only. Commit B re-runs the Node tests and the golden set anyway.
- **A type fix changes a branch.** `noUncheckedIndexedAccess` tempts
  `?? 0`-style defaults inside the hot loops; a wrong default silently changes
  a board. Rule for the engine stream: never add a value-changing fallback; use
  a check or the throwing `at()` helper, and rerun the fingerprint tests after
  every method.
- **`deno bundle` is experimental.** If it regresses, `npx esbuild` with the
  same entry points and `--platform=browser --bundle --format=esm --outdir`
  is a drop-in; the task name stays.
- **`Deno.serve` semantics.** A `Request` body is read once and the server
  answers `Response` objects; the tests cover every route, so a behavioural
  difference surfaces there.
- **Contract gaps.** Something a stream needs is missing from `types.ts` or
  `engine.d.ts`. The stream reports it and keeps going with a local, clearly
  marked type; integration folds it into the contract.

## 13. Out of scope

- Any change to generator behaviour, knob ranges, presets or texts.
- Restructuring the engine into smaller modules (the file stays one module;
  splitting is a separate, behaviour-neutral refactor after the rewrite).
- The `core/` layout for Angular, npm packaging, CI workflows.
- Replacing `deno bundle` with a dev server that transpiles on the fly.
