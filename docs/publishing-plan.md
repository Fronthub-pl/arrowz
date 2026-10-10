# Arrowz: going public and publishing to npm — revised plan

Date: 2026-10-09. Status: accepted plan, not yet implemented. It replaces an
earlier, unpublished draft design (lockstep `1.0.0-alpha` versions, CLI as
compiled binaries, JSR); §1 lists what changed and why. Every external fact was
checked in official documentation; open points are listed in §10.

Revised 2026-10-10 for two npm changes announced on 2026-07-08
([GitHub changelog](https://github.blog/changelog/2026-07-08-npm-install-time-security-and-gat-bypass2fa-deprecation/)):
npm 12 is now `latest` and installs with dependency scripts, git dependencies
and remote-URL dependencies switched off (§5, §7), and granular access tokens
that bypass 2FA are being retired (§4, §8).

## 0. Goals

1. A secure release that is simple and almost fully automated.
2. Packages that work on every system.
3. A repo a stranger can clone and contribute to without the maintainer's
   private tools (beads, Jev/TypeSafe, jbcontext, basic-memory).
4. Updated documentation.
5. Standard version numbers.
6. One version per package: a CLI change must not bump the engine or the board.
7. A repo protected against malicious behaviour that still accepts issues and PRs.

## 1. What gets published (npm only, scope `@fronthub`)

| npm package | From | What it is |
|---|---|---|
| `@fronthub/arrowz-engine` | `packages/engine` | the generator: ESM JavaScript + `.d.ts` in `dist/` |
| `@fronthub/arrowz-board` | `packages/board-element` | the `<arrowz-board>` web component; depends on the engine (`^`) and `lit` (`^3`) |
| `@fronthub/arrowz-cli` | `packages/cli` | the `arrowz` command (`arrowz carve …`), plain JavaScript for Node, built by `deno bundle` into `dist/arrowz.mjs` (`#!/usr/bin/env node`) with the engine left external; depends on the engine (`^`) |

Three packages. Not published: the lab (an app), the board store server (only
the lab talks to it), `report` (a maintainer measurement tool; it needs engine
internals and stays `deno task report` in a clone), JSR (deferred: Deno users
can already `import 'npm:@fronthub/arrowz-engine'`), binaries.

### Changes from the draft spec, and why

| Draft spec | Now | Why |
|---|---|---|
| CLI as `deno compile` binaries in 5 platform packages + a shim (8 npm packages) | CLI as one plain JS package | Binaries are 29–35 MB each (~190 MB per release) and only cover 6 OS/CPU pairs with glibc ≥ 2.27; built inside the repo they were 327 MB because `deno compile` embedded the whole `node_modules`. The JS package is ~6 kB, runs wherever Node ≥ 22 or Deno runs (incl. Alpine and Windows on ARM), and removes cross-compiling, the shim and 5 bootstraps. Porting the CLI's 48 Deno API calls to `node:fs`/`node:process`/`node:path` changed 43 lines in a trial port. |
| One shared version (lockstep) `1.0.0-alpha.2` | Independent versions per package, starting at `0.1.0` | Goal 6. SemVer: `0.y.z` is initial development and its FAQ says start at `0.1.0`. A normal `0.1.0` becomes npm `latest` by itself; alphas need explicit dist-tags and caret ranges let breaking alphas through. |
| Engine pinned exactly (`workspace:*`) | `workspace:^` | Measured with Changesets: with `*`, every engine patch also re-releases the board; with `^` it does not. |
| Engine on JSR too | Deferred | Second registry, second trust setup, slow-type fixes, and JSR ignores prereleases; Deno imports `npm:` packages natively. |
| Tag push triggers the release | Merging a version PR to `main` triggers it | Per-package versions; nothing to tag by hand. |
| Approval = GitHub environment reviewer | npm staged publishing, approved on npmjs.com with 2FA | The reviewer is the same GitHub account that pushes; a stolen GitHub account could release. npm approval needs a second, independent factor, and CI cannot approve its own stage. |
| `latest` + `alpha` dist-tags, npm ≥ 11.21 | Plain `latest` | Not needed with `0.x`. |
| One GitHub Release with binaries | No GitHub Releases; per-package git tags + `CHANGELOG.md` | Nothing to attach. Can be added later. |

## 2. Versioning

- SemVer 2.0.0 per package. Everything starts at `0.1.0`. While in `0.x`, a
  breaking change is a **minor** bump (`0.1.3` → `0.2.0`), a fix or addition is a
  patch. `1.0.0` later means "stable API".
- Tool: **Changesets** (`@changesets/cli` 3.x + `@changesets/changelog-github`).
  It only decides versions and writes `CHANGELOG.md`; it does not publish
  (Changesets does not support npm staged publishing).
- A contributor who changes a published package runs `pnpm changeset`, picks
  patch/minor and writes one user-facing sentence; this creates a small file
  in `.changeset/`. The check is advisory: if it is missing, the maintainer adds
  it later. Changesets' own docs advise against blocking contributions on it.
- Dependencies between packages use `workspace:^`. `pnpm pack` turns that into
  e.g. `^0.1.1`. In `0.x`, `^0.1.1` accepts only `0.1.x`, so an engine minor
  bump makes Changesets give the board and CLI a patch bump too.
- Git tags: `@fronthub/arrowz-engine@0.1.0` (Changesets' format).
- `updateInternalDependencies: "patch"` (the default) does NOT bump the board on an
  engine patch (measured): it only rewrites the range when the board ships anyway.
- Changesets can only give dependents a patch bump. If the board or CLI
  re-exports engine types and the engine breaks, the maintainer adds
  `"@fronthub/arrowz-board": minor` to that changeset by hand (review rule).
- `.changeset/config.json`: `changelog: ["@changesets/changelog-github", {"repo": "Fronthub-pl/arrowz"}]`,
  `commit: false`, `baseBranch: "main"`, `updateInternalDependencies: "patch"`,
  private packages not versioned.

## 3. The release, step by step (normal case)

1. PRs with changesets are merged to `main` as usual.
2. When the maintainer wants a release, locally:
   `pnpm changeset version && pnpm install --lockfile-only`, commit, open a PR
   ("Version Packages"). It contains the new versions and changelog entries,
   and any changesets contributors forgot. CI runs on it like on any PR.
3. The maintainer merges it. `release.yml` runs on a push to `main` that touches
   `packages/*/CHANGELOG.md` (only version PRs do), or on "Run workflow"
   (`workflow_dispatch`); `concurrency: release` keeps one run at a time.
   A second `npm stage publish` of an already staged version is refused by npm,
   so a stray run fails without harm:
   - **`tag-published`** (`contents: write`): for each package, if a version is
     on npm but has no git tag yet, create the tag. (Tags are created only for
     versions that really went live; see step 5.)
   - **`plan`** (`contents: read`): for each package, `npm view <name>@<version>`;
     versions not on npm form the plan. Empty plan → stop.
   - **`build`** (`contents: read`, `persist-credentials: false`, no caches):
     full verify, build, `pnpm pack` the planned packages, run the gates (§5) on
     the tarballs, upload the tarballs as an artifact.
   - **`smoke`**: matrix ubuntu / macOS / Windows (+ the free ARM runners) ×
     Node 22 and 24 + Deno, installing only the tarballs (§5 gate 3).
   - **`stage`** (environment `npm`, which only allows branch `main`;
     `id-token: write`, `contents: read`; no checkout, no install): asserts
     `npm --version` ≥ 11.15 (Node pinned to an exact 24.x, never
     `npm i -g npm` inside this job), then `npm stage publish <tgz>` for each planned
     tarball, dependencies first (engine → board → CLI). Authentication is OIDC
     trusted publishing: no token is stored anywhere. Provenance is attached.
4. npm emails the maintainer, who opens npmjs.com → package → Staged, checks it,
   and approves with 2FA (one approval per package version; a typical release
   is 1–2). **Approve the engine first**, then board/CLI: npm does not enforce
   order, and a dependent approved first fails to install (ETARGET) until the
   engine is live. Never approve a stage you did not trigger.
5. The tags for those versions are created by `tag-published` on the next run
   (next merge, or "Run workflow" by hand).

## 4. First release (bootstrap), once per new package

npm lets you add a trusted publisher only to a package that already exists, and
a trusted-publisher entry expires if no publish uses it within 2 days of
its creation. Order:

0. Before bootstrap day: `release.yml` has run green up to `stage` (which fails
   for packages that do not exist yet), and the whole flow was rehearsed once on
   a throwaway package (e.g. `@fronthub/arrowz-rehearsal`) and then deprecated.
1. From the maintainer's laptop, logged in with 2FA, publish a tiny placeholder
   `0.0.0` of each of the 3 packages (README only), as the Changesets guide
   suggests for new packages.
2. On the same day, for each package: npm → Settings → Trusted publishing →
   GitHub Actions: repo `Fronthub-pl/arrowz`, workflow `release.yml`,
   environment `npm`; allowed action: staged publish only. Then set "Require
   two-factor authentication and disallow tokens".
3. On the same day, merge the version PR that brings the packages to `0.1.0`.
   CI stages them; approve on npm. `0.1.0` becomes `latest`, with provenance.
4. `npm deprecate <name>@0.0.0 "placeholder"`; check `npm dist-tag ls` shows
   `latest` = `0.1.0`.

If the trusted-publisher entry expires (unused for 2 days), delete and recreate
it; entries cannot be edited.

Every step of this section is done by the maintainer, in the browser or in a
terminal logged in with 2FA. None of it can be scripted with a token: changing
package access, maintainers or the trusted-publishing configuration is among
the first actions that 2FA-bypass tokens lose (§8).

## 5. Gates (on the packed tarballs, i.e. the files users receive)

1. **Contents + size**: file list on an allowlist (`dist/`, `README.md`,
   `LICENSE`, `NOTICE`, `CHANGELOG.md`, `package.json`), size budget (engine
   ≤ 200 kB, board ≤ 100 kB, CLI ≤ 30 kB: its bundle packs to 6 kB and its README to
   15 kB). Catches stray tests.
   The packed `package.json` must also install under npm 12's defaults, which
   run no dependency script and resolve no git or remote-URL dependency unless
   the consumer allows each one: no `preinstall`, `install` or `postinstall`
   script, no `binding.gyp` in the tarball (npm builds it implicitly), and
   every dependency a registry version range (no git, URL, `file:` or
   `workspace:` spec).
2. **`publint`** and **`@arethetypeswrong/cli --pack --profile esm-only`**
   (the default profile wrongly fails an ESM-only package).
3. **Consumer smoke** in an empty project on the OS × runtime matrix: the engine
   reproduces the 40×40 seed 1 fingerprint; `npx arrowz carve --width=25
   --height=25 --dry-run` prints the golden layout id; a Vite page using the
   element builds. Packages of this release come from the tarballs; packages not
   in this release may come from the registry. At least one leg installs with
   npm 12 and its defaults, nothing approved with `npm approve-scripts` and no
   `--allow-git` or `--allow-remote`. No Node line bundles npm 12 yet (22 has
   npm 10; 24 and 26 have npm 11), so that leg installs it itself
   (`npm i -g npm@12`; this is the smoke job, never `stage`).
4. Gates 1–2 also run on every PR (Nx target `pack-check`).

## 6. Package changes

- Rename `@arrowz/*` → `@fronthub/arrowz-engine`, `@fronthub/arrowz-board`,
  `@fronthub/arrowz-cli`, lab `@fronthub/arrowz-lab` (private). ~488 occurrences.
- Every published `package.json`: `version: 0.1.0`, no `private`, `license: MIT`,
  `repository` (`git+https://github.com/Fronthub-pl/arrowz.git` + `directory`),
  `homepage`, `keywords`, `engines: { node: ">=22.12" }`,
  `publishConfig: { access: "public" }`, `files`. Copy `LICENSE` into each
  package (+ NOTICE for the Apache-2.0 colour themes in the engine/board).
- Engine exports: the published package exposes only `.`, `./command`,
  `./simple` (the CLI needs them) through pnpm's `publishConfig.exports`, which
  replaces `exports` at pack time (pnpm.io/package_json). Inside the workspace
  the lab keeps `./i18n`, `./docs`, `./presets`, `./report`. `./comment-lines`
  goes. Tarballs must therefore be made with `pnpm pack`, never `npm pack`.
- Board: add the `HTMLElementTagNameMap` declaration; fix the README sentence
  that says the repo has no LICENSE.
- CLI: port `carve.ts`/`store.ts` from `Deno.*` to `node:` built-ins (still runs
  under Deno and its tests); `package.json` with `bin: { arrowz: … }`; default
  boards dir `./boards` when `ARROWZ_BOARDS_DIR` is unset (the repository task
  runs inside `packages/cli`, so there it is `packages/cli/boards`);
  `buildCommand` prints `arrowz carve …` instead of `deno task carve …`; remove
  the `deno task compile` binary task.
- Known gap: `deno task store` runs `store.sh`, which plain Windows shells cannot
  run; port it to a Deno script or document WSL/Git Bash.

## 7. Contributor-friendly repo

- Claude Code hooks move from the committed `.claude/settings.json` to the
  maintainer's git-ignored `.claude/settings.local.json`; `.mcp.json`
  (jbcontext), the jbcontext agent/skill and vendored third-party skills leave
  the repo. A `.worktreeinclude` copies the local settings into worktrees.
- `CLAUDE.md` splits: public `AGENTS.md` (language, packages, comments rules),
  `CLAUDE.md` = `@AGENTS.md`, maintainer-only parts (beads, Tools, memory) go to
  git-ignored `CLAUDE.local.md`.
- Private tooling leaves the repo: bead guard, memory guard, all Jev scripts
  and `docs/jev-guards.md`, `docs/bead-guard.md`, `.github/workflows/jev.yml`
  (and the `TYPESAFE_API_KEY` secret is deleted), tracked `.beads/` files.
  Rule: anything that needs a key or a binary the public does not have lives
  in the maintainer's private repo. Tests that reference them are updated.
  That repo is cloned into the git-ignored `.maintainer/` and linked into
  place by its own `link.sh`.
- Internal docs: first move the public knowledge (game rules, board-file format,
  layout hash, measurements cited by code comments) from `docs/superpowers/`
  into `docs/`, rewrite ~25 references, then remove `docs/superpowers/` and
  `lab-review.md` (archived privately).
- New: `CONTRIBUTING.md` (prerequisites, `deno task verify`,
  `pnpm nx run-many -t verify`, Playwright Chromium, comment and language rules,
  changesets), `SECURITY.md` (private vulnerability reporting), issue forms,
  PR template, optional `CODE_OF_CONDUCT.md`.
- README quick start: correct step order, prerequisites Deno ≥ 2.9, Node 24 LTS,
  pnpm installed with its standalone installer or `npm i -g pnpm` (Corepack is
  not shipped from Node 25); install-from-npm sections per package, which say
  that the packages run no install script and so need no `npm approve-scripts`
  entry under npm 12;
  `docs/releasing.md` for the maintainer; lab docs (EN + PL) updated for names.
- npm 12's install defaults change nothing for a clone: contributors install
  with pnpm, which already runs build scripts only for the packages that
  `allowBuilds` in `pnpm-workspace.yaml` names (`nx`, `esbuild`).

## 8. GitHub and npm settings (clicks, no code)

Day one:
- `main` ruleset: keep PR-required with 0 approvals (a solo author cannot
  approve their own PR), add the CI check as **required**, keep force-push and
  deletion blocked.
- Tag ruleset for `refs/tags/@fronthub/arrowz-*@*`: block **updates and
  deletions** (creations stay open so the workflow can tag).
- Environment `npm`: deployment branches = `main` only, no reviewer, admins
  cannot bypass. (When a job uses an environment, the OIDC identity no longer
  contains the branch, so this filter is the branch check.)
- Actions: require SHA-pinned actions; require approval of workflows for **all**
  external contributors; default token read-only (already); keep "Allow GitHub
  Actions to create PRs" **off**.
- Secret scanning + push protection on; private vulnerability reporting on.
- GitHub org: require 2FA. npm: passkey/security-key 2FA, npm org 2FA required.
- npm tokens: none. No granular access token with "bypass 2FA" is created for
  this project, and `npm token list` stays empty. npm is retiring those tokens
  in two steps: from early August 2026 (announced date) they no longer skip 2FA
  for account, package and organization management, and around January 2027
  they lose direct publishing and can only stage. The release never used one
  (§3: OIDC stages, a human approves with 2FA), so nothing has to migrate. A
  token is not a fallback either: if trusted publishing is unavailable, the
  release waits.
- Recovery: npm and GitHub recovery codes stored in a password manager (losing
  the 2FA device otherwise means an npm support ticket); consider a second
  trusted owner of the npm `fronthub` org who can approve stages.
Soon after: CodeQL default setup (JS/TS + Actions), Dependabot security updates
and grouped npm version updates with cooldown, disable unused wiki/projects,
keep interaction limits as an emergency switch.

## 9. Order of work (pull requests)

1. Contributor split (§7 first three bullets) — S/M.
2. Internal docs extraction and removal — M.
3. Community files and README quick start — S/M.
4. Rename + package metadata + export trim + LICENSE copies — M.
5. CLI port to `node:` + `bin` + `./boards` + `buildCommand` — M.
6. Changesets setup + advisory check + initial `0.1.0` changesets — S.
7. `release.yml` + `pack-check` gates + `docs/releasing.md` — M.
Then §8 settings (day-one items can go first), the §4 rehearsal, then the §4
bootstrap.

## 10. Still unverified (check during the first release)

- Whether a stage over OIDC carries provenance (docs imply yes).
- Whether staging/approving counts as the "first successful publish" for the
  2-day trusted-publisher rule (plan avoids depending on it: §4 runs it same day).
- The exact CLI flag names of `npm trust github` for "stage only" (the web UI
  field "Allowed actions" is documented).
- Whether GitHub Actions can be a ruleset bypass actor (plan avoids needing it).
- Whether a rejected staged version can be re-staged with the same number
  (docs imply yes).
- The exact npm error text for "already staged".
- Whether the `0.0.0` placeholder keeps `latest` after 0.1.0
  (check with `npm dist-tag ls`).
- Whether the first step of the 2FA-bypass token retirement is in effect: it
  was announced for early August 2026, and the announcement's discussion
  (github.com/orgs/community/discussions/201329) does not confirm it. The plan
  does not depend on the answer.
- Whether the Vite page of the consumer smoke builds under npm 12 with no
  approved script (`esbuild` ships a `postinstall`). If it does not, the smoke
  approves that one script and says why.
- npm's staged-publishing page says that staging a package that does not exist
  yet publishes a public placeholder `0.0.0-stage`. If a stage from the
  maintainer's laptop can create the package that way, §4 step 1 needs no
  hand-made `0.0.0`; try it on the rehearsal package.
- npm's roadmap in the same discussion names creating new scoped packages from
  a trusted workflow, with no date; it would remove the placeholder step.
