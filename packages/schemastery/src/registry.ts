import type Schema from 'schemastery'
import type { App, Component, InjectionKey } from 'vue'
import { markRaw, shallowReactive } from 'vue'

declare global {
  namespace Schemastery {
    interface Meta {
      label?: string | Readonly<Record<string, string>>
      flatten?: boolean
      visible?: (value: unknown) => boolean
    }
  }
}

export type FieldPath = readonly (string | number)[]

export interface SchemaIssue {
  path: FieldPath
  message: string
  cause?: unknown
}

export interface SchemaFieldBinding<T = unknown> {
  readonly schema: Schema
  readonly path: FieldPath
  readonly value: T
  readonly disabled: boolean
  readonly required: boolean
  readonly issues: readonly SchemaIssue[]
  readonly controlAttrs: Readonly<Record<string, unknown>>
  update: (value: T) => void
  unset: () => void
  touch: () => void
}

export interface SchemaControlProps<T = unknown> {
  field: SchemaFieldBinding<T>
}

export interface SchemaControlDefinition {
  id: `${string}/${string}`
  type: string | '*'
  role?: string
  priority?: number
  when?: (input: SchemaControlMatchInput) => boolean
  component: Component<SchemaControlProps>
}

export interface SchemaControlMatchInput {
  schema: Schema
  type: string
  role?: string
  value: unknown
  path: FieldPath
}

export interface SchemaRendererOptions {
  resolveText?: (value: string | Readonly<Record<string, string>> | undefined) => string | undefined
}

export const schemaRendererKey: InjectionKey<SchemaRenderer> = Symbol('fumika.schemastery')

export class SchemaRenderer {
  readonly controls = shallowReactive(new Map<string, SchemaControlDefinition>())

  constructor(private readonly options: SchemaRendererOptions = {}) {}

  install(app: App): void {
    app.provide(schemaRendererKey, this)
  }

  register(definition: SchemaControlDefinition): () => void {
    if (this.controls.has(definition.id))
      throw new Error(`schema control already registered: ${definition.id}`)
    markRaw(definition.component)
    this.controls.set(definition.id, definition)
    return () => this.controls.delete(definition.id)
  }

  resolve(input: SchemaControlMatchInput): SchemaControlDefinition | undefined {
    const matches = [...this.controls.values()]
      .filter((definition) => {
        if (definition.type !== '*' && definition.type !== input.type)
          return false
        if (definition.role !== undefined && definition.role !== input.role)
          return false
        return definition.when?.(input) ?? true
      })
      .map(definition => ({ definition, rank: controlRank(definition, input) }))
      .sort((left, right) => compareRank(right.rank, left.rank))

    if (matches.length > 1 && compareRank(matches[0].rank, matches[1].rank) === 0) {
      throw new Error(`ambiguous schema controls: ${matches[0].definition.id}, ${matches[1].definition.id}`)
    }
    return matches[0]?.definition
  }

  resolveText(value: string | Readonly<Record<string, string>> | undefined): string | undefined {
    if (this.options.resolveText)
      return this.options.resolveText(value)
    if (!value || typeof value === 'string')
      return value
    const locale = document.documentElement.lang || navigator.language
    return value[locale] ?? value[locale.split('-')[0]] ?? Object.values(value)[0]
  }
}

function controlRank(
  definition: SchemaControlDefinition,
  input: SchemaControlMatchInput,
): readonly [number, number, number] {
  return [
    definition.role === input.role && definition.role !== undefined ? 1 : 0,
    definition.type === input.type ? 1 : 0,
    definition.priority ?? 0,
  ]
}

function compareRank(left: readonly number[], right: readonly number[]): number {
  for (let index = 0; index < Math.max(left.length, right.length); index++) {
    const difference = (left[index] ?? 0) - (right[index] ?? 0)
    if (difference)
      return difference
  }
  return 0
}

export function createSchemaRenderer(options?: SchemaRendererOptions): SchemaRenderer {
  return new SchemaRenderer(options)
}
