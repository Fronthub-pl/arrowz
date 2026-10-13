// Starts the board store at http://localhost:8777/api/boards
//
// The lab itself is `apps/lab` (`pnpm nx serve lab`, port 8779); this serves
// the store it reads and writes, through the proxy in apps/lab/vite.proxy.ts.
// The CLI writes the same directory directly, without this server.
// Run: deno task store [port]
import { dirname, fromFileUrl } from '@std/path'
import { boardsDir } from './store.ts'

/**
 * What `deno` is run with to serve the store under `boards` on `port`. The
 * server gets what it serves and nothing more: this machine's network on the
 * one port it binds, and the store, which it reads and writes. The last
 * argument ties its life to its input, which the launcher holds.
 */
export function serverArgs(port: number, boards: string): string[] {
  return [
    'run',
    `--allow-net=127.0.0.1:${port}`,
    `--allow-read=${boards}`,
    `--allow-write=${boards}`,
    '--allow-env=ARROWZ_BOARDS_DIR',
    'store-server.ts',
    String(port),
    '--until-input-ends',
  ]
}

if (import.meta.main) {
  const port = Number(Deno.args[0] ?? 8777)
  // The store is handed on under its real, absolute name, so the grant and the
  // directory the server opens are one string: the server resolves its base
  // from exactly what was granted, never from another spelling of it.
  Deno.mkdirSync(boardsDir(), { recursive: true })
  const boards = Deno.realPathSync(boardsDir())
  const server = new Deno.Command('deno', {
    args: serverArgs(port, boards),
    cwd: dirname(fromFileUrl(import.meta.url)),
    env: { ARROWZ_BOARDS_DIR: boards },
    // Never written to: the system closes it when this process ends, however
    // it ends, and the server ends with it.
    stdin: 'piped',
  }).spawn()
  // An end this process is told of is passed on, so that it ends after the
  // server and the port is free by then. On Windows Deno listens for an
  // interrupt only.
  const ends: Deno.Signal[] = Deno.build.os === 'windows' ? ['SIGINT', 'SIGBREAK'] : ['SIGINT', 'SIGTERM']
  for (const signal of ends) {
    Deno.addSignalListener(signal, () => {
      try {
        server.kill()
      } catch {
        // The same interrupt reached the server first.
      }
    })
  }
  Deno.exit((await server.status).code)
}
