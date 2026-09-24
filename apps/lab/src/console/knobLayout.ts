import type { InactiveKey, ParamGroup, ParamKey } from '@arrowz/engine'
import type { Dictionary, UiKey } from '@arrowz/engine/i18n'

/** A unit word, keyed as the dictionary's `units` section is. */
export type UnitKey = keyof Dictionary['units']

/**
 * The unit beside a knob's value. A lab decision, not the
 * engine's: the engine's sentences name the unit inside the label, and a row
 * drops the sentence for the short term. A knob with no entry is a bare number.
 */
export const UNIT_OF: Partial<Record<ParamKey, UnitKey>> = {
  W: 'cells',
  H: 'cells',
  Lmax: 'cells',
  backbite: 'tries',
  probeLen: 'cells',
  giants: 'pieces',
  giantSpan: 'sides',
  giantStep: 'cells',
  headTries: 'tries',
  absorbLimit: 'cells',
  maxBack: 'carves',
}

/**
 * Where a special value's chip lands the knob when it is released and no
 * earlier value is known: the knob's default when that is not the special
 * value itself. `Lmax` defaults to its special value (0, `auto`), so its way
 * back is the smallest length the `lmaxHole` rule allows (the test checks 17
 * against the engine's rule).
 */
export const RELEASE_TO: Partial<Record<ParamKey, number>> = { Lmax: 17 }

/** A run of knobs inside a dependency block, under a heading when it has one. */
export interface KnobSub {
  title: UiKey | null
  keys: readonly ParamKey[]
}

/**
 * A group's dependency block: knobs that have no effect until a parent does,
 * drawn in one block under their parents rather than each saying "No effect"
 * on its own. `reason` is the engine's inactive reason the block stands for: a
 * row whose knob reports exactly it says nothing itself (the header says it
 * once), while any other reason (`stepZero`, `anticoilWins`) is still that
 * row's own line.
 *
 * The skeleton has two parents because the engine's `skeletonOff` is
 * `giants <= 0 && wGiant <= 0`: putting `wGiant` inside the block under
 * "needs giants > 0" would hide a live control behind a false header.
 */
export interface KnobBlock {
  id: string
  parents: readonly ParamKey[]
  reason: InactiveKey
  /** The header while the parents are all 0. */
  needs: UiKey
  /** The header while a parent is on. */
  title: UiKey
  subs: readonly KnobSub[]
}

export const BLOCKS: Partial<Record<ParamGroup, KnobBlock>> = {
  difficulty: {
    id: 'probe',
    parents: ['probe'],
    reason: 'probeOff',
    needs: 'needsProbe',
    title: 'depProbe',
    subs: [{ title: null, keys: ['probeLen'] }],
  },
  skeleton: {
    id: 'skeleton',
    parents: ['giants', 'wGiant'],
    reason: 'skeletonOff',
    needs: 'needsSkeleton',
    title: 'depSkeleton',
    subs: [
      { title: 'subLayout', keys: ['giantSpan', 'giantStep', 'giantJitter'] },
      { title: 'subGrowth', keys: ['giantStraight', 'giantAnticoil', 'giantSpacing'] },
    ],
  },
}

/** Every knob a block holds, in drawing order. */
export function blockKeys(block: KnobBlock): ParamKey[] {
  return block.subs.flatMap((sub) => [...sub.keys])
}
