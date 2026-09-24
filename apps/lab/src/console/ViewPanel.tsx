import { DEFAULT_VIEW, PAD_RANGE, POINT_RADIUS_RANGE, THEMES, themeOf } from '@arrowz/board-element'
import type { ViewNumber } from '@arrowz/engine'
import { VIEW_RANGE } from '@arrowz/engine/command'
import { type ReactElement, type ReactNode, useEffect, useRef } from 'react'
import { useDictionary } from '../i18n'
import { useStore } from '../state/store'
import { PALETTE_CAP, type ViewFlag } from '../state/view.slice'
import { DraftNumber } from './DraftNumber'
import { panelId, tabId } from './GroupRail'
import { CollapsibleBlock, endText, KnobLine, KnobTrack, rowTitle, useKnobHelp } from './KnobRow'
import { autoHeadWidth, FLAG_ROWS, VIEW_FIELDS, VIEW_FLAGS, VIEW_ROWS, type ViewField } from './viewFields'

/**
 * The chosen theme's arrow colours, in order, on the theme's own paper, so a
 * colour that would vanish against that paper shows it. Renders nothing for
 * `''` (no theme). `aria-hidden`: the `<select>` beside it already names the
 * theme, and a hex value read out names nothing anyone would ask for.
 */
function ThemeSwatchStrip({ themeName }: { themeName: string }) {
  const theme = themeOf(themeName)
  if (!theme) return null
  return (
    <div className="fw-swatches" aria-hidden="true" style={{ backgroundColor: theme.paper }}>
      {theme.palette.map((color, index) => (
        // The palette can repeat a colour or, for the two single-arrow
        // themes, hold just one: the index is the only stable key a static,
        // never-reordered array offers.
        <span key={index} className="fw-swatch" style={{ backgroundColor: color }} />
      ))}
    </div>
  )
}

/**
 * One preview number as a knob row: the value, the bounds
 * `VIEW_RANGE` states (read here, never copied), the drawn track, and the
 * description on demand. A preview number is not a knob — the engine never
 * sees it — so it has no state line: nothing refuses it, it is clamped.
 * `headWidth`'s 0 is the automatic width: a chip in the minimum's track.
 */
export function ViewNumberRow({ field }: { field: ViewField }): ReactElement {
  const value = useStore((state) => state.view[field.field])
  const stroke = useStore((state) => state.view.stroke)
  const setNumber = useStore((state) => state.view.setNumber)
  // Through the slice's own reader, which clamps to `VIEW_RANGE`.
  return (
    <NumberRow field={field} value={value} stroke={stroke} onSet={(next) => setNumber(field.field, String(next))} />
  )
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
  field: ViewField
  value: number
  /** The stroke the automatic head width is worked out from. */
  stroke: number
  onSet(next: number): void
}): ReactElement {
  const dict = useDictionary()
  const row = VIEW_ROWS[field.field]
  const range = VIEW_RANGE[field.field]
  const name = dict.t(row.short)
  const helpId = `view-${field.field}-help`
  const { button, paragraph } = useKnobHelp(helpId, name, dict.t(row.help))
  const isAuto = row.auto === true && value === 0
  // Where a released chip goes: the width this row held before, else the
  // width the automatic head draws now (`autoHeadWidth`). Recorded after the
  // render, not during it.
  const last = useRef<number | null>(null)
  useEffect(() => {
    if (!isAuto) last.current = value
  }, [value, isAuto])
  const release = () => onSet(last.current ?? autoHeadWidth(stroke, field.step, range.max))
  return (
    <div className="kv-row" title={rowTitle(dict, dict.t(field.label), range)}>
      <KnobLine
        label={
          <label className="kv-lab" htmlFor={`view-${field.field}`}>
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
              onCommit={onSet}
            />
            <span className="kv-unit">{isAuto || row.unit === undefined ? '' : dict.d.units[row.unit]}</span>
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
            id={`view-${field.field}`}
            value={value}
            bounds={range}
            step={field.step}
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
            <DraftNumber label={name} value={value} className="kv-num" describedBy={helpId} onCommit={onSet} />
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
function PointRadiusRow(): ReactElement {
  const dict = useDictionary()
  const value = useStore((state) => state.view.pointRadius)
  const setPointRadius = useStore((state) => state.view.setPointRadius)
  return (
    <ElementNumberRow
      id="view-point-radius"
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
function PadRow(): ReactElement {
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

/**
 * A preview flag as a knob row: its value (`on` / `off`) in the value track,
 * in the numbers' colour, and the switch at the control track's right edge.
 */
export function SwitchRow({ flag }: { flag: ViewFlag }): ReactElement {
  const on = useStore((state) => state.view[flag])
  const toggle = useStore((state) => state.view.toggle)
  return <FlagRow flag={flag} on={on} onToggle={() => toggle(flag)} />
}

/** The switch row itself, for any owner of a view, as `NumberRow` is. */
export function FlagRow({ flag, on, onToggle }: { flag: ViewFlag; on: boolean; onToggle(): void }): ReactElement {
  const dict = useDictionary()
  const row = FLAG_ROWS[flag]
  const name = dict.t(row.short)
  const helpId = `view-${flag}-help`
  const { button, paragraph } = useKnobHelp(helpId, name, dict.t(row.help))
  const full = VIEW_FLAGS.find((f) => f.flag === flag)?.label
  return (
    <div className="kv-row" title={full === undefined ? name : dict.t(full)}>
      <KnobLine
        label={
          <span className="kv-lab" id={`view-${flag}-label`}>
            {name}
          </span>
        }
        help={button}
        value={<span className="kv-unit">{dict.t(on ? 'valueOn' : 'valueOff')}</span>}
        control={
          <button
            type="button"
            id={`view-${flag}`}
            className="fw-sw"
            role="switch"
            aria-checked={on}
            aria-labelledby={`view-${flag}-label`}
            aria-describedby={helpId}
            onClick={onToggle}
          />
        }
      />
      {paragraph}
    </div>
  )
}

/**
 * One colour as a row: its hex in the value track, the colour input at the
 * control track's right edge, and — where the empty value means something —
 * the clear button before it: paper and ink use it to hand the field back to
 * the theme, which a colour input has no way to express on its own.
 */
function ColourRow({
  id,
  short,
  help,
  title,
  value,
  onChange,
  onClear,
  clearLabel,
}: {
  id: string
  short: string
  help: string
  title: string
  value: string
  onChange(color: string): void
  onClear?: (() => void) | undefined
  clearLabel?: string | undefined
}): ReactElement {
  const helpId = `${id}-help`
  const { button, paragraph } = useKnobHelp(helpId, short, help)
  return (
    <div className="kv-row" title={title}>
      <KnobLine
        label={
          <label className="kv-lab" htmlFor={id}>
            {short}
          </label>
        }
        help={button}
        value={<span className="kv-unit">{value}</span>}
        control={
          <span className="kv-colour">
            {onClear === undefined ? null : (
              <button type="button" className="fw-palette-remove" aria-label={clearLabel} onClick={onClear}>
                ×
              </button>
            )}
            <input
              id={id}
              type="color"
              value={value}
              aria-describedby={helpId}
              onChange={(e) => onChange(e.target.value)}
            />
          </span>
        }
      />
      {paragraph}
    </div>
  )
}

/**
 * The theme as a row: the select in the control track, the chosen theme's
 * strip under it. The simple view's preview section shows it too.
 */
export function ThemeRow(): ReactElement {
  const dict = useDictionary()
  const theme = useStore((state) => state.view.theme)
  const setTheme = useStore((state) => state.view.setTheme)
  const name = dict.t('viewShortTheme')
  const helpId = 'view-theme-help'
  const { button, paragraph } = useKnobHelp(helpId, name, dict.t('themeHelp'))
  return (
    <div className="kv-row" title={dict.t('themeLabel')}>
      <KnobLine
        label={
          <label className="kv-lab" htmlFor="view-theme">
            {name}
          </label>
        }
        help={button}
        control={
          <select id="view-theme" value={theme} aria-describedby={helpId} onChange={(e) => setTheme(e.target.value)}>
            <option value="">{dict.t('viewThemeNone')}</option>
            {Object.keys(THEMES).map((themeName) => (
              <option key={themeName} value={themeName}>
                {themeName}
              </option>
            ))}
          </select>
        }
      />
      <ThemeSwatchStrip themeName={theme} />
      {paragraph}
    </div>
  )
}

/**
 * The editable custom palette as a row: its count against the cap in the value
 * track, its colours and the add button across the minimum's and the
 * control's tracks. The cap lives in the store (`paletteUpdate`), so nothing
 * here can bypass it.
 */
function PaletteRow(): ReactElement {
  const dict = useDictionary()
  const palette = useStore((state) => state.view.palette)
  const addPaletteColor = useStore((state) => state.view.addPaletteColor)
  const setPaletteColor = useStore((state) => state.view.setPaletteColor)
  const removePaletteColor = useStore((state) => state.view.removePaletteColor)
  const name = dict.t('viewShortPalette')
  const helpId = 'view-palette-help'
  const { button, paragraph } = useKnobHelp(helpId, name, dict.t('paletteHelp', PALETTE_CAP))
  return (
    <div className="kv-row" title={dict.t('paletteLabel')}>
      <KnobLine
        wide
        label={
          <span className="kv-lab" id="view-palette-label">
            {name}
          </span>
        }
        help={button}
        value={<span className="kv-unit">{dict.t('paletteCount', palette.length, PALETTE_CAP)}</span>}
        control={
          <span className="kv-colour">
            {palette.length === 0 ? null : (
              <ul className="fw-palette-list" aria-labelledby="view-palette-label">
                {palette.map((color, index) => (
                  // No stable id per colour — a value can repeat, and only its
                  // position in the list is unique.
                  <li key={index} className="fw-palette-row">
                    <label className="fw-vh" htmlFor={`view-palette-${index}`}>
                      {dict.t('paletteColorLabel', index + 1)}
                    </label>
                    <input
                      id={`view-palette-${index}`}
                      type="color"
                      value={color}
                      onChange={(e) => setPaletteColor(index, e.target.value)}
                    />
                    <button
                      type="button"
                      className="fw-palette-remove"
                      aria-label={dict.t('paletteRemove', index + 1)}
                      onClick={() => removePaletteColor(index)}
                    >
                      ×
                    </button>
                  </li>
                ))}
              </ul>
            )}
            {/* `disabled` alone leaves a screen reader saying only "add colour,
                dimmed" at the cap; the description states the cap in words,
                so the refusal is audible too. */}
            <button
              type="button"
              className="kv-chip"
              onClick={addPaletteColor}
              disabled={palette.length >= PALETTE_CAP}
              aria-describedby={helpId}
            >
              {dict.t('paletteAdd')}
            </button>
          </span>
        }
      />
      {paragraph}
    </div>
  )
}

/** A titled run of rows, a group named by its heading. */
export function Section({ id, title, children }: { id: string; title: string; children: ReactNode }): ReactElement {
  return (
    <div className="kv-sect" role="group" aria-labelledby={id}>
      <div className="kv-sub" id={id}>
        {title}
      </div>
      {children}
    </div>
  )
}

/**
 * The colours the stage paints any board with: the lab's own, and on the saved
 * boards the stored board's too — `BoardFrame` spreads the theme, the palette,
 * the paper and the ink over a stored board's view. So this
 * section belongs to both faces, and it is always the lab's slice it edits.
 */
export function ColoursSection(): ReactElement {
  const dict = useDictionary()
  const view = useStore((state) => state.view)
  return (
    <Section id="view-sec-colours" title={dict.t('previewColours')}>
      <ThemeRow />
      {/* The board's own surface colours: `''` means "not set", which a
          colour input cannot show, so the row shows the element's own
          default while unset, and the clear button — present only once
          there is something to clear — hands the field back to a theme. */}
      <ColourRow
        id="view-paper"
        short={dict.t('viewShortPaper')}
        help={dict.t('paperHelp')}
        title={dict.t('paperLabel')}
        value={view.paper === '' ? DEFAULT_VIEW.paper : view.paper}
        onChange={view.setPaper}
        {...(view.paper === '' ? {} : { onClear: () => view.setPaper(''), clearLabel: dict.t('paperClear') })}
      />
      <ColourRow
        id="view-ink"
        short={dict.t('viewShortInk')}
        help={dict.t('inkHelp')}
        title={dict.t('inkLabel')}
        value={view.ink === '' ? DEFAULT_VIEW.ink : view.ink}
        onChange={view.setInk}
        {...(view.ink === '' ? {} : { onClear: () => view.setInk(''), clearLabel: dict.t('inkClear') })}
      />
      <ColourRow
        id="view-highlight"
        short={dict.t('viewShortHighlight')}
        help={dict.t('highlightHelp')}
        title={dict.t('highlightLabel')}
        value={view.highlight === '' ? DEFAULT_VIEW.highlight : view.highlight}
        onChange={view.setHighlight}
        {...(view.highlight === ''
          ? {}
          : { onClear: () => view.setHighlight(''), clearLabel: dict.t('highlightClear') })}
      />
      <PaletteRow />
    </Section>
  )
}

export const fieldOf = (key: ViewNumber): ViewField => {
  const field = VIEW_FIELDS.find((f) => f.field === key)
  if (field === undefined) throw new Error(`no preview field ${key}`)
  return field
}

/**
 * The element's settings as knob rows, on the knobs' grid: arrows, highlight,
 * grid, colours and export. The top count lives under the highlight switch
 * and the dot colour and radius under the point grid's, in blocks that open
 * with their switch or for a palette jump to one of their rows. The engine
 * never sees them, so they carry no violation and no inactive reason, and
 * editing one redraws the board without generating.
 */
export function ViewPanel() {
  const dict = useDictionary()
  const view = useStore((state) => state.view)
  const wanted = useStore((state) => state.ui.focusTarget)
  return (
    <div className="fw-knobs" role="tabpanel" id={panelId('preview')} aria-labelledby={tabId('preview')}>
      <div className="fw-khd">
        <b>{dict.t('preview')}</b>
      </div>
      <div className="kv kv-g">
        <Section id="view-sec-arrows" title={dict.t('secArrows')}>
          <ViewNumberRow field={fieldOf('stroke')} />
          <ViewNumberRow field={fieldOf('headWidth')} />
          <ViewNumberRow field={fieldOf('headHeight')} />
          <SwitchRow flag="rounded" />
          <SwitchRow flag="colored" />
        </Section>
        <Section id="view-sec-highlight" title={dict.t('secHighlight')}>
          <SwitchRow flag="hilite" />
          <CollapsibleBlock
            id="dep-hilite"
            on={view.hilite}
            forced={wanted === 'view-top'}
            needs={dict.t('needsHilite')}
            title={dict.t('viewShortHilite')}
            count={1}
          >
            <ViewNumberRow field={fieldOf('top')} />
          </CollapsibleBlock>
        </Section>
        <Section id="view-sec-grid" title={dict.t('secGrid')}>
          <SwitchRow flag="voids" />
          <PadRow />
          <SwitchRow flag="showPoints" />
          <CollapsibleBlock
            id="dep-points"
            on={view.showPoints}
            forced={wanted === 'view-point-color' || wanted === 'view-point-radius'}
            needs={dict.t('needsPoints')}
            title={dict.t('viewShortShowPoints')}
            count={2}
          >
            <ColourRow
              id="view-point-color"
              short={dict.t('viewShortPointColor')}
              help={dict.t('pointColorHelp')}
              title={dict.t('pointColorLabel')}
              value={view.pointColor}
              onChange={view.setPointColor}
            />
            <PointRadiusRow />
          </CollapsibleBlock>
        </Section>
        <ColoursSection />
        <Section id="view-sec-export" title={dict.t('secExport')}>
          <ViewNumberRow field={fieldOf('cell')} />
        </Section>
      </div>
    </div>
  )
}
