import type { Context } from 'cordis'
import type { WritableComputedRef } from 'vue'
import { Service } from 'cordis'
import { unref } from 'vue'
import { createI18n } from 'vue-i18n'

export type LocalizedText = string | Readonly<Record<string, string>>
export type LocaleMessages = Readonly<Record<string, unknown>>

export class I18nModule {
  readonly i18n = createI18n({
    legacy: false,
    locale: 'en-US',
    fallbackLocale: 'en-US',
    messages: {},
  })

  private readonly contributions = new Map<string, Map<string, LocaleMessages>>()

  constructor(public ctx: Context) {
    Object.defineProperty(this, Service.tracker, {
      value: { property: 'ctx' },
    })
  }

  get locale(): string {
    return (this.i18n.global.locale as WritableComputedRef<string>).value
  }

  setLocale(locale: string): void {
    ;(this.i18n.global.locale as WritableComputedRef<string>).value = locale
  }

  messages(id: string, locales: Readonly<Record<string, LocaleMessages>>) {
    const owner = this.ctx
    return owner.effect(() => {
      for (const [locale, messages] of Object.entries(locales)) {
        const entries = this.contributions.get(locale) ?? new Map()
        if (entries.has(id))
          throw new Error(`locale messages already registered: ${id} (${locale})`)
        entries.set(id, messages)
        this.contributions.set(locale, entries)
        this.rebuild(locale)
      }

      return () => {
        for (const locale of Object.keys(locales)) {
          const entries = this.contributions.get(locale)
          entries?.delete(id)
          if (!entries?.size)
            this.contributions.delete(locale)
          this.rebuild(locale)
        }
      }
    })
  }

  resolve(text: LocalizedText | undefined): string | undefined {
    if (!text || typeof text === 'string')
      return text

    const locale = this.locale
    const fallback = unref(this.i18n.global.fallbackLocale)
    const fallbackLocales = Array.isArray(fallback)
      ? fallback
      : typeof fallback === 'string'
        ? [fallback]
        : []

    return text[locale]
      ?? fallbackLocales.map(candidate => text[candidate]).find(Boolean)
      ?? Object.values(text)[0]
  }

  private rebuild(locale: string): void {
    const messages = [...(this.contributions.get(locale)?.values() ?? [])]
      .reduce<Record<string, unknown>>((result, contribution) => mergeMessages(result, contribution), {})
    this.i18n.global.setLocaleMessage(locale, messages)
  }
}

function mergeMessages(
  target: Record<string, unknown>,
  source: Readonly<Record<string, unknown>>,
): Record<string, unknown> {
  const result = { ...target }
  for (const [key, value] of Object.entries(source)) {
    const current = result[key]
    result[key] = isMessageObject(current) && isMessageObject(value)
      ? mergeMessages(current, value)
      : value
  }
  return result
}

function isMessageObject(value: unknown): value is Record<string, unknown> {
  return Boolean(value) && typeof value === 'object' && !Array.isArray(value)
}

export default I18nModule
