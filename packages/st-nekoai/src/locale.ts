import { reactive } from 'vue'
import { setLocale, type Locale } from '../../nekoai-gui/client/i18n'
import { getST, refreshFillTitles } from './chat'

export type LocalePref = 'follow' | Locale

const SETTINGS_KEY = 'nekoai'

export const localePref = reactive({ value: 'follow' as LocalePref })

function stLocale() {
  return getST().getCurrentLocale?.() || document.documentElement.lang || navigator.language
}

export function applyLocale() {
  setLocale(localePref.value === 'follow' ? stLocale() : localePref.value)
  refreshFillTitles()
}

export function loadLocalePref() {
  const saved = getST().extensionSettings?.[SETTINGS_KEY]?.locale
  localePref.value = saved === 'zh-CN' || saved === 'en-US' ? saved : 'follow'
  applyLocale()
}

export function saveLocalePref(pref: string) {
  localePref.value = pref === 'zh-CN' || pref === 'en-US' ? pref : 'follow'
  applyLocale()
  const ctx = getST()
  if (!ctx.extensionSettings) return
  const prev = ctx.extensionSettings[SETTINGS_KEY]
  ctx.extensionSettings[SETTINGS_KEY] = {
    ...(prev && typeof prev === 'object' ? prev : {}),
    locale: localePref.value,
  }
  ctx.saveSettingsDebounced?.()
}
