<script setup lang="ts">
import { Avatar, AvatarFallback } from '@fumika/ui/avatar'
import { Badge } from '@fumika/ui/badge'
import { Button } from '@fumika/ui/button'
import { CheckCheck, Inbox, MailSearch, Paperclip, Star } from '@lucide/vue'
import { computed, reactive } from 'vue'
import { useRoute, useRouter } from 'vue-router'
import { useInject } from '@/context'
import {
  demoMails,
  mailFolderDescriptions,
  mailFolderLabels,
  resolveMailFolder,
} from '@/mail'

const route = useRoute()
const router = useRouter()
const appState = useInject('appState')
const preferences = computed(() => appState.value?.data.app.preferences ?? {
  messagePreviews: true,
  compactDensity: false,
  desktopNotifications: true,
})
const mails = reactive(demoMails.map(mail => ({
  ...mail,
  labels: [...mail.labels],
})))

const activeFolder = computed(() => resolveMailFolder(route.params.folder))
const searchTerm = computed(() => typeof route.query.q === 'string' ? route.query.q.trim().toLowerCase() : '')
const activeLabel = computed(() => {
  const label = route.query.label
  if (label === 'work' || label === 'personal' || label === 'receipts')
    return label
  return undefined
})

const labelTitle = computed(() => activeLabel.value
  ? activeLabel.value.charAt(0).toUpperCase() + activeLabel.value.slice(1)
  : undefined)

function matchesFolder(mail: typeof mails[number]) {
  const folder = activeFolder.value
  if (folder === 'starred')
    return mail.starred && mail.folder !== 'trash'
  if (folder === 'snoozed')
    return mail.snoozed && mail.folder === 'inbox'
  if (folder === 'inbox')
    return mail.folder === 'inbox' && !mail.snoozed
  return mail.folder === folder
}

const visibleMails = computed(() => mails.filter((mail) => {
  if (!matchesFolder(mail))
    return false
  if (activeLabel.value && !mail.labels.includes(activeLabel.value))
    return false
  if (!searchTerm.value)
    return true

  const searchableText = `${mail.sender} ${mail.subject} ${mail.preview}`.toLowerCase()
  return searchableText.includes(searchTerm.value)
}))

const unreadCount = computed(() => visibleMails.value.filter(mail => mail.unread).length)
const folderTitle = computed(() => mailFolderLabels[activeFolder.value])
const folderDescription = computed(() => mailFolderDescriptions[activeFolder.value])

function toggleStar(mail: typeof mails[number]) {
  mail.starred = !mail.starred
}

function markRead(mail: typeof mails[number]) {
  mail.unread = false
}

function markAllRead() {
  for (const mail of visibleMails.value)
    mail.unread = false
}

function clearLabel() {
  const query = { ...route.query }
  delete query.label
  void router.replace({ query })
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
            <Badge v-if="labelTitle" variant="secondary" class="gap-1.5">
              {{ labelTitle }}
              <button type="button" class="rounded-sm text-muted-foreground hover:text-foreground" aria-label="Clear label filter" @click="clearLabel">
                ×
              </button>
            </Badge>
          </div>
          <p class="mt-1 text-sm text-muted-foreground">
            {{ folderDescription }}
          </p>
        </div>

        <Button
          variant="ghost"
          size="sm"
          class="shrink-0 gap-2"
          :disabled="unreadCount === 0"
          @click="markAllRead"
        >
          <CheckCheck />
          Mark all read
        </Button>
      </div>

      <div class="mt-4 flex items-center justify-between gap-4 text-xs text-muted-foreground">
        <span>{{ visibleMails.length }} {{ visibleMails.length === 1 ? 'message' : 'messages' }}</span>
        <span v-if="unreadCount">{{ unreadCount }} unread</span>
      </div>
    </header>

    <div v-if="visibleMails.length" class="divide-y divide-border/70">
      <article
        v-for="mail in visibleMails"
        :key="mail.id"
        class="group grid cursor-default grid-cols-[28px_36px_minmax(120px,0.42fr)_minmax(220px,1fr)_78px] items-center gap-3 px-5 transition-colors"
        :class="[
          mail.unread ? 'bg-primary/5 hover:bg-primary/8' : 'bg-background hover:bg-muted/50',
          preferences.compactDensity ? 'py-2' : 'py-3',
        ]"
        @click="markRead(mail)"
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
          <AvatarFallback class="text-[10px] font-semibold" :class="mail.avatarClass">
            {{ mail.initials }}
          </AvatarFallback>
        </Avatar>

        <div class="min-w-0">
          <p class="truncate text-sm" :class="mail.unread ? 'font-semibold text-foreground' : 'font-medium text-foreground/80'">
            {{ mail.sender }}
          </p>
        </div>

        <div class="min-w-0">
          <div class="flex min-w-0 items-center gap-2">
            <p class="truncate text-sm" :class="mail.unread ? 'font-semibold text-foreground' : 'font-medium text-foreground/85'">
              {{ mail.subject }}
            </p>
            <Paperclip v-if="mail.attachment" class="size-3.5 shrink-0 text-muted-foreground" aria-label="Has attachment" />
          </div>
          <div v-if="preferences.messagePreviews" class="mt-0.5 flex min-w-0 items-center gap-2">
            <p class="truncate text-xs text-muted-foreground">
              {{ mail.preview }}
            </p>
            <span
              v-for="label in mail.labels"
              :key="label"
              class="hidden shrink-0 rounded-full bg-muted px-1.5 py-0.5 text-[10px] capitalize text-muted-foreground xl:inline"
            >
              {{ label }}
            </span>
          </div>
        </div>

        <time class="text-right text-xs" :class="mail.unread ? 'font-semibold text-foreground' : 'text-muted-foreground'">
          {{ mail.time }}
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
        <p class="mt-1 text-sm/6  text-muted-foreground">
          {{ searchTerm ? 'Try another sender, subject, or keyword.' : 'New messages will appear here when they arrive.' }}
        </p>
      </div>
    </div>
  </section>
</template>
