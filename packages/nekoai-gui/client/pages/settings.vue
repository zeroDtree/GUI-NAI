<script setup lang="ts">
import { reactive, ref } from 'vue'
import { useRpc } from '@cordisjs/client'
import { type HostData } from '../../src/shared'
import { formatError } from '../store'
import { formatProgress, t } from '../i18n'

const rpc = useRpc<HostData>()
const error = ref('')
const models = ref<string[]>([])
const probing = ref(false)
const probed = ref(false)
const token = ref('')
const form = reactive({
  host: rpc.value.config.host,
  textHost: rpc.value.config.textHost,
  timeout: rpc.value.config.timeout,
  verbose: rpc.value.config.verbose,
  retry: {
    enabled: rpc.value.config.retry.enabled,
    maxRetries: rpc.value.config.retry.maxRetries,
    baseDelay: rpc.value.config.retry.baseDelay,
    maxDelay: rpc.value.config.retry.maxDelay,
    retryStatusCodes: rpc.value.config.retry.retryStatusCodes.join(', '),
  },
})

async function save() {
  error.value = ''
  try {
    const codes = form.retry.retryStatusCodes
      .split(/[,\s]+/)
      .filter(Boolean)
      .map(Number)
      .filter((n) => !Number.isNaN(n))
    await rpc.value.setClientConfig({
      token: token.value || undefined,
      host: form.host,
      textHost: form.textHost,
      timeout: form.timeout,
      verbose: form.verbose,
      retry: {
        enabled: form.retry.enabled,
        maxRetries: form.retry.maxRetries,
        baseDelay: form.retry.baseDelay,
        maxDelay: form.retry.maxDelay,
        retryStatusCodes: codes,
      },
    })
    token.value = ''
  } catch (err) {
    error.value = formatError(err)
  }
}

function asModelIds(result: unknown): string[] {
  if (Array.isArray(result)) {
    return result.flatMap((item) => {
      if (typeof item === 'string' && item) return [item]
      if (item && typeof item === 'object' && 'id' in item && typeof (item as { id: unknown }).id === 'string') {
        return [(item as { id: string }).id]
      }
      return []
    })
  }
  if (result && typeof result === 'object') {
    const payload = result as { data?: unknown; models?: unknown }
    if (Array.isArray(payload.data)) return asModelIds(payload.data)
    if (Array.isArray(payload.models)) return asModelIds(payload.models)
  }
  return []
}

async function probe() {
  error.value = ''
  probing.value = true
  try {
    models.value = asModelIds(await rpc.value.listTextModels())
    probed.value = true
  } catch (err) {
    error.value = formatError(err)
    models.value = []
    probed.value = true
  } finally {
    probing.value = false
  }
}
</script>

<template>
  <div class="nai-page">
    <h2>{{ t('settings.title') }}</h2>
    <p class="nai-desc">{{ t('settings.desc') }}</p>
    <div class="nai-card">
      <div class="nai-field">
        <div class="param"><span>{{ t('settings.token') }}</span></div>
        <el-input v-model="token" type="password" show-password :placeholder="rpc.config.hasToken ? t('settings.tokenKept') : t('settings.tokenPlaceholder')" />
      </div>
      <div class="nai-row" style="margin-top: 12px">
        <div class="nai-field">
          <div class="param"><span>{{ t('settings.imageHost') }}</span></div>
          <el-select v-model="form.host" filterable allow-create>
            <el-option v-for="item in rpc.uiOptions.hosts" :key="item.value" :label="item.label" :value="item.value" />
          </el-select>
        </div>
        <div class="nai-field">
          <div class="param"><span>{{ t('settings.textHost') }}</span></div>
          <el-select v-model="form.textHost" filterable allow-create>
            <el-option v-for="item in rpc.uiOptions.hosts" :key="item.value" :label="item.label" :value="item.value" />
          </el-select>
        </div>
        <div class="nai-field">
          <div class="param"><span>{{ t('settings.timeout') }}</span></div>
          <el-input-number v-model="form.timeout" :min="1000" :step="1000" />
        </div>
        <div class="nai-field">
          <div class="param"><span>{{ t('settings.verbose') }}</span></div>
          <el-switch v-model="form.verbose" />
        </div>
      </div>
    </div>
    <div class="nai-card">
      <div class="param"><span>{{ t('settings.retry') }}</span></div>
      <div class="nai-row">
        <div class="nai-field">
          <div class="param"><span>{{ t('settings.enabled') }}</span></div>
          <el-switch v-model="form.retry.enabled" />
        </div>
        <div class="nai-field">
          <div class="param"><span>{{ t('settings.maxRetries') }}</span></div>
          <el-input-number v-model="form.retry.maxRetries" :min="0" />
        </div>
        <div class="nai-field">
          <div class="param"><span>{{ t('settings.baseDelay') }}</span></div>
          <el-input-number v-model="form.retry.baseDelay" :min="0" :step="100" />
        </div>
        <div class="nai-field">
          <div class="param"><span>{{ t('settings.maxDelay') }}</span></div>
          <el-input-number v-model="form.retry.maxDelay" :min="0" :step="1000" />
        </div>
      </div>
      <div class="nai-field">
        <div class="param"><span>{{ t('settings.retryCodes') }}</span></div>
        <el-input v-model="form.retry.retryStatusCodes" placeholder="429, 500, 502, 503, 504" />
      </div>
    </div>
    <el-button type="primary" @click="save">{{ t('settings.save') }}</el-button>
    <el-button :loading="probing" @click="probe">{{ t('settings.probe') }}</el-button>
    <p class="nai-status">{{ t('settings.hasToken', { arg: rpc.config.hasToken ? t('settings.yes') : t('settings.no') }) }} · {{ formatProgress(rpc.progress.message, rpc.progress.kind) }}</p>
    <p v-if="error" class="nai-error">{{ error }}</p>
    <p v-else-if="probed && !models.length" class="nai-status">{{ t('settings.probeEmpty') }}</p>
    <pre v-if="models.length" class="nai-chat">{{ models.join('\n') }}</pre>
  </div>
</template>
