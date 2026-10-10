# Arrowz — repository rules

## Language

- **Everything in the repository is in English**: code, identifiers, comments,
  tests, documentation (README files and `docs/`), branch names, commit
  messages, pull request titles and descriptions. Nothing Polish goes into
  files, except translation dictionaries of user-facing text.
- **User-facing tools ship bilingual UI (Polish and English).** The lab
  (`apps/lab`) has a language switch; every visible string, parameter label,
  help text and "inactive" reason lives in the dictionary
  (`packages/engine/lab-i18n.ts`), with English as the source language in code
  (`PARAM_SPEC`) and Polish as the translation.

## Packages

- The engine and the CLI are TypeScript on Deno 2.9 in `packages/engine`
  (`@arrowz/engine`) and `packages/cli`: `deno task test` must pass after
  every change, and `deno task verify` (check, lint, fmt, test) before a PR.
  The whole repository, Node projects included, is verified with
  `pnpm nx run-many -t verify`; pnpm comes from its standalone installer
  (CONTRIBUTING.md), not Corepack.
- The engine (`packages/engine/engine.ts`) knows neither Deno nor the DOM, and
  so do `command.ts`, `look.ts`, `lab-simple.ts`, `lab-presets.ts`, `lab-i18n.ts`,
  `lab-report.ts`, `lab-docs.ts`: no file
  in `packages/cli` reaches for the DOM either, and `neutral.test.ts` greps
  both rules. Never spread arrays proportional to the number of cells or
  pieces (`Math.min(...arr)`) — it overflows the worker stack in Chrome.
- No `any`, no non-null assertions; a type fix must never add a value-changing
  fallback in the engine (`fingerprints.test.ts` guards the boards, and
  `packages/engine/scripts/node-smoke.mjs` guards the Node build of them).
- Node consumers get the engine from `packages/engine/dist/`, emitted by
  `pnpm nx build engine`; never import the engine's `.ts` sources from `apps/`.
- The lab is `apps/lab` (`pnpm nx serve lab`, port 8779) and keeps its boards
  in the store served by `deno task store` (port 8777). `worker-smoke.mjs`
  runs the worker `vite build` emits and checks its board against the engine's,
  so what the browser loads is gated, not merely compiled.
- `pnpm nx serve lab` and the rest of the Nx targets need
  `pnpm install` once. The Deno gates do not:
  nothing under `packages/` imports the board element, so `deno task check` and
  `deno task lint` pass with no `node_modules`.
- No attribution lines in commit messages or PR descriptions.

## Comments

**Comments say why, once, in the fewest lines.**
- Comment non-obvious code only: a browser quirk, an ordering constraint, a number that was measured. One line is the default and three is normal. Anything over 6 lines must be a module or API header. Put longer rationale in `docs/` and link to it.
- No history in code. Do not refer to PRs, tasks, review rounds or planning labels (handoff, Ruling, "harness fact"), nor to earlier versions ("used to", "revision 1"), in comments; that belongs in commit messages and PRs. When a spec constraint matters, state the constraint itself.
- Cite symbols, never `file.ts:NN`.
- Say each explanation once, next to the code that enforces it. Other places point to the symbol ("see `twoFrames`").
- In tests, the test name carries the *what*. A comment explains only setup that looks arbitrary (this viewport, this mock, this wait) or, in one sentence, what this case catches that a similar case cannot. The story of how the test was found (mutations run, review rounds) goes in the commit.
- For a measured number, write the result and the consequence ("two frames is the floor, don't shorten"), not the protocol or the sample table.

grep guard: `packages/engine/comments.test.ts`. The guard enforces: non-header
blocks ≤ 6 lines, module/API headers ≤ 24 lines. A header is the file's first
comment block, or a `/** */` block right above a declaration.
The guard walks `apps/lab/src`, `packages/board-element/src`, `packages/engine`
(scripts included, `dist/` excluded) and `packages/cli`.
