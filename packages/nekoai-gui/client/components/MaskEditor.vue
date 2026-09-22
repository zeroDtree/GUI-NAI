<script setup lang="ts">
import { onMounted, ref, watch } from 'vue'
import { t } from '../i18n'

const props = defineProps<{
  image: string
  modelValue?: string
}>()

const emit = defineEmits<{
  'update:modelValue': [value: string]
}>()

const canvas = ref<HTMLCanvasElement>()
const imgEl = ref<HTMLImageElement>()
const size = ref(24)
let drawing = false

function paint(event: PointerEvent) {
  const el = canvas.value
  const img = imgEl.value
  if (!el || !img) return
  const rect = el.getBoundingClientRect()
  const x = (event.clientX - rect.left) * (el.width / rect.width)
  const y = (event.clientY - rect.top) * (el.height / rect.height)
  const ctx = el.getContext('2d')!
  ctx.fillStyle = '#ffffff'
  ctx.beginPath()
  ctx.arc(x, y, size.value * (el.width / rect.width) / 2, 0, Math.PI * 2)
  ctx.fill()
}

function down(event: PointerEvent) {
  drawing = true
  paint(event)
}

function move(event: PointerEvent) {
  if (drawing) paint(event)
}

function up() {
  drawing = false
  emit('update:modelValue', canvas.value?.toDataURL('image/png') || '')
}

function reset() {
  const el = canvas.value
  if (!el) return
  const ctx = el.getContext('2d')!
  ctx.fillStyle = '#000000'
  ctx.fillRect(0, 0, el.width, el.height)
  emit('update:modelValue', el.toDataURL('image/png'))
}

function syncSize() {
  const el = canvas.value
  const img = imgEl.value
  if (!el || !img) return
  el.width = img.naturalWidth
  el.height = img.naturalHeight
  reset()
}

onMounted(() => {
  if (imgEl.value?.complete) syncSize()
})

watch(() => props.image, () => {
  requestAnimationFrame(syncSize)
})
</script>

<template>
  <div v-if="image">
    <div class="param">
      <span>{{ t('mask.title') }}</span>
    </div>
    <p class="nai-desc">{{ t('mask.hint') }}</p>
    <el-slider v-model="size" :min="4" :max="80" />
    <div class="mask-wrap">
      <img ref="imgEl" :src="image" alt="" @load="syncSize">
      <canvas
        ref="canvas"
        @pointerdown="down"
        @pointermove="move"
        @pointerup="up"
        @pointerleave="up"
      />
    </div>
    <el-button size="small" @click="reset">{{ t('mask.clear') }}</el-button>
  </div>
</template>
