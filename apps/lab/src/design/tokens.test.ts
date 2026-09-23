import { expect, test } from 'vitest'
import tokens from './tokens.css?raw'

const declared = [...tokens.matchAll(/^\s*(--[\w-]+):/gm)].map((m) => m[1])

// The mock declares eighteen custom properties. Spec §7.1 kept sixteen; the
// Signal-plane decision (2026-09-22 spec §5) swaps `--signal-hover` and
// `--signal-press` for three fills that carry `--ink` text at AA, and round 3
// of the handoff ports `--ok` for a better change in the report.
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

// Declared by the mock and never used by it. Copying it would import a dead
// name into a design system that is about to be extended. `--ok` was the
// other one until round 3 gave it a use (report.css).
test('the unused token of the mock is not ported', () => {
  expect(declared).not.toContain('--signal-soft')
})
