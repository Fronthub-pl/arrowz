import { boardId } from '@arrowz/engine/command'
import { describe, expect, test } from 'vitest'
import { aboutOf, aboutProblem, readBoardCmd, statKeysOf, statsProblem } from './boards'

describe('readBoardCmd', () => {
  test('reads the flags with the CLI’s parser: knobs, view and the cache key', () => {
    const { spec, problems } = readBoardCmd('--width=30 --height=20 --seed=42 --length=0 --colored --line=0.2')
    expect(problems).toEqual([])
    expect(spec?.params.W).toBe(30)
    expect(spec?.params.H).toBe(20)
    expect(spec?.params.seed).toBe(42)
    expect(spec?.view.colored).toBe(true)
    expect(spec?.view.stroke).toBe(0.2)
    expect(spec?.key).toBe(spec === null ? '' : boardId(spec.params))
  })

  test('picture flags do not change the key: the board is the same', () => {
    const plain = readBoardCmd('--width=20 --height=20 --seed=7').spec
    const colored = readBoardCmd('--width=20 --height=20 --seed=7 --colored --line=0.9').spec
    expect(colored?.key).toBe(plain?.key)
  })

  test.each([
    ['deno task carve --width=20 --height=20', 'the flags only'],
    ['--width=20 --height=20 --randomized', '--randomized'],
    ['--width=20 --height=20 --svg', 'no modes'],
    ['--width=20', 'missing --height'],
    ['--width=20 --height=20 --pstraight=0.2', 'outside'],
    ['--width=20 --height=20 --bogus', 'unknown flag'],
    ["--width=20 --height='20", 'quote'],
  ])('refuses %s', (cmd, needle) => {
    const { spec, problems } = readBoardCmd(cmd)
    expect(spec).toBeNull()
    expect(problems.join(' | ')).toContain(needle)
  })
})

test('statKeysOf keeps the report rows it names, in order', () => {
  expect(statKeysOf('pieces  avgLen time')).toEqual(['pieces', 'avgLen', 'time'])
  expect(statKeysOf(undefined)).toEqual([])
})

test('statsProblem names what is not a report row, and an empty list', () => {
  expect(statsProblem('pieces f0')).toBeNull()
  expect(statsProblem('pieces arrows')).toContain('arrows')
  expect(statsProblem(' ')).not.toBeNull()
})

test('about is a whole number of seconds', () => {
  expect(aboutProblem('10')).toBeNull()
  expect(aboutProblem('0')).not.toBeNull()
  expect(aboutProblem('ten')).not.toBeNull()
  expect(aboutOf({ manual: '', about: '10' })).toBe(10)
  expect(aboutOf({ cmd: '--width=4 --height=4' })).toBeNull()
})
