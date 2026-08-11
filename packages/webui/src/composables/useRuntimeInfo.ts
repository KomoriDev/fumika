import type { RuntimeInfo } from '@fumika/contracts'
import { computed } from 'vue'
import { useContext } from '@/context'

export type RuntimeStatus = 'connecting' | 'ready' | 'unavailable' | 'error'

const statusPresentation = {
  connecting: {
    label: 'Connecting',
    class: 'border-amber-200 bg-amber-50 text-amber-700',
    dotClass: 'bg-amber-500',
  },
  ready: {
    label: 'Desktop connected',
    class: 'border-emerald-200 bg-emerald-50 text-emerald-700',
    dotClass: 'bg-emerald-500',
  },
  unavailable: {
    label: 'Desktop unavailable',
    class: 'border-neutral-200 bg-neutral-100 text-neutral-600',
    dotClass: 'bg-neutral-400',
  },
  error: {
    label: 'Connection error',
    class: 'border-red-200 bg-red-50 text-red-700',
    dotClass: 'bg-red-500',
  },
} as const

export function useRuntimeInfo() {
  const ctx = useContext()
  const entry = computed(() => ctx.client.loader.get<RuntimeInfo>('runtime'))
  const runtime = computed(() => entry.value?.data.value)
  const status = computed<RuntimeStatus>(() => {
    if (!entry.value)
      return 'unavailable'
    if (entry.value.error.value)
      return 'error'
    if (entry.value.ready.value)
      return 'ready'
    return 'connecting'
  })

  const versionSummary = computed(() => {
    if (!runtime.value)
      return 'Waiting for desktop host'
    return `Electron ${runtime.value.versions.electron} · Chromium ${runtime.value.versions.chrome}`
  })

  const statusMeta = computed(() => statusPresentation[status.value])

  return {
    runtime,
    status,
    statusMeta,
    versionSummary,
  }
}
