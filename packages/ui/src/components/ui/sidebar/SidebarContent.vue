<script setup lang="ts">
import type { HTMLAttributes } from 'vue'
import { cn } from '@fumika/ui'

const props = defineProps<{
  class?: HTMLAttributes['class']
}>()
</script>

<template>
  <div
    data-slot="sidebar-content"
    data-sidebar="content"
    :class="cn('gap-0 flex min-h-0 flex-1 flex-col overflow-x-hidden overflow-y-auto', props.class)"
  >
    <slot />
  </div>
</template>
