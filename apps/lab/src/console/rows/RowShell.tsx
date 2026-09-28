import type { ComponentProps, ReactElement, ReactNode } from 'react'
import { KnobLine, useKnobHelp } from '../KnobRow'

/** Every id a row's parts carry, from the row's own id: the one place they are spelled. */
export function rowIds(id: string) {
  return { help: `${id}-help`, label: `${id}-label`, why: `${id}-why`, ends: `${id}-ends`, entry: `${id}-entry` }
}

/**
 * The frame every knob row shares: the `kv-row` element, the label — a
 * `<label>` for a native control, a named `<span>` for a switch, a segmented
 * control or a list — the `?` with its description, and `KnobLine`'s tracks.
 * `after` sits between the line and the description: a knob's state line, the
 * theme's swatches. The caller names the control's own ids through `rowIds`.
 */
export function RowShell({
  id,
  name,
  helpText,
  labelAs,
  title,
  choice = false,
  bad = false,
  off = false,
  after = null,
  ...line
}: {
  id: string
  name: string
  helpText: string
  labelAs: 'for' | 'span'
  title?: string | undefined
  choice?: boolean | undefined
  bad?: boolean | undefined
  off?: boolean | undefined
  after?: ReactNode
} & Omit<ComponentProps<typeof KnobLine>, 'label' | 'help'>): ReactElement {
  const ids = rowIds(id)
  const { button, paragraph } = useKnobHelp(ids.help, name, helpText)
  const label =
    labelAs === 'for' ? (
      <label className="kv-lab" htmlFor={id}>
        {name}
      </label>
    ) : (
      <span className="kv-lab" id={ids.label}>
        {name}
      </span>
    )
  return (
    <div className={`kv-row${choice ? ' choice' : ''}${bad ? ' bad' : ''}${off ? ' off' : ''}`} title={title}>
      <KnobLine label={label} help={button} {...line} />
      {after}
      {paragraph}
    </div>
  )
}
