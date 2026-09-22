<script setup lang="ts">
import { computed, reactive, ref, watch } from 'vue'
import { useRpc } from '@cordisjs/client'
import { type EnhancePayload, type HostData } from '../../src/shared'
import ImageField from '../components/ImageField.vue'
import Gallery from '../components/Gallery.vue'
import { formatError, pushImages, transfer } from '../store'
import { formatProgress, t } from '../i18n'

const rpc = useRpc<HostData>()
const error = ref('')
const image = ref(transfer.image)
const scale = ref<2 | 4>(4)
const target = ref<[number, number] | null>(null)
const enhance = reactive<EnhancePayload>({
  prompt: '',
  model: rpc.value.uiOptions.models[0]?.value,
  sampler: rpc.value.uiOptions.samplers[0]?.value,
  steps: 28,
  scale: 6,
  strength: 0.5,
  noise: 0,
  upscaleFactor: 1.5,
  seed: undefined,
  qualityToggle: true,
})

watch(() => transfer.image, (value) => {
  if (!value) return
  image.value = value
  transfer.image = ''
}, { immediate: true })
watch(() => transfer.prompt, (value) => {
  if (!value) return
  enhance.prompt = value
  transfer.prompt = ''
}, { immediate: true })

const busy = computed(() => rpc.value.progress.kind === 'busy')

async function previewSize() {
  if (!image.value) return
  const parsed = await rpc.value.parseImage(image.value)
  target.value = await rpc.value.scaleDimensions(parsed.width, parsed.height, enhance.upscaleFactor ?? 1.5)
}

async function runUpscale() {
  error.value = ''
  try {
    pushImages(await rpc.value.upscale(image.value, scale.value))
  } catch (err) {
    error.value = formatError(err)
  }
}

async function runEnhance() {
  error.value = ''
  try {
    pushImages(await rpc.value.enhance(image.value, { ...enhance }))
  } catch (err) {
    error.value = formatError(err)
  }
}
</script>

<template>
  <div class="nai-page">
    <h2>{{ t('upscale.title') }}</h2>
    <p class="nai-desc">{{ t('upscale.desc') }}</p>
    <div class="nai-grid">
      <div>
        <div class="nai-card">
          <ImageField v-model="image" :label="t('common.sourceImage')" />
        </div>
        <div class="nai-card">
          <div class="param"><span>{{ t('upscale.dedicated') }}</span></div>
          <el-radio-group v-model="scale">
            <el-radio :value="2">2x</el-radio>
            <el-radio :value="4">4x</el-radio>
          </el-radio-group>
          <el-button type="primary" :loading="busy" style="display:block;margin-top:8px" @click="runUpscale">{{ t('upscale.run') }}</el-button>
        </div>
        <div class="nai-card">
          <div class="param"><span>{{ t('upscale.enhance') }}</span></div>
          <div class="nai-field">
            <div class="param"><span>{{ t('common.prompt') }}</span></div>
            <el-input v-model="enhance.prompt" type="textarea" :rows="3" />
          </div>
          <div class="nai-row">
            <div class="nai-field">
              <div class="param"><span>upscaleFactor</span></div>
              <el-slider v-model="enhance.upscaleFactor" :min="1" :max="4" :step="0.1" />
            </div>
            <div class="nai-field">
              <div class="param"><span>strength</span></div>
              <el-slider v-model="enhance.strength" :min="0" :max="1" :step="0.01" />
            </div>
            <div class="nai-field">
              <div class="param"><span>noise</span></div>
              <el-slider v-model="enhance.noise" :min="0" :max="1" :step="0.01" />
            </div>
          </div>
          <div class="nai-row">
            <div class="nai-field">
              <div class="param"><span>{{ t('common.model') }}</span></div>
              <el-select v-model="enhance.model">
                <el-option v-for="item in rpc.uiOptions.models" :key="item.value" :label="item.label" :value="item.value" />
              </el-select>
            </div>
            <div class="nai-field">
              <div class="param"><span>{{ t('common.sampler') }}</span></div>
              <el-select v-model="enhance.sampler">
                <el-option v-for="item in rpc.uiOptions.samplers" :key="item.value" :label="item.label" :value="item.value" />
              </el-select>
            </div>
            <div class="nai-field">
              <div class="param"><span>steps</span></div>
              <el-input-number v-model="enhance.steps" :min="1" :max="50" />
            </div>
            <div class="nai-field">
              <div class="param"><span>scale</span></div>
              <el-input-number v-model="enhance.scale" :min="0" :step="0.1" />
            </div>
            <div class="nai-field">
              <div class="param"><span>seed</span></div>
              <el-input-number v-model="enhance.seed" :min="0" />
            </div>
          </div>
          <el-switch v-model="enhance.qualityToggle" active-text="qualityToggle" />
          <div>
            <el-button size="small" @click="previewSize">{{ t('upscale.previewSize') }}</el-button>
            <span v-if="target" class="nai-status">{{ t('upscale.target', { arg: `${target[0]} × ${target[1]}` }) }}</span>
          </div>
          <el-button type="primary" :loading="busy" style="margin-top: 8px" @click="runEnhance">{{ t('upscale.enhance') }}</el-button>
          <p v-if="error" class="nai-error">{{ error }}</p>
          <p class="nai-status">{{ formatProgress(rpc.progress.message, rpc.progress.kind) }}</p>
        </div>
      </div>
      <div class="nai-card">
        <Gallery @use="(img) => image = img.dataURL" />
      </div>
    </div>
  </div>
</template>
