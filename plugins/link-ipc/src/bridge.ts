import type { Link } from '@fumika/link'

const CHANNEL_NAME_PATTERN = /^[a-z][a-z0-9]*(?:[._-][a-z0-9]+)*$/i
const CHANNEL_PREFIX = 'fumika'

export interface FumikaBridge {
  invoke: <T = unknown, R = unknown>(action: string, payload?: T) => Promise<Link.Response<R>>
  subscribe: (event: string, callback: (data: unknown) => void) => number
  unsubscribe: (subscriptionId: number) => void
}

export function toActionChannel(action: string): string {
  if (!CHANNEL_NAME_PATTERN.test(action))
    throw new TypeError(`invalid action name: ${action}`)
  return `${CHANNEL_PREFIX}:action:${action}`
}

export function toEventChannel(event: string): string {
  if (!CHANNEL_NAME_PATTERN.test(event))
    throw new TypeError(`invalid event name: ${event}`)
  return `${CHANNEL_PREFIX}:event:${event}`
}

declare global {
  interface Window {
    fumika?: FumikaBridge
  }
}
