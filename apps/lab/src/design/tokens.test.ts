import { expect, test } from 'vitest'
import tokens from './tokens.css?raw'

const declared = [...tokens.matchAll(/^\s*(--[\w-]+):/gm)].map((m) => m[1])

// The mock's eighteen custom properties, less `--signal-soft` (below) and
// `--signal-hover`/`--signal-press`, replaced by three fills that carry
// `--ink` text at AA.
test('tokens.css declares the eighteen tokens the lab keeps, in order', () => {
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
    '--signal-fill',
    '--signal-fill-hover',
    '--signal-fill-press',
    '--ok',
    '--warn',
    '--error',
    '--ui',
    '--mono',
  ])
})

// Declared by the mock and never used by it: a dead name.
test('the unused token of the mock is not ported', () => {
  expect(declared).not.toContain('--signal-soft')
})
