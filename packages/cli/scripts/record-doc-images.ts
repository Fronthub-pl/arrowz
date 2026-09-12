// Rebuilds every picture README.md and README.pl.md show, from the record of
// how each one was made: docs/images/manifest.json.
//
// Run: deno task docs [name ...]
//
// One entry, two steps: the CLI writes docs/images/<out>.svg, then
// rsvg-convert scales that drawing into docs/images/<out>.png at the width the
// README uses. Naming entries on the command line rebuilds only those.
//
// The boards themselves are a side effect the store would keep; this script
// points ARROWZ_BOARDS_DIR at a temporary directory so that a documentation
// rebuild never fills packages/cli/boards/ with thirty boards.
import { dirname, fromFileUrl, join } from '@std/path'

/** One picture: what to run, and how wide the PNG is. */
interface ImageEntry {
  /** File name without an extension, under docs/images/. */
  out: string
  /** The flags themselves, without --svg (the script adds it). */
  flags: string[]
  /** Width of the PNG in pixels; the height follows the drawing's aspect ratio. */
  width: number
  /** False when the drawing is too big to belong in the repository: only the PNG is kept. */
  keepSvg?: boolean
  /** Anything the entry cannot show on its own. */
  note?: string
}

/** A picture no invocation reproduces, listed so that nobody looks for one. */
interface HandMadeEntry {
  out: string
  why: string
}

interface Manifest {
  images: ImageEntry[]
  handMade: HandMadeEntry[]
}

const RSVG = 'rsvg-convert'
const root = join(dirname(fromFileUrl(import.meta.url)), '..', '..', '..')
const imagesDir = join(root, 'docs', 'images')
const carve = join(root, 'packages', 'cli', 'carve.ts')

function isEntry(value: unknown): value is ImageEntry {
  if (typeof value !== 'object' || value === null) return false
  const e = value as Partial<ImageEntry>
  return typeof e.out === 'string' &&
    Array.isArray(e.flags) && e.flags.every((f) => typeof f === 'string') && typeof e.width === 'number'
}

function readManifest(path: string): Manifest {
  const parsed: unknown = JSON.parse(Deno.readTextFileSync(path))
  if (typeof parsed !== 'object' || parsed === null) throw new Error(`${path} is not an object`)
  const images: unknown = (parsed as Record<string, unknown>).images
  if (!Array.isArray(images) || !images.every(isEntry)) throw new Error(`${path}: "images" is not a list of entries`)
  const handMade: unknown = (parsed as Record<string, unknown>).handMade
  const hand = Array.isArray(handMade)
    ? handMade.filter((h): h is HandMadeEntry =>
      typeof h === 'object' && h !== null && typeof (h as HandMadeEntry).out === 'string' &&
      typeof (h as HandMadeEntry).why === 'string'
    )
    : []
  return { images, handMade: hand }
}

/** Runs a command to completion; its output goes to this process unless it is swallowed. */
async function run(
  cmd: string,
  args: string[],
  opts: { env?: Record<string, string>; quiet?: boolean } = {},
): Promise<void> {
  const io = opts.quiet ? 'null' : 'inherit'
  const child = new Deno.Command(cmd, { args, env: opts.env ?? {}, stdout: io, stderr: io }).spawn()
  const { code } = await child.status
  if (code !== 0) throw new Error(`${cmd} ${args.join(' ')} exited with ${code}`)
}

const manifest = readManifest(join(imagesDir, 'manifest.json'))
const wanted = new Set(Deno.args.filter((a) => !a.startsWith('-')))
const entries = wanted.size ? manifest.images.filter((e) => wanted.has(e.out)) : manifest.images
const missing = [...wanted].filter((name) => !manifest.images.some((e) => e.out === name))
if (missing.length) {
  console.error(`not in the manifest: ${missing.join(', ')}`)
  const hand = manifest.handMade.filter((h) => missing.includes(h.out))
  for (const h of hand) console.error(`  ${h.out}: ${h.why}`)
  Deno.exit(2)
}

// rsvg-convert is the one outside tool this script needs; say so plainly
// rather than failing later with a spawn error nobody can read.
try {
  await run(RSVG, ['--version'], { quiet: true })
} catch {
  console.error(`${RSVG} is not on the PATH; install librsvg (brew install librsvg) and run again`)
  Deno.exit(1)
}

const store = await Deno.makeTempDir({ prefix: 'arrowz-docs-' })
const scratch = await Deno.makeTempDir({ prefix: 'arrowz-docs-svg-' })
let done = 0
for (const entry of entries) {
  const svg = entry.keepSvg === false ? join(scratch, `${entry.out}.svg`) : join(imagesDir, `${entry.out}.svg`)
  const png = join(imagesDir, `${entry.out}.png`)
  const args = [
    'run',
    '--allow-read',
    '--allow-write',
    '--allow-env=ARROWZ_BOARDS_DIR,CARVE_TIMEOUT_S,CARVE_TRACE,GIANT_DEBUG',
    carve,
    ...entry.flags,
    `--svg=${svg}`,
  ]
  console.log(`--- ${entry.out}`)
  await run(Deno.execPath(), args, { env: { ARROWZ_BOARDS_DIR: store } })
  await run(RSVG, ['-w', String(entry.width), svg, '-o', png])
  done++
}
await Deno.remove(store, { recursive: true })
await Deno.remove(scratch, { recursive: true })
console.log(`${done} image${done === 1 ? '' : 's'} rebuilt in docs/images/`)
for (const h of manifest.handMade) console.log(`untouched, drawn by hand: ${h.out} — ${h.why}`)
