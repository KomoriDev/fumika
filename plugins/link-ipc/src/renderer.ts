import type { Context } from 'cordis'
import type { FumikaBridge } from './bridge.js'
import { Link, LinkError } from '@fumika/link'
import { Service } from 'cordis'

export class LinkIpcClient<C extends Context = Context> extends Link<C> {
  private readonly subscriptions = new Map<string, number>()

  private get bridge(): FumikaBridge | undefined {
    if (typeof window === 'undefined')
      return undefined
    return window.fumika
  }

  on<T = any>(event: string, listener: Link.Listener<T>) {
    const dispose = super.on(event, listener)
    this.syncEvent(event)

    return () => {
      dispose()
      this.syncEvent(event)
    }
  }

  async* [Service.init]() {
    if (!this.bridge) {
      this.ctx.emit('link/status', 'disconnected')
      return
    }

    for (const event of this.eventListeners.keys()) this.syncEvent(event)
    this.ctx.emit('link/status', 'connected')

    yield () => {
      const bridge = this.bridge
      if (bridge) {
        for (const subscriptionId of this.subscriptions.values()) {
          bridge.unsubscribe(subscriptionId)
        }
      }
      this.subscriptions.clear()
      this.eventListeners.clear()
      this.ctx.emit('link/status', 'disconnected')
    }
  }

  protected async call<T, R>(path: string, payload?: T, timeout?: number): Promise<Link.Response<R>> {
    const bridge = this.bridge
    if (!bridge) {
      this.log.warn('invoke %s: preload bridge not available', path)
      return {
        id: path,
        error: { code: Link.ErrorCode.ENOSYS, message: 'preload bridge is unavailable' },
      }
    }

    this.log.debug('→ %s', path)
    try {
      const result = await Link.withTimeout(bridge.invoke<T, R>(path, payload), timeout)
      this.log.debug('← %s success', path)
      return { ...result, id: path }
    }
    catch (err) {
      this.log.warn('← %s error: %s', path, err instanceof Error ? err.message : String(err))
      if (err instanceof LinkError)
        return { id: path, error: { code: err.code, message: err.message } }
      const code = (err as Record<string, unknown>)?.code ?? Link.ErrorCode.EIPC
      const message = err instanceof Error ? err.message : String(err)
      return { id: path, error: { code: code as string, message } }
    }
  }

  private syncEvent(event: string) {
    const bridge = this.bridge
    const subscriptionId = this.subscriptions.get(event)
    const hasListeners = (this.eventListeners.get(event)?.length ?? 0) > 0

    if (!hasListeners && subscriptionId !== undefined) {
      bridge?.unsubscribe(subscriptionId)
      this.subscriptions.delete(event)
      return
    }

    if (bridge && hasListeners && subscriptionId === undefined) {
      const nextSubscriptionId = bridge.subscribe(event, (data) => {
        for (const listener of this.eventListeners.get(event) ?? []) listener(data)
      })
      this.subscriptions.set(event, nextSubscriptionId)
    }
  }
}
