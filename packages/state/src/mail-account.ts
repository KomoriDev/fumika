import type { Link } from '@fumika/link'

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
    }

    interface Events {
      'mail-account.changed': MailAccountChangedEvent
    }
  }
}
