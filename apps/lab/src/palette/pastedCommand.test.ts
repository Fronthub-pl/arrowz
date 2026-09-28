import { buildCommand } from '@arrowz/engine/command'
import { dictionary } from '@arrowz/engine/i18n'
import { beforeEach, describe, expect, it } from 'vitest'
import type { RunControl } from '../run/useRun'
import { useStore } from '../state/store'
import { viewOf } from '../state/view.slice'
import type { CommandDeps } from './commands'
import { isCommandQuery, loadCommand, pastedRow, problemWords, readCommand } from './pastedCommand'

function deps(lang: 'en' | 'pl' = 'en') {
  const started: number[] = []
  const went: string[] = []
  const control: RunControl = { start: () => started.push(1), abort: () => {}, hold: () => {} }
  const d: CommandDeps = { control, navigate: (path) => went.push(path), dict: dictionary(lang) }
  return { d, started, went }
}

beforeEach(() => {
  useStore.setState((state) => ({ ui: { ...state.ui, mode: 'advanced', palette: true } }))
  useStore.getState().params.reset()
  useStore.getState().run.reset()
})

describe('a pasted command', () => {
  it('is recognised by its prefix or a flag with a value, not by a word or a lone flag', () => {
    expect(isCommandQuery('deno task carve --width=9')).toBe(true)
    expect(isCommandQuery('  --width=9')).toBe(true)
    expect(isCommandQuery('width')).toBe(false)
    expect(isCommandQuery('-')).toBe(false)
    expect(isCommandQuery('--seed')).toBe(false)
    expect(isCommandQuery('--seed=5')).toBe(true)
    expect(isCommandQuery('--colored --sharp')).toBe(true)
  })

  it('reads a valid line into one choosable row naming its board and the ignored mode flags', () => {
    const { d } = deps()
    const row = pastedRow(d, 'deno task carve --width=30 --height=40 --seed=5 --svg --count=3')
    expect(row.problems).toEqual([])
    expect(row.command.disabled).toBe(false)
    expect(row.command.name).toBe('Load this command')
    expect(row.command.value).toBe(dictionary('en').t('boardAnnotation', 30, 40, 5))
    expect(row.command.note).toBe('ignored: --svg --count=3')
  })

  it('says drawn for a randomized line', () => {
    const row = pastedRow(deps().d, '--width=30 --height=40 --randomized')
    expect(row.command.value).toBe(`${dictionary('en').t('boardAnnotation', 30, 40, 7)} · drawn`)
  })

  it('lists every problem in Polish and cannot be chosen', () => {
    const row = pastedRow(deps('pl').d, "--width=2000 --nope --ink='#11")
    expect(row.command.disabled).toBe(true)
    expect(row.command.value).toBe('4 problemy')
    // The split's unclosed quote first, then the parser's: missing sizes lead its own list.
    expect(row.problems).toEqual([
      'niezamknięty cudzysłów: --ink=#11',
      'w komendzie brakuje --height',
      '--width=2000 jest poza zakresem 4..1000',
      '--nope to nieznana flaga',
    ])
  })

  it('words every kind of problem without English in Polish', () => {
    const pl = dictionary('pl')
    const en = dictionary('en')
    const lines = [
      '--width=9 --height=9 --colored=1',
      '--width=9 --height=9 seed',
      '--width=9 --height=9 --stroke=0.4',
      '--width=9 --height=9 --advanced',
      '--width=9 --height=9 --board',
      '--width=9 --height=9 --giantspacepen=1',
      '--width=9 --height=9 --start=sideways',
      '--width=2000 --height=9',
      '--width=9 --height=9 --lmax=x',
      '--width=9.5 --height=9',
      '--width=9 --height=9 --theme=nope',
      '--width=9 --height=9 --ink=red',
      '--width=9 --height=9 --palette=red',
      `--width=9 --height=9 --palette=${Array(9).fill('#112233').join(',')}`,
      '--width=9 --height=9 --nope',
      '--width=9',
      "--width=9 --height=9 --ink='#1",
    ]
    for (const line of lines) {
      const { problems } = readCommand(line)
      expect(problems.length, line).toBeGreaterThan(0)
      for (const p of problems) expect(problemWords(pl, p), line).not.toBe(problemWords(en, p))
    }
  })

  it('loads a lab command back: knobs, view, one run, the lab route', () => {
    const { d, started, went } = deps()
    useStore.getState().params.setMany({ W: 30, H: 40, seed: 5, pStraight: 0.9 })
    useStore.getState().view.apply({ colored: true, palette: ['#aa0000', '#00aa00'], ink: '#101010' })
    const state = useStore.getState()
    const line = buildCommand(state.params.values, viewOf(state.view))
    useStore.getState().params.reset()
    useStore.getState().view.apply({ colored: false, palette: [], ink: '' })
    const { parsed, problems } = readCommand(line)
    expect(problems).toEqual([])
    // No counted edit, or `useAutoRun` would start a second run behind this one.
    const edits = [useStore.getState().params.edits, useStore.getState().recipe.edits]
    loadCommand(d, parsed)
    expect([useStore.getState().params.edits, useStore.getState().recipe.edits]).toEqual(edits)
    const after = useStore.getState()
    expect(after.params.values.pStraight).toBe(0.9)
    expect(after.params.values.W).toBe(30)
    expect(after.view.palette).toEqual(['#aa0000', '#00aa00'])
    expect(after.view.ink).toBe('#101010')
    expect(started).toEqual([1])
    expect(went).toEqual(['/'])
    expect(after.ui.palette).toBe(false)
  })

  it('loads a line whose knobs break a rule, and the lab shows the violation', () => {
    loadCommand(deps().d, readCommand('--width=30 --height=40 --wshort=0.8 --wmid=0.8').parsed)
    expect(useStore.getState().params.values.wShort).toBe(0.8)
    expect(useStore.getState().params.violations.length).toBeGreaterThan(0)
  })

  it('switches the simple view to advanced for a line with pinned knobs, and keeps it for an everyday line', () => {
    const { d } = deps()
    useStore.getState().ui.setMode('simple')
    loadCommand(d, readCommand('--width=30 --height=40 --length=0.8').parsed)
    expect(useStore.getState().ui.mode).toBe('simple')
    expect(useStore.getState().recipe.value.lengths).toBe(0.8)
    loadCommand(d, readCommand('--width=30 --height=40 --pstraight=0.9').parsed)
    expect(useStore.getState().ui.mode).toBe('advanced')
    expect(useStore.getState().params.values.pStraight).toBe(0.9)
  })
})
