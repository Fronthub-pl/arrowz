import { type BoardColours, resolveColours } from '@arrowz/board-element'
import type { ViewFields } from '../state/viewSchema'

/**
 * The colours the board on screen is drawn in, for the SVG export. '' is "not
 * set", as in `BoardFrame`'s overrides, so the theme shows through it.
 */
export function exportColours(
  view: Pick<ViewFields, 'theme' | 'palette' | 'paper' | 'ink' | 'highlightColor'>,
): BoardColours {
  return resolveColours(view.theme, {
    ...(view.palette.length > 0 ? { palette: view.palette } : {}),
    ...(view.paper === '' ? {} : { paper: view.paper }),
    ...(view.ink === '' ? {} : { ink: view.ink }),
    ...(view.highlightColor === '' ? {} : { highlight: view.highlightColor }),
  })
}
