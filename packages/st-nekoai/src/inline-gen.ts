import { reactive, type Ref } from 'vue'
import { formatError, pushImages } from '../../nekoai-gui/client/store'
import { t } from '../../nekoai-gui/client/i18n'
import {
  joinPrompt,
  type GenerateCallOptions,
  type GeneratePresetForm,
  type HostData,
  type MetadataPayload,
} from '../../nekoai-gui/src/shared'
import { expandPrompt, getST, type STMessage } from './chat'
import { PLUGIN_BASE } from './host-http'

export type QueueDelayWhen = 'after_response' | 'after_send'

export interface ChatImageGenSettings {
  enabled: boolean
  tagPrefix: string
  tagSuffix: string
  useRequestQueue: boolean
  queueDelay: number
  queueDelayWhen: QueueDelayWhen
}

export interface ChatImageRef {
  id: string
  promptKey: string
}

const SETTINGS_KEY = 'nekoai'
const IMAGE_KEYS = new Set([
  'image',
  'mask',
  'reference_image_multiple',
  'reference_information_extracted_multiple',
  'reference_strength_multiple',
  'director_reference_images',
  'director_reference_descriptions',
  'director_reference_information_extracted',
  'director_reference_strength_values',
  'director_reference_secondary_strength_values',
])
const UI_KEYS = new Set(['customSize', 'rawV4', 'streamCall', 'isOpus', 'forceZip', 'basePrompt', 'baseNegative'])
const I2I_KEYS = new Set(['strength', 'noise', 'img2img', 'add_original_image', 'inpaintImg2ImgStrength'])

const SCAN_EVENTS: Record<string, number> = {
  MESSAGE_SENT: 500,
  MESSAGE_RECEIVED: 500,
  MESSAGE_EDITED: 100,
  MESSAGE_UPDATED: 100,
  MESSAGE_DELETED: 100,
  MESSAGE_SWIPED: 100,
  MESSAGE_SWIPE_DELETED: 100,
  MESSAGE_FILE_EMBEDDED: 200,
  MORE_MESSAGES_LOADED: 500,
  USER_MESSAGE_RENDERED: 100,
  CHARACTER_MESSAGE_RENDERED: 100,
  CHAT_CHANGED: 2000,
  CHAT_LOADED: 1000,
  CHAT_CREATED: 1000,
  CHAT_DELETED: 500,
  GROUP_CHAT_CREATED: 1000,
  GROUP_CHAT_DELETED: 500,
}

export const chatImageGen = reactive<ChatImageGenSettings>({
  enabled: true,
  tagPrefix: '[img-gen]',
  tagSuffix: '[/img-gen]',
  useRequestQueue: true,
  queueDelay: 8,
  queueDelayWhen: 'after_response',
})

let hostRef: Ref<HostData> | null = null
const generating = new Set<string>()
const queue: Array<() => Promise<void>> = []
let draining = false
const scanTimers = new Map<string, number>()

function historySrc(id: string) {
  return `${PLUGIN_BASE}/history/${id}`
}

function clampDelay(value: unknown) {
  const n = Number(value)
  if (!Number.isFinite(n)) return 8
  return Math.min(12, Math.max(0, Math.round(n)))
}

function loadSettings() {
  const saved = getST().extensionSettings?.[SETTINGS_KEY]?.chatImageGen
  if (!saved || typeof saved !== 'object') return
  chatImageGen.enabled = saved.enabled !== false
  chatImageGen.tagPrefix = typeof saved.tagPrefix === 'string' && saved.tagPrefix ? saved.tagPrefix : '[img-gen]'
  chatImageGen.tagSuffix = typeof saved.tagSuffix === 'string' && saved.tagSuffix ? saved.tagSuffix : '[/img-gen]'
  chatImageGen.useRequestQueue = saved.useRequestQueue !== false
  chatImageGen.queueDelay = clampDelay(saved.queueDelay)
  chatImageGen.queueDelayWhen = saved.queueDelayWhen === 'after_send' ? 'after_send' : 'after_response'
}

function persistSettings() {
  const ctx = getST()
  if (!ctx.extensionSettings) return
  const prev = ctx.extensionSettings[SETTINGS_KEY]
  const next = prev && typeof prev === 'object' ? { ...prev } : {}
  delete next.token
  next.chatImageGen = { ...chatImageGen }
  ctx.extensionSettings[SETTINGS_KEY] = next
  ctx.saveSettingsDebounced?.()
}

export function saveChatImageGen() {
  if (!chatImageGen.tagPrefix) chatImageGen.tagPrefix = '[img-gen]'
  if (!chatImageGen.tagSuffix) chatImageGen.tagSuffix = '[/img-gen]'
  chatImageGen.queueDelay = clampDelay(chatImageGen.queueDelay)
  persistSettings()
  scanMessages()
}

function tagPattern() {
  const prefix = chatImageGen.tagPrefix.replace(/[.*+?^${}()|[\]\\]/g, '\\$&')
  const suffix = chatImageGen.tagSuffix.replace(/[.*+?^${}()|[\]\\]/g, '\\$&')
  return new RegExp(`${prefix}([\\s\\S]*?)${suffix}`, 'g')
}

function messageUid(message: STMessage, mesid: string) {
  return `${getST().chatId || 'chat'}::${message.id ?? mesid}`
}

function promptKey(message: STMessage, prompt: string, mesid: string) {
  return `${messageUid(message, mesid)}::${prompt.trim()}`
}

function isImageRef(item: unknown): item is ChatImageRef {
  if (!item || typeof item !== 'object') return false
  const ref = item as { id?: unknown; promptKey?: unknown }
  return typeof ref.id === 'string' && typeof ref.promptKey === 'string'
}

function getRefs(message: STMessage): ChatImageRef[] {
  const raw = message.extra?.nekoai_images
  return Array.isArray(raw) ? raw.filter(isImageRef) : []
}

function imagesForPrompt(message: STMessage, key: string) {
  return getRefs(message).filter((item) => item.promptKey === key)
}

function compactPreset(form: GeneratePresetForm, prompt: string): { metadata: MetadataPayload; options: GenerateCallOptions } {
  const metadata: Record<string, unknown> = {}
  for (const [key, value] of Object.entries(form || {})) {
    if (IMAGE_KEYS.has(key) || UI_KEYS.has(key) || I2I_KEYS.has(key)) continue
    if (value === undefined || value === null || value === '') continue
    if (Array.isArray(value) && !value.length) continue
    metadata[key] = value
  }
  metadata.prompt = joinPrompt(form.basePrompt, prompt)
  const negative = joinPrompt(form.baseNegative, form.negative_prompt)
  if (negative) metadata.negative_prompt = negative
  else delete metadata.negative_prompt
  metadata.action = 'generate'
  if (!form.customSize) {
    delete metadata.width
    delete metadata.height
  }
  if (!form.rawV4) {
    delete metadata.v4_prompt
    delete metadata.v4_negative_prompt
  }
  return {
    metadata: metadata as MetadataPayload,
    options: {
      stream: Boolean(form.streamCall),
      isOpus: Boolean(form.isOpus),
      forceZip: Boolean(form.forceZip),
    },
  }
}

async function generateFromPreset(prompt: string) {
  if (!hostRef) throw new Error('st.pluginMissing')
  const index = await hostRef.value.listPresets()
  let form: GeneratePresetForm = {}
  try {
    form = (await hostRef.value.loadPreset(index.current || 'default')).form || {}
  } catch {
    form = {}
  }
  const { metadata, options } = compactPreset(form, expandPrompt(prompt))
  return hostRef.value.generateImage(metadata, options)
}

function resolveMessage(message: STMessage, mesid: string) {
  const chat = getST().chat
  if (!chat?.length) return message
  if (message.id != null) {
    const found = chat.find((item) => item.id === message.id)
    if (found) return found
  }
  const index = Number(mesid)
  if (Number.isInteger(index) && chat[index]) return chat[index]
  return message
}

async function attachImages(message: STMessage, mesid: string, key: string, images: { id?: string }[]) {
  const mes = resolveMessage(message, mesid)
  mes.extra = mes.extra || {}
  const refs = getRefs(mes)
  for (const image of images) {
    if (!image.id || refs.some((item) => item.id === image.id)) continue
    refs.push({ id: image.id, promptKey: key })
  }
  mes.extra.nekoai_images = refs
  await (getST().saveChat || getST().saveChatConditional)?.()
  return mes
}

function showFullscreen(refs: ChatImageRef[], start: number) {
  document.getElementById('nekoai-inline-viewer')?.remove()
  let index = start
  const overlay = document.createElement('div')
  overlay.id = 'nekoai-inline-viewer'
  overlay.className = 'nekoai-inline-viewer'
  const frame = document.createElement('div')
  frame.className = 'nekoai-inline-viewer-frame'
  const img = document.createElement('img')
  const show = () => {
    img.src = historySrc(refs[index].id)
  }
  const close = () => {
    overlay.remove()
    window.removeEventListener('keydown', onKey)
  }
  const onKey = (event: KeyboardEvent) => {
    if (event.key === 'Escape') close()
    if (event.key === 'ArrowLeft') {
      index = (index - 1 + refs.length) % refs.length
      show()
    }
    if (event.key === 'ArrowRight') {
      index = (index + 1) % refs.length
      show()
    }
  }
  frame.addEventListener('click', close)
  img.addEventListener('click', (event) => event.stopPropagation())
  frame.append(img)
  overlay.append(frame)
  document.body.append(overlay)
  window.addEventListener('keydown', onKey)
  show()
}

function renderGallery(card: HTMLElement, message: STMessage) {
  const key = card.dataset.promptKey || ''
  const refs = imagesForPrompt(message, key)
  const gallery = card.querySelector('.nekoai-inline-gallery')
  if (!(gallery instanceof HTMLElement)) return
  gallery.replaceChildren()
  if (!refs.length) return

  let index = refs.length - 1
  const img = document.createElement('img')
  img.className = 'nekoai-inline-img'
  const show = () => {
    img.src = historySrc(refs[index].id)
  }
  img.addEventListener('click', () => showFullscreen(refs, index))
  gallery.append(img)

  if (refs.length > 1) {
    const nav = document.createElement('div')
    nav.className = 'nekoai-inline-nav'
    const label = document.createElement('span')
    const move = (delta: number) => {
      index = (index + delta + refs.length) % refs.length
      show()
      label.textContent = `${index + 1} / ${refs.length}`
    }
    const prev = document.createElement('button')
    prev.type = 'button'
    prev.textContent = '‹'
    prev.addEventListener('click', (event) => {
      event.preventDefault()
      event.stopPropagation()
      move(-1)
    })
    const next = document.createElement('button')
    next.type = 'button'
    next.textContent = '›'
    next.addEventListener('click', (event) => {
      event.preventDefault()
      event.stopPropagation()
      move(1)
    })
    label.textContent = `${index + 1} / ${refs.length}`
    nav.append(prev, label, next)
    gallery.append(nav)
  }
  show()
}

async function drainQueue() {
  if (draining) return
  draining = true
  while (queue.length) {
    const job = queue.shift()
    if (!job) break
    const delay = clampDelay(chatImageGen.queueDelay) * 1000
    if (chatImageGen.queueDelayWhen === 'after_send') {
      job().catch((error) => console.error('[NekoAI] inline generate failed', error))
      if (queue.length) await new Promise((resolve) => setTimeout(resolve, delay))
    } else {
      try {
        await job()
      } catch (error) {
        console.error('[NekoAI] inline generate failed', error)
      }
      if (queue.length) await new Promise((resolve) => setTimeout(resolve, delay))
    }
  }
  draining = false
}

function enqueue(job: () => Promise<void>) {
  if (!chatImageGen.useRequestQueue) {
    void job().catch((error) => console.error('[NekoAI] inline generate failed', error))
    return
  }
  queue.push(job)
  void drainQueue()
}

function setButton(button: HTMLButtonElement, label: string, disabled: boolean, title = '') {
  button.textContent = label
  button.disabled = disabled
  button.title = title || label
}

function generateForCard(card: HTMLElement, message: STMessage, mesid: string, prompt: string) {
  const key = promptKey(message, prompt, mesid)
  const button = card.querySelector('.nekoai-inline-btn')
  if (!(button instanceof HTMLButtonElement) || button.disabled || generating.has(key)) return

  setButton(button, t('st.chatImage.generating'), true)
  enqueue(async () => {
    generating.add(key)
    try {
      const images = await generateFromPreset(prompt)
      const mes = await attachImages(message, mesid, key, images)
      pushImages(images)
      renderGallery(card, mes)
      setButton(button, t('st.chatImage.generate'), false)
    } catch (error) {
      setButton(button, t('st.chatImage.retry'), false, formatError(error))
      throw error
    } finally {
      generating.delete(key)
    }
  })
}

function createCard(message: STMessage, mesid: string, prompt: string) {
  const card = document.createElement('div')
  card.className = 'nekoai-inline'
  card.dataset.promptKey = promptKey(message, prompt, mesid)

  const button = document.createElement('button')
  button.type = 'button'
  button.className = 'nekoai-inline-btn'
  button.textContent = t('st.chatImage.generate')
  button.addEventListener('click', (event) => {
    event.preventDefault()
    event.stopPropagation()
    generateForCard(card, message, mesid, prompt)
  })

  const gallery = document.createElement('div')
  gallery.className = 'nekoai-inline-gallery'
  card.append(button, gallery)
  renderGallery(card, message)
  return card
}

function replaceTag(root: HTMLElement, fullTag: string, card: HTMLElement) {
  const text = root.textContent || ''
  const index = text.indexOf(fullTag)
  if (index === -1) return false

  const walker = document.createTreeWalker(root, NodeFilter.SHOW_TEXT)
  let pos = 0
  let startNode: Text | null = null
  let startOffset = 0
  let endNode: Text | null = null
  let endOffset = 0

  let node = walker.nextNode()
  while (node) {
    const value = node.textContent || ''
    const start = pos
    const end = pos + value.length
    if (!startNode && index >= start && index < end) {
      startNode = node as Text
      startOffset = index - start
    }
    if (startNode && index + fullTag.length > start && index + fullTag.length <= end) {
      endNode = node as Text
      endOffset = index + fullTag.length - start
      break
    }
    pos = end
    node = walker.nextNode()
  }

  if (!startNode || !endNode) return false
  const range = document.createRange()
  range.setStart(startNode, startOffset)
  range.setEnd(endNode, endOffset)
  range.deleteContents()
  range.insertNode(card)
  return true
}

function processMessage(message: STMessage, mesid: string, element: HTMLElement) {
  const mesText = element.querySelector('.mes_text')
  if (!(mesText instanceof HTMLElement)) return
  const matches = [...(message.mes || '').matchAll(tagPattern())].filter((match) => (match[1] || '').trim())
  if (!matches.length) return

  const cards = Array.from(mesText.querySelectorAll('.nekoai-inline')).filter((node): node is HTMLElement => node instanceof HTMLElement)
  if (cards.length === matches.length) {
    cards.forEach((card, i) => {
      card.dataset.promptKey = promptKey(message, (matches[i][1] || '').trim(), mesid)
      renderGallery(card, message)
    })
    return
  }

  for (const match of matches) {
    const fullTag = match[0]
    const prompt = (match[1] || '').trim()
    if (!(mesText.textContent || '').includes(fullTag)) continue
    const card = createCard(message, mesid, prompt)
    if (!replaceTag(mesText, fullTag, card)) mesText.append(card)
  }

  mesText.querySelectorAll('.nekoai-inline').forEach((card) => {
    if (card instanceof HTMLElement) renderGallery(card, message)
  })
}

function scanMessages() {
  if (!chatImageGen.enabled) return
  const chat = getST().chat
  if (!chat?.length) return
  const nodes = Array.from(document.querySelectorAll('#chat .mes'))
  chat.forEach((message, index) => {
    const mesid = String(index)
    let element: HTMLElement | undefined
    for (const node of nodes) {
      if (node instanceof HTMLElement && node.getAttribute('mesid') === mesid) {
        element = node
        break
      }
    }
    if (element) processMessage(message, mesid, element)
  })
}

function scheduleScan(key: string, delay: number) {
  const prev = scanTimers.get(key)
  if (prev) window.clearTimeout(prev)
  scanTimers.set(key, window.setTimeout(() => {
    scanTimers.delete(key)
    scanMessages()
  }, delay))
}

function registerEvents() {
  const ctx = getST()
  const types = ctx.eventTypes || {}
  for (const [key, delay] of Object.entries(SCAN_EVENTS)) {
    const name = types[key]
    if (name && ctx.eventSource?.on) ctx.eventSource.on(name, () => scheduleScan(key, delay))
  }
}

export function installInlineGen(host: Ref<HostData>) {
  hostRef = host
  loadSettings()
  persistSettings()
  registerEvents()
  if (getST().chat?.length) scheduleScan('init', 2000)
}
