/// <reference lib="dom" />
/// <reference lib="dom.iterable" />
// The generator lab page. Built by `deno task bundle` into dist/lab-page.js;
// lab.html loads that file. Everything the page knows about parameters comes
// from PARAM_SPEC, so the panel cannot drift from the engine.
import type {
  BoardMeta,
  BoardSize,
  InactiveKey,
  LongestSummary,
  ParamGroup,
  ParamKey,
  Params,
  ParamSpec,
  Preset,
  RuleKey,
  SimpleChoice,
  View,
  Violation,
  WorkerIn,
  WorkerOut,
} from '@arrowz/engine'
import {
  DEFAULT_ROUNDED,
  defaultParams,
  INACTIVE_REASONS,
  PARAM_SPEC,
  RULE_REASONS,
  validateParams,
} from '@arrowz/engine'
import { buildCommand } from '@arrowz/engine/command'
import { type Dictionary, EN, PL, type UiArgs, type UiKey } from '@arrowz/engine/i18n'
import { findPreset, PRESETS } from '@arrowz/engine/presets'
import {
  defaultChoice,
  exportCell,
  normalizeChoice,
  SIMPLE_CHOICES,
  SIMPLE_SLIDERS,
  simpleParams,
} from '@arrowz/engine/simple'

/** An element by id; the ids are fixed in lab.html, so a miss is a bug, not a state. */
function el<T extends HTMLElement = HTMLElement>(id: string): T {
  const e = document.getElementById(id)
  if (!e) throw new Error(`missing element #${id}`)
  return e as T
}
const state: Params = { ...defaultParams() }

/** Something parsed from JSON that is an object: its fields are still unknown. */
function isRecord(v: unknown): v is Record<string, unknown> {
  return typeof v === 'object' && v !== null
}
/** A string field of a dictionary section looked up by a key typed by hand (markup, preset ids). */
function stringAt(rec: Record<string, unknown>, key: string): string | undefined {
  const v = rec[key]
  return typeof v === 'string' ? v : undefined
}
/** JSON from storage or the URL, or null when there is none or it is stale. */
function readJson(text: string | null): unknown {
  if (text === null) return null
  try {
    return JSON.parse(text)
  } catch {
    return null
  }
}
/** The knob values of an object loaded from outside: finite numbers under known keys only. */
function readParams(raw: unknown): Partial<Record<ParamKey, number>> {
  const out: Partial<Record<ParamKey, number>> = {}
  if (!isRecord(raw)) return out
  for (const spec of PARAM_SPEC) {
    const v = raw[spec.key]
    if (typeof v === 'number' && Number.isFinite(v)) out[spec.key] = v
  }
  return out
}

// --- language ---------------------------------------------------------------
// English is the source language (PARAM_SPEC, INACTIVE_REASONS, EN.ui);
// Polish is a translation looked up by key, falling back to English.
type Lang = 'en' | 'pl'
const DICT: Record<Lang, Dictionary> = { en: EN, pl: PL }
let lang: Lang = localStorage.getItem('labLang') === 'pl' ||
    (localStorage.getItem('labLang') === null && navigator.language.toLowerCase().startsWith('pl'))
  ? 'pl'
  : 'en'
// The call site is typed by UiArgs<K>; the cast only dispatches the call over
// the union of function-valued entries, which TypeScript cannot resolve generically.
function t<K extends UiKey>(key: K, ...args: UiArgs<K>): string {
  const v = DICT[lang].ui[key] ?? EN.ui[key]
  return typeof v === 'function' ? (v as (...a: unknown[]) => string)(...args) : v
}
function isUiKey(key: string): key is UiKey {
  return Object.hasOwn(EN.ui, key)
}
function isInactiveKey(key: InactiveKey | RuleKey): key is InactiveKey {
  return Object.hasOwn(INACTIVE_REASONS, key)
}
function paramText(spec: ParamSpec): { label: string; help: string } {
  const pl = lang === 'pl' ? PL.params[spec.key] : null
  return { label: pl?.label ?? spec.label, help: pl?.help ?? spec.help }
}
// Reason keys come from two engine tables: INACTIVE_REASONS (a knob with no
// effect) and RULE_REASONS (a cross-knob rule broken). PL.reasons covers both.
function reasonText(key: InactiveKey | RuleKey): string {
  if (lang === 'pl') return PL.reasons[key]
  return isInactiveKey(key) ? INACTIVE_REASONS[key] : RULE_REASONS[key]
}
const fmt = (n: number) => n.toLocaleString(lang === 'pl' ? 'pl' : 'en')

// --- parameter panel built from PARAM_SPEC so it cannot drift from the engine
const specByKey = new Map<ParamKey, ParamSpec>(PARAM_SPEC.map((s) => [s.key, s]))
/** A knob's spec; every key reaching here is a PARAM_SPEC key, so a miss is a programming error. */
function specOf(key: ParamKey): ParamSpec {
  const s = specByKey.get(key)
  if (!s) throw new Error(`unknown parameter ${key}`)
  return s
}
const groups = new Map<ParamGroup, ParamSpec[]>()
for (const spec of PARAM_SPEC) {
  const list = groups.get(spec.group)
  if (list) list.push(spec)
  else groups.set(spec.group, [spec])
}

// Groups open by default — the rest collapsed, so the skeleton knobs are
// reachable without scrolling through thirty fields.
const OPEN_BY_DEFAULT: ReadonlySet<ParamGroup> = new Set<ParamGroup>(['board', 'skeleton'])

type ParamRow = {
  row: HTMLDivElement
  spec: ParamSpec
  label: HTMLLabelElement
  num: HTMLInputElement
  range: HTMLInputElement
  help: HTMLParagraphElement | null
}
const paramRows = new Map<ParamKey, ParamRow>()
type GroupBox = { box: HTMLDetailsElement; sum: HTMLElement; help: HTMLParagraphElement | null }
const groupBoxes = new Map<ParamGroup, GroupBox>()
const panel = el('params')
for (const [group, specs] of groups) {
  const box = document.createElement('details')
  box.className = 'group'
  box.open = OPEN_BY_DEFAULT.has(group)
  const sum = document.createElement('summary')
  sum.textContent = group
  box.append(sum)
  panel.append(box)
  let gh: HTMLParagraphElement | null = null
  if (stringAt(EN.groupHelp, group) !== undefined) {
    gh = document.createElement('p')
    gh.className = 'grouphelp'
    box.append(gh)
  }
  groupBoxes.set(group, { box, sum, help: gh })
  for (const spec of specs) {
    const row = document.createElement('div')
    row.className = 'row'
    const label = document.createElement('label')
    label.textContent = spec.label
    label.htmlFor = 'p_' + spec.key
    const num = document.createElement('input')
    num.type = 'number'
    num.id = 'p_' + spec.key
    const range = document.createElement('input')
    range.type = 'range'
    for (const input of [num, range]) {
      input.min = String(spec.min)
      input.max = String(spec.max)
      input.step = String(spec.step)
      input.value = String(state[spec.key])
    }
    const sync = (v: string) => {
      state[spec.key] = Number(v)
      num.value = v
      range.value = v
      refreshActive()
      updateCommand()
      if (el<HTMLInputElement>('auto').checked) schedule()
    }
    num.addEventListener('input', () => sync(num.value))
    range.addEventListener('input', () => sync(range.value))
    row.append(label, num, range)
    let help: HTMLParagraphElement | null = null
    if (spec.help) {
      help = document.createElement('p')
      help.className = 'help'
      help.textContent = spec.help
      row.append(help)
    }
    box.append(row)
    paramRows.set(spec.key, { row, spec, label, num, range, help })
  }
}

// Knobs with no effect at the current settings are dimmed with a reason —
// otherwise changing the serpentine step with the skeleton off looks like
// "generating does not change the board".
//
// The same pass runs the engine's validateParams: a knob outside the safe
// envelope (or part of a broken cross-knob rule) is marked in red, the
// violations are listed under the presets and Generate is blocked, so a
// configuration the engine would refuse cannot be started from the lab.
let violations: Violation[] = []
function violationText(v: Violation): string {
  if (v.kind === 'range') {
    const spec = specByKey.get(v.key)
    return t('rangeViolation', spec ? paramText(spec).label : v.key, v.value, v.min, v.max)
  }
  return reasonText(v.key)
}
function refreshActive() {
  violations = validateParams(state)
  const broken = new Map<ParamKey, string[]>() // knob key -> texts of the violations naming it
  for (const v of violations) {
    for (const k of v.kind === 'range' ? [v.key] : v.keys) {
      const list = broken.get(k)
      if (list) list.push(violationText(v))
      else broken.set(k, [violationText(v)])
    }
  }
  for (const { row, spec, label, help } of paramRows.values()) {
    const bad = broken.get(spec.key)
    const key = !bad && spec.inactive ? spec.inactive(state) : null
    const why = bad ? bad.join('; ') : key ? `${t('inactivePrefix')}${reasonText(key)}` : null
    row.classList.toggle('violation', !!bad)
    row.classList.toggle('inactive', !!key)
    if (help) help.dataset.why = why ? `${why}. ` : ''
    const tx = paramText(spec)
    label.title = why ? `${why}. ${tx.help}` : tx.help // tooltip works with hidden help too
  }
  const box = el('violations')
  box.hidden = violations.length === 0
  const list = box.querySelector('ul')
  if (!list) throw new Error('missing list in #violations')
  list.textContent = ''
  for (const v of violations) {
    const li = document.createElement('li')
    li.textContent = violationText(v)
    list.append(li)
  }
  refreshRunButton()
  syncPresetSelect()
}

// Generate stays disabled while a run is busy or the settings are invalid;
// the title says why. finish() and every knob change go through here.
function refreshRunButton() {
  const blocked = violations.length > 0
  const run = el<HTMLButtonElement>('run')
  run.disabled = busy || blocked
  run.title = blocked ? t('generateBlocked') : ''
}

function applyLanguage() {
  document.documentElement.lang = lang
  localStorage.setItem('labLang', lang)
  el('langPl').classList.toggle('on', lang === 'pl')
  el('langEn').classList.toggle('on', lang === 'en')
  for (const e of document.querySelectorAll<HTMLElement>('[data-i18n]')) {
    const key = e.dataset.i18n
    // The markup names ui keys by hand; an unknown one is a typo in lab.html.
    if (key === undefined || !isUiKey(key)) throw new Error(`unknown ui key ${key}`)
    e.textContent = t(key)
  }
  el('solo').title = t('fullView')
  presetLabels()
  simpleLabels()
  disarmDelete()
  for (const [group, { sum, help }] of groupBoxes) {
    sum.textContent = DICT[lang].groups[group]
    if (help) help.textContent = stringAt(DICT[lang].groupHelp, group) ?? stringAt(EN.groupHelp, group) ?? ''
  }
  for (const { label, spec, help } of paramRows.values()) {
    const tx = paramText(spec)
    label.textContent = tx.label
    if (help) help.textContent = tx.help
  }
  refreshActive()
  if (lastDone) report(lastDone, { keepPrev: true })
  if (lastLongest) renderLongest(lastLongest)
  if (activeTab === 'library') {
    renderLibrary()
    if (libBoard) showBoardStatus(libBoard)
  } else if (!lastDone && !busy) setStatus(t('pressGenerate'))
  saveToUrl()
}
el('langPl').addEventListener('click', () => {
  lang = 'pl'
  applyLanguage()
})
el('langEn').addEventListener('click', () => {
  lang = 'en'
  applyLanguage()
})

// Presets: a tree of difficulty levels (optgroup) with a few options each.
// An option is a full configuration — defaults plus its overrides — so it
// never inherits knobs from the previous experiment. Labels are rebuilt on a
// language change; the selection follows the knobs (see refreshActive).
const presetOptions = new Map<string, { opt: HTMLOptionElement; preset: Preset }>()
const presetGroups: { group: HTMLOptGroupElement; level: string }[] = []
for (const level of PRESETS) {
  const group = document.createElement('optgroup')
  group.dataset.level = level.id
  for (const o of level.options) {
    const opt = document.createElement('option')
    opt.value = o.id
    group.append(opt)
    presetOptions.set(o.id, { opt, preset: o })
  }
  presetGroups.push({ group, level: level.id })
  el<HTMLSelectElement>('presets').append(group)
}
const presetPlaceholder = new Option('', '', true, true)
el<HTMLSelectElement>('presets').prepend(presetPlaceholder)
function presetLabels() {
  const d = DICT[lang].presets, en = EN.presets
  presetPlaceholder.textContent = d.placeholder
  for (const { group, level } of presetGroups) {
    group.label = stringAt(d.levels, level) ?? stringAt(en.levels, level) ?? level
  }
  for (const { opt, preset } of presetOptions.values()) {
    opt.textContent = `${preset.params.W}×${preset.params.H} · ${d.modes[preset.mode]}`
  }
}
function syncPresetSelect() {
  el<HTMLSelectElement>('presets').value = findPreset(state)?.id ?? ''
}
el<HTMLSelectElement>('presets').addEventListener('change', () => {
  const entry = presetOptions.get(el<HTMLSelectElement>('presets').value)
  if (!entry) return
  const { W, H } = entry.preset.params
  // Every preset names a size; a preset without one is a bug in lab-presets.ts.
  if (W === undefined || H === undefined) throw new Error(`preset ${entry.preset.id} has no size`)
  let clamped = false
  for (const spec of PARAM_SPEC) clamped = setParam(spec.key, entry.preset.params[spec.key] ?? spec.def) || clamped
  showClamped(clamped)
  // The cell size concerns only the export; the preview scales itself.
  el<HTMLInputElement>('cell').value = String(exportCell(W, H))
  updateCommand()
  run()
})

// --- simple view ---------------------------------------------------------------
// Plain choices (lab-simple.ts) instead of the knob panel. The choices and
// the view mode live in localStorage; the parameters they produce go through
// setParam like a preset, so the command, the advanced view and the URL show
// exactly what was generated — the values drawn in random mode included.
const SIMPLE_KEY = 'labSimple'
/** The stored recipe: a choice without its seed (the seed lives in the knobs) and with the randomise flag settled. */
type Recipe = Omit<SimpleChoice, 'seed' | 'random'> & { random: boolean }
// The stored recipe goes through normalizeChoice as is (old size ids and
// category names, junk, clamping); defaults fill only what is missing.
function recipeOf(raw: unknown): Recipe {
  const { seed: _seed, random, ...rest } = normalizeChoice(raw)
  return { ...rest, random: random === true }
}
let simpleChoice: Recipe = recipeOf(readJson(localStorage.getItem(SIMPLE_KEY)))

// The size is edited like in the advanced view: a number and a slider per
// side, with the engine bounds. Labels come from PARAM_SPEC.
type Side = 'W' | 'H'
const SIDES: readonly Side[] = ['W', 'H']
const sizeInputs = new Map<Side, { num: HTMLInputElement; range: HTMLInputElement }>()
const sizeLabels: { label: HTMLLabelElement; key: Side }[] = []
for (const key of SIDES) {
  const spec = specOf(key)
  const row = document.createElement('div')
  row.className = 'row'
  const label = document.createElement('label')
  label.htmlFor = 's_' + key
  const num = document.createElement('input')
  num.type = 'number'
  num.id = 's_' + key
  const range = document.createElement('input')
  range.type = 'range'
  for (const input of [num, range]) {
    input.min = String(spec.min)
    input.max = String(spec.max)
    input.step = String(spec.step)
  }
  const set = (v: string) => {
    simpleChoice = recipeOf({ ...simpleChoice, [key]: Number(v) })
    applySimple()
    schedule()
  }
  num.addEventListener('input', () => set(num.value))
  range.addEventListener('input', () => set(range.value))
  row.append(label, num, range)
  el('simpleSize').append(row)
  sizeInputs.set(key, { num, range })
  sizeLabels.push({ label, key })
}
// Sliders: a position from 0 to 1 is a wish (very short … very long,
// straightest … most winding); the module interpolates the knob ranges.
// Dragging generates after a pause, like a knob with auto-generate on.
type SliderKey = keyof typeof SIMPLE_SLIDERS
function isSliderKey(key: string): key is SliderKey {
  return Object.hasOwn(SIMPLE_SLIDERS, key)
}
const sliders = new Map<SliderKey, HTMLInputElement>()
const sliderLabels = new Map<SliderKey, HTMLSpanElement>()
const sliderEnds: { e: HTMLSpanElement; key: SliderKey; i: 0 | 1 }[] = []
const SLIDER_ENDS: readonly (0 | 1)[] = [0, 1]
for (const key of Object.keys(SIMPLE_SLIDERS).filter(isSliderKey)) {
  const label = document.createElement('span')
  label.className = 'slabel'
  const input = document.createElement('input')
  input.type = 'range'
  input.className = 'sslider'
  input.min = '0'
  input.max = '100'
  input.step = '1'
  input.addEventListener('input', () => {
    simpleChoice[key] = Number(input.value) / 100
    applySimple()
    schedule()
  })
  const ends = document.createElement('div')
  ends.className = 'sends'
  for (const i of SLIDER_ENDS) {
    const e = document.createElement('span')
    ends.append(e)
    sliderEnds.push({ e, key, i })
  }
  el('simpleGroups').append(label, input, ends)
  sliders.set(key, input)
  sliderLabels.set(key, label)
}
type ChoiceGroup = keyof typeof SIMPLE_CHOICES
function isChoiceGroup(key: string): key is ChoiceGroup {
  return Object.hasOwn(SIMPLE_CHOICES, key)
}
type SegButton = { group: ChoiceGroup; value: SimpleChoice['skeleton']; button: HTMLButtonElement }
const segButtons: SegButton[] = []
const segLabels = new Map<ChoiceGroup, HTMLSpanElement>()
for (const group of Object.keys(SIMPLE_CHOICES).filter(isChoiceGroup)) {
  const label = document.createElement('span')
  label.className = 'slabel'
  const seg = document.createElement('div')
  seg.className = 'seg'
  for (const value of SIMPLE_CHOICES[group]) {
    const b = document.createElement('button')
    b.type = 'button'
    b.addEventListener('click', () => {
      simpleChoice[group] = value
      applySimple()
      run()
    })
    seg.append(b)
    segButtons.push({ group, value, button: b })
  }
  el('simpleGroups').append(label, seg)
  segLabels.set(group, label)
}
function simpleLabels() {
  const d = DICT[lang].simple, en = EN.simple
  for (const [key, label] of sliderLabels) label.textContent = d[key]
  for (const { e, key, i } of sliderEnds) e.textContent = d.ends[key][i]
  for (const [group, label] of segLabels) label.textContent = d[group]
  for (const { group, value, button } of segButtons) button.textContent = d.options[group][value]
  // The markup names the plain keys of the simple section by hand (randomize, randomizeHelp).
  for (const e of document.querySelectorAll<HTMLElement>('[data-simple]')) {
    const key = e.dataset.simple
    if (key === undefined) throw new Error('empty data-simple')
    const text = stringAt(d, key) ?? stringAt(en, key)
    if (text === undefined) throw new Error(`unknown simple key ${key}`)
    e.textContent = text
  }
  for (const { label, key } of sizeLabels) label.textContent = paramText(specOf(key)).label
  el('viewSimple').textContent = d.viewSimple
  el('viewAdvanced').textContent = d.viewAdvanced
  el('sSeedLabel').textContent = paramText(specOf('seed')).label
}
function syncSimpleForm() {
  for (const [key, { num, range }] of sizeInputs) {
    num.value = String(simpleChoice[key])
    range.value = String(simpleChoice[key])
  }
  for (const [key, input] of sliders) input.value = String(Math.round(simpleChoice[key] * 100))
  for (const { group, value, button } of segButtons) button.classList.toggle('on', simpleChoice[group] === value)
  el<HTMLInputElement>('sSeed').value = String(state.seed)
  el<HTMLInputElement>('sRandom').checked = simpleChoice.random
}
// Writes the choice into the knobs. With `random` every ranged knob is drawn
// afresh, so the same seed gives a different board.
function applySimple(random = false) {
  localStorage.setItem(SIMPLE_KEY, JSON.stringify(simpleChoice))
  const params = simpleParams({ ...simpleChoice, seed: state.seed }, random ? Math.random : null)
  let clamped = false
  for (const spec of PARAM_SPEC) clamped = setParam(spec.key, params[spec.key]) || clamped
  showClamped(clamped)
  el<HTMLInputElement>('cell').value = String(exportCell(params.W, params.H))
  syncSimpleForm()
  updateCommand()
}
function simpleActive() {
  return document.body.classList.contains('simple')
}
function randomOnGenerate() {
  return simpleActive() && el<HTMLInputElement>('sRandom').checked
}
// Switching the view never touches the knobs: a peek at the advanced view
// and back keeps a randomly drawn set. The form is a recipe, applied when
// something in it is clicked (and once at start, see the bottom).
function showView(mode: 'simple' | 'advanced') {
  const simple = mode === 'simple'
  document.body.classList.toggle('simple', simple)
  el('viewSimple').classList.toggle('on', simple)
  el('viewAdvanced').classList.toggle('on', !simple)
  localStorage.setItem('labView', simple ? 'simple' : 'advanced')
  syncSimpleForm()
}
el('viewSimple').addEventListener('click', () => showView('simple'))
el('viewAdvanced').addEventListener('click', () => showView('advanced'))
el('sSeed').addEventListener('input', () => setParam('seed', Number(el<HTMLInputElement>('sSeed').value)))
el('sRandom').addEventListener('change', () => {
  simpleChoice.random = el<HTMLInputElement>('sRandom').checked
  localStorage.setItem(SIMPLE_KEY, JSON.stringify(simpleChoice))
})

// Pulls a value loaded from outside (URL, preset, stored board) into the
// knob's range; anything that is not a finite number (an emptied field)
// falls back to the default. Pure, so it can be tested without the page.
function clampParam(spec: ParamSpec, value: number): { value: number; clamped: boolean } {
  if (!Number.isFinite(value)) return { value: spec.def, clamped: true }
  const v = Math.min(spec.max, Math.max(spec.min, value))
  return { value: v, clamped: v !== value }
}

// Every path that sets a knob from outside goes through here. Returns whether
// the value had to be clamped, so a load can show the notice once.
function setParam(key: ParamKey, value: number): boolean {
  const c = clampParam(specOf(key), value)
  state[key] = c.value
  const row = paramRows.get(key)
  // The panel has a row for every PARAM_SPEC key.
  if (!row) throw new Error(`no panel row for ${key}`)
  row.num.value = String(c.value)
  row.range.value = String(c.value)
  // The simple view shows the seed too — unless the user is typing it there.
  if (key === 'seed' && document.activeElement !== el('sSeed')) {
    el<HTMLInputElement>('sSeed').value = String(c.value)
  }
  refreshActive()
  updateCommand()
  return c.clamped
}

// The clamped notice: shown after a load that moved a value, dismissable,
// replaced by the outcome of the next load.
function showClamped(on: boolean) {
  el('clampNote').hidden = !on
}
el('clampDismiss').addEventListener('click', () => showClamped(false))

// --- preview zoom -----------------------------------------------------------
function applyZoom() {
  const fit = el<HTMLInputElement>('fit').checked
  document.body.classList.toggle('fitboard', fit)
  el('zoomRow').style.opacity = fit ? '.45' : '1'
  document.documentElement.style.setProperty('--zoom', el<HTMLInputElement>('zoom').value)
}
el('fit').addEventListener('change', () => {
  applyZoom()
  saveToUrl()
})
el('zoom').addEventListener('input', () => {
  el<HTMLInputElement>('zoomRange').value = el<HTMLInputElement>('zoom').value
  el<HTMLInputElement>('fit').checked = false
  applyZoom()
  saveToUrl()
})
el('zoomRange').addEventListener('input', () => {
  el<HTMLInputElement>('zoom').value = el<HTMLInputElement>('zoomRange').value
  el<HTMLInputElement>('fit').checked = false
  applyZoom()
  saveToUrl()
})
// double-click on the board toggles fit and zoom
el('boardWrap').addEventListener('dblclick', () => {
  el<HTMLInputElement>('fit').checked = !el<HTMLInputElement>('fit').checked
  applyZoom()
  saveToUrl()
})

function viewOptions(): View {
  return {
    cell: Number(el<HTMLInputElement>('cell').value),
    stroke: Number(el<HTMLInputElement>('stroke').value),
    headWidth: Number(el<HTMLInputElement>('headWidth').value),
    headHeight: Number(el<HTMLInputElement>('headHeight').value),
    colored: el<HTMLInputElement>('colored').checked,
    top: el<HTMLInputElement>('hilite').checked ? Number(el<HTMLInputElement>('top').value) : 0,
    rounded: DEFAULT_ROUNDED, // the checkbox that drives this arrives in the next task
  }
}
// "Show jammed cells" is not part of the view (the CLI has no such flag); it
// travels next to the view in the worker message.
function voidsOn(): boolean {
  return el<HTMLInputElement>('voids').checked
}
/** Everything the worker draws with, as one string: the key that tells a stale render from a current one. */
function viewKey(): string {
  return JSON.stringify({ ...viewOptions(), voids: voidsOn() })
}

// --- live command -----------------------------------------------------------
// The command matches the CURRENT knobs, not the last board: the lab is a
// layer over the CLI and must show exactly what would be run.
function updateCommand() {
  el('command').textContent = buildCommand(state, viewOptions())
}
el('copyCommand').addEventListener('click', async () => {
  await navigator.clipboard.writeText(el('command').textContent ?? '')
  flashCopied(el<HTMLButtonElement>('copyCommand'))
})
// Brief confirmation on a copy button; the label comes back through the dictionary.
function flashCopied(btn: HTMLButtonElement) {
  btn.textContent = t('copied')
  setTimeout(() => {
    btn.textContent = t('copy')
  }, 1200)
}

// --- worker: generation off the UI thread -----------------------------------
// A 1000×1000 board takes ~10 s (400×400 ~1.4 s). On the main thread it would
// freeze the tab, so the engine runs in a worker and the page receives
// progress and the finished SVG.
type Done = Extract<WorkerOut, { type: 'done' }>
let worker: Worker | null = null
let busy = false

function newWorker(): Worker {
  const w = new Worker(new URL('./lab-worker.js', import.meta.url), { type: 'module' })
  w.onmessage = (e: MessageEvent<WorkerOut>) => onWorkerMessage(w, e.data)
  w.onerror = (e) => {
    setStatus(`<span class="bad">${t('workerError')}</span> ${e.message}`)
    finish()
  }
  return w
}

function ensureWorker(): Worker {
  if (!worker) worker = newWorker()
  return worker
}

function onWorkerMessage(w: Worker, msg: WorkerOut) {
  switch (msg.type) {
    case 'progress': {
      const { pieces, remaining, backtracks, ms, total } = msg.info
      const done = 100 * (1 - remaining / total)
      const short = (n: number) => (n >= 10000 ? (n / 1000).toFixed(0) + 'k' : fmt(n))
      setStatus(t('progress', done.toFixed(1), short(pieces), short(remaining), backtracks, (ms / 1000).toFixed(1)))
      el('bar').style.width = done.toFixed(1) + '%'
      return
    }
    case 'error':
      setStatus(`<span class="bad">${t('generationError')}</span> ${msg.message}`)
      finish()
      return
    case 'done':
      lastDone = msg
      report(msg)
      finish()
      // The stored file has no highlight: the pink marks the longest pieces
      // for the preview only. A separate render goes to the store.
      w.postMessage({ type: 'render', view: storeView(), voids: voidsOn(), tag: 'store' } satisfies WorkerIn)
      // a view changed during the run applies now
      if (pendingRedraw || sentView !== viewKey()) {
        pendingRedraw = false
        redraw()
      }
      return
    case 'render':
      if (msg.tag === 'store') {
        if (lastDone) saveBoardToStore(msg.svg, lastDone)
        return
      }
      if (activeTab === 'lab') el('board').innerHTML = msg.svg
      lastLongest = msg.longest
      renderLongest(msg.longest)
  }
}

let lastDone: Done | null = null
let lastLongest: LongestSummary[] | null = null
let boardsCache: BoardSize[] | null = null // last list from /api/boards, null = fetch again
let runParams: Params = { ...state } // parameters the last board was generated from
let sentView = '' // the view last requested from the worker
// metrics of the previous run — the delta column shows what turning a knob
// changed, without noting numbers on the side
let prevStats = new Map<number, number>()
const prevStatsNext = new Map<number, number>()

function setStatus(html: string) {
  el('status').innerHTML = html
}

function start() {
  busy = true
  el<HTMLButtonElement>('run').disabled = true
  el('abort').hidden = false
  el('progress').classList.add('on')
  el('bar').style.width = '0%'
}

function finish() {
  busy = false
  refreshRunButton()
  el('abort').hidden = true
  el('progress').classList.remove('on')
}

/** Terminates the running worker: the only way to interrupt the generator loop. A run always has one. */
function killWorker() {
  if (!worker) throw new Error('busy without a worker')
  worker.terminate()
  worker = null
}

el('abort').addEventListener('click', () => {
  if (!busy) return
  killWorker()
  setStatus(`<span class="bad">${t('aborted')}</span>`)
  finish()
})

function run() {
  // Every way of starting a run (button, auto-generate, preset, URL, reseed)
  // ends here, so this is the one place the envelope is enforced.
  if (violations.length) {
    setStatus(`<span class="bad">${t('generateBlocked')}</span>`)
    return
  }
  // A new request interrupts the previous one. Without this, changing a
  // parameter during a big board looked like a hang: the request was lost
  // and the bar kept showing the old run.
  if (busy) killWorker()
  const cells = state.W * state.H
  start()
  setStatus(cells > 200000 ? t('generatingBig', state.W, state.H, fmt(cells)) : t('generating'))
  // The report describes the board that WAS PRODUCED, not the current form
  // fields — the user may have changed them after generating.
  runParams = { ...state }
  sentView = viewKey()
  ensureWorker().postMessage(
    { type: 'generate', params: runParams, view: viewOptions(), voids: voidsOn() } satisfies WorkerIn,
  )
  saveToUrl()
}

// Preview toggles redraw the board without regenerating. During a run the
// change is deferred and applied right after — before, it was silently lost
// and "how many longest" looked broken.
let pendingRedraw = false
function redraw() {
  saveToUrl()
  if (busy) {
    pendingRedraw = true
    return
  }
  if (!lastDone) return
  if (!worker) {
    run() // after an abort the worker has no board
    return
  }
  sentView = viewKey()
  worker.postMessage({ type: 'render', view: viewOptions(), voids: voidsOn() } satisfies WorkerIn)
}

let timer: ReturnType<typeof setTimeout> | undefined
function schedule() {
  clearTimeout(timer)
  timer = setTimeout(run, 350)
}

// In the simple view with randomising on, Generate and New seed draw the
// knobs afresh first; every other way of starting a run keeps the knobs.
el('run').addEventListener('click', () => {
  if (randomOnGenerate()) applySimple(true)
  run()
})
el('reseed').addEventListener('click', () => {
  setParam('seed', Math.floor(Math.random() * 999999))
  if (randomOnGenerate()) applySimple(true)
  run()
})
el('reset').addEventListener('click', () => {
  Object.assign(state, defaultParams())
  for (const spec of PARAM_SPEC) setParam(spec.key, state[spec.key])
  if (simpleActive()) {
    simpleChoice = recipeOf({ ...defaultChoice(), random: simpleChoice.random })
    applySimple()
  }
  run()
})
for (const id of ['cell', 'stroke', 'headWidth', 'headHeight', 'colored', 'hilite', 'top', 'voids']) {
  el(id).addEventListener('input', () => {
    updateCommand()
    redraw()
  })
}
// full view — panel and stats aside, the board gets the whole window
function toggleSolo() {
  document.body.classList.toggle('solo')
}
el('solo').addEventListener('click', toggleSolo)
document.addEventListener('keydown', (e) => {
  if (e.key === 'f' || e.key === 'F') {
    const tag = document.activeElement?.tagName
    if (tag === 'INPUT' || tag === 'TEXTAREA') return
    toggleSolo()
  }
})

el('help').addEventListener('change', () => {
  document.body.classList.toggle('nohelp', !el<HTMLInputElement>('help').checked)
  saveToUrl()
})
el('download').addEventListener('click', () => {
  const svg = el('board').innerHTML
  if (!svg) return
  const url = URL.createObjectURL(new Blob([svg], { type: 'image/svg+xml' }))
  const a = document.createElement('a')
  a.href = url
  a.download = `arrowz-${runParams.W}x${runParams.H}-seed${runParams.seed}.svg`
  a.click()
  URL.revokeObjectURL(url)
})

// --- board store ------------------------------------------------------------
// The board goes to disk through the lab server — once per generation, with
// the view as rendered. A missing store server (e.g. other static hosting)
// does not break the report; it only appends a warning to the status.
function storeView(): View {
  return { ...viewOptions(), top: 0 }
}
async function saveBoardToStore(svg: string, done: Done) {
  const view = storeView()
  const body = {
    svg,
    params: runParams,
    view,
    command: buildCommand(runParams, view),
    source: 'lab',
    metrics: {
      ok: done.ok,
      pieces: done.pieces,
      maxLen: done.metrics?.maxLen ?? null,
      genMs: done.genMs,
      restarts: done.restartsUsed,
      backtracks: done.backtracks,
      stuck: done.stuck,
    },
  }
  try {
    const r = await fetch('/api/boards', { method: 'POST', body: JSON.stringify(body) })
    if (!r.ok) throw new Error(`HTTP ${r.status}`)
    const meta: BoardMeta = await r.json()
    el('status').insertAdjacentHTML('beforeend', ` · ${t('saved')} <code>${meta.W}x${meta.H}/${meta.id}</code>`)
    boardsCache = null // the store tab list is stale
  } catch {
    el('status').insertAdjacentHTML('beforeend', ` · <span class="bad">${t('notSaved')}</span>`)
  }
}

// --- tabs and the saved-boards tab ------------------------------------------
// The store tab uses THE SAME board area as the lab: fit, zoom and full view
// work without a separate path. Back in the lab, the worker board returns
// through `render`.
type Tab = 'lab' | 'library'
let activeTab: Tab = 'lab'
let libSize: string | null = null // chosen size ('25x50')
let libBoard: BoardMeta | null = null // chosen board (meta)

const tabButtons = document.querySelectorAll<HTMLButtonElement>('#tabs button')
/** The tab a markup button switches to; the two buttons are fixed in lab.html. */
function tabOf(b: HTMLButtonElement): Tab {
  const tab = b.dataset.tab
  if (tab === 'lab' || tab === 'library') return tab
  throw new Error(`unknown tab ${tab}`)
}
function showTab(name: Tab) {
  activeTab = name
  document.body.classList.toggle('tab-library', name === 'library')
  for (const b of tabButtons) b.classList.toggle('on', tabOf(b) === name)
  el('library').hidden = name !== 'library'
  if (name === 'library') loadLibrary({ open: true })
  else if (lastDone && worker && !busy) {
    redraw()
    report(lastDone, { keepPrev: true })
  }
  saveToUrl()
}
for (const b of tabButtons) b.addEventListener('click', () => showTab(tabOf(b)))

// `open` shows a board of the chosen size right away (entering the tab);
// a plain refresh only redraws the list around the board already shown.
async function loadLibrary({ force = false, open = false }: { force?: boolean; open?: boolean } = {}) {
  let cache = boardsCache
  if (!cache || force) {
    try {
      const r = await fetch('/api/boards')
      if (!r.ok) throw new Error(`HTTP ${r.status}`)
      const list: BoardSize[] = await r.json()
      cache = list
    } catch {
      boardsCache = []
      el('libList').innerHTML = `<p class="grouphelp">${t('noStoreServer')}</p>`
      return
    }
    boardsCache = cache
  }
  if (!cache.some((s) => s.size === libSize)) libSize = cache[0]?.size ?? null
  if (open) selectSize(libSize)
  else renderLibrary()
}
el('libRefresh').addEventListener('click', () => loadLibrary({ force: true }))

// A chosen size always has a board on screen: the first of the size, unless
// the board already shown belongs to it.
function selectSize(size: string | null) {
  libSize = size
  const entry = boardsCache?.find((s) => s.size === size)
  if (!entry) {
    renderLibrary()
    return
  }
  if (!entry.boards.some((b) => b.id === libBoard?.id)) libBoard = entry.boards[0] ?? null
  if (libBoard) openBoard(libBoard)
}

function renderLibrary() {
  if (!boardsCache) return
  el('libSizes').innerHTML = ''
  for (const s of boardsCache) {
    const b = document.createElement('button')
    b.textContent = `${s.size} (${s.boards.length})`
    b.classList.toggle('primary', s.size === libSize)
    b.addEventListener('click', () => selectSize(s.size))
    el('libSizes').append(b)
  }
  const size = boardsCache.find((s) => s.size === libSize)
  if (!size) {
    el('libList').innerHTML = `<p class="grouphelp">${t('storeEmpty')}</p>`
    return
  }
  el('libList').innerHTML = ''
  for (const meta of size.boards) {
    const row = document.createElement('div')
    row.className = 'boardrow' + (libBoard?.id === meta.id ? ' on' : '')
    const when = meta.createdAt ? new Date(meta.createdAt).toLocaleString(lang === 'pl' ? 'pl' : 'en-GB') : ''
    row.innerHTML = `<span class="id">${meta.id}</span><span>${when}</span>` +
      `<span class="meta">${t('piecesShort', meta.pieces ?? '?')} · ${t('longestShort', meta.maxLen ?? '?')} · ${
        t('genShort', genSeconds(meta))
      } · ${meta.source}` +
      `${meta.ok === false ? ` · <b class="bad">${t('notClosed')}</b>` : ''}</span>`
    row.addEventListener('click', () => openBoard(meta))
    el('libList').append(row)
  }
}

// Generation time from the meta, as seconds; boards saved before the field
// existed show a dash.
function genSeconds(meta: BoardMeta): string {
  return meta.genMs === null ? '—' : (meta.genMs / 1000).toFixed(meta.genMs < 10000 ? 2 : 1)
}
function showBoardStatus(meta: BoardMeta) {
  setStatus(
    t('savedBoard', `<code>${meta.W}x${meta.H}/${meta.id}</code>`, meta.seed, meta.source, `${genSeconds(meta)} s`),
  )
}

// The board's command and view rows live in the panel, in the place of the
// lab's; the buttons stay next to the list. All appear with a chosen board.
function showLibDetail(on: boolean) {
  for (const id of ['libDetail', 'libCommandBox', 'libView']) el(id).hidden = !on
}

async function openBoard(meta: BoardMeta) {
  libBoard = meta
  disarmDelete()
  renderLibrary()
  showLibDetail(true)
  el('libCommand').textContent = meta.command
  el<HTMLInputElement>('libStroke').value = String(meta.view.stroke)
  el<HTMLInputElement>('libHeadWidth').value = String(meta.view.headWidth)
  el<HTMLInputElement>('libHeadHeight').value = String(meta.view.headHeight)
  el<HTMLInputElement>('libColored').checked = meta.view.colored
  if (libWorkerId !== meta.id) dropLibWorker()
  setStatus(t('loadingBoard', `<code>${meta.W}x${meta.H}/${meta.id}</code>`))
  const r = await fetch(`/boards/${meta.W}x${meta.H}/${meta.id}.svg`)
  if (activeTab !== 'library') return
  el('board').innerHTML = await r.text()
  showBoardStatus(meta)
}
el('libCopy').addEventListener('click', async () => {
  await navigator.clipboard.writeText(el('libCommand').textContent ?? '')
  flashCopied(el<HTMLButtonElement>('libCopy'))
})
// Loading sets the knobs and the view but does NOT generate — the user sees
// the command first and decides.
el('libLoad').addEventListener('click', () => {
  const board = libBoard
  if (!board) return
  // A board saved before a knob existed does not name it in its JSON; the store
  // fills the gap with the engine default when it reads the meta, so that knob
  // loads as its default rather than keeping the value now on the screen.
  const loaded = readParams(board.params)
  let clamped = false
  for (const spec of PARAM_SPEC) {
    const v = loaded[spec.key]
    if (v !== undefined) clamped = setParam(spec.key, v) || clamped
  }
  showClamped(clamped)
  const v = board.view
  if (v.cell) el<HTMLInputElement>('cell').value = String(v.cell)
  if (v.stroke) el<HTMLInputElement>('stroke').value = String(v.stroke)
  el<HTMLInputElement>('headWidth').value = String(v.headWidth)
  el<HTMLInputElement>('headHeight').value = String(v.headHeight)
  el<HTMLInputElement>('colored').checked = v.colored
  el<HTMLInputElement>('hilite').checked = v.top > 0
  if (v.top > 0) el<HTMLInputElement>('top').value = String(v.top)
  updateCommand()
  showTab('lab')
})

// --- editing the view of a stored board ------------------------------------
// The store holds only the SVG, so a stored board is regenerated in its own
// worker from its parameters (the engine is deterministic: the same board
// comes back) and redrawn with the new stroke or colours. Saving goes through
// the same POST as the lab, so the file stays byte for byte what the CLI
// command in the meta would produce. The lab worker keeps its own board.
let libWorker: Worker | null = null
let libWorkerId: string | null = null // id of the board the library worker holds
let libTimer: ReturnType<typeof setTimeout> | undefined
function dropLibWorker() {
  if (libWorker) libWorker.terminate()
  libWorker = null
  libWorkerId = null
}
function libView(meta: BoardMeta): View {
  return {
    cell: meta.view.cell,
    stroke: Number(el<HTMLInputElement>('libStroke').value),
    headWidth: Number(el<HTMLInputElement>('libHeadWidth').value),
    headHeight: Number(el<HTMLInputElement>('libHeadHeight').value),
    colored: el<HTMLInputElement>('libColored').checked,
    top: 0, // stored boards carry no highlight
    rounded: DEFAULT_ROUNDED, // the checkbox that drives this arrives in the next task
  }
}
function scheduleLibRender() {
  clearTimeout(libTimer)
  libTimer = setTimeout(libRender, 350)
}
function libRender() {
  const meta = libBoard
  if (!meta) return
  // A board made before the safe envelope may carry settings the engine now
  // refuses; say so instead of letting the worker fail on generate().
  // Merged with the defaults, exactly as generate() validates.
  if (validateParams({ ...defaultParams(), ...meta.params }).length) {
    setStatus(`<span class="bad">${t('storedInvalid')}</span>`)
    return
  }
  const view = libView(meta)
  // Stored boards show no jammed cells (voids: false), as the CLI draws them.
  if (libWorker && libWorkerId === meta.id) {
    libWorker.postMessage({ type: 'render', view, voids: false } satisfies WorkerIn)
    return
  }
  dropLibWorker()
  libWorkerId = meta.id
  const w = new Worker(new URL('./lab-worker.js', import.meta.url), { type: 'module' })
  libWorker = w
  w.onerror = (e) => {
    setStatus(`<span class="bad">${t('workerError')}</span> ${e.message}`)
    dropLibWorker()
  }
  w.onmessage = (e: MessageEvent<WorkerOut>) => onLibWorkerMessage(meta, e.data)
  setStatus(t('rebuilding', `<code>${meta.W}x${meta.H}/${meta.id}</code>`))
  w.postMessage({ type: 'generate', params: meta.params, view, voids: false } satisfies WorkerIn)
}
async function onLibWorkerMessage(meta: BoardMeta, msg: WorkerOut) {
  if (activeTab !== 'library' || libBoard?.id !== meta.id) return
  if (msg.type === 'progress') {
    const { pieces, remaining, backtracks, ms, total } = msg.info
    const done = 100 * (1 - remaining / total)
    setStatus(t('progress', done.toFixed(1), fmt(pieces), fmt(remaining), backtracks, (ms / 1000).toFixed(1)))
    return
  }
  if (msg.type === 'error') {
    setStatus(`<span class="bad">${t('generationError')}</span> ${msg.message}`)
    dropLibWorker()
    return
  }
  if (msg.type !== 'render') return
  el('board').innerHTML = msg.svg
  const view = libView(meta)
  const body = {
    svg: msg.svg,
    params: meta.params,
    view,
    command: buildCommand(meta.params, view),
    source: meta.source,
    metrics: { ok: meta.ok, pieces: meta.pieces, maxLen: meta.maxLen, genMs: meta.genMs },
  }
  try {
    const r = await fetch('/api/boards', { method: 'POST', body: JSON.stringify(body) })
    if (!r.ok) throw new Error(`HTTP ${r.status}`)
    const saved: BoardMeta = await r.json()
    libBoard = saved
    el('libCommand').textContent = saved.command
    setStatus(t('viewSaved', `<code>${saved.W}x${saved.H}/${saved.id}</code>`))
    // The store keeps createdAt on an overwrite, so the row stays in place;
    // the list is refreshed for the new meta only.
    await loadLibrary({ force: true })
  } catch {
    setStatus(`<span class="bad">${t('notSaved')}</span>`)
  }
}
for (const id of ['libStroke', 'libHeadWidth', 'libHeadHeight']) el(id).addEventListener('input', scheduleLibRender)
el('libColored').addEventListener('change', scheduleLibRender)

// Deleting takes two clicks on the same button: the first arms it, the second
// removes the files. Selecting another board or switching language disarms.
function disarmDelete() {
  el('libDelete').classList.remove('armed')
  el('libDelete').textContent = t('deleteBoard')
}
el('libDelete').addEventListener('click', async () => {
  if (!libBoard) return
  if (!el('libDelete').classList.contains('armed')) {
    el('libDelete').classList.add('armed')
    el('libDelete').textContent = t('confirmDelete')
    return
  }
  const meta = libBoard
  const name = `${meta.W}x${meta.H}/${meta.id}`
  disarmDelete()
  try {
    const r = await fetch(`/api/boards/${meta.W}x${meta.H}/${meta.id}`, { method: 'DELETE' })
    if (!r.ok) throw new Error(`HTTP ${r.status}`)
  } catch {
    setStatus(`<span class="bad">${t('deleteFailed')}</span>`)
    return
  }
  libBoard = null
  dropLibWorker()
  showLibDetail(false)
  el('board').innerHTML = ''
  setStatus(t('deletedBoard', `<code>${name}</code>`))
  await loadLibrary({ force: true })
})

// --- state in the URL -------------------------------------------------------
// Writing the hash fires hashchange ASYNCHRONOUSLY, and Chrome runs
// setTimeout(0) before that event — a flag cleared by a timer guarded nothing
// and every write triggered a full regeneration (every "Generate" computed the
// board twice, every preview change too). The guard is a comparison with the
// last written hash.
let writtenHash = ''
/** The view part of the URL hash: the preview and export fields as the inputs hold them. */
type UrlView = {
  cell: string
  stroke: string
  top: string
  headWidth: string
  headHeight: string
  colored: boolean
  hilite: boolean
  help: boolean
  fit: boolean
  zoom: string
  lang: Lang
  tab: Tab
}
function saveToUrl() {
  const view: UrlView = {
    cell: el<HTMLInputElement>('cell').value,
    stroke: el<HTMLInputElement>('stroke').value,
    top: el<HTMLInputElement>('top').value,
    headWidth: el<HTMLInputElement>('headWidth').value,
    headHeight: el<HTMLInputElement>('headHeight').value,
    colored: el<HTMLInputElement>('colored').checked,
    hilite: el<HTMLInputElement>('hilite').checked,
    help: el<HTMLInputElement>('help').checked,
    fit: el<HTMLInputElement>('fit').checked,
    zoom: el<HTMLInputElement>('zoom').value,
    lang,
    tab: activeTab,
  }
  writtenHash = '#' + encodeURIComponent(JSON.stringify({ ...state, __view: view }))
  if (location.hash !== writtenHash) location.hash = writtenHash
}
function loadFromUrl(): boolean {
  if (!location.hash.length) return false
  try {
    const saved: unknown = JSON.parse(decodeURIComponent(location.hash.slice(1)))
    const root = isRecord(saved) ? saved : {}
    const view = isRecord(root.__view) ? root.__view : {}
    const loaded = readParams(saved)
    let clamped = false
    for (const spec of PARAM_SPEC) {
      const v = loaded[spec.key]
      if (v !== undefined) clamped = setParam(spec.key, v) || clamped
    }
    showClamped(clamped)
    if (view.cell) el<HTMLInputElement>('cell').value = String(view.cell)
    if (view.stroke) el<HTMLInputElement>('stroke').value = String(view.stroke)
    if (view.headWidth) el<HTMLInputElement>('headWidth').value = String(view.headWidth)
    // A hash headHeight of 0 meant "automatic": it was this input's own
    // default until the height became literal, so every link shared before
    // that change carries one, as a string, which is truthy. Read it as unset
    // and keep the page default — the same rule readMeta applies to a stored
    // board (store.ts). Nothing is lost: once the panel's minimum for this
    // input is 0.1 the lab cannot write a 0 into a hash at all, so a 0 here is
    // an old link rather than a height anybody chose.
    if (Number(view.headHeight) > 0) el<HTMLInputElement>('headHeight').value = String(view.headHeight)
    if (view.top) el<HTMLInputElement>('top').value = String(view.top)
    el<HTMLInputElement>('colored').checked = !!view.colored
    el<HTMLInputElement>('hilite').checked = view.hilite !== false
    el<HTMLInputElement>('help').checked = view.help !== false
    document.body.classList.toggle('nohelp', view.help === false)
    if (view.zoom) {
      el<HTMLInputElement>('zoom').value = String(view.zoom)
      el<HTMLInputElement>('zoomRange').value = String(view.zoom)
    }
    el<HTMLInputElement>('fit').checked = view.fit !== false
    if (view.lang === 'pl' || view.lang === 'en') lang = view.lang
    applyZoom()
    if (view.tab === 'library') showTab('library')
    return true
  } catch {
    return false
  }
}
globalThis.addEventListener('hashchange', () => {
  if (location.hash === writtenHash) return
  if (loadFromUrl()) {
    applyLanguage()
    run()
  }
})

// --- report -----------------------------------------------------------------
function pct(v: number): string {
  return (100 * v).toFixed(0) + '%'
}

/** One line of the stats table: label, shown value, the number compared with the previous run, and whether an increase is an improvement. */
type StatRow = { k: string; v: string | number; num: number | undefined; better: number }
const stat = (k: string, v: string | number, num?: number, better = 0): StatRow => ({ k, v, num, better })
const SEP: StatRow = { k: '—', v: '', num: undefined, better: 0 }

function report(msg: Done, { keepPrev = false }: { keepPrev?: boolean } = {}) {
  const { metrics, ok, genMs, metricsMs, backtracks, restartsUsed, stuck, stats } = msg
  const rp = runParams
  const cells = rp.W * rp.H

  if (!ok) {
    setStatus(
      `<span class="bad">${
        t('notClosedStatus', fmt(stuck?.remaining ?? 0), stuck?.sizes.length ?? 0, stuck?.sizes[0] ?? 0)
      }</span>`,
    )
  } else if (metrics) {
    setStatus(
      `<span class="good">${t('closed')}</span> ${
        metrics.solvable ? t('solvable') : `<span class="bad">${t('unsolvable')}</span>`
      }`,
    )
  } else {
    // A closed board always has pieces, so the engine analysed it.
    throw new Error('closed board without metrics')
  }

  if (!metrics) {
    el('stats').innerHTML = ''
    el('topTable').innerHTML = ''
    return
  }

  // Third item: the numeric value compared with the previous run; fourth says
  // whether an increase is an improvement (delta colour).
  const rows: StatRow[] = [
    stat(t('stat_board'), t('stat_boardVal', rp.W, rp.H, fmt(cells), rp.seed)),
    stat(t('stat_pieces'), fmt(metrics.N), metrics.N, 0),
    stat(t('stat_avgLen'), (cells / metrics.N).toFixed(1), cells / metrics.N, 0),
    stat(t('stat_longest'), t('stat_longestVal', metrics.maxLen, pct(metrics.maxLen / cells)), metrics.maxLen, 1),
    stat(
      t('stat_lengths'),
      `2–6: ${pct(metrics.hist['2-6'] / metrics.N)} · 7–15: ${pct(metrics.hist['7-15'] / metrics.N)} · 16–49: ${
        pct(metrics.hist['16-49'] / metrics.N)
      } · 50+: ${(100 * metrics.hist['50+'] / metrics.N).toFixed(1)}%`,
    ),
    SEP,
    stat(t('stat_f0'), metrics.f0.toFixed(3), metrics.f0, 0),
    stat(t('stat_almost'), `${metrics.almost} (${pct(metrics.almost / metrics.N)})`, metrics.almost, 0),
    stat(t('stat_D'), metrics.D, metrics.D, 0),
    stat(t('stat_corridor'), metrics.meanCorridorLen.toFixed(1), metrics.meanCorridorLen, 0),
    SEP,
    stat(t('stat_span'), pct(metrics.span), 100 * metrics.span, 1),
    stat(t('stat_spanTop'), pct(metrics.spanTop10), 100 * metrics.spanTop10, 1),
    stat(t('stat_spanMax'), pct(metrics.spanMax), 100 * metrics.spanMax, 1),
    stat(t('stat_outDeg'), `${metrics.outDeg.toFixed(1)} ${t('piecesUnit')}`, metrics.outDeg, 1),
    stat(t('stat_maxOut'), `${metrics.maxOut} ${t('piecesUnit')}`, metrics.maxOut, 1),
    stat(t('stat_blockDist'), `${pct(metrics.blockDist)} ${t('perimeterUnit')}`, 100 * metrics.blockDist, 1),
    SEP,
    stat(t('stat_bends'), metrics.bends.toFixed(2), metrics.bends, 1),
    stat(t('stat_coil'), pct(metrics.coil), 100 * metrics.coil, -1),
    stat(t('stat_border'), pct(metrics.sharedBorder), 100 * metrics.sharedBorder, 1),
    stat(t('stat_multi'), pct(metrics.multiLine), 100 * metrics.multiLine, 1),
    SEP,
    // Stalling explains short lines better than the length distribution: a
    // path dies in a frontier pocket long before the ordered length.
    stat(
      t('stat_stall'),
      stats.n ? t('stat_stallVal', pct(stats.stall / stats.n), pct(stats.got / stats.want)) : '—',
      stats.n ? 100 * stats.stall / stats.n : undefined,
      -1,
    ),
    stat(t('stat_absorbed'), t('stat_absorbedVal', stats.absorbs ?? 0, stats.absorbed ?? 0), stats.absorbs ?? 0, -1),
    stat(t('stat_backtracks'), `${backtracks} / ${restartsUsed}`, backtracks, -1),
    stat(t('stat_time'), t('stat_timeVal', (genMs / 1000).toFixed(2), (metricsMs / 1000).toFixed(2)), genMs, -1),
  ]

  // Deltas are keyed by row index, not label, so a language switch keeps them.
  el('stats').innerHTML = rows
    .map(({ k, v, num, better }, i) => {
      if (k === '—') return '<tr><td colspan="3" style="height:.5rem"></td></tr>'
      let delta = ''
      const prev = prevStats.get(i)
      if (num !== undefined && prev !== undefined && Math.abs(num - prev) > 1e-9) {
        const diff = num - prev
        const abs = Math.abs(diff)
        const shown = abs >= 100 ? abs.toFixed(0) : abs >= 1 ? abs.toFixed(1) : abs.toFixed(2)
        // "Better" depends on the metric: coiling should fall, span should
        // rise, the piece count is neutral.
        const cls = better === 0 ? '' : (diff > 0) === (better > 0) ? ' up' : ' down'
        delta = `<td class="delta${cls}">${diff > 0 ? '+' : '−'}${shown}</td>`
      }
      if (num !== undefined) prevStatsNext.set(i, num)
      return `<tr><td>${k}</td><td class="num">${v}</td>${delta || '<td></td>'}</tr>`
    })
    .join('')

  // swap only after building the table — otherwise we would compare with ourselves
  if (!keepPrev) prevStats = new Map(prevStatsNext)
  prevStatsNext.clear()
}

function renderLongest(longest: LongestSummary[]) {
  if (!longest.length) {
    el('topTable').innerHTML = ''
    return
  }
  const body = longest.map((p) =>
    `<tr><td>${p.len}</td><td>${p.sx}×${p.sy}</td><td>${pct(p.span)}</td>` +
    `<td>${pct(p.density)}</td><td>${pct(p.coil)}</td></tr>`
  ).join('')
  el('topTable').innerHTML = `<h2 style="border:0;padding:0">${t('longestHead', longest.length)}</h2>` +
    `<p class="grouphelp">${t('longestHelp')}</p>` +
    `<table class="top"><tr><th>${t('th_len')}</th><th>${t('th_box')}</th><th>${t('th_span')}</th>` +
    `<th>${t('th_density')}</th><th>${t('th_coil')}</th></tr>${body}</table>`
}

applyZoom()
const fromUrl = loadFromUrl()
applyLanguage()
// A shared URL carries its own knobs; otherwise the first board of the simple
// view is the one its form describes.
showView(localStorage.getItem('labView') === 'advanced' ? 'advanced' : 'simple')
if (simpleActive() && !fromUrl) applySimple()
refreshActive()
updateCommand()
run()
