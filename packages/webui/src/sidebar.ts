import type { Component } from 'vue'
import type { MailFolder } from './mail'
import { DEFAULT_SIDEBAR_SHORTCUTS } from '@fumika/state'
import { Archive, Clock3, FileText, Inbox, Send, Star, Trash2 } from '@lucide/vue'
import { mailFolderLabels, mailFolders } from './mail'

export interface SidebarMailbox {
  readonly folder: MailFolder
  readonly label: string
  readonly count: number
  readonly icon: Component
}

export type SidebarShortcutFolders = [MailFolder, MailFolder, MailFolder, MailFolder]

const mailboxCounts: Record<MailFolder, number> = {
  inbox: 7,
  starred: 5,
  snoozed: 2,
  sent: 0,
  drafts: 2,
  archive: 0,
  trash: 0,
}

const mailboxIcons: Record<MailFolder, Component> = {
  inbox: Inbox,
  starred: Star,
  snoozed: Clock3,
  sent: Send,
  drafts: FileText,
  archive: Archive,
  trash: Trash2,
}

export const sidebarMailboxes: readonly SidebarMailbox[] = mailFolders.map(folder => ({
  folder,
  label: mailFolderLabels[folder],
  count: mailboxCounts[folder],
  icon: mailboxIcons[folder],
}))

export function getSidebarMailbox(folder: MailFolder): SidebarMailbox {
  return sidebarMailboxes.find(item => item.folder === folder)!
}

export function isMailFolder(value: unknown): value is MailFolder {
  return typeof value === 'string' && (mailFolders as readonly string[]).includes(value)
}

export function resolveSidebarShortcuts(value: unknown): SidebarShortcutFolders {
  const folders: MailFolder[] = []

  if (Array.isArray(value)) {
    for (const folder of value)
      appendShortcut(folders, folder)
  }

  for (const folder of DEFAULT_SIDEBAR_SHORTCUTS)
    appendShortcut(folders, folder)

  for (const folder of mailFolders)
    appendShortcut(folders, folder)

  return [folders[0], folders[1], folders[2], folders[3]]
}

function appendShortcut(target: MailFolder[], value: unknown): void {
  if (target.length < 4 && isMailFolder(value) && !target.includes(value))
    target.push(value)
}
