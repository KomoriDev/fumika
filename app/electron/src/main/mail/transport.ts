import type { MailAccount } from '@fumika/state'
import { session } from 'electron'
import { ImapFlow } from 'imapflow'
import nodemailer from 'nodemailer'

export interface MailCredential {
  password?: string
  accessToken?: string
}

type MailProxyResolver = (url: string) => Promise<string>
type ProxyDirective = 'PROXY' | 'HTTPS' | 'SOCKS' | 'SOCKS4' | 'SOCKS5'

const proxySchemes: Record<ProxyDirective, string> = {
  PROXY: 'http',
  HTTPS: 'https',
  SOCKS: 'socks',
  SOCKS4: 'socks4',
  SOCKS5: 'socks5',
}

export function isQqMailAccount(mailboxAddress: string, imap: MailAccount['imap'], smtp?: MailAccount['smtp']): boolean {
  const host = imap.host.toLowerCase()
  const smtpHost = smtp?.host.toLowerCase() ?? ''
  const address = mailboxAddress.toLowerCase()
  return address.endsWith('@qq.com')
    || address.endsWith('@vip.qq.com')
    || address.endsWith('@foxmail.com')
    || host === 'imap.qq.com'
    || host.endsWith('.qq.com')
    || smtpHost === 'smtp.qq.com'
    || smtpHost.endsWith('.qq.com')
}

export async function resolveMailProxy(server: MailAccount['imap'], resolveProxy: MailProxyResolver = url => session.defaultSession.resolveProxy(url)): Promise<string | undefined> {
  const protocol = server.secure ? 'https' : 'http'
  const rules = await resolveProxy(`${protocol}://${server.host}:${server.port}`)
  for (const rule of rules.split(';')) {
    const [directive, endpoint] = rule.trim().split(/\s+/, 2)
    if (directive === 'DIRECT')
      return undefined
    if (endpoint && directive in proxySchemes)
      return `${proxySchemes[directive as ProxyDirective]}://${endpoint}`
  }
  return undefined
}

interface ImapAuthenticationError extends Error {
  authenticationFailed?: boolean
  serverResponseCode?: string
  response?: unknown
  responseText?: string
  oauthError?: {
    status?: string | number
    scope?: string
  }
}
export async function createImapClient(server: MailAccount['imap'], credential: MailCredential, options: { verifyOnly?: boolean, watch?: boolean } = {}): Promise<ImapFlow> {
  let proxy: string | undefined
  try {
    proxy = await resolveMailProxy(server)
  }
  catch {
    // A failed proxy lookup must not make direct IMAP unavailable.
  }
  const client = new ImapFlow({
    host: server.host,
    port: server.port,
    secure: server.secure,
    doSTARTTLS: server.secure ? undefined : true,
    proxy,
    auth: {
      user: server.username,
      pass: credential.password,
      accessToken: credential.accessToken,
    },
    verifyOnly: options.verifyOnly,
    disableAutoIdle: true,
    maxIdleTime: options.watch ? 30_000 : undefined,
    missingIdleCommand: options.watch ? 'NOOP' : undefined,
    logger: false,
    connectionTimeout: 20_000,
    greetingTimeout: 15_000,
    socketTimeout: options.verifyOnly ? 20_000 : options.watch ? 6 * 60_000 : 60_000,
    maxLiteralSize: options.verifyOnly ? undefined : 30 * 1024 * 1024,
    maxResponseSize: options.verifyOnly ? undefined : 32 * 1024 * 1024,
  })
  preferXOAuth2(client)
  return client
}

export async function verifyImap(server: MailAccount['imap'], credential: MailCredential): Promise<void> {
  const client = await createImapClient(server, credential, { verifyOnly: true })

  try {
    await client.connect()
  }
  catch (error) {
    throw new Error(`IMAP verification failed: ${formatImapError(error)}`, { cause: error })
  }
  finally {
    if (client.usable)
      await client.logout().catch(() => client.close())
    else
      client.close()
  }
}

export async function verifySmtp(server: MailAccount['smtp'], credential: MailCredential): Promise<void> {
  let proxy: string | undefined
  try {
    proxy = await resolveMailProxy(server)
  }
  catch {
    // The proxy does not affect the email connection
  }

  const transporter = nodemailer.createTransport({
    host: server.host,
    port: server.port,
    secure: server.secure,
    requireTLS: !server.secure,
    proxy,
    auth: credential.accessToken
      ? { type: 'OAuth2', user: server.username, accessToken: credential.accessToken }
      : { user: server.username, pass: credential.password },
    connectionTimeout: 20_000,
    greetingTimeout: 15_000,
    socketTimeout: 20_000,
  } as Parameters<typeof nodemailer.createTransport>[0])
  try {
    await transporter.verify()
  }
  catch (error) {
    throw new Error(`SMTP verification failed: ${error instanceof Error ? error.message : String(error)}`, { cause: error })
  }
  finally {
    transporter.close()
  }
}

function preferXOAuth2(client: ImapFlow): void {
  const originalRun = Reflect.get(client, 'run').bind(client) as (command: string, ...args: unknown[]) => Promise<unknown>
  Reflect.set(client, 'run', (command: string, ...args: unknown[]) => {
    if (command === 'AUTHENTICATE')
      client.capabilities.delete('AUTH=OAUTHBEARER')
    return originalRun(command, ...args)
  })
}

function formatImapError(error: unknown): string {
  if (!(error instanceof Error))
    return String(error)

  const failure = error as ImapAuthenticationError
  const oauth = failure.oauthError
  const details = [
    failure.responseText,
    typeof failure.response === 'string' ? failure.response : undefined,
    failure.serverResponseCode,
    oauth?.status === undefined ? undefined : `OAuth ${oauth.status}`,
    oauth?.scope ? `required scope ${oauth.scope}` : undefined,
  ].filter((value): value is string => Boolean(value))

  return [...new Set(details)].join(' · ') || failure.message
}
