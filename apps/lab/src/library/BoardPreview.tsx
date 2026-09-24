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
 * The drawer's Preview panel on the saved boards, in the lab's knob rows. Two
 * sections, because a stored board has two owners: its arrows come from the
 * view saved with it (an edit goes back to the store, `useViewSave`), its
 * colours from the lab (`BoardFrame` lays them over any board). No rows for the
 * highlight (a stored board has none) or the export cell (fixed at save).
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
          {view === null ? (
            <p className="fw-lib-empty">{dict.t('openBoardHint')}</p>
          ) : (
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
              <FlagRow
                flag="colored"
                on={view.colored}
                onToggle={() => commitView({ ...view, colored: !view.colored })}
              />
            </>
          )}
        </Section>
        <ColoursSection />
      </div>
    </div>
  )
}
