# Lab CSS cascade and two tokens (refactor 5) Implementation Plan

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:subagent-driven-development (recommended) or superpowers:executing-plans to implement this plan task-by-task. Steps use checkbox (`- [ ]`) syntax for tracking.

**Goal:** The lab's stylesheets lose the `.fw ` prefix that 120 selectors carry only to outrank `.fw button`, and gain two tokens, `--touch` (44px) and `--rule` (`1px solid var(--border)`), with every computed style in the app unchanged.

**Architecture:** `.fw button` becomes `:where(.fw) button`, specificity (0,0,1), so a bare class rule outranks it; then the `.fw ` prefix is removed from every selector that starts with `.fw .<class>`. Root-scoped rules that are not the prefix tax stay (`.fw *`, `.fw :focus-visible`, the scrollbar rules, `.fw > main`, `.fw.menu-open …`). Equivalence is proven by a probe that fingerprints every computed style in the real `App`, compared with baselines taken on `main`.

**Tech Stack:** CSS (Vite), Vitest 5 browser mode (Playwright Chromium), Python 3 for the one-off transform and comparison.

**Spec:** `lab-review.md` › "Refactors worth doing (ranked)" › "5. CSS: remove the `.fw button` specificity tax, add a few tokens, and fix one breakpoint", scoped by the user on 2026-09-30 to: the cascade, `--touch` and `--rule`; no spacing scale, no font-size token. The breakpoint part is already done on `main`: every `max-height` query is 699 and `design/breakpoints.test.ts` pins them to `band.ts`'s `LOW_MAX_HEIGHT`.

## Global Constraints

- Everything in the repository is in English.
- Comments say why, once, in the fewest lines; no history ("used to", "no longer", PR numbers); cite symbols, not `file.css:NN`; non-header blocks ≤ 6 lines (`packages/engine/comments.test.ts` sweeps `apps/lab/src`).
- A pure refactor: no computed style may change. The probe comparison must print `EQUIVALENT`.
- Commit by path, never `git add -A`; no attribution lines. The probe file and its output files are never committed.
- Lab tests run from `apps/lab`. The full gate is `pnpm nx run-many -t verify --skip-nx-cache` and `deno task verify` from the repository root.

## Measured before planning (2026-09-30, on `1fdeb43`)

- The probe (`/Users/tomek/.claude/jobs/7002f1a1/tmp/cascade.probe.browser.test.tsx`) mounts `App` at six sizes (xl 1700×1000, l 1400×900, m 1100×800, s 900×800, low 1400×650, xs 414×896) in seven states (lab, palette, report, menu, simple, /boards, /docs) and fingerprints every element's computed style with `::before`/`::after`: 28 436 rows, identical over two runs. Its second case hovers every visible control and tabs 80 times, in three sizes (l, low, xs) and six states, with transitions off: 1 957 rows, identical over two runs except 46 focus rows on the palette's `#cmd-input` (the comparison treats those as unstable).
- The transform in Task 1 applied to all five sheets that carry the prefix: 120 selectors lose `.fw `, and both cases compare equal to the baselines (0 static rows, 0 interaction rows differ). The one `:active` rule was checked by hand: `.fw-go:active:not(:disabled)` and its only `background` rival `.fw-go.busy` both lose (0,1,0), so their order holds; the `run.css` rules that match `.fw-go` at (0,5,0) set no `background`.
- `44px` appears 46 times, every one a touch target or the track of a handle that is one (the drawer handle, `--hd`, `--fw-strip`). `1px solid var(--border)` appears 27 times.

## How to run the probe

From `apps/lab`, in the task's worktree:

```bash
cp /Users/tomek/.claude/jobs/7002f1a1/tmp/cascade.probe.browser.test.tsx src/
VITE_PROBE_LABEL=<label> pnpm exec vitest run --project chromium src/cascade.probe.browser.test.tsx
python3 /Users/tomek/.claude/jobs/7002f1a1/tmp/compare-cascade.py <label>
rm src/cascade.probe.browser.test.tsx cascade-<label>.tsv cascade-<label>-interact.tsv
```

The run takes about 15 minutes (use a 30-minute timeout). The comparison prints `EQUIVALENT` and exits 0, or lists the differing rows (state, path) and exits 1. The baselines live in `/Users/tomek/.claude/jobs/7002f1a1/tmp/probe-out/` and were taken on `1fdeb43`; if `apps/lab/src` changed on `main` since then (`git diff 1fdeb43 origin/main --stat -- apps/lab/src`), retake them first: run the probe twice on the unmodified tree with labels `base1`/`base2` and `jbase…`, and copy `cascade-base1.tsv`, `cascade-base2.tsv`, `cascade-base1-interact.tsv` → `probe-out/cascade-jbase1-interact.tsv`, `cascade-base2-interact.tsv` → `probe-out/cascade-jbase2-interact.tsv`.

## Review Focus

1. A rule that outranked another only through the prefix, in a state the probe does not reach (a disabled control, a `[aria-…]` state, a hover in the `m`/`s` bands). Expect: the comparison stays `EQUIVALENT`; the reviewer checks the `:disabled`, `:not(…)` and attribute selectors in the diff by hand, as the plan did for `:active`.
2. A later edit that re-adds the tax (a new `.fw .x` rule). Task 1's guard fails.
3. A comment that still explains the prefix. Task 1 lists them; `grep -n "prefix\|(0,1,1)\|\.fw \.fw" apps/lab/src/design/*.css` must return only comments that are still true.
4. `var(--touch)` inside `calc()`, `max()`, `grid-template-columns` and custom properties resolves to the same 44px. The probe's `EQUIVALENT` covers it.
5. `tokens.test.ts` pins the token list in order; adding two tokens changes that list deliberately.

---

### Task 1: `:where(.fw) button`, the prefix removed, and a guard

**Files:**
- Modify: `apps/lab/src/design/shell.css`, `console.css`, `run.css`, `library.css`, `docs.css`
- Create: `apps/lab/src/design/prefix.test.ts` (node project)

- [ ] **Step 1: Write the failing guard**

`apps/lab/src/design/prefix.test.ts`:

```ts
import { expect, test } from 'vitest'

const SHEETS = import.meta.glob<string>('./*.css', { query: '?raw', import: 'default', eager: true })

// `.fw button` is `:where(.fw) button`, (0,0,1), so a bare class outranks it;
// a `.fw .x` selector would bring back the specificity the `:where` removed.
test('no selector in design/*.css starts with `.fw .`', () => {
  const offenders = Object.entries(SHEETS).flatMap(([name, css]) =>
    css
      .replace(/\/\*[\s\S]*?\*\//g, '')
      .split('\n')
      .filter((line) => /^\s*\.fw \./.test(line) || /,\s*\.fw \./.test(line))
      .map((line) => `${name}: ${line.trim()}`),
  )
  expect(offenders).toEqual([])
})

test('the button reset has no specificity of its own beyond the element', () => {
  const shell = SHEETS['./shell.css'] ?? ''
  expect(shell).toContain(':where(.fw) button {')
  expect(shell).not.toMatch(/^\.fw button \{/m)
})
```

- [ ] **Step 2: Run it to verify it fails**

Run (from `apps/lab`): `pnpm exec vitest run --project node src/design/prefix.test.ts`
Expected: FAIL — the first case lists 120 offenders, the second fails on `:where(.fw) button`.

- [ ] **Step 3: Apply the transform**

From `apps/lab/src/design`:

```bash
python3 - <<'EOF'
import re
total = 0
for f in ['shell.css', 'console.css', 'run.css', 'library.css', 'docs.css']:
    s = open(f).read()
    s, n = re.subn(r'(^[ \t]*|,\s*)\.fw (?=\.)', r'\1', s, flags=re.M)
    if f == 'shell.css':
        assert s.count('.fw button {') == 1
        s = s.replace('.fw button {', ':where(.fw) button {', 1)
    open(f, 'w').write(s)
    total += n
print(total)
EOF
```

Expected output: `120`. `report.css` and `palette.css` carry no prefix.

- [ ] **Step 4: Rewrite the comments that explain the prefix**

Above `:where(.fw) button` in `shell.css`, put:

```css
/* `:where` keeps this reset at (0,0,1): any class rule outranks it, so no
   component rule needs a `.fw` prefix to paint its own colour or font. */
```

Then remove the prefix rationale everywhere else; each one now explains code that is not there:
- `shell.css`, the comment above `.fw-go {` ("`.fw .fw-go` and not a bare `.fw-go`: … and every rule of the component carries it."): delete it.
- `shell.css`, the comment above `.fw-seg {`: delete its last sentence ("The `.fw` prefix for the reason `.fw .fw-go` gives above.").
- `shell.css`, the comment above `.fw-btn {`: delete its last sentence ("(0,2,0) outranks `.fw button`.").
- `console.css`, the comment above `.fw-palette-remove {` ("`.fw` because `.fw button`'s `color: inherit` (0,1,1) outranked the bare class and the mist never applied."): delete it.
- `run.css`, the comment above `.fw-alt button {` ("`.fw .fw-alt button` and not a bare selector: … Every rule in this file carries the prefix for the same reason."): delete it.
- `run.css`, the comment above `.fw-alt button:disabled`: change "`.fw .fw-go:disabled`" to "`.fw-go:disabled`".

Then search for any other: `grep -n "prefix\|(0,1,1)\|\.fw \.fw\|\.fw button" apps/lab/src/design/*.css`. Every remaining hit must be a true statement about the code as it now is; rewrite or delete the rest in the same way. Leave comments about other specificity (for example "(0,2,0) after `.fw-lab.simple`" in `console.css`) alone.

- [ ] **Step 5: Run the guard and the design tests**

Run: `pnpm exec vitest run --project node src/design` → PASS (the new guard, `breakpoints`, `tokens`, `console`, `shell`, `palette`, `index`).

- [ ] **Step 6: Prove equivalence with the probe**

Run the probe as in "How to run the probe" with label `task1`.
Expected: `EQUIVALENT`. If rows differ, dump the full properties of the first differing path on both trees (set `VITE_PROBE_ONLY` to `"<state>\t<path>"`, run once with the change, then copy `apps/lab/src/design/*.css` to a temporary directory, `git checkout -- apps/lab/src/design`, run once more, and copy the sheets back; never use `git stash`, the stash is shared with other sessions), find the property that changed, and restore that rule's precedence by adding the smallest selector context (never `.fw `) or by reordering; then rerun until `EQUIVALENT`. Record every such case in the report.

- [ ] **Step 7: Lint, format, type check**

Run (from the repository root): `pnpm nx run-many -t lint fmt check -p lab` → clean.

- [ ] **Step 8: Commit**

```bash
git add apps/lab/src/design/shell.css apps/lab/src/design/console.css apps/lab/src/design/run.css apps/lab/src/design/library.css apps/lab/src/design/docs.css apps/lab/src/design/prefix.test.ts
git commit -m "Lab CSS: :where(.fw) button, and no rule carries a .fw prefix to beat it"
```

The body says: 120 selectors lost the prefix; a computed-style fingerprint of the app (42 states, plus hover and keyboard focus) is identical before and after.

---

### Task 2: `--touch` and `--rule`

**Files:**
- Modify: `apps/lab/src/design/tokens.css`, `apps/lab/src/design/tokens.test.ts`
- Modify: every sheet that uses `44px` or `1px solid var(--border)` in a declaration

- [ ] **Step 1: Update the pinned token list first**

In `tokens.test.ts`, add `'--touch'` and `'--rule'` at the end of the expected list (after `'--mono'`), and change the test name and its comment from eighteen to twenty tokens ("…the twenty tokens the lab keeps, in order").

- [ ] **Step 2: Run it to verify it fails**

Run: `pnpm exec vitest run --project node src/design/tokens.test.ts` → FAIL (the two tokens are missing).

- [ ] **Step 3: Declare the tokens**

At the end of the `:root` block in `tokens.css`, after `--mono`:

```css
  /* A finger's target where there is no hover (WCAG 2.5.5). */
  --touch: 44px;
  --rule: 1px solid var(--border);
```

- [ ] **Step 4: Use them**

From `apps/lab/src/design`, replace the values only inside declarations, never inside comments:

```bash
python3 - <<'EOF'
import re
for f in ['shell.css', 'console.css', 'run.css', 'library.css', 'docs.css', 'report.css', 'palette.css']:
    s = open(f).read()
    parts = re.split(r'(/\*[\s\S]*?\*/)', s)
    out, n1, n2 = [], 0, 0
    for p in parts:
        if p.startswith('/*'):
            out.append(p); continue
        p, a = re.subn(r'\b44px\b', 'var(--touch)', p)
        p, b = re.subn(r'1px solid var\(--border\)(?=[;\s])', 'var(--rule)', p)
        n1 += a; n2 += b
        out.append(p)
    open(f, 'w').write(''.join(out))
    print(f, n1, n2)
EOF
```

Expected totals: 37–46 for `--touch` (some of the 46 hits are inside comments) and 27 for `--rule`. Check `grep -n "44px" *.css` afterwards: every remaining hit is in a comment.

- [ ] **Step 5: Run the design tests**

Run: `pnpm exec vitest run --project node src/design` → PASS.

- [ ] **Step 6: Prove equivalence with the probe**

Label `task2`. Expected: `EQUIVALENT` (Task 1's change is in the tree; the baselines are `main`'s, so this also re-proves Task 1).

- [ ] **Step 7: Lint, format, type check**

`pnpm nx run-many -t lint fmt check -p lab` → clean.

- [ ] **Step 8: Commit**

```bash
git add apps/lab/src/design/*.css apps/lab/src/design/tokens.test.ts
git commit -m "Lab CSS: --touch and --rule tokens"
```

(`git status` first: only `apps/lab/src/design` files may be staged; the probe and its outputs must be gone.)

---

### Task 3: Mark refactor 5 done, and the full gate

**Files:** Modify `lab-review.md`.

- [ ] **Step 1: Update `lab-review.md`**

- "What is still open", item 3: `5 (the \`.fw button\` prefix and tokens) and 11; 7 is done on \`lab/test-fixtures\`.` → `11; 5 and 7 are done.`
- Under "#### 5. CSS: remove the `.fw button` specificity tax, add a few tokens, and fix one breakpoint" add one line: `**Done on \`lab/css-cascade\`:** \`:where(.fw) button\` and no \`.fw\` prefixes (guarded by \`design/prefix.test.ts\`), \`--touch\` and \`--rule\`; the breakpoint was already aligned and pinned by \`design/breakpoints.test.ts\`. The spacing scale and a font-size token were left out by decision.`
- In the status table under "### Refactors", set row 5's status to `fixed on \`lab/css-cascade\`` and its note to `\`:where(.fw) button\`, 120 prefixes removed, \`--touch\`/\`--rule\`; computed styles identical (probe); spacing scale left out`.

- [ ] **Step 2: Full gate**

From the repository root: `set -o pipefail; pnpm nx run-many -t verify --skip-nx-cache 2>&1 | tail -15` → "Successfully ran target verify for 4 projects"; `deno task verify 2>&1 | tail -3` → all pass.

- [ ] **Step 3: Commit**

```bash
git add lab-review.md
git commit -m "lab-review: refactor 5 done"
```

## Out of scope

- A spacing scale and a font-size token (the user's scope decision).
- The other `.fw`-rooted rules (`.fw *`, `.fw :focus-visible`, the scrollbars, `.fw > main`, `.fw.menu-open …`): they scope to the app root on purpose.
