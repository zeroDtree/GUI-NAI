<script setup lang="ts">
import { computed, onMounted, onUnmounted, watch } from 'vue'
import type { SerializedImage } from '../../src/shared'
import { displaySrc } from '../store'

const props = defineProps<{
  images: SerializedImage[]
  index: number
  visible: boolean
}>()

const emit = defineEmits<{
  close: []
  'update:index': [value: number]
}>()

const current = computed(() => props.images[props.index])

function close() {
  emit('close')
}

function prev() {
  if (!props.images.length) return
  emit('update:index', (props.index - 1 + props.images.length) % props.images.length)
}

function next() {
  if (!props.images.length) return
  emit('update:index', (props.index + 1) % props.images.length)
}

function onKey(event: KeyboardEvent) {
  if (!props.visible) return
  if (event.key === 'Escape') close()
  if (event.key === 'ArrowLeft') prev()
  if (event.key === 'ArrowRight') next()
}

watch(() => props.visible, (visible) => {
  if (visible) document.body.style.overflow = 'hidden'
  else document.body.style.overflow = ''
})

onMounted(() => window.addEventListener('keydown', onKey))
onUnmounted(() => {
  window.removeEventListener('keydown', onKey)
  document.body.style.overflow = ''
})
</script>

<template>
  <Teleport to="body">
    <div v-if="visible && current" class="nai-viewer">
      <button class="nai-viewer-close" type="button" @click="close">×</button>
      <button v-if="images.length > 1" class="nai-viewer-nav prev" type="button" @click="prev">‹</button>
      <div class="nai-viewer-frame" @click="close">
        <img :src="displaySrc(current)" :alt="current.filename" @click.stop>
      </div>
      <button v-if="images.length > 1" class="nai-viewer-nav next" type="button" @click="next">›</button>
    </div>
  </Teleport>
</template>
