import type { ViewNumber } from '@arrowz/engine'
import { viewNumberOf } from '@arrowz/engine/command'
import type { ReactElement } from 'react'
import { ColoursSection, fieldOf, FlagRow, NumberRow, Section } from '../console/ViewPanel'
import { useDictionary } from '../i18n'
import { BOARDS_PREVIEW_ID, boardsTabId } from './BoardsRail'
import { refreshLibrary } from './useLibraryList'
import { useOpenPreview } from './useOpenPreview'
import { useViewSave } from './useViewSave'

/** The stored view's numbers a row edits, as the old detail's three fields did. */
const STORED_NUMBERS: readonly ViewNumber[] = ['stroke', 'headWidth', 'headHeight']

/**
 * The drawer's Preview panel on the saved boards (handoff 2, PR 6), in the
 * lab's knob rows. Two sections, because the stage draws a stored board from
 * two owners: its arrows come from the view saved with it — an edit redraws the
 * board and goes back to the store with the same file (`useViewSave`) — and
 * its colours from the lab, whose theme, palette, paper and ink `BoardFrame`
 * lays over any board. A stored board carries no highlight and its export cell
 * is the one it was saved with, so neither has a row here (Ruling 3 of PR 5b).
 */
export function BoardPreview(): ReactElement {
  const dict = useDictionary()
  const open = useOpenPreview()
  const commitView = useViewSave(refreshLibrary)
  const view = open?.stored.meta.view ?? null
  return (
    <div className="fw-knobs" role="tabpanel" id={BOARDS_PREVIEW_ID} aria-labelledby={boardsTabId('preview')}>
      <div className="fw-khd">
        <b>{dict.t('preview')}</b>
      </div>
      <div className="kv kv-g">
        <Section id="boards-sec-arrows" title={dict.t('secStoredArrows')}>
          {view === null ? <p className="fw-lib-empty">{dict.t('openBoardHint')}</p> : (
            <>
              {STORED_NUMBERS.map((key) => (
                <NumberRow
                  key={key}
                  field={fieldOf(key)}
                  value={view[key]}
                  stroke={view.stroke}
                  // Clamped here: a stored view has no slice to clamp it.
                  onSet={(next) => commitView({ ...view, [key]: viewNumberOf(String(next), key) })}
                />
              ))}
              <FlagRow
                flag="rounded"
                on={view.rounded !== false}
                onToggle={() => commitView({ ...view, rounded: view.rounded === false })}
              />
              <FlagRow flag="colored" on={view.colored} onToggle={() => commitView({ ...view, colored: !view.colored })} />
            </>
          )}
        </Section>
        <ColoursSection />
      </div>
    </div>
  )
}
