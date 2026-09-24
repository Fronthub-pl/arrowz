import { COMMAND_PREFIX } from '@arrowz/engine/command'
import { Fragment, type ReactElement } from 'react'

/**
 * A `deno task carve` command as the lab shows it: the program in `--ash`,
 * each flag in a `span.ln` that never breaks inside itself, the flag's name in
 * `--ash` and its value in `--ink`. The flags are separated by real spaces in
 * the DOM, so the box can break a line only there and a selection reads back
 * as the one-line command. A string that is not a carve command (a hand-edited
 * store entry) is shown as it is.
 */
export function CommandText({ command }: { command: string }): ReactElement {
  if (!command.startsWith(`${COMMAND_PREFIX} `)) return <>{command}</>
  const tokens = command.slice(COMMAND_PREFIX.length + 1).split(' ')
  return (
    <>
      <span className="ln">{COMMAND_PREFIX}</span>
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
