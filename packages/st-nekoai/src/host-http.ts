import { inject, reactive, ref, type InjectionKey, type Ref } from 'vue'
import type {
  ChatMessagePayload,
  ClientConfigPayload,
  DirectorToolPayload,
  EnhancePayload,
  GenerateCallOptions,
  GeneratePresetForm,
  HostData,
  MetadataPayload,
  ProgressState,
  PublicClientConfig,
  SerializedImage,
  TextOptionsPayload,
  UiOptions,
} from '../../nekoai-gui/src/shared'

export const PLUGIN_BASE = '/api/plugins/nekoai-gui'

export const kHost: InjectionKey<Ref<HostData>> = Symbol('nekoai-host')

export const pluginError = ref('')

function emptyUiOptions(): UiOptions {
  return {
    models: [],
    resolutions: [],
    samplers: [],
    noises: [],
    actions: [],
    controlnets: [],
    emotions: [],
    emotionLevels: [],
    hosts: [],
    directorTools: [],
    textModels: [],
  }
}

function defaultConfig(): PublicClientConfig {
  return {
    hasToken: false,
    host: '',
    textHost: '',
    timeout: 120000,
    verbose: false,
    retry: {
      enabled: true,
      maxRetries: 3,
      baseDelay: 1000,
      maxDelay: 30000,
      retryStatusCodes: [429, 500, 502, 503, 504],
    },
  }
}

function stHeaders(): HeadersInit {
  const headers = { 'Content-Type': 'application/json' } as Record<string, string>
  try {
    const extra = window.SillyTavern?.getContext?.()?.getRequestHeaders?.()
    if (extra && typeof extra === 'object') Object.assign(headers, extra)
  } catch {
    // Running outside SillyTavern.
  }
  return headers
}

export function useHost(): Ref<HostData> {
  const host = inject(kHost)
  if (!host) throw new Error('NekoAI host is not provided')
  return host
}

export async function createHttpHost(base = PLUGIN_BASE): Promise<Ref<HostData>> {
  const state = reactive({
    config: defaultConfig(),
    progress: { kind: 'idle' } as ProgressState,
    uiOptions: emptyUiOptions(),
  })

  function applyState(payload: { config?: PublicClientConfig; progress?: ProgressState; uiOptions?: UiOptions }) {
    if (payload.config) Object.assign(state.config, payload.config)
    if (payload.progress) {
      state.progress = { ...state.progress, ...payload.progress }
    }
    if (payload.uiOptions) Object.assign(state.uiOptions, payload.uiOptions)
  }

  async function rpc(method: string, args: unknown[] = []) {
    const response = await fetch(`${base}/rpc`, {
      method: 'POST',
      headers: stHeaders(),
      body: JSON.stringify({ method, args }),
    })
    let json: { result?: unknown; error?: string; config?: PublicClientConfig; progress?: ProgressState } = {}
    try {
      json = await response.json()
    } catch {
      json = { error: await response.text() }
    }
    if (!response.ok || json.error) throw new Error(json.error || response.statusText)
    if (json.config) Object.assign(state.config, json.config)
    if (json.progress) state.progress = { ...state.progress, ...json.progress }
    return json.result
  }

  async function refresh() {
    const response = await fetch(`${base}/state`, { headers: stHeaders() })
    if (!response.ok) throw new Error(`HTTP ${response.status}`)
    applyState(await response.json())
  }

  function listenEvents() {
    try {
      const source = new EventSource(`${base}/events`)
      source.onmessage = (event) => {
        try {
          const payload = JSON.parse(event.data)
          if (payload.type === 'state') applyState(payload)
          else if (payload.type === 'progress') applyState({ progress: payload.progress })
          else if (payload.type === 'config') applyState({ config: payload.config })
        } catch {
          // Ignore malformed frames.
        }
      }
      source.onerror = () => {
        // Browser will retry; also poll while busy.
      }
    } catch {
      // EventSource unavailable.
    }
  }

  const data = reactive({
    get config() {
      return state.config
    },
    get progress() {
      return state.progress
    },
    get uiOptions() {
      return state.uiOptions
    },
    setClientConfig: (payload: ClientConfigPayload) => rpc('setClientConfig', [payload]) as Promise<PublicClientConfig>,
    generateImage: (metadata: MetadataPayload, options?: GenerateCallOptions) => rpc('generateImage', [metadata, options]) as Promise<SerializedImage[]>,
    enhance: (image: string, options?: EnhancePayload) => rpc('enhance', [image, options]) as Promise<SerializedImage[]>,
    upscale: (image: string, scale?: 2 | 4) => rpc('upscale', [image, scale]) as Promise<SerializedImage>,
    colorize: (image: string, prompt?: string, defry?: number) => rpc('colorize', [image, prompt, defry]) as Promise<SerializedImage>,
    changeEmotion: (image: string, emotion?: string, prompt?: string, emotionLevel?: number) => rpc('changeEmotion', [image, emotion, prompt, emotionLevel]) as Promise<SerializedImage>,
    useDirectorTool: (request: DirectorToolPayload) => rpc('useDirectorTool', [request]) as Promise<SerializedImage>,
    suggestTags: (prompt: string, model?: string, lang?: 'en' | 'jp') => rpc('suggestTags', [prompt, model, lang]),
    chat: (messages: string | ChatMessagePayload[], options?: TextOptionsPayload) => rpc('chat', [messages, options]),
    chatStream: (messages: string | ChatMessagePayload[], options?: TextOptionsPayload) => rpc('chatStream', [messages, options]),
    completion: (prompt: string, options?: TextOptionsPayload) => rpc('completion', [prompt, options]),
    listTextModels: () => rpc('listTextModels') as Promise<string[]>,
    extractImageMetadata: (image: string) => rpc('extractImageMetadata', [image]),
    getImageSummary: (image: string) => rpc('getImageSummary', [image]),
    parseImage: (image: string) => rpc('parseImage', [image]),
    calculateCost: (metadata: MetadataPayload, isOpus?: boolean) => rpc('calculateCost', [metadata, isOpus]) as Promise<number>,
    deduplicateTags: (prompt: string) => rpc('deduplicateTags', [prompt]) as Promise<string>,
    scaleDimensions: (width: number, height: number, factor: number, maxPixels?: number) => rpc('scaleDimensions', [width, height, factor, maxPixels]) as Promise<[number, number]>,
    listPresets: () => rpc('listPresets'),
    savePreset: (name: string, form: GeneratePresetForm) => rpc('savePreset', [name, form]),
    loadPreset: (name: string) => rpc('loadPreset', [name]),
    deletePreset: (name: string) => rpc('deletePreset', [name]),
    renamePreset: (oldName: string, newName: string) => rpc('renamePreset', [oldName, newName]),
    duplicatePreset: (name: string, newName: string) => rpc('duplicatePreset', [name, newName]),
    setCurrentPreset: (name: string) => rpc('setCurrentPreset', [name]),
    listHistory: () => rpc('listHistory'),
    deleteHistory: (id: string) => rpc('deleteHistory', [id]) as Promise<void>,
    clearHistory: () => rpc('clearHistory') as Promise<void>,
  }) as HostData

  try {
    await refresh()
    pluginError.value = ''
    listenEvents()
  } catch (error) {
    pluginError.value = error instanceof Error ? error.message : String(error)
  }

  return ref(data)
}
