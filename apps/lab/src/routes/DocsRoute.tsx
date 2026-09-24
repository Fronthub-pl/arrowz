import { type ReactElement, useRef } from 'react'
import { Navigate, useParams } from 'react-router'
import { CliDocs } from './CliDocs'
import { DocsNav, type DocsPage } from './DocsNav'
import { ElementDocs } from './ElementDocs'
import { useSectionInView } from './useSectionInView'

/**
 * The documentation tab's two pages. The section keeps the id, role and
 * aria-labelledby the tab strip resolves against, and the tabIndex that makes a
 * panel with no focusable content reachable.
 *
 * Inside it, the navigation column beside the page; under 768 the column
 * stands over it.
 *
 * An unknown page name redirects rather than rendering an empty panel: the
 * wildcard route cannot catch it, because `/docs/:what` has already matched.
 */
export function DocsRoute(): ReactElement {
  const { what } = useParams()
  if (what !== 'element' && what !== 'cli') return <Navigate to="/docs/element" replace />
  return <DocsPanel page={what} />
}

/** Its own component so the hooks below run only for a page that exists. */
function DocsPanel({ page }: { page: DocsPage }): ReactElement {
  const panel = useRef<HTMLElement>(null)
  const section = useSectionInView(panel, page)
  return (
    <main>
      <section
        ref={panel}
        id="docs-panel"
        role="tabpanel"
        aria-labelledby="tab-docs-panel"
        tabIndex={0}
        className="fw-docs"
      >
        <div className="fw-docs-grid">
          <DocsNav section={section} />
          <div className="fw-docs-body">{page === 'element' ? <ElementDocs /> : <CliDocs />}</div>
        </div>
      </section>
    </main>
  )
}
