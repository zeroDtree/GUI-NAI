import { unref, watch } from 'vue'
import { Context } from '@cordisjs/client'
import Generate from './pages/generate.vue'
import Director from './pages/director.vue'
import Upscale from './pages/upscale.vue'
import TextPage from './pages/text.vue'
import Inspect from './pages/inspect.vue'
import History from './pages/history.vue'
import Settings from './pages/settings.vue'
import type { HostData } from '../src/shared'
import { setLocale, t } from './i18n'
import { hydrateGallery } from './store'
import './icons'
import './index.scss'

const LOCALE_SEEDED_KEY = 'nekoai-gui.locale-seeded'

function seedEnglishLocale(ctx: Context) {
  try {
    if (localStorage.getItem(LOCALE_SEEDED_KEY)) return
    ctx.client.setting.original.value.locale = 'en-US'
    if (ctx.client.setting.resolved.value) {
      ctx.client.setting.resolved.value.locale = 'en-US'
    }
    localStorage.setItem(LOCALE_SEEDED_KEY, '1')
  } catch {
    // Ignore quota / private-mode failures; pages still fall back to English.
  }
}

export default (ctx: Context) => {
  seedEnglishLocale(ctx)
  setLocale(ctx.client.setting.original.value.locale)
  ctx.effect(() => watch(() => ctx.client.setting.original.value.locale, (locale) => setLocale(locale), { immediate: true }))
  const data = ctx.$entry?.data
  if (data) hydrateGallery(unref(data) as HostData)

  ctx.client.router.page({
    path: '/generate',
    name: () => t('nav.generate'),
    icon: 'nai:generate',
    order: 100,
    component: Generate,
  })
  ctx.client.router.page({
    path: '/director',
    name: () => t('nav.director'),
    icon: 'nai:director',
    order: 90,
    component: Director,
  })
  ctx.client.router.page({
    path: '/upscale',
    name: () => t('nav.upscale'),
    icon: 'nai:upscale',
    order: 80,
    component: Upscale,
  })
  ctx.client.router.page({
    path: '/text',
    name: () => t('nav.text'),
    icon: 'nai:text',
    order: 70,
    component: TextPage,
  })
  ctx.client.router.page({
    path: '/inspect',
    name: () => t('nav.inspect'),
    icon: 'nai:inspect',
    order: 60,
    component: Inspect,
  })
  ctx.client.router.page({
    path: '/history',
    name: () => t('nav.history'),
    icon: 'nai:history',
    order: 65,
    component: History,
  })
  ctx.client.router.page({
    path: '/nai-settings',
    name: () => t('nav.settings'),
    icon: 'nai:settings',
    order: -100,
    position: 'bottom',
    component: Settings,
  })
}
