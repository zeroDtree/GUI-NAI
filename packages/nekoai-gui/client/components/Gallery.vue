<script setup lang="ts">
import { ref } from 'vue'
import type { SerializedImage } from '../../src/shared'
import ImageViewer from './ImageViewer.vue'
import { copyImage, copyText, displaySrc, downloadImage, ensureDataURL, formatError, gallery, sendTo } from '../store'
import { t } from '../i18n'

const emit = defineEmits<{
  use: [image: SerializedImage]
}>()

const viewer = ref(false)
const viewerIndex = ref(0)
const notice = ref('')
const error = ref('')

function openViewer(index: number) {
  viewerIndex.value = index
  viewer.value = true
}

async function useAsInput(item: SerializedImage) {
  error.value = ''
  try {
    item.dataURL = await ensureDataURL(item)
    emit('use', item)
  } catch (err) {
    error.value = formatError(err)
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

async function copyPic(item: SerializedImage) {
  error.value = ''
  try {
    await copyImage(item)
    notice.value = t('common.copied')
  } catch (err) {
    error.value = formatError(err) === String(err) ? t('common.copyFailed') : formatError(err)
  }
}

async function copyPrompt(item: SerializedImage) {
  error.value = ''
  try {
    await copyText(item.prompt || '')
    notice.value = t('common.copied')
  } catch (err) {
    error.value = t('common.copyFailed')
  }
}
</script>

<template>
  <div>
    <div class="param"><span>{{ t('common.gallery') }}</span></div>
    <p v-if="!gallery.length" class="nai-desc">{{ t('common.galleryEmpty') }}</p>
    <p v-if="notice" class="nai-status">{{ notice }}</p>
    <p v-if="error" class="nai-error">{{ error }}</p>
    <div class="nai-gallery">
      <div v-for="(item, i) in gallery" :key="item.id || i" class="nai-thumb">
        <img :src="displaySrc(item)" :alt="item.filename" @click="openViewer(i)">
        <div class="acts">
          <el-button size="small" @click="downloadImage(item)">{{ t('common.download') }}</el-button>
          <el-button size="small" @click="copyPic(item)">{{ t('common.copyImage') }}</el-button>
          <el-button v-if="item.prompt" size="small" @click="copyPrompt(item)">{{ t('common.copyPrompt') }}</el-button>
          <el-button size="small" @click="send(item)">{{ t('common.sendToPages') }}</el-button>
          <el-button size="small" @click="useAsInput(item)">{{ t('common.useAsInput') }}</el-button>
        </div>
      </div>
    </div>
    <ImageViewer :images="gallery" :index="viewerIndex" :visible="viewer" @close="viewer = false" @update:index="viewerIndex = $event" />
  </div>
</template>
