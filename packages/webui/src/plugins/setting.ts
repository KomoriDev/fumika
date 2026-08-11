import type { SchemaControlDefinition } from '@fumika/schemastery'
import type { StateService } from '@fumika/state'
import type { Context } from 'cordis'
import type Schema from 'schemastery'
import type { Component } from 'vue'
import type { LocalizedText } from './i18n'
import { Service } from 'cordis'
import { markRaw, shallowReactive, shallowRef, watchEffect } from 'vue'

export interface SettingOptions {
  id: string
  title: LocalizedText
  description?: LocalizedText
  stateKey?: string
  order?: number
  disabled?: () => boolean | undefined
  schema?: Schema
  component?: Component
  initial?: unknown
}

export class SettingModule {
  readonly entries = shallowReactive(new Map<string, SettingOptions>())
  private readonly fallback = shallowReactive(new Map<string, unknown>())
  private readonly state = shallowRef<StateService>()

  constructor(public ctx: Context) {
    Object.defineProperty(this, Service.tracker, {
      value: { property: 'ctx' },
    })

    this.state.value = ctx.appState
    ctx.effect(() => ctx.on('internal/service', (name) => {
      if (name === 'appState')
        this.state.value = ctx.appState
    }, { global: true }))

    ctx.effect(() => watchEffect(() => {
      const service = this.state.value
      if (!service)
        return
      const app = service.data.app
      ctx.client.i18n.setLocale(app.locale)
      ctx.client.theme.setMode(app.theme.mode)
      if (app.theme.active === 'default' || ctx.client.theme.themes.has(app.theme.active))
        ctx.client.theme.switch(app.theme.active)
    }))
  }

  define(options: SettingOptions) {
    if (!options.schema && !options.component)
      throw new TypeError(`setting requires a schema or component: ${options.id}`)
    if (options.schema && options.component)
      throw new TypeError(`setting cannot define both schema and component: ${options.id}`)

    const owner = this.ctx
    const entry: SettingOptions = {
      ...options,
      stateKey: options.stateKey ?? 'app',
      order: options.order ?? 0,
      component: owner.client.wrapComponent(options.component),
    }
    if (entry.component)
      markRaw(entry.component)

    return owner.effect(() => {
      if (this.entries.has(entry.id))
        throw new Error(`setting already registered: ${entry.id}`)
      this.entries.set(entry.id, entry)
      if (!this.fallback.has(entry.stateKey!))
        this.fallback.set(entry.stateKey!, structuredClone(entry.initial))
      return () => {
        this.entries.delete(entry.id)
      }
    })
  }

  control(definition: SchemaControlDefinition) {
    const owner = this.ctx
    const control: SchemaControlDefinition = {
      ...definition,
      component: owner.client.wrapComponent(definition.component),
    }
    return owner.effect(() => owner.client.schemastery.register(control))
  }

  sorted(): SettingOptions[] {
    return [...this.entries.values()]
      .filter(entry => !entry.disabled?.())
      .sort((left, right) => (left.order ?? 0) - (right.order ?? 0) || left.id.localeCompare(right.id))
  }

  readState<T>(key: string, initial: T): T
  readState<T = unknown>(key: string): T | undefined
  readState<T>(key: string, initial?: T): T | undefined {
    return (this.state.value?.data[key] ?? this.fallback.get(key) ?? initial) as T | undefined
  }

  writeState(key: string, value: unknown): void {
    const state = this.state.value
    if (!state) {
      this.fallback.set(key, value)
      return
    }
    state.mutate((data) => {
      data[key] = value
    })
  }

  read(entry: SettingOptions): unknown {
    return this.readState(entry.stateKey ?? 'app', entry.initial)
  }

  write(entry: SettingOptions, value: unknown): void {
    this.writeState(entry.stateKey ?? 'app', value)
  }
}

export default SettingModule
