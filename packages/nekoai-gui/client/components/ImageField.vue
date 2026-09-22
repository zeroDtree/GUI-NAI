<script setup lang="ts">
import { computed } from 'vue'
import { fileToDataURL } from '../store'
import { t } from '../i18n'

const props = defineProps<{
  label: string
  modelValue?: string
  hint?: string
}>()

const emit = defineEmits<{
  'update:modelValue': [value: string]
}>()

async function onFile(event: Event) {
  const input = event.target as HTMLInputElement
  const file = input.files?.[0]
  if (!file) return
  emit('update:modelValue', await fileToDataURL(file))
  input.value = ''
}

const preview = computed(() => props.modelValue || '')
</script>

<template>
  <div class="nai-field">
    <div class="param">
      <span>{{ label }}</span>
    </div>
    <p v-if="hint" class="nai-desc" style="margin: 0 0 6px">{{ hint }}</p>
    <input type="file" accept="image/*" @change="onFile">
    <el-button v-if="modelValue" size="small" text type="danger" @click="emit('update:modelValue', '')">{{ t('common.clear') }}</el-button>
    <img v-if="preview" class="nai-preview" :src="preview" alt="">
  </div>
</template>
