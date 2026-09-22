<script setup lang="ts">
import { t } from '../../nekoai-gui/client/i18n'
import { chatImageGen, saveChatImageGen } from './inline-gen'
import { localePref, saveLocalePref } from './locale'

function persist() {
  saveChatImageGen()
}
</script>

<template>
  <div class="nai-page nekoai-chat-image-settings">
    <div class="nai-card">
      <div class="param"><span>{{ t('st.locale') }}</span></div>
      <p class="nai-desc">{{ t('st.localeHelp') }}</p>
      <el-select :model-value="localePref.value" @change="saveLocalePref">
        <el-option :label="t('st.localeFollow')" value="follow" />
        <el-option label="中文" value="zh-CN" />
        <el-option label="English" value="en-US" />
      </el-select>
    </div>
    <div class="nai-card">
      <div class="param"><span>{{ t('st.chatImage.title') }}</span></div>
      <p class="nai-desc">{{ t('st.chatImage.desc') }}</p>
      <div class="nai-field">
        <div class="param"><span>{{ t('st.chatImage.enabled') }}</span></div>
        <el-switch v-model="chatImageGen.enabled" @change="persist" />
        <p class="nai-desc">{{ t('st.chatImage.enabledHelp') }}</p>
      </div>
      <div class="nai-row">
        <div class="nai-field">
          <div class="param"><span>{{ t('st.chatImage.tagPrefix') }}</span></div>
          <el-input v-model="chatImageGen.tagPrefix" :disabled="!chatImageGen.enabled" @change="persist" />
        </div>
        <div class="nai-field">
          <div class="param"><span>{{ t('st.chatImage.tagSuffix') }}</span></div>
          <el-input v-model="chatImageGen.tagSuffix" :disabled="!chatImageGen.enabled" @change="persist" />
        </div>
      </div>
      <div class="nai-field">
        <div class="param"><span>{{ t('st.chatImage.queue') }}</span></div>
        <el-switch v-model="chatImageGen.useRequestQueue" :disabled="!chatImageGen.enabled" @change="persist" />
        <p class="nai-desc">{{ t('st.chatImage.queueHelp') }}</p>
      </div>
      <div class="nai-row">
        <div class="nai-field">
          <div class="param"><span>{{ t('st.chatImage.queueWhen') }}</span></div>
          <el-select v-model="chatImageGen.queueDelayWhen" :disabled="!chatImageGen.enabled || !chatImageGen.useRequestQueue" @change="persist">
            <el-option :label="t('st.chatImage.afterResponse')" value="after_response" />
            <el-option :label="t('st.chatImage.afterSend')" value="after_send" />
          </el-select>
        </div>
        <div class="nai-field">
          <div class="param"><span>{{ t('st.chatImage.queueDelay') }}</span></div>
          <el-slider
            v-model="chatImageGen.queueDelay"
            :min="0"
            :max="12"
            :step="1"
            :disabled="!chatImageGen.enabled || !chatImageGen.useRequestQueue"
            show-stops
            @change="persist"
          />
          <p class="nai-status">{{ chatImageGen.queueDelay }}s</p>
        </div>
      </div>
    </div>
  </div>
</template>
