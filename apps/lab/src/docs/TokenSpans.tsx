import type { ReactElement } from 'react'
import { type CellRole, type CodeToken, cellTokens } from './codeTokens'

/**
 * Tokens as the page shows them: a coloured run is `span.tk-<class>`, plain
 * text stays a text node. The key is the position — a token may repeat, its
 * place may not — and the list is fixed for the life of the page.
 */
export function TokenSpans({ tokens }: { tokens: readonly CodeToken[] }): ReactElement {
  return (
    <>
      {tokens.map((token, i) =>
        token.cls === null ? (
          token.text
        ) : (
          <span key={i} className={`tk-${token.cls}`}>
            {token.text}
          </span>
        ),
      )}
    </>
  )
}

/** A machine cell in the code colours; the column says what its text is. `wrap` lets a long value break. */
export function Mono({ text, column, wrap = false }: { text: string; column: CellRole; wrap?: boolean }): ReactElement {
  return (
    <td className={wrap ? 'mono fw-docs-wrap' : 'mono'}>
      <TokenSpans tokens={cellTokens(text, column)} />
    </td>
  )
}
