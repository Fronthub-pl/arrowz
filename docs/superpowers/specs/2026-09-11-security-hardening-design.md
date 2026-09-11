# Security hardening of the lab, the store and the engine — design

Date: 2026-09-11. Branch: `fix/security-hardening`. Source: a read-only audit of
`main` at `3a75a8e` (OWASP Top 10 and OWASP CI/CD Top 10 as the checklist),
with the two Medium findings reproduced by hand.

## Threat model

- **Assets:** the developer's filesystem (the lab server and the CLI hold Deno
  write permission), the board store `packages/cli/boards/`, the lab origin
  `http://localhost:8777` (its localStorage and its API), the CI token, and,
  once the Firebase slice lands, boards that users upload and share.
- **Actors:** a hostile page open in the developer's browser while the lab
  runs, including a page served by another dev server on another localhost
  port; a supply-chain attacker on GitHub Actions; later, another user of the
  app sharing a crafted board.
- **Entry points:** `POST/DELETE /api/boards`, `GET /boards/*` and the static
  files of `packages/cli/lab-server.ts`; board meta files read back by the lab
  page; `toSvg` view options; the CI workflow.

## Findings this branch closes

| ID | Severity | OWASP / CWE | Where | Fix |
|---|---|---|---|---|
| F1 | Medium | A01 / CWE-22, CWE-352 | `lab-server.ts` `checkPost` passes every field but `W`/`H` through; `boardId` puts a string `seed` into a file name, and `join()` resolves its `..` | The server rebuilds params from `PARAM_SPEC` keys and validates them; the engine refuses a fractional width, height or seed; `saveBoard` refuses an id that is not `seed<digits>-<8 hex>` |
| F2 | Medium | A03 / CWE-79 | `lab-page.ts` puts `meta.source`, `meta.id`, error messages into `innerHTML` | Every data value interpolated into markup goes through `escapeHtml`; the server accepts only `source` `lab` or `cli` |
| F3 | Low | A05 / CWE-350, CWE-346 | No `Host` or `Origin` check; the whole of `packages/cli/` is served | Loopback host names only; a write from another origin is refused; POST needs `Content-Type: application/json` (a cross-origin page then needs a CORS preflight the server never grants); only `lab.html`, `dist/` and `boards/` are served |
| F4 | Low | A05 / CWE-16 | No security headers; stored SVG served as a page | `nosniff`, `no-referrer`, `CORP same-origin`, `X-Frame-Options DENY` on every response; a CSP for the lab; `sandbox` CSP on everything under `/boards/`; the server no longer accepts an SVG in a POST (the lab never sends one) |
| F5 | Low | A05 / CWE-250 | Unscoped `--allow-read --allow-write --allow-env` | The lab server gets net on 127.0.0.1, read on its directory and the store, write on the store, one env var; the CLI gets its four env vars by name (its writes stay open: `--svg=path` writes where the user says) |
| F6 | Low | A08, CICD-SEC-3 / CWE-829 | Actions pinned by mutable tags | Pinned by commit SHA of the tag in use today, tag in a comment; Dependabot watches the actions |
| F7 | Low | A04 / CWE-400 | `readBody` unbounded; `toSvg` spreads the highlighted lines into `push`, and `--top` has no ceiling | 16 MiB body cap (413); a loop instead of the spread |
| F8 | Info | A08, CICD-SEC-4 | `.claude/settings.json` hooks and `.mcp.json` run `jbcontext` for whoever trusts the folder | Documented in both READMEs |
| F9 | Info | A04 | `voidFrac` above 1 makes the Carver loop forever (the void target exceeds the cells) | The Carver refuses a `voidFrac` outside `[0, 1)` with a `RangeError`, also on the `unchecked` path |
| F10 | Low | A04 / CWE-20 | `view`, `metrics`, `command`, `simpleCommand` are stored unchecked and read back by the page | Type and bound checks at the server; strings capped at 4096 characters |
| F11 | Info | A05 | No `.gitignore` entries for credentials, ahead of the Firebase slice | `.env`, `.env.*`, `*service-account*.json`, `*serviceAccount*.json` |

## Decisions

- **Params are rebuilt, not passed through.** The server starts from
  `defaultParams()` and copies only `PARAM_SPEC` keys, each a finite number;
  `ruleB`, `voidFrac` and unknown keys never reach the store. Then
  `validateParams` runs, so the store holds only boards the engine would
  generate.
- **Whole numbers are a new envelope rule, `wholeNumbers`** (`W`, `H`, `seed`),
  not a server-only check: the CLI and the lab refuse `--seed=1.5` the same way,
  with a translated reason, and fingerprints do not move (every golden uses
  whole numbers).
- **`voidFrac` is refused in the Carver constructor**, not in
  `validateParams`: the envelope test pins that keys outside `PARAM_SPEC` are
  ignored there, and the params rework will move `voidFrac` out of `Params`.
- **Tools without a browser keep working.** A request with no `Origin` header
  (curl, Deno `fetch` in the tests) passes the origin check; browsers always
  send `Origin` on a POST or DELETE.
- **`escapeHtml` lives in `packages/engine/lab-i18n.ts`**, next to the strings
  it guards, so a Deno test covers it; `lab-page.ts` has no unit tests.
- **The CLI keeps unscoped read and write.** Its user chooses the paths
  (`--svg=path`); no network or other process reaches it.
- **Board output is unchanged.** `fingerprints.test.ts`, `svg-golden.test.ts`
  and `node-smoke.mjs` stay green without edits.

## Out of scope

Recommendations for the Firebase slice (server-side `decodeBoard` and
`validateParams` in an `onCall` function, deny-by-default rules with owner-only
writes and size caps, App Check and rate limits, user SVGs off the app origin)
belong in that slice's plan.
