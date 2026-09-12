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
  both. `trapBias -1` cuts traps fourfold **while leaving free arrows within 8% of
  today's board** (436 → 403 on the medians) — the one separation no knob has, and the
  thing README calls the difficulty ("seeing which arrow is free", README:118). At the
  envelope corner the free arrows rise as well (277 → 348, +26%), but the claim the
  knob is sold on is the one that holds everywhere: traps move on their own.
- **R2 delivers length, not honoured orders.** Mean piece length +32–33%, longest
  piece roughly doubled, at the cost of tripling the cells the leftover test discards.
  The stall rate barely moves; that gap belongs to `targetLength`.
- **Both close everything measured.** 32/32 boards at 1000×1000 for R2 across four
  envelope points including the most winding legal corner, and 39/39 for the pair in
  the interaction run — which is also the first time R1 was measured at that corner
  rather than at the defaults. Zero backtracks and zero restarts throughout.
- **The two knobs interact at the top, and not reliably at the bottom.** Trap counts at
  1000×1000, median of 3 seeds, per-seed values in brackets
  (`packages/engine/scripts/measure-r1-r2-interaction.ts`):

  | | `backbite 0` | `backbite 8` |
  |---|---|---|
  | `trapBias −1` | **167** [215, 167, 153] | **107** [98, 107, 195] |
  | `trapBias 0` | 695 [628, 695, 716] | 611 [606, 611, 663] |
  | `trapBias +1` | **948** [948, 955, 832] | 741 [741, 644, 762] |

  On its own `backbite` costs 12% of the traps on the medians, so R2 does not undo R1.
  At `+1` it costs 8–33% of the top on every seed. At `−1` it is **not reproducible**:
  two seeds more than halve (−54%, −36%) and the third moves the other way (+27%). The
  pair spans 8.9× on the medians against 5.7× for R1 alone, but per seed the total span
  is 9.7×, 8.9× and 4.3×, because the low corner is the one place where the seed
  decides (98, 107 and 195 traps, a 2× spread against 7% at the default). **The design
  is therefore staked on R1's 5.7×**; the pair is a bonus the low corner does not
  guarantee, and §4 does not spend it.

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

**Cost, measured rather than counted.** The knob costs **2.1–2.6× today's generation
time** at 1000×1000 (12.3 s → 26.2 s at `+1`, 31.4 s at `−1`, medians of 3 seeds), and
the earlier "four passes over the grid" figure accounted for the wrong half of it. Two
controls that take the same ranking branch and allocate no line table place the split:
`--start=tunnels` 21.6 s and the rejected `freeBias` spike 20.6 s. So roughly 8–9 s is
the map/sort/map ranking with its quarter pools — a price `--start` already pays today —
and a further 6–11 s is `lineHomo` upkeep.

Both terms are avoidable and the PR pays them down rather than shipping them:

- The trap bit is a single boolean, so the ranking needs a stable two-bucket partition
  (O(heads), no allocation), not `sort`.
- `refreshHomo` walks all 2W+2H line headers on every `carveOne` — about 86 000 calls
  at this size, so 3.4e8 header visits that the "4.0e6 cells" figure omits. The fold
  belongs in `recomputeLines`, the one place the frontier depth changes.

The O(ray) alternative of the adoption spec costs 3.3–7.5e9 steps per board and stays
rejected; the point of the table was never in doubt, only its price tag.

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

### 2.3 Where `trapBias` collides with `--start`

`trapBias` is **not** orthogonal to where pieces start, which is what the first draft
of this design assumed. The carver reads `headBias` in exactly one place and only while
`mix` is below 0 (the reason the `startPair` rule exists), and the trap ranking sits
ahead of it in the same `if` chain. Measured at 200×200 over 3 seeds: with the lever at
`±1`, `square`, `tunnels` and `layers` produce **one identical fingerprint**, while at
`trapBias 0` they produce three. `mix` still changes the board id, because its draw is
made and its result thrown away — the same shape `startPair` already documents.

So `--start=tunnels --trapbias=1` is a legal command in which `--start` cannot reach
the board. The audit's own rule applies: a knob with no effect must say so. The PR
takes one of two ways out, and the choice is a gate in §7:

1. **Secondary key.** Rank by depth as today, then partition by the trap bit inside
   that order. `--start` keeps working, the knob composes, and the measured endpoints
   change — the whole R1 evidence base would have to be re-measured.
2. **`inactive` reason.** Keep the replacement ranking and declare `headBias`/`mix`
   inactive while `|trapBias| = 1`, in both languages. Cheap, honest, and it keeps
   every measured row valid, at the cost of a knob that switches another knob off.

`backbite` gets neither: it works in every mode and touches no other knob.

## 3. Envelope and rules

No new `RULES` entry is proposed, and the corner is now measured for both knobs rather
than for R2 alone. `edge` (`warns 6 + anticoil 4 + pStraight 0.65`, the straightness
floor at 1000×1000) closes on all 3 seeds at `trapBias ±1`, at `backbite` 0 and 8, with
zero backtracks and zero restarts; traps there span 130 → 744 and the boards behave like
the square ones. A rule invented without a jam behind it is the thing the parameter
audit spent seven PRs removing, and no jam appeared.

The one rule-shaped decision that does remain is the `--start` collision of §2.3, which
is a question of honesty about an existing knob rather than a new refusal.

## 4. Presets

Difficulty levels are sizes today (`easy` 25 … `insane` 1000), which is why
`--start=tunnels` is the only thing that makes a small board hard. `trapBias` gives the
levels a second axis, and the plan measures the trap count per level before choosing:

| level | intent | first proposal |
|---|---|---|
| easy, medium | few traps: a board a beginner can read | `trapBias −0.6` |
| hard, nightmare | as today | `0` |
| extreme, huge, insane | traps sought | `trapBias +0.6` |

**"Easy" means traps, and only traps.** The measurements are explicit that the other
two metrics do not follow: at `−1` the free arrows sit 8% *below* today's board and `D`
rises 29%. So the claim a preset may make is "fewer arrows that look ready to go", not
"a simpler board" — and the README wording has to match that, or the preset promises
something the generator does not deliver.

**Two conditions before any preset takes a non-zero value**, both of them consequences
of measurements above rather than taste:

- *Cost.* `trapBias ±0.6` on Insane would take the lab worker from ~12 s of carving to
  ~26–31 s per board unless the two optimisations of §2.1 land first. A preset that
  doubles the wait is a product decision, not a default.
- *The `--start` collision.* `level()` gives every level a `-tunnels` variant, so a
  preset carrying `trapBias` would silently drop tunnels on the share of cuts the lever
  claims. Until §2.3 is resolved, the two cannot be bundled together.

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
8. Deletions and hand-written counts the generated surfaces do not cover:
   - `freeBias` goes out with R1. It is a rejected spike, and a rejected spike that
     ships is a knob nobody chose; it is also one of the two cost controls, so it is
     removed only after the timing gate of §7 has run.
   - `Math.sign` on the option: a share needs the magnitude, so the constructor stops
     collapsing the value.
   - Both options move from `CarverOptions` into `Params`, which is what makes them
     knobs at all, and takes them out of the "MEASUREMENT ONLY" comments.
   - The sentence "All 25" in `README.md` and `README.pl.md` is written by hand;
     `readme.test.ts` counts table rows and would not catch it.
   - The `choice` fallback of §2.1 needs a `WORDS.trapBias` entry in `command.ts` for
     `rangeText`, so "command.ts — nothing" holds for the share and not for the
     fallback.
   - `lab-simple.ts` decides whether `trapBias` joins the difficulty bundle that
     `--randomized` draws from, and the README row that documents it.

## 6. Order

R1 first, then R2. The sequencing note argued from stalls; the measurements say the
coupling that exists runs the other way and is benign (§1), so the order is now a
matter of review load and of what the second PR has to prove. R1 carries the new carver
state, the new difficulty story, the cost work of §2.1 and the `--start` decision of
§2.3; R2 is a branch in a loop that already exists. With R1 in first, R2's PR measures
the pair against a settled surface — and it measures it to **bound** the interaction
rather than to sell it, since the low corner turned out to depend on the seed.

## 7. Open measurements, per PR

Closed since the first draft, by `measure-r1-r2-interaction.ts` and
`measure-r1-start-shadow.ts`: the interaction table over 3 seeds, the envelope corner
for R1, the cost of the lever, the `--start` collision, and the first runs that exercise
the undo path. What is left:

**R1:**

- *Monotonicity of the share* — 0, ±0.2, ±0.4, ±0.6, ±0.8, ±1 at 1000×1000, **3 seeds
  per point**, not one: the low corner already showed a 2× seed spread, and a 0.05 step
  claims resolution the noise floor may not support. If the interior is not monotone the
  knob degrades to the three-state `choice` of §2.1 — and then `command.ts` is no longer
  untouched (§5.8).
- *The `--start` decision of §2.3*, which is a gate and not a measurement: secondary key
  (and re-measure everything) or `inactive` (and keep the evidence).
- *A timing gate.* The two optimisations of §2.1 must bring the lever back under
  today's `--start=tunnels`, or the presets of §4 stay at 0. Measured against the same
  two controls, so the two terms stay separable.
- *The per-undo invariant*, in `engine.test.ts` rather than in a script: the line table
  compared to a from-scratch fold **after each undo**, on the `starved heads` seed that
  now reaches 50 backtracks with the lever on.
- The per-level trap counts that decide §4, and the fingerprint pair.

**R2:**

- The intermediate caps 2 and 4 with the fixed move: the re-run covers caps 0 and 8
  across `square`, `tunnels`, `skeleton` and `edge`, so what ships between the endpoints
  was only ever measured with the buggy move.
- A unit test of the move itself — head fixed, cell set fixed, path simple — which the
  adoption spec asked for and which `engine.test.ts` currently covers only for the neck.
- The fingerprint pair; and a named size for it, because `fingerprints.test.ts` runs
  every recorded case on every `deno task test`.

Neither PR is staked before its measurements run: the repo treats measurement as a
gate, and both knobs now exist precisely because measurement overturned the design
they came from — twice, now that the interaction run has overturned this document's own
cost claim and its reading of the low corner.
