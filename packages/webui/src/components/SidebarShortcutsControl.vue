<script setup lang="ts">
import type { SchemaFieldBinding } from '@fumika/schemastery'
import type { MailFolder } from '@/mail'
import {
  Select,
  SelectContent,
  SelectItem,
  SelectTrigger,
  SelectValue,
} from '@fumika/ui/select'
import { computed } from 'vue'
import {
  getSidebarMailbox,
  isMailFolder,
  resolveSidebarShortcuts,
  sidebarMailboxes,
} from '@/sidebar'

const props = defineProps<{
  field: SchemaFieldBinding
}>()

const shortcuts = computed(() => resolveSidebarShortcuts(props.field.value))

function updateShortcut(index: number, value: unknown): void {
  if (!isMailFolder(value))
    return

  const next = [...shortcuts.value]
  const existingIndex = next.indexOf(value)
  if (existingIndex === index)
    return

  if (existingIndex >= 0) {
    const previous = next[index]
    next[index] = value
    next[existingIndex] = previous
  }
  else {
    next[index] = value
  }

  props.field.touch()
  props.field.update(next)
}

function mailbox(folder: MailFolder) {
  return getSidebarMailbox(folder)
}
</script>

<template>
  <div class="grid grid-cols-2 gap-2 sm:grid-cols-4">
    <Select
      v-for="(folder, index) in shortcuts"
      :key="index"
      :model-value="folder"
      :disabled="field.disabled"
      @update:model-value="value => updateShortcut(index, value)"
    >
      <SelectTrigger
        v-bind="index === 0 ? field.controlAttrs : {}"
        :aria-label="`Quick card ${index + 1}: ${mailbox(folder).label}`"
        class="h-14! w-full justify-start rounded-xl px-2.5 shadow-none [&>svg:last-child]:ml-auto"
      >
        <SelectValue>
          <span class="grid size-8 shrink-0 place-items-center rounded-lg bg-muted text-foreground">
            <component :is="mailbox(folder).icon" class="size-4" />
          </span>
          <span class="min-w-0 text-left">
            <span class="block text-[10px]/3  text-muted-foreground">Card {{ index + 1 }}</span>
            <span class="block truncate text-xs font-medium text-foreground">{{ mailbox(folder).label }}</span>
          </span>
        </SelectValue>
      </SelectTrigger>

      <SelectContent>
        <SelectItem v-for="item in sidebarMailboxes" :key="item.folder" :value="item.folder">
          <component :is="item.icon" class="size-4" />
          <span>{{ item.label }}</span>
        </SelectItem>
      </SelectContent>
    </Select>
  </div>
</template>
