<script setup lang="ts">
import type { HTMLAttributes } from 'vue'

import { cn } from '@fumika/ui'
import { Button } from '@fumika/ui/button'
import { PanelLeftIcon } from '@lucide/vue'
import { useSidebar } from './utils'

const props = defineProps<{
  class?: HTMLAttributes['class']
}>()

const { toggleSidebar } = useSidebar()
</script>

<template>
  <Button
    data-sidebar="trigger"
    data-slot="sidebar-trigger"
    variant="ghost"
    size="icon-sm"
    :class="cn('', props.class)"
    @click="toggleSidebar"
  >
    <PanelLeftIcon class="cn-rtl-flip" />
    <span class="sr-only">Toggle Sidebar</span>
  </Button>
</template>
