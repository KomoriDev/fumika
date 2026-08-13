import type { MailFolder as SharedMailFolder } from '@fumika/state'

export const mailFolders = [
  'inbox',
  'starred',
  'snoozed',
  'sent',
  'drafts',
  'archive',
  'trash',
] as const satisfies readonly SharedMailFolder[]

export type MailFolder = typeof mailFolders[number]

export const mailFolderPattern = mailFolders.join('|')

export const mailFolderLabels: Record<MailFolder, string> = {
  inbox: 'Inbox',
  starred: 'Starred',
  snoozed: 'Snoozed',
  sent: 'Sent',
  drafts: 'Drafts',
  archive: 'Archive',
  trash: 'Trash',
}

export const mailFolderDescriptions: Record<MailFolder, string> = {
  inbox: 'Messages from every connected mailbox.',
  starred: 'Important messages saved across your accounts.',
  snoozed: 'Messages scheduled to return later.',
  sent: 'Messages sent from every connected mailbox.',
  drafts: 'Unfinished messages waiting in connected accounts.',
  archive: 'Archived messages from every connected mailbox.',
  trash: 'Deleted messages from every connected mailbox.',
}

export function resolveMailFolder(value: unknown): MailFolder {
  return mailFolders.find(folder => folder === value) ?? 'inbox'
}

export function senderName(sender: { name?: string, address: string }): string {
  return sender.name?.trim() || sender.address
}

export function initials(value: string): string {
  const normalized = value.trim()
  if (!normalized)
    return '?'
  const words = normalized.split(/[\s@._-]+/).filter(Boolean)
  return (words.length > 1 ? `${words[0]![0]}${words.at(-1)![0]}` : normalized.slice(0, 2)).toUpperCase()
}

export function avatarClass(seed: string): string {
  const palette = [
    'bg-violet-100 text-violet-700 dark:bg-violet-950 dark:text-violet-300',
    'bg-sky-100 text-sky-700 dark:bg-sky-950 dark:text-sky-300',
    'bg-emerald-100 text-emerald-700 dark:bg-emerald-950 dark:text-emerald-300',
    'bg-amber-100 text-amber-700 dark:bg-amber-950 dark:text-amber-300',
    'bg-rose-100 text-rose-700 dark:bg-rose-950 dark:text-rose-300',
  ]
  let hash = 0
  for (const char of seed)
    hash = (hash * 31 + char.charCodeAt(0)) >>> 0
  return palette[hash % palette.length]!
}

export function formatMailTime(timestamp: number): string {
  const date = new Date(timestamp)
  const now = new Date()
  if (date.toDateString() === now.toDateString())
    return new Intl.DateTimeFormat(undefined, { hour: '2-digit', minute: '2-digit' }).format(date)
  if (date.getFullYear() === now.getFullYear())
    return new Intl.DateTimeFormat(undefined, { month: 'short', day: 'numeric' }).format(date)
  return new Intl.DateTimeFormat(undefined, { year: 'numeric', month: 'short', day: 'numeric' }).format(date)
}

export function formatMailDate(timestamp: number): string {
  return new Intl.DateTimeFormat(undefined, {
    dateStyle: 'medium',
    timeStyle: 'short',
  }).format(new Date(timestamp))
}

export async function gravatarAvatarUrl(address: string): Promise<string | undefined> {
  const email = address.trim().toLowerCase()
  if (!email.includes('@'))
    return undefined
  const digest = await crypto.subtle.digest('SHA-256', new TextEncoder().encode(email))
  const hash = [...new Uint8Array(digest)].map(byte => byte.toString(16).padStart(2, '0')).join('')
  return `https://www.gravatar.com/avatar/${hash}?d=404&s=128`
}

export function unavatarUrl(address: string): string | undefined {
  const email = address.trim().toLowerCase()
  if (!email.includes('@'))
    return undefined
  return `https://unavatar.io/${encodeURIComponent(email)}?fallback=false`
}
