// Turns raw pointer samples into intents, with no DOM, so the rules of the
// game design (§11) are tested as a table in Node:
// - mouse and pen, `drag` mode (the default): a plain drag pans and a plain
//   click does nothing; a click with the modifier plays;
// - mouse and pen, `click` mode (the rule before 2026-09-11): a plain click
//   plays; a drag with the modifier pans;
// - either mode: the element checks the click lands on the piece it was
//   pressed on, a repeat press (the browser's own double/triple-click count)
//   does nothing at all, and a move with no button held is taken as the
//   release — its release went somewhere else, or the browser reported the
//   button up before, or instead of, the pointerup;
// - touch: tap = short press within the slop; beyond it one finger pans;
//   two fingers pinch; a second tap close in time and place to the last one
//   does nothing at all, for the same reason as the mouse case above; a
//   primary touch going down drops every other touch still held, since the
//   browser only marks a touch primary when no other is active.
export type PointerKind = 'mouse' | 'touch' | 'pen'

/** Which mouse and pen gesture pans: a plain drag (`drag`) or a drag with the modifier (`click`). */
export type GestureMode = 'drag' | 'click'

export interface PointerSample {
  id: number
  x: number
  y: number
  kind: PointerKind
  /** metaKey || ctrlKey at the time of the sample. */
  modifier: boolean
  /** Event timestamp in ms. */
  t: number
  /** The browser's own repeat count: true when this press is the second or later of a double. */
  repeat: boolean
  /** `buttons & 1` at the time of the sample: whether the primary button (or the pen tip) is down. */
  pressed: boolean
  /** `isPrimary`: for touch, true only when no other touch is active. */
  primary: boolean
}

export type Intent =
  | { type: 'none' }
  | { type: 'click'; pressX: number; pressY: number; x: number; y: number }
  | { type: 'pan'; dx: number; dy: number }
  | { type: 'pinch'; factor: number; x: number; y: number; dx: number; dy: number }

export const TAP_SLOP_PX = 8
export const TAP_MS = 300
/**
 * DOUBLE_TAP_PX and DOUBLE_TAP_MS no longer mark a fit gesture: the design
 * ruled that a second press this close in place and time to the last one is
 * a slipped finger, not an instruction, so it now defines the window in
 * which that repeat is ignored. These two thresholds are ours and govern the
 * touch path only, as a second tap. On mouse and pen the equivalent window
 * belongs to the browser, not to us, and reaches us already decided, as
 * `PointerEvent.detail` (see `PointerSample.repeat`) — which is why the two
 * inputs are suppressed by different mechanisms even though the rule is the
 * same.
 */
export const DOUBLE_TAP_PX = 24
export const DOUBLE_TAP_MS = 300

const NONE: Intent = { type: 'none' }

function dist(a: { x: number; y: number }, b: { x: number; y: number }): number {
  return Math.hypot(a.x - b.x, a.y - b.y)
}

export class GestureMachine {
  private pointers = new Map<number, PointerSample>()
  private press: PointerSample | null = null
  private last: PointerSample | null = null
  private moved = false
  private isPanning = false
  private pinchDist = 0
  private pinchMid: { x: number; y: number } | null = null
  private lastTap: { x: number; y: number; t: number } | null = null
  private currentMode: GestureMode

  constructor(mode: GestureMode = 'drag') {
    this.currentMode = mode
  }

  get mode(): GestureMode {
    return this.currentMode
  }

  /** Applies from the next press: a press already under way keeps the rule it started with. */
  set mode(m: GestureMode) {
    this.currentMode = m
  }

  get panning(): boolean {
    return this.isPanning
  }

  down(p: PointerSample): Intent {
    // The browser marks a touch primary only when no other touch is active,
    // so any touch still held here lost its end somewhere: drop them all.
    if (p.kind === 'touch' && p.primary && this.pointers.size > 0) this.reset()
    this.pointers.set(p.id, p)
    if (this.pointers.size === 1) {
      this.press = p
      this.last = p
      this.moved = false
      // A mouse (or pen) pans with the modifier in `click` mode and without it in `drag` mode.
      this.isPanning = p.kind !== 'touch' && p.modifier !== (this.currentMode === 'drag')
      return NONE
    }
    if (this.pointers.size === 2) {
      const [a, b] = [...this.pointers.values()]
      if (a && b) {
        this.pinchDist = dist(a, b)
        this.pinchMid = { x: (a.x + b.x) / 2, y: (a.y + b.y) / 2 }
      }
      this.moved = true // a pinch is never a tap
      this.isPanning = false
    }
    return NONE
  }

  move(p: PointerSample): Intent {
    if (!this.pointers.has(p.id)) return NONE
    // A mouse or pen moving with no button held is taken as the release: the
    // browser reported the button up before, or instead of, the pointerup.
    if (p.kind !== 'touch' && !p.pressed) return this.up(p)
    this.pointers.set(p.id, p)
    if (this.pointers.size >= 2 && this.pinchMid) {
      const [a, b] = [...this.pointers.values()]
      if (!a || !b) return NONE
      const d = dist(a, b)
      const mid = { x: (a.x + b.x) / 2, y: (a.y + b.y) / 2 }
      const intent: Intent = {
        type: 'pinch',
        factor: this.pinchDist > 0 ? d / this.pinchDist : 1,
        x: mid.x,
        y: mid.y,
        dx: mid.x - this.pinchMid.x,
        dy: mid.y - this.pinchMid.y,
      }
      this.pinchDist = d
      this.pinchMid = mid
      return intent
    }
    if (!this.press || !this.last || p.id !== this.press.id) return NONE
    const prev = this.last
    this.last = p
    if (this.press.kind === 'touch') {
      if (!this.moved && dist(p, this.press) > TAP_SLOP_PX) {
        this.moved = true
        this.isPanning = true
        return { type: 'pan', dx: p.x - this.press.x, dy: p.y - this.press.y }
      }
      if (this.isPanning) return { type: 'pan', dx: p.x - prev.x, dy: p.y - prev.y }
      return NONE
    }
    if (this.isPanning) return { type: 'pan', dx: p.x - prev.x, dy: p.y - prev.y }
    return NONE
  }

  up(p: PointerSample): Intent {
    if (!this.pointers.has(p.id)) return NONE
    this.pointers.delete(p.id)
    if (this.pointers.size === 1) {
      this.dropToOnePointer()
      return NONE
    }
    if (this.pointers.size > 1) return NONE
    const press = this.press
    const wasPanning = this.isPanning
    const moved = this.moved
    this.reset()
    if (!press || press.id !== p.id) return NONE
    if (press.kind === 'touch') {
      if (moved || p.t - press.t > TAP_MS) return NONE
      const tap = { x: p.x, y: p.y, t: p.t }
      // A second tap at the same place inside the window is a slipped finger,
      // not an instruction: it plays nothing and moves nothing.
      const repeat = this.lastTap !== null && tap.t - this.lastTap.t <= DOUBLE_TAP_MS &&
        dist(tap, this.lastTap) <= DOUBLE_TAP_PX
      this.lastTap = tap
      if (repeat) return NONE
      return { type: 'click', pressX: press.x, pressY: press.y, x: p.x, y: p.y }
    }
    if (wasPanning || press.repeat) return NONE
    return { type: 'click', pressX: press.x, pressY: press.y, x: p.x, y: p.y }
  }

  /**
   * Drops every pointer at once: the window losing focus mid-press means the
   * eventual release, if one ever arrives, will land somewhere else. A thin
   * public wrapper over `reset()`; `lastTap` is left alone, as `reset()`
   * leaves it, so a repeat tap right after regaining focus is still caught.
   */
  cancelAll(): void {
    this.reset()
  }

  cancel(id: number): Intent {
    this.pointers.delete(id)
    if (this.pointers.size === 1) {
      this.dropToOnePointer()
      return NONE
    }
    if (this.pointers.size === 0) this.reset()
    return NONE
  }

  /**
   * Shared handling for both `up` and `cancel` when a pointer count drops
   * from 2 (or more) to exactly 1: the surviving pointer becomes the new
   * press/last, the pinch is cleared, and the interaction continues as a
   * pan, never a tap.
   */
  private dropToOnePointer(): void {
    const [rest] = [...this.pointers.values()]
    this.press = rest ?? null
    this.last = rest ?? null
    this.pinchMid = null
    this.moved = true
    this.isPanning = true
  }

  private reset(): void {
    this.pointers.clear()
    this.press = null
    this.last = null
    this.moved = false
    this.isPanning = false
    this.pinchDist = 0
    this.pinchMid = null
  }
}
