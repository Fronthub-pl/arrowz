# Prior art for the board generator — what to adopt, adapt or reject

Date: 2026-09-12. Branch: none yet (analysis only; no code changed).
Source: a literature search over comparable "arrow puzzle" generators (snek, arrout,
arrows_game, arrow-flow, goarrows), Hamiltonian-path Monte Carlo (Mansfield's backbite),
Numberlink generation, exact oracles, Umans–Lenhart, assembly planning, and defnull's
candidate scoring. Each technique is graded against the engine as it is in
`packages/engine/engine.ts` today, with rework on the table. Every claim about the engine
below was checked against the code; line numbers are from the working tree of this date
and will drift, the symbol names will not.

## Goal

Decide, technique by technique, whether the prior art buys us something we lack: a
guarantee, fewer restarts, faster closure, difficulty control, or simpler code — and where
it would, say what has to change, in which files, and what it would break.

## Non-goals

- No decision here changes a board. Any adopted technique arrives behind a knob whose
  default reproduces today's boards (`fingerprints.test.ts`, `svg-golden.json`,
  `LAYERS_GOLDEN` in `engine.test.ts` stay byte-identical).
- No change to the game rule ("rule B", the head slides along its own body, §2 of
  `2026-09-07-arrowz-design.md`).
- No new runtime dependency: the engine stays Deno/DOM-free TypeScript with no `any`
  and no non-null assertions, and nothing in it may spread an array proportional to
  the number of cells or pieces.

## 0. The facts every verdict rests on

### 0.1 Solvability is a theorem, not a measurement

The premise "generation is forward + measured; `solvable` is computed afterwards and no
code path rejects a cyclic board" is true as a description of control flow and false as
a description of risk: **the carver cannot produce a cyclic board**. The invariant is
stated in the original spec (`2026-09-07-arrowz-design.md`, "Correctness theorem", the
carving order `q_1 … q_N` is a valid solution order) and every code path preserves it:

- A head is *the first unassigned cell on its line counting from the exit edge*
  (`headCandidate`, `engine.ts:256-263`, read off `depth[d][line]`). By definition every
  cell between the head and the edge is already assigned, so every blocker of piece `i`
  has an id `< i`.
- The body may go anywhere free (`engine.ts:1040-1130`); under rule B the ray is cast
  from the head only (`analyse`, `engine.ts:1770-1790`), so the body's shape never adds a
  blocker. The comment at `engine.ts:1007` says it in one line: "the carving order is
  the solution order".
- Backtracking is strictly chronological (`undoLast` pops the newest pieces,
  `engine.ts:1649-1657`; `undoToFrontier` only chooses *how many*, `engine.ts:1631-1647`),
  so a surviving piece never loses a cell of its ray.
- `absorbLeftover` rewrites only the *tail end* of a piece and only adds cells that were
  free; heads, rays and ids are untouched. Its contract (`engine.ts:1198-1222`) spells
  out the same invariant: "no ray passes through a free cell … so assigning the fragment
  blocks nobody new". `absorbPath` keeps `cells[0..k]` and re-paths the rest
  (`engine.ts:1509-1590`).

Hence the blocking digraph built by `analyse()` has every edge pointing from a newer to
an older piece, i.e. it is a DAG, and Kahn (`engine.ts:1840-1860`, `solvable: done === N`
at `:1977`) is a **self-check**. The tests treat it as one (`engine.test.ts:156, 202, 227,
251` assert `solvable === true` for every closed board) and so does the lab
(`lab-i18n.ts:122`: "UNSOLVABLE — a generator bug"). README already documents it under
"It knows at least one solution: the order in which the generator built the arrows is
itself a winning order" (`README.md:129-140`).

So the "guarantee we lack" that most of the prior art sells — solvability by construction
— **we already have**, at coverage 1.0, in the forward orientation. What we do not have is
an explicit test of the *mechanism* (every blocker is older) rather than its consequence
(acyclic); see recommendation R3.

### 0.2 What actually fails: closure, not solvability

Every hard problem the generator has is about **finishing the fill**, and the shape of the
failures is measured (memory notes of 2026-09-08, the 1000×1000 sweeps):

- `wouldStrand` (`engine.ts:493-560`) rejects a path that leaves a fragment that cannot
  be covered by paths of ≥ 2 cells. It is exact for fragments ≤ 30 cells (`decomposable`,
  a bitmask DP, `engine.ts:321-378`) and only checks Tutte's |S| ≤ 2 condition beyond
  that (`hasLocalDefect`, `:380-404`; the `n > 30 → assume yes` at `:325`).
- It tests **coverability, not carvability**: whether the fragment *can be cut in
  carve order from a legal head*. The recorded jams (seeds 19, 27, 30, 44, 62, 79, 92, 94
  at 1000×1000, `pStraight` < 0.6) are shredded boards: thousands of free islands, each
  either with no legal head at all (every ray from it crosses *another free island*) or
  with heads from which nothing can be cut (an L with the head in its corner), waiting
  on each other in a cycle. Assigning cells never *creates* a legal head for a
  shadowed island, so this cannot be repaired late; the knob envelope
  (`straightFloor`, `RULES`) keeps generation away from it.
- Inside the envelope closure is not the problem either: every one of the 69 closed
  random 1000×1000 boards of the sweep used **zero backtracks and zero restarts**, the
  400×400 and 200×200 regression tests assert `backtracks === 0`.

So the bar for a technique is not "does it make boards solvable" but "does it close
faster, close what the envelope forbids, give longer/wound pieces, or steer difficulty".

### 0.3 The constraints each technique is graded against

Coverage exactly 1.0; every piece a simple path of ≥ 2 cells; the same seed gives the
same board in Node and in a Chrome worker (mulberry32 with a fixed draw order,
`engine.ts:936-944`); boards up to 1000×1000 (≈ 86 000–150 000 pieces, ~10 s, ≤ 0.5 GB);
no cell- or piece-proportional spreads (worker stack); no `any`; the knob envelope of
`PARAM_TABLE`/`RULES` (`engine.ts:2143-2555`) and the README tables generated from it.

## 1. Build in solve order / reverse construction

**Verdict: already adopted, in the forward orientation. Reverse construction: reject.
The "carve first, choose heads later" hybrid: reject for solvability, see §7 for
difficulty.**

### 1.1 What the comparable games do, translated to coverage 1.0

snek places arrows in the order the player removes them and discards a candidate whose
escape ray hits an empty cell that has an empty neighbour (a later arrow could land there).
At coverage 1.0 "no empty cell on the ray with an empty neighbour" collapses to "no empty
cell on the ray at all" — which is exactly `headCandidate`. arrout builds in *reverse*
removal order and simulates the snake's entry trajectory; its facing-heads rule and DFS
cycle check exist because its placement is not frontier-based. Both allow empty cells;
that is what lets them place a piece anywhere.

### 1.2 Reverse construction at coverage 1.0 is not fatal, it is mirror-image worse

Let the removal order be `p_1 … p_n`. The one and only constraint is
`ray(p_k) ⊆ cells(p_1 … p_{k-1}) ∪ cells(p_k)` for every `k`. Forward carving commits
`p_1` first and checks the constraint against *cells already assigned*. Reverse
construction commits `p_n` first and checks the same constraint against *cells not yet
placed*: when placing `p_k`, `ray(p_k)` must avoid `p_{k+1} … p_n`, which are the pieces
already on the board. The spec already notes the two are "mathematically identical"
(`2026-09-07-arrowz-design.md`, "Equivalence with backward generation"). The reachable
set of boards is therefore the same. What differs is the geometry of dead states:

- **Forward.** A free region is dead when *in all four directions* the first free cell on
  its lines belongs to *another free region* (it is shadowed by free cells). Assigned cells
  between a region and the edge are what makes it carvable. Interior pockets are alive by
  default; death needs a shredded board.
- **Reverse.** An empty region is dead when in all four directions a *placed piece* lies
  between it and the edge. Placed cells between a region and the edge are what kills it.
  Interior pockets are dead by default; the empty set must stay "visible from the edge"
  through empty cells at every step, so the generator has to fill from the inside out
  while keeping edge-visible channels open until the very end.

The question of the last-placed piece follows: at coverage 1.0 it must enter through a
corridor made only of the remaining empty cells, so its ray consists of its own cells —
i.e. its head is on the edge, or its body lies straight along the ray. That is the mirror
of the first carved piece in forward mode (head at depth 0) and is fine in itself. The
obstruction is not the last piece but every piece before it: keeping all future corridors
empty is a global constraint the forward frontier gets for free (`depth[d][line]` is O(1)
per line, `recomputeLines` is O(touched lines), `engine.ts:265-290`).

### 1.3 What the rework would be, and why it is not worth it

Reverse construction would replace `headCandidate`/`depth`/`recomputeLines`, the growth
loop's frontier logic, `wouldStrand` (coverability would have to become "the empty set
stays edge-visible and coverable"), `undoToFrontier` (the newest neighbour of the leftover
is the wrong thing to undo when the leftover is dead by enclosure), and `absorbLeftover`
(gluing a pocket to a tail is only legal if the pocket is not on anyone's future ray — it
always is). That is most of `Carver` (~1 500 lines), every golden board, and the README
sentence "the order in which the generator built the arrows is itself a winning order"
(it would become the reverse order — a documentation change, not a broken promise). In
exchange we get: nothing we lack. **Reject.**

### 1.4 The hybrid: carve geometry first, choose heads and order afterwards

Head placement, not body shape, determines blocking (rule B) — correct. But a path cover
comes with a *free* certificate if heads are chosen at the frontier while carving; choosing
them afterwards means picking one of 8 (end × direction) options per piece such that the
union of the induced arc sets is acyclic. With ~10⁵ pieces that is a large constraint
problem (choosing one arc set per vertex so the union is acyclic is not known to be
tractable; we did not find a polynomial algorithm and expect it to be NP-hard in general),
and most alternative heads have rays through *newer* pieces, i.e. exactly the back edges
the frontier avoids. **Reject** as a solvability mechanism. As a *difficulty* mechanism a
limited post-carve re-heading is possible (flip a piece's head to its tail or its
direction, accept only if incremental cycle detection passes), but §7 gives a cheaper way
to the same effect at carve time, so it is not recommended.

## 2. Backbite (Mansfield)

**Verdict: adapt, as a tail-only move. Two uses, one recommended.**

The move: extend one end of a Hamiltonian path onto an adjacent cell that is already on
the path; a loop closes; delete the edge that closed it; reverse the enclosed portion. The
cell set is unchanged, the path stays simple, the *other* end is unchanged, and the work
is O(reversed segment) — constant on average, never a failed move (we verified the
ndmansfield README describes the Mansfield 2006 move set and default acceptance of every
move; the paper's detailed-balance argument is not needed for what follows).

### 2.1 Why it fits the invariant

Applied at the **tail** only, the move never touches `cells[0]` (the head), never changes
the cell set, and therefore never changes the ray, the blockers, or the id. This is the
same argument `absorbLeftover` already relies on (`engine.ts:1205-1216`). A tail backbite
is legal at any time: during growth, during absorption, or after closure.

### 2.2 Use A (recommended): the stall escape in `carveOne`

The growth loop stops when the tail has no free neighbour (`if (!cand.length)`,
`engine.ts:1107-1121`; counted as `stats.stall` at `:1148`). The spec measured 28–47% of
paths stalling before their ordered length, and 77% of stalls are nooks of the frontier
that Warnsdorff steered the tail into (`arrowz-generator-stan.md`, "Open"). The serpentine
skeleton (`growSerpentine`, `engine.ts:879-926`) exists because random growth "traps
itself after a hundred cells".

With backbite: when `cand` is empty and `path.length < want`, pick an own cell adjacent to
the tail that is not its predecessor (`pathPos` already maps cell → position,
`engine.ts:999`), reverse the suffix after it, and continue growing from the new tail. Cap
the number of consecutive backbites (a knob, say `backbite = 0..8`, default 0 = today's
boards). The path stays a prefix-shortenable simple path, so `wouldStrand` +
`shortenPath` (`engine.ts:567-580`) apply unchanged; the `failed` set logic is unaffected
because the cell set the leftover test sees is the same.

Gain: ordered lengths honoured more often, long wound pieces without the skeleton hack,
fewer very short pieces (the "lines still short" open item). Cost: a suffix reversal per
escape (bounded by piece length), and the rng draws change only when the knob is on.
Risk: a backbiting tail fills its region densely and strands more fragments — measured by
`stats.strandTrunc`/`strandLoss`, and the envelope test (`straightFloor`) may need a
coupling rule (`backbite > 0 ⇒ pStraight ≥ …`) if the sweep shows it; run the 500×500
harness before choosing defaults.

Blast radius: `carveOne` growth loop; one knob in `PARAM_TABLE` (and so `--help=knobs`,
the README tables `readme.test.ts` guards, `lab-i18n.ts` PL/EN strings, `lab-presets.ts`
if a preset uses it); `engine.test.ts` gets a fingerprint pair (knob off = old board,
knob on = recorded) and a unit test of the move (head fixed, cell set fixed, path simple).
No promise in README changes.

### 2.3 Use B (not recommended now): `absorbPath`

`absorbPath` finds a Hamiltonian path of "fragment + old tail" from the anchor by DFS with
Warnsdorff ordering and a 20 000-node budget (`engine.ts:1538`). A backbite random walk
(grow when possible, backbite when stuck) finds Hamiltonian paths of grid regions quickly
in practice, but it is Las-Vegas (no bound), and the DFS is not where the time goes since
the incremental scan and memo of PR #17 (the corner case's cost is the tests, not the
search). Keep the DFS; revisit only if a profile says otherwise.

### 2.4 Use C (reject): backbite as the growth *primitive*

Replacing greedy growth by sampling from the Hamiltonian paths of the free region would
throw away the knobs (`pStraight`, `warns`, `anticoil`, the probe/skeleton machinery) and
the envelope built on them. Nothing in the measurements asks for that.

## 3. Numberlink / Flow Free generation

**Verdict: reject the technique, adopt the argument.**

thomasahle's generator fills the paper along SW diagonals and "always connects a square
as we go over it", so unconnected cells never appear; the corner-dual pruning is about
paths between *fixed endpoints* (every corner must live in a spike rooted at a source).
Neither transfers: our sweep order is not a free choice — a piece's head must be at the
frontier of *its* line, in *its* direction — and our endpoints are not fixed. The
"connect as you go" idea is what `wouldStrand` + `hasLocalDefect` already do locally,
with an exact DP below 30 cells.

What we do take: the complexity results. Zig-Zag Numberlink is NP-complete (Adcock,
Demaine et al.) and cardinality-constrained path covering of grid graphs is NP-complete
(Apollonio, Caccetta, Simeone 2004), so "fill every cell with paths of prescribed lengths"
has no exact fast algorithm to be found. That is the justification for the engine's
shape — greedy with a local exact test, jumps in shortening, restarts — and for keeping a
knob *envelope* instead of promising closure on the whole range. Worth one sentence in
the spec's risk table, nothing in code.

## 4. Exact oracles (CP-SAT `AddCircuit`, dancing links / exact cover)

**Verdict: reject for the engine; optional as a dev-only cross-check, not now.**

The engine cannot take OR-Tools (native, non-deterministic across versions, not
DOM/Deno-free) and DLX on a 10⁶-cell board is hopeless. The one thing an oracle could
test is the `n > 30 → assume decomposable` gap in `decomposable` (`engine.ts:325`) — but
`decomposable` *is* an exact cover solver for ≤ 30 cells already (bitmask DP with a
losing-mask memo), and the measured jams are shadowed islands, not non-decomposable
fragments. If a future sweep records a jam whose smallest leftover is a > 30-cell
fragment with no local defect, a script under `packages/engine/scripts/` can answer it
offline. No PR.

## 5. Umans–Lenhart (Hamiltonian cycles in solid grid graphs)

**Verdict: reject; the right pointer for the same gap is a different theorem.**

Umans–Lenhart is polynomial but heavy (O(n⁴)), needs a *solid* region (our leftovers are
riddled with holes: the pieces around them) and answers the wrong question — one
Hamiltonian cycle, where we need a cover by paths of ≥ 2 cells cut in head order. If the
> 30 gap of §4 ever matters, the tool is the Akiyama–Avis–Era criterion that
`hasLocalDefect` already applies for |S| ≤ 2 (a graph has a path factor with every path
≥ 2 vertices iff `i(G − S) ≤ 2|S|` for all `S`), which is decidable in polynomial time as
a `{K_{1,1}, K_{1,2}}`-factor problem (Hell–Kirkpatrick). That would replace "assume yes"
with an exact answer at O(fragment) per probe. Not recommended until a measurement shows
a > 30-cell fragment that the local test lets through and that later jams — none is on
record.

## 6. Assembly planning (NDBG, monotone disassembly)

**Verdict: reject as a source of mechanisms; the vocabulary is useful.**

Our blocking digraph is a directional blocking graph with one fixed direction per part,
built exactly and already (`analyse`). The literature's "cycle repair" presupposes cycles
can arise; ours cannot (§0.1). The one idea worth naming: the *jam* state of the carver
is itself a blocking graph over **free islands** in four directions ("island A's heads
are shadowed by island B's free cells"), and a jam is a strongly connected component of
that shadow relation. `undoToFrontier` already breaks it the cheapest way (undo the newest
neighbour of the leftover so islands merge). A diagnostic that reports the SCC sizes in
`stuck` would explain jams better than `sizes`/`heads` do, but it changes no board and
closes nothing. Not a PR on its own.

## 7. Difficulty steering by candidate scoring (defnull)

**Verdict: adapt — and the invariant makes it cheaper for us than for defnull.**

defnull generates several random valid arrows per step and keeps the one with the best
"fun score" from the dependency tree (size, depth, width). We already have a crude form:
`mix`/`headBias` rank heads by the depth of their line (`engine.ts:958-971`) as a proxy for
"tunnel = many blockers, low `f0`" vs "layer = free piece, high `f0`", and the quarters
fallback (`:983-990`) decides which heads are tried.

Because every blocker of a new piece is *older*, the piece's Kahn depth is known **at
carve time**: `depth(i) = 0` if the ray crosses no piece, else `1 + max depth(blockers)`,
and its blockers are the distinct owners along `depth[d][line]` assigned cells from the
edge to the head — O(ray length) to read, no graph to build. So we can score a *head*
(line, direction) before growing anything: blocker count, depth, and — for width — the
number of pieces the new piece would newly shadow is not needed (out-degree is only known
later), depth and blocker count are what `D` and `f0` measure. The carve then targets a
band: e.g. prefer heads whose depth lands the running `f0` and max depth where the
difficulty preset wants them (arrout's "freedom score" targets per tier are the same idea
with the count of currently free pieces).

Gain: difficulty by construction instead of the "generate–measure–reject" loop the
original spec planned (risk table, `2026-09-07-arrowz-design.md:1358`), and a principled
replacement for `mix`/`headBias` later. Cost: an `Int32Array` of piece depths kept in the
carver (updated on push and on `undoLast`), and O(ray) per ranked head — heads are
already enumerated per line, so this is within the existing loop. Determinism unchanged.
Boards change only when the new knob(s) are on.

Blast radius: `carveOne` head ranking; `Carver` gets `pieceDepth`; `analyse` untouched
(it remains the independent check); knobs in `PARAM_TABLE` (+ README tables, lab
strings, presets); `engine.test.ts` fingerprints for on/off. README: the difficulty
section could then state what the presets *aim at* rather than what they happened to
measure — a strengthening, not a break.

## 8. Recommendations, ranked

| # | PR | What we gain | Blast radius | Prerequisite |
|---|---|---|---|---|
| R1 | Head scoring from the incremental blocking DAG (§7), knob(s) default off | Difficulty (`f0`, `D`) steered during carving; path to retiring `mix`/`headBias` proxies | `carveOne` ranking, `Carver` state, `PARAM_TABLE`, README tables, lab i18n, fingerprints on/off | Agree the target bands per preset with a 100–400 sweep |
| R2 | Tail backbite as the stall escape (§2.2), knob `backbite` default 0 | Ordered lengths honoured, long wound pieces without the skeleton hack, fewer stubs | growth loop, one knob, README tables, lab i18n, unit + fingerprint tests | 500×500 harness for closure and strand loss before choosing a preset default |
| R3 | A test of the mechanism: for every closed board, every blocker id `<` piece id (and the same after `absorbLeftover` and after `undoLast`) | Pins the guarantee README sells at the level of the invariant, not of Kahn's verdict; catches a future head-selection change that breaks it | `engine.test.ts` only (wait for the concurrent edit to land) | none |

Everything else — reverse construction, the post-carve re-heading hybrid, Numberlink
fill order, CP-SAT/DLX in the engine, Umans–Lenhart, assembly-planning cycle repair,
backbite as the growth primitive — is a **reject**, for the reasons above. The engine's
orientation and its guards are the right ones for coverage 1.0; the prior art confirms
the design more than it improves it.

## 9. Promises in README touched by the above

None of R1–R3 breaks a promise in "What the generator promises" (`README.md:129-140`).
R1 may let the difficulty text become stronger ("aims at" instead of "measured"). The
rejected reverse construction would have changed the sentence about the build order
being a winning order (to the reverse order), which is the only place the orientation
is user-visible.

## 10. Measurements to run before staking a PR

1. R2: `stats.stall`, `strandTrunc`, `strandLoss` and closure on the 500×500 harness with
   `backbite` 0/2/4/8 across the envelope, to see whether a coupling rule with
   `pStraight` is needed.
2. R1: the distribution of carve-time depth vs. `analyse().D` on 100–400 boards, to
   confirm the incremental depth equals Kahn's (it must; a mismatch is a bug in one of
   them) and to pick the bands.
3. §4/§5: count, on the recorded jam seeds, how often `wouldStrand` returned "assume yes"
   for a fragment > 30 cells that later jammed — expected zero; if not zero, the AAE
   path-factor test becomes a candidate.
