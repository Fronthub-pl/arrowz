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

The comment and dictionary figures are in-sample (their thresholds were chosen
on the same data shown here); only the message figures below are held out.

### Comments (shipped)

Regenerate with `deno task jev:eval comments`.

| Metric | Value |
|---|---|
| blocks / answered / changed | 2232 / 2232 / 865 |
| AUC `violates` | 0.867 |
| AUC `max(history, spec_ref)` | 0.905 |
| shipped rule (`violates > 0.85` or `max(history, spec_ref) > 0.9`) | precision 0.985, recall 0.525, false alarms 0.5 %, flagged 461 |
| bar | precision ≥ 0.95 → **PASS** |

### Commit and PR messages (shipped)

Regenerate with `deno task jev:eval message`.

| Metric | Value |
|---|---|
| held-out set | 756 commits, 54 merged PRs, 15 hand-made violations |
| AUC `not_english` | 1.000 |
| at `MESSAGE_AT.not_english = 0.8` | false alarms 0.0 %, detection 100.0 % |
| first run, before the hold-out excluded pre-rule history | 795 commits, 54 PRs, 15 hand-made; AUC 0.960; false alarms 4.6 %, detection 100 % → FAIL |
| bar | false alarms ≤ 3 % and detection ≥ 80 % → **PASS** |

Detection on hand-made violations is optimistic: they are easier than real
ones.

The held-out set is fixed at the point `MESSAGE_AT` was picked in the dry
run, so a later measurement never quietly re-includes data the threshold has
already seen: `git log --no-merges --skip=292 5e17f97^..08f1b8e` (756
commits today) plus merged PRs numbered at most 127 minus their 60 newest
(54 today). The anchors are the constants `PICKED_AT`, `PICK_SAW_COMMITS`,
and `PICK_LAST_PR` in `jev-eval.ts`. Re-picking `MESSAGE_AT` means moving
those three constants forward first — otherwise the "held-out" set includes
commits and PRs the new threshold was tuned on.

A first run of this held-out set counted 39 commits predating the
English-only rule (before `5e17f97`, written in Polish) as false alarms;
the guard correctly flagged all 39 of them as `not_english`. The hold-out
now starts at `5e17f97` (`RULE_SINCE` in `jev-eval.ts`) so messages that
could never have followed a rule that did not yet exist are excluded, not
mislabelled.

`SHIPPED.message` is `true`: the held-out run above passes its bar.

### Polish dictionary (built, hook off by owner decision)

Regenerate with `deno task jev:eval i18n`.

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
- A worktree outside the project root (for example `/tmp/arrowz-*`) is not
  checked at all: it is outside both the hook's scope and its
  `--allow-read`.
- While 1Password is locked, every edit that adds a comment and every checked
  commit waits about 2 s for the key read (`readKey`'s timeout) before
  staying silent.
- `badMessages` takes long `PL.ui` strings 15–30 of the current dictionary,
  so a dictionary edit before them shifts the hand-made violation set onto
  strings the threshold pick already saw; re-anchor those indices if
  `lab-i18n.ts` changes there.

## Re-measuring

Run `deno task jev:eval comments|message|i18n` after changing any question,
any threshold, or `MODEL` in `jev-client.ts`. The figures above stop being
true the moment one of those changes. Editing the `## Comments` section of
`CLAUDE.md` also changes the comment guard's input — it is sent as `rule` —
so it too needs `deno task jev:eval comments` re-run.
