import { expect, test } from 'vitest'
import main from '../main.tsx?raw'
import barrel from './index.css?raw'

const sheets = Object.keys(import.meta.glob('./*.css'))
  .map((path) => path.slice(2))
  .filter((name) => name !== 'index.css')
  .sort()
// `slice(1)`, not `m[1]`: `noUncheckedIndexedAccess` types a group as possibly undefined.
const cssImports = (source: string) => [...source.matchAll(/^import '([^']+\.css)'$/gm)].flatMap((m) => m.slice(1))

test('index.css imports every stylesheet in design/, once each', () => {
  const imported = [...barrel.matchAll(/^@import '\.\/([\w-]+\.css)';$/gm)].map((m) => m[1])
  expect([...imported].sort()).toEqual(sheets)
})

test('main.tsx takes its styles from index.css alone', () => {
  expect(cssImports(main)).toEqual(['./design/index.css'])
})

// A test that loads a subset of the cascade can pass on a page the app never shows.
test('no test imports a stylesheet other than index.css', () => {
  const tests = import.meta.glob('../**/*.test.{ts,tsx}', { query: '?raw', import: 'default', eager: true })
  const offenders = Object.entries(tests).flatMap(([file, source]) =>
    cssImports(String(source))
      .filter((path) => !path.endsWith('/index.css') && path !== './index.css')
      .map((path) => `${file}: ${path}`),
  )
  expect(offenders).toEqual([])
})
