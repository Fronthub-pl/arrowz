import type { ReactElement } from 'react'
import { useLocation, useNavigate } from 'react-router'
import { jumpTo } from '../console/jumpTo'
import { rowState } from '../console/KnobRow'
import { useDictionary } from '../i18n'
import type { Baseline, ShownResult } from '../state/result.slice'
import { knobChanges } from './knobChanges'

/**
 * The knobs the board on screen was made with that differ from the baseline's,
 * the one `StatsTable` compares with, worded as their rows show them. A row is
 * a jump to its knob, the palette's own (`jumpTo`); one with no effect on this
 * board says why, as its knob's row does. Nothing with no baseline or no
 * change; built at render, so a language switch rewords it.
 */
export function KnobDiff({
  result,
  baseline,
}: {
  result: ShownResult
  baseline: Baseline | null
}): ReactElement | null {
  const dict = useDictionary()
  const navigate = useNavigate()
  const { pathname } = useLocation()
  if (baseline === null) return null
  const changes = knobChanges(dict, baseline.params, result.params)
  if (changes.length === 0) return null
  // No history entry for the address on screen, as the palette's own `navigate`.
  const go = (path: string) => {
    if (path !== pathname) void navigate(path)
  }
  return (
    <section className="fw-kdiff" aria-labelledby="kdiff-head">
      <h2 id="kdiff-head">{dict.t('knobDiffHead')}</h2>
      <p>{dict.t('knobDiffCap')}</p>
      <ul>
        {changes.map((change) => {
          const group = dict.d.groups[change.group]
          const { text } = rowState(dict, { broken: undefined, inactive: change.inactive ?? undefined })
          const why = `kdiff-why-${change.id}`
          return (
            <li key={change.id}>
              <button
                type="button"
                aria-label={dict.t('knobDiffRow', change.label, group, change.before, change.after)}
                aria-describedby={text === null ? undefined : why}
                onClick={() => jumpTo(go, change.group, change.id)}
              >
                <span className="kd-name">
                  <span className="kd-lab">{change.label}</span> <span className="kd-grp">{group}</span>
                </span>
                <span className="kd-val">{`${change.before} → ${change.after}`}</span>
                {text === null ? null : (
                  <span className="kd-why" id={why}>
                    {text}
                  </span>
                )}
              </button>
            </li>
          )
        })}
      </ul>
    </section>
  )
}
