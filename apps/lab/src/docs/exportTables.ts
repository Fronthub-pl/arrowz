/** The `::table` names of the element's export tables. Pure: the content guard reads it in Node. */
export const EXPORT_TABLES = ['element-types', 'element-functions', 'element-constants', 'element-classes'] as const

export type ExportOf = (typeof EXPORT_TABLES)[number]

export function isExportOf(of: string): of is ExportOf {
  return EXPORT_TABLES.some((name) => name === of)
}
