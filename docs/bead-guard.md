# The bead guard

Every pull request is tracked by a beads task. `packages/cli/scripts/bead-guard.ts` runs as a Claude Code hook on
every `Bash` call and acts only on `gh pr create`, found anywhere in the command outside quotes and heredocs.

## Before the PR: `PreToolUse`, which denies

The PR body (`--body`, `--body-file`, a heredoc on stdin) must carry a line `Bead: <id>`.

- **The cited bead exists and is not closed:** the PR goes through.
- **The cited bead is unknown or closed:** denied.
- **No `Bead:` line, and a bead in progress has `metadata.branch` equal to the PR's branch** (`--head`, else the
  checkout): denied with that bead's id. The work already has a task, so no new one is created.
- **No `Bead:` line and no bead for the branch:** denied. The reason lists the beads in progress on other branches, then
  prints the `bd create` command, typed from the branch prefix (`fix` → bug, `feat` → feature, `docs`/`chore` → chore,
  otherwise task; an area prefix such as `lab` or `engine` becomes the label), and the `bd update --claim` that ties it
  to the branch.
- **`bd` cannot run:** denied. The guard gates, so it fails closed.

Claiming a bead with its branch when the work starts keeps the guard silent:

```sh
bd update <id> --claim --set-metadata branch=$(git branch --show-current)
```

## After the PR: `PostToolUse`, which links

When `gh pr create` printed a PR URL, the cited bead gets `external_ref` `gh-<N>`, the label `pr` and metadata `pr`,
`url` and `branch`. Closing the bead after the merge stays manual:
`bd close <id> --reason "Merged in PR #<N> (<sha7>)"`.

## Cost

A `Bash` call that is not `gh pr create` costs the hook about 75 ms (Deno start-up). A gated `gh pr create` costs
about 0.9 s: one or two `bd` calls against the embedded Dolt database. The hook's timeout is 15 s.
