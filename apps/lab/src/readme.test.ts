// README.md describes the lab as the code defines it, and the code is the
// source of truth: the routes of AppRoutes, the keys the lab binds
// (shownKeys), the palette's run and go-to commands, the fields a link
// carries (LINK_FIELDS), the two ports, the Nx targets, and the screenshots
// of docs/screenshots.json. Each comparison runs both ways, so a row for
// something removed fails as surely as a missing row.
//
// Prose around the tables is not checked; the tables are found by their
// section heading and the first cell of their header row.
import { dictionary } from '@fronthub/arrowz-engine/i18n'
import { beforeEach, expect, test } from 'vitest'
import labConfig from '../vite.config.ts'
import { LAB_SERVER } from '../vite.proxy.ts'
import { buildCommands } from './palette/commands'
import type { RunControl } from './run/useRun'
import { shownKeys } from './shell/hotkeys'
import { useStore } from './state/store'
import { LINK_FIELDS } from './state/url'
import readme from '../README.md?raw'
import projectJson from '../project.json?raw'
import manifestJson from '../docs/screenshots.json?raw'
import appRoutes from './AppRoutes.tsx?raw'

/** The pictures in docs/screenshots/, by file name. */
const pictures = Object.keys(import.meta.glob('../docs/screenshots/*')).map((path) => path.replace(/^.*\//, ''))

/** The cells of one table row: the outer pipes go, an escaped `\|` stays in its cell. */
const cellsOf = (line: string) =>
  line
    .slice(1, -1)
    .split(/(?<!\\)\|/)
    .map((cell) => cell.trim())

/** The README from a heading to the next heading of the same or a higher level. */
function section(heading: string): string {
  const lines = readme.split('\n')
  const start = lines.indexOf(heading)
  if (start === -1) throw new Error(`README has no "${heading}" heading`)
  const level = /^#+/.exec(heading)?.[0].length ?? 0
  const end = lines.findIndex(
    (line, i) => i > start && /^#+ /.test(line) && (/^#+/.exec(line)?.[0].length ?? 0) <= level,
  )
  return lines.slice(start + 1, end === -1 ? undefined : end).join('\n')
}

/** The body rows of the one table in a section whose header starts with `header`; none is an error. */
function table(heading: string, header: string): string[][] {
  const lines = section(heading).split('\n')
  const start = lines.findIndex((line) => line.startsWith('|') && cellsOf(line)[0] === header)
  if (start === -1) throw new Error(`"${heading}" has no table headed "${header}"`)
  const rows: string[][] = []
  for (const line of lines.slice(start + 2)) {
    if (!line.startsWith('|')) break
    rows.push(cellsOf(line))
  }
  if (rows.length === 0) throw new Error(`the "${header}" table of "${heading}" has no rows`)
  return rows
}

/** The first backticked span of a cell. */
function code(cell: string | undefined): string {
  const m = /`([^`]+)`/.exec(cell ?? '')
  if (m?.[1] === undefined) throw new Error(`no code span in "${cell}"`)
  return m[1]
}

const firstColumn = (heading: string, header: string) => table(heading, header).map((row) => code(row[0]))
const sorted = (values: Iterable<string>) => [...values].sort()

test('the route table is the routes AppRoutes declares, both ways', () => {
  const declared = [...appRoutes.matchAll(/<Route path="([^"]+)"/g)].map((m) => m[1] ?? '')
  expect(declared.length).toBeGreaterThan(3)
  expect(sorted(firstColumn('## The screens', 'Route'))).toEqual(sorted(declared))
})

test('the key table is WORKSPACE_KEYS and COMMAND_KEYS, both ways', () => {
  expect(sorted(firstColumn('## Keys', 'Key'))).toEqual(sorted(shownKeys()))
})

const control: RunControl = { start: () => {}, abort: () => {}, hold: () => {}, checkSeeds: () => {} }

// The palette as the README describes it: English, the advanced view, nothing running.
beforeEach(() => {
  useStore.setState((state) => ({ ui: { ...state.ui, mode: 'advanced' } }))
  useStore.getState().lang.setLang('en')
  useStore.getState().params.reset()
  useStore.getState().run.reset()
})

test('the palette table is the run and go-to commands, both ways', () => {
  const deps = { control, navigate: () => {}, dict: dictionary('en') }
  const commands = buildCommands(deps, useStore.getState()).filter(
    (row) => row.section === 'run' || row.section === 'go',
  )
  expect(sorted(firstColumn('## The command palette', 'Command'))).toEqual(sorted(commands.map((row) => row.name)))
})

test('the link table is the view fields a link carries, and its language, both ways', () => {
  expect(sorted(firstColumn('## Links', 'Field'))).toEqual(sorted(LINK_FIELDS))
})

test('the ports the README names are the ones the lab and its proxy use', () => {
  const labPort = labConfig.server?.port
  const storePort = new URL(LAB_SERVER).port
  expect(labPort).toBeTypeOf('number')
  const start = section('## Starting it')
  expect(start).toContain(`localhost:${labPort}`)
  expect(start).toContain(`the lab (${labPort})`)
  expect(start).toContain(`the board store (${storePort})`)
})

test('the target table is the Nx targets of project.json, both ways', () => {
  const targets = Object.keys((JSON.parse(projectJson) as { targets: Record<string, unknown> }).targets)
  expect(sorted(firstColumn('## Development', 'Target'))).toEqual(sorted(targets))
})

interface Shot {
  out: string
  caption: string
}

test('the screenshots section shows every shot of the manifest, in order, under its caption, and no other', () => {
  const { shots } = JSON.parse(manifestJson) as { shots: Shot[] }
  const text = section('## Screenshots')
  // A Markdown image, or an <img> where a shot is set beside another.
  const shown = [...text.matchAll(/!\[([^\]]*)\]\(([^)]+)\)|<img src="([^"]+)" alt="([^"]*)"/g)].map((m) =>
    m[1] === undefined ? { src: m[3], alt: m[4] } : { src: m[2], alt: m[1] },
  )
  expect(shown).toEqual(shots.map((shot) => ({ src: `docs/screenshots/${shot.out}.png`, alt: shot.caption })))
})

test('docs/screenshots holds exactly the manifest’s pictures', () => {
  const { shots } = JSON.parse(manifestJson) as { shots: Shot[] }
  expect(sorted(pictures)).toEqual(sorted(shots.map((shot) => `${shot.out}.png`)))
})

test('every image the README shows is a file that exists', () => {
  const files = new Set(pictures)
  const srcs = [...readme.matchAll(/\]\((docs\/screenshots\/[^)]+)\)|src="(docs\/screenshots\/[^"]+)"/g)].map(
    (m) => m[1] ?? m[2] ?? '',
  )
  expect(srcs.length).toBeGreaterThan(0)
  for (const src of srcs) expect(files.has(src.replace('docs/screenshots/', '')), src).toBe(true)
})
