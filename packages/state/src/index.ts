import type { Mutation } from '@cordisjs/muon'
import type { Link } from '@fumika/link'
import type { Context } from 'cordis'
import { apply, observe } from '@cordisjs/muon'
import { Service } from 'cordis'

export * from './mail-account'
export { apply, DeltaState, observe } from '@cordisjs/muon'
export type { Delta, Mutation } from '@cordisjs/muon'

export interface ThemeState {
  mode: 'auto' | 'light' | 'dark'
  active: string
}

export interface AppPreferences {
  messagePreviews: boolean
  compactDensity: boolean
  desktopNotifications: boolean
}

export type SidebarShortcutIds = [string, string, string, string]

export const DEFAULT_SIDEBAR_SHORTCUTS = [
  'inbox',
  'starred',
  'sent',
  'drafts',
] satisfies SidebarShortcutIds

export interface AppNamespaceState {
  locale: string
  theme: ThemeState
  sidebar: {
    open: boolean
    showShortcuts: boolean
    shortcuts: SidebarShortcutIds
  }
  preferences: AppPreferences
}

export interface AppStateNamespaces {
  app: AppNamespaceState
  [namespace: string]: unknown
}

export const DEFAULT_STATE: AppStateNamespaces = {
  app: {
    locale: 'en-US',
    theme: {
      mode: 'auto',
      active: 'default',
    },
    sidebar: {
      open: true,
      showShortcuts: false,
      shortcuts: [...DEFAULT_SIDEBAR_SHORTCUTS],
    },
    preferences: {
      messagePreviews: true,
      compactDensity: false,
      desktopNotifications: true,
    },
  },
}

export interface AppStateGetReply {
  state: AppStateNamespaces
  cursor: unknown
  updatedAt: number
}

export interface AppStateUpdatePayload {
  delta: unknown
  source: string
}

export interface AppStateUpdateReply {
  ok: true
  cursor: unknown
}

export interface AppStateUpdatedEvent {
  delta?: unknown
  state?: AppStateNamespaces
  source?: string
  timestamp: number
}

type GetStateAction = Link.Action<void, AppStateGetReply>
type UpdateStateAction = Link.Action<AppStateUpdatePayload, AppStateUpdateReply>

declare module '@fumika/link' {
  namespace Link {
    interface Actions {
      'app-state.get': GetStateAction
      'app-state.update': UpdateStateAction
    }

    interface Events {
      'app-state.updated': AppStateUpdatedEvent
    }
  }
}

declare module 'cordis' {
  interface Context {
    appState: StateService
  }

  interface Events {
    'state/changed': (mutation: Mutation) => void
  }
}

export abstract class StateService extends Service {
  data: AppStateNamespaces = cloneState(DEFAULT_STATE)

  constructor(ctx: Context) {
    super(ctx, 'appState')
  }

  mutate(mutator: (state: AppStateNamespaces) => void): Mutation | null {
    const mutation = observe(this.data, mutator)
    if (!mutation)
      return null
    this.onMutate(mutation)
    return mutation
  }

  applyMutation(mutation: Mutation): void {
    apply(this.data, mutation)
    this.ctx.emit('state/changed', mutation)
  }

  snapshot(): AppStateNamespaces {
    return cloneState(this.data)
  }

  protected abstract onMutate(mutation: Mutation): void
}

export function cloneState<T>(value: T): T {
  return JSON.parse(JSON.stringify(value)) as T
}

export function resolveState(value: unknown): AppStateNamespaces {
  if (!isRecord(value))
    return cloneState(DEFAULT_STATE)

  const app = isRecord(value.app) ? value.app : {}
  const theme = isRecord(app.theme) ? app.theme : {}
  const sidebar = isRecord(app.sidebar) ? app.sidebar : {}
  const preferences = isRecord(app.preferences) ? app.preferences : {}

  return {
    ...cloneState(DEFAULT_STATE),
    ...value,
    app: {
      ...cloneState(DEFAULT_STATE.app),
      ...app,
      locale: typeof app.locale === 'string' ? app.locale : DEFAULT_STATE.app.locale,
      theme: {
        ...DEFAULT_STATE.app.theme,
        ...theme,
      },
      sidebar: {
        ...DEFAULT_STATE.app.sidebar,
        ...sidebar,
        showShortcuts: typeof sidebar.showShortcuts === 'boolean'
          ? sidebar.showShortcuts
          : DEFAULT_STATE.app.sidebar.showShortcuts,
        shortcuts: resolveSidebarShortcutIds(sidebar.shortcuts),
      },
      preferences: {
        ...DEFAULT_STATE.app.preferences,
        ...preferences,
      },
    },
  }
}

function resolveSidebarShortcutIds(value: unknown): SidebarShortcutIds {
  if (!isSidebarShortcutIds(value))
    return [...DEFAULT_SIDEBAR_SHORTCUTS]

  return [value[0], value[1], value[2], value[3]]
}

function isSidebarShortcutIds(value: unknown): value is SidebarShortcutIds {
  return Array.isArray(value)
    && value.length === 4
    && value.every(item => typeof item === 'string')
    && new Set(value).size === value.length
}

function isRecord(value: unknown): value is Record<string, any> {
  return Boolean(value) && typeof value === 'object' && !Array.isArray(value)
}
