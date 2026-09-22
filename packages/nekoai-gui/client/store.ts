import { reactive } from 'vue'
import type { HostData, SerializedImage } from '../src/shared'
import { t } from './i18n'

export const gallery = reactive<SerializedImage[]>([])

export const transfer = reactive({
  image: '' as string,
  prompt: '' as string,
  negative: '' as string,
  summary: null as any,
})

export function displaySrc(image: SerializedImage) {
  return image.dataURL || image.url || ''
}

export function pushImages(images: SerializedImage | SerializedImage[]) {
  const list = Array.isArray(images) ? images : [images]
  for (const item of [...list].reverse()) {
    const idx = item.id ? gallery.findIndex((entry) => entry.id === item.id) : -1
    if (idx >= 0) gallery.splice(idx, 1)
    gallery.unshift(item)
  }
}

export function removeFromGallery(id: string) {
  const idx = gallery.findIndex((item) => item.id === id)
  if (idx >= 0) gallery.splice(idx, 1)
}

export function replaceGallery(items: SerializedImage[]) {
  gallery.splice(0, gallery.length, ...items)
}

export async function hydrateGallery(rpc: HostData) {
  try {
    replaceGallery(await rpc.listHistory())
  } catch {
    // Host may not have written the data directory yet.
  }
}

export async function sendTo(image: string | SerializedImage, prompt = '') {
  const src = typeof image === 'string' ? image : await ensureDataURL(image)
  transfer.image = src
  const nextPrompt = prompt || (typeof image === 'string' ? '' : image.prompt) || ''
  if (nextPrompt) transfer.prompt = nextPrompt
}

export async function ensureDataURL(image: SerializedImage): Promise<string> {
  if (image.dataURL) return image.dataURL
  const src = image.url
  if (!src) throw new Error('error.noImage')
  const response = await fetch(src)
  if (!response.ok) throw new Error('error.noImage')
  const dataURL = await blobToDataURL(await response.blob())
  image.dataURL = dataURL
  return dataURL
}

export async function downloadImage(image: SerializedImage) {
  const href = displaySrc(image)
  if (!href) return
  const a = document.createElement('a')
  a.href = href
  a.download = image.filename || 'image.png'
  a.click()
}

export async function copyImage(image: SerializedImage) {
  const src = displaySrc(image)
  if (!src) throw new Error('error.noImage')
  const blob = await (await fetch(src)).blob()
  const type = blob.type || 'image/png'
  if (!navigator.clipboard?.write) throw new Error('common.copyFailed')
  await navigator.clipboard.write([new ClipboardItem({ [type]: blob })])
}

export async function copyText(text: string) {
  if (!text) throw new Error('common.copyFailed')
  await navigator.clipboard.writeText(text)
}

export async function fileToDataURL(file: File): Promise<string> {
  return new Promise((resolve, reject) => {
    const reader = new FileReader()
    reader.onload = () => resolve(String(reader.result))
    reader.onerror = () => reject(reader.error)
    reader.readAsDataURL(file)
  })
}

function blobToDataURL(blob: Blob): Promise<string> {
  return new Promise((resolve, reject) => {
    const reader = new FileReader()
    reader.onload = () => resolve(String(reader.result))
    reader.onerror = () => reject(reader.error)
    reader.readAsDataURL(blob)
  })
}

export function formatError(error: unknown) {
  const message = error instanceof Error ? error.message : String(error)
  const key = message.replace(/^Error:\s*/, '').trim()
  return t(key)
}
