import { assert, assertEquals } from '@std/assert'
import { type Dictionary, EN, PL, type UiKey } from './lab-i18n.ts'
// @ts-types="./engine.d.ts"
import { INACTIVE_REASONS, PARAM_SPEC, RULE_REASONS } from './engine.mjs'
import type { InactiveKey, RuleKey } from './types.ts'

type GroupHelpKey = keyof Dictionary['groupHelp']

const ruleKeys: RuleKey[] = ['sharesSum', 'lmaxHole', 'mixHole']
const reasonKeys = (o: Record<string, string>) => Object.keys(o) as (InactiveKey | RuleKey)[]
const uiKeys = (d: Dictionary) => Object.keys(d.ui) as UiKey[]
const groupHelpKeys = (d: Dictionary) => Object.keys(d.groupHelp) as GroupHelpKey[]

Deno.test('Polish dictionary covers every parameter and group', () => {
  for (const s of PARAM_SPEC) {
    assert(PL.params[s.key]?.label, `label ${s.key}`)
    assert(PL.params[s.key]?.help, `help ${s.key}`)
  }
  for (const g of new Set(PARAM_SPEC.map((s) => s.group))) {
    assert(PL.groups[g], `group ${g}`)
    assert(EN.groups[g], `group ${g}`)
  }
})

// The lab translates a reason by key, so PL.reasons must mirror the two engine
// tables exactly: every inactive reason and every cross-knob rule, nothing else.
Deno.test('Polish reasons mirror the inactive reasons and the cross-knob rules', () => {
  const engineKeys = new Set([...reasonKeys(INACTIVE_REASONS), ...reasonKeys(RULE_REASONS)])
  for (const k of engineKeys) assert(PL.reasons[k], `reason ${k}`)
  for (const k of reasonKeys(PL.reasons)) assert(engineKeys.has(k), `stale reason ${k}`)
  for (const k of ruleKeys) assert(RULE_REASONS[k] && PL.reasons[k], `rule ${k}`)
  assert(!('stepNonZero' in INACTIVE_REASONS), 'stepNonZero was removed from the engine')
})

Deno.test('EN and PL ui dictionaries have the same keys and the same value kinds', () => {
  const en = uiKeys(EN).sort(), pl = uiKeys(PL).sort()
  assertEquals(pl, en)
  for (const k of en) assertEquals(typeof PL.ui[k], typeof EN.ui[k], k)
  assertEquals(groupHelpKeys(PL).sort(), groupHelpKeys(EN).sort())
})

Deno.test('both ui dictionaries describe the safe envelope', () => {
  const dictionaries: Dictionary[] = [EN, PL]
  const envelopeKeys: UiKey[] = ['violationsTitle', 'generateBlocked', 'clamped', 'storedInvalid']
  for (const d of dictionaries) {
    for (const k of envelopeKeys) {
      assertEquals(typeof d.ui[k], 'string', k)
      assert(d.ui[k].length > 0, k)
    }
    assertEquals(typeof d.ui.rangeViolation, 'function')
    const text = d.ui.rangeViolation('straightness bias', 0.4, 0.6, 1)
    assertEquals(typeof text, 'string')
    assert(text.includes('straightness bias'), text)
    assert(text.includes('0.4'), text)
    assert(text.includes('0.6..1'), text)
  }
})

// Descriptions are for turning a knob, not for reading a report: one or two
// plain sentences. Measurements belong in README.md.
const MAX_HELP = 170
Deno.test('parameter and group descriptions stay short in both languages', () => {
  for (const s of PARAM_SPEC) {
    assert(s.help.length <= MAX_HELP, `EN help ${s.key}: ${s.help.length} chars`)
    const help = PL.params[s.key].help
    assert(help.length <= MAX_HELP, `PL help ${s.key}: ${help.length} chars`)
  }
  for (const g of groupHelpKeys(EN)) {
    assert(EN.groupHelp[g].length <= MAX_HELP, `EN group ${g}`)
    assert(PL.groupHelp[g].length <= MAX_HELP, `PL group ${g}`)
  }
})
