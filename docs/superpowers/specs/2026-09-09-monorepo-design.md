# Arrowz monorepo: layout, packages and the road to the game

Date: 2026-09-09. Status: approved design, awaiting the implementation plan.

Baseline: `main` at `718eb95`, tagged `v1.0.0-alpha.1` (the Deno prototype
with the lab, the CLI and the parameter envelope; 134 tests).

## 1. Goal and scope

The engine works well enough to be built upon. Four deliverables will now
live in this repository:

1. the engine (generator, metrics, later the session reducer and scoring),
2. a universal board web component (renders a board, animates moves,
   emits clicks; usable from React, Angular, Svelte, Vue and plain HTML),
3. a new generator lab in React with a CLI documentation page,
4. the game itself in Angular 22 (per the 2026-09-07 design and plan).

This document does two things. It fixes the **road map** (order and
boundaries of the four deliverables) and it is the **full design of the
first step**: turning the repository into a monorepo and extracting the
engine into a package. Steps 2 to 4 get their own brainstorming, spec and
plan when their turn comes; here they receive only the boundaries the
monorepo must not close.

Out of scope for step 1: any change to generator behaviour, the React lab,
the web component, the Angular application, publishing to JSR or npm.

## 2. Road map

| Step | Result | Depends on |
|---|---|---|
| 0 | tag `v1.0.0-alpha.1` on `718eb95`, pushed (done 2026-09-09) | nothing |
| 1 | monorepo: `packages/engine`, `packages/cli`, Deno workspace + pnpm + Nx, CI | 0 |
| 2 | `packages/board-element`: `<arrowz-board>` on Lit | 1 |
| 3 | `apps/lab`: Vite + React + React Router, consumes 1 and 2, CLI docs page | 2 |
| 4 | `apps/game`: Angular 22 via `@nx/angular`; the 2026-09-07 plan rewritten to the new paths | 2 |

The web component comes before the React lab because the lab is its first
consumer and the proving ground for animations. The game comes last so it
receives finished building blocks. The old Deno lab stays in `packages/cli`
until the React lab reaches feature parity (presets, board store, simple
view, PL/EN, preview of boards that do not close); its removal is a separate
PR after the new lab is accepted.

Semver note: pre-release identifiers use a dot (`alpha.1`, `alpha.2`) so they
sort numerically; `alpha-1` would sort `alpha-10` before `alpha-2`.

## 3. Decisions and rejected alternatives

**Two runtimes, each in its role: Deno for the engine and CLI, Node for the
applications.** The engine and CLI stay on Deno 2.9 (tests, `deno check`,
`deno compile`, a future JSR release). Angular CLI, Vite and Lit tooling need
Node and npm. Rejected: *Node only* (would undo the Deno rewrite of PR #20 and
rewrite 134 tests from `@std/assert` to Vitest for no functional gain);
*Deno only* (Angular CLI under Deno's npm compatibility is not supported by
Angular, and Nx would be unavailable).

**Orchestration: Nx over a pnpm workspace, with the Deno packages wired in
through `run-commands`.** The official `@nx/deno` plugin from nx-labs is
discontinued and its community fork has not been published for two years, so
no Nx plugin is used for Deno; the Deno packages carry explicit
`project.json` files. Nx is kept for what it gives across four projects: the
task graph (`^build` before an application build), a local cache and
`nx affected` on pull requests. Nx Cloud is not used.

**The engine is consumed by Node applications from a compiled `dist/`, not
from `.ts` sources.** The engine directory carries two manifests: `deno.json`
(name, `.ts` exports, Deno tests) and `package.json` (name, `dist/` exports,
`workspace:*` linking). `dist/` is emitted by `tsc` with
`rewriteRelativeImportExtensions`, which turns the Deno-style `./types.ts`
imports into `./types.js` without touching the sources. Rejected: pointing
`package.json` exports at `.ts` sources (Vite would cope, Angular's builder
does not compile TypeScript outside its program); publishing to JSR and
installing through the npm compatibility layer (loses the instant feedback
of a workspace link; can be added later for consumers outside the repo).

**Name scope `@arrowz/*`.** Packages: `@arrowz/engine`, `@arrowz/cli`,
`@arrowz/board-element`, `@arrowz/lab`, `@arrowz/game`.

**Lab framework: Vite + React + React Router.** Rejected: Next.js (server
runtime and a Cloudflare adapter for an application that computes boards in a
client-side worker anyway); Astro with React islands (best for the docs page,
but two mental models in one project).

**Web component library: Lit.** Rejected: a bare custom element (more code for
properties, attributes and lifecycle, easier to drift between frameworks);
Stencil (its own compiler and heavier toolchain).

**The web component is a view only.** It draws, animates and emits clicks. The
game reducer, lives, scoring and the solver live in the engine package as
pure TypeScript; Angular and the lab compose the two.

**CI: GitHub Actions with the local Nx cache.** `nx affected` runs check, lint,
test and build for the projects touched by a pull request.

## 4. Repository layout after step 1

```
arrowz/
  deno.json                 workspace members, fmt/lint/compiler options, exclude
  package.json              root: nx, typescript, eslint; packageManager pnpm
  pnpm-workspace.yaml       packages: packages/*, apps/*
  nx.json                   namedInputs, targetDefaults, local cache
  .github/workflows/ci.yml  affected check, lint, test, build
  .vscode/settings.json     Deno enabled only under packages/engine and packages/cli
  packages/
    engine/                 @arrowz/engine: runtime-neutral logic
    cli/                    @arrowz/cli: carve, board store, lab server, the Deno lab
    board-element/          step 2 (absent after step 1)
  apps/
    lab/                    step 3 (absent after step 1)
    game/                   step 4 (absent after step 1)
  docs/                     unchanged
  README.md, README.pl.md   paths and commands updated
```

`prototype/` disappears; its engineering log `prototype/README.md` moves to
`packages/engine/HISTORY.md` unchanged in content.

## 5. Packages

### 5.1 `@arrowz/engine` (`packages/engine`)

Everything that is neutral to the runtime today: `engine.ts`, `types.ts`,
`command.ts`, `lab-simple.ts`, `lab-presets.ts`, `lab-i18n.ts` and
`fingerprints.json`, with the eleven test files that import only these
modules: `abort`, `absorb`, `command`, `engine`, `envelope`, `fingerprints`,
`lab-i18n`, `lab-presets`, `lab-simple`, `neutral` and `shortening`
(`*.test.ts`). "Engine" means all DOM-free logic, not only the generator: the
session reducer and scoring of the design (§10) will be added here when step
4 needs them.

`deno.json`:

```json
{
  "name": "@arrowz/engine",
  "version": "1.0.0-alpha.1",
  "exports": {
    ".": "./mod.ts",
    "./command": "./command.ts",
    "./simple": "./lab-simple.ts",
    "./presets": "./lab-presets.ts",
    "./i18n": "./lab-i18n.ts"
  }
}
```

`mod.ts` re-exports the public surface of `engine.ts` and the types of
`types.ts`. `package.json` mirrors the same subpaths onto `dist/`:

```json
{
  "name": "@arrowz/engine",
  "version": "1.0.0-alpha.1",
  "type": "module",
  "exports": {
    ".": { "types": "./dist/mod.d.ts", "default": "./dist/mod.js" },
    "./command": { "types": "./dist/command.d.ts", "default": "./dist/command.js" },
    "./simple": { "types": "./dist/lab-simple.d.ts", "default": "./dist/lab-simple.js" },
    "./presets": { "types": "./dist/lab-presets.d.ts", "default": "./dist/lab-presets.js" },
    "./i18n": { "types": "./dist/lab-i18n.d.ts", "default": "./dist/lab-i18n.js" }
  },
  "files": ["dist"]
}
```

`tsconfig.build.json` (Node side, emit only): `strict`,
`noUncheckedIndexedAccess`, `exactOptionalPropertyTypes`, `module: nodenext`,
`target: es2022`, `declaration`, `rewriteRelativeImportExtensions`,
`outDir: dist`, includes the non-test `.ts` files. Type checking remains the
job of `deno check`; `tsc` must not report errors the Deno check does not,
and if it does, the source is fixed, never silenced.

`project.json` targets (all `nx:run-commands`, `cwd` = the package):

| Target | Command | Cache |
|---|---|---|
| `check` | `deno check *.ts` | inputs: sources |
| `lint` | `deno lint` | inputs: sources |
| `fmt` | `deno fmt --check` | inputs: sources |
| `test` | `deno test --allow-read --allow-run` | inputs: sources, `fingerprints.json` |
| `build` | `tsc -p tsconfig.build.json` | outputs: `dist/` |
| `verify` | depends on check, lint, fmt, test | |

`neutral.test.ts` keeps its list and forbidden patterns; only its path
handling changes with the move. The test must not be weakened. `--allow-run`
is needed by the memory test in `engine.test.ts`, which runs `analyse()` in a
child Deno process under a 256 MB heap.

### 5.2 `@arrowz/cli` (`packages/cli`)

Deno-only code: `carve.ts`, `store.ts`, `lab-server.ts`, `lab-page.ts`,
`lab-worker.ts`, `lab.html`, `lab.sh` and the three test files that touch
them: `carve.test.ts` (spawns the CLI and compares SVG byte for byte),
`store.test.ts` and `lab-server.test.ts`. It imports the engine by name:
`import { generate } from '@arrowz/engine'`.

`deno.json`: name `@arrowz/cli`, no exports (not a library), tasks `carve`,
`bundle`, `lab`, `compile` with paths relative to the package. The board
store default stays next to the package (`packages/cli/boards/`, gitignored),
still overridable with `ARROWZ_BOARDS_DIR`. The bundle output moves to
`packages/cli/dist/` (gitignored).

`project.json` targets: `check`, `lint`, `fmt`, `test`, `verify`, plus
`bundle` (outputs `dist/`) and `lab` (not cached).

The canonical command keeps its prefix, `deno task carve …`, exported as
`COMMAND_PREFIX` from `command.ts`; it is run from the repository root because
the root `deno.json` defines `carve` as
`deno task --cwd=packages/cli carve`. The stored boards' `command` field
therefore stays valid.

### 5.3 Root `deno.json`

```json
{
  "workspace": ["./packages/engine", "./packages/cli"],
  "nodeModulesDir": "manual",
  "compilerOptions": { "strict": true, "noUncheckedIndexedAccess": true, "exactOptionalPropertyTypes": true },
  "imports": { "@std/assert": "jsr:@std/assert@^1", "@std/path": "jsr:@std/path@^1" },
  "fmt": { "semiColons": false, "singleQuote": true, "lineWidth": 120,
           "exclude": ["**/*.md", "packages/cli/lab.html", "packages/cli/boards/", "**/dist/", "docs/", "apps/", "node_modules/"] },
  "lint": { "rules": { "tags": ["recommended"], "include": ["no-explicit-any", "no-non-null-assertion"] } },
  "exclude": ["docs/", "apps/", "node_modules/", "**/dist/", "packages/cli/boards/", ".claude/", ".mcp.json"],
  "tasks": {
    "test": "deno test --allow-read --allow-write --allow-env --allow-run --allow-net packages/",
    "check": "deno check packages/engine/*.ts packages/cli/*.ts",
    "lint": "deno lint",
    "fmt": "deno fmt --check",
    "verify": "deno task check && deno task lint && deno task fmt && deno task test",
    "carve": "deno task --cwd=packages/cli carve",
    "lab": "deno task --cwd=packages/cli lab"
  }
}
```

`nodeModulesDir: "manual"` keeps Deno from installing or rewriting the
`node_modules/` that pnpm owns. `apps/` and `node_modules/` are excluded so
`deno lint` and `deno fmt` never walk Angular or React sources. The Deno-side
`deno task verify` remains the quick check for engine work; the whole
repository is verified with `pnpm nx run-many -t verify`.

## 6. Nx configuration

`nx.json`: `namedInputs.default` = project files minus `dist/`, `boards/`,
`*.md`; `targetDefaults.build.dependsOn = ["^build"]`,
`targetDefaults.build.cache = true`, `targetDefaults.{check,lint,fmt,test}.cache = true`.
No Nx plugins are installed in step 1; `@nx/vite`, `@nx/angular` and
`@nx/eslint` arrive with the steps that need them.

Root `package.json`: `"packageManager": "pnpm@12.3.4"` (what corepack
resolves on 2026-09-09), devDependencies `nx` (23.2.x) and `typescript`
(5.9.x: the stable emitter that has carried `rewriteRelativeImportExtensions`
since 5.7; the native 7.x compiler is not evaluated in this step).
`pnpm-workspace.yaml` lists `packages/*` and `apps/*`, so `@arrowz/engine`
is a workspace package the applications can link with `workspace:*`;
`packages/cli` has no `package.json` and pnpm ignores it.
pnpm is not installed on the development machine; corepack is, so the plan
starts with `corepack enable pnpm`.

## 7. Editor and developer ergonomics

`.vscode/settings.json` sets `deno.enable: false` at the root and
`deno.enablePaths: ["packages/engine", "packages/cli"]`, so the Deno
extension types only the Deno packages and the TypeScript server handles the
applications. The earlier false type errors in VS Code came from the
extension being absent; here the risk is the opposite, the extension
claiming Angular files.

`lab.sh` moves with the CLI package and keeps building the bundle and
serving the lab on port 8777 from `packages/cli/`.

## 8. Tests and verification

All 134 tests move with their modules; their content does not change beyond
paths and the `@arrowz/engine` import in the CLI package. Acceptance of the
move:

- `deno task verify` passes at the root (check, lint, fmt, all tests),
- `pnpm nx run-many -t verify` passes and a second run is served from the
  cache,
- `pnpm nx build engine` emits `dist/` with `.js` and `.d.ts`; a Node script
  importing `@arrowz/engine` from `dist/` generates the 40×40 seed 1 board of
  `fingerprints.json` with the same fingerprint (the same board bit for bit
  on the Node side),
- `deno task carve --width=30 --height=30 --seed=7 --dry-run` from the root
  prints the same fingerprint as before the move,
- `sh packages/cli/lab.sh` serves the old lab and saves a board.

## 9. CI

`.github/workflows/ci.yml` on pull requests and on `main`: checkout with full
history, `denoland/setup-deno` (2.9.x), `pnpm/action-setup` +
`actions/setup-node` (24) with the pnpm store cached, `pnpm install
--frozen-lockfile`, `pnpm nx affected -t check lint fmt test build` with
`--base` and `--head` from `nrwl/nx-set-shas`. The fingerprint test runs in
CI (about 1.3 s for the 500×500 case).

## 10. Documentation and the existing plans

- `README.md` and `README.pl.md`: every `prototype/…` path becomes its
  `packages/…` counterpart; commands stay `deno task carve …` from the root.
- `docs/superpowers/specs/2026-09-07-arrowz-design.md` §4 receives a short
  addendum: the `core/` tree is now `@arrowz/engine`, the renderer is
  `<arrowz-board>`, see this document.
- `docs/superpowers/plans/2026-09-07-arrowz/slice-00-scaffold.md` is marked
  superseded by this design; slices 1 to 10 are rewritten in step 4.
- `prototype/README.md` becomes `packages/engine/HISTORY.md`.
- `CLAUDE.md` paths (`prototype/lab.html`, `lab-i18n.ts`, `engine.ts`) are
  updated, and the rule about the Deno lab moves to the CLI package.

## 11. Boundaries for the later steps

### 11.1 `<arrowz-board>` (step 2)

Lit element in `packages/board-element`, npm package `@arrowz/board-element`,
depends on `@arrowz/engine` for types only. Properties: `board: Board`,
`view: View` (line weight, arrowhead size, colours), `interactive: boolean`.
Methods: `animateExit(pieceId, dir)`, `shake(pieceId, distance)`, `fit()`,
`zoomBy(factor)`. Events: `piece-click` (`{ pieceId }`), `viewport-change`.
The whole viewport of design §11 (zoom towards the cursor, pan with a
modifier key, pinch, `+`/`−`/fit buttons and keys) lives inside the element,
since every consumer would otherwise repeat it. The element does not know the
reducer: it receives the `exit` or `bounce` effect from outside, as design §10
prescribes. The path geometry shared with the engine's `toSvg` is extracted
into a `geometry` module of the engine in that step, not in step 1.

### 11.2 React lab (step 3)

`apps/lab` on Vite + React + React Router. The worker imports
`@arrowz/engine`; the board is shown through `@lit/react` wrapping
`<arrowz-board>`; the board store is the existing `lab-server.ts` API from the
CLI package, used as the development backend behind a Vite proxy. The CLI
docs page is generated from `helpText()` at build time so it can never drift
from the parser. Bilingual PL/EN from the same dictionary module. Deployment
as static files (Cloudflare Static Assets), as planned for the game.

### 11.3 Angular game (step 4)

`apps/game` generated by `@nx/angular`. The 2026-09-07 plan keeps its
decisions (no SSR, Cloudflare Static Assets, Firebase last, two test paths)
and changes only that `core/` is `@arrowz/engine` and the renderer is
`<arrowz-board>` used with `CUSTOM_ELEMENTS_SCHEMA`.

## 12. Risks and the spikes that open the plan

Two things are verified in the first task of the plan, before any file
moves, each as a throwaway experiment in a temporary directory:

1. **Deno next to pnpm.** With `package.json` at the root and
   `nodeModulesDir: "manual"`, `deno test` and `deno check` on a workspace
   member must neither install anything nor complain about pnpm's
   `node_modules` layout.
2. **`tsc` emission of the engine.** `tsc` with
   `rewriteRelativeImportExtensions` on the current `engine.ts`, `types.ts`
   and `command.ts` must emit without errors and the emitted module must
   produce the golden 40×40 fingerprint under Node 24 with `typescript`
   5.9.x. The engine calls `performance.now()`, which the `es2022` lib does
   not declare, so the build tsconfig adds the `dom` lib for emission only;
   `neutral.test.ts` still keeps DOM calls out of the sources.

Further risks: the fmt exclude list must be checked against `deno fmt
--check` before the move (a forgotten path makes CI fail on generated files);
stored boards under `prototype/boards/` are gitignored and are simply moved by
hand to `packages/cli/boards/` on the developer machine.

## 13. Out of scope

Publishing `@arrowz/engine` to JSR or npm, Nx Cloud, splitting `engine.ts`
into modules, the session reducer and scoring, any change to generator output.
