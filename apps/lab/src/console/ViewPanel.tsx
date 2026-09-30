import { useShallow } from 'zustand/react/shallow'
import { useDictionary } from '../i18n'
import { useStore } from '../state/store'
import { panelId, tabId } from './GroupRail'
import { CollapsibleBlock } from './KnobRow'
import { ColourRow } from './rows/ColourRow'
import { ColoursSection } from './rows/ColoursSection'
import { SwitchRow } from './rows/FlagRow'
import { PadRow, PointRadiusRow, ViewNumberRow } from './rows/NumberRow'
import { Section } from './rows/Section'

/**
 * The element's settings as knob rows, on the knobs' grid: arrows, highlight,
 * grid, colours and export. The top count lives under the highlight switch
 * and the dot colour and radius under the point grid's, in blocks that open
 * with their switch or for a palette jump to one of their rows. The engine
 * never sees them, so they carry no violation and no inactive reason, and
 * editing one redraws the board without generating.
 */
export function ViewPanel() {
  const dict = useDictionary()
  const view = useStore(
    useShallow((state) => ({
      highlightLongest: state.view.highlightLongest,
      showPoints: state.view.showPoints,
      pointColor: state.view.pointColor,
      setPointColor: state.view.setPointColor,
    })),
  )
  const wanted = useStore((state) => state.ui.focusTarget)
  return (
    <div className="fw-knobs" role="tabpanel" id={panelId('preview')} aria-labelledby={tabId('preview')}>
      <div className="fw-khd">
        <b>{dict.t('preview')}</b>
      </div>
      <div className="kv kv-g">
        <Section id="view-sec-arrows" title={dict.t('secArrows')}>
          <ViewNumberRow field="stroke" />
          <ViewNumberRow field="headWidth" />
          <ViewNumberRow field="headHeight" />
          <SwitchRow flag="rounded" />
          <SwitchRow flag="colored" />
        </Section>
        <Section id="view-sec-highlight" title={dict.t('secHighlight')}>
          <SwitchRow flag="highlightLongest" />
          <CollapsibleBlock
            id="dep-highlight-longest"
            on={view.highlightLongest}
            forced={wanted === 'view-top'}
            needs={dict.t('needsHighlightLongest')}
            title={dict.t('viewShortHighlightLongest')}
            count={1}
          >
            <ViewNumberRow field="top" />
          </CollapsibleBlock>
        </Section>
        <Section id="view-sec-grid" title={dict.t('secGrid')}>
          <SwitchRow flag="voids" />
          <PadRow />
          <SwitchRow flag="showPoints" />
          <CollapsibleBlock
            id="dep-points"
            on={view.showPoints}
            forced={wanted === 'view-pointColor' || wanted === 'view-pointRadius'}
            needs={dict.t('needsPoints')}
            title={dict.t('viewShortShowPoints')}
            count={2}
          >
            <ColourRow
              id="view-pointColor"
              short={dict.t('viewShortPointColor')}
              help={dict.t('pointColorHelp')}
              title={dict.t('pointColorLabel')}
              value={view.pointColor}
              onChange={view.setPointColor}
            />
            <PointRadiusRow />
          </CollapsibleBlock>
        </Section>
        <ColoursSection />
        <Section id="view-sec-export" title={dict.t('secExport')}>
          <ViewNumberRow field="cell" />
        </Section>
      </div>
    </div>
  )
}
