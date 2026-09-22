import {
  Action,
  Controlnet,
  DirectorTools,
  EmotionLevel,
  EmotionOptions,
  Host,
  Model,
  Noise,
  Resolution,
  Sampler,
  TextModel,
} from 'nekoai-js'
import type { SelectOption, UiOptions } from './shared.js'

type EnumLike<T extends string | number> = Record<string, T | string>

function optionsFromEnum<T extends string | number>(enumObj: EnumLike<T>): SelectOption<T>[] {
  return Object.entries(enumObj)
    .filter(([key]) => Number.isNaN(Number(key)))
    .map(([key, value]) => ({
      label: typeof value === 'string' ? value : key,
      value: value as T,
    }))
}

export function buildUiOptions(): UiOptions {
  return {
    models: optionsFromEnum(Model),
    resolutions: optionsFromEnum(Resolution),
    samplers: optionsFromEnum(Sampler),
    noises: optionsFromEnum(Noise),
    actions: optionsFromEnum(Action),
    controlnets: optionsFromEnum(Controlnet),
    emotions: optionsFromEnum(EmotionOptions),
    emotionLevels: optionsFromEnum(EmotionLevel),
    hosts: optionsFromEnum(Host),
    directorTools: optionsFromEnum(DirectorTools),
    textModels: optionsFromEnum(TextModel),
  }
}
