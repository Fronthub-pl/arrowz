import { PARAM_SPEC, type ParamSpec } from '@arrowz/engine'
import { SIMPLE_CHOICES } from '@arrowz/engine/simple'
import type { ReactElement } from 'react'
import { DraftNumber } from '../console/DraftNumber'
import { KnobSlider } from '../console/KnobSlider'
import { VIEW_FLAGS, ViewFlagSwitch, ViewNumberField } from '../console/ViewPanel'
import { SIMPLE_VIEW_FIELDS, SIMPLE_VIEW_FLAGS, VIEW_FIELDS } from '../console/viewFields'
import { useDictionary } from '../i18n'
import { OptionSwitch } from '../run/OptionSwitch'
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

/** A side of the board: typed or dragged, with the engine's own bounds, into the recipe. */
function SizeCard({ side }: { side: RecipeSide }): ReactElement {
  const dict = useDictionary()
  const value = useStore((state) => state.recipe.value[side])
  const setSide = useStore((state) => state.recipe.setSide)
  const spec = specOf(side)
  const { label } = dict.paramText(spec)
  const commit = (next: number) => {
    // `recipeOf` clamps and rounds; the knobs follow; the debounce runs.
    setSide(side, next)
    applyRecipe(false)
  }
  return (
    <div className="fw-k">
      <div className="top">
        <label className="lab" htmlFor={`simple-${side}`}>
          {label}
        </label>
        <DraftNumber label={label} value={value} onCommit={commit} />
      </div>
      <KnobSlider spec={spec} id={`simple-${side}`} value={value} label={label} onCommit={commit} />
    </div>
  )
}

/** Spec §2.2: the segmented button runs at once, after the knobs are rewritten. */
function SkeletonCard({ control }: { control: RunControl }): ReactElement {
  const dict = useDictionary()
  const skeleton = useStore((state) => state.recipe.value.skeleton)
  const setSkeleton = useStore((state) => state.recipe.setSkeleton)
  return (
    <div className="fw-k">
      <div className="top">
        <span className="lab" id="simple-skeleton-label">
          {dict.d.simple.skeleton}
        </span>
      </div>
      <Segmented
        label={dict.d.simple.skeleton}
        labelledBy="simple-skeleton-label"
        value={skeleton}
        options={SIMPLE_CHOICES.skeleton.map((value) => ({ value, label: dict.d.simple.options.skeleton[value] }))}
        onChange={(next) => {
          setSkeleton(next)
          applyRecipe(false)
          control.start()
        }}
      />
    </div>
  )
}

/** The seed lives in the knobs, not in the recipe; typed here through the machine path (Ruling 4). */
function SeedCard(): ReactElement {
  const dict = useDictionary()
  const seed = useStore((state) => state.params.values.seed)
  const setMany = useStore((state) => state.params.setMany)
  const { label } = dict.paramText(specOf('seed'))
  return (
    <div className="fw-k">
      <div className="top">
        <span className="lab">{label}</span>
        <DraftNumber label={label} value={seed} onCommit={(typed) => setMany({ seed: typed })} />
      </div>
    </div>
  )
}

function RandomCard(): ReactElement {
  const dict = useDictionary()
  const random = useStore((state) => state.recipe.value.random)
  const setRandom = useStore((state) => state.recipe.setRandom)
  return (
    <div className="fw-k">
      <OptionSwitch id="simple-random" label={dict.d.simple.randomize} on={random} onChange={setRandom} />
      <p className="why">{dict.d.simple.randomizeHelp}</p>
    </div>
  )
}

/**
 * The simple view (spec §2.1 unit 4): plain choices instead of twenty-eight
 * knobs, translated into a full parameter set by `lab-simple.ts`. It takes the
 * console's first two tracks (Ruling 7), so the run column beside it is the
 * same instance the advanced view shows.
 *
 * Not a tabpanel: in this view there is no rail to label it.
 */
export function SimplePanel({ control }: { control: RunControl }): ReactElement {
  const dict = useDictionary()
  const fields = VIEW_FIELDS.filter((field) => SIMPLE_VIEW_FIELDS.includes(field.field))
  const flags = VIEW_FLAGS.filter(({ flag }) => SIMPLE_VIEW_FLAGS.includes(flag))
  return (
    <section className="fw-knobs fw-simple" aria-label={dict.t('simplePanel')}>
      <div className="fw-khd">
        <b>{dict.d.simple.viewSimple}</b>
      </div>
      <div className="fw-grid">
        <SizeCard side="W" />
        <SizeCard side="H" />
        <PositionSlider slider="lengths" />
        <PositionSlider slider="shape" />
        <SkeletonCard control={control} />
        <SeedCard />
        <RandomCard />
      </div>
      <div className="fw-khd">
        <b>{dict.t('preview')}</b>
      </div>
      <div className="fw-grid">
        {fields.map((field) => (
          <ViewNumberField key={field.field} field={field} />
        ))}
        {flags.map(({ flag, label }) => (
          <ViewFlagSwitch key={flag} flag={flag} label={label} />
        ))}
      </div>
    </section>
  )
}
