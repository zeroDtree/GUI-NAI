<script setup lang="ts">
import { computed, nextTick, onMounted, onUnmounted, ref, watch } from 'vue'
import zhCn from 'element-plus/es/locale/lang/zh-cn'
import en from 'element-plus/es/locale/lang/en'
import Generate from '../../nekoai-gui/client/pages/generate.vue'
import Director from '../../nekoai-gui/client/pages/director.vue'
import Upscale from '../../nekoai-gui/client/pages/upscale.vue'
import TextPage from '../../nekoai-gui/client/pages/text.vue'
import Inspect from '../../nekoai-gui/client/pages/inspect.vue'
import History from '../../nekoai-gui/client/pages/history.vue'
import Settings from '../../nekoai-gui/client/pages/settings.vue'
import { currentLocale, t } from '../../nekoai-gui/client/i18n'
import { closePanel, stUi, type StPage } from './bus'
import ChatImageSettings from './ChatImageSettings.vue'
import FloatingButton from './FloatingButton.vue'
import { pluginError } from './host-http'
import { readViewport, watchViewport } from './viewport'

const nav: { id: StPage; label: () => string }[] = [
  { id: 'generate', label: () => t('nav.generate') },
  { id: 'director', label: () => t('nav.director') },
  { id: 'upscale', label: () => t('nav.upscale') },
  { id: 'text', label: () => t('nav.text') },
  { id: 'inspect', label: () => t('nav.inspect') },
  { id: 'history', label: () => t('nav.history') },
  { id: 'settings', label: () => t('nav.settings') },
]

const pages = {
  generate: Generate,
  director: Director,
  upscale: Upscale,
  text: TextPage,
  inspect: Inspect,
  history: History,
  settings: Settings,
}

const current = computed(() => pages[stUi.page])
const pageTitle = computed(() => nav.find((item) => item.id === stUi.page)?.label() ?? '')
const epLocale = computed(() => currentLocale.value === 'zh-CN' ? zhCn : en)
const navRef = ref<HTMLElement | null>(null)
const compactQuery = window.matchMedia('(max-width: 800px), (max-height: 500px)')

let stopViewport = () => {}
let lastViewportHeight = 0

function onKey(event: KeyboardEvent) {
  if (event.key === 'Escape' && stUi.open) closePanel()
}

function scrollActiveNav() {
  if (!compactQuery.matches) return
  navRef.value?.querySelector('.active')?.scrollIntoView({ inline: 'center', block: 'nearest' })
}

function keepFieldVisible() {
  const el = document.activeElement
  if (!(el instanceof HTMLElement) || !el.closest('.nekoai-st-scroll')) return
  el.scrollIntoView({ block: 'nearest' })
}

function onViewport() {
  const height = readViewport().height
  if (height === lastViewportHeight) return
  lastViewportHeight = height
  if (stUi.open) keepFieldVisible()
}

watch(() => stUi.open, (open) => {
  document.documentElement.classList.toggle('nekoai-st-open', open)
  if (open) nextTick(scrollActiveNav)
})

watch(() => stUi.page, () => {
  if (stUi.open) nextTick(scrollActiveNav)
})

onMounted(() => {
  window.addEventListener('keydown', onKey)
  stopViewport = watchViewport(onViewport)
})

onUnmounted(() => {
  window.removeEventListener('keydown', onKey)
  stopViewport()
  document.documentElement.classList.remove('nekoai-st-open')
})
</script>

<template>
  <el-config-provider :locale="epLocale">
  <div class="nekoai-st-root" @keydown="onKey">
    <FloatingButton />

    <Teleport to="body">
      <div v-if="stUi.open" class="nekoai-st-backdrop" @click.self="closePanel">
        <div class="nekoai-st-modal" role="dialog" aria-modal="true" :aria-label="pageTitle">
          <header class="nekoai-st-header">
            <span>{{ pageTitle }}</span>
            <button type="button" class="nekoai-st-close" :title="t('st.close')" @click="closePanel">×</button>
          </header>
          <aside ref="navRef" class="nekoai-st-nav">
            <div class="nekoai-st-brand">{{ t('st.open') }}</div>
            <button
              v-for="item in nav"
              :key="item.id"
              type="button"
              class="nekoai-st-nav-item"
              :class="{ active: stUi.page === item.id }"
              @click="stUi.page = item.id"
            >
              {{ item.label() }}
            </button>
          </aside>
          <section class="nekoai-st-body">
            <p v-if="pluginError" class="nai-error nekoai-st-plugin-error">
              {{ t('st.pluginMissing') }}
              <span>{{ pluginError }}</span>
            </p>
            <div class="nekoai-st-scroll">
              <KeepAlive>
                <component :is="current" />
              </KeepAlive>
              <ChatImageSettings v-if="stUi.page === 'settings'" />
            </div>
          </section>
        </div>
      </div>
    </Teleport>
  </div>
  </el-config-provider>
</template>
