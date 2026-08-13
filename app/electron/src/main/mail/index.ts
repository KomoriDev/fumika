import type {
  MailAccount,
  MailAccountManualPayload,
  MailAccountOAuthPayload,
  MailAccountSummary,
  MailFolder,
  MailMessageDetail,
  MailMessageListPayload,
  MailMessageListReply,
  MailMessageSetFlagsPayload,
  MailMessagesMarkReadPayload,
  MailMessagesMarkReadReply,
  MailMessageSummary,
} from '@fumika/state'
import type { Context } from 'cordis'
import { Buffer } from 'node:buffer'
import { randomUUID } from 'node:crypto'
import process from 'node:process'
import { RuntimeError } from '@cordisjs/plugin-database'
import { Service } from 'cordis'
import { safeStorage } from 'electron'
import { authorizeWithBrowser, createOAuthProviders, fetchUserInfo, providerName, refreshOAuthAuthorization } from './oauth'
import { extractSenderAvatarUrl, markRemoteMessagesRead, matchesFolder, syncAccountMessages, syncInboxMessages, updateRemoteFlags } from './receiver'
import { verifyImap, verifySmtp } from './transport'
import { MailAccountWatcher } from './watcher'

interface MailCredentialRow {
  accountId: string
  kind: 'oauth2' | 'password'
  encryptedPayload: ArrayBuffer
  formatVersion: number
  updatedAt: number
}

interface StoredOAuthCredential {
  accessToken: string
  refreshToken: string
  expiresAt: number
  tokenType: string
}

interface MailMessageRow extends MailMessageDetail {
  uid: number
  remoteMailbox: string
  sourceSize: number
  syncedAt: number
}

declare module '@cordisjs/plugin-database' {
  interface Tables {
    mail_account: MailAccount
    mail_credential: MailCredentialRow
    mail_message: MailMessageRow
  }
}

declare module 'cordis' {
  interface Context {
    mailAccount: MailAccountService
  }
  interface Events {
    'mail/received': (messages: MailMessageSummary[]) => void
  }
}

export class MailAccountService extends Service {
  static inject = ['model', 'database', 'link']
  private readonly oauthProviders = createOAuthProviders()
  private readonly watchers = new Map<string, MailAccountWatcher>()
  private readonly liveSyncs = new Map<string, Promise<void>>()

  constructor(ctx: Context) {
    super(ctx, 'mailAccount')

    ctx.model.extend('mail_account', {
      id: 'uuid',
      provider: 'string(32)',
      providerAccountId: 'string(255)',
      mailboxAddress: 'string(320)',
      displayName: 'string(255)',
      avatarUrl: { type: 'string', length: 2048 },
      authType: 'string(32)',
      status: 'string(32)',
      grantedScopes: 'list',
      imap: 'json',
      smtp: 'json',
      lastVerifiedAt: 'unsigned',
      createdAt: 'unsigned',
      updatedAt: 'unsigned',
    }, {
      primary: 'id',
      unique: [['provider', 'providerAccountId', 'mailboxAddress']],
      indexes: ['mailboxAddress'],
    })

    ctx.model.extend('mail_credential', {
      accountId: 'uuid',
      kind: 'string(32)',
      encryptedPayload: 'binary',
      formatVersion: 'unsigned',
      updatedAt: 'unsigned',
    }, {
      primary: 'accountId',
    })

    ctx.model.extend('mail_message', {
      id: 'string(2048)',
      accountId: 'uuid',
      mailboxAddress: 'string(320)',
      accountName: 'string(255)',
      accountAvatarUrl: { type: 'string', length: 2048 },
      folder: 'string(32)',
      sender: 'json',
      senderAvatarUrl: { type: 'string', length: 2048 },
      subject: 'text',
      preview: 'text',
      receivedAt: 'unsigned',
      unread: 'boolean',
      starred: 'boolean',
      hasAttachments: 'boolean',
      messageId: 'string(2048)',
      to: 'json',
      cc: 'json',
      replyTo: 'json',
      text: 'text',
      html: 'text',
      attachments: 'json',
      uid: 'unsigned',
      remoteMailbox: 'string(2048)',
      sourceSize: 'unsigned',
      syncedAt: 'unsigned',
    }, {
      primary: 'id',
      unique: [['accountId', 'remoteMailbox', 'uid']],
      indexes: ['accountId', 'receivedAt', 'folder'],
    })
  }

  async* [Service.init]() {
    await this.ctx.database.prepared()
    await this.backfillOAuthAvatars()
    await this.startWatchers()
    yield async () => this.stopWatchers()
    yield this.ctx.link.action('mail-account.list', async () => ({
      accounts: await this.list(),
      oauth: {
        google: Boolean(this.oauthProviders.google),
        outlook: Boolean(this.oauthProviders.outlook),
      },
    }))

    yield this.ctx.link.action('mail-account.bind-oauth', payload => this.bindOAuth(payload))
    yield this.ctx.link.action('mail-account.bind-manual', payload => this.bindManual(payload))
    yield this.ctx.link.action('mail-account.remove', async ({ id }) => {
      await this.remove(id)
      return { ok: true as const }
    })

    yield this.ctx.link.action('mail-message.list', payload => this.listMessages(payload || undefined))
    yield this.ctx.link.action('mail-message.get', ({ id }) => this.getMessage(id))
    yield this.ctx.link.action('mail-message.set-flags', payload => this.setMessageFlags(payload))
    yield this.ctx.link.action('mail-message.mark-read', payload => this.markMessagesRead(payload))
  }

  async list(): Promise<MailAccountSummary[]> {
    const accounts = await this.ctx.database.get('mail_account', {}, {
      sort: { createdAt: 'asc' },
    })
    return accounts.map(toSummary)
  }

  private async listMessages(payload?: MailMessageListPayload): Promise<MailMessageListReply> {
    const limit = normalizeMessageLimit(payload?.limit)
    const errors = payload?.refresh === true ? await this.refreshMessages(limit) : []
    const folder = payload?.folder ?? 'inbox'
    const query = payload?.query?.trim().toLowerCase() ?? ''
    const rows = await this.ctx.database.get('mail_message', {}, {
      sort: { receivedAt: 'desc' },
      limit: Math.min(1000, limit * Math.max(1, (await this.list()).length) * 5),
    })
    const messages = rows
      .filter(message => matchesFolder(message, folder))
      .filter(message => !query || messageSearchText(message).includes(query))
      .slice(0, limit)
      .map(toMessageSummary)
    const { counts, unreadCounts } = await this.getMessageCounts()
    return { messages, refreshedAt: Date.now(), errors, counts, unreadCounts }
  }

  private async getMessageCounts(): Promise<{ counts: Record<MailFolder, number>, unreadCounts: Record<MailFolder, number> }> {
    const rows = await this.ctx.database.get('mail_message', {})
    const counts = createEmptyFolderCounts()
    const unreadCounts = createEmptyFolderCounts()
    for (const message of rows) {
      counts[message.folder]++
      if (message.unread)
        unreadCounts[message.folder]++
      if (message.starred && message.folder !== 'trash') {
        counts.starred++
        if (message.unread)
          unreadCounts.starred++
      }
    }
    return { counts, unreadCounts }
  }

  private async getMessage(id: string): Promise<MailMessageDetail> {
    const row = (await this.ctx.database.get('mail_message', { id }))[0]
    if (!row)
      throw new Error('Mail message was not found. Refresh the mailbox and try again.')
    if (!row.unread)
      return toMessageDetail(row)
    await this.ctx.database.set('mail_message', { id }, { unread: false })
    const updated: MailMessageRow = { ...row, unread: false }
    this.ctx.emit('link/send', 'mail-message.changed', { accountIds: [row.accountId], refreshedAt: Date.now() })
    void this.syncMessageFlags(updated, { unread: false })
    return toMessageDetail(updated)
  }

  private async syncMessageFlags(message: MailMessageRow, changes: { unread?: boolean, starred?: boolean }): Promise<void> {
    try {
      const account = (await this.ctx.database.get('mail_account', { id: message.accountId }))[0]
      if (!account)
        return
      const credential = await this.readCredential(account)
      await updateRemoteFlags(account, credential, message, changes)
    }
    catch (error) {
      this.ctx.logger('mail').warn('failed to synchronize message flags: %s', error instanceof Error ? error.message : String(error))
    }
  }

  private async setMessageFlags(payload: MailMessageSetFlagsPayload): Promise<MailMessageSummary> {
    if (payload.unread === undefined && payload.starred === undefined)
      throw new Error('No message flag change was requested.')
    const row = (await this.ctx.database.get('mail_message', { id: payload.id }))[0]
    if (!row)
      throw new Error('Mail message was not found.')
    const update = {
      ...(payload.unread !== undefined && { unread: payload.unread }),
      ...(payload.starred !== undefined && { starred: payload.starred }),
    }
    await this.ctx.database.set('mail_message', { id: row.id }, update)
    const message: MailMessageRow = { ...row, ...update }
    this.ctx.emit('link/send', 'mail-message.changed', { accountIds: [row.accountId], refreshedAt: Date.now() })
    void this.syncMessageFlags(message, payload)
    return toMessageSummary(message)
  }

  private async markMessagesRead(payload: MailMessagesMarkReadPayload): Promise<MailMessagesMarkReadReply> {
    const ids = [...new Set(payload.ids.filter(id => typeof id === 'string' && id))]
    if (!ids.length)
      return { messages: [] }
    if (ids.length > 200)
      throw new Error('At most 200 messages can be marked as read at once.')
    const rows = await this.ctx.database.get('mail_message', { id: { $in: ids } })
    const unread = rows.filter(message => message.unread)
    if (!unread.length)
      return { messages: rows.map(toMessageSummary) }
    await this.ctx.database.set('mail_message', { id: { $in: unread.map(message => message.id) } }, { unread: false })
    const updated = unread.map(message => ({ ...message, unread: false }))
    const accountIds = [...new Set(updated.map(message => message.accountId))]
    this.ctx.emit('link/send', 'mail-message.changed', { accountIds, refreshedAt: Date.now() })
    void this.syncMessagesRead(updated)
    const updatedById = new Map(updated.map(message => [message.id, message]))
    return { messages: rows.map(message => toMessageSummary(updatedById.get(message.id) ?? message)) }
  }

  private async syncMessagesRead(messages: MailMessageRow[]): Promise<void> {
    const byAccount = new Map<string, MailMessageRow[]>()
    for (const message of messages) {
      const accountMessages = byAccount.get(message.accountId) ?? []
      accountMessages.push(message)
      byAccount.set(message.accountId, accountMessages)
    }
    await Promise.all([...byAccount].map(async ([accountId, accountMessages]) => {
      try {
        const account = (await this.ctx.database.get('mail_account', { id: accountId }))[0]
        if (!account)
          return
        const credential = await this.readCredential(account)
        await markRemoteMessagesRead(account, credential, accountMessages)
      }
      catch (error) {
        this.ctx.logger('mail').warn('failed to synchronize read flags: %s', error instanceof Error ? error.message : String(error))
      }
    }))
  }

  private async refreshMessages(limit: number): Promise<Array<{ accountId: string, message: string }>> {
    const accounts = await this.ctx.database.get('mail_account', { status: 'active' }, {
      sort: { createdAt: 'asc' },
    })
    const results = await Promise.all(accounts.map(async (account) => {
      try {
        const credential = await this.readCredential(account)
        const messages = await syncAccountMessages(account, credential, limit)
        await this.persistMessages(messages)
        return undefined
      }
      catch (error) {
        return { accountId: account.id, message: error instanceof Error ? error.message : String(error) }
      }
    }))
    const accountIds = accounts.map(account => account.id)
    if (accountIds.length)
      this.ctx.emit('link/send', 'mail-message.changed', { accountIds, refreshedAt: Date.now() })
    return results.filter((result): result is { accountId: string, message: string } => Boolean(result))
  }

  private async startWatchers(): Promise<void> {
    const accounts = await this.ctx.database.get('mail_account', { status: 'active' })
    for (const account of accounts)
      this.startWatcher(account)
  }

  private startWatcher(account: MailAccount): void {
    if (this.watchers.has(account.id))
      return
    const watcher = new MailAccountWatcher(account, () => this.readCredential(account), {
      onMessage: () => this.syncLiveInbox(account),
      onError: error => this.ctx.logger('mail').warn('real-time mailbox connection failed for %s: %s', account.mailboxAddress, error instanceof Error ? error.message : String(error)),
    })
    this.watchers.set(account.id, watcher)
    watcher.start()
  }

  private async stopWatcher(accountId: string): Promise<void> {
    const watcher = this.watchers.get(accountId)
    if (!watcher)
      return
    this.watchers.delete(accountId)
    await watcher.stop()
  }

  private async stopWatchers(): Promise<void> {
    const watchers = [...this.watchers.values()]
    this.watchers.clear()
    await Promise.all(watchers.map(watcher => watcher.stop()))
  }

  private async syncLiveInbox(account: MailAccount): Promise<void> {
    const existing = this.liveSyncs.get(account.id)
    if (existing)
      return existing
    const sync = this.fetchLiveInbox(account).finally(() => this.liveSyncs.delete(account.id))
    this.liveSyncs.set(account.id, sync)
    return sync
  }

  private async fetchLiveInbox(account: MailAccount): Promise<void> {
    const latest = await this.ctx.database.get('mail_message', {
      accountId: account.id,
      folder: 'inbox',
    }, { sort: { uid: 'desc' }, limit: 1 })
    const remoteMailbox = latest[0]?.remoteMailbox ?? 'INBOX'
    const credential = await this.readCredential(account)
    const messages = await syncInboxMessages(account, credential, remoteMailbox, latest[0]?.uid ?? 0)
    const newMessages = await this.persistMessages(messages)
    if (!newMessages.length)
      return
    const refreshedAt = Date.now()
    this.ctx.emit('link/send', 'mail-message.changed', { accountIds: [account.id], refreshedAt })
    this.ctx.emit('mail/received', newMessages)
  }

  private async persistMessages(messages: Array<Omit<MailMessageRow, 'syncedAt'>>): Promise<MailMessageRow[]> {
    if (!messages.length)
      return []
    const existing = await this.ctx.database.get('mail_message', { id: { $in: messages.map(message => message.id) } })
    const existingIds = new Set(existing.map(message => message.id))
    const syncedAt = Date.now()
    const rows = messages.map(message => ({ ...message, syncedAt }))
    await this.ctx.database.upsert('mail_message', rows)
    return rows.filter(message => !existingIds.has(message.id))
  }

  private async bindOAuth(payload: MailAccountOAuthPayload): Promise<MailAccountSummary> {
    const config = this.oauthProviders[payload.provider]
    if (!config) {
      const variable = payload.provider === 'google'
        ? 'FUMIKA_GOOGLE_CLIENT_ID and FUMIKA_GOOGLE_CLIENT_SECRET'
        : 'FUMIKA_OUTLOOK_CLIENT_ID'
      throw new Error(`${providerName(payload.provider)} OAuth is not configured. Set ${variable} in the root .env before starting Fumika.`)
    }

    const authorization = await authorizeWithBrowser(config)
    const userInfo = await fetchUserInfo(config, authorization.accessToken)
    assertMailScope(config.provider, authorization.grantedScopes)
    const mailboxAddress = normalizeEmail(userInfo.email ?? userInfo.preferred_username)
    if (!mailboxAddress)
      throw new Error(`${providerName(config.provider)} did not return a usable mailbox address.`)

    const providerAccountId = userInfo.sub?.trim()
    if (!providerAccountId)
      throw new Error(`${providerName(config.provider)} did not return a stable account identifier.`)

    const accessToken = authorization.accessToken
    await verifyImap({
      host: config.imapHost,
      port: 993,
      secure: true,
      username: mailboxAddress,
    }, { accessToken })
    await verifySmtp({
      host: config.smtpHost,
      port: 587,
      secure: false,
      username: mailboxAddress,
    }, { accessToken })

    const now = Date.now()
    const account: MailAccount = {
      id: randomUUID(),
      provider: config.provider,
      providerAccountId,
      mailboxAddress,
      displayName: userInfo.name?.trim() || mailboxAddress,
      avatarUrl: normalizeAvatarUrl(userInfo.picture),
      authType: 'oauth2',
      status: 'active',
      grantedScopes: authorization.grantedScopes,
      imap: {
        host: config.imapHost,
        port: 993,
        secure: true,
        username: mailboxAddress,
      },
      smtp: {
        host: config.smtpHost,
        port: 587,
        secure: false,
        username: mailboxAddress,
      },
      lastVerifiedAt: now,
      createdAt: now,
      updatedAt: now,
    }

    const credential: StoredOAuthCredential = {
      accessToken,
      refreshToken: authorization.refreshToken,
      expiresAt: authorization.expiresAt,
      tokenType: authorization.tokenType,
    }
    await this.persist(account, 'oauth2', credential)
    return toSummary(account)
  }

  private async bindManual(payload: MailAccountManualPayload): Promise<MailAccountSummary> {
    const mailboxAddress = normalizeEmail(payload.email)
    if (!mailboxAddress)
      throw new Error('Enter a valid email address.')
    const password = normalizeCredential(payload.password)
    if (!password)
      throw new Error('Enter the mailbox password or app password.')

    const imap = normalizeServer(payload.imap, mailboxAddress, 'IMAP')
    const smtp = normalizeServer(payload.smtp, mailboxAddress, 'SMTP')
    const isQqMail = isQqMailAccount(mailboxAddress, imap, smtp)
    assertQqAuthorizationCode(isQqMail, password)
    try {
      await verifyImap(imap, { password })
      await verifySmtp(smtp, { password })
    }
    catch (error) {
      if (isQqMail && isAuthenticationFailure(error))
        throw new Error('QQ Mail rejected the login. Enable IMAP/SMTP in QQ Mail Settings → Account & Security, then enter the 16-character authorization code—not your QQ password. If you tried repeatedly, wait 10–15 minutes before retrying.', { cause: error })
      throw error
    }

    const now = Date.now()
    const account: MailAccount = {
      id: randomUUID(),
      provider: 'imap-smtp',
      providerAccountId: `${imap.username}@${imap.host}`.toLowerCase(),
      mailboxAddress,
      displayName: payload.displayName?.trim() || mailboxAddress,
      authType: 'password',
      status: 'active',
      grantedScopes: [],
      imap,
      smtp,
      lastVerifiedAt: now,
      createdAt: now,
      updatedAt: now,
    }

    await this.persist(account, 'password', { password })
    return toSummary(account)
  }

  private async persist(account: MailAccount, kind: MailCredentialRow['kind'], secret: unknown): Promise<void> {
    const encryptedPayload = await encryptCredential(secret)
    const credential: MailCredentialRow = {
      accountId: account.id,
      kind,
      encryptedPayload,
      formatVersion: 1,
      updatedAt: account.updatedAt,
    }

    try {
      await this.ctx.database.withTransaction(async (database) => {
        await database.create('mail_account', account)
        await database.create('mail_credential', credential)
      })
    }
    catch (error) {
      if (RuntimeError.check(error, 'duplicate-entry'))
        throw new Error(`${account.mailboxAddress} is already connected.`)
      throw error
    }
    await this.broadcast()
    this.startWatcher(account)
  }

  private async backfillOAuthAvatars(): Promise<void> {
    const google = this.oauthProviders.google
    if (!google)
      return
    const accounts = (await this.ctx.database.get('mail_account', { provider: 'google' }))
      .filter(account => !account.avatarUrl)
    for (const account of accounts) {
      try {
        const credential = await this.readOAuthCredential(account.id)
        if (credential.expiresAt <= Date.now())
          continue
        const userInfo = await fetchUserInfo(google, credential.accessToken)
        const avatarUrl = normalizeAvatarUrl(userInfo.picture)
        if (avatarUrl)
          await this.ctx.database.set('mail_account', { id: account.id }, { avatarUrl })
      }
      catch {
        // Avatar loading is optional and must not prevent mailbox startup.
      }
    }
  }

  private async readCredential(account: MailAccount): Promise<{ password?: string, accessToken?: string }> {
    const row = (await this.ctx.database.get('mail_credential', { accountId: account.id }))[0]
    if (!row)
      throw new Error(`Credentials for ${account.mailboxAddress} are unavailable.`)
    const { result } = await safeStorage.decryptStringAsync(Buffer.from(row.encryptedPayload))
    if (row.kind === 'password') {
      const credential = JSON.parse(result) as { password?: unknown }
      const password = typeof credential.password === 'string' ? credential.password : ''
      if (!password)
        throw new Error(`Password for ${account.mailboxAddress} is unavailable.`)
      return { password }
    }
    let credential = JSON.parse(result) as StoredOAuthCredential
    if (credential.expiresAt <= Date.now() + 60_000) {
      const provider = account.provider === 'google' || account.provider === 'outlook'
        ? this.oauthProviders[account.provider]
        : undefined
      if (!provider || !credential.refreshToken)
        throw new Error(`${account.mailboxAddress} needs to be reconnected because its OAuth session expired.`)
      assertMailScope(provider.provider, account.grantedScopes)
      credential = await refreshOAuthAuthorization(provider, credential.refreshToken)
      await this.storeCredential(row, credential)
    }
    if (!credential.accessToken)
      throw new Error(`OAuth access token for ${account.mailboxAddress} is unavailable.`)
    return { accessToken: credential.accessToken }
  }

  private async storeCredential(row: MailCredentialRow, credential: StoredOAuthCredential): Promise<void> {
    const encryptedPayload = await encryptCredential(credential)
    await this.ctx.database.set('mail_credential', { accountId: row.accountId }, {
      encryptedPayload,
      formatVersion: 1,
      updatedAt: Date.now(),
    })
  }

  private async readOAuthCredential(accountId: string): Promise<StoredOAuthCredential> {
    const row = (await this.ctx.database.get('mail_credential', { accountId }))[0]
    if (!row || row.kind !== 'oauth2')
      throw new Error('OAuth credential is unavailable.')
    const { result } = await safeStorage.decryptStringAsync(Buffer.from(row.encryptedPayload))
    return JSON.parse(result) as StoredOAuthCredential
  }

  private async remove(id: string): Promise<void> {
    const account = (await this.ctx.database.get('mail_account', { id }))[0]
    if (!account)
      return
    await this.stopWatcher(id)

    await this.ctx.database.withTransaction(async (database) => {
      await database.remove('mail_message', { accountId: id })
      await database.remove('mail_credential', { accountId: id })
      await database.remove('mail_account', { id })
    })
    await this.broadcast()
  }

  private async broadcast(): Promise<void> {
    this.ctx.emit('link/send', 'mail-account.changed', { accounts: await this.list() })
  }
}

function createEmptyFolderCounts(): Record<MailFolder, number> {
  return {
    inbox: 0,
    starred: 0,
    snoozed: 0,
    sent: 0,
    drafts: 0,
    archive: 0,
    trash: 0,
  }
}

function normalizeMessageLimit(value: number | undefined): number {
  if (value === undefined)
    return 100
  if (!Number.isFinite(value))
    return 100
  return Math.max(1, Math.min(200, Math.trunc(value)))
}

function messageSearchText(message: MailMessageRow): string {
  const addresses = [message.sender, ...message.to, ...message.cc]
    .map(address => `${address.name ?? ''} ${address.address}`)
    .join(' ')
  return `${addresses} ${message.subject} ${message.preview}`.toLowerCase()
}

function toMessageSummary(message: MailMessageRow): MailMessageSummary {
  return {
    id: message.id,
    accountId: message.accountId,
    mailboxAddress: message.mailboxAddress,
    accountName: message.accountName,
    accountAvatarUrl: message.accountAvatarUrl,
    folder: message.folder,
    sender: message.sender,
    senderAvatarUrl: extractSenderAvatarUrl(message.html),
    subject: message.subject,
    preview: message.preview,
    receivedAt: message.receivedAt,
    unread: message.unread,
    starred: message.starred,
    hasAttachments: message.hasAttachments,
  }
}

function toMessageDetail(message: MailMessageRow): MailMessageDetail {
  return {
    ...toMessageSummary(message),
    messageId: message.messageId,
    to: message.to,
    cc: message.cc,
    replyTo: message.replyTo,
    text: message.text,
    html: message.html,
    attachments: message.attachments,
  }
}

async function encryptCredential(value: unknown): Promise<ArrayBuffer> {
  if (!await safeStorage.isAsyncEncryptionAvailable())
    throw new Error('Secure credential storage is unavailable on this device.')
  if (process.platform === 'linux' && safeStorage.getSelectedStorageBackend() === 'basic_text')
    throw new Error('A system keyring is required before Fumika can remember mailbox credentials.')
  const buffer = await safeStorage.encryptStringAsync(JSON.stringify(value))
  return Uint8Array.from(buffer).buffer
}

function normalizeServer(value: MailAccountManualPayload['imap'], fallbackUsername: string, label: string): MailAccount['imap'] {
  const host = value.host.trim()
  const username = value.username?.trim() || fallbackUsername
  if (!host)
    throw new Error(`${label} host is required.`)
  if (!Number.isInteger(value.port) || value.port < 1 || value.port > 65535)
    throw new Error(`${label} port must be between 1 and 65535.`)
  if (!username)
    throw new Error(`${label} username is required.`)
  return { host, port: value.port, secure: value.secure, username }
}

function normalizeCredential(value: unknown): string {
  if (typeof value !== 'string')
    return ''
  const credential = value.trim()
  return credential.replaceAll(/\s/g, '').length === 16 && /^[a-z0-9\s]+$/i.test(credential)
    ? credential.replaceAll(/\s/g, '')
    : credential
}

function isQqMailAccount(mailboxAddress: string, imap: MailAccount['imap'], smtp: MailAccount['smtp']): boolean {
  return mailboxAddress.endsWith('@qq.com')
    || imap.host.toLowerCase() === 'imap.qq.com'
    || smtp.host.toLowerCase() === 'smtp.qq.com'
}

function assertQqAuthorizationCode(isQqMail: boolean, password: string): void {
  if (isQqMail && !/^[a-z0-9]{16}$/i.test(password))
    throw new Error('QQ Mail requires the 16-character authorization code generated in Settings → Account & Security. Do not enter your QQ password.')
}

function isAuthenticationFailure(error: unknown): boolean {
  if (!(error instanceof Error))
    return false
  const message = `${error.message} ${error.cause instanceof Error ? error.cause.message : ''}`
  return /authentication|invalid login|login fail|password|credentials|\b535\b/i.test(message)
}

function normalizeAvatarUrl(value: unknown): string | undefined {
  if (typeof value !== 'string')
    return undefined
  try {
    const url = new URL(value.trim())
    return url.protocol === 'https:' ? url.toString() : undefined
  }
  catch {
    return undefined
  }
}

function normalizeEmail(value: unknown): string | undefined {
  if (typeof value !== 'string')
    return undefined
  const email = value.trim().toLowerCase()
  if (!isValidEmail(email))
    return undefined
  return email
}

function isValidEmail(email: string): boolean {
  const separator = email.indexOf('@')
  if (separator <= 0 || separator !== email.lastIndexOf('@'))
    return false

  const local = email.slice(0, separator)
  const domain = email.slice(separator + 1)
  return Boolean(local && domain.includes('.') && !domain.startsWith('.') && !domain.endsWith('.'))
}

function assertMailScope(provider: 'google' | 'outlook', grantedScopes: string[]): void {
  const required = provider === 'google'
    ? ['https://mail.google.com/']
    : ['https://outlook.office.com/IMAP.AccessAsUser.All', 'https://outlook.office.com/SMTP.Send']
  const missing = required.filter(scope => !grantedScopes.includes(scope))
  if (missing.length)
    throw new Error(`${providerName(provider)} did not grant mailbox access. Revoke the existing authorization and connect again.`)
}

function toSummary(account: MailAccount): MailAccountSummary {
  return {
    id: account.id,
    provider: account.provider,
    mailboxAddress: account.mailboxAddress,
    displayName: account.displayName,
    avatarUrl: account.avatarUrl,
    status: account.status,
    lastVerifiedAt: account.lastVerifiedAt,
  }
}

export default MailAccountService
