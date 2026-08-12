import { Context, Service } from 'cordis'

export class LinkError extends Error {
  constructor(
    public readonly code: Link.ErrorCode | string | undefined,
    message: string,
  ) {
    super(message)
    this.name = 'LinkError'
  }
}

declare module 'cordis' {
  interface Context {
    link: Link
  }
  interface Events {
    'link/status': (status: Link.Status) => void
    'link/send': (event: string, data: any) => void
  }
}

export abstract class Link<C extends Context = Context, O extends Link.Config = Link.Config> extends Service<O> {
  static PREFIX = 'fumika'

  protected eventListeners = new Map<string, Link.Listener<any>[]>()

  constructor(protected ctx: C, public config: O = {} as O) {
    super(ctx, 'link')
  }

  action<K extends Link.ActionName>(
    path: K,
    handler: Link.ActionHandler<Link.ActionInput<K>, Link.ActionOutput<K>>,
  ): () => void
  action<K extends Link.ActionName>(
    path: K,
    ...args: Link.ActionArguments<K>
  ): Promise<Link.ActionOutput<K>>
  action<T, R>(path: string, handler: Link.ActionHandler<T, R>): () => void
  action<T, R>(path: string, payload?: T): Promise<R>
  action<T, R>(path: string, payload: T, options: Link.ActionOptions): Promise<R>
  action<T, R>(path: string, arg?: Link.ActionHandler<T, R> | T, options?: Link.ActionOptions) {
    if (typeof arg === 'function') {
      return this.handle<T, R>(path, arg as Link.ActionHandler<T, R>)
    }
    return this.invoke<T, R>(path, arg as T, options?.timeout)
  }

  protected get log() {
    return this.ctx.logger('link')
  }

  on<K extends Link.EventName>(event: K, listener: Link.Listener<Link.EventPayload<K>>): () => void
  on<T>(event: string, listener: Link.Listener<T>): () => void
  on(event: string, listener: Link.Listener<any>): () => void {
    const list = this.eventListeners.get(event) ?? []
    list.push(listener as Link.Listener<any>)
    this.eventListeners.set(event, list)
    return () => {
      const current = this.eventListeners.get(event) ?? []
      const next = current.filter(l => l !== (listener as Link.Listener<any>))
      if (next.length) {
        this.eventListeners.set(event, next)
      }
      else {
        this.eventListeners.delete(event)
      }
    }
  }

  protected handle<T, R>(_path: string, _handler: Link.ActionHandler<T, R>): () => void {
    return () => {}
  }

  protected async invoke<T, R>(path: string, payload?: T, timeout?: number): Promise<R> {
    const res = await this.call<T, R>(path, payload, timeout)
    if (res.error) {
      throw new LinkError(res.error.code, res.error.message)
    }
    return res.data as R
  }

  protected abstract call<T, R>(path: string, payload?: T, timeout?: number): Promise<Link.Response<R>>
}

export namespace Link {
  export interface Action<T = void, R = void> {
    input: T
    output: R
  }

  export interface Actions {}
  export interface Events {}
  export interface Config {}
  export type ActionName = keyof Actions & string
  export type EventName = keyof Events & string

  export type ActionInput<K extends ActionName>
    = Actions[K] extends Action<infer T, unknown> ? T : never

  export type ActionOutput<K extends ActionName>
    = Actions[K] extends Action<unknown, infer R> ? R : never

  export type EventPayload<K extends EventName> = Events[K]

  export interface ActionOptions {
    timeout?: number
  }

  export type ActionArguments<K extends ActionName>
    = undefined extends ActionInput<K>
      ? [payload?: ActionInput<K>, options?: ActionOptions]
      : [payload: ActionInput<K>, options?: ActionOptions]

  export type ActionHandler<T = any, R = any> = (
    payload: T,
  ) => R | Promise<R>

  export type Listener<T> = (data: T) => void

  export type Status = 'connecting' | 'connected' | 'disconnected' | 'error'

  export enum ErrorCode {
    ENOSYS = 'ENOSYS',
    ENOTCONN = 'ENOTCONN',
    ETIMEOUT = 'ETIMEOUT',
    ENOENT = 'ENOENT',
    EIPC = 'EIPC',
    EDISPOSED = 'EDISPOSED',
    EINTERNAL = 'EINTERNAL',
  }

  export interface Error {
    code?: ErrorCode | string
    message: string
  }

  export interface Response<T> {
    id: string
    data?: T
    error?: Error
  }

  export const ACTION_TIMEOUT_MS = 15_000

  export async function withTimeout<T>(promise: Promise<T>, ms = ACTION_TIMEOUT_MS): Promise<T> {
    let id: ReturnType<typeof setTimeout>
    try {
      return await Promise.race([
        promise,
        new Promise<never>((_, reject) => {
          id = setTimeout(
            () => reject(new LinkError(ErrorCode.ETIMEOUT, `request timed out after ${ms}ms`)),
            ms,
          )
        }),
      ])
    }
    finally {
      clearTimeout(id!)
    }
  }
}

export default Link
