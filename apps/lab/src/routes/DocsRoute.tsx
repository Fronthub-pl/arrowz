import type { ReactElement } from 'react'
import { Navigate, useParams } from 'react-router'
import { CliDocs } from './CliDocs'
import { DocsNav } from './DocsNav'
import { ElementDocs } from './ElementDocs'

/**
 * The documentation tab's two pages. The section keeps the id, role and
 * aria-labelledby the tab strip resolves against, and the tabIndex that makes a
 * panel with no focusable content reachable — AppRoutes.browser.test.tsx and
 * Workspace.browser.test.tsx both hold that shell in place.
 *
 * An unknown page name redirects rather than rendering an empty panel: the
 * wildcard route cannot catch it, because `/docs/:what` has already matched.
 */
export function DocsRoute(): ReactElement {
  const { what } = useParams()
  if (what !== 'element' && what !== 'cli') return <Navigate to="/docs/element" replace />
  return (
    <main>
      <section id="docs-panel" role="tabpanel" aria-labelledby="tab-docs-panel" tabIndex={0} className="fw-docs">
        <DocsNav />
        {what === 'element' ? <ElementDocs /> : <CliDocs />}
      </section>
    </main>
  )
}
