import type { SchemaRenderer } from '@fumika/schemastery'
import type { Context } from 'cordis'
import type { Component, InjectionKey, App as VueApp } from 'vue'
import { createSchemaRenderer } from '@fumika/schemastery'
import { Service } from 'cordis'
import { createApp, defineComponent, h, markRaw, onErrorCaptured, provide } from 'vue'
import App from './App.vue'
import ClientSlot from './components/slot'
import { contextKey } from './context'
import ActionModule from './plugins/action'
import I18nModule from './plugins/i18n'
import LoaderModule from './plugins/loader'
import RouterModule from './plugins/router'
import SettingModule from './plugins/setting'
import ThemeModule from './plugins/theme'

declare module 'cordis' {
  interface Context {
    client: ClientService
  }
}

export type ClientPlatform = 'electron' | 'web'

export class ClientService extends Service {
  readonly app: VueApp
  readonly action: ActionModule
  readonly i18n: I18nModule
  readonly loader: LoaderModule
  readonly router: RouterModule
  readonly setting: SettingModule
  readonly theme: ThemeModule
  private mounted = false
  readonly schemastery: SchemaRenderer

  constructor(context: Context) {
    super(context, 'client')

    this.router = new RouterModule(context)
    this.i18n = new I18nModule(context)
    this.app = createApp(App)
    this.app.use(this.router.router)
    this.app.component('k-slot', ClientSlot)
    this.schemastery = createSchemaRenderer({
      resolveText: value => this.i18n.resolve(value),
    })
    this.app.use(this.i18n.i18n)
    this.app.provide(contextKey as InjectionKey<Context>, context)

    this.action = new ActionModule(context)

    this.app.use(this.schemastery)
    this.loader = new LoaderModule(context)
    this.theme = new ThemeModule(context)
    this.setting = new SettingModule(context)
    context.effect(() => () => this.unmount())
  }

  get platform(): ClientPlatform {
    return typeof window !== 'undefined' && 'fumika' in window ? 'electron' : 'web'
  }

  mount(target: string | Element): void {
    if (this.mounted)
      return
    this.app.mount(target)
    this.mounted = true
  }

  unmount(): void {
    if (!this.mounted)
      return
    this.app.unmount()
    this.mounted = false
  }

  addEventListener<K extends keyof WindowEventMap>(
    type: K,
    listener: (this: Window, event: WindowEventMap[K]) => unknown,
    options?: boolean | AddEventListenerOptions,
  ) {
    return this.ctx.effect(() => {
      window.addEventListener(type, listener, options)
      return () => window.removeEventListener(type, listener, options)
    })
  }

  wrapComponent(component: Component): Component
  wrapComponent(component?: Component): Component | undefined
  wrapComponent(component?: Component): Component | undefined {
    if (!component)
      return undefined

    const owner = this.ctx
    return markRaw(defineComponent((props, { slots }) => {
      provide(contextKey, owner)
      onErrorCaptured(() => owner.fiber.uid !== null)
      return () => h(component, props, slots)
    }))
  }
}
