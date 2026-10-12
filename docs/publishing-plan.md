# Arrowz: going public and publishing to npm — revised plan

Date: 2026-10-09. Status: accepted plan, carried out in the order of §9. Steps
1–7, the day-one settings of §8, the rehearsal and the bootstrap (§4) are
done: `0.1.0` of the three packages is on npm since 2026-10-12. The
maintainer's procedure is
[releasing.md](releasing.md). This plan replaces an earlier, unpublished
draft design (lockstep `1.0.0-alpha` versions, CLI as compiled binaries,
JSR); §1 lists what changed and why. Every external fact was checked in
official documentation or seen in the rehearsal (§4); open points are listed
in §10.

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
- Until the first version PR the three manifests carry `0.0.0` and
  `.changeset/` holds one `minor` changeset per package: `changeset version`
  takes `0.0.0` to `0.1.0` and writes each first `CHANGELOG.md` (measured;
  from `0.1.0` a `minor` would give `0.2.0`).
- The advisory check is the CI job `changeset`: it warns on a pull request
  that changes a published package without a changeset and stays green. A
  change to a package's tests or README counts as a change (measured), which
  is why it is a warning; `pnpm changeset --empty` answers it.

## 3. The release, step by step (normal case)

1. PRs with changesets are merged to `main` as usual.
2. When the maintainer wants a release, locally:
   `GITHUB_TOKEN=$(gh auth token) pnpm changeset version && pnpm install --lockfile-only`,
   commit, open a PR ("Version Packages"). It contains the new versions and
   changelog entries, and any changesets contributors forgot. CI runs on it
   like on any PR. The changelog generator asks GitHub for the pull request
   and the author of each changeset; without `GITHUB_TOKEN` the command stops
   and changes no file (measured).
3. The maintainer merges it. `release.yml` runs on a push to `main` that touches
   `packages/*/CHANGELOG.md` (only version PRs do), or on "Run workflow"
   (`workflow_dispatch`). The concurrency group is the ref, so one run per
   branch at a time; only a pull request's run is cancelled by a newer push.
   A release run that has started is never cancelled; GitHub keeps one waiting
   run per group, so a newer run can replace a waiting one, which loses nothing
   because it plans from the same `main`.
   npm does not accept a version that already exists as a staged version:
   `npm stage publish` ends with `E409` and status 1. `stage` answers that
   refusal, and no other, with a notice and stays green. A
   pull request that changes the workflow
   or one of its programs runs it as a dry run: plan, build and smoke on all
   three packages, never tag or stage. A run started by hand on another branch
   never tags and never stages either.
   - **`tag-published`** (`contents: write`; only on `main`): for each package,
     every version its manifest has had on `main` since the placeholder
     `0.0.0`: if it is on npm but has no git tag yet, create the tag.
     (Tags are created only for versions that really went live; see step 5. A
     version that was replaced before a run saw it live gets its tag from a
     later run.) The tag goes on the first-parent
     commit of `main` that set the version, the merge of the version PR.
     When `main` set a version more than once (a version pull request
     reverted, or reverted and merged again), the history does not say which
     commit it was released from: the job creates no tag for it, names it
     with its commits and fails, and the maintainer tags it by hand.
     `0.0.0` is never tagged.
   - **`plan`** (`contents: read`): for each package, `npm view <name>@<version>`;
     versions not on npm form the plan. Empty plan → stop. `0.0.0` is never
     planned: it is the manifests' value before the first version PR. An
     unclear answer from npm fails the job. A planned package whose files
     differ from those of the commit that set its version (a file in the
     package's `scripts/` directory, `*.test.ts` and `*.test.tsx` are left
     out; everything else counts) is refused, so a version is released only
     from the files that were reviewed as that version. A planned package is
     refused, too, when a workspace dependency of it (the engine, for the
     board and the CLI) has another version than at that commit: `pnpm pack`
     would write the newer range into the tarball.
   - **`build`** (`contents: read`, `persist-credentials: false`, no caches):
     full verify, build, `pnpm pack` the planned packages, run the gates (§5) on
     the tarballs, upload the tarballs as an artifact. It records the SHA-256
     of every tarball as a job output, then reads the digests back with the
     same three checks `stage` applies (the pattern of the list, the digests,
     the count), so the dry run exercises them too.
   - **`smoke`**: matrix ubuntu / macOS / Windows (+ the free ARM runners) ×
     Node 22 and 24, plus Node 22.12.0 (the floor), npm 12 and Deno (16 legs),
     installing only the tarballs (§5 gate 3).
   - **`stage`** (only on `main`; environment `npm`, which only allows branch
     `main`; `id-token: write`, `contents: read`; no checkout, no install): asserts
     `npm --version` ≥ 11.15 (Node pinned to an exact 24.x, never
     `npm i -g npm` inside this job), checks the downloaded tarballs against the
     digests and the count `build` recorded, then
     `npm stage publish --ignore-scripts <tgz>` for each planned
     tarball, dependencies first (engine → board → CLI). Every tarball is tried
     even after one is refused, so a re-run after a partial failure reaches the
     rest, and a tarball whose version is already staged counts as done.
     Authentication is OIDC
     trusted publishing: no token is stored anywhere. npm signs a provenance
     statement and publishes it to the transparency log.
4. The maintainer looks at the workflow run and at the **Staged Packages** tab
   on npmjs.com, checks the staged versions (`npm stage download <stage-id>`
   gives the tarball), and approves with 2FA (one approval per package
   version; a typical release is 1–2). **Approve the engine first**, then board/CLI: npm does not enforce
   order, and a dependent approved first fails to install (ETARGET) until the
   engine is live. Never approve a staged version you did not trigger.
5. The tags for those versions are created by `tag-published` on the next run
   (next merge, or "Run workflow" by hand on `main`). Run it right after the
   approval, before a change to a file under `.github/workflows/` is merged:
   GitHub refuses the workflow's push of a tag when a workflow file differs
   between the commit that set the version and the commit the run is on. The
   remedy is in releasing.md.

## 4. First release (bootstrap), once per new package

npm lets you add a trusted publisher only to a package that already exists,
and a new entry expires if its first publish does not succeed within 2 days.
At its first stage an entry turns from "Pending validation" to "Valid";
whether a valid entry can still expire has not been tried, so the steps run on
one day. Order:

0. Before bootstrap day: while the manifests carry `0.0.0` nothing is planned
   and `stage` is skipped. A run by hand on `main` is green then, and plans
   nothing; the only run that exercises `build` and `smoke` is the dry run on a
   pull request. The whole flow was rehearsed once on a throwaway package,
   `@fronthub/arrowz-rehearsal`, in `Fronthub-pl/arrowz-rehearsal`
   (https://github.com/Fronthub-pl/arrowz-rehearsal), whose README records
   what was seen.
1. From the maintainer's laptop, logged in (npm asks for the second factor at
   the rejection, not at the stage), stage a tiny placeholder
   tarball `0.0.0` of each of the 3 packages (README only) with
   `npm stage publish ./<tarball> --access public`, then reject it with
   `npm stage reject <stage-id>`. Staging a package that does not exist creates
   it, with a holding version `0.0.0-stage` of npm's own that holds `latest`;
   the package stays after the rejection. No `0.0.0` is published by hand.
2. On the same day, for each package: npm → Settings → Trusted Publisher →
   GitHub Actions: repo `Fronthub-pl/arrowz`, workflow `release.yml`,
   environment `npm`; allowed actions: leave "Allow npm publish" and "Allow
   npm dist-tag" unticked (`npm stage publish` is always allowed), so npm
   refuses `npm publish` from the workflow with `E403`. Then set "Require
   two-factor authentication and disallow bypass 2fa tokens (recommended)".
3. On the same day, merge the version PR that brings the packages to `0.1.0`.
   CI stages them; approve on npm. `0.1.0` becomes `latest` by itself, with
   provenance. Then tag and check as in steps 5 and 6 of releasing.md's normal
   release, before anything else is merged.
4. Check that `npm dist-tag ls` shows `latest` = `0.1.0`; `0.0.0-stage` stays
   in the list of versions.

If the trusted-publisher entry expires (its first publish did not succeed
within 2 days), delete it and create it again: npm does not let you use or edit
an expired entry.

Every step of this section is done by the maintainer, in the browser or in a
terminal logged in with 2FA. None of it can be scripted with a token: changing
package access, maintainers or the trusted-publishing configuration is among
the first actions that 2FA-bypass tokens lose (§8).

## 5. Gates (on the packed tarballs, i.e. the files users receive)

1. **Contents + size**: file list on an allowlist per package
   (`README.md`, `LICENSE`, `NOTICE`, `CHANGELOG.md`, `package.json`; in `dist/`
   the engine and the board accept any `<name>.js` and `<name>.d.ts` one level
   deep, so a stale file with such a name passes; the CLI accepts
   `arrowz.mjs` alone; a stale file in a local `dist/` is packed otherwise,
   measured), size budget (engine
   ≤ 200 kB, board ≤ 100 kB, CLI ≤ 30 kB: its bundle packs to 6 kB and its README to
   15 kB). Catches stray tests.
   The packed `package.json` must also install under npm 12's defaults, which
   run no dependency script and resolve no git or remote-URL dependency unless
   the consumer allows each one: no `preinstall`, `install` or `postinstall`
   script, no `binding.gyp` in the tarball (npm builds it implicitly), and
   every dependency a registry version range (no git, URL, `file:` or
   `workspace:` spec).
   The packed manifest must name exactly the published entry points, each with
   its types for the engine and the board (Are The Types Wrong says nothing
   about a package without types), and a released tarball ships its
   `CHANGELOG.md`. The CLI's manifest must name exactly the `arrowz` command,
   and a dependency is `x.y.z`, `^x.y.z` or `~x.y.z`.
   The manifest is also held to what the three packages publish: `type` is
   `module`, `engines` is Node 22.12 or newer and nothing else, no `main`,
   `module`, `browser`, `types`, `typings`, `os`, `cpu`, `libc` or bundled
   dependencies, `sideEffects` as each package sets it (and the files it
   lists are in the tarball), every entry point with exactly `types` then
   `default`, and the dependencies exactly the ones of the package's rule,
   with no peer or optional dependency, so a dependency that went missing or
   a new one is named.
2. **`publint --strict`** on every tarball and, for the engine and the board
   (the packages with types), **`attw <tarball> --profile esm-only`** (the
   default profile wrongly fails an ESM-only package).
3. **Consumer smoke** in an empty project on the OS × runtime matrix: the engine
   reproduces the 40×40 seed 1 fingerprint; `npx arrowz carve --width=25
   --height=25 --dry-run` prints the golden layout id; a Vite page using the
   element builds. Packages of this release come from the tarballs; packages not
   in this release may come from the registry. At least one leg installs with
   npm 12 and its defaults, nothing approved with `npm approve-scripts` and no
   `--allow-git` or `--allow-remote`; every leg installs with
   `--ignore-scripts`, so the claim that the packages need no install script
   is checked everywhere. No Node line bundles npm 12 yet (22 has
   npm 10; 24 and 26 have npm 11), so that leg installs it itself
   (`npm install --global npm@12`; this is the smoke job, never `stage`).
4. Gates 1–2 also run in CI for the packages a PR affects (Nx target
   `pack-check`, in the list of targets of `nx affected`; it is not part of
   `verify`, so a local check needs no packing).

## 6. Package changes

- Rename `@arrowz/*` → `@fronthub/arrowz-engine`, `@fronthub/arrowz-board`,
  `@fronthub/arrowz-cli`, lab `@fronthub/arrowz-lab` (private). ~488 occurrences.
- Every published `package.json`: `version` (`0.0.0` until the first version PR
  sets `0.1.0`, §2), no `private`, `license: MIT`,
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

## 10. Still unverified

- The notice of `stage` on a real `E409`: the loop of its step was run in a
  test with a stand-in for npm, and the two strings it looks for were read in
  the log of the rehearsal.
- What npm answers when `stage` hands it a version that went live while the
  run was under way: the notice is worded for both cases, and only the answer
  for a version that is still staged has been seen.
- A tag for an earlier version pushed by the workflow's token: no run has had
  an earlier version to tag.
- The line of `tag-published` for a version that `main` set more than once,
  and the tag made by hand after it: run in a test, in a scratch repository.
- Whether a valid trusted-publisher entry still expires after two days
  without an approval (staging alone turns "Pending validation" into "Valid";
  the plan avoids depending on it: §4 runs it same day).
- Whether `npm trust github` takes `--allow-stage-publish` alone for "stage
  only" (npm-stage.md names `--allow-publish` and `--allow-stage-publish` for
  `npm trust <provider>`).
- Whether GitHub Actions can be a ruleset bypass actor (plan avoids needing it).
- Whether the first step of the 2FA-bypass token retirement is in effect: it
  was announced for early August 2026, and the announcement's discussion
  (github.com/orgs/community/discussions/201329) does not confirm it. The plan
  does not depend on the answer.
- The Vite page of the consumer smoke builds under npm 12 with no approved
  script (measured on macOS with Vite 8: the only blocked script is the
  optional `fsevents`); the smoke matrix repeats it on Linux, and every leg
  installs with scripts off.
- npm's roadmap in the same discussion names creating new scoped packages from
  a trusted workflow, with no date; it would remove the placeholder step.
