import type { Context } from 'cordis'
import type { Ref } from 'vue'
import { Service } from 'cordis'
import { inject, markRaw, onScopeDispose, ref } from 'vue'

declare module 'cordis' {
  interface Context {
    version: string
  }
}

export const contextKey = Symbol('fumika.context')

export function useContext(): Context {
  const parent = inject<Context>(contextKey)
  if (!parent)
    throw new Error('Cordis context is unavailable')

  const fiber = parent.plugin(() => {})
  onScopeDispose(() => void fiber.dispose())
  return fiber.ctx
}

export function useInject<K extends string & keyof Context>(name: K): Ref<Context[K] | undefined> {
  const parent = inject<Context>(contextKey)
  if (!parent)
    throw new Error('Cordis context is unavailable')

  const initial = parent.get(name)
  const service = ref(markService(initial)) as Ref<Context[K] | undefined>
  onScopeDispose(parent.on('internal/service', (serviceName) => {
    if (serviceName === name)
      service.value = markService(parent.get(name)) as Context[K] | undefined
  }, { global: true }))
  return service
}

function markService<T>(value: T): T {
  return typeof value === 'object' && value
    ? markRaw(value as object) as T
    : value
}

markRaw(Service.prototype)
