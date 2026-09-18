import type { ReactElement } from 'react'
import { NavLink } from 'react-router'
import { useDictionary } from '../i18n'

/**
 * The documentation's own two pages. Links, not a radio group and not a second
 * tablist: a documentation page has an address worth copying and opening in a
 * new tab, and only a link gives one.
 *
 * `NavLink` and not a plain `<a href>`: an anchor would reload the document,
 * killing the run in flight and disposing the board's WebGL context, which is
 * the whole point of Ruling 5 and of the comment in AppRoutes.tsx. It is also
 * the lab's first router link — every other navigation here goes through
 * `useNavigate` — so the pattern is new and deliberate.
 *
 * `aria-current="page"` is NavLink's own default for the active link; it is not
 * written by hand. `docs.css` styles `[aria-current='page']`, which does not
 * collide with the lab's `[aria-current='true']` rules for preset chips and
 * library rows.
 */
export function DocsNav(): ReactElement {
  const dict = useDictionary()
  return (
    <nav className="fw-docs-nav" aria-label={dict.t('docsNavLabel')}>
      <NavLink to="/docs/element">{dict.t('docsElement')}</NavLink>
      <NavLink to="/docs/cli">{dict.t('docsCli')}</NavLink>
    </nav>
  )
}
