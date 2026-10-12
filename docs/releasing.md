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
   contributor forgot (`pnpm changeset`), then commit what you added: the
   command deletes every changeset it uses, and an undo restores only what is
   committed. Then run, once:

   ```sh
   GITHUB_TOKEN=$(gh auth token) pnpm changeset version && pnpm install --lockfile-only
   ```

   This reads the files in `.changeset/`, sets the new versions, writes each
   `packages/*/CHANGELOG.md` and deletes the changesets it used. It computes
   each version from the one in the manifest, so a second run bumps again (on
   the first release that gives `0.1.1` or `0.2.0` instead of `0.1.0`). It
   needs `GITHUB_TOKEN` because the changelog names the pull request and the
   author of every change (a changeset you added in this step is not on GitHub
   yet, so its entry names neither); without it the command stops and changes
   nothing. It also needs `deno` on your `PATH`, which formats the files it
   writes.

   Read the diff: the versions are what you expect and each changelog entry
   reads well for a user. If a changeset is missing after all, undo the run
   (`git restore .` on the new branch, and `git clean -f packages/*/CHANGELOG.md`
   if a changelog was created), add the changeset, commit it and run the
   command once more. Commit, push, open the pull request.

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

   - The fix touches no counted file of a package in this release (the
     workflow, the lab, or a file in a package's `scripts/` directory or a
     `*.test.ts` / `*.test.tsx` file; a shell script beside the sources or test
     data does count): merge it, then start the workflow
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
   `npm stage download <stage-id>` (`npm stage list` lists the staged
   versions). Approve it on npmjs.com (the **Approve**
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
   who did. The log of the `stage` job has the line
   `+ <name>@<version> (staged with id <stage-id>)`, and
   `npm stage view <stage-id>` shows
   `staged by: GitHub Actions (trusted automation)` and the shasum the
   `stage` step printed.

   Approve or reject every staged version of a release before you merge the
   next version pull request or start the workflow again. To `npm view`, a
   version that is staged and not yet approved does not exist (`E404`), so a
   run in that time plans the same version again, and its `stage` is red with
   `E409`; [When something goes wrong](#when-something-goes-wrong) has the
   row.

5. **Tag.** The `tag-published` job tags each package's current version once
   it is live on npm and has no tag. Nothing is live before you approve, so
   the tags come from the next run of the workflow: the next release, or
   Actions → Release → Run workflow on `main` right after approving. Do it
   right after: if a package is released again before a run has seen the
   earlier version live, the earlier version gets no tag. Do it also before
   you merge anything that changes a file under `.github/workflows/` (a
   Dependabot bump of an action counts): GitHub refuses the workflow's push
   of a tag when a workflow file differs between the commit that set the
   version and the commit the run is on. A tag looks like
   `@fronthub/arrowz-engine@0.1.1` and points at the merge of the version pull
   request.

   Then read the log of `tag-published` in that run. For each tag it made, it
   has a line that starts with `tagged`:

   ```
   tagged @fronthub/arrowz-engine@0.1.1 at 1a2b3c4
   ```

   If it says `no version went live since the last run` instead, that run did
   not find the version on npm. A run that asks before the approval finds
   nothing (`E404`); it also plans that version again, builds it and hands it
   to npm, and its `stage` is red with `E409`, which means only that npm
   refused a version that is already staged. Approve what is still waiting,
   then start the workflow again.

   If `tag-published` is red and its log has a line that starts with
   `not tagged`, the log ends with the command to run from a checkout, and the
   table below has the row.

6. **Check.** `npm view @fronthub/arrowz-engine dist-tags` shows the new
   version as `latest`. `npm view @fronthub/arrowz-engine@0.1.1 dist --json`
   lists `dist.attestations`, with `provenance.predicateType` set to
   `https://slsa.dev/provenance/v1`. Whether the package page shows a
   provenance badge has not been tried.

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
within two days. At its first stage an entry turns from "Pending validation"
to "Valid"; whether a valid entry can still expire has not been tried, so the
steps below happen on one day. The whole flow was rehearsed on a throwaway
package in `Fronthub-pl/arrowz-rehearsal`, whose
[README](https://github.com/Fronthub-pl/arrowz-rehearsal) records what was
seen.

Before step 1, confirm one GitHub setting: Settings → Environments → `npm` →
**Deployment branches and tags** allows the branch `main` and nothing else. If
it allows more, restrict it to `main` before going on. It is what stops an
edited copy of the workflow on another branch from getting the identity npm
trusts.

1. **Create each package.** For each of the three packages, in a new empty
   directory outside the repository, make a `package.json` that holds only
   the name and `"version": "0.0.0"`, and a `README.md`. Logged in to npm with
   your second factor, pack it, stage the tarball and reject it:

   ```sh
   npm pack
   npm stage publish ./fronthub-arrowz-engine-0.0.0.tgz --access public
   npm stage reject <stage-id>
   npm stage list @fronthub/arrowz-engine
   ```

   The other two tarballs are `fronthub-arrowz-board-0.0.0.tgz` and
   `fronthub-arrowz-cli-0.0.0.tgz`. `npm stage publish` ends with
   `+ @fronthub/arrowz-engine@0.0.0 (staged with id <stage-id>)`: that is the
   id to reject. Afterwards `npm stage list` prints
   `No staged versions of package name "@fronthub/arrowz-engine".`

   Start the path with `./`: npm takes `dir/file.tgz` for a GitHub repository.
   The stage creates the package, with a holding version `0.0.0-stage` of
   npm's own that holds `latest`. npmjs.com shows the package at once, but
   `npm view` answers 404 for it for some minutes. After the rejection the
   package and `0.0.0-stage` stay, and its Settings page offers Trusted
   Publisher and Publishing access. Nothing is published by hand.

   Do not stage from `packages/*`: the manifests there also say `0.0.0` until
   the first version pull request, so that would stage the real code as
   `0.0.0`, and an approval by mistake would put it on npm by hand, with no
   provenance.

2. **The trusted publisher, for each package.** npmjs.com → the package →
   Settings → Trusted Publisher → GitHub Actions:

   | Field | Value |
   |---|---|
   | Label | leave empty |
   | Organization or user | `Fronthub-pl` |
   | Repository | `arrowz` |
   | Workflow filename | `release.yml` |
   | Environment name | `npm` |
   | Allowed actions | The form says `npm stage publish` is always allowed, and offers "Allow npm publish" and "Allow npm dist-tag", both unticked. Leave both unticked. With staging only, npm refuses `npm publish` from the workflow with `E403`. |

   Every field is case-sensitive, and npm checks none of them until the first
   stage. A new entry shows "Pending validation" until the first stage through
   it, then "Valid". The provider and the required fields cannot be changed
   once the entry is created: delete it and create it again. The environment
   name can be edited afterwards. Then, under Settings → Publishing
   access, choose "Require two-factor authentication and disallow bypass 2fa
   tokens (recommended)", which is not the default, and click **Update Package
   Settings**.

3. **The version pull request.** Make and merge it as in a normal release. It
   takes the three packages from `0.0.0` to `0.1.0`. Approve the three staged
   versions, the engine first. Then tag and check as in steps 5 and 6 of a
   normal release, before anything else is merged.

4. **Check `latest`.**

   ```sh
   npm dist-tag ls @fronthub/arrowz-engine
   npm dist-tag ls @fronthub/arrowz-board
   npm dist-tag ls @fronthub/arrowz-cli
   ```

   `latest` is `0.1.0` for each package: it moves from `0.0.0-stage` by
   itself, and `0.0.0-stage` stays in the list of versions.

The workflow never stages or tags `0.0.0`, so starting it before step 3 does
nothing.

## When something goes wrong

| What you see | What it means | What to do |
|---|---|---|
| `plan` fails with `error: npm view did not say whether … is published` | npm did not answer clearly (network, outage) | Run the workflow again later, on `main`. It refuses to guess. |
| `plan` fails with `refused <name>@<version>: <files> changed since <sha> set the version` | A counted file of that package changed after the commit that set its version | Let a release of that version that is still running or waiting for approval finish. Otherwise add a changeset and open a new version pull request. |
| `build` is red | A check or a tarball gate failed; the log names the file or the rule | Fix by pull request, then see step 3 of a normal release. |
| One `smoke` leg is red | The packed files do not work on that system | Fix by pull request. If the log shows a network failure, use "Re-run failed jobs" on the original run. |
| Every `smoke` leg is red at `FAIL Vite bundles the element of the board package`, and the checks above that line are `ok`, among them `the engine lays the golden 40×40 board …` and `arrowz carve names the golden layout …` | The smoke installs the newest Vite 8, and that release may be at fault, not the packages | Read Vite's error in the log. If the fault is Vite's, wait for its fix and use "Re-run failed jobs", or pin a Vite version in `consumer-smoke.mjs` by pull request, merge it and start the workflow by hand on `main`. |
| `tag-published` is red (the job could not read npm, or a tag was refused for a reason other than the next row) | It does not stop the release. Every tag that was due was still tried | Approve what is staged as usual, then find the cause in its log and start the workflow again on `main`. |
| `tag-published` is red with `not tagged <name>@<version>: <files> changed since <sha7> set the version, and the workflow's token cannot push a tag across a workflow change` | The workflow files the line names differ between the commit that set the version and the commit the run is on, and GitHub refuses the workflow's token a tag on such a commit. The line above it is git's own message (``refusing to allow a GitHub App to create or update workflow`` … ``without `workflows` permission``), which may name another workflow file. Starting the workflow again does not help | Approve what is staged as usual. In the repository root, on an up-to-date `main` whose `origin` is this repository, with `deno` and `npm` on your `PATH`, run the command the log ends with: `deno run --allow-read --allow-run --allow-env packages/engine/scripts/release.ts tags`. It pushes the tag with your own git credentials and prints `tagged <name>@<version> at <sha7>`. This worked over HTTPS with the credential of `gh`, whose token has the `workflow` scope; a credential without that scope has not been tried. |
| `stage` fails with `npm error code E401` and `Unable to authenticate, your authentication token seems to be invalid.` | npm did not accept the workflow's identity: the package does not exist on npm yet and so has no trusted publisher, or a field of the trusted publisher is wrong. The log is the same for both. What an expired entry prints has not been tried | If the package does not exist on npm yet, do steps 1 and 2 of the first release. Otherwise compare the trusted-publisher fields with the table of the first release; to correct a wrong field, edit the entry if it is the environment name, and otherwise delete the entry and create it again. If the entry expired (its first publish did not succeed within two days), delete it and create it again; npm does not let you use or edit an expired entry. Then use "Re-run failed jobs" (the run keeps its tarballs for 7 days), or start the workflow on `main`. A re-run is red with `E409` for every package the first attempt staged; look in the log for `+ <name>@<version> (staged with id …)` for the others. |
| `stage` fails with `npm error code E403` and `403 Forbidden - PUT https://registry.npmjs.org/<name> - OIDC permission denied for this action` (the name appears as `@fronthub%2farrowz-engine`) | The job ran `npm publish`, and the trusted publisher allows staging only. Nothing was published | Fix `release.yml` by pull request: the job must run `npm stage publish`. Do not tick "Allow npm publish". |
| `stage` fails with `cannot read the npm version '<version>'` or `npm <version> cannot stage: staged publishing needs 11.15 or newer` | The npm in the job is not one that can stage | Fix `release.yml` by pull request. Nothing was staged. |
| `stage` fails with `the build job handed over no digests` | The `build` job passed an empty list: a fault of the run, not a changed artifact | Nothing was staged. Start the workflow again on `main`. |
| `build` fails with `the digest list names something that is not one of the three tarballs` | The `build` job wrote a line into its own list that it should not have: a fault in the workflow. Nothing was uploaded for staging | Do not re-run. Fix `release.yml` by pull request. |
| `stage` fails with `the digest list names something that is not one of the three tarballs` | The list changed between the two jobs, which should never happen: `build` applies the same check to it before it can succeed. Nothing was staged | Do not re-run. Find out what changed the list before you release again. |
| `build` fails with `the tarballs do not match their digests` or `the artifact holds <n> files, the gates judged <m>` | The digests could not be read back: a fault of the workflow. Nothing was uploaded for staging | Fix `release.yml` by pull request. |
| `stage` fails with `the tarballs do not match their digests` (preceded by a `FAILED` line from `sha256sum`) or `the artifact holds <n> files, the gates judged <m>` | The artifact was changed after the build, which should never happen | Do not re-run. Nothing was staged. Find out which job touched the artifact before you release again. |
| `stage` fails with `npm did not stage <file>` | npm refused that tarball; the others were still tried | Read npm's message above it. If a staged version of that version number is waiting, approve or reject it. |
| `stage` fails with `<n> of <m> judged tarballs were handed to npm` | A judged tarball was not handed to npm: a fault of the run | Check on npm what is staged, then start the workflow again on `main`. |
| `stage` fails with `npm error code E409` and `409 Conflict - POST https://registry.npmjs.org/-/stage/package/<name> - Cannot stage previously published version "<version>".` (the name appears as `@fronthub%2farrowz-engine`) | That version is already staged and waits for approval (the message says "previously published"). A run started before the approval planned it again, or a re-run handed npm a tarball it had already staged | Approve or reject the waiting staged version. Nothing else is wrong. |
| A re-run of `stage` more than 7 days after the build fails | The artifact is deleted after 7 days | Start the workflow again on `main`. |
| You approved the board or the command line before the engine | Installs of it fail until the engine is live | Approve the engine. |
| A staged version holds the wrong files | The gates missed something | Reject it (`npm stage reject <stage-id>`), fix by pull request. If the fix changes no counted file, start the workflow again on `main`: a rejected version number can be staged again. Otherwise release a new patch version. |
| A bad version is live | | `npm deprecate <name>@<version> "<what is wrong, which version to use>"`, then release a fix. Do not unpublish: other packages may already depend on it. |
| The trusted publisher expired or was removed | | If it expired, delete it first; then create it again (step 2 of the first release), then use "Re-run failed jobs" or start the workflow on `main`. The release waits only when npm's trusted publishing itself is not working. Never create a token, in either case. |

## Not yet tried

Some of npm's behaviour could only be read in its documentation, or not even
there. These have not been tried:

- whether a trusted-publisher entry that shows "Valid" after its first stage
  still expires after two days without an approval;
- whether a provenance badge appears after a staged version is approved.

[publishing-plan.md §10](publishing-plan.md) lists them.

A release on an older line (for example `0.1.4` after `0.2.0` is `latest`), or
of a pre-release version, has not been tried either. npm's documentation says
`npm stage publish` stops with an error for such a version unless it is given
a tag. The workflow gives none, so such a release needs a change to the
workflow first.
