import { PARAM_SPEC, type ParamSpec } from '@arrowz/engine'
import { SIMPLE_CHOICES } from '@arrowz/engine/simple'
import type { ReactElement } from 'react'
import { KnobLine, useKnobHelp } from '../console/KnobRow'
import { ValueKnob } from '../console/ValueKnob'
import { fieldOf, Section, SwitchRow, ThemeRow, ViewNumberRow } from '../console/ViewPanel'
import { SIMPLE_VIEW_FIELDS, SIMPLE_VIEW_FLAGS } from '../console/viewFields'
import { useDictionary } from '../i18n'
import type { RunControl } from '../run/useRun'
import { Segmented } from '../shell/Segmented'
import type { RecipeSide } from '../state/recipe.slice'
import { useStore } from '../state/store'
import { applyRecipe } from './applyRecipe'
import { PositionSlider } from './PositionSlider'

function specOf(key: 'W' | 'H' | 'seed'): ParamSpec {
  const spec = PARAM_SPEC.find((s) => s.key === key)
  if (!spec) throw new Error(`PARAM_SPEC has no ${key}`)
  return spec
}

/**
 * A side of the board as a knob row. It shows the knobs' side, which is what
 * Generate carves even after a preset or a link moved it past the recipe. A
 * write takes both sides into the recipe, so the other side stays as shown.
 */
function SizeRow({ side }: { side: RecipeSide }): ReactElement {
  const value = useStore((state) => state.params.values[side])
  const setSize = useStore((state) => state.recipe.setSize)
  return (
    <ValueKnob
      spec={specOf(side)}
      value={value}
      onSet={(next) => {
        // `recipeOf` clamps and rounds; the knobs follow; the debounce runs.
        const { W, H } = useStore.getState().params.values
        setSize(side === 'W' ? next : W, side === 'H' ? next : H)
        applyRecipe(false)
      }}
    />
  )
}

/** The seed lives in the knobs, not in the recipe; written by the machine path, so no edit is counted. */
function SeedRow(): ReactElement {
  const setMany = useStore((state) => state.params.setMany)
  return <ValueKnob spec={specOf('seed')} onSet={(seed) => setMany({ seed })} />
}

/** The segmented button runs at once, after the knobs are rewritten. */
function SkeletonRow({ control }: { control: RunControl }): ReactElement {
  const dict = useDictionary()
  const skeleton = useStore((state) => state.recipe.value.skeleton)
  const setSkeleton = useStore((state) => state.recipe.setSkeleton)
  const helpId = 'simple-skeleton-help'
  const { button, paragraph } = useKnobHelp(helpId, dict.d.simple.skeleton, dict.d.simple.skeletonHelp)
  return (
    <div className="kv-row">
      <KnobLine
        label={
          <span className="kv-lab" id="simple-skeleton-label">
            {dict.d.simple.skeleton}
          </span>
        }
        help={button}
        wide
        control={
          <Segmented
            label={dict.d.simple.skeleton}
            labelledBy="simple-skeleton-label"
            describedBy={helpId}
            value={skeleton}
            options={SIMPLE_CHOICES.skeleton.map((value) => ({ value, label: dict.d.simple.options.skeleton[value] }))}
            onChange={(next) => {
              setSkeleton(next)
              applyRecipe(false)
              control.start()
            }}
          />
        }
      />
      {paragraph}
    </div>
  )
}

/**
 * Randomising as a switch row, like a preview flag: the short label names it,
 * the whole sentence is its title, and the help is under its `?`.
 */
function RandomRow(): ReactElement {
  const dict = useDictionary()
  const random = useStore((state) => state.recipe.value.random)
  const setRandom = useStore((state) => state.recipe.setRandom)
  const name = dict.d.simple.randomizeShort
  const helpId = 'simple-random-help'
  const { button, paragraph } = useKnobHelp(helpId, name, dict.d.simple.randomizeHelp)
  return (
    <div className="kv-row" title={dict.d.simple.randomize}>
      <KnobLine
        label={
          <span className="kv-lab" id="simple-random-label">
            {name}
          </span>
        }
        help={button}
        value={<span className="kv-unit">{dict.t(random ? 'valueOn' : 'valueOff')}</span>}
        control={
          <button
            type="button"
            id="simple-random"
            className="fw-sw"
            role="switch"
            aria-checked={random}
            aria-labelledby="simple-random-label"
            aria-describedby={helpId}
            title={dict.d.simple.randomize}
            onClick={() => setRandom(!random)}
          />
        }
      />
      {paragraph}
    </div>
  )
}

/**
 * The simple view: plain choices instead of the knobs, translated into a full
 * parameter set by `lab-simple.ts`. It takes the console's first two tracks,
 * so the run column beside it is the same instance the advanced view shows.
 *
 * The advanced view's grid, in two sections of knob rows: the board, then the
 * preview rows the preview tab draws, the same components writing the same
 * slice.
 *
 * Not a tabpanel: in this view there is no rail to label it.
 */
export function SimplePanel({ control }: { control: RunControl }): ReactElement {
  const dict = useDictionary()
  return (
    <section className="fw-knobs fw-simple" aria-label={dict.t('simplePanel')}>
      <div className="fw-khd">
        <b>{dict.d.simple.viewSimple}</b>
      </div>
      <div className="kv kv-g">
        <Section id="simple-sec-board" title={dict.d.groups.board}>
          <SizeRow side="W" />
          <SizeRow side="H" />
          <PositionSlider slider="lengths" />
          <PositionSlider slider="shape" />
          <SkeletonRow control={control} />
          <SeedRow />
          <RandomRow />
          <p className="kv-note" id="simple-harder">
            {dict.d.simple.harder}
          </p>
        </Section>
        <Section id="simple-sec-preview" title={dict.t('preview')}>
          {SIMPLE_VIEW_FIELDS.map((field) => (
            <ViewNumberRow key={field} field={fieldOf(field)} />
          ))}
          {SIMPLE_VIEW_FLAGS.map((flag) => (
            <SwitchRow key={flag} flag={flag} />
          ))}
          <ThemeRow />
        </Section>
      </div>
    </section>
  )
}
