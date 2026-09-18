import { ELEMENT_EVENTS, ELEMENT_MEMBERS, ELEMENT_PROPS } from '@arrowz/engine/docs'
import type { ReactElement } from 'react'
import { useDocs } from '../docs/useDocs'

/** The dash a table cell shows where a property has no attribute at all. */
const NONE = '—'

/**
 * The element's API as three reference tables. The machine columns come from
 * the shared rows and are not translated; only the last column is. The long
 * explanations stay in the package README, which the lead paragraph points at:
 * this page is a reference, and a second copy of the prose would be a second
 * thing to keep true.
 *
 * The code example lives here rather than in the engine module: an example
 * naming the page's global objects would trip `neutral.test.ts`, which greps
 * the text of engine sources.
 */
export function ElementDocs(): ReactElement {
  const docs = useDocs()
  return (
    <>
      <h2>&lt;arrowz-board&gt;</h2>
      <p>{docs.elementLead}</p>

      <h3>{docs.headExample}</h3>
      <pre className="fw-docs-pre fw-docs-code">
        {`<arrowz-board id="board" interactive lang="pl" style="width: 100%; height: 80vh"></arrowz-board>
<script type="module">
  import '@arrowz/board-element'
  import { defaultParams, generate } from '@arrowz/engine'
  const el = document.getElementById('board')
  el.board = generate({ ...defaultParams(), W: 50, H: 50, seed: 7 }).board
  el.addEventListener('piece-click', (e) => console.log('piece', e.detail.pieceId))
</script>`}
      </pre>

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
              <td className="mono">{row.key}</td>
              <td className="mono">{row.type}</td>
              <td className="mono">{row.attribute ?? NONE}</td>
              <td className="mono">{row.def}</td>
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
              <td className="mono">{row.key}</td>
              <td className="mono">{row.signature}</td>
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
              <td className="mono">{row.key}</td>
              <td className="mono">{row.detail}</td>
              <td>{docs.events[row.key]}</td>
            </tr>
          ))}
        </tbody>
      </table>

      <p>{docs.readmePointer}</p>
    </>
  )
}
