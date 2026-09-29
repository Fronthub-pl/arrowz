# Jev guards: advisory checks of the repository's written rules

Three rules in `CLAUDE.md` cannot be checked by a regular expression alone:
comments say why and carry no history, commit messages and pull request
descriptions are English and say why, and the Polish dictionary says what the
English source says. This spec adds advisory guards that ask Jev, TypeSafe's
System One model, for typed yes/no judgments on exactly those rules, and hand
the flags to Claude Code through hooks. Checked against `main` at `1c5f809`.

One branch, `tools/jev-guards`, base `main`; the plan may split it into one
pull request per guard.

## Goal

When Claude Code writes a comment, a commit message or a pull request
description in this repository, or edits the Polish dictionary, it learns
within a second which of its words probably break a written rule, and why,
while the edit or the command goes ahead unchanged. Nothing gates on Jev: the
guards advise, the regex guards and `deno task verify` still decide.

## Measured before this spec

A throwaway spike on 2026-09-29 (`jev-1.13.0`, scripts outside the repository)
asked four Nouls about every comment block of six lines or fewer in the files
the comment sweep covered, at `446c853` (before the sweep) and labelled each
block by whether `e7b0d50` (after the sweep's correction) still holds it
verbatim. 2216 blocks, 857 of them changed by the sweep.

| Noul | AUC | At the chosen threshold |
|---|---|---|
| `violates` (the rule quoted as state) | 0.906 | > 0.85: precision 0.98, recall 0.57 |
| max(`history`, `spec_ref`) | 0.910 | > 0.9: precision 1.00, recall 0.35 |
| `what_not_why` | 0.268 | dropped: the rule allows short "what" API headers |
| history regex, for comparison | — | precision 0.98, recall 0.61 |

Cost $0.06 for the whole set (1.47 M input tokens), p50 256 ms, p95 353 ms per
request. What Jev adds over the regex: spec citations without a keyword ("§3.3",
"design doc §6"), history told without a marker word, and no false hits on
words like "round joins". Recall is capped well below 1 because the sweep also
rewrote comments for accuracy, which no rule check can see.

## Measured in the dry run

The plan was executed once in a throwaway worktree (2026-09-29, `jev-1.13.0`)
before the real run:

| Guard | Result | Figures |
|---|---|---|
| comments, rule quoted verbatim | pass | precision 0.980, recall 0.518, false alarms 0.7 % (violates alone: AUC 0.864) |
| message, as first specified | fail | false alarms 5.6 %, detection 53 %: the Polish-letter regex alone flagged 14 of 360 real messages that quote the dictionary; `no_why` reached AUC 0.683; `not_english` reached AUC 1.000 with 0.8 as the lowest threshold under 1.5 % false alarms |
| dictionary | fail | AUC 0.977, false alarms 2.9 %, detection 78.9 % against the 80 % bar; a dropped number was caught in 16 of 30 mutations |

Consequences: the message guard drops the Polish-letter regex and `no_why`,
keeps attribution and `not_english` at 0.8, and is re-measured on held-out
data before it may ship. The dictionary guard is built and runs by hand
(`deno task jev i18n`) but its hook stays off.

## Decisions

- **Advisory only.** Hooks return `hookSpecificOutput.additionalContext` and
  never a `permissionDecision` or exit code 2; every failure is exit 0 with
  no output.
- **Synchronous hooks.** An `async: true` hook's output is discarded, so the
  guards run in the foreground; a hook with nothing to check makes no request.
- **Code in the repository, hooks in the committed `.claude/settings.json`**,
  so worktrees and subagents get them. Without a key the hook is silent.
- **One script, questions as code** (`jev-guard.ts`), with the spike's
  measurement kept as `jev-eval.ts` so that any change to a question, a
  threshold or the model is re-measured before it ships.
- **The model is pinned to `jev-1.13.0`**, not `jev-latest`: the thresholds
  are calibrated on that version. Bumping it means re-running `jev-eval.ts`
  and updating the numbers in `docs/jev-guards.md`.
- **Deterministic checks stay in code** where the rule itself is
  deterministic: attribution lines are a regular expression. Polish letters
  are not: the repository allows quoting the Polish dictionary in a message,
  so "is this message English" is Jev's question, not a letter regex's.
- **Each guard ships only past its own measured bar** (below); a guard that
  misses it is left out, not tuned until it passes on the same data.

## Components

All new code lives in `packages/cli/scripts/`, which `deno task check` covers.
No new file is named `*.test.ts` except the offline unit tests, so no network
call ever runs inside `deno task test` or CI.

### `packages/engine/comment-lines.ts` (moved, not new)

`commentLines` and `CommentLine` move out of `comments.test.ts` into a plain
module, and `comments.test.ts` imports them from there. Importing a test file
would register its tests a second time under `deno test`. The block grouping
now inlined in `offences` (a run of consecutive comment-only lines) moves
beside them as `commentBlocks(source, css)`, and `offences` calls it, so both
guards agree on what a block is. The module is pure
string processing, so `neutral.test.ts` holds; the plan checks that it does
not change what `pnpm nx build engine` emits.

### `jev-client.ts`

`judge(state, questions): Promise<Answers | null>` — the only code that knows
HTTP. `POST https://api.typesafe.ai/v1/systemone` with `model: 'jev-1.13.0'`,
a 5 s timeout, up to three retries with backoff on 429 and 529, and `null` on
any other failure. The key is read from the file named by
`ARROWZ_TYPESAFE_ENV`, default `$HOME/.config/arrowz/typesafe.env` (a
1Password Environment mounted there; the value never enters the repository
or a transcript). A second project can import this module unchanged.

### `jev-guard.ts`

Three guards, each a function from its input to a list of flags
`{ where, question, p, excerpt }`, taking `judge` as a parameter so tests can
stub it:

- `comments(file, source)` — blocks from `commentBlocks` plus trailing
  comments (a comment after code on its line), six lines or fewer
  (longer blocks are the regex guard's), each asked `violates`, `history` and
  `spec_ref`. State: `rule` (the `## Comments` section of `CLAUDE.md`, read at
  run time so the text lives in one place), `file`, `comment`, and `code` (the
  next line). Flag when `violates > 0.85` or `max(history, spec_ref) > 0.9`.
- `message(kind, text)` — for a commit message or a pull request body. Code
  flags attribution lines (`Co-Authored-By`, "Generated with"). Jev is asked
  `not_english` (written, fully or partly, in a language other than English;
  quoted interface strings do not count). Flag when `not_english > 0.8`, the
  threshold measured in the dry run (below).
- `i18n(pairs)` — English and Polish strings paired by key path over `EN` and
  `PL` (string leaves only; function-valued entries are out of scope), plus
  `PARAM_SPEC` label and help against `PL.params` and `INACTIVE_REASONS` and
  `RULE_REASONS` against `PL.reasons`. Jev is asked `same_meaning`; a pair is
  flagged when `p < 0.3`, or at the threshold `jev-eval.ts` picks.

The `hook` mode reads the hook's JSON from stdin and picks the guard:

| Event and tool | Input checked |
|---|---|
| PostToolUse `Edit` on `.ts`, `.tsx`, `.css` under `apps/` or `packages/` | comment blocks in `new_string` only; no comment, no request |
| PostToolUse `Write` on the same files | every block of the file |
| PostToolUse `Edit`/`Write` on `packages/engine/lab-i18n.ts` | pairs whose English or Polish string occurs in the written text |
| PreToolUse `Bash(git commit *)` | the message from `-m`, a `$(cat <<'EOF' … EOF)` heredoc, or `-F` |
| PreToolUse `Bash(gh pr *)` | `--body` or `--body-file` of `create` and `edit` |

A message that cannot be extracted is skipped. Output is at most five flags,
highest `p` first, in English:

```
jev: 2 comments may break the comment rule (CLAUDE.md, Comments):
- apps/lab/src/Stage.tsx:42  history p=0.93  // The fifth exit (Ruling 14). Review round 2…
```

The same guards run by hand: `deno task jev comments <file…>`,
`deno task jev message <file>`, `deno task jev i18n`.

### `jev-eval.ts`

Re-measures one guard and prints AUC and precision and recall per threshold:

- `comments` — the spike's labels, rebuilt from git (`446c853` against
  `e7b0d50`, blocks of six lines or fewer, the sweep's roots). Bar: precision
  ≥ 0.95 at the shipped threshold with the rule quoted verbatim.
- `message` — held out from the data that chose its threshold: false alarms
  on every non-merge commit older than the 300 newest (787 on 2026-09-29) and
  on the merged pull requests older than the 60 newest (54), all expected to
  pass; detection on 15 messages built at run time from Polish dictionary
  strings with their diacritics stripped, alone or under an English title,
  taken from strings the threshold's measurement did not use. Bar: false
  alarms ≤ 3 %, detection ≥ 80 %.
- `i18n` — false alarms on the current dictionary's pairs, detection on
  mutations of them (Polish swapped between keys, a negation added, a number
  or a unit dropped). Bar as for `message`. Jev is weaker in Polish than in
  English; missing the bar drops this guard from the release.

Hand-made violations are easier than real ones; `docs/jev-guards.md` says so
next to every detection figure.

### Hooks

`.claude/settings.json` gains a `PreToolUse` entry (matcher `Bash`, handlers
with `if: "Bash(git commit *)"` and `if: "Bash(gh pr *)"`) and a `PostToolUse`
entry (matcher `Edit|Write`), each running
`deno run --allow-net=api.typesafe.ai --allow-read=.,"$HOME/.config/arrowz" --allow-env=HOME,ARROWZ_TYPESAFE_ENV packages/cli/scripts/jev-guard.ts hook`
with `timeout: 10` (the plan widens `--allow-read` only if a custom
`ARROWZ_TYPESAFE_ENV` path needs it). The existing `SessionStart` and `SessionEnd` hooks stay.

## Errors

Missing key file, network failure, 4xx, 5xx after retries, timeout, a
malformed hook payload, an unreadable file: the guard prints nothing and exits
0. The client holds one 8 s deadline across its attempts (each attempt gets
what is left, at most 5 s), below the hook's own 10 s timeout, so Claude Code
never cancels a hook mid-answer.

## Testing

`packages/cli/scripts/jev-guard.test.ts`, offline, with a stubbed `judge`:
hook payload parsing and guard selection; message extraction from `-m`, a
heredoc, `-F`, `--body` and `--body-file`; comment blocks taken from
`new_string` only; the deterministic message rules; i18n pairing, including a
key missing from `PL`; every client failure giving silence and exit 0; output
format and the five-flag cap. Every case names the assertion a mutation would
break and is run once with that mutation to see it fail.

`comments.test.ts` keeps passing unchanged after `commentLines` moves.

## Documentation

- `docs/jev-guards.md`: mounting the key from 1Password, the measured figures
  with date and model version, how to re-run `jev-eval.ts`.
- `CLAUDE.md`, under "Packages", one line: the Jev guards advise through
  hooks and never gate; see `docs/jev-guards.md`.
- `deno task jev` in the root `deno.json`.

## Order

The guards are independent. Comments first (measured), then messages, then
the dictionary, each behind its own `jev-eval.ts` bar.

## Out of scope

- Using the guards' flags to sweep the engine and CLI comments (51 flags on
  866 blocks in the spike): a separate change.
- Checks on plans, subagent reports and memory, and any AI feature in the lab:
  the other two sub-projects.
- A CI job: it would need the key as a GitHub secret.
