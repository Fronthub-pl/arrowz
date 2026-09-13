# Lab application skeleton (PR 2) Implementation Plan

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:subagent-driven-development (recommended) or superpowers:executing-plans to implement this plan task-by-task. Steps use checkbox (`- [ ]`) syntax for tracking.

**Goal:** Stand up `apps/lab` as a Vite + React project that enters both gates, carries the design system's tokens, routes, talks to the board store through a proxy that survives the server's CSRF refusal, and walks one path end to end — press Generate, watch a worker carve, draw the board in `<arrowz-board>`, save it to the store.

**Architecture:** The application is assembled bottom-up in twelve tasks, each of which leaves the repository green. The project joins Nx before it has any behaviour (Task 1), acquires its own linter (Task 2), then routes (Task 4), a shell (Task 5), a store client (Task 6), a run state machine (Task 7), a worker (Task 8), a board (Task 9), and only then the path that ties them together (Task 10). Two tasks exist purely to stop something from silently rotting: Task 3 adds the dictionary key the third tab needs on the Deno side, and Task 11 gives the Vite-built worker the fingerprint test that `lab-bundle.test.ts` gives the Deno-bundled one.

**Tech Stack:** Vite 8, React 19, React Router 8 (declarative mode), Zustand 5, `@lit/react`, Vitest 5 with a Node project and a Playwright Chromium browser project, ESLint 10 flat config with `typescript-eslint`, `eslint-plugin-react-hooks` and `eslint-plugin-jsx-a11y`, Prettier 3.9, Nx 23, pnpm 12, Node 24.

**Spec:** `docs/superpowers/specs/2026-09-13-lab-react-app-design.md` (§3, §4.3, §4.4, §5.1, §5.3, §6, §7.1, §8, §9, §10 row "2")

## Global Constraints

- Everything in the repository is in English: code, identifiers, comments, tests, documentation, branch names, commit messages, PR titles and descriptions. Conversation with the user is Polish; nothing Polish goes into files except translation dictionaries.
- No `any`, no non-null assertions — in `apps/lab` these are ESLint rules, since `deno lint` does not read `apps/`.
- `deno.json` excludes `apps/` from `fmt`, `lint`, `test` and type checking, and **stays that way**. `apps/lab` is formatted by Prettier and linted by ESLint.
- Prettier is configured to match the repository's `deno fmt` settings: no semicolons, single quotes, print width 120. A reviewer moving between `packages/` and `apps/` must not see a different dialect.
- `packages/engine/dist/` and `packages/board-element/dist/` are gitignored and produced by `pnpm nx build engine` / `pnpm nx build board-element`. Every `apps/lab` target that compiles or runs code carries `dependsOn: ["^build"]`.
- `apps/lab` depends on `@arrowz/engine` and `@arrowz/board-element` **by package name**, never by relative path, and never on the engine's `.ts` sources.
- `apps/lab` pins the **same `playwright` version as `packages/board-element`** so CI's cached Chromium is shared. CI installs the browser with `pnpm --filter @arrowz/board-element exec playwright install --with-deps chromium`; a different version would download a second one on every run.
- `pnpm nx run-many -t verify` must be green before the PR, and `deno task verify` must stay green (Task 3 is the only task that touches Deno-side code).
- Never spread arrays proportional to the number of cells or pieces (`Math.min(...arr)`) — it overflows the worker stack in Chrome.
- No attribution lines in commit messages or pull request descriptions.
- Branch: `lab/app-skeleton`, stacked on `lab/logic-extraction` (PR #63). The pull request is opened with `--base lab/logic-extraction`; when #63 merges, retarget with `gh pr edit --base main`.

## Rulings I made

The spec does not decide these, and an implementer who guesses differently produces work that PR 3 has to undo. They are rulings, not questions.

1. **Texts come from `dictionary('en')` from the first commit, not from string literals.** The language switch and the `lang` slice are PR 4, but the dictionary already exists (`@arrowz/engine/i18n`) and already has the keys. Literals would mean a sweep through every component in PR 4; a fixed `'en'` argument means PR 4 changes one call site.
2. **PR 2 introduces the Zustand store with exactly one slice, `run`.** `useGenerator` is mounted in `App` and read in `LabRoute`; without a store the state would travel by props through the router, and PR 3 would rewrite it. The other six slices of §5.3 stay unwritten.
3. **`run.slice` holds no history in PR 2.** History exists for the filmstrip, which is PR 7. The state machine is written so that adding history is an addition, not a change: the current run is one field.
4. **The three routes exist from Task 4, two of them as a heading and a paragraph.** A tab strip with a dead tab cannot be tested; a tab strip whose third tab reaches an empty `<main>` can.
5. **`AppRoutes` is separated from `App`.** `App` owns `<BrowserRouter>`, `useGenerator` and the board; `AppRoutes` owns `<Routes>`. Browser tests wrap `AppRoutes` in `<MemoryRouter>`; nothing else can test routing without touching the address bar.
6. **The dev server listens on 8779.** `lab-server.ts` holds 8777 and `board-element`'s demo holds 8778.
7. **`apps/lab` gets `@types/node` and `"types": ["node"]`,** because Task 6's integration test spawns the Deno lab server. An ESLint rule confines `node:` imports to `*.node.test.ts`, so the application code cannot quietly acquire a Node dependency.

## File structure after this PR

```
apps/lab/
  package.json              deps, scripts (check, lint, fmt, test, build, serve)
  project.json              the Nx targets, shaped like board-element's
  tsconfig.json             strict, bundler resolution, react-jsx
  index.html                the Vite entry
  vite.config.ts            react plugin, port 8779, the proxy with the Origin rewrite
  vitest.config.ts          two projects: node and chromium
  vitest.setup.ts           imports vitest-browser-react's types and matchers
  eslint.config.js          flat config: js, typescript-eslint, react-hooks, jsx-a11y
  .prettierrc.json          no semicolons, single quotes, width 120
  .prettierignore           dist
  src/
    vite-env.d.ts           /// <reference types="vite/client" />
    main.tsx                mount
    App.tsx                 BrowserRouter, useGenerator, the single BoardCanvas
    AppRoutes.tsx           <Routes>, testable without the address bar
    shell/
      TopBar.tsx            mark, name, dims, right group
      TabRow.tsx            role="tablist", arrow keys, Home/End, aria-controls
    routes/
      LabRoute.tsx          the stage, Generate, the run status line
      SavedBoardsRoute.tsx  heading and a paragraph (PR 5 fills it)
      DocsRoute.tsx         heading and a paragraph (PR 6 fills it)
    stage/
      Stage.tsx             70px + 1fr, the board frame
      BoardCanvas.tsx       createComponent(<arrowz-board>) — the only @lit/react site
    state/
      store.ts              the Zustand store
      run.slice.ts          idle | running | done | error
      run.slice.test.ts
    worker/
      generate.worker.ts    imports @arrowz/engine, speaks WorkerIn/WorkerOut
      useGenerator.ts       one long-lived worker, replace-by-terminate
      fingerprint.browser.test.ts
    api/
      boards.ts             GET / POST against the store
      boards.node.test.ts   against a live lab-server behind a live Vite proxy
    design/
      tokens.css            14 colour tokens + 2 font tokens
      tokens.test.ts        pins exactly those sixteen
      shell.css             the ported shell rules of §7.1
```

Files this PR modifies outside `apps/lab`:

- `packages/engine/lab-i18n.ts` — one key in `EN.ui` and one in `PL.ui` (Task 3)
- `packages/engine/lab-i18n.test.ts` — the assertion for it (Task 3)
- `README.md` / `README.pl.md` — the new project in the layout section (Task 12)

Nothing in `packages/cli` changes. The old lab keeps working until PR 8.

---

### Task 1: The project enters both gates

An empty React application that Nx can `check`, `test`, `build` and `verify`, carrying the design system's tokens and one test that pins them. The token test is not ceremony: §7.1 drops two of the mock's eighteen custom properties, and nothing but a test remembers that.

**Files:**
- Create: `apps/lab/package.json`
- Create: `apps/lab/project.json`
- Create: `apps/lab/tsconfig.json`
- Create: `apps/lab/index.html`
- Create: `apps/lab/vite.config.ts`
- Create: `apps/lab/vitest.config.ts`
- Create: `apps/lab/src/vite-env.d.ts`
- Create: `apps/lab/src/main.tsx`
- Create: `apps/lab/src/App.tsx`
- Create: `apps/lab/src/design/tokens.css`
- Test: `apps/lab/src/design/tokens.test.ts`

**Interfaces:**
- Consumes: nothing
- Produces: the package name `@arrowz/lab`, the Nx project name `lab`, and `export function App(): JSX.Element` from `src/App.tsx`

- [ ] **Step 1: Create the package and install the dependencies**

The versions are not written into `package.json` by hand — `pnpm add` resolves them and writes the ranges. Two are constrained:

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

Vite, Vitest and Playwright must match `packages/board-element` exactly, so read its versions and install those:

```bash
node -e "const p=require('./packages/board-element/package.json');console.log(p.devDependencies.vite,p.devDependencies.vitest,p.devDependencies.playwright,p.devDependencies['@vitest/browser-playwright'])"
```

Install the four printed ranges verbatim:

```bash
pnpm --filter @arrowz/lab add -D vite@<printed> vitest@<printed> playwright@<printed> @vitest/browser-playwright@<printed>
```

- [ ] **Step 2: Write the failing test**

Create `apps/lab/src/design/tokens.test.ts`:

```ts
import { expect, test } from 'vitest'
import tokens from './tokens.css?raw'

const declared = [...tokens.matchAll(/^\s*(--[\w-]+):/gm)].map((m) => m[1])

// The mock defines eighteen custom properties (fronthub-workshop-v2.css:11-29).
// Spec §7.1 keeps sixteen: fourteen colours and two fonts, in the mock's order.
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

// Defined by the mock and never used by it. Copying them would import two
// dead names into a design system that is about to be extended.
test('the two unused tokens of the mock are not ported', () => {
  expect(declared).not.toContain('--ok')
  expect(declared).not.toContain('--signal-soft')
})
```

- [ ] **Step 3: Run the test to verify it fails**

First create the remaining configuration so Vitest can start at all:

```bash
cat > apps/lab/vitest.config.ts <<'TS'
import { defineConfig } from 'vitest/config'

// One project for now; Task 4 adds the Chromium one beside it.
export default defineConfig({
  test: {
    projects: [
      {
        test: {
          name: 'node',
          environment: 'node',
          include: ['src/**/*.test.ts', 'src/**/*.test.tsx'],
          exclude: ['src/**/*.browser.test.ts', 'src/**/*.browser.test.tsx'],
        },
      },
    ],
  },
})
TS
```

Run: `pnpm --filter @arrowz/lab exec vitest run`
Expected: FAIL — `Failed to resolve import "./tokens.css?raw"`.

- [ ] **Step 4: Write the tokens**

Create `apps/lab/src/design/tokens.css`:

```css
/* The Fronthub design system's tokens as the workshop mock declares them
   (fronthub-workshop-v2.css:11-29), minus `--ok` and `--signal-soft`, which
   the mock defines and never uses. `--error` and `--border-strong` are the
   opposite case: used by the mock, absent from the design system's own token
   list, and flagged there rather than resolved here (spec §7.1).

   Dark is the only theme, radius is zero everywhere except the switch and the
   ready dot, `--signal` carries state and data only, and `--warn` is reserved
   for a clamped value or a rule bound. */
.fw {
  --void: #0E0F12;
  --graphite: #16171B;
  --surface: #1C1F24;
  --border: #2A2C33;
  --border-strong: #3A3E47;
  --ash: #8A8F99;
  --mist: #A9AEB8;
  --ink: #EDEEF2;
  --paper: #F4F5F8;
  --signal: #5E6AD2;
  --signal-hover: #6F7ADB;
  --signal-press: #4C57BE;
  --warn: #D9A038;
  --error: #DE5C4E;
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
    "types": ["node"],
    "jsx": "react-jsx",
    "noEmit": true,
    "skipLibCheck": true,
    "verbatimModuleSyntax": true,
    "isolatedModules": true,
    "noUnusedLocals": true,
    "noUnusedParameters": true
  },
  "include": ["src", "vite.config.ts", "vitest.config.ts"]
}
```

`moduleResolution: "bundler"` rather than `board-element`'s `nodenext`: this project is bundled by Vite rather than emitted by `tsc`, and `bundler` is what reads `@arrowz/engine`'s `exports` map without demanding file extensions in every import.

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

`lint` and `fmt` join `verify` in Task 2. `serve` carries `dependsOn: ["^build"]` explicitly because `nx.json`'s default puts it on `build` alone, and a fresh clone has no `packages/engine/dist/`.

- [ ] **Step 8: Verify the project through Nx**

Run: `pnpm nx run-many -t verify --projects=lab`
Expected: `check`, `test` and `build` all pass. If `check` fails on an unresolved `@arrowz/engine`, run `pnpm nx build engine` and read `apps/lab/node_modules/@arrowz/engine` — the workspace link must point at `packages/engine`.

- [ ] **Step 9: Commit**

```bash
git add apps/lab pnpm-lock.yaml
git commit -m "Stand up apps/lab with the design system's tokens"
```

---

### Task 2: The project's own linter and formatter

`deno lint` and `deno fmt` do not read `apps/`, so the two rules the repository cares about most — no `any`, no non-null assertions — are unenforced in this project until ESLint arrives. `jsx-a11y` is here for a reason the spec states plainly: the mock has nine classes of accessibility gap, and the port must not inherit them.

**Files:**
- Create: `apps/lab/eslint.config.js`
- Create: `apps/lab/.prettierrc.json`
- Create: `apps/lab/.prettierignore`
- Modify: `apps/lab/package.json` (scripts, devDependencies)
- Modify: `apps/lab/project.json` (the `lint` and `fmt` targets, `verify`'s `dependsOn`)

**Interfaces:**
- Consumes: the project of Task 1
- Produces: `pnpm run lint` and `pnpm run fmt` in `apps/lab`, and `nx run lab:lint` / `nx run lab:fmt`

- [ ] **Step 1: Install the toolchain**

```bash
cd /Users/tomek/dev/arrowz
pnpm --filter @arrowz/lab add -D eslint @eslint/js typescript-eslint eslint-plugin-react-hooks eslint-plugin-jsx-a11y prettier
```

Then confirm the major versions the spec names, and stop if either is lower:

```bash
node -e "const p=require('./apps/lab/package.json');console.log('eslint',p.devDependencies.eslint,'prettier',p.devDependencies.prettier)"
```

Expected: `eslint ^10.x`, `prettier ^3.9.x` or newer.

- [ ] **Step 2: Write the failing test**

This task's test is a command, not a file: a deliberately bad component that each of the three plugins must reject. Create it as a scratch file — it is deleted in Step 5.

```bash
mkdir -p apps/lab/src/scratch
cat > apps/lab/src/scratch/bad.tsx <<'TSX'
// Each line below must be rejected by one of the three plugins.
export function Bad({ onPick }: { onPick: (v: unknown) => void }) {
  const value = (globalThis as any).nothing
  // eslint-plugin-jsx-a11y: a click handler on a div with no role or keyboard path
  return <div onClick={() => onPick(value!)}>pick</div>
}
TSX
```

- [ ] **Step 3: Run the linter to verify it fails**

Run: `pnpm --filter @arrowz/lab exec eslint src/scratch/bad.tsx`
Expected: FAIL with at least three rule ids — `@typescript-eslint/no-explicit-any`, `@typescript-eslint/no-non-null-assertion` and `jsx-a11y/click-events-have-key-events` (or `jsx-a11y/no-static-element-interactions`). If ESLint reports "no configuration found", that is this step failing correctly; write the config in Step 4 and run it again.

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
  reactHooks.configs['recommended-latest'],
  {
    languageOptions: {
      parserOptions: { projectService: true, tsconfigRootDir: import.meta.dirname },
    },
    rules: {
      // The repository's two hard rules. deno lint enforces them in packages/;
      // apps/ is outside its reach, so they are stated here.
      '@typescript-eslint/no-explicit-any': 'error',
      '@typescript-eslint/no-non-null-assertion': 'error',
      // Node belongs in the integration tests that spawn the lab server, and
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

If `reactHooks.configs['recommended-latest']` is undefined on the installed version, print the available keys with `node -e "import('eslint-plugin-react-hooks').then(m=>console.log(Object.keys(m.default.configs)))"` and use the flat recommended config it names. Do not silently drop the plugin — the rules-of-hooks check is the reason it is here.

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

Add to `apps/lab/package.json`'s `scripts`:

```json
"lint": "eslint .",
"fmt": "prettier --check ."
```

- [ ] **Step 5: Run the linter to verify it now reports the three rules, then delete the scratch file**

Run: `pnpm --filter @arrowz/lab exec eslint src/scratch/bad.tsx`
Expected: FAIL, naming `@typescript-eslint/no-explicit-any`, `@typescript-eslint/no-non-null-assertion` and a `jsx-a11y/*` rule. Then:

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

- [ ] **Step 7: Verify**

Run: `pnpm nx run-many -t verify --projects=lab`
Expected: five targets pass.

- [ ] **Step 8: Commit**

```bash
git add apps/lab pnpm-lock.yaml
git commit -m "Give apps/lab ESLint and Prettier, with the repository's two hard rules"
```

---

### Task 3: The dictionary learns the third tab and the strip's own name

The lab has two tabs today (`tabLab`, `tabLibrary`, `lab-i18n.ts:110-111`). The application has three: the docs route is part of step 3 of the road map, and §5.2 names it. A tablist also needs an accessible name of its own, and reusing a tab's name for the list that contains it is worse than having none. Both keys belong in the engine's dictionary with their neighbours, in both languages — `lab-i18n.test.ts` checks that `PL.ui` covers `EN.ui`, so a one-sided addition turns the Deno gate red.

**Files:**
- Modify: `packages/engine/lab-i18n.ts:110-111` (add to `EN.ui`) and the matching place in `PL.ui` (`:459-460`)
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

Run: `deno test -A packages/engine/lab-i18n.test.ts`
Expected: PASS.

Run: `deno task test`
Expected: PASS — the key-parity test over `EN.ui` and `PL.ui` is in this suite.

- [ ] **Step 5: Commit**

```bash
git add packages/engine/lab-i18n.ts packages/engine/lab-i18n.test.ts
git commit -m "Name the docs tab in both dictionaries"
```

---

### Task 4: Three routes, and a browser to test them in

Declarative React Router: `<BrowserRouter>` in `App`, `<Routes>` in `AppRoutes` so that a test can mount the routing without an address bar. This task also stands up the Chromium project that Tasks 5, 8, 9, 10 and 11 all need.

**Files:**
- Create: `apps/lab/src/AppRoutes.tsx`
- Create: `apps/lab/src/routes/LabRoute.tsx`
- Create: `apps/lab/src/routes/SavedBoardsRoute.tsx`
- Create: `apps/lab/src/routes/DocsRoute.tsx`
- Create: `apps/lab/vitest.setup.ts`
- Modify: `apps/lab/src/App.tsx`
- Modify: `apps/lab/vitest.config.ts` (the Chromium project)
- Test: `apps/lab/src/AppRoutes.browser.test.tsx`

**Interfaces:**
- Consumes: `App` from Task 1
- Produces: `export function AppRoutes(): JSX.Element`; the route paths `/`, `/boards`, `/docs/:what`; each route renders a `<main>` with `role="tabpanel"` and the ids `lab-panel`, `boards-panel`, `docs-panel`

- [ ] **Step 1: Install the router and the browser test tools**

```bash
cd /Users/tomek/dev/arrowz
pnpm --filter @arrowz/lab add react-router
pnpm --filter @arrowz/lab add -D vitest-browser-react
node -e "console.log(require('./apps/lab/package.json').dependencies['react-router'])"
```

Expected: `^8.x`. The spec's choice is React Router 8 in **declarative** mode — `<BrowserRouter>` and `<Routes>` only. Do not add `@react-router/dev`, `routes.ts`, or any framework-mode plugin.

- [ ] **Step 2: Write the failing test**

Create `apps/lab/src/AppRoutes.browser.test.tsx`:

```tsx
import { MemoryRouter } from 'react-router'
import { expect, test } from 'vitest'
import { render } from 'vitest-browser-react'
import { AppRoutes } from './AppRoutes'

test('the root path is the lab', async () => {
  const screen = await render(
    <MemoryRouter initialEntries={['/']}>
      <AppRoutes />
    </MemoryRouter>,
  )
  await expect.element(screen.getByRole('tabpanel', { name: 'Lab' })).toBeVisible()
})

test('/boards is the saved boards', async () => {
  const screen = await render(
    <MemoryRouter initialEntries={['/boards']}>
      <AppRoutes />
    </MemoryRouter>,
  )
  await expect.element(screen.getByRole('tabpanel', { name: 'Saved boards' })).toBeVisible()
})

test('/docs/element is the docs, and the segment reaches the page', async () => {
  const screen = await render(
    <MemoryRouter initialEntries={['/docs/element']}>
      <AppRoutes />
    </MemoryRouter>,
  )
  await expect.element(screen.getByRole('tabpanel', { name: 'Docs' })).toBeVisible()
  await expect.element(screen.getByText('element')).toBeVisible()
})

// A path nobody routed must not render a blank page with no explanation.
test('an unknown path lands on the lab', async () => {
  const screen = await render(
    <MemoryRouter initialEntries={['/nowhere']}>
      <AppRoutes />
    </MemoryRouter>,
  )
  await expect.element(screen.getByRole('tabpanel', { name: 'Lab' })).toBeVisible()
})
```

- [ ] **Step 3: Run the test to verify it fails**

Add the Chromium project to `apps/lab/vitest.config.ts` first — without it the file is not collected:

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
          // Each one owns a port and a temporary store directory.
          fileParallelism: false,
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
// Brings vitest-browser-react's types and its automatic cleanup into every
// browser test file.
import 'vitest-browser-react'
```

Install the browser once locally (CI installs it through `board-element`):

```bash
pnpm --filter @arrowz/board-element exec playwright install --with-deps chromium
```

Run: `pnpm --filter @arrowz/lab exec vitest run --project=chromium`
Expected: FAIL — `Failed to resolve import "./AppRoutes"`.

- [ ] **Step 4: Write the routes**

`apps/lab/src/routes/LabRoute.tsx`:

```tsx
import { dictionary } from '@arrowz/engine/i18n'

const dict = dictionary('en')

export function LabRoute() {
  return (
    <main id="lab-panel" role="tabpanel" aria-label={dict.t('tabLab')}>
      {/* The stage arrives in Task 9, Generate in Task 10. */}
    </main>
  )
}
```

`apps/lab/src/routes/SavedBoardsRoute.tsx`:

```tsx
import { dictionary } from '@arrowz/engine/i18n'

const dict = dictionary('en')

export function SavedBoardsRoute() {
  return (
    <main id="boards-panel" role="tabpanel" aria-label={dict.t('tabLibrary')}>
      <h2>{dict.t('tabLibrary')}</h2>
      {/* PR 5 fills this: list, size chips, detail, load into lab, delete. */}
    </main>
  )
}
```

`apps/lab/src/routes/DocsRoute.tsx`:

```tsx
import { dictionary } from '@arrowz/engine/i18n'
import { useParams } from 'react-router'

const dict = dictionary('en')

export function DocsRoute() {
  const { what } = useParams()
  return (
    <main id="docs-panel" role="tabpanel" aria-label={dict.t('tabDocs')}>
      <h2>{dict.t('tabDocs')}</h2>
      {/* PR 6 fills this: the element's API, and the CLI help built from helpText(). */}
      <p>{what}</p>
    </main>
  )
}
```

`apps/lab/src/AppRoutes.tsx`:

```tsx
import { Navigate, Route, Routes } from 'react-router'
import { DocsRoute } from './routes/DocsRoute'
import { LabRoute } from './routes/LabRoute'
import { SavedBoardsRoute } from './routes/SavedBoardsRoute'

export function AppRoutes() {
  return (
    <Routes>
      <Route path="/" element={<LabRoute />} />
      <Route path="/boards" element={<SavedBoardsRoute />} />
      <Route path="/docs/:what" element={<DocsRoute />} />
      {/* A stale deep link is a lab, not a blank page. */}
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
Expected: PASS, 4 tests.

- [ ] **Step 6: Verify and commit**

```bash
pnpm nx run-many -t verify --projects=lab
git add apps/lab pnpm-lock.yaml
git commit -m "Route the lab, the saved boards and the docs"
```

---

### Task 5: The shell — a top bar and a real tab strip

The mock's tabs carry `aria-selected` on plain buttons with no `role="tab"` and no arrow keys (§7.2). This is the first of the nine gaps the port must fix, and the tab strip is where a wrong pattern would be copied into every later panel.

**Files:**
- Create: `apps/lab/src/shell/TopBar.tsx`
- Create: `apps/lab/src/shell/TabRow.tsx`
- Create: `apps/lab/src/design/shell.css`
- Modify: `apps/lab/src/App.tsx`
- Modify: `apps/lab/src/main.tsx` (import `shell.css`)
- Test: `apps/lab/src/shell/TabRow.browser.test.tsx`

**Interfaces:**
- Consumes: `AppRoutes`, the route paths of Task 4
- Produces: `export function TopBar(props: { W: number; H: number }): JSX.Element`; `export function TabRow(): JSX.Element`

- [ ] **Step 1: Write the failing test**

Create `apps/lab/src/shell/TabRow.browser.test.tsx`:

```tsx
import { MemoryRouter } from 'react-router'
import { expect, test } from 'vitest'
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
  await expect.element(screen.getByRole('tablist')).toBeVisible()
  await expect.element(screen.getByRole('tab', { name: 'Lab', selected: true })).toBeVisible()
  await expect.element(screen.getByRole('tab', { name: 'Saved boards', selected: false })).toBeVisible()
  await expect.element(screen.getByRole('tab', { name: 'Docs', selected: false })).toBeVisible()
})

test('only the selected tab is in the tab order', async () => {
  const screen = await mount('/')
  await expect.element(screen.getByRole('tab', { name: 'Lab' })).toHaveAttribute('tabindex', '0')
  await expect.element(screen.getByRole('tab', { name: 'Docs' })).toHaveAttribute('tabindex', '-1')
})

test('each tab points at the panel it controls', async () => {
  const screen = await mount('/')
  await expect.element(screen.getByRole('tab', { name: 'Lab' })).toHaveAttribute('aria-controls', 'lab-panel')
  await expect
    .element(screen.getByRole('tab', { name: 'Saved boards' }))
    .toHaveAttribute('aria-controls', 'boards-panel')
  await expect.element(screen.getByRole('tab', { name: 'Docs' })).toHaveAttribute('aria-controls', 'docs-panel')
})

test('the right arrow moves the selection, and End reaches the last tab', async () => {
  const screen = await mount('/')
  const lab = screen.getByRole('tab', { name: 'Lab' })
  await lab.click()
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

Add the import for `userEvent` at the top of the file:

```tsx
import { userEvent } from '@vitest/browser/context'
```

- [ ] **Step 2: Run the test to verify it fails**

Run: `pnpm --filter @arrowz/lab exec vitest run --project=chromium TabRow`
Expected: FAIL — `Failed to resolve import "./TabRow"`.

- [ ] **Step 3: Write the tab strip**

`apps/lab/src/shell/TabRow.tsx`:

```tsx
import { dictionary } from '@arrowz/engine/i18n'
import { useLocation, useNavigate } from 'react-router'

const dict = dictionary('en')

// The tab strip is the application's only navigation, so the route is the
// selection: no second copy of "which tab is open" to drift from the URL.
const TABS = [
  { path: '/', panel: 'lab-panel', label: () => dict.t('tabLab') },
  { path: '/boards', panel: 'boards-panel', label: () => dict.t('tabLibrary') },
  { path: '/docs/element', panel: 'docs-panel', label: () => dict.t('tabDocs') },
] as const

function selectedIndex(pathname: string): number {
  if (pathname.startsWith('/boards')) return 1
  if (pathname.startsWith('/docs')) return 2
  return 0
}

export function TabRow() {
  const navigate = useNavigate()
  const current = selectedIndex(useLocation().pathname)

  // Arrow keys move the selection and the focus together; the pattern wraps at
  // both ends, and Home/End jump. A mouse user never meets this path, which is
  // exactly why the mock has none of it.
  function onKeyDown(event: React.KeyboardEvent<HTMLDivElement>) {
    const last = TABS.length - 1
    const next = event.key === 'ArrowRight'
      ? (current === last ? 0 : current + 1)
      : event.key === 'ArrowLeft'
      ? (current === 0 ? last : current - 1)
      : event.key === 'Home'
      ? 0
      : event.key === 'End'
      ? last
      : null
    if (next === null) return
    event.preventDefault()
    const tab = TABS[next]
    if (!tab) return
    void navigate(tab.path)
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
          aria-controls={tab.panel}
          tabIndex={i === current ? 0 : -1}
          ref={(node) => {
            // Focus follows the selection, but only while the strip already has
            // it: clicking a tab must not steal focus back from the panel.
            if (node && i === current && node.parentElement?.contains(document.activeElement)) node.focus()
          }}
          onClick={() => void navigate(tab.path)}
        >
          {tab.label()}
        </button>
      ))}
    </div>
  )
}
```

`apps/lab/src/shell/TopBar.tsx`:

```tsx
/** The one large Signal plane of the mock: the mark, the name and the board's size. */
export function TopBar({ W, H }: { W: number; H: number }) {
  return (
    <header className="fw-top">
      <span className="name">Arrowz</span>
      <span className="sep">/</span>
      <span className="dims">{`${W}×${H}`}</span>
      {/* The right group is where ⌘K (PR 3), the language switch and the
          simple/advanced switch (PR 4) go. It stays empty rather than
          carrying a placeholder: an empty flex group costs nothing and a
          label with no meaning would have to be found and removed later. */}
      <div className="right" />
    </header>
  )
}
```

- [ ] **Step 4: Write the shell's styles**

`apps/lab/src/design/shell.css` — ported verbatim from the mock (`fronthub-workshop-v2.css:31-60`), minus the rules for parts this PR does not have:

```css
/* The shell's grid and the two bars, ported from the workshop mock.
   48px auto 1fr: top bar, tab strip, everything else. */
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
.fw-top .name {
  font-size: 13px;
}
.fw-top .sep {
  opacity: 0.5;
}
.fw-top .dims {
  opacity: 0.8;
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

/* The design system asks for 44px targets on touch; the mock's 24-32px
   heights are kept for pointers and raised where there is no hover. */
@media (pointer: coarse) {
  .fw-tabrow button {
    padding: 15px 0 13px;
  }
}
```

Import it in `apps/lab/src/main.tsx`, after the tokens:

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

// The knobs are PR 3; until then the top bar shows the defaults the run uses.
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
Expected: PASS — the four route tests and the five tab tests.

- [ ] **Step 6: Verify and commit**

```bash
pnpm nx run-many -t verify --projects=lab
git add apps/lab
git commit -m "Add the shell: a top bar and a tab strip with the full tablist pattern"
```

---

### Task 6: The store client, and the proxy that survives the server's CSRF refusal

`lab-server.ts:69` refuses any write whose `Origin` is not its own. Vite's `changeOrigin` rewrites `Host`, not `Origin`, so without a `proxyReq` hook every POST from the dev server gets a 403 (§9.1). This is a prerequisite, not a verification — so the test starts both servers and posts a board through the proxy.

**Files:**
- Create: `apps/lab/src/api/boards.ts`
- Modify: `apps/lab/vite.config.ts` (the proxy)
- Test: `apps/lab/src/api/boards.node.test.ts`

**Interfaces:**
- Consumes: `BoardMeta`, `BoardSize`, `StoreRequest` from `@arrowz/engine`
- Produces:
  - `export async function listBoards(): Promise<BoardSize[]>`
  - `export async function saveBoard(request: StoreRequest): Promise<SaveOutcome>` where `export type SaveOutcome = { ok: true; meta: BoardMeta } | { ok: false; error: string }`
  - `export const LAB_SERVER = 'http://127.0.0.1:8777'` and `export function labProxy(target: string): ProxyOptions` from `vite.config.ts`'s helper module — see Step 4; the test imports the helper, not the config

- [ ] **Step 1: Write the failing test**

Create `apps/lab/src/api/boards.node.test.ts`:

```ts
import { defaultParams, encodeBoard, generate } from '@arrowz/engine'
import { DEFAULT_VIEW, storeRequest } from '@arrowz/engine/command'
import { spawn } from 'node:child_process'
import { mkdtempSync, rmSync } from 'node:fs'
import { tmpdir } from 'node:os'
import { join } from 'node:path'
import { createServer, type ViteDevServer } from 'vite'
import { afterAll, beforeAll, expect, test } from 'vitest'
import { labProxy } from '../../vite.proxy'

const STORE_PORT = 8790
const VITE_PORT = 8791
const STORE_ORIGIN = `http://127.0.0.1:${STORE_PORT}`
const VITE_ORIGIN = `http://127.0.0.1:${VITE_PORT}`

let store: ReturnType<typeof spawn>
let vite: ViteDevServer
let boardsDir: string

beforeAll(async () => {
  boardsDir = mkdtempSync(join(tmpdir(), 'arrowz-lab-'))
  store = spawn('deno', [
    'run',
    `--allow-net=127.0.0.1:${STORE_PORT}`,
    '--allow-read',
    `--allow-write=${boardsDir}`,
    '--allow-env=ARROWZ_BOARDS_DIR',
    'packages/cli/lab-server.ts',
    String(STORE_PORT),
  ], { cwd: new URL('../../../..', import.meta.url).pathname, env: { ...process.env, ARROWZ_BOARDS_DIR: boardsDir } })

  // Deno.serve is listening once a GET answers; poll rather than sleep.
  for (let i = 0; i < 100; i++) {
    try {
      const r = await fetch(`${STORE_ORIGIN}/api/boards`)
      if (r.ok) {
        await r.body?.cancel()
        break
      }
    } catch {
      await new Promise((done) => setTimeout(done, 100))
    }
  }

  vite = await createServer({
    root: new URL('../..', import.meta.url).pathname,
    configFile: false,
    server: { port: VITE_PORT, proxy: labProxy(STORE_ORIGIN) },
  })
  await vite.listen()
}, 60_000)

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

// The whole reason this task exists. Without the Origin rewrite the server
// refuses with 403 "origin http://127.0.0.1:8791 is not the lab".
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
  const meta = await r.json()
  expect(meta.id).toMatch(/^seed3-[0-9a-f]{8}$/)
})

test('the saved board comes back in the listing', async () => {
  const r = await fetch(`${VITE_ORIGIN}/api/boards`)
  const sizes = await r.json()
  expect(sizes).toHaveLength(1)
  expect(sizes[0].size).toBe('12x12')
  expect(sizes[0].boards).toHaveLength(1)
})

// The board files themselves are served from /boards/, and PR 5 reads them.
// The proxy has to cover that path too, not only /api.
test('the stored board file is reachable through the proxy', async () => {
  const listing = await (await fetch(`${VITE_ORIGIN}/api/boards`)).json()
  const file = `${VITE_ORIGIN}/boards/12x12/${listing[0].boards[0].id}.board.json`
  const r = await fetch(file)
  expect(r.status).toBe(200)
})
```

- [ ] **Step 2: Run the test to verify it fails**

Run: `pnpm --filter @arrowz/lab exec vitest run --project=node-integration`
Expected: FAIL — `Failed to resolve import "../../vite.proxy"`.

- [ ] **Step 3: Write the proxy helper**

The helper lives in its own module so the test can import it without loading the whole config. Create `apps/lab/vite.proxy.ts`:

```ts
import type { ProxyOptions } from 'vite'

/** Where `deno task lab` listens unless it is told otherwise. */
export const LAB_SERVER = 'http://127.0.0.1:8777'

/**
 * The board store's two paths, proxied to the Deno lab server.
 *
 * `changeOrigin` rewrites the `Host` header; the browser still sends
 * `Origin: http://127.0.0.1:8779`, and lab-server.ts:69 refuses any write
 * whose Origin is not its own — a deliberate CSRF refusal that this PR does
 * not weaken. The hook therefore presents the server's own origin, which is
 * what a page served from that server would have sent.
 *
 * `/boards/` carries the stored board files (lab-server.ts:307), so PR 5's
 * library needs it as much as PR 2's save needs `/api`.
 */
export function labProxy(target: string = LAB_SERVER): Record<string, ProxyOptions> {
  const options: ProxyOptions = {
    target,
    changeOrigin: true,
    configure: (proxy) => {
      proxy.on('proxyReq', (proxyReq) => {
        if (proxyReq.getHeader('origin') !== undefined) proxyReq.setHeader('origin', target)
      })
    },
  }
  return { '/api': options, '/boards': { ...options } }
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

Add `vite.proxy.ts` to `tsconfig.json`'s `include`.

- [ ] **Step 4: Run the test to verify the proxy tests pass**

Run: `pnpm --filter @arrowz/lab exec vitest run --project=node-integration`
Expected: PASS, 4 tests. If the POST comes back 403, the `proxyReq` hook did not run — check that `configure` is on the `/api` entry and not on the server object.

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
pnpm nx run-many -t verify --projects=lab
git add apps/lab
git commit -m "Proxy the board store, rewriting the Origin the server checks"
```

---

### Task 7: The run slice

One store, one slice. The state machine is §5.3's, minus the history the filmstrip needs in PR 7.

**Files:**
- Create: `apps/lab/src/state/run.slice.ts`
- Create: `apps/lab/src/state/store.ts`
- Test: `apps/lab/src/state/run.slice.test.ts`

**Interfaces:**
- Consumes: `BoardData`, `BoardFile`, `Params`, `TraceInfo` from `@arrowz/engine`
- Produces:
  - `export type RunPhase = 'idle' | 'running' | 'done' | 'error'`
  - `export interface RunState { phase: RunPhase; params: Params | null; progress: TraceInfo | null; board: BoardData | null; file: BoardFile | null; report: DoneReport | null; message: string | null; saved: SaveOutcome | null }`
  - `export interface RunActions { started(params: Params): void; progressed(info: TraceInfo): void; finished(r: { board: BoardData; file: BoardFile; report: DoneReport }): void; failed(message: string): void; stored(outcome: SaveOutcome): void; aborted(): void }`
  - `export type DoneReport = Extract<WorkerOut, { type: 'done' }>`
  - `export const useStore` (Zustand) from `store.ts`

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
import { beforeEach, expect, test } from 'vitest'
import { useStore } from './store'

const params = { ...defaultParams(), W: 8, H: 8, seed: 1 }
const result = generate(params)
const report = {
  type: 'done' as const,
  ok: true,
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
  board: encodeBoard(result.board),
}

beforeEach(() => {
  useStore.getState().run.reset()
})

test('a fresh store is idle and holds nothing', () => {
  const { run } = useStore.getState()
  expect(run.phase).toBe('idle')
  expect(run.board).toBeNull()
  expect(run.params).toBeNull()
})

test('started moves to running and pins the parameters the run uses', () => {
  useStore.getState().run.started(params)
  const { run } = useStore.getState()
  expect(run.phase).toBe('running')
  expect(run.params).toEqual(params)
  expect(run.progress).toBeNull()
})

// The board on screen belongs to the run that made it, not to the knobs: §5.3
// keeps three parameter sets apart, and this is the one that matters here.
test('starting a second run clears the first one board and message', () => {
  useStore.getState().run.started(params)
  useStore.getState().run.finished({ board: result.board, file: report.board, report })
  useStore.getState().run.started({ ...params, seed: 2 })
  const { run } = useStore.getState()
  expect(run.phase).toBe('running')
  expect(run.board).toBeNull()
  expect(run.saved).toBeNull()
})

test('progress is kept while running and dropped when the run ends', () => {
  useStore.getState().run.started(params)
  // TraceInfo, as types.ts:40-46 declares it.
  useStore.getState().run.progressed({ pieces: 3, remaining: 40, backtracks: 0, ms: 12, total: 64 })
  expect(useStore.getState().run.progress?.remaining).toBe(40)
  useStore.getState().run.finished({ board: result.board, file: report.board, report })
  expect(useStore.getState().run.progress).toBeNull()
})

test('finished holds the board, its file and the report', () => {
  useStore.getState().run.started(params)
  useStore.getState().run.finished({ board: result.board, file: report.board, report })
  const { run } = useStore.getState()
  expect(run.phase).toBe('done')
  expect(run.board).toBe(result.board)
  expect(run.file).toBe(report.board)
  expect(run.report?.pieces).toBe(result.board.pieces.length)
})

test('failed carries the message and keeps no board', () => {
  useStore.getState().run.started(params)
  useStore.getState().run.failed('the envelope refuses these parameters')
  const { run } = useStore.getState()
  expect(run.phase).toBe('error')
  expect(run.message).toBe('the envelope refuses these parameters')
  expect(run.board).toBeNull()
})

// A store failure must never overwrite a run's outcome: §5.3 says status is
// structured data carrying a source, and this is that rule at slice level.
test('a store failure leaves the run done', () => {
  useStore.getState().run.started(params)
  useStore.getState().run.finished({ board: result.board, file: report.board, report })
  useStore.getState().run.stored({ ok: false, error: 'no store server' })
  const { run } = useStore.getState()
  expect(run.phase).toBe('done')
  expect(run.saved).toEqual({ ok: false, error: 'no store server' })
})

test('aborting a run returns to idle without an error', () => {
  useStore.getState().run.started(params)
  useStore.getState().run.aborted()
  const { run } = useStore.getState()
  expect(run.phase).toBe('idle')
  expect(run.message).toBeNull()
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

/** The `done` message of the worker, which is also what the report reads. */
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

type Set = (fn: (state: { run: RunState }) => { run: RunState }) => void

export function createRunSlice(set: Set): RunState {
  const patch = (next: Partial<RunState>) => set((state) => ({ run: { ...state.run, ...next } }))
  return {
    ...EMPTY,
    started: (params) => patch({ ...EMPTY, phase: 'running', params }),
    progressed: (progress) => patch({ progress }),
    finished: ({ board, file, report }) =>
      patch({ phase: 'done', progress: null, board, file, report, message: null }),
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
Expected: PASS — the two token tests and the eight slice tests.

- [ ] **Step 6: Verify and commit**

```bash
pnpm nx run-many -t verify --projects=lab
git add apps/lab pnpm-lock.yaml
git commit -m "Add the run slice: the state machine of a generation"
```

---

### Task 8: The worker and `useGenerator`

One long-lived worker, reused while idle, terminated to abort or to replace a run in flight — today's behaviour (`lab-page.ts:899-902`, `:1002`), and the reason §6 leaves the protocol alone. `useGenerator` is mounted in `App`, above the routes, so a route change neither kills a run nor disposes the GL context.

**Files:**
- Create: `apps/lab/src/worker/generate.worker.ts`
- Create: `apps/lab/src/worker/useGenerator.ts`
- Modify: `apps/lab/src/App.tsx`
- Test: `apps/lab/src/worker/useGenerator.browser.test.tsx`

**Interfaces:**
- Consumes: `run` slice actions from Task 7; `WorkerIn`, `WorkerOut`, `decodeBoard` from `@arrowz/engine`
- Produces: `export function useGenerator(): { start(params: Params): void; abort(): void }`

- [ ] **Step 1: Write the failing test**

Create `apps/lab/src/worker/useGenerator.browser.test.tsx`:

```tsx
import { defaultParams } from '@arrowz/engine'
import { useEffect } from 'react'
import { expect, test } from 'vitest'
import { render } from 'vitest-browser-react'
import { useStore } from '../state/store'
import { useGenerator } from './useGenerator'

function Harness({ seed, W }: { seed: number; W: number }) {
  const generator = useGenerator()
  useEffect(() => {
    generator.start({ ...defaultParams(), W, H: W, seed })
  }, [generator, seed, W])
  const phase = useStore((s) => s.run.phase)
  const pieces = useStore((s) => s.run.report?.pieces ?? 0)
  return <output>{`${phase}:${pieces}`}</output>
}

test('a run carves a board and lands in done', async () => {
  useStore.getState().run.reset()
  const screen = await render(<Harness seed={5} W={16} />)
  await expect.element(screen.getByRole('status')).toHaveTextContent(/^done:[1-9]/, { timeout: 20_000 })
  const { run } = useStore.getState()
  expect(run.board?.W).toBe(16)
  expect(run.file).toMatch(/^arrowz/)
})

test('the board the slice holds is the decoded board, not the file', async () => {
  useStore.getState().run.reset()
  await render(<Harness seed={6} W={12} />)
  await expect.poll(() => useStore.getState().run.phase, { timeout: 20_000 }).toBe('done')
  const { run } = useStore.getState()
  expect(run.board?.pieces.length).toBeGreaterThan(0)
  expect(run.report?.pieces).toBe(run.board?.pieces.length)
})

// The worker throws InvalidParamsError for parameters outside the envelope,
// and the page must show that message rather than hang in `running`.
test('parameters outside the envelope end in error with the engine message', async () => {
  useStore.getState().run.reset()
  function Bad() {
    const generator = useGenerator()
    useEffect(() => {
      generator.start({ ...defaultParams(), W: 12, H: 12, pStraight: 0 })
    }, [generator])
    return null
  }
  await render(<Bad />)
  await expect.poll(() => useStore.getState().run.phase, { timeout: 20_000 }).toBe('error')
  expect(useStore.getState().run.message ?? '').not.toBe('')
})

test('abort returns the run to idle', async () => {
  useStore.getState().run.reset()
  function Abortable() {
    const generator = useGenerator()
    useEffect(() => {
      generator.start({ ...defaultParams(), W: 200, H: 200, seed: 9 })
      const id = setTimeout(() => generator.abort(), 50)
      return () => clearTimeout(id)
    }, [generator])
    return null
  }
  await render(<Abortable />)
  await expect.poll(() => useStore.getState().run.phase, { timeout: 20_000 }).toBe('idle')
})
```

Note the harness uses `<output>`, whose implicit role is `status`.

- [ ] **Step 2: Run the test to verify it fails**

Run: `pnpm --filter @arrowz/lab exec vitest run --project=chromium useGenerator`
Expected: FAIL — `Failed to resolve import "./useGenerator"`.

- [ ] **Step 3: Write the worker**

`apps/lab/src/worker/generate.worker.ts`:

```ts
import { decodeBoard, encodeBoard, generate, toSvg } from '@arrowz/engine'
import type { WorkerIn, WorkerOut } from '@arrowz/engine'

// The same two messages the Deno lab worker answers (packages/cli/lab-worker.ts),
// against the same engine: the protocol is shared, so §6 leaves it untouched.
// The finished board crosses as its board file — one string instead of ~90 000
// piece objects — and it is the very file that goes to the store.
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

/**
 * One worker for the whole session, reused while idle and terminated to
 * abort. `generate()` is synchronous, so the worker's event loop is blocked
 * for a whole run and a second message would simply queue behind the first;
 * replacing the run means terminating the worker and building a new one, as
 * the Deno lab does (lab-page.ts:899-902, :1002).
 *
 * Mounted once, in App: a route change must neither kill a run in flight nor
 * unmount <arrowz-board>, whose disposal releases the GL context.
 *
 * The slice is read with `useStore.getState()` rather than a selector: this
 * hook publishes state and never renders from it, and a subscription here
 * would re-render App — the whole shell — on every progress message, which
 * on a large board arrives many times a second.
 */
export function useGenerator(): { start(params: Params): void; abort(): void } {
  const worker = useRef<Worker | null>(null)
  const busy = useRef(false)
  const actions = () => useStore.getState().run

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

  return useMemo(() => ({
    start(params: Params) {
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
  }), [ensure, kill])
}
```

- [ ] **Step 5: Mount it in `App`**

In `apps/lab/src/App.tsx`, call the hook inside the router so that the routes can reach its result through the store, and pass the handle down in Task 10:

```tsx
import { defaultParams } from '@arrowz/engine'
import { BrowserRouter } from 'react-router'
import { AppRoutes } from './AppRoutes'
import { TabRow } from './shell/TabRow'
import { TopBar } from './shell/TopBar'
import { useGenerator } from './worker/useGenerator'

const params = defaultParams()

export function App() {
  // Above the routes on purpose: §6. A route change must not kill a run.
  const generator = useGenerator()
  return (
    <BrowserRouter>
      <div className="fw">
        <TopBar W={params.W} H={params.H} />
        <TabRow />
        <AppRoutes generator={generator} />
      </div>
    </BrowserRouter>
  )
}
```

and give `AppRoutes` the prop, passing it to `LabRoute` only:

```tsx
import type { Params } from '@arrowz/engine'

export interface Generator {
  start(params: Params): void
  abort(): void
}

export function AppRoutes({ generator }: { generator: Generator }) {
  return (
    <Routes>
      <Route path="/" element={<LabRoute generator={generator} />} />
      …
```

`LabRoute` takes the prop and ignores it until Task 10:

```tsx
export function LabRoute({ generator: _generator }: { generator: Generator }) {
```

The existing route tests construct `AppRoutes` without the prop; give them a stub:

```tsx
const generator = { start: () => {}, abort: () => {} }
```

- [ ] **Step 6: Run the tests to verify they pass**

Run: `pnpm --filter @arrowz/lab exec vitest run --project=chromium`
Expected: PASS — routes, tabs and the four generator tests.

- [ ] **Step 7: Verify and commit**

```bash
pnpm nx run-many -t verify --projects=lab
git add apps/lab
git commit -m "Carve in a worker that outlives every route"
```

---

### Task 9: `BoardCanvas` — the only `@lit/react` site

`<arrowz-board>` takes the board and the view as **objects**. React on its own stringifies unknown props onto attributes, which would hand the element `"[object Object]"`; `createComponent` sets them as properties instead.

**Files:**
- Create: `apps/lab/src/stage/BoardCanvas.tsx`
- Create: `apps/lab/src/stage/Stage.tsx`
- Modify: `apps/lab/src/design/shell.css` (the stage's grid)
- Test: `apps/lab/src/stage/BoardCanvas.browser.test.tsx`

**Interfaces:**
- Consumes: `ArrowzBoard`, `boardViewOf`, `BoardView` from `@arrowz/board-element`; `DEFAULT_VIEW` from `@arrowz/engine/command`
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

test('the element receives the board as an object, not as an attribute', async () => {
  const screen = await render(
    <BoardCanvas board={board} view={boardViewOf(DEFAULT_VIEW, false)} interactive={false} />,
  )
  const element = screen.container.querySelector('arrowz-board')
  expect(element).not.toBeNull()
  // The property carries the decoded board; the attribute was never written.
  expect(element?.board?.pieces.length).toBe(board.pieces.length)
  expect(element?.getAttribute('board')).toBeNull()
})

test('the view reaches the element as an object too', async () => {
  const screen = await render(
    <BoardCanvas board={board} view={boardViewOf({ ...DEFAULT_VIEW, stroke: 3 }, false)} interactive={false} />,
  )
  const element = screen.container.querySelector('arrowz-board')
  expect(element?.view?.stroke).toBe(3)
})

test('a null board renders the element without drawing anything', async () => {
  const screen = await render(<BoardCanvas board={null} view={boardViewOf(DEFAULT_VIEW, false)} interactive={false} />)
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
 * the view as objects; React alone would stringify them onto attributes,
 * and `createComponent` sets properties instead. Importing the element class
 * also registers the tag.
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

/**
 * 70px + 1fr: the run rail of the mock and the board beside it. The rail is
 * empty until PR 7 fills it with the filmstrip; the column stays, because the
 * board's width must not move when it arrives.
 */
export function Stage() {
  const board = useStore((state) => state.run.board)
  return (
    <div className="fw-stage">
      <div className="fw-runs" />
      <div className="fw-boardwrap">
        <div className="fw-board">
          <BoardCanvas board={board} view={boardViewOf(DEFAULT_VIEW, false)} interactive={false} />
        </div>
      </div>
    </div>
  )
}
```

Append to `apps/lab/src/design/shell.css` (ported from the mock, `:104-131`):

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
pnpm nx run-many -t verify --projects=lab
git add apps/lab pnpm-lock.yaml
git commit -m "Draw the board through @lit/react, with objects as properties"
```

---

### Task 10: The path this PR exists for — generate, draw, save

**Files:**
- Modify: `apps/lab/src/routes/LabRoute.tsx`
- Modify: `apps/lab/src/App.tsx` (save on a finished run)
- Modify: `apps/lab/src/design/shell.css` (the status bar)
- Test: `apps/lab/src/routes/LabRoute.browser.test.tsx`

**Interfaces:**
- Consumes: `useGenerator` (Task 8), `Stage` (Task 9), `saveBoard` (Task 6), the `run` slice (Task 7)
- Produces: `export function LabRoute({ generator }: { generator: Generator }): JSX.Element`

- [ ] **Step 1: Write the failing test**

Create `apps/lab/src/routes/LabRoute.browser.test.tsx`:

```tsx
import { MemoryRouter } from 'react-router'
import { expect, test, vi } from 'vitest'
import { render } from 'vitest-browser-react'
import { userEvent } from '@vitest/browser/context'
import { AppRoutes } from '../AppRoutes'
import { useStore } from '../state/store'
import { useGenerator } from '../worker/useGenerator'

function Host({ path = '/' }: { path?: string }) {
  const generator = useGenerator()
  return (
    <MemoryRouter initialEntries={[path]}>
      <AppRoutes generator={generator} />
    </MemoryRouter>
  )
}

test('Generate carves a board, draws it and reports the outcome', async () => {
  useStore.getState().run.reset()
  const errors: string[] = []
  const spy = vi.spyOn(console, 'error').mockImplementation((...args) => errors.push(String(args[0])))

  const screen = await render(<Host />)
  await screen.getByRole('button', { name: 'Generate' }).click()

  await expect.poll(() => useStore.getState().run.phase, { timeout: 30_000 }).toBe('done')
  const element = screen.container.querySelector('arrowz-board')
  expect(element?.board?.pieces.length).toBeGreaterThan(0)
  await expect.element(screen.getByRole('status')).toBeVisible()

  // §8: a full run from Generate to a drawn board with zero console errors.
  expect(errors).toEqual([])
  spy.mockRestore()
}, 40_000)

// §5.3: `useGenerator` and the board live above the routes, so leaving the lab
// mid-run neither kills the run nor disposes the GL context.
test('a route change during a run leaves the run alive', async () => {
  useStore.getState().run.reset()
  const screen = await render(<Host />)
  await screen.getByRole('button', { name: 'Generate' }).click()
  await expect.poll(() => useStore.getState().run.phase).toBe('running')

  await userEvent.click(screen.getByRole('tab', { name: 'Saved boards' }))
  expect(useStore.getState().run.phase).not.toBe('idle')
  await expect.poll(() => useStore.getState().run.phase, { timeout: 30_000 }).toBe('done')
}, 40_000)

test('the run status names the phase it is in', async () => {
  useStore.getState().run.reset()
  const screen = await render(<Host />)
  await expect.element(screen.getByRole('status')).toHaveTextContent('')
  await screen.getByRole('button', { name: 'Generate' }).click()
  await expect.element(screen.getByRole('status')).toHaveTextContent('Generating…')
}, 40_000)
```

The second test navigates through the tab strip, so `Host` must render it. Wrap the routes in the same shell the application uses by importing `TabRow` beside `AppRoutes`:

```tsx
import { TabRow } from '../shell/TabRow'
```

and render `<TabRow />` above `<AppRoutes …/>` inside the `MemoryRouter`.

- [ ] **Step 2: Run the test to verify it fails**

Run: `pnpm --filter @arrowz/lab exec vitest run --project=chromium LabRoute`
Expected: FAIL — no button named `Generate`.

- [ ] **Step 3: Write the route**

`apps/lab/src/routes/LabRoute.tsx`:

```tsx
import { defaultParams } from '@arrowz/engine'
import { dictionary } from '@arrowz/engine/i18n'
import type { Generator } from '../AppRoutes'
import { Stage } from '../stage/Stage'
import { useStore } from '../state/store'

const dict = dictionary('en')
// PR 3 replaces this with the params slice; until then the run uses the
// defaults, which is what the CLI uses when it is given no knobs.
const params = defaultParams()

/**
 * The four words the status line can say, all of them the dictionary's. The
 * old lab words the same four at `lab-page.ts:1405-1417`; the report itself,
 * with its metrics and its delta, is PR 4.
 */
function statusText(run: RunState): string {
  if (run.phase === 'running') return dict.t('generating')
  if (run.phase === 'error') return `${dict.t('workerError')} ${run.message ?? ''}`
  if (run.phase !== 'done' || !run.report) return dict.t('pressGenerate')
  if (run.report.ok) return dict.t('closed')
  if (run.report.deadlock) return dict.t('unsolvable')
  const stuck = run.report.stuck
  return dict.t(
    'notClosedStatus',
    dict.fmt(stuck?.remaining ?? 0),
    stuck?.sizes.length ?? 0,
    stuck?.sizes[0] ?? 0,
  )
}

export function LabRoute({ generator }: { generator: Generator }) {
  const run = useStore((state) => state.run)

  return (
    <main id="lab-panel" role="tabpanel" aria-label={dict.t('tabLab')}>
      <div className="fw-view">
        <div className="fw-bar">
          <button
            type="button"
            className="fw-go"
            onClick={() => generator.start(params)}
            disabled={run.phase === 'running'}
          >
            {dict.t('generate')}
          </button>
          {/* aria-live: the mock's run state has none, and a screen reader
              would never learn that a thirty-second carve had finished.
              The store's answer is appended, never substituted: a missing
              store must not overwrite what the run itself reported. */}
          <output role="status" aria-live="polite">
            {statusText(run)}
            {run.saved ? ` — ${run.saved.ok ? dict.t('saved') : dict.t('notSaved')}` : ''}
          </output>
        </div>
        <Stage />
      </div>
    </main>
  )
}
```

`LabRoute` subscribes to the whole slice on purpose — it renders from four of its fields, and it is the leaf the progress messages are for. `App` must not (Step 4).

The four keys used here all exist today: `generating` (`lab-i18n.ts:114`), `workerError` (`:119`), `closed` (`:122`), `unsolvable` (`:124`), `notClosedStatus` (`:125`), `pressGenerate` (`:113`), `saved` (`:165`) and `notSaved` (`:166`). Import `RunState` from `../state/run.slice`.

- [ ] **Step 4: Save the finished board**

In `apps/lab/src/App.tsx`, save each finished run exactly once, from above the routes:

```tsx
import { storeRequest } from '@arrowz/engine/command'
import { DEFAULT_VIEW } from '@arrowz/engine/command'
import { useEffect, useRef } from 'react'
import { saveBoard } from './api/boards'

// …inside App, after the generator. App subscribes to one field, not to the
// slice: a subscription to `run` would re-render the shell on every progress
// message. The board file is the run's identity here, so the same finished
// run is never posted twice — including under StrictMode's double effect.
const file = useStore((state) => state.run.file)
const posted = useRef<string | null>(null)
useEffect(() => {
  const { phase, params: runParams, report } = useStore.getState().run
  if (phase !== 'done' || !file || !runParams || !report) return
  if (posted.current === file) return
  posted.current = file
  // The stored view is the lab's view with top zeroed, as the old lab stores
  // it (`lab-page.ts` storeView()).
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
```

- [ ] **Step 5: Add the status bar's styles**

Append to `apps/lab/src/design/shell.css` (from the mock, `:114-121`):

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
```

- [ ] **Step 6: Run the tests to verify they pass**

Run: `pnpm --filter @arrowz/lab exec vitest run --project=chromium`
Expected: PASS, every browser test.

If the "zero console errors" assertion fails on a React `act` warning, fix the component rather than the assertion: a state update outside React's knowledge is exactly the class of bug that assertion exists to catch.

- [ ] **Step 7: Verify and commit**

```bash
pnpm nx run-many -t verify --projects=lab
git add apps/lab
git commit -m "Walk one path end to end: generate, draw, save"
```

---

### Task 11: The fingerprint test over the Vite-built worker

`lab-bundle.test.ts:61-88` runs the **Deno-bundled** worker and compares its board's fingerprint against an in-process `generate()`. Zero console errors does not prove that a Vite-bundled engine carves the same board — a bundler that dropped or reordered a module would show up on someone's screen, not in a test. PR 8 removes the Deno one; this is its successor, and §8 requires it to exist first.

**Files:**
- Test: `apps/lab/src/worker/fingerprint.browser.test.ts`

**Interfaces:**
- Consumes: `generate`, `decodeBoard`, `encodeBoard`, `fingerprint`, `toSvg`, `svgOptions` from `@arrowz/engine`; the worker of Task 8
- Produces: nothing — this task adds only a test

- [ ] **Step 1: Confirm the names the test imports**

```bash
grep -n "export function fingerprint\|export function svgOptions" packages/engine/*.ts | grep -v test
grep -n "fingerprint\|svgOptions" packages/engine/mod.ts
```

Both must be reachable from `@arrowz/engine`. If `svgOptions` is not exported from the package root, import it from the subpath that has it and record which one in the test's header comment.

- [ ] **Step 2: Write the failing test**

Create `apps/lab/src/worker/fingerprint.browser.test.ts`:

```ts
import { decodeBoard, defaultParams, encodeBoard, fingerprint, generate, toSvg } from '@arrowz/engine'
import type { WorkerIn, WorkerOut } from '@arrowz/engine'
import { DEFAULT_VIEW, svgOptions } from '@arrowz/engine/command'
import { expect, test } from 'vitest'

// The successor to packages/cli/lab-bundle.test.ts: that test proves the
// Deno-bundled worker carves the board the engine carves, and PR 8 deletes it
// along with the old lab. This proves the same thing about the Vite build,
// which is the only one that will remain.
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

test('the Vite-built worker carves the board the engine carves', async () => {
  const params = { ...defaultParams(), W: 20, H: 20, seed: 7 }
  const answer = await ask({ type: 'generate', params })
  expect(answer.type).toBe('done')
  if (answer.type !== 'done') return

  const mine = generate(params)
  expect(fingerprint(decodeBoard(answer.board))).toBe(fingerprint(mine.board))
  expect(answer.pieces).toBe(mine.board.pieces.length)
}, 30_000)

test('the Vite-built worker draws the SVG the engine draws', async () => {
  const params = { ...defaultParams(), W: 20, H: 20, seed: 7 }
  const mine = generate(params)
  const options = svgOptions(DEFAULT_VIEW)
  const answer = await ask({ type: 'svg', board: encodeBoard(mine.board), options })
  expect(answer.type).toBe('svg')
  if (answer.type !== 'svg') return
  expect(answer.svg).toBe(toSvg(mine.board, options))
}, 30_000)
```

- [ ] **Step 3: Run the test**

Run: `pnpm --filter @arrowz/lab exec vitest run --project=chromium fingerprint`
Expected: PASS. If the fingerprints differ, do not adjust the test: compare `pnpm nx build engine`'s output with what Vite resolved, because a mismatch here means the application and the CLI carve different boards.

- [ ] **Step 4: Commit**

```bash
git add apps/lab
git commit -m "Fingerprint the Vite-built worker against the engine"
```

---

### Task 12: Close the PR

**Files:**
- Modify: `README.md`, `README.pl.md` (the repository layout section)
- Verify: everything

- [ ] **Step 1: Name the project in both READMEs**

```bash
grep -n "packages/board-element" README.md README.pl.md | head
```

Add `apps/lab` to the same list in both files, one line each, in English in `README.md` and Polish in `README.pl.md`. Say what it is (the generator lab as a React application), what runs it (`pnpm nx serve lab`, with `deno task lab` beside it for the board store) and that it is being built alongside the old lab, which goes away in a later step.

- [ ] **Step 2: Run both gates**

```bash
cd /Users/tomek/dev/arrowz
deno task verify
pnpm nx run-many -t verify
```

Expected: both green. `deno task verify` covers the change of Task 3; the Nx run covers `apps/lab` and proves the new project did not break `engine`, `cli` or `board-element`.

- [ ] **Step 3: Confirm the project entered CI without a workflow change**

```bash
pnpm nx show project lab --json | node -e "let s='';process.stdin.on('data',d=>s+=d).on('end',()=>console.log(Object.keys(JSON.parse(s).targets)))"
```

Expected: `check`, `lint`, `fmt`, `test`, `build`, `serve`, `verify`. CI runs `nx affected -t check lint fmt test build smoke bundle`, so six of those seven run there with no edit to `.github/workflows/ci.yml`. `apps/lab` has no `smoke` or `bundle` target, and Nx skips targets a project does not declare.

- [ ] **Step 4: Run the application by hand, against the real store**

```bash
deno task lab            # the board store on 8777, in one terminal
pnpm nx serve lab        # the application on 8779, in another
```

Open `http://localhost:8779/`, press Generate, and check three things the tests cannot: the board appears in the element's own control bar; the status line reports the save; and `packages/cli/boards/` gained a directory. Then switch to Saved boards and back mid-run and confirm the run survives.

- [ ] **Step 5: Commit and open the pull request**

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
full tablist pattern), three routes, the board-store client behind a Vite proxy
that rewrites the `Origin` the server checks, the run slice, one long-lived
generation worker with `useGenerator` mounted above the routes, the board drawn
through `@lit/react`, and one path walked end to end: Generate, carve, draw,
save.

**Two tests earn their place.** `tokens.test.ts` pins the sixteen tokens the
spec keeps, including the two the mock defines and never uses.
`fingerprint.browser.test.ts` is the successor to `lab-bundle.test.ts`: it
proves the Vite-built worker carves the board the engine carves, and §8 asks
for it to exist before PR 8 deletes the Deno one.

**What is deliberately absent**, each with its own PR: the knob console (3),
the simple view, the language switch and the report (4), the library (5), the
docs content (6), the run filmstrip and the ⌘K palette (7). The old lab in
`packages/cli` is untouched and retires in PR 8.

**Stacked on #63.** Retarget with `gh pr edit --base main` once that merges.
MD
)"
```
