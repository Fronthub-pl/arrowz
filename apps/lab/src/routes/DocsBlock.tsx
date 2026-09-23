import type { ReactElement, ReactNode } from 'react'
import { useDictionary } from '../i18n'
import { useCopy } from '../run/useCopy'

/**
 * One block of a documentation page with its Copy button (round 3, 3f). The
 * button comes after the `pre` in the DOM and stands over its top right corner
 * (`docs.css`), in a strip the block's top padding keeps free, so it never
 * covers the first line — the longest one in both the example and the help.
 *
 * `text` is what Copy writes, `children` what the block shows: the example is
 * coloured spans, and the clipboard must get the code, not the markup.
 *
 * The name says what is copied, `Copy: Using it`, because a page has three of
 * these buttons and "Copy" alone tells a screen reader user nothing. It starts
 * with the visible label, so speech input that says "Copy" still reaches it.
 */
export function DocsBlock({
  kind,
  section,
  text,
  children,
}: {
  kind: 'code' | 'term'
  /** The heading of the section the block belongs to. */
  section: string
  text: string
  children: ReactNode
}): ReactElement {
  const dict = useDictionary()
  const { copied, copy } = useCopy()
  const label = copied ? dict.t('copied') : dict.t('copy')
  return (
    <div className="fw-docs-block">
      <pre className={`fw-docs-pre fw-docs-${kind}`}>{children}</pre>
      <button type="button" className="fw-docs-copy" aria-label={`${label}: ${section}`} onClick={() => copy(text)}>
        {label}
      </button>
    </div>
  )
}
