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
 * one port it binds, and the store, which it reads and writes.
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
  }).spawn()
  // The server is another process, so an end sent to this one alone is passed
  // on. On Windows Deno listens for an interrupt only: a process that is ended
  // there is not told.
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
