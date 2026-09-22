import { mkdir, readFile, writeFile } from 'node:fs/promises'
import { dirname, join } from 'node:path'
import { fileURLToPath } from 'node:url'
import { Host } from 'nekoai-js'
import { createHost, DEFAULT_RETRY, type HostConfig } from '../../nekoai-gui/src/host'
import { attachHostHttp, wrapExpress } from '../../nekoai-gui/src/http'

const root = dirname(fileURLToPath(import.meta.url))
const configPath = join(root, 'config.json')
const dataDir = join(root, 'data')

type PluginRouter = {
  get: Function
  post: Function
  use?: Function
}

async function readConfig(): Promise<Partial<HostConfig>> {
  try {
    return JSON.parse(await readFile(configPath, 'utf8')) as Partial<HostConfig>
  } catch (error) {
    if ((error as NodeJS.ErrnoException).code === 'ENOENT') return {}
    throw error
  }
}

async function writeConfig(config: HostConfig) {
  const { dataDir: _dataDir, ...rest } = config
  await writeFile(configPath, JSON.stringify(rest, null, 2), 'utf8')
}

let host: ReturnType<typeof createHost> | null = null

export async function init(router: PluginRouter) {
  await mkdir(dataDir, { recursive: true })
  const saved = await readConfig()
  host = createHost({
    dataDir,
    historyUrlPrefix: '/api/plugins/nekoai-gui/history',
    token: process.env.NOVELAI_TOKEN || saved.token || '',
    host: saved.host || Host.WEB,
    textHost: saved.textHost || Host.TEXT,
    timeout: saved.timeout ?? 120000,
    verbose: saved.verbose ?? false,
    retry: { ...DEFAULT_RETRY, ...saved.retry },
    onConfigChange: writeConfig,
  })
  attachHostHttp(wrapExpress(router), host)
  console.log('[NekoAI] server plugin ready')
}

export async function exit() {
  host?.dispose()
  host = null
}

export const info = {
  id: 'nekoai-gui',
  name: 'NekoAI',
  description: 'NekoAI SillyTavern 扩展的 NovelAI 主机（预设与图库落盘） / NovelAI host for the NekoAI SillyTavern extension (presets and history on disk)',
}
