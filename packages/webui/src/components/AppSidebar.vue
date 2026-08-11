<script setup lang="ts">
import { Avatar, AvatarFallback } from '@fumika/ui/avatar'
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
import { Archive, Clock3, FileText, Inbox, RotateCw, Send, Star, Trash2 } from '@lucide/vue'
import { computed } from 'vue'
import { RouterLink, useRoute } from 'vue-router'
import { useRuntimeInfo } from '@/composables/useRuntimeInfo'
import { useContext } from '@/context'
import { resolveMailFolder } from '@/mail'

const ctx = useContext()
const route = useRoute()
const { state } = useSidebar()
const { statusMeta } = useRuntimeInfo()

const mailboxes = [
  { folder: 'inbox', label: 'Inbox', count: 7, icon: Inbox },
  { folder: 'starred', label: 'Starred', count: 5, icon: Star },
  { folder: 'snoozed', label: 'Snoozed', count: 2, icon: Clock3 },
  { folder: 'sent', label: 'Sent', count: 0, icon: Send },
  { folder: 'drafts', label: 'Drafts', count: 2, icon: FileText },
  { folder: 'archive', label: 'Archive', count: 0, icon: Archive },
  { folder: 'trash', label: 'Trash', count: 0, icon: Trash2 },
] as const

const shortcuts = [mailboxes[0], mailboxes[1], mailboxes[3]] as const

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

function reloadPage() {
  void ctx.client.action.execute('navigation.reload')
}
</script>

<template>
  <Sidebar collapsible="icon" class="top-9 bottom-0 h-auto border-r-0 bg-sidebar">
    <SidebarHeader class="p-2">
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

        <SidebarMenuButton
          variant="outline"
          size="lg"
          tooltip="Reload mail"
          aria-label="Reload mail"
          class="sidebar-item aspect-square h-auto w-full justify-center rounded-xl border-transparent bg-black/4.5 p-0 shadow-none group-data-[collapsible=icon]:size-8! group-data-[collapsible=icon]:rounded-lg"
          @click="reloadPage"
        >
          <RotateCw />
          <span class="sr-only">Reload mail</span>
        </SidebarMenuButton>
      </div>
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
                    v-if="item.count"
                    class="ml-auto text-[11px] tabular-nums text-muted-foreground group-data-[collapsible=icon]:hidden"
                  >
                    {{ item.count }}
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
      <k-slot name="sidebar:content" />
    </SidebarContent>

    <k-slot name="sidebar:footer" />
    <SidebarFooter class="p-2">
      <div class="relative flex min-w-0 items-center gap-2 rounded-xl p-2  group-data-[collapsible=icon]:size-8 group-data-[collapsible=icon]:justify-center group-data-[collapsible=icon]:p-0">
        <Avatar size="sm">
          <AvatarFallback class="bg-neutral-900 text-[10px] font-semibold text-white">
            K
          </AvatarFallback>
        </Avatar>
        <div class="min-w-0 flex-1 group-data-[collapsible=icon]:hidden">
          <p class="truncate text-xs font-medium">
            Komorebi
          </p>
          <p class="truncate text-[10px] text-muted-foreground">
            komorebi@fumika.dev
          </p>
        </div>
        <span
          class="size-2 shrink-0 rounded-full ring-2 ring-sidebar group-data-[collapsible=icon]:absolute group-data-[collapsible=icon]:right-1 group-data-[collapsible=icon]:bottom-1"
          :class="statusMeta.dotClass"
          :title="statusMeta.label"
          :aria-label="statusMeta.label"
        />
      </div>
    </SidebarFooter>
  </Sidebar>
</template>
