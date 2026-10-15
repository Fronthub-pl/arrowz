import { dictionary } from '@fronthub/arrowz-engine/i18n'
import { describe, expect, it } from 'vitest'
import { specOf } from '../state/params.slice'
import { knobValueText } from './knobValue'

const en = dictionary('en')
const pl = dictionary('pl')

describe('a knob value as its row shows it', () => {
  it('is the word for the track minimum where it has one, in the language', () => {
    expect(knobValueText(en, specOf('Lmax'), 0)).toBe('auto')
    expect(knobValueText(en, specOf('giantStep'), 0)).toBe('random')
    expect(knobValueText(pl, specOf('giantStep'), 0)).toBe('losowo')
  })

  it('is the number and its unit off the minimum, the number as the knob prints it', () => {
    expect(knobValueText(en, specOf('Lmax'), 20)).toBe('20 cells')
    expect(knobValueText(pl, specOf('Lmax'), 20)).toBe('20 kom.')
    expect(knobValueText(pl, specOf('wShort'), 0.35)).toBe('0.35')
    // `auto` is 200 on the command line, mid-track, so the knob shows the number.
    expect(knobValueText(en, specOf('maxBack'), 200)).toBe('200 arrows')
  })

  it('is the word of the choice for a choice knob, in the language', () => {
    expect(knobValueText(en, specOf('trapBias'), 0)).toBe('normal')
    expect(knobValueText(pl, specOf('trapBias'), 1)).toBe('szukaj')
    expect(knobValueText(en, specOf('giantSpacing'), 1)).toBe('off')
    expect(knobValueText(pl, specOf('giantSpacing'), 1)).toBe('bez odstępu')
  })
})
