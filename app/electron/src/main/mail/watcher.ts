import type { MailAccount } from '@fumika/state'
import type { ImapFlow } from 'imapflow'
import type { MailCredential } from './transport'
import { createImapClient } from './transport'

const RETRY_DELAYS = [5_000, 15_000, 30_000, 60_000, 5 * 60_000] as const
const POLL_INTERVAL = 4_000

export interface MailWatchCallbacks {
  onMessage: (client: ImapFlow) => Promise<void> | void
  onError?: (error: unknown) => void
}

export class MailAccountWatcher {
  private client?: ImapFlow
  private retryTimer?: ReturnType<typeof setTimeout>
  private pollTimer?: ReturnType<typeof setInterval>
  private stopped = true
  private retryAttempt = 0
  private messagePending = false
  private messageFlush?: Promise<void>
  private connectionGeneration = 0

  constructor(
    private readonly account: MailAccount,
    private readonly getCredential: () => Promise<MailCredential>,
    private readonly callbacks: MailWatchCallbacks,
  ) {}

  start(): void {
    if (!this.stopped)
      return
    this.stopped = false
    void this.connect(this.connectionGeneration)
  }

  async stop(): Promise<void> {
    if (this.stopped)
      return
    this.stopped = true
    this.connectionGeneration++
    this.clearTimers()
    const client = this.client
    this.client = undefined
    if (client)
      await closeImap(client)
  }

  async useClient<T>(fn: (client: ImapFlow) => Promise<T>): Promise<T> {
    const client = this.client
    if (!client?.usable)
      throw new Error('Mailbox connection is not ready.')
    interruptIdle(client)
    try {
      return await fn(client)
    }
    finally {
      if (client.usable && client.mailbox && client.mailbox.path.toLowerCase() !== 'inbox')
        await client.mailboxOpen('INBOX').catch(() => undefined)
    }
  }

  private async connect(generation: number): Promise<void> {
    if (this.stopped || generation !== this.connectionGeneration)
      return

    try {
      const credential = await this.getCredential()
      if (this.stopped || generation !== this.connectionGeneration)
        return

      const client = await createImapClient(this.account.imap, credential, { watch: true })
      this.client = client
      client.on('exists', ({ count, prevCount }) => {
        if (count > prevCount)
          this.queueMessage()
      })
      client.on('error', error => this.callbacks.onError?.(error))
      client.once('close', () => {
        if (this.client === client)
          this.client = undefined
        this.clearPoll()
        if (!this.stopped)
          this.scheduleReconnect()
      })
      await client.connect()
      if (this.stopped || generation !== this.connectionGeneration || this.client !== client) {
        await closeImap(client)
        return
      }
      await client.mailboxOpen('INBOX')
      this.retryAttempt = 0
      this.startPoll(client)
      this.queueMessage()
      await this.listen(client, generation)
    }
    catch (error) {
      const client = this.client
      this.client = undefined
      this.clearPoll()
      if (client)
        await closeImap(client)
      if (!this.stopped && generation === this.connectionGeneration) {
        this.callbacks.onError?.(error)
        this.scheduleReconnect()
      }
    }
  }

  private async listen(client: ImapFlow, generation: number): Promise<void> {
    while (!this.stopped && generation === this.connectionGeneration && this.client === client && client.usable) {
      await this.flushMessages()
      if (this.stopped || generation !== this.connectionGeneration || this.client !== client || !client.usable)
        return
      try {
        const ok = await client.idle()
        if (ok === false) {
          if (!this.stopped && this.client === client)
            client.close()
          return
        }
      }
      catch (error) {
        if (this.stopped || this.client !== client)
          return
        this.callbacks.onError?.(error)
        client.close()
        return
      }
    }
  }

  private startPoll(client: ImapFlow): void {
    this.clearPoll()
    this.pollTimer = setInterval(() => {
      if (this.stopped || this.client !== client)
        return
      this.queueMessage()
    }, POLL_INTERVAL)
    this.pollTimer.unref?.()
  }

  private clearPoll(): void {
    clearInterval(this.pollTimer)
    this.pollTimer = undefined
  }

  private clearTimers(): void {
    clearTimeout(this.retryTimer)
    this.retryTimer = undefined
    this.clearPoll()
  }

  private scheduleReconnect(): void {
    if (this.stopped || this.retryTimer)
      return
    const delay = RETRY_DELAYS[Math.min(this.retryAttempt, RETRY_DELAYS.length - 1)]
    this.retryAttempt++
    this.retryTimer = setTimeout(() => {
      this.retryTimer = undefined
      void this.connect(this.connectionGeneration)
    }, delay)
    this.retryTimer.unref?.()
  }

  private queueMessage(): void {
    this.messagePending = true
    const client = this.client
    if (client?.usable)
      interruptIdle(client)
    void this.flushMessages()
  }

  private async flushMessages(): Promise<void> {
    if (this.messageFlush)
      return this.messageFlush
    this.messageFlush = this.runFlush().finally(() => {
      this.messageFlush = undefined
    })
    return this.messageFlush
  }

  private async runFlush(): Promise<void> {
    const client = this.client
    if (!client)
      return
    while (this.messagePending && !this.stopped && this.client === client) {
      this.messagePending = false
      try {
        await this.callbacks.onMessage(client)
      }
      catch (error) {
        this.callbacks.onError?.(error)
      }
    }
  }
}

function interruptIdle(client: ImapFlow): void {
  const preCheck = Reflect.get(client, 'preCheck')
  if (typeof preCheck === 'function')
    void (preCheck as () => Promise<unknown>)()
}

async function closeImap(client: ImapFlow): Promise<void> {
  if (client.usable)
    await client.logout().catch(() => client.close())
  else
    client.close()
}
