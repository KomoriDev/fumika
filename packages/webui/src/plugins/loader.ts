import type { Link } from '@fumika/link'
import type { Context } from 'cordis'
import type { Ref, ShallowRef } from 'vue'
import { Service } from 'cordis'
import { reactive, ref, shallowReactive, shallowRef } from 'vue'

const ENTRY_PATTERN = /^[a-z][\w-]*$/i

export interface LoaderEntry<T = unknown> {
  readonly data: ShallowRef<T | undefined>
  readonly error: ShallowRef<unknown>
  readonly loading: Ref<boolean>
  readonly ready: Ref<boolean>
}

export const loaderStore = shallowReactive<Record<string, unknown>>({})

export class LoaderModule {
  readonly entries = shallowReactive(new Map<string, LoaderEntry>())
  readonly state = reactive({ ready: false })
  readonly initTask: Promise<void>

  constructor(public ctx: Context) {
    Object.defineProperty(this, Service.tracker, {
      value: { property: 'ctx' },
    })

    this.initTask = Promise.resolve().then(() => {
      this.state.ready = true
    })
  }

  addEntry<T = unknown>(key: string) {
    if (!ENTRY_PATTERN.test(key))
      throw new TypeError(`invalid loader entry key: ${key}`)

    const owner = this.ctx
    return owner.effect(() => {
      if (this.entries.has(key))
        throw new Error(`loader entry already registered: ${key}`)

      const entry: LoaderEntry<T> = {
        data: shallowRef<T>(),
        error: shallowRef(),
        loading: ref(true),
        ready: ref(false),
      }
      this.entries.set(key, entry)

      let disconnect = () => {}
      let requestId = 0

      const connect = () => {
        disconnect()
        disconnect = () => {}
        requestId += 1

        const link = owner.get('link') as Link | undefined
        if (!link) {
          entry.loading.value = false
          entry.ready.value = false
          entry.error.value = new Error('link service is unavailable')
          return
        }

        entry.loading.value = true
        entry.error.value = undefined
        const currentRequest = requestId
        const disposers = [
          link.on<T>(`data.${key}`, (value) => {
            entry.error.value = undefined
            entry.data.value = value
            loaderStore[key] = value
            entry.loading.value = false
            entry.ready.value = true
          }),
          link.on<Record<string, unknown>>(`data.${key}.patch`, (patch) => {
            const current = entry.data.value
            if (!current || typeof current !== 'object' || Array.isArray(current))
              return
            const value = { ...current as Record<string, unknown>, ...patch } as T
            entry.data.value = value
            entry.error.value = undefined
            entry.ready.value = true
            loaderStore[key] = value
          }),
        ]

        void link.action<undefined, T>(`data.${key}.get`, undefined)
          .then((value) => {
            if (currentRequest !== requestId)
              return
            entry.data.value = value
            loaderStore[key] = value
            entry.ready.value = true
          })
          .catch((error: unknown) => {
            if (currentRequest === requestId)
              entry.error.value = error
          })
          .finally(() => {
            if (currentRequest === requestId)
              entry.loading.value = false
          })

        disconnect = () => {
          requestId += 1
          for (const dispose of disposers)
            dispose()
        }
      }

      connect()
      const disposeService = owner.on('internal/service', (name) => {
        if (name === 'link')
          connect()
      }, { global: true })

      return () => {
        disposeService()
        disconnect()
        this.entries.delete(key)
        delete loaderStore[key]
      }
    })
  }

  get<T = unknown>(key: string): LoaderEntry<T> | undefined {
    return this.entries.get(key) as LoaderEntry<T> | undefined
  }
}

export default LoaderModule
