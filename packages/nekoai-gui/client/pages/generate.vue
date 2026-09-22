<script setup lang="ts">
import { computed, reactive, ref, watch } from 'vue'
import { useRpc } from '@cordisjs/client'
import { type GeneratePresetForm, type HostData, type MetadataPayload } from '../../src/shared'
import ImageField from '../components/ImageField.vue'
import MaskEditor from '../components/MaskEditor.vue'
import Gallery from '../components/Gallery.vue'
import PresetBar from '../components/PresetBar.vue'
import { formatError, pushImages, transfer } from '../store'
import { formatProgress, t } from '../i18n'

const rpc = useRpc<HostData>()
const error = ref('')
const suggestions = ref<{ tag: string; confidence?: number; count?: number }[]>([])
const cost = ref<number | null>(null)
const customSize = ref(false)
const rawV4 = ref(false)

const form = reactive<MetadataPayload & {
  streamCall: boolean
  isOpus: boolean
  forceZip: boolean
  tagQuery: string
  tagModel: string
  tagLang: 'en' | 'jp'
}>({
  prompt: '1girl, cute, anime style',
  negative_prompt: '',
  model: rpc.value.uiOptions.models[0]?.value,
  action: rpc.value.uiOptions.actions[0]?.value,
  resPreset: rpc.value.uiOptions.resolutions[0]?.value,
  qualityToggle: true,
  ucPreset: 0,
  n_samples: 1,
  steps: 28,
  scale: 6,
  dynamic_thresholding: false,
  sampler: rpc.value.uiOptions.samplers[0]?.value,
  sm: false,
  sm_dyn: false,
  cfg_rescale: 0,
  noise_schedule: rpc.value.uiOptions.noises[0]?.value,
  strength: 0.5,
  noise: 0.1,
  add_original_image: true,
  inpaintImg2ImgStrength: 1,
  color_correct: false,
  autoSmea: false,
  use_coords: false,
  legacy_uc: false,
  normalize_reference_strength_multiple: false,
  deliberate_euler_ancestral_bug: false,
  prefer_brownian: false,
  params_version: 3,
  image_format: 'png',
  legacy: false,
  legacy_v3_extend: false,
  characterPrompts: [],
  reference_image_multiple: [],
  reference_information_extracted_multiple: [],
  reference_strength_multiple: [],
  director_reference_images: [],
  director_reference_descriptions: [],
  director_reference_information_extracted: [],
  director_reference_strength_values: [],
  director_reference_secondary_strength_values: [],
  streamCall: false,
  isOpus: false,
  forceZip: false,
  tagQuery: '',
  tagModel: rpc.value.uiOptions.models[0]?.value,
  tagLang: 'en',
})

watch(() => transfer.image, (image) => {
  if (!image) return
  form.image = image
  transfer.image = ''
}, { immediate: true })
watch(() => transfer.prompt, (prompt) => {
  if (!prompt) return
  form.prompt = prompt
  transfer.prompt = ''
}, { immediate: true })

const busy = computed(() => rpc.value.progress.kind === 'busy' || rpc.value.progress.kind === 'image')

function compact(): MetadataPayload {
  const skip = new Set(['streamCall', 'isOpus', 'forceZip', 'tagQuery', 'tagModel', 'tagLang'])
  const out: any = {}
  for (const [key, value] of Object.entries(form)) {
    if (skip.has(key)) continue
    if (value === undefined || value === null || value === '') continue
    if (Array.isArray(value) && value.length === 0) continue
    out[key] = value
  }
  if (!customSize.value) {
    delete out.width
    delete out.height
  }
  if (!rawV4.value) {
    delete out.v4_prompt
    delete out.v4_negative_prompt
  }
  if (form.action !== 'img2img' && form.action !== 'infill') {
    delete out.image
    delete out.strength
    delete out.noise
    delete out.img2img
  }
  if (form.action !== 'infill') {
    delete out.mask
    delete out.add_original_image
    delete out.inpaintImg2ImgStrength
  }
  return out
}

async function refreshCost() {
  try {
    cost.value = await rpc.value.calculateCost(compact(), form.isOpus)
  } catch {
    cost.value = null
  }
}

async function generate() {
  error.value = ''
  try {
    const images = await rpc.value.generateImage(compact(), {
      stream: form.streamCall,
      isOpus: form.isOpus,
      forceZip: form.forceZip,
    })
    pushImages(images)
  } catch (err) {
    error.value = formatError(err)
  }
}

async function dedupe() {
  if (form.prompt) form.prompt = await rpc.value.deduplicateTags(form.prompt)
}

async function suggest() {
  suggestions.value = await rpc.value.suggestTags(form.tagQuery || form.prompt || '', form.tagModel, form.tagLang)
}

function addChar() {
  form.characterPrompts = [...(form.characterPrompts || []), { prompt: '', uc: '', center: { x: 0.5, y: 0.5 }, enabled: true }]
}

function addVibe() {
  form.reference_image_multiple = [...(form.reference_image_multiple || []), '']
  form.reference_information_extracted_multiple = [...(form.reference_information_extracted_multiple || []), 1]
  form.reference_strength_multiple = [...(form.reference_strength_multiple || []), 0.6]
}

function addDirectorRef() {
  form.director_reference_images = [...(form.director_reference_images || []), '']
  form.director_reference_descriptions = [...(form.director_reference_descriptions || []), {
    caption: { base_caption: 'character&style', char_captions: [] },
  }]
  form.director_reference_information_extracted = [...(form.director_reference_information_extracted || []), 1]
  form.director_reference_strength_values = [...(form.director_reference_strength_values || []), 1]
  form.director_reference_secondary_strength_values = [...(form.director_reference_secondary_strength_values || []), 1]
}

function applyTag(tag: string) {
  form.prompt = form.prompt ? `${form.prompt}, ${tag}` : tag
}

const IMAGE_RELATED = [
  'image',
  'mask',
  'reference_image_multiple',
  'director_reference_images',
  'director_reference_descriptions',
  'reference_information_extracted_multiple',
  'reference_strength_multiple',
  'director_reference_information_extracted',
  'director_reference_strength_values',
  'director_reference_secondary_strength_values',
]

function snapshotForm(includeImages: boolean): GeneratePresetForm {
  const skip = new Set(['tagQuery', 'tagModel', 'tagLang'])
  const out: GeneratePresetForm = {
    customSize: customSize.value,
    rawV4: rawV4.value,
    streamCall: form.streamCall,
    isOpus: form.isOpus,
    forceZip: form.forceZip,
  }
  for (const [key, value] of Object.entries(form)) {
    if (skip.has(key)) continue
    if (!includeImages && IMAGE_RELATED.includes(key)) continue
    ;(out as any)[key] = value
  }
  return JSON.parse(JSON.stringify(out))
}

function applyPreset(payload: GeneratePresetForm) {
  customSize.value = Boolean(payload.customSize)
  rawV4.value = Boolean(payload.rawV4)
  const skip = new Set(['customSize', 'rawV4', 'tagQuery', 'tagModel', 'tagLang'])
  for (const key of Object.keys(form)) {
    if (skip.has(key)) continue
    if (key in payload) (form as any)[key] = structuredClone((payload as any)[key])
  }
  for (const key of IMAGE_RELATED) {
    if (key in payload) continue
    if (Array.isArray((form as any)[key])) (form as any)[key] = []
    else (form as any)[key] = undefined
  }
}
</script>

<template>
  <div class="nai-page">
    <h2>{{ t('generate.title') }}</h2>
    <p class="nai-desc">{{ t('generate.desc') }}</p>
    <div class="nai-grid">
      <div>
        <PresetBar :snapshot="snapshotForm" @apply="applyPreset" />
        <div class="nai-card">
          <div class="nai-field">
            <div class="param"><span>{{ t('generate.prompt') }}</span></div>
            <el-input v-model="form.prompt" type="textarea" :rows="4" />
            <div>
              <el-button size="small" @click="dedupe">{{ t('generate.dedupe') }}</el-button>
            </div>
          </div>
          <div class="nai-field" style="margin-top: 10px">
            <div class="param"><span>{{ t('generate.negative') }}</span></div>
            <el-input v-model="form.negative_prompt" type="textarea" :rows="3" />
          </div>
        </div>

        <div class="nai-card">
          <div class="nai-row">
            <div class="nai-field">
              <div class="param"><span>{{ t('common.model') }}</span></div>
              <el-select v-model="form.model" filterable>
                <el-option v-for="item in rpc.uiOptions.models" :key="item.value" :label="item.label" :value="item.value" />
              </el-select>
            </div>
            <div class="nai-field">
              <div class="param"><span>{{ t('generate.action') }}</span></div>
              <el-select v-model="form.action">
                <el-option v-for="item in rpc.uiOptions.actions" :key="item.value" :label="item.label" :value="item.value" />
              </el-select>
            </div>
            <div class="nai-field">
              <div class="param"><span>{{ t('generate.resPreset') }}</span></div>
              <el-select v-model="form.resPreset" :disabled="customSize">
                <el-option v-for="item in rpc.uiOptions.resolutions" :key="item.value" :label="item.label" :value="item.value" />
              </el-select>
            </div>
          </div>
          <el-switch v-model="customSize" :active-text="t('generate.customSize')" />
          <div v-if="customSize" class="nai-row">
            <div class="nai-field">
              <div class="param"><span>{{ t('generate.width') }}</span></div>
              <el-input-number v-model="form.width" :min="64" :step="64" />
            </div>
            <div class="nai-field">
              <div class="param"><span>{{ t('generate.height') }}</span></div>
              <el-input-number v-model="form.height" :min="64" :step="64" />
            </div>
          </div>
        </div>

        <el-collapse>
          <el-collapse-item :title="t('generate.sampleQuality')" name="sample">
            <div class="nai-row">
              <div class="nai-field">
                <div class="param"><span>{{ t('generate.steps') }}</span></div>
                <el-input-number v-model="form.steps" :min="1" :max="50" />
              </div>
              <div class="nai-field">
                <div class="param"><span>{{ t('generate.scale') }}</span></div>
                <el-input-number v-model="form.scale" :min="0" :step="0.1" />
              </div>
              <div class="nai-field">
                <div class="param"><span>{{ t('generate.samples') }}</span></div>
                <el-input-number v-model="form.n_samples" :min="1" :max="8" />
              </div>
              <div class="nai-field">
                <div class="param"><span>{{ t('generate.seed') }}</span></div>
                <el-input-number v-model="form.seed" :min="0" />
              </div>
              <div class="nai-field">
                <div class="param"><span>{{ t('generate.extraSeed') }}</span></div>
                <el-input-number v-model="form.extra_noise_seed" :min="0" />
              </div>
              <div class="nai-field">
                <div class="param"><span>{{ t('common.sampler') }}</span></div>
                <el-select v-model="form.sampler">
                  <el-option v-for="item in rpc.uiOptions.samplers" :key="item.value" :label="item.label" :value="item.value" />
                </el-select>
              </div>
              <div class="nai-field">
                <div class="param"><span>{{ t('generate.noiseSchedule') }}</span></div>
                <el-select v-model="form.noise_schedule">
                  <el-option v-for="item in rpc.uiOptions.noises" :key="item.value" :label="item.label" :value="item.value" />
                </el-select>
              </div>
              <div class="nai-field">
                <div class="param"><span>{{ t('generate.ucPreset') }}</span></div>
                <el-input-number v-model="form.ucPreset" :min="0" :max="3" />
              </div>
              <div class="nai-field">
                <div class="param"><span>CFG rescale</span></div>
                <el-input-number v-model="form.cfg_rescale" :min="0" :max="1" :step="0.05" />
              </div>
              <div class="nai-field">
                <div class="param"><span>skip_cfg_above_sigma</span></div>
                <el-input-number v-model="form.skip_cfg_above_sigma" :step="1" />
              </div>
              <div class="nai-field">
                <div class="param"><span>params_version</span></div>
                <el-input-number v-model="form.params_version" :min="1" :max="3" />
              </div>
              <div class="nai-field">
                <div class="param"><span>image_format</span></div>
                <el-select v-model="form.image_format">
                  <el-option label="png" value="png" />
                  <el-option label="jpeg" value="jpeg" />
                </el-select>
              </div>
            </div>
            <div class="nai-row">
              <el-switch v-model="form.qualityToggle" active-text="qualityToggle" />
              <el-switch v-model="form.dynamic_thresholding" active-text="dynamic_thresholding" />
              <el-switch v-model="form.sm" active-text="sm" />
              <el-switch v-model="form.sm_dyn" active-text="sm_dyn" />
              <el-switch v-model="form.autoSmea" active-text="autoSmea" />
              <el-switch v-model="form.legacy" active-text="legacy" />
              <el-switch v-model="form.legacy_v3_extend" active-text="legacy_v3_extend" />
              <el-switch v-model="form.deliberate_euler_ancestral_bug" active-text="deliberate_euler_ancestral_bug" />
              <el-switch v-model="form.prefer_brownian" active-text="prefer_brownian" />
              <el-switch v-model="form.legacy_uc" active-text="legacy_uc" />
              <el-switch v-model="form.use_coords" active-text="use_coords" />
              <el-switch v-model="form.color_correct" active-text="color_correct" />
            </div>
            <div class="nai-field">
              <div class="param"><span>{{ t('generate.streamField') }}</span></div>
              <el-input v-model="form.stream" :placeholder="t('generate.streamPlaceholder')" />
            </div>
          </el-collapse-item>

          <el-collapse-item :title="t('generate.img2img')" name="i2i">
            <ImageField v-model="form.image" :label="t('common.sourceImage')" />
            <div class="nai-row">
              <div class="nai-field">
                <div class="param"><span>strength</span></div>
                <el-slider v-model="form.strength" :min="0" :max="1" :step="0.01" />
              </div>
              <div class="nai-field">
                <div class="param"><span>noise</span></div>
                <el-slider v-model="form.noise" :min="0" :max="1" :step="0.01" />
              </div>
              <div class="nai-field">
                <div class="param"><span>inpaintImg2ImgStrength</span></div>
                <el-slider v-model="form.inpaintImg2ImgStrength" :min="0" :max="1" :step="0.01" />
              </div>
            </div>
            <div class="nai-row">
              <el-switch v-model="form.add_original_image" active-text="add_original_image" />
            </div>
            <div class="nai-row">
              <div class="nai-field">
                <div class="param"><span>img2img.strength</span></div>
                <el-slider :model-value="form.img2img?.strength ?? 1" :min="0" :max="1" :step="0.01" @update:model-value="(v) => form.img2img = { strength: v, color_correct: form.img2img?.color_correct ?? false }" />
              </div>
              <el-switch :model-value="form.img2img?.color_correct ?? false" active-text="img2img.color_correct" @update:model-value="(v) => form.img2img = { strength: form.img2img?.strength ?? 1, color_correct: v }" />
            </div>
            <MaskEditor v-if="form.action === 'infill'" :image="form.image || ''" v-model="form.mask" />
            <ImageField v-else v-model="form.mask" :label="t('common.mask')" :hint="t('generate.maskHint')" />
          </el-collapse-item>

          <el-collapse-item :title="t('generate.controlnet')" name="cn">
            <div class="nai-row">
              <div class="nai-field">
                <div class="param"><span>{{ t('common.model') }}</span></div>
                <el-select v-model="form.controlnet_model" clearable>
                  <el-option v-for="item in rpc.uiOptions.controlnets" :key="item.value" :label="item.label" :value="item.value" />
                </el-select>
              </div>
              <div class="nai-field">
                <div class="param"><span>{{ t('generate.controlStrength') }}</span></div>
                <el-slider v-model="form.controlnet_strength" :min="0" :max="1" :step="0.01" />
              </div>
            </div>
            <div class="nai-field">
              <div class="param"><span>{{ t('generate.controlCondition') }}</span></div>
              <el-input v-model="form.controlnet_condition" type="textarea" :rows="2" />
            </div>
          </el-collapse-item>

          <el-collapse-item :title="t('generate.chars')" name="chars">
            <el-button size="small" @click="addChar">{{ t('generate.addChar') }}</el-button>
            <div v-for="(ch, i) in form.characterPrompts" :key="i" class="nai-card">
              <div class="param"><span>{{ t('generate.character', { arg: i + 1 }) }}</span></div>
              <el-input v-model="ch.prompt" type="textarea" :rows="2" placeholder="prompt" />
              <el-input v-model="ch.uc" type="textarea" :rows="2" placeholder="uc" style="margin-top: 6px" />
              <div class="nai-row">
                <div class="nai-field">
                  <div class="param"><span>center.x</span></div>
                  <el-slider v-model="ch.center!.x" :min="0" :max="1" :step="0.01" />
                </div>
                <div class="nai-field">
                  <div class="param"><span>center.y</span></div>
                  <el-slider v-model="ch.center!.y" :min="0" :max="1" :step="0.01" />
                </div>
                <el-switch v-model="ch.enabled" active-text="enabled" />
              </div>
            </div>
          </el-collapse-item>

          <el-collapse-item :title="t('generate.vibe')" name="vibe">
            <el-switch v-model="form.normalize_reference_strength_multiple" active-text="normalize_reference_strength_multiple" />
            <el-button size="small" @click="addVibe">{{ t('generate.addVibe') }}</el-button>
            <div v-for="(_, i) in form.reference_image_multiple" :key="i" class="nai-card">
              <ImageField v-model="form.reference_image_multiple![i]" :label="t('generate.vibeImage', { arg: i + 1 })" />
              <div class="nai-row">
                <div class="nai-field">
                  <div class="param"><span>{{ t('generate.extracted') }}</span></div>
                  <el-slider v-model="form.reference_information_extracted_multiple![i]" :min="0" :max="1" :step="0.01" />
                </div>
                <div class="nai-field">
                  <div class="param"><span>strength</span></div>
                  <el-slider v-model="form.reference_strength_multiple![i]" :min="0" :max="1" :step="0.01" />
                </div>
              </div>
            </div>
          </el-collapse-item>

          <el-collapse-item :title="t('generate.charRef')" name="dref">
            <el-button size="small" @click="addDirectorRef">{{ t('generate.addDirectorRef') }}</el-button>
            <div v-for="(_, i) in form.director_reference_images" :key="i" class="nai-card">
              <ImageField v-model="form.director_reference_images![i]" :label="t('generate.directorRef', { arg: i + 1 })" :hint="t('generate.directorHint')" />
              <div class="nai-field">
                <div class="param"><span>base_caption</span></div>
                <el-select v-model="form.director_reference_descriptions![i].caption.base_caption">
                  <el-option label="character" value="character" />
                  <el-option label="character&style" value="character&style" />
                </el-select>
              </div>
              <div class="nai-row">
                <div class="nai-field">
                  <div class="param"><span>{{ t('generate.extracted') }}</span></div>
                  <el-slider v-model="form.director_reference_information_extracted![i]" :min="0" :max="1" :step="0.01" />
                </div>
                <div class="nai-field">
                  <div class="param"><span>strength</span></div>
                  <el-slider v-model="form.director_reference_strength_values![i]" :min="0" :max="1" :step="0.01" />
                </div>
                <div class="nai-field">
                  <div class="param"><span>{{ t('generate.fidelity') }}</span></div>
                  <el-slider v-model="form.director_reference_secondary_strength_values![i]" :min="0" :max="1" :step="0.01" />
                </div>
              </div>
            </div>
          </el-collapse-item>

          <el-collapse-item :title="t('generate.v4raw')" name="v4raw">
            <el-switch v-model="rawV4" :active-text="t('generate.v4manual')" />
            <p class="nai-desc">{{ t('generate.v4hint') }}</p>
            <el-input
              v-if="rawV4"
              type="textarea"
              :rows="8"
              :model-value="JSON.stringify({ v4_prompt: form.v4_prompt, v4_negative_prompt: form.v4_negative_prompt }, null, 2)"
              @change="(v) => {
                try {
                  const parsed = JSON.parse(v)
                  form.v4_prompt = parsed.v4_prompt
                  form.v4_negative_prompt = parsed.v4_negative_prompt
                } catch {}
              }"
            />
          </el-collapse-item>
        </el-collapse>
      </div>

      <div>
        <div class="nai-card">
          <div class="param"><span>{{ t('generate.callParams') }}</span></div>
          <el-switch v-model="form.streamCall" :active-text="t('generate.streamCall')" />
          <el-switch v-model="form.isOpus" active-text="isOpus" />
          <el-switch v-model="form.forceZip" active-text="forceZip" />
          <div class="nai-status">{{ formatProgress(rpc.progress.message, rpc.progress.kind) }} <span v-if="rpc.progress.step != null">step {{ rpc.progress.step }} σ={{ rpc.progress.sigma }}</span></div>
          <img v-if="rpc.progress.preview" class="nai-preview" :src="rpc.progress.preview" alt="preview">
          <div style="margin-top: 8px">
            <el-button size="small" @click="refreshCost">{{ t('generate.cost') }}</el-button>
            <span v-if="cost != null" class="nai-status">{{ t('generate.anlas', { arg: cost }) }}</span>
          </div>
          <el-button type="primary" style="margin-top: 10px; width: 100%" :loading="busy" @click="generate">{{ t('generate.generate') }}</el-button>
          <p v-if="error" class="nai-error">{{ error }}</p>
        </div>
        <div class="nai-card">
          <div class="param"><span>{{ t('generate.tags') }}</span></div>
          <el-input v-model="form.tagQuery" :placeholder="t('generate.tagPlaceholder')" />
          <div class="nai-row">
            <el-select v-model="form.tagModel">
              <el-option v-for="item in rpc.uiOptions.models" :key="item.value" :label="item.label" :value="item.value" />
            </el-select>
            <el-select v-model="form.tagLang">
              <el-option label="en" value="en" />
              <el-option label="jp" value="jp" />
            </el-select>
          </div>
          <el-button size="small" @click="suggest">{{ t('generate.query') }}</el-button>
          <div>
            <el-button v-for="item in suggestions" :key="item.tag" size="small" text @click="applyTag(item.tag)">
              {{ item.tag }}
            </el-button>
          </div>
        </div>
        <div class="nai-card">
          <Gallery @use="(img) => form.image = img.dataURL" />
        </div>
      </div>
    </div>
  </div>
</template>
