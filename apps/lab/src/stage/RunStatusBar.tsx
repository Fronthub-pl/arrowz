import { useDictionary } from '../i18n'
import { useRunState } from './useRunState'

/**
 * The live region: without it a screen reader would never learn that a
 * thirty-second carve had finished. `<output>` already has the `status` role,
 * so writing it again is what `jsx-a11y/no-redundant-roles` catches.
 *
 * Its sentence is `useRunState`'s, which the two columns' visible lines share.
 * From 768 up the bar around it is out of sight and the lines are what a person
 * reads; the output stays mounted at every band, so an announcement never
 * depends on a column a sheet may hide.
 */
export function RunStatusBar() {
  const dict = useDictionary()
  const { live } = useRunState()
  // Named: the clamp notice is a second `status` region.
  return (
    <output aria-live="polite" aria-label={dict.t('runStatus')}>
      {live}
    </output>
  )
}
