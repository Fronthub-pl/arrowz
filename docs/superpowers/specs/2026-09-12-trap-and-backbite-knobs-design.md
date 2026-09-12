# Two knobs from the prior-art work: traps (R1) and backbite (R2)

Design for turning the two measurement options of `measure/prior-art-r1-r2` into real
knobs. It supersedes sections 2.2 and 7 of
`docs/superpowers/specs/2026-09-12-prior-art-adoption-design.md` wherever the
measurements contradict them; the evidence is
`docs/superpowers/measurements/2026-09-12-r1-r2-measurements.md`.

Two PRs, one design, because both knobs land on the same surface (`PARAM_TABLE`, the
README tables, the PL/EN dictionaries, the presets, the fingerprints) and the second
PR would otherwise re-litigate every decision the first one makes.

**Status.** R1 has landed: `trapBias` is a knob, `--trapbias=avoid|off|seek`, and every
gate §7 set for it is closed. R2 is still a design and its gates are still open.

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
| min / max / step | −1 / 1 / **1**, `control: choice` (`avoid` / `off` / `seek`) |
| default | 0 |
| label (EN) | `traps (arrows that look ready to go)` |

**Semantics.** Three states. `seek` ranks a head whose corridor holds a single piece
first, `avoid` ranks it last, `off` is today's engine — no draw is made at any of them,
so every recorded board is unchanged. This is `headBias`'s shape, and `headBias` is the
knob it sits next to in the ranking.

**Why not the share this section used to propose.** The first draft made the magnitude
a share of cuts, on the reasoning that the endpoints were the measured ones and the
interior would interpolate. It was staked on a measurement that had not run. It has
now, at eleven points and 3 seeds (the table is in the measurements document), and it
came back against the share on three counts:

- **Not monotone.** The trap count peaks at `+0.6` and falls through `+0.8` to `+1`;
  per seed the peak is never at the end of the dial. The last 40% of the seeking side
  buys nothing.
- **The step is below the noise.** Neighbouring points differ by a median of 66 traps
  while the seed spread within a point is 58. A 0.2 step is worth one seed of noise;
  the proposed 0.05 step is worth a quarter of one. Forty stops the generator cannot
  tell apart is the thing the parameter audit spent seven PRs removing.
- **Avoidance lives at its endpoint.** `0 → −0.8` covers 41% of the way to `−1`; the
  single last step covers the rest. One cut in five ranked the old way makes traps that
  nothing later removes, so avoidance only pays closed.

The share survives in `CarverOptions` as the measurement path that produced this
verdict and can re-check it; no continuous surface is exposed.

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

**Both terms were paid down before the knob was staked, and the boards did not move.**
The fold now happens in `recomputeLines` — the one place a frontier depth changes —
with `−2` treated as the absorbing value it is and `prefixCell` inlined, instead of a
per-cut scan of all 2W+2H line headers (about 86 000 calls at this size, so 3.4e8
header visits the "4.0e6 cells" figure omitted). The boolean trap bit is a stable
two-bucket partition, not a sort. All 39 measured rows and all 9 recorded fingerprints
came out identical afterwards, so this cost nothing in evidence.

What that bought, and what it did not:

| | before | after |
|---|---|---|
| the lever, against the default board | 2.1–2.6× | **2.0×**, both signs |
| the lever, against an equally ranked board | +21% / +45% | **+11%**, both signs |

The residual is **not** the line table. At `--start=random` with the lever on there is
now no sort anywhere and the table is amortised; the remaining 1.8× is the quarter
pools, which every biased ranking pays — `--start=tunnels` 1.80× and the `freeBias`
spike 1.71×, neither of which keeps a table. So the honest price of this knob is *the
price of a biased `--start`, plus about a tenth*, and going below it means changing the
quarter pools, which would move every recorded board and belongs to no knob.

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
run of escapes rather than a whole piece. Measured over the range at 1000x1000: mean
piece length rises +19-20% at cap 2 and +31-33% at cap 8, the share of stalls the bite
rescues grows from about a fifth to about a half, and generating time does not
measurably move.

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
the board. The audit's own rule applies: a knob with no effect must say so.

**Ruling: neither an `inactive` reason nor a secondary key — the trap bit becomes the
outer key and today's depth ranking moves inside it.** Partition the heads into two
buckets by the trap bit (the wanted bucket first), and order each bucket by depth
exactly as `bias` orders the whole list today. The knob keeps its full strength,
`--start` keeps a real job inside each bucket, and no knob has to be declared dead.

This is not the compromise it looks like, because of one fact about the default: at
`--start=random` the carver applies **no ranking at all** (`bias` is 0 and `ranked` is
the head list untouched). Every recorded `trapBias` row was taken there. So under the
new shape those rows keep the trap bit as their only key — and they keep it in the same
order, because today's comparator returns 0 within a bucket and `Array.prototype.sort`
has been stable since ES2019. **The boards must come out bit for bit identical, and the
PR proves it by fingerprint rather than by argument** (§7). The earlier claim in this
section, that a composing design would invalidate the R1 evidence base, was wrong: it
invalidates nothing that was measured, because nothing was measured with `--start` set.

The quarter pools are untouched either way: their condition already treats a non-zero
`trapBias` as "a ranking was applied".

What the change does add is behaviour nobody has measured — `--start=tunnels` or
`layers` *together with* the lever — and that is a small, named gate rather than a
re-run of everything.

It also costs less than what is there today. The outer key is a boolean, so the
partition is O(heads) with no allocation, and the inner sort runs only when `bias` is
non-zero — which at the default it is not. The current code sorts on every cut in every
mode.

`backbite` needs none of this: it works in every mode and touches no other knob.

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

**Neither knob takes a preset value.** `trapBias` stays `off` and `backbite` stays 0
everywhere, and for `trapBias` that reverses what this section proposed before it was
measured.

Difficulty levels are sizes today (`easy` 25 … `insane` 1000), and the proposal was to
give them a second axis: `avoid` for the small levels, `off` in the middle, `seek` at
the top. All 26 shipped preset options were then measured at the three states, 3 seeds
each — 234 boards, all closed, zero failures — and the idea does not survive its own
numbers.

**The ladder already exists and it runs backwards.** The share of pieces that look
ready to go falls monotonically with level, from 19.65% on `easy` to 0.81% on `insane`,
a 24× spread with no knob involved. On the axis README calls the difficulty, `easy` is
the hardest level the generator ships.

**The lever cannot reorder that.** It spans about 6× inside a level against 24× between
levels, and it is asymmetric in the wrong direction for the job: avoiding is strong
(0.13–0.31×), seeking is weak (1.24–1.61×), so the top of the ladder, where the
proposal needed lift, is where the knob has least to give. Applying the proposal turns a
strictly decreasing sequence into a jagged one:

| | easy | medium | hard | nightmare | extreme | huge | insane |
|---|---|---|---|---|---|---|---|
| today | 19.65% | 9.76% | 8.00% | 5.66% | 3.19% | 2.12% | 0.81% |
| proposed | 5.19% | 1.69% | 8.00% | 5.66% | 4.05% | 2.63% | 1.10% |

No assignment of three states repairs it; the arithmetic forbids it.

**Where the knob is worth having is inside a level.** Composed with `--start`, which
§2.3 kept alive, the pair spans 5.8× on `insane`, 16× on `easy` and `hard` and 48× on
`nightmare` — and on that axis the lever is the stronger of the two (12.8× against
`--start`'s 2.7× on `hard-square`). That makes it a choice a player or a designer makes
for a board, not a number a level carries. Which is exactly the surface a flag gives it.

Two things this leaves open, both of them product questions rather than measurements:

- `easy` being the most trap-dense level is backwards from its name. `avoid` would take
  it from 19.65% to 5.19% in one line. That is one level's decision, and it turns on
  what "easy" is meant to mean — the measurements cannot settle it.
- Cost. `avoid` or `seek` on Insane takes the lab worker from ~12 s of carving to ~25 s
  per board, the same order as `--start=tunnels`, which the presets already ship.
  Generation time tracks the share of ranked cuts, so the three-state pays the endpoint
  price by construction: there is no cheap middle setting to hide in.

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
   today's hash) and on (new). R1's is in: `trap-off`, `trap-seek` and `trap-avoid` at
   100×200, about 0.4 s added to every `deno task test`. Because the option has no flag
   yet, a case may carry it in an `opts` field; **when it becomes a knob the case moves
   to an argv and the recorded hash must not move with it**, which turns the promotion
   into a checkable step rather than a leap.
7. `packages/engine/envelope.test.ts` — the new range in the envelope sweep, and the
   knob count: `envelope.test.ts:201` asserts `PARAM_SPEC.length === 26`, so each PR
   bumps it by one (27, then 28). That assertion is the repo's guard against a knob
   appearing without anyone noticing, so it is updated deliberately, not silenced.
8. Deletions and hand-written counts the generated surfaces do not cover:
   - `freeBias` went out with R1, after the timing gate had used it: a rejected spike
     that ships is a knob nobody chose. `--start=tunnels` remains as the ranking-only
     control, and the two agreed to within a twentieth while both existed.
   - `Math.sign` on the option: a share needs the magnitude, so the constructor stops
     collapsing the value.
   - Both options move from `CarverOptions` into `Params`, which is what makes them
     knobs at all, and takes them out of the "MEASUREMENT ONLY" comments.
   - The sentence "All 25" in `README.md` and `README.pl.md` is written by hand;
     `readme.test.ts` counts table rows and would not catch it.
   - The three-state of §2.1 needs a `WORDS.trapBias` entry in `command.ts` for
     `rangeText`, the way `giantSpacing` has one. "command.ts — nothing" was true only
     for the share the measurements rejected.
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

- ~~*Monotonicity of the share*~~ Done, and the share lost: not monotone above `+0.6`,
  a usable step four times coarser than the one proposed, and an avoiding side whose
  value is all in its endpoint. §2.1 now specifies the three-state `choice`, and §5.8's
  `WORDS.trapBias` entry is no longer a fallback but the plan.
- ~~*The two consequences of the §2.3 ruling.*~~ Both done. The bucket-and-order shape
  reproduces every recorded `--start=random` board exactly — 9 of 9 fingerprints
  unchanged, checked again after the cost work and after the share landed, and now held
  by `trap-avoid` in the golden set rather than by a script. And the combination nobody
  had measured is recorded twice over: `tunnels` and `layers` at `±1` give three
  distinct boards where they used to give one, and the level sweep carries every
  `-tunnels` option at all three states.
- ~~*A timing gate.*~~ Done, and the target it named turned out to be the wrong one:
  the lever cannot go under `--start=tunnels`, because what it pays for is ranking
  itself. It now costs a biased `--start` plus a tenth, with the boards unchanged. What
  is left for §4 is a product question — whether Insane at roughly 25 s instead of 12 s
  is a default anyone wants — not an engineering one.
- ~~*The per-undo invariant*~~ Done: `engine.test.ts` now hangs the check on `undoLast`
  — the only place cells go back to unassigned — and compares the maintained table to a
  from-scratch fold after every undo, over 57 undos on three jam boards, both signs of
  the lever, with and without voids. It asserts that a frontier actually receded, so it
  cannot pass on a table that only ever grew, and disabling the rebuild branch makes it
  fail.
- ~~The per-level trap counts that decide §4~~ Done, and §4 reversed: the levels
  already order the trap share monotonically, backwards, and the lever is too narrow to
  reorder them. No preset takes it.
- ~~The fingerprint pair.~~ Done. Three cases, and the mutation checks say what each
  one is worth: making the share draw at 0 breaks twelve of the thirteen golden boards,
  so the existing set already guarded that; disabling the depth ordering inside the
  buckets breaks `trap-seek` **and nothing else**. The new cases earn their place by
  freezing the carved-with-the-lever boards and the composed `--start` path of §2.3,
  which nothing guarded before.

**R2:**

- ~~The intermediate caps 2 and 4 with the fixed move.~~ Done, 48 boards at 1000x1000,
  3 seeds, the same four sets (2026-09-13, in the measurements document). The interior
  behaves: mean length rises +19-20% at cap 2 and +31-33% at cap 8, with cap 2 carrying
  58-61% of the gain in every set, 48/48 closed, 0 backtracks, and no measurable time
  cost. The step 2 -> 4 is above the seed spread on the calm sets and inside it on
  `edge`, so the range is honest but its interior is coarser than 0..8 suggests.
- ~~A unit test of the move itself~~ Done, in `engine.test.ts`, in two parts: 200 bites
  on a boustrophedon path assert the head, the neck, the cell set, simplicity and
  `pathPos` after **every** bite, and a second test pins the two refusals — the bite
  that would move the neck, and a path too short to have a legal spot. Both fail when
  the position-0 guard is loosened, which the board-level neck test alone did not do
  cheaply.
- ~~The fingerprint pair; and a named size for it.~~ Done: `bite-off`, `bite-2` and
  `bite-8` at 100x200 on `--start=tunnels`, about 0.65 s added to `deno task test`.
  `bite-off` hashes exactly as `tunnels` (the cap-0 claim, recorded as its own case so
  a draw costed at 0 fails by name), and 2 is in the set beside 8 because the allowance
  is refilled by every cell the loop adds — an endpoint alone would not exercise the
  refill.

Neither PR is staked before its measurements run: the repo treats measurement as a
gate, and both knobs now exist precisely because measurement overturned the design
they came from — twice, now that the interaction run has overturned this document's own
cost claim and its reading of the low corner.
