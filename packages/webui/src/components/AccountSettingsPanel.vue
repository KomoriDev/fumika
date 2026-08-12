<script setup lang="ts">
import type { MailAccountSummary } from '@fumika/state'
import { Avatar, AvatarFallback, AvatarImage } from '@fumika/ui/avatar'
import { Badge } from '@fumika/ui/badge'
import { Button } from '@fumika/ui/button'
import { FieldError } from '@fumika/ui/field'
import { CircleAlert, MailPlus, RefreshCw, ShieldCheck, Trash2 } from '@lucide/vue'
import { computed, onMounted, ref } from 'vue'
import { useContext, useInject } from '@/context'

const emit = defineEmits<{
  addAccount: []
}>()

const ctx = useContext()
const link = useInject('link')
const accounts = ref<MailAccountSummary[]>([])
const loading = ref(true)
const refreshing = ref(false)
const removingId = ref<string>()
const pendingRemoval = ref<MailAccountSummary>()
const error = ref('')

const connectedCount = computed(() => accounts.value.filter(account => account.status === 'active').length)

onMounted(async () => {
  const dispose = link.value?.on('mail-account.changed', ({ accounts: next }) => {
    accounts.value = next
  })
  if (dispose)
    ctx.effect(() => dispose)
  await loadAccounts()
})

async function loadAccounts(refresh = false): Promise<void> {
  if (refresh)
    refreshing.value = true
  else
    loading.value = true
  error.value = ''
  try {
    if (!link.value)
      throw new Error('Mailbox service is unavailable.')
    accounts.value = (await link.value.action('mail-account.list')).accounts
  }
  catch (reason) {
    error.value = messageOf(reason)
  }
  finally {
    loading.value = false
    refreshing.value = false
  }
}

async function removeAccount(account: MailAccountSummary): Promise<void> {
  pendingRemoval.value = undefined
  removingId.value = account.id
  error.value = ''
  try {
    if (!link.value)
      throw new Error('Mailbox service is unavailable.')
    await link.value.action('mail-account.remove', { id: account.id })
    accounts.value = accounts.value.filter(item => item.id !== account.id)
  }
  catch (reason) {
    error.value = messageOf(reason)
  }
  finally {
    removingId.value = undefined
  }
}

function requestRemoval(account: MailAccountSummary): void {
  pendingRemoval.value = account
}

function addAccount(): void {
  emit('addAccount')
}

function initials(account: MailAccountSummary): string {
  const source = account.displayName || account.mailboxAddress
  const parts = source.trim().split(/\s+/).filter(Boolean)
  return (parts.length > 1 ? `${parts[0]![0]}${parts.at(-1)![0]}` : source.slice(0, 2)).toUpperCase()
}

function providerLabel(provider: MailAccountSummary['provider']): string {
  if (provider === 'google')
    return 'Google'
  if (provider === 'outlook')
    return 'Outlook'
  return 'IMAP / SMTP'
}

function statusLabel(status: MailAccountSummary['status']): string {
  if (status === 'active')
    return 'Connected'
  if (status === 'reauth-required')
    return 'Sign in again'
  if (status === 'disabled')
    return 'Disabled'
  return 'Connection error'
}

function statusClass(status: MailAccountSummary['status']): string {
  if (status === 'active')
    return 'border-emerald-500/20 bg-emerald-500/10 text-emerald-700 dark:text-emerald-300'
  if (status === 'reauth-required')
    return 'border-amber-500/20 bg-amber-500/10 text-amber-700 dark:text-amber-300'
  return 'border-destructive/20 bg-destructive/10 text-destructive'
}

function messageOf(reason: unknown): string {
  return reason instanceof Error ? reason.message : String(reason)
}
</script>

<template>
  <div class="space-y-5">
    <section class="flex flex-wrap items-center gap-4 rounded-2xl border border-border bg-muted/20 p-5">
      <span class="grid size-11 shrink-0 place-items-center rounded-2xl bg-primary/10 text-primary">
        <ShieldCheck class="size-5" />
      </span>
      <div class="min-w-48 flex-1">
        <h3 class="text-sm font-semibold text-foreground">
          Mail accounts
        </h3>
        <p class="mt-1 text-xs/5 text-muted-foreground">
          {{ accounts.length }} connected {{ accounts.length === 1 ? 'account' : 'accounts' }} · {{ connectedCount }} ready to sync
        </p>
      </div>
      <div class="flex items-center gap-2">
        <Button variant="outline" size="sm" :disabled="loading || refreshing" @click="loadAccounts(true)">
          <RefreshCw :class="refreshing ? 'animate-spin' : ''" />
          Refresh
        </Button>
        <Button size="sm" @click="addAccount">
          <MailPlus />
          Add account
        </Button>
      </div>
    </section>

    <FieldError v-if="error" class="rounded-xl border border-destructive/20 bg-destructive/5 px-3 py-2">
      {{ error }}
    </FieldError>

    <div v-if="loading" class="grid min-h-48 place-items-center rounded-2xl border border-dashed text-sm text-muted-foreground">
      <RefreshCw class="mr-2 inline size-4 animate-spin" />
      Loading mail accounts…
    </div>

    <div v-else-if="accounts.length" class="space-y-2">
      <article
        v-for="account in accounts"
        :key="account.id"
        class="flex items-center gap-3 rounded-2xl border border-border bg-background p-4 shadow-none dark:shadow-sm"
      >
        <Avatar class="size-10 rounded-xl">
          <AvatarImage v-if="account.avatarUrl" :src="account.avatarUrl" :alt="account.displayName" referrer-policy="no-referrer" />
          <AvatarFallback class="rounded-xl bg-neutral-900 text-xs font-semibold text-white">
            {{ initials(account) }}
          </AvatarFallback>
        </Avatar>
        <div class="min-w-0 flex-1">
          <div class="flex min-w-0 items-center gap-2">
            <h4 class="truncate text-sm font-medium text-foreground">
              {{ account.displayName }}
            </h4>
            <Badge variant="outline" class="shrink-0 font-normal" :class="statusClass(account.status)">
              {{ statusLabel(account.status) }}
            </Badge>
          </div>
          <p class="mt-1 truncate text-xs text-muted-foreground">
            {{ account.mailboxAddress }} · {{ providerLabel(account.provider) }}
          </p>
        </div>
        <dl class="hidden shrink-0 text-right text-xs lg:block">
          <dt class="text-muted-foreground">
            Last verified
          </dt>
          <dd class="mt-1 font-medium text-foreground">
            {{ new Date(account.lastVerifiedAt).toLocaleString() }}
          </dd>
        </dl>
        <Button
          variant="ghost"
          size="icon-sm"
          class="text-muted-foreground hover:text-destructive"
          :disabled="removingId === account.id"
          :aria-label="`Remove ${account.mailboxAddress}`"
          @click="requestRemoval(account)"
        >
          <RefreshCw v-if="removingId === account.id" class="animate-spin" />
          <Trash2 v-else />
        </Button>
      </article>
    </div>

    <section v-else class="grid min-h-56 place-items-center rounded-2xl border border-dashed border-border bg-muted/15 p-8 text-center">
      <div class="max-w-sm">
        <span class="mx-auto grid size-11 place-items-center rounded-2xl bg-muted text-muted-foreground">
          <CircleAlert class="size-5" />
        </span>
        <h3 class="mt-4 text-sm font-semibold text-foreground">
          No mail accounts connected
        </h3>
        <p class="mt-1 text-xs/5 text-muted-foreground">
          Connect Google, Outlook, or any IMAP / SMTP mailbox to begin receiving mail.
        </p>
        <Button size="sm" class="mt-4" @click="addAccount">
          <MailPlus />
          Connect mailbox
        </Button>
      </div>
    </section>

    <section v-if="pendingRemoval" class="flex flex-wrap items-center gap-3 rounded-2xl border border-destructive/20 bg-destructive/5 p-4">
      <div class="min-w-0 flex-1">
        <h4 class="text-sm font-medium text-foreground">
          Remove {{ pendingRemoval.mailboxAddress }}?
        </h4>
        <p class="mt-1 text-xs/5 text-muted-foreground">
          The mailbox and encrypted credentials will be removed from this device.
        </p>
      </div>
      <Button variant="ghost" size="sm" @click="pendingRemoval = undefined">
        Cancel
      </Button>
      <Button variant="destructive" size="sm" @click="removeAccount(pendingRemoval)">
        Remove account
      </Button>
    </section>

    <p class="px-1 text-xs/5 text-muted-foreground">
      Credentials are encrypted with the operating system's secure storage and never shown after setup.
    </p>
  </div>
</template>
