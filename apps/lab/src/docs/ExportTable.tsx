/**
 * The element package's export tables: types, functions, constants and
 * classes. The rows are `lab-docs.ts`'s, which the package's README guard
 * holds to its `mod.ts` both ways; a constant's value is read from the package
 * itself and spelled as its README spells it, so the page cannot drift from it.
 */
import * as boardElement from '@arrowz/board-element'
import {
  type ConstantKey,
  ELEMENT_CLASSES,
  ELEMENT_CONSTANTS,
  ELEMENT_FUNCTIONS,
  ELEMENT_TYPES,
  spellValue,
} from '@arrowz/engine/docs'
import type { ReactElement, ReactNode } from 'react'
import { NONE } from './codeTokens'
import type { ExportOf } from './exportTables'
import { InlineMarkdown } from './Inline'
import { Mono } from './TokenSpans'
import { useDocs } from './useDocs'

// The compiler holds every row to an export: a key the package does not export is a type error here.
const VALUES: Readonly<Record<ConstantKey, unknown>> = boardElement

/** Four columns at most, two of them long code: on a phone each table scrolls by itself. */
function Frame({
  labelledBy,
  head,
  children,
}: {
  labelledBy?: string | undefined
  head: readonly string[]
  children: ReactNode
}) {
  return (
    <div className="fw-docs-scroll">
      <table className="fw-docs-table" aria-labelledby={labelledBy}>
        <thead>
          <tr>
            {head.map((name) => (
              <th key={name} scope="col">
                {name}
              </th>
            ))}
          </tr>
        </thead>
        <tbody>{children}</tbody>
      </table>
    </div>
  )
}

export function ExportTable({ of, labelledBy }: { of: ExportOf; labelledBy?: string | undefined }): ReactElement {
  const docs = useDocs()
  if (of === 'element-types')
    return (
      <Frame labelledBy={labelledBy} head={[docs.colType, docs.colFrom, docs.colShape, docs.colDescription]}>
        {ELEMENT_TYPES.map((row) => (
          <tr key={row.key}>
            <Mono text={row.key} column="type" />
            <Mono text={row.from} column="expr" />
            <Mono text={row.shape} column="expr" wrap />
            <td>
              <InlineMarkdown text={docs.types[row.key]} />
            </td>
          </tr>
        ))}
      </Frame>
    )
  if (of === 'element-functions')
    return (
      <Frame labelledBy={labelledBy} head={[docs.colFunction, docs.colSignature, docs.colDescription]}>
        {ELEMENT_FUNCTIONS.map((row) => (
          <tr key={row.key}>
            <Mono text={row.key} column="method" />
            <Mono text={row.signature} column="sig" wrap />
            <td>
              <InlineMarkdown text={docs.functions[row.key]} />
            </td>
          </tr>
        ))}
      </Frame>
    )
  if (of === 'element-constants')
    return (
      <Frame labelledBy={labelledBy} head={[docs.colConstant, docs.colValue, docs.colDescription]}>
        {ELEMENT_CONSTANTS.map((row) => (
          <tr key={row.key}>
            <Mono text={row.key} column="type" />
            <Mono text={spellValue(VALUES[row.key])} column="expr" wrap />
            <td>
              <InlineMarkdown text={docs.constants[row.key]} />
            </td>
          </tr>
        ))}
      </Frame>
    )
  return (
    <Frame labelledBy={labelledBy} head={[docs.colClass, docs.colCreate, docs.colMembers, docs.colDescription]}>
      {ELEMENT_CLASSES.map((row) => (
        <tr key={row.key}>
          <Mono text={row.key} column="type" />
          <Mono text={row.create} column="sig" />
          <Mono text={row.members.length === 0 ? NONE : row.members.join(', ')} column="method" wrap />
          <td>
            <InlineMarkdown text={docs.classes[row.key]} />
          </td>
        </tr>
      ))}
    </Frame>
  )
}
