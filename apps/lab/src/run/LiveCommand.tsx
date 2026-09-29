import { buildCommand } from '@arrowz/engine/command'
import { useDictionary } from '../i18n'
import { useStore } from '../state/store'
import { viewOf } from '../state/view.slice'
import { CommandFigure } from './CommandFigure'

/**
 * The command that would reproduce what is configured, not what is drawn: the
 * lab is a layer over the CLI and must show exactly what would be run.
 */
export function LiveCommand() {
  const dict = useDictionary()
  const values = useStore((state) => state.params.values)
  const view = useStore((state) => state.view)
  return (
    <CommandFigure
      label={dict.t('commandHead')}
      caption={dict.t('cliLabel')}
      command={buildCommand(values, viewOf(view))}
    />
  )
}
