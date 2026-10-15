import { defaultParams } from '@fronthub/arrowz-engine'
import { dictionary } from '@fronthub/arrowz-engine/i18n'
import { describe, expect, it } from 'vitest'
import { knobChanges } from './knobChanges'

const en = dictionary('en')
const pl = dictionary('pl')
// From the defaults: W 25, seed 7, Lmax 0 (auto), trapBias 0, the start `random`, no skeleton.
const base = defaultParams()

describe('the changed knobs', () => {
  it('are none for the same parameters', () => {
    expect(knobChanges(en, base, { ...base })).toEqual([])
  })

  it('name a changed knob by its row, with its group and both values', () => {
    expect(knobChanges(en, base, { ...base, seed: 8 })).toEqual([
      { id: 'knob-seed', group: 'board', label: 'seed', before: '7', after: '8', inactive: null },
    ])
  })

  it('word each value as its knob does, in the language, in table order', () => {
    const after = { ...base, trapBias: 1, Lmax: 20, W: 30 }
    expect(knobChanges(pl, base, after).map((c) => [c.id, c.label, c.before, c.after])).toEqual([
      ['knob-W', pl.d.short.W, '25 kom.', '30 kom.'],
      ['knob-Lmax', pl.d.short.Lmax, 'auto', '20 kom.'],
      ['knob-trapBias', pl.d.short.trapBias, 'normalnie', 'szukaj'],
    ])
  })

  it('show the two knobs behind --start as one row, as their control is one', () => {
    expect(knobChanges(en, base, { ...base, headBias: 1 })).toEqual([
      {
        id: 'knob-start',
        group: 'difficulty',
        label: en.d.short.headBias,
        before: 'random',
        after: 'tunnels',
        inactive: null,
      },
    ])
    const mixing = knobChanges(en, base, { ...base, mix: 0.5 })
    expect(mixing.map((c) => [c.id, c.before, c.after])).toEqual([['knob-start', 'random', 'mix 0.5']])
  })

  it('say which changed knob has no effect on the board on screen', () => {
    expect(knobChanges(en, base, { ...base, giantSpan: 40 })[0]?.inactive).toBe('skeletonOff')
    const on = knobChanges(en, base, { ...base, giants: 5, giantSpan: 40 })
    expect(on.map((c) => [c.id, c.inactive])).toEqual([
      ['knob-giants', null],
      ['knob-giantSpan', null],
    ])
  })
})
