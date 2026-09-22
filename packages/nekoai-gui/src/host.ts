import {
  NovelAI,
  NovelAIApiError,
  Image,
  EventType,
  Host,
  calculateCost,
  deduplicateTags,
  extractImageMetadata,
  getImageSummary,
  parseImage,
  scaleDimensions,
  type Metadata,
  type EnhanceOptions,
  type DirectorRequest,
  type ChatMessage,
  type TextGenerationOptions,
} from 'nekoai-js'
import type {
  ClientConfigPayload,
  DirectorToolPayload,
  EnhancePayload,
  GenerateCallOptions,
  GeneratePresetForm,
  HistorySource,
  HostData,
  MetadataPayload,
  ProgressState,
  PublicClientConfig,
  RetryConfigPayload,
  SerializedImage,
  TextOptionsPayload,
} from './shared.js'
import { buildUiOptions } from './ui-options.js'
import { createPersist, DEFAULT_HISTORY_URL_PREFIX } from './persist.js'

export interface HostConfig {
  token: string
  host: string
  textHost: string
  timeout: number
  verbose: boolean
  retry: Required<RetryConfigPayload>
  dataDir: string
}

export const DEFAULT_RETRY: Required<RetryConfigPayload> = {
  enabled: true,
  maxRetries: 3,
  baseDelay: 1000,
  maxDelay: 30000,
  retryStatusCodes: [429, 500, 502, 503, 504],
}

export type HostEvent =
  | { type: 'progress'; progress: ProgressState }
  | { type: 'config'; config: PublicClientConfig }

export interface CreateHostOptions extends Partial<HostConfig> {
  dataDir: string
  historyUrlPrefix?: string
  mutate?: (fn: (data: HostData) => void) => void
  onConfigChange?: (config: HostConfig) => void | Promise<void>
}

export const HOST_RPC_METHODS = [
  'setClientConfig',
  'generateImage',
  'enhance',
  'upscale',
  'colorize',
  'changeEmotion',
  'useDirectorTool',
  'suggestTags',
  'chat',
  'chatStream',
  'completion',
  'listTextModels',
  'extractImageMetadata',
  'getImageSummary',
  'parseImage',
  'calculateCost',
  'deduplicateTags',
  'scaleDimensions',
  'listPresets',
  'savePreset',
  'loadPreset',
  'deletePreset',
  'renamePreset',
  'duplicatePreset',
  'setCurrentPreset',
  'listHistory',
  'deleteHistory',
  'clearHistory',
] as const

export type HostRpcMethod = typeof HOST_RPC_METHODS[number]

function serializeImage(image: Image): SerializedImage {
  return {
    filename: image.filename,
    size: image.size,
    dataURL: image.toDataURL(),
  }
}

function wrapError(error: unknown): never {
  if (error instanceof NovelAIApiError) {
    throw new Error(`[${error.status}] ${error.message}`)
  }
  if (error instanceof Error) throw error
  throw new Error(String(error))
}

function asMetadata(payload: MetadataPayload): Metadata {
  return payload as Metadata
}

function mergeRetry(base: Required<RetryConfigPayload>, patch?: RetryConfigPayload): Required<RetryConfigPayload> {
  return {
    enabled: patch?.enabled ?? base.enabled,
    maxRetries: patch?.maxRetries ?? base.maxRetries,
    baseDelay: patch?.baseDelay ?? base.baseDelay,
    maxDelay: patch?.maxDelay ?? base.maxDelay,
    retryStatusCodes: patch?.retryStatusCodes ?? [...base.retryStatusCodes],
  }
}

export function createHost(options: CreateHostOptions) {
  const persist = createPersist(options.dataDir, options.historyUrlPrefix || DEFAULT_HISTORY_URL_PREFIX)
  persist.ensure().catch((error) => {
    console.warn('[nekoai-gui] failed to initialize data directory', error)
  })

  const current: HostConfig = {
    token: process.env.NOVELAI_TOKEN || options.token || '',
    host: options.host || Host.WEB,
    textHost: options.textHost || Host.TEXT,
    timeout: options.timeout ?? 120000,
    verbose: options.verbose ?? false,
    retry: mergeRetry(DEFAULT_RETRY, options.retry),
    dataDir: options.dataDir,
  }

  let client: NovelAI | null = null
  const listeners = new Set<(event: HostEvent) => void>()

  const createClient = () => {
    if (!current.token) {
      client = null
      return
    }
    client = new NovelAI({
      token: current.token,
      host: current.host,
      textHost: current.textHost,
      timeout: current.timeout,
      verbose: current.verbose,
      retry: current.retry,
    })
  }

  createClient()

  const requireClient = () => {
    if (!client) throw new Error('error.noToken')
    return client
  }

  const publicConfig = (): PublicClientConfig => ({
    hasToken: Boolean(current.token),
    host: current.host,
    textHost: current.textHost,
    timeout: current.timeout,
    verbose: current.verbose,
    retry: { ...current.retry, retryStatusCodes: [...current.retry.retryStatusCodes] },
  })

  const data: HostData = {
    config: publicConfig(),
    progress: { kind: 'idle' },
    uiOptions: buildUiOptions(),
    async setClientConfig(payload: ClientConfigPayload) {
      if (payload.token !== undefined && payload.token !== '') current.token = payload.token
      if (payload.host !== undefined) current.host = payload.host
      if (payload.textHost !== undefined) current.textHost = payload.textHost
      if (payload.timeout !== undefined) current.timeout = payload.timeout
      if (payload.verbose !== undefined) current.verbose = payload.verbose
      if (payload.retry) current.retry = mergeRetry(current.retry, payload.retry)
      createClient()
      const next = publicConfig()
      mutate((d) => {
        Object.assign(d.config, next)
      })
      emit({ type: 'config', config: next })
      await options.onConfigChange?.(current)
      return next
    },
    async generateImage(metadata: MetadataPayload, call: GenerateCallOptions = {}) {
      const nai = requireClient()
      const { stream = false, isOpus = false, forceZip = false } = call
      try {
        setProgress({ kind: stream ? 'image' : 'busy', message: 'progress.generating', chatDelta: '', preview: '' })
        if (stream) {
          const generator = await nai.generateImage(asMetadata(metadata), true, isOpus)
          const finals: SerializedImage[] = []
          const genMeta = {
            prompt: metadata.prompt,
            negative: metadata.negative_prompt,
            model: metadata.model,
            source: 'generate' as const,
          }
          for await (const event of generator) {
            if (event.event_type === EventType.FINAL) {
              const image = await persistGenerated(event.image, genMeta)
              finals.push(image)
              setProgress({
                kind: 'image',
                message: 'progress.done',
                step: event.step_ix,
                sigma: event.sigma,
                preview: image.dataURL,
              })
            } else {
              const image = serializeImage(event.image)
              setProgress({
                kind: 'image',
                message: `progress.step:${event.step_ix}`,
                step: event.step_ix,
                sigma: event.sigma,
                preview: image.dataURL,
              })
            }
          }
          setProgress({ kind: 'idle', message: 'progress.done' })
          return finals
        }
        const images = await nai.generateImage(asMetadata(metadata), false, isOpus, forceZip)
        const stored = await Promise.all(images.map((image) => persistGenerated(image, {
          prompt: metadata.prompt,
          negative: metadata.negative_prompt,
          model: metadata.model,
          source: 'generate',
        })))
        setProgress({ kind: 'idle', message: 'progress.done' })
        return stored
      } catch (error) {
        setProgress({ kind: 'idle', message: 'progress.failed' })
        wrapError(error)
      }
    },
    async enhance(image: string, enhanceOptions: EnhancePayload = {}) {
      const nai = requireClient()
      try {
        setProgress({ kind: 'busy', message: 'progress.enhancing' })
        const images = await nai.enhance(image, enhanceOptions as EnhanceOptions)
        const stored = await Promise.all(images.map((item) => persistGenerated(item, {
          prompt: enhanceOptions.prompt,
          model: enhanceOptions.model,
          source: 'enhance',
        })))
        setProgress({ kind: 'idle', message: 'progress.done' })
        return stored
      } catch (error) {
        setProgress({ kind: 'idle', message: 'progress.failed' })
        wrapError(error)
      }
    },
    async upscale(image: string, scale: 2 | 4 = 4) {
      const nai = requireClient()
      try {
        setProgress({ kind: 'busy', message: `progress.upscaling:${scale}` })
        const result = await persistGenerated(await nai.upscale(image, scale), { source: 'upscale' })
        setProgress({ kind: 'idle', message: 'progress.done' })
        return result
      } catch (error) {
        setProgress({ kind: 'idle', message: 'progress.failed' })
        wrapError(error)
      }
    },
    async colorize(image: string, prompt = '', defry = 0) {
      return runDirector(() => requireClient().colorize(image, prompt, defry), 'Colorize', prompt)
    },
    async changeEmotion(image: string, emotion = 'neutral', prompt = '', emotionLevel = 0) {
      return runDirector(() => requireClient().changeEmotion(image, emotion, prompt, emotionLevel), 'Emotion', prompt)
    },
    async useDirectorTool(request: DirectorToolPayload) {
      const nai = requireClient()
      try {
        setProgress({ kind: 'busy', message: `progress.director:${request.req_type}` })
        const parsed = await parseImage(request.image)
        const body = {
          req_type: request.req_type,
          image: parsed.base64,
          width: parsed.width,
          height: parsed.height,
          prompt: request.prompt ?? '',
          defry: request.defry ?? 0,
        } as DirectorRequest
        const result = await persistGenerated(await nai.useDirectorTool(body), {
          prompt: request.prompt,
          source: 'director',
        })
        setProgress({ kind: 'idle', message: 'progress.done' })
        return result
      } catch (error) {
        setProgress({ kind: 'idle', message: 'progress.failed' })
        wrapError(error)
      }
    },
    async suggestTags(prompt: string, model?: string, lang?: 'en' | 'jp') {
      try {
        return await requireClient().suggestTags(prompt, model as any, lang)
      } catch (error) {
        wrapError(error)
      }
    },
    async chat(messages: string | ChatMessage[], chatOptions?: TextOptionsPayload) {
      try {
        setProgress({ kind: 'busy', message: 'progress.text' })
        const result = await requireClient().chat(messages, chatOptions as TextGenerationOptions)
        setProgress({ kind: 'idle', message: 'progress.done' })
        return result
      } catch (error) {
        setProgress({ kind: 'idle', message: 'progress.failed' })
        wrapError(error)
      }
    },
    async chatStream(messages: string | ChatMessage[], chatOptions?: TextOptionsPayload) {
      const nai = requireClient()
      try {
        setProgress({ kind: 'chat', message: 'progress.streaming', chatDelta: '' })
        const stream = await nai.chatStream(messages, chatOptions as TextGenerationOptions)
        let text = ''
        for await (const chunk of stream) {
          const delta = chunk.choices[0]?.delta?.content
          if (delta) {
            text += delta
            setProgress({ kind: 'chat', message: 'progress.streaming', chatDelta: text })
          }
        }
        setProgress({ kind: 'idle', message: 'progress.done', chatDelta: text })
        return { content: text }
      } catch (error) {
        setProgress({ kind: 'idle', message: 'progress.failed' })
        wrapError(error)
      }
    },
    async completion(prompt: string, completionOptions?: TextOptionsPayload) {
      try {
        setProgress({ kind: 'busy', message: 'progress.completion' })
        const result = await requireClient().completion(prompt, completionOptions as TextGenerationOptions)
        setProgress({ kind: 'idle', message: 'progress.done' })
        return result
      } catch (error) {
        setProgress({ kind: 'idle', message: 'progress.failed' })
        wrapError(error)
      }
    },
    async listTextModels() {
      try {
        setProgress({ kind: 'busy', message: 'progress.textModels' })
        const models = await requireClient().listTextModels()
        setProgress({ kind: 'idle', message: 'progress.done' })
        return Array.isArray(models) ? models.filter((item) => typeof item === 'string') : []
      } catch (error) {
        setProgress({ kind: 'idle', message: 'progress.failed' })
        wrapError(error)
      }
    },
    async extractImageMetadata(image: string) {
      return extractImageMetadata(image)
    },
    async getImageSummary(image: string) {
      return getImageSummary(image)
    },
    async parseImage(image: string) {
      return parseImage(image)
    },
    async calculateCost(metadata: MetadataPayload, isOpus = false) {
      return calculateCost(asMetadata(metadata), isOpus)
    },
    async deduplicateTags(prompt: string) {
      return deduplicateTags(prompt)
    },
    async scaleDimensions(width: number, height: number, factor: number, maxPixels?: number) {
      return scaleDimensions(width, height, factor, maxPixels)
    },
    listPresets: () => persist.listPresets(),
    savePreset: (name: string, form: GeneratePresetForm) => persist.savePreset(name, form),
    loadPreset: (name: string) => persist.loadPreset(name),
    deletePreset: (name: string) => persist.deletePreset(name),
    renamePreset: (oldName: string, newName: string) => persist.renamePreset(oldName, newName),
    duplicatePreset: (name: string, newName: string) => persist.duplicatePreset(name, newName),
    setCurrentPreset: (name: string) => persist.setCurrentPreset(name),
    listHistory: () => persist.listHistory(),
    deleteHistory: (id: string) => persist.deleteHistory(id),
    clearHistory: () => persist.clearHistory(),
  }

  function mutate(fn: (d: HostData) => void) {
    if (options.mutate) options.mutate(fn)
    else fn(data)
  }

  function emit(event: HostEvent) {
    for (const listener of listeners) listener(event)
  }

  function setProgress(progress: ProgressState) {
    mutate((d) => {
      d.progress = progress
    })
    emit({ type: 'progress', progress })
  }

  async function persistGenerated(image: Image, meta: {
    prompt?: string
    negative?: string
    model?: string
    source: HistorySource
  }): Promise<SerializedImage> {
    const serialized = serializeImage(image)
    try {
      const item = await persist.saveHistory(image, meta)
      return { ...item, dataURL: serialized.dataURL }
    } catch (error) {
      console.warn('[nekoai-gui] failed to persist image', error)
      return serialized
    }
  }

  async function runDirector(fn: () => Promise<Image>, label: string, prompt?: string) {
    try {
      setProgress({ kind: 'busy', message: `progress.director:${label}` })
      const result = await persistGenerated(await fn(), { prompt, source: 'director' })
      setProgress({ kind: 'idle', message: 'progress.done' })
      return result
    } catch (error) {
      setProgress({ kind: 'idle', message: 'progress.failed' })
      wrapError(error)
    }
  }

  return {
    data,
    persist,
    getConfig: () => ({ ...current, retry: { ...current.retry, retryStatusCodes: [...current.retry.retryStatusCodes] } }),
    subscribe(listener: (event: HostEvent) => void) {
      listeners.add(listener)
      return () => {
        listeners.delete(listener)
      }
    },
    dispose() {
      listeners.clear()
      client = null
    },
  }
}

export type NekoaiHost = ReturnType<typeof createHost>
