// README.md is the engine's API reference, and the code is its source of truth:
// every entry point of deno.json, and every export of each, must be in it, and
// nothing else may be. Each comparison runs both ways, so a row for something
// deleted fails as surely as a missing row.
//
// The API is read from `deno doc --json`, not from text. A function's
// signature, a type's shape and a class's declaration are rendered from it and
// must stand in the README as written, so a changed parameter or field type
// fails too. The comparison ignores backticks, escaped pipes and spacing; a
// failing row prints the text it expects.
import { assert, assertEquals } from '@std/assert'
import { dirname, fromFileUrl, join } from '@std/path'

const dir = dirname(fromFileUrl(import.meta.url))
const readme = Deno.readTextFileSync(join(dir, 'README.md'))
const readJson = (name: string): unknown => JSON.parse(Deno.readTextFileSync(join(dir, name)))

// --- What deno doc says -------------------------------------------------------

interface Literal {
  kind: 'string' | 'number' | 'boolean' | 'bigInt' | 'template'
  string?: string
  number?: number
  boolean?: boolean
}
interface TypeParam {
  name: string
  constraint?: TsType
  default?: TsType
}
interface Param {
  kind: 'identifier' | 'assign' | 'object' | 'rest' | 'array'
  name?: string
  optional?: boolean
  tsType?: TsType
  left?: Param
  arg?: Param
  props?: { key: string }[]
}
interface Prop {
  name: string
  optional?: boolean
  readonly?: boolean
  computed?: boolean
  tsType?: TsType
}
interface Method {
  name: string
  kind: 'method' | 'getter' | 'setter'
  optional?: boolean
  params?: Param[]
  returnType?: TsType
  typeParams?: TypeParam[]
}
interface IndexSignature {
  readonly?: boolean
  params: Param[]
  tsType?: TsType
}
interface TypeLiteral {
  properties?: Prop[]
  methods?: Method[]
  indexSignatures?: IndexSignature[]
  callSignatures?: unknown[]
}
type TsType =
  | { kind: 'keyword'; value: string }
  | { kind: 'typeRef'; value: { typeName: string; typeParams?: TsType[] | null } }
  | { kind: 'literal'; value: Literal }
  | { kind: 'union' | 'intersection' | 'tuple'; value: TsType[] }
  | { kind: 'array' | 'parenthesized'; value: TsType }
  | { kind: 'typeOperator'; value: { operator: string; tsType: TsType } }
  | { kind: 'typeLiteral'; value: TypeLiteral }
  | {
    kind: 'fnOrConstructor'
    value: { constructor: boolean; tsType: TsType; params?: Param[]; typeParams?: TypeParam[] }
  }
  | { kind: 'indexedAccess'; value: { objType: TsType; indexType: TsType } }
  | { kind: 'typeQuery'; value: string }
  | { kind: 'typePredicate'; value: { asserts: boolean; param: { name?: string }; type?: TsType | null } }
  | { kind: 'conditional'; value: { checkType: TsType; extendsType: TsType; trueType: TsType; falseType: TsType } }
  | { kind: 'infer'; value: { typeParam: TypeParam } }
  | {
    kind: 'mapped'
    value: { readonly?: boolean | string; optional?: boolean | string; typeParam: TypeParam; tsType?: TsType }
  }
interface ClassDef {
  extends?: string | null
  constructors?: { params?: Param[]; accessibility?: string }[]
  properties?: (Prop & { accessibility?: string; isStatic?: boolean })[]
  methods?: { name: string; kind: string; accessibility?: string; isStatic?: boolean; functionDef: FunctionDef }[]
}
interface FunctionDef {
  params?: Param[]
  returnType?: TsType
  typeParams?: TypeParam[]
}
type Declaration =
  | { kind: 'function'; def: FunctionDef }
  | { kind: 'variable'; def: { tsType?: TsType } }
  | { kind: 'class'; def: ClassDef }
  | { kind: 'interface'; def: TypeLiteral & { extends?: TsType[]; typeParams?: TypeParam[] } }
  | { kind: 'typeAlias'; def: { tsType: TsType; typeParams?: TypeParam[] } }
interface DocSymbol {
  name: string
  declarations: Declaration[]
}
interface DocJson {
  nodes: Record<string, { symbols: DocSymbol[] }>
}

/** The entry points, keyed by the specifier a consumer imports: `.` is `@arrowz/engine`. */
const denoExports = (readJson('deno.json') as { exports: Record<string, string> }).exports
const specifierOf = (key: string): string => key === '.' ? '@arrowz/engine' : `@arrowz/engine${key.slice(1)}`
const ENTRIES = Object.entries(denoExports).map(([key, path]) => ({
  key,
  specifier: specifierOf(key),
  source: path.replace(/^\.\//, ''),
}))

/**
 * The exports of one entry point. One run per entry: given several, deno doc
 * writes a symbol two entries share as a `reference` to the other entry.
 */
function symbolsOf(source: string): DocSymbol[] {
  const out = new Deno.Command(Deno.execPath(), { args: ['doc', '--json', source], cwd: dir }).outputSync()
  assert(out.success, new TextDecoder().decode(out.stderr))
  const doc = JSON.parse(new TextDecoder().decode(out.stdout)) as DocJson
  const node = Object.entries(doc.nodes).find(([url]) => url.endsWith(`/packages/engine/${source}`))
  if (node === undefined) throw new Error(`deno doc said nothing about ${source}`)
  return node[1].symbols
}

// --- Rendering a type as the README writes it ---------------------------------

function literal(l: Literal): string {
  if (l.kind === 'string') return `'${l.string ?? ''}'`
  if (l.kind === 'number') return String(l.number)
  if (l.kind === 'boolean') return String(l.boolean)
  throw new Error(`the README guard cannot render a ${l.kind} literal`)
}

/** A type that needs parentheses where it is an array element or a union member. */
const compound = (t: TsType): boolean => ['union', 'intersection', 'fnOrConstructor', 'conditional'].includes(t.kind)

function typeParams(list: TypeParam[] | undefined): string {
  if (list === undefined || list.length === 0) return ''
  const one = (p: TypeParam) =>
    p.name + (p.constraint ? ` extends ${render(p.constraint)}` : '') + (p.default ? ` = ${render(p.default)}` : '')
  return `<${list.map(one).join(', ')}>`
}

function param(p: Param): string {
  switch (p.kind) {
    case 'identifier':
      return `${p.name ?? ''}${p.optional === true ? '?' : ''}${p.tsType ? `: ${render(p.tsType)}` : ''}`
    case 'object': {
      const pattern = `{ ${(p.props ?? []).map((prop) => prop.key).join(', ')} }`
      return `${pattern}${p.optional === true ? '?' : ''}${p.tsType ? `: ${render(p.tsType)}` : ''}`
    }
    case 'assign': {
      // A parameter with a default is one a caller may leave out.
      if (p.left === undefined) throw new Error('an assign parameter without a left side')
      const inner = param({ ...p.left, optional: true })
      return p.left.tsType || !p.tsType ? inner : `${inner}: ${render(p.tsType)}`
    }
    case 'rest':
      return `...${p.arg ? param(p.arg) : ''}${p.tsType ? `: ${render(p.tsType)}` : ''}`
    default:
      throw new Error(`the README guard cannot render a ${p.kind} parameter`)
  }
}

const params = (list: Param[] | undefined): string => `(${(list ?? []).map(param).join(', ')})`

function member(m: Method): string {
  const prefix = m.kind === 'getter' ? 'get ' : m.kind === 'setter' ? 'set ' : ''
  const ret = m.returnType ? `: ${render(m.returnType)}` : ''
  return `${prefix}${m.name}${m.optional === true ? '?' : ''}${typeParams(m.typeParams)}${params(m.params)}${ret}`
}

function prop(p: Prop): string {
  const name = p.computed === true ? `[${p.name}]` : p.name
  return `${p.readonly === true ? 'readonly ' : ''}${name}${p.optional === true ? '?' : ''}: ${
    p.tsType ? render(p.tsType) : 'unknown'
  }`
}

function body(t: TypeLiteral): string {
  if ((t.callSignatures ?? []).length > 0) throw new Error('the README guard cannot render a call signature')
  const index = (t.indexSignatures ?? []).map((s) =>
    `${s.readonly === true ? 'readonly ' : ''}[${s.params.map(param).join(', ')}]: ${s.tsType ? render(s.tsType) : ''}`
  )
  const parts = [...(t.properties ?? []).map(prop), ...(t.methods ?? []).map(member), ...index]
  return parts.length === 0 ? '{}' : `{ ${parts.join('; ')} }`
}

function render(t: TsType): string {
  switch (t.kind) {
    case 'keyword':
      return t.value
    case 'typeRef': {
      const args = t.value.typeParams ?? []
      return args.length === 0 ? t.value.typeName : `${t.value.typeName}<${args.map(render).join(', ')}>`
    }
    case 'literal':
      return literal(t.value)
    case 'union':
      return t.value.map((m) => compound(m) && m.kind !== 'union' ? `(${render(m)})` : render(m)).join(' | ')
    case 'intersection':
      return t.value.map((m) => compound(m) && m.kind !== 'intersection' ? `(${render(m)})` : render(m)).join(' & ')
    case 'tuple':
      return `[${t.value.map(render).join(', ')}]`
    case 'array':
      return compound(t.value) ? `(${render(t.value)})[]` : `${render(t.value)}[]`
    case 'parenthesized':
      return `(${render(t.value)})`
    case 'typeOperator':
      return `${t.value.operator} ${render(t.value.tsType)}`
    case 'typeLiteral':
      return body(t.value)
    case 'fnOrConstructor': {
      const f = t.value
      return `${f.constructor ? 'new ' : ''}${typeParams(f.typeParams)}${params(f.params)} => ${render(f.tsType)}`
    }
    case 'indexedAccess':
      return `${render(t.value.objType)}[${render(t.value.indexType)}]`
    case 'typeQuery':
      return `typeof ${t.value}`
    case 'typePredicate':
      return `${t.value.asserts ? 'asserts ' : ''}${t.value.param.name ?? 'this'}${
        t.value.type ? ` is ${render(t.value.type)}` : ''
      }`
    case 'conditional': {
      const c = t.value
      return `${render(c.checkType)} extends ${render(c.extendsType)} ? ${render(c.trueType)} : ${render(c.falseType)}`
    }
    case 'infer':
      return `infer ${t.value.typeParam.name}`
    case 'mapped': {
      const m = t.value
      const modifier = (v: boolean | string | undefined, word: string) =>
        v === true ? word : typeof v === 'string' ? `${v}${word}` : ''
      const key = `[${m.typeParam.name} in ${m.typeParam.constraint ? render(m.typeParam.constraint) : ''}]`
      const ro = modifier(m.readonly, 'readonly')
      return `{ ${ro === '' ? '' : `${ro} `}${key}${modifier(m.optional, '?')}: ${m.tsType ? render(m.tsType) : ''} }`
    }
  }
}

const TABLE_OF = {
  function: 'Function',
  variable: 'Constant',
  class: 'Class',
  interface: 'Type',
  typeAlias: 'Type',
} as const

/** A symbol's one declaration, of a kind the README has a table for. */
function only(symbol: DocSymbol): Declaration {
  const [decl, ...more] = symbol.declarations
  if (decl === undefined || more.length > 0) {
    throw new Error(`${symbol.name} has ${symbol.declarations.length} declarations`)
  }
  if (!(decl.kind in TABLE_OF)) throw new Error(`${symbol.name} is a ${decl.kind}, which no README table holds`)
  return decl
}

/** A generic type's parameters, set off from the shape they parameterise. */
const generic = (list: TypeParam[] | undefined): string => list?.length ? `${typeParams(list)} ` : ''

const isPublic = (m: { accessibility?: string; isStatic?: boolean }) =>
  m.accessibility !== 'private' && m.accessibility !== 'protected' && m.isStatic !== true

/** The cell a symbol's row must carry, by table: what the README writes in the column after the name. */
function expectedCell(decl: Declaration): string {
  switch (decl.kind) {
    case 'function': {
      const f = decl.def
      if (f.returnType === undefined) throw new Error('a function without a declared or inferred return type')
      return `${typeParams(f.typeParams)}${params(f.params)} => ${render(f.returnType)}`
    }
    case 'interface': {
      const head = (decl.def.extends ?? []).map(render)
      return `${generic(decl.def.typeParams)}${[...head, body(decl.def)].join(' & ')}`
    }
    case 'typeAlias':
      return `${generic(decl.def.typeParams)}${render(decl.def.tsType)}`
    case 'class': {
      const c = decl.def
      const ctors = (c.constructors ?? []).filter(isPublic).map((k) => `constructor${params(k.params)}`)
      const props = (c.properties ?? []).filter(isPublic).map(prop)
      const methods = (c.methods ?? []).filter(isPublic).map((m) =>
        member({ ...m.functionDef, name: m.name, kind: 'method' })
      )
      return `${c.extends ? `extends ${c.extends} ` : ''}{ ${[...ctors, ...props, ...methods].join('; ')} }`
    }
    case 'variable':
      throw new Error('a constant is checked by its value')
  }
}

// --- Reading the README ---------------------------------------------------------

/** The cells of one table row: the outer pipes go, an escaped `\|` stays in its cell. */
const cellsOf = (line: string): string[] => line.slice(1, -1).split(/(?<!\\)\|/).map((c) => c.trim())

/** A cell as the guard compares it: no backticks, no escaped pipes, single spaces. */
const plain = (cell: string): string => cell.replace(/`/g, '').replace(/\\\|/g, '|').replace(/\s+/g, ' ').trim()

/**
 * The tables of a stretch of README, by the first cell of their header row:
 * one entry per body row. A header that appears twice throws, so a stretch
 * cannot hide a second table of the same kind from the guard.
 */
function tablesIn(text: string): Map<string, string[][]> {
  const tables = new Map<string, string[][]>()
  const lines = text.split('\n')
  for (let i = 0; i < lines.length; i++) {
    const line = lines[i] ?? ''
    if (!line.startsWith('|') || !(lines[i + 1] ?? '').startsWith('|---')) continue
    const header = cellsOf(line)[0] ?? ''
    if (tables.has(header)) throw new Error(`two tables headed "${header}" in one section`)
    const rows: string[][] = []
    for (i += 2; i < lines.length && (lines[i] ?? '').startsWith('|'); i++) rows.push(cellsOf(lines[i] ?? ''))
    tables.set(header, rows)
  }
  return tables
}

/** The README from a heading to the next heading of the same or a higher level. */
function section(heading: string): string {
  const lines = readme.split('\n')
  const start = lines.findIndex((l) => l === heading)
  if (start === -1) throw new Error(`README has no "${heading}" heading`)
  const level = /^#+/.exec(heading)?.[0].length ?? 0
  const end = lines.findIndex((l, i) => i > start && /^#+ /.test(l) && (/^#+/.exec(l)?.[0].length ?? 0) <= level)
  return lines.slice(start + 1, end === -1 ? undefined : end).join('\n')
}

/** The first backticked span of a cell. */
function code(cell: string | undefined): string {
  const m = /`([^`]+)`/.exec(cell ?? '')
  if (m?.[1] === undefined) throw new Error(`no code span in "${cell}"`)
  return m[1]
}

// --- The entry points -------------------------------------------------------------

Deno.test('the entry table is the entry points of deno.json, with their sources', () => {
  const rows = tablesIn(section('## Entry points')).get('Entry') ?? []
  const written = rows.map((r) => [code(r[0]), code(r[1])])
  assertEquals(written, ENTRIES.map((e) => [e.specifier, e.source]))
})

Deno.test('package.json exports the entry points of deno.json, each from its build', () => {
  const pkg = readJson('package.json') as { exports: Record<string, { types: string; default: string }> }
  assertEquals(Object.keys(pkg.exports), ENTRIES.map((e) => e.key))
  const built = (readJson('tsconfig.build.json') as { include: string[] }).include
  for (const e of ENTRIES) {
    const base = e.source.replace(/\.ts$/, '')
    assertEquals(pkg.exports[e.key], { types: `./dist/${base}.d.ts`, default: `./dist/${base}.js` }, e.key)
    assert(built.includes(e.source), `tsconfig.build.json does not build ${e.source}`)
  }
})

// --- The exports of each entry point -------------------------------------------------

/**
 * A value as the Constant table writes it: strings quoted, arrays and objects
 * spelled out, an object of objects as its keys.
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

/** A value spelled in this many characters or fewer is written out in the Value column; a longer one is described. */
const SPELLED_UP_TO = 80

for (const entry of ENTRIES) {
  const heading = `### \`${entry.specifier}\``
  const symbols = symbolsOf(entry.source)

  Deno.test(`${entry.specifier}: every export is in its kind's table, and every row is an export`, () => {
    const tables = tablesIn(section(heading))
    for (const kind of new Set(Object.values(TABLE_OF))) {
      const written = (tables.get(kind) ?? []).map((r) => code(r[0])).sort()
      const exported = symbols.filter((s) => TABLE_OF[only(s).kind] === kind).map((s) => s.name).sort()
      assertEquals(written, exported, `${kind} table`)
    }
    const unknown = [...tables.keys()].filter((h) => !Object.values(TABLE_OF).includes(h as never))
    assertEquals(unknown, [], 'tables of no kind')
    for (const [kind, rows] of tables) {
      for (const row of rows) assert(plain(row.at(-1) ?? '') !== '', `${kind} ${row[0]} says nothing about it`)
    }
  })

  Deno.test(`${entry.specifier}: every signature, shape and declaration is the one the code declares`, () => {
    const tables = tablesIn(section(heading))
    for (const symbol of symbols) {
      const decl = only(symbol)
      if (decl.kind === 'variable') continue
      const row = (tables.get(TABLE_OF[decl.kind]) ?? []).find((r) => code(r[0]) === symbol.name)
      if (row === undefined) continue // the test above names it
      assertEquals(plain(row[1] ?? ''), expectedCell(decl), symbol.name)
    }
  })

  Deno.test(`${entry.specifier}: every constant short enough to spell is spelled as exported`, async () => {
    const values = await import(new URL(entry.source, import.meta.url).href) as Record<string, unknown>
    const rows = tablesIn(section(heading)).get('Constant') ?? []
    for (const row of rows) {
      const name = code(row[0])
      const spelled = spell(values[name])
      if (spelled.length > SPELLED_UP_TO) continue
      assertEquals(plain(row[1] ?? ''), spelled, name)
    }
  })
}

// --- Development ----------------------------------------------------------------------

Deno.test('the target table is the Nx targets of project.json, both ways', () => {
  const targets = Object.keys((readJson('project.json') as { targets: Record<string, unknown> }).targets)
  const written = (tablesIn(section('## Development')).get('Target') ?? []).map((r) => code(r[0]))
  assertEquals(written.sort(), targets.sort())
})
