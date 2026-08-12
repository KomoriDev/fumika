import type { Context } from 'cordis'
import type { Component, MaybeRefOrGetter } from 'vue'
import type { RouteLocationNormalized, Router } from 'vue-router'
import { Service } from 'cordis'
import { isRef, markRaw, shallowReactive, toValue } from 'vue'
import { createRouter, createWebHashHistory } from 'vue-router'
import DefaultLayout from '../layouts/default.vue'

const APP_ROUTE = 'fumika:app'
const FALLBACK_ROUTE = 'fumika:fallback'

declare module 'vue-router' {
  interface RouteMeta {
    activity?: Activity
    fallback?: boolean
  }
}

declare module 'cordis' {
  interface Events {
    activity: (activity: Activity) => boolean
  }
}

export interface ActivityOptions {
  id?: string
  path: string
  component: Component
  name: MaybeRefOrGetter<string>
  description?: MaybeRefOrGetter<string | undefined>
  icon?: MaybeRefOrGetter<string | Component | undefined>
  order?: number
  position?: 'top' | 'bottom'
  authority?: number
  home?: boolean | string
  disabled?: () => boolean | undefined
}

export class Activity {
  readonly id: string
  readonly path: string
  readonly order: number
  readonly position: 'top' | 'bottom'
  readonly authority: number
  readonly home: boolean

  constructor(
    public readonly ctx: Context,
    public readonly options: ActivityOptions,
  ) {
    this.id = options.id ?? createActivityId(options.path)
    this.path = options.path
    this.order = options.order ?? 0
    this.position = options.position ?? 'top'
    this.authority = options.authority ?? 0
    this.home = Boolean(options.home)
  }

  get name(): string {
    return toValue(this.options.name)
  }

  get description(): string | undefined {
    return toValue(this.options.description)
  }

  get icon(): string | Component | undefined {
    return toValue(this.options.icon)
  }

  get homePath(): string {
    return typeof this.options.home === 'string' ? this.options.home : this.path
  }

  get disabled(): boolean {
    return Boolean(this.ctx.bail('activity', this) || this.options.disabled?.())
  }
}

export interface ClientSlotOptions {
  id?: string
  type: string
  component: Component
  order?: number
  disabled?: () => boolean | undefined
}

export class RouterModule {
  readonly pages = shallowReactive(new Map<string, Activity>())
  readonly views = shallowReactive(new Map<string, ClientSlotOptions[]>())
  readonly cache = shallowReactive(new Map<string, string>())
  readonly router: Router
  private pendingPath?: string
  private accountsReady = false
  private hasMailAccounts = true
  private initialTitle = document.title

  constructor(public ctx: Context) {
    Object.defineProperty(this, Service.tracker, {
      value: { property: 'ctx' },
    })

    this.router = createRouter({
      history: createWebHashHistory(),
      linkActiveClass: 'active',
      routes: [
        {
          path: '/',
          name: APP_ROUTE,
          component: DefaultLayout,
          children: [],
        },
        {
          path: '/:pathMatch(.*)*',
          name: FALLBACK_ROUTE,
          component: DefaultLayout,
          meta: { fallback: true },
        },
      ],
    })

    ctx.effect(() => {
      const disposeBefore = this.router.beforeEach(to => this.resolveNavigation(to))
      const disposeAfter = this.router.afterEach(to => this.afterNavigation(to))
      return () => {
        disposeBefore()
        disposeAfter()
        document.title = this.initialTitle
      }
    })

    ctx.inject(['link'], injected => injected.effect(() => injected.link.on('mail-account.changed', ({ accounts }) => {
      this.accountsReady = true
      this.hasMailAccounts = accounts.length > 0
    })))
  }

  get home(): string {
    const pages = [...this.pages.values()].filter(page => !page.disabled)
    return pages.find(page => page.home)?.homePath
      ?? pages.sort(compareActivities)[0]?.homePath
      ?? '/'
  }

  page(options: ActivityOptions) {
    const owner = this.ctx
    const component = owner.client.wrapComponent(options.component)
    const icon = options.icon
    if (icon && typeof icon === 'object' && !isRef(icon))
      markRaw(icon)

    return owner.effect(() => {
      const activity = new Activity(owner, { ...options, component })
      if (this.pages.has(activity.id))
        throw new Error(`page already registered: ${activity.id}`)

      markRaw(activity)
      const removeRoute = this.router.addRoute(APP_ROUTE, {
        path: normalizeChildPath(activity.path),
        name: activity.id,
        component,
        meta: { activity },
      })
      this.pages.set(activity.id, activity)
      void this.restorePendingPath()

      return () => {
        const current = this.router.currentRoute.value
        this.pages.delete(activity.id)
        removeRoute()
        if (current.meta.activity?.id === activity.id)
          void this.router.replace(this.home)
      }
    })
  }

  slot(options: ClientSlotOptions) {
    const owner = this.ctx
    const entry: ClientSlotOptions = {
      ...options,
      id: options.id ?? `${options.type}:${String(options.component)}`,
      order: options.order ?? 0,
      component: owner.client.wrapComponent(options.component),
    }
    markRaw(entry.component)

    return owner.effect(() => {
      const list = this.views.get(entry.type) ?? []
      if (entry.id && list.some(item => item.id === entry.id))
        throw new Error(`slot already registered: ${entry.id}`)
      list.push(entry)
      list.sort((left, right) => (left.order ?? 0) - (right.order ?? 0))
      this.views.set(entry.type, list)

      return () => {
        const current = this.views.get(entry.type)
        if (!current)
          return
        const retained = current.filter(item => item !== entry)
        if (retained.length)
          this.views.set(entry.type, retained)
        else
          this.views.delete(entry.type)
      }
    })
  }

  setMailAccountsAvailable(available: boolean): void {
    this.accountsReady = true
    this.hasMailAccounts = available
  }

  private async resolveMailAccountNavigation(to: RouteLocationNormalized): Promise<string | undefined> {
    if (to.path === '/accounts')
      return undefined
    if (!this.accountsReady) {
      const link = this.ctx.get('link')
      if (!link)
        return undefined
      try {
        const reply = await link.action('mail-account.list')
        this.accountsReady = true
        this.hasMailAccounts = reply.accounts.length > 0
      }
      catch {
        return undefined
      }
    }
    return this.hasMailAccounts ? undefined : '/accounts'
  }

  private async resolveNavigation(to: RouteLocationNormalized): Promise<string | true | undefined> {
    const accountRedirect = await this.resolveMailAccountNavigation(to)
    if (accountRedirect)
      return accountRedirect
    if (to.meta.fallback) {
      this.pendingPath = to.fullPath
      const home = this.home
      if (home !== to.fullPath)
        return home
      return true
    }

    if (to.name === APP_ROUTE && to.path === '/') {
      const home = this.home
      if (home !== '/')
        return home
    }

    return true
  }

  private afterNavigation(to: RouteLocationNormalized): void {
    if (to.meta.fallback) {
      this.pendingPath = to.fullPath
      void this.restorePendingPath()
      return
    }

    const activity = to.meta.activity
    if (!activity)
      return

    this.cache.set(activity.id, to.fullPath)
    document.title = this.initialTitle
      ? `${activity.name} | ${this.initialTitle}`
      : activity.name
  }

  private async restorePendingPath(): Promise<void> {
    if (!this.pendingPath)
      return
    const target = this.router.resolve(this.pendingPath)
    if (!target.matched.some(record => record.meta.activity))
      return
    const pending = this.pendingPath
    this.pendingPath = undefined
    await this.router.replace(pending)
  }
}

function createActivityId(path: string): string {
  const normalized = path.replace(/^\/+|\/+$/g, '')
  return normalized.replace(/[^\w-]+/g, '-') || 'home'
}

function normalizeChildPath(path: string): string {
  return path === '/' ? '' : path.replace(/^\//, '')
}

function compareActivities(left: Activity, right: Activity): number {
  if (left.position !== right.position)
    return left.position === 'top' ? -1 : 1
  return left.order - right.order || left.id.localeCompare(right.id)
}

export function sortedActivities(pages: Iterable<Activity>): Activity[] {
  return [...pages].filter(page => !page.disabled).sort(compareActivities)
}

export default RouterModule
