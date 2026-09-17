import type { ProxyOptions } from 'vite'

/** Where `deno task store` listens unless it is told otherwise. */
export const LAB_SERVER = 'http://127.0.0.1:8777'

/**
 * The board store's two paths, proxied to the Deno store server.
 *
 * A target and nothing else. `changeOrigin` would rewrite `Host` to the
 * target's, and the server derives its own origin from `Host` before
 * comparing it with the request's `Origin` (`store-server.ts`'s `refusal()`)
 * — so setting it is what would earn the 403 that spec §9.1 predicts, and a
 * `proxyReq` hook rewriting `Origin` would then be needed to undo the
 * damage. Forwarding the browser's own `Host` keeps the pair consistent by
 * construction, and `localhost` is in the server's LOCAL_HOSTS. Measured
 * against Vite 8.2.2; `boards.node.test.ts` holds the line.
 *
 * Both keys end in a slash, because Vite matches string keys by prefix. The
 * stored files answer to `/store/` rather than `/boards/`: `/boards` is this
 * application's library route and `/boards/<size>/<id>` is a board's own
 * address (spec §5.6), so no proxy key may begin with it.
 */
export function labProxy(target: string = LAB_SERVER): Record<string, ProxyOptions> {
  return { '/api/': { target }, '/store/': { target } }
}
