import { DEFAULT_VIEW, POINT_RADIUS_RANGE, THEMES, themeOf } from '@arrowz/board-element'
import { VIEW_RANGE, viewNumberOf } from '@arrowz/engine/command'
import { useEffect, useRef } from 'react'
import { useDictionary } from '../i18n'
import { useStore } from '../state/store'
import { PALETTE_CAP, type ViewFlag } from '../state/view.slice'
import { FieldHelp } from './FieldHelp'
import { panelId, tabId } from './GroupRail'
import { DRAWING_FLAGS, VIEW_FIELDS, VIEW_FLAGS, type PlainUiKey, type ViewField, viewHelpEntries } from './viewFields'

/**
 * One preview number. Uncontrolled on purpose: a controlled `type="number"`
 * rewrites its own value, and a half-typed `0.` reads back as the empty string
 * — so React would put the default into the box under the cursor. The field
 * owns its text while it is being typed into; the store owns it the rest of
 * the time — a `document.activeElement` guard, kept where it is needed.
 *
 * The library's preview shows three of these fields (stroke, head width and
 * head height) through this same component, which is what keeps their bounds
 * measured against `VIEW_RANGE` in one place rather than two.
 */
export function ViewNumberField({
  field,
  value,
  onCommit,
}: {
  field: ViewField
  value: number
  onCommit(value: number): void
}) {
  const dict = useDictionary()
  const ref = useRef<HTMLInputElement>(null)
  // The engine's own bounds, not a copy of them: `commit` clamps through
  // `viewNumberOf`, which reads the same table, so the box cannot declare a
  // ceiling different from the one it enforces.
  const range = VIEW_RANGE[field.field]

  useEffect(() => {
    const node = ref.current
    if (node && document.activeElement !== node) node.value = String(value)
  }, [value])

  // The clamp lives here rather than in each owner: the lab's slice clamps in
  // `setNumber` and the library's detail has no slice to clamp in, so a field
  // that handed on what was typed would leave one of its two owners to
  // remember. The box then shows what was actually kept.
  const commit = () => {
    const node = ref.current
    if (!node) return
    const kept = viewNumberOf(node.value, field.field)
    onCommit(kept)
    node.value = String(kept)
  }

  return (
    <div className="fw-k">
      <div className="top">
        <label className="lab" htmlFor={`view-${field.field}`}>
          {dict.t(field.label)}
        </label>
        <input
          ref={ref}
          type="number"
          id={`view-${field.field}`}
          className="num"
          min={range.min}
          max={range.max}
          step={field.step}
          defaultValue={String(value)}
          // The help sits under the section heading (spec R7), not in the card.
          aria-describedby={field.help === undefined ? undefined : `view-${field.field}-help`}
          onBlur={commit}
          onKeyDown={(event) => {
            if (event.key === 'Enter') commit()
          }}
        />
      </div>
    </div>
  )
}

/**
 * One preview flag as the mock's switch, labelled by its visible text.
 * `bare` drops the card around it, for a row inside a card that holds several
 * (the drawing flags, spec R8): a card inside a card doubles the frame.
 */
export function ViewFlagSwitch({
  flag,
  label,
  on,
  onToggle,
  bare,
}: {
  flag: ViewFlag
  label: (typeof VIEW_FLAGS)[number]['label']
  on: boolean
  onToggle(): void
  bare?: boolean | undefined
}) {
  const dict = useDictionary()
  const row = (
    <div className="row">
      <span className="lab" id={`view-${flag}-label`}>
        {dict.t(label)}
      </span>
      <button
        type="button"
        id={`view-${flag}`}
        className="fw-sw"
        role="switch"
        aria-checked={on}
        aria-labelledby={`view-${flag}-label`}
        onClick={onToggle}
      />
    </div>
  )
  return bare === true ? row : <div className="fw-k">{row}</div>
}

/** A colour input and, where the empty value means something, its clear button. */
function ColorCell({
  id,
  value,
  onChange,
  onClear,
  clearLabel,
}: {
  id: string
  value: string
  onChange(color: string): void
  onClear?: (() => void) | undefined
  clearLabel?: string | undefined
}) {
  return (
    <span className="fw-colour-cell">
      <input id={id} type="color" value={value} onChange={(e) => onChange(e.target.value)} />
      {onClear === undefined ? null : (
        <button type="button" className="fw-palette-remove" aria-label={clearLabel} onClick={onClear}>
          ×
        </button>
      )}
    </span>
  )
}

interface ColorProps {
  id: string
  label: string
  value: string
  onChange(color: string): void
  onClear?: (() => void) | undefined
  clearLabel?: string | undefined
}

/**
 * One colour, as the palette rows already draw one: a visible label (so the
 * row reads on its own, unlike a palette swatch that sits beside "colour 1"
 * in a list already labelled by the editor around it) and a controlled
 * native colour input. `onClear` is offered where the empty value means
 * something -- paper and ink use it to hand the field back to the theme,
 * which a colour input has no way to express on its own.
 */
export function ColorField({ label, ...cell }: ColorProps) {
  return (
    <div className="fw-k">
      <div className="row">
        <label className="lab" htmlFor={cell.id}>
          {label}
        </label>
        <ColorCell {...cell} />
      </div>
    </div>
  )
}

/**
 * The same colour as one row of the colours card: the label in the card's
 * label column, the cell in its control column (spec R8).
 */
function ColorRow({ label, ...cell }: ColorProps) {
  return (
    <>
      <label className="lab" htmlFor={cell.id}>
        {label}
      </label>
      <div className="val">
        <ColorCell {...cell} />
      </div>
    </>
  )
}

/**
 * The chosen theme's arrow colours, in order, on the theme's own paper
 * (design doc §6, Task 1 of the palette round-2 addendum): the paper says what
 * surface the arrows draw against without spending a swatch on `paper` or
 * `ink` separately, and a colour that would vanish against its own paper is
 * exactly what this is for showing. Renders nothing for `''` (no theme).
 *
 * `aria-hidden`: the `<select>` beside it already names the theme, so this
 * strip repeats no information a screen reader user needs read out — it is
 * not interactive, and there is no useful text a hex value could be given
 * ("swatch one: hash f5 e0 dc" names nothing anyone would ask for).
 */
export function ThemeSwatchStrip({ themeName }: { themeName: string }) {
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
 * The console's colours card (spec R8): the theme, the board's two surface
 * colours and the editable custom palette (design doc §6, palette round-2
 * addendum, task 2), one card with a label column and a control column.
 * Console-only by construction — it is defined here and imported by
 * `ViewPanel` alone; `SimplePanel` imports `ThemeSwatchStrip` from this file
 * but never this component (ViewPanel.browser.test.tsx and
 * SimplePanel.browser.test.tsx both pin it).
 *
 * The palette's cap lives in the store (`view.slice.ts`'s `paletteUpdate`),
 * not here: every handler below just forwards to a store action, so there is
 * nowhere in this component for the cap to be bypassed.
 */
export function ColoursCard() {
  const dict = useDictionary()
  const theme = useStore((state) => state.view.theme)
  const setTheme = useStore((state) => state.view.setTheme)
  const palette = useStore((state) => state.view.palette)
  const addPaletteColor = useStore((state) => state.view.addPaletteColor)
  const setPaletteColor = useStore((state) => state.view.setPaletteColor)
  const removePaletteColor = useStore((state) => state.view.removePaletteColor)
  const paper = useStore((state) => state.view.paper)
  const ink = useStore((state) => state.view.ink)
  const setPaper = useStore((state) => state.view.setPaper)
  const setInk = useStore((state) => state.view.setInk)
  return (
    <div className="fw-k fw-colours">
      <label className="lab" htmlFor="view-theme">
        {dict.t('themeLabel')}
      </label>
      <div className="val">
        <select id="view-theme" value={theme} onChange={(e) => setTheme(e.target.value)}>
          <option value="">{dict.t('themeNone')}</option>
          {Object.keys(THEMES).map((name) => (
            <option key={name} value={name}>
              {name}
            </option>
          ))}
        </select>
        <ThemeSwatchStrip themeName={theme} />
      </div>
      {/* The board's own surface colours (Task 6): `''` means "not set", which
          a native colour input has no way to show, so the field shows the
          element's own default while unset and the clear button -- present
          only once there is something to clear -- is what expresses "not
          set" and hands the field back to a chosen theme. */}
      <ColorRow
        id="view-paper"
        label={dict.t('paperLabel')}
        value={paper === '' ? DEFAULT_VIEW.paper : paper}
        onChange={setPaper}
        {...(paper === '' ? {} : { onClear: () => setPaper(''), clearLabel: dict.t('paperClear') })}
      />
      <ColorRow
        id="view-ink"
        label={dict.t('inkLabel')}
        value={ink === '' ? DEFAULT_VIEW.ink : ink}
        onChange={setInk}
        {...(ink === '' ? {} : { onClear: () => setInk(''), clearLabel: dict.t('inkClear') })}
      />
      <span className="lab" id="view-palette-label">
        {dict.t('paletteLabel')}
      </span>
      <div className="val">
        {palette.length === 0 ? null : (
          <ul className="fw-palette-list" aria-labelledby="view-palette-label">
            {palette.map((color, index) => (
              // No stable id per colour — a value can repeat, and only its
              // position in the list is unique (as ThemeSwatchStrip's own
              // index key above).
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
        {/* Finding 9 (final whole-addendum review): `disabled` alone leaves a
            screen reader saying only "add colour, dimmed" at the cap, with no
            reason. `aria-describedby` names the help entry under the section
            heading, which already states the cap in words, so the refusal is
            audible too. */}
        <button
          type="button"
          className="fw-btn"
          onClick={addPaletteColor}
          disabled={palette.length >= PALETTE_CAP}
          aria-describedby="view-palette-help"
        >
          {dict.t('paletteAdd')}
        </button>
      </div>
    </div>
  )
}

/**
 * The mock's *element* section: the preview's controls, in four sections —
 * geometry, drawing, points and colours (spec R8). They are not knobs — the
 * engine never sees them — so they carry no violation and no inactive reason,
 * and editing one redraws the board without generating (§2.2).
 *
 * A field commits on blur and on Enter, through `viewNumberOf`: an empty or
 * unreadable field is the default, and anything past what the CLI takes is
 * clamped in.
 *
 * The help under each heading follows the help switch the way the knob
 * panels' does (spec R7): hidden from the eye, never from the accessibility
 * tree, so every `aria-describedby` still resolves.
 */
export function ViewPanel() {
  const dict = useDictionary()
  const view = useStore((state) => state.view)
  const showHelp = useStore((state) => state.ui.help)
  const pointRadiusRef = useRef<HTMLInputElement>(null)

  // Same two mechanisms as `ViewNumberField` above, kept separate because this
  // field's bound comes from the element (`POINT_RADIUS_RANGE`) and its commit
  // goes through the slice's own clamp (`setPointRadius`) rather than
  // `viewNumberOf`: the store is the only place that knows the kept value, so
  // the commit reads it back from there instead of computing it locally.
  useEffect(() => {
    const node = pointRadiusRef.current
    if (node && document.activeElement !== node) node.value = String(view.pointRadius)
  }, [view.pointRadius])

  const commitPointRadius = () => {
    const node = pointRadiusRef.current
    if (!node) return
    view.setPointRadius(node.value)
    node.value = String(useStore.getState().view.pointRadius)
  }

  // `dict.t` is generic over formatter keys too; the helper takes plain ones.
  const t = (key: PlainUiKey) => dict.t(key)

  return (
    <div className="fw-knobs" role="tabpanel" id={panelId('preview')} aria-labelledby={tabId('preview')}>
      <div className="fw-khd">
        <b id="view-sec-geometry">{dict.t('previewGeometry')}</b>
        <FieldHelp entries={viewHelpEntries(VIEW_FIELDS, t)} hidden={!showHelp} />
      </div>
      <div className="fw-grid" role="group" aria-labelledby="view-sec-geometry">
        {VIEW_FIELDS.map((field) => (
          <ViewNumberField
            key={field.field}
            field={field}
            value={view[field.field]}
            onCommit={(value) => view.setNumber(field.field, String(value))}
          />
        ))}
      </div>
      <div className="fw-khd">
        <b id="view-sec-drawing">{dict.t('previewDrawing')}</b>
      </div>
      <div className="fw-grid" role="group" aria-labelledby="view-sec-drawing">
        <div className="fw-k fw-flags">
          {DRAWING_FLAGS.map(({ flag, label }) => (
            <ViewFlagSwitch
              key={flag}
              bare
              flag={flag}
              label={label}
              on={view[flag]}
              onToggle={() => view.toggle(flag)}
            />
          ))}
        </div>
      </div>
      <div className="fw-khd">
        <b id="view-sec-points">{dict.t('previewPoints')}</b>
        <FieldHelp
          entries={[
            { id: 'view-point-radius-help', label: dict.t('pointRadiusLabel'), text: dict.t('pointRadiusHelp') },
          ]}
          hidden={!showHelp}
        />
      </div>
      <div className="fw-grid" role="group" aria-labelledby="view-sec-points">
        <ViewFlagSwitch
          flag="showPoints"
          label="showPoints"
          on={view.showPoints}
          onToggle={() => view.toggle('showPoints')}
        />
        <ColorField
          id="view-point-color"
          label={dict.t('pointColorLabel')}
          value={view.pointColor}
          onChange={view.setPointColor}
        />
        <div className="fw-k">
          <div className="top">
            <label className="lab" htmlFor="view-point-radius">
              {dict.t('pointRadiusLabel')}
            </label>
            <input
              ref={pointRadiusRef}
              type="number"
              id="view-point-radius"
              className="num"
              min={POINT_RADIUS_RANGE.min}
              max={POINT_RADIUS_RANGE.max}
              // A keyboard convenience, not a claim about what is allowed --
              // the same role `step` plays in `viewFields.ts`.
              step={0.01}
              defaultValue={String(view.pointRadius)}
              aria-describedby="view-point-radius-help"
              onBlur={commitPointRadius}
              onKeyDown={(e) => {
                if (e.key === 'Enter') commitPointRadius()
              }}
            />
          </div>
        </div>
      </div>
      <div className="fw-khd">
        <b id="view-sec-colours">{dict.t('previewColours')}</b>
        <FieldHelp
          entries={[
            { id: 'view-palette-help', label: dict.t('paletteLabel'), text: dict.t('paletteHelp', PALETTE_CAP) },
          ]}
          hidden={!showHelp}
        />
      </div>
      <div className="fw-grid" role="group" aria-labelledby="view-sec-colours">
        <ColoursCard />
      </div>
    </div>
  )
}
