import type { ReactElement, ReactNode } from 'react'
import { useKnobHelp } from '../console/KnobRow'

/**
 * One statistic: label and its `?`, value, change, and the help in a fourth
 * cell that spans the row's grid under it. A cell, not a row of its own, so
 * a row stays one `<tr>` for everything that counts them.
 */
export function StatRowView({
  id,
  label,
  value,
  help,
  className,
  delta,
}: {
  id: string
  label: string
  value: string
  help: string
  className: string | undefined
  delta: ReactNode
}): ReactElement {
  const { button, paragraph } = useKnobHelp(id, label, help)
  return (
    <tr className={className}>
      <th scope="row">
        <span className="st-lab">{label}</span>
        {button}
      </th>
      <td className="num">{value}</td>
      {delta}
      <td className="st-help">{paragraph}</td>
    </tr>
  )
}
