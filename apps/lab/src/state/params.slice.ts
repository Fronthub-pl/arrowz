import {
  clampParam,
  defaultParams,
  type InactiveKey,
  type ParamKey,
  type Params,
  type ParamSpec,
  PARAM_SPEC,
  straightFloor,
  validateParams,
  type Violation,
} from '@arrowz/engine'
import { MIX_START, START, type StartChoice } from '@arrowz/engine/command'

const specByKey = new Map<ParamKey, ParamSpec>(PARAM_SPEC.map((s) => [s.key, s]))

/** A knob's spec. Every key here comes from PARAM_SPEC, so a miss is a bug in this file. */
function specOf(key: ParamKey): ParamSpec {
  const spec = specByKey.get(key)
  if (!spec) throw new Error(`unknown parameter ${key}`)
  return spec
}

/**
 * One array for every valid board. `validateParams` returns a fresh `[]` each
 * time, and the rail selects the whole list to count violations per group: a
 * fresh empty array would rerender the rail on every drag of a valid board.
 */
const NO_VIOLATIONS: readonly Violation[] = []

export interface Indexes {
  violations: readonly Violation[]
  broken: Readonly<Partial<Record<ParamKey, readonly Violation[]>>>
  inactive: Readonly<Partial<Record<ParamKey, InactiveKey>>>
  floor: Readonly<Partial<Record<ParamKey, number>>>
}

/**
 * The three per-key indexes, recomputed once per change. Sparse on purpose: a
 * knob with nothing to say reads `undefined` twice running and does not
 * re-render. Not a per-knob selector: `straightFloor` reads W, H, warns and anticoil.
 */
export function indexesOf(values: Params): Indexes {
  const list = validateParams(values)
  const broken: Partial<Record<ParamKey, Violation[]>> = {}
  for (const v of list) {
    for (const key of v.kind === 'rule' ? v.keys : [v.key]) {
      const seen = broken[key]
      if (seen) seen.push(v)
      else broken[key] = [v]
    }
  }
  const inactive: Partial<Record<ParamKey, InactiveKey>> = {}
  for (const spec of PARAM_SPEC) {
    // A broken knob shows its violation, not its inactive reason.
    if (broken[spec.key] || !spec.inactive) continue
    const reason = spec.inactive(values)
    if (reason) inactive[spec.key] = reason
  }
  return {
    violations: list.length === 0 ? NO_VIOLATIONS : list,
    broken,
    inactive,
    floor: { pStraight: straightFloor(values) },
  }
}

export interface ParamsState extends Indexes {
  values: Params
  /**
   * How many knobs a person has committed. Only `set` and `setStart` move it;
   * `setMany` and `reset` are the machine path (preset, Defaults, New seed,
   * link), each of which starts its own run. `useAutoRun` watches only this, so
   * the two paths cannot both fire for one action.
   */
  edits: number
  /** Commits one knob. Returns whether the value had to be clamped. */
  set(key: ParamKey, value: number): boolean
  /** Commits several at once — one recompute, one render. Returns whether anything was clamped. */
  setMany(patch: Partial<Params>): boolean
  /** Writes the two knobs behind `--start`. */
  setStart(choice: StartChoice): void
  reset(): void
}

type SetStore = (fn: (state: { params: ParamsState }) => { params: ParamsState }) => void

/** Clamps a patch onto the values, reporting whether anything moved. */
function commit(values: Params, patch: Partial<Params>): { values: Params; clamped: boolean } {
  const next = { ...values }
  let clamped = false
  for (const [key, value] of Object.entries(patch) as [ParamKey, number][]) {
    const c = clampParam(specOf(key), value)
    next[key] = c.value
    clamped = clamped || c.clamped
  }
  return { values: next, clamped }
}

export function createParamsSlice(set: SetStore): ParamsState {
  const initial = defaultParams()
  const write = (patch: Partial<Params>, typed: boolean): boolean => {
    let clamped = false
    set((state) => {
      const c = commit(state.params.values, patch)
      clamped = c.clamped
      return {
        params: {
          ...state.params,
          values: c.values,
          edits: typed ? state.params.edits + 1 : state.params.edits,
          ...indexesOf(c.values),
        },
      }
    })
    return clamped
  }
  return {
    values: initial,
    edits: 0,
    ...indexesOf(initial),
    set: (key, value) => write({ [key]: value }, true),
    setMany: (patch) => write(patch, false),
    setStart: (choice) => {
      const pair = choice === 'mixing' ? undefined : START.words[choice]
      if (pair) {
        write(pair, true)
        return
      }
      // `mixing` is not a word in the table: it is the share itself, and the
      // share already on the knob survives the switch when --start can spell
      // it. Read inside the setter, so it cannot read a value another action
      // has already replaced.
      set((state) => {
        const mix = state.params.values.mix
        const share = mix >= START.mix.min && mix <= START.mix.max ? mix : MIX_START
        const c = commit(state.params.values, { headBias: 0, mix: share })
        return {
          params: {
            ...state.params,
            values: c.values,
            edits: state.params.edits + 1,
            ...indexesOf(c.values),
          },
        }
      })
    },
    reset: () => {
      const values = defaultParams()
      set((state) => ({ params: { ...state.params, values, ...indexesOf(values) } }))
    },
  }
}
