import type { ReactElement, RefObject } from 'react'
import { docsPage } from '../docs/content'
import { DocsBoardsProvider } from '../docs/DocsBoards'
import { DocsPageView } from '../docs/DocsPageView'
import type { DocsPage } from '../docs/pages'
import { useStore } from '../state/store'
import { DocsNav } from './DocsNav'
import { useSectionInView } from './useSectionInView'

export interface DocsBodyProps {
  page: DocsPage
  panel: RefObject<HTMLElement | null>
}

/**
 * The documentation panel's contents: the navigation column beside the page,
 * and under 768 over it. The root of the Docs tab's own chunk (`DocsRoute`):
 * with the parser and the pages it is 111 KB minified, 34 KB gzipped, which
 * the lab's first load does not carry. The pages' live boards share one queue
 * while the tab is open (`DocsBoardsProvider`).
 */
export function DocsBody({ page, panel }: DocsBodyProps): ReactElement {
  const lang = useStore((state) => state.lang.lang)
  const section = useSectionInView(panel, docsPage(lang, page).sections)
  return (
    <div className="fw-docs-grid">
      <DocsNav section={section} />
      <div className="fw-docs-body">
        <DocsBoardsProvider root={panel}>
          <DocsPageView page={page} />
        </DocsBoardsProvider>
      </div>
    </div>
  )
}
