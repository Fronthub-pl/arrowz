import { assert, assertEquals } from '@std/assert'
import { type Dictionary, EN, escapeHtml, PL, type UiKey } from './lab-i18n.ts'
import { INACTIVE_REASONS, PARAM_SPEC, RULE_REASONS } from './engine.ts'
import type { InactiveKey, ParamKey, RuleKey } from './types.ts'

type GroupHelpKey = keyof Dictionary['groupHelp']

const ruleKeys: RuleKey[] = ['sharesSum', 'lmaxHole', 'startPair']
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

// A knob with a `choice` control is drawn as the CLI's own list of values, so
// every choice needs a Polish word; English takes the word PARAM_SPEC gives it.
// The start control has no PARAM_SPEC row at all, so both languages carry its
// label, its help and its four choices.
Deno.test('both dictionaries cover the fixed-choice knobs and the start control', () => {
  const choiceKeys = new Set<ParamKey>()
  for (const s of PARAM_SPEC) {
    if (s.control?.kind !== 'choice') continue
    choiceKeys.add(s.key)
    const words = PL.choices[s.key]
    assert(words, `no Polish words for ${s.key}`)
    for (const c of s.control.choices) assert(words[c.word], `Polish word for ${s.key}=${c.word}`)
  }
  assert(choiceKeys.size > 0, 'the lab draws at least one knob as a list of values')
  for (const k of Object.keys(PL.choices)) assert(choiceKeys.has(k as ParamKey), `stale choices ${k}`)
  const dictionaries: Dictionary[] = [EN, PL]
  for (const d of dictionaries) {
    assert(d.start.label.length > 0, 'start label')
    for (const word of Object.values(d.start.options)) {
      assert(word.length > 0, 'start option')
      // The help is the only place the four choices are explained, so it names them.
      assert(d.start.help.toLowerCase().includes(word.toLowerCase()), `the start help names ${word}`)
    }
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
  const envelopeKeys: UiKey[] = ['violationsTitle', 'generateBlocked', 'clamped']
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
    assertEquals(typeof d.ui.stepViolation, 'function')
    const step = d.ui.stepViolation('maximum backtracks', 25, 0, 50)
    assertEquals(typeof step, 'string')
    assert(step.includes('maximum backtracks'), step)
    assert(step.includes('25'), step)
    assert(step.includes('0'), step)
    assert(step.includes('50'), step)
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

Deno.test('both ui dictionaries explain a board file that cannot be read', () => {
  for (const d of [EN, PL]) {
    const text = d.ui.boardFileError('25x50/seed7-abc', 'the body ends early')
    assert(text.includes('25x50/seed7-abc') && text.includes('the body ends early'), text)
  }
})

Deno.test('escapeHtml turns every markup character into an entity', () => {
  assertEquals(escapeHtml(`<img src=x onerror="a('&')">`), '&lt;img src=x onerror=&quot;a(&#39;&amp;&#39;)&quot;&gt;')
  assertEquals(escapeHtml(42), '42')
  assertEquals(escapeHtml('seed7-ab12cd34'), 'seed7-ab12cd34')
})
