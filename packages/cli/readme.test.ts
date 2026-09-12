// The README tables are a copy of the knob table `--help=knobs` prints, and a
// copy drifts. Round 11 gave the ranges a test (`envelope.test.ts`), but
// nothing ever compared the documentation with them — so the README kept
// promising `--maxback` "50–1000, steps of 50" while 25 and 75 went through,
// and kept a "Whole numbers" rule that had been deleted.
//
// Both languages carry the same tables. The prose is translated; the machine
// columns — flag, range, step, default — are not, and this test is what says
// so. The tables are found by the HTML anchors above them, so neither the
// heading nor the column names need to be in English.
import { assert, assertEquals } from '@std/assert'
import { dirname, fromFileUrl, join } from '@std/path'
import { formatViolation, validateParams } from '@arrowz/engine'
import { COMMAND_PREFIX, flagViolation, KNOB_ROWS, parseArgs, RULE_ROWS } from '@arrowz/engine/command'

const root = join(dirname(fromFileUrl(import.meta.url)), '..', '..')
const READMES = ['README.md', 'README.pl.md'] as const

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

  // The warning at the end of a row is advice about THIS knob, so every
  // setting it names has to be one the flag would take. Six of the eight
  // pointed at values outside their own row: "--headtries at 1", when 1 had
  // been below the minimum since round 11. Board sizes (400×400) are not
  // settings and are skipped; the bold lead-in is matched rather than the
  // word "Careful", so the Polish page is read by the same rule.
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

  // The page shows what a refusal looks like. Until now nothing checked that it
  // still looks like that: the transcript said `invalid parameters:` with the
  // label the web page prints, months after the CLI had stopped saying either.
  // The command above the block is re-run through the parser and the envelope,
  // and the block has to be what the CLI would print.
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
      const args = shown.slice(COMMAND_PREFIX.length).trim().split(/\s+/).filter((a) => !a.startsWith('--svg'))
      const { params, errors } = parseArgs(args)
      const said = errors.length ? errors : validateParams(params).map(flagViolation)
      assert(said.length, `${shown} is not refused any more`)
      assertEquals(block, ['invalid arguments:', ...said.map((e) => `  - ${e}`), 'see --help'], shown)
      checked++
    }
    assert(checked >= 1, `${file} shows no refusal`)
  })
}

// Every picture in both READMEs is rebuilt by `deno task docs` from the record
// of how it was made, and that task is in no verification gate: narrowing
// probeLen to 4 left `--probelen=2` in the manifest, and nothing said so until
// somebody ran the task. Parsing is enough to catch it and costs nothing —
// carving thirty boards would not fit in a test run.
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
