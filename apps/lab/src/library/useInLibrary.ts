import { useLocation } from 'react-router'
import { selectedIndex } from '../shell/TabRow'

/**
 * Whether the saved boards are the tab on screen. The stage shows the preview
 * while the route is the library and the run's result otherwise, which is not
 * the same question as "is there a preview". `selectedIndex` (`TabRow`) keeps
 * "which tab is open" to one definition.
 */
export function useInLibrary(): boolean {
  return selectedIndex(useLocation().pathname) === 1
}
