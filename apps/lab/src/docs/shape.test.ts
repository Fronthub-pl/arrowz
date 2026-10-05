import { describe, expect, test } from 'vitest'
import { parseDocs } from './markdown'
import { problemsOf, shapeOf } from './shape'

const PAGES = ['element', 'cli']
const problems = (markdown: string) => problemsOf(parseDocs(markdown), PAGES)

describe('problemsOf', () => {
  test('a page the renderer can show has none', () => {
    const ok = [
      '# Title',
      'Lead with `code`, *em*, **strong** and [a link](docs:cli#knobs) and [out](https://example.com).',
      '> A note.',
      '## Part {#part}',
      '### Detail',
      '- one\n- two',
      '| a | b |\n|---|---|\n| 1 | 2 |',
      '```sh\ndeno task carve --width=4\n```',
      '::table{of="element-props"}',
      '::help{form="knobs"}',
    ].join('\n\n')
    expect(problems(ok)).toEqual([])
  })

  test.each([
    ['raw HTML', '# T\n\nThe <b>bold</b> way.', 'html is not shown'],
    ['a text directive', '# T\n\nAt 10:30 sharp.', 'textDirective is not shown'],
    ['a ## without an id', '# T\n\n## Part', '## needs a {#id}'],
    ['an id on a ###', '# T\n\n### Part {#part}', 'only ## carries a {#id}'],
    ['an id twice', '# T\n\n## A {#a}\n\n## B {#a}', '{#a} twice'],
    ['a heading too deep', '# T\n\n#### Deep', 'deeper than ###'],
    ['a second title', '# T\n\n# U', '# is the page title'],
    ['no title', 'Text.', 'opens with its # title'],
    ['code without a language', '# T\n\n```\nx\n```', 'code needs one of'],
    ['a link to an unknown page', '# T\n\n[x](docs:nowhere#a)', 'is neither'],
    ['a relative link', '# T\n\n[x](cli.md)', 'is neither'],
    ['an unknown directive', '# T\n\n::video{src="x"}', '::video is not a docs directive'],
    ['an unknown attribute', '# T\n\n::table{of="element-props" wide}', '::table takes no wide'],
    ['an unknown value', '# T\n\n::table{of="knobs"}', 'of="knobs" is not one of'],
    ['a missing attribute', '# T\n\n::help', '::help needs form'],
    ['a label', '# T\n\n::help[Help]{form="short"}', '::help takes no label'],
    ['a block in a note', '# T\n\n> - a list', 'a note holds paragraphs only'],
    ['a directive named after an Object method', '# T\n\n::toString', '::toString is not a docs directive'],
    [
      'an attribute named after an Object method',
      '# T\n\n::table{of="element-props" constructor="x"}',
      '::table takes no constructor',
    ],
  ])('refuses %s', (_, markdown, message) => {
    expect(problems(markdown).join('\n')).toContain(message)
  })
})

describe('shapeOf', () => {
  test('a translation has the same shape', () => {
    const en =
      '# Board\n\nLead.\n\n## Using it {#example}\n\n```sh\n# make one\ndeno task carve --width=4  # small\n```\n\n::table{of="element-props"}\n\nSee [the knobs](docs:cli#knobs).'
    const pl =
      '# Plansza\n\nWstęp.\n\n## Jak użyć {#example}\n\n```sh\n# zrób jedną\ndeno task carve --width=4  # mała\n```\n\n::table{of="element-props"}\n\nZobacz [pokrętła](docs:cli#knobs).'
    expect(shapeOf(parseDocs(pl))).toEqual(shapeOf(parseDocs(en)))
  })

  test.each([
    ['another id', '## A {#a}', '## A {#b}'],
    ['another directive value', '::table{of="element-props"}', '::table{of="element-slots"}'],
    ['another command', '```sh\ndeno task carve --width=4\n```', '```sh\ndeno task carve --width=5\n```'],
    ['another link target', '[x](docs:cli#a)', '[x](docs:cli#b)'],
    ['a missing note', '> Note.\n\nText.', 'Text.'],
    ['another table size', '| a |\n|---|\n| 1 |', '| a |\n|---|\n| 1 |\n| 2 |'],
    ['another kind of list', '- a\n- b', '1. a\n2. b'],
  ])('tells %s apart', (_, a, b) => {
    expect(shapeOf(parseDocs(`# T\n\n${a}`))).not.toEqual(shapeOf(parseDocs(`# T\n\n${b}`)))
  })
})
