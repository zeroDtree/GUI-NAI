<script setup lang="ts">
import { onMounted, onUnmounted, reactive, ref } from 'vue'
import { t } from '../../nekoai-gui/client/i18n'
import { openPanel, stUi } from './bus'
import { getST } from './chat'
import { readViewport, watchViewport } from './viewport'

const SIZE = 48
const GAP = 16
const THRESHOLD = 4

const pos = reactive({ x: null as number | null, y: null as number | null })
const dragging = ref(false)
const fab = ref<HTMLButtonElement | null>(null)
const insets = { top: 0, right: 0, bottom: 0, left: 0 }

const seen = { width: -1, height: -1 }

let startX = 0
let startY = 0
let originX = 0
let originY = 0
let moved = false
let observed: Element | null = null
let stopViewport = () => {}
let stopComposer = () => {}

function readSafeInsets() {
  const el = document.createElement('div')
  el.style.cssText = 'position:fixed;left:0;top:0;visibility:hidden;pointer-events:none;padding:env(safe-area-inset-top) env(safe-area-inset-right) env(safe-area-inset-bottom) env(safe-area-inset-left)'
  document.body.appendChild(el)
  const style = getComputedStyle(el)
  insets.top = Number.parseFloat(style.paddingTop) || 0
  insets.right = Number.parseFloat(style.paddingRight) || 0
  insets.bottom = Number.parseFloat(style.paddingBottom) || 0
  insets.left = Number.parseFloat(style.paddingLeft) || 0
  el.remove()
}

function composerTop() {
  const el = document.querySelector('#send_form')
  if (!(el instanceof HTMLElement)) return null
  const rect = el.getBoundingClientRect()
  const box = readViewport()
  if (rect.height < 1 || rect.bottom <= 0 || rect.top >= box.height) return null
  return rect.top + box.top
}

function clamp(x: number, y: number) {
  const box = readViewport()
  const minX = box.left + insets.left
  const maxX = box.left + box.width - SIZE - insets.right
  const minY = box.top + insets.top
  let maxY = box.top + box.height - SIZE - insets.bottom
  const bar = composerTop()
  if (bar != null) maxY = Math.min(maxY, bar - SIZE - GAP)
  return {
    x: clampAxis(x, minX, maxX),
    y: clampAxis(y, minY, maxY),
  }
}

function clampAxis(value: number, min: number, max: number) {
  if (max < min) return min
  return Math.min(max, Math.max(min, value))
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

function placeDefault() {
  const box = readViewport()
  apply(box.left + box.width - SIZE - GAP, box.top + box.height - SIZE - GAP)
}

function onPointerDown(event: PointerEvent) {
  if (event.pointerType === 'mouse' && event.button !== 0) return
  const el = fab.value
  if (!el) return
  const rect = el.getBoundingClientRect()
  const box = readViewport()
  apply(rect.left + box.left, rect.top + box.top)
  startX = event.clientX
  startY = event.clientY
  originX = pos.x ?? rect.left + box.left
  originY = pos.y ?? rect.top + box.top
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

function watchComposer() {
  const bar = document.querySelector('#send_form')
  if (bar === observed) return
  stopComposer()
  observed = bar
  if (!(bar instanceof HTMLElement) || typeof ResizeObserver === 'undefined') return
  const observer = new ResizeObserver(onFrame)
  observer.observe(bar)
  stopComposer = () => observer.disconnect()
}

function onFrame() {
  const box = readViewport()
  if (box.width !== seen.width || box.height !== seen.height) {
    seen.width = box.width
    seen.height = box.height
    readSafeInsets()
  }
  watchComposer()
  if (pos.x == null || pos.y == null) placeDefault()
  else apply(pos.x, pos.y)
}

onMounted(() => {
  const saved = getST().extensionSettings?.nekoai?.fab
  if (saved && typeof saved.x === 'number' && typeof saved.y === 'number') {
    pos.x = saved.x
    pos.y = saved.y
  }
  stopViewport = watchViewport(onFrame)
})

onUnmounted(() => {
  stopViewport()
  stopComposer()
})
</script>

<template>
  <button
    v-show="stUi.fabVisible && !stUi.open"
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
