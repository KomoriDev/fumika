<script setup lang="ts">
import type Schema from 'schemastery'
import type { SchemaFormSubmit } from '../context'
import type { SchemaIssue } from '../registry'
import { FieldError } from '@fumika/ui/field'
import { computed, inject, provide, ref, watch } from 'vue'
import { schemaFormKey } from '../context'
import { schemaRendererKey } from '../registry'
import { cloneValue, deepEqual, getFallback, simplifyValue, validationIssue } from '../utils'
import SchemaNode from './SchemaNode.vue'

const props = defineProps<{
  schema: Schema
  modelValue?: unknown
  initial?: unknown
  disabled?: boolean
  simplify?: boolean
}>()

const emit = defineEmits<{
  'update:modelValue': [value: unknown]
  'validity': [issues: readonly SchemaIssue[]]
  'submit': [result: SchemaFormSubmit]
  'error': [error: unknown]
}>()

const renderer = inject(schemaRendererKey)
if (!renderer)
  throw new Error('Schemastery renderer is unavailable')

const formId = `schema-${Math.random().toString(36).slice(2)}`
const issues = ref<SchemaIssue[]>([])
const draft = ref(cloneValue(props.modelValue ?? getFallback(props.schema, true)))
const baseline = ref(cloneValue(props.initial ?? props.modelValue))
const valid = computed(() => issues.value.length === 0)
let lastEmitted: unknown

provide(schemaFormKey, {
  id: formId,
  issues,
  renderer,
  valid,
})

watch(() => [props.schema, props.modelValue] as const, ([schema, value]) => {
  if (deepEqual(value, lastEmitted)) {
    lastEmitted = undefined
    return
  }
  draft.value = cloneValue(value ?? getFallback(schema, true))
}, { deep: true })

watch(() => props.initial, (value) => {
  baseline.value = cloneValue(value)
}, { deep: true })

watch(draft, () => {
  validate(true)
}, { deep: true, immediate: true })

function validate(commit: boolean): boolean {
  try {
    const sourceDraft = cloneValue(draft.value)
    props.schema(sourceDraft)
    const source = props.simplify === false ? sourceDraft : simplifyValue(props.schema, sourceDraft)
    issues.value = []
    emit('validity', issues.value)

    if (commit && !deepEqual(source, props.modelValue)) {
      lastEmitted = cloneValue(source)
      emit('update:modelValue', source)
    }
    return true
  }
  catch (error) {
    issues.value = [validationIssue(error)]
    emit('validity', issues.value)
    if (!SchemaError(error))
      emit('error', error)
    return false
  }
}

function reset(): void {
  draft.value = cloneValue(baseline.value ?? getFallback(props.schema, true))
}

function submit(): void {
  if (!validate(false))
    return

  try {
    const sourceDraft = cloneValue(draft.value)
    const value = props.schema(sourceDraft)
    const source = props.simplify === false ? sourceDraft : simplifyValue(props.schema, sourceDraft)
    emit('submit', { source, value })
  }
  catch (error) {
    emit('error', error)
  }
}

function SchemaError(error: unknown): boolean {
  return Boolean(error && typeof error === 'object' && (error as { name?: string }).name === 'ValidationError')
}

defineExpose({ reset, validate: () => validate(false) })
</script>

<template>
  <form novalidate class="flex flex-col gap-5" @submit.prevent="submit">
    <SchemaNode
      v-model="draft"
      :schema="schema"
      :initial="baseline"
      :path="[]"
      :disabled="disabled"
    />

    <FieldError
      v-if="issues.some(issue => issue.path.length === 0)"
      :errors="issues.filter(issue => issue.path.length === 0)"
    />

    <slot name="actions" :valid="valid" :reset="reset" />
  </form>
</template>
