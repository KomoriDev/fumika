<script setup lang="ts">
import { computed, onBeforeUnmount, onMounted, ref, watch } from 'vue'

const props = defineProps<{
  html: string
}>()

const frame = ref<HTMLIFrameElement>()
const frameHeight = ref(320)
const isDark = ref(false)
const documentSource = computed(() => createMailDocument(props.html, isDark.value))
let resizeObserver: ResizeObserver | undefined
const resizeTimers = new Set<number>()

function syncColorMode(): void {
  isDark.value = document.documentElement.classList.contains('dark')
}

const themeObserver = new MutationObserver(syncColorMode)

watch([() => props.html, isDark], () => {
  cleanupFrameObservers()
  frameHeight.value = 320
})

onMounted(() => {
  syncColorMode()
  themeObserver.observe(document.documentElement, { attributes: true, attributeFilter: ['class'] })
})

onBeforeUnmount(() => {
  themeObserver.disconnect()
  cleanupFrameObservers()
})

function handleLoad(): void {
  cleanupFrameObservers()
  const document = frame.value?.contentDocument
  if (!document)
    return

  resizeFrame()
  resizeObserver = new ResizeObserver(resizeFrame)
  resizeObserver.observe(document.documentElement)
  if (document.body)
    resizeObserver.observe(document.body)

  scheduleResize(100)
  scheduleResize(1000)
}

function resizeFrame(): void {
  const document = frame.value?.contentDocument
  if (!document)
    return
  const height = Math.max(
    document.documentElement.scrollHeight,
    document.body?.scrollHeight ?? 0,
  )
  frameHeight.value = Math.min(20_000, Math.max(160, Math.ceil(height)))
}

function scheduleResize(delay: number): void {
  const timer = window.setTimeout(() => {
    resizeTimers.delete(timer)
    resizeFrame()
  }, delay)
  resizeTimers.add(timer)
}

function cleanupFrameObservers(): void {
  resizeObserver?.disconnect()
  resizeObserver = undefined
  for (const timer of resizeTimers)
    window.clearTimeout(timer)
  resizeTimers.clear()
}

const blockedTags = new Set([
  'applet',
  'audio',
  'base',
  'canvas',
  'embed',
  'form',
  'frame',
  'frameset',
  'iframe',
  'input',
  'link',
  'meta',
  'object',
  'option',
  'script',
  'select',
  'source',
  'template',
  'textarea',
  'track',
  'video',
  'webview',
])

const urlAttributes = new Set(['background', 'href', 'poster', 'src', 'xlink:href'])

function createMailDocument(html: string, dark: boolean): string {
  const source = new DOMParser().parseFromString(html, 'text/html')
  sanitizeDocument(source)
  if (dark)
    adaptDocumentForDark(source)
  const styles = [...source.head.querySelectorAll('style')]
    .map(style => style.outerHTML)
    .join('\n')
  const surface = dark
    ? `html, body { margin: 0; padding: 0; min-height: 1px; background: transparent !important; color: #f4f4f5; }
a { color: #c4b5fd; }`
    : `html, body { margin: 0; padding: 0; min-height: 1px; background: #fff; color: #18181b; }`

  return `<!doctype html>
<html>
<head>
<meta charset="utf-8">
<meta name="viewport" content="width=device-width, initial-scale=1">
<meta http-equiv="Content-Security-Policy" content="default-src 'none'; img-src http: https: data:; style-src 'unsafe-inline'; font-src http: https: data:; script-src 'none'; connect-src 'none'; media-src 'none'; frame-src 'none'; object-src 'none'; form-action 'none'; base-uri 'none'">
<style>
${dark ? ':root { color-scheme: dark; }' : ':root { color-scheme: light; }'}
${surface}
body { overflow-wrap: anywhere; font-family: "Segoe UI Variable", "Segoe UI", "Microsoft YaHei UI", Arial, sans-serif; font-size: 15px; line-height: 1.65; }
img { display: block; height: auto; max-width: 100%; }
table { max-width: 100%; }
a { color: #6d28d9; cursor: pointer; }
p:first-child { margin-top: 0; }
p:last-child { margin-bottom: 0; }
</style>
${styles}
</head>
${source.body.outerHTML}
</html>`
}

function parseCssColor(value: string): { r: number, g: number, b: number } | null {
  const token = value.replace(/!important/i, '').trim()
  if (/^black$/i.test(token))
    return { r: 0, g: 0, b: 0 }
  if (/^white$/i.test(token))
    return { r: 255, g: 255, b: 255 }
  const hex = token.match(/^#([0-9a-f]{3}|[0-9a-f]{6})$/i)
  if (hex) {
    const digits = hex[1]
    if (digits.length === 3) {
      return {
        r: Number.parseInt(digits[0] + digits[0], 16),
        g: Number.parseInt(digits[1] + digits[1], 16),
        b: Number.parseInt(digits[2] + digits[2], 16),
      }
    }
    return {
      r: Number.parseInt(digits.slice(0, 2), 16),
      g: Number.parseInt(digits.slice(2, 4), 16),
      b: Number.parseInt(digits.slice(4, 6), 16),
    }
  }
  const rgb = token.match(/^rgba?\(\s*(\d+)\s*,\s*(\d+)\s*,\s*(\d+)/i)
  if (!rgb)
    return null
  return { r: Number(rgb[1]), g: Number(rgb[2]), b: Number(rgb[3]) }
}

function luminance(color: { r: number, g: number, b: number }): number {
  return 0.2126 * color.r + 0.7152 * color.g + 0.0722 * color.b
}

function mapLightBackground(color: { r: number, g: number, b: number } | null, hasCardHint: boolean): string | null {
  if (!color)
    return null
  const level = luminance(color)
  if (level >= 252)
    return hasCardHint ? '#27272a' : 'transparent'
  if (level >= 186)
    return '#27272a'
  return null
}

function mapDarkInk(color: { r: number, g: number, b: number }): string | null {
  const level = luminance(color)
  if (level <= 70)
    return '#f4f4f5'
  if (level <= 165)
    return '#a1a1aa'
  return null
}

function hasCardHint(block: string): boolean {
  return /border-radius|max-width|box-shadow/i.test(block)
}

function rewriteLightSurfaces(css: string): string {
  return css.replace(/[^{}]+\{[^{}]*\}|[^{}]+/g, (block) => {
    const card = hasCardHint(block)
    return block.replace(/((?:^|[;{\s])background(?:-color)?\s*:\s*)([^;!}\s][^;!}]*)/gi, (full, prefix: string, value: string) => {
      const mapped = mapLightBackground(parseCssColor(value), card)
      return mapped ? `${prefix}${mapped}` : full
    })
  })
}

function rewriteDarkInk(css: string): string {
  return css.replace(/((?:^|[;{])\s*color\s*:\s*)([^;!}\s][^;!}]*)/gi, (full, prefix: string, value: string) => {
    const color = parseCssColor(value)
    const mapped = color ? mapDarkInk(color) : null
    return mapped ? `${prefix}${mapped}` : full
  })
}

function rewriteForDark(css: string): string {
  return rewriteDarkInk(rewriteLightSurfaces(css))
}

function adaptDocumentForDark(document: Document): void {
  for (const style of document.querySelectorAll('style')) {
    if (style.textContent)
      style.textContent = rewriteForDark(style.textContent)
  }
  for (const element of document.querySelectorAll('[style], [bgcolor], [bg]')) {
    const inline = element.getAttribute('style') ?? ''
    const card = hasCardHint(inline)
    const bgcolor = element.getAttribute('bgcolor')
    const mappedBgColor = bgcolor ? mapLightBackground(parseCssColor(bgcolor), card) : null
    if (mappedBgColor)
      element.setAttribute('bgcolor', mappedBgColor)
    const bg = element.getAttribute('bg')
    const mappedBg = bg ? mapLightBackground(parseCssColor(bg), card) : null
    if (mappedBg)
      element.setAttribute('bg', mappedBg)
    if (inline)
      element.setAttribute('style', rewriteForDark(inline))
  }
}

function sanitizeDocument(document: Document): void {
  for (const element of [...document.querySelectorAll('*')]) {
    const tag = element.tagName.toLowerCase()
    if (blockedTags.has(tag)) {
      element.remove()
      continue
    }

    for (const attribute of [...element.attributes]) {
      const name = attribute.name.toLowerCase()
      if (name.startsWith('on') || name === 'srcdoc' || name === 'srcset' || name === 'ping' || name === 'formaction') {
        element.removeAttribute(attribute.name)
        continue
      }
      if (name === 'style') {
        const style = sanitizeCss(attribute.value)
        if (style)
          element.setAttribute(attribute.name, style)
        else
          element.removeAttribute(attribute.name)
        continue
      }
      if (urlAttributes.has(name)) {
        const url = sanitizeUrl(attribute.value, name === 'href' || name === 'xlink:href')
        if (url)
          element.setAttribute(attribute.name, url)
        else
          element.removeAttribute(attribute.name)
      }
    }

    if (tag === 'style')
      element.textContent = sanitizeCss(element.textContent ?? '')

    if (tag === 'a') {
      const href = element.getAttribute('href')
      if (href && !href.startsWith('#')) {
        element.setAttribute('target', '_blank')
        element.setAttribute('rel', 'noopener noreferrer')
        element.setAttribute('referrerpolicy', 'no-referrer')
      }
    }
    if (tag === 'img') {
      element.setAttribute('decoding', 'async')
      element.setAttribute('referrerpolicy', 'no-referrer')
    }
  }
}

function sanitizeUrl(value: string, navigation: boolean): string | undefined {
  const url = value.trim()
  if (!url)
    return undefined
  if (navigation && url.startsWith('#'))
    return url
  if (!navigation && /^data:image\/(?:avif|gif|jpeg|png|webp);/i.test(url))
    return url
  if (url.startsWith('//'))
    return `https:${url}`
  try {
    const parsed = new URL(url)
    if (parsed.protocol === 'http:' || parsed.protocol === 'https:')
      return parsed.toString()
    if (navigation && (parsed.protocol === 'mailto:' || parsed.protocol === 'tel:'))
      return parsed.toString()
  }
  catch {
    return undefined
  }
  return undefined
}

function sanitizeCss(value: string): string {
  return value
    .replace(/@import\s[^;]+;?/gi, '')
    .replace(/expression\s*\([^)]*\)/gi, '')
    .replace(/url\s*\(\s*(?:['"]\s*)?javascript:[^)]*\)/gi, 'none')
    .replace(/(?:behavior|-moz-binding)\s*:[^;}]+/gi, '')
}
</script>

<template>
  <iframe
    ref="frame"
    data-mail-html
    title="HTML message body"
    class="block w-full border-0 bg-transparent"
    :style="{ height: `${frameHeight}px` }"
    :srcdoc="documentSource"
    sandbox="allow-same-origin allow-popups allow-popups-to-escape-sandbox"
    referrerpolicy="no-referrer"
    @load="handleLoad"
  />
</template>
