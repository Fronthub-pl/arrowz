import type { ParamKey, ParamSpec } from '@fronthub/arrowz-engine'
import { wordFor } from '@fronthub/arrowz-engine/command'
import type { Dict } from '@fronthub/arrowz-engine/i18n'
import { UNIT_OF } from './knobLayout'

/**
 * The word the CLI spells a track's minimum with (`--lmax=auto`,
 * `--giantstep=random`), in the language, or null. A knob shows it in place of
 * the number at the minimum; `maxBack`'s `auto` is 200, mid-track, and stays a
 * number.
 */
export function minWord(dict: Dict, key: ParamKey, min: number): string | null {
  const word = wordFor(key, min)
  return word === null ? null : dict.choiceText(key, word)
}

/**
 * A knob's value as its own row shows it: a choice's word, the minimum's word,
 * or the number as `DraftNumber` prints it with the row's unit.
 */
export function knobValueText(dict: Dict, spec: ParamSpec, value: number): string {
  if (spec.control?.kind === 'choice') {
    const choice = spec.control.choices.find((c) => c.value === value)
    return choice === undefined ? String(value) : dict.choiceText(spec.key, choice.word)
  }
  const special = minWord(dict, spec.key, spec.min)
  if (special !== null && value === spec.min) return special
  const unit = UNIT_OF[spec.key]
  return unit === undefined ? String(value) : `${value} ${dict.d.units[unit]}`
}
