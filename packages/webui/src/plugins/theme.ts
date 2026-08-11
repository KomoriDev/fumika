import type { Context } from 'cordis'
import type { Component } from 'vue'
import type { LocalizedText } from './i18n'
import { usePreferredDark } from '@vueuse/core'
import { Service } from 'cordis'
import { computed, markRaw, reactive, ref, watchEffect } from 'vue'

export type ThemeMode = 'auto' | 'light' | 'dark'
export type ResolvedThemeMode = Exclude<ThemeMode, 'auto'>

export interface ThemeDefinition {
  id: string
  name: LocalizedText
  components?: Readonly<Record<string, Component>>
  light?: Readonly<Record<string, string>>
  dark?: Readonly<Record<string, string>>
}

export class ThemeModule {
  readonly themes = reactive(new Map<string, ThemeDefinition>())
  readonly mode = ref<ThemeMode>('auto')
  readonly active = ref('default')
  readonly colorMode = computed<ResolvedThemeMode>(() => {
    if (this.mode.value !== 'auto')
      return this.mode.value
    return this.preferredDark.value ? 'dark' : 'light'
  })

  private readonly preferredDark = usePreferredDark()
  private readonly appliedVariables = new Set<string>()

  constructor(public ctx: Context) {
    Object.defineProperty(this, Service.tracker, {
      value: { property: 'ctx' },
    })

    ctx.effect(() => watchEffect(() => this.applyTheme(), { flush: 'post' }))
  }

  define(definition: ThemeDefinition) {
    markRaw(definition)
    return this.ctx.effect(() => {
      if (this.themes.has(definition.id))
        throw new Error(`theme already registered: ${definition.id}`)
      this.themes.set(definition.id, definition)
      return () => {
        this.themes.delete(definition.id)
        if (this.active.value === definition.id)
          this.active.value = 'default'
      }
    })
  }

  setMode(mode: ThemeMode): void {
    this.mode.value = mode
  }

  switch(id: string): void {
    if (id !== 'default' && !this.themes.has(id))
      throw new Error(`unknown theme: ${id}`)
    this.active.value = id
  }

  private applyTheme(): void {
    const root = document.documentElement
    const colorMode = this.colorMode.value
    const definition = this.themes.get(this.active.value)
    const variables = definition?.[colorMode] ?? {}

    root.classList.toggle('dark', colorMode === 'dark')
    root.dataset.theme = this.active.value
    root.style.colorScheme = colorMode

    for (const variable of this.appliedVariables)
      root.style.removeProperty(variable)
    this.appliedVariables.clear()

    for (const [name, value] of Object.entries(variables)) {
      const variable = name.startsWith('--') ? name : `--${name}`
      root.style.setProperty(variable, value)
      this.appliedVariables.add(variable)
    }
  }
}

export default ThemeModule
