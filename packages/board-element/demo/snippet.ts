// The inspector's HTML pane: the element on screen, written out as the markup
// and the two assignments that would reproduce it.
import { ATTRIBUTES, type ControlValue, VIEW_CONTROLS } from './controls.ts'

/** What generated the board on screen. `view` and `board` have no attributes to read. */
export interface BoardSummary {
  W: number
  H: number
  seed: number
}

export interface SnippetState {
  /** The element's attributes, name and value as the DOM holds them. */
  attrs: readonly (readonly [string, string])[]
  /** Every `view` field the panel drives. */
  view: Readonly<Record<string, ControlValue>>
  /** null before the first generation. */
  board: BoardSummary | null
}

/** Trims the tail a float step leaves behind: 0.30000000000000004 prints as 0.3. */
function num(v: number): string {
  return String(Number(v.toFixed(3)))
}

function literal(v: ControlValue): string {
  if (typeof v === 'number') return num(v)
  if (typeof v === 'boolean') return String(v)
  return `'${v}'`
}

/**
 * The opening tag, built from the table rather than from the DOM's own order,
 * so a flag toggled twice does not travel to the end of the line. Only values
 * that differ from the element's defaults are printed: a tag carrying every
 * attribute at its default describes nothing, and the point of a snippet is the
 * shortest thing that reproduces what is on screen.
 */
function tag(attrs: readonly (readonly [string, string])[]): string {
  const held = new Map(attrs)
  const parts: string[] = []
  for (const control of ATTRIBUTES) {
    const value = held.get(control.id)
    if (value === undefined) continue
    // A present attribute means true; only a flag defaulting to false is worth
    // printing, and a bare name is how it prints.
    if (control.kind === 'bool') {
      if (!control.def) parts.push(control.id)
      continue
    }
    if (value !== String(control.def)) parts.push(`${control.id}="${value}"`)
  }
  return `<arrowz-board${parts.map((p) => ` ${p}`).join('')}></arrowz-board>`
}

/** The `view` fields that differ from DEFAULT_VIEW, or '' when none do. */
function viewLiteral(view: Readonly<Record<string, ControlValue>>): string {
  const parts: string[] = []
  for (const control of VIEW_CONTROLS) {
    const value = view[control.id]
    if (value === undefined) continue
    const same = typeof value === 'number' && typeof control.def === 'number'
      ? num(value) === num(control.def)
      : value === control.def
    if (!same) parts.push(`${control.id}: ${literal(value)}`)
  }
  return parts.length === 0 ? '' : `{ ${parts.join(', ')} }`
}

export function snippet(state: SnippetState): string {
  const lines = [
    tag(state.attrs),
    '<script type="module">',
    "  import '@arrowz/board-element'",
    "  import { defaultParams, generate } from '@arrowz/engine'",
    "  const el = document.querySelector('arrowz-board')",
  ]
  const board = state.board
  if (board) {
    lines.push(`  el.board = generate({ ...defaultParams(), W: ${board.W}, H: ${board.H}, seed: ${board.seed} }).board`)
  }
  const view = viewLiteral(state.view)
  if (view) lines.push(`  el.view = ${view}`)
  lines.push('</script>')
  return lines.join('\n')
}
