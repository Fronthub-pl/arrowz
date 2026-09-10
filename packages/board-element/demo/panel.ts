// The inspector's DOM: the control rows built from the table, and the event
// console. Nothing here knows about <arrowz-board> — main.ts owns that wiring,
// so this file can be read as "how a control looks" and nothing else.
import type { Control, ControlValue } from './controls.ts'
import { EventLog, formatDetail } from './events.ts'

type ControlInput = HTMLInputElement | HTMLSelectElement

function inputFor(control: Control, value: ControlValue): ControlInput {
  if (control.kind === 'select') {
    const select = document.createElement('select')
    for (const option of control.options) {
      const item = document.createElement('option')
      item.value = option
      item.textContent = option
      select.append(item)
    }
    select.value = String(value)
    return select
  }
  const input = document.createElement('input')
  if (control.kind === 'bool') {
    input.type = 'checkbox'
    input.checked = value === true
    return input
  }
  if (control.kind === 'color') {
    input.type = 'color'
    input.value = String(value)
    return input
  }
  input.type = 'number'
  input.min = String(control.min)
  input.max = String(control.max)
  input.step = String(control.step)
  input.value = String(value)
  return input
}

/**
 * The value an input holds, in the shape its control declared.
 *
 * A half-typed number ('', '-', '0.') is not a value: reporting it would push
 * NaN into the element the moment someone clears the field to retype it, so the
 * caller is told nothing until the field parses.
 */
function valueOf(control: Control, input: ControlInput): ControlValue | null {
  if (input instanceof HTMLSelectElement) return input.value
  if (control.kind === 'bool') return input.checked
  if (control.kind === 'number') {
    const n = Number(input.value)
    return input.value === '' || !Number.isFinite(n) ? null : n
  }
  return input.value
}

/**
 * One row per control: name, input, and the line saying what it does.
 *
 * Returns the way to pull the inputs back in line with the element, for the
 * changes the demo makes itself — losing the last life clears `play`, and the
 * checkbox saying otherwise would be the panel lying about the board. The input
 * under the cursor is left alone: rewriting `0.0` to `0` mid-word would move
 * the caret out from under whoever is typing.
 */
export function buildControls(
  host: HTMLElement,
  controls: readonly Control[],
  read: (control: Control) => ControlValue,
  onChange: (control: Control, value: ControlValue) => void,
): () => void {
  const inputs: (readonly [Control, ControlInput])[] = []
  for (const control of controls) {
    const row = document.createElement('label')
    row.className = 'control'
    const name = document.createElement('span')
    name.className = 'name'
    name.textContent = control.label
    const input = inputFor(control, read(control))
    input.addEventListener('input', () => {
      const value = valueOf(control, input)
      if (value !== null) onChange(control, value)
    })
    const hint = document.createElement('span')
    hint.className = 'hint'
    hint.textContent = control.hint
    row.append(name, input, hint)
    host.append(row)
    inputs.push([control, input])
  }
  return () => {
    for (const [control, input] of inputs) {
      if (input === document.activeElement) continue
      const value = read(control)
      if (input instanceof HTMLInputElement && control.kind === 'bool') input.checked = value === true
      else input.value = String(value)
    }
  }
}

function stamp(): string {
  const now = new Date()
  return `${now.toTimeString().slice(0, 8)}.${String(now.getMilliseconds()).padStart(3, '0')}`
}

/**
 * The rows of events, with a checkbox per type.
 *
 * A muted type is dropped before it reaches the log rather than hidden with
 * CSS: `viewport-change` fires once a frame while a drag is in flight, and a
 * type nobody is reading should not be spending the buffer that the four game
 * events share. Turning it back on starts from the next event, not from history.
 */
export class EventConsole {
  private readonly log = new EventLog()
  private readonly list: HTMLElement
  private readonly shown = new Map<string, boolean>()
  private lastRow: HTMLElement | null = null

  constructor(list: HTMLElement, filters: HTMLElement, types: readonly string[], muted: readonly string[]) {
    this.list = list
    for (const type of types) {
      const on = !muted.includes(type)
      this.shown.set(type, on)
      const label = document.createElement('label')
      label.className = 'filter'
      const box = document.createElement('input')
      box.type = 'checkbox'
      box.checked = on
      box.addEventListener('change', () => this.shown.set(type, box.checked))
      label.append(box, document.createTextNode(type))
      filters.append(label)
    }
  }

  record(type: string, detail: unknown): void {
    if (this.shown.get(type) !== true) return
    // Sticky only while the reader is at the bottom: scrolling up to study a
    // row must not be undone by the next event.
    const stick = this.list.scrollTop + this.list.clientHeight >= this.list.scrollHeight - 4
    const effect = this.log.add(type, formatDetail(detail), stamp())
    if (effect.kind === 'repeat') {
      const row = this.lastRow
      if (row) {
        const count = row.querySelector('.count')
        const time = row.querySelector('.time')
        if (count) count.textContent = `×${effect.entry.count}`
        if (time) time.textContent = effect.entry.time
      }
    } else {
      if (effect.evicted) this.list.firstElementChild?.remove()
      const row = document.createElement('div')
      row.className = 'event'
      row.append(
        span('time', effect.entry.time),
        span(`type type-${type}`, type),
        span('detail', effect.entry.detail),
        span('count', ''),
      )
      this.list.append(row)
      this.lastRow = row
    }
    if (stick) this.list.scrollTop = this.list.scrollHeight
  }

  clear(): void {
    this.log.clear()
    this.list.replaceChildren()
    this.lastRow = null
  }
}

function span(className: string, text: string): HTMLSpanElement {
  const el = document.createElement('span')
  el.className = className
  el.textContent = text
  return el
}
