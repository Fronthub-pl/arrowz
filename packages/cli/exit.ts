// How a command ends the program: it throws, and arrowz.ts sets the status.
// Node's process.exit() drops output still on its way to a pipe or a Windows
// terminal, so nothing here calls it.

/** The status a command ended with, on its way to arrowz.ts. */
export class Exit extends Error {
  constructor(readonly code: number) {
    super(`exit ${code}`)
  }
}

/** Ends the program with this status once everything printed has been written. */
export function exit(code: number): never {
  throw new Exit(code)
}
