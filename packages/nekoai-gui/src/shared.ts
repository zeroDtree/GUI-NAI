export interface RetryConfigPayload {
  enabled?: boolean
  maxRetries?: number
  baseDelay?: number
  maxDelay?: number
  retryStatusCodes?: number[]
}

export interface ClientConfigPayload {
  token?: string
  host?: string
  textHost?: string
  timeout?: number
  verbose?: boolean
  retry?: RetryConfigPayload
}

export interface PublicClientConfig {
  hasToken: boolean
  host: string
  textHost: string
  timeout: number
  verbose: boolean
  retry: Required<RetryConfigPayload>
}

export type HistorySource = 'generate' | 'director' | 'upscale' | 'enhance'

export interface SerializedImage {
  filename: string
  size: number
  dataURL?: string
  id?: string
  url?: string
  prompt?: string
  negative?: string
  model?: string
  source?: HistorySource
  createdAt?: number
}

export interface HistoryRecord extends SerializedImage {
  id: string
  file: string
  source: HistorySource
  createdAt: number
}

export interface HistoryItem extends SerializedImage {
  id: string
  url: string
  source: HistorySource
  createdAt: number
}

export interface GeneratePresetForm extends MetadataPayload {
  customSize?: boolean
  rawV4?: boolean
  streamCall?: boolean
  isOpus?: boolean
  forceZip?: boolean
}

export interface PresetRecord {
  name: string
  updatedAt: number
  form: GeneratePresetForm
}

export interface PresetIndex {
  current: string
  names: string[]
}

export interface ImageProgressEvent {
  event_type: 'intermediate' | 'final'
  samp_ix: number
  step_ix: number
  gen_id: string
  sigma: number
  image: SerializedImage
}

export interface ProgressState {
  kind: 'idle' | 'busy' | 'image' | 'chat'
  message?: string
  step?: number
  sigma?: number
  preview?: string
  chatDelta?: string
}

export interface GenerateCallOptions {
  stream?: boolean
  isOpus?: boolean
  forceZip?: boolean
}

export interface CharacterPromptPayload {
  prompt: string
  uc?: string
  center?: { x: number; y: number }
  enabled?: boolean
}

export interface V4CaptionPayload {
  base_caption: string
  char_captions?: { char_caption: string; centers: { x: number; y: number }[] }[]
}

export interface MetadataPayload {
  prompt?: string
  model?: string
  action?: string
  resPreset?: string
  negative_prompt?: string
  qualityToggle?: boolean
  ucPreset?: 0 | 1 | 2 | 3
  width?: number
  height?: number
  n_samples?: number
  steps?: number
  scale?: number
  dynamic_thresholding?: boolean
  seed?: number
  extra_noise_seed?: number
  sampler?: string
  sm?: boolean
  sm_dyn?: boolean
  cfg_rescale?: number
  noise_schedule?: string
  image?: string
  strength?: number
  img2img?: { strength: number; color_correct: boolean }
  noise?: number
  controlnet_strength?: number
  controlnet_condition?: string
  controlnet_model?: string
  add_original_image?: boolean
  mask?: string
  reference_image_multiple?: string[]
  reference_information_extracted_multiple?: number[]
  reference_strength_multiple?: number[]
  director_reference_images?: string[]
  director_reference_descriptions?: {
    caption: V4CaptionPayload
    legacy_uc?: boolean
    use_coords?: boolean
    use_order?: boolean
  }[]
  director_reference_information_extracted?: number[]
  director_reference_strength_values?: number[]
  director_reference_secondary_strength_values?: number[]
  params_version?: 1 | 2 | 3
  autoSmea?: boolean
  characterPrompts?: CharacterPromptPayload[]
  v4_prompt?: {
    caption: V4CaptionPayload
    use_coords: boolean
    use_order: boolean
  }
  v4_negative_prompt?: {
    caption: V4CaptionPayload
    legacy_uc: boolean
  }
  skip_cfg_above_sigma?: number | null
  use_coords?: boolean
  legacy_uc?: boolean
  normalize_reference_strength_multiple?: boolean
  deliberate_euler_ancestral_bug?: boolean
  prefer_brownian?: boolean
  inpaintImg2ImgStrength?: number
  color_correct?: boolean
  image_format?: string
  legacy?: boolean
  legacy_v3_extend?: boolean
  stream?: string | null
}

export type EnhancePayload = Omit<MetadataPayload, 'image' | 'action' | 'width' | 'height'> & {
  upscaleFactor?: number
}

export interface DirectorToolPayload {
  req_type: string
  image: string
  prompt?: string
  defry?: number
}

export interface ChatMessagePayload {
  role: 'system' | 'user' | 'assistant'
  content: string
}

export interface TextOptionsPayload {
  model?: string
  max_tokens?: number
  temperature?: number
  top_p?: number
  top_k?: number
  min_p?: number
  frequency_penalty?: number
  presence_penalty?: number
  stop?: string | string[]
  seed?: number
  logit_bias?: Record<string, number>
  n?: number
  [key: string]: unknown
}

export interface TagSuggestionPayload {
  tag: string
  confidence?: number
  count?: number
}

export interface ParsedImagePayload {
  width: number
  height: number
  base64: string
}

export interface SelectOption<T extends string | number = string | number> {
  label: string
  value: T
}

export interface UiOptions {
  models: SelectOption<string>[]
  resolutions: SelectOption<string>[]
  samplers: SelectOption<string>[]
  noises: SelectOption<string>[]
  actions: SelectOption<string>[]
  controlnets: SelectOption<string>[]
  emotions: SelectOption<string>[]
  emotionLevels: SelectOption<number>[]
  hosts: SelectOption<string>[]
  directorTools: SelectOption<string>[]
  textModels: SelectOption<string>[]
}

export interface HostData {
  config: PublicClientConfig
  progress: ProgressState
  uiOptions: UiOptions
  setClientConfig(payload: ClientConfigPayload): Promise<PublicClientConfig>
  generateImage(metadata: MetadataPayload, options?: GenerateCallOptions): Promise<SerializedImage[]>
  enhance(image: string, options?: EnhancePayload): Promise<SerializedImage[]>
  upscale(image: string, scale?: 2 | 4): Promise<SerializedImage>
  colorize(image: string, prompt?: string, defry?: number): Promise<SerializedImage>
  changeEmotion(image: string, emotion?: string, prompt?: string, emotionLevel?: number): Promise<SerializedImage>
  useDirectorTool(request: DirectorToolPayload): Promise<SerializedImage>
  suggestTags(prompt: string, model?: string, lang?: 'en' | 'jp'): Promise<TagSuggestionPayload[]>
  chat(messages: string | ChatMessagePayload[], options?: TextOptionsPayload): Promise<unknown>
  chatStream(messages: string | ChatMessagePayload[], options?: TextOptionsPayload): Promise<unknown>
  completion(prompt: string, options?: TextOptionsPayload): Promise<unknown>
  listTextModels(): Promise<string[]>
  extractImageMetadata(image: string): Promise<unknown>
  getImageSummary(image: string): Promise<unknown>
  parseImage(image: string): Promise<ParsedImagePayload>
  calculateCost(metadata: MetadataPayload, isOpus?: boolean): Promise<number>
  deduplicateTags(prompt: string): Promise<string>
  scaleDimensions(width: number, height: number, factor: number, maxPixels?: number): Promise<[number, number]>
  listPresets(): Promise<PresetIndex>
  savePreset(name: string, form: GeneratePresetForm): Promise<PresetIndex>
  loadPreset(name: string): Promise<PresetRecord>
  deletePreset(name: string): Promise<PresetIndex>
  renamePreset(oldName: string, newName: string): Promise<PresetIndex>
  duplicatePreset(name: string, newName: string): Promise<PresetIndex>
  setCurrentPreset(name: string): Promise<PresetIndex>
  listHistory(): Promise<HistoryItem[]>
  deleteHistory(id: string): Promise<void>
  clearHistory(): Promise<void>
}
