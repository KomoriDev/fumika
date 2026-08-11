<script setup lang="ts">
import type Schema from 'schemastery'
import type { SchemaControlMatchInput, SchemaFieldBinding } from '../registry'
import { Button } from '@fumika/ui/button'
import { Checkbox } from '@fumika/ui/checkbox'
import {
  Collapsible,
  CollapsibleContent,
  CollapsibleTrigger,
} from '@fumika/ui/collapsible'
import {
  Field,
  FieldDescription,
  FieldError,
  FieldGroup,
  FieldLabel,
  FieldLegend,
  FieldSet,
} from '@fumika/ui/field'
import { Input } from '@fumika/ui/input'
import {
  NumberField,
  NumberFieldContent,
  NumberFieldDecrement,
  NumberFieldIncrement,
  NumberFieldInput,
} from '@fumika/ui/number-field'
import { RadioGroup, RadioGroupItem } from '@fumika/ui/radio-group'
import {
  Select,
  SelectContent,
  SelectItem,
  SelectTrigger,
  SelectValue,
} from '@fumika/ui/select'
import { Slider } from '@fumika/ui/slider'
import { Switch } from '@fumika/ui/switch'
import { Textarea } from '@fumika/ui/textarea'
import { computed, inject, ref, watch } from 'vue'
import { schemaFormKey } from '../context'
import {
  cloneValue,
  constChoices,
  createControlId,
  deepEqual,
  getFallback,
  humanize,
  issuesAtPath,
} from '../utils'

defineOptions({ name: 'SchemaNode' })

const props = defineProps<{
  schema: Schema
  modelValue?: any
  initial?: any
  path: readonly (string | number)[]
  label?: string
  disabled?: boolean
}>()

const emit = defineEmits<{
  'update:modelValue': [value: any]
}>()

const form = inject(schemaFormKey)
if (!form)
  throw new Error('Schemastery form context is unavailable')

const touched = ref(false)
const open = ref(!props.schema.meta.collapse)

const type = computed(() => props.schema.type)
const role = computed(() => props.schema.meta.role)
const disabled = computed(() => Boolean(props.disabled || props.schema.meta.disabled))
const required = computed(() => Boolean(props.schema.meta.required))
const description = computed(() => form.renderer.resolveText(props.schema.meta.description as string | Readonly<Record<string, string>> | undefined))
const displayLabel = computed(() => form.renderer.resolveText(props.schema.meta.label as string | Readonly<Record<string, string>> | undefined) ?? props.label ?? humanize(props.path.at(-1)))
const fieldIssues = computed(() => issuesAtPath(form.issues.value, props.path))
const controlId = computed(() => createControlId(form.id, props.path))
const changed = computed(() => !deepEqual(props.initial, props.modelValue))
const objectValue = computed<Record<string, any>>(() => isRecord(props.modelValue) ? props.modelValue : {})
const initialObject = computed<Record<string, any>>(() => isRecord(props.initial) ? props.initial : {})
const arrayValue = computed<any[]>(() => Array.isArray(props.modelValue) ? props.modelValue : [])
const initialArray = computed<any[]>(() => Array.isArray(props.initial) ? props.initial : [])
const objectEntries = computed(() => Object.entries(props.schema.dict ?? {}))
const schemaList = computed(() => props.schema.list ?? [])
const innerSchema = computed(() => props.schema.inner)
const choices = computed(() => constChoices(props.schema))
const multiChoices = computed(() => constChoices(props.schema.inner as Schema))
const isMultiChoice = computed(() => props.schema.type === 'array' && Boolean(multiChoices.value))
const numberValue = computed(() => typeof props.modelValue === 'number' ? props.modelValue : Number(props.modelValue ?? 0))
const choiceIndex = computed(() => String(choices.value?.findIndex(choice => deepEqual(choice.value, props.modelValue)) ?? -1))
const activeUnionIndex = ref(resolveUnionIndex())

watch(() => [props.schema, props.modelValue] as const, () => {
  const next = resolveUnionIndex()
  if (next >= 0)
    activeUnionIndex.value = next
}, { deep: true })

const customResolution = computed(() => {
  const input: SchemaControlMatchInput = {
    schema: props.schema,
    type: props.schema.type,
    role: props.schema.meta.role,
    value: props.modelValue,
    path: props.path,
  }
  try {
    return { control: form.renderer.resolve(input), error: undefined }
  }
  catch (error) {
    return {
      control: undefined,
      error: error instanceof Error ? error.message : String(error),
    }
  }
})
const customControl = computed(() => customResolution.value.control)
const resolutionError = computed(() => customResolution.value.error)

const fieldBinding = computed<SchemaFieldBinding>(() => ({
  schema: props.schema,
  path: props.path,
  value: props.modelValue,
  disabled: disabled.value,
  required: required.value,
  issues: fieldIssues.value,
  controlAttrs: {
    'id': controlId.value,
    'disabled': disabled.value || undefined,
    'required': required.value || undefined,
    'aria-required': required.value || undefined,
    'aria-invalid': fieldIssues.value.length ? true : undefined,
    'aria-describedby': fieldIssues.value.length ? `${controlId.value}-error` : undefined,
  },
  update,
  unset: () => update(undefined),
  touch: () => { touched.value = true },
}))

function update(value: any): void {
  if (!disabled.value)
    emit('update:modelValue', value)
}

function reset(): void {
  update(cloneValue(props.initial))
}

function updateObject(key: string, value: unknown): void {
  const next = { ...objectValue.value }
  if (value === undefined)
    delete next[key]
  else
    next[key] = value
  update(next)
}

function updateArray(index: number, value: unknown): void {
  const next = [...arrayValue.value]
  next[index] = value
  update(next)
}

function addArray(): void {
  if (!innerSchema.value)
    return
  update([...arrayValue.value, getFallback(innerSchema.value, true)])
}

function removeArray(index: number): void {
  update(arrayValue.value.filter((_, itemIndex) => itemIndex !== index))
}

function moveArray(index: number, offset: number): void {
  const target = index + offset
  if (target < 0 || target >= arrayValue.value.length)
    return
  const next = [...arrayValue.value]
  const [item] = next.splice(index, 1)
  next.splice(target, 0, item)
  update(next)
}

function addDictionaryEntry(): void {
  const next = { ...objectValue.value }
  let index = 1
  let key = 'key'
  while (key in next)
    key = `key${++index}`
  next[key] = innerSchema.value ? getFallback(innerSchema.value, true) : undefined
  update(next)
}

function renameDictionaryKey(previous: string, nextKey: string): void {
  const normalized = nextKey.trim()
  if (!normalized || normalized === previous || normalized in objectValue.value)
    return
  const next: Record<string, unknown> = {}
  for (const [key, value] of Object.entries(objectValue.value))
    next[key === previous ? normalized : key] = value
  update(next)
}

function removeDictionaryEntry(key: string): void {
  const next = { ...objectValue.value }
  delete next[key]
  update(next)
}

function selectChoice(index: unknown): void {
  if (typeof index !== 'string')
    return
  const choice = choices.value?.[Number(index)]
  if (choice)
    update(cloneValue(choice.value))
}

function toggleMultiChoice(value: unknown, selected: boolean): void {
  const current = [...arrayValue.value]
  const index = current.findIndex(item => deepEqual(item, value))
  if (selected && index < 0)
    current.push(cloneValue(value))
  else if (!selected && index >= 0)
    current.splice(index, 1)
  update(current)
}

function selectedMultiChoice(value: unknown): boolean {
  return arrayValue.value.some(item => deepEqual(item, value))
}

function selectUnion(index: unknown): void {
  if (typeof index !== 'string')
    return
  const nextIndex = Number(index)
  const branch = schemaList.value[nextIndex]
  if (!branch)
    return
  activeUnionIndex.value = nextIndex
  update(getFallback(branch, true))
}

function resolveUnionIndex(): number {
  if (props.schema.type !== 'union' || choices.value)
    return -1
  return schemaList.value.findIndex(branch => accepts(branch, props.modelValue))
}

function accepts(schema: Schema, value: unknown): boolean {
  try {
    schema(cloneValue(value))
    return true
  }
  catch {
    return false
  }
}

function isRecord(value: unknown): value is Record<string, any> {
  return Boolean(value) && typeof value === 'object' && !Array.isArray(value)
}
</script>

<template>
  <template v-if="schema.meta.hidden" />

  <SchemaNode
    v-else-if="type === 'transform' && innerSchema"
    :schema="innerSchema"
    :model-value="modelValue"
    :initial="initial"
    :path="path"
    :label="displayLabel"
    :disabled="disabled"
    @update:model-value="update"
  />

  <Field
    v-else-if="customControl"
    :data-invalid="fieldIssues.length > 0 || undefined"
  >
    <div class="flex items-center justify-between gap-3">
      <FieldLabel v-if="displayLabel" :for="controlId">
        {{ displayLabel }}
      </FieldLabel>
      <Button v-if="changed" type="button" size="xs" variant="ghost" :disabled="disabled" @click="reset">
        Reset
      </Button>
    </div>
    <component :is="customControl.component" :field="fieldBinding" />
    <FieldDescription v-if="description">
      {{ description }}
    </FieldDescription>
    <FieldError :id="`${controlId}-error`" :errors="fieldIssues" />
  </Field>

  <Field v-else-if="resolutionError" data-invalid>
    <FieldLabel v-if="displayLabel">
      {{ displayLabel }}
    </FieldLabel>
    <FieldError :errors="[resolutionError]" />
  </Field>

  <Collapsible
    v-else-if="type === 'object' || type === 'intersect'"
    v-model:open="open"
    as-child
  >
    <FieldSet :class="schema.meta.flatten ? 'contents' : undefined">
      <div v-if="!schema.meta.flatten && (displayLabel || description)" class="flex items-start justify-between gap-3">
        <div class="space-y-1">
          <FieldLegend v-if="displayLabel">
            {{ displayLabel }}
          </FieldLegend>
          <FieldDescription v-if="description">
            {{ description }}
          </FieldDescription>
        </div>
        <CollapsibleTrigger v-if="schema.meta.collapse" as-child>
          <Button type="button" size="xs" variant="ghost">
            {{ open ? 'Collapse' : 'Expand' }}
          </Button>
        </CollapsibleTrigger>
      </div>

      <CollapsibleContent as-child>
        <FieldGroup :class="schema.meta.flatten ? 'contents' : undefined">
          <template v-if="type === 'object'">
            <SchemaNode
              v-for="([key, child]) in objectEntries"
              :key="key"
              :schema="child"
              :model-value="objectValue[key]"
              :initial="initialObject[key]"
              :path="[...path, key]"
              :label="humanize(key)"
              :disabled="disabled"
              @update:model-value="value => updateObject(key, value)"
            />
          </template>
          <template v-else>
            <SchemaNode
              v-for="(child, index) in schemaList"
              :key="child.uid ?? index"
              :schema="child"
              :model-value="modelValue"
              :initial="initial"
              :path="path"
              :disabled="disabled"
              @update:model-value="update"
            />
          </template>
        </FieldGroup>
      </CollapsibleContent>
    </FieldSet>
  </Collapsible>

  <FieldSet v-else-if="type === 'tuple'">
    <FieldLegend v-if="displayLabel">
      {{ displayLabel }}
    </FieldLegend>
    <FieldDescription v-if="description">
      {{ description }}
    </FieldDescription>
    <FieldGroup>
      <SchemaNode
        v-for="(child, index) in schemaList"
        :key="child.uid ?? index"
        :schema="child"
        :model-value="arrayValue[index]"
        :initial="initialArray[index]"
        :path="[...path, index]"
        :label="humanize(index)"
        :disabled="disabled"
        @update:model-value="value => updateArray(index, value)"
      />
    </FieldGroup>
  </FieldSet>

  <FieldSet v-else-if="type === 'array' && !isMultiChoice">
    <div class="flex items-center justify-between gap-3">
      <div class="space-y-1">
        <FieldLegend v-if="displayLabel">
          {{ displayLabel }}
        </FieldLegend>
        <FieldDescription v-if="description">
          {{ description }}
        </FieldDescription>
      </div>
      <Button type="button" size="sm" variant="outline" :disabled="disabled || !innerSchema || arrayValue.length >= (schema.meta.max ?? Infinity)" @click="addArray">
        Add
      </Button>
    </div>
    <FieldGroup>
      <div v-for="(value, index) in arrayValue" :key="index" class="rounded-xl border p-3">
        <div class="mb-3 flex justify-end gap-1">
          <Button type="button" size="xs" variant="ghost" :disabled="disabled || index === 0" @click="moveArray(index, -1)">
            Up
          </Button>
          <Button type="button" size="xs" variant="ghost" :disabled="disabled || index === arrayValue.length - 1" @click="moveArray(index, 1)">
            Down
          </Button>
          <Button type="button" size="xs" variant="destructive" :disabled="disabled || arrayValue.length <= (schema.meta.min ?? 0)" @click="removeArray(index)">
            Remove
          </Button>
        </div>
        <SchemaNode
          v-if="innerSchema"
          :schema="innerSchema"
          :model-value="value"
          :initial="initialArray[index]"
          :path="[...path, index]"
          :label="`Item ${index + 1}`"
          :disabled="disabled"
          @update:model-value="next => updateArray(index, next)"
        />
      </div>
    </FieldGroup>
  </FieldSet>

  <FieldSet v-else-if="type === 'dict'">
    <div class="flex items-center justify-between gap-3">
      <div class="space-y-1">
        <FieldLegend v-if="displayLabel">
          {{ displayLabel }}
        </FieldLegend>
        <FieldDescription v-if="description">
          {{ description }}
        </FieldDescription>
      </div>
      <Button type="button" size="sm" variant="outline" :disabled="disabled" @click="addDictionaryEntry">
        Add
      </Button>
    </div>
    <FieldGroup>
      <div v-for="([key, value]) in Object.entries(objectValue)" :key="key" class="rounded-xl border p-3">
        <div class="mb-3 flex items-center gap-2">
          <Input :model-value="key" :disabled="disabled" aria-label="Entry key" @change="renameDictionaryKey(key, ($event.target as HTMLInputElement).value)" />
          <Button type="button" size="xs" variant="destructive" :disabled="disabled" @click="removeDictionaryEntry(key)">
            Remove
          </Button>
        </div>
        <SchemaNode
          v-if="innerSchema"
          :schema="innerSchema"
          :model-value="value"
          :initial="initialObject[key]"
          :path="[...path, key]"
          :label="humanize(key)"
          :disabled="disabled"
          @update:model-value="next => updateObject(key, next)"
        />
      </div>
    </FieldGroup>
  </FieldSet>

  <FieldSet v-else-if="type === 'union' && !choices">
    <FieldLegend v-if="displayLabel">
      {{ displayLabel }}
    </FieldLegend>
    <FieldDescription v-if="description">
      {{ description }}
    </FieldDescription>
    <Select :model-value="String(activeUnionIndex)" :disabled="disabled" @update:model-value="selectUnion">
      <SelectTrigger><SelectValue placeholder="Choose an option" /></SelectTrigger>
      <SelectContent>
        <SelectItem v-for="(branch, index) in schemaList" :key="branch.uid ?? index" :value="String(index)">
          {{ form.renderer.resolveText(branch.meta.description as any) ?? `Option ${index + 1}` }}
        </SelectItem>
      </SelectContent>
    </Select>
    <SchemaNode
      v-if="schemaList[activeUnionIndex]"
      :schema="schemaList[activeUnionIndex]"
      :model-value="modelValue"
      :initial="initial"
      :path="path"
      :disabled="disabled"
      @update:model-value="update"
    />
  </FieldSet>

  <Field v-else-if="type === 'boolean'" orientation="horizontal" :data-invalid="fieldIssues.length > 0 || undefined">
    <div class="flex min-w-0 flex-1 items-center justify-between gap-4">
      <div class="space-y-1">
        <FieldLabel v-if="displayLabel" :for="controlId">
          {{ displayLabel }}
        </FieldLabel>
        <FieldDescription v-if="description">
          {{ description }}
        </FieldDescription>
      </div>
      <Checkbox
        v-if="role === 'checkbox'"
        :id="controlId"
        :model-value="Boolean(modelValue)"
        :disabled="disabled"
        @update:model-value="value => update(Boolean(value))"
      />
      <Switch
        v-else
        :id="controlId"
        :model-value="Boolean(modelValue)"
        :disabled="disabled"
        @update:model-value="value => update(Boolean(value))"
      />
    </div>
    <FieldError :id="`${controlId}-error`" :errors="fieldIssues" />
  </Field>

  <Field v-else-if="type === 'number'" :data-invalid="fieldIssues.length > 0 || undefined">
    <div class="flex items-center justify-between gap-3">
      <FieldLabel v-if="displayLabel" :for="controlId">
        {{ displayLabel }}
      </FieldLabel>
      <Button v-if="changed" type="button" size="xs" variant="ghost" :disabled="disabled" @click="reset">
        Reset
      </Button>
    </div>
    <Slider
      v-if="role === 'slider'"
      :id="controlId"
      :model-value="[numberValue]"
      :min="schema.meta.min"
      :max="schema.meta.max"
      :step="schema.meta.step"
      :disabled="disabled"
      @update:model-value="value => update(value?.[0])"
    />
    <NumberField
      v-else
      :model-value="numberValue"
      :min="schema.meta.min"
      :max="schema.meta.max"
      :step="schema.meta.step"
      :disabled="disabled"
      @update:model-value="update"
    >
      <NumberFieldContent>
        <NumberFieldDecrement />
        <NumberFieldInput :id="controlId" />
        <NumberFieldIncrement />
      </NumberFieldContent>
    </NumberField>
    <FieldDescription v-if="description">
      {{ description }}
    </FieldDescription>
    <FieldError :id="`${controlId}-error`" :errors="fieldIssues" />
  </Field>

  <Field v-else-if="type === 'string'" :data-invalid="fieldIssues.length > 0 || undefined">
    <div class="flex items-center justify-between gap-3">
      <FieldLabel v-if="displayLabel" :for="controlId">
        {{ displayLabel }}
      </FieldLabel>
      <Button v-if="changed" type="button" size="xs" variant="ghost" :disabled="disabled" @click="reset">
        Reset
      </Button>
    </div>
    <Textarea
      v-if="role === 'textarea'"
      :id="controlId"
      :model-value="modelValue ?? ''"
      :disabled="disabled"
      @update:model-value="update"
      @blur="touched = true"
    />
    <Input
      v-else
      :id="controlId"
      :type="role === 'secret' ? 'password' : ['color', 'date', 'time', 'datetime-local'].includes(role ?? '') ? role : 'text'"
      :model-value="modelValue ?? ''"
      :disabled="disabled"
      :required="required"
      @update:model-value="update"
      @blur="touched = true"
    />
    <FieldDescription v-if="description">
      {{ description }}
    </FieldDescription>
    <FieldError :id="`${controlId}-error`" :errors="fieldIssues" />
  </Field>

  <FieldSet v-else-if="choices && role === 'radio'">
    <FieldLegend v-if="displayLabel">
      {{ displayLabel }}
    </FieldLegend>
    <FieldDescription v-if="description">
      {{ description }}
    </FieldDescription>
    <RadioGroup :model-value="choiceIndex" :disabled="disabled" @update:model-value="selectChoice">
      <Field v-for="(choice, index) in choices" :key="index" orientation="horizontal">
        <RadioGroupItem :id="`${controlId}-${index}`" :value="String(index)" />
        <FieldLabel :for="`${controlId}-${index}`">
          {{ form.renderer.resolveText(choice.meta.description as any) ?? String(choice.value) }}
        </FieldLabel>
      </Field>
    </RadioGroup>
  </FieldSet>

  <Field v-else-if="choices" orientation="horizontal" :data-invalid="fieldIssues.length > 0 || undefined">
    <div class="flex min-w-0 flex-1 items-center justify-between gap-4">
      <div class="min-w-0 space-y-1">
        <FieldLabel v-if="displayLabel" :for="controlId">
          {{ displayLabel }}
        </FieldLabel>
        <FieldDescription v-if="description">
          {{ description }}
        </FieldDescription>
      </div>
      <Select :model-value="choiceIndex" :disabled="disabled" @update:model-value="selectChoice">
        <SelectTrigger :id="controlId" :aria-label="displayLabel" class="w-[180px] shrink-0">
          <SelectValue placeholder="Choose an option" />
        </SelectTrigger>
        <SelectContent>
          <SelectItem v-for="(choice, index) in choices" :key="index" :value="String(index)">
            {{ form.renderer.resolveText(choice.meta.description as any) ?? String(choice.value) }}
          </SelectItem>
        </SelectContent>
      </Select>
    </div>
    <FieldError :id="`${controlId}-error`" :errors="fieldIssues" />
  </Field>

  <FieldSet v-else-if="isMultiChoice">
    <FieldLegend v-if="displayLabel">
      {{ displayLabel }}
    </FieldLegend>
    <FieldDescription v-if="description">
      {{ description }}
    </FieldDescription>
    <FieldGroup>
      <Field v-for="(choice, index) in multiChoices" :key="index" orientation="horizontal">
        <Checkbox
          :id="`${controlId}-${index}`"
          :model-value="selectedMultiChoice(choice.value)"
          :disabled="disabled"
          @update:model-value="selected => toggleMultiChoice(choice.value, Boolean(selected))"
        />
        <FieldLabel :for="`${controlId}-${index}`">
          {{ form.renderer.resolveText(choice.meta.description as any) ?? String(choice.value) }}
        </FieldLabel>
      </Field>
    </FieldGroup>
  </FieldSet>

  <template v-else-if="type === 'const'" />

  <Field v-else data-invalid>
    <FieldLabel v-if="displayLabel">
      {{ displayLabel }}
    </FieldLabel>
    <FieldError :errors="[`Unsupported setting type: ${type}${role ? ` (${role})` : ''}`]" />
  </Field>
</template>
