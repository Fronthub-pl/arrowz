/**
 * The built-in themes, from `THEMES`: name, colours, the project each was
 * ported from and its licence — the attribution the element's README carries,
 * here with the colours themselves. No description column: a theme is its colours.
 */
import { THEMES } from '@fronthub/arrowz-engine'
import type { ReactElement } from 'react'
import { Mono } from './TokenSpans'
import { useDocs } from './useDocs'

export function ThemeTable({ labelledBy }: { labelledBy?: string | undefined }): ReactElement {
  const docs = useDocs()
  return (
    <div className="fw-docs-scroll">
      <table className="fw-docs-table" aria-labelledby={labelledBy}>
        <thead>
          <tr>
            <th scope="col">{docs.colTheme}</th>
            <th scope="col">{docs.colColours}</th>
            <th scope="col">{docs.colSource}</th>
            <th scope="col">{docs.colLicence}</th>
          </tr>
        </thead>
        <tbody>
          {Object.entries(THEMES).map(([name, theme]) => {
            const colours = [theme.paper, theme.ink, theme.highlight, ...theme.palette]
            return (
              <tr key={name}>
                <Mono text={name} column="slot" />
                <td>
                  {/* One image for a screen reader, named by its colours; the squares are its pixels. */}
                  <span className="fw-docs-swatches" role="img" aria-label={colours.join(', ')}>
                    {colours.map((colour, i) => (
                      <span key={i} className="fw-docs-swatch" style={{ background: colour }} />
                    ))}
                  </span>
                </td>
                <td>
                  <a href={theme.url} target="_blank" rel="noreferrer">
                    {theme.source}
                  </a>
                </td>
                <Mono text={theme.licence} column="slot" />
              </tr>
            )
          })}
        </tbody>
      </table>
    </div>
  )
}
