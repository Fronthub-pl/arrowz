#!/usr/bin/env node
// The `arrowz` program: `arrowz carve …` lays a board (carve.ts). It runs
// under Node, as the published package, and under Deno, as the repository
// task, so it and what it imports use `node:` built-ins only.
import process from 'node:process'
import { COMMAND_PREFIX } from '@fronthub/arrowz-engine/command'
import { Exit } from './exit.ts'

const USAGE = [
  `Usage: ${COMMAND_PREFIX} --width=N --height=N [--seed=N] [options] [mode]`,
  '',
  'Commands:',
  `  carve  lay one board and save it; ${COMMAND_PREFIX} --help lists the options`,
].join('\n')

const command = process.argv[2]
if (command === 'carve') {
  try {
    // A command is a program: importing it runs it, and it ends by throwing Exit.
    await import('./carve.ts')
  } catch (e) {
    if (!(e instanceof Exit)) throw e
    process.exitCode = e.code
  }
} else if (command === '--help' || command === '-h') {
  console.log(USAGE)
} else {
  if (command !== undefined) console.error(`arrowz: unknown command ${command}`)
  console.error(USAGE)
  process.exitCode = 2
}
