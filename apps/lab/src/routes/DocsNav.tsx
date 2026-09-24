import type { Docs } from '@arrowz/engine/docs'
import type { ReactElement } from 'react'
import { Link, NavLink, useLocation } from 'react-router'
import { useDocs } from '../docs/useDocs'
import { useDictionary } from '../i18n'

export type DocsPage = 'element' | 'cli'

/**
 * Each page's sections, in page order: the `id` of the section's `h3` and the
 * key of its heading, so the column and the page read one string.
 */
export const DOCS_SECTIONS = {
  element: [
    { id: 'docs-example', head: 'headExample' },
    { id: 'docs-props', head: 'headProps' },
    { id: 'docs-members', head: 'headMembers' },
    { id: 'docs-events', head: 'headEvents' },
  ],
  cli: [
    { id: 'docs-short', head: 'cliShortHead' },
    { id: 'docs-knobs', head: 'cliKnobsHead' },
  ],
} as const satisfies Record<DocsPage, readonly { id: string; head: keyof Docs }[]>

const PAGES = [
  { page: 'element', name: 'docsElement' },
  { page: 'cli', name: 'docsCli' },
] as const

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

/** The page an address names; DocsRoute has already redirected anything else. */
export function pageOf(pathname: string): DocsPage {
  return pathname.startsWith('/docs/cli') ? 'cli' : 'element'
}

/**
 * The documentation's navigation, one column in two levels: both pages, and
 * under each the sections of that page. Links, not a radio group or a second
 * tablist: a documentation page has an address worth copying, and only a link
 * gives one. A section's link is its page's address, keeping the lab's
 * fragment, with the section in the navigation's state (`sectionOf`);
 * `useSectionInView` scrolls the panel to it.
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
  const docs = useDocs()
  const location = useLocation()
  const current = pageOf(location.pathname)
  return (
    <nav className="fw-docs-toc" aria-label={dict.t('docsNavLabel')}>
      <ul>
        {PAGES.map(({ page, name }) => (
          <li key={page} className={page === current ? 'pg on' : 'pg'}>
            <NavLink to={`/docs/${page}`}>{dict.t(name)}</NavLink>
            <ul>
              {DOCS_SECTIONS[page].map(({ id, head }) => (
                <li key={id}>
                  <Link
                    to={{ pathname: `/docs/${page}`, hash: location.hash }}
                    state={{ docsSection: id }}
                    aria-current={page === current && id === section ? 'true' : undefined}
                  >
                    {docs[head]}
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
