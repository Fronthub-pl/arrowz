/**
 * The documentation's pages in both languages, parsed once when the Docs
 * chunk loads: they are fixed for the life of the page, and the renderer and
 * the navigation column read them on every render.
 */
import type { Lang } from '@arrowz/engine/i18n'
import type { Root } from 'mdast'
import { type DocsSection, parseDocs, sectionsOf } from './markdown'
import type { DocsPage } from './pages'
import cliEn from '../../docs-content/en/cli.md?raw'
import elementEn from '../../docs-content/en/element.md?raw'
import cliPl from '../../docs-content/pl/cli.md?raw'
import elementPl from '../../docs-content/pl/element.md?raw'

export interface ParsedPage {
  readonly root: Root
  readonly sections: readonly DocsSection[]
}

/** The Markdown of every page, as written: what the content guard parses afresh. */
export const SOURCES: Readonly<Record<Lang, Readonly<Record<DocsPage, string>>>> = {
  en: { element: elementEn, cli: cliEn },
  pl: { element: elementPl, cli: cliPl },
}

function parsed(markdown: string): ParsedPage {
  const root = parseDocs(markdown)
  return { root, sections: sectionsOf(root) }
}

const PAGES: Readonly<Record<Lang, Readonly<Record<DocsPage, ParsedPage>>>> = {
  en: { element: parsed(SOURCES.en.element), cli: parsed(SOURCES.en.cli) },
  pl: { element: parsed(SOURCES.pl.element), cli: parsed(SOURCES.pl.cli) },
}

export function docsPage(lang: Lang, page: DocsPage): ParsedPage {
  return PAGES[lang][page]
}
