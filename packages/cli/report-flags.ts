/** `deno task report`'s own flags: taken off argv before the shared parser, which refuses what it does not know. */
export const REPORT_FLAGS: ReadonlySet<string> = new Set(['runs', 'bench', 'only', 'mid', 'square', 'portrait', 'show'])
