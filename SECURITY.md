# Security policy

## Reporting a vulnerability

Please report security problems privately, not in a public issue: open the
[**Security** tab](https://github.com/Fronthub-pl/arrowz/security) of this
repository and choose **Report a vulnerability**. Only the maintainers see the
report.

Include what you found, how to reproduce it (a board file, a command or a page
is ideal), and what an attacker could do with it. You will get an answer within
a week; a fix and a public advisory follow once the problem is confirmed.

## What is in scope

- The packages under `packages/`: the engine, the `<arrowz-board>` element and
  the command line, including how they read board files and URLs.
- The local board store (`deno task store`) and the lab, as far as they could
  be reached by another site or another user on the same machine.
- The repository's GitHub Actions workflows.

## Supported versions

Arrowz is in initial development (`0.x`). Fixes go into the latest release of
each package only.
