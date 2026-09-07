import { test } from 'node:test'
import assert from 'node:assert/strict'
import { EN, PL } from './lab-i18n.mjs'
import { PARAM_SPEC, INACTIVE_REASONS } from './engine.mjs'

test('Polish dictionary covers every parameter and inactive reason', () => {
  for (const s of PARAM_SPEC) {
    assert.ok(PL.params[s.key]?.label, `label ${s.key}`)
    assert.ok(PL.params[s.key]?.help, `help ${s.key}`)
  }
  for (const k of Object.keys(INACTIVE_REASONS)) assert.ok(PL.reasons[k], `reason ${k}`)
  for (const g of new Set(PARAM_SPEC.map((s) => s.group))) {
    assert.ok(PL.groups[g], `group ${g}`)
    assert.ok(EN.groups[g], `group ${g}`)
  }
})

test('EN and PL ui dictionaries have the same keys and the same value kinds', () => {
  const en = Object.keys(EN.ui).sort(), pl = Object.keys(PL.ui).sort()
  assert.deepEqual(pl, en)
  for (const k of en) assert.equal(typeof PL.ui[k], typeof EN.ui[k], k)
  assert.deepEqual(Object.keys(PL.groupHelp).sort(), Object.keys(EN.groupHelp).sort())
})

// Descriptions are for turning a knob, not for reading a report: one or two
// plain sentences. Measurements belong in README.md.
const MAX_HELP = 170
test('parameter and group descriptions stay short in both languages', () => {
  for (const s of PARAM_SPEC) {
    assert.ok(s.help.length <= MAX_HELP, `EN help ${s.key}: ${s.help.length} chars`)
    assert.ok(PL.params[s.key].help.length <= MAX_HELP, `PL help ${s.key}: ${PL.params[s.key].help.length} chars`)
  }
  for (const g of Object.keys(EN.groupHelp)) {
    assert.ok(EN.groupHelp[g].length <= MAX_HELP, `EN group ${g}`)
    assert.ok(PL.groupHelp[g].length <= MAX_HELP, `PL group ${g}`)
  }
})
