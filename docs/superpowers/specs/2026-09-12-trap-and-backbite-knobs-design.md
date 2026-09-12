# Two knobs from the prior-art work: traps (R1) and backbite (R2)

Design for turning the two measurement options of `measure/prior-art-r1-r2` into real
knobs. It supersedes sections 2.2 and 7 of
`docs/superpowers/specs/2026-09-12-prior-art-adoption-design.md` wherever the
measurements contradict them; the evidence is
`docs/superpowers/measurements/2026-09-12-r1-r2-measurements.md`.

Two PRs, one design, because both knobs land on the same surface (`PARAM_TABLE`, the
README tables, the PL/EN dictionaries, the presets, the fingerprints) and the second
PR would otherwise re-litigate every decision the first one makes.

## 1. What the measurements settled

- **R1 is not a free-arrow lever.** A piece is free at the start exactly when its head
  sits on the exit edge, so the count is bounded by how many heads reach the rim.
  Ranking heads spans 165–556 free arrows at 1000×1000; today's `--start` already
  spans 142–549 and the length knobs span 320–2417. Rejected.
- **R1 is a trap lever.** A piece has exactly one blocker precisely when its line
  prefix has a single owner. Ranking on that bit spans **178–912 traps** against 680 at
  the defaults, where every existing knob spans 1.3×.
- **The direction is the point, not the range.** Every existing knob moves free arrows
  and traps *together*: layers lifts both, tunnels drops both, short pieces triple
  both. `trapBias -1` drops traps to a quarter **while lifting free arrows** — the one
  separation no knob has, and the thing README calls the difficulty ("seeing which
  arrow is free", README:118).
- **R2 delivers length, not honoured orders.** Mean piece length +32–33%, longest
  piece roughly doubled, at the cost of tripling the cells the leftover test discards.
  The stall rate barely moves; that gap belongs to `targetLength`.
- **Both close everything measured.** 32/32 boards at 1000×1000 for R2 across four
  envelope points including the most winding legal corner, and 3/3 per setting for R1,
  all with zero backtracks and zero restarts.
- **The two knobs interact, and the interaction helps.** Trap counts at 1000×1000,
  seed 1, every board closed:

  | | `backbite 0` | `backbite 8` |
  |---|---|---|
  | `trapBias −1` | 215 | **98** |
  | `trapBias 0` | 628 | 606 |
  | `trapBias +1` | 948 | 741 |

  On its own `backbite` barely moves the trap count (−3.5%), so R2 does not undo R1.
  But at `trapBias −1` it more than halves it again (215 → 98), and at `+1` it costs
  22% of the top. Together the span is **98–948, nearly 10×**, against 5.1× for R1
  alone. The knobs are not independent, they are complementary at the low end: longer
  pieces mean fewer heads, and the heads that remain are the ones the trap ranking
  already filtered.

## 2. The knobs

### 2.1 `trapBias` (R1)

| field | value |
|---|---|
| key | `trapBias` |
| group | `difficulty` |
| min / max / step | −1 / 1 / 0.05 |
| default | 0 |
| label (EN) | `traps (arrows that look ready to go)` |

**Semantics.** The sign is the direction, the magnitude is the share of cuts that use
the trap ranking: at `−0.4`, four cuts in ten rank heads so that a head whose corridor
holds a single piece comes last; the rest rank as today. `0` is today's engine, and no
draw is made, so every recorded board is unchanged.

This mirrors `mix`, which turns `headBias`'s three-way choice into a share, except
that here one knob carries both the direction and the share, because unlike
`headBias`/`mix` there is no third mode to name.

**Why a share rather than the measured three-state.** The measurements used ±1 and 0.
A share is the same mechanism sampled per cut, so the endpoints are the measured ones
and the interior interpolates. Step 3 of the plan measures that the interior is
monotone; if it is not, the knob degrades to `min/max/step = −1/1/1` with a
`control: choice` of `avoid / off / seek`, which is exactly `headBias`'s shape.

**Mechanism.** `lineHomo[d][line]`, one integer per line: `−1` empty prefix, `−2`
several owners, `≥ 0` the id of the sole owner. Folded forward only over the cells the
frontier advances over, rebuilt for a line whose frontier receded (undo). A head whose
line reads `≥ 0` becomes a piece with exactly one blocker — exactly, not
approximately, because "no owner change along the prefix" and "one distinct owner" are
the same statement.

Cost: four passes over the grid per board (4.0e6 cells at 1000×1000), paid only when
the knob is non-zero. The O(ray) alternative of the adoption spec costs 3.3–7.5e9
steps per board and is rejected on those grounds.

### 2.2 `backbite` (R2)

| field | value |
|---|---|
| key | `backbite` |
| group | `lengths` |
| min / max / step | 0 / 8 / 1 |
| default | 0 |
| label (EN) | `tail rework when a line gets stuck` |

**Semantics.** How many consecutive tail backbites a stalled path may use before it
gives up. Each cell the path manages to add refills the allowance, so the cap bounds a
run of escapes rather than a whole piece.

**Mechanism.** Mansfield's backbite restricted to the tail and to positions ≥ 1: pick
an own cell adjacent to the tail that is neither the predecessor nor the neck, drop
the edge that would close the loop, reverse the suffix behind it. The cell set, the
head and the neck are unchanged, so the ray, the blockers and the piece's place in the
blocking graph are unchanged.

Position 0 is excluded because reversing from `cells[1]` moves the neck, and
`pieceShape` starts the line at the head's base — the neck's cell. This is the bug the
playground caught; `engine.test.ts` guards it.

### 2.3 What neither knob gets

No `inactive` reason: both work in every mode. No entry in the `--start` surface:
`trapBias` is its own flag, because it is orthogonal to where pieces start.

## 3. Envelope and rules

No new `RULES` entry is proposed. The evidence: both knobs at their extremes close
every measured board, including `warns 6 + anticoil 4 + pStraight 0.65`, which is the
straightness floor at 1000×1000. The plan measures the two extremes against that
corner once more per PR, and adds a rule only if a jam appears — a rule invented
without a jam behind it is the thing the parameter audit spent seven PRs removing.

## 4. Presets

Difficulty levels are sizes today (`easy` 25 … `insane` 1000), which is why
`--start=tunnels` is the only thing that makes a small board hard. `trapBias` gives the
levels a second axis, and the plan measures the trap count per level before choosing:

| level | intent | first proposal |
|---|---|---|
| easy, medium | few traps: a board a beginner can read | `trapBias −0.6` |
| hard, nightmare | as today | `0` |
| extreme, huge, insane | traps sought | `trapBias +0.6` |

`backbite` stays 0 in every preset: it changes the look of the boards the README
documents, and that is a separate decision from shipping the knob.

## 5. Blast radius, per PR

Both PRs touch the same list; the entries are what the repo's own guards require:

1. `packages/engine/engine.ts` — `PARAM_TABLE` row; the carver state and the ranking
   branch (R1) or the growth-loop branch (R2).
2. `packages/engine/types.ts` — `ParamKey`, and the `CarverStats` counters for R2.
3. `packages/engine/command.ts` — nothing: the flag, the help text and the validation
   are all generated from `PARAM_SPEC`, and `KNOB_FLAGS` counts the rows rather than
   naming a number.
4. `README.md` and `README.pl.md` — the knob tables, guarded by `readme.test.ts` in
   both languages.
5. `packages/engine/lab-i18n.ts` — label and help in PL and EN, guarded by
   `lab-i18n.test.ts`.
6. `packages/engine/fingerprints.json` — a recorded pair per knob: off (must equal
   today's hash) and on (new).
7. `packages/engine/envelope.test.ts` — the new range in the envelope sweep, and the
   knob count: `envelope.test.ts:201` asserts `PARAM_SPEC.length === 26`, so each PR
   bumps it by one (27, then 28). That assertion is the repo's guard against a knob
   appearing without anyone noticing, so it is updated deliberately, not silenced.

## 6. Order

R1 first, then R2. The sequencing note argued from stalls; the measurements say the
coupling that exists runs the other way and is benign (§1), so the order is now a
matter of review load and of what the second PR has to prove. R1 carries the new carver
state and the new difficulty story; R2 is a branch in a loop that already exists. With
R1 in first, R2's PR can measure the pair — its own effect AND the `trapBias −1`
corner, which is where the two multiply — against a settled surface.

## 7. Open measurements, per PR

**R1:** monotonicity of the share (0, ±0.2, ±0.4, ±0.6, ±0.8, ±1 at 1000×1000, one
seed per point, trap count); the envelope corner at ±1; the per-level trap counts that
decide §4; the fingerprint pair.

**R2:** the envelope corner at cap 8 with the fixed move (the 32-board re-run covers
`square`, `tunnels`, `skeleton` and `edge` at caps 0 and 8 — only the intermediate caps
were measured with the buggy move); the `trapBias −1 × backbite 8` corner over several
seeds, since one seed is what the 98 above rests on; the fingerprint pair.

Neither PR is staked before its measurements run: the repo treats measurement as a
gate, and both knobs now exist precisely because measurement overturned the design
they came from.
