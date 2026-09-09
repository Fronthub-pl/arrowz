import { test } from 'node:test'
import assert from 'node:assert/strict'
import { EN, PL } from './lab-i18n.mjs'
import { INACTIVE_REASONS, PARAM_SPEC, RULE_REASONS } from './engine.mjs'

test('Polish dictionary covers every parameter and group', () => {
  for (const s of PARAM_SPEC) {
    assert.ok(PL.params[s.key]?.label, `label ${s.key}`)
    assert.ok(PL.params[s.key]?.help, `help ${s.key}`)
  }
  for (const g of new Set(PARAM_SPEC.map((s) => s.group))) {
    assert.ok(PL.groups[g], `group ${g}`)
    assert.ok(EN.groups[g], `group ${g}`)
  }
})

// The lab translates a reason by key, so PL.reasons must mirror the two engine
// tables exactly: every inactive reason and every cross-knob rule, nothing else.
test('Polish reasons mirror the inactive reasons and the cross-knob rules', () => {
  const engineKeys = new Set([...Object.keys(INACTIVE_REASONS), ...Object.keys(RULE_REASONS)])
  for (const k of engineKeys) assert.ok(PL.reasons[k], `reason ${k}`)
  for (const k of Object.keys(PL.reasons)) assert.ok(engineKeys.has(k), `stale reason ${k}`)
  for (const k of ['sharesSum', 'lmaxHole', 'mixHole']) assert.ok(RULE_REASONS[k] && PL.reasons[k], `rule ${k}`)
  assert.equal(INACTIVE_REASONS.stepNonZero, undefined, 'stepNonZero was removed from the engine')
})

test('EN and PL ui dictionaries have the same keys and the same value kinds', () => {
  const en = Object.keys(EN.ui).sort(), pl = Object.keys(PL.ui).sort()
  assert.deepEqual(pl, en)
  for (const k of en) assert.equal(typeof PL.ui[k], typeof EN.ui[k], k)
  assert.deepEqual(Object.keys(PL.groupHelp).sort(), Object.keys(EN.groupHelp).sort())
})

test('both ui dictionaries describe the safe envelope', () => {
  for (const d of [EN, PL]) {
    for (const k of ['violationsTitle', 'generateBlocked', 'clamped', 'storedInvalid']) {
      assert.equal(typeof d.ui[k], 'string', k)
      assert.ok(d.ui[k].length > 0, k)
    }
    assert.equal(typeof d.ui.rangeViolation, 'function')
    const text = d.ui.rangeViolation('straightness bias', 0.4, 0.6, 1)
    assert.equal(typeof text, 'string')
    assert.ok(text.includes('straightness bias'), text)
    assert.ok(text.includes('0.4'), text)
    assert.ok(text.includes('0.6..1'), text)
  }
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
