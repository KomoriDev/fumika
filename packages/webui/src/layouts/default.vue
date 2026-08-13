<script setup lang="ts">
import { Button } from '@fumika/ui/button'
import {
  Dialog,
  DialogContent,
  DialogDescription,
  DialogHeader,
  DialogTitle,
  DialogTrigger,
} from '@fumika/ui/dialog'
import { SidebarInset, SidebarProvider, SidebarTrigger } from '@fumika/ui/sidebar'
import { ArrowLeft, ArrowRight, RotateCw, Search, Settings2, Zap } from '@lucide/vue'
import { watchDebounced } from '@vueuse/core'
import { computed, ref, watch } from 'vue'
import { RouterView, useRoute, useRouter } from 'vue-router'
import AppSidebar from '@/components/app-sidebar/AppSidebar.vue'
import SettingsPanel from '@/components/settings/SettingsPanel.vue'
import { useContext, useInject } from '@/context'

const route = useRoute()
const router = useRouter()
const ctx = useContext()
const appState = useInject('appState')
const fallbackSidebarOpen = ref(true)
const settingsOpen = ref(false)
const settingsSection = ref<'general' | 'account' | 'about'>('general')
const disposeSettingsOpen = ctx.on('settings/open', (section) => {
  settingsSection.value = section
  settingsOpen.value = true
})
ctx.effect(() => disposeSettingsOpen)
const sidebarOpen = computed({
  get: () => appState.value?.data.app.sidebar.open ?? fallbackSidebarOpen.value,
  set: (value: boolean) => {
    if (!appState.value) {
      fallbackSidebarOpen.value = value
      return
    }
    appState.value.mutate((state) => {
      state.app.sidebar.open = value
    })
  },
})

const titlebarColumns = computed(() => sidebarOpen.value
  ? 'grid-cols-[256px_minmax(0,1fr)]'
  : 'grid-cols-[72px_minmax(0,1fr)]')

const searchQuery = ref<string | number>(typeof route.query.q === 'string' ? route.query.q : '')

watchDebounced(searchQuery, (value) => {
  const query = { ...route.query }
  const normalized = String(value).trimStart()
  if (normalized)
    query.q = normalized
  else
    delete query.q
  void router.replace({ query })
}, { debounce: 120, maxWait: 300 })

watch(() => route.query.q, (value) => {
  const normalized = typeof value === 'string' ? value : ''
  if (String(searchQuery.value) !== normalized)
    searchQuery.value = normalized
})

ctx.client.action.register('sidebar.toggle', {
  shortcut: 'mod+b',
  run: () => { sidebarOpen.value = !sidebarOpen.value },
})

function executeAction(id: string): void {
  void ctx.client.action.execute(id)
}

function openAccountSetup(): void {
  settingsOpen.value = false
  void router.push('/accounts')
}
</script>

<template>
  <SidebarProvider v-model:open="sidebarOpen" class="h-dvh min-h-0 bg-sidebar">
    <header class="fixed inset-x-0 top-0 z-30 h-9 bg-sidebar">
      <div
        class="titlebar-safe-area window-drag grid h-9 items-center transition-[grid-template-columns] duration-180 ease-[cubic-bezier(0.16,1,0.3,1)]"
        :class="titlebarColumns"
      >
        <div class="window-no-drag grid h-full grid-cols-[48px_24px] items-center">
          <Zap class="size-3.5 justify-self-center text-foreground" :stroke-width="1.7" />
          <SidebarTrigger class="titlebar-action size-6 justify-self-center" aria-label="Toggle sidebar" title="Toggle sidebar" />
        </div>

        <div class="grid h-full min-w-0 grid-cols-[78px_minmax(180px,520px)_78px] items-center justify-between gap-2 px-1.5">
          <div class="window-no-drag flex shrink-0 items-center gap-0.5">
            <Button class="titlebar-action" variant="ghost" size="icon-xs" aria-label="Back" title="Back" @click="executeAction('navigation.back')">
              <ArrowLeft />
            </Button>
            <Button class="titlebar-action" variant="ghost" size="icon-xs" aria-label="Forward" title="Forward" @click="executeAction('navigation.forward')">
              <ArrowRight />
            </Button>
            <Button class="titlebar-action" variant="ghost" size="icon-xs" aria-label="Reload" title="Reload" @click="executeAction('navigation.reload')">
              <RotateCw />
            </Button>
          </div>

          <div class="window-no-drag relative min-w-0">
            <Search class="pointer-events-none absolute left-2.5 top-1/2 z-10 size-3.5 -translate-y-1/2 text-muted-foreground" />
            <input
              v-model="searchQuery"
              type="search"
              aria-label="Search mail"
              placeholder="Search mail"
              class="h-6.5 w-full min-w-0 rounded-lg border border-black/10 bg-background px-2.5 pl-8 text-[13px] outline-none transition-colors placeholder:text-muted-foreground hover:border-black/16 hover:bg-card focus-visible:border-ring focus-visible:bg-card focus-visible:ring-2 focus-visible:ring-ring/30 dark:border-white/12 dark:bg-white/8 dark:hover:border-white/18 dark:hover:bg-white/12 dark:focus-visible:border-ring dark:focus-visible:bg-white/12"
            >
          </div>

          <div class="window-no-drag flex justify-end">
            <Dialog v-model:open="settingsOpen">
              <DialogTrigger as-child>
                <Button class="titlebar-action" variant="ghost" size="icon-xs" aria-label="Settings" title="Settings">
                  <Settings2 />
                </Button>
              </DialogTrigger>
              <DialogContent class="h-180 max-h-[calc(100dvh-2rem)] grid-rows-[auto_minmax(0,1fr)] gap-0 overflow-hidden p-0 sm:max-w-4xl!">
                <DialogHeader class="shrink-0 border-b p-5 pr-14">
                  <DialogTitle>Settings</DialogTitle>
                  <DialogDescription>Customize your Fumika Mail workspace.</DialogDescription>
                </DialogHeader>

                <SettingsPanel v-model:section="settingsSection" @add-account="openAccountSetup" />
              </DialogContent>
            </Dialog>
          </div>
        </div>
      </div>
    </header>

    <AppSidebar />

    <SidebarInset class="h-dvh min-h-0 overflow-hidden bg-sidebar pt-9 pb-2 pr-2">
      <div class="min-h-0 flex-1">
        <section
          role="main"
          class="router-scrollbar h-full min-w-0 overflow-y-auto rounded-xl bg-background ring-1 ring-border/60"
        >
          <RouterView v-slot="{ Component }">
            <Transition name="page" mode="out-in">
              <component :is="Component" :key="$route.path" />
            </Transition>
          </RouterView>
        </section>
      </div>
    </SidebarInset>
  </SidebarProvider>
</template>
