import { helpText } from '@arrowz/engine/command'
import type { ReactElement } from 'react'
import { useDocs } from '../docs/useDocs'
import { DocsBlock } from './DocsBlock'

/**
 * The CLI's help, called rather than generated. `helpText()` is a pure string
 * builder over PARAM_SPEC, which this bundle already carries, so the page
 * cannot drift from the knobs it documents — there is no copy to go stale, and
 * nothing to regenerate at build time.
 *
 * Both forms are shown: the everyday block and the full knob table. The text
 * itself stays the terminal's own English, uncoloured; the frame around it is
 * translated. The headings' ids are the navigation column's targets
 * (DocsNav.tsx).
 */
export function CliDocs(): ReactElement {
  const docs = useDocs()
  const short = helpText()
  const knobs = helpText({ knobs: true })
  return (
    <>
      <h2>deno task carve</h2>
      <p>{docs.cliLead}</p>
      <p>{docs.cliEnglishNote}</p>

      <h3 id="docs-short">{docs.cliShortHead}</h3>
      <DocsBlock kind="term" section={docs.cliShortHead} text={short}>
        {short}
      </DocsBlock>

      <h3 id="docs-knobs">{docs.cliKnobsHead}</h3>
      <DocsBlock kind="term" section={docs.cliKnobsHead} text={knobs}>
        {knobs}
      </DocsBlock>
    </>
  )
}
