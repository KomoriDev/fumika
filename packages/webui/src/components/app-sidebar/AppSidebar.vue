<script setup lang="ts">
import type { MailAccountSummary } from '@fumika/state'
import type { MailFolder } from '@/mail'
import { DEFAULT_STATE } from '@fumika/state'
import {
  Sidebar,
  SidebarContent,
  SidebarFooter,
  SidebarGroup,
  SidebarGroupContent,
  SidebarGroupLabel,
  SidebarHeader,
  SidebarMenu,
  SidebarMenuButton,
  SidebarMenuItem,
  useSidebar,
} from '@fumika/ui/sidebar'
import { computed, onMounted, ref } from 'vue'
import { RouterLink, useRoute, useRouter } from 'vue-router'
import { useContext, useInject } from '@/context'
import { resolveMailFolder } from '@/mail'
import { getSidebarMailbox, resolveSidebarShortcuts, sidebarMailboxes } from '@/sidebar'
import SidebarUserMenu from './SidebarUserMenu.vue'

declare module 'cordis' {
  interface Events {
    'settings/open': (section: 'general' | 'account' | 'about') => void
  }
}

const route = useRoute()
const router = useRouter()
const ctx = useContext()
const link = useInject('link')
const { state } = useSidebar()
const appSettings = computed(() => ctx.client.setting.readState('app', DEFAULT_STATE.app))
const accounts = ref<MailAccountSummary[]>([])
const mailStore = useInject('mailStore')
const mailboxCounts = computed<Record<MailFolder, number>>(() => {
  const counts: Record<MailFolder, number> = mailStore.value?.counts ?? {
    inbox: 0,
    starred: 0,
    snoozed: 0,
    sent: 0,
    drafts: 0,
    archive: 0,
    trash: 0,
  }
  return { ...counts, inbox: mailStore.value?.unreadCounts.inbox ?? 0 }
})

const mailboxes = sidebarMailboxes
const shortcuts = computed(() => resolveSidebarShortcuts(appSettings.value.sidebar.shortcuts)
  .map(folder => getSidebarMailbox(folder)))

const labels = [
  { value: 'work', label: 'Work', color: 'bg-violet-500' },
  { value: 'personal', label: 'Personal', color: 'bg-emerald-500' },
  { value: 'receipts', label: 'Receipts', color: 'bg-amber-500' },
] as const

const collapsed = computed(() => state.value === 'collapsed')
const activeFolder = computed(() => resolveMailFolder(route.params.folder))
const activeLabel = computed(() => typeof route.query.label === 'string' ? route.query.label : undefined)

function isLabelActive(label: string) {
  return activeLabel.value === label
}

onMounted(async () => {
  const dispose = link.value?.on('mail-account.changed', ({ accounts: next }) => {
    accounts.value = next
  })
  if (dispose)
    ctx.effect(() => dispose)
  if (!link.value)
    return
  try {
    accounts.value = (await link.value.action('mail-account.list')).accounts
  }
  catch {
    accounts.value = []
  }
})

function openSettings(section: 'general' | 'account'): void {
  ctx.emit('settings/open', section)
}

function addAccount(): void {
  void router.push('/accounts')
}
</script>

<template>
  <Sidebar collapsible="icon" class="top-9 bottom-0 h-auto border-r-0 bg-sidebar">
    <SidebarHeader v-if="appSettings.sidebar.showShortcuts" class="p-2">
      <fumika-slot name="sidebar:shortcuts" single>
        <div class="grid gap-1.5" :class="collapsed ? 'grid-cols-1' : 'grid-cols-4'">
          <SidebarMenuButton
            v-for="item in shortcuts"
            :key="item.folder"
            as-child
            variant="outline"
            size="lg"
            :is-active="activeFolder === item.folder && !activeLabel"
            :tooltip="item.label"
            class="sidebar-item aspect-square h-auto w-full justify-center rounded-xl border-transparent bg-black/4.5 p-0 shadow-none group-data-[collapsible=icon]:size-8! group-data-[collapsible=icon]:rounded-lg"
          >
            <RouterLink :to="`/${item.folder}`" :aria-label="item.label">
              <component :is="item.icon" />
              <span class="sr-only">{{ item.label }}</span>
            </RouterLink>
          </SidebarMenuButton>
        </div>
      </fumika-slot>
    </SidebarHeader>

    <SidebarContent class="sidebar-scrollbar pt-1">
      <SidebarGroup>
        <SidebarGroupLabel>Mailboxes</SidebarGroupLabel>
        <SidebarGroupContent>
          <SidebarMenu class="gap-1">
            <SidebarMenuItem v-for="item in mailboxes" :key="item.folder">
              <SidebarMenuButton
                as-child
                size="lg"
                :is-active="activeFolder === item.folder && !activeLabel"
                :tooltip="item.label"
                class="sidebar-item h-9 rounded-xl px-2.5 group-data-[collapsible=icon]:gap-0 group-data-[collapsible=icon]:justify-center group-data-[collapsible=icon]:px-0 group-data-[collapsible=icon]:[&>span]:hidden"
              >
                <RouterLink
                  :to="`/${item.folder}`"
                  :aria-label="collapsed ? item.label : undefined"
                  :aria-current="activeFolder === item.folder && !activeLabel ? 'page' : undefined"
                >
                  <component :is="item.icon" />
                  <span>{{ item.label }}</span>
                  <span
                    v-if="mailboxCounts[item.folder]"
                    class="ml-auto text-[11px] tabular-nums text-muted-foreground group-data-[collapsible=icon]:hidden"
                  >
                    {{ mailboxCounts[item.folder] }}
                  </span>
                </RouterLink>
              </SidebarMenuButton>
            </SidebarMenuItem>
          </SidebarMenu>
        </SidebarGroupContent>
      </SidebarGroup>

      <SidebarGroup>
        <SidebarGroupLabel>Labels</SidebarGroupLabel>
        <SidebarGroupContent>
          <SidebarMenu class="gap-1">
            <SidebarMenuItem v-for="item in labels" :key="item.value">
              <SidebarMenuButton
                as-child
                :is-active="isLabelActive(item.value)"
                :tooltip="item.label"
                class="sidebar-item h-8 rounded-xl px-2.5 group-data-[collapsible=icon]:gap-0 group-data-[collapsible=icon]:justify-center group-data-[collapsible=icon]:px-0 group-data-[collapsible=icon]:[&_.sidebar-item-label]:hidden"
              >
                <RouterLink
                  :to="{ path: '/inbox', query: { label: item.value } }"
                  :aria-label="collapsed ? item.label : undefined"
                  :aria-current="isLabelActive(item.value) ? 'page' : undefined"
                >
                  <span class="size-2.5 rounded-full ring-2 ring-sidebar" :class="item.color" />
                  <span class="sidebar-item-label">{{ item.label }}</span>
                </RouterLink>
              </SidebarMenuButton>
            </SidebarMenuItem>
          </SidebarMenu>
        </SidebarGroupContent>
      </SidebarGroup>
      <fumika-slot name="sidebar:content" />
    </SidebarContent>

    <fumika-slot name="sidebar:footer" />
    <SidebarFooter class="p-2">
      <SidebarUserMenu
        :accounts="accounts"
        @open-account-settings="openSettings('account')"
        @open-general-settings="openSettings('general')"
        @add-account="addAccount"
      />
    </SidebarFooter>
  </Sidebar>
</template>
