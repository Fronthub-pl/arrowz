import { ELEMENT_EVENTS, ELEMENT_MEMBERS, ELEMENT_PROPS, ELEMENT_SLOTS } from '@arrowz/engine/docs'
import type { ReactElement } from 'react'
import { type CellRole, cellTokens } from './codeTokens'
import { InlineMarkdown } from './Inline'
import { TokenSpans } from './TokenSpans'
import { useDocs } from './useDocs'

/** The dash a table cell shows where a property has no attribute at all. */
const NONE = '—'

/** A machine cell in the code colours; the column says what its text is. */
function Mono({ text, column }: { text: string; column: CellRole }): ReactElement {
  return (
    <td className="mono">
      <TokenSpans tokens={cellTokens(text, column)} />
    </td>
  )
}

/**
 * One reference table of `<arrowz-board>`, as `::table{of=…}` names it. The
 * machine columns come from the shared rows and are not translated; the last
 * column is, and is inline Markdown. A name `shape.ts` does not list renders
 * nothing, and the content guard fails first.
 */
export function DocsTable({ of, labelledBy }: { of: string; labelledBy?: string | undefined }): ReactElement | null {
  const docs = useDocs()
  if (of === 'element-props')
    return (
      <table className="fw-docs-table" aria-labelledby={labelledBy}>
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
              <td>
                <InlineMarkdown text={docs.props[row.key]} />
              </td>
            </tr>
          ))}
        </tbody>
      </table>
    )
  if (of === 'element-members')
    return (
      <table className="fw-docs-table" aria-labelledby={labelledBy}>
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
              <td>
                <InlineMarkdown text={docs.members[row.key]} />
              </td>
            </tr>
          ))}
        </tbody>
      </table>
    )
  if (of === 'element-events')
    return (
      <table className="fw-docs-table" aria-labelledby={labelledBy}>
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
              <td>
                <InlineMarkdown text={docs.events[row.key]} />
              </td>
            </tr>
          ))}
        </tbody>
      </table>
    )
  if (of === 'element-slots')
    return (
      <table className="fw-docs-table" aria-labelledby={labelledBy}>
        <thead>
          <tr>
            <th scope="col">{docs.colSlot}</th>
            <th scope="col">{docs.colDescription}</th>
          </tr>
        </thead>
        <tbody>
          {ELEMENT_SLOTS.map((row) => (
            <tr key={row.key}>
              <Mono text={row.key} column="slot" />
              <td>
                <InlineMarkdown text={docs.slots[row.key]} />
              </td>
            </tr>
          ))}
        </tbody>
      </table>
    )
  return null
}
