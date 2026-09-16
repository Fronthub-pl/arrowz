import type React from 'react'
import { useDictionary } from '../i18n'
import type { RecipeSlider } from '../state/recipe.slice'
import { useStore } from '../state/store'
import { applyRecipe } from './applyRecipe'

/**
 * A recipe slider: a wish from one end word to the other, not a knob value
 * (`lab-simple.ts` interpolates the knob ranges between anchors). 0–100 on the
 * mock's `.bar`, because a whole percent is the finest step a person drags.
 * The knobs follow at once; the run waits for the debounce (Task 4).
 */
export function PositionSlider({ slider }: { slider: RecipeSlider }): React.ReactElement {
  const dict = useDictionary()
  const position = useStore((state) => state.recipe.value[slider])
  const setSlider = useStore((state) => state.recipe.setSlider)
  const label = dict.d.simple[slider]
  const [low, high] = dict.d.simple.ends[slider]
  const percent = Math.round(position * 100)
  const id = `simple-${slider}`
  return (
    <div className="fw-k">
      <div className="top">
        <label className="lab" htmlFor={id}>
          {label}
        </label>
        <span className="num">{percent}</span>
      </div>
      <div className="bar">
        <input
          type="range"
          id={id}
          min={0}
          max={100}
          step={1}
          value={percent}
          // The number alone says nothing: "20" of what? The ends say.
          aria-describedby={`${id}-ends`}
          style={{ '--pct': `${percent}%` } as React.CSSProperties}
          onChange={(event) => {
            setSlider(slider, Number(event.currentTarget.value) / 100)
            applyRecipe(false)
          }}
        />
      </div>
      <p className="why fw-ends" id={`${id}-ends`}>
        <span>{low}</span>
        <span>{high}</span>
      </p>
    </div>
  )
}
