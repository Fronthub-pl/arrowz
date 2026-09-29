# Jev guards: measured thresholds and how to set them up

The Jev guards ask Jev, TypeSafe's System One model, whether a comment, a
commit message, a pull request description, or a Polish dictionary entry
breaks a written rule in `CLAUDE.md`. They only advise: a hook's
`additionalContext` is the only thing they produce, and nothing they say ever
blocks a commit, a PR, an edit, or `deno task verify`.

## Setup

In the 1Password app: Environments → "TypeSafe AI" → Local .env file, at
`~/.config/arrowz/typesafe.env`. The file is a FIFO fed by 1Password;
`ARROWZ_TYPESAFE_ENV` overrides the path. Without that file the hooks read
nothing and print nothing — silent, not broken.

## The hooks and the manual commands

`.claude/settings.json` runs `jev-guard.ts hook`:

- `PreToolUse` on `Bash`, matching `git commit *` or `gh pr *`: checks the
  commit message or PR body for `not_english` and for an attribution
  trailer.
- `PostToolUse` on `Edit`/`Write`: checks new or rewritten comments in
  `apps/**` and `packages/**` (`.ts`, `.tsx`, `.css`) against the `Comments`
  rule, and, inside `lab-i18n.ts`, any touched Polish/English pair against
  the dictionary rule.

The same checks run by hand:

```bash
deno task jev comments <file…>
deno task jev message [--pr] <file>
deno task jev i18n
```

## Measured on jev-1.13.0, 2026-09-29

### Comments (shipped)

Source: `/tmp/jev-eval-comments.txt`.

| Metric | Value |
|---|---|
| blocks / answered / changed | 2232 / 2232 / 865 |
| AUC `violates` | 0.867 |
| AUC `max(history, spec_ref)` | 0.905 |
| shipped rule (`violates > 0.85` or `max(history, spec_ref) > 0.9`) | precision 0.985, recall 0.525, false alarms 0.5 %, flagged 461 |
| bar | precision ≥ 0.95 → **PASS** |

### Commit and PR messages (not shipped)

Source: `/tmp/jev-eval-message.txt`.

| Metric | Value |
|---|---|
| held-out set | 795 commits, 54 merged PRs, 15 hand-made violations |
| AUC `not_english` | 0.960 |
| at `MESSAGE_AT.not_english = 0.8` | false alarms 4.6 %, detection 100.0 % |
| bar | false alarms ≤ 3 % and detection ≥ 80 % → **FAIL** |

Detection on hand-made violations is optimistic: they are easier than real
ones.

The held-out set is fixed at the point `MESSAGE_AT` was picked in the dry
run, so a later measurement never quietly re-includes data the threshold has
already seen: `git log --no-merges --skip=292 08f1b8e` (795 commits today)
plus merged PRs numbered at most 127 minus their 60 newest (54 today). The
anchors are the constants `PICKED_AT`, `PICK_SAW_COMMITS`, and
`PICK_LAST_PR` in `jev-eval.ts`. Re-picking `MESSAGE_AT` means moving those
three constants forward first — otherwise the "held-out" set includes
commits and PRs the new threshold was tuned on.

`SHIPPED.message` is `false`: the false-alarm bar was missed on held-out
data, so the hook stays off rather than being tuned on the same run that
failed it.

### Polish dictionary (built, hook off by owner decision)

Source: `/tmp/jev-eval-i18n.txt`.

| Metric | Value |
|---|---|
| pairs / mutations | 442 / 90 |
| AUC | 0.977 |
| at `DIFFERS_AT = 0.54` | precision 0.847, recall 0.800, false alarms 2.9 %, flagged 85 |
| mutations detected | swapped 30 of 30, truncated 27 of 30, number 15 of 30 |
| bar | false alarms ≤ 3 % and detection ≥ 80 % → **PASS** |

Detection on hand-made violations is optimistic: they are easier than real
ones.

`SHIPPED.i18n` stays `false` even though this run passed its bar: after the
dry run measured 78.9 % detection against an 80 % bar, the owner decided the
dictionary guard runs by hand only (`deno task jev i18n`), not through the
hook.

## Limits

- An edit inside a nested worktree under the project
  (`.claude/worktrees/…`) is judged by the main checkout's
  `jev-guard.ts` and `CLAUDE.md`, not by copies inside that worktree.
- `git commit -F <file>` where `<file>` sits outside the project and outside
  `/tmp` (for example macOS's `$TMPDIR`, under `/var/folders`) is not
  readable by the hook's sandboxed `--allow-read`, so the message goes
  unchecked, silently.
- A manual `deno task jev comments|message|i18n` that prints
  `jev: nothing flagged` also prints that line when Jev did not answer at
  all (no key, network failure, timeout); the two cases look the same.

## Re-measuring

Run `deno task jev:eval comments|message|i18n` after changing any question,
any threshold, or `MODEL` in `jev-client.ts`. The figures above stop being
true the moment one of those changes.
