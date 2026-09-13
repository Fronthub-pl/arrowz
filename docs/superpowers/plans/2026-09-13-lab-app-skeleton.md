# Lab application skeleton (PR 2) Implementation Plan

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:subagent-driven-development (recommended) or superpowers:executing-plans to implement this plan task-by-task. Steps use checkbox (`- [ ]`) syntax for tracking.

**Goal:** Stand up `apps/lab` as a Vite + React project that enters both gates, carries the design system's tokens, routes, reaches the board store through a proxy, and walks one path end to end — press Generate, watch a worker carve, draw the board in `<arrowz-board>`, save it to the store.

**Architecture:** The application is assembled bottom-up in twelve tasks, each of which leaves the repository green. The project joins Nx before it has any behaviour (Task 1), acquires its own linter (Task 2), then routes (Task 4), a shell (Task 5), a store client (Task 6), a run state machine (Task 7), a worker (Task 8), a board (Task 9), and only then the path that ties them together (Task 10). Two tasks exist purely to stop something from silently rotting: Task 3 adds the dictionary keys the third tab needs on the Deno side, and Task 11 gives the Vite-served worker the parity test that `lab-bundle.test.ts` gives the Deno-bundled one.

**Tech Stack:** Vite 8, React 19, React Router 8 (declarative mode), Zustand 5, `@lit/react`, Vitest 5 with a Node project and a Playwright Chromium browser project, ESLint 10 flat config with `typescript-eslint`, `eslint-plugin-react-hooks` and `eslint-plugin-jsx-a11y`, Prettier 3.9, Nx 23, pnpm 12, Node 24.

**Spec:** `docs/superpowers/specs/2026-09-13-lab-react-app-design.md` (§3, §4.3, §4.4, §5.1, §5.3, §6, §7.1, §8, §9, §10 row "2"). **This plan overturns §9.1 of that spec on measured evidence** — see Ruling 8.

## Global Constraints

- Everything in the repository is in English: code, identifiers, comments, tests, documentation, branch names, commit messages, PR titles and descriptions. Conversation with the user is Polish; nothing Polish goes into files except translation dictionaries.
- No `any`, no non-null assertions — in `apps/lab` these are ESLint rules, since `deno lint` does not read `apps/`.
- `deno.json` excludes `apps/` from `fmt`, `lint`, `test` and type checking, and **stays that way**. `apps/lab` is formatted by Prettier and linted by ESLint.
- **Every task runs `pnpm --filter @arrowz/lab exec prettier --write .` before its commit.** `fmt` is `prettier --check .`, and the code blocks in this plan are hand-formatted; pasting one literally and committing turns `fmt` red. Format first, then verify, then commit.
- Prettier matches the repository's `deno fmt` settings: no semicolons, single quotes, print width 120. A reviewer moving between `packages/` and `apps/` must not meet a different dialect.
- `packages/engine/dist/` and `packages/board-element/dist/` are gitignored and produced by `pnpm nx build engine` / `pnpm nx build board-element`. Every `apps/lab` target that compiles or runs code carries `dependsOn: ["^build"]`.
- `apps/lab` depends on `@arrowz/engine` and `@arrowz/board-element` **by package name**, never by relative path, and never on the engine's `.ts` sources.
- `apps/lab` pins the **same `vite`, `vitest`, `@vitest/browser-playwright` and `playwright` versions as `packages/board-element`** so CI's cached Chromium is shared. CI installs the browser with `pnpm --filter @arrowz/board-element exec playwright install --with-deps chromium`; a different version would download a second one on every run.
- `pnpm nx run-many -t verify` must be green before the PR, and `deno task verify` must stay green (Task 3 is the only task that touches Deno-side code).
- Never spread arrays proportional to the number of cells or pieces (`Math.min(...arr)`) — it overflows the worker stack in Chrome.
- No attribution lines in commit messages or pull request descriptions.
- Branch: `lab/app-skeleton`, stacked on `lab/logic-extraction` (PR #63). The pull request is opened with `--base lab/logic-extraction`; when #63 merges, retarget with `gh pr edit --base main`.

## Rulings I made

The spec does not decide these, and an implementer who guesses differently produces work that PR 3 has to undo.

1. **Texts come from the dictionary from the first commit, through one hook.** `src/i18n.ts` exports `useDictionary()`, which returns `dictionary('en')` today and reads the `lang` slice in PR 4. Every component calls the hook; nobody holds a module-level `const dict`, because a module constant cannot react to a language change and PR 4 would have to rewrite each one.
2. **PR 2 introduces the Zustand store with exactly one slice, `run`.** `useGenerator` is mounted in `App` and read in the lab panel; without a store the state would travel by props through the router, and PR 3 would rewrite it. The other six slices of §5.3 stay unwritten.
3. **`run.slice` holds no history in PR 2.** History exists for the filmstrip, which is PR 7. The state machine is written so that adding history is an addition, not a change.
4. **The three routes exist from Task 4, two of them as a heading and a paragraph.** A tab strip with a dead tab cannot be tested; a tab strip whose third tab reaches an empty panel can.
5. **The lab panel is never unmounted; the route decides whether it is visible.** `<arrowz-board>`'s `disconnectedCallback` disposes the GL layer in a microtask (`packages/board-element/src/arrowz-board.ts:328-341`), and `useGenerator`'s cleanup terminates the worker. Both are mounted in `App`, outside `<Routes>`, and the lab panel carries `hidden` when the path is not `/`. The route table therefore maps `/` to `element={null}` — the lab is already on screen. This is the arrangement §5.1 and §6 ask for; the spec's own file name (`routes/LabRoute.tsx`) is kept so the two documents still line up.
6. **`AppRoutes` is separated from `App`.** `App` owns `<BrowserRouter>`, `useGenerator`, the board and the save effect; `AppRoutes` owns `<Routes>`. Browser tests wrap the pieces in `<MemoryRouter>`; nothing else can test routing without touching the address bar.
7. **The dev server listens on 8779.** `lab-server.ts` holds 8777 and `board-element`'s demo holds 8778.
8. **The proxy sets a target and nothing else — no `changeOrigin`, no `proxyReq` hook.** Spec §9.1 asks for a hook that rewrites `Origin`; measured against Vite 8.2.2 and the server's own refusal rule (`lab-server.ts:66-79`), the hook is only needed *because* `changeOrigin` would be set, and `changeOrigin` is not needed at all. Three variants, one echo upstream computing `new URL(req.url, 'http://' + host)` exactly as `Deno.serve` does, one caller sending the header pair a browser tab sends:

   | proxy options | upstream `Host` | upstream `Origin` | server's `url.origin` | refused? |
   |---|---|---|---|---|
   | `{ target }` | `localhost:8796` | `http://localhost:8796` | `http://localhost:8796` | **no** |
   | `{ target, changeOrigin: true }` | `127.0.0.1:8795` | `http://localhost:8797` | `http://127.0.0.1:8795` | **yes, 403** |
   | `{ target, changeOrigin: true, configure: hook }` | `127.0.0.1:8795` | `http://127.0.0.1:8795` | `http://127.0.0.1:8795` | no |

   Without `changeOrigin` the client's `Host` is forwarded unchanged, so the origin the server derives from it is the origin the browser declares, and they agree by construction. `localhost` is in `LOCAL_HOSTS` (`lab-server.ts:60`), so the rebinding guard passes too. The simplest configuration is also the correct one; §9.1 is wrong about the necessity, right about the mechanism.
9. **Task 11 proves parity through Vite's *transform*, not through `vite build`.** In browser mode the worker is served as transformed modules; rollup, minification and `sideEffects: false` never run. That is still worth pinning — a wrong alias or a dropped subpath export shows up here — but it is not the whole of what `lab-bundle.test.ts` proves. A parity test over the **built** artefact is a listed prerequisite of PR 8 and is recorded in Task 12, Step 6 rather than smuggled in here under a name it does not earn.
10. **`types: []` in `tsconfig.json`.** Only the integration test needs Node's globals, and it says so itself with a triple-slash reference. A project-wide `types: ["node"]` would make `process`, `Buffer` and `__dirname` type-visible in browser code, which the ESLint import ban does not cover.

## File structure after this PR

```
apps/lab/
  package.json              deps, scripts (check, lint, fmt, test, build, serve)
  project.json              the Nx targets, shaped like board-element's
  tsconfig.json             strict, bundler resolution, react-jsx
  index.html                the Vite entry
  vite.config.ts            react plugin, port 8779, the proxy
  vite.proxy.ts             the proxy table, importable by the integration test
  vitest.config.ts          three projects: node, node-integration, chromium
  vitest.setup.ts           imports vitest-browser-react's types and cleanup
  eslint.config.js          flat config: js, typescript-eslint, react-hooks, jsx-a11y
  .prettierrc.json          no semicolons, single quotes, width 120
  .prettierignore           dist
  src/
    vite-env.d.ts           /// <reference types="vite/client" />
    main.tsx                mount
    i18n.ts                 useDictionary() — one call site for PR 4
    App.tsx                 BrowserRouter, useGenerator, the lab panel, the save effect
    AppRoutes.tsx           <Routes>, testable without the address bar
    shell/
      TopBar.tsx            mark, name, dims, right group
      TabRow.tsx            role="tablist", arrow keys, Home/End, aria-controls
    routes/
      LabRoute.tsx          the run bar and the stage; always mounted, `hidden` off-route
      SavedBoardsRoute.tsx  heading and a paragraph (PR 5 fills it)
      DocsRoute.tsx         heading and a paragraph (PR 6 fills it)
    stage/
      Stage.tsx             70px + 1fr, the board frame
      BoardCanvas.tsx       createComponent(<arrowz-board>) — the only @lit/react site
      RunStatusBar.tsx      the live region: phase, progress, store outcome
    state/
      store.ts              the Zustand store
      run.slice.ts          idle | running | done | error
      run.slice.test.ts
    worker/
      generate.worker.ts    imports @arrowz/engine, speaks WorkerIn/WorkerOut
      useGenerator.ts       one long-lived worker, replace-by-terminate
      parity.browser.test.ts
    api/
      boards.ts             GET / POST against the store
      boards.node.test.ts   against a live lab-server behind a live Vite proxy
    design/
      tokens.css            14 colour tokens + 2 font tokens
      tokens.test.ts        pins exactly those sixteen
      shell.css             the ported shell rules of §7.1
```

Files this PR modifies outside `apps/lab`: `packages/engine/lab-i18n.ts` and its test (Task 3), `README.md` and `README.pl.md` (Task 12). Nothing in `packages/cli` changes; the old lab keeps working until PR 8.

---

### Task 1: The project enters both gates

An empty React application that Nx can `check`, `test`, `build` and `verify`, carrying the design system's tokens and one test that pins them. The token test is not ceremony: §7.1 drops two of the mock's eighteen custom properties, and nothing but a test remembers that.

**Files:**
- Create: `apps/lab/package.json`, `apps/lab/project.json`, `apps/lab/tsconfig.json`, `apps/lab/index.html`, `apps/lab/vite.config.ts`, `apps/lab/vitest.config.ts`
- Create: `apps/lab/src/vite-env.d.ts`, `apps/lab/src/main.tsx`, `apps/lab/src/App.tsx`, `apps/lab/src/design/tokens.css`
- Test: `apps/lab/src/design/tokens.test.ts`

**Interfaces:**
- Consumes: nothing
- Produces: the package name `@arrowz/lab`, the Nx project name `lab`, `export function App(): JSX.Element`

- [ ] **Step 1: Create the package and install the dependencies**

```bash
cd /Users/tomek/dev/arrowz
mkdir -p apps/lab/src/design

cat > apps/lab/package.json <<'JSON'
{
  "name": "@arrowz/lab",
  "version": "1.0.0-alpha.1",
  "private": true,
  "type": "module",
  "scripts": {
    "check": "tsc -p tsconfig.json --noEmit",
    "test": "vitest run",
    "build": "vite build",
    "serve": "vite"
  }
}
JSON

pnpm --filter @arrowz/lab add @arrowz/engine@workspace:* @arrowz/board-element@workspace:*
pnpm --filter @arrowz/lab add react react-dom
pnpm --filter @arrowz/lab add -D @vitejs/plugin-react @types/react @types/react-dom @types/node typescript
```

Four versions must match `packages/board-element` exactly. Print them and install those ranges verbatim:

```bash
node -e "const d=require('./packages/board-element/package.json').devDependencies;console.log(['vite','vitest','playwright','@vitest/browser-playwright'].map(k=>k+'@'+d[k]).join(' '))"
pnpm --filter @arrowz/lab add -D <the four printed specifiers>
```

`@types/node` is a dev dependency for the integration test of Task 6 only; `tsconfig.json` keeps `types: []` (Ruling 10) and that one file asks for the types itself.

- [ ] **Step 2: Write the failing test**

Create `apps/lab/src/design/tokens.test.ts`:

```ts
import { expect, test } from 'vitest'
import tokens from './tokens.css?raw'

const declared = [...tokens.matchAll(/^\s*(--[\w-]+):/gm)].map((m) => m[1])

// The mock declares eighteen custom properties. Spec §7.1 keeps sixteen:
// fourteen colours and two fonts, in the mock's order.
test('tokens.css declares the sixteen tokens the spec keeps, in order', () => {
  expect(declared).toEqual([
    '--void',
    '--graphite',
    '--surface',
    '--border',
    '--border-strong',
    '--ash',
    '--mist',
    '--ink',
    '--paper',
    '--signal',
    '--signal-hover',
    '--signal-press',
    '--warn',
    '--error',
    '--ui',
    '--mono',
  ])
})

// Declared by the mock and never used by it. Copying them would import two
// dead names into a design system that is about to be extended.
test('the two unused tokens of the mock are not ported', () => {
  expect(declared).not.toContain('--ok')
  expect(declared).not.toContain('--signal-soft')
})
```

- [ ] **Step 3: Run the test to verify it fails**

Create `apps/lab/vitest.config.ts` first, or Vitest has nothing to collect:

```ts
import { defineConfig } from 'vitest/config'

// Task 4 adds the node-integration and chromium projects beside this one.
export default defineConfig({
  test: {
    projects: [
      {
        test: {
          name: 'node',
          environment: 'node',
          include: ['src/**/*.test.ts', 'src/**/*.test.tsx'],
          exclude: ['src/**/*.browser.test.ts', 'src/**/*.browser.test.tsx', 'src/**/*.node.test.ts'],
        },
      },
    ],
  },
})
```

Run: `pnpm --filter @arrowz/lab exec vitest run`
Expected: FAIL — `Failed to resolve import "./tokens.css?raw"`.

- [ ] **Step 4: Write the tokens**

Create `apps/lab/src/design/tokens.css`. These values are the port's source of truth: the mock lives in the Claude Design project "Arrowz workshop", not in this repository, so nothing here can be diffed against it later.

```css
/* The Fronthub design system's tokens as the workshop mock declares them,
   minus `--ok` and `--signal-soft`, which the mock declares and never uses.
   `--error` and `--border-strong` are the opposite case: used by the mock,
   absent from the design system's own token list, and flagged there rather
   than resolved here (spec §7.1).

   Dark is the only theme, radius is zero everywhere except the switch and the
   ready dot, `--signal` carries state and data only, and `--warn` is reserved
   for a clamped value or a rule bound. */
.fw {
  --void: #0e0f12;
  --graphite: #16171b;
  --surface: #1c1f24;
  --border: #2a2c33;
  --border-strong: #3a3e47;
  --ash: #8a8f99;
  --mist: #a9aeb8;
  --ink: #edeef2;
  --paper: #f4f5f8;
  --signal: #5e6ad2;
  --signal-hover: #6f7adb;
  --signal-press: #4c57be;
  --warn: #d9a038;
  --error: #de5c4e;
  --ui: Archivo, Helvetica, Arial, sans-serif;
  --mono: 'JetBrains Mono', ui-monospace, monospace;
}
```

- [ ] **Step 5: Write the rest of the skeleton**

`apps/lab/src/vite-env.d.ts`:

```ts
/// <reference types="vite/client" />
```

`apps/lab/tsconfig.json`:

```json
{
  "compilerOptions": {
    "strict": true,
    "noUncheckedIndexedAccess": true,
    "exactOptionalPropertyTypes": true,
    "module": "esnext",
    "moduleResolution": "bundler",
    "target": "es2022",
    "lib": ["es2022", "dom", "dom.iterable"],
    "types": [],
    "jsx": "react-jsx",
    "noEmit": true,
    "skipLibCheck": true,
    "verbatimModuleSyntax": true,
    "isolatedModules": true,
    "noUnusedLocals": true,
    "noUnusedParameters": true
  },
  "include": ["src", "vite.config.ts", "vite.proxy.ts", "vitest.config.ts", "vitest.setup.ts"]
}
```

`include` already names `vite.proxy.ts` (Task 6) and `vitest.setup.ts` (Task 4); listing a file that does not exist yet is not an error, and adding them later is a step everyone forgets. `moduleResolution: "bundler"` rather than `board-element`'s `nodenext`: this project is bundled by Vite rather than emitted by `tsc`, and `bundler` reads `@arrowz/engine`'s `exports` map without demanding file extensions in every import.

`apps/lab/index.html`:

```html
<!doctype html>
<html lang="en">
  <head>
    <meta charset="utf-8" />
    <meta name="viewport" content="width=device-width, initial-scale=1" />
    <title>Arrowz lab</title>
  </head>
  <body>
    <div id="root"></div>
    <script type="module" src="/src/main.tsx"></script>
  </body>
</html>
```

`apps/lab/vite.config.ts` (the proxy arrives in Task 6):

```ts
import react from '@vitejs/plugin-react'
import { defineConfig } from 'vite'

export default defineConfig({
  plugins: [react()],
  // 8777 is the lab server, 8778 is the board element's demo.
  server: { port: 8779 },
  build: { target: 'es2022' },
})
```

`apps/lab/src/App.tsx`:

```tsx
export function App() {
  return <div className="fw" />
}
```

`apps/lab/src/main.tsx`:

```tsx
import { StrictMode } from 'react'
import { createRoot } from 'react-dom/client'
import { App } from './App'
import './design/tokens.css'

const root = document.getElementById('root')
// A missing mount point is a broken index.html, not a runtime condition to
// paper over: failing here names the cause.
if (!root) throw new Error('#root is missing from index.html')

createRoot(root).render(
  <StrictMode>
    <App />
  </StrictMode>,
)
```

- [ ] **Step 6: Run the test to verify it passes**

Run: `pnpm --filter @arrowz/lab exec vitest run`
Expected: PASS, 2 tests.

- [ ] **Step 7: Add the Nx project**

`apps/lab/project.json`:

```json
{
  "$schema": "../../node_modules/nx/schemas/project-schema.json",
  "name": "lab",
  "projectType": "application",
  "sourceRoot": "apps/lab/src",
  "targets": {
    "check": {
      "executor": "nx:run-commands",
      "dependsOn": ["^build"],
      "options": { "cwd": "apps/lab", "command": "pnpm run check" }
    },
    "test": {
      "executor": "nx:run-commands",
      "dependsOn": ["^build"],
      "parallelism": false,
      "options": { "cwd": "apps/lab", "command": "pnpm run test" }
    },
    "build": {
      "executor": "nx:run-commands",
      "dependsOn": ["^build"],
      "options": { "cwd": "apps/lab", "command": "pnpm run build" }
    },
    "serve": {
      "executor": "nx:run-commands",
      "cache": false,
      "dependsOn": ["^build"],
      "options": { "cwd": "apps/lab", "command": "pnpm run serve" }
    },
    "verify": { "executor": "nx:noop", "dependsOn": ["check", "test", "build"] }
  }
}
```

`lint` and `fmt` join `verify` in Task 2. `serve` carries `dependsOn: ["^build"]` explicitly because `nx.json`'s default puts it on `build` alone, and a fresh clone has no `packages/engine/dist/`. `test` carries `"parallelism": false` because `board-element`'s `vitest.config.ts` records that its timing-sensitive browser tests already fail when they merely share one software renderer; two Chromiums on a two-core CI runner is a condition nobody has measured, and this project's tests carve real boards.

- [ ] **Step 8: Verify the project through Nx**

Run: `pnpm nx run-many -t verify --projects=lab`
Expected: `check`, `test` and `build` pass. If `check` fails on an unresolved `@arrowz/engine`, run `pnpm nx build engine` and check that `apps/lab/node_modules/@arrowz/engine` links to `packages/engine`.

- [ ] **Step 9: Commit**

```bash
pnpm --filter @arrowz/lab exec prettier --write .
git add apps/lab pnpm-lock.yaml
git commit -m "Stand up apps/lab with the design system's tokens"
```

---

### Task 2: The project's own linter and formatter

`deno lint` and `deno fmt` do not read `apps/`, so the two rules the repository cares about most — no `any`, no non-null assertions — are unenforced here until ESLint arrives. `jsx-a11y` is here for the reason the spec states plainly: the mock has nine classes of accessibility gap, and the port must not inherit them.

**Files:**
- Create: `apps/lab/eslint.config.js`, `apps/lab/.prettierrc.json`, `apps/lab/.prettierignore`
- Modify: `apps/lab/package.json` (scripts, devDependencies), `apps/lab/project.json` (`lint`, `fmt`, `verify`)

**Interfaces:**
- Consumes: the project of Task 1
- Produces: `pnpm run lint` and `pnpm run fmt` in `apps/lab`; `nx run lab:lint` / `nx run lab:fmt`

- [ ] **Step 1: Install the toolchain**

```bash
cd /Users/tomek/dev/arrowz
pnpm --filter @arrowz/lab add -D eslint @eslint/js typescript-eslint eslint-plugin-react-hooks eslint-plugin-jsx-a11y prettier
node -e "const d=require('./apps/lab/package.json').devDependencies;console.log('eslint',d.eslint,'prettier',d.prettier)"
```

Expected: `eslint ^10.x`, `prettier ^3.9.x` or newer. pnpm will warn that `eslint-plugin-jsx-a11y` declares no ESLint 10 peer — expected, and not fatal: the plugin uses none of the context APIs ESLint 10 removed. If the install *fails* rather than warns, stop and report it.

- [ ] **Step 2: Write the failing test**

This task's test is a command against a deliberately bad component that each of the three plugins must reject. It is deleted in Step 5.

```bash
mkdir -p apps/lab/src/scratch
cat > apps/lab/src/scratch/bad.tsx <<'TSX'
export function Bad({ onPick }: { onPick: (v: unknown) => void }) {
  const value = (globalThis as any).nothing
  return <div onClick={() => onPick(value!)}>pick</div>
}
TSX
```

- [ ] **Step 3: Run the linter to verify it fails**

Run: `pnpm --filter @arrowz/lab exec eslint src/scratch/bad.tsx`
Expected: FAIL. "No configuration found" is this step failing correctly; write Step 4 and run it again.

- [ ] **Step 4: Write the configuration**

`apps/lab/eslint.config.js`:

```js
import js from '@eslint/js'
import jsxA11y from 'eslint-plugin-jsx-a11y'
import reactHooks from 'eslint-plugin-react-hooks'
import tseslint from 'typescript-eslint'

export default tseslint.config(
  { ignores: ['dist/'] },
  js.configs.recommended,
  tseslint.configs.recommended,
  jsxA11y.flatConfigs.recommended,
  // `configs.flat.*` — `configs['recommended-latest']` is the legacy eslintrc
  // shape (`plugins` as an array), which ESLint 10 rejects outright.
  reactHooks.configs.flat.recommended,
  {
    rules: {
      // The repository's two hard rules. deno lint enforces them in packages/;
      // apps/ is outside its reach, so they are stated here.
      '@typescript-eslint/no-explicit-any': 'error',
      '@typescript-eslint/no-non-null-assertion': 'error',
      // tsc exempts `_`-prefixed bindings; this rule does not unless told to.
      '@typescript-eslint/no-unused-vars': ['error', { argsIgnorePattern: '^_', varsIgnorePattern: '^_' }],
      // Node belongs in the integration test that spawns the lab server, and
      // nowhere else: this application runs in a browser.
      'no-restricted-imports': ['error', { patterns: ['node:*'] }],
    },
  },
  {
    files: ['**/*.node.test.ts'],
    rules: { 'no-restricted-imports': 'off' },
  },
)
```

No `languageOptions.parserOptions`. `projectService` would put every file ESLint visits under a tsconfig, and `eslint .` visits `eslint.config.js`, which no tsconfig includes — typescript-eslint then reports a parse error for it. No rule enabled here is type-aware, so the project service would buy nothing anyway.

`apps/lab/.prettierrc.json`:

```json
{
  "semi": false,
  "singleQuote": true,
  "printWidth": 120
}
```

`apps/lab/.prettierignore`:

```
dist
```

Add to `apps/lab/package.json`'s `scripts`: `"lint": "eslint ."` and `"fmt": "prettier --check ."`.

- [ ] **Step 5: Verify the three plugins fire, then delete the scratch file**

Run: `pnpm --filter @arrowz/lab exec eslint src/scratch/bad.tsx`
Expected: FAIL naming `@typescript-eslint/no-explicit-any`, `@typescript-eslint/no-non-null-assertion` and a `jsx-a11y/*` rule (`click-events-have-key-events` or `no-static-element-interactions`). If ESLint instead throws `ConfigError: Key "plugins"`, the react-hooks config key is wrong — print `node -e "import('eslint-plugin-react-hooks').then(m=>console.log(Object.keys(m.default.configs),Object.keys(m.default.configs.flat??{})))"` and use the flat one. Do not drop the plugin: the rules-of-hooks check is why it is here.

```bash
rm -r apps/lab/src/scratch
pnpm --filter @arrowz/lab exec prettier --write .
pnpm --filter @arrowz/lab run lint
pnpm --filter @arrowz/lab run fmt
```

Expected: both pass with no findings.

- [ ] **Step 6: Add the targets**

In `apps/lab/project.json` add:

```json
"lint": { "executor": "nx:run-commands", "options": { "cwd": "apps/lab", "command": "pnpm run lint" } },
"fmt": { "executor": "nx:run-commands", "options": { "cwd": "apps/lab", "command": "pnpm run fmt" } }
```

and change `verify` to `"dependsOn": ["check", "lint", "fmt", "test", "build"]`.

- [ ] **Step 7: Verify and commit**

```bash
pnpm nx run-many -t verify --projects=lab
git add apps/lab pnpm-lock.yaml
git commit -m "Give apps/lab ESLint and Prettier, with the repository's two hard rules"
```

---

### Task 3: The dictionary learns the third tab and the strip's own name

The lab has two tabs today (`tabLab`, `tabLibrary`, `lab-i18n.ts:110-111`). The application has three: the docs route is part of step 3 of the road map, and §5.2 names it. A tablist also needs an accessible name of its own, and reusing a tab's name for the list containing it is worse than having none. Both keys belong in the engine's dictionary with their neighbours, in both languages — `lab-i18n.test.ts` checks that `PL.ui` covers `EN.ui`, so a one-sided addition turns the Deno gate red.

**Files:**
- Modify: `packages/engine/lab-i18n.ts` (`EN.ui` after `:111`, `PL.ui` after `:460`)
- Test: `packages/engine/lab-i18n.test.ts` (append)

**Interfaces:**
- Consumes: `dictionary(lang)` from `@arrowz/engine/i18n`
- Produces: `dict.t('tabDocs')` — `'Docs'` / `'Dokumentacja'`; `dict.t('tabsLabel')` — `'Sections'` / `'Sekcje'`

- [ ] **Step 1: Write the failing test**

Append to `packages/engine/lab-i18n.test.ts`:

```ts
Deno.test('the third tab has a name in both languages', () => {
  assertEquals(dictionary('en').t('tabDocs'), 'Docs')
  assertEquals(dictionary('pl').t('tabDocs'), 'Dokumentacja')
})

Deno.test('the tab strip has a name of its own, distinct from every tab', () => {
  for (const lang of ['en', 'pl'] as const) {
    const dict = dictionary(lang)
    const strip = dict.t('tabsLabel')
    assert(strip.length > 0)
    for (const tab of ['tabLab', 'tabLibrary', 'tabDocs'] as const) assertNotEquals(strip, dict.t(tab))
  }
})
```

Add `assert` and `assertNotEquals` to the file's `@std/assert` import if they are not already there.

- [ ] **Step 2: Run the test to verify it fails**

Run: `deno test -A packages/engine/lab-i18n.test.ts`
Expected: FAIL — `tabDocs` is not assignable to `UiKey`. (Run the engine's tests with `-A`; without it four unrelated tests fail on missing permissions.)

- [ ] **Step 3: Add the keys to both dictionaries**

In `packages/engine/lab-i18n.ts`, after `tabLibrary` in `EN.ui`:

```ts
    tabDocs: 'Docs',
    /** The accessible name of the tab strip itself, not of any one tab. */
    tabsLabel: 'Sections',
```

and after `tabLibrary` in `PL.ui`:

```ts
    tabDocs: 'Dokumentacja',
    tabsLabel: 'Sekcje',
```

- [ ] **Step 4: Run the tests to verify they pass**

Run: `deno test -A packages/engine/lab-i18n.test.ts`, then `deno task test`
Expected: PASS. The key-parity test between `EN.ui` and `PL.ui` is in the second suite; `PL: Translation` also forces the same key set at type level.

- [ ] **Step 5: Commit**

```bash
git add packages/engine/lab-i18n.ts packages/engine/lab-i18n.test.ts
git commit -m "Name the docs tab and the tab strip in both dictionaries"
```

---

### Task 4: Three routes, one dictionary hook, and a browser to test them in

Declarative React Router: `<BrowserRouter>` in `App`, `<Routes>` in `AppRoutes` so a test can mount the routing without an address bar. This task also stands up the Chromium project that Tasks 5, 8, 9, 10 and 11 need, and the `useDictionary()` hook of Ruling 1.

**Files:**
- Create: `apps/lab/src/i18n.ts`, `apps/lab/src/AppRoutes.tsx`, `apps/lab/src/routes/SavedBoardsRoute.tsx`, `apps/lab/src/routes/DocsRoute.tsx`, `apps/lab/vitest.setup.ts`
- Modify: `apps/lab/src/App.tsx`, `apps/lab/vitest.config.ts`
- Test: `apps/lab/src/AppRoutes.browser.test.tsx`

**Interfaces:**
- Consumes: `App` from Task 1; `dictionary`, `Dict` from `@arrowz/engine/i18n`
- Produces: `export function useDictionary(): Dict`; `export function AppRoutes(): JSX.Element`; the paths `/`, `/boards`, `/docs/:what`; the panel ids `lab-panel`, `boards-panel`, `docs-panel`

- [ ] **Step 1: Install the router and the browser test tools**

```bash
cd /Users/tomek/dev/arrowz
pnpm --filter @arrowz/lab add react-router
pnpm --filter @arrowz/lab add -D vitest-browser-react
node -e "console.log(require('./apps/lab/package.json').dependencies['react-router'])"
```

Expected: `^8.x`. Declarative mode only — `<BrowserRouter>` and `<Routes>`. Do not add `@react-router/dev`, `routes.ts`, or any framework-mode plugin.

`userEvent` comes from `vitest/browser`, which is not a separate install: `vitest/browser/context.d.ts` re-exports `@vitest/browser-playwright/context`, and that package is already a dev dependency from Task 1.

- [ ] **Step 2: Write the failing test**

Create `apps/lab/src/AppRoutes.browser.test.tsx`:

```tsx
import { MemoryRouter } from 'react-router'
import { expect, test } from 'vitest'
import { render } from 'vitest-browser-react'
import { AppRoutes } from './AppRoutes'

const at = (path: string) =>
  render(
    <MemoryRouter initialEntries={[path]}>
      <AppRoutes />
    </MemoryRouter>,
  )

test('/boards is the saved boards', async () => {
  const screen = await at('/boards')
  await expect.element(screen.getByRole('tabpanel', { name: 'Saved boards' })).toBeVisible()
})

test('/docs/element is the docs, and the segment reaches the page', async () => {
  const screen = await at('/docs/element')
  await expect.element(screen.getByRole('tabpanel', { name: 'Docs' })).toBeVisible()
  await expect.element(screen.getByText('element')).toBeVisible()
})

// The lab is not a route element (Ruling 5): App mounts it beside <Routes> and
// hides it off-route, so `/` renders nothing here.
test('the root path renders no panel of its own', async () => {
  const screen = await at('/')
  expect(screen.container.querySelector('[role="tabpanel"]')).toBeNull()
})

test('an unknown path redirects to the root', async () => {
  const screen = await at('/nowhere')
  expect(screen.container.querySelector('[role="tabpanel"]')).toBeNull()
})

// Each panel is inside a <main>, not instead of it: role="tabpanel" on <main>
// would erase the page's only landmark.
test('each panel keeps the main landmark around it', async () => {
  const screen = await at('/boards')
  await expect.element(screen.getByRole('main')).toBeVisible()
  const panel = screen.container.querySelector('[role="tabpanel"]')
  expect(panel?.closest('main')).not.toBeNull()
  expect(panel?.getAttribute('aria-labelledby')).toBe('tab-boards-panel')
  expect(panel?.getAttribute('tabindex')).toBe('0')
})
```

- [ ] **Step 3: Run the test to verify it fails**

Rewrite `apps/lab/vitest.config.ts` with all three projects:

```ts
import react from '@vitejs/plugin-react'
import { playwright } from '@vitest/browser-playwright'
import { defineConfig } from 'vitest/config'

export default defineConfig({
  test: {
    projects: [
      {
        test: {
          name: 'node',
          environment: 'node',
          include: ['src/**/*.test.ts', 'src/**/*.test.tsx'],
          exclude: ['src/**/*.browser.test.ts', 'src/**/*.browser.test.tsx', 'src/**/*.node.test.ts'],
        },
      },
      {
        test: {
          name: 'node-integration',
          environment: 'node',
          include: ['src/**/*.node.test.ts'],
          // Each file owns a port and a temporary store directory.
          fileParallelism: false,
          testTimeout: 60_000,
        },
      },
      {
        plugins: [react()],
        test: {
          name: 'chromium',
          include: ['src/**/*.browser.test.ts', 'src/**/*.browser.test.tsx'],
          setupFiles: ['./vitest.setup.ts'],
          // One file at a time, for the reason board-element's config records:
          // parallel files share one browser and, on a GPU-less runner, one
          // software WebGL renderer.
          fileParallelism: false,
          browser: {
            enabled: true,
            headless: true,
            provider: playwright({
              launchOptions: { channel: 'chromium' },
              contextOptions: { deviceScaleFactor: 2 },
            }),
            instances: [{ browser: 'chromium' }],
          },
        },
      },
    ],
  },
})
```

`apps/lab/vitest.setup.ts`:

```ts
// Brings vitest-browser-react's matchers and its beforeEach cleanup into every
// browser test file.
import 'vitest-browser-react'
```

Install the browser once locally (CI installs it through `board-element`):

```bash
pnpm --filter @arrowz/board-element exec playwright install --with-deps chromium
```

Run: `pnpm --filter @arrowz/lab exec vitest run --project=chromium`
Expected: FAIL — `Failed to resolve import "./AppRoutes"`.

- [ ] **Step 4: Write the dictionary hook and the routes**

`apps/lab/src/i18n.ts`:

```ts
import { dictionary, type Dict } from '@arrowz/engine/i18n'

const EN = dictionary('en')

/**
 * The application's only dictionary access. PR 4 adds the `lang` slice and
 * makes this read it; until then every component already gets its text from
 * the dictionary rather than from a literal, so PR 4 changes this file and
 * nothing else.
 */
export function useDictionary(): Dict {
  return EN
}
```

`apps/lab/src/routes/SavedBoardsRoute.tsx`:

```tsx
import { useDictionary } from '../i18n'

export function SavedBoardsRoute() {
  const dict = useDictionary()
  return (
    <main>
      <section id="boards-panel" role="tabpanel" aria-labelledby="tab-boards-panel" tabIndex={0}>
        <h2>{dict.t('tabLibrary')}</h2>
        {/* PR 5 fills this: list, size chips, detail, load into lab, delete. */}
      </section>
    </main>
  )
}
```

`apps/lab/src/routes/DocsRoute.tsx`:

```tsx
import { useParams } from 'react-router'
import { useDictionary } from '../i18n'

export function DocsRoute() {
  const dict = useDictionary()
  const { what } = useParams()
  return (
    <main>
      <section id="docs-panel" role="tabpanel" aria-labelledby="tab-docs-panel" tabIndex={0}>
        <h2>{dict.t('tabDocs')}</h2>
        {/* PR 6 fills this: the element's API, and the CLI help from helpText(). */}
        <p>{what}</p>
      </section>
    </main>
  )
}
```

`apps/lab/src/AppRoutes.tsx`:

```tsx
import { Navigate, Route, Routes } from 'react-router'
import { DocsRoute } from './routes/DocsRoute'
import { SavedBoardsRoute } from './routes/SavedBoardsRoute'

export function AppRoutes() {
  return (
    <Routes>
      {/* `/` renders nothing: the lab panel is mounted in App and merely
          hidden off-route, so that a route change neither kills a run nor
          disposes the board's GL context (Ruling 5). */}
      <Route path="/" element={null} />
      <Route path="/boards" element={<SavedBoardsRoute />} />
      <Route path="/docs/:what" element={<DocsRoute />} />
      {/* A stale deep link is the lab, not a blank page. */}
      <Route path="*" element={<Navigate to="/" replace />} />
    </Routes>
  )
}
```

`apps/lab/src/App.tsx`:

```tsx
import { BrowserRouter } from 'react-router'
import { AppRoutes } from './AppRoutes'

export function App() {
  return (
    <BrowserRouter>
      <div className="fw">
        <AppRoutes />
      </div>
    </BrowserRouter>
  )
}
```

- [ ] **Step 5: Run the tests to verify they pass**

Run: `pnpm --filter @arrowz/lab exec vitest run --project=chromium`
Expected: PASS, 5 tests.

- [ ] **Step 6: Verify and commit**

```bash
pnpm --filter @arrowz/lab exec prettier --write .
pnpm nx run-many -t verify --projects=lab
git add apps/lab pnpm-lock.yaml
git commit -m "Route the saved boards and the docs, and read every text from the dictionary"
```

---

### Task 5: The shell — a top bar and a real tab strip

The mock's tabs carry `aria-selected` on plain buttons with no `role="tab"` and no arrow keys (§7.2). This is the first of the nine gaps the port must fix, and the tab strip is where a wrong pattern would be copied into every later panel.

**Files:**
- Create: `apps/lab/src/shell/TopBar.tsx`, `apps/lab/src/shell/TabRow.tsx`, `apps/lab/src/design/shell.css`
- Modify: `apps/lab/src/App.tsx`, `apps/lab/src/main.tsx`
- Test: `apps/lab/src/shell/TabRow.browser.test.tsx`

**Interfaces:**
- Consumes: `AppRoutes` and the paths of Task 4
- Produces: `export function TopBar(props: { W: number; H: number }): JSX.Element`; `export function TabRow(): JSX.Element`

- [ ] **Step 1: Write the failing test**

Create `apps/lab/src/shell/TabRow.browser.test.tsx`:

```tsx
import { MemoryRouter } from 'react-router'
import { expect, test } from 'vitest'
import { userEvent } from 'vitest/browser'
import { render } from 'vitest-browser-react'
import { TabRow } from './TabRow'

const mount = (path: string) =>
  render(
    <MemoryRouter initialEntries={[path]}>
      <TabRow />
    </MemoryRouter>,
  )

test('the strip is a tablist with three tabs and one selected', async () => {
  const screen = await mount('/')
  await expect.element(screen.getByRole('tablist', { name: 'Sections' })).toBeVisible()
  await expect.element(screen.getByRole('tab', { name: 'Lab', selected: true })).toBeVisible()
  await expect.element(screen.getByRole('tab', { name: 'Saved boards', selected: false })).toBeVisible()
  await expect.element(screen.getByRole('tab', { name: 'Docs', selected: false })).toBeVisible()
})

test('only the selected tab is in the tab order', async () => {
  const screen = await mount('/')
  await expect.element(screen.getByRole('tab', { name: 'Lab' })).toHaveAttribute('tabindex', '0')
  await expect.element(screen.getByRole('tab', { name: 'Docs' })).toHaveAttribute('tabindex', '-1')
})

test('the selected tab points at the panel it controls', async () => {
  const screen = await mount('/boards')
  await expect
    .element(screen.getByRole('tab', { name: 'Saved boards' }))
    .toHaveAttribute('aria-controls', 'boards-panel')
  // aria-controls on an unselected tab would point at an id that is not in the
  // document, which is worse than no association at all.
  await expect.element(screen.getByRole('tab', { name: 'Docs' })).not.toHaveAttribute('aria-controls')
})

test('every tab carries the id its panel labels itself with', async () => {
  const screen = await mount('/')
  await expect.element(screen.getByRole('tab', { name: 'Lab' })).toHaveAttribute('id', 'tab-lab-panel')
  await expect.element(screen.getByRole('tab', { name: 'Saved boards' })).toHaveAttribute('id', 'tab-boards-panel')
  await expect.element(screen.getByRole('tab', { name: 'Docs' })).toHaveAttribute('id', 'tab-docs-panel')
})

test('the right arrow moves the selection, and Home/End reach the ends', async () => {
  const screen = await mount('/')
  await screen.getByRole('tab', { name: 'Lab' }).click()
  await userEvent.keyboard('{ArrowRight}')
  await expect.element(screen.getByRole('tab', { name: 'Saved boards', selected: true })).toBeVisible()
  await userEvent.keyboard('{End}')
  await expect.element(screen.getByRole('tab', { name: 'Docs', selected: true })).toBeVisible()
  await userEvent.keyboard('{Home}')
  await expect.element(screen.getByRole('tab', { name: 'Lab', selected: true })).toBeVisible()
})

// Wrapping is what the pattern asks for and what a mouse user never discovers.
test('the left arrow from the first tab wraps to the last', async () => {
  const screen = await mount('/')
  await screen.getByRole('tab', { name: 'Lab' }).click()
  await userEvent.keyboard('{ArrowLeft}')
  await expect.element(screen.getByRole('tab', { name: 'Docs', selected: true })).toBeVisible()
})
```

- [ ] **Step 2: Run the test to verify it fails**

Run: `pnpm --filter @arrowz/lab exec vitest run --project=chromium TabRow`
Expected: FAIL — `Failed to resolve import "./TabRow"`.

- [ ] **Step 3: Write the tab strip**

`apps/lab/src/shell/TabRow.tsx`:

```tsx
import type { KeyboardEvent } from 'react'
import { useLocation, useNavigate } from 'react-router'
import { useDictionary } from '../i18n'

// The strip is the application's only navigation, so the route is the
// selection: no second copy of "which tab is open" to drift from the URL.
const TABS = [
  { path: '/', panel: 'lab-panel', key: 'tabLab' },
  { path: '/boards', panel: 'boards-panel', key: 'tabLibrary' },
  { path: '/docs/element', panel: 'docs-panel', key: 'tabDocs' },
] as const

export function selectedIndex(pathname: string): number {
  if (pathname.startsWith('/boards')) return 1
  if (pathname.startsWith('/docs')) return 2
  return 0
}

export function TabRow() {
  const dict = useDictionary()
  const navigate = useNavigate()
  const current = selectedIndex(useLocation().pathname)

  // Arrow keys move the selection and the focus together; the pattern wraps at
  // both ends, and Home/End jump. A mouse user never meets this path, which is
  // exactly why the mock has none of it.
  function onKeyDown(event: KeyboardEvent<HTMLDivElement>) {
    const last = TABS.length - 1
    const next = event.key === 'ArrowRight'
      ? current === last ? 0 : current + 1
      : event.key === 'ArrowLeft'
      ? current === 0 ? last : current - 1
      : event.key === 'Home'
      ? 0
      : event.key === 'End'
      ? last
      : null
    if (next === null) return
    event.preventDefault()
    const tab = TABS[next]
    if (tab) void navigate(tab.path)
  }

  return (
    <div className="fw-tabrow" role="tablist" aria-label={dict.t('tabsLabel')} onKeyDown={onKeyDown}>
      {TABS.map((tab, i) => (
        <button
          key={tab.path}
          type="button"
          role="tab"
          id={`tab-${tab.panel}`}
          aria-selected={i === current}
          // Only the selected panel is in the document; pointing at an absent
          // id is worse than not pointing at all.
          {...(i === current ? { 'aria-controls': tab.panel } : {})}
          tabIndex={i === current ? 0 : -1}
          ref={(node) => {
            // Focus follows the selection, but only while the strip already
            // has it: clicking a tab must not steal focus back from a panel.
            if (node && i === current && node.parentElement?.contains(document.activeElement)) node.focus()
          }}
          onClick={() => void navigate(tab.path)}
        >
          {dict.t(tab.key)}
        </button>
      ))}
    </div>
  )
}
```

`apps/lab/src/shell/TopBar.tsx`:

```tsx
/** The one large Signal plane of the mock: the mark, the name and the size. */
export function TopBar({ W, H }: { W: number; H: number }) {
  return (
    <header className="fw-top">
      <svg className="mark" viewBox="0 0 20 20" aria-hidden="true" focusable="false">
        <path d="M3 17 L10 3 L17 17 L10 13 Z" fill="currentColor" />
      </svg>
      <span className="name">Arrowz</span>
      <span className="sep">/</span>
      <span className="dims">{`${W}×${H}`}</span>
      {/* The right group is where ⌘K (PR 3), the language switch and the
          simple/advanced switch (PR 4) go. It stays empty rather than
          carrying a placeholder nobody would remember to remove. */}
      <div className="right" />
    </header>
  )
}
```

- [ ] **Step 4: Write the shell's styles**

`apps/lab/src/design/shell.css`, ported from the mock's shell rules:

```css
/* The shell's grid and the two bars. 48px auto 1fr: top bar, tab strip,
   everything else. */
.fw {
  display: grid;
  min-height: 100vh;
  grid-template-rows: 48px auto minmax(0, 1fr);
  background: var(--void);
  color: var(--ink);
  font-family: var(--mono);
  font-size: 12px;
  line-height: 1.7;
  font-synthesis: none;
  text-wrap: pretty;
}
.fw *,
.fw *::before,
.fw *::after {
  box-sizing: border-box;
}
.fw button {
  font-family: inherit;
  font-size: inherit;
  line-height: inherit;
  font-weight: inherit;
  color: inherit;
}
.fw .caps {
  font-size: 11px;
  line-height: 1.6;
  letter-spacing: 0.14em;
  text-transform: uppercase;
}
.fw :focus-visible {
  outline: 2px solid var(--signal);
  outline-offset: 2px;
}

.fw-top {
  display: flex;
  align-items: center;
  gap: 12px;
  padding: 0 16px;
  background: var(--signal);
  color: var(--void);
}
.fw-top .mark {
  width: 20px;
  height: 20px;
  flex: none;
}
.fw-top .name {
  font-size: 13px;
}
.fw-top .sep {
  opacity: 0.5;
}
/* §7.1: tabular-nums on every number, so a changing size does not jitter. */
.fw-top .dims {
  opacity: 0.8;
  font-variant-numeric: tabular-nums;
}
.fw-top .right {
  margin-left: auto;
  display: flex;
  align-items: center;
  gap: 14px;
  min-width: 0;
}

.fw-tabrow {
  display: flex;
  align-items: center;
  gap: 20px;
  padding: 0 16px;
  background: var(--void);
  border-bottom: 1px solid var(--border);
}
.fw-tabrow button {
  padding: 10px 0 8px;
  margin-bottom: -1px;
  border: 0;
  border-bottom: 2px solid transparent;
  background: none;
  color: var(--ash);
  cursor: pointer;
  transition: color 120ms cubic-bezier(0.2, 0, 0, 1);
}
.fw-tabrow button:hover {
  color: var(--ink);
}
.fw-tabrow button[aria-selected='true'] {
  color: var(--ink);
  border-bottom-color: var(--signal);
}

/* §7.2: the design system asks for 44px targets where there is no hover. */
@media (pointer: coarse) {
  .fw-tabrow button {
    padding: 15px 0 13px;
  }
}
```

Import it in `apps/lab/src/main.tsx` after the tokens:

```tsx
import './design/tokens.css'
import './design/shell.css'
```

Put the shell into `apps/lab/src/App.tsx`:

```tsx
import { defaultParams } from '@arrowz/engine'
import { BrowserRouter } from 'react-router'
import { AppRoutes } from './AppRoutes'
import { TabRow } from './shell/TabRow'
import { TopBar } from './shell/TopBar'

// The knobs are PR 3; until then the top bar shows the defaults a run uses.
const params = defaultParams()

export function App() {
  return (
    <BrowserRouter>
      <div className="fw">
        <TopBar W={params.W} H={params.H} />
        <TabRow />
        <AppRoutes />
      </div>
    </BrowserRouter>
  )
}
```

- [ ] **Step 5: Run the tests to verify they pass**

Run: `pnpm --filter @arrowz/lab exec vitest run --project=chromium`
Expected: PASS — five route tests and six tab tests.

- [ ] **Step 6: Verify and commit**

```bash
pnpm --filter @arrowz/lab exec prettier --write .
pnpm nx run-many -t verify --projects=lab
git add apps/lab
git commit -m "Add the shell: a top bar and a tab strip with the full tablist pattern"
```

---

### Task 6: The store client and the proxy

Ruling 8 measured what the proxy has to be: a target and nothing else. The tests start both servers and post a real board through the whole path, so the day someone adds `changeOrigin: true` "for tidiness", they meet a 403 here rather than in a browser.

**Files:**
- Create: `apps/lab/vite.proxy.ts`, `apps/lab/src/api/boards.ts`
- Modify: `apps/lab/vite.config.ts`
- Test: `apps/lab/src/api/boards.node.test.ts`

**Interfaces:**
- Consumes: `BoardMeta`, `BoardSize`, `StoreRequest` from `@arrowz/engine`
- Produces: `export const LAB_SERVER: string` and `export function labProxy(target?: string): Record<string, ProxyOptions>` from `apps/lab/vite.proxy.ts` (Step 3); `export async function listBoards(): Promise<BoardSize[]>`; `export async function saveBoard(request: StoreRequest): Promise<SaveOutcome>`; `export type SaveOutcome = { ok: true; meta: BoardMeta } | { ok: false; error: string }`

- [ ] **Step 1: Write the failing test**

Create `apps/lab/src/api/boards.node.test.ts`:

```ts
/// <reference types="node" />
import { defaultParams, encodeBoard, generate } from '@arrowz/engine'
import { DEFAULT_VIEW, storeRequest } from '@arrowz/engine/command'
import { spawn, type ChildProcess } from 'node:child_process'
import { mkdtempSync, rmSync } from 'node:fs'
import { tmpdir } from 'node:os'
import { join } from 'node:path'
import { fileURLToPath } from 'node:url'
import { createServer, type ViteDevServer } from 'vite'
import { afterAll, beforeAll, expect, test } from 'vitest'
import { labProxy } from '../../vite.proxy'

const STORE_PORT = 8790
const VITE_PORT = 8791
const STORE_ORIGIN = `http://127.0.0.1:${STORE_PORT}`
const VITE_ORIGIN = `http://127.0.0.1:${VITE_PORT}`
const REPO = fileURLToPath(new URL('../../../..', import.meta.url))
const APP = fileURLToPath(new URL('../..', import.meta.url))

let store: ChildProcess
let vite: ViteDevServer
let boardsDir: string

beforeAll(async () => {
  boardsDir = mkdtempSync(join(tmpdir(), 'arrowz-lab-'))
  store = spawn(
    'deno',
    [
      'run',
      `--allow-net=127.0.0.1:${STORE_PORT}`,
      '--allow-read',
      `--allow-write=${boardsDir}`,
      '--allow-env=ARROWZ_BOARDS_DIR',
      'packages/cli/lab-server.ts',
      String(STORE_PORT),
    ],
    { cwd: REPO, env: { ...process.env, ARROWZ_BOARDS_DIR: boardsDir } },
  )
  // ENOENT on `deno` must fail this hook, not surface as an uncaught error.
  store.on('error', (err) => {
    throw err
  })

  let up = false
  for (let i = 0; i < 100 && !up; i++) {
    try {
      const r = await fetch(`${STORE_ORIGIN}/api/boards`)
      await r.body?.cancel()
      up = r.ok
    } catch {
      await new Promise((done) => setTimeout(done, 100))
    }
  }
  if (!up) throw new Error(`the lab server never answered on ${STORE_ORIGIN}`)

  vite = await createServer({
    root: APP,
    configFile: false,
    // host: Vite binds `localhost`, which Node 24 resolves to ::1 here, and
    // every fetch to 127.0.0.1 would be refused. strictPort: a silently
    // shifted port would make VITE_ORIGIN a lie.
    server: { host: '127.0.0.1', port: VITE_PORT, strictPort: true, proxy: labProxy(STORE_ORIGIN) },
  })
  await vite.listen()
})

afterAll(async () => {
  await vite?.close()
  store?.kill()
  rmSync(boardsDir, { recursive: true, force: true })
})

test('a GET through the proxy reaches the store', async () => {
  const r = await fetch(`${VITE_ORIGIN}/api/boards`)
  expect(r.status).toBe(200)
  expect(await r.json()).toEqual([])
})

// The whole point of the task. The server refuses a write whose Origin is not
// its own (lab-server.ts:76-77); this proves the proxy leaves the pair
// consistent, and it is what would go red if changeOrigin were ever added.
test('a POST through the proxy is accepted, Origin and all', async () => {
  const params = { ...defaultParams(), W: 12, H: 12, seed: 3 }
  const result = generate(params)
  const body = storeRequest(encodeBoard(result.board), params, DEFAULT_VIEW, 'lab')

  const r = await fetch(`${VITE_ORIGIN}/api/boards`, {
    method: 'POST',
    headers: { 'Content-Type': 'application/json', Origin: VITE_ORIGIN },
    body: JSON.stringify(body),
  })

  expect(r.status).toBe(201)
  const meta = (await r.json()) as { id: string }
  expect(meta.id).toMatch(/^seed3-[0-9a-f]{8}$/)
})

test('the saved board comes back in the listing', async () => {
  const sizes = (await (await fetch(`${VITE_ORIGIN}/api/boards`)).json()) as {
    size: string
    boards: { id: string }[]
  }[]
  expect(sizes).toHaveLength(1)
  expect(sizes[0]?.size).toBe('12x12')
  expect(sizes[0]?.boards).toHaveLength(1)
})

// PR 5 reads the stored files from /boards/, so the proxy covers that path.
test('the stored board file is reachable through the proxy', async () => {
  const sizes = (await (await fetch(`${VITE_ORIGIN}/api/boards`)).json()) as { boards: { id: string }[] }[]
  const id = sizes[0]?.boards[0]?.id
  const r = await fetch(`${VITE_ORIGIN}/boards/12x12/${id}.board.json`)
  expect(r.status).toBe(200)
})

// The SPA owns /boards; only /boards/ is the store's. A prefix key without the
// slash would proxy the Saved boards route itself, and a reload or a deep link
// would land on the store's 404 instead of the application.
test('the /boards route itself is not proxied', async () => {
  const r = await fetch(`${VITE_ORIGIN}/boards`)
  expect(r.status).toBe(200)
  expect(r.headers.get('content-type')).toMatch(/text\/html/)
})
```

- [ ] **Step 2: Run the test to verify it fails**

Run: `pnpm --filter @arrowz/lab exec vitest run --project=node-integration`
Expected: FAIL — `Failed to resolve import "../../vite.proxy"`.

- [ ] **Step 3: Write the proxy table**

The helper is its own module so the test can import it without loading the whole config. Create `apps/lab/vite.proxy.ts`:

```ts
import type { ProxyOptions } from 'vite'

/** Where `deno task lab` listens unless it is told otherwise. */
export const LAB_SERVER = 'http://127.0.0.1:8777'

/**
 * The board store's two paths, proxied to the Deno lab server.
 *
 * A target and nothing else. `changeOrigin` would rewrite `Host` to the
 * target's, and the server derives its own origin from `Host` before
 * comparing it with the request's `Origin` (`lab-server.ts:66-79`) — so
 * setting it is what would earn the 403 that spec §9.1 predicts, and a
 * `proxyReq` hook rewriting `Origin` would then be needed to undo the damage.
 * Forwarding the browser's own `Host` keeps the pair consistent by
 * construction, and `localhost` is in the server's LOCAL_HOSTS. Measured
 * against Vite 8.2.2; `boards.node.test.ts` holds the line.
 *
 * Both keys end in a slash. Vite matches string keys by prefix, so `/boards`
 * would also capture the application's own Saved boards route.
 */
export function labProxy(target: string = LAB_SERVER): Record<string, ProxyOptions> {
  return { '/api/': { target }, '/boards/': { target } }
}
```

Wire it into `apps/lab/vite.config.ts`:

```ts
import react from '@vitejs/plugin-react'
import { defineConfig } from 'vite'
import { labProxy } from './vite.proxy'

export default defineConfig({
  plugins: [react()],
  // 8777 is the lab server, 8778 is the board element's demo.
  server: { port: 8779, proxy: labProxy() },
  build: { target: 'es2022' },
})
```

- [ ] **Step 4: Run the tests to verify they pass**

Run: `pnpm --filter @arrowz/lab exec vitest run --project=node-integration`
Expected: PASS, 5 tests. A 403 on the POST means something rewrote `Host`; a 404 with `application/json` on the last test means a proxy key lost its trailing slash.

- [ ] **Step 5: Write the client**

Create `apps/lab/src/api/boards.ts`:

```ts
import type { BoardMeta, BoardSize, StoreRequest } from '@arrowz/engine'

export type SaveOutcome = { ok: true; meta: BoardMeta } | { ok: false; error: string }

/**
 * The store is optional: the lab runs from any static host, and a missing
 * server must cost the run nothing. Both calls therefore report failure as a
 * value; neither throws.
 */
export async function listBoards(): Promise<BoardSize[]> {
  const response = await fetch('/api/boards')
  if (!response.ok) return []
  return (await response.json()) as BoardSize[]
}

export async function saveBoard(request: StoreRequest): Promise<SaveOutcome> {
  let response: Response
  try {
    response = await fetch('/api/boards', {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify(request),
    })
  } catch (err) {
    return { ok: false, error: err instanceof Error ? err.message : String(err) }
  }
  if (response.status === 201) return { ok: true, meta: (await response.json()) as BoardMeta }
  const body = (await response.json().catch(() => ({}))) as { error?: string }
  return { ok: false, error: body.error ?? `the store answered ${response.status}` }
}
```

- [ ] **Step 6: Verify and commit**

```bash
pnpm --filter @arrowz/lab exec prettier --write .
pnpm nx run-many -t verify --projects=lab
git add apps/lab
git commit -m "Proxy the board store with a target and nothing else"
```

---

### Task 7: The run slice

One store, one slice. The state machine is §5.3's, minus the history the filmstrip needs in PR 7.

**Files:**
- Create: `apps/lab/src/state/run.slice.ts`, `apps/lab/src/state/store.ts`
- Test: `apps/lab/src/state/run.slice.test.ts`

**Interfaces:**
- Consumes: `BoardData`, `BoardFile`, `Params`, `TraceInfo`, `WorkerOut` from `@arrowz/engine`; `SaveOutcome` from `../api/boards`
- Produces:
  - `export type DoneReport = Extract<WorkerOut, { type: 'done' }>`
  - `export type RunPhase = 'idle' | 'running' | 'done' | 'error'`
  - `export interface RunState` with the fields `phase`, `params`, `progress`, `board`, `file`, `report`, `message`, `saved` and the actions `started(params: Params)`, `progressed(info: TraceInfo)`, `finished(r: { board: BoardData; file: BoardFile; report: DoneReport })`, `failed(message: string)`, `stored(outcome: SaveOutcome)`, `aborted()`, `reset()` — all returning `void`
  - `export const useStore` (Zustand) and `export interface Store { run: RunState }` from `store.ts`

`file` is a **`BoardFile` object**, not a string: `packages/engine/types.ts:151-165` declares `{ format, v, W, H, pieces, voids, unfilled, fingerprint, body }`, and `encodeBoard` returns that.

- [ ] **Step 1: Install Zustand**

```bash
pnpm --filter @arrowz/lab add zustand
node -e "console.log(require('./apps/lab/package.json').dependencies.zustand)"
```

Expected: `^5.x`.

- [ ] **Step 2: Write the failing test**

Create `apps/lab/src/state/run.slice.test.ts`:

```ts
import { defaultParams, encodeBoard, generate } from '@arrowz/engine'
import type { BoardMeta } from '@arrowz/engine'
import { beforeEach, expect, test } from 'vitest'
import { useStore } from './store'

const params = { ...defaultParams(), W: 8, H: 8, seed: 1 }
const result = generate(params)
const file = encodeBoard(result.board)
const report = {
  type: 'done' as const,
  ok: result.ok,
  metrics: result.metrics,
  backtracks: result.backtracks,
  restartsUsed: result.restartsUsed,
  genMs: result.genMs,
  metricsMs: result.metricsMs,
  totalMs: result.genMs + result.metricsMs,
  stuck: result.stuck,
  deadlock: result.deadlock,
  pieces: result.board.pieces.length,
  stats: result.board.stats,
  board: file,
}
const run = () => useStore.getState().run
// Built from the fields `BoardMeta` declares in packages/engine/types.ts —
// open it and fill every one; this test only reads `id`.
const aBoardMeta: BoardMeta = { /* see types.ts */ }

beforeEach(() => {
  run().reset()
})

test('a fresh store is idle and holds nothing', () => {
  expect(run().phase).toBe('idle')
  expect(run().board).toBeNull()
  expect(run().params).toBeNull()
})

test('started moves to running and pins the parameters the run uses', () => {
  run().started(params)
  expect(run().phase).toBe('running')
  expect(run().params).toEqual(params)
  expect(run().progress).toBeNull()
})

// The board on screen belongs to the run that made it, not to the knobs: §5.3
// keeps three parameter sets apart, and this is the one that matters here.
test('starting a second run clears the first one board and store outcome', () => {
  run().started(params)
  run().finished({ board: result.board, file, report })
  // Read BoardMeta from packages/engine/types.ts and build a real one; the
  // repository forbids `any`, and a cast here would hide a shape change.
  run().stored({ ok: true, meta: aBoardMeta })
  run().started({ ...params, seed: 2 })
  expect(run().phase).toBe('running')
  expect(run().board).toBeNull()
  expect(run().saved).toBeNull()
})

test('progress is kept while running and dropped when the run ends', () => {
  run().started(params)
  // TraceInfo, as types.ts:40-46 declares it.
  run().progressed({ pieces: 3, remaining: 40, backtracks: 0, ms: 12, total: 64 })
  expect(run().progress?.remaining).toBe(40)
  run().finished({ board: result.board, file, report })
  expect(run().progress).toBeNull()
})

test('finished holds the board, its file and the report', () => {
  run().started(params)
  run().finished({ board: result.board, file, report })
  expect(run().phase).toBe('done')
  expect(run().board).toBe(result.board)
  expect(run().file?.fingerprint).toBe(file.fingerprint)
  expect(run().report?.pieces).toBe(result.board.pieces.length)
})

test('failed carries the message and keeps no board', () => {
  run().started(params)
  run().failed('the envelope refuses these parameters')
  expect(run().phase).toBe('error')
  expect(run().message).toBe('the envelope refuses these parameters')
  expect(run().board).toBeNull()
})

// A store failure must never overwrite a run's outcome: §5.3 says status is
// structured data carrying a source, and this is that rule at slice level.
test('a store failure leaves the run done', () => {
  run().started(params)
  run().finished({ board: result.board, file, report })
  run().stored({ ok: false, error: 'no store server' })
  expect(run().phase).toBe('done')
  expect(run().saved).toEqual({ ok: false, error: 'no store server' })
})

test('aborting a run returns to idle without an error', () => {
  run().started(params)
  run().aborted()
  expect(run().phase).toBe('idle')
  expect(run().message).toBeNull()
})
```

- [ ] **Step 3: Run the test to verify it fails**

Run: `pnpm --filter @arrowz/lab exec vitest run --project=node run.slice`
Expected: FAIL — `Failed to resolve import "./store"`.

- [ ] **Step 4: Write the slice**

`apps/lab/src/state/run.slice.ts`:

```ts
import type { BoardData, BoardFile, Params, TraceInfo, WorkerOut } from '@arrowz/engine'
import type { SaveOutcome } from '../api/boards'

/** The worker's `done` message, which is also what the report reads. */
export type DoneReport = Extract<WorkerOut, { type: 'done' }>

export type RunPhase = 'idle' | 'running' | 'done' | 'error'

export interface RunState {
  phase: RunPhase
  /** The parameters this run was started with — not the knobs on screen. */
  params: Params | null
  progress: TraceInfo | null
  board: BoardData | null
  file: BoardFile | null
  report: DoneReport | null
  message: string | null
  /** The store's answer, kept apart so it cannot overwrite the run's outcome. */
  saved: SaveOutcome | null
  started(params: Params): void
  progressed(info: TraceInfo): void
  finished(result: { board: BoardData; file: BoardFile; report: DoneReport }): void
  failed(message: string): void
  stored(outcome: SaveOutcome): void
  aborted(): void
  reset(): void
}

const EMPTY = {
  phase: 'idle',
  params: null,
  progress: null,
  board: null,
  file: null,
  report: null,
  message: null,
  saved: null,
} as const

type SetStore = (fn: (state: { run: RunState }) => { run: RunState }) => void

export function createRunSlice(set: SetStore): RunState {
  const patch = (next: Partial<RunState>) => set((state) => ({ run: { ...state.run, ...next } }))
  return {
    ...EMPTY,
    started: (params) => patch({ ...EMPTY, phase: 'running', params }),
    progressed: (progress) => patch({ progress }),
    finished: ({ board, file, report }) => patch({ phase: 'done', progress: null, board, file, report, message: null }),
    failed: (message) => patch({ phase: 'error', progress: null, board: null, file: null, message }),
    stored: (saved) => patch({ saved }),
    aborted: () => patch({ ...EMPTY }),
    reset: () => patch({ ...EMPTY }),
  }
}
```

`apps/lab/src/state/store.ts`:

```ts
import { create } from 'zustand'
import { createRunSlice, type RunState } from './run.slice'

/**
 * One store, one slice for now. PR 3 adds params, view and ui; PR 4 adds lang
 * and recipe; PR 5 adds library. Each is a named field rather than a flat
 * spread, so a per-knob selector can reach exactly its own entry.
 */
export interface Store {
  run: RunState
}

export const useStore = create<Store>()((set) => ({
  run: createRunSlice(set),
}))
```

- [ ] **Step 5: Run the tests to verify they pass**

Run: `pnpm --filter @arrowz/lab exec vitest run --project=node`
Expected: PASS — two token tests and eight slice tests.

- [ ] **Step 6: Verify and commit**

```bash
pnpm --filter @arrowz/lab exec prettier --write .
pnpm nx run-many -t verify --projects=lab
git add apps/lab pnpm-lock.yaml
git commit -m "Add the run slice: the state machine of a generation"
```

---

### Task 8: The worker and `useGenerator`

One long-lived worker, reused while idle, terminated to abort or to replace a run in flight — today's behaviour (`lab-page.ts:776` `ensureWorker`, `:856` `killWorker`, `:879` `if (busy) killWorker()`), and the reason §6 leaves the protocol alone.

**Files:**
- Create: `apps/lab/src/worker/generate.worker.ts`, `apps/lab/src/worker/useGenerator.ts`
- Modify: `apps/lab/src/App.tsx`
- Test: `apps/lab/src/worker/useGenerator.browser.test.tsx`

**Interfaces:**
- Consumes: the `run` slice of Task 7; `WorkerIn`, `WorkerOut`, `decodeBoard` from `@arrowz/engine`
- Produces: `export interface Generator { start(params: Params): void; abort(): void }` and `export function useGenerator(): Generator`, both from `useGenerator.ts`

- [ ] **Step 1: Write the failing test**

Board sizes here are chosen from measurement, not from taste: in-process, 16×16 carves in about 3 ms, 25×25 in about 25 ms and 200×200 in about 330 ms. A test that needs to observe a run *in flight* must use the large one; a test that only needs a finished board should use a small one.

Create `apps/lab/src/worker/useGenerator.browser.test.tsx`:

```tsx
import { defaultParams } from '@arrowz/engine'
import { useEffect } from 'react'
import { expect, test, vi } from 'vitest'
import { render } from 'vitest-browser-react'
import { useStore } from '../state/store'
import { useGenerator, type Generator } from './useGenerator'

function Harness({ drive }: { drive: (g: Generator) => void | (() => void) }) {
  const generator = useGenerator()
  useEffect(() => drive(generator), [generator, drive])
  return null
}

const start = (params: Parameters<Generator['start']>[0]) => (g: Generator) => g.start(params)

test('a run carves a board and lands in done', async () => {
  useStore.getState().run.reset()
  await render(<Harness drive={start({ ...defaultParams(), W: 16, H: 16, seed: 5 })} />)
  await expect.poll(() => useStore.getState().run.phase, { timeout: 20_000 }).toBe('done')
  const { run } = useStore.getState()
  expect(run.board?.W).toBe(16)
  // BoardFile is an object (types.ts:151); its fingerprint is the board's.
  expect(run.file?.format).toBe('arrowz-board')
  expect(run.report?.pieces).toBe(run.board?.pieces.length)
})

// The worker throws InvalidParamsError for parameters outside the envelope
// (pStraight's floor is 0.6, engine.ts:2452), and the page must show that
// message rather than hang in `running`.
test('parameters outside the envelope end in error with the engine message', async () => {
  useStore.getState().run.reset()
  await render(<Harness drive={start({ ...defaultParams(), W: 12, H: 12, pStraight: 0 })} />)
  await expect.poll(() => useStore.getState().run.phase, { timeout: 20_000 }).toBe('error')
  expect(useStore.getState().run.message ?? '').not.toBe('')
})

// Abort must terminate the worker, not merely relabel the slice: a live worker
// would deliver `done` afterwards and drag the run back out of idle. The wait
// is longer than the board takes, so a missing terminate() shows up.
test('abort terminates the worker, and nothing arrives afterwards', async () => {
  useStore.getState().run.reset()
  const terminate = vi.spyOn(Worker.prototype, 'terminate')
  await render(
    <Harness
      drive={(g) => {
        g.start({ ...defaultParams(), W: 200, H: 200, seed: 9 })
        const id = setTimeout(() => g.abort(), 30)
        return () => clearTimeout(id)
      }}
    />,
  )
  await expect.poll(() => useStore.getState().run.phase, { timeout: 20_000 }).toBe('idle')
  expect(terminate).toHaveBeenCalled()
  await new Promise((done) => setTimeout(done, 2_000))
  expect(useStore.getState().run.phase).toBe('idle')
  expect(useStore.getState().run.board).toBeNull()
  terminate.mockRestore()
})

// Progress is what the status line lives on during a long carve.
test('a large run reports progress before it finishes', async () => {
  useStore.getState().run.reset()
  await render(<Harness drive={start({ ...defaultParams(), W: 200, H: 200, seed: 11 })} />)
  await expect.poll(() => useStore.getState().run.progress !== null, { timeout: 20_000 }).toBe(true)
  await expect.poll(() => useStore.getState().run.phase, { timeout: 30_000 }).toBe('done')
  expect(useStore.getState().run.progress).toBeNull()
}, 40_000)
```

- [ ] **Step 2: Run the test to verify it fails**

Run: `pnpm --filter @arrowz/lab exec vitest run --project=chromium useGenerator`
Expected: FAIL — `Failed to resolve import "./useGenerator"`.

- [ ] **Step 3: Write the worker**

`apps/lab/src/worker/generate.worker.ts`:

```ts
import { decodeBoard, encodeBoard, generate, toSvg } from '@arrowz/engine'
import type { WorkerIn, WorkerOut } from '@arrowz/engine'

// The same two messages the Deno lab worker answers
// (packages/cli/lab-worker.ts), against the same engine: the protocol is
// shared, so §6 leaves it untouched. The finished board crosses as its board
// file — one packed record instead of ~90 000 piece objects — and it is the
// very file that goes to the store.
const post = (message: WorkerOut) => self.postMessage(message)

self.onmessage = (event: MessageEvent<WorkerIn>) => {
  const message = event.data
  if (message.type === 'svg') {
    try {
      post({ type: 'svg', svg: toSvg(decodeBoard(message.board), message.options) })
    } catch (err) {
      post({ type: 'error', message: err instanceof Error ? err.message : String(err) })
    }
    return
  }
  const started = performance.now()
  let result
  try {
    result = generate(message.params, { trace: (info) => post({ type: 'progress', info }) })
  } catch (err) {
    // Includes InvalidParamsError, whose message lists the violations.
    post({ type: 'error', message: err instanceof Error ? err.message : String(err) })
    return
  }
  post({
    type: 'done',
    ok: result.ok,
    metrics: result.metrics,
    backtracks: result.backtracks,
    restartsUsed: result.restartsUsed,
    genMs: result.genMs,
    metricsMs: result.metricsMs,
    totalMs: performance.now() - started,
    stuck: result.stuck,
    deadlock: result.deadlock,
    pieces: result.board.pieces.length,
    stats: result.board.stats,
    board: encodeBoard(result.board),
  })
}
```

- [ ] **Step 4: Write the hook**

`apps/lab/src/worker/useGenerator.ts`:

```ts
import { decodeBoard } from '@arrowz/engine'
import type { Params, WorkerIn, WorkerOut } from '@arrowz/engine'
import { useCallback, useEffect, useMemo, useRef } from 'react'
import { useStore } from '../state/store'

export interface Generator {
  start(params: Params): void
  abort(): void
}

// Module scope, so the callbacks below have no changing dependency to declare.
// The slice is read rather than subscribed to: this hook publishes state and
// never renders from it, and a subscription would re-render App — the whole
// shell — on every progress message.
const actions = () => useStore.getState().run

/**
 * One worker for the whole session, reused while idle and terminated to
 * abort. `generate()` is synchronous, so the worker's event loop is blocked
 * for a whole run and a second message would queue behind the first;
 * replacing a run means terminating the worker and building a new one, as the
 * Deno lab does (lab-page.ts:856, :879).
 *
 * Mounted once, in App: a route change must neither kill a run in flight nor
 * unmount <arrowz-board>, whose disposal releases the GL context.
 */
export function useGenerator(): Generator {
  const worker = useRef<Worker | null>(null)
  const busy = useRef(false)

  const kill = useCallback(() => {
    worker.current?.terminate()
    worker.current = null
    busy.current = false
  }, [])

  const ensure = useCallback((): Worker => {
    const existing = worker.current
    if (existing) return existing
    const made = new Worker(new URL('./generate.worker.ts', import.meta.url), { type: 'module' })
    made.onmessage = (event: MessageEvent<WorkerOut>) => {
      const message = event.data
      if (message.type === 'progress') {
        actions().progressed(message.info)
        return
      }
      if (message.type === 'done') {
        busy.current = false
        actions().finished({ board: decodeBoard(message.board), file: message.board, report: message })
        return
      }
      if (message.type === 'error') {
        busy.current = false
        actions().failed(message.message)
      }
    }
    made.onerror = (event) => {
      busy.current = false
      actions().failed(event.message)
    }
    worker.current = made
    return made
  }, [])

  // The worker outlives every route, and dies with the application.
  useEffect(() => kill, [kill])

  return useMemo<Generator>(
    () => ({
      start(params) {
        if (busy.current) kill()
        actions().started(params)
        busy.current = true
        ensure().postMessage({ type: 'generate', params } satisfies WorkerIn)
      },
      abort() {
        if (!busy.current) return
        kill()
        actions().aborted()
      },
    }),
    [ensure, kill],
  )
}
```

- [ ] **Step 5: Mount it in `App`**

`apps/lab/src/App.tsx` — the hook is called above the routes, and nothing consumes it yet (Task 10 gives it to the run bar):

```tsx
import { defaultParams } from '@arrowz/engine'
import { BrowserRouter } from 'react-router'
import { AppRoutes } from './AppRoutes'
import { TabRow } from './shell/TabRow'
import { TopBar } from './shell/TopBar'
import { useGenerator } from './worker/useGenerator'

const params = defaultParams()

function Shell() {
  // Above the routes on purpose: §6. A route change must not kill a run.
  useGenerator()
  return (
    <div className="fw">
      <TopBar W={params.W} H={params.H} />
      <TabRow />
      <AppRoutes />
    </div>
  )
}

export function App() {
  return (
    <BrowserRouter>
      <Shell />
    </BrowserRouter>
  )
}
```

`Shell` exists because `useGenerator` and, in Task 10, `useLocation` are hooks, and a hook cannot run in the component that renders `<BrowserRouter>` itself.

- [ ] **Step 6: Run the tests to verify they pass**

Run: `pnpm --filter @arrowz/lab exec vitest run --project=chromium`
Expected: PASS — routes, tabs and the four generator tests.

- [ ] **Step 7: Verify and commit**

```bash
pnpm --filter @arrowz/lab exec prettier --write .
pnpm nx run-many -t verify --projects=lab
git add apps/lab
git commit -m "Carve in a worker that outlives every route"
```

---

### Task 9: `BoardCanvas` — the only `@lit/react` site

`<arrowz-board>` takes the board and the view as **objects**. React on its own stringifies unknown props onto attributes, which would hand the element `"[object Object]"`; `createComponent` sets them as properties instead.

**Files:**
- Create: `apps/lab/src/stage/BoardCanvas.tsx`, `apps/lab/src/stage/Stage.tsx`
- Modify: `apps/lab/src/design/shell.css`
- Test: `apps/lab/src/stage/BoardCanvas.browser.test.tsx`

**Interfaces:**
- Consumes: `ArrowzBoard`, `boardViewOf`, `PieceClickEvent`, `ViewportChangeEvent` from `@arrowz/board-element`; `DEFAULT_VIEW` from `@arrowz/engine/command`
- Produces: `export const BoardCanvas` (the wrapped element) and `export function Stage(): JSX.Element`

- [ ] **Step 1: Install `@lit/react`**

```bash
pnpm --filter @arrowz/lab add @lit/react
```

- [ ] **Step 2: Write the failing test**

Create `apps/lab/src/stage/BoardCanvas.browser.test.tsx`:

```tsx
import { boardViewOf } from '@arrowz/board-element'
import { defaultParams, generate } from '@arrowz/engine'
import { DEFAULT_VIEW } from '@arrowz/engine/command'
import { expect, test } from 'vitest'
import { render } from 'vitest-browser-react'
import { BoardCanvas } from './BoardCanvas'

const board = generate({ ...defaultParams(), W: 10, H: 10, seed: 2 }).board
const view = boardViewOf(DEFAULT_VIEW, false)

test('the element receives the board as an object, not as an attribute', async () => {
  const screen = await render(<BoardCanvas board={board} view={view} interactive={false} />)
  const element = screen.container.querySelector('arrowz-board')
  expect(element).not.toBeNull()
  expect(element?.board?.pieces.length).toBe(board.pieces.length)
  // Had React written it as an attribute, this would be "[object Object]".
  expect(element?.getAttribute('board')).toBeNull()
})

test('the view reaches the element as an object too', async () => {
  const screen = await render(
    <BoardCanvas board={board} view={boardViewOf({ ...DEFAULT_VIEW, stroke: 3 }, false)} interactive={false} />,
  )
  expect(screen.container.querySelector('arrowz-board')?.view?.stroke).toBe(3)
})

test('a null board renders the element without drawing anything', async () => {
  const screen = await render(<BoardCanvas board={null} view={view} interactive={false} />)
  expect(screen.container.querySelector('arrowz-board')?.board).toBeNull()
})
```

- [ ] **Step 3: Run the test to verify it fails**

Run: `pnpm --filter @arrowz/lab exec vitest run --project=chromium BoardCanvas`
Expected: FAIL — `Failed to resolve import "./BoardCanvas"`.

- [ ] **Step 4: Write the wrapper and the stage**

`apps/lab/src/stage/BoardCanvas.tsx`:

```tsx
import { ArrowzBoard } from '@arrowz/board-element'
import type { PieceClickEvent, ViewportChangeEvent } from '@arrowz/board-element'
import { createComponent, type EventName } from '@lit/react'
import * as React from 'react'

/**
 * The application's only `@lit/react` site. The element takes the board and
 * the view as objects; React alone would stringify them onto attributes, and
 * `createComponent` sets properties instead. Importing the element class also
 * registers the tag.
 */
export const BoardCanvas = createComponent({
  tagName: 'arrowz-board',
  elementClass: ArrowzBoard,
  react: React,
  events: {
    onPieceClick: 'piece-click' as EventName<PieceClickEvent>,
    onViewportChange: 'viewport-change' as EventName<ViewportChangeEvent>,
  },
})
```

`apps/lab/src/stage/Stage.tsx`:

```tsx
import { boardViewOf } from '@arrowz/board-element'
import { DEFAULT_VIEW } from '@arrowz/engine/command'
import { useStore } from '../state/store'
import { BoardCanvas } from './BoardCanvas'

// Hoisted: a new object per render would change the element's `view` property
// identity on every progress message. The nine preview fields are PR 3, and
// this becomes a selector over the view slice then.
const VIEW = boardViewOf(DEFAULT_VIEW, false)

/**
 * 70px + 1fr: the mock's run rail and the board beside it. The rail is empty
 * until PR 7 fills it with the filmstrip; the column stays, so the board's
 * width does not move when it arrives.
 */
export function Stage() {
  const board = useStore((state) => state.run.board)
  return (
    <div className="fw-stage">
      <div className="fw-runs" />
      <div className="fw-boardwrap">
        <div className="fw-board">
          <BoardCanvas board={board} view={VIEW} interactive={false} />
        </div>
      </div>
    </div>
  )
}
```

Append to `apps/lab/src/design/shell.css`:

```css
.fw-stage {
  display: grid;
  grid-template-columns: 70px minmax(0, 1fr);
  gap: 1px;
  background: var(--border);
  min-height: 0;
}
.fw-runs {
  display: flex;
  flex-direction: column;
  gap: 2px;
  padding: 12px 8px;
  background: var(--void);
  overflow-y: auto;
}
.fw-boardwrap {
  position: relative;
  min-height: 0;
  padding: 16px;
  overflow: hidden;
  background: var(--void);
}
.fw-board {
  position: relative;
  height: 100%;
  min-height: 260px;
  background: var(--paper);
  border: 1px solid var(--border);
  overflow: hidden;
}
.fw-board arrowz-board {
  display: block;
  height: 100%;
}

/* The mock's second breakpoint: below this height the board gives up its
   minimum rather than pushing the console off the screen. */
@media (max-height: 700px) {
  .fw-board {
    min-height: 0;
  }
}
```

- [ ] **Step 5: Run the tests to verify they pass**

Run: `pnpm --filter @arrowz/lab exec vitest run --project=chromium BoardCanvas`
Expected: PASS, 3 tests.

- [ ] **Step 6: Verify and commit**

```bash
pnpm --filter @arrowz/lab exec prettier --write .
pnpm nx run-many -t verify --projects=lab
git add apps/lab pnpm-lock.yaml
git commit -m "Draw the board through @lit/react, with objects as properties"
```

---

### Task 10: The path this PR exists for — generate, draw, save

The lab panel is mounted in `App`, beside `<Routes>`, and hidden when the path is not `/` (Ruling 5). That is what makes the route-change test meaningful rather than decorative.

**Files:**
- Create: `apps/lab/src/routes/LabRoute.tsx`, `apps/lab/src/stage/RunStatusBar.tsx`
- Modify: `apps/lab/src/App.tsx`, `apps/lab/src/design/shell.css`
- Test: `apps/lab/src/routes/LabRoute.browser.test.tsx`

**Interfaces:**
- Consumes: `useGenerator`/`Generator` (Task 8), `Stage` (Task 9), `saveBoard` (Task 6), the `run` slice (Task 7), `selectedIndex` (Task 5)
- Produces: `export function LabRoute(props: { generator: Generator; params: Params; hidden: boolean }): JSX.Element`; `export function RunStatusBar(): JSX.Element`; `export function Shell(props: { params?: Params }): JSX.Element` from `App.tsx`

- [ ] **Step 1: Write the failing test**

Create `apps/lab/src/routes/LabRoute.browser.test.tsx`:

```tsx
import { defaultParams } from '@arrowz/engine'
import { BrowserRouter } from 'react-router'
import { expect, test, vi } from 'vitest'
import { userEvent } from 'vitest/browser'
import { render } from 'vitest-browser-react'
import { App, Shell } from '../App'
import { useStore } from '../state/store'

// The real App, address bar and all: Ruling 5's claim is about what App
// mounts, so a MemoryRouter harness would test the wrong thing.
async function mountApp() {
  window.history.pushState({}, '', '/')
  useStore.getState().run.reset()
  return render(<App />)
}

test('Generate carves a board, draws it, and says so', async () => {
  const errors: unknown[] = []
  const spy = vi.spyOn(console, 'error').mockImplementation((...args) => void errors.push(args[0]))
  try {
    const screen = await mountApp()
    await expect.element(screen.getByRole('status')).toHaveTextContent('Press "Generate".')

    await screen.getByRole('button', { name: 'Generate' }).click()
    await expect.poll(() => useStore.getState().run.phase, { timeout: 30_000 }).toBe('done')

    const element = screen.container.querySelector('arrowz-board')
    expect(element?.board?.pieces.length).toBeGreaterThan(0)
    await expect.element(screen.getByRole('status')).toMatchTextContent(/Board closed/)

    // §8: a full run from Generate to a drawn board with zero console errors.
    expect(errors).toEqual([])
  } finally {
    spy.mockRestore()
  }
}, 40_000)

// The architectural claim of this PR, and the one §11.6 of the spec says was
// got wrong once already. Node identity is the assertion that matters: a
// remounted element is a disposed GL context, whatever the run's phase says.
// This half needs no run at all, so it is fast and never races.
test('a route change keeps the very same board element', async () => {
  const screen = await mountApp()
  const before = screen.container.querySelector('arrowz-board')
  expect(before).not.toBeNull()

  await userEvent.click(screen.getByRole('tab', { name: 'Saved boards' }))
  await expect.element(screen.getByRole('tabpanel', { name: 'Saved boards' })).toBeVisible()
  // Same node, still in the document, merely hidden.
  expect(screen.container.querySelector('arrowz-board')).toBe(before)

  await userEvent.click(screen.getByRole('tab', { name: 'Lab' }))
  expect(screen.container.querySelector('arrowz-board')).toBe(before)
})

// The other half: a run in flight survives the same trip. It needs a board big
// enough to still be carving after a click round-trip (200×200 ≈ 330 ms in
// process; the defaults are 25×50 and finish in tens of milliseconds), so the
// shell is mounted directly with those parameters.
test('a run in flight survives a route change', async () => {
  window.history.pushState({}, '', '/')
  useStore.getState().run.reset()
  const screen = await render(
    <BrowserRouter>
      <Shell params={{ ...defaultParams(), W: 200, H: 200, seed: 9 }} />
    </BrowserRouter>,
  )
  await screen.getByRole('button', { name: 'Generate' }).click()
  await expect.poll(() => useStore.getState().run.phase).toBe('running')

  await userEvent.click(screen.getByRole('tab', { name: 'Saved boards' }))
  // Still running right after the trip: nothing terminated the worker.
  expect(useStore.getState().run.phase).toBe('running')

  await expect.poll(() => useStore.getState().run.phase, { timeout: 30_000 }).toBe('done')
  expect(useStore.getState().run.board?.W).toBe(200)
}, 40_000)

test('the lab panel is hidden off-route and shown on it', async () => {
  const screen = await mountApp()
  const panel = screen.container.querySelector('#lab-panel')
  expect(panel?.hasAttribute('hidden')).toBe(false)
  await userEvent.click(screen.getByRole('tab', { name: 'Docs' }))
  expect(screen.container.querySelector('#lab-panel')?.hasAttribute('hidden')).toBe(true)
})

test('a finished run is offered to the store and the outcome is appended', async () => {
  const screen = await mountApp()
  await screen.getByRole('button', { name: 'Generate' }).click()
  await expect.poll(() => useStore.getState().run.saved !== null, { timeout: 30_000 }).toBe(true)
  // No store server answers in the browser test, so the outcome is a failure —
  // and the run's own outcome must survive beside it.
  expect(useStore.getState().run.phase).toBe('done')
  await expect.element(screen.getByRole('status')).toMatchTextContent(/not saved|saved/)
}, 40_000)
```

- [ ] **Step 2: Run the test to verify it fails**

Run: `pnpm --filter @arrowz/lab exec vitest run --project=chromium LabRoute`
Expected: FAIL — no button named `Generate`.

- [ ] **Step 3: Write the status bar**

`apps/lab/src/stage/RunStatusBar.tsx`:

```tsx
import { useDictionary } from '../i18n'
import { useStore } from '../state/store'

/**
 * The live region. The mock's run state has no `aria-live`, so a screen reader
 * would never learn that a thirty-second carve had finished (§7.2). `<output>`
 * already has the `status` role — writing it again is what
 * `jsx-a11y/no-redundant-roles` exists to catch.
 */
export function RunStatusBar() {
  const dict = useDictionary()
  const run = useStore((state) => state.run)

  let text: string
  if (run.phase === 'running') {
    const p = run.progress
    // The old lab's own arithmetic (`lab-page.ts:785-787`): the share done is
    // measured in cells left, not pieces made, and the two counts are
    // abbreviated with `short`, not `fmt`.
    text = p === null
      ? dict.t('generating')
      : dict.t(
        'progress',
        (100 * (1 - p.remaining / p.total)).toFixed(1),
        dict.short(p.pieces),
        dict.short(p.remaining),
        p.backtracks,
        (p.ms / 1000).toFixed(1),
      )
  } else if (run.phase === 'error') {
    // The worker reports a thrown InvalidParamsError as `error`; onerror is
    // the other, rarer case. The old lab keeps the two words apart, and so
    // does this (lab-i18n.ts:119-120).
    text = `${dict.t('generationError')} ${run.message ?? ''}`
  } else if (run.phase !== 'done' || run.report === null) {
    text = dict.t('pressGenerate')
  } else if (run.report.ok) {
    text = dict.t('closed')
  } else if (run.report.deadlock) {
    text = dict.t('unsolvable')
  } else {
    const stuck = run.report.stuck
    text = dict.t('notClosedStatus', dict.fmt(stuck?.remaining ?? 0), stuck?.sizes.length ?? 0, stuck?.sizes[0] ?? 0)
  }

  // The store's answer is appended, never substituted: a missing store must
  // not overwrite what the run itself reported (§5.3).
  const saved = run.saved === null ? '' : ` — ${run.saved.ok ? dict.t('saved') : dict.t('notSaved')}`
  return <output aria-live="polite">{`${text}${saved}`}</output>
}
```

`dict.t('progress', …)` renders HTML tags in the old lab (`<b>`); here it is plain text in a `<output>`, which is what `aria-live` needs. The tags appear literally; PR 4 replaces this line with the report's own markup. Note it in a comment so nobody "fixes" it by reaching for `dangerouslySetInnerHTML`.

- [ ] **Step 4: Write the lab panel**

`apps/lab/src/routes/LabRoute.tsx`:

```tsx
import type { Params } from '@arrowz/engine'
import { useDictionary } from '../i18n'
import { RunStatusBar } from '../stage/RunStatusBar'
import { Stage } from '../stage/Stage'
import { useStore } from '../state/store'
import type { Generator } from '../worker/useGenerator'

/**
 * Always mounted, `hidden` when the route is elsewhere (Ruling 5). The run
 * column of §5.1 arrives in PR 3 and takes the button with it; `params` comes
 * from the shell until the params slice does (PR 3).
 */
export function LabRoute({
  generator,
  params,
  hidden,
}: {
  generator: Generator
  params: Params
  hidden: boolean
}) {
  const dict = useDictionary()
  const running = useStore((state) => state.run.phase === 'running')
  return (
    <main id="lab-panel" hidden={hidden}>
      <section role="tabpanel" aria-labelledby="tab-lab-panel" tabIndex={0} className="fw-view">
        <div className="fw-bar">
          <button type="button" className="fw-go" onClick={() => generator.start(params)} disabled={running}>
            {dict.t('generate')}
          </button>
          <RunStatusBar />
        </div>
        <Stage />
      </section>
    </main>
  )
}
```

- [ ] **Step 5: Mount the panel and the save effect in `App`**

`apps/lab/src/App.tsx`:

```tsx
import { defaultParams } from '@arrowz/engine'
import type { BoardFile, Params } from '@arrowz/engine'
import { DEFAULT_VIEW, storeRequest } from '@arrowz/engine/command'
import { useEffect, useRef } from 'react'
import { BrowserRouter, useLocation } from 'react-router'
import { saveBoard } from './api/boards'
import { AppRoutes } from './AppRoutes'
import { LabRoute } from './routes/LabRoute'
import { selectedIndex, TabRow } from './shell/TabRow'
import { TopBar } from './shell/TopBar'
import { useStore } from './state/store'
import { useGenerator } from './worker/useGenerator'

const DEFAULTS = defaultParams()

/**
 * Saves each finished run once. `App` subscribes to one field rather than to
 * the slice: a subscription to `run` would re-render the shell on every
 * progress message. The guard keys on the file object's identity, which is
 * fresh per run even when two runs carve the same board, so pressing Generate
 * twice with the same seed still reports a save both times.
 */
function useStoreSave() {
  const file = useStore((state) => state.run.file)
  const posted = useRef<BoardFile | null>(null)
  useEffect(() => {
    const { phase, params: runParams, report } = useStore.getState().run
    if (phase !== 'done' || file === null || runParams === null || report === null) return
    if (posted.current === file) return
    posted.current = file
    // The stored view is the lab's view with top zeroed, as the old lab
    // stores it (`storeView()` in lab-page.ts).
    const request = storeRequest(file, runParams, { ...DEFAULT_VIEW, top: 0 }, 'lab', {
      ok: report.ok,
      pieces: report.pieces,
      maxLen: report.metrics?.maxLen ?? null,
      genMs: report.genMs,
      restarts: report.restartsUsed,
      backtracks: report.backtracks,
      stuck: report.stuck,
    })
    void saveBoard(request).then((outcome) => useStore.getState().run.stored(outcome))
  }, [file])
}

/**
 * Exported for the browser tests: `params` is what Generate starts a run with,
 * and a test that must observe a run *in flight* needs a board bigger than the
 * defaults, which carve in tens of milliseconds. PR 3 replaces the prop with
 * the params slice.
 */
export function Shell({ params = DEFAULTS }: { params?: Params }) {
  // Above the routes on purpose: §6 and Ruling 5.
  const generator = useGenerator()
  const onLab = selectedIndex(useLocation().pathname) === 0
  useStoreSave()
  return (
    <div className="fw">
      <TopBar W={params.W} H={params.H} />
      <TabRow />
      <LabRoute generator={generator} params={params} hidden={!onLab} />
      <AppRoutes />
    </div>
  )
}

export function App() {
  return (
    <BrowserRouter>
      <Shell />
    </BrowserRouter>
  )
}
```

The lab panel and `<Routes>` are siblings in the shell's third grid row; only one of them ever has content, because `/` renders no route element.

- [ ] **Step 6: Add the run bar's styles**

Append to `apps/lab/src/design/shell.css`:

```css
.fw-view {
  display: grid;
  grid-template-rows: auto minmax(0, 1fr);
  min-height: 0;
  background: var(--void);
}
.fw-bar {
  display: flex;
  align-items: center;
  gap: 20px;
  padding: 10px 16px;
  border-bottom: 1px solid var(--border);
  color: var(--ash);
  flex-wrap: wrap;
}
.fw-bar output {
  font-variant-numeric: tabular-nums;
}
.fw-go {
  height: 32px;
  padding: 0 14px;
  border: 0;
  background: var(--signal);
  color: var(--void);
  font-family: var(--ui);
  cursor: pointer;
  transition: background 120ms cubic-bezier(0.2, 0, 0, 1);
}
.fw-go:hover:not(:disabled) {
  background: var(--signal-hover);
}
.fw-go:active:not(:disabled) {
  background: var(--signal-press);
}
.fw-go:disabled {
  opacity: 0.5;
  cursor: default;
}

@media (pointer: coarse) {
  .fw-go {
    height: 44px;
  }
}
```

- [ ] **Step 7: Run the tests to verify they pass**

Run: `pnpm --filter @arrowz/lab exec vitest run --project=chromium`
Expected: PASS, every browser test.

If the "zero console errors" assertion fails on a React `act` warning, fix the component rather than the assertion: a state update outside React's knowledge is exactly the class of bug that assertion exists to catch.

- [ ] **Step 8: Verify and commit**

```bash
pnpm --filter @arrowz/lab exec prettier --write .
pnpm nx run-many -t verify --projects=lab
git add apps/lab
git commit -m "Walk one path end to end: generate, draw, save"
```

---

### Task 11: Engine parity through Vite's transform

`lab-bundle.test.ts:61-88` runs the **Deno-bundled** worker and compares its board's fingerprint against an in-process `generate()`. This is the same idea for the Vite side, and Ruling 9 is honest about its reach: in browser mode Vite serves the worker as transformed modules, so this catches a wrong alias, a dropped subpath export or a module the transform reorders — not a rollup or minifier fault. The test over the built artefact is a prerequisite of PR 8 and is recorded in Task 12.

**Files:**
- Test: `apps/lab/src/worker/parity.browser.test.ts`

**Interfaces:**
- Consumes: `generate`, `decodeBoard`, `encodeBoard`, `fingerprint`, `toSvg` from `@arrowz/engine`; `DEFAULT_VIEW`, `svgOptions` from `@arrowz/engine/command` (`svgOptions` is exported from `command.ts:252` and is **not** re-exported by `mod.ts`)
- Produces: nothing — this task adds only a test

- [ ] **Step 1: Write the test**

Create `apps/lab/src/worker/parity.browser.test.ts`:

```ts
import { decodeBoard, defaultParams, encodeBoard, fingerprint, generate, toSvg } from '@arrowz/engine'
import type { WorkerIn, WorkerOut } from '@arrowz/engine'
import { DEFAULT_VIEW, svgOptions } from '@arrowz/engine/command'
import { expect, test } from 'vitest'

// The counterpart of packages/cli/lab-bundle.test.ts, which proves the
// Deno-bundled worker carves the board the engine carves and which PR 8
// deletes with the old lab. This proves it for the engine as Vite transforms
// it; the build-output test is PR 8's prerequisite (Ruling 9).
function ask(message: WorkerIn): Promise<WorkerOut> {
  const worker = new Worker(new URL('./generate.worker.ts', import.meta.url), { type: 'module' })
  return new Promise<WorkerOut>((resolve, reject) => {
    worker.onmessage = (event: MessageEvent<WorkerOut>) => {
      // Progress messages precede the answer; only the answer resolves.
      if (event.data.type !== 'progress') resolve(event.data)
    }
    worker.onerror = (event) => reject(new Error(event.message))
  }).finally(() => worker.terminate())
}

test('the worker carves the board the engine carves', async () => {
  const params = { ...defaultParams(), W: 20, H: 20, seed: 7 }
  const answer = await ask({ type: 'generate', params })
  expect(answer.type).toBe('done')
  if (answer.type !== 'done') return

  const mine = generate(params)
  expect(fingerprint(decodeBoard(answer.board))).toBe(fingerprint(mine.board))
  // The file carries its own fingerprint; if the two agree, the record that
  // reaches the store is the board that was drawn.
  expect(answer.board.fingerprint).toBe(fingerprint(mine.board))
  expect(answer.pieces).toBe(mine.board.pieces.length)
}, 30_000)

test('the worker draws the SVG the engine draws', async () => {
  const params = { ...defaultParams(), W: 20, H: 20, seed: 7 }
  const mine = generate(params)
  const options = svgOptions(DEFAULT_VIEW)
  const answer = await ask({ type: 'svg', board: encodeBoard(mine.board), options })
  expect(answer.type).toBe('svg')
  if (answer.type !== 'svg') return
  expect(answer.svg).toBe(toSvg(mine.board, options))
}, 30_000)
```

- [ ] **Step 2: Run the test**

Run: `pnpm --filter @arrowz/lab exec vitest run --project=chromium parity`
Expected: PASS, 2 tests. If the fingerprints differ, do not adjust the test — a mismatch means the application and the CLI carve different boards.

- [ ] **Step 3: Commit**

```bash
pnpm --filter @arrowz/lab exec prettier --write .
git add apps/lab
git commit -m "Pin engine parity through the Vite-transformed worker"
```

---

### Task 12: Close the PR

**Files:**
- Modify: `README.md`, `README.pl.md`
- Verify: everything

- [ ] **Step 1: Name the project in both READMEs**

Neither README has a package-layout list; the lab is described in prose under `## The web page` in `README.md` (around `:808-830`) and its Polish twin in `README.pl.md` (around `:817`). Confirm the headings first:

```bash
grep -n "^## " README.md | sed -n '1,40p'
grep -n "^## " README.pl.md | sed -n '1,40p'
```

Append one paragraph to that section in each file, in the file's own language: the React lab is being built at `apps/lab`, it runs with `pnpm nx serve lab` beside `deno task lab` for the board store, and it replaces the page described above in a later step.

- [ ] **Step 2: Run both gates**

```bash
cd /Users/tomek/dev/arrowz
deno task verify
pnpm nx run-many -t verify
```

Expected: both green. `deno task verify` covers Task 3; the Nx run covers `apps/lab` and proves the new project broke neither `engine`, `cli` nor `board-element`.

- [ ] **Step 3: Confirm the project entered CI without a workflow change**

```bash
pnpm nx show project lab --json | node -e "let s='';process.stdin.on('data',d=>s+=d).on('end',()=>console.log(Object.keys(JSON.parse(s).targets)))"
```

Expected: `check`, `lint`, `fmt`, `test`, `build`, `serve`, `verify`. CI runs `nx affected -t check lint fmt test build smoke bundle`, so six of those seven run there with no edit to `.github/workflows/ci.yml`; `apps/lab` declares no `smoke` or `bundle` target and Nx skips what a project does not have.

- [ ] **Step 4: Run the application by hand, against the real store**

```bash
deno task lab            # the board store on 8777, in one terminal
pnpm nx serve lab        # the application on 8779, in another
```

Open `http://localhost:8779/`, press Generate, and check four things the tests cannot: the board appears inside the element's own control bar; the status line reports the save; `packages/cli/boards/` gained a directory; and a reload of `http://localhost:8779/boards` serves the application rather than the store's 404.

- [ ] **Step 5: Record the CI timing of the two browser projects**

The first CI run of this branch is the first time `apps/lab`'s Chromium tests and `board-element`'s share a runner. `lab`'s `test` target carries `"parallelism": false`, so Nx will not run it beside another task, but the two projects still run in sequence on a two-core box. Read the job's timing from `gh run view --log` and note in the PR whether either project's browser tests slowed by more than half; if they did, say so rather than leaving the next person to discover it.

- [ ] **Step 6: Write down what PR 8 must not forget**

Add to the PR description, and to the memory note for this session: **before PR 8 deletes `lab-bundle.test.ts`, `apps/lab` needs a parity test over the output of `vite build`**, not only over Vite's transform (Ruling 9). The shape that works: a `*.node.test.ts` that calls Vite's `build()` into a temporary directory, serves it, and drives the emitted worker in Playwright against an in-process `generate()`.

- [ ] **Step 7: Commit and open the pull request**

```bash
git add README.md README.pl.md
git commit -m "Name apps/lab in both READMEs"
git push -u origin lab/app-skeleton
gh pr create --base lab/logic-extraction \
  --title "The generator lab as a React application: the skeleton" \
  --body "$(cat <<'MD'
PR 2 of `docs/superpowers/specs/2026-09-13-lab-react-app-design.md` (§10).

**What is here.** `apps/lab`: Vite 8 + React 19, its own ESLint 10 and
Prettier, an Nx project that enters both gates, the design system's fourteen
colour tokens and two font tokens, the shell (top bar and a tab strip with the
full tablist pattern), three routes, the board-store client behind a Vite
proxy, the run slice, one long-lived generation worker with `useGenerator`
mounted above the routes, the board drawn through `@lit/react`, and one path
walked end to end: Generate, carve, draw, save.

**It overturns §9.1 of the spec, with a measurement.** The spec asks for a
`proxyReq` hook that rewrites `Origin`. Measured against Vite 8.2.2: the hook
is only needed because `changeOrigin` would be set, and `changeOrigin` is not
needed at all — forwarding the browser's own `Host` keeps `Host` and `Origin`
consistent, which is exactly what `lab-server.ts:66-79` checks. The proxy is a
target and nothing else, and `boards.node.test.ts` holds that line against both
a 403 and the `/boards` prefix swallowing the application's own route.

**Three tests earn their place.** `tokens.test.ts` pins the sixteen tokens the
spec keeps, including the two the mock declares and never uses.
`parity.browser.test.ts` proves the Vite-transformed worker carves the board
the engine carves. `LabRoute.browser.test.tsx` asserts that a route change
leaves the *same* `<arrowz-board>` node in the document — node identity, not
the run's phase, because a remounted element is a disposed GL context whatever
the phase says.

**What is deliberately absent**, each with its own PR: the knob console (3),
the simple view, the language switch and the report (4), the library (5), the
docs content (6), the run filmstrip and the ⌘K palette (7). The old lab in
`packages/cli` is untouched and retires in PR 8 — which first needs a parity
test over the output of `vite build`, not only over Vite's transform.

**Stacked on #63.** Retarget with `gh pr edit --base main` once that merges.
MD
)"
```

---

## What changed in revision 2

Three adversarial reviews found defects worth recording, because several were decisions dressed as details.

1. **The board was mounted under a route** — §11.6 of the spec is the record of that exact mistake being made and corrected once already. The plan's own Ruling 5 and file-structure block said `App` owned it while the code in Tasks 9 and 10 put it inside `LabRoute`. The panel is now mounted in `App` and hidden off-route, `/` maps to `element={null}`, and the test asserts **node identity** across a route change rather than the run's phase, which would have passed with the claim false.
2. **§9.1's `Origin` rewrite was unnecessary.** Measured: `changeOrigin` is what creates the 403 the spec predicts. The proxy is now a bare target, and the keys carry trailing slashes so `/boards` reaches the application rather than the store.
3. **`BoardFile` is an object, not a string** (`types.ts:151-165`). A `toMatch` assertion would have thrown and a `useRef<string | null>` would have failed `check`.
4. **Four ESLint and matcher facts, each of which stopped the plan at its own "expected PASS"**: `reactHooks.configs['recommended-latest']` is the legacy shape that ESLint 10 rejects (the flat one is `configs.flat.recommended`); `projectService` errors on files no tsconfig includes; `toHaveTextContent` is exact equality and `toMatchTextContent` is the regex matcher, with timeouts belonging to `expect.element`; `<output role="status">` trips `jsx-a11y/no-redundant-roles`, which this plan's own Task 2 turns on.
5. **`userEvent` comes from `vitest/browser`.** Verified in the installed tree: `vitest/browser/context.d.ts` re-exports `@vitest/browser-playwright/context`, which is already a dependency.
6. **Two tests proved nothing.** The route-change test raced a 25×50 board that carves in tens of milliseconds, and the abort test read the slice synchronously, so an `abort()` that never terminated the worker would have passed. Both now use a 200×200 board, and abort spies on `Worker.prototype.terminate` and waits past the run.
7. **`dictionary('en')` as a module constant in four files** made Ruling 1's promise false. One `useDictionary()` hook replaces them.
8. **The parity test was named for something it does not do.** In browser mode Vite serves transformed modules; `vite build` never runs. Ruling 9 says so, and the build-output test is written down as PR 8's prerequisite instead of being implied here.
9. **Smaller, all real:** `prettier --write` is now a step in every task rather than a single pass in Task 2 (the plan's own snippets are hand-formatted); the integration test binds `127.0.0.1` with `strictPort` (Vite's default `localhost` resolves to `::1` on Node 24, refusing every fetch to `127.0.0.1`) and fails loudly if `deno` is missing; `types: []` stays project-wide with a triple-slash reference in the one file that needs Node; `role="tabpanel"` moved off `<main>`, which it was erasing, onto a labelled child with `tabIndex={0}`; `aria-controls` is set only on the selected tab, because the other panels are not in the document; `lab-page.ts` anchors were stale after PR 1; the READMEs have no layout list to add to; and `test` carries `"parallelism": false` so two software-rendered Chromiums do not meet on a two-core runner.
