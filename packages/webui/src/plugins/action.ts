import type { Context } from 'cordis'
import type { Component, MaybeRefOrGetter } from 'vue'
import { Service } from 'cordis'
import { markRaw, reactive, shallowReactive, toValue } from 'vue'

export interface ActionContext {}

export type ActionScope = ActionContext & Record<string, unknown>

export interface ActionOptions {
  shortcut?: string | string[]
  allowInInput?: boolean
  hidden?: (scope: ActionScope) => boolean
  disabled?: (scope: ActionScope) => boolean
  run: (scope: ActionScope) => unknown
}

export interface MenuItem {
  id: string
  label?: string | ((scope: ActionScope) => string)
  icon?: string | Component
  order?: number
  hidden?: (scope: ActionScope) => boolean
}

interface ParsedShortcut {
  alt: boolean
  ctrl: boolean
  key: string
  meta: boolean
  shift: boolean
}

type ScopeValue = MaybeRefOrGetter<unknown>

export class ActionModule {
  readonly actions = reactive(new Map<string, ActionOptions>())
  readonly menus = reactive(new Map<string, MenuItem[]>())
  readonly scope = shallowReactive<Record<string, ScopeValue>>({})

  constructor(public ctx: Context) {
    Object.defineProperty(this, Service.tracker, {
      value: { property: 'ctx' },
    })

    ctx.client.addEventListener('keydown', (event) => {
      void this.handleKeydown(event)
    })
  }

  register(id: string, options: ActionOptions | ActionOptions['run']) {
    const definition = typeof options === 'function' ? { run: options } : options
    markRaw(definition)

    return this.ctx.effect(() => {
      if (this.actions.has(id))
        throw new Error(`action already registered: ${id}`)
      this.actions.set(id, definition)
      return () => this.actions.delete(id)
    })
  }

  menu(id: string, items: MenuItem[]) {
    const entries: MenuItem[] = items.map((item) => {
      if (item.icon && typeof item.icon === 'object')
        markRaw(item.icon)
      return { ...item, order: item.order ?? 0 }
    })

    return this.ctx.effect(() => {
      const list = this.menus.get(id) ?? []
      list.push(...entries)
      list.sort((left, right) => (left.order ?? 0) - (right.order ?? 0))
      this.menus.set(id, list)

      return () => {
        const current = this.menus.get(id)
        if (!current)
          return
        const retained = current.filter(item => !entries.includes(item))
        if (retained.length)
          this.menus.set(id, retained)
        else
          this.menus.delete(id)
      }
    })
  }

  define(key: string, value?: ScopeValue) {
    return this.ctx.effect(() => {
      this.scope[key] = value
      return () => delete this.scope[key]
    })
  }

  createScope(override: Record<string, ScopeValue> = {}): ActionScope {
    return createScopeProxy({ ...this.scope, ...override }) as ActionScope
  }

  isAvailable(id: string, override?: Record<string, ScopeValue>): boolean {
    const action = this.actions.get(id)
    if (!action)
      return false
    const scope = this.createScope(override)
    return !action.hidden?.(scope) && !action.disabled?.(scope)
  }

  async execute(id: string, override?: Record<string, ScopeValue>): Promise<boolean> {
    const action = this.actions.get(id)
    if (!action)
      return false
    const scope = this.createScope(override)
    if (action.hidden?.(scope) || action.disabled?.(scope))
      return false
    await action.run(scope)
    return true
  }

  private async handleKeydown(event: KeyboardEvent): Promise<void> {
    for (const [id, action] of this.actions) {
      if (!action.shortcut)
        continue
      if (!action.allowInInput && isEditableTarget(event.target))
        continue

      const shortcuts = Array.isArray(action.shortcut) ? action.shortcut : [action.shortcut]
      if (!shortcuts.some(shortcut => matchesShortcut(event, parseShortcut(shortcut))))
        continue
      if (!this.isAvailable(id))
        continue

      event.preventDefault()
      await this.execute(id)
      return
    }
  }
}

function isEditableTarget(target: EventTarget | null): boolean {
  if (!(target instanceof HTMLElement))
    return false
  return target.isContentEditable || ['INPUT', 'TEXTAREA', 'SELECT'].includes(target.tagName)
}

function parseShortcut(shortcut: string): ParsedShortcut {
  const result: ParsedShortcut = {
    alt: false,
    ctrl: false,
    key: '',
    meta: false,
    shift: false,
  }

  for (const token of shortcut.toLowerCase().split('+').map(part => part.trim()).filter(Boolean)) {
    if (token === 'alt' || token === 'option') {
      result.alt = true
    }
    else if (token === 'ctrl' || token === 'control') {
      result.ctrl = true
    }
    else if (token === 'meta' || token === 'cmd' || token === 'command') {
      result.meta = true
    }
    else if (token === 'mod') {
      if (navigator.platform.toLowerCase().includes('mac'))
        result.meta = true
      else
        result.ctrl = true
    }
    else if (token === 'shift') {
      result.shift = true
    }
    else {
      result.key = token
    }
  }

  if (!result.key)
    throw new TypeError(`shortcut is missing a key: ${shortcut}`)
  return result
}

function matchesShortcut(event: KeyboardEvent, shortcut: ParsedShortcut): boolean {
  return event.altKey === shortcut.alt
    && event.ctrlKey === shortcut.ctrl
    && event.metaKey === shortcut.meta
    && event.shiftKey === shortcut.shift
    && event.key.toLowerCase() === shortcut.key
}

function createScopeProxy(scope: Record<string, ScopeValue>, prefix = ''): object {
  return new Proxy({}, {
    get(target, property) {
      if (typeof property === 'symbol')
        return Reflect.get(target, property)

      const key = `${prefix}${property}`
      if (key in scope)
        return toValue(scope[key])

      const nestedPrefix = `${key}.`
      if (Object.keys(scope).some(candidate => candidate.startsWith(nestedPrefix)))
        return createScopeProxy(scope, nestedPrefix)
    },
  })
}

export default ActionModule
