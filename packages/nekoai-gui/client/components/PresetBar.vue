<script setup lang="ts">
import { onMounted, ref } from 'vue'
import { useRpc } from '@cordisjs/client'
import type { GeneratePresetForm, HostData, PresetIndex } from '../../src/shared'
import { formatError } from '../store'
import { t } from '../i18n'

const props = defineProps<{
  snapshot: (includeImages: boolean) => GeneratePresetForm
}>()

const emit = defineEmits<{
  apply: [form: GeneratePresetForm]
}>()

const rpc = useRpc<HostData>()
const includeImages = ref(false)
const current = ref('default')
const names = ref<string[]>(['default'])
const notice = ref('')
const error = ref('')
const importInput = ref<HTMLInputElement | null>(null)

function setIndex(index: PresetIndex) {
  current.value = index.current
  names.value = index.names
}

function flash(message: string) {
  notice.value = message
  error.value = ''
}

async function refresh() {
  setIndex(await rpc.value.listPresets())
}

async function applyCurrent() {
  const record = await rpc.value.loadPreset(current.value)
  if (record.updatedAt) emit('apply', record.form)
}

onMounted(async () => {
  try {
    await refresh()
    await applyCurrent()
  } catch (err) {
    error.value = formatError(err)
  }
})

async function onSelect(name: string) {
  error.value = ''
  try {
    setIndex(await rpc.value.setCurrentPreset(name))
    const record = await rpc.value.loadPreset(name)
    if (record.updatedAt) emit('apply', record.form)
  } catch (err) {
    error.value = formatError(err)
  }
}

async function save() {
  error.value = ''
  try {
    setIndex(await rpc.value.savePreset(current.value || 'default', props.snapshot(includeImages.value)))
    flash(t('preset.saved'))
  } catch (err) {
    error.value = formatError(err)
  }
}

function askName(title: string, initial = '') {
  const value = window.prompt(title, initial)
  return value?.trim() || ''
}

async function saveAs() {
  const name = askName(t('preset.namePrompt'))
  if (!name) return
  error.value = ''
  try {
    setIndex(await rpc.value.savePreset(name, props.snapshot(includeImages.value)))
    flash(t('preset.saved'))
  } catch (err) {
    error.value = formatError(err)
  }
}

async function rename() {
  if (current.value === 'default') {
    error.value = t('preset.cannotRenameDefault')
    return
  }
  const name = askName(t('preset.namePrompt'), current.value)
  if (!name || name === current.value) return
  error.value = ''
  try {
    setIndex(await rpc.value.renamePreset(current.value, name))
    flash(t('preset.saved'))
  } catch (err) {
    error.value = formatError(err)
  }
}

async function duplicate() {
  const name = askName(t('preset.namePrompt'), `${current.value}-copy`)
  if (!name) return
  error.value = ''
  try {
    setIndex(await rpc.value.duplicatePreset(current.value, name))
    const record = await rpc.value.loadPreset(name)
    if (record.updatedAt) emit('apply', record.form)
    flash(t('preset.saved'))
  } catch (err) {
    error.value = formatError(err)
  }
}

async function remove() {
  if (current.value === 'default') {
    error.value = t('preset.cannotDeleteDefault')
    return
  }
  if (!window.confirm(t('preset.deleteConfirm', { arg: current.value }))) return
  error.value = ''
  try {
    setIndex(await rpc.value.deletePreset(current.value))
    const record = await rpc.value.loadPreset(current.value)
    if (record.updatedAt) emit('apply', record.form)
    flash(t('preset.deleted'))
  } catch (err) {
    error.value = formatError(err)
  }
}

async function exportPreset() {
  error.value = ''
  try {
    const record = await rpc.value.loadPreset(current.value)
    const blob = new Blob([JSON.stringify(record, null, 2)], { type: 'application/json' })
    const url = URL.createObjectURL(blob)
    const link = document.createElement('a')
    link.href = url
    link.download = `nekoai-preset-${current.value}.json`
    link.click()
    URL.revokeObjectURL(url)
  } catch (err) {
    error.value = formatError(err)
  }
}

async function importPreset(event: Event) {
  const input = event.target as HTMLInputElement
  const file = input.files?.[0]
  input.value = ''
  if (!file) return
  error.value = ''
  try {
    const parsed = JSON.parse(await file.text())
    const form: GeneratePresetForm = parsed.form && typeof parsed.form === 'object' ? parsed.form : parsed
    const name = askName(t('preset.namePrompt'), typeof parsed.name === 'string' ? parsed.name : file.name.replace(/\.json$/i, ''))
    if (!name) return
    setIndex(await rpc.value.savePreset(name, form))
    const record = await rpc.value.loadPreset(name)
    if (record.updatedAt) emit('apply', record.form)
    flash(t('preset.imported'))
  } catch (err) {
    error.value = formatError(err)
  }
}
</script>

<template>
  <div class="nai-card nai-preset">
    <div class="param"><span>{{ t('preset.title') }}</span></div>
    <el-select class="nai-preset-select" :model-value="current" filterable @change="onSelect">
      <el-option v-for="name in names" :key="name" :label="name" :value="name" />
    </el-select>
    <div class="nai-preset-actions">
      <el-button size="small" @click="save">{{ t('preset.save') }}</el-button>
      <el-button size="small" @click="saveAs">{{ t('preset.saveAs') }}</el-button>
      <el-button size="small" @click="rename">{{ t('preset.rename') }}</el-button>
      <el-button size="small" @click="duplicate">{{ t('preset.duplicate') }}</el-button>
      <el-button size="small" @click="remove">{{ t('preset.delete') }}</el-button>
      <el-button size="small" @click="exportPreset">{{ t('preset.export') }}</el-button>
      <el-button size="small" @click="importInput?.click()">{{ t('preset.import') }}</el-button>
    </div>
    <input ref="importInput" type="file" accept="application/json,.json" hidden @change="importPreset">
    <el-switch v-model="includeImages" :active-text="t('preset.includeImages')" />
    <p v-if="notice" class="nai-status">{{ notice }}</p>
    <p v-if="error" class="nai-error">{{ error }}</p>
  </div>
</template>
