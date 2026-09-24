import { ELEMENT_EVENTS, ELEMENT_MEMBERS, ELEMENT_PROPS } from '@arrowz/engine/docs'
import type { ReactElement } from 'react'
import { TokenSpans } from '../docs/TokenSpans'
import { type CellRole, cellTokens, highlightHtml } from '../docs/codeTokens'
import { ELEMENT_EXAMPLE } from '../docs/elementExample'
import { useDocs } from '../docs/useDocs'
import { DocsBlock } from './DocsBlock'

/** The dash a table cell shows where a property has no attribute at all. */
const NONE = '—'

/** Scanned once: the example is fixed for the life of the page. */
const EXAMPLE_TOKENS = highlightHtml(ELEMENT_EXAMPLE)

/** A machine cell in the example's colours; the column says what its text is. */
function Mono({ text, column }: { text: string; column: CellRole }): ReactElement {
  return (
    <td className="mono">
      <TokenSpans tokens={cellTokens(text, column)} />
    </td>
  )
}

/** The note's mark, a drawn info glyph. Decoration only: the note is named by its `aside`. */
function InfoIcon(): ReactElement {
  return (
    <svg className="i" viewBox="0 0 16 16" aria-hidden="true" focusable="false">
      <circle cx="8" cy="8" r="6.25" />
      <path d="M8 7.25v4" />
      <circle cx="8" cy="4.9" r="0.9" fill="currentColor" stroke="none" />
    </svg>
  )
}

/**
 * The element's API as three reference tables. The machine columns come from
 * the shared rows and are not translated; only the last column is. The long
 * explanations stay in the package README, which the note under the lead
 * points at: this page is a reference, and a second copy of the prose would be
 * a second thing to keep true.
 *
 * Every `h3` has an id: the navigation column lists them and scrolls the panel
 * to them, and each table is named by its own.
 */
export function ElementDocs(): ReactElement {
  const docs = useDocs()
  return (
    <>
      <h2>&lt;arrowz-board&gt;</h2>
      <p>{docs.elementLead}</p>
      <aside className="fw-docs-info" aria-label={docs.infoLabel}>
        <InfoIcon />
        <p>{docs.readmePointer}</p>
      </aside>

      <h3 id="docs-example">{docs.headExample}</h3>
      <DocsBlock kind="code" section={docs.headExample} text={ELEMENT_EXAMPLE}>
        <code>
          <TokenSpans tokens={EXAMPLE_TOKENS} />
        </code>
      </DocsBlock>

      <h3 id="docs-props">{docs.headProps}</h3>
      <table className="fw-docs-table" aria-labelledby="docs-props">
        <thead>
          <tr>
            <th scope="col">{docs.colProp}</th>
            <th scope="col">{docs.colType}</th>
            <th scope="col">{docs.colAttr}</th>
            <th scope="col">{docs.colDefault}</th>
            <th scope="col">{docs.colDescription}</th>
          </tr>
        </thead>
        <tbody>
          {ELEMENT_PROPS.map((row) => (
            <tr key={row.key}>
              <Mono text={row.key} column="prop" />
              <Mono text={row.type} column="type" />
              <Mono text={row.attribute ?? NONE} column="attr" />
              <Mono text={row.def} column="expr" />
              <td>{docs.props[row.key]}</td>
            </tr>
          ))}
        </tbody>
      </table>

      <h3 id="docs-members">{docs.headMembers}</h3>
      <table className="fw-docs-table" aria-labelledby="docs-members">
        <thead>
          <tr>
            <th scope="col">{docs.colMember}</th>
            <th scope="col">{docs.colSignature}</th>
            <th scope="col">{docs.colDescription}</th>
          </tr>
        </thead>
        <tbody>
          {ELEMENT_MEMBERS.map((row) => (
            <tr key={row.key}>
              {/* A getter's signature is its type; a method's names itself. */}
              <Mono text={row.key} column={row.kind === 'getter' ? 'prop' : 'method'} />
              <Mono text={row.signature} column={row.kind === 'getter' ? 'type' : 'sig'} />
              <td>{docs.members[row.key]}</td>
            </tr>
          ))}
        </tbody>
      </table>

      <h3 id="docs-events">{docs.headEvents}</h3>
      <table className="fw-docs-table" aria-labelledby="docs-events">
        <thead>
          <tr>
            <th scope="col">{docs.colEvent}</th>
            <th scope="col">{docs.colDetail}</th>
            <th scope="col">{docs.colDescription}</th>
          </tr>
        </thead>
        <tbody>
          {ELEMENT_EVENTS.map((row) => (
            <tr key={row.key}>
              <Mono text={row.key} column="event" />
              <Mono text={row.detail} column="expr" />
              <td>{docs.events[row.key]}</td>
            </tr>
          ))}
        </tbody>
      </table>
    </>
  )
}
