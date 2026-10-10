# Releasing Arrowz

For the maintainer. A release publishes one or more of `@fronthub/arrowz-engine`,
`@fronthub/arrowz-board` and `@fronthub/arrowz-cli` to npm, each at its own
version. The design and its reasons are in [publishing-plan.md](publishing-plan.md).

A release has three parts: you open a version pull request, CI stages the
packages on npm, and you approve each stage on npmjs.com with your second
factor. CI holds no npm token and cannot publish by itself.

## Before the first release

The first release of a package needs a few steps by hand, once. They are in
[The first release](#the-first-release) below; do them before anything else
here works.

## A normal release

1. **Make the version pull request.** On an up-to-date `main`, in a new branch:

   ```sh
   GITHUB_TOKEN=$(gh auth token) pnpm changeset version && pnpm install --lockfile-only
   ```

   This reads the files in `.changeset/`, sets the new versions, writes each
   `packages/*/CHANGELOG.md` and deletes the changesets it used. It needs
   `GITHUB_TOKEN` because the changelog names the pull request and the author
   of every change; without it the command stops and changes nothing. It also
   needs `deno` on your `PATH`, which formats the files it writes.

   Read the diff: the versions are what you expect and each changelog entry
   reads well for a user. Add a changeset for anything a contributor forgot
   (`pnpm changeset`, then run the command again). Commit, push, open the pull
   request.

2. **Wait for CI and merge.** The `changeset` check warns "No changeset" on
   this pull request, because it has just consumed them. That is expected.

3. **Watch the `Release` workflow.** The merge changes
   `packages/*/CHANGELOG.md`, which starts it. The jobs are:

   - `tag-published` tags the current version of each package that is live on
     npm and has no tag yet;
   - `plan` asks npm which of the three versions it does not have yet. It
     also refuses a package whose files changed since the commit that set its
     version (tests and `scripts/` do not count);
   - `build` runs every check, packs the planned packages and judges the
     tarballs. It records the SHA-256 digest of each tarball;
   - `smoke` installs those tarballs in an empty project on Linux, macOS and
     Windows, x64 and ARM, under Node 22 and 24, on Node 22.12.0, with npm 12
     and under Deno;
   - `stage` checks the tarballs against the digests and their count, then
     hands them to npm as staged versions. It tries every tarball, even after
     npm refuses one.

   Only a push to `main` or a run started by hand on `main` tags and stages.

   If a job before `stage` is red, nothing reached npm. What to do depends on
   the fix:

   - The fix does not touch the files of a package in this release (the
     workflow, the lab, a test, a script): merge it, then start the workflow
     by hand on `main` (Actions → Release → Run workflow, branch `main`).
   - The fix changes such a file: the workflow will refuse that version. Add a
     changeset for the fix and make a new version pull request. The number
     that failed is skipped: `0.2.0` never appears and `0.2.1` is the release.

4. **Approve on npm, the engine first.** npm emails you for each staged
   version. On npmjs.com open the package, look at its staged versions and
   their files, and approve with your second factor. Approve
   `@fronthub/arrowz-engine` before the board and the command line: npm does
   not enforce the order, and a package approved before the engine it depends
   on cannot be installed until the engine is live.

   Never approve a stage you did not start. Reject it and find out who did.

5. **Tag.** The `tag-published` job tags each package's current version once
   it is live on npm and has no tag. Nothing is live before you approve, so
   the tags come from the next run of the workflow: the next release, or
   Actions → Release → Run workflow on `main` right after approving. Do it
   right after: if a package is released again before a run has seen the
   earlier version live, the earlier version gets no tag. A tag looks like
   `@fronthub/arrowz-engine@0.1.1` and points at the merge of the version pull
   request.

6. **Check.** `npm view @fronthub/arrowz-engine dist-tags` shows the new
   version as `latest`; the package page shows a provenance badge linking to
   the workflow run.

## Rehearsing a change to the release

A pull request that changes `release.yml`, `release.ts`, `pack-check.ts`, the
consumer smoke or its golden file runs the workflow as a rehearsal: it plans
all three packages, builds, and runs the whole smoke matrix. It never tags and
never stages. A new push to the pull request cancels the rehearsal that is
still running; a release run is never cancelled. Starting the workflow by hand
on another branch is a second way to rehearse: it plans, builds and runs the
smoke, and neither tags nor stages.

## The first release

npm accepts a trusted publisher only for a package that already exists, and a
new trusted-publisher entry stops working if nothing is published through it
within two days. So the steps below happen on one day, after the workflow has
been rehearsed on a throwaway package.

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
   | Allowed actions | none ticked: staging is always allowed, direct publishing stays off |

   Every field is case-sensitive, and npm checks none of them until the first
   stage. Then, under Publishing access, choose "Require two-factor
   authentication and disallow tokens".

3. **The version pull request.** Make and merge it as in a normal release. It
   takes the three packages from `0.0.0` to `0.1.0`. Approve the three stages,
   the engine first.

4. **Retire the placeholders.**

   ```sh
   npm deprecate @fronthub/arrowz-engine@0.0.0 "placeholder"
   npm deprecate @fronthub/arrowz-board@0.0.0 "placeholder"
   npm deprecate @fronthub/arrowz-cli@0.0.0 "placeholder"
   npm view @fronthub/arrowz-engine dist-tags
   ```

   `latest` must be `0.1.0` for each package.

The workflow never stages or tags `0.0.0`, so starting it before step 3 does
nothing.

## When something goes wrong

| What you see | What it means | What to do |
|---|---|---|
| `plan` fails with `error: npm view did not say whether … is published` | npm did not answer clearly (network, outage) | Run the workflow again later, on `main`. It refuses to guess. |
| `plan` fails with `refused <name>@<version>: <files> changed since <sha> set the version` | A file of that package changed after the commit that set its version, so the release would not match the reviewed version | Let a release of that version that is still running or waiting for approval finish. Otherwise add a changeset and open a new version pull request. |
| `build` is red | A check or a tarball gate failed; the log names the file or the rule | Fix by pull request, then see step 3 of a normal release. |
| One `smoke` leg is red | The packed files do not work on that system | Fix by pull request. Re-run the leg alone only if the log shows a network failure. |
| `stage` fails with `ENEEDAUTH` | npm did not accept the workflow's identity | Compare the trusted-publisher fields with the table above. If the entry was created more than two days ago and never used, delete it and create it again; entries cannot be edited. |
| `stage` fails with `the build job handed over no digests`, a `FAILED` line from `sha256sum`, or `the artifact holds <n> files, the gates judged <m>` | The artifact was changed after the build, which should never happen | Do not re-run. Nothing was staged. Find out which job touched the artifact before you release again. |
| `stage` fails with `npm did not stage <file>` for one package, and npm refused it as already staged | The earlier run staged it; the loop went on to the other packages | Nothing. Approve what is staged. |
| `stage` is red while an earlier stage of the same version waits for approval | The waiting stage makes npm refuse the second | Approve or reject the waiting stage. Nothing else is wrong. |
| You approved the board or the command line before the engine | Installs of it fail until the engine is live | Approve the engine. |
| A stage holds the wrong files | The gates missed something | Reject the stage on npm, fix by pull request, release a new patch version. |
| A bad version is live | | `npm deprecate <name>@<version> "<what is wrong, which version to use>"`, then release a fix. Do not unpublish: other packages may already depend on it. |
| The trusted publisher is gone or expired on release day | | The release waits. Do not create a token to get around it. |

Some of npm's behaviour could only be read in its documentation, not tried:
the exact error for an already staged version, whether a rejected version
number can be staged again, whether a stage counts as the first publish for
the two-day rule, whether `npm stage publish` exits with an error when npm
refuses a tarball, whether the OIDC exchange works with the `.npmrc` that
`actions/setup-node` writes, what `npm view <name>@<version>` answers for a
version that is staged and not yet approved, and whether npm runs a lifecycle
script when it stages a tarball. [publishing-plan.md §10](publishing-plan.md)
lists them; the rehearsal on a throwaway package settles each one.
