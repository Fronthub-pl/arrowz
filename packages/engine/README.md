# @arrowz/engine

The Arrowz board generator and everything that surrounds it: the parameter
table and its safe envelope, the board file, the game rules, the SVG export,
the command-line vocabulary, and the texts and tables the lab shows. It knows
neither Deno nor the DOM, so the same code runs in the CLI, in a browser
worker and in Node.

This README is the API reference. Every entry point and every export is listed
below, with the signature or shape the code declares; `readme.test.ts` compares
the two both ways, so what is written here is what the package exports. The
measurements behind the numbers are in [HISTORY.md](HISTORY.md).

## Contents

- [Usage](#usage)
- [What the generator promises](#what-the-generator-promises)
- [Entry points](#entry-points)
- [API](#api)
- [Development](#development)

## Usage

Inside this repository Deno resolves `@arrowz/engine` through the workspace.
A Node project gets the compiled package from `dist/`, which
`pnpm nx build engine` emits; it never imports the `.ts` sources.

```ts
import { encodeBoard, generate, newSession, play, presetParams, toSvg } from '@arrowz/engine'

// The recommended entry point: a board in the CLI's vocabulary.
const params = presetParams({ W: 40, H: 40, seed: 7, length: 0.5 })
const { board, ok, metrics } = generate(params)
if (!ok) throw new Error('the board did not close')

const file = encodeBoard(board) // JSON.stringify(file) is a .board.json
const svg = toSvg(board, { colored: true })

// The game: a click sends a piece off the board or bounces it.
const first = board.pieces[0]
if (first !== undefined) {
  const { next, move } = play(newSession(board), first.id)
  console.log(move.kind, next.left) // 'exit' and the pieces still on the board, or 'bounce'
}
```

`generate` throws `InvalidParamsError` before it carves anything when the
parameters leave the safe envelope; `validateParams` says the same thing
without throwing. A run that does not close still returns its board, with
`ok: false` and the leftover in `stuck`.

## What the generator promises

Every board `generate` hands back with `ok: true` has been checked:

| Promise | What it means |
|---|---|
| **Nothing is left over** | Every cell belongs to exactly one arrow. No gaps, no overlaps. |
| **No arrow is a single cell** | The shortest arrow is two cells, because a single cell would have no direction to point in. |
| **The board can always be cleared** | Before handing the board over, the generator works out who blocks whom and proves the puzzle has a solution. |
| **It knows at least one solution** | The order in which the generator built the arrows is itself a winning order. |
| **You cannot play yourself into a corner** | Any sequence of legal moves eventually empties the board. |
| **The same request gives the same board** | The same parameters and the same seed give the identical board, down to the last cell; `fingerprint` is that guarantee in one string. |

What it does **not** promise is that every request succeeds. On hard settings
the generator can paint itself into a corner while building. It then takes
some arrows back and tries again; if that still fails, it starts over from a
derived seed, up to `restarts` times. If every attempt fails, the result says
so (`ok: false`, with the leftover in `stuck`) instead of passing a broken
board off as a good one.

## Entry points

| Entry | Source | What it is for |
|---|---|---|
| `@arrowz/engine` | `mod.ts` | The generator, the parameter table, the board file, the game, the look and the SVG export. |
| `@arrowz/engine/command` | `command.ts` | The command line: parsing argv, writing a command back, the knob and rule tables `--help` prints. |
| `@arrowz/engine/simple` | `lab-simple.ts` | The everyday choice (size, lengths, winding, skeleton) and the parameters drawn from it. |
| `@arrowz/engine/presets` | `lab-presets.ts` | The lab's preset boards, by difficulty. |
| `@arrowz/engine/i18n` | `lab-i18n.ts` | The lab's dictionaries, English and Polish. |
| `@arrowz/engine/report` | `lab-report.ts` | The run report: the statistics table, its deltas and the summary of a seed series. |
| `@arrowz/engine/docs` | `lab-docs.ts` | The board element's documentation tables, as the lab renders them. |
| `@arrowz/engine/comment-lines` | `comment-lines.ts` | Comment lines of a TypeScript or CSS source, for the repository's comment guards. |

`deno.json` and `package.json` export the same entry points, the second from
`dist/`.

## API

Each entry point has a table per kind: functions, classes, constants and
types. A signature or a shape is written as TypeScript; a constant is spelled
out when it fits in a line and described when it does not.

### `@arrowz/engine`

| Function | Signature | Behaviour |
|---|---|---|
| `analyse` | `(board: BoardData, ruleB?: boolean) => Metrics` | Measures a board: how hard it plays and how its arrows are shaped. `generate` runs it on every closed board; `ruleB` (default `true`) is the movement rule the measurement uses, and only tests turn it off. |
| `assignPalette` | `(board: BoardData, n: number) => Int32Array` | A colour index in `0 .. n - 1` per piece id: never a neighbour's, and among the free ones the least used so far, so the colours stay even. |
| `autoHeadWidth` | `(width: number, cell: number) => number` | The head width drawn when it is left automatic (`headWidth` 0), in the units of `width` and `cell`. |
| `clampParam` | `(spec: ParamSpec, value: number) => { value: number; clamped: boolean }` | Pulls a value loaded from outside (a URL, a preset, a stored board) into its knob's range and onto its grid; a value that is not a finite number becomes the default. Cross-knob rules are never clamped. |
| `decodeBoard` | `(file: unknown) => BoardData` | The board of a file, bit for bit. Throws `BoardFileError` with the reason for anything this engine cannot read; the last check is the fingerprint against the header. |
| `decodeBoardFile` | `(file: unknown) => { board: BoardData; file: BoardFile }` | `decodeBoard`, plus the very object it was given, typed as the file it was checked to be. |
| `defaultParams` | `() => Params` | Every knob at its default. |
| `encodeBoard` | `(board: BoardData) => BoardFile` | The file of a board. Throws `BoardFileError` for a piece whose cells are not a path. |
| `fingerprint` | `(board: BoardData) => string` | A hash of which cell belongs to which piece and of the order of the cells in each piece: the "same board for the same seed" guarantee in one string. |
| `formatViolation` | `(v: Violation) => string` | One English line for a violation, naming the knob by its label. |
| `generate` | `(params: Partial<Params>, opts?: GenerateOptions) => GenerateResult` | Carves a board, restarting with a derived seed on failure, and measures it. A knob left out takes its default. Throws `InvalidParamsError` when the merged parameters leave the safe envelope. |
| `giantStraightFloor` | `(p: Params) => number` | The skeleton straightness a share of skeleton arrows added mid-run needs, so that the board still fills. |
| `goneIds` | `(session: Session) => number[]` | The ids of the pieces that have left, ascending. |
| `hueBytes` | `(id: number) => [number, number, number]` | A piece's diagnostic hue as RGB bytes, for a vertex buffer. |
| `hueDegrees` | `(id: number) => number` | The angle of a piece's diagnostic hue, from its id, so a game or a file with gaps in the ids keeps every colour. |
| `hueOf` | `(id: number) => string` | That hue as a CSS colour, for a legend. |
| `isFiniteNumber` | `(v: unknown) => v is number` | A value that can be a knob: a number, and not NaN or an infinity. |
| `isHexColour` | `(c: unknown) => c is string` | A colour as a view stores it: `#rrggbb`. |
| `layoutHash` | `(board: BoardData) => Promise<string>` | The name of a board's arrangement of arrows, `sha256-` and 64 hex digits, blind to piece ids and carving order: two recipes that carve the same arrows get the same name, which `fingerprint` tells apart. |
| `loadSession` | `(board: BoardData, snap: SessionSnapshot) => Session` | Restores a saved game over its board; throws when the snapshot belongs to another board. |
| `longestSummary` | `(board: BoardData, n: number) => LongestSummary[]` | The `n` longest pieces: their box, how far they reach, how much they coil and how often they turn. The lab's longest table and the CLI's `--top` lines both come from here. |
| `newSession` | `(board: BoardData) => Session` | A fresh game over a board. The board is never modified. |
| `pieceShape` | `(pc: Piece, o: ShapeOptions) => PieceShape` | The drawn outline of one piece: its line, its head and its tail, in pixels. |
| `play` | `(session: Session, pieceId: number) => { next: Session; move: Move }` | One click: the piece leaves when its way out is clear and bounces off its first blocker otherwise. The session handed in is never modified. |
| `presetParams` | `({ W, H, seed, length, winding, skeleton, rng }: { W: number; H: number; seed?: number; length?: number; winding?: number; skeleton?: boolean; rng?: () => number }) => Params` | A full parameter set from the CLI's everyday vocabulary: the recommended entry point for an application. |
| `readParams` | `(raw: unknown) => Partial<Record<ParamKey, number>>` | The knob values of an object loaded from outside: finite numbers under `PARAM_SPEC` keys only. It does not check the envelope. |
| `resolveColours` | `(theme: string, stated: Partial<BoardColours>) => BoardColours` | The colours a board is drawn with: the defaults, then the named theme, then what the host stated, field by field. |
| `saveSession` | `(session: Session, colored: boolean) => SessionSnapshot` | A game as a snapshot: the removed ids and enough of the board's identity to refuse it on another board. |
| `snapToStep` | `(value: number, step: number, min: number) => number` | The nearest stop of a knob's grid, counted from its minimum. |
| `stepsAround` | `(value: number, step: number, min: number) => [number, number]` | The two stops a value between two steps sits between. |
| `straightFloor` | `(p: Params) => number` | The straightness a board of this size and winding needs to close, fitted to measured runs. |
| `themeOf` | `(name: string) => BoardTheme \| null` | The built-in theme of that name, or `null`; an unknown name is ignored, never thrown on. |
| `toSvg` | `(board: BoardData, opts?: SvgOptions) => string` | The board as an SVG document. Without options it draws the default look; the lab's export and the CLI's `--svg` both come through here. |
| `validateParams` | `(params: Params) => Violation[]` | Checks a full parameter set against the safe envelope: `[]` when valid, else one violation per knob out of range or off its step, and one per broken rule of `RULES`. |
| `voidStrips` | `(board: BoardData) => { x: number; y: number; len: number }[]` | The cells the generator failed to carve, merged into horizontal runs. |

| Class | Declaration | Meaning |
|---|---|---|
| `BoardFileError` | `extends Error { constructor(message: string) }` | A file this engine cannot read as a board, or a board no file can hold; the message says why. |
| `GenerateAbort` | `extends Error { constructor(message?: string) }` | Thrown from a `trace` callback to stop `generate`: the board carved so far comes back as a failed run with `aborted: true`, and no restart follows. The engine itself never throws it. |
| `InvalidParamsError` | `extends RangeError { constructor(violations: readonly Violation[]); readonly violations: readonly Violation[] }` | What `generate` throws for parameters outside the safe envelope, with every violation attached. |

| Constant | Value | Meaning |
|---|---|---|
| `BOARD_FILE_VERSION` | `1` | The board file version this engine writes and reads (`BoardFile.v`). |
| `BOARD_FORMAT` | `'arrowz-board'` | The `format` field of every board file. |
| `DEFAULT_COLOURS` | `{ paper: '#f6f6fa', ink: '#232447', highlight: '#e8467c', palette: [] }` | What a board is drawn in when nothing names a colour; `toSvg` without options draws the same. |
| `DEFAULT_HEAD_HEIGHT` | `1` | The head height in cells every surface starts from. |
| `DEFAULT_PAD` | `4` | Cells of margin unless a view says otherwise. |
| `DEFAULT_POINT_COLOR` | `'#c9c9d6'` | The point grid's dot colour. |
| `DEFAULT_POINT_RADIUS` | `0.06` | The point grid's dot radius, in cells. |
| `DEFAULT_ROUNDED` | `true` | Whether turns are drawn rounded and the tail as a disc, unless a surface is told otherwise. |
| `DEFAULT_SHOW_POINTS` | `false` | The point grid is off unless a view asks for it. |
| `DIRS` | the four `Dir`s: up, right, down, left | The directions, indexed by `Piece.dir`. |
| `INACTIVE_REASONS` | a `Record<InactiveKey, string>` | The English reason a knob has no effect, keyed by what `ParamSpec.inactive` returns. |
| `PAD_RANGE` | `{ min: 0, max: 16 }` | The margin a view may ask for, in whole cells. |
| `PALETTE_CAP` | `8` | The most arrow colours a view may state. |
| `PARAM_SPEC` | 28 `ParamSpec` rows, one per `ParamKey` | The knob table: every parameter with its range, step, default, label and help. Everything that reads or writes a knob goes through it. |
| `POINT_RADIUS_RANGE` | `{ min: 0, max: 0.5 }` | The radius a dot may have, in cells; past half a cell dots overlap. |
| `RULE_REASONS` | a `Record<RuleKey, string>` | The English text of each cross-knob rule. |
| `RULES` | 5 rules, each `{ key, keys, check }` | The safe envelope beyond the per-knob ranges: combinations measured to jam or leave a board unclosed. `keys` are the knobs a rule involves. |
| `THEMES` | 12 `BoardTheme`s by name | The built-in themes, a light and a dark variant of each of six palettes, with their source and licence. |

| Type | Shape | Meaning |
|---|---|---|
| `Board` | `BoardData & { stats: CarverStats; backtracks: number; remaining: number }` | What the generator hands back: the board plus how the carving went and how many cells stayed empty. |
| `BoardColours` | `{ paper: string; ink: string; highlight: string; palette: readonly string[] }` | The four colours a board is drawn in. |
| `BoardData` | `{ W: number; H: number; owner: Int32Array; pieces: Piece[] }` | A board as everything that draws or plays it reads it. `owner` is the piece id per cell, -1 for an uncarved cell, -2 for a void. |
| `BoardFile` | `{ format: 'arrowz-board'; v: 1; W: number; H: number; pieces: number; voids: number; unfilled: number; fingerprint: string; body: string }` | A board as a file: readable counts and the fingerprint around a packed base64 `body` only `decodeBoard` reads. |
| `BoardMeta` | `{ id: string; W: number; H: number; seed: number; params: Params; view: View; command: string; simpleCommand?: string; source: string; createdAt: string; updatedAt: string; ok: boolean \| null; pieces: number \| null; maxLen: number \| null; genMs: number \| null; fingerprint: string \| null; boardBytes: number \| null; svg: boolean; restarts: number \| null; backtracks: number \| null; aborted: boolean; stuck: Stuck \| null; sources: Recipe[] }` | One stored layout in the board store: `id` is its `layoutHash`, the top-level recipe fields copy the latest save, and `sources` lists every recipe that produced it. |
| `BoardSize` | `{ size: string; W: number; H: number; cells: number; boards: BoardMeta[] }` | The stored layouts of one board size, as the store lists them. |
| `BoardTheme` | `{ paper: string; ink: string; highlight: string; palette: readonly string[]; source: string; licence: string; url: string }` | A built-in theme: its colours and where they come from. |
| `CarverStats` | `{ want: number; got: number; stall: number; strandTrunc: number; strandLoss: number; n: number; absorbed?: number; absorbs?: number; absorbScanned?: number; headScans?: number; headScanHits?: number; stallOwn?: number; stallForeign?: number; stallEdge?: number; stallLen?: number; stallSelfTrap?: number; backbites?: number; backbiteGiveUps?: number }` | How the carving went: planned and reached lengths, arrows that stopped short and why (their own body, another arrow, the edge), leftovers merged into neighbours, and tail backbites. |
| `Cell` | `{ x: number; y: number }` | A cell, counted from the top-left corner. |
| `Dir` | `{ dx: number; dy: number; ch: string }` | One of the four directions; `ch` is its arrow glyph. |
| `GenerateOptions` | `{ unchecked?: boolean; trace?: (info: TraceInfo) => void; debug?: (msg: string) => void; voidFrac?: number; ruleB?: boolean }` | What `generate` takes beside the knobs: `unchecked` skips the envelope (engine tests only), `trace` reports progress and may throw `GenerateAbort`, `debug` receives diagnostics, and `voidFrac` and `ruleB` are test-only. |
| `GenerateResult` | `{ board: Board; metrics: Metrics \| null; ok: boolean; restartsUsed: number; backtracks: number; genMs: number; metricsMs: number; stuck: Stuck \| null; aborted: boolean; deadlock: boolean }` | A run: the board, its measurements, whether it closed, what it cost, the leftover of a jam, whether a `trace` stopped it, and `deadlock` for a full board no order of clicks empties. |
| `HistBucket` | `'2-6' \| '7-15' \| '16-49' \| '50+'` | The piece length buckets of `Metrics.hist`, in cells. |
| `InactiveKey` | `'skeletonOff' \| 'probeOff' \| 'stepZero' \| 'anticoilWins'` | Why a knob has no effect at the current settings. |
| `LongestSummary` | `{ len: number; sx: number; sy: number; span: number; density: number; coil: number; bends: number }` | One of the longest pieces: its length, its box, its reach, how much of the box it fills, how much it coils and how often it turns. |
| `Metrics` | `{ N: number; solvable: boolean; unsolved: number; f0: number; T2: number; almost: number; D: number; bends: number; multiLine: number; coil: number; selfAdj: number; bendsPerCell: number; span: number; spanTop10: number; spanMax: number; outDeg: number; maxOut: number; blockDist: number; neighbours: number; sharedBorder: number; longPieces: number; meanCorridorLen: number; minLen: number; maxLen: number; hist: Record<HistBucket, number>; coverage: number }` | The measurements of a board. `N` pieces; `solvable` when some order of clicks empties it, `unsolved` the pieces left otherwise; `f0` the share free at the start; `almost` pieces blocked by exactly one other; `T2` pieces whose nearest blocker is more than 2 cells ahead; `D` the longest chain of pieces waiting on one another; `outDeg` and `maxOut` how many pieces one blocks; `span` and its top and record the reach; `coil`, `selfAdj`, `bends` and `multiLine` the winding; `neighbours` and `sharedBorder` the wrapping of the `longPieces` (8 cells and more); `coverage` the share of cells carved. |
| `Move` | `{ kind: 'exit'; pieceId: number; dir: number; left: number; status: 'playing' \| 'won' } \| { kind: 'bounce'; pieceId: number; distance: number; blockerId: number } \| { kind: 'ignored' }` | What one click did: the piece left (`dir` is its direction, `left` the pieces still on the board), bounced off `blockerId` after `distance` cells, or nothing (a gone or unknown piece, or a won game). |
| `ParamControl` | `{ kind: 'number' } \| { kind: 'choice'; choices: readonly { value: number; word: string }[] }` | How the lab draws a knob: a number with a slider, or a fixed set of choices with the CLI's words. |
| `ParamGroup` | `'board' \| 'lengths' \| 'shape' \| 'difficulty' \| 'skeleton' \| 'closing'` | The group a knob belongs to in the lab's panel and in `--help=knobs`. |
| `ParamKey` | `'W' \| 'H' \| 'seed' \| 'wShort' \| 'wMid' \| 'Lmax' \| 'backbite' \| 'pStraight' \| 'wLateral' \| 'warns' \| 'anticoil' \| 'headBias' \| 'mix' \| 'trapBias' \| 'probe' \| 'probeLen' \| 'giants' \| 'giantSpan' \| 'giantStep' \| 'giantJitter' \| 'wGiant' \| 'giantStraight' \| 'giantAnticoil' \| 'giantSpacing' \| 'headTries' \| 'absorbLimit' \| 'maxBack' \| 'restarts'` | The key of every knob in `PARAM_SPEC`. |
| `Params` | `Record<ParamKey, number>` | A full parameter set: every knob and nothing else. |
| `ParamSpec` | `{ key: ParamKey; label: string; group: ParamGroup; min: number; max: number; step: number; def: number; help: string; inactive?: (p: Params) => InactiveKey \| null; surface?: 'start'; control?: ParamControl }` | One knob: its range, step and default, its English label and help, when it has no effect, whether `--start` writes it, and how the lab draws it. |
| `Piece` | `{ id: number; cells: Cell[]; dir: number; tailVersion?: number }` | One arrow: its cells from head to tail and the direction it leaves in (an index into `DIRS`). `tailVersion` is internal to the carver. |
| `PieceShape` | `{ line: [number, number][]; head: [number, number][]; tail: { x: number; y: number; r: number } }` | The outline `pieceShape` draws: the line's points, the head's polygon and the tail's disc. |
| `Preset` | `{ id: string; mode: PresetMode; params: Partial<Record<ParamKey, number>> }` | One preset board: the knobs it sets over the defaults. |
| `PresetLevel` | `{ id: string; options: Preset[] }` | A difficulty level of `PRESETS` and its presets. |
| `PresetMode` | `'square' \| 'portrait' \| 'tunnels' \| 'skeleton' \| 'serpentine'` | The kind of board a preset makes. |
| `Range` | `{ lo: number; hi: number; def: number } \| { pick: readonly number[]; def: number }` | The range the everyday choice draws a knob from: an interval, or a set of values to pick from. |
| `Recipe` | `{ id: string; params: Params; view: View; command: string; source: string; createdAt: string; updatedAt: string; genMs: number \| null; restarts: number \| null; backtracks: number \| null; aborted: boolean }` | One way of producing a stored layout: its parameters, view and command, and the run that used them. `id` is `boardId(params)`. |
| `RuleKey` | `'sharesSum' \| 'lmaxHole' \| 'startPair' \| 'straightFloor' \| 'giantWander'` | The cross-knob rules of `RULES`. |
| `SeedOutcome` | `'complete' \| 'incomplete' \| 'unsolvable' \| 'stopped'` | How one seed of a series ended; `unsolvable` is a full board no order of clicks empties. |
| `SeedRun` | `{ seed: number; outcome: SeedOutcome; pieces: number; maxLen: number \| null; genMs: number; remaining: number }` | One seed of a series, numbers only; `remaining` is the empty cells left. |
| `Session` | `{ readonly board: BoardData; readonly gone: Uint8Array; readonly index: Int32Array; readonly left: number; readonly status: 'playing' \| 'won' }` | A game in progress: `gone` is 1 per piece id that has left, `left` the pieces still on the board. `index` is an internal lookup. |
| `SessionSnapshot` | `{ v: 1; board: { W: number; H: number; pieces: number; fingerprint: string }; removed: number[]; colored: boolean }` | A saved game: the removed ids, the board's identity, and whether it was played in colour. |
| `ShapeOptions` | `{ cell: number; pad: number; width: number; headWidth: number; headHeight: number }` | How `pieceShape` draws: the cell size, the margin and the line and head sizes, in pixels. |
| `SimpleChoice` | `{ W: number; H: number; lengths: number; shape: number; skeleton: 'off' \| 'on'; seed: number; random?: boolean }` | The everyday choice: a size, two sliders in `0..1`, the skeleton switch and a seed. |
| `StoreRequest` | `{ board: BoardFile; params: Params; view: View; command: string; source: string; metrics?: { ok?: boolean \| null; pieces?: number \| null; maxLen?: number \| null; genMs?: number \| null; restarts?: number \| null; backtracks?: number \| null; stuck?: Stuck \| null; aborted?: boolean } }` | The body of a board-store write; `metrics` left out keeps what the store has (a view edit). |
| `Stuck` | `{ remaining: number; sizes: number[]; heads: number \| null }` | The leftover of a jam: empty cells, the sizes of the empty patches, and where a head could still start. |
| `SvgOptions` | `{ cell?: number; colored?: boolean; top?: number; voids?: boolean; strokeRatio?: number; headWidth?: number; headHeight?: number; rounded?: boolean; paper?: string; ink?: string; highlight?: string; palette?: readonly string[]; pad?: number; points?: { color: string; radius: number } }` | How `toSvg` draws: cell size, colour, the `top` longest pieces highlighted, voids, line and head sizes in cells, the colours, the margin and the point grid. Every field has a default. |
| `TraceInfo` | `{ pieces: number; remaining: number; backtracks: number; ms: number; total: number }` | What a `trace` callback hears while a board is carved. |
| `View` | `{ cell: number; stroke: number; headWidth: number; headHeight: number; colored: boolean; top: number; rounded: boolean; theme: string; palette: string[]; paper: string; ink: string; highlight: string; pad: number; showPoints: boolean; pointColor: string; pointRadius: number }` | How the lab and the CLI show a board. An empty colour or theme is "not stated": the theme or the default decides. |
| `ViewNumber` | `'cell' \| 'stroke' \| 'headWidth' \| 'headHeight' \| 'top'` | The fields of a `View` that carry a number, and so have a flag that takes one. |
| `Violation` | `{ kind: 'range'; key: ParamKey; value: unknown; min: number; max: number } \| { kind: 'step'; key: ParamKey; value: number; step: number; min: number } \| { kind: 'rule'; key: RuleKey; keys: readonly ParamKey[]; need?: number }` | One way parameters leave the safe envelope: a knob out of its range, a knob off its step, or a broken rule, with `need` the value a rule with a computed bound asks for. |
| `WorkerIn` | `{ type: 'generate'; params: Params; stop?: Int32Array } \| { type: 'svg'; board: BoardFile; options: SvgOptions } \| { type: 'seed'; params: Params; stop?: Int32Array }` | A message to the lab's generator worker: carve a board, draw an SVG, or run one seed of a series. `stop` is a shared flag that asks the run to stop. |
| `WorkerOut` | `{ type: 'progress'; info: TraceInfo } \| { type: 'error'; message: string } \| { type: 'svg'; svg: string } \| { type: 'done'; ok: boolean; metrics: Metrics \| null; backtracks: number; restartsUsed: number; genMs: number; metricsMs: number; totalMs: number; stuck: Stuck \| null; deadlock: boolean; aborted: boolean; pieces: number; stats: CarverStats; board: BoardFile } \| { type: 'seedDone'; run: SeedRun }` | A message from the worker: progress, an error, a drawn SVG, a finished board as its file, or a finished seed. |

### `@arrowz/engine/command`

| Function | Signature | Behaviour |
|---|---|---|
| `boardId` | `(params: Params) => string` | A board's id: the seed and a hash of the parameters, without the view, so the same command lands in the same slot in the browser and in the CLI. |
| `buildCommand` | `(params: Params, view?: Partial<View>) => string` | The command line that reproduces a board with this view. |
| `drawnViolations` | `(violations: readonly Violation[], typed: ReadonlySet<ParamKey>) => Violation[]` | The violations no edit of the command line could fix: a range or step violation on a knob the caller did not write (`typed` is what they did write). |
| `drawOf` | `(parsed: ParsedArgs, rng: () => number) => { params: Params; moved: Move[] }` | The knobs a parsed line carves: its choice, drawn when it says `--randomized`, with the knobs it names pinned on top, and the values the draw had to move. |
| `flagOf` | `(key: ParamKey) => string` | The flag that writes a knob. |
| `flagViolation` | `(v: Violation) => string` | A violation in the command line's words, starting with the flag to change. |
| `helpText` | `({ knobs }?: { knobs?: boolean }) => string` | The text of `--help`; with `{ knobs: true }` the full knob table and the rules follow. |
| `isPromptOrEnvWord` | `(word: string) => boolean` | Whether a word is a shell prompt (`$`) or a `NAME=value` environment word, as a line copied from a terminal carries in front of the command. |
| `isStartChoice` | `(v: string) => v is StartChoice` | Whether a string names a start choice. |
| `knobFlag` | `(params: Params, key: ParamKey) => string` | How one knob is written on the command line, flag and value; `headBias` and `mix` share `--start`, so the whole set is needed. |
| `parseArgs` | `(argv: readonly string[]) => ParsedArgs` | Splits argv into the everyday choice, the knobs it pins, the view, the mode flags and the errors. Pure and unrandomised: drawing for `--randomized` is the caller's job. |
| `problemText` | `(p: ArgProblem) => string` | The English sentence the CLI prints for a problem. |
| `splitCommand` | `(text: string) => { argv: string[]; problems: ArgProblem[] }` | One pasted line as the argv a shell would hand the CLI, with shell quoting and continuation lines; a leading `deno task carve` is dropped. |
| `startChoiceOf` | `(params: Params) => StartChoice` | Which start choice a stored `headBias` and `mix` stand for. |
| `storeRequest` | `(board: BoardFile, params: Params, view: View, source: string, metrics?: StoreRequest['metrics']) => StoreRequest` | The body of a board-store write, with the command built here so the two agree. |
| `svgOptions` | `(view: View) => SvgOptions` | The `SvgOptions` a view implies, with its theme resolved under the stated colours. |
| `viewNumberOf` | `(raw: string, field: ViewNumber) => number` | A view number as a person typed it: empty or unreadable is the default, out of range is clamped, whole fields round. |
| `wordFor` | `(key: ParamKey, value: number) => string \| null` | The word a knob's value is spelled with, or `null`: `wordFor('Lmax', 0)` is `'auto'`. |

| Constant | Value | Meaning |
|---|---|---|
| `CARVE_FLAGS` | 53 flags, as they are typed | Every flag the CLI takes; `-h` is the one with a single dash. |
| `COMMAND_PREFIX` | `'deno task carve'` | How the CLI is invoked from anywhere inside the repository. |
| `DEFAULT_VIEW` | a `View` | The view of a board nobody has styled: cell 12, line 0.5, automatic head width, rounded, no theme, margin 4. |
| `ENV_VARS` | 4 `{ name, usage }` rows | The environment variables `carve` and `report` read, each with the words `--help` prints for it. |
| `ENV_WORD_SOURCE` | `'[A-Z_][A-Z0-9_]*=\S*'` | The pattern of a `NAME=value` environment word, shared with the lab's command palette. |
| `KNOB_ROWS` | 27 `KnobRow`s | The knob table `--help=knobs` prints: one row per knob, with `headBias` and `mix` merged into `--start`. |
| `MIX_START` | `0.5` | The share mixing starts from when the stored value is not a share. |
| `RETIRED_FLAGS` | 17 retired flags, each with its replacement | The spellings the CLI refuses, each with the flag that replaced it. |
| `RULE_ROWS` | 5 rules, each `{ key, flags, reason }` | The cross-knob rules, with the flags each is about. |
| `START` | `{ words, mix }` | The `--start` surface: each word stores a pair of `headBias` and `mix`; a number stores the mixing share, within `mix`. |
| `START_CHOICES` | `['layers', 'random', 'tunnels', 'mixing']` | The start choices, in the order a surface offers them. |
| `VIEW_FLAG` | a flag per `ViewNumber` | The flag that writes each picture number: `stroke` is `--line`, the head sizes are `--arrow-width` and `--arrow-height`. |
| `VIEW_RANGE` | `{ cell, stroke, headWidth, headHeight, top }` | What each picture number may be, and whether it is whole. |

| Type | Shape | Meaning |
|---|---|---|
| `ArgProblem` | `{ kind: 'noValue'; arg: string } \| { kind: 'unexpectedArgument'; arg: string } \| { kind: 'retired'; arg: string; name: string; hint: string; use: string[]; why: RetiredWhy \| null } \| { kind: 'notStart'; arg: string; words: string[]; min: number; max: number } \| { kind: 'outside'; arg: string; min: number; max: number } \| { kind: 'notNumber'; arg: string; words: string[] } \| { kind: 'notWhole'; arg: string } \| { kind: 'notTheme'; arg: string; themes: string[] } \| { kind: 'notColour'; arg: string } \| { kind: 'notColourList'; arg: string } \| { kind: 'paletteTooLong'; arg: string; cap: number } \| { kind: 'unknownFlag'; arg: string; name: string } \| { kind: 'missing'; arg: string; name: string } \| { kind: 'unclosedQuote'; arg: string }` | A refusal the parser can report, typed so that each surface words it in its own language; `arg` is the token as written. |
| `EnvVar` | `(typeof ENV_VARS)[number]['name']` | The name of one of them. |
| `KnobRow` | `{ group: ParamGroup; flag: string; values: string; label: string; step: string; def: string; help: string }` | One row of the knob table, every cell spelled the way the flag spells it. |
| `ParsedArgs` | `{ params: Params; view: View; pins: ParamKey[]; choice: SimpleChoice & { random: boolean }; rest: string[]; errors: string[]; problems: ArgProblem[] }` | What one command line asked for: the knobs (the choice with the pins over it), the view, the mode flags in `rest`, and its errors, as text and typed. |
| `RetiredWhy` | `'oneMode' \| 'boardAlways' \| 'spacingFixed'` | Which explanation a retired flag's replacement carries, for a translation. |
| `StartChoice` | `keyof typeof START.words \| 'mixing'` | How a surface names the start: a word of `START`, or `mixing`. |

### `@arrowz/engine/simple`

| Function | Signature | Behaviour |
|---|---|---|
| `defaultChoice` | `() => SimpleChoice` | The choice that reproduces the engine defaults. |
| `drawParams` | `(choice: SimpleChoice, rng?: (() => number) \| null, pins?: Partial<Record<ParamKey, number>>) => { params: Params; moved: Move[] }` | `simpleParams`, plus the values the draw had to move to keep a rule. |
| `exportCell` | `(W: number, H: number) => number` | The cell size of an exported SVG: 1600 px on the longer side, between 1 and 18 px. |
| `normalizeChoice` | `(raw: unknown) => SimpleChoice` | A choice with every field valid: old names become slider positions, numbers are clamped, anything else is the default. |
| `presetParams` | `({ W, H, seed, length, winding, skeleton, rng }: { W: number; H: number; seed?: number; length?: number; winding?: number; skeleton?: boolean; rng?: () => number }) => Params` | The same function as in `@arrowz/engine`. |
| `recipeOf` | `(raw: unknown) => Recipe` | The stored recipe of a choice: normalised, without its seed, with `random` settled. |
| `simpleParams` | `(choice: SimpleChoice, rng?: (() => number) \| null, pins?: Partial<Record<ParamKey, number>>) => Params` | The parameter set a choice draws, with `pins` written over it; without `rng` each knob takes the middle of its range. |
| `simpleRanges` | `(choice: SimpleChoice) => Partial<Record<ParamKey, Range>>` | The ranges a choice's sliders give each knob they control. |

| Constant | Value | Meaning |
|---|---|---|
| `BUNDLES` | `length`, `winding`, `skeleton` and `difficulty`, each a list of knobs | The knobs each everyday flag sets; `difficulty` is the baseline every board gets. |
| `SIMPLE_CHOICES` | `{ skeleton: ['off', 'on'] }` | The values of the choice's buttons. |
| `SIMPLE_SIZES` | 12 `Size`s, from 25 × 25 up | Every preset size, smallest first. |
| `SIMPLE_SLIDERS` | `{ lengths, shape }` | The two sliders: anchors of knob ranges along `0..1`, interpolated between. |

| Type | Shape | Meaning |
|---|---|---|
| `Move` | `{ key: ParamKey; from: number; to: number; rule: RuleKey }` | A value the draw moved to keep a rule, and which rule. Not the game's `Move` of `@arrowz/engine`. |
| `Recipe` | `Omit<SimpleChoice, 'seed' \| 'random'> & { random: boolean }` | A stored choice: without its seed, which lives in the knobs, and with `random` settled. Not the store's `Recipe` of `@arrowz/engine`. |
| `Size` | `{ id: string; W: number; H: number }` | A preset size and the id the lab shows for it, such as `'25x25'`. |

### `@arrowz/engine/presets`

| Function | Signature | Behaviour |
|---|---|---|
| `findPreset` | `(params: Params) => Preset \| null` | The preset matching the parameters, or `null`; the most specific match wins, and knobs outside the preset are ignored. |

| Constant | Value | Meaning |
|---|---|---|
| `PRESETS` | 7 `PresetLevel`s, from easy to insane | The lab's preset boards by difficulty, three or four per level. |

### `@arrowz/engine/i18n`

| Function | Signature | Behaviour |
|---|---|---|
| `dictionary` | `(lang: Lang) => Dict` | The lab's text in one language, with its helpers bound to it. |
| `escapeHtml` | `(s: string \| number) => string` | Text made safe for `innerHTML`: a value from the store, a file or a server passes through here before it joins the dictionary's markup. |

| Constant | Value | Meaning |
|---|---|---|
| `EN` | `{ groups, groupHelp, presets, simple, start, short, units, ui }` | The English dictionary, the source language: every other language has its keys. |
| `EN_CHOICES` | `{ trapBias }` | English display words where the CLI's word is not the one a player should read. |
| `PL` | a `Translation` | The Polish dictionary, with the knob and reason texts the engine keeps in English. |

| Type | Shape | Meaning |
|---|---|---|
| `Dict` | `{ readonly lang: Lang; readonly locale: 'pl' \| 'en-GB'; readonly d: Dictionary; t<K extends UiKey>(key: K, ...args: UiArgs<K>): string; paramText(spec: ParamSpec): { label: string; help: string }; choiceText(key: ParamKey, word: string): string; reason(key: InactiveKey \| RuleKey): string; fmt(n: number): string; short(n: number): string; violation(v: Violation): string }` | One language's text and helpers: `t` a UI string, `paramText` a knob's label and help, `reason` a rule or inactive text, `fmt` and `short` numbers in the locale, `violation` a violation. |
| `Dictionary` | `Widen<typeof EN>` | The shape every language must have: `EN`'s keys, with its strings widened. |
| `Lang` | `'en' \| 'pl'` | The languages of the lab. |
| `Translation` | `Dictionary & { reasons: Record<InactiveKey \| RuleKey, string>; params: Record<ParamKey, { label: string; help: string }>; choices: Partial<Record<ParamKey, Record<string, string>>> }` | A translation: the dictionary plus the knob, choice and reason texts English keeps in the engine's tables. |
| `UiArgs` | `<K extends UiKey> Dictionary['ui'][K] extends (...args: infer A) => string ? A : []` | The arguments of a UI string: none for a plain string, the function's parameters otherwise. |
| `UiKey` | `keyof Dictionary['ui']` | The key of a UI string. |
| `Widen` | `<T> T extends string ? string : T extends (...args: infer A) => string ? (...args: A) => string : { [K in keyof T]: Widen<T[K]> }` | A string leaf stays a string; a function leaf keeps its exact parameters. |

### `@arrowz/engine/report`

| Function | Signature | Behaviour |
|---|---|---|
| `genSeconds` | `(meta: Pick<BoardMeta, 'genMs'>, dash: string) => string` | How long a stored board took to generate, in seconds, or `dash` when it was saved before timing existed. |
| `pct` | `(v: number) => string` | A fraction as a whole percent. |
| `reportDelta` | `(num: number \| undefined, prev: number \| undefined) => ReportDelta \| null` | A row's change against the previous run, or `null` when either is missing or they agree. |
| `reportRows` | `(run: ReportInput, params: Params, dict: Dict) => StatRow[]` | Every row of the statistics table for a finished run, in order, in the dictionary's language; a run without metrics reports nothing. |
| `seedRunOf` | `(seed: number, result: GenerateResult) => SeedRun` | One seed's result as a series reports it. |
| `summariseSeries` | `(runs: readonly SeedRun[]) => SeriesSummary` | The outcome counts of a series, and the means over its complete boards. |

| Constant | Value | Meaning |
|---|---|---|
| `STAT_KEYS` | 32 keys, as the table lists them | Every row of the statistics table, by key, in the table's order. |

| Type | Shape | Meaning |
|---|---|---|
| `ReportDelta` | `{ readonly text: string; readonly trend: 'up' \| 'down' }` | A delta cell: its text and which way the number moved. |
| `ReportInput` | `{ readonly ok: boolean; readonly metrics: Metrics \| null; readonly stats: CarverStats; readonly pieces: number; readonly backtracks: number; readonly restartsUsed: number; readonly genMs: number; readonly metricsMs: number; readonly totalMs: number; readonly stuck: Stuck \| null; readonly deadlock: boolean; readonly aborted: boolean }` | The run a report describes, as the worker hands it back. |
| `SeriesSummary` | `{ total: number; complete: number; incomplete: number; unsolvable: number; stopped: number; meanPieces: number \| null; meanMaxLen: number \| null; meanGenMs: number \| null }` | A series in numbers; the means are `null` when no board was complete. |
| `StatKey` | `(typeof STAT_KEYS)[number]` | What a row is, in any language: a surface picks rows by it rather than by position. |
| `StatRow` | `{ readonly kind: 'row' \| 'separator'; readonly key: StatKey \| null; readonly label: string; readonly value: string; readonly help: string; readonly num: number \| undefined }` | One row of the statistics table, or a separator between groups; `num` is the number compared with the previous run. |

### `@arrowz/engine/docs`

| Function | Signature | Behaviour |
|---|---|---|
| `docsFor` | `(lang: Lang) => Docs` | The Docs tab's descriptions and column names in one language: the board element's tables and the lab's. |
| `spellValue` | `(value: unknown) => string` | A constant's value as the Docs tab and the element's README write it: strings quoted, objects as `{ key: value }`, an object of objects as its keys. |

| Constant | Value | Meaning |
|---|---|---|
| `BOARD_FILE_FIELDS` | 9 `FieldRow`s | The fields of a board file in `BoardFile`'s order, with their types: the Element page's board-file table. |
| `ELEMENT_CLASSES` | 2 `ClassRow`s | The element package's exported classes: how each is constructed, and its members. |
| `ELEMENT_CONSTANTS` | 20 `ConstantRow`s | The element package's exported constants, by name. |
| `ELEMENT_EVENTS` | 7 `EventRow`s | The element's events and their detail types. |
| `ELEMENT_FUNCTIONS` | 8 `FunctionRow`s | The element package's exported functions, with their signatures. |
| `ELEMENT_MEMBERS` | 14 `MemberRow`s | The element's public methods and getters, with their signatures. |
| `ELEMENT_PROPS` | 11 `PropRow`s | The element's properties: type, attribute and default. |
| `ELEMENT_SLOTS` | 7 `SlotRow`s | The element's slots. |
| `ELEMENT_TYPES` | 21 `TypeRow`s | The element package's exported types: where each is declared, and its fields or members. |

| Type | Shape | Meaning |
|---|---|---|
| `BoardFileField` | `(typeof BOARD_FILE_FIELDS)[number]['key']` | The name of a board-file field row. |
| `ClassKey` | `(typeof ELEMENT_CLASSES)[number]['key']` | The name of a class row. |
| `ClassRow` | `{ readonly key: string; readonly create: string; readonly members: readonly string[] }` | One exported class: how to construct it, and its public members. |
| `ConstantKey` | `(typeof ELEMENT_CONSTANTS)[number]['key']` | The name of a constant row. |
| `ConstantRow` | `{ readonly key: string }` | One exported constant, by name; the lab reads its value from the package. |
| `Docs` | `{ readonly props: Record<PropKey, string>; readonly members: Record<MemberKey, string>; readonly events: Record<EventKey, string>; readonly slots: Record<SlotKey, string>; readonly keys: Record<LabKey, string>; readonly palette: Record<PaletteId, string>; readonly linkFields: Record<LinkField, string>; readonly env: Record<EnvVar, string>; readonly types: Record<TypeKey, string>; readonly functions: Record<FunctionKey, string>; readonly constants: Record<ConstantKey, string>; readonly classes: Record<ClassKey, string>; readonly boardFile: Record<BoardFileField, string>; readonly colProp: string; readonly colType: string; readonly colAttr: string; readonly colDefault: string; readonly colMember: string; readonly colSignature: string; readonly colEvent: string; readonly colSlot: string; readonly colKey: string; readonly colCommand: string; readonly colSection: string; readonly colField: string; readonly colGroup: string; readonly colFlag: string; readonly colRange: string; readonly colStep: string; readonly colFlags: string; readonly colVariable: string; readonly colDetail: string; readonly colFrom: string; readonly colShape: string; readonly colFunction: string; readonly colConstant: string; readonly colValue: string; readonly colClass: string; readonly colCreate: string; readonly colMembers: string; readonly colTheme: string; readonly colColours: string; readonly colSource: string; readonly colLicence: string; readonly colDescription: string; readonly infoLabel: string; readonly frameworkLabel: string }` | What the Docs tab's reference tables need in one language: a description per row, the column names, the name of a page's note and of its framework tabs. |
| `EventKey` | `(typeof ELEMENT_EVENTS)[number]['key']` | The name of an event row. |
| `EventRow` | `{ readonly key: string; readonly detail: string }` | One event and the type of its detail. |
| `ExportSource` | `'@arrowz/board-element' \| '@arrowz/engine'` | The package an exported type is declared in. |
| `FieldRow` | `{ readonly key: keyof BoardFile; readonly type: string }` | One field of the board file and its type. |
| `FunctionKey` | `(typeof ELEMENT_FUNCTIONS)[number]['key']` | The name of a function row. |
| `FunctionRow` | `{ readonly key: string; readonly signature: string }` | One exported function and its signature. |
| `LabKey` | `'G' \| '[' \| ']' \| 'R' \| 'S' \| 'F' \| 'Esc' \| '⌘G' \| '⌘S' \| '⌘K'` | A key of the lab's key table, as the lab shows it. |
| `LinkField` | `'cell' \| 'stroke' \| 'headWidth' \| 'headHeight' \| 'top' \| 'colored' \| 'rounded' \| 'highlightLongest' \| 'voids' \| 'showPoints' \| 'pointColor' \| 'pointRadius' \| 'theme' \| 'palette' \| 'paper' \| 'ink' \| 'highlightColor' \| 'pad' \| 'lang'` | A field of the lab's link. |
| `MemberKey` | `(typeof ELEMENT_MEMBERS)[number]['key']` | The name of a member row. |
| `MemberRow` | `{ readonly key: string; readonly kind: 'method' \| 'getter'; readonly signature: string }` | One method or getter and its signature. |
| `PaletteId` | `'run-generate' \| 'run-generate-save' \| 'run-save' \| 'run-reseed' \| 'run-defaults' \| 'run-abort' \| 'run-check-seeds' \| 'run-solo' \| 'go-lab' \| 'go-boards' \| 'go-open-file' \| 'go-docs-arrowz' \| 'go-docs-lab' \| 'go-docs-cli' \| 'go-docs-element' \| 'go-view' \| 'go-lang'` | A run or go-to row of the lab's command palette, by its id. |
| `PropKey` | `(typeof ELEMENT_PROPS)[number]['key']` | The name of a property row. |
| `PropRow` | `{ readonly key: string; readonly type: string; readonly attribute: string \| null; readonly def: string }` | One property: its type, its attribute (`null` when it has none) and its default. |
| `SlotKey` | `(typeof ELEMENT_SLOTS)[number]['key']` | The name of a slot row. |
| `SlotRow` | `{ readonly key: string }` | One slot, by name. |
| `TypeKey` | `(typeof ELEMENT_TYPES)[number]['key']` | The name of a type row. |
| `TypeRow` | `{ readonly key: string; readonly from: ExportSource; readonly shape: string }` | One exported type: its package, and its fields or members. |

### `@arrowz/engine/comment-lines`

| Function | Signature | Behaviour |
|---|---|---|
| `commentBlocks` | `(source: string, css?: boolean) => CommentBlock[]` | Comment-only lines grouped into blocks, in line order; a comment after code belongs to none. |
| `commentLines` | `(source: string, css?: boolean) => CommentLine[]` | A TypeScript source, or with `css` a CSS one, as the comment text of each line. |

| Constant | Value | Meaning |
|---|---|---|
| `MAX_BLOCK` | `6` | The most lines a comment block may have, unless it is a header. |
| `MAX_HEADER` | `24` | The most lines a module or API header may have. |

| Type | Shape | Meaning |
|---|---|---|
| `CommentBlock` | `{ start: number; end: number; text: string }` | A run of consecutive comment-only lines, 1-based and inclusive. |
| `CommentLine` | `{ line: number; text: string; alone: boolean }` | The comment on one line, and whether the line holds nothing else. |

## Development

The engine's checks run through Nx (`pnpm nx run engine:<target>`) or, for the
Deno ones, `deno task verify` at the repository root.

| Target | Runs |
|---|---|
| `check` | `deno check` over the sources. |
| `lint` | `deno lint`. |
| `fmt` | `deno fmt --check`; Markdown is not formatted. |
| `test` | The Deno tests, this README's guard among them; `fingerprints.json` freezes the reference boards and `svg-golden.json` their pictures. |
| `build` | `tsc` into `dist/`, the build Node consumers import. |
| `smoke` | `scripts/node-smoke.mjs`: the reference boards again, from `dist/` under Node. |
| `verify` | All of the above. |
