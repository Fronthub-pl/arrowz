import { defaultParams, generate } from '@fronthub/arrowz-engine'
import { afterEach, beforeEach, describe, expect, test } from 'vitest'
import { cdp, userEvent } from 'vitest/browser'
import { type ArrowzBoard, DEFAULT_PAD, GESTURE_STORAGE_KEY, ZOOM_STEP } from './arrowz-board.ts'
import './mod.ts'

const raf = () => new Promise<void>((r) => requestAnimationFrame(() => r()))

/** The default bar's height over the host's bottom edge: 32 px buttons and the 8 px offset. */
const BAR_HEIGHT = 32 + 8
/** Cell size of a 30x30 board fitted into the 300 px host of `mount`, with the margin that keeps the default bar off it. */
const FIT = 300 / (30 + (2 * BAR_HEIGHT * 30) / (300 - 2 * BAR_HEIGHT))
/** The same without a default bar: a custom `controls` gets no room. */
const FIT_BARE = 300 / (30 + 2 * DEFAULT_PAD)

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

  test('an unpositioned custom bar is above the canvas and takes a real click', async () => {
    await mount({}, '<div slot="controls" id="bar"><button data-board-action="fit" id="f">F</button></div>')
    el.zoomBy(2)
    await raf()
    const r = light('#f').getBoundingClientRect()
    const hit = document.elementFromPoint(r.left + r.width / 2, r.top + r.height / 2)
    expect(hit !== null && light('#f').contains(hit)).toBe(true)
    await userEvent.click(light('#f'))
    await raf()
    expect(el.viewport?.fitted).toBe(true)
  })

  test("a custom bar's own position wins over the element's", async () => {
    await mount(
      {},
      '<div slot="controls" id="bar" style="position: absolute; left: 0; top: 0"><button data-board-action="fit">F</button></div>',
    )
    expect(getComputedStyle(light('#bar')).position).toBe('absolute')
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

describe('state on host controls', () => {
  test('a host colour control is pressed after its click and after view.colored', async () => {
    await mount({ 'enable-colors': '' }, '<button slot="colors" data-board-action="colors" id="c">C</button>')
    expect(light('#c').getAttribute('aria-pressed')).toBe('false')
    light('#c').click()
    await el.updateComplete
    expect(el.colored).toBe(true)
    expect(light('#c').getAttribute('aria-pressed')).toBe('true')

    await mount({ 'enable-colors': '' }, '<button slot="colors" data-board-action="colors" id="c">C</button>')
    el.view = { colored: true }
    await el.updateComplete
    expect(light('#c').getAttribute('aria-pressed')).toBe('true')
  })

  test('a host gesture control is pressed in click mode', async () => {
    await mount({ play: '' }, '<button slot="gestures" data-board-action="gestures" id="g">G</button>')
    expect(light('#g').getAttribute('aria-pressed')).toBe('false')
    light('#g').click()
    await el.updateComplete
    expect(el.gestureMode).toBe('click')
    expect(light('#g').getAttribute('aria-pressed')).toBe('true')
  })

  test('hidden on controls in a custom bar follows enable-colors and play', async () => {
    await mount(
      {},
      '<div slot="controls"><button data-board-action="colors" id="c">C</button>' +
        '<button data-board-action="gestures" id="g">G</button></div>',
    )
    expect(light('#c').hidden).toBe(true)
    expect(light('#g').hidden).toBe(true)
    el.setAttribute('enable-colors', '')
    await el.updateComplete
    expect(light('#c').hidden).toBe(false)
    expect(light('#g').hidden).toBe(true)
    el.play = true
    await el.updateComplete
    expect(light('#g').hidden).toBe(false)
    el.removeAttribute('enable-colors')
    await el.updateComplete
    expect(light('#c').hidden).toBe(true)
  })

  // Appended after connect, and again after a move: the two moments a framework
  // adds a control without any property of the board changing.
  test('a control added deep inside the bar after connect gets its state, and again after a move', async () => {
    await mount({ 'enable-colors': '' }, '<div slot="controls" id="bar"><div id="group"></div></div>')
    const late = document.createElement('button')
    late.setAttribute('data-board-action', 'colors')
    light('#group').append(late)
    await raf()
    expect(late.getAttribute('aria-pressed')).toBe('false')
    expect(late.hidden).toBe(false)

    el.remove()
    document.body.append(el)
    const moved = document.createElement('button')
    moved.setAttribute('data-board-action', 'gestures')
    light('#group').append(moved)
    await raf()
    expect(moved.hidden).toBe(true)
  })

  test('a control added while the board is detached gets its state on connect', async () => {
    await mount({ 'enable-colors': '' }, '<div slot="controls" id="bar"></div>')
    el.remove()
    const added = document.createElement('button')
    added.setAttribute('data-board-action', 'gestures')
    light('#bar').append(added)
    document.body.append(el)
    await raf()
    expect(added.hidden).toBe(true)
    expect(added.getAttribute('aria-pressed')).toBe('false')
  })

  test('preventDefault on colored-change works the same from a host control', async () => {
    await mount({ 'enable-colors': '' }, '<button slot="colors" data-board-action="colors" id="c">C</button>')
    el.addEventListener('colored-change', (e) => e.preventDefault())
    light('#c').click()
    await el.updateComplete
    expect(el.colored).toBe(false)
    expect(light('#c').getAttribute('aria-pressed')).toBe('false')
    el.view = { colored: true }
    await el.updateComplete
    expect(el.colored).toBe(true)
    expect(light('#c').getAttribute('aria-pressed')).toBe('true')
  })

  test("a nested board's controls are not the outer board's", async () => {
    await mount(
      { 'enable-colors': '' },
      '<div slot="controls"><arrowz-board id="inner" enable-colors>' +
        '<button slot="colors" data-board-action="colors" id="ic">C</button></arrowz-board></div>',
    )
    const inner = el.querySelector('arrowz-board')
    if (!inner) throw new Error('no inner board')
    await inner.updateComplete
    el.toggleColors()
    await el.updateComplete
    expect(el.colored).toBe(true)
    expect(inner.colored).toBe(false)
    expect(light('#ic').getAttribute('aria-pressed')).toBe('false')
  })
})

describe('board keys', () => {
  test('keys typed into a text field in a custom bar reach the field, not the board', async () => {
    await mount({}, '<div slot="controls"><input id="field"></div>')
    const field = light('#field')
    if (!(field instanceof HTMLInputElement)) throw new Error('#field is not an input')
    field.focus()
    await userEvent.keyboard('+-0')
    await raf()
    expect(field.value).toBe('+-0')
    expect(el.viewport?.cellPx).toBeCloseTo(FIT_BARE, 6)
  })

  test('a key on a focused nested board zooms that board only', async () => {
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
    innerBoard.focus()
    await userEvent.keyboard('+')
    await raf()
    expect(innerBoard.viewport?.cellPx).toBeGreaterThan(innerBefore)
    expect(el.viewport).toEqual(outerBefore)
  })

  test('a key on a focused default control acts on the board', async () => {
    await mount()
    el.zoomBy(2) // the fitted scale is the floor, so zoom out needs room first
    shadow('[data-board-action="zoom-in"]').focus()
    await userEvent.keyboard('-')
    await raf()
    expect(el.viewport?.cellPx).toBeCloseTo((FIT * 2) / ZOOM_STEP, 6)
  })

  test('a key on a focused host control acts on the board', async () => {
    await mount({}, '<button slot="zoom-in" data-board-action="zoom-in" id="mine">Z</button>')
    light('#mine').focus()
    await userEvent.keyboard('+')
    await raf()
    expect(el.viewport?.cellPx).toBeCloseTo(FIT * ZOOM_STEP, 6)
  })
})

describe('the bar on a narrow board', () => {
  /** What the bar draws, default or projected: each slot's assigned elements, else its fallback. */
  const barParts = (): HTMLElement[] =>
    [...(el.shadowRoot?.querySelectorAll('.chrome > slot') ?? [])]
      .flatMap((slot) => {
        if (!(slot instanceof HTMLSlotElement)) return []
        const assigned = slot.assignedElements()
        return assigned.length > 0 ? assigned : [...slot.children]
      })
      .filter((node): node is HTMLElement => node instanceof HTMLElement && node.checkVisibility())

  const outside = (): string[] => {
    const host = el.getBoundingClientRect()
    return barParts()
      .filter((node) => {
        const r = node.getBoundingClientRect()
        return r.left < host.left - 0.5 || r.right > host.right + 0.5 || r.top < host.top - 0.5 ||
          r.bottom > host.bottom + 0.5
      })
      .map((node) => node.getAttribute('data-board-action') ?? node.className)
  }

  // By centre, not edge: the bar centres its items, and the hint is shorter than a button.
  const rows = (): number =>
    new Set(
      barParts().map((node) => {
        const r = node.getBoundingClientRect()
        return Math.round(r.top + r.height / 2)
      }),
    ).size

  async function narrow(width: string): Promise<void> {
    el.style.width = width
    await raf() // the ResizeObserver reports the new width on its own frame
    await raf()
  }

  // Polish: the longest default hint, so the case where it takes the bottom row
  // alone holds on every platform (the macOS hint says ⌘, the others Ctrl).
  test('the default bar wraps upwards inside a narrow board, what comes first in the bottom row', async () => {
    await mount({ play: '', 'enable-colors': '', lang: 'pl' })
    await narrow('220px')
    expect(rows()).toBeGreaterThan(1)
    expect(outside()).toEqual([])
    const host = el.getBoundingClientRect()
    const chrome = shadow('.chrome').getBoundingClientRect()
    expect(chrome.left).toBeGreaterThanOrEqual(host.left + 8)
    expect(chrome.bottom).toBeCloseTo(host.bottom - 8, 0)
    const centre = (selector: string) => {
      const r = shadow(selector).getBoundingClientRect()
      return r.top + r.height / 2
    }
    const order = [
      '.hint',
      '[data-board-action="zoom-in"]',
      '[data-board-action="fit"]',
      '[data-board-action="gestures"]',
    ]
    const centres = order.map(centre)
    expect(centres).toEqual([...centres].sort((a, b) => b - a))
    expect(centres[0]).toBeGreaterThan(centres[centres.length - 1] ?? 0)
  })

  test('a wide projected hint and labelled controls wrap inside the board', async () => {
    await mount(
      { play: '', 'enable-colors': '' },
      '<span slot="hint">Drag to pan the board, or hold the modifier and click an arrow to play it</span>' +
        '<button slot="colors" data-board-action="colors" style="white-space:nowrap">Colours of the arrows</button>' +
        '<button slot="gestures" data-board-action="gestures" style="white-space:nowrap">Click plays</button>',
    )
    await narrow('260px')
    expect(rows()).toBeGreaterThan(1)
    expect(outside()).toEqual([])
  })

  test('a bar that fits stays one row', async () => {
    await mount()
    expect(rows()).toBe(1)
    expect(shadow('.chrome').getBoundingClientRect().height).toBe(32)
  })
})
