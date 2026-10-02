import { useEffect } from 'react'
import { useLocation } from 'react-router'
import { FILE_ROUTE } from '../library/openBoardFiles'
import { useStore } from '../state/store'

/**
 * The address the saved boards' tab should return to from `pathname`, or null
 * off that tab. An opened file is not one: it is a preview held in memory,
 * which the lab tab clears (`openStoredBoard`), so its address would come back empty.
 */
export function boardsPathOf(pathname: string): string | null {
  if (pathname === FILE_ROUTE) return '/boards'
  return pathname === '/boards' || pathname.startsWith('/boards/') ? pathname : null
}

/** Keeps `ui.lastBoards` on the saved boards' current address. Mounted once, in `App`. */
export function useRememberBoards(): void {
  const { pathname } = useLocation()
  useEffect(() => {
    const path = boardsPathOf(pathname)
    if (path !== null) useStore.getState().ui.setLastBoards(path)
  }, [pathname])
}
