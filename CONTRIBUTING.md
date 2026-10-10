# Contributing to Arrowz

Thanks for helping. Bug reports, ideas and pull requests are all welcome. For
anything larger than a small fix, open an issue first, so we can agree on the
direction before you spend time on code.

Security problems go privately through [SECURITY.md](SECURITY.md), never in a
public issue.

## What you need

| Tool | Version | For |
|---|---|---|
| [Git](https://git-scm.com/) | any recent | the code |
| [Deno](https://deno.com/) | 2.9 or newer | the engine, the command line and their checks |
| [Node.js](https://nodejs.org/) | 24 or newer | the lab and the board element |
| [pnpm](https://pnpm.io/installation) | any; it runs the version `package.json` pins | the lab and the board element |

Install pnpm with its standalone installer. You do not need Corepack, which
newer Node.js releases no longer ship:

```sh
curl -fsSL https://get.pnpm.io/install.sh | sh -                                        # macOS and Linux
Invoke-WebRequest https://get.pnpm.io/install.ps1 -UseBasicParsing | Invoke-Expression  # Windows (PowerShell)
```

## Setting up

```sh
git clone https://github.com/Fronthub-pl/arrowz.git
cd arrowz
pnpm install
pnpm --filter @fronthub/arrowz-board exec playwright install --with-deps chromium
```

The last line installs the Chromium that the browser tests of the lab and the
board element run in. Changes to the engine or the command line alone need
only Deno; you can skip the rest.

## Checking your change

Run the checks before you open a pull request:

```sh
deno task verify                  # the Deno packages: check, lint, format, test
pnpm nx run-many -t verify        # everything, the lab and the board element included
```

A few things the checks hold you to:

- **Reference boards.** The tests carve reference boards that must come out
  identical, cell for cell. If your change moves one on purpose, say so in the
  pull request.
- **READMEs match the code.** Tests compare each package README with the code
  it describes, so update the README in the same change.
- **Pictures.** The images in the READMEs are drawn from commands listed in
  `docs/images/manifest.json`; `deno task docs` draws them again.

On Windows, `deno task store` (the board store the lab reads) runs a shell
script, so for now it needs Git Bash or WSL.

## Writing the change

The rules for code, comments and language are in [AGENTS.md](AGENTS.md); they
apply to people and coding agents alike. In short:

- Everything in the repository is in English. The lab shows Polish and English,
  and every visible string goes through its dictionary
  (`packages/engine/lab-i18n.ts`).
- Comments say why, once, in the fewest lines. No history in comments: that
  belongs in the commit message and the pull request.
- The engine knows neither Deno nor the DOM, so it runs unchanged in Deno, Node
  and the browser.

How the puzzle and the generator work is in [docs/design.md](docs/design.md),
and the words the lab and the docs use are in [docs/glossary.md](docs/glossary.md).

## Pull requests

- Keep a pull request to one change, and describe what a user or a developer
  notices before and after.
- CI runs the same checks on every pull request. On a first pull request from
  outside the project, a maintainer starts the run after a first look.
- By contributing you agree that your work is published under the
  repository's [MIT licence](LICENSE).
