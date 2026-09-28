import { defaultParams, generate } from '@arrowz/engine'
import { afterEach, beforeEach, describe, expect, test } from 'vitest'
import { type ArrowzBoard, GESTURE_STORAGE_KEY } from './arrowz-board.ts'
import './mod.ts'

const raf = () => new Promise<void>((r) => requestAnimationFrame(() => r()))

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
