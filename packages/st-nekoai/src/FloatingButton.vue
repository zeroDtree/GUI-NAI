<script setup lang="ts">
import { onMounted, onUnmounted, reactive, ref } from 'vue'
import { t } from '../../nekoai-gui/client/i18n'
import { openPanel, stUi } from './bus'
import { getST } from './chat'

const SIZE = 48
const THRESHOLD = 4

const pos = reactive({ x: null as number | null, y: null as number | null })
const dragging = ref(false)
const fab = ref<HTMLButtonElement | null>(null)

let startX = 0
let startY = 0
let originX = 0
let originY = 0
let moved = false

function clamp(x: number, y: number) {
  return {
    x: Math.min(Math.max(0, window.innerWidth - SIZE), Math.max(0, x)),
    y: Math.min(Math.max(0, window.innerHeight - SIZE), Math.max(0, y)),
  }
}

function apply(x: number, y: number) {
  const next = clamp(x, y)
  pos.x = next.x
  pos.y = next.y
}

function persist() {
  if (pos.x == null || pos.y == null) return
  const ctx = getST()
  if (!ctx.extensionSettings) return
  const prev = ctx.extensionSettings.nekoai
  ctx.extensionSettings.nekoai = {
    ...(prev && typeof prev === 'object' ? prev : {}),
    fab: { x: pos.x, y: pos.y },
  }
  ctx.saveSettingsDebounced?.()
}

function onPointerDown(event: PointerEvent) {
  if (event.pointerType === 'mouse' && event.button !== 0) return
  const el = fab.value
  if (!el) return
  const rect = el.getBoundingClientRect()
  apply(rect.left, rect.top)
  startX = event.clientX
  startY = event.clientY
  originX = pos.x ?? rect.left
  originY = pos.y ?? rect.top
  moved = false
  dragging.value = true
  el.setPointerCapture(event.pointerId)
}

function onPointerMove(event: PointerEvent) {
  if (!dragging.value) return
  const dx = event.clientX - startX
  const dy = event.clientY - startY
  if (Math.hypot(dx, dy) > THRESHOLD) moved = true
  apply(originX + dx, originY + dy)
}

function onPointerUp(event: PointerEvent) {
  if (!dragging.value) return
  dragging.value = false
  fab.value?.releasePointerCapture(event.pointerId)
  if (moved) persist()
}

function onClick(event: MouseEvent) {
  event.preventDefault()
  if (moved) {
    moved = false
    return
  }
  openPanel()
}

function onResize() {
  if (pos.x == null || pos.y == null) return
  apply(pos.x, pos.y)
}

onMounted(() => {
  const saved = getST().extensionSettings?.nekoai?.fab
  if (saved && typeof saved.x === 'number' && typeof saved.y === 'number') apply(saved.x, saved.y)
  else apply(window.innerWidth - SIZE - 20, window.innerHeight - SIZE - 20)
  window.addEventListener('resize', onResize)
})

onUnmounted(() => window.removeEventListener('resize', onResize))
</script>

<template>
  <button
    v-if="stUi.fabVisible"
    ref="fab"
    type="button"
    class="nekoai-st-fab"
    :class="{ dragging }"
    :style="pos.x == null ? undefined : { left: `${pos.x}px`, top: `${pos.y}px`, right: 'auto', bottom: 'auto' }"
    :title="t('st.fabHint')"
    @pointerdown="onPointerDown"
    @pointermove="onPointerMove"
    @pointerup="onPointerUp"
    @pointercancel="onPointerUp"
    @click="onClick"
  >
    <i class="fa-solid fa-palette" />
  </button>
</template>
