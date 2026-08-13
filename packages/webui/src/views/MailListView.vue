<script setup lang="ts">
import type { MailMessageSummary } from '@fumika/state'
import { Avatar, AvatarFallback, AvatarImage } from '@fumika/ui/avatar'
import { Badge } from '@fumika/ui/badge'
import { Button } from '@fumika/ui/button'
import { CheckCheck, Inbox, MailSearch, Paperclip, RefreshCw, Star, TriangleAlert } from '@lucide/vue'
import { computed, onMounted, ref, watch } from 'vue'
import { useRoute, useRouter } from 'vue-router'
import { useInject } from '@/context'
import {
  avatarClass,
  formatMailTime,
  initials,
  mailFolderDescriptions,
  mailFolderLabels,
  resolveMailFolder,
  senderName,
} from '@/mail'

const route = useRoute()
const router = useRouter()
const link = useInject('link')
const appState = useInject('appState')
const mailStore = useInject('mailStore')
const preferences = computed(() => appState.value?.data.app.preferences ?? {
  messagePreviews: true,
  compactDensity: false,
  desktopNotifications: true,
})
const loading = ref(false)
const refreshing = ref(false)
const markingRead = ref(false)
const error = ref('')

const activeFolder = computed(() => resolveMailFolder(route.params.folder))
const searchTerm = computed(() => typeof route.query.q === 'string' ? route.query.q.trim() : '')
const query = computed(() => ({ folder: activeFolder.value, query: searchTerm.value || undefined, limit: 200 }))
const mails = computed(() => mailStore.value?.get(query.value) ?? [])
const accountErrors = computed(() => mailStore.value?.errors ?? [])
const unreadCount = computed(() => {
  if (!searchTerm.value && activeFolder.value === 'inbox')
    return mailStore.value?.unreadCounts.inbox ?? 0
  return mails.value.filter(mail => mail.unread).length
})
const folderTitle = computed(() => mailFolderLabels[activeFolder.value])
const folderDescription = computed(() => mailFolderDescriptions[activeFolder.value])

onMounted(() => {
  if (!mailStore.value?.has(query.value))
    void loadMessages(false)
  mailStore.value?.refreshOnce(query.value)
})

watch([activeFolder, searchTerm], () => void loadMessages(false))

async function loadMessages(refresh: boolean): Promise<void> {
  if (refresh)
    refreshing.value = true
  else if (!mailStore.value?.has(query.value))
    loading.value = true
  error.value = ''
  try {
    if (!mailStore.value)
      throw new Error('Mailbox service is unavailable.')
    await mailStore.value.load(query.value, refresh)
  }
  catch (reason) {
    error.value = messageOf(reason)
  }
  finally {
    loading.value = false
    refreshing.value = false
  }
}

async function toggleStar(mail: MailMessageSummary): Promise<void> {
  const previous = mail.starred
  mail.starred = !mail.starred
  try {
    if (!link.value)
      throw new Error('Mailbox service is unavailable.')
    const updated = await link.value.action('mail-message.set-flags', { id: mail.id, starred: mail.starred })
    mailStore.value?.replaceMessage(updated)
  }
  catch (reason) {
    mail.starred = previous
    error.value = messageOf(reason)
  }
}

async function markAllRead(): Promise<void> {
  const unread = mails.value.filter(mail => mail.unread)
  if (!unread.length || !link.value || markingRead.value)
    return
  markingRead.value = true
  error.value = ''
  try {
    const reply = await link.value.action('mail-message.mark-read', { ids: unread.map(mail => mail.id) })
    for (const message of reply.messages)
      mailStore.value?.replaceMessage(message)
  }
  catch (reason) {
    error.value = messageOf(reason)
  }
  finally {
    markingRead.value = false
  }
}

function openMessage(mail: MailMessageSummary): void {
  void router.push({
    path: `/mail/${encodeURIComponent(mail.id)}`,
    query: { from: route.fullPath },
  })
}

function messageOf(reason: unknown): string {
  return reason instanceof Error ? reason.message : String(reason)
}
</script>

<template>
  <section class="min-h-full bg-background">
    <header class="sticky top-0 z-10 border-b bg-background/95 px-5 py-4 backdrop-blur-sm">
      <div class="flex items-start justify-between gap-4">
        <div class="min-w-0">
          <div class="flex flex-wrap items-center gap-2">
            <h1 class="text-xl font-semibold tracking-tight text-foreground">
              {{ folderTitle }}
            </h1>
            <Badge variant="secondary">
              All accounts
            </Badge>
          </div>
          <p class="mt-1 text-sm text-muted-foreground">
            {{ folderDescription }}
          </p>
        </div>

        <div class="flex shrink-0 items-center gap-1">
          <Button variant="ghost" size="sm" class="gap-2" :disabled="refreshing" @click="loadMessages(true)">
            <RefreshCw :class="refreshing ? 'animate-spin' : ''" />
            Refresh
          </Button>
          <Button variant="ghost" size="sm" class="gap-2" :disabled="unreadCount === 0 || markingRead" @click="markAllRead">
            <CheckCheck />
            Mark all read
          </Button>
        </div>
      </div>

      <div class="mt-4 flex items-center justify-between gap-4 text-xs text-muted-foreground">
        <span>{{ mails.length }} {{ mails.length === 1 ? 'message' : 'messages' }}</span>
        <span v-if="unreadCount">{{ unreadCount }} unread</span>
      </div>

      <div v-if="error" class="mt-3 flex items-start gap-2 rounded-lg border border-destructive/20 bg-destructive/5 px-3 py-2 text-xs text-destructive">
        <TriangleAlert class="mt-0.5 size-3.5 shrink-0" />
        {{ error }}
      </div>
      <div v-else-if="accountErrors.length" class="mt-3 flex items-start gap-2 rounded-lg border border-amber-500/20 bg-amber-500/5 px-3 py-2 text-xs text-amber-700 dark:text-amber-300">
        <TriangleAlert class="mt-0.5 size-3.5 shrink-0" />
        <span>{{ accountErrors.join(' · ') }}</span>
      </div>
    </header>

    <div v-if="loading" class="grid min-h-105 place-items-center text-sm text-muted-foreground">
      <span class="flex items-center gap-2">
        <RefreshCw class="size-4 animate-spin" />
        Receiving mail from connected accounts…
      </span>
    </div>

    <div v-else-if="mails.length" class="divide-y divide-border/70">
      <article
        v-for="mail in mails"
        :key="mail.id"
        tabindex="0"
        role="link"
        class="group grid cursor-pointer grid-cols-[28px_36px_minmax(120px,0.42fr)_minmax(220px,1fr)_96px] items-center gap-3 px-5 outline-none transition-colors focus-visible:bg-muted/70"
        :class="[
          mail.unread ? 'bg-primary/5 hover:bg-primary/8' : 'bg-background hover:bg-muted/50',
          preferences.compactDensity ? 'py-2' : 'py-3',
        ]"
        @click="openMessage(mail)"
        @keydown.enter="openMessage(mail)"
      >
        <button
          type="button"
          class="grid size-7 place-items-center rounded-md text-muted-foreground transition-colors hover:bg-black/6 hover:text-amber-500"
          :class="mail.starred ? 'text-amber-500' : ''"
          :aria-label="mail.starred ? `Remove star from ${mail.subject}` : `Star ${mail.subject}`"
          @click.stop="toggleStar(mail)"
        >
          <Star class="size-4" :fill="mail.starred ? 'currentColor' : 'none'" />
        </button>

        <Avatar size="sm">
          <AvatarImage v-if="mail.accountAvatarUrl" :src="mail.accountAvatarUrl" :alt="mail.accountName" />
          <AvatarFallback class="text-[10px] font-semibold" :class="avatarClass(mail.sender.address)">
            {{ initials(senderName(mail.sender)) }}
          </AvatarFallback>
        </Avatar>

        <div class="min-w-0">
          <p class="truncate text-sm" :class="mail.unread ? 'font-semibold text-foreground' : 'font-medium text-foreground/80'">
            {{ senderName(mail.sender) }}
          </p>
          <p class="truncate text-[11px] text-muted-foreground">
            {{ mail.mailboxAddress }}
          </p>
        </div>

        <div class="min-w-0">
          <div class="flex min-w-0 items-center gap-2">
            <p class="truncate text-sm" :class="mail.unread ? 'font-semibold text-foreground' : 'font-medium text-foreground/85'">
              {{ mail.subject }}
            </p>
            <Paperclip v-if="mail.hasAttachments" class="size-3.5 shrink-0 text-muted-foreground" aria-label="Has attachment" />
          </div>
          <p v-if="preferences.messagePreviews" class="mt-0.5 truncate text-xs text-muted-foreground">
            {{ mail.preview || 'No text preview available' }}
          </p>
        </div>

        <time class="text-right text-xs" :class="mail.unread ? 'font-semibold text-foreground' : 'text-muted-foreground'">
          {{ formatMailTime(mail.receivedAt) }}
        </time>
      </article>
    </div>

    <div v-else class="grid min-h-105 place-items-center px-6 text-center">
      <div class="max-w-sm">
        <span class="mx-auto grid size-12 place-items-center rounded-2xl bg-muted text-muted-foreground">
          <MailSearch v-if="searchTerm" class="size-5" />
          <Inbox v-else class="size-5" />
        </span>
        <h2 class="mt-4 text-base font-semibold">
          {{ searchTerm ? 'No matching mail' : `Nothing in ${folderTitle.toLowerCase()}` }}
        </h2>
        <p class="mt-1 text-sm/6 text-muted-foreground">
          {{ searchTerm ? 'Try another sender, subject, or keyword.' : 'New messages from every connected account will appear here.' }}
        </p>
      </div>
    </div>
  </section>
</template>
