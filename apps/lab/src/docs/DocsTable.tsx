import { PARAM_SPEC } from '@arrowz/engine'
import { ENV_VARS, flagOf, KNOB_ROWS, type KnobRow, RULE_ROWS } from '@arrowz/engine/command'
import { ELEMENT_EVENTS, ELEMENT_MEMBERS, ELEMENT_PROPS, ELEMENT_SLOTS } from '@arrowz/engine/docs'
import type { Dict } from '@arrowz/engine/i18n'
import type { ReactElement } from 'react'
import { useDictionary } from '../i18n'
import { docsPaletteRows } from '../palette/commands'
import { shownKeys } from '../shell/hotkeys'
import { useStore } from '../state/store'
import { LINK_FIELDS } from '../state/url'
import { NONE } from './codeTokens'
import { ExportTable } from './ExportTable'
import { isExportOf } from './exportTables'
import { InlineMarkdown } from './Inline'
import { ThemeTable } from './ThemeTable'
import { Mono } from './TokenSpans'
import { useDocs } from './useDocs'

/** A description by the key the code names; `tables.test.ts` fails first on a missing one. */
function described(rows: Readonly<Record<string, string>>, key: string): string {
  return Object.hasOwn(rows, key) ? (rows[key] ?? '') : ''
}

/**
 * A knob row's description: the help the lab shows for that knob, in the
 * page's language. `--start` stands for two knobs, so it reads the start help.
 */
export function knobHelp(dict: Dict, row: KnobRow): string {
  if (row.flag === '--start') return dict.d.start.help
  const spec = PARAM_SPEC.find((s) => flagOf(s.key) === row.flag)
  return spec === undefined ? row.help : dict.paramText(spec).help
}

/**
 * One reference table, as `::table{of=…}` names it: the element's, from the
 * shared rows, the CLI's, from the command line's own tables, the lab's,
 * from the lab's own code, or the engine's `THEMES`. The machine columns are
 * not translated; where a table has a description column it is, and is inline Markdown. A name
 * `shape.ts` does not list renders nothing, and the content guard fails first.
 */
export function DocsTable({ of, labelledBy }: { of: string; labelledBy?: string | undefined }): ReactElement | null {
  const docs = useDocs()
  const dict = useDictionary()
  if (isExportOf(of)) return <ExportTable of={of} labelledBy={labelledBy} />
  if (of === 'themes') return <ThemeTable labelledBy={labelledBy} />
  const table = tableOf(of, labelledBy, docs, dict)
  // The wide tables would push a phone's panel sideways, so every table gets the box that scrolls instead.
  return table === null ? null : <div className="fw-docs-scroll">{table}</div>
}

function tableOf(
  of: string,
  labelledBy: string | undefined,
  docs: ReturnType<typeof useDocs>,
  dict: Dict,
): ReactElement | null {
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
  if (of === 'knobs')
    return (
      <table className="fw-docs-table" aria-labelledby={labelledBy}>
        <thead>
          <tr>
            <th scope="col">{docs.colGroup}</th>
            <th scope="col">{docs.colFlag}</th>
            <th scope="col">{docs.colRange}</th>
            <th scope="col">{docs.colStep}</th>
            <th scope="col">{docs.colDefault}</th>
            <th scope="col">{docs.colDescription}</th>
          </tr>
        </thead>
        <tbody>
          {KNOB_ROWS.map((row) => (
            <tr key={row.flag}>
              <td>{dict.d.groups[row.group]}</td>
              <Mono text={row.flag} column="attr" />
              <Mono text={row.values} column="expr" />
              <Mono text={row.step} column="expr" />
              <Mono text={row.def} column="expr" />
              <td>
                <InlineMarkdown text={knobHelp(dict, row)} />
              </td>
            </tr>
          ))}
        </tbody>
      </table>
    )
  if (of === 'rules')
    return (
      <table className="fw-docs-table" aria-labelledby={labelledBy}>
        <thead>
          <tr>
            <th scope="col">{docs.colFlags}</th>
            <th scope="col">{docs.colDescription}</th>
          </tr>
        </thead>
        <tbody>
          {RULE_ROWS.map((row) => (
            <tr key={row.key}>
              <Mono text={row.flags.join(', ')} column="attr" />
              <td>
                <InlineMarkdown text={dict.reason(row.key)} />
              </td>
            </tr>
          ))}
        </tbody>
      </table>
    )
  if (of === 'env')
    return (
      <table className="fw-docs-table" aria-labelledby={labelledBy}>
        <thead>
          <tr>
            <th scope="col">{docs.colVariable}</th>
            <th scope="col">{docs.colDescription}</th>
          </tr>
        </thead>
        <tbody>
          {ENV_VARS.map((v) => (
            <tr key={v.name}>
              <Mono text={v.name} column="type" />
              <td>
                <InlineMarkdown text={docs.env[v.name]} />
              </td>
            </tr>
          ))}
        </tbody>
      </table>
    )
  return null
}
