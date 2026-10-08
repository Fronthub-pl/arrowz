// The CLI README's tables are a copy of the knob table `--help=knobs` prints, and a copy drifts.
// `envelope.test.ts` tests the ranges; this compares the documentation with them.
//
// The tables are found by the HTML anchors above them, so neither the heading
// nor the column names are part of what is checked.
import { assert, assertEquals } from '@std/assert'
import { dirname, fromFileUrl, join } from '@std/path'
import { formatViolation, generate, layoutHash, PARAM_SPEC, validateParams } from '@arrowz/engine'
import {
  CARVE_FLAGS,
  COMMAND_PREFIX,
  ENV_VARS,
  flagViolation,
  helpText,
  KNOB_ROWS,
  parseArgs,
  RETIRED_FLAGS,
  RULE_ROWS,
  VIEW_RANGE,
} from '@arrowz/engine/command'
import { REPORT_FLAGS } from './report-flags.ts'
import { BUNDLES, defaultChoice, exportCell, simpleParams } from '@arrowz/engine/simple'

const root = join(dirname(fromFileUrl(import.meta.url)), '..', '..')
const READMES = ['packages/cli/README.md'] as const

/**
 * The boards whose stored file names the CLI README prints: `deno task carve
 * --width=40 --height=40 --seed=7` (and its `--svg` twin), and the 25×25 of the
 * store tree, `deno task carve --width=25 --height=25` at the default seed 7.
 * The names embed the settings hash, so they are checked rather than copied.
 */
const DOCUMENTED_BOARDS = [{ W: 40, H: 40, seed: 7 }, { W: 25, H: 25, seed: 7 }] as const

/** The cells of one markdown table row: the leading and trailing pipe go, an escaped `\|` stays. */
function cellsOf(line: string): string[] {
  return line.slice(1, -1).split(/(?<!\\)\|/).map((c) => c.trim())
}

/**
 * The rows of the table below an anchor comment: the header and the dashes are
 * dropped, everything up to the first line that is not a table row is kept.
 */
function tableAt(text: string, anchor: string, file: string): string[][] {
  const lines = text.split('\n')
  const start = lines.findIndex((l) => l.trim() === anchor)
  assert(start >= 0, `${file} has no ${anchor} anchor`)
  const rows: string[][] = []
  for (let i = start + 1; i < lines.length; i++) {
    const line = (lines[i] ?? '').trim()
    if (!line.startsWith('|')) {
      if (rows.length) break
      continue // the blank line and the heading between the anchor and the table
    }
    const cells = cellsOf(line)
    if (cells.every((c) => /^:?-{3,}:?$/.test(c))) continue // the dashes under the header
    rows.push(cells)
  }
  assert(rows.length > 2, `${file}: no table under ${anchor}`)
  return rows.slice(1) // drop the header; the separator was skipped above
}

/** A documentation cell as the help prints it: no backticks, no escaped pipes, en dashes as `..`. */
const plain = (cell: string): string =>
  cell.replace(/`/g, '').replace(/\\\|/g, '|').replace(/(\d)\s*–\s*(\d)/g, '$1..$2').trim()

for (const file of READMES) {
  const text = Deno.readTextFileSync(join(root, file))

  Deno.test(`${file}: the knob table is the one the CLI prints`, () => {
    const rows = tableAt(text, '<!-- knob-table -->', file)
    assertEquals(rows.length, KNOB_ROWS.length, 'one row per flag')
    rows.forEach((cells, i) => {
      const knob = KNOB_ROWS[i]
      assert(knob, `row ${i}`)
      const [, flag, values, step, def] = cells.map(plain)
      assertEquals(flag, knob.flag, `row ${i}: flag`)
      assertEquals(values, knob.values, `${knob.flag}: range`)
      assertEquals(step, knob.step, `${knob.flag}: step`)
      assertEquals(def, knob.def, `${knob.flag}: default`)
    })
  })

  // A knob lands in the hand-written unbundled list by default, so the sentence goes stale by doing
  // nothing. The list is read off the page and compared with the one BUNDLES implies; the board knobs
  // and `mix` are left out (`--width`, `--height` and `--seed` are nobody's bundle, `--start` writes `mix`).
  Deno.test(`${file}: the knobs in no bundle are the ones the page lists`, () => {
    const lines = text.split('\n')
    const start = lines.findIndex((l) => l.trim() === '<!-- unbundled -->')
    assert(start >= 0, `${file} has no unbundled anchor`)
    const para: string[] = []
    for (let i = start + 1; i < lines.length; i++) {
      const line = (lines[i] ?? '').trim()
      if (!line && para.length) break
      if (line) para.push(line)
    }
    const listed = [...para.join(' ').matchAll(/`([a-z]+)`/g)].map((m) => m[1])
    const bundled = new Set(Object.values(BUNDLES).flat())
    const want = PARAM_SPEC
      .filter((s) => s.group !== 'board' && s.key !== 'mix' && !bundled.has(s.key))
      .map((s) => s.key.toLowerCase())
    assertEquals(listed, want, 'the knobs the page says are in no bundle')
  })

  Deno.test(`${file}: the rules table names every rule and the flags it is about`, () => {
    const rows = tableAt(text, '<!-- rule-table -->', file)
    assertEquals(rows.length, RULE_ROWS.length, 'one row per rule')
    rows.forEach((cells, i) => {
      const rule = RULE_ROWS[i]
      assert(rule, `row ${i}`)
      const flags = plain(cells[0] ?? '').split(',').map((f) => f.trim())
      assertEquals(flags, [...rule.flags], `rule ${rule.key}`)
    })
  })

  // The warning at the end of a row is advice about THIS knob, so every setting it names has to be one
  // the flag would take. Board sizes (400×400) are not settings and are skipped; the bold lead-in is
  // matched rather than the word "Careful", so the Polish page is read by the same rule.
  Deno.test(`${file}: a warning only names settings its own flag would take`, () => {
    const rows = tableAt(text, '<!-- knob-table -->', file)
    let checked = 0
    rows.forEach((cells, i) => {
      const knob = KNOB_ROWS[i]
      if (!knob) return
      const warning = /\*\*[^*]+:\*\*(.*)$/.exec(cells[cells.length - 1] ?? '')
      if (!warning) return
      const bounds = /(-?[\d.]+)\.\.(-?[\d.]+)$/.exec(knob.values)
      assert(bounds, `${knob.flag}: a warning on a row with no numeric range`)
      const [lo, hi] = [Number(bounds[1]), Number(bounds[2])]
      for (const m of (warning[1] ?? '').replace(/\d+\s*×\s*\d+/g, ' ').matchAll(/(?<![\w.,])\d+(?:[.,]\d+)?/g)) {
        const n = Number(m[0].replace(',', '.'))
        checked++
        assert(n >= lo && n <= hi, `${knob.flag}: its warning names ${n}, outside its own ${lo}..${hi}`)
      }
    })
    assert(checked >= 8, `only ${checked} numbers checked`)
  })

  // The page shows what a refusal looks like: the command above the block is re-run through the parser
  // and the envelope, and the block has to be what the CLI would print.
  Deno.test(`${file}: a documented refusal is the one the CLI prints`, () => {
    const lines = text.split('\n')
    let command: string | null = null
    let checked = 0
    for (let i = 0; i < lines.length; i++) {
      const line = lines[i] ?? ''
      if (line.trim() === '```sh') {
        command = (lines[i + 1] ?? '').trim()
        continue
      }
      if (line.trim() !== '```' || (lines[i + 1] ?? '').trim() !== 'invalid arguments:') continue
      const block: string[] = []
      for (let j = i + 1; j < lines.length && (lines[j] ?? '').trim() !== '```'; j++) block.push(lines[j] ?? '')
      const shown = command ?? ''
      assert(shown.startsWith(COMMAND_PREFIX), `no command above the refusal in ${file}`)
      // The shell removes the quotes buildCommand puts around a colour.
      const words = shown.slice(COMMAND_PREFIX.length).trim().split(/\s+/).map((a) => a.replaceAll("'", ''))
      const args = words.filter((a) => !a.startsWith('--svg'))
      const { params, errors } = parseArgs(args)
      const said = errors.length ? errors : validateParams(params).map(flagViolation)
      assert(said.length, `${shown} is not refused any more`)
      assertEquals(block, ['invalid arguments:', ...said.map((e) => `  - ${e}`), 'see --help'], shown)
      checked++
    }
    assert(checked >= 1, `${file} shows no refusal`)
  })

  // The range in the prose is a third copy of the seed bounds, beside the knob table and the CLI's own
  // help. Found by an anchor rather than by its heading, because the headings are translated.
  Deno.test(`${file}: the seed paragraph states the range PARAM_SPEC gives`, () => {
    const spec = PARAM_SPEC.find((s) => s.key === 'seed')
    assert(spec, 'PARAM_SPEC has no seed')
    const lines = text.split('\n')
    const start = lines.findIndex((l) => l.trim() === '<!-- seed-range -->')
    assert(start >= 0, `${file} has no seed-range anchor`)
    const para: string[] = []
    for (let i = start + 1; i < lines.length; i++) {
      const line = (lines[i] ?? '').trim()
      if (!line) {
        if (para.length) break
        continue
      }
      para.push(line)
    }
    assert(para.length, `${file}: nothing under the seed-range anchor`)
    const numbers = [...para.join(' ').matchAll(/\d+/g)].map((m) => Number(m[0]))
    // Order and all: the paragraph reads "from MIN to MAX … default DEF" in
    // both languages, so a number added or moved is a sentence to re-read.
    assertEquals(numbers, [spec.min, spec.max, spec.def], 'the numbers of the seed paragraph')
  })

  Deno.test(`${file}: the stored file names are the layout hashes of the boards shown`, async () => {
    const expected = new Set<string>()
    for (const board of DOCUMENTED_BOARDS) {
      expected.add(await layoutHash(generate(simpleParams({ ...defaultChoice(), ...board })).board))
    }
    const documented = new Set(text.match(/sha256-[0-9a-f]{64}/g) ?? [])
    assertEquals(Array.from(documented).sort(), Array.from(expected).sort())
    assertEquals(/seed\d+-[0-9a-f]{8}/.test(text), false, 'no store name under the old seed scheme is left')
  })
}

// Every picture in the READMEs is rebuilt by `deno task docs` from the record of how it was made, and
// that task is in no verification gate. Parsing the recorded commands is enough to catch a stale one and
// costs nothing; carving thirty boards would not fit in a test run.
Deno.test('every documented picture is still a command the CLI accepts', () => {
  const manifest = JSON.parse(Deno.readTextFileSync(join(root, 'docs', 'images', 'manifest.json')))
  const entries = (manifest as { images?: { out: string; flags: string[] }[] }).images
  assert(entries && entries.length > 20, 'the manifest lists the pictures')
  for (const entry of entries) {
    const { errors, params } = parseArgs(entry.flags.filter((f) => !f.startsWith('--svg')))
    assertEquals(errors, [], `${entry.out}: ${entry.flags.join(' ')}`)
    assertEquals(validateParams(params).map(formatViolation), [], entry.out)
  }
})

// The CLI README against the CLI itself, both ways: every flag `carve` and
// `report` take, every variable the tasks may read and every task is named,
// and nothing the README names is missing from the code. The flag list is the
// parser's own table (CARVE_FLAGS), and the variables are the tasks'
// `--allow-env` grants: what the runtime would let the CLI read at all.
const cliReadme = Deno.readTextFileSync(join(root, 'packages', 'cli', 'README.md'))
const cliTasks = (JSON.parse(Deno.readTextFileSync(join(root, 'packages', 'cli', 'deno.json'))) as {
  tasks: Record<string, string>
}).tasks
const rootTasks = (JSON.parse(Deno.readTextFileSync(join(root, 'deno.json'))) as { tasks: Record<string, string> })
  .tasks
const reportFlags = [...REPORT_FLAGS].map((name) => `--${name}`)
const envGranted = new Set(
  Object.values(cliTasks).flatMap((task) =>
    [...task.matchAll(/--allow-env=([\w,]+)/g)].flatMap((m) => (m[1] ?? '').split(','))
  ),
)

/** Whether the README writes `flag` as a token of its own, not inside a longer flag. */
const names = (flag: string): boolean => new RegExp(`(?<![\\w-])${flag}(?![\\w-])`).test(cliReadme)

const missing = (flags: readonly string[]): string[] => flags.filter((flag) => !names(flag))

Deno.test('the CLI README names every flag carve takes', () => {
  assertEquals(missing(CARVE_FLAGS), [])
})

Deno.test('the CLI README names every flag report takes', () => {
  assertEquals(missing(reportFlags), [])
})

Deno.test('the CLI README names every variable the tasks may read', () => {
  assert(envGranted.size > 0, 'no --allow-env grant was found in packages/cli/deno.json')
  assertEquals([...envGranted].filter((name) => !cliReadme.includes(name)), [])
})

Deno.test('the CLI README runs every task of the CLI', () => {
  assertEquals(Object.keys(cliTasks).filter((task) => !cliReadme.includes(`deno task ${task}`)), [])
})

// A retired spelling is part of what the CLI does: it refuses it by name and
// says what replaced it, so the README may mention one.
Deno.test('every flag the CLI README names is one the CLI takes or refuses by name', () => {
  const known = new Set([...CARVE_FLAGS, ...RETIRED_FLAGS, ...reportFlags])
  const written = new Set(
    [...cliReadme.matchAll(/(?<![\w-])--([a-zA-Z][\w-]*)/g)].map((m) => `--${(m[1] ?? '').toLowerCase()}`),
  )
  assertEquals([...written].filter((flag) => !known.has(flag)), [])
})

Deno.test('every variable the CLI README names is one a task may read', () => {
  const written = new Set([...cliReadme.matchAll(/\b(?:ARROWZ|CARVE|GIANT)_[A-Z_]+\b/g)].map((m) => m[0]))
  assertEquals([...written].filter((name) => !envGranted.has(name)), [])
})

// The help and the Docs page list ENV_VARS; the runtime lets the CLI read the grant.
Deno.test('ENV_VARS is exactly what the tasks may read', () => {
  assertEquals(ENV_VARS.map((v) => v.name).sort(), [...envGranted].sort())
})

Deno.test('every task the CLI README runs exists', () => {
  const written = new Set([...cliReadme.matchAll(/deno task ([\w:-]+)/g)].map((m) => m[1] ?? ''))
  assertEquals([...written].filter((task) => !(task in rootTasks)), [])
})

/** The paragraph right under an anchor comment, as one line. */
function paragraphAt(text: string, anchor: string): string {
  const lines = text.split('\n')
  const start = lines.findIndex((l) => l.trim() === anchor)
  assert(start >= 0, `the CLI README has no ${anchor} anchor`)
  const para: string[] = []
  for (let i = start + 1; i < lines.length; i++) {
    const line = (lines[i] ?? '').trim()
    if (!line && para.length) break
    if (line) para.push(line)
  }
  assert(para.length, `nothing under ${anchor}`)
  return para.join(' ')
}

/** Every fenced block that is not a command, with the last `sh` command above it. */
function outputsOf(text: string): { command: string; block: string[] }[] {
  const lines = text.split('\n')
  const out: { command: string; block: string[] }[] = []
  let command = ''
  for (let i = 0; i < lines.length; i++) {
    const fence = (lines[i] ?? '').trim()
    if (!fence.startsWith('```')) continue
    const block: string[] = []
    for (i++; i < lines.length && (lines[i] ?? '').trim() !== '```'; i++) block.push(lines[i] ?? '')
    if (fence === '```sh') command = (block[0] ?? '').trim()
    else out.push({ command, block })
  }
  return out
}

/** Runs one of the CLI's programs with the board store in a temporary directory, so nothing reaches the real one. */
async function runCli(program: string, args: readonly string[]): Promise<{ stdout: string; stderr: string }> {
  const dir = Deno.makeTempDirSync({ prefix: 'arrowz-readme-' })
  try {
    const r = await new Deno.Command(Deno.execPath(), {
      args: ['run', '--allow-read', '--allow-write', '--allow-env', join(root, 'packages', 'cli', program), ...args],
      cwd: join(root, 'packages', 'cli'),
      env: { ARROWZ_BOARDS_DIR: dir },
      stdin: 'null',
    }).output()
    const text = new TextDecoder()
    return { stdout: text.decode(r.stdout), stderr: text.decode(r.stderr) }
  } finally {
    Deno.removeSync(dir, { recursive: true })
  }
}

const NUMBER_WORDS = ['zero', 'one', 'two', 'three', 'four', 'five', 'six', 'seven', 'eight', 'nine', 'ten']
  .concat(['eleven', 'twelve', 'thirteen', 'fourteen', 'fifteen', 'sixteen', 'seventeen', 'eighteen', 'nineteen'])

/** The flags of one section of the short `--help`, from its heading to the blank line after it. */
function helpSection(heading: string): string[] {
  const lines = helpText().split('\n')
  const start = lines.findIndex((l) => l.startsWith(heading))
  assert(start >= 0, `--help has no ${heading} section`)
  const end = lines.findIndex((l, i) => i > start && !l.trim())
  return lines.slice(start + 1, end).map((l) => l.trim().split(/[\s=]/)[0] ?? '')
}

Deno.test('the CLI README counts the everyday and the picture flags --help lists', () => {
  const said = [...paragraphAt(cliReadme, '<!-- flag-counts -->').toLowerCase().matchAll(/[a-z]+/g)]
    .map((m) => NUMBER_WORDS.indexOf(m[0]))
    .filter((n) => n >= 0)
  const everyday = helpSection('Everyday:')
  const size = everyday.filter((f) => f === '--width' || f === '--height').length
  const luck = everyday.filter((f) => f === '--seed').length
  assertEquals(said, [everyday.length, size, luck, everyday.length - size - luck, helpSection('Picture').length])
})

// The paragraph states the rule in words; the rule is held against exportCell at
// every side, square and with the height as the longer side.
Deno.test('the CLI README states the --cell default exportCell computes, and the ranges', () => {
  const said = [...paragraphAt(cliReadme, '<!-- cell-top -->').matchAll(/\d+/g)].map((m) => Number(m[0]))
  assertEquals(said.length, 5, 'the numbers of the --cell and --top paragraph')
  const [min = NaN, max = NaN, long = NaN, cap = NaN, top = NaN] = said
  assertEquals([min, max, top], [VIEW_RANGE.cell.min, VIEW_RANGE.cell.max, VIEW_RANGE.top.max], 'the ranges')
  for (let side = 4; side <= 1000; side++) {
    const want = Math.max(min, Math.min(cap, Math.round(long / side)))
    assertEquals(exportCell(side, side), want, `${side}x${side}`)
    assertEquals(exportCell(4, side), want, `4x${side}`)
  }
})

Deno.test('the CLI README names every retired flag, and quotes the message one gets', () => {
  const para = paragraphAt(cliReadme, '<!-- retired-flags -->')
  const written = new Set([...para.matchAll(/(?<![\w-])--[a-z][\w-]*/g)].map((m) => m[0]))
  assertEquals(RETIRED_FLAGS.filter((flag) => !written.has(flag)), [])
  const quoted = /^\*\*`(--[a-z]+) (.*?) …`\*\*/.exec(para)
  assert(quoted, 'the paragraph opens with a quoted message')
  const { problems, errors } = parseArgs(['--width=10', '--height=10', `${quoted[1]}=0.5`])
  assertEquals(problems.map((p) => p.kind), ['retired'], quoted[1])
  assert(errors[0]?.startsWith(`${quoted[1]} ${quoted[2]}`), `${errors[0]} is not what the README quotes`)
})

// The notes are printed by the top level of carve.ts, so the program is run.
Deno.test('every note the CLI README shows is what carve prints for the command above it', async () => {
  const shown = outputsOf(cliReadme).filter(({ block }) => block[0]?.startsWith('note:'))
  assert(shown.length >= 3, `only ${shown.length} note blocks`)
  for (const { command, block } of shown) {
    assert(command.startsWith(COMMAND_PREFIX) && command.includes('--dry-run'), command)
    const { stderr } = await runCli('carve.ts', command.slice(COMMAND_PREFIX.length).trim().split(/\s+/))
    assertEquals(stderr.split('\n').filter((l) => l.startsWith('note:')), block, command)
  }
})

// The report's seeds are fixed, so its numbers are too; only the elided lines and the time are skipped.
Deno.test('the report output in the CLI README is what the report prints', async () => {
  const at = cliReadme.indexOf('<!-- report-output -->')
  assert(at >= 0, 'the CLI README has no report-output anchor')
  const [shown] = outputsOf(cliReadme.slice(at))
  const before = cliReadme.slice(0, at).split('\n')
  const command = (before[before.findLastIndex((l) => l.trim() === '```sh') + 1] ?? '').trim()
  const prefix = 'deno task report'
  assert(shown && command.startsWith(prefix), `no report command above the anchor: ${command}`)
  const printed = (await runCli('report.ts', command.slice(prefix.length).trim().split(/\s+/))).stdout.split('\n')
  assertEquals(shown.block[0], printed[0], 'the first line')
  let from = 0
  for (const line of shown.block) {
    if (line.trim() === '...' || line.trimStart().startsWith('time ')) continue
    const found = printed.indexOf(line, from)
    assert(found >= 0, `the report does not print, in this order: ${line}`)
    from = found + 1
  }
})
