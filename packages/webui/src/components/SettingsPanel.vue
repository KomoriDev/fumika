<script setup lang="ts">
import type { Component } from 'vue'
import { Button } from '@fumika/ui/button'
import { ExternalLink, GitFork, Info, Settings2, UserRound, Zap } from '@lucide/vue'
import { computed, ref } from 'vue'
import { useContext, useInject } from '../context'
import SettingEntryCard from './SettingEntryCard.vue'

type SettingsSection = 'general' | 'account' | 'about'

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
    description: 'Fumika Mail and project information.',
    icon: Info,
  },
]

const ctx = useContext()
const version = useInject('version')
const activeSection = ref<SettingsSection>('general')
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
          class="h-9 w-full justify-start gap-2.5 px-3 font-normal"
          :class="activeSection === item.id
            ? 'bg-background text-foreground shadow-sm hover:bg-background'
            : 'text-muted-foreground'"
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

      <div v-else-if="activeSection === 'account'" class="flex min-h-105 items-center justify-center p-6">
        <section class="w-full max-w-md rounded-2xl border border-dashed border-border bg-muted/20 p-8 text-center">
          <span class="mx-auto grid size-11 place-items-center rounded-2xl bg-muted text-muted-foreground">
            <UserRound class="size-5" />
          </span>
          <h3 class="mt-4 text-sm font-semibold text-foreground">
            Account settings
          </h3>
          <p class="mx-auto mt-1 max-w-xs text-xs/5 text-muted-foreground">
            Account management will appear here when it becomes available.
          </p>
        </section>
      </div>

      <div v-else class="space-y-6 p-6">
        <section class="flex items-center gap-4 rounded-2xl border border-border bg-muted/20 p-5">
          <span class="grid size-11 shrink-0 place-items-center rounded-2xl bg-neutral-950 text-white">
            <Zap class="size-5" />
          </span>
          <div class="min-w-0 flex-1 space-y-1">
            <h3 class="text-sm font-semibold text-foreground">
              Fumika Mail
            </h3>
            <p class="text-xs/5 text-muted-foreground">
              A focused desktop workspace for reading and organizing mail.
            </p>
          </div>
          <dl class="flex shrink-0 items-baseline gap-2 text-xs">
            <dt class="text-muted-foreground">
              Version
            </dt>
            <dd class="font-mono font-medium tabular-nums text-foreground">
              {{ version ?? 'Unknown' }}
            </dd>
          </dl>
        </section>

        <section class="space-y-2">
          <p class="text-xs font-medium tracking-[0.18em] text-muted-foreground uppercase">
            Project
          </p>
          <Button as-child variant="outline" class="h-auto w-full justify-start gap-3 rounded-2xl px-4 py-3 text-left shadow-none">
            <a href="https://github.com/KomoriDev/fumika" target="_blank" rel="noreferrer">
              <span class="grid size-9 shrink-0 place-items-center rounded-xl bg-neutral-950 text-white">
                <GitFork class="size-4" />
              </span>
              <span class="min-w-0 flex-1">
                <span class="block text-sm font-medium">GitHub</span>
                <span class="block truncate text-xs font-normal text-muted-foreground">github.com/KomoriDev/fumika</span>
              </span>
              <ExternalLink class="size-4 text-muted-foreground" />
            </a>
          </Button>
        </section>
      </div>
    </section>
  </div>
</template>
