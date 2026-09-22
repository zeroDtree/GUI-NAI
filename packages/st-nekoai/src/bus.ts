import { reactive } from 'vue'

export type StPage = 'generate' | 'director' | 'upscale' | 'text' | 'inspect' | 'history' | 'settings'

export const stUi = reactive({
  open: false,
  page: 'generate' as StPage,
  fabVisible: true,
})

export function openPanel(page?: StPage) {
  if (page) stUi.page = page
  stUi.open = true
}

export function closePanel() {
  stUi.open = false
}
