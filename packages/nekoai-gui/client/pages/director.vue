<script setup lang="ts">
import { computed, reactive, ref, watch } from 'vue'
import { useRpc } from '@cordisjs/client'
import { type HostData } from '../../src/shared'
import ImageField from '../components/ImageField.vue'
import Gallery from '../components/Gallery.vue'
import { formatError, pushImages, transfer } from '../store'
import { formatProgress, t } from '../i18n'

const rpc = useRpc<HostData>()
const error = ref('')
const image = ref(transfer.image)
const tool = ref(rpc.value.uiOptions.directorTools[0]?.value ?? '')
const colorizePrompt = ref('')
const defry = ref(0)
const emotion = ref(rpc.value.uiOptions.emotions[0]?.value ?? '')
const emotionPrompt = ref('')
const emotionLevel = ref(rpc.value.uiOptions.emotionLevels[0]?.value ?? 0)
const raw = reactive({
  req_type: rpc.value.uiOptions.directorTools[0]?.value ?? '',
  prompt: '',
  defry: 0,
})

watch(() => transfer.image, (value) => {
  if (value) image.value = value
})

const busy = computed(() => rpc.value.progress.kind === 'busy')

async function run() {
  error.value = ''
  if (!image.value) {
    error.value = t('error.noImage')
    return
  }
  try {
    let result
    if (tool.value === 'emotion') {
      result = await rpc.value.changeEmotion(image.value, emotion.value, emotionPrompt.value, emotionLevel.value)
    } else if (tool.value === 'colorize') {
      result = await rpc.value.colorize(image.value, colorizePrompt.value, defry.value)
    } else if (tool.value === 'raw') {
      result = await rpc.value.useDirectorTool({
        req_type: raw.req_type,
        image: image.value,
        prompt: raw.prompt,
        defry: raw.defry,
      })
    } else {
      result = await rpc.value.useDirectorTool({
        req_type: tool.value,
        image: image.value,
      })
    }
    pushImages(result)
  } catch (err) {
    error.value = formatError(err)
  }
}
</script>

<template>
  <div class="nai-page">
    <h2>{{ t('director.title') }}</h2>
    <p class="nai-desc">{{ t('director.desc') }}</p>
    <div class="nai-grid">
      <div>
        <div class="nai-card">
          <ImageField v-model="image" :label="t('common.inputImage')" />
        </div>
        <div class="nai-card">
          <div class="nai-field">
            <div class="param"><span>{{ t('common.tool') }}</span></div>
            <el-select v-model="tool">
              <el-option v-for="item in rpc.uiOptions.directorTools" :key="item.value" :label="item.label" :value="item.value" />
              <el-option :label="t('director.raw')" value="raw" />
            </el-select>
          </div>
          <template v-if="tool === 'colorize'">
            <div class="nai-field">
              <div class="param"><span>{{ t('director.extraPrompt') }}</span></div>
              <el-input v-model="colorizePrompt" />
            </div>
            <div class="nai-field">
              <div class="param"><span>defry</span></div>
              <el-slider v-model="defry" :min="0" :max="5" :step="1" />
            </div>
          </template>
          <template v-if="tool === 'emotion'">
            <div class="nai-field">
              <div class="param"><span>{{ t('director.emotion') }}</span></div>
              <el-select v-model="emotion">
                <el-option v-for="item in rpc.uiOptions.emotions" :key="item.value" :label="item.label" :value="item.value" />
              </el-select>
            </div>
            <div class="nai-field">
              <div class="param"><span>{{ t('director.extraPrompt') }}</span></div>
              <el-input v-model="emotionPrompt" />
            </div>
            <div class="nai-field">
              <div class="param"><span>{{ t('common.strength') }}</span></div>
              <el-select v-model="emotionLevel">
                <el-option v-for="item in rpc.uiOptions.emotionLevels" :key="item.value" :label="item.label" :value="item.value" />
              </el-select>
            </div>
          </template>
          <template v-if="tool === 'raw'">
            <div class="nai-field">
              <div class="param"><span>req_type</span></div>
              <el-select v-model="raw.req_type">
                <el-option v-for="item in rpc.uiOptions.directorTools" :key="item.value" :label="item.label" :value="item.value" />
              </el-select>
            </div>
            <div class="nai-field">
              <div class="param"><span>prompt</span></div>
              <el-input v-model="raw.prompt" />
            </div>
            <div class="nai-field">
              <div class="param"><span>defry</span></div>
              <el-slider v-model="raw.defry" :min="0" :max="5" />
            </div>
            <p class="nai-desc">{{ t('director.autoSize') }}</p>
          </template>
          <el-button type="primary" :loading="busy" style="margin-top: 12px" @click="run">{{ t('common.run') }}</el-button>
          <p class="nai-status">{{ formatProgress(rpc.progress.message, rpc.progress.kind) }}</p>
          <p v-if="error" class="nai-error">{{ error }}</p>
        </div>
      </div>
      <div class="nai-card">
        <Gallery @use="(img) => image = img.dataURL" />
      </div>
    </div>
  </div>
</template>
