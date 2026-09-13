import { type ParamGroup, type ParamKey, PARAM_SPEC, type Violation } from '@arrowz/engine'

const groupByKey = new Map<ParamKey, ParamGroup>(PARAM_SPEC.map((s) => [s.key, s.group]))

/**
 * How many violations touch each group. A rule naming five knobs in three
 * groups is one problem, not five, so it counts once per group it reaches —
 * otherwise the rail would report a badly configured board as a dozen faults.
 */
export function countsByGroup(violations: readonly Violation[]): Readonly<Partial<Record<ParamGroup, number>>> {
  const counts: Partial<Record<ParamGroup, number>> = {}
  for (const v of violations) {
    const groups = new Set<ParamGroup>()
    for (const key of v.kind === 'rule' ? v.keys : [v.key]) {
      const group = groupByKey.get(key)
      if (group) groups.add(group)
    }
    for (const group of groups) counts[group] = (counts[group] ?? 0) + 1
  }
  return counts
}
