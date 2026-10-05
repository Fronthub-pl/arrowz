import type { ReactElement } from 'react'
import { useStore } from '../state/store'
import { docsPage } from './content'
import { DocsMarkdown } from './DocsMarkdown'
import type { DocsPage } from './pages'

/** A documentation page in the language on screen. */
export function DocsPageView({ page }: { page: DocsPage }): ReactElement {
  const lang = useStore((state) => state.lang.lang)
  return <DocsMarkdown root={docsPage(lang, page).root} />
}
