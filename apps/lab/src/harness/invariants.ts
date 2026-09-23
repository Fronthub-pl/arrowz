import { contrast, shown } from '../design/contrast'

// The review's measurements (2026-09-22) as assertions. Every one of them
// reads an effect the browser computed, never a declared property: a panel
// that declares `overflow: auto` and never scrolls passes a declaration test
// (harness fact 36).

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
 * Every control in the top bar stays inside it. `.fw-top` clips
 * (`overflow: hidden`, shell.css), so a control pushed past its edge by a
 * wider label (review P8: a Polish "Zaawansowany" widens the mode switch and
 * shoves the language switch off the right) is invisible to the `scroll`
 * invariant above — the document never grows, the bar's own content does.
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
 * A rendered `.fw-knobs` or `.fw-report` never scrolls sideways. `scroll`
 * above only sees the document's own scrolling element; a panel that clips
 * (`overflow-y: auto`) can grow past its own width without the document ever
 * growing past its (live pass, 420×900: `.fw-knobs` scrollWidth 271 >
 * clientWidth 254).
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
 * A rendered popover lies inside the viewport on both axes (spec §3.4). The
 * preset panel is absolutely positioned under its 38px row, so whether the
 * document grows with it depends on which ancestor clips: `scroll` sees it
 * only when none does (measured at 420×700 with no `max-height`: both went
 * red). This reads the panel's own box instead.
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
    // At XS, where the sheet bar is rendered, a popover stops above it (the
    // preset list ran 32px under it, measured in review).
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
 * An open drawer lies over the board (spec §4.1): inside its stage — never
 * past the stage's edge onto the console. Neither tab has a rail beside the
 * board any more (handoff 2, PR 1 and PR 6), so the stage's own left edge is
 * the bound. Open only:
 * closed, the drawer is translated all but its handle past the stage's right
 * edge by design, and the stage clips it (`overflow: hidden`, shell.css).
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
 * The open settings drawer (handoff 2, PR 1) lies inside its stage and, from
 * 1024px up, beside the board rather than over it: the board's track gives way
 * by the drawer's width, so a knob change is always in sight. Below 1024 it
 * lies over the board (S), and only the stage bound is read. Open only:
 * closed, it is translated all but its handle past the stage's left edge,
 * which clips it.
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
      out.push({
        invariant: 'contrast',
        detail: `${label(node)} "${node.textContent?.trim().slice(0, 20)}" ${ratio.toFixed(2)}`,
      })
  }
  return out
}

/**
 * Spec §2's floors, measured with the drawer open: the widths the handoff's
 * sizes give the board today, held so a push that eats into it goes red.
 * Any other width from 768 up keeps the usable minimum.
 */
const BOARD_FLOORS: Readonly<Record<number, number>> = { 1440: 501, 1024: 440, 768: 678 }

/**
 * The board keeps a usable width (handoff 2, PR 7): spec §2's floor at the
 * handoff's sizes, at least 320px at any other width from 768 up, whatever
 * the drawer does, and edge to edge on a phone (the package measured 359 at
 * 375). Solo is its own case: the board takes the panel.
 */
function boardWidth(root: HTMLElement, solo: boolean): Finding[] {
  const board = root.querySelector('.fw-board')
  if (board === null || !rendered(board) || solo) return []
  const w = board.getBoundingClientRect().width
  const floor = window.innerWidth < 768 ? window.innerWidth - 16 : (BOARD_FLOORS[window.innerWidth] ?? 320)
  return w + EPS < floor ? [{ invariant: 'board-width', detail: `board ${w.toFixed(0)}px < ${floor}` }] : []
}

/** At M and S the right column is a bar under the board, one or two lines tall. */
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
    if (r.height > 104 + EPS) out.push({ invariant: 'bar-row', detail: `${label(bar)} ${r.height.toFixed(0)}px tall` })
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
 * At XS every control a thumb reaches in the shell and in the open sheets
 * (spec §7) is 44px tall to the finger: its box, or its `::before` where the
 * drawing is smaller (the switch, the menu chip). Inside a knob row the
 * handoff draws smaller on purpose, and touch.browser.test.tsx pins those
 * sizes: the `?` and the chips are 32 (skipped here), a select is 40.
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

/**
 * An element carrying `hidden` has no box: a `display` rule on it would undo
 * the attribute (the package's own XS preset panel did). Spec §3.
 */
function hiddenBox(root: HTMLElement): Finding[] {
  return [...root.querySelectorAll('[hidden]')]
    .filter((el) => el.closest('main[hidden]') === null && rendered(el))
    .map((el) => ({ invariant: 'hidden-box' as const, detail: label(el) }))
}

/**
 * A knob row keeps its cells in its own tracks (live pass, 2026-09-23).
 * `panel-overflow` cannot see this: `.kv` clips the row (`overflow: hidden`)
 * before `.fw-knobs` grows. Two readings: no rendered cell ends past the row
 * (at 1280×800 the five tracks needed 404px of a 360px row and the bound
 * track fell off the edge), and the last rendered cell ends inside the last
 * track (at 600×900 the bounds were `display: none` on a five-track grid, so
 * the slider auto-placed into a 36px bound track and 234px stood empty).
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
      out.push({ invariant: 'knob-row', detail: `${label(row)} "${row.textContent?.trim().slice(0, 24) ?? ''}" ends at ${end.toFixed(0)} > ${edge.toFixed(0)}` })
    else if (end < edge - last - EPS)
      out.push({ invariant: 'knob-row', detail: `${label(row)} "${row.textContent?.trim().slice(0, 24) ?? ''}" ends at ${end.toFixed(0)}, ${(edge - end).toFixed(0)}px short of ${edge.toFixed(0)}` })
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
  ]
}
