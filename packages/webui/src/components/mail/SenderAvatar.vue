<script setup lang="ts">
import { Avatar, AvatarFallback, AvatarImage } from '@fumika/ui/avatar'
import { computed, ref, watch } from 'vue'
import { avatarClass, gravatarAvatarUrl, initials, unavatarUrl } from '@/mail'

const props = defineProps<{
  name: string
  address: string
  src?: string
  size?: 'sm' | 'default' | 'lg'
}>()

const index = ref(0)
const sources = ref<string[]>([])
let request = 0

watch(() => [props.src, props.address] as const, async ([src, address]) => {
  const id = ++request
  const next: string[] = []
  if (src)
    next.push(src)
  const gravatar = await gravatarAvatarUrl(address)
  if (id !== request)
    return
  if (gravatar)
    next.push(gravatar)
  const aggregated = unavatarUrl(address)
  if (aggregated)
    next.push(aggregated)
  sources.value = next
  index.value = 0
}, { immediate: true })

const current = computed(() => sources.value[index.value])

function fail(): void {
  if (index.value < sources.value.length)
    index.value += 1
}
</script>

<template>
  <Avatar :size="size">
    <AvatarImage
      v-if="current"
      :src="current"
      :alt="name"
      referrer-policy="no-referrer"
      @error="fail"
    />
    <AvatarFallback
      class="font-semibold"
      :class="[avatarClass(address), size === 'sm' ? 'text-[10px]' : '']"
    >
      {{ initials(name) }}
    </AvatarFallback>
  </Avatar>
</template>
