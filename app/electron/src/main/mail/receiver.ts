import type {
  MailAccount,
  MailAddress,
  MailAttachment,
  MailFolder,
  MailMessageDetail,
  MailMessageSummary,
} from '@fumika/state'
import type { SplitterChunk } from '@zone-eu/mailsplit'
import type { FetchMessageObject, MessageAddressObject, MessageStructureObject } from 'imapflow'
import { Buffer } from 'node:buffer'
import { StringDecoder } from 'node:string_decoder'
import { Splitter } from '@zone-eu/mailsplit'
import { ImapFlow } from 'imapflow'
import libmime from 'libmime'
import { createImapClient } from './transport'

export interface MailCredential {
  password?: string
  accessToken?: string
}

export interface SyncedMailMessage extends MailMessageDetail {
  uid: number
  remoteMailbox: string
  sourceSize: number
}

export async function syncAccountMessages(
  account: MailAccount,
  credential: MailCredential,
  limit: number,
): Promise<SyncedMailMessage[]> {
  const client = await connectImap(account, credential)
  const messages: SyncedMailMessage[] = []
  try {
    const mailboxes = await client.list()
    const folders = resolveFolders(mailboxes)
    for (const folder of folders) {
      const lock = await client.getMailboxLock(folder.path, { readOnly: true })
      try {
        const exists = client.mailbox && client.mailbox.exists ? client.mailbox.exists : 0
        if (!exists)
          continue
        const start = Math.max(1, exists - limit + 1)
        for await (const fetched of client.fetch(`${start}:*`, {
          uid: true,
          flags: true,
          envelope: true,
          internalDate: true,
          size: true,
          bodyStructure: true,
          source: true,
        })) {
          if (!fetched.source)
            continue
          messages.push(await parseMessage(account, folder.folder, folder.path, fetched))
        }
      }
      finally {
        lock.release()
      }
    }
  }
  finally {
    await closeImap(client)
  }
  return messages
}
export async function syncInboxMessages(
  account: MailAccount,
  credential: MailCredential,
  remoteMailbox: string,
  afterUid: number,
): Promise<SyncedMailMessage[]> {
  const client = await connectImap(account, credential)
  const messages: SyncedMailMessage[] = []
  try {
    const lock = await client.getMailboxLock(remoteMailbox, { readOnly: true })
    try {
      const uids = await client.search({ uid: `${Math.max(1, afterUid + 1)}:*` }, { uid: true })
      if (!uids)
        return messages
      const newUids = uids.filter(uid => uid > afterUid)
      if (!newUids.length)
        return messages
      for await (const fetched of client.fetch(newUids, {
        uid: true,
        flags: true,
        envelope: true,
        internalDate: true,
        size: true,
        bodyStructure: true,
        source: true,
      }, { uid: true })) {
        if (fetched.source)
          messages.push(await parseMessage(account, 'inbox', remoteMailbox, fetched))
      }
    }
    finally {
      lock.release()
    }
  }
  finally {
    await closeImap(client)
  }
  return messages
}

export async function updateRemoteFlags(
  account: MailAccount,
  credential: MailCredential,
  message: Pick<SyncedMailMessage, 'uid' | 'remoteMailbox'>,
  changes: { unread?: boolean, starred?: boolean },
): Promise<void> {
  const client = await connectImap(account, credential)
  try {
    const lock = await client.getMailboxLock(message.remoteMailbox)
    try {
      if (changes.unread !== undefined) {
        const action = changes.unread ? client.messageFlagsRemove.bind(client) : client.messageFlagsAdd.bind(client)
        await action(message.uid, ['\\Seen'], { uid: true })
      }
      if (changes.starred !== undefined) {
        const action = changes.starred ? client.messageFlagsAdd.bind(client) : client.messageFlagsRemove.bind(client)
        await action(message.uid, ['\\Flagged'], { uid: true })
      }
    }
    finally {
      lock.release()
    }
  }
  finally {
    await closeImap(client)
  }
}

export async function markRemoteMessagesRead(
  account: MailAccount,
  credential: MailCredential,
  messages: Array<Pick<SyncedMailMessage, 'uid' | 'remoteMailbox'>>,
): Promise<void> {
  if (!messages.length)
    return
  const client = await connectImap(account, credential)
  try {
    const byMailbox = new Map<string, number[]>()
    for (const message of messages) {
      const uids = byMailbox.get(message.remoteMailbox) ?? []
      uids.push(message.uid)
      byMailbox.set(message.remoteMailbox, uids)
    }
    for (const [mailbox, uids] of byMailbox) {
      const lock = await client.getMailboxLock(mailbox)
      try {
        await client.messageFlagsAdd(uids, ['\\Seen'], { uid: true })
      }
      finally {
        lock.release()
      }
    }
  }
  finally {
    await closeImap(client)
  }
}

async function connectImap(account: MailAccount, credential: MailCredential): Promise<ImapFlow> {
  const client = await createImapClient(account.imap, credential)
  try {
    await client.connect()
    return client
  }
  catch (error) {
    client.close()
    throw new Error(`IMAP synchronization failed: ${error instanceof Error ? error.message : String(error)}`, { cause: error })
  }
}

async function closeImap(client: ImapFlow): Promise<void> {
  if (client.usable)
    await client.logout().catch(() => client.close())
  else
    client.close()
}

function resolveFolders(mailboxes: Awaited<ReturnType<ImapFlow['list']>>): Array<{ folder: SyncedMailMessage['folder'], path: string }> {
  const result: Array<{ folder: SyncedMailMessage['folder'], path: string }> = []
  const used = new Set<string>()
  const add = (folder: SyncedMailMessage['folder'], mailbox?: typeof mailboxes[number]) => {
    if (!mailbox || used.has(mailbox.path))
      return
    used.add(mailbox.path)
    result.push({ folder, path: mailbox.path })
  }
  const bySpecialUse = (value: string) => mailboxes.find(mailbox => mailbox.specialUse === value)
  const byName = (...names: string[]) => mailboxes.find((mailbox) => {
    const path = mailbox.path.toLowerCase()
    return names.some(name => path === name || path.endsWith(`/${name}`) || path.endsWith(`.${name}`))
  })

  add('inbox', mailboxes.find(mailbox => mailbox.path.toLowerCase() === 'inbox') ?? bySpecialUse('\\Inbox'))
  add('sent', bySpecialUse('\\Sent') ?? byName('sent', 'sent items', 'sent mail'))
  add('drafts', bySpecialUse('\\Drafts') ?? byName('drafts'))
  add('trash', bySpecialUse('\\Trash') ?? byName('trash', 'deleted items'))
  add('archive', bySpecialUse('\\Archive') ?? byName('archive', 'all mail'))
  return result
}

async function parseMessage(
  account: MailAccount,
  folder: SyncedMailMessage['folder'],
  remoteMailbox: string,
  fetched: FetchMessageObject,
): Promise<SyncedMailMessage> {
  const parsed = await parseMimeMessage(fetched.source ?? Buffer.alloc(0))
  const envelope = fetched.envelope
  const sender = toAddress(envelope?.from?.[0]) ?? parsed.from ?? { address: 'unknown' }
  const subject = envelope?.subject?.trim() || parsed.subject || '(No subject)'
  const receivedAt = toTimestamp(envelope?.date ?? fetched.internalDate)
  const unread = !fetched.flags?.has('\\Seen')
  const starred = Boolean(fetched.flags?.has('\\Flagged'))
  const id = `${account.id}:${encodeURIComponent(remoteMailbox)}:${fetched.uid}`
  const text = normalizeBodyText(parsed.text || stripHtml(parsed.html ?? ''))
  const preview = createPreview(text)
  const common: MailMessageSummary = {
    id,
    accountId: account.id,
    mailboxAddress: account.mailboxAddress,
    accountName: account.displayName,
    accountAvatarUrl: account.avatarUrl,
    folder,
    sender,
    senderAvatarUrl: extractSenderAvatarUrl(parsed.html),
    subject,
    preview,
    receivedAt,
    unread,
    starred,
    hasAttachments: parsed.attachments.length > 0 || hasAttachment(fetched.bodyStructure),
  }
  const envelopeTo = addresses(envelope?.to)
  const envelopeCc = addresses(envelope?.cc)
  const envelopeReplyTo = addresses(envelope?.replyTo)
  return {
    ...common,
    messageId: envelope?.messageId || parsed.messageId || undefined,
    to: envelopeTo.length ? envelopeTo : parsed.to,
    cc: envelopeCc.length ? envelopeCc : parsed.cc,
    replyTo: envelopeReplyTo.length ? envelopeReplyTo : parsed.replyTo,
    text,
    html: parsed.html,
    attachments: parsed.attachments,
    uid: fetched.uid,
    remoteMailbox,
    sourceSize: fetched.size ?? fetched.source?.byteLength ?? 0,
  }
}

interface ParsedMimeMessage {
  subject: string
  messageId: string
  from?: MailAddress
  to: MailAddress[]
  cc: MailAddress[]
  replyTo: MailAddress[]
  text: string
  html?: string
  attachments: MailAttachment[]
}

async function parseMimeMessage(source: Buffer): Promise<ParsedMimeMessage> {
  const splitter = new Splitter({ ignoreEmbedded: true, maxHeadSize: 512 * 1024, maxChildNodes: 500 })
  const result: ParsedMimeMessage = {
    subject: '',
    messageId: '',
    to: [],
    cc: [],
    replyTo: [],
    text: '',
    attachments: [],
  }
  let current: {
    decoder: NodeJS.ReadWriteStream
    contentType: string
    charset: string
    disposition: string
    filename: string
    chunks: Buffer[]
  } | undefined
  const pending: Promise<void>[] = []

  splitter.on('data', (chunk: SplitterChunk) => {
    if (chunk.type === 'node') {
      if (chunk.root && chunk.headers) {
        result.subject = decodeWords(chunk.headers.getFirst('subject'))
        result.messageId = chunk.headers.getFirst('message-id').trim()
        result.from = parseAddressList(chunk.headers.getFirst('from'))[0]
        result.to = parseAddressList(chunk.headers.getFirst('to'))
        result.cc = parseAddressList(chunk.headers.getFirst('cc'))
        result.replyTo = parseAddressList(chunk.headers.getFirst('reply-to'))
      }
      if (chunk.multipart)
        return
      const decoder = chunk.getDecoder()
      const entry = current = {
        decoder,
        contentType: chunk.contentType || 'application/octet-stream',
        charset: chunk.charset || 'utf-8',
        disposition: chunk.disposition || '',
        filename: chunk.filename || '',
        chunks: [] as Buffer[],
      }
      decoder.on('data', (data: string | Uint8Array) => entry.chunks.push(Buffer.from(data) as Buffer))
      pending.push(new Promise<void>((resolve, reject) => {
        decoder.once('end', () => {
          collectPart(result, entry)
          resolve()
        })
        decoder.once('error', reject)
      }))
      return
    }
    if (chunk.type === 'body' && current)
      current.decoder.write(chunk.value)
    if (chunk.type === 'data' && current) {
      current.decoder.end()
      current = undefined
    }
  })

  await new Promise<void>((resolve, reject) => {
    splitter.once('finish' as never, () => {
      if (current) {
        current.decoder.end()
        current = undefined
      }
      resolve()
    })
    splitter.once('error' as never, reject)
    splitter.end(source)
  })
  await Promise.all(pending)
  return result
}

function collectPart(result: ParsedMimeMessage, part: {
  contentType: string
  charset: string
  disposition: string
  filename: string
  chunks: Buffer[]
}): void {
  const data = Buffer.concat(part.chunks)
  const attachment = part.disposition === 'attachment' || Boolean(part.filename)
  if (attachment) {
    result.attachments.push({
      filename: part.filename || 'attachment',
      contentType: part.contentType,
      size: data.byteLength,
    })
    return
  }
  if (part.contentType === 'text/plain') {
    const value = decodeBuffer(data, part.charset)
    result.text = result.text ? `${result.text}\n\n${value}` : value
  }
  else if (part.contentType === 'text/html' && !result.html) {
    result.html = decodeBuffer(data, part.charset)
  }
}

function decodeBuffer(value: Buffer, charset: string): string {
  try {
    const decoder = new StringDecoder(normalizeCharset(charset))
    return decoder.end(value)
  }
  catch {
    return value.toString('utf8')
  }
}

function normalizeCharset(charset: string): BufferEncoding {
  const value = charset.trim().toLowerCase().replace(/^"|"$/g, '')
  if (value === 'us-ascii')
    return 'ascii'
  if (value === 'utf8' || value === 'utf-8')
    return 'utf8'
  if (value === 'utf-16le' || value === 'utf16le')
    return 'utf16le'
  if (value === 'latin1' || value === 'iso-8859-1' || value === 'windows-1252')
    return 'latin1'
  return 'utf8'
}

function decodeWords(value: string): string {
  return libmime.decodeWords(value).trim()
}

function parseAddressList(value: string): MailAddress[] {
  if (!value.trim())
    return []
  return splitAddresses(value).map((item) => {
    const match = item.match(/^(.*)<([^<>]+)>$/)
    if (!match)
      return { address: item.trim().replace(/^mailto:/i, '') }
    const name = decodeWords(match[1]!.trim().replace(/^"|"$/g, ''))
    return { address: match[2]!.trim(), ...(name && { name }) }
  }).filter(item => item.address.includes('@'))
}

function splitAddresses(value: string): string[] {
  const result: string[] = []
  let quoted = false
  let angleDepth = 0
  let start = 0
  for (let index = 0; index < value.length; index++) {
    const char = value[index]
    if (char === '"' && value[index - 1] !== '\\') {
      quoted = !quoted
    }
    else if (!quoted && char === '<') {
      angleDepth++
    }
    else if (!quoted && char === '>') {
      angleDepth = Math.max(0, angleDepth - 1)
    }
    else if (!quoted && angleDepth === 0 && char === ',') {
      result.push(value.slice(start, index))
      start = index + 1
    }
  }
  result.push(value.slice(start))
  return result.map(item => item.trim()).filter(Boolean)
}

function addresses(values?: MessageAddressObject[]): MailAddress[] {
  return (values ?? []).map(toAddress).filter((value): value is MailAddress => Boolean(value))
}

function toAddress(value?: MessageAddressObject): MailAddress | undefined {
  const address = value?.address?.trim()
  if (!address)
    return undefined
  const name = value?.name?.trim()
  return { address, ...(name && { name }) }
}

function toTimestamp(value?: Date | string): number {
  const date = value instanceof Date ? value : value ? new Date(value) : new Date()
  const timestamp = date.getTime()
  return Number.isFinite(timestamp) ? timestamp : Date.now()
}

function hasAttachment(node?: MessageStructureObject): boolean {
  if (!node)
    return false
  if (node.disposition?.toLowerCase() === 'attachment' || node.dispositionParameters?.filename || node.parameters?.name)
    return true
  return node.childNodes?.some(hasAttachment) ?? false
}

function createPreview(value: string): string {
  return value.replace(/\s+/g, ' ').trim().slice(0, 240)
}

function normalizeBodyText(value: string): string {
  return value.replace(/\r\n?/g, '\n').replace(/\n{4,}/g, '\n\n\n').trim()
}

function stripHtml(value: string): string {
  return decodeHtmlEntities(value
    .replace(/<style\b[^>]*>[\s\S]*?<\/style>/gi, ' ')
    .replace(/<script\b[^>]*>[\s\S]*?<\/script>/gi, ' ')
    .replace(/<br\s*\/?>/gi, '\n')
    .replace(/<\/(p|div|li|tr|h[1-6])>/gi, '\n')
    .replace(/<[^>]+>/g, ' '))
}

function decodeHtmlEntities(value: string): string {
  const named: Record<string, string> = {
    amp: '&',
    apos: '\'',
    gt: '>',
    lt: '<',
    nbsp: ' ',
    quot: '"',
  }
  return value.replace(/&(#x[\da-f]+|#\d+|[a-z]+);/gi, (_match, entity: string) => {
    if (entity[0] !== '#')
      return named[entity.toLowerCase()] ?? _match
    const codePoint = entity[1]?.toLowerCase() === 'x'
      ? Number.parseInt(entity.slice(2), 16)
      : Number.parseInt(entity.slice(1), 10)
    return Number.isFinite(codePoint) ? String.fromCodePoint(codePoint) : _match
  })
}

export function extractSenderAvatarUrl(html?: string): string | undefined {
  if (!html)
    return undefined
  const source = decodeHtmlEntities(html)
  const icon = source.match(/[?&]icon=([^&"'>\s]+)/i)?.[1]
  if (icon) {
    try {
      const url = sanitizeAvatarUrl(decodeURIComponent(icon))
      if (url)
        return url
    }
    catch {}
  }

  let fallback: string | undefined
  for (const match of source.matchAll(/<img\b[^>]*>/gi)) {
    const tag = match[0]
    const src = tag.match(/\bsrc=["'](https?:\/\/[^"']+)["']/i)?.[1]
    if (!src)
      continue
    const url = sanitizeAvatarUrl(src)
    if (!url)
      continue
    const circular = /border-radius\s*:\s*(?:50%|100%|999px)/i.test(tag) || /\b(?:avatar|portrait)\b/i.test(tag)
    if (circular && isLikelyAvatarUrl(url))
      return url
    if (!fallback && isLikelyAvatarUrl(url))
      fallback = url
  }
  return fallback
}

function isLikelyAvatarUrl(value: string): boolean {
  try {
    const url = new URL(value)
    const host = url.hostname
    if (/(?:^|\.)(?:qlogo\.cn|qpic\.cn)$/i.test(host))
      return true
    if (/(?:^|\.)gravatar\.com$/i.test(host))
      return url.pathname.includes('/avatar/')
    if (/(?:^|\.)githubusercontent\.com$/i.test(host))
      return url.pathname.includes('avatars')
    if (/(?:^|\.)(?:licdn\.com|linkedin\.com)$/i.test(host))
      return /profile|dms\/image/i.test(url.pathname)
    return false
  }
  catch {
    return false
  }
}

function sanitizeAvatarUrl(value: string): string | undefined {
  try {
    const url = new URL(value.trim())
    if (url.protocol === 'http:')
      url.protocol = 'https:'
    if (url.protocol !== 'https:')
      return undefined
    return url.href
  }
  catch {
    return undefined
  }
}

export function matchesFolder(message: MailMessageSummary, folder: MailFolder): boolean {
  if (folder === 'starred')
    return message.starred && message.folder !== 'trash'
  if (folder === 'snoozed')
    return false
  return message.folder === folder
}
