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
