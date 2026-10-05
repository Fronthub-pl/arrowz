import type { ReactElement } from 'react'
import { Link, NavLink, useLocation } from 'react-router'
import { docsPage } from '../docs/content'
import { DOCS_PAGE_NAMES, DOCS_PAGES, pageOf } from '../docs/pages'
import { useDictionary } from '../i18n'
import { useStore } from '../state/store'

/**
 * The section a navigation asked for, carried in the router's state rather
 * than in the address: the fragment is the lab's own — `useUrlHash` writes the
 * knobs there on every route — so a section id in it would be overwritten at
 * once and, pasted, would read as a broken lab link.
 */
export function sectionOf(state: unknown): string | null {
  if (typeof state !== 'object' || state === null || !('docsSection' in state)) return null
  return typeof state.docsSection === 'string' ? state.docsSection : null
}

/**
 * The documentation's navigation, one column in two levels: every page, and
 * under each the `##` sections of its Markdown in the language on screen.
 * Links, not a radio group or a second tablist: a documentation page has an
 * address worth copying, and only a link gives one. A section's link is its
 * page's address, keeping the lab's fragment, with the section in the
 * navigation's state (`sectionOf`); `useSectionInView` scrolls the panel to it.
 *
 * `NavLink` and `Link`, not a plain `<a href>`: an anchor would reload the
 * document, killing the run in flight and disposing the board's WebGL context.
 *
 * Two kinds of "current": `aria-current="page"` is NavLink's own default for
 * the page on screen; `aria-current="true"` marks the section in view. Neither
 * collides with the lab's `[aria-current='true']` rules: `docs.css` scopes its own.
 *
 * Under 768 the column stands over the page and lists the sections of the
 * page on screen only; `on` is the class that tells the sheet which.
 */
export function DocsNav({ section }: { section?: string | undefined }): ReactElement {
  const dict = useDictionary()
  const lang = useStore((state) => state.lang.lang)
  const location = useLocation()
  const current = pageOf(location.pathname)
  return (
    <nav className="fw-docs-toc" aria-label={dict.t('docsNavLabel')}>
      <ul>
        {DOCS_PAGES.map((page) => (
          <li key={page} className={page === current ? 'pg on' : 'pg'}>
            <NavLink to={`/docs/${page}`}>{dict.t(DOCS_PAGE_NAMES[page])}</NavLink>
            <ul>
              {docsPage(lang, page).sections.map(({ id, title }) => (
                <li key={id}>
                  <Link
                    to={{ pathname: `/docs/${page}`, hash: location.hash }}
                    state={{ docsSection: id }}
                    aria-current={page === current && id === section ? 'true' : undefined}
                  >
                    {title}
                  </Link>
                </li>
              ))}
            </ul>
          </li>
        ))}
      </ul>
    </nav>
  )
}
