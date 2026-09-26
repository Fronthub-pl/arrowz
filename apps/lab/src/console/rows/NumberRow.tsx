import { PAD_RANGE, POINT_RADIUS_RANGE } from '@arrowz/board-element'
import type { ViewNumber } from '@arrowz/engine'
import { VIEW_RANGE } from '@arrowz/engine/command'
import { type ReactElement, useEffect, useRef } from 'react'
import { useDictionary } from '../../i18n'
import { useStore } from '../../state/store'
import { DraftNumber } from '../DraftNumber'
import { endText, KnobLine, KnobTrack, rowTitle, useKnobHelp } from '../KnobRow'
import { autoHeadWidth, VIEW_ROWS } from '../viewFields'

/**
 * One preview number as a knob row: the value, the bounds
 * `VIEW_RANGE` states (read here, never copied), the drawn track, and the
 * description on demand. A preview number is not a knob — the engine never
 * sees it — so it has no state line: nothing refuses it, it is clamped.
 * `headWidth`'s 0 is the automatic width: a chip in the minimum's track.
 */
export function ViewNumberRow({ field }: { field: ViewNumber }): ReactElement {
  const value = useStore((state) => state.view[field])
  const stroke = useStore((state) => state.view.stroke)
  const setNumber = useStore((state) => state.view.setNumber)
  // Through the slice's own reader, which clamps to `VIEW_RANGE`.
  return <NumberRow field={field} value={value} stroke={stroke} onSet={(next) => setNumber(field, String(next))} />
}

/**
 * The row itself, for any owner of a view: the lab's slice above, or a stored
 * board's meta on the saved boards. `onSet` is handed what
 * was typed or dragged; clamping is the owner's, as it is the slice's here.
 */
export function NumberRow({
  field,
  value,
  stroke,
  onSet,
}: {
  field: ViewNumber
  value: number
  /** The stroke the automatic head width is worked out from. */
  stroke: number
  onSet(next: number): void
}): ReactElement {
  const dict = useDictionary()
  const row = VIEW_ROWS[field]
  const range = VIEW_RANGE[field]
  const name = dict.t(row.short)
  const helpId = `view-${field}-help`
  const { button, paragraph } = useKnobHelp(helpId, name, dict.t(row.help))
  const isAuto = row.auto === true && value === 0
  // Where a released chip goes: the width this row held before, else the
  // width the automatic head draws now (`autoHeadWidth`). Recorded after the
  // render, not during it.
  const last = useRef<number | null>(null)
  useEffect(() => {
    if (!isAuto) last.current = value
  }, [value, isAuto])
  const release = () => onSet(last.current ?? autoHeadWidth(stroke, row.step, range.max))
  return (
    <div className="kv-row" title={rowTitle(dict, dict.t(row.label), range)}>
      <KnobLine
        label={
          <label className="kv-lab" htmlFor={`view-${field}`}>
            {name}
          </label>
        }
        help={button}
        value={
          <span className="kv-val">
            <DraftNumber
              label={name}
              value={value}
              word={isAuto ? 'auto' : null}
              wordOnly
              className="kv-num"
              describedBy={helpId}
              decimal={!range.whole}
              onCommit={onSet}
            />
            <span className="kv-unit">{isAuto ? '' : dict.d.units[row.unit]}</span>
          </span>
        }
        min={
          row.auto === true ? (
            <button
              type="button"
              className="kv-chip"
              aria-pressed={isAuto}
              aria-label={`auto (${name})`}
              onClick={() => (isAuto ? release() : onSet(0))}
            >
              auto
            </button>
          ) : (
            <span className="kv-end">{endText(dict, range.min)}</span>
          )
        }
        control={
          <KnobTrack
            id={`view-${field}`}
            value={value}
            bounds={range}
            step={row.step}
            word={isAuto ? 'auto' : null}
            describedBy={helpId}
            onCommit={onSet}
          />
        }
        max={<span className="kv-end">{endText(dict, range.max)}</span>}
      />
      {paragraph}
    </div>
  )
}

/**
 * A number row bounded by the element rather than the engine: the point
 * radius (`POINT_RADIUS_RANGE`) and the margin (`PAD_RANGE`) share this shape
 * and differ only in id, wording, range and step.
 */
function ElementNumberRow({
  id,
  name,
  help,
  label,
  value,
  range,
  step,
  onSet,
}: {
  id: string
  name: string
  help: string
  label: string
  value: number
  range: { min: number; max: number }
  step: number
  onSet(next: number): void
}): ReactElement {
  const dict = useDictionary()
  const helpId = `${id}-help`
  const { button, paragraph } = useKnobHelp(helpId, name, help)
  return (
    <div className="kv-row" title={rowTitle(dict, label, range)}>
      <KnobLine
        label={
          <label className="kv-lab" htmlFor={id}>
            {name}
          </label>
        }
        help={button}
        value={
          <span className="kv-val">
            <DraftNumber
              label={name}
              value={value}
              className="kv-num"
              describedBy={helpId}
              decimal={!Number.isInteger(step)}
              onCommit={onSet}
            />
            <span className="kv-unit">{dict.d.units.cells}</span>
          </span>
        }
        min={<span className="kv-end">{endText(dict, range.min)}</span>}
        control={
          <KnobTrack
            id={id}
            value={value}
            bounds={range}
            step={step}
            word={null}
            describedBy={helpId}
            onCommit={onSet}
          />
        }
        max={<span className="kv-end">{endText(dict, range.max)}</span>}
      />
      {paragraph}
    </div>
  )
}

/**
 * The point grid's dot radius: a number row like the others, bounded by the
 * element (`POINT_RADIUS_RANGE`) and clamped by the slice's own reader.
 */
export function PointRadiusRow(): ReactElement {
  const dict = useDictionary()
  const value = useStore((state) => state.view.pointRadius)
  const setPointRadius = useStore((state) => state.view.setPointRadius)
  return (
    <ElementNumberRow
      id="view-pointRadius"
      name={dict.t('viewShortPointRadius')}
      help={dict.t('pointRadiusHelp')}
      label={dict.t('pointRadiusLabel')}
      value={value}
      range={POINT_RADIUS_RANGE}
      // A keyboard convenience, not a claim about what is allowed.
      step={0.01}
      onSet={(next) => setPointRadius(String(next))}
    />
  )
}

/**
 * The margin around the board: a number row like the point radius, bounded
 * by the element (`PAD_RANGE`) and clamped and rounded by the slice's own
 * reader. Unlike the point radius it is a whole number of cells, step 1.
 */
export function PadRow(): ReactElement {
  const dict = useDictionary()
  const value = useStore((state) => state.view.pad)
  const setPad = useStore((state) => state.view.setPad)
  return (
    <ElementNumberRow
      id="view-pad"
      name={dict.t('viewShortPad')}
      help={dict.t('padHelp')}
      label={dict.t('padLabel')}
      value={value}
      range={PAD_RANGE}
      step={1}
      onSet={setPad}
    />
  )
}
