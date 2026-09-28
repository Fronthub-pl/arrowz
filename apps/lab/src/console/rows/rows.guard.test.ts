import { expect, test } from 'vitest'

// Every source under console/ and simple/, as text, tests excluded.
const SOURCES = import.meta.glob<string>(
  ['../../console/**/*.{ts,tsx}', '../../simple/**/*.{ts,tsx}', '!**/*.test.*'],
  {
    query: '?raw',
    import: 'default',
    eager: true,
  },
)

// `import.meta.glob` keys a file by its shortest path from here.
const OWNER = './RowShell.tsx'

// A `${…}-` composition or a literal id with two dashes: the classes `kv-help`, `kv-why`, `kv-ends` do not count.
const ROW_PART_ID = /(\}|\w-\w+)-(help|why|desc|ends|label)[`'"]/

test('the guard reads the row sources', () => {
  expect(Object.keys(SOURCES)).toContain(OWNER)
  expect(Object.keys(SOURCES).length).toBeGreaterThan(10)
})

test('only RowShell writes the kv-row element or spells a row part’s id', () => {
  const offenders = Object.entries(SOURCES)
    .filter(([path]) => path !== OWNER)
    .flatMap(([path, text]) =>
      text
        .split('\n')
        .map((line, index) => ({ path, line: index + 1, text: line }))
        .filter(({ text: line }) => /className=\{?[`'"]kv-row/.test(line) || ROW_PART_ID.test(line)),
    )
  expect(offenders.map(({ path, line, text }) => `${path}:${line}: ${text.trim()}`)).toEqual([])
})
