import { assert, assertEquals, assertNotEquals, assertStringIncludes } from '@std/assert'
import { type Dictionary, dictionary, EN, escapeHtml, PL, type UiKey } from './lab-i18n.ts'
import { INACTIVE_REASONS, PARAM_SPEC, RULE_REASONS, stepsAround } from './engine.ts'
import type { InactiveKey, ParamKey, RuleKey, Violation } from './types.ts'

type GroupHelpKey = keyof Dictionary['groupHelp']

const ruleKeys: RuleKey[] = ['sharesSum', 'lmaxHole', 'startPair', 'straightFloor']
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

// A number in a description is a bound, and a bound that drifts between the
// two languages is a lie in one of them. Polish writes the decimal comma and
// the multiplication sign, so both sides are normalised before comparing.
const numbersIn = (text: string): string[] =>
  (text.replace(/(\d),(\d)/g, '$1.$2').replace(/[x×]/g, ' ').match(/\d+(?:\.\d+)?/g) ?? []).sort()

Deno.test('every number in an English description appears in the Polish one', () => {
  for (const s of PARAM_SPEC) {
    assertEquals(numbersIn(PL.params[s.key].help), numbersIn(s.help), `help ${s.key}`)
    assertEquals(numbersIn(PL.params[s.key].label), numbersIn(s.label), `label ${s.key}`)
  }
  for (const key of ruleKeys) {
    assertEquals(numbersIn(PL.reasons[key]), numbersIn(RULE_REASONS[key]), `rule ${key}`)
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

Deno.test('both ui dictionaries say a board is not in the store, naming it', () => {
  for (const d of [EN, PL]) {
    const text = d.ui.boardNotStored('25x50/sha256-abc')
    assert(text.includes('25x50/sha256-abc'), text)
  }
  assert(PL.ui.boardNotStored('x') !== EN.ui.boardNotStored('x'), 'the Polish sentence is Polish')
})

Deno.test('escapeHtml turns every markup character into an entity', () => {
  assertEquals(escapeHtml(`<img src=x onerror="a('&')">`), '&lt;img src=x onerror=&quot;a(&#39;&amp;&#39;)&quot;&gt;')
  assertEquals(escapeHtml(42), '42')
  assertEquals(escapeHtml('seed7-ab12cd34'), 'seed7-ab12cd34')
})

Deno.test('dictionary returns the language it was asked for, and two of them coexist', () => {
  // The point of the factory: no module-level `let lang`, so a caller can hold
  // both at once. The coverage tests above already prove PL covers every EN
  // key, so there is no fallback path left to test — this pins that the two
  // instances do not share state.
  const en = dictionary('en')
  const pl = dictionary('pl')
  assertEquals(en.lang, 'en')
  assertEquals(pl.lang, 'pl')
  assertNotEquals(en.t('generate'), pl.t('generate'))
})

Deno.test('paramText takes the label from the language, not from the spec', () => {
  const spec = PARAM_SPEC[0]
  assert(spec)
  assertEquals(dictionary('en').paramText(spec), { label: spec.label, help: spec.help })
  const pl = dictionary('pl').paramText(spec)
  assertNotEquals(pl.label, spec.label)
  assertEquals(pl.label, PL.params[spec.key]?.label)
})

Deno.test('fmt groups by locale and short abbreviates from ten thousand', () => {
  const en = dictionary('en')
  assertEquals(en.fmt(1234567), (1234567).toLocaleString('en'))
  assertEquals(en.short(9999), en.fmt(9999))
  assertEquals(en.short(10000), '10k')
  assertEquals(en.short(86000), '86k')
})

Deno.test('violation names the knob, the value and both bounds for a range break', () => {
  // `W` has min 4, so a single-digit substring match would be satisfied by the
  // value alone: assert against the whole formatted string.
  const spec = PARAM_SPEC.find((s) => s.key === 'W')
  assert(spec)
  const en = dictionary('en')
  const text = en.violation({ kind: 'range', key: 'W', value: spec.min - 1, min: spec.min, max: spec.max })
  assertEquals(text, en.t('rangeViolation', spec.label, spec.min - 1, spec.min, spec.max))
  assert(text.includes(String(spec.max)), text)
})

Deno.test('violation offers the two legal stops around a step break', () => {
  const spec = PARAM_SPEC.find((s) => s.step > 0)
  assert(spec)
  const value = spec.min + spec.step / 2
  const [below, above] = stepsAround(value, spec.step, spec.min)
  assertNotEquals(below, above)
  const en = dictionary('en')
  const text = en.violation({ kind: 'step', key: spec.key, value, step: spec.step, min: spec.min })
  // The whole string, not two substrings: `4` and `5` both occur inside `4.5`.
  assertEquals(text, en.t('stepViolation', en.paramText(spec).label, value, below, above))
})

Deno.test('violation reads a rule reason in both languages and appends what is needed', () => {
  // `kind: 'rule'` carries the knobs the rule spans as well as its key.
  const ruleKey = Object.keys(RULE_REASONS)[0] as RuleKey
  const v: Violation = { kind: 'rule', key: ruleKey, keys: [], need: 0.7 }
  const en = dictionary('en').violation(v)
  const pl = dictionary('pl').violation(v)
  assert(en.includes('0.7'), en)
  assertNotEquals(en, pl)
})

// `reason` dispatches an InactiveKey to INACTIVE_REASONS and a RuleKey to
// RULE_REASONS (see the `Object.hasOwn` check in lab-i18n.ts). An inverted
// condition there would make one branch return `undefined`, and a dimmed
// knob's tooltip would render the literal text "undefined" — so this pins
// both branches against the tables the factory actually reads.
Deno.test('reason resolves an inactive key from INACTIVE_REASONS and a rule key from RULE_REASONS', () => {
  const en = dictionary('en')
  assertEquals(en.reason('skeletonOff'), INACTIVE_REASONS.skeletonOff)
  assertEquals(en.reason('sharesSum'), RULE_REASONS.sharesSum)
})

Deno.test('choiceText looks up a real Polish word for a real choice pair', () => {
  const pl = dictionary('pl')
  const words = PL.choices.trapBias
  assert(words, 'expected PL.choices.trapBias to exist')
  assertEquals(pl.choiceText('trapBias', 'seek'), words.seek)
})

Deno.test('the third tab has a name in both languages', () => {
  assertEquals(dictionary('en').t('tabDocs'), 'Docs')
  assertEquals(dictionary('pl').t('tabDocs'), 'Dokumentacja')
})

Deno.test('the tab strip has a name of its own, distinct from every tab', () => {
  for (const lang of ['en', 'pl'] as const) {
    const dict = dictionary(lang)
    const strip = dict.t('tabsLabel')
    assert(strip.length > 0)
    for (const tab of ['tabLab', 'tabLibrary', 'tabDocs'] as const) assertNotEquals(strip, dict.t(tab))
  }
})

// The key-set test above fails for a key present in one language only; this
// one fails for a key missing from both, which that test cannot see.
Deno.test('both ui dictionaries carry the report, export and annotation words', () => {
  const dictionaries: Dictionary[] = [EN, PL]
  const words: UiKey[] = [
    'reportPanel',
    'statsTable',
    'deltaBetter',
    'deltaWorse',
    'exportsGroup',
    'downloadBoardFile',
    'exportError',
    'themeLabel',
    'themeNone',
    'svgThemeNote',
    'showPoints',
    'pointColorLabel',
    'pointRadiusLabel',
    'pointRadiusHelp',
    'paperLabel',
    'inkLabel',
    'paperClear',
    'inkClear',
  ]
  for (const d of dictionaries) {
    for (const k of words) {
      assertEquals(typeof d.ui[k], 'string', k)
      assert(String(d.ui[k]).length > 0, k)
    }
    const annotation = d.ui.boardAnnotation(25, 50, 7)
    assertStringIncludes(annotation, '25×50')
    assertStringIncludes(annotation, '7')
  }
})

Deno.test('the console rail names itself and its two sections in both languages', () => {
  for (const lang of ['en', 'pl'] as const) {
    const dict = dictionary(lang)
    const label = dict.t('railLabel')
    assertNotEquals(label, '')
    // The rail's name must not collide with the tab strip's: a screen reader
    // lists both landmarks, and two navigations called the same thing are
    // indistinguishable.
    assertNotEquals(label, dict.t('tabsLabel'))
    assertNotEquals(dict.t('railGenerator'), dict.t('railElement'))
    // A count in a tab's name has to say what it counts.
    const named = dict.t('violationsInGroup', 'shape', 2)
    assertStringIncludes(named, 'shape')
    assertStringIncludes(named, '2')
    assertNotEquals(named, 'shape 2')
  }
})

Deno.test('the rule marker states the bound it marks', () => {
  assertEquals(dictionary('en').t('ruleBound', 0.75), 'Rule bound: 0.75')
  assertEquals(dictionary('pl').t('ruleBound', 0.75), 'Granica reguły: 0,75')
})

// `paletteHelp` takes the cap as an argument, so the number it states cannot
// drift from the caller's `PALETTE_CAP`.
Deno.test('paletteHelp states whatever cap it is passed, in both languages', () => {
  assertStringIncludes(dictionary('en').t('paletteHelp', 8), '8')
  assertStringIncludes(dictionary('pl').t('paletteHelp', 8), '8')
  assertStringIncludes(dictionary('en').t('paletteHelp', 12), '12')
  assertStringIncludes(dictionary('pl').t('paletteHelp', 12), '12')
})

// The command palette's own words, missing from both languages (see the report
// words' test). `palette*` keys belong to the editable colour palette.
Deno.test('both ui dictionaries carry the command palette words', () => {
  const dictionaries: Dictionary[] = [EN, PL]
  const words: UiKey[] = [
    'cmdOpen',
    'cmdTitle',
    'cmdPlaceholder',
    'cmdSecRun',
    'cmdSecGo',
    'cmdHintMove',
    'cmdHintChoose',
    'cmdHintClose',
    'cmdHintGenerate',
    'cmdHintSeed',
    'cmdNoRun',
    'cmdRunning',
    'cmdBroken',
    'cmdViewSimple',
    'cmdViewAdvanced',
    'cmdLangToPl',
    'cmdLangToEn',
  ]
  for (const d of dictionaries) {
    for (const k of words) {
      assertEquals(typeof d.ui[k], 'string', k)
      assert(String(d.ui[k]).length > 0, k)
    }
    // The empty note repeats what was typed, so a reader knows which query found nothing.
    assertStringIncludes(d.ui.cmdEmpty('zzz'), 'zzz')
  }
  // The trigger's accessible name names the shortcut, because the button shows
  // a glyph and nothing else.
  for (const lang of ['en', 'pl'] as const) assertStringIncludes(dictionary(lang).t('cmdOpen'), '⌘K')
})

// The preview's four section titles.
Deno.test('both ui dictionaries carry the preview section titles', () => {
  for (const d of [EN, PL]) {
    for (const k of ['previewGeometry', 'previewDrawing', 'previewPoints', 'previewColours'] as const) {
      assertEquals(typeof d.ui[k], 'string', k)
      assert(d.ui[k].length > 0, k)
    }
  }
})

Deno.test('the preset picker and the two drawers speak both languages', () => {
  const en = dictionary('en')
  const pl = dictionary('pl')
  const want: Record<string, [string, string]> = {
    preset: ['preset', 'preset'],
    customSettings: ['custom settings', 'własne ustawienia'],
    editedSinceLastPreset: ['edited since the last preset', 'zmienione od ostatniego presetu'],
    reportHandle: ['report', 'raport'],
    cmdHintReport: ['report', 'raport'],
    settingsHandle: ['settings', 'ustawienia'],
    cmdHintSettings: ['settings', 'ustawienia'],
  }
  for (const [key, [e, p]] of Object.entries(want)) {
    assertEquals(en.t(key as UiKey), e, key)
    assertEquals(pl.t(key as UiKey), p, key)
  }
})

// The label track is 12ch wide in every group, so a short
// label over 12 characters would be cut in the lab.
Deno.test('every knob has a short label of at most 12 characters, in both languages', () => {
  for (const d of [EN, PL]) {
    for (const s of PARAM_SPEC) {
      const short = d.short[s.key]
      assert(short, `short ${s.key}`)
      assert([...short].length <= 12, `short ${s.key}: "${short}" is ${[...short].length} characters`)
    }
    for (const unit of Object.values(d.units)) assert([...unit].length <= 6, `unit "${unit}"`)
  }
})

// The preview's rows share the knobs' 12-character label track.
Deno.test('every preview short label has at most 12 characters, in both languages', () => {
  for (const d of [EN, PL]) {
    const keys = Object.keys(d.ui).filter((k) => k.startsWith('viewShort')) as UiKey[]
    assert(keys.length >= 16, `${keys.length} preview short labels`)
    for (const key of keys) {
      const text = d.ui[key]
      assert(typeof text === 'string', key)
      assert([...text].length <= 12, `${key}: "${text}" is ${[...text].length} characters`)
    }
  }
})

Deno.test('the saved boards count a board in both languages, Polish in its three forms', () => {
  assertEquals([1, 2, 5].map((n) => EN.ui.boardsCount(n)), ['1 board', '2 boards', '5 boards'])
  assertEquals(
    [1, 2, 4, 5, 12, 14, 21, 22, 112, 122].map((n) => PL.ui.boardsCount(n)),
    [
      '1 plansza',
      '2 plansze',
      '4 plansze',
      '5 plansz',
      '12 plansz',
      '14 plansz',
      '21 plansz',
      '22 plansze',
      '112 plansz',
      '122 plansze',
    ],
  )
})

Deno.test('the board mode counts cells and mistakes in both languages, Polish in its three forms', () => {
  assertEquals([0, 1, 2, 5].map((n) => EN.ui.playStatus('3', n)), [
    '3 left · 0 mistakes',
    '3 left · 1 mistake',
    '3 left · 2 mistakes',
    '3 left · 5 mistakes',
  ])
  assertEquals([0, 1, 2, 4, 5, 12, 22].map((n) => PL.ui.playCleared(n)), [
    'Plansza wyczyszczona · 0 błędów',
    'Plansza wyczyszczona · 1 błąd',
    'Plansza wyczyszczona · 2 błędy',
    'Plansza wyczyszczona · 4 błędy',
    'Plansza wyczyszczona · 5 błędów',
    'Plansza wyczyszczona · 12 błędów',
    'Plansza wyczyszczona · 22 błędy',
  ])
  assertEquals([1, 2, 5].map((n) => PL.ui.pieceFacts(3, n, '→ w prawo')), [
    'Element #3 · 1 komórka · → w prawo',
    'Element #3 · 2 komórki · → w prawo',
    'Element #3 · 5 komórek · → w prawo',
  ])
  assertEquals([PL.ui.pieceBlocked(4, 1), PL.ui.pieceBlocked(4, 3)], [
    'zablokowany przez #4 w odległości 1 komórki',
    'zablokowany przez #4 w odległości 3 komórek',
  ])
  assertEquals([EN.ui.pieceBlocked(4, 1), EN.ui.pieceBlocked(4, 0)], [
    'blocked by #4 at 1 cell',
    'blocked by #4 at 0 cells',
  ])
})
