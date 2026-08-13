import type { MailAccount } from '@fumika/state'
import type { ImapFlow } from 'imapflow'
import type { MailCredential } from './transport'
import { createImapClient } from './transport'

const RETRY_DELAYS = [5_000, 15_000, 30_000, 60_000, 5 * 60_000] as const

export interface MailWatchCallbacks {
  onMessage: () => Promise<void> | void
  onError?: (error: unknown) => void
}

export class MailAccountWatcher {
  private client?: ImapFlow
  private retryTimer?: ReturnType<typeof setTimeout>
  private stopped = true
  private retryAttempt = 0
  private messagePending = false
  private messageRunning = false
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
    clearTimeout(this.retryTimer)
    this.retryTimer = undefined
    const client = this.client
    this.client = undefined
    if (client)
      await closeImap(client)
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
        if (!this.stopped)
          this.scheduleReconnect()
      })
      await client.connect()
      if (this.stopped || generation !== this.connectionGeneration || this.client !== client) {
        await closeImap(client)
        return
      }
      await client.mailboxOpen('INBOX', { readOnly: true })
      await this.callbacks.onMessage()
      this.retryAttempt = 0
      void client.idle().catch((error) => {
        if (this.stopped || this.client !== client)
          return
        this.callbacks.onError?.(error)
        client.close()
      })
    }
    catch (error) {
      const client = this.client
      this.client = undefined
      if (client)
        await closeImap(client)
      if (!this.stopped && generation === this.connectionGeneration) {
        this.callbacks.onError?.(error)
        this.scheduleReconnect()
      }
    }
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
    if (!this.messageRunning)
      void this.flushMessages()
  }

  private async flushMessages(): Promise<void> {
    this.messageRunning = true
    try {
      while (this.messagePending && !this.stopped) {
        this.messagePending = false
        try {
          await this.callbacks.onMessage()
        }
        catch (error) {
          this.callbacks.onError?.(error)
        }
      }
    }
    finally {
      this.messageRunning = false
    }
  }
}

async function closeImap(client: ImapFlow): Promise<void> {
  if (client.usable)
    await client.logout().catch(() => client.close())
  else
    client.close()
}
