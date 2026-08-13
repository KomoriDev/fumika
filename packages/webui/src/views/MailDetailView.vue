<script setup lang="ts">
import type { MailMessageDetail, MailMessageSummary } from '@fumika/state'
import { Badge } from '@fumika/ui/badge'
import { Button } from '@fumika/ui/button'
import { ArrowLeft, Download, MailOpen, Paperclip, RefreshCw, Star, TriangleAlert } from '@lucide/vue'
import { computed, ref } from 'vue'
import { onBeforeRouteLeave, useRoute, useRouter } from 'vue-router'
import MailHtmlBody from '@/components/mail/MailHtmlBody.vue'
import SenderAvatar from '@/components/mail/SenderAvatar.vue'
import { useInject } from '@/context'
import { formatMailDate, senderName } from '@/mail'

const route = useRoute()
const router = useRouter()
const link = useInject('link')
const mailStore = useInject('mailStore')
const messageId = computed(() => typeof route.params.id === 'string' ? route.params.id : '')
const cachedSummary = computed(() => mailStore.value?.findMessage(messageId.value))
const message = ref<MailMessageDetail>()
const displaySummary = computed(() => message.value ?? cachedSummary.value)
const loading = ref(true)
const busy = ref(false)
const leaving = ref(false)
const error = ref('')
const recipientText = computed(() => formatAddresses(message.value?.to ?? []))
const ccText = computed(() => formatAddresses(message.value?.cc ?? []))

void loadMessage()
onBeforeRouteLeave(() => {
  leaving.value = true
})

async function loadMessage(): Promise<void> {
  loading.value = true
  error.value = ''
  try {
    if (!link.value)
      throw new Error('Mailbox service is unavailable.')
    message.value = await link.value.action('mail-message.get', { id: messageId.value }, { timeout: 10_000 })
    mailStore.value?.replaceMessage(message.value)
  }
  catch (reason) {
    error.value = messageOf(reason)
  }
  finally {
    loading.value = false
  }
}

async function toggleStar(): Promise<void> {
  if (!message.value || !link.value)
    return
  busy.value = true
  error.value = ''
  try {
    const updated = await link.value.action('mail-message.set-flags', {
      id: message.value.id,
      starred: !message.value.starred,
    })
    applySummary(updated)
  }
  catch (reason) {
    error.value = messageOf(reason)
  }
  finally {
    busy.value = false
  }
}

function applySummary(summary: MailMessageSummary): void {
  if (message.value)
    Object.assign(message.value, summary)
  mailStore.value?.replaceMessage(summary)
}

function goBack(): void {
  if (leaving.value)
    return
  leaving.value = true
  if (window.history.length > 1) {
    router.back()
    return
  }
  const from = typeof route.query.from === 'string' ? route.query.from : '/inbox'
  void router.replace(from.startsWith('/') ? from : '/inbox')
}

function formatAddresses(addresses: MailMessageDetail['to']): string {
  return addresses.map(address => address.name ? `${address.name} <${address.address}>` : address.address).join(', ')
}

function formatBytes(bytes: number): string {
  if (bytes < 1024)
    return `${bytes} B`
  if (bytes < 1024 * 1024)
    return `${(bytes / 1024).toFixed(1)} KB`
  return `${(bytes / 1024 / 1024).toFixed(1)} MB`
}

function messageOf(reason: unknown): string {
  return reason instanceof Error ? reason.message : String(reason)
}
</script>

<template>
  <section class="flex min-h-full flex-col bg-background">
    <header class="sticky top-0 z-10 flex items-center justify-between gap-3 border-b bg-background/95 px-4 py-3 backdrop-blur-sm">
      <div class="flex min-w-0 items-center gap-2">
        <Button variant="ghost" size="icon-sm" :disabled="leaving" aria-label="Back to mail list" @click="goBack">
          <ArrowLeft />
        </Button>
        <div class="min-w-0">
          <p class="truncate text-sm font-medium">
            {{ displaySummary?.subject || 'Mail detail' }}
          </p>
          <p v-if="displaySummary" class="truncate text-[11px] text-muted-foreground">
            {{ displaySummary.mailboxAddress }}
          </p>
        </div>
      </div>
      <div class="flex shrink-0 items-center gap-1">
        <Button variant="ghost" size="icon-sm" :disabled="busy || !message" :aria-label="message?.starred ? 'Remove star' : 'Star message'" @click="toggleStar">
          <Star :class="message?.starred ? 'text-amber-500' : ''" :fill="message?.starred ? 'currentColor' : 'none'" />
        </Button>
        <Button variant="ghost" size="icon-sm" :disabled="loading" aria-label="Reload message" @click="loadMessage">
          <RefreshCw :class="loading ? 'animate-spin' : ''" />
        </Button>
      </div>
    </header>

    <div v-if="loading" class="grid min-h-105 place-items-center text-sm text-muted-foreground">
      <span class="flex items-center gap-2">
        <RefreshCw class="size-4 animate-spin" />
        Loading message…
      </span>
    </div>

    <div v-else-if="error && !message" class="grid min-h-105 place-items-center px-6 text-center">
      <div class="max-w-sm">
        <span class="mx-auto grid size-12 place-items-center rounded-sm bg-destructive/10 text-destructive">
          <TriangleAlert class="size-5" />
        </span>
        <h1 class="mt-4 text-base font-semibold">
          Unable to open this message
        </h1>
        <p class="mt-1 text-sm/6 text-muted-foreground">
          {{ error }}
        </p>
        <Button class="mt-5" variant="outline" @click="goBack">
          Back to mail
        </Button>
      </div>
    </div>

    <article v-else-if="message" class="flex min-h-0 flex-1 flex-col">
      <div v-if="error" class="mx-auto w-full max-w-5xl px-5 pt-5 sm:px-8">
        <div class="mb-1 flex items-start gap-2 rounded-sm border border-destructive/20 bg-destructive/5 px-3 py-2 text-xs text-destructive">
          <TriangleAlert class="mt-0.5 size-3.5 shrink-0" />
          {{ error }}
        </div>
      </div>

      <header class="mx-auto w-full max-w-5xl px-5 py-6 sm:px-8">
        <div class="flex flex-wrap items-start justify-between gap-4">
          <div class="min-w-0 flex-1">
            <div class="flex flex-wrap items-center gap-2">
              <h1 class="wrap-break-word text-xl font-semibold tracking-tight text-foreground sm:text-2xl">
                {{ message.subject }}
              </h1>
              <Badge variant="secondary">
                {{ message.accountName }}
              </Badge>
            </div>
            <p class="mt-2 text-xs text-muted-foreground">
              {{ formatMailDate(message.receivedAt) }}
            </p>
          </div>
          <Badge v-if="!message.unread" variant="outline" class="gap-1.5">
            <MailOpen class="size-3" />
            Read
          </Badge>
        </div>

        <div class="mt-5 flex items-start gap-3 border-t pt-5">
          <SenderAvatar
            :name="senderName(message.sender)"
            :address="message.sender.address"
            :src="message.senderAvatarUrl"
            size="lg"
          />
          <div class="min-w-0 flex-1 text-sm">
            <p class="wrap-break-word font-semibold text-foreground">
              {{ senderName(message.sender) }}
              <span class="font-normal text-muted-foreground">&lt;{{ message.sender.address }}&gt;</span>
            </p>
            <p class="mt-1 wrap-break-word text-xs text-muted-foreground">
              To: {{ recipientText || message.mailboxAddress }}
            </p>
            <p v-if="ccText" class="mt-1 wrap-break-word text-xs text-muted-foreground">
              Cc: {{ ccText }}
            </p>
          </div>
        </div>
      </header>

      <section
        v-if="message.html"
        class="mx-auto w-full max-w-5xl px-5 pb-8 sm:px-8"
      >
        <MailHtmlBody :html="message.html" />
      </section>
      <section v-else class="mx-auto w-full max-w-5xl px-5 pb-8 sm:px-8">
        <div class="whitespace-pre-wrap wrap-break-word text-[15px]/7 text-foreground">
          {{ message.text || 'This message has no readable text body.' }}
        </div>
      </section>

      <section v-if="message.attachments.length" class="mx-auto w-full max-w-5xl px-5 pb-8 sm:px-8">
        <h2 class="flex items-center gap-2 border-t pt-6 text-sm font-semibold">
          <Paperclip class="size-4" />
          {{ message.attachments.length }} {{ message.attachments.length === 1 ? 'attachment' : 'attachments' }}
        </h2>
        <div class="mt-3 grid gap-2 sm:grid-cols-2">
          <div v-for="attachment in message.attachments" :key="`${attachment.filename}:${attachment.size}`" class="flex items-center gap-3 rounded-sm border p-3">
            <span class="grid size-9 shrink-0 place-items-center rounded-sm bg-muted text-muted-foreground">
              <Download class="size-4" />
            </span>
            <div class="min-w-0">
              <p class="truncate text-sm font-medium">
                {{ attachment.filename }}
              </p>
              <p class="truncate text-xs text-muted-foreground">
                {{ attachment.contentType }} · {{ formatBytes(attachment.size) }}
              </p>
            </div>
          </div>
        </div>
        <p class="mt-3 text-xs text-muted-foreground">
          Attachment download is not exposed yet; metadata is preserved from the received message.
        </p>
      </section>
    </article>
  </section>
</template>
