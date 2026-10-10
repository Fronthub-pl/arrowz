import { commandPrefixOf } from '@fronthub/arrowz-engine/command'
import { Fragment, type ReactElement } from 'react'

/**
 * A carve command as the lab shows it: the program in `--ash`, each flag in a
 * `span.ln` that never breaks inside itself, the flag's name in `--ash` and
 * its value in `--ink`. The flags are separated by real spaces in the DOM, so
 * the box can break a line only there and a selection reads back as the
 * one-line command. The program is whichever spelling the command carries (see
 * `COMMAND_PREFIXES`); a string that is not a carve command (a hand-edited
 * store entry) is shown as it is.
 */
export function CommandText({ command }: { command: string }): ReactElement {
  const prefix = commandPrefixOf(command)
  if (prefix === null || command === prefix) return <>{command}</>
  const tokens = command.slice(prefix.length + 1).split(' ')
  return (
    <>
      <span className="ln">{prefix}</span>
      {tokens.map((token, i) => {
        const eq = token.indexOf('=')
        return (
          // A token may repeat in a hand-written command; its position may not.
          <Fragment key={`${i}:${token}`}>
            {' '}
            <span className="ln">
              {eq < 0 ? (
                <b>{token}</b>
              ) : (
                <>
                  <span className="f">{token.slice(0, eq + 1)}</span>
                  <b>{token.slice(eq + 1)}</b>
                </>
              )}
            </span>
          </Fragment>
        )
      })}
    </>
  )
}
