import { contrast, shown } from '../design/contrast'

// The review's measurements (2026-09-22) as assertions. Every one of them
// reads an effect the browser computed, never a declared property: a panel
// that declares `overflow: auto` and never scrolls passes a declaration test
// (harness fact 36).

export type Invariant = 'scroll' | 'board-clip' | 'overlap' | 'ua-button' | 'describedby' | 'contrast'
export interface Finding {
  invariant: Invariant
  detail: string
}

const EPS = 0.5

function label(node: Element): string {
  const cls = typeof node.className === 'string' && node.className !== '' ? `.${node.className.split(' ').join('.')}` : ''
  return `${node.tagName.toLowerCase()}${node.id ? `#${node.id}` : ''}${cls}`
}

function rendered(node: Element): boolean {
  return node.checkVisibility({ visibilityProperty: true, opacityProperty: false })
}

/** The document scrolls on neither axis. */
function scroll(): Finding[] {
  const root = document.scrollingElement
  if (root === null) throw new Error('no scrolling element')
  const out: Finding[] = []
  if (root.scrollHeight > root.clientHeight + EPS)
    out.push({ invariant: 'scroll', detail: `y ${root.scrollHeight} > ${root.clientHeight}` })
  if (root.scrollWidth > root.clientWidth + EPS)
    out.push({ invariant: 'scroll', detail: `x ${root.scrollWidth} > ${root.clientWidth}` })
  return out
}

/** The board lies inside the wrap's content box: the wrap clips (`overflow: hidden`). */
function boardClip(root: HTMLElement): Finding[] {
  const wrap = root.querySelector('.fw-boardwrap')
  const board = root.querySelector('.fw-board')
  if (wrap === null || board === null || !rendered(board)) return []
  const w = wrap.getBoundingClientRect()
  const b = board.getBoundingClientRect()
  const pad = Number.parseFloat(getComputedStyle(wrap).paddingBottom)
  const below = b.bottom - (w.bottom - pad)
  return below > EPS ? [{ invariant: 'board-clip', detail: `board ${below.toFixed(1)}px below the wrap` }] : []
}

/** Rendered children of each grid named here do not intersect. */
function overlap(root: HTMLElement): Finding[] {
  const out: Finding[] = []
  for (const parent of root.querySelectorAll('.fw-lab, .fw-lib-detail')) {
    const kids = [...parent.children].filter(rendered).filter((k) => k.getBoundingClientRect().height > 0)
    for (let i = 0; i < kids.length; i++) {
      for (let j = i + 1; j < kids.length; j++) {
        const a = kids[i]?.getBoundingClientRect()
        const b = kids[j]?.getBoundingClientRect()
        if (a === undefined || b === undefined) continue
        const x = Math.min(a.right, b.right) - Math.max(a.left, b.left)
        const y = Math.min(a.bottom, b.bottom) - Math.max(a.top, b.top)
        if (x > EPS && y > EPS)
          out.push({ invariant: 'overlap', detail: `${label(kids[i] as Element)} × ${label(kids[j] as Element)}` })
      }
    }
  }
  return out
}

/** No button keeps the user agent's look (review P9: `2px outset`). */
function uaButtons(root: HTMLElement): Finding[] {
  return [...root.querySelectorAll('button')]
    .filter((b) => rendered(b) && getComputedStyle(b).borderTopStyle === 'outset')
    .map((b) => ({ invariant: 'ua-button' as const, detail: `${label(b)} "${b.textContent?.trim() ?? ''}"` }))
}

/** Every `aria-describedby` token names an element in the document. */
function describedBy(root: HTMLElement): Finding[] {
  const out: Finding[] = []
  for (const node of root.querySelectorAll('[aria-describedby]')) {
    for (const id of (node.getAttribute('aria-describedby') ?? '').split(/\s+/).filter(Boolean)) {
      if (document.getElementById(id) === null)
        out.push({ invariant: 'describedby', detail: `${label(node)} → #${id}` })
    }
  }
  return out
}

/**
 * Every visible run of text clears 4.5:1. Exempt, as WCAG exempts them:
 * disabled controls. Skipped as not visible: anything visually hidden by
 * `.fw-vh` (clip-path inset 50%) or not rendered.
 */
function lowContrast(root: HTMLElement): Finding[] {
  const out: Finding[] = []
  for (const node of root.querySelectorAll('*')) {
    const own = [...node.childNodes].some((c) => c.nodeType === Node.TEXT_NODE && c.textContent?.trim())
    if (!own || !rendered(node)) continue
    if (node.closest('.fw-vh, [aria-hidden="true"], :disabled, [aria-disabled="true"]') !== null) continue
    const { front, back } = shown(node)
    const ratio = contrast(front, back)
    if (ratio < 4.5)
      out.push({ invariant: 'contrast', detail: `${label(node)} "${node.textContent?.trim().slice(0, 20)}" ${ratio.toFixed(2)}` })
  }
  return out
}

export function audit(root: HTMLElement, { board }: { board: boolean }): Finding[] {
  return [
    ...scroll(),
    ...(board ? boardClip(root) : []),
    ...overlap(root),
    ...uaButtons(root),
    ...describedBy(root),
    ...lowContrast(root),
  ]
}
