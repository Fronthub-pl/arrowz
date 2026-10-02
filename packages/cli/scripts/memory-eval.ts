// Measures the memory guard on a private labelled set kept outside this public repository
// (~/.config/arrowz/memory-labels.json), so a changed question, threshold or model is re-measured before it
// ships. Scored on the spike's held-out half; figures and bar in docs/jev-guards.md.
import { join } from '@std/path'
import { defaultJudge } from './jev-client.ts'
import { auc, rates, type Scored } from './jev-eval.ts'
import { pool } from './jev-guard.ts'
import { askMemory, longIndexLines, MAX_INDEX_LINE, MEMORY_AT } from './memory-guard.ts'

export type Labelled = { id: string; group: string; violation: boolean; kind: 'natural' | 'hand-made'; text: string }
export type Labels = { m1: Labelled[]; m2: Labelled[] }

/** The spike's split: FNV-1a of `split:<group>`; odd hashes are the held-out half. */
export function heldOut(group: string): boolean {
  let h = 2166136261
  const s = `split:${group}`
  for (let i = 0; i < s.length; i++) h = Math.imul(h ^ s.charCodeAt(i), 16777619)
  return (h >>> 0) % 2 === 1
}

/** The global `main` project must never reach TypeSafe (spec); its labels carry the `bm-main:` id prefix. */
export const sendable = (items: Labelled[]) => items.filter((x) => !x.id.startsWith('bm-main:'))

const isLabelled = (x: unknown): x is Labelled => {
  if (typeof x !== 'object' || x === null) return false
  const o = x as Record<string, unknown>
  return typeof o.id === 'string' && typeof o.group === 'string' && typeof o.violation === 'boolean' &&
    (o.kind === 'natural' || o.kind === 'hand-made') && typeof o.text === 'string'
}

/** The labels file's contents when every item has the `Labelled` shape; null otherwise. */
export function parseLabels(raw: unknown): Labels | null {
  if (typeof raw !== 'object' || raw === null) return null
  const { m1, m2 } = raw as Record<string, unknown>
  if (!Array.isArray(m1) || !Array.isArray(m2) || !m1.every(isLabelled) || !m2.every(isLabelled)) return null
  return { m1, m2 }
}

/** M2 as the hook scores it: 1 when `longIndexLines` flags the text. */
export const m2Score = (text: string) => (longIndexLines(text, () => '').length > 0 ? 1 : 0)

const pct = (x: number) => `${(100 * x).toFixed(1)} %`

if (import.meta.main) {
  const path = Deno.env.get('ARROWZ_MEMORY_LABELS') ??
    join(Deno.env.get('HOME') ?? '', '.config', 'arrowz', 'memory-labels.json')
  let labels: Labels | null = null
  try {
    labels = parseLabels(JSON.parse(Deno.readTextFileSync(path)))
  } catch {
    labels = null
  }
  if (labels === null) {
    console.error(`memory eval: no labels of the expected shape at ${path}`)
    Deno.exit(1)
  }
  const judge = await defaultJudge()
  if (judge === null) {
    console.error('memory eval: no TYPESAFE_API_KEY')
    Deno.exit(1)
  }
  labels.m1 = sendable(labels.m1)
  const answers = await pool(labels.m1, 16, (x) => askMemory(judge, x.text))
  const m1: Array<Scored & { held: boolean; kind: string }> = []
  labels.m1.forEach((x, i) => {
    const a = answers[i]
    if (a) m1.push({ p: a.violates ?? 0, positive: x.violation, held: heldOut(x.group), kind: x.kind })
  })
  const held = m1.filter((x) => x.held)
  const falseAlarm = rates(held.filter((x) => !x.positive), MEMORY_AT).falseAlarm
  const detection = rates(held.filter((x) => x.kind === 'hand-made'), MEMORY_AT).recall
  const natural = rates(held.filter((x) => x.kind === 'natural'), MEMORY_AT)
  const m2 = labels.m2
    .filter((x) => heldOut(x.group))
    .map((x) => ({ p: m2Score(x.text), positive: x.violation }))
  const m2r = rates(m2, 0.5)
  const pass = falseAlarm <= 0.03 && detection >= 0.8
  console.log([
    '| Check | Figure |',
    '|---|---|',
    `| M1 items / answered | ${labels.m1.length} / ${m1.length} |`,
    `| M1 AUC all / held | ${auc(m1).toFixed(3)} / ${auc(held).toFixed(3)} |`,
    `| M1 held at ${MEMORY_AT} | false alarms ${pct(falseAlarm)}, hand-made detection ${
      pct(detection)
    }, natural precision ${natural.precision.toFixed(2)} recall ${natural.recall.toFixed(2)} |`,
    `| M2 at ${MAX_INDEX_LINE} characters | false alarms ${pct(m2r.falseAlarm)}, detection ${pct(m2r.recall)} |`,
    `| bar (false alarms ≤ 3 %, detection ≥ 80 %) | ${pass ? 'PASS' : 'FAIL'} |`,
  ].join('\n'))
  Deno.exit(pass ? 0 : 1)
}
