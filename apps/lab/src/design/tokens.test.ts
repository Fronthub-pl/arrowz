import { expect, test } from 'vitest'
import tokens from './tokens.css?raw'

const declared = [...tokens.matchAll(/^\s*(--[\w-]+):/gm)].map((m) => m[1])

// The mock declares eighteen custom properties. Spec §7.1 kept sixteen; the
// Signal-plane decision (2026-09-22 spec §5) swaps `--signal-hover` and
// `--signal-press` for three fills that carry `--ink` text at AA.
test('tokens.css declares the seventeen tokens the spec keeps, in order', () => {
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
