import { useDictionary } from '../i18n'
import { useRunState } from './useRunState'

/**
 * The live region. The mock's run state has no `aria-live`, so a screen reader
 * would never learn that a thirty-second carve had finished (§7.2). `<output>`
 * already has the `status` role — writing it again is what
 * `jsx-a11y/no-redundant-roles` exists to catch.
 *
 * Its sentence is `useRunState`'s, which the two columns' visible lines share
 * (round 3, 3h). From 768 up the bar around it is out of sight (shell.css) and
 * the lines are what a person reads; the output stays mounted at every band, so
 * an announcement never depends on a column a sheet may hide.
 */
export function RunStatusBar() {
  const dict = useDictionary()
  const { live } = useRunState()
  // A later task adds a second `role="status"` region (a clamp notice), so
  // this one gets a name now, ahead of that, for a screen reader to tell the
  // two apart.
  return (
    <output aria-live="polite" aria-label={dict.t('runStatus')}>
      {live}
    </output>
  )
}
