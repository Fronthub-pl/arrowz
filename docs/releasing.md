# Releasing Arrowz

For the maintainer. A release publishes one or more of `@fronthub/arrowz-engine`,
`@fronthub/arrowz-board` and `@fronthub/arrowz-cli` to npm, each at its own
version. The design and its reasons are in [publishing-plan.md](publishing-plan.md).

A release has three parts: you open a version pull request, CI stages the
packages on npm, and you approve each staged version with your second factor.
CI holds no npm token and cannot publish by itself.

Words used throughout: CI *stages* a package, which puts that version on npm
in a state nobody can install; a *staged version* is what waits there; you
*approve* it, and only then is it live.

## Before the first release

The first release of a package needs a few steps by hand, once. They are in
[The first release](#the-first-release) below; do them before anything else
here works.

## A normal release

1. **Make the version pull request.** On an up-to-date `main`, in a new branch.
   First read the list of files in `.changeset/` and add any changeset a
   contributor forgot (`pnpm changeset`). Then run, once:

   ```sh
   GITHUB_TOKEN=$(gh auth token) pnpm changeset version && pnpm install --lockfile-only
   ```

   This reads the files in `.changeset/`, sets the new versions, writes each
   `packages/*/CHANGELOG.md` and deletes the changesets it used. It computes
   each version from the one in the manifest, so a second run bumps again (on
   the first release that gives `0.1.1` or `0.2.0` instead of `0.1.0`). It
   needs `GITHUB_TOKEN` because the changelog names the pull request and the
   author of every change; without it the command stops and changes nothing. It
   also needs `deno` on your `PATH`, which formats the files it writes.

   Read the diff: the versions are what you expect and each changelog entry
   reads well for a user. If a changeset is missing after all, undo the run
   (`git restore .` on the new branch, and `git clean -f packages/*/CHANGELOG.md`
   if a changelog was created), add the changeset and run the command once
   more. Commit, push, open the pull request.

2. **Wait for CI and merge.** The `changeset` check warns "No changeset" on
   this pull request, because it has just consumed them. That is expected.

3. **Watch the `Release` workflow.** The merge changes
   `packages/*/CHANGELOG.md`, which starts it. The jobs are:

   - `tag-published` tags the current version of each package that is live on
     npm and has no tag yet;
   - `plan` asks npm which of the three versions it does not have yet. It
     also refuses a package whose files differ between the commit that set its
     version and the commit the run is on. Only three kinds of file are left
     out of that comparison: the package's `scripts/` directory, and files
     named `*.test.ts` or `*.test.tsx`. Everything else under `packages/<name>/`
     counts, including configuration, test data and shell scripts;
   - `build` runs every check, packs the planned packages and judges the
     tarballs. It records the SHA-256 digest of each tarball;
   - `smoke` installs those tarballs in an empty project on Linux, macOS and
     Windows, x64 and ARM, under Node 22 and 24, on Node 22.12.0, with npm 12
     and under Deno;
   - `stage` checks the tarballs against the digests and their count, then
     hands them to npm as staged versions. It tries every tarball, even after
     npm refuses one.

   Only a push to `main` or a run started by hand on `main` tags and stages.
   A run started on another branch never tags and never stages.

   If `plan`, `build` or `smoke` is red, nothing reached npm. What to do
   depends on the fix:

   - The fix does not touch a counted file of a package in this release (the
     workflow, the lab, a test, a script): merge it, then start the workflow
     by hand on `main` (Actions → Release → Run workflow, branch `main`).
   - The fix changes such a file: the workflow will refuse that version. Add a
     changeset for the fix and make a new version pull request. The number
     that failed is skipped: `0.2.0` never appears and `0.2.1` is the release.
     Its entry stays in `CHANGELOG.md`. If this happens on the first release,
     the first version on npm is `0.1.1`.

   Two habits keep this from happening. Until the versions of a release are
   staged, merge nothing that changes a counted file of a package in that
   release: a run started by hand takes the tip of `main`. And for a failure
   that is not about the code (a network error in one `smoke` leg), use
   "Re-run failed jobs" on the original run, which keeps its commit, instead
   of starting a new run.

4. **Approve on npm, the engine first.** Look at the workflow run and at the
   **Staged Packages** tab on npmjs.com for what is waiting. To look at the
   files of a staged version, download its tarball with
   `npm stage download <stage-id>`. Approve it on npmjs.com (the **Approve**
   button) or on the command line (`npm stage approve <stage-id>`); either way
   npm asks for your second factor. Approve `@fronthub/arrowz-engine` before
   the board and the command line: npm does not enforce the order, and a
   package approved before the engine it depends on cannot be installed until
   the engine is live.

   The commands, as an alternative to the website:

   | Command | What it does |
   |---|---|
   | `npm stage list` | lists the staged versions you have access to |
   | `npm stage view <stage-id>` | shows one staged version |
   | `npm stage download <stage-id>` | downloads its tarball |
   | `npm stage approve <stage-id>` | publishes it (second factor) |
   | `npm stage reject <stage-id>` | removes it for good (second factor) |

   Never approve a staged version you did not start. Reject it and find out
   who did.

5. **Tag.** The `tag-published` job tags each package's current version once
   it is live on npm and has no tag. Nothing is live before you approve, so
   the tags come from the next run of the workflow: the next release, or
   Actions → Release → Run workflow on `main` right after approving. Do it
   right after: if a package is released again before a run has seen the
   earlier version live, the earlier version gets no tag. A tag looks like
   `@fronthub/arrowz-engine@0.1.1` and points at the merge of the version pull
   request.

6. **Check.** `npm view @fronthub/arrowz-engine dist-tags` should show the new
   version as `latest`. A provenance badge linking to the workflow run is
   expected on the package page; that has not been confirmed yet.

## The dry run

A pull request that changes `release.yml`, `release.ts`, `pack-check.ts`, the
consumer smoke or its golden file runs the workflow as a dry run: it plans all
three packages, builds, and runs the whole smoke matrix. It never tags and
never stages. A new push to the pull request cancels the dry run that is still
running. A release run that has started is never cancelled; GitHub keeps only
one waiting run per branch, so a newer run can replace a waiting one, and that
loses nothing because the newer run plans from the same `main`.

## The first release

npm accepts a trusted publisher only for a package that already exists, and a
new trusted-publisher entry expires if its first publish does not succeed
within two days. So the steps below happen on one day, after a rehearsal on a
throwaway package: a one-off run that stages for real. That rehearsal cannot
be made with this workflow as it is (`release.ts` knows three package
directories and `pack-check.ts` refuses any other name), and its procedure is
not written yet. Until it has been done, the items in
[Not yet tried](#not-yet-tried) are unknown.

1. **A placeholder for each package.** In an empty directory outside the
   repository, logged in to npm with your second factor, publish a `0.0.0`
   that holds only a `package.json` (the name, `"version": "0.0.0"`) and a
   `README.md`:

   ```sh
   npm publish --access public
   ```

   Do not publish from `packages/*`: the manifests there also say `0.0.0`
   until the first version pull request, and publishing from them would put
   the real code on npm by hand, with no provenance.

2. **The trusted publisher, for each package.** npmjs.com → the package →
   Settings → Trusted publishing → GitHub Actions:

   | Field | Value |
   |---|---|
   | Organization or user | `Fronthub-pl` |
   | Repository | `arrowz` |
   | Workflow filename | `release.yml` |
   | Environment name | `npm` |
   | Allowed actions | tick nothing (`npm stage publish` is always allowed); if the form insists on one, tick only `npm stage publish`. Never tick `npm publish`. |

   Every field is case-sensitive, and npm checks none of them until the first
   stage. Then, under Settings → Publishing access, choose "Require
   two-factor authentication and disallow tokens" and click **Update Package
   Settings**.

3. **The version pull request.** Make and merge it as in a normal release. It
   takes the three packages from `0.0.0` to `0.1.0`. Approve the three staged
   versions, the engine first.

4. **Retire the placeholders.**

   ```sh
   npm deprecate @fronthub/arrowz-engine@0.0.0 "placeholder"
   npm deprecate @fronthub/arrowz-board@0.0.0 "placeholder"
   npm deprecate @fronthub/arrowz-cli@0.0.0 "placeholder"
   npm dist-tag ls @fronthub/arrowz-engine
   npm dist-tag ls @fronthub/arrowz-board
   npm dist-tag ls @fronthub/arrowz-cli
   ```

   `latest` should be `0.1.0` for each package. Whether the placeholder
   `0.0.0` keeps `latest` has not been tried. If it does, move the tag:
   `npm dist-tag add <name>@0.1.0 latest`.

The workflow never stages or tags `0.0.0`, so starting it before step 3 does
nothing.

## When something goes wrong

| What you see | What it means | What to do |
|---|---|---|
| `plan` fails with `error: npm view did not say whether … is published` | npm did not answer clearly (network, outage) | Run the workflow again later, on `main`. It refuses to guess. |
| `plan` fails with `refused <name>@<version>: <files> changed since <sha> set the version` | A counted file of that package changed after the commit that set its version | Let a release of that version that is still running or waiting for approval finish. Otherwise add a changeset and open a new version pull request. |
| `build` is red | A check or a tarball gate failed; the log names the file or the rule | Fix by pull request, then see step 3 of a normal release. |
| One `smoke` leg is red | The packed files do not work on that system | Fix by pull request. If the log shows a network failure, use "Re-run failed jobs" on the original run. |
| `tag-published` is red (a tag was refused, or the job could not read npm) | It does not stop the release | Approve what is staged as usual, then find the cause in its log and start the workflow again on `main`. |
| `stage` fails with `ENEEDAUTH` | npm did not accept the workflow's identity | Compare the trusted-publisher fields with the table of the first release. If the entry expired (its first publish did not succeed within two days), delete it and create it again; npm does not let you use or edit an expired entry. Then use "Re-run failed jobs", or start the workflow on `main`. |
| `stage` fails with `cannot read the npm version '<version>'` or `npm <version> cannot stage: staged publishing needs 11.15 or newer` | The npm in the job is not one that can stage | Fix `release.yml` by pull request. Nothing was staged. |
| `stage` fails with `the build job handed over no digests` | The `build` job passed an empty list: a fault of the run, not a changed artifact | Nothing was staged. Start the workflow again on `main`. |
| `stage` fails with `the digest list names something that is not one of the three tarballs`, a `FAILED` line from `sha256sum`, or `the artifact holds <n> files, the gates judged <m>` | The artifact was changed after the build, which should never happen | Do not re-run. Nothing was staged. Find out which job touched the artifact before you release again. |
| `stage` fails with `npm did not stage <file>` | npm refused that tarball; the others were still tried | Read npm's message above it. If a staged version of that version number is waiting, approve or reject it. If two staged versions of one version number ever appear, approve one and reject the other. |
| `stage` fails with `<n> of <m> judged tarballs were handed to npm` | A judged tarball was not handed to npm: a fault of the run | Check on npm what is staged, then start the workflow again on `main`. |
| `stage` is red while an earlier staged version of the same version number waits for approval | npm's documentation says a version that already exists as a staged version cannot be staged again; how the command ends has not been tried | Approve or reject the waiting staged version. Nothing else is wrong. |
| `stage` is green and nothing is staged on npm | How `npm stage publish` ends when npm refuses a tarball has not been tried, so this may be the way it ends | Look at the **Staged Packages** tab and at `npm stage list`, and report it. |
| A re-run of `stage` more than 7 days after the build fails | The artifact is deleted after 7 days | Start the workflow again on `main`. |
| You approved the board or the command line before the engine | Installs of it fail until the engine is live | Approve the engine. |
| A staged version holds the wrong files | The gates missed something | Reject it (`npm stage reject <stage-id>`), fix by pull request, release a new patch version. |
| A bad version is live | | `npm deprecate <name>@<version> "<what is wrong, which version to use>"`, then release a fix. Do not unpublish: other packages may already depend on it. |
| The trusted publisher expired or was removed | | Create it again (step 2 of the first release), then use "Re-run failed jobs" or start the workflow on `main`. The release waits only when npm's trusted publishing itself is not working. Never create a token, in either case. |

## Not yet tried

Some of npm's behaviour could only be read in its documentation, or not even
there. These have not been tried:

- the exact error for an already staged version, and how `npm stage publish`
  ends when npm refuses a tarball (the `stage` job relies on a non-zero exit);
- whether a rejected version number can be staged again;
- whether a staged version counts as the first publish for the two-day rule;
- whether the OIDC exchange works with the `.npmrc` that `actions/setup-node`
  writes;
- what `npm view <name>@<version>` answers for a version that is staged and
  not yet approved;
- whether npm runs a lifecycle script when it stages a tarball (the workflow
  passes `--ignore-scripts`, so it does not depend on the answer);
- whether a provenance badge appears after a staged version is approved;
- whether `latest` moves to `0.1.0` although the placeholder `0.0.0` exists.

[publishing-plan.md §10](publishing-plan.md) lists them; the rehearsal on a
throwaway package is meant to settle each one.
