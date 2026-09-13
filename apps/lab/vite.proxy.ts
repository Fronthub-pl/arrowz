import type { ProxyOptions } from 'vite'

/** Where `deno task lab` listens unless it is told otherwise. */
export const LAB_SERVER = 'http://127.0.0.1:8777'

/**
 * The board store's two paths, proxied to the Deno lab server.
 *
 * A target and nothing else. `changeOrigin` would rewrite `Host` to the
 * target's, and the server derives its own origin from `Host` before
 * comparing it with the request's `Origin` (`lab-server.ts:66-79`) — so
 * setting it is what would earn the 403 that spec §9.1 predicts, and a
 * `proxyReq` hook rewriting `Origin` would then be needed to undo the damage.
 * Forwarding the browser's own `Host` keeps the pair consistent by
 * construction, and `localhost` is in the server's LOCAL_HOSTS. Measured
 * against Vite 8.2.2; `boards.node.test.ts` holds the line.
 *
 * Both keys end in a slash. Vite matches string keys by prefix, so `/boards`
 * would also capture the application's own Saved boards route.
 */
export function labProxy(target: string = LAB_SERVER): Record<string, ProxyOptions> {
  return { '/api/': { target }, '/boards/': { target } }
}
