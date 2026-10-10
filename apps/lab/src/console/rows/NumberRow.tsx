import { PAD_RANGE, POINT_RADIUS_RANGE } from '@fronthub/arrowz-board'
import type { ViewNumber } from '@fronthub/arrowz-engine'
import { VIEW_RANGE } from '@fronthub/arrowz-engine/command'
import type { ReactElement } from 'react'
import { useDictionary } from '../../i18n'
import { useStore } from '../../state/store'
import { DraftNumber } from '../DraftNumber'
import { endText, KnobTrack, rowTitle } from '../KnobRow'
import { autoHeadChip, VIEW_ROWS } from '../viewFields'
import { RowShell, rowIds } from './RowShell'
import { useReleasableChip } from './useReleasableChip'

/**
 * A number as a knob row, for any owner and any bounds: the value, the range
 * (read by the caller, never copied here), the drawn track and the description
 * on demand. `onSet` gets what was typed or dragged; clamping is the owner's.
 * With `auto`, 0 is the automatic value: a chip in the minimum's track.
 */
export function NumberRow({
  id,
  name,
  title,
  help,
  value,
  range,
  step,
  unit,
  auto,
  onSet,
}: {
  id: string
  name: string
  title: string
  help: string
  value: number
  range: { min: number; max: number }
  step: number
  /** The unit's text, already in the page's language. */
  unit: string
  /** Where a released `auto` chip goes. */
  auto?: (() => number) | undefined
  onSet(next: number): void
}): ReactElement {
  const dict = useDictionary()
  const isAuto = auto !== undefined && value === 0
  const release = useReleasableChip(value, isAuto, () => (auto === undefined ? range.min : auto()))
  const helpId = rowIds(id).help
  const word = isAuto ? 'auto' : null
  return (
    <RowShell
      id={id}
      name={name}
      helpText={help}
      labelAs="for"
      title={title}
      value={
        <span className="kv-val">
          <DraftNumber
            entryId={rowIds(id).entry}
            label={name}
            value={value}
            word={word}
            wordOnly
            className="kv-num"
            describedBy={helpId}
            decimal={!Number.isInteger(step)}
            onCommit={onSet}
          />
          <span className="kv-unit">{isAuto ? '' : unit}</span>
        </span>
      }
      min={
        auto === undefined ? (
          <span className="kv-end">{endText(dict, range.min)}</span>
        ) : (
          <button
            type="button"
            className="kv-chip"
            aria-pressed={isAuto}
            aria-label={`auto (${name})`}
            onClick={() => onSet(isAuto ? release() : 0)}
          >
            auto
          </button>
        )
      }
      control={
        <KnobTrack id={id} value={value} bounds={range} step={step} word={word} describedBy={helpId} onCommit={onSet} />
      }
      max={<span className="kv-end">{endText(dict, range.max)}</span>}
    />
  )
}

/**
 * A view number from `VIEW_ROWS`, for any owner of a view: the lab's slice
 * (`ViewNumberRow`) or a stored board's meta on the saved boards.
 */
export function FieldNumberRow({
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
  return (
    <NumberRow
      id={`view-${field}`}
      name={dict.t(row.short)}
      title={rowTitle(dict, dict.t(row.label), range)}
      help={dict.t(row.help)}
      value={value}
      range={range}
      step={row.step}
      unit={dict.d.units[row.unit]}
      auto={row.auto === true ? () => autoHeadChip(stroke, row.step, range.max) : undefined}
      onSet={onSet}
    />
  )
}

/** A view number bound to the lab's slice, whose reader clamps to `VIEW_RANGE`. */
export function ViewNumberRow({ field }: { field: ViewNumber }): ReactElement {
  const value = useStore((state) => state.view[field])
  const stroke = useStore((state) => state.view.stroke)
  const setNumber = useStore((state) => state.view.setNumber)
  return <FieldNumberRow field={field} value={value} stroke={stroke} onSet={(next) => setNumber(field, String(next))} />
}

/** The point grid's dot radius, bounded by the element (`POINT_RADIUS_RANGE`). */
export function PointRadiusRow(): ReactElement {
  const dict = useDictionary()
  const value = useStore((state) => state.view.pointRadius)
  const setPointRadius = useStore((state) => state.view.setPointRadius)
  return (
    <NumberRow
      id="view-pointRadius"
      name={dict.t('viewShortPointRadius')}
      title={rowTitle(dict, dict.t('pointRadiusLabel'), POINT_RADIUS_RANGE)}
      help={dict.t('pointRadiusHelp')}
      value={value}
      range={POINT_RADIUS_RANGE}
      // A keyboard convenience, not a claim about what is allowed.
      step={0.01}
      unit={dict.d.units.cells}
      onSet={(next) => setPointRadius(String(next))}
    />
  )
}

/** The margin around the board, bounded by the element (`PAD_RANGE`), in whole cells. */
export function PadRow(): ReactElement {
  const dict = useDictionary()
  const value = useStore((state) => state.view.pad)
  const setPad = useStore((state) => state.view.setPad)
  return (
    <NumberRow
      id="view-pad"
      name={dict.t('viewShortPad')}
      title={rowTitle(dict, dict.t('padLabel'), PAD_RANGE)}
      help={dict.t('padHelp')}
      value={value}
      range={PAD_RANGE}
      step={1}
      unit={dict.d.units.cells}
      onSet={setPad}
    />
  )
}
