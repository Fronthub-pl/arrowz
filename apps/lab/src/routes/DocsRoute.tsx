import { type ComponentType, lazy, type ReactElement, Suspense, useRef } from 'react'
import { useParams } from 'react-router'
import { type DocsPage, isDocsPage } from '../docs/pages'
import { useDictionary } from '../i18n'
import type { DocsBodyProps } from './DocsBody'
import { KeepHashNavigate } from './KeepHashNavigate'

function DocsUnavailable(): ReactElement {
  const dict = useDictionary()
  return <p>{dict.t('docsUnavailable')}</p>
}

/**
 * The body's chunk, or a line saying it did not load. A rejected import would
 * otherwise reach React with no error boundary above it, and React unmounts
 * the whole root: the run in flight and the board with it. `load` is a seam
 * for the test.
 */
export function loadDocsBody(
  load: () => Promise<{ DocsBody: ComponentType<DocsBodyProps> }> = () => import('./DocsBody'),
): Promise<{ default: ComponentType<DocsBodyProps> }> {
  return load().then(
    (module) => ({ default: module.DocsBody }),
    () => ({ default: DocsUnavailable }),
  )
}

const DocsBody = lazy(() => loadDocsBody())

/**
 * The documentation tab's pages. An unknown page name redirects rather than
 * rendering an empty panel: the wildcard route cannot catch it, because
 * `/docs/:what` has already matched.
 */
export function DocsRoute(): ReactElement {
  const { what } = useParams()
  if (!isDocsPage(what)) return <KeepHashNavigate to="/docs/element" />
  return <DocsPanel page={what} />
}

/**
 * The section keeps the id, role and aria-labelledby the tab strip resolves
 * against, and the tabIndex that makes a panel with no focusable content
 * reachable. It renders at once; only its contents wait for the chunk, so the
 * tab strip's wiring never points at a panel that is not there yet.
 */
function DocsPanel({ page }: { page: DocsPage }): ReactElement {
  const panel = useRef<HTMLElement>(null)
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
        <Suspense fallback={null}>
          <DocsBody page={page} panel={panel} />
        </Suspense>
      </section>
    </main>
  )
}
