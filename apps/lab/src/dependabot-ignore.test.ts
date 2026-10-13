// .github/dependabot.yml tells Dependabot to skip TypeScript 7 while
// typescript-eslint, which the lab's lint runs, cannot run on it. A skipped
// version brings no pull request and no alert, so this test is the signal: it
// fails in the pull request that brings a typescript-eslint whose range takes
// TypeScript 7. Delete this file together with the ignore.
import { expect, test } from 'vitest'
import dependabot from '../../../.github/dependabot.yml?raw'
import eslintManifest from 'typescript-eslint/package.json?raw'

type Version = readonly [number, number, number]
const SEVEN: Version = [7, 0, 0]

const compare = (a: Version, b: Version): number => a[0] - b[0] || a[1] - b[1] || a[2] - b[2]

/**
 * Whether a peer range lets in any version from 7.0.0 up. It reads full
 * versions under a comparator, joined by spaces and `||`, which is how
 * typescript-eslint writes its range, and throws on anything else: a range
 * this cannot read is a reason to look, not a pass.
 */
function admitsSeven(range: string): boolean {
  return range.split('||').some((alternative) => {
    let open = true
    for (const part of alternative.trim().split(/\s+/)) {
      const m = /^(>=|<=|>|<|=)?(\d+)\.(\d+)\.(\d+)$/.exec(part)
      if (m === null) throw new Error(`cannot read "${part}" in the range "${range}"`)
      const at = compare([Number(m[2]), Number(m[3]), Number(m[4])], SEVEN)
      const op = m[1] ?? '='
      if (op === '<' && at <= 0) open = false
      if ((op === '<=' || op === '=') && at < 0) open = false
    }
    return open
  })
}

/** Whether the Dependabot file skips `typescript` from 7.0.0 up. */
const skipsSeven = (yaml: string): boolean =>
  /- dependency-name: typescript\r?\n\s+versions: \[['"]>=7\.0\.0['"]\]/.test(yaml)

/** What to change when the two disagree; null while they agree. */
function verdict(range: string, yaml: string): string | null {
  const admitted = admitsSeven(range)
  const skipped = skipsSeven(yaml)
  if (admitted && skipped) {
    return `typescript-eslint takes TypeScript 7 now (it asks for "${range}"): remove the ignore of typescript from .github/dependabot.yml, so Dependabot proposes it`
  }
  if (!admitted && !skipped) {
    return `.github/dependabot.yml does not skip TypeScript 7, and typescript-eslint cannot run on it (it asks for "${range}"): Dependabot would propose a version the lab's lint refuses`
  }
  return null
}

/** The range of TypeScript the installed typescript-eslint asks for. */
function installedRange(): string {
  const manifest: unknown = JSON.parse(eslintManifest)
  const peers =
    typeof manifest === 'object' && manifest !== null && 'peerDependencies' in manifest
      ? manifest.peerDependencies
      : null
  const range = typeof peers === 'object' && peers !== null && 'typescript' in peers ? peers.typescript : null
  if (typeof range !== 'string') throw new Error('typescript-eslint names no range of typescript')
  return range
}

const SKIPPING = "    ignore:\n      - dependency-name: typescript\n        versions: ['>=7.0.0']\n"

test('admitsSeven says whether a range of comparators lets in 7.0.0 or later', () => {
  const cases: [string, boolean][] = [
    ['>=4.8.4 <6.1.0', false],
    ['>=4.8.4 <7.0.0', false],
    ['>=4.8.4 <=6.0.3', false],
    ['6.0.3', false],
    ['>=4.8.4 <7.1.0', true],
    ['>=4.8.4 <=7.0.0', true],
    ['>=4.8.4', true],
    ['7.0.2', true],
    ['>=4.8.4 <6.1.0 || >=7.1.0 <7.2.0', true],
    ['>=4.8.4 <6.1.0 || >=6.2.0 <6.3.0', false],
  ]
  for (const [range, admitted] of cases) expect(admitsSeven(range), range).toBe(admitted)
})

test('admitsSeven throws on a range it cannot read', () => {
  for (const range of ['^7.0.0', '>=4.8.4 <7', '*', '', '>=4.8.4 <6.1.0 ||']) {
    expect(() => admitsSeven(range), `"${range}"`).toThrow('cannot read')
  }
})

test('skipsSeven finds the entry for typescript, and no other', () => {
  expect(skipsSeven(SKIPPING)).toBe(true)
  expect(skipsSeven(SKIPPING.replace("['>=7.0.0']", '[">=7.0.0"]'))).toBe(true)
  expect(skipsSeven(SKIPPING.replace('typescript', 'typescript-eslint'))).toBe(false)
  expect(skipsSeven(SKIPPING.replace('>=7.0.0', '>=8.0.0'))).toBe(false)
  expect(skipsSeven('')).toBe(false)
})

test('the verdict names the side to change, and is silent while the two agree', () => {
  expect(verdict('>=4.8.4 <6.1.0', SKIPPING)).toBeNull()
  expect(verdict('>=4.8.4 <7.2.0', '')).toBeNull()
  expect(verdict('>=4.8.4 <7.2.0', SKIPPING)).toContain('remove the ignore of typescript')
  expect(verdict('>=4.8.4 <6.1.0', '')).toContain('does not skip TypeScript 7')
})

test('Dependabot skips TypeScript 7 exactly while typescript-eslint cannot run on it', () => {
  const problem = verdict(installedRange(), dependabot)
  // As the assertion's message too: Vitest cuts a long value short, and this one says what to do.
  expect(problem, problem ?? undefined).toBeNull()
})
