/**
 * One of the Arrowz page's rule boards (`::play`), to play. The element in
 * `play` mode decides each move itself; the line under it answers the two
 * events a move raises, and Start over puts the arrows back. The board and the
 * view are module constants: a re-render — a language switch — must never
 * hand the element a new board, which would start its game over. The gesture
 * is the element's, so a player's stored choice stands.
 */
import type { ArrowzBoard } from '@arrowz/board-element'
import { type ReactElement, useRef, useState } from 'react'
import type { PlainUiKey } from '../console/viewFields'
import { useDictionary } from '../i18n'
import { BoardCanvas } from '../stage/BoardCanvas'
import { useStore } from '../state/store'
import { RULE_BOARDS, type RuleBoardName } from './ruleBoards'

/** Each arrow in its own colour, so it is easy to follow; the element draws colour only with `enableColors`. */
const VIEW = { colored: true }

const NAMES: Readonly<Record<RuleBoardName, PlainUiKey>> = {
  'rule-free': 'docsRuleFree',
  'rule-blocked': 'docsRuleBlocked',
  'rule-shape': 'docsRuleShape',
}

type Said = 'prompt' | 'left' | 'bounced'

const LINES: Readonly<Record<Said, PlainUiKey>> = {
  prompt: 'docsPlayPrompt',
  left: 'docsPlayLeft',
  bounced: 'docsPlayBounced',
}

export function RulePlay({ name }: { name: RuleBoardName }): ReactElement {
  const dict = useDictionary()
  const lang = useStore((state) => state.lang.lang)
  const element = useRef<ArrowzBoard>(null)
  const [said, setSaid] = useState<Said>('prompt')
  const restart = () => {
    element.current?.restart()
    setSaid('prompt')
  }
  return (
    <figure className="fw-docs-play" aria-label={dict.t(NAMES[name])}>
      <BoardCanvas
        ref={element}
        board={RULE_BOARDS[name]}
        view={VIEW}
        play
        enableColors
        showPoints
        pad={1}
        lang={lang}
        onPieceRemoved={() => setSaid('left')}
        onLifeLost={() => setSaid('bounced')}
      />
      <div className="fw-docs-playline">
        <span role="status">{dict.t(LINES[said])}</span>
        <button type="button" className="fw-btn" disabled={said === 'prompt'} onClick={restart}>
          {dict.t('docsPlayRestart')}
        </button>
      </div>
    </figure>
  )
}
