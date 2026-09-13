import { useParams } from 'react-router'
import { useDictionary } from '../i18n'

export function DocsRoute() {
  const dict = useDictionary()
  const { what } = useParams()
  return (
    <main>
      <section id="docs-panel" role="tabpanel" aria-labelledby="tab-docs-panel" tabIndex={0}>
        <h2>{dict.t('tabDocs')}</h2>
        {/* PR 6 fills this: the element's API, and the CLI help from helpText(). */}
        <p>{what}</p>
      </section>
    </main>
  )
}
