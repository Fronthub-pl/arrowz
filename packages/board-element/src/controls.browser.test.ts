import { defaultParams, generate } from '@arrowz/engine'
import { afterEach, beforeEach, describe, expect, test } from 'vitest'
import { cdp } from 'vitest/browser'
import { type ArrowzBoard, DEFAULT_PAD, GESTURE_STORAGE_KEY, ZOOM_STEP } from './arrowz-board.ts'
import './mod.ts'

const raf = () => new Promise<void>((r) => requestAnimationFrame(() => r()))

/** Cell size of a 30x30 board fitted into the 300 px host of `mount`, margin included. */
const FIT = 300 / (30 + 2 * DEFAULT_PAD)

let el: ArrowzBoard
/** Mounts a 300 px board whose light DOM is `children`, parsed before the element connects. */
async function mount(attrs: Record<string, string> = {}, children = ''): Promise<ArrowzBoard> {
  el = document.createElement('arrowz-board')
  el.style.width = '300px'
  el.style.height = '300px'
  for (const [k, v] of Object.entries(attrs)) el.setAttribute(k, v)
  el.innerHTML = children
  document.body.append(el)
  el.board = generate({ ...defaultParams(), W: 30, H: 30, seed: 7 }).board
  await el.updateComplete
  await raf() // the ResizeObserver delivers the host size on its own frame
  await raf()
  return el
}

/** An element of the host's own content. */
function light(selector: string): HTMLElement {
  const node = el.querySelector<HTMLElement>(selector)
  if (!node) throw new Error(`no ${selector} in the light DOM`)
  return node
}

/** An element of the shadow tree, fallback controls included. */
function shadow(selector: string): HTMLElement {
  const node = el.shadowRoot?.querySelector<HTMLElement>(selector)
  if (!node) throw new Error(`no ${selector} in the shadow root`)
  return node
}

beforeEach(() => {
  document.body.innerHTML = ''
  localStorage.removeItem(GESTURE_STORAGE_KEY)
})
afterEach(() => {
  el?.remove()
})

describe('the public toggles', () => {
  test('toggleColors without enable-colors changes nothing and announces nothing', async () => {
    await mount({ play: '' })
    const seen: boolean[] = []
    el.addEventListener('colored-change', (e) => seen.push(e.detail.colored))
    el.toggleColors()
    await el.updateComplete
    expect(seen).toEqual([])
    expect(el.colored).toBe(false)
  })

  test('toggleColors with the permission does what the colour button does', async () => {
    await mount({ 'enable-colors': '' })
    const seen: boolean[] = []
    el.addEventListener('colored-change', (e) => seen.push(e.detail.colored))
    el.toggleColors()
    await el.updateComplete
    expect(seen).toEqual([true])
    expect(el.colored).toBe(true)
    expect(shadow('button.colors').getAttribute('aria-pressed')).toBe('true')
  })

  test('toggleGestures on a board that only pans changes nothing and announces nothing', async () => {
    await mount()
    const seen: string[] = []
    el.addEventListener('gestures-change', (e) => seen.push(e.detail.mode))
    el.toggleGestures()
    await el.updateComplete
    expect(seen).toEqual([])
    expect(el.gestureMode).toBe('drag')
    expect(localStorage.getItem(GESTURE_STORAGE_KEY)).toBeNull()
  })

  test('toggleGestures flips and stores the choice and announces each change once', async () => {
    await mount({ play: '' })
    const seen: string[] = []
    const onDocument = (e: Event) => seen.push(e.type)
    document.addEventListener('gestures-change', onDocument)
    const modes: string[] = []
    el.addEventListener('gestures-change', (e) => modes.push(e.detail.mode))
    el.toggleGestures()
    await el.updateComplete
    expect(el.gestureMode).toBe('click')
    expect(localStorage.getItem(GESTURE_STORAGE_KEY)).toBe('click')
    el.toggleGestures()
    await el.updateComplete
    document.removeEventListener('gestures-change', onDocument)
    expect(modes).toEqual(['click', 'drag'])
    expect(seen).toEqual(['gestures-change', 'gestures-change'])
    expect(shadow('button.gestures').getAttribute('aria-pressed')).toBe('false')
  })

  test('the default gesture switch announces gestures-change too', async () => {
    await mount({ interactive: '' })
    const modes: string[] = []
    el.addEventListener('gestures-change', (e) => modes.push(e.detail.mode))
    shadow('button.gestures').click()
    await el.updateComplete
    expect(modes).toEqual(['click'])
  })

  test('a choice read back on connect is not announced', async () => {
    localStorage.setItem(GESTURE_STORAGE_KEY, 'click')
    const seen: Event[] = []
    const onDocument = (e: Event) => seen.push(e)
    document.addEventListener('gestures-change', onDocument)
    await mount({ play: '' })
    document.removeEventListener('gestures-change', onDocument)
    expect(el.gestureMode).toBe('click')
    expect(seen).toEqual([])
  })
})

describe('slots', () => {
  const actionsOf = () =>
    [...(el.shadowRoot?.querySelectorAll('[data-board-action]') ?? [])].map((n) => n.getAttribute('data-board-action'))

  test('the default controls name their actions', async () => {
    await mount()
    expect(actionsOf()).toEqual(['zoom-in', 'zoom-out', 'fit'])
    await mount({ 'enable-colors': '', play: '' })
    expect(actionsOf()).toEqual(['zoom-in', 'zoom-out', 'fit', 'colors', 'gestures'])
  })

  test('a host button in zoom-in replaces the default and zooms', async () => {
    await mount({}, '<button slot="zoom-in" data-board-action="zoom-in" id="mine"><span id="icon">Z</span></button>')
    expect(shadow('[data-board-action="zoom-in"]').checkVisibility()).toBe(false)
    expect(light('#mine').checkVisibility()).toBe(true)
    expect(shadow('[data-board-action="fit"]').checkVisibility()).toBe(true)
    light('#icon').click()
    await raf()
    expect(el.viewport?.cellPx).toBeCloseTo(FIT * ZOOM_STEP, 6)
  })

  test('a custom controls bar replaces the whole default bar and switches the per-control slots off', async () => {
    await mount(
      {},
      '<div slot="controls" id="bar"><button data-board-action="fit" id="f">F</button></div>' +
        '<button slot="fit" data-board-action="fit" id="lone">L</button>',
    )
    expect(shadow('.chrome').checkVisibility()).toBe(false)
    expect(light('#lone').checkVisibility()).toBe(false)
    expect(light('#bar').checkVisibility()).toBe(true)
    el.zoomBy(2)
    await raf()
    expect(el.viewport?.fitted).toBe(false)
    light('#f').click()
    await raf()
    expect(el.viewport?.fitted).toBe(true)
  })

  test('host colour and gesture controls render only where the default would', async () => {
    await mount(
      {},
      '<button slot="colors" data-board-action="colors" id="c">C</button>' +
        '<button slot="gestures" data-board-action="gestures" id="g">G</button>',
    )
    expect(light('#c').checkVisibility()).toBe(false)
    expect(light('#g').checkVisibility()).toBe(false)
    el.setAttribute('enable-colors', '')
    await el.updateComplete
    expect(light('#c').checkVisibility()).toBe(true)
    el.play = true
    await el.updateComplete
    expect(light('#g').checkVisibility()).toBe(true)
    el.play = false
    el.interactive = true
    await el.updateComplete
    expect(light('#g').checkVisibility()).toBe(true)
    el.interactive = false
    await el.updateComplete
    expect(light('#g').checkVisibility()).toBe(false)
  })

  test('an unknown action does nothing', async () => {
    await mount(
      { 'enable-colors': '', play: '' },
      '<button slot="fit" data-board-action="sideways" id="odd">?</button>',
    )
    const before = el.viewport
    light('#odd').click()
    await raf()
    expect(el.viewport).toEqual(before)
    expect(el.colored).toBe(false)
    expect(el.gestureMode).toBe('drag')
  })

  test("a click on a nested board's default control leaves the outer board alone", async () => {
    await mount({}, '<div slot="controls"><arrowz-board></arrowz-board></div>')
    const innerBoard = el.querySelector('arrowz-board')
    if (!innerBoard) throw new Error('no inner board')
    innerBoard.style.cssText = 'display:block;width:100px;height:100px'
    innerBoard.board = generate({ ...defaultParams(), W: 10, H: 10, seed: 3 }).board
    await innerBoard.updateComplete
    await raf()
    await raf()
    const outerBefore = el.viewport
    const innerBefore = innerBoard.viewport?.cellPx ?? 0
    innerBoard.shadowRoot?.querySelector<HTMLElement>('[data-board-action="zoom-in"]')?.click()
    await raf()
    expect(innerBoard.viewport?.cellPx).toBeGreaterThan(innerBefore)
    expect(el.viewport).toEqual(outerBefore)
  })

  // CDP touch emulation is the only way this runner reports a coarse pointer.
  test('under a coarse pointer the hint and gesture slots hide host content and fallback alike', async () => {
    await mount({ play: '' }, '<span slot="hint" id="h">H</span>')
    const session = cdp()
    await session.send('Emulation.setTouchEmulationEnabled', { enabled: true, maxTouchPoints: 5 })
    try {
      expect(matchMedia('(pointer: coarse)').matches).toBe(true)
      expect(light('#h').checkVisibility()).toBe(false)
      expect(shadow('button.gestures').checkVisibility()).toBe(false)
      expect(shadow('[data-board-action="fit"]').checkVisibility()).toBe(true)
    } finally {
      await session.send('Emulation.setTouchEmulationEnabled', { enabled: false })
    }
    expect(light('#h').checkVisibility()).toBe(true)
  })
})
