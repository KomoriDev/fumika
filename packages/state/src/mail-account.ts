import type { Link } from '@fumika/link'

export type MailFolder = 'inbox' | 'starred' | 'snoozed' | 'sent' | 'drafts' | 'archive' | 'trash'

export interface MailAddress {
  name?: string
  address: string
}

export interface MailMessageSummary {
  id: string
  accountId: string
  mailboxAddress: string
  accountName: string
  accountAvatarUrl?: string
  folder: Exclude<MailFolder, 'starred' | 'snoozed'>
  sender: MailAddress
  senderAvatarUrl?: string
  subject: string
  preview: string
  receivedAt: number
  unread: boolean
  starred: boolean
  hasAttachments: boolean
}

export interface MailAttachment {
  filename: string
  contentType: string
  size: number
}

export interface MailMessageDetail extends MailMessageSummary {
  messageId?: string
  to: MailAddress[]
  cc: MailAddress[]
  replyTo: MailAddress[]
  text: string
  html?: string
  attachments: MailAttachment[]
}

export interface MailMessageListPayload {
  folder?: MailFolder
  query?: string
  limit?: number
  refresh?: boolean
}

export interface MailMessageListReply {
  messages: MailMessageSummary[]
  refreshedAt: number
  errors: Array<{ accountId: string, message: string }>
  counts: Record<MailFolder, number>
  unreadCounts: Record<MailFolder, number>
}

export interface MailMessageGetPayload {
  id: string
}

export interface MailMessageSetFlagsPayload {
  id: string
  unread?: boolean
  starred?: boolean
}

export interface MailMessagesMarkReadPayload {
  folder: MailFolder
  query?: string
  limit?: number
}

export interface MailMessagesMarkReadReply {
  updated: number
  unreadCounts: Record<MailFolder, number>
}

export interface MailMessagesChangedEvent {
  accountIds: string[]
  refreshedAt: number
}

export type MailProvider = 'google' | 'outlook' | 'imap-smtp'
export type MailAuthType = 'oauth2' | 'password'
export type MailAccountStatus = 'active' | 'reauth-required' | 'disabled' | 'error'

export interface MailServerConfig {
  host: string
  port: number
  secure: boolean
  username: string
}

export interface MailAccount {
  id: string
  provider: MailProvider
  providerAccountId: string
  mailboxAddress: string
  displayName: string
  avatarUrl?: string
  authType: MailAuthType
  status: MailAccountStatus
  grantedScopes: string[]
  imap: MailServerConfig
  smtp: MailServerConfig
  lastVerifiedAt: number
  createdAt: number
  updatedAt: number
}

export interface MailAccountSummary {
  id: string
  provider: MailProvider
  mailboxAddress: string
  displayName: string
  avatarUrl?: string
  status: MailAccountStatus
  lastVerifiedAt: number
}

export interface MailAccountListReply {
  accounts: MailAccountSummary[]
  oauth: {
    google: boolean
    outlook: boolean
  }
}

export interface MailAccountOAuthPayload {
  provider: 'google' | 'outlook'
}

export interface MailAccountManualPayload {
  email: string
  displayName?: string
  password: string
  imap: {
    host: string
    port: number
    secure: boolean
    username?: string
  }
  smtp: {
    host: string
    port: number
    secure: boolean
    username?: string
  }
}

export interface MailAccountRemovePayload {
  id: string
}

export interface MailAccountChangedEvent {
  accounts: MailAccountSummary[]
}

type ListMailMessagesAction = Link.Action<MailMessageListPayload | void, MailMessageListReply>
type GetMailMessageAction = Link.Action<MailMessageGetPayload, MailMessageDetail>
type SetMailMessageFlagsAction = Link.Action<MailMessageSetFlagsPayload, MailMessageSummary>
type MarkMailMessagesReadAction = Link.Action<MailMessagesMarkReadPayload, MailMessagesMarkReadReply>
type ListMailAccountsAction = Link.Action<void, MailAccountListReply>
type BindOAuthMailAccountAction = Link.Action<MailAccountOAuthPayload, MailAccountSummary>
type BindManualMailAccountAction = Link.Action<MailAccountManualPayload, MailAccountSummary>
type RemoveMailAccountAction = Link.Action<MailAccountRemovePayload, { ok: true }>

declare module '@fumika/link' {
  namespace Link {
    interface Actions {
      'mail-account.list': ListMailAccountsAction
      'mail-account.bind-oauth': BindOAuthMailAccountAction
      'mail-account.bind-manual': BindManualMailAccountAction
      'mail-account.remove': RemoveMailAccountAction
      'mail-message.list': ListMailMessagesAction
      'mail-message.get': GetMailMessageAction
      'mail-message.set-flags': SetMailMessageFlagsAction
      'mail-message.mark-read': MarkMailMessagesReadAction
    }

    interface Events {
      'mail-account.changed': MailAccountChangedEvent
      'mail-message.changed': MailMessagesChangedEvent
    }
  }
}
