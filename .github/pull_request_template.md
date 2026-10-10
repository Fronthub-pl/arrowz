## What changes

<!-- What a user or a developer notices, before and after. Link the issue it
closes ("Closes #123"), if there is one. -->

## How it was checked

<!-- The gates you ran and anything you checked by hand (a board, the lab, a
browser). -->

- [ ] `deno task verify` passes
- [ ] `pnpm nx run-many -t verify` passes (if you touched the lab or the board element)
- [ ] A changeset is added (`pnpm changeset`) if you changed the engine, the board element or the command line
- [ ] Comments and docs follow [AGENTS.md](../AGENTS.md) (English; comments say why)
