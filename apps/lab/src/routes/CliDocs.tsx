import { helpText } from '@arrowz/engine/command'
import type { ReactElement } from 'react'
import { useDocs } from '../docs/useDocs'

/**
 * The CLI's help, called rather than generated. `helpText()` is a pure string
 * builder over PARAM_SPEC, which this bundle already carries, so the page
 * cannot drift from the knobs it documents — there is no copy to go stale, and
 * nothing to regenerate at build time.
 *
 * Both forms are shown: the everyday block and the full knob table. The text
 * itself stays the terminal's own English; the frame around it is translated.
 */
export function CliDocs(): ReactElement {
  const docs = useDocs()
  return (
    <>
      <h2>deno task carve</h2>
      <p>{docs.cliLead}</p>
      <p>{docs.cliEnglishNote}</p>

      <h3>{docs.cliShortHead}</h3>
      <pre className="fw-docs-pre fw-docs-term">{helpText()}</pre>

      <h3>{docs.cliKnobsHead}</h3>
      <pre className="fw-docs-pre fw-docs-term">{helpText({ knobs: true })}</pre>
    </>
  )
}
