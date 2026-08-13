<script setup lang="ts">
import { computed, onBeforeUnmount, ref, watch } from 'vue'

const props = defineProps<{
  html: string
}>()

const frame = ref<HTMLIFrameElement>()
const frameHeight = ref(320)
const documentSource = computed(() => createMailDocument(props.html))
let resizeObserver: ResizeObserver | undefined
const resizeTimers = new Set<number>()

watch(() => props.html, () => {
  cleanupFrameObservers()
  frameHeight.value = 320
})

onBeforeUnmount(cleanupFrameObservers)

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

function createMailDocument(html: string): string {
  const source = new DOMParser().parseFromString(html, 'text/html')
  sanitizeDocument(source)
  const styles = [...source.head.querySelectorAll('style')]
    .map(style => style.outerHTML)
    .join('\n')

  return `<!doctype html>
<html>
<head>
<meta charset="utf-8">
<meta name="viewport" content="width=device-width, initial-scale=1">
<meta http-equiv="Content-Security-Policy" content="default-src 'none'; img-src http: https: data:; style-src 'unsafe-inline'; font-src http: https: data:; script-src 'none'; connect-src 'none'; media-src 'none'; frame-src 'none'; object-src 'none'; form-action 'none'; base-uri 'none'">
<style>
:root { color-scheme: light; }
html, body { margin: 0; padding: 0; min-height: 1px; background: transparent; }
body { overflow-wrap: anywhere; }
img, table { max-width: 100%; }
a { cursor: pointer; }
</style>
${styles}
</head>
${source.body.outerHTML}
</html>`
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
    class="block w-full rounded-xl border bg-white"
    :style="{ height: `${frameHeight}px` }"
    :srcdoc="documentSource"
    sandbox="allow-same-origin allow-popups allow-popups-to-escape-sandbox"
    referrerpolicy="no-referrer"
    @load="handleLoad"
  />
</template>
