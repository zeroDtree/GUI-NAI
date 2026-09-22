<script setup lang="ts">
import { computed, reactive, ref } from 'vue'
import { useRpc } from '@cordisjs/client'
import { type ChatMessagePayload, type HostData, type TextOptionsPayload } from '../../src/shared'
import { formatError } from '../store'
import { t } from '../i18n'

const rpc = useRpc<HostData>()
const error = ref('')
const mode = ref<'chat' | 'stream' | 'completion'>('chat')
const input = ref('')
const system = ref('')
const output = ref('')
const models = ref<string[]>([])
const options = reactive<TextOptionsPayload>({
  model: rpc.value.uiOptions.textModels[0]?.value,
  max_tokens: 200,
  temperature: 1,
  top_p: 1,
  top_k: 0,
  min_p: 0,
  frequency_penalty: 0,
  presence_penalty: 0,
  stop: '',
  seed: undefined,
  n: 1,
})
const logitBiasText = ref('{}')

const messages = reactive<ChatMessagePayload[]>([])
const busy = computed(() => rpc.value.progress.kind === 'busy' || rpc.value.progress.kind === 'chat')

function buildOptions(): TextOptionsPayload {
  let logit_bias: Record<string, number> | undefined
  try {
    logit_bias = JSON.parse(logitBiasText.value)
  } catch {
    logit_bias = undefined
  }
  const stop = typeof options.stop === 'string' && options.stop
    ? options.stop.split(',').map((s) => s.trim()).filter(Boolean)
    : options.stop
  return { ...options, stop: stop || undefined, logit_bias }
}

function buildMessages(): ChatMessagePayload[] {
  const list = [...messages]
  if (system.value) list.unshift({ role: 'system', content: system.value })
  if (input.value) list.push({ role: 'user', content: input.value })
  return list
}

async function run() {
  error.value = ''
  try {
    if (mode.value === 'completion') {
      const result: any = await rpc.value.completion(input.value, buildOptions())
      output.value = result?.choices?.[0]?.text ?? JSON.stringify(result, null, 2)
      return
    }
    const payload = buildMessages()
    if (mode.value === 'stream') {
      output.value = ''
      const result: any = await rpc.value.chatStream(payload, buildOptions())
      output.value = result?.content ?? rpc.value.progress.chatDelta ?? ''
    } else {
      const result: any = await rpc.value.chat(payload, buildOptions())
      output.value = result?.choices?.[0]?.message?.content ?? JSON.stringify(result, null, 2)
    }
    messages.push({ role: 'user', content: input.value })
    messages.push({ role: 'assistant', content: output.value })
    input.value = ''
  } catch (err) {
    error.value = formatError(err)
  }
}

async function loadModels() {
  try {
    models.value = await rpc.value.listTextModels()
  } catch (err) {
    error.value = formatError(err)
  }
}
</script>

<template>
  <div class="nai-page">
    <h2>{{ t('text.title') }}</h2>
    <p class="nai-desc">{{ t('text.desc') }}</p>
    <div class="nai-grid">
      <div>
        <div class="nai-card">
          <el-radio-group v-model="mode">
            <el-radio-button value="chat">chat</el-radio-button>
            <el-radio-button value="stream">chatStream</el-radio-button>
            <el-radio-button value="completion">completion</el-radio-button>
          </el-radio-group>
          <div v-if="mode !== 'completion'" class="nai-field" style="margin-top: 10px">
            <div class="param"><span>system</span></div>
            <el-input v-model="system" type="textarea" :rows="2" />
          </div>
          <div class="nai-field" style="margin-top: 10px">
            <div class="param"><span>{{ mode === 'completion' ? 'prompt' : 'user' }}</span></div>
            <el-input v-model="input" type="textarea" :rows="4" />
          </div>
          <el-button type="primary" :loading="busy" style="margin-top: 8px" @click="run">{{ t('common.send') }}</el-button>
          <p v-if="error" class="nai-error">{{ error }}</p>
        </div>
        <div class="nai-card">
          <div class="param"><span>{{ t('common.output') }}</span></div>
          <pre class="nai-chat">{{ rpc.progress.kind === 'chat' ? (rpc.progress.chatDelta || output) : output }}</pre>
        </div>
      </div>
      <div>
        <div class="nai-card">
          <div class="param"><span>TextGenerationOptions</span></div>
          <div class="nai-field">
            <div class="param"><span>model</span></div>
            <el-select v-model="options.model" filterable allow-create>
              <el-option v-for="item in rpc.uiOptions.textModels" :key="item.value" :label="item.label" :value="item.value" />
              <el-option v-for="id in models" :key="id" :label="id" :value="id" />
            </el-select>
            <el-button size="small" @click="loadModels">{{ t('text.listModels') }}</el-button>
          </div>
          <div class="nai-row">
            <div class="nai-field"><div class="param"><span>max_tokens</span></div><el-input-number v-model="options.max_tokens" :min="1" /></div>
            <div class="nai-field"><div class="param"><span>temperature</span></div><el-input-number v-model="options.temperature" :min="0" :step="0.1" /></div>
            <div class="nai-field"><div class="param"><span>top_p</span></div><el-input-number v-model="options.top_p" :min="0" :max="1" :step="0.05" /></div>
            <div class="nai-field"><div class="param"><span>top_k</span></div><el-input-number v-model="options.top_k" :min="0" /></div>
            <div class="nai-field"><div class="param"><span>min_p</span></div><el-input-number v-model="options.min_p" :min="0" :step="0.01" /></div>
            <div class="nai-field"><div class="param"><span>frequency_penalty</span></div><el-input-number v-model="options.frequency_penalty" :step="0.1" /></div>
            <div class="nai-field"><div class="param"><span>presence_penalty</span></div><el-input-number v-model="options.presence_penalty" :step="0.1" /></div>
            <div class="nai-field"><div class="param"><span>seed</span></div><el-input-number v-model="options.seed" :min="0" /></div>
            <div class="nai-field"><div class="param"><span>n</span></div><el-input-number v-model="options.n" :min="1" /></div>
          </div>
          <div class="nai-field">
            <div class="param"><span>stop</span></div>
            <el-input v-model="options.stop as string" :placeholder="t('text.stopPlaceholder')" />
          </div>
          <div class="nai-field">
            <div class="param"><span>logit_bias</span></div>
            <el-input v-model="logitBiasText" type="textarea" :rows="3" />
          </div>
        </div>
      </div>
    </div>
  </div>
</template>
