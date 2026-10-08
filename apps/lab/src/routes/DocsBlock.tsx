import type { ReactElement, ReactNode } from 'react'
import { useDictionary } from '../i18n'
import { useCopy } from '../run/useCopy'

/**
 * One block of a documentation page with its Copy button. The button comes
 * after the `pre` in the DOM and stands in a column of its own beside it
 * (`docs.css`), out of the box that scrolls, so it never covers a line.
 *
 * `text` is what Copy writes, `children` what the block shows: the example is
 * coloured spans, and the clipboard must get the code, not the markup.
 *
 * The name says what is copied — `Copy: Using it`, `Copy: Board.tsx` —
 * because a page has many of these buttons and "Copy" alone tells a screen
 * reader user nothing. It starts with the visible label, so speech input that
 * says "Copy" still reaches it. A block with a `file` shows the name over it.
 */
export function DocsBlock({
  kind,
  section,
  text,
  file,
  children,
}: {
  kind: 'code' | 'term'
  /** What the block is named after: its file, or its section (and tab). */
  section: string
  text: string
  file?: string | undefined
  children: ReactNode
}): ReactElement {
  const dict = useDictionary()
  const { copied, copy } = useCopy()
  const label = copied ? dict.t('copied') : dict.t('copy')
  return (
    <>
      {file === undefined ? null : <p className="fw-docs-file">{file}</p>}
      <div className="fw-docs-block">
        <pre className={`fw-docs-pre fw-docs-${kind}`}>{children}</pre>
        <button type="button" className="fw-docs-copy" aria-label={`${label}: ${section}`} onClick={() => copy(text)}>
          {label}
        </button>
      </div>
    </>
  )
}
