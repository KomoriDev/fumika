<script setup lang="ts">
import type { ThemeState } from '@fumika/state'
import { cn } from '@fumika/ui'
import { buttonVariants } from '@fumika/ui/button'
import { MailOpen, Power } from '@lucide/vue'
import { computed, onBeforeUnmount, onMounted, ref, watch } from 'vue'

const props = defineProps<{
  locale: string
  themeMode: ThemeState['mode']
  busy: boolean
}>()

const emit = defineEmits<{
  open: []
  quit: []
  dismiss: []
}>()

const active = ref(false)
const preferredDark = window.matchMedia('(prefers-color-scheme: dark)')
const isChinese = computed(() => props.locale.startsWith('zh'))
const menuLabel = computed(() => isChinese.value ? 'Fumika 托盘菜单' : 'Fumika tray menu')
const openLabel = computed(() => isChinese.value ? '打开' : 'Open')
const quitLabel = computed(() => isChinese.value ? '退出' : 'Quit')

watch(() => props.locale, (value) => {
  document.documentElement.lang = value
}, { immediate: true })

watch(() => props.themeMode, applyTheme, { immediate: true })

function applyTheme(): void {
  const dark = props.themeMode === 'dark'
    || (props.themeMode === 'auto' && preferredDark.matches)
  document.documentElement.classList.toggle('dark', dark)
  document.documentElement.style.colorScheme = dark ? 'dark' : 'light'
}

function activateMenu(): void {
  active.value = false
  requestAnimationFrame(() => {
    active.value = true
  })
}

function deactivateMenu(): void {
  active.value = false
}

function handleKeydown(event: KeyboardEvent): void {
  if (event.key !== 'Escape')
    return
  event.preventDefault()
  emit('dismiss')
}

function handlePreferredThemeChange(): void {
  if (props.themeMode === 'auto')
    applyTheme()
}

onMounted(() => {
  document.documentElement.dataset.surface = 'tray'
  window.addEventListener('focus', activateMenu)
  window.addEventListener('blur', deactivateMenu)
  window.addEventListener('keydown', handleKeydown)
  preferredDark.addEventListener('change', handlePreferredThemeChange)

  if (document.hasFocus())
    activateMenu()
})

onBeforeUnmount(() => {
  window.removeEventListener('focus', activateMenu)
  window.removeEventListener('blur', deactivateMenu)
  window.removeEventListener('keydown', handleKeydown)
  preferredDark.removeEventListener('change', handlePreferredThemeChange)
})
</script>

<template>
  <main
    :data-active="active ? '' : undefined"
    :aria-label="menuLabel"
    class="h-full w-full translate-y-0.5 scale-[0.98] p-1.5 opacity-0 blur-[1px] transition-[opacity,transform,filter] duration-150 ease-out select-none data-active:translate-y-0 data-active:scale-100 data-active:opacity-100 data-active:blur-none motion-reduce:transition-none"
  >
    <section class="h-full w-full overflow-hidden rounded-lg border border-foreground/10 bg-popover/95 p-1 text-popover-foreground shadow-xl backdrop-blur-xl">
      <div class="grid h-full content-center gap-px" role="menu">
        <button
          type="button"
          role="menuitem"
          :class="cn(
            buttonVariants({ variant: 'ghost', size: 'default' }),
            'h-8 w-full cursor-default justify-start gap-1.5 rounded-lg px-2 text-xs hover:bg-foreground/8 focus-visible:border-transparent focus-visible:ring-0 focus-visible:shadow-none',
          )"
          :disabled="props.busy"
          @click="emit('open')"
        >
          <MailOpen :size="14" aria-hidden="true" />
          <span class="min-w-0 truncate">{{ openLabel }}</span>
          <span class="ml-auto text-[9px] font-medium tracking-wide text-muted-foreground">Enter</span>
        </button>

        <button
          type="button"
          role="menuitem"
          :class="cn(
            buttonVariants({ variant: 'ghost', size: 'default' }),
            'h-8 w-full cursor-default justify-start gap-1.5 rounded-lg px-2 text-xs hover:bg-destructive/10 hover:text-destructive focus-visible:border-transparent focus-visible:ring-0 focus-visible:shadow-none',
          )"
          :disabled="props.busy"
          @click="emit('quit')"
        >
          <Power :size="14" aria-hidden="true" />
          <span class="min-w-0 truncate">{{ quitLabel }}</span>
        </button>
      </div>
    </section>
  </main>
</template>
