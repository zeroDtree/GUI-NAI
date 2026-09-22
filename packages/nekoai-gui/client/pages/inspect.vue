<script setup lang="ts">
import { ref, watch } from 'vue'
import { useRpc } from '@cordisjs/client'
import type { HostData } from '../../src/shared'
import ImageField from '../components/ImageField.vue'
import { formatError, transfer } from '../store'
import { t } from '../i18n'

const rpc = useRpc<HostData>()
const error = ref('')
const image = ref(transfer.image)
const metadata = ref('')
const summary = ref('')
const parsed = ref('')

watch(() => transfer.image, (value) => {
  if (value) image.value = value
})

async function run() {
  error.value = ''
  try {
    metadata.value = JSON.stringify(await rpc.value.extractImageMetadata(image.value), null, 2)
    const sum: any = await rpc.value.getImageSummary(image.value)
    summary.value = JSON.stringify(sum, null, 2)
    parsed.value = JSON.stringify(await rpc.value.parseImage(image.value), null, 2)
    transfer.summary = sum
    if (sum?.positivePrompt) transfer.prompt = sum.positivePrompt
    if (sum?.negative_prompt) transfer.negative = sum.negative_prompt
  } catch (err) {
    error.value = formatError(err)
  }
}

function fillGenerate() {
  transfer.image = image.value
}
</script>

<template>
  <div class="nai-page">
    <h2>{{ t('inspect.title') }}</h2>
    <p class="nai-desc">{{ t('inspect.desc') }}</p>
    <div class="nai-card">
      <ImageField v-model="image" :label="t('common.image')" />
      <el-button type="primary" style="margin-top: 8px" @click="run">{{ t('inspect.parse') }}</el-button>
      <el-button @click="fillGenerate">{{ t('inspect.sendGenerate') }}</el-button>
      <p v-if="error" class="nai-error">{{ error }}</p>
    </div>
    <div class="nai-card">
      <div class="param"><span>getImageSummary</span></div>
      <pre class="nai-chat">{{ summary }}</pre>
    </div>
    <div class="nai-card">
      <div class="param"><span>extractImageMetadata</span></div>
      <pre class="nai-chat">{{ metadata }}</pre>
    </div>
    <div class="nai-card">
      <div class="param"><span>parseImage</span></div>
      <pre class="nai-chat">{{ parsed }}</pre>
    </div>
  </div>
</template>
