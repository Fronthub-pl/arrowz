// The README is the package's API reference, and the code is its source of
// truth: every export of mod.ts, every public member of the element and of
// GameHost, every event and slot, and the shape of every exported type must be
// in README.md, and nothing else may be. Each comparison runs both ways, so a
// row for something deleted fails as surely as a missing row.
//
// The API is read from the TypeScript checker, not from text: re-exports from
// @arrowz/engine resolve to their declarations, and a type's fields are the
// ones the compiler sees. Constant values come from importing mod.ts, which
// works in Node for the reason given in mod.test.ts.
import { readFileSync } from 'node:fs'
import { dirname, join } from 'node:path'
import { fileURLToPath } from 'node:url'
import ts from 'typescript'
import { expect, test } from 'vitest'
import * as api from './mod.ts'

const srcDir = dirname(fileURLToPath(import.meta.url))
const packageDir = dirname(srcDir)
const readme = readFileSync(join(packageDir, 'README.md'), 'utf-8')

const config = ts.parseJsonConfigFileContent(
  ts.readConfigFile(join(packageDir, 'tsconfig.json'), ts.sys.readFile).config,
  ts.sys,
  packageDir,
)
const modPath = join(srcDir, 'mod.ts')
const program = ts.createProgram([modPath], config.options)
const checker = program.getTypeChecker()

function sourceOf(path: string): ts.SourceFile {
  const file = program.getSourceFile(path)
  if (file === undefined) throw new Error(`${path} is not in the program`)
  return file
}

const modFile = sourceOf(modPath)
const moduleSymbol = checker.getSymbolAtLocation(modFile)
if (moduleSymbol === undefined) throw new Error('mod.ts has no module symbol')

/** Every export of mod.ts, its alias resolved to the declaration it names. */
const exports = new Map(
  checker
    .getExportsOfModule(moduleSymbol)
    .map((symbol) => [
      symbol.name,
      symbol.flags & ts.SymbolFlags.Alias ? checker.getAliasedSymbol(symbol) : symbol,
    ]),
)

const sorted = (values: Iterable<string>) => [...values].sort()

/**
 * A README table, by the first cell of its header row: one entry per body row,
 * the cells split on the pipes a table uses (an escaped `\|` stays in its cell).
 * A missing or empty table throws, so a renamed header cannot pass as "no rows".
 */
function table(header: string): string[][] {
  const lines = readme.split('\n')
  const start = lines.findIndex((line) => line.startsWith(`| ${header} |`))
  if (start === -1) throw new Error(`README has no table headed "${header}"`)
  const rows: string[][] = []
  for (const line of lines.slice(start + 2)) {
    if (!line.startsWith('|')) break
    rows.push(
      line
        .slice(1, -1)
        .split(/(?<!\\)\|/)
        .map((cell) => cell.trim()),
    )
  }
  if (rows.length === 0) throw new Error(`README table "${header}" has no rows`)
  return rows
}

/** The first backticked span of a cell, as written. */
function code(cell: string | undefined): string {
  const m = /`([^`]+)`/.exec(cell ?? '')
  if (m?.[1] === undefined) throw new Error(`no code span in "${cell}"`)
  return m[1]
}

/** `name(a, b)` → name and parameter names. */
function call(span: string): { name: string; params: string[] } {
  const m = /^(\w+)\(([^)]*)\)$/.exec(span)
  if (m?.[1] === undefined) throw new Error(`"${span}" is not written as name(params)`)
  const params = (m[2] ?? '').split(',').map((p) => p.trim()).filter((p) => p !== '')
  return { name: m[1], params }
}

const names = (header: string) => table(header).map((row) => code(row[0]))

// --- The element --------------------------------------------------------------

const elementFile = sourceOf(join(srcDir, 'arrowz-board.ts'))

function classNode(file: ts.SourceFile, name: string): ts.ClassDeclaration {
  const found = file.statements.find(
    (node): node is ts.ClassDeclaration => ts.isClassDeclaration(node) && node.name?.text === name,
  )
  if (found === undefined) throw new Error(`no class ${name} in ${file.fileName}`)
  return found
}

const hidden = new Set([
  ts.SyntaxKind.PrivateKeyword,
  ts.SyntaxKind.ProtectedKeyword,
  ts.SyntaxKind.StaticKeyword,
  ts.SyntaxKind.OverrideKeyword,
])

/** Methods and getters a consumer can call: neither private, protected, static nor a Lit override. */
function publicMembers(node: ts.ClassDeclaration): { methods: Map<string, string[]>; getters: string[] } {
  const methods = new Map<string, string[]>()
  const getters: string[] = []
  for (const member of node.members) {
    if (member.name === undefined || !ts.isIdentifier(member.name)) continue
    if (ts.canHaveModifiers(member) && ts.getModifiers(member)?.some((m) => hidden.has(m.kind)) === true) continue
    if (ts.isMethodDeclaration(member)) {
      methods.set(
        member.name.text,
        member.parameters.map((p) => p.name.getText()),
      )
    } else if (ts.isGetAccessorDeclaration(member)) getters.push(member.name.text)
    else if (ts.isSetAccessorDeclaration(member)) throw new Error(`a public setter (${member.name.text}) has no table`)
  }
  return { methods, getters }
}

const element = classNode(elementFile, 'ArrowzBoard')
const elementMembers = publicMembers(element)

/** The keys of `static properties`, less Lit's internal state (`state: true`). */
function reactiveProperties(node: ts.ClassDeclaration): string[] {
  const decl = node.members.find(
    (member): member is ts.PropertyDeclaration =>
      ts.isPropertyDeclaration(member) && member.name.getText() === 'properties',
  )
  const init = decl?.initializer
  if (init === undefined || !ts.isObjectLiteralExpression(init)) throw new Error('no static properties literal')
  return init.properties.flatMap((prop) => {
    if (!ts.isPropertyAssignment(prop)) return []
    const opts = prop.initializer
    const state = ts.isObjectLiteralExpression(opts) &&
      opts.properties.some(
        (o) =>
          ts.isPropertyAssignment(o) && o.name.getText() === 'state' &&
          o.initializer.kind === ts.SyntaxKind.TrueKeyword,
      )
    return state ? [] : [prop.name.getText()]
  })
}

test('the property table is the element’s reactive properties, both ways', () => {
  expect(sorted(names('Property'))).toEqual(sorted(reactiveProperties(element)))
})

test('the method table is the element’s public methods, with their parameter names', () => {
  const documented = new Map(names('Method').map((span) => [call(span).name, call(span).params]))
  expect(sorted(documented.keys())).toEqual(sorted(elementMembers.methods.keys()))
  for (const [name, params] of elementMembers.methods) expect(documented.get(name), name).toEqual(params)
})

test('the getter table is the element’s public getters, both ways', () => {
  expect(sorted(names('Getter'))).toEqual(sorted(elementMembers.getters))
})

/** The events mod.ts adds to `HTMLElementEventMap`. */
function declaredEvents(): string[] {
  const events: string[] = []
  const visit = (node: ts.Node): void => {
    if (ts.isInterfaceDeclaration(node) && node.name.text === 'HTMLElementEventMap') {
      for (const member of node.members) {
        if (member.name !== undefined) events.push(member.name.getText().replace(/'/g, ''))
      }
    }
    ts.forEachChild(node, visit)
  }
  visit(modFile)
  return events
}

test('the event table is the events mod.ts declares, both ways', () => {
  const declared = declaredEvents()
  expect(declared.length).toBeGreaterThan(0)
  expect(sorted(names('Event'))).toEqual(sorted(declared))
})

test('the slot table is the slots the element renders, both ways', () => {
  const rendered = [...elementFile.text.matchAll(/<slot name="([\w-]+)"/g)].map((m) => m[1] ?? '')
  expect(rendered.length).toBeGreaterThan(0)
  expect(sorted(names('Slot'))).toEqual(sorted(new Set(rendered)))
})

// --- The exports --------------------------------------------------------------

const EXPORT_TABLES = ['Type', 'Function', 'Constant', 'Class'] as const

test('every export is in exactly one export table, and every row is an export', () => {
  const rows = EXPORT_TABLES.flatMap((header) => names(header).map((span) => /^\w+/.exec(span)?.[0] ?? span))
  const counts = new Map<string, number>()
  for (const name of rows) counts.set(name, (counts.get(name) ?? 0) + 1)
  expect([...counts].filter(([, n]) => n > 1).map(([name]) => name), 'documented twice').toEqual([])
  expect(sorted(counts.keys())).toEqual(sorted(exports.keys()))
})

/** What a Shape cell must list for a type: its fields, or the literals of a union. */
function shapeOf(symbol: ts.Symbol): { by: 'fields' | 'literals'; values: string[] } {
  let type = checker.getDeclaredTypeOfSymbol(symbol)
  // A CustomEvent's shape is its detail.
  if (type.getSymbol()?.name === 'CustomEvent') {
    const arg = checker.getTypeArguments(type as ts.TypeReference)[0]
    if (arg !== undefined) type = arg
  }
  if (type.isUnion()) {
    const literals = type.types.flatMap((member) => {
      if (member.isStringLiteral()) return [member.value]
      // A union of objects is told apart by its `type` field.
      const tag = member.getProperty('type')
      const tagType = tag === undefined ? undefined : checker.getTypeOfSymbol(tag)
      return tagType?.isStringLiteral() === true ? [tagType.value] : []
    })
    return { by: 'literals', values: literals }
  }
  return { by: 'fields', values: checker.getPropertiesOfType(type).map((p) => p.name) }
}

test('every type row spells the fields, or the union members, the type declares', () => {
  for (const row of table('Type')) {
    const name = code(row[0])
    const symbol = exports.get(name)
    if (symbol === undefined) continue
    const shape = shapeOf(symbol)
    const cell = row[2] ?? ''
    const written = shape.by === 'fields'
      ? [...cell.matchAll(/`(\w+)`:/g)].map((m) => m[1] ?? '')
      : [...cell.matchAll(/`'([^']*)'`/g)].map((m) => m[1] ?? '')
    expect(sorted(written), `shape of ${name}`).toEqual(sorted(shape.values))
  }
})

test('every function row spells the parameter names the function declares', () => {
  for (const row of table('Function')) {
    const { name, params } = call(code(row[0]))
    const decl = exports.get(name)?.declarations?.[0]
    if (decl === undefined || !ts.isFunctionDeclaration(decl)) throw new Error(`${name} is not a function declaration`)
    expect(params, name).toEqual(decl.parameters.map((p) => p.name.getText()))
  }
})

/**
 * A value as the Constant table writes it: strings quoted, objects as
 * `{ key: value }`, and an object of objects (THEMES, BOARD_LABELS) as its keys.
 */
function spell(value: unknown): string {
  if (typeof value === 'string') return `'${value}'`
  if (Array.isArray(value)) return `[${value.map(spell).join(', ')}]`
  if (typeof value === 'object' && value !== null) {
    const entries = Object.entries(value)
    if (entries.some(([, v]) => typeof v === 'object' && v !== null && !Array.isArray(v))) {
      return `{ ${entries.map(([k]) => k).join(', ')} }`
    }
    return `{ ${entries.map(([k, v]) => `${k}: ${spell(v)}`).join(', ')} }`
  }
  return String(value)
}

test('every constant row spells the value the package exports', () => {
  const values = api as Record<string, unknown>
  for (const row of table('Constant')) {
    const name = code(row[0])
    expect(code(row[1]), name).toBe(spell(values[name]))
  }
})

test('every class row lists the class’s public members', () => {
  for (const row of table('Class')) {
    const name = code(row[0])
    // The element's members have their own tables above; its row points there.
    if (name === 'ArrowzBoard') continue
    const decl = exports.get(name)?.declarations?.[0]
    if (decl === undefined || !ts.isClassDeclaration(decl)) throw new Error(`${name} is not a class declaration`)
    const { methods, getters } = publicMembers(decl)
    const written = [...(row[2] ?? '').matchAll(/`(\w+)(?:\([^)]*\))?`/g)].map((m) => m[1] ?? '')
    expect(sorted(written), `members of ${name}`).toEqual(sorted([...methods.keys(), ...getters]))
  }
})
