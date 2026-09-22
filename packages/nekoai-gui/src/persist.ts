import { mkdir, readFile, rename, unlink, writeFile } from 'node:fs/promises'
import { dirname, join, resolve } from 'node:path'
import type { Image } from 'nekoai-js'
import type {
  GeneratePresetForm,
  HistoryItem,
  HistoryRecord,
  HistorySource,
  PresetIndex,
  PresetRecord,
} from './shared.js'

const DEFAULT_PRESET = 'default'
const HISTORY_LIMIT = 1000
export const DEFAULT_HISTORY_URL_PREFIX = '/nekoai-gui/history'

export function isSafeId(id: string) {
  return /^[a-zA-Z0-9_-]+$/.test(id)
}

export function historyUrl(id: string, prefix = DEFAULT_HISTORY_URL_PREFIX) {
  return `${prefix.replace(/\/$/, '')}/${id}`
}

function newId() {
  return `nai-${Date.now().toString(36)}-${Math.random().toString(36).slice(2, 8)}`
}

function safePresetFile(name: string) {
  const trimmed = name.trim()
  if (!trimmed) throw new Error('preset.emptyName')
  const safe = trimmed.replace(/[^a-zA-Z0-9._\-\u4e00-\u9fff ]+/g, '_').replace(/\s+/g, ' ').trim().slice(0, 80)
  if (!safe) throw new Error('preset.emptyName')
  return `${safe}.json`
}

function extOf(filename: string) {
  const lower = filename.toLowerCase()
  if (lower.endsWith('.jpg') || lower.endsWith('.jpeg')) return '.jpg'
  return '.png'
}

function toClient(record: HistoryRecord, prefix: string): HistoryItem {
  const { file: _file, ...rest } = record
  return {
    ...rest,
    url: historyUrl(record.id, prefix),
    dataURL: '',
  }
}

async function writeJson(path: string, data: unknown) {
  await mkdir(dirname(path), { recursive: true })
  const tmp = `${path}.tmp`
  await writeFile(tmp, JSON.stringify(data, null, 2), 'utf8')
  await rename(tmp, path)
}

async function readJson<T>(path: string, fallback: T): Promise<T> {
  try {
    return JSON.parse(await readFile(path, 'utf8')) as T
  } catch (error) {
    if ((error as NodeJS.ErrnoException).code === 'ENOENT') return fallback
    throw error
  }
}

function emptyIndex(): PresetIndex {
  return { current: DEFAULT_PRESET, names: [DEFAULT_PRESET] }
}

export function createPersist(dataDir: string, historyUrlPrefix = DEFAULT_HISTORY_URL_PREFIX) {
  const root = resolve(dataDir)
  const presetDir = join(root, 'presets')
  const historyDir = join(root, 'history')
  const presetIndexPath = join(presetDir, 'index.json')
  const historyIndexPath = join(historyDir, 'index.json')
  const urlPrefix = historyUrlPrefix.replace(/\/$/, '') || DEFAULT_HISTORY_URL_PREFIX

  let chain = Promise.resolve()
  const queue = <T>(fn: () => Promise<T>) => {
    const run = chain.then(fn, fn)
    chain = run.then(() => undefined, () => undefined)
    return run
  }

  const presetPath = (name: string) => join(presetDir, safePresetFile(name))

  async function ensureDirs() {
    await mkdir(presetDir, { recursive: true })
    await mkdir(historyDir, { recursive: true })
    const index = await readJson<PresetIndex>(presetIndexPath, emptyIndex())
    if (!index.names.includes(DEFAULT_PRESET)) index.names.unshift(DEFAULT_PRESET)
    if (!index.current) index.current = DEFAULT_PRESET
    await writeJson(presetIndexPath, index)
    try {
      await readFile(presetPath(DEFAULT_PRESET), 'utf8')
    } catch {
      await writeJson(presetPath(DEFAULT_PRESET), {
        name: DEFAULT_PRESET,
        updatedAt: 0,
        form: {},
      } satisfies PresetRecord)
    }
    return index
  }

  const readPresetIndex = () => readJson<PresetIndex>(presetIndexPath, emptyIndex())
  const readHistoryIndex = () => readJson<HistoryRecord[]>(historyIndexPath, [])

  async function loadPresetUnlocked(name: string): Promise<PresetRecord> {
    const index = await readPresetIndex()
    if (!index.names.includes(name)) throw new Error('preset.notFound')
    return readJson<PresetRecord>(presetPath(name), {
      name,
      updatedAt: 0,
      form: {},
    })
  }

  function sanitizePresetForm(form: GeneratePresetForm): GeneratePresetForm {
    const clone = JSON.parse(JSON.stringify(form || {})) as GeneratePresetForm & Record<string, unknown>
    delete clone.token
    delete clone.host
    delete clone.textHost
    delete clone.retry
    delete clone.timeout
    return clone
  }

  async function savePresetUnlocked(name: string, form: GeneratePresetForm): Promise<PresetIndex> {
    const trimmed = name.trim()
    if (!trimmed) throw new Error('preset.emptyName')
    const record: PresetRecord = {
      name: trimmed,
      updatedAt: Date.now(),
      form: sanitizePresetForm(form),
    }
    await writeJson(presetPath(trimmed), record)
    const index = await readPresetIndex()
    if (!index.names.includes(trimmed)) index.names.push(trimmed)
    index.current = trimmed
    await writeJson(presetIndexPath, index)
    return index
  }

  return {
    DEFAULT_PRESET,
    ensure: () => queue(ensureDirs),
    listPresets: () => queue(async () => {
      await ensureDirs()
      return readPresetIndex()
    }),
    loadPreset: (name: string) => queue(async () => {
      await ensureDirs()
      return loadPresetUnlocked(name)
    }),
    savePreset: (name: string, form: GeneratePresetForm) => queue(async () => {
      await ensureDirs()
      return savePresetUnlocked(name, form)
    }),
    deletePreset: (name: string) => queue(async () => {
      await ensureDirs()
      if (name === DEFAULT_PRESET) throw new Error('preset.cannotDeleteDefault')
      const index = await readPresetIndex()
      if (!index.names.includes(name)) throw new Error('preset.notFound')
      try {
        await unlink(presetPath(name))
      } catch (error) {
        if ((error as NodeJS.ErrnoException).code !== 'ENOENT') throw error
      }
      index.names = index.names.filter((item) => item !== name)
      if (index.current === name) index.current = DEFAULT_PRESET
      await writeJson(presetIndexPath, index)
      return index
    }),
    renamePreset: (oldName: string, newName: string) => queue(async () => {
      await ensureDirs()
      if (oldName === DEFAULT_PRESET) throw new Error('preset.cannotRenameDefault')
      const trimmed = newName.trim()
      if (!trimmed) throw new Error('preset.emptyName')
      const index = await readPresetIndex()
      if (!index.names.includes(oldName)) throw new Error('preset.notFound')
      if (index.names.includes(trimmed) && trimmed !== oldName) throw new Error('preset.exists')
      const record = await loadPresetUnlocked(oldName)
      record.name = trimmed
      await writeJson(presetPath(trimmed), record)
      if (safePresetFile(oldName) !== safePresetFile(trimmed)) {
        try {
          await unlink(presetPath(oldName))
        } catch (error) {
          if ((error as NodeJS.ErrnoException).code !== 'ENOENT') throw error
        }
      }
      index.names = index.names.map((item) => item === oldName ? trimmed : item)
      if (index.current === oldName) index.current = trimmed
      await writeJson(presetIndexPath, index)
      return index
    }),
    duplicatePreset: (name: string, newName: string) => queue(async () => {
      await ensureDirs()
      const record = await loadPresetUnlocked(name)
      return savePresetUnlocked(newName, record.form)
    }),
    setCurrentPreset: (name: string) => queue(async () => {
      await ensureDirs()
      const index = await readPresetIndex()
      if (!index.names.includes(name)) throw new Error('preset.notFound')
      index.current = name
      await writeJson(presetIndexPath, index)
      return index
    }),
    listHistory: () => queue(async () => {
      await ensureDirs()
      return (await readHistoryIndex()).map((item) => toClient(item, urlPrefix))
    }),
    findHistory: (id: string) => queue(async () => {
      await ensureDirs()
      if (!isSafeId(id)) return null
      const records = await readHistoryIndex()
      return records.find((item) => item.id === id) ?? null
    }),
    readHistoryFile: async (record: HistoryRecord) => {
      return readFile(join(historyDir, record.file))
    },
    saveHistory: (image: Image, meta: {
      prompt?: string
      negative?: string
      model?: string
      source: HistorySource
    }) => queue(async () => {
      await ensureDirs()
      const id = newId()
      const file = `${id}${extOf(image.filename)}`
      await writeFile(join(historyDir, file), image.data)
      const record: HistoryRecord = {
        id,
        filename: image.filename || file,
        size: image.size,
        file,
        prompt: meta.prompt,
        negative: meta.negative,
        model: meta.model,
        source: meta.source,
        createdAt: Date.now(),
      }
      let records = await readHistoryIndex()
      records.unshift(record)
      const overflow = records.slice(HISTORY_LIMIT)
      records = records.slice(0, HISTORY_LIMIT)
      await writeJson(historyIndexPath, records)
      await Promise.all(overflow.map(async (item) => {
        try {
          await unlink(join(historyDir, item.file))
        } catch (error) {
          if ((error as NodeJS.ErrnoException).code !== 'ENOENT') throw error
        }
      }))
      return toClient(record, urlPrefix)
    }),
    deleteHistory: (id: string) => queue(async () => {
      await ensureDirs()
      if (!isSafeId(id)) throw new Error('history.notFound')
      const records = await readHistoryIndex()
      const record = records.find((item) => item.id === id)
      if (!record) throw new Error('history.notFound')
      try {
        await unlink(join(historyDir, record.file))
      } catch (error) {
        if ((error as NodeJS.ErrnoException).code !== 'ENOENT') throw error
      }
      await writeJson(historyIndexPath, records.filter((item) => item.id !== id))
    }),
    clearHistory: () => queue(async () => {
      await ensureDirs()
      const records = await readHistoryIndex()
      await writeJson(historyIndexPath, [])
      await Promise.all(records.map(async (item) => {
        try {
          await unlink(join(historyDir, item.file))
        } catch (error) {
          if ((error as NodeJS.ErrnoException).code !== 'ENOENT') throw error
        }
      }))
    }),
  }
}

export type Persist = ReturnType<typeof createPersist>
