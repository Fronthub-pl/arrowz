import type React from 'react'
import { KnobLine, KnobTrack } from '../console/KnobRow'
import { useDictionary } from '../i18n'
import type { RecipeSlider } from '../state/recipe.slice'
import { useStore } from '../state/store'
import { applyRecipe } from './applyRecipe'

/**
 * A recipe slider: a wish from one end word to the other, not a knob value
 * (`lab-simple.ts` interpolates the knob ranges between anchors). 0–100,
 * because a whole percent is the finest step a person drags. The knobs follow
 * at once; the run waits for the debounce.
 *
 * A knob row with no `?` and no numeric ends, and the value is text, because
 * there is nothing to type. The end words stand under the track and describe it.
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
    <div className="kv-row" title={label}>
      <KnobLine
        label={
          <label className="kv-lab" htmlFor={id}>
            {label}
          </label>
        }
        help={null}
        value={
          <span className="kv-val">
            <span className="kv-num">{percent}</span>
          </span>
        }
        control={
          <KnobTrack
            id={id}
            value={percent}
            bounds={{ min: 0, max: 100 }}
            step={1}
            word={null}
            // The number alone says nothing: "20" of what? The ends say.
            describedBy={`${id}-ends`}
            onCommit={(next) => {
              setSlider(slider, next / 100)
              applyRecipe(false)
            }}
          />
        }
        under={
          <p className="kv-ends" id={`${id}-ends`}>
            <span>{low}</span>
            <span>{high}</span>
          </p>
        }
      />
    </div>
  )
}
