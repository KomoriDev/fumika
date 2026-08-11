import type { FieldPath, SchemaIssue } from './registry'
import Schema from 'schemastery'

export function cloneValue<T>(value: T): T {
  if (value === undefined)
    return value
  return JSON.parse(JSON.stringify(value)) as T
}

export function deepEqual(left: unknown, right: unknown): boolean {
  return JSON.stringify(left) === JSON.stringify(right)
}

export function simplifyValue(schema: Schema, value: unknown): unknown {
  if (schema.type === 'transform' && schema.inner)
    return simplifyValue(schema.inner, value)

  if (schema.type === 'object' && isRecord(value)) {
    const result: Record<string, unknown> = { ...value }
    for (const [key, child] of Object.entries(schema.dict ?? {})) {
      const simplified = simplifyValue(child, value[key])
      if (simplified == null)
        delete result[key]
      else
        result[key] = simplified
    }
    return Object.keys(result).length ? result : null
  }

  if (schema.type === 'intersect' && isRecord(value)) {
    return (schema.list ?? []).reduce<unknown>((result, child) => {
      return simplifyValue(child, result)
    }, value)
  }

  if (schema.type === 'tuple' && Array.isArray(value)) {
    const result = [...value]
    for (const [index, child] of (schema.list ?? []).entries()) {
      const simplified = simplifyValue(child, value[index])
      result[index] = simplified
    }
    return result
  }

  return schema.simplify(cloneValue(value))
}

function isRecord(value: unknown): value is Record<string, unknown> {
  return Boolean(value) && typeof value === 'object' && !Array.isArray(value)
}

export function getFallback(schema: Schema, required = false): unknown {
  if (schema.meta.default !== undefined)
    return cloneValue(schema.meta.default)

  try {
    return cloneValue(schema())
  }
  catch {
    if (!required)
      return undefined
    if (schema.type === 'string')
      return ''
    if (schema.type === 'number')
      return 0
    if (schema.type === 'boolean')
      return false
    if (schema.type === 'array' || schema.type === 'tuple')
      return []
    if (['dict', 'object', 'intersect'].includes(schema.type))
      return {}
  }
}

export function humanize(value: string | number | undefined): string | undefined {
  if (value === undefined)
    return undefined
  return String(value)
    .replace(/([a-z0-9])([A-Z])/g, '$1 $2')
    .replace(/[-_]+/g, ' ')
    .replace(/^./, character => character.toUpperCase())
}

export function createControlId(formId: string, path: FieldPath): string {
  const suffix = path.length ? path.map(segment => String(segment).replace(/[^\w-]/g, '-')).join('-') : 'root'
  return `${formId}-${suffix}`
}

export function issuesAtPath(issues: readonly SchemaIssue[], path: FieldPath): SchemaIssue[] {
  return issues.filter(issue => pathsEqual(issue.path, path))
}

export function pathsEqual(left: FieldPath, right: FieldPath): boolean {
  return left.length === right.length && left.every((segment, index) => segment === right[index])
}

export function validationIssue(error: unknown): SchemaIssue {
  if (Schema.ValidationError.is(error)) {
    return {
      path: [...(error.options.path ?? [])] as FieldPath,
      message: error.message,
      cause: error,
    }
  }
  return {
    path: [],
    message: error instanceof Error ? error.message : String(error),
    cause: error,
  }
}

export function constChoices(schema: Schema): Schema[] | undefined {
  if (schema.type !== 'union' || !schema.list?.every(item => item.type === 'const'))
    return undefined
  return schema.list
}
