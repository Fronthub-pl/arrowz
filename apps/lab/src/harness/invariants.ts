import type { ArrowzBoard } from '@arrowz/board-element'
import { contrast, shown } from '../design/contrast'

// Layout invariants as assertions. Each reads an effect the browser computed,
// never a declared property: a panel that declares `overflow: auto` and never
// scrolls passes a declaration test.

export type Invariant =
  | 'scroll'
  | 'board-clip'
  | 'overlap'
  | 'ua-button'
  | 'describedby'
  | 'contrast'
  | 'bar-clip'
  | 'panel-overflow'
  | 'popover-fit'
  | 'drawer-fit'
  | 'settings-fit'
  | 'board-width'
  | 'bar-row'
  | 'sheet-fit'
  | 'sheet-bar'
  | 'touch-target'
  | 'top-scroll'
  | 'hidden-box'
  | 'knob-row'
  | 'frame-overlap'
  | 'board-cover'
export interface Finding {
  invariant: Invariant
  detail: string
}

const EPS = 0.5

function label(node: Element): string {
  const cls =
    typeof node.className === 'string' && node.className !== '' ? `.${node.className.split(' ').join('.')}` : ''
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
  for (const parent of root.querySelectorAll('.fw-lab')) {
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

/**
 * Every control in the top bar stays inside it. `.fw-top` clips, so a control
 * pushed off its edge by a wider label (Polish "Zaawansowany") is invisible to
 * `scroll`: the document never grows, the bar's content does.
 */
function barClip(root: HTMLElement): Finding[] {
  const bar = root.querySelector('.fw-top')
  if (bar === null) return []
  const barRect = bar.getBoundingClientRect()
  const out: Finding[] = []
  for (const node of bar.querySelectorAll('button, a, select, input, [role="switch"], [role="radio"]')) {
    // The preset panel and the open menu lie outside the bar by design;
    // `popoverFit` reads them.
    if (
      node.closest('.fw-pp-panel') !== null ||
      (node.closest('.right') !== null && root.querySelector('.fw.menu-open') !== null)
    )
      continue
    if (!rendered(node)) continue
    const r = node.getBoundingClientRect()
    if (
      r.left < barRect.left - EPS ||
      r.right > barRect.right + EPS ||
      r.top < barRect.top - EPS ||
      r.bottom > barRect.bottom + EPS
    )
      out.push({ invariant: 'bar-clip' as const, detail: `${label(node)} "${node.textContent?.trim() ?? ''}"` })
  }
  return out
}

/**
 * A rendered `.fw-knobs` or `.fw-report` never scrolls sideways. A panel that
 * clips (`overflow-y: auto`) can outgrow its width while the document does not,
 * so `scroll` cannot see it.
 */
function panelOverflow(root: HTMLElement): Finding[] {
  const out: Finding[] = []
  for (const panel of root.querySelectorAll('.fw-knobs, .fw-report')) {
    if (!rendered(panel)) continue
    if (panel.scrollWidth > panel.clientWidth + EPS)
      out.push({
        invariant: 'panel-overflow',
        detail: `${label(panel)} ${panel.scrollWidth} > ${panel.clientWidth}`,
      })
  }
  return out
}

/**
 * A rendered popover lies inside the viewport on both axes. It is absolutely
 * positioned, so `scroll` sees it only when no ancestor clips; this reads the
 * panel's own box instead.
 */
function popoverFit(root: HTMLElement): Finding[] {
  const out: Finding[] = []
  for (const panel of root.querySelectorAll('.fw-pp-panel, .fw-more-pop.open, .fw.menu-open .fw-top .right')) {
    if (!rendered(panel)) continue
    const r = panel.getBoundingClientRect()
    if (r.left < -EPS || r.top < -EPS || r.right > window.innerWidth + EPS || r.bottom > window.innerHeight + EPS) {
      const [l, t, rt, b] = [r.left, r.top, r.right, r.bottom].map((v) => v.toFixed(0))
      out.push({
        invariant: 'popover-fit',
        detail: `${label(panel)} ${l},${t} to ${rt},${b} in ${window.innerWidth}×${window.innerHeight}`,
      })
    }
    // At XS, where the sheet bar is rendered, a popover stops above it.
    const sheetbar = root.querySelector('.fw-sheetbar')
    if (sheetbar !== null && rendered(sheetbar) && r.bottom > sheetbar.getBoundingClientRect().top + EPS)
      out.push({
        invariant: 'popover-fit',
        detail: `${label(panel)} bottom ${r.bottom.toFixed(0)} under the sheet bar`,
      })
  }
  return out
}

/**
 * An open drawer lies over the board, inside its stage, never past the stage's
 * edge onto the console. Open only: closed, it is translated all but its handle
 * past the stage's right edge by design, and the stage clips it.
 */
function drawerFit(root: HTMLElement): Finding[] {
  // At XS the drawers are sheets over the viewport (`sheet-fit`).
  if (window.innerWidth < 768) return []
  const out: Finding[] = []
  for (const drawer of root.querySelectorAll('.fw-drawer.open')) {
    const stage = drawer.closest('.fw-stage')
    if (stage === null || !rendered(drawer)) continue
    const d = drawer.getBoundingClientRect()
    const s = stage.getBoundingClientRect()
    const left = s.left
    if (d.left < left - EPS || d.right > s.right + EPS || d.top < s.top - EPS || d.bottom > s.bottom + EPS) {
      const [l, t, r, b] = [d.left, d.top, d.right, d.bottom].map((v) => v.toFixed(0))
      out.push({
        invariant: 'drawer-fit',
        detail: `${label(drawer)} ${l},${t} to ${r},${b} outside ${label(stage)} right of x=${left.toFixed(0)}`,
      })
    }
  }
  return out
}

/**
 * The open settings drawer lies inside its stage and, from 1024px up, beside
 * the board rather than over it, so a knob change is always in sight. Below
 * 1024 it lies over the board, and only the stage bound is read. Open only, as
 * in `drawerFit`.
 */
function settingsFit(root: HTMLElement): Finding[] {
  // At XS the drawers are sheets over the viewport (`sheet-fit`).
  if (window.innerWidth < 768) return []
  const out: Finding[] = []
  for (const drawer of root.querySelectorAll('.fw-ldrawer.open')) {
    const stage = drawer.closest('.fw-stage')
    if (stage === null || !rendered(drawer)) continue
    const d = drawer.getBoundingClientRect()
    const s = stage.getBoundingClientRect()
    if (d.left < s.left - EPS || d.right > s.right + EPS || d.top < s.top - EPS || d.bottom > s.bottom + EPS) {
      const [l, t, r, b] = [d.left, d.top, d.right, d.bottom].map((v) => v.toFixed(0))
      out.push({ invariant: 'settings-fit', detail: `${label(drawer)} ${l},${t} to ${r},${b} outside ${label(stage)}` })
    }
    const board = stage.querySelector('.fw-board')
    if (window.innerWidth >= 1024 && board !== null && rendered(board)) {
      const left = board.getBoundingClientRect().left
      if (left < d.right - EPS)
        out.push({
          invariant: 'settings-fit',
          detail: `${label(board)} starts at x=${left.toFixed(0)}, under ${label(drawer)} to x=${d.right.toFixed(0)}`,
        })
    }
  }
  return out
}

/** No button keeps the user agent's look (`2px outset`). */
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
      out.push({
        invariant: 'contrast',
        detail: `${label(node)} "${node.textContent?.trim().slice(0, 20)}" ${ratio.toFixed(2)}`,
      })
  }
  return out
}

/**
 * The board's width with the drawer open at the design's checkpoint sizes, held
 * so a change that eats into it goes red. Any other width from 768 up keeps the
 * usable minimum (`boardWidth`).
 */
const BOARD_FLOORS: Readonly<Record<number, number>> = { 1440: 501, 1024: 424, 768: 678 }

/**
 * The board keeps a usable width: `BOARD_FLOORS` at the checkpoint sizes, at
 * least 320px at any other width from 768 up whatever the drawer does, and edge
 * to edge (less 16px) on a phone. Solo is exempt: the board takes the panel.
 */
function boardWidth(root: HTMLElement, solo: boolean): Finding[] {
  const board = root.querySelector('.fw-board')
  if (board === null || !rendered(board) || solo) return []
  const w = board.getBoundingClientRect().width
  const floor = window.innerWidth < 768 ? window.innerWidth - 16 : (BOARD_FLOORS[window.innerWidth] ?? 320)
  return w + EPS < floor ? [{ invariant: 'board-width', detail: `board ${w.toFixed(0)}px < ${floor}` }] : []
}

/**
 * At M and S the right column is a bar under the board: one or two rows of
 * controls, and the run's state as one more row of one line.
 */
function barRow(root: HTMLElement, solo: boolean): Finding[] {
  if (solo || window.innerWidth < 768 || window.innerWidth >= 1280) return []
  const wrap = root.querySelector('.fw-stage > .fw-boardwrap')
  const bars = [...root.querySelectorAll('.fw-stage > .fw-run-col')].filter(rendered)
  if (wrap === null || bars.length === 0) return []
  const out: Finding[] = []
  const bottom = wrap.getBoundingClientRect().bottom
  for (const bar of bars) {
    const r = bar.getBoundingClientRect()
    if (r.top < bottom - EPS)
      out.push({ invariant: 'bar-row', detail: `${label(bar)} top ${r.top.toFixed(0)} < board ${bottom.toFixed(0)}` })
    // The controls are measured without the state row, which is held to one line.
    const state = bar.querySelector(':scope > .fw-runstate')
    let controls = r.height
    if (state !== null && rendered(state)) {
      const line = state.getBoundingClientRect().height
      const one = Number.parseFloat(getComputedStyle(state).lineHeight)
      if (line > one + EPS)
        out.push({ invariant: 'bar-row', detail: `${label(bar)} state line ${line.toFixed(0)}px, over one line` })
      controls -= line + Number.parseFloat(getComputedStyle(bar).rowGap)
    }
    if (controls > 104 + EPS)
      out.push({ invariant: 'bar-row', detail: `${label(bar)} controls ${controls.toFixed(0)}px tall` })
    // M: an open drawer pushes the bar's content as it pushes the board, so
    // nothing in the bar lies under the drawer. S lets the drawer cover both.
    const drawer = root.querySelector('.fw-ldrawer.open')
    if (window.innerWidth >= 1024 && drawer !== null && rendered(drawer)) {
      const start = r.left + Number.parseFloat(getComputedStyle(bar).paddingLeft)
      const edge = drawer.getBoundingClientRect().right
      if (start < edge - EPS)
        out.push({
          invariant: 'bar-row',
          detail: `${label(bar)} content at x=${start.toFixed(0)}, under the drawer to x=${edge.toFixed(0)}`,
        })
    }
  }
  return out
}

/**
 * At XS the sheet bar is on screen on the workspace (unless solo) and a sheet
 * lies inside the viewport, above the bar; from 768 up there is no sheet bar.
 */
function sheets(root: HTMLElement, solo: boolean): Finding[] {
  const out: Finding[] = []
  const bar = root.querySelector('.fw-sheetbar')
  const onWorkspace = bar !== null && bar.closest('main')?.hidden === false
  const phone = window.innerWidth < 768
  const shown = bar !== null && rendered(bar)
  if (onWorkspace && shown !== (phone && !solo))
    out.push({ invariant: 'sheet-bar', detail: `sheet bar ${shown ? 'shown' : 'hidden'} at ${window.innerWidth}` })
  if (!phone || bar === null || !shown) return out
  const top = bar.getBoundingClientRect().top
  for (const sheet of root.querySelectorAll('.fw-ldrawer, .fw-drawer, .fw-stage > .fw-run-col')) {
    if (!rendered(sheet)) continue
    const r = sheet.getBoundingClientRect()
    if (r.left < -EPS || r.right > window.innerWidth + EPS || r.top < -EPS || r.bottom > top + EPS)
      out.push({
        invariant: 'sheet-fit',
        detail: `${label(sheet)} ${r.top.toFixed(0)}..${r.bottom.toFixed(0)} over bar ${top.toFixed(0)}`,
      })
  }
  return out
}

/**
 * At XS every control a thumb reaches in the shell and the open sheets is 44px
 * tall to the finger: its box, or its `::before` where the drawing is smaller.
 * A knob row is smaller by design (pinned in touch.browser.test.tsx): the `?`
 * and the chips are 32 (skipped here), a select is 40.
 */
function touchTargets(root: HTMLElement): Finding[] {
  if (window.innerWidth >= 768) return []
  const out: Finding[] = []
  const scope = '.fw-sheetbar, .fw-top, .fw-tabrow, .fw-presets, .fw-stage > .fw-run-col, .fw-ldrawer, .fw-drawer'
  for (const node of root.querySelectorAll('button, select, a[href], [role="switch"]')) {
    if (node.closest(scope) === null || !rendered(node)) continue
    if (node.matches('.kv-g .q, .kv-chip')) continue
    const floor = node.matches('.kv-g select') ? 40 : 44
    const own = node.getBoundingClientRect().height
    const before = Number.parseFloat(getComputedStyle(node, '::before').height)
    const hit = Math.max(own, Number.isFinite(before) ? before : 0)
    if (hit + EPS < floor)
      out.push({
        invariant: 'touch-target',
        detail: `${label(node)} "${node.textContent?.trim() ?? ''}" ${hit.toFixed(0)}px`,
      })
  }
  return out
}

/** An element carrying `hidden` has no box: a `display` rule would undo the attribute. */
function hiddenBox(root: HTMLElement): Finding[] {
  return [...root.querySelectorAll('[hidden]')]
    .filter((el) => el.closest('main[hidden]') === null && rendered(el))
    .map((el) => ({ invariant: 'hidden-box' as const, detail: label(el) }))
}

/**
 * A knob row keeps its cells in its own tracks. `.kv` clips the row before
 * `.fw-knobs` grows, so `panel-overflow` cannot see this. No rendered cell ends
 * past the row (tracks too wide for it), and the last one ends inside the last
 * track (a hidden cell let the slider auto-place into a narrow track).
 */
function knobRows(root: HTMLElement): Finding[] {
  const out: Finding[] = []
  for (const row of root.querySelectorAll('.kv-g .ln')) {
    if (!rendered(row)) continue
    const cells = [...row.children].filter(rendered)
    if (cells.length === 0) continue
    const style = getComputedStyle(row)
    const edge = row.getBoundingClientRect().right - Number.parseFloat(style.paddingRight)
    const end = Math.max(...cells.map((cell) => cell.getBoundingClientRect().right))
    const tracks = style.gridTemplateColumns.split(' ').map(Number.parseFloat)
    const last = (tracks[tracks.length - 1] ?? 0) + (Number.parseFloat(style.columnGap) || 0)
    if (end > edge + EPS)
      out.push({
        invariant: 'knob-row',
        detail: `${label(row)} "${row.textContent?.trim().slice(0, 24) ?? ''}" ends at ${end.toFixed(0)} > ${edge.toFixed(0)}`,
      })
    else if (end < edge - last - EPS)
      out.push({
        invariant: 'knob-row',
        detail: `${label(row)} "${row.textContent?.trim().slice(0, 24) ?? ''}" ends at ${end.toFixed(0)}, ${(edge - end).toFixed(0)}px short of ${edge.toFixed(0)}`,
      })
  }
  return out
}

/**
 * What lies on and under the board frame keeps apart and inside it: the
 * annotation, the solo toggle and the element's own bar (`.chrome`, in its
 * shadow root) inside `.fw-board`; the board mode and its line inside the
 * wrap. Both clip, so a control pushed past an edge or under another is lost
 * without any scroll.
 */
function frameOverlap(root: HTMLElement): Finding[] {
  const out: Finding[] = []
  for (const wrap of root.querySelectorAll('.fw-boardwrap')) {
    const frame = wrap.querySelector(':scope > .fw-board')
    if (frame === null || !rendered(frame)) continue
    const chrome = frame.querySelector('arrowz-board')?.shadowRoot?.querySelector('.chrome') ?? null
    const inside = (nodes: Iterable<Element>, container: Element) => {
      const box = container.getBoundingClientRect()
      return [...nodes]
        .filter((node) => rendered(node) && node.getBoundingClientRect().width > 0)
        .map((node) => ({ node, box }))
    }
    const parts = [
      ...inside(
        [...frame.querySelectorAll(':scope > .fw-anno, :scope > .fw-solo'), ...(chrome === null ? [] : [chrome])],
        frame,
      ),
      ...inside(wrap.querySelectorAll(':scope > .fw-modebar > .fw-mode, :scope > .fw-modebar > .fw-modeline'), wrap),
    ]
    for (const { node, box: f } of parts) {
      const r = node.getBoundingClientRect()
      if (r.left < f.left - EPS || r.right > f.right + EPS || r.top < f.top - EPS || r.bottom > f.bottom + EPS)
        out.push({ invariant: 'frame-overlap', detail: `${label(node)} outside the frame` })
    }
    for (let i = 0; i < parts.length; i++) {
      for (let j = i + 1; j < parts.length; j++) {
        const a = parts[i]?.node.getBoundingClientRect()
        const b = parts[j]?.node.getBoundingClientRect()
        if (a === undefined || b === undefined) continue
        const x = Math.min(a.right, b.right) - Math.max(a.left, b.left)
        const y = Math.min(a.bottom, b.bottom) - Math.max(a.top, b.top)
        if (x > EPS && y > EPS)
          out.push({
            invariant: 'frame-overlap',
            detail: `${label(parts[i]?.node as Element)} × ${label(parts[j]?.node as Element)}`,
          })
      }
    }
  }
  return out
}

/**
 * The lab's controls around the board leave the drawn board clear at fit: a
 * piece under one is reachable only by panning. The drawn rectangle is the
 * board's W×H through the element's `viewport`, from the host's top-left.
 */
function boardCover(root: HTMLElement): Finding[] {
  const out: Finding[] = []
  for (const element of root.querySelectorAll<ArrowzBoard>('arrowz-board')) {
    const vp = element.viewport
    const board = element.board
    const wrap = element.closest('.fw-boardwrap')
    if (vp === null || board === null || wrap === null || !vp.fitted || !rendered(element)) continue
    const host = element.getBoundingClientRect()
    // A viewport for another host size describes a board no longer drawn.
    if (Math.abs(vp.hostWidth - host.width) > EPS || Math.abs(vp.hostHeight - host.height) > EPS) {
      out.push({
        invariant: 'board-cover',
        detail: `viewport for ${vp.hostWidth}×${vp.hostHeight}, host ${host.width.toFixed(1)}×${host.height.toFixed(1)}`,
      })
      continue
    }
    const left = Math.max(host.left, host.left - vp.originX * vp.cellPx)
    const top = Math.max(host.top, host.top - vp.originY * vp.cellPx)
    const right = Math.min(host.right, host.left + (board.W - vp.originX) * vp.cellPx)
    const bottom = Math.min(host.bottom, host.top + (board.H - vp.originY) * vp.cellPx)
    for (const node of wrap.querySelectorAll('.fw-anno, .fw-mode, .fw-solo, .fw-modeline')) {
      if (!rendered(node)) continue
      const r = node.getBoundingClientRect()
      const x = Math.min(r.right, right) - Math.max(r.left, left)
      const y = Math.min(r.bottom, bottom) - Math.max(r.top, top)
      if (x > EPS && y > EPS)
        out.push({
          invariant: 'board-cover',
          detail: `${label(node)} [${r.left.toFixed(0)},${r.top.toFixed(0)} ${r.right.toFixed(0)},${r.bottom.toFixed(0)}] × board [${left.toFixed(0)},${top.toFixed(0)} ${right.toFixed(0)},${bottom.toFixed(0)}]`,
        })
    }
  }
  return out
}

/** Opening a popover in the top bar never scrolls it (the low window's presets). */
function topScroll(root: HTMLElement): Finding[] {
  const bar = root.querySelector('.fw-top')
  return bar !== null && bar.scrollTop !== 0 ? [{ invariant: 'top-scroll', detail: `scrollTop ${bar.scrollTop}` }] : []
}

export function audit(root: HTMLElement, { board, solo = false }: { board: boolean; solo?: boolean }): Finding[] {
  return [
    ...scroll(),
    ...(board ? boardClip(root) : []),
    ...overlap(root),
    ...barClip(root),
    ...panelOverflow(root),
    ...popoverFit(root),
    ...drawerFit(root),
    ...settingsFit(root),
    ...uaButtons(root),
    ...describedBy(root),
    ...lowContrast(root),
    ...boardWidth(root, solo),
    ...barRow(root, solo),
    ...sheets(root, solo),
    ...touchTargets(root),
    ...topScroll(root),
    ...hiddenBox(root),
    ...knobRows(root),
    ...frameOverlap(root),
    ...boardCover(root),
  ]
}
