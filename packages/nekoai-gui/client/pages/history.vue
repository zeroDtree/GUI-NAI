<script setup lang="ts">
import { computed, onMounted, ref, watch } from 'vue'
import { useRpc } from '@cordisjs/client'
import type { HostData, SerializedImage } from '../../src/shared'
import ImageViewer from '../components/ImageViewer.vue'
import {
  copyImage,
  copyText,
  displaySrc,
  downloadImage,
  ensureDataURL,
  formatError,
  gallery,
  hydrateGallery,
  removeFromGallery,
  replaceGallery,
  sendTo,
} from '../store'
import { t } from '../i18n'

const rpc = useRpc<HostData>()
const query = ref('')
const sortBy = ref<'newest' | 'oldest'>('newest')
const page = ref(1)
const pageSize = 20
const viewer = ref(false)
const viewerIndex = ref(0)
const notice = ref('')
const error = ref('')

onMounted(() => hydrateGallery(rpc.value))

watch([query, sortBy], () => {
  page.value = 1
})

const filtered = computed(() => {
  let list = [...gallery]
  const q = query.value.trim().toLowerCase()
  if (q) {
    list = list.filter((item) => {
      const sourceLabel = item.source ? t(`history.source.${item.source}`) : ''
      return (item.prompt || '').toLowerCase().includes(q)
        || (item.negative || '').toLowerCase().includes(q)
        || (item.source || '').toLowerCase().includes(q)
        || sourceLabel.toLowerCase().includes(q)
    })
  }
  if (sortBy.value === 'oldest') list.reverse()
  return list
})

const totalPages = computed(() => Math.max(1, Math.ceil(filtered.value.length / pageSize)))
const pageItems = computed(() => {
  const start = (page.value - 1) * pageSize
  return filtered.value.slice(start, start + pageSize)
})

watch(totalPages, (total) => {
  if (page.value > total) page.value = total
})

function openViewer(item: SerializedImage) {
  viewerIndex.value = Math.max(0, filtered.value.findIndex((entry) => entry === item || (entry.id && entry.id === item.id)))
  viewer.value = true
}

function sourceLabel(item: SerializedImage) {
  return item.source ? t(`history.source.${item.source}`) : ''
}

async function copyPic(item: SerializedImage) {
  error.value = ''
  try {
    await copyImage(item)
    notice.value = t('common.copied')
  } catch {
    error.value = t('common.copyFailed')
  }
}

async function copyPrompt(item: SerializedImage) {
  error.value = ''
  try {
    await copyText(item.prompt || '')
    notice.value = t('common.copied')
  } catch {
    error.value = t('common.copyFailed')
  }
}

async function send(item: SerializedImage) {
  error.value = ''
  try {
    await sendTo(item, item.prompt)
    notice.value = t('common.sendToPages')
  } catch (err) {
    error.value = formatError(err)
  }
}

async function useAsInput(item: SerializedImage) {
  error.value = ''
  try {
    transferImage(await ensureDataURL(item), item.prompt)
  } catch (err) {
    error.value = formatError(err)
  }
}

function transferImage(dataURL: string, prompt?: string) {
  sendTo(dataURL, prompt)
}

async function remove(item: SerializedImage) {
  if (!item.id) return
  if (!window.confirm(t('history.deleteConfirm'))) return
  error.value = ''
  try {
    await rpc.value.deleteHistory(item.id)
    removeFromGallery(item.id)
  } catch (err) {
    error.value = formatError(err)
  }
}

async function clearAll() {
  if (!window.confirm(t('history.clearConfirm'))) return
  error.value = ''
  try {
    await rpc.value.clearHistory()
    replaceGallery([])
  } catch (err) {
    error.value = formatError(err)
  }
}
</script>

<template>
  <div class="nai-page">
    <h2>{{ t('history.title') }}</h2>
    <p class="nai-desc">{{ t('history.desc') }}</p>
    <div class="nai-card">
      <div class="nai-history-filters">
        <el-input v-model="query" :placeholder="t('history.search')" clearable />
        <el-select v-model="sortBy" style="width: 160px">
          <el-option :label="t('history.newest')" value="newest" />
          <el-option :label="t('history.oldest')" value="oldest" />
        </el-select>
        <el-button size="small" type="danger" :disabled="!gallery.length" @click="clearAll">{{ t('history.clear') }}</el-button>
      </div>
      <p class="nai-status">{{ t('history.total', { arg: filtered.length }) }}</p>
      <p v-if="notice" class="nai-status">{{ notice }}</p>
      <p v-if="error" class="nai-error">{{ error }}</p>
    </div>
    <p v-if="!filtered.length" class="nai-desc">{{ t('history.empty') }}</p>
    <div v-else class="nai-gallery nai-history-grid">
      <div v-for="item in pageItems" :key="item.id || item.filename" class="nai-thumb">
        <img :src="displaySrc(item)" :alt="item.filename" @click="openViewer(item)">
        <div class="nai-thumb-meta">
          <div class="prompt">{{ item.prompt || item.filename }}</div>
          <div class="meta">
            <span>{{ sourceLabel(item) }}</span>
            <span v-if="item.createdAt">{{ new Date(item.createdAt).toLocaleString() }}</span>
          </div>
        </div>
        <div class="acts">
          <el-button size="small" @click="downloadImage(item)">{{ t('common.download') }}</el-button>
          <el-button size="small" @click="copyPic(item)">{{ t('common.copyImage') }}</el-button>
          <el-button v-if="item.prompt" size="small" @click="copyPrompt(item)">{{ t('common.copyPrompt') }}</el-button>
          <el-button size="small" @click="send(item)">{{ t('common.sendToPages') }}</el-button>
          <el-button size="small" @click="useAsInput(item)">{{ t('common.useAsInput') }}</el-button>
          <el-button size="small" type="danger" @click="remove(item)">{{ t('common.delete') }}</el-button>
        </div>
      </div>
    </div>
    <div v-if="totalPages > 1" class="nai-history-page">
      <el-button size="small" :disabled="page <= 1" @click="page--">‹</el-button>
      <span>{{ t('history.page', { current: page, total: totalPages }) }}</span>
      <el-button size="small" :disabled="page >= totalPages" @click="page++">›</el-button>
    </div>
    <ImageViewer :images="filtered" :index="viewerIndex" :visible="viewer" @close="viewer = false" @update:index="viewerIndex = $event" />
  </div>
</template>
