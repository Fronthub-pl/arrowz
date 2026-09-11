# The parameter surface of the CLI and the engine — design

Date: 2026-09-12. Branch: `refactor/param-surface`, stacked on `fix/security-hardening` (PR #42).
Source: the 2026-09-11 audit of the parameter surface, which found flags that mean two
different things, flags that are silently ignored, knobs that do nothing at their
defaults, and an engine API that demands more than it needs.

## Goal

One way to say each thing. A user reading `--help` should be able to predict what a
flag does, and the engine's own options type should be usable without ceremony — all
without changing a single generated board.

## Non-goals

- No board changes. Every fingerprint in `fingerprints.json` and `svg-golden.json` stays
  byte-identical, with the knobs that disappear pinned at today's defaults.
- No change to the board file format (`board-file.ts`) or to the server-side validation
  added in PR #42: stored params stay a map of finite numbers.
- The view bounds deferred in PR #42 (no upper bound on `cell`, `stroke`) stay deferred.

## 1. Words are spelling, numbers are storage

`ParamSpec` is numeric (`min`, `max`, `step`, `def` are numbers), and the numbers travel:
into the lab's panel and URL hash, into `boardId`, into the board file's `params`, and
into the server's validation. Making `auto` a real value would touch all of them.

So the sentinels become **spelling**, not representation:

| Flag | Word | Stored value |
|---|---|---|
| `--lmax` | `auto` | `0` (the engine reads it as 2.5 × the longer side) |
| `--maxback` | `auto` | `0` (the engine reads it as 200) |
| `--giantstep` | `random` | `0` (growth is not serpentine) |
| `--arrow-width` | `auto` | `0` (the width rule picks it) |

Both directions: the parser accepts the word (and the bare number), and everything that
**prints** a command — `--help`, the `--dry-run` JSON's `command` field, the command
stored beside a board, the lab's command box — prints the word, never the bare sentinel.
A number outside the knob's range is refused as it is today (exit 2).

`mix` needs no word: after the merge in §3 its "off" state is spelled `--start=random`.

## 2. One mode

`--advanced` disappears. Everyday flags and engine knobs stand side by side:

```
deno task carve --width=N --height=N [--seed=N]
  Everyday   --length=0..1 --winding=0..1 --skeleton --randomized
  Output     --svg[=path] | --dry-run | --count=N [--max-seeds=M]
  Picture    --cell=N --line=R --arrow-width=R|auto --arrow-height=R --colored --sharp --top=N
  Knobs      --lmax=auto|6..5000, --start=..., --restarts=0..5, ... (--help=knobs)
```

- **One spelling per option.** `--stroke`/`--lineweight` → `--line`; `--headwidth`/`--arrowwidth`
  → `--arrow-width`; `--headheight`/`--arrowheight` → `--arrow-height`; `--colorized` → `--colored`;
  `--w`/`--h` → `--width`/`--height`. The old spellings are **refused with a message naming the
  new one**, not accepted silently: the board store is empty, so nothing on disk depends on them.
- **`--straight` is retired entirely**, because it is the flag that means two things today
  (a 0..1 winding slider in simple mode, an alias of `pStraight` in advanced mode). The
  everyday slider becomes `--winding=0..1` (0 = straightest lines), and the knob keeps its
  own name, `--pstraight=0.6..1`.
- **`--randomized` keeps its spelling** (US English, as in the repo today).
- **An unknown flag is refused** with exit 2 and `see --help`. Today advanced mode pushes
  unrecognised flags into a leftover list and runs with the defaults instead.
- **Knob flags stay the knob's key, lowercased** (`--pstraight`, `--giantspan`), so the
  `--help=knobs` table and the flags cannot drift apart.
- **`--help`** prints the short form above. **`--help=knobs`** prints the full table: flag,
  range (with words where they exist), default, and one line of English help.
- **The report and bench modes move out** of `carve` into `deno task report`
  (`--runs`, `--bench`, `--only`, `--mid`, `--square`, `--portrait`, `--show`). They are
  engine research, not board making, and they are seven of the flags in today's help.

## 3. 31 knobs become 25

| Today | After | Why |
|---|---|---|
| `hug` (1..20, def 1), `edgeHug` (0..4, def 0) | gone; constants at 1 and 0 | dead at the defaults: the rule is gated on `hug > 1`, and `edgeHug` only feeds that gate. Its own help says "kept for experiments" |
| `strandLimit` (10..30, def 30) | gone; constant 30 | the default is the maximum; only lowering it is possible, and lowering it weakens the leftover test |
| `giantWarns` (0..16, def 0) | gone; constant 0 | its help says "keep at 0" |
| `headBias` (-1..1, def 0) + `mix` (-1..1, def -1) | `--start=layers\|random\|tunnels\|0.3..0.7`, default `random` | `headBias` is a no-op whenever `mix >= 0`, and `mix` has a hole in its range (only -1 or 0.3..0.7 are legal) |
| `giantSpacing` (1..3, def 2) + `giantSpacePenalty` (1..40, def 8) | `--giantspacing=off\|2\|3`, default `2`; penalty constant 8 | one rule with two off switches: it is off unless BOTH are above 1 |
| `giantSpan` (0..200, def 30) | minimum 1 | `0` silently disables the whole skeleton, including `giants`, with no "inactive" marker in the lab |

`--start` maps to the stored numbers exactly:

| `--start` | `headBias` | `mix` |
|---|---|---|
| `layers` | -1 | -1 |
| `random` (default) | 0 | -1 |
| `tunnels` | 1 | -1 |
| `0.3`…`0.7` | 0 | the number |

`--giantspacing=off` stores `giantSpacing: 1`; `2` and `3` store themselves, with
`giantSpacePenalty` fixed at 8.

Removing a knob means: gone from `PARAM_SPEC`, gone from the lab panel, gone from the
dictionaries, and its value written as a named constant in `engine.ts` at today's default.

## 4. The overlap rule

An everyday flag is not a shortcut for one knob. It sets a bundle:

| Everyday flag | Knobs it sets |
|---|---|
| `--length` | `wShort`, `wMid` |
| `--winding` | `pStraight`, `wLateral`, `warns`, `anticoil` |
| `--skeleton` | `giants`, `giantSpan`, `giantStep`, `giantJitter`, `wGiant`, `headBias`, `probe`, `probeLen` |
| (always, the difficulty baseline) | `headBias`, `probe`, `probeLen` |

Nine knobs — `Lmax`, `mix`, `giantStraight`, `giantAnticoil`, `giantSpacing`, `headTries`,
`absorbLimit`, `maxBack`, `restarts` — are set by no everyday flag at all, so mixing them
in has never been ambiguous.

**The rule: a knob written on the command line wins, and pins only itself.**

- Without `--randomized`, the everyday flag picks one value per knob in its bundle; an
  explicit knob replaces that one value and leaves the rest of the bundle alone.
- With `--randomized`, the everyday flags draw their bundles from the measured safe
  ranges; an explicit knob is **pinned** — it is not drawn — while every other knob of the
  bundle keeps being drawn. With `--count=N`, the pin holds for every seed in the run.
- Every override prints one line to **stderr** (so the `--dry-run` JSON on stdout stays
  machine-readable):

  ```
  note: --pstraight=0.9 is pinned; --winding still sets wLateral, warns, anticoil
  ```

- The envelope still has the last word: a pinned value outside its range, or a combination
  that breaks a rule, is refused with exit 2 exactly as today.

What the user gives up by pinning is stated once in the docs and once in `--help=knobs`:
the safe ranges are measured as whole bundles, so a half-overridden bundle is still inside
the envelope but is no longer covered by the "every everyday combination closes" promise.

## 5. The engine's API

- **`generate(params: Partial<Params>, opts?: GenerateOptions)`.** The function already
  merges defaults; only the type demanded the full set, which is why every consumer writes
  `{ ...defaultParams(), W, H }`.
- **`GenerateOptions`** gathers what is not a knob: `unchecked?`, `trace?`, `debug?`, and
  the test-only `voidFrac?` and `ruleB?`. `Params` becomes what its name says: the knobs.
- **`mod.ts` stops being `export *`.** The public list is `generate`, `defaultParams`,
  `presetParams`, `validateParams`, `formatViolation`, `InvalidParamsError`, `GenerateAbort`,
  `fingerprint`, `analyse`, `toSvg`, `PARAM_SPEC`, `RULES`, `RULE_REASONS`, `INACTIVE_REASONS`,
  the board file functions, the game functions, and the types. `Carver`, `mulberry32`,
  `render` and `DIRS` become internal; the report task imports them from `engine.ts` directly
  inside the workspace.
- **`presetParams({ W, H, seed?, length?, winding?, skeleton?, random? })`** is the
  recommended entry point for an application, exported from `mod.ts`. It is today's
  `simpleParams` with the lab's vocabulary translated to the CLI's (`lengths` → `length`,
  `shape` → `winding`, where `winding = 1 - shape`), and it produces identical boards.
  `@arrowz/engine/simple` keeps exporting `simpleParams` for the lab.

## 6. The lab

The simple and advanced views stay: in a page of sliders there is no second dialect to
confuse. What changes is their content.

- The four removed knobs disappear from the panel and the dictionaries.
- `headBias` and `mix` become one `<select>` with four choices (`layers`, `random`,
  `tunnels`, and a numeric mixing row enabled by the fourth choice), and the `mixHole`
  rule disappears with them — the hole in the range stops being reachable.
- `giantSpacing` becomes a three-value control (`off`, `2`, `3`).
- Where a knob's `0` means something else, the row shows the word (`auto`, `random`) in
  place of the bare zero, from the dictionaries, in both languages.
- **The command box prints exactly what the CLI accepts**, words included, so a command
  copied out of the lab runs unchanged.

## 7. Migration

- `fingerprints.json`: the `argv` of four cases is rewritten (`tunnels`: `--headbias=1` →
  `--start=tunnels`; `layers`: `--mix=0.5` → `--start=0.5`; `corner`: `--straight=0` →
  `--winding=1`; `longstraight`: `--straight=1` → `--winding=0`), the `--advanced` flag
  drops out of all of them, and **every fingerprint stays the same**.

  The inversion is the point to get right: today's simple mode computes `shape = 1 - straight`,
  so `--straight=1` means the straightest lines. `--winding` is the slider itself — `--winding=0`
  is the straightest lines, `--winding=1` the most bent — which is why the two values swap.
  `node-smoke.mjs` builds its params through the same parser, so it follows automatically.
- `boardId` hashes the `PARAM_SPEC` keys, so removing knobs changes the hash and therefore
  stored file names. The store is empty (0 metas on this machine) and gitignored, so no
  migration code is written: boards made before this change are simply regenerated.
- The lab's URL hash carries `PARAM_SPEC` keys; an old link with `headBias`/`mix` is read
  once through a translation into `--start`, then forgotten. Unknown keys are ignored as
  they are today.

## 8. Tests

- Parsing: each word (`auto`, `random`) round-trips flag → params → printed command; a bare
  sentinel number is still accepted on input and never printed on output.
- Refusal: an unknown flag, an old spelling (with the new name in the message), and a
  knob outside its range each exit 2 with a message naming the flag.
- The overlap rule: with `--randomized` and a fixed seed, a pinned knob holds its value
  across runs while the rest of its bundle varies; the note goes to stderr and the
  `--dry-run` JSON on stdout parses.
- `--start` and `--giantspacing`: each spelling maps to the stored numbers of §3.
- Completeness: every `PARAM_SPEC` key has a flag, a label and help in both languages, and
  every flag in `--help=knobs` parses.
- Unchanged boards: `fingerprints.test.ts`, `svg-golden.test.ts` and `node-smoke.mjs` pass
  with the same fingerprints as on `main`.

## 9. Documentation

`README.md` and `README.pl.md`: the settings chapters are rewritten around one mode — the
everyday flags, then the knob table with words in the ranges, then a short, plain section
on the overlap rule (what a bundle is, what pinning does, what it costs). The refused-
combinations table loses `mixHole` and keeps the rest.
