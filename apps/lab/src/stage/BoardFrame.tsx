import { type ArrowzBoard, boardViewOf, type ColoredChangeEvent } from '@arrowz/board-element'
import { type ReactElement, useLayoutEffect, useMemo, useRef } from 'react'
import { useDictionary } from '../i18n'
import { useInLibrary } from '../library/useInLibrary'
import { refreshLibrary } from '../library/useLibraryList'
import { useViewSave } from '../library/useViewSave'
import { useStore } from '../state/store'
import { viewOf } from '../state/view.slice'
import { BoardCanvas } from './BoardCanvas'
import { BoardModeLine, BoardModeSwitch, useBoardSession } from './BoardMode'

/**
 * The paper frame around the one `<arrowz-board>`, and what sits on it: the
 * annotation of the board on screen, the board mode and its line, and the solo
 * toggle. All come after the element in DOM order, because the element's host
 * is opaque and positioned, so tree order is what puts them on top; all are
 * absolutely positioned in `.fw-board`, so they take no height from the
 * element, and all keep clear of the element's own bar at the bottom right.
 *
 * The element's view is memoised on the *slice's* identity, not rebuilt per
 * render: `run.progressed()` replaces `state.run` and leaves `state.view` and
 * `state.result` alone, so a run's progress messages reassign nothing on the
 * element, while editing a preview field redraws the board without generating.
 */
export function BoardFrame(): ReactElement {
  const dict = useDictionary()
  const result = useStore((state) => state.result.shown)
  const preview = useStore((state) => state.result.preview)
  const inLibrary = useInLibrary()
  const view = useStore((state) => state.view)
  const lang = useStore((state) => state.lang.lang)
  // A stored board is drawn under its own saved view (`meta.view`), and only
  // while the Boards tab is showing: the preview is cleared one commit after
  // the route changes. Colour overrides are added only when the user set them:
  // the element treats even an empty field as "stated", so it would beat the
  // chosen theme and then sanitise back to the default, turning a dark theme
  // light. Colour is a viewing preference, so the lab board and the preview share it.
  const paletteOverride = useMemo(() => (view.palette.length > 0 ? { palette: view.palette } : {}), [view.palette])
  const colourOverride = useMemo(
    () => ({
      ...(view.paper === '' ? {} : { paper: view.paper }),
      ...(view.ink === '' ? {} : { ink: view.ink }),
      ...(view.highlight === '' ? {} : { highlight: view.highlight }),
    }),
    [view.paper, view.ink, view.highlight],
  )
  const labView = useMemo(
    () => ({
      ...boardViewOf(viewOf(view), view.voids),
      ...paletteOverride,
      ...colourOverride,
    }),
    [view, paletteOverride, colourOverride],
  )
  const elementView = useMemo(
    () =>
      preview === null || !inLibrary
        ? labView
        : { ...boardViewOf(preview.meta.view, preview.meta.ok === false), ...paletteOverride, ...colourOverride },
    [preview, labView, inLibrary, paletteOverride, colourOverride],
  )
  // The tab decides, not the presence of a preview: in the library a board
  // that could not be read leaves the stage empty, and the lab's own board must
  // not stand in for it.
  const shown = inLibrary ? preview : result
  const board = inLibrary ? (preview?.board ?? null) : (result?.board ?? null)
  const named =
    shown === null
      ? null
      : inLibrary && preview !== null
        ? { W: preview.meta.W, H: preview.meta.H, seed: preview.meta.seed }
        : result === null
          ? null
          : { W: result.params.W, H: result.params.H, seed: result.params.seed }
  const solo = useStore((state) => state.ui.solo)
  const toggleSolo = useStore((state) => state.ui.toggleSolo)
  const toggle = useRef<HTMLButtonElement>(null)
  const commitView = useViewSave(refreshLibrary)
  // The element's ◑ button would otherwise keep a colour of its own, and the
  // lab's colour switch would stop changing the board after one click. So the
  // lab cancels it and writes the flag to whoever owns what is drawn, under the
  // same gate as `elementView`: the stored view for a stored board, the lab's
  // otherwise, and nowhere in the library with nothing on stage.
  const onColoredChange = (event: ColoredChangeEvent) => {
    event.preventDefault()
    const { colored } = event.detail
    if (inLibrary) {
      if (preview !== null) commitView({ ...preview.meta.view, colored })
    } else useStore.getState().view.setFlag('colored', colored)
  }
  const mode = useStore((state) => state.ui.boardMode)
  const element = useRef<ArrowzBoard>(null)
  const session = useBoardSession(board, mode, element)

  // Solo hides everything in the lab but the board, and HTML's focus fixup
  // would drop a focus left in there onto <body>. A layout effect runs first,
  // moving it to the toggle, which is how solo is undone. Only on the way in,
  // and only from inside the lab and outside this frame (the tab strip, the
  // top bar and the run status stay on screen).
  useLayoutEffect(() => {
    const button = toggle.current
    if (!solo || button === null) return
    const active = document.activeElement
    const lab = button.closest('.fw-lab')
    const frame = button.closest('.fw-boardwrap')
    if (active !== null && lab !== null && lab.contains(active) && frame !== null && !frame.contains(active)) {
      button.focus()
    }
  }, [solo])
  return (
    <div className="fw-boardwrap">
      <div className="fw-board">
        {/* `enableColors`: the element draws in ink unless its host grants
            colours, and the lab does — without it the `colored` flag reaches
            the element and changes nothing on screen. */}
        <BoardCanvas
          ref={element}
          board={board}
          view={elementView}
          interactive={mode === 'inspect'}
          play={mode === 'play'}
          lang={lang}
          enableColors
          theme={view.theme}
          showPoints={view.showPoints}
          pointColor={view.pointColor}
          pointRadius={view.pointRadius}
          pad={view.pad}
          onColoredChange={onColoredChange}
          onPieceClick={session.onPieceClick}
          onPieceRemoved={session.onPieceRemoved}
          onLifeLost={session.onLifeLost}
          onFinished={session.onFinished}
        />
        {named === null ? null : (
          <span className="fw-anno">{dict.t('boardAnnotation', named.W, named.H, named.seed)}</span>
        )}
        {board === null ? null : <BoardModeSwitch />}
        {/* Its own glyph: `⤢` is the element's fit button. */}
        <button
          ref={toggle}
          type="button"
          className="fw-solo"
          aria-label={dict.t('fullView')}
          title={dict.t('fullView')}
          aria-pressed={solo}
          aria-keyshortcuts="f"
          onClick={toggleSolo}
        >
          ⛶
        </button>
        <BoardModeLine session={session} />
      </div>
    </div>
  )
}
