# Memory guard: advisory checks of Claude Code's memory

Claude Code keeps two memories for this repository: its auto-memory
(`~/.claude/projects/<project>/memory/`, an index `MEMORY.md` loaded into every
session plus one file per memory) and the repository's basic-memory project
(`.basic-memory/`, served as `memory-arrowz`). Both drift in ways no test sees:
a note records a fact the code already says, the always-loaded index grows into
a store of status, and a line that was true when written ("PR #123 open") goes
stale once the pull request merges. This spec adds one advisory guard for the
three, measured before it is built. Checked against `main` at `4452896`.

One branch, `tools/memory-guard`, base `main`. Bead `arrowz-bcq`.

## Goal

When Claude Code writes a memory, it learns within a second which new items
merely restate the code or git history and which index lines carry content
instead of a pointer. When a session starts, it learns which present-tense
lines of its memory are no longer true. The write goes ahead unchanged;
nothing gates.

## Measured before this spec

A throwaway spike on 2026-09-30 (`jev-1.13.0`, scripts and data outside the
repository) measured four candidate guards for agent-process artefacts. The
threshold and question wording were picked on half of the artefacts and the
figures below come from the other half; the bar is the shipped guards' bar,
false alarms at most 3 % and detection of hand-made violations at least 80 %.

| Check | Method | Held-out result | Decision |
|---|---|---|---|
| A plan's claim about code, against the definition of its backticked symbol | Jev Choice: supports / contradicts / says_nothing / change | false alarms 5.1 %, hand-made detection 46 %, 3 of 30 real false claims | not built (bead `arrowz-c5o`) |
| A subagent report claims success without evidence | one Noul | false alarms 2.2 %, detection 89 %; real violations 3 in 1252 reports | not built (bead `arrowz-jw9`) |
| A behaviour-changing plan task has no failing-test run | regex plus a Jev `behaviour` Noul | false alarms 1.9 %, detection 94 %; real violations 7 in 469 tasks | not built (bead `arrowz-nbc`) |
| A memory item restates code or git history | Jev `violates` > 0.64 | false alarms 0.4 % (1/232), detection 97 % (30/31); on real items precision 0.91, recall about 1/3 (10 of 32); real violations 62 of 495 items (12.5 %) | **built: check M1** |
| A `MEMORY.md` line carries content | line longer than 130 characters | false alarms 0/36, detection 18/18; Jev at its best threshold: false alarms 5.6 % | **built without Jev: check M2** |

A regex for M1 reached AUC 0.77 and 12.9 % false alarms, so M1 needs Jev.
Jev misses most real M1 violations of one kind, status paragraphs ("stack
merged, merge `0b333b2`"): M1 is precise, not complete.

The third check, stale present-tense state (M3), needs no model. Before the
index was slimmed on 2026-09-30, 30 of its 66 lines held about 73 % of its
characters as status; the cleanup that day corrected about nine note
descriptions that still called a merged pull request open (reported by the
cleanup, not re-measured: the files were edited in place). After the cleanup
M3's pattern flags 0 of 136 present-tense segments (every index line and the
first clause of every description), while on whole descriptions it flagged 8,
all dated history or a negation ("zero open PRs"): hence the narrowing below.

## Decisions

- **Advisory only**, as the Jev guards: `hookSpecificOutput.additionalContext`,
  never a `permissionDecision`, exit 0 on every failure.
- **A separate script, `packages/cli/scripts/memory-guard.ts`**, because its
  hooks need other permissions than `jev-guard.ts`: read access to
  `~/.claude/projects` and `--allow-run=gh,git` at session start. It reuses
  `jev-client.ts` (key, endpoint, `MODEL`) and `pool` from `jev-guard.ts`.
- **Two moments.** M1 and M2 run when memory is written; M3 runs when a session
  starts, because state goes stale after it is written, not while.
- **Scope: the auto-memory and the repository's basic-memory.** The global
  basic-memory project `main` holds personal notes and is never sent to
  TypeSafe. Session logs (`sesje/`) are exempt from M1: they record what
  happened, which is their purpose.
- **Only present-tense text is checked by M3**: the index lines and the first
  clause of each description (up to the first `;`, `—` or sentence end), which
  by convention carries the newest state. Dated entries further on are history.
- **Private labels stay private.** The repository is public and the notes are
  not: the labelled set lives outside it (`~/.config/arrowz/memory-labels.json`,
  moved from the spike), and no document quotes a note.

## The checks

**M1, a memory item restates code or git history.** Items are the observation
lines `- [category] text` of a basic-memory note (a continuation line joins
its item; fenced code is skipped), and for an auto-memory file the paragraphs
of its body of at least 80 characters (frontmatter, headings and fenced code
skipped). One Noul per item, state `{ memory_item }`:

- instructions: A reviewer applying this rule would delete the
  `memory_item`: "A memory note records a decision with its reason, a lesson,
  a gotcha or a non-obvious constraint — not a fact that is plainly readable
  from the code or the git history."
- criteria true: The item is a plain fact about the code or git history and
  teaches nothing else.
- criteria false: The item records a reason, a lesson, a gotcha, a
  measurement, a user decision or a non-obvious constraint.

An item is flagged when `violates > 0.64` (`MEMORY_AT`). At most 40 items per
write (`MAX_MEMORY_REQUESTS`), 16 at a time, within the hook's 10 s.

**M2, a `MEMORY.md` line carries content.** A line `- [Title](file.md) — hook`
longer than 130 characters (`MAX_INDEX_LINE`, counted in characters, not
bytes) is flagged with its length. No model.

**M3, stale present-tense state.** Over the index lines and first description
clauses of the auto-memory:

- a claim that pull request N is open (`PR #N … open/otwarty` or
  `open/otwarty … PR #N`, not preceded by "zero" or "no") while N is not in
  `gh pr list --state open`;
- a link `(file.md)` in the index to a file that does not exist;
- a backticked repository path (`apps/…`, `packages/…`, `docs/…`) that
  `git ls-files` does not list.

One `gh` call per session start (0.5–0.8 s measured); if it fails, the pull
request part is skipped and the rest still runs.

## Hooks and commands

| Event and tool | Check |
|---|---|
| PostToolUse `Write`/`Edit` on `~/.claude/projects/*/memory/*.md` other than `MEMORY.md` | M1 on the written paragraphs (`content`, or `new_string` for an edit) |
| PostToolUse `Write`/`Edit` on `…/memory/MEMORY.md` | M2 on the written lines |
| PostToolUse `mcp__memory-arrowz__write_note` / `edit_note`, directory not `sesje/` | M1 on the observation lines of `content` |
| SessionStart | M3; the memory directory is the directory of the payload's `transcript_path` plus `memory/` |

By hand: `deno task memory audit` runs M1, M2 and M3 over the whole
auto-memory and the repository's basic-memory notes (not `sesje/`), and
`deno task memory eval` re-measures M1 and M2 against the private labels,
printing the table above. Without the key M1 is silent and M2 and M3 still
run. Without the labels file `eval` says so and exits 1.

## Testing

`memory-guard.test.ts`, under `deno task test`, with a fake judge, a fake
`gh` and in-memory files, in the style of `jev-guard.test.ts`: item
extraction (observations, continuation lines, fences, paragraphs, frontmatter),
the hook routing for each row of the table (including `sesje/`, the global
project and a non-memory file producing nothing), M2's character count on
Polish text, M3's pattern on the measured false match ("zero otwartych
PR-ów") and on a dated clause after the first `;`, the `gh` failure path, and
the request cap. `neutral.test.ts` and the comment guard cover the new file
like the rest of `packages/cli`.

## Documentation

A "Memory guard" section in `docs/jev-guards.md` with the measured table, the
setup (none beyond the Jev key) and the limits below; `CLAUDE.md` names the
guard next to the Jev guards.

## Limits

- M1 finds about a third of the real violations, and almost none of the status
  paragraphs; it is a precise hint, not a sweep.
- M3 sees only the index and the first description clause; a stale claim deeper
  in a note body is not checked.
- The hooks run only in sessions started in this repository; memory written
  from another project's session is unchecked.

## Out of scope

- Checks on plans and subagent reports: measured and not built (beads
  `arrowz-c5o`, `arrowz-jw9`, `arrowz-nbc`).
- The global basic-memory project `main`.
- Rewriting existing notes that M1 or M3 flags: `audit` reports, a person
  decides.
