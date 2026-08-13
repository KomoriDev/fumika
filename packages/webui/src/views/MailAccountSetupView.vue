<script setup lang="ts">
import type { MailAccountManualPayload, MailAccountSummary } from '@fumika/state'
import { Button } from '@fumika/ui/button'
import { Checkbox } from '@fumika/ui/checkbox'
import {
  Dialog,
  DialogContent,
  DialogDescription,
  DialogFooter,
  DialogHeader,
  DialogTitle,
} from '@fumika/ui/dialog'
import { Field, FieldError, FieldLabel } from '@fumika/ui/field'
import { Input } from '@fumika/ui/input'
import { MoreHorizontal, Plus, RefreshCw, ShieldCheck, Trash2 } from '@lucide/vue'
import { computed, onMounted, reactive, ref } from 'vue'
import { useRouter } from 'vue-router'
import { useContext, useInject } from '@/context'

const ctx = useContext()
const link = useInject('link')
const router = useRouter()
const accounts = ref<MailAccountSummary[]>([])
const mailStore = useInject('mailStore')
const oauthAvailable = reactive({ google: false, outlook: false })
const loading = ref(true)
const busyProvider = ref<'google' | 'outlook'>()
const removingId = ref<string>()
const error = ref('')
const manualOpen = ref(false)
const manualBusy = ref(false)

const manual = reactive({
  email: '',
  displayName: '',
  password: '',
  imapHost: '',
  imapPort: 993,
  imapSecure: true,
  imapUsername: '',
  smtpHost: '',
  smtpPort: 465,
  smtpSecure: true,
  smtpUsername: '',
})

const hasAccounts = computed(() => accounts.value.length > 0)

onMounted(async () => {
  const dispose = link.value?.on('mail-account.changed', ({ accounts: next }) => {
    accounts.value = next
  })
  if (dispose)
    ctx.effect(() => dispose)
  await loadAccounts()
})

async function loadAccounts(): Promise<void> {
  loading.value = true
  error.value = ''
  try {
    if (!link.value)
      throw new Error('Mailbox service is unavailable.')
    const reply = await link.value.action('mail-account.list')
    accounts.value = reply.accounts
    oauthAvailable.google = reply.oauth.google
    oauthAvailable.outlook = reply.oauth.outlook
  }
  catch (reason) {
    error.value = messageOf(reason)
  }
  finally {
    loading.value = false
  }
}

async function bindOAuth(provider: 'google' | 'outlook'): Promise<void> {
  busyProvider.value = provider
  error.value = ''
  try {
    if (!link.value)
      throw new Error('Mailbox service is unavailable.')
    const account = await link.value.action('mail-account.bind-oauth', { provider }, { timeout: 6 * 60_000 })
    accounts.value = [...accounts.value.filter(item => item.id !== account.id), account]
    mailStore.value?.resetForAccountChange()
    await mailStore.value?.refreshOnce({ folder: 'inbox', limit: 200 })
    ctx.client.router.setMailAccountsAvailable(true)
    await router.replace('/inbox')
  }
  catch (reason) {
    error.value = messageOf(reason)
  }
  finally {
    busyProvider.value = undefined
  }
}

function openManual(): void {
  error.value = ''
  manualOpen.value = true
}

async function bindManual(): Promise<void> {
  manualBusy.value = true
  error.value = ''
  const payload: MailAccountManualPayload = {
    email: manual.email,
    displayName: manual.displayName || undefined,
    password: manual.password,
    imap: {
      host: manual.imapHost,
      port: Number(manual.imapPort),
      secure: manual.imapSecure,
      username: manual.imapUsername || undefined,
    },
    smtp: {
      host: manual.smtpHost,
      port: Number(manual.smtpPort),
      secure: manual.smtpSecure,
      username: manual.smtpUsername || undefined,
    },
  }
  try {
    if (!link.value)
      throw new Error('Mailbox service is unavailable.')
    const account = await link.value.action('mail-account.bind-manual', payload, { timeout: 60_000 })
    accounts.value = [...accounts.value.filter(item => item.id !== account.id), account]
    mailStore.value?.resetForAccountChange()
    await mailStore.value?.refreshOnce({ folder: 'inbox', limit: 200 })
    manualOpen.value = false
    resetManual()
    ctx.client.router.setMailAccountsAvailable(true)
    await router.replace('/inbox')
  }
  catch (reason) {
    error.value = messageOf(reason)
  }
  finally {
    manualBusy.value = false
  }
}

async function removeAccount(account: MailAccountSummary): Promise<void> {
  removingId.value = account.id
  error.value = ''
  try {
    if (!link.value)
      throw new Error('Mailbox service is unavailable.')
    await link.value.action('mail-account.remove', { id: account.id })
  }
  catch (reason) {
    error.value = messageOf(reason)
  }
  finally {
    removingId.value = undefined
  }
}

function resetManual(): void {
  Object.assign(manual, {
    email: '',
    displayName: '',
    password: '',
    imapHost: '',
    imapPort: 993,
    imapSecure: true,
    imapUsername: '',
    smtpHost: '',
    smtpPort: 465,
    smtpSecure: true,
    smtpUsername: '',
  })
}

function providerLabel(provider: MailAccountSummary['provider']): string {
  if (provider === 'google')
    return 'Google'
  if (provider === 'outlook')
    return 'Outlook'
  return 'IMAP / SMTP'
}

function messageOf(reason: unknown): string {
  return reason instanceof Error ? reason.message : String(reason)
}
</script>

<template>
  <div class="flex min-h-full items-center justify-center p-6 sm:p-10">
    <section class="w-full max-w-3xl">
      <div v-if="loading" class="grid min-h-80 place-items-center text-sm text-muted-foreground">
        <RefreshCw class="mr-2 inline size-4 animate-spin" />
        Loading mail accounts…
      </div>

      <template v-else>
        <header class="mx-auto max-w-xl text-center">
          <div class="mx-auto grid size-12 place-items-center rounded-2xl bg-primary/10 text-primary">
            <ShieldCheck class="size-6" />
          </div>
          <h1 class="mt-5 text-2xl font-semibold tracking-tight">
            {{ hasAccounts ? 'Mail accounts' : 'Connect your mailbox' }}
          </h1>
          <p class="mx-auto mt-2 max-w-lg text-sm/6 text-muted-foreground">
            {{ hasAccounts
              ? 'Connected accounts are stored on this device. Add another provider or manage an existing mailbox'
              : 'Choose your provider' }}
          </p>
        </header>

        <FieldError v-if="error" class="mx-auto mt-5 max-w-xl rounded-lg border border-destructive/20 bg-destructive/5 px-3 py-2 text-center">
          {{ error }}
        </FieldError>

        <div v-if="hasAccounts" class="mx-auto mt-8 grid max-w-2xl gap-3">
          <article
            v-for="account in accounts"
            :key="account.id"
            class="flex items-center gap-4 rounded-xl border bg-card px-4 py-3 shadow-sm"
          >
            <div class="grid size-10 shrink-0 place-items-center rounded-xl bg-muted text-sm font-semibold">
              {{ account.mailboxAddress.slice(0, 1).toUpperCase() }}
            </div>
            <div class="min-w-0 flex-1">
              <p class="truncate text-sm font-medium">
                {{ account.displayName }}
              </p>
              <p class="truncate text-xs text-muted-foreground">
                {{ account.mailboxAddress }} · {{ providerLabel(account.provider) }}
              </p>
            </div>
            <span class="rounded-full bg-emerald-500/10 px-2 py-1 text-[11px] font-medium text-emerald-700 dark:text-emerald-300">
              Connected
            </span>
            <Button
              variant="ghost"
              size="icon-sm"
              :disabled="removingId === account.id"
              :aria-label="`Remove ${account.mailboxAddress}`"
              @click="removeAccount(account)"
            >
              <RefreshCw v-if="removingId === account.id" class="animate-spin" />
              <Trash2 v-else />
            </Button>
          </article>
        </div>

        <div class="mx-auto mt-8 grid max-w-xl grid-cols-2 gap-4">
          <button
            type="button"
            class="group flex min-h-40 flex-col items-center justify-center rounded-2xl border bg-card p-5 shadow-sm transition hover:-translate-y-0.5 hover:border-foreground/20 hover:shadow-md focus-visible:ring-3 focus-visible:ring-ring/40 focus-visible:outline-none disabled:cursor-not-allowed disabled:opacity-60"
            :disabled="Boolean(busyProvider)"
            @click="bindOAuth('google')"
          >
            <span class="grid size-14 place-items-center rounded-2xl bg-white shadow-sm ring-1 ring-black/8">
              <svg class="size-8" viewBox="0 0 24 24" aria-hidden="true">
                <path fill="#4285F4" d="M21.6 12.23c0-.71-.06-1.4-.18-2.07H12v3.92h5.38a4.6 4.6 0 0 1-2 3.02v2.54h3.24c1.9-1.75 2.98-4.32 2.98-7.41Z" />
                <path fill="#34A853" d="M12 22c2.7 0 4.98-.9 6.63-2.36l-3.24-2.54c-.9.6-2.05.96-3.39.96-2.61 0-4.82-1.76-5.61-4.13H3.04v2.62A10 10 0 0 0 12 22Z" />
                <path fill="#FBBC05" d="M6.39 13.93A6 6 0 0 1 6.08 12c0-.67.11-1.32.31-1.93V7.45H3.04A10 10 0 0 0 2 12c0 1.61.38 3.14 1.04 4.55l3.35-2.62Z" />
                <path fill="#EA4335" d="M12 5.94c1.47 0 2.79.51 3.83 1.5l2.87-2.87A9.62 9.62 0 0 0 12 2a10 10 0 0 0-8.96 5.45l3.35 2.62C7.18 7.7 9.39 5.94 12 5.94Z" />
              </svg>
            </span>
            <span class="mt-4 text-sm font-semibold">Google</span>
            <span class="mt-1 text-xs text-muted-foreground">
              {{ oauthAvailable.google ? 'Continue with OAuth' : 'OAuth configuration required' }}
            </span>
            <RefreshCw v-if="busyProvider === 'google'" class="mt-3 size-4 animate-spin text-muted-foreground" />
          </button>

          <button
            type="button"
            class="group flex min-h-40 flex-col items-center justify-center rounded-2xl border bg-card p-5 shadow-sm transition hover:-translate-y-0.5 hover:border-foreground/20 hover:shadow-md focus-visible:ring-3 focus-visible:ring-ring/40 focus-visible:outline-none disabled:cursor-not-allowed disabled:opacity-60"
            :disabled="Boolean(busyProvider)"
            @click="bindOAuth('outlook')"
          >
            <span class="relative grid size-14 place-items-center overflow-hidden rounded-2xl bg-[#0a5bd3] shadow-sm ring-1 ring-black/8">
              <span class="absolute inset-y-2 left-2 w-7 rounded-sm bg-[#1473e6]" />
              <span class="absolute right-1 top-3 size-8 rounded-sm bg-[#35a7ff]" />
              <span class="relative z-10 -translate-x-1 text-2xl font-semibold text-white">O</span>
            </span>
            <span class="mt-4 text-sm font-semibold">Outlook</span>
            <span class="mt-1 text-xs text-muted-foreground">
              {{ oauthAvailable.outlook ? 'Continue with OAuth' : 'OAuth configuration required' }}
            </span>
            <RefreshCw v-if="busyProvider === 'outlook'" class="mt-3 size-4 animate-spin text-muted-foreground" />
          </button>
        </div>

        <button
          type="button"
          class="mx-auto mt-5 flex items-center gap-1.5 rounded-lg px-3 py-2 text-sm font-medium text-muted-foreground transition-colors hover:bg-muted hover:text-foreground focus-visible:ring-3 focus-visible:ring-ring/40 focus-visible:outline-none"
          @click="openManual"
        >
          <MoreHorizontal class="size-4" />
          More
        </button>

        <p v-if="!hasAccounts" class="mx-auto mt-5 max-w-lg text-center text-xs/5 text-muted-foreground">
          Credentials remain in encrypted local storage. Fumika never asks for your Google or Microsoft password.
        </p>
      </template>
    </section>

    <Dialog v-model:open="manualOpen">
      <DialogContent class="max-h-[calc(100dvh-2rem)] gap-0 overflow-y-auto p-0 sm:max-w-2xl!">
        <DialogHeader class="border-b p-5 pr-14">
          <DialogTitle>Set up IMAP / SMTP</DialogTitle>
          <DialogDescription>
            Use an app password when your provider supports one. Both servers are verified before the account is saved.
          </DialogDescription>
        </DialogHeader>

        <form class="grid gap-5 p-5" @submit.prevent="bindManual">
          <div class="grid gap-4 sm:grid-cols-2">
            <Field>
              <FieldLabel for="manual-email">
                Email address
              </FieldLabel>
              <Input id="manual-email" v-model="manual.email" type="email" autocomplete="email" required placeholder="you@example.com" />
            </Field>
            <Field>
              <FieldLabel for="manual-name">
                Display name
              </FieldLabel>
              <Input id="manual-name" v-model="manual.displayName" autocomplete="name" placeholder="Optional" />
            </Field>
          </div>

          <Field>
            <FieldLabel for="manual-password">
              Password or app password
            </FieldLabel>
            <Input id="manual-password" v-model="manual.password" type="password" autocomplete="new-password" required />
          </Field>

          <fieldset class="grid gap-4 rounded-xl border p-4">
            <legend class="px-1 text-sm font-semibold">
              Incoming mail (IMAP)
            </legend>
            <div class="grid gap-4 sm:grid-cols-[minmax(0,1fr)_8rem]">
              <Field>
                <FieldLabel for="imap-host">
                  Host
                </FieldLabel>
                <Input id="imap-host" v-model="manual.imapHost" required placeholder="imap.example.com" />
              </Field>
              <Field>
                <FieldLabel for="imap-port">
                  Port
                </FieldLabel>
                <Input id="imap-port" v-model="manual.imapPort" type="number" min="1" max="65535" required />
              </Field>
            </div>
            <Field>
              <FieldLabel for="imap-user">
                Username
              </FieldLabel>
              <Input id="imap-user" v-model="manual.imapUsername" placeholder="Defaults to email address" />
            </Field>
            <Field orientation="horizontal" class="items-center">
              <Checkbox id="imap-secure" v-model="manual.imapSecure" />
              <FieldLabel for="imap-secure">
                Use implicit TLS
              </FieldLabel>
            </Field>
          </fieldset>

          <fieldset class="grid gap-4 rounded-xl border p-4">
            <legend class="px-1 text-sm font-semibold">
              Outgoing mail (SMTP)
            </legend>
            <div class="grid gap-4 sm:grid-cols-[minmax(0,1fr)_8rem]">
              <Field>
                <FieldLabel for="smtp-host">
                  Host
                </FieldLabel>
                <Input id="smtp-host" v-model="manual.smtpHost" required placeholder="smtp.example.com" />
              </Field>
              <Field>
                <FieldLabel for="smtp-port">
                  Port
                </FieldLabel>
                <Input id="smtp-port" v-model="manual.smtpPort" type="number" min="1" max="65535" required />
              </Field>
            </div>
            <Field>
              <FieldLabel for="smtp-user">
                Username
              </FieldLabel>
              <Input id="smtp-user" v-model="manual.smtpUsername" placeholder="Defaults to email address" />
            </Field>
            <Field orientation="horizontal" class="items-center">
              <Checkbox id="smtp-secure" v-model="manual.smtpSecure" />
              <FieldLabel for="smtp-secure">
                Use implicit TLS
              </FieldLabel>
            </Field>
          </fieldset>

          <FieldError v-if="error">
            {{ error }}
          </FieldError>

          <DialogFooter class="gap-2 border-t pt-4">
            <Button type="button" variant="ghost" :disabled="manualBusy" @click="manualOpen = false">
              Cancel
            </Button>
            <Button type="submit" :disabled="manualBusy">
              <RefreshCw v-if="manualBusy" class="animate-spin" />
              <Plus v-else />
              Verify and connect
            </Button>
          </DialogFooter>
        </form>
      </DialogContent>
    </Dialog>
  </div>
</template>
