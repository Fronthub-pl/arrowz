/**
 * The documentation's pages, in the column's order, and the prefix their
 * section ids take in the DOM. Light on purpose: the route imports it eagerly,
 * while the parser and the pages load as a chunk of their own (`DocsRoute`).
 */
export const DOCS_PAGES = ['element', 'cli'] as const

export type DocsPage = (typeof DOCS_PAGES)[number]

export function isDocsPage(what: string | undefined): what is DocsPage {
  return DOCS_PAGES.some((page) => page === what)
}

/** The panel shares the document with the lab's own ids, so a section's `{#id}` is prefixed. */
export const SECTION_PREFIX = 'docs-'
