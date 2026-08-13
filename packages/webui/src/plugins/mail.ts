import type {
  MailFolder,
  MailMessageListReply,
  MailMessageSummary,
} from '@fumika/state'
import type { Context } from 'cordis'
import { Service } from 'cordis'
import { reactive } from 'vue'

export interface MailQuery {
  folder: MailFolder
  query?: string
  limit?: number
}

function emptyCounts(): Record<MailFolder, number> {
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

declare module 'cordis' {
  interface Context {
    mailStore: MailModule
  }
}

export default class MailModule extends Service {
  static inject = ['link']
  readonly messages = reactive(new Map<string, MailMessageSummary[]>())
  readonly counts = reactive(emptyCounts())
  readonly unreadCounts = reactive(emptyCounts())
  readonly errors = reactive<string[]>([])
  private readonly loaded = new Set<string>()
  private readonly inflight = new Map<string, Promise<MailMessageListReply>>()
  private initialRefreshStarted = false

  constructor(ctx: Context) {
    super(ctx, 'mailStore')
  }

  async* [Service.init]() {
    yield this.ctx.link.on('mail-message.changed', () => {
      if (!this.loaded.size)
        return
      void this.reloadLoadedQueries()
    })
  }

  key(query: MailQuery): string {
    return `${query.folder}\u0000${query.query?.trim().toLowerCase() ?? ''}\u0000${query.limit ?? 200}`
  }

  get(query: MailQuery): MailMessageSummary[] {
    return this.messages.get(this.key(query)) ?? []
  }

  findMessage(id: string): MailMessageSummary | undefined {
    for (const messages of this.messages.values()) {
      const message = messages.find(item => item.id === id)
      if (message)
        return message
    }
    return undefined
  }

  has(query: MailQuery): boolean {
    return this.loaded.has(this.key(query))
  }

  async load(query: MailQuery, refresh = false): Promise<MailMessageListReply> {
    const key = this.key(query)
    if (!refresh && this.loaded.has(key)) {
      return {
        messages: this.messages.get(key) ?? [],
        refreshedAt: Date.now(),
        errors: this.errors.map(message => ({ accountId: '', message })),
        counts: { ...this.counts },
        unreadCounts: { ...this.unreadCounts },
      }
    }
    const existing = this.inflight.get(key)
    if (existing && !refresh)
      return existing

    const request = this.ctx.link.action('mail-message.list', {
      folder: query.folder,
      query: query.query,
      limit: query.limit ?? 200,
      refresh,
    }, { timeout: refresh ? 2 * 60_000 : 30_000 })
      .then((reply) => {
        this.messages.set(key, reply.messages)
        if (refresh)
          this.loaded.clear()
        this.loaded.add(key)
        this.replaceCounts(reply)
        this.errors.splice(0, this.errors.length, ...reply.errors.map(item => item.message))
        return reply
      })
      .finally(() => this.inflight.delete(key))
    this.inflight.set(key, request)
    return request
  }

  async refreshOnce(query: MailQuery): Promise<void> {
    if (this.initialRefreshStarted)
      return
    this.initialRefreshStarted = true
    try {
      await this.load(query, true)
    }
    catch (reason) {
      const message = reason instanceof Error ? reason.message : String(reason)
      this.errors.splice(0, this.errors.length, message)
    }
  }

  replaceMessage(updated: MailMessageSummary): void {
    let previous: MailMessageSummary | undefined
    for (const [key, messages] of this.messages) {
      const index = messages.findIndex(message => message.id === updated.id)
      if (index < 0)
        continue
      previous ??= messages[index]
      if (key.startsWith('starred\u0000') && !updated.starred)
        messages.splice(index, 1)
      else
        messages[index] = updated
    }
    if (!previous)
      return
    if (previous.unread !== updated.unread) {
      const delta = updated.unread ? 1 : -1
      this.unreadCounts[updated.folder] = Math.max(0, this.unreadCounts[updated.folder] + delta)
      if (updated.starred)
        this.unreadCounts.starred = Math.max(0, this.unreadCounts.starred + delta)
    }
    if (previous.starred !== updated.starred) {
      const delta = updated.starred ? 1 : -1
      this.counts.starred = Math.max(0, this.counts.starred + delta)
      if (updated.unread)
        this.unreadCounts.starred = Math.max(0, this.unreadCounts.starred + delta)
    }
  }

  private async reloadLoadedQueries(): Promise<void> {
    const queries = [...this.loaded].map(parseKey)
    try {
      await Promise.all(queries.map(query => this.loadCached(query)))
    }
    catch (reason) {
      const message = reason instanceof Error ? reason.message : String(reason)
      this.errors.splice(0, this.errors.length, message)
    }
  }

  private async loadCached(query: MailQuery): Promise<void> {
    const key = this.key(query)
    const reply = await this.ctx.link.action('mail-message.list', {
      folder: query.folder,
      query: query.query,
      limit: query.limit ?? 200,
      refresh: false,
    })
    this.messages.set(key, reply.messages)
    this.loaded.add(key)
    this.replaceCounts(reply)
    this.errors.splice(0, this.errors.length, ...reply.errors.map(item => item.message))
  }

  private replaceCounts(reply: Pick<MailMessageListReply, 'counts' | 'unreadCounts'>): void {
    Object.assign(this.counts, reply.counts)
    Object.assign(this.unreadCounts, reply.unreadCounts)
  }

  resetForAccountChange(): void {
    this.messages.clear()
    this.loaded.clear()
    this.initialRefreshStarted = false
  }
}

function parseKey(key: string): MailQuery {
  const [folder, query, limit] = key.split('\u0000')
  return {
    folder: folder as MailFolder,
    query: query || undefined,
    limit: Number(limit) || 200,
  }
}
