/**
 * The documentation's pages, in the column's order, and the prefix their
 * section ids take in the DOM. Every list of pages — the column, the
 * palette's go-to rows, the redirects — derives from `DOCS_PAGES`. Light on
 * purpose: the route imports it eagerly, while the parser and the pages load
 * as a chunk of their own (`DocsRoute`).
 */
import type { UiKey } from '@arrowz/engine/i18n'

export const DOCS_PAGES = ['arrowz', 'cli', 'element'] as const

export type DocsPage = (typeof DOCS_PAGES)[number]

/** Each page's name in the column and the palette, by its dictionary key. */
export const DOCS_PAGE_NAMES = {
  arrowz: 'docsArrowz',
  cli: 'docsCli',
  element: 'docsElement',
} as const satisfies Record<DocsPage, UiKey>

/** Where `/docs`, the Docs tab and an unknown page name go: the first page. */
export const DOCS_HOME = `/docs/${DOCS_PAGES[0]}`

export function isDocsPage(what: string | undefined): what is DocsPage {
  return DOCS_PAGES.some((page) => page === what)
}

/** The page an address names; `DocsRoute` has already redirected anything else. */
export function pageOf(pathname: string): DocsPage {
  const what = pathname.split('/')[2]
  return isDocsPage(what) ? what : DOCS_PAGES[0]
}

/** The panel shares the document with the lab's own ids, so a section's `{#id}` is prefixed. */
export const SECTION_PREFIX = 'docs-'
