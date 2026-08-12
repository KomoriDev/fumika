import type { MailAccount, MailAccountManualPayload, MailAccountOAuthPayload, MailAccountSummary } from '@fumika/state'
import type { Context } from 'cordis'
import { Buffer } from 'node:buffer'
import { randomUUID } from 'node:crypto'
import process from 'node:process'
import { RuntimeError } from '@cordisjs/plugin-database'
import { Service } from 'cordis'
import { safeStorage } from 'electron'
import { authorizeWithBrowser, createOAuthProviders, fetchUserInfo, providerName } from './oauth'
import { verifyImap, verifySmtp } from './transport'

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

declare module '@cordisjs/plugin-database' {
  interface Tables {
    mail_account: MailAccount
    mail_credential: MailCredentialRow
  }
}

declare module 'cordis' {
  interface Context {
    mailAccount: MailAccountService
  }
}

export class MailAccountService extends Service {
  static inject = ['model', 'database', 'link']
  private readonly oauthProviders = createOAuthProviders()

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
  }

  async* [Service.init]() {
    await this.ctx.database.prepared()
    await this.backfillOAuthAvatars()
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
  }

  async list(): Promise<MailAccountSummary[]> {
    const accounts = await this.ctx.database.get('mail_account', {}, {
      sort: { createdAt: 'asc' },
    })
    return accounts.map(toSummary)
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

    await this.ctx.database.withTransaction(async (database) => {
      await database.remove('mail_credential', { accountId: id })
      await database.remove('mail_account', { id })
    })
    await this.broadcast()
  }

  private async broadcast(): Promise<void> {
    this.ctx.emit('link/send', 'mail-account.changed', { accounts: await this.list() })
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
