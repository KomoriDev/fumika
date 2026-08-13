<script setup lang="ts">
import type { MailAccountSummary } from '@fumika/state'
import { Avatar, AvatarFallback, AvatarImage } from '@fumika/ui/avatar'
import {
  DropdownMenu,
  DropdownMenuContent,
  DropdownMenuGroup,
  DropdownMenuItem,
  DropdownMenuLabel,
  DropdownMenuSeparator,
  DropdownMenuShortcut,
  DropdownMenuTrigger,
} from '@fumika/ui/dropdown-menu'
import { SidebarMenu, SidebarMenuButton, SidebarMenuItem, useSidebar } from '@fumika/ui/sidebar'
import { ChevronsUpDown, MailPlus, Settings2, UserRound } from '@lucide/vue'
import { computed, ref } from 'vue'

const props = defineProps<{
  accounts: MailAccountSummary[]
}>()

const emit = defineEmits<{
  openAccountSettings: []
  openGeneralSettings: []
  addAccount: []
}>()

const { isMobile } = useSidebar()
const menuOpen = ref(false)
const account = computed(() => preferredAccount(props.accounts))
const displayName = computed(() => account.value?.displayName || 'Fumika Mail')
const providerSummary = computed(() => {
  if (!props.accounts.length)
    return 'No mailbox connected'
  const providers = new Set(props.accounts.map(account => account.provider))
  return (['google', 'outlook', 'imap-smtp'] as const)
    .filter(provider => providers.has(provider))
    .map(providerLabel)
    .join(' / ')
})
const initials = computed(() => {
  const source = account.value?.displayName || account.value?.mailboxAddress || 'Fumika'
  const parts = source.trim().split(/\s+/).filter(Boolean)
  return (parts.length > 1 ? `${parts[0]![0]}${parts.at(-1)![0]}` : source.slice(0, 2)).toUpperCase()
})

function preferredAccount(accounts: MailAccountSummary[]): MailAccountSummary | undefined {
  return accounts.find(account => account.provider === 'google')
    ?? accounts.find(account => account.provider === 'outlook')
    ?? accounts[0]
}

function providerLabel(provider: MailAccountSummary['provider']): string {
  if (provider === 'google')
    return 'Gmail'
  if (provider === 'outlook')
    return 'Outlook'
  return 'Other'
}
</script>

<template>
  <SidebarMenu>
    <SidebarMenuItem>
      <DropdownMenu v-model:open="menuOpen">
        <DropdownMenuTrigger as-child>
          <SidebarMenuButton
            size="lg"
            :tooltip="displayName"
            :is-active="menuOpen"
            class="sidebar-item h-12 cursor-pointer rounded-lg group-data-[collapsible=icon]:p-0!"
          >
            <Avatar class="size-8 rounded-lg">
              <AvatarImage v-if="account?.avatarUrl" :src="account.avatarUrl" :alt="displayName" referrer-policy="no-referrer" />
              <AvatarFallback class="rounded-lg bg-neutral-900 text-[10px] font-semibold text-white">
                {{ initials }}
              </AvatarFallback>
            </Avatar>
            <div class="grid min-w-0 flex-1 text-left text-sm/tight group-data-[collapsible=icon]:hidden">
              <span class="truncate font-medium">{{ displayName }}</span>
              <span class="truncate text-xs text-muted-foreground">{{ providerSummary }}</span>
            </div>
            <ChevronsUpDown class="ml-auto size-4 text-muted-foreground group-data-[collapsible=icon]:hidden" />
          </SidebarMenuButton>
        </DropdownMenuTrigger>

        <DropdownMenuContent
          class="w-(--reka-dropdown-menu-trigger-width) min-w-56 rounded-lg"
          :side="isMobile ? 'bottom' : 'right'"
          align="end"
          :side-offset="4"
        >
          <DropdownMenuLabel>My Account</DropdownMenuLabel>
          <DropdownMenuGroup>
            <DropdownMenuItem @select="emit('openAccountSettings')">
              <UserRound />
              Account settings
            </DropdownMenuItem>
            <DropdownMenuItem @select="emit('openGeneralSettings')">
              <Settings2 />
              Preferences
            </DropdownMenuItem>
          </DropdownMenuGroup>
          <DropdownMenuSeparator />
          <DropdownMenuItem @select="emit('addAccount')">
            <MailPlus />
            Add mail account
            <DropdownMenuShortcut v-if="accounts.length">
              {{ accounts.length }}
            </DropdownMenuShortcut>
          </DropdownMenuItem>
        </DropdownMenuContent>
      </DropdownMenu>
    </SidebarMenuItem>
  </SidebarMenu>
</template>
