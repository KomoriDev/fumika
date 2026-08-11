<script setup lang="ts">
import type { SettingOptions } from '../plugins/setting'
import { SchemaForm } from '@fumika/schemastery'
import { computed } from 'vue'
import { useContext } from '../context'

const props = defineProps<{
  entry: SettingOptions
}>()

const ctx = useContext()
const title = computed(() => ctx.client.i18n.resolve(props.entry.title) ?? props.entry.id)
const description = computed(() => ctx.client.i18n.resolve(props.entry.description))
const model = computed({
  get: () => ctx.client.setting.read(props.entry),
  set: value => ctx.client.setting.write(props.entry, value),
})
</script>

<template>
  <section class="shrink-0 space-y-4 border-b border-border/70 pb-6 last:border-b-0 last:pb-0">
    <div class="space-y-1">
      <h3 class="text-sm font-semibold text-foreground">
        {{ title }}
      </h3>
      <p v-if="description" class="text-xs/5 text-muted-foreground">
        {{ description }}
      </p>
    </div>

    <component :is="entry.component" v-if="entry.component" />
    <SchemaForm
      v-else-if="entry.schema"
      v-model="model"
      :schema="entry.schema"
      :initial="entry.initial"
      :simplify="false"
      :disabled="entry.disabled?.()"
    />
  </section>
</template>
