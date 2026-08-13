<script setup lang="ts">
import type { Component } from 'vue'
import { Button } from '@fumika/ui/button'
import { ExternalLink, Info, Settings2, UserRound, Zap } from '@lucide/vue'
import { computed } from 'vue'
import { useContext, useInject } from '@/context'
import AccountSettingsPanel from './AccountSettingsPanel.vue'
import SettingEntryCard from './SettingEntryCard.vue'

type SettingsSection = 'general' | 'account' | 'about'

const emit = defineEmits<{
  addAccount: []
}>()
const section = defineModel<SettingsSection>('section', { default: 'general' })

interface SettingsNavItem {
  id: SettingsSection
  label: string
  description: string
  icon: Component
}

const sections: SettingsNavItem[] = [
  {
    id: 'general',
    label: 'General',
    description: 'Language, appearance, and mail preferences.',
    icon: Settings2,
  },
  {
    id: 'account',
    label: 'Account',
    description: 'Manage your mail account and profile.',
    icon: UserRound,
  },
  {
    id: 'about',
    label: 'About',
    description: 'Version, license, and source.',
    icon: Info,
  },
]

const ctx = useContext()
const version = useInject('version')
const activeSection = section
const activeItem = computed(() => sections.find(item => item.id === activeSection.value)!)
const entries = computed(() => ctx.client.setting.sorted())
</script>

<template>
  <div class="grid min-h-0 flex-1 grid-cols-[176px_minmax(0,1fr)]">
    <aside class="min-h-0 border-r border-border/70 bg-muted/25 p-3">
      <nav aria-label="Settings sections" class="space-y-1">
        <Button
          v-for="item in sections"
          :key="item.id"
          type="button"
          variant="ghost"
          class="sidebar-item h-9 w-full justify-start gap-2.5 px-3 font-normal shadow-none"
          :class="activeSection === item.id ? 'text-foreground' : 'text-muted-foreground'"
          :data-active="activeSection === item.id || undefined"
          :aria-current="activeSection === item.id ? 'page' : undefined"
          @click="activeSection = item.id"
        >
          <component :is="item.icon" class="size-4" />
          <span>{{ item.label }}</span>
        </Button>
      </nav>
    </aside>

    <section class="router-scrollbar min-h-0 overflow-y-auto">
      <header class="sticky top-0 z-10 border-b border-border/70 bg-popover/95 px-6 py-5 backdrop-blur">
        <h2 class="text-base font-semibold text-foreground">
          {{ activeItem.label }}
        </h2>
        <p class="mt-1 text-xs/5 text-muted-foreground">
          {{ activeItem.description }}
        </p>
      </header>

      <div v-if="activeSection === 'general'" class="space-y-6 p-6">
        <SettingEntryCard v-for="entry in entries" :key="entry.id" :entry="entry" />
      </div>

      <div v-else-if="activeSection === 'account'" class="p-6">
        <AccountSettingsPanel @add-account="emit('addAccount')" />
      </div>

      <div v-else class="space-y-4 p-6">
        <div class="space-y-1">
          <h3 class="flex items-center gap-2 text-sm font-semibold text-foreground">
            <Zap class="size-3.5" :stroke-width="1.7" />
            Fumika Mail
          </h3>
          <p class="text-xs/5 text-muted-foreground">
            A focused desktop workspace for reading and organizing mail
          </p>
        </div>

        <div class="divide-y divide-border/70 overflow-hidden rounded-xl border border-border/70">
          <div class="flex items-center justify-between gap-3 px-4 py-3">
            <span class="text-sm text-foreground">Version</span>
            <span class="font-mono text-xs tabular-nums text-muted-foreground">{{ version ?? 'Unknown' }}</span>
          </div>
          <div class="flex items-center justify-between gap-3 px-4 py-3">
            <span class="text-sm text-foreground">License</span>
            <span class="font-mono text-xs text-muted-foreground">AGPL-3.0</span>
          </div>
          <a
            href="https://github.com/KomoriDev/fumika"
            target="_blank"
            rel="noreferrer"
            class="flex items-center gap-3 px-4 py-3 transition-colors hover:bg-foreground/7"
          >
            <span class="text-sm text-foreground">GitHub</span>
            <span class="min-w-0 flex-1 truncate text-right text-xs text-muted-foreground">github.com/KomoriDev/fumika</span>
            <ExternalLink class="size-4 shrink-0 text-muted-foreground" />
          </a>
        </div>
      </div>
    </section>
  </div>
</template>
