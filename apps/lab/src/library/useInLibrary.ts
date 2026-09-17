import { useLocation } from 'react-router'
import { selectedIndex } from '../shell/TabRow'

/**
 * Whether the saved boards are the tab on screen. The workspace serves two
 * tabs from one panel, so the stage and the report column have to ask rather
 * than infer: spec §5.3 says the frame shows the preview *while the route is
 * the library* and the run's result otherwise, and "otherwise" is not the same
 * question as "is there a preview".
 *
 * `selectedIndex` is the shell's own reader (`TabRow`), so "which tab is open"
 * has one definition in the application.
 */
export function useInLibrary(): boolean {
  return selectedIndex(useLocation().pathname) === 1
}
