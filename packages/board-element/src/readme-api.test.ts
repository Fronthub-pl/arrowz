// The README is the package's API reference, and the code is its source of
// truth: every export of mod.ts, every public member of the element and of
// GameHost, every event and slot, and the shape of every exported type must be
// in README.md, and nothing else may be. Each comparison runs both ways, so a
// row for something deleted fails as surely as a missing row. What the prose
// copies from the code (property defaults, the board keys, ranges and other
// numbers) is held to the code the same way. The Docs tab's
// export tables (`lab-docs.ts` in the engine) are held to the same reading of
// `mod.ts`, at the end of this file.
//
// The API is read from the TypeScript checker, not from text: re-exports from
// @fronthub/arrowz-engine resolve to their declarations, and a type's fields are the
// ones the compiler sees. Constant values come from importing mod.ts, which
// works in Node for the reason given in mod.test.ts.
import { readFileSync } from 'node:fs'
import { dirname, join } from 'node:path'
import { fileURLToPath } from 'node:url'
import {
  ELEMENT_CLASSES,
  ELEMENT_CONSTANTS,
  ELEMENT_FUNCTIONS,
  ELEMENT_TYPES,
  spellValue,
} from '@fronthub/arrowz-engine/docs'
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

/** `this.<name> = <value>` in the element's constructor: what each property starts as. */
function constructorDefaults(node: ts.ClassDeclaration): Map<string, ts.Expression> {
  const ctor = node.members.find(ts.isConstructorDeclaration)
  if (ctor?.body === undefined) throw new Error(`${node.name?.text} declares no constructor`)
  const defaults = new Map<string, ts.Expression>()
  for (const statement of ctor.body.statements) {
    if (!ts.isExpressionStatement(statement)) continue
    const e = statement.expression
    if (!ts.isBinaryExpression(e) || e.operatorToken.kind !== ts.SyntaxKind.EqualsToken) continue
    const target = e.left
    if (!ts.isPropertyAccessExpression(target) || target.expression.kind !== ts.SyntaxKind.ThisKeyword) continue
    defaults.set(target.name.text, e.right)
  }
  return defaults
}

test('the property table’s defaults are the values the constructor assigns', () => {
  const values = api as Record<string, unknown>
  const defaults = constructorDefaults(element)
  // `lang` has no accessor: its default is the global attribute's, not the constructor's.
  expect(names('Property').filter((name) => !defaults.has(name))).toEqual(['lang'])
  for (const row of table('Property')) {
    const value = defaults.get(code(row[0]))
    if (value === undefined) continue
    const spelled = ts.isIdentifier(value) ? spellValue(values[value.text]) : value.getText()
    expect(code(row[2]), code(row[0])).toBe(spelled)
  }
})

test('every paragraph that names the board keys names the keys onKeyDown matches, as typed', () => {
  const handler = element.members.find((member) => member.name?.getText() === 'onKeyDown')
  if (handler === undefined) throw new Error('ArrowzBoard has no onKeyDown')
  const keys = [...handler.getText().matchAll(/e\.key === '([^']+)'/g)].map((m) => m[1] ?? '')
  expect(keys.length).toBeGreaterThan(0)
  const paragraphs = readme.split('\n\n').filter((p) => !p.startsWith('|') && p.includes('`+`'))
  expect(paragraphs.length).toBeGreaterThan(0)
  for (const p of paragraphs) {
    const spans = [...p.matchAll(/`(.)`/g)].map((m) => m[1] ?? '')
    expect(sorted(spans), p.slice(0, 60)).toEqual(sorted(keys))
  }
})

// --- Numbers the prose copies -------------------------------------------------

test('every range the prose spells out is the range the package exports', () => {
  const values = api as Record<string, unknown>
  const spelled = [...readme.matchAll(/`(\w+_RANGE)` \((\S+) to (\S+)\)/g)]
  expect(spelled.length).toBeGreaterThan(0)
  for (const [, name = '', min, max] of spelled) {
    expect(`{ min: ${min}, max: ${max} }`, name).toBe(spellValue(values[name]))
  }
})

/** Numbers written out in the prose, each found by its sentence, with the value it copies. */
const COPIED: readonly { sentence: RegExp; value: number }[] = [
  { sentence: /merged over the CLI defaults \(stroke (\S+),/, value: api.DEFAULT_VIEW.stroke },
  { sentence: /radius `pointRadius` \(default `(\S+)`\)/, value: api.DEFAULT_POINT_RADIUS },
  { sentence: /default stroke half-width \(`(\S+)`\)/, value: api.DEFAULT_VIEW.stroke / 2 },
]

test('every number the prose copies from the code is that number', () => {
  for (const { sentence, value } of COPIED) {
    expect(sentence.exec(readme)?.[1], String(sentence)).toBe(String(value))
  }
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

test('every constant row spells the value the package exports', () => {
  const values = api as Record<string, unknown>
  for (const row of table('Constant')) {
    const name = code(row[0])
    expect(code(row[1]), name).toBe(spellValue(values[name]))
  }
})

function classOf(name: string): ts.ClassDeclaration {
  const decl = exports.get(name)?.declarations?.[0]
  if (decl === undefined || !ts.isClassDeclaration(decl)) throw new Error(`${name} is not a class declaration`)
  return decl
}

/** A class's constructor as a caller writes it: `new Class(params)`, with the declared parameter types. */
function construction(decl: ts.ClassDeclaration): string {
  const name = decl.name?.text ?? ''
  const ctor = decl.members.find(ts.isConstructorDeclaration)
  if (ctor === undefined) throw new Error(`${name} declares no constructor`)
  const signature = checker.getSignatureFromDeclaration(ctor)
  if (signature === undefined) throw new Error(`${name} has no constructor signature`)
  // The checker prints a constructor as `(params): Class`.
  const params = checker.signatureToString(signature)
    .slice(0, -`: ${checker.typeToString(signature.getReturnType())}`.length)
  return `new ${name}${params}`
}

test('every class row spells the constructor the class declares', () => {
  for (const row of table('Class')) {
    const name = code(row[0])
    expect(code(row[1]), name).toBe(construction(classOf(name)))
  }
})

test('every class row lists the class’s public members', () => {
  for (const row of table('Class')) {
    const name = code(row[0])
    // The element's members have their own tables above; its row points there.
    if (name === 'ArrowzBoard') continue
    const { methods, getters } = publicMembers(classOf(name))
    const written = [...(row[2] ?? '').matchAll(/`(\w+)(?:\([^)]*\))?`/g)].map((m) => m[1] ?? '')
    expect(sorted(written), `members of ${name}`).toEqual(sorted([...methods.keys(), ...getters]))
  }
})

// --- The Docs tab's export tables ---------------------------------------------

const DOCS_TABLES = {
  type: ELEMENT_TYPES,
  function: ELEMENT_FUNCTIONS,
  constant: ELEMENT_CONSTANTS,
  class: ELEMENT_CLASSES,
} as const

/** The table an export belongs in, by its declaration. */
function kindOf(symbol: ts.Symbol): keyof typeof DOCS_TABLES {
  const decl = symbol.declarations?.[0]
  if (decl === undefined) throw new Error(`${symbol.name} has no declaration`)
  if (ts.isFunctionDeclaration(decl)) return 'function'
  if (ts.isVariableDeclaration(decl)) return 'constant'
  if (ts.isClassDeclaration(decl)) return 'class'
  if (ts.isInterfaceDeclaration(decl) || ts.isTypeAliasDeclaration(decl)) return 'type'
  throw new Error(`${symbol.name} is a ${ts.SyntaxKind[decl.kind]}, which no table holds`)
}

test('the Docs tab lists every export once, in the table of its kind, and nothing else', () => {
  const listed: string[] = Object.values(DOCS_TABLES).flatMap((rows) => rows.map((row) => row.key))
  const twice = listed.filter((key, i) => listed.indexOf(key) !== i)
  expect(twice, 'listed twice').toEqual([])
  // By name, both ways: two arrays of fifty differ in a diff Vitest truncates to their lengths.
  expect([...exports.keys()].filter((name) => !listed.includes(name)), 'exported, not listed').toEqual([])
  expect(listed.filter((key) => !exports.has(key)), 'listed, not exported').toEqual([])
  for (const [kind, rows] of Object.entries(DOCS_TABLES)) {
    for (const row of rows) {
      const symbol = exports.get(row.key)
      if (symbol === undefined) throw new Error(`${row.key} is not exported`)
      expect(kindOf(symbol), row.key).toBe(kind)
    }
  }
})

/** The package a type is declared in: the engine's resolve to its emitted declarations. */
function packageOf(symbol: ts.Symbol): string {
  const file = symbol.declarations?.[0]?.getSourceFile().fileName ?? ''
  if (file.includes('/engine/dist/')) return '@fronthub/arrowz-engine'
  if (file.startsWith(`${srcDir}/`)) return '@fronthub/arrowz-board'
  throw new Error(`${symbol.name} is declared in ${file}, neither package`)
}

/** A Shape cell read back: a union's literals unquoted, or a list of fields. */
function itemsOf(shape: string): { by: 'fields' | 'literals'; values: string[] } {
  if (shape.startsWith("'")) return { by: 'literals', values: shape.split(' | ').map((item) => item.slice(1, -1)) }
  return { by: 'fields', values: shape.split(', ') }
}

test('every Docs type row names its package and spells the shape the type declares', () => {
  for (const row of ELEMENT_TYPES) {
    const symbol = exports.get(row.key)
    if (symbol === undefined) throw new Error(`${row.key} is not exported`)
    expect(row.from, `package of ${row.key}`).toBe(packageOf(symbol))
    const declared = shapeOf(symbol)
    const written = itemsOf(row.shape)
    expect(written.by, `shape of ${row.key}`).toBe(declared.by)
    expect(sorted(written.values), `shape of ${row.key}`).toEqual(sorted(declared.values))
  }
})

test('every Docs function row spells the signature the function declares', () => {
  for (const row of ELEMENT_FUNCTIONS) {
    const decl = exports.get(row.key)?.declarations?.[0]
    if (decl === undefined || !ts.isFunctionDeclaration(decl)) {
      throw new Error(`${row.key} is not a function declaration`)
    }
    const signature = checker.getSignatureFromDeclaration(decl)
    if (signature === undefined) throw new Error(`${row.key} has no signature`)
    expect(row.signature, `signature of ${row.key}`).toBe(`${row.key}${checker.signatureToString(signature)}`)
  }
})

test('every Docs class row spells its constructor and its public members', () => {
  for (const row of ELEMENT_CLASSES) {
    const decl = classOf(row.key)
    expect(row.create, `constructor of ${row.key}`).toBe(construction(decl))
    // The element's members have tables of their own, above the export tables.
    if (row.key === 'ArrowzBoard') {
      expect(row.members).toEqual([])
      continue
    }
    const { methods, getters } = publicMembers(decl)
    const spelled = [...getters, ...[...methods].map(([name, names]) => `${name}(${names.join(', ')})`)]
    expect(sorted(row.members), `members of ${row.key}`).toEqual(sorted(spelled))
  }
})
