import type { MailMessageSummary } from '@fumika/state'

export interface MailNotificationContent {
  id: string
  groupId: string
  groupTitle: string
  title: string
  subtitle: string
  body: string
}

export function selectNotifiableMessages(messages: MailMessageSummary[], enabled: boolean): MailMessageSummary[] {
  return enabled ? messages.filter(message => message.folder === 'inbox' && message.unread) : []
}

export function selectSessionNotifications<T extends { folder: string, unread: boolean, uid: number }>(
  messages: T[],
  seenUid: number | undefined,
): T[] {
  if (seenUid === undefined)
    return []
  return messages.filter(message => message.folder === 'inbox' && message.unread && message.uid > seenUid)
}

export function createNotificationContent(message: MailMessageSummary): MailNotificationContent {
  const sender = message.sender.name?.trim() || message.sender.address
  return {
    id: message.id,
    groupId: message.accountId,
    groupTitle: message.accountName || message.mailboxAddress,
    title: message.subject || '(No subject)',
    subtitle: sender,
    body: message.preview ? `${sender}: ${message.preview}` : sender,
  }
}
