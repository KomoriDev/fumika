import type Schema from 'schemastery'
import type { ComputedRef, InjectionKey, Ref } from 'vue'
import type { SchemaIssue, SchemaRenderer } from './registry'

export interface SchemaFormContext {
  id: string
  model: Ref<unknown>
  issues: Ref<SchemaIssue[]>
  renderer: SchemaRenderer
  valid: ComputedRef<boolean>
}

export const schemaFormKey: InjectionKey<SchemaFormContext> = Symbol('fumika.schema-form')

export interface SchemaFormExposed {
  reset: () => void
  validate: () => boolean
}

export interface SchemaFormSubmit<T = unknown> {
  source: T
  value: unknown
}

export type AnySchema = Schema<any, any>
