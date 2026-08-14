import type { MailAddress, MailFolder } from '@fumika/state'

export interface QueryableMailMessage {
  folder: Exclude<MailFolder, 'starred' | 'snoozed'>
  starred: boolean
  unread: boolean
  sender: MailAddress
  to: MailAddress[]
  cc: MailAddress[]
  subject: string
  preview: string
}

export function matchesMessageQuery(message: QueryableMailMessage, folder: MailFolder, query: string): boolean {
  if (!matchesFolder(message, folder))
    return false
  if (!query)
    return true
  return messageSearchText(message).includes(query)
}

export function selectUnreadMessages<T extends QueryableMailMessage>(
  messages: readonly T[],
  folder: MailFolder,
  query: string,
): T[] {
  return messages.filter(message => message.unread && matchesMessageQuery(message, folder, query))
}

function matchesFolder(message: QueryableMailMessage, folder: MailFolder): boolean {
  if (folder === 'starred')
    return message.starred && message.folder !== 'trash'
  if (folder === 'snoozed')
    return false
  return message.folder === folder
}

function messageSearchText(message: QueryableMailMessage): string {
  const addresses = [message.sender, ...message.to, ...message.cc]
    .map(address => `${address.name ?? ''} ${address.address}`)
    .join(' ')
  return `${addresses} ${message.subject} ${message.preview}`.toLowerCase()
}
