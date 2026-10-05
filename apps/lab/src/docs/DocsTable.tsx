import { ELEMENT_EVENTS, ELEMENT_MEMBERS, ELEMENT_PROPS, ELEMENT_SLOTS } from '@arrowz/engine/docs'
import type { ReactElement } from 'react'
import { useDictionary } from '../i18n'
import { docsPaletteRows } from '../palette/commands'
import { shownKeys } from '../shell/hotkeys'
import { useStore } from '../state/store'
import { LINK_FIELDS } from '../state/url'
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

/** A description by the key the code names; `tables.test.ts` fails first on a missing one. */
function described(rows: Readonly<Record<string, string>>, key: string): string {
  return Object.hasOwn(rows, key) ? (rows[key] ?? '') : ''
}

/**
 * One reference table, as `::table{of=…}` names it: the element's, from the
 * shared rows, or the lab's, from the lab's own code. The machine columns are
 * not translated; the last column is, and is inline Markdown. A name
 * `shape.ts` does not list renders nothing, and the content guard fails first.
 */
export function DocsTable({ of, labelledBy }: { of: string; labelledBy?: string | undefined }): ReactElement | null {
  const docs = useDocs()
  const dict = useDictionary()
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
  if (of === 'keys')
    return (
      <table className="fw-docs-table" aria-labelledby={labelledBy}>
        <thead>
          <tr>
            <th scope="col">{docs.colKey}</th>
            <th scope="col">{docs.colDescription}</th>
          </tr>
        </thead>
        <tbody>
          {shownKeys().map((key) => (
            <tr key={key}>
              <td className="mono">
                <kbd>{key}</kbd>
              </td>
              <td>
                <InlineMarkdown text={described(docs.keys, key)} />
              </td>
            </tr>
          ))}
        </tbody>
      </table>
    )
  if (of === 'palette')
    return (
      <table className="fw-docs-table" aria-labelledby={labelledBy}>
        <thead>
          <tr>
            <th scope="col">{docs.colCommand}</th>
            <th scope="col">{docs.colSection}</th>
            <th scope="col">{docs.colDescription}</th>
          </tr>
        </thead>
        <tbody>
          {/* Only the language reaches these rows (`docsPaletteRows` fixes the rest), and `dict` changes with it. */}
          {docsPaletteRows(dict, useStore.getState()).map((row) => (
            <tr key={row.id}>
              <td>{row.name}</td>
              <td>{row.note}</td>
              <td>
                <InlineMarkdown text={described(docs.palette, row.id)} />
              </td>
            </tr>
          ))}
        </tbody>
      </table>
    )
  if (of === 'link-fields')
    return (
      <table className="fw-docs-table" aria-labelledby={labelledBy}>
        <thead>
          <tr>
            <th scope="col">{docs.colField}</th>
            <th scope="col">{docs.colDescription}</th>
          </tr>
        </thead>
        <tbody>
          {LINK_FIELDS.map((field) => (
            <tr key={field}>
              <Mono text={field} column="prop" />
              <td>
                <InlineMarkdown text={described(docs.linkFields, field)} />
              </td>
            </tr>
          ))}
        </tbody>
      </table>
    )
  return null
}
