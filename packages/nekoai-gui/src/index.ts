import { Context } from 'cordis'
import '@cordisjs/plugin-webui'
import '@cordisjs/plugin-server'
import z from 'schemastery'
import { Host } from 'nekoai-js'
import type { HostData, RetryConfigPayload } from './shared.js'
import { createHost, DEFAULT_RETRY, type HostConfig } from './host.js'
import { attachHostHttp, wrapCordis } from './http.js'

export { createHost, DEFAULT_RETRY } from './host.js'
export { attachHostHttp, wrapCordis, wrapExpress } from './http.js'
export { createPersist, isSafeId, historyUrl, DEFAULT_HISTORY_URL_PREFIX } from './persist.js'

export const name = 'nekoai-gui'

export const inject = ['webui', 'server']

export type Config = HostConfig

const RetrySchema: z<Required<RetryConfigPayload>> = z.object({
  enabled: z.boolean().default(true).description('Retry failed requests'),
  maxRetries: z.natural().default(3).description('Maximum retry attempts'),
  baseDelay: z.natural().default(1000).description('Exponential backoff base delay (ms)'),
  maxDelay: z.natural().default(30000).description('Backoff cap (ms)'),
  retryStatusCodes: z.array(z.natural()).default([429, 500, 502, 503, 504]).description('HTTP status codes that trigger a retry'),
})

export const Config: z<Config> = z.object({
  token: z.string().role('secret').default('').description('NovelAI persistent API token'),
  host: z.string().role('link').default(Host.WEB).description('Image API host'),
  textHost: z.string().role('link').default(Host.TEXT).description('Text API host'),
  timeout: z.natural().default(120000).description('Request timeout (ms), including generation time'),
  verbose: z.boolean().default(false).description('Log payload and estimated Anlas'),
  retry: RetrySchema.description('Retry policy'),
  dataDir: z.string().default('data/nekoai-gui').description('Directory for presets and image history'),
}).i18n({
  'zh-CN': {
    token: 'NovelAI persistent API token',
    host: '图像 API host',
    textHost: '文本 API host',
    timeout: '请求超时 (ms)，含生成时间',
    verbose: '记录 payload 与预估 Anlas',
    dataDir: '预设与图库目录',
    retry: {
      $desc: '失败重试',
      enabled: '是否启用失败重试',
      maxRetries: '最大重试次数',
      baseDelay: '指数退避基数 (ms)',
      maxDelay: '退避上限 (ms)',
      retryStatusCodes: '触发重试的 HTTP 状态码',
    },
  },
})

export function apply(ctx: Context, config: Config) {
  const webui = (ctx as any).webui
  if (!webui) throw new Error('webui service is required')

  let entry: { mutate(fn: (data: HostData) => void): void }
  let host!: ReturnType<typeof createHost>

  host = createHost({
    ...config,
    token: process.env.NOVELAI_TOKEN || config.token || '',
    historyUrlPrefix: '/nekoai-gui/history',
    mutate: (fn) => {
      if (entry) entry.mutate(fn)
      else fn(host.data)
    },
  })

  entry = webui.addEntry({
    baseUrl: import.meta.url,
    source: '../client/index.ts',
    manifest: '../dist/manifest.json',
    routes: ['/generate', '/director', '/upscale', '/text', '/inspect', '/history', '/nai-settings'],
  }, host.data)

  attachHostHttp(wrapCordis(ctx.server), host, { basePath: '/nekoai-gui' })
}
