// Measures the Jev guards on labelled data, so a changed question, threshold or
// model is re-measured before it ships. Figures and bars: docs/jev-guards.md.
import { fromFileUrl } from '@std/path'
import { type Answers, defaultJudge, type Judge } from './jev-client.ts'
import {
  askComment,
  askMessage,
  askPair,
  type Commented,
  commentFlag,
  commentsOf,
  dictionaryPairs,
  MESSAGE_AT,
  messageFlags,
  type Pair,
  pool,
  ruleSection,
} from './jev-guard.ts'

export type Scored = { p: number; positive: boolean }

export function auc(items: Scored[]): number {
  const pos = items.filter((x) => x.positive).map((x) => x.p)
  const neg = items.filter((x) => !x.positive).map((x) => x.p)
  if (pos.length === 0 || neg.length === 0) return NaN
  let wins = 0
  for (const a of pos) for (const b of neg) wins += a > b ? 1 : a === b ? 0.5 : 0
  return wins / (pos.length * neg.length)
}

export function rates(items: Scored[], at: number) {
  let tp = 0, fp = 0, fn = 0, tn = 0
  for (const x of items) {
    const flagged = x.p > at
    if (flagged && x.positive) tp++
    else if (flagged) fp++
    else if (x.positive) fn++
    else tn++
  }
  return {
    precision: tp + fp === 0 ? 1 : tp / (tp + fp),
    recall: tp + fn === 0 ? 0 : tp / (tp + fn),
    falseAlarm: fp + tn === 0 ? 0 : fp / (fp + tn),
    flagged: tp + fp,
  }
}

/** The lowest threshold on a 0.01 grid from 0.5 at which false alarms stay at or under `bar`. */
export function pickThreshold(items: Scored[], bar: number): number | null {
  for (let t = 50; t < 100; t++) {
    if (rates(items, t / 100).falseAlarm <= bar) return t / 100
  }
  return null
}

export function stripDiacritics(s: string): string {
  return s.normalize('NFD').replace(/[\u0300-\u036f]/g, '').replace(/\u0142/g, 'l').replace(/\u0141/g, 'L')
}

// Hand-made violations: easier than real ones, so detection measured on them is optimistic. The first
// fifteen long strings fed the measurement that picked MESSAGE_AT, so these start after them.
export function badMessages(polish: string[]): string[] {
  const long = polish.filter((t) => t.split(/\s+/).length >= 5).slice(15, 30).map(stripDiacritics)
  return long.map((t, i) => (i % 2 === 0 ? t : `Lab: fix the stage\n\n${t}`))
}

export function mutations(pairs: Pair[], per = 30): Pair[] {
  const long = pairs.filter((p) => p.pl.split(/\s+/).length >= 4)
  const out: Pair[] = []
  const half = Math.max(1, Math.floor(long.length / 2))
  for (let i = 0; i < Math.min(per, long.length); i++) {
    const a = long[i] as Pair
    const b = long[(i + half) % long.length] as Pair
    if (a.pl !== b.pl) out.push({ key: `${a.key} (swapped)`, en: a.en, pl: b.pl })
  }
  for (const a of long.slice(0, per)) {
    const w = a.pl.split(/\s+/)
    out.push({ key: `${a.key} (truncated)`, en: a.en, pl: w.slice(0, Math.ceil(w.length / 2)).join(' ') })
  }
  for (const a of pairs.filter((p) => /\d/.test(p.en) && /\d/.test(p.pl)).slice(0, per)) {
    out.push({ key: `${a.key} (number)`, en: a.en, pl: a.pl.replace(/\d+([.,]\d+)?/g, '').replace(/\s+/g, ' ').trim() })
  }
  return out
}

const ROOT = fromFileUrl(new URL('../../../', import.meta.url))
// The comment sweep: before it, and after the commit that restored what it cut too far.
const BEFORE = '446c853'
const AFTER = 'e7b0d50'
const SWEPT = (f: string) =>
  /^apps\/lab\/src\/.*\.(ts|tsx|css)$/.test(f) || /^packages\/board-element\/src\/.*\.ts$/.test(f) ||
  /^packages\/engine\/lab-[^/]+\.ts$/.test(f)

async function run(cmd: string, args: string[]): Promise<string> {
  const out = await new Deno.Command(cmd, { args, cwd: ROOT, stdout: 'piped', stderr: 'piped' }).output()
  if (!out.success) throw new Error(`${cmd} ${args.join(' ')}: ${new TextDecoder().decode(out.stderr)}`)
  return new TextDecoder().decode(out.stdout)
}

async function labelComments(): Promise<Array<{ file: string; c: Commented; changed: boolean }>> {
  const files = async (rev: string) =>
    (await run('git', ['ls-tree', '-r', '--name-only', rev])).split('\n').filter(SWEPT)
  const norm = (t: string) => t.replace(/\s+/g, ' ').trim()
  const kept = new Set<string>()
  for (const f of await files(AFTER)) {
    for (const c of commentsOf(await run('git', ['show', `${AFTER}:${f}`]), f.endsWith('.css'))) kept.add(norm(c.text))
  }
  const out: Array<{ file: string; c: Commented; changed: boolean }> = []
  for (const f of await files(BEFORE)) {
    for (const c of commentsOf(await run('git', ['show', `${BEFORE}:${f}`]), f.endsWith('.css'))) {
      out.push({ file: f, c, changed: !kept.has(norm(c.text)) })
    }
  }
  return out
}

const pct = (x: number) => `${(x * 100).toFixed(1)}%`
const line = (label: string, r: ReturnType<typeof rates>) =>
  `${label.padEnd(24)} precision ${r.precision.toFixed(3)}  recall ${r.recall.toFixed(3)}  false alarms ${
    pct(r.falseAlarm)
  }  flagged ${r.flagged}`

async function evalComments(judge: Judge): Promise<boolean> {
  const rule = ruleSection(await Deno.readTextFile(`${ROOT}CLAUDE.md`), 'Comments') ?? ''
  const labelled = await labelComments()
  const answers = await pool(labelled, 16, (x) => askComment(judge, rule, x.file, x.c))
  const rows = labelled.flatMap((x, i) => {
    const a = answers[i]
    return a ? [{ ...x, a }] : []
  })
  const scored = (f: (a: Answers) => number) => rows.map((r) => ({ p: f(r.a), positive: r.changed }))
  const shipped = rows.map((r) => ({ p: commentFlag('', r.c, r.a) ? 1 : 0, positive: r.changed }))
  console.log(`blocks ${labelled.length}, answered ${rows.length}, changed ${rows.filter((r) => r.changed).length}`)
  console.log(`AUC violates ${auc(scored((a) => a.violates ?? 0)).toFixed(3)}`)
  console.log(`AUC max(history, spec_ref) ${auc(scored((a) => Math.max(a.history ?? 0, a.spec_ref ?? 0))).toFixed(3)}`)
  for (const t of [0.7, 0.85, 0.9]) console.log(line(`violates > ${t}`, rates(scored((a) => a.violates ?? 0), t)))
  const r = rates(shipped, 0.5)
  console.log(line('shipped rule', r))
  const pass = r.precision >= 0.95
  console.log(`bar: precision >= 0.95 -> ${pass ? 'PASS' : 'FAIL'}`)
  return pass
}

async function evalMessage(judge: Judge): Promise<boolean> {
  // Held out: MESSAGE_AT was picked on the 300 newest commits and the 60 newest PR bodies.
  const commits = (await run('git', ['log', '--no-merges', '--skip=300', '--format=%B%x00', 'HEAD'])).split('\0')
    .map((t) => t.trim()).filter((t) => t !== '')
  const prs = JSON.parse(
    await run('gh', ['pr', 'list', '--state', 'merged', '--limit', '500', '--json', 'number,body']),
  ) as Array<
    { number: number; body: string }
  >
  const older = prs.sort((a, b) => b.number - a.number).slice(60)
  const good = [...commits, ...older.map((p) => p.body.trim()).filter((t) => t !== '')]
  const { PL } = await import('@arrowz/engine/i18n')
  const bad = badMessages(Object.values(PL.ui).filter((v): v is string => typeof v === 'string'))
  const goodA = await pool(good, 16, (t) => askMessage(judge, 'commit', t))
  const badA = await pool(bad, 16, (t) => askMessage(judge, 'commit', t))
  const items: Scored[] = [
    ...goodA.flatMap((a) => (a ? [{ p: a.not_english ?? 0, positive: false }] : [])),
    ...badA.flatMap((a) => (a ? [{ p: a.not_english ?? 0, positive: true }] : [])),
  ]
  const fa = good.filter((t, i) => messageFlags('commit', t, goodA[i] ?? null).length > 0).length / good.length
  const det = bad.filter((t, i) => messageFlags('commit', t, badA[i] ?? null).length > 0).length / bad.length
  console.log(
    `held out: ${commits.length} commits, ${older.length} PRs, ${bad.length} hand-made; not_english AUC ${
      auc(items).toFixed(3)
    }`,
  )
  console.log(`at MESSAGE_AT ${JSON.stringify(MESSAGE_AT)}: false alarms ${pct(fa)}, detection ${pct(det)}`)
  const pass = fa <= 0.03 && det >= 0.8
  console.log(`bar: false alarms <= 3% and detection >= 80% -> ${pass ? 'PASS' : 'FAIL'}`)
  return pass
}

async function evalI18n(judge: Judge): Promise<boolean> {
  const good = await dictionaryPairs()
  const bad = mutations(good)
  const goodA = await pool(good, 16, (p) => askPair(judge, p))
  const badA = await pool(bad, 16, (p) => askPair(judge, p))
  const differs = (a: Answers | null) => 1 - (a?.same_meaning ?? 1)
  const items: Scored[] = [
    ...goodA.flatMap((a) => (a ? [{ p: differs(a), positive: false }] : [])),
    ...badA.flatMap((a) => (a ? [{ p: differs(a), positive: true }] : [])),
  ]
  const pick = pickThreshold(items, 0.03)
  console.log(`pairs ${good.length}, mutations ${bad.length}, AUC ${auc(items).toFixed(3)}`)
  if (pick === null) {
    console.log('no threshold keeps false alarms <= 3% -> FAIL')
    return false
  }
  const r = rates(items, pick)
  console.log(line(`differs > ${pick}`, r))
  for (const kind of ['swapped', 'truncated', 'number']) {
    const sub = bad.flatMap((m, i) => (m.key.endsWith(`(${kind})`) && badA[i] ? [differs(badA[i] ?? null) > pick] : []))
    console.log(`  ${kind}: detected ${sub.filter(Boolean).length} of ${sub.length}`)
  }
  const pass = r.falseAlarm <= 0.03 && r.recall >= 0.8
  console.log(`bar: false alarms <= 3% and detection >= 80% -> ${pass ? 'PASS' : 'FAIL'}`)
  return pass
}

if (import.meta.main) {
  const which = Deno.args[0]
  const judge = await defaultJudge()
  if (judge === null) {
    console.error('jev-eval: no TYPESAFE_API_KEY (see docs/jev-guards.md)')
    Deno.exit(1)
  }
  const evaluate = which === 'comments'
    ? evalComments
    : which === 'message'
    ? evalMessage
    : which === 'i18n'
    ? evalI18n
    : null
  if (evaluate === null) {
    console.error('usage: jev-eval.ts comments | message | i18n')
    Deno.exit(2)
  }
  Deno.exit((await evaluate(judge)) ? 0 : 3)
}
