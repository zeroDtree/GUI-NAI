import { HOST_RPC_METHODS, type HostRpcMethod, type NekoaiHost } from './host.js'
import type { HostData } from './shared.js'
import { isSafeId } from './persist.js'

export interface HttpContext {
  params: Record<string, string>
  query: Record<string, string | string[] | undefined>
  body(): Promise<unknown>
  method: string
  setHeader(name: string, value: string): void
  status(code: number): void
  json(data: unknown): void
  text(data: string): void
  bytes(data: Uint8Array, contentType?: string): void
  write(chunk: string): boolean | void
  flushHeaders?(): void
  onClose(cb: () => void): void
}

export type HttpHandler = (ctx: HttpContext) => void | Promise<void>

export interface HttpRouter {
  get(path: string, handler: HttpHandler): void
  post(path: string, handler: HttpHandler): void
}

function joinPath(basePath: string, path: string) {
  const base = basePath.replace(/\/$/, '')
  if (!path.startsWith('/')) return `${base}/${path}`
  return `${base}${path}`
}

async function readStreamBody(req: NodeJS.ReadableStream & { body?: unknown }): Promise<unknown> {
  if (req.body !== undefined && req.body !== null && req.body !== '') return req.body
  const chunks: Buffer[] = []
  for await (const chunk of req as AsyncIterable<Buffer | string>) {
    chunks.push(typeof chunk === 'string' ? Buffer.from(chunk) : chunk)
  }
  const raw = Buffer.concat(chunks).toString('utf8').trim()
  if (!raw) return {}
  return JSON.parse(raw)
}

export function wrapExpress(router: {
  get: Function
  post: Function
}): HttpRouter {
  const adapt = (handler: HttpHandler) => async (req: any, res: any) => {
    let statusCode = 200
    const ctx: HttpContext = {
      params: req.params || {},
      query: req.query || {},
      body: () => readStreamBody(req),
      method: req.method || 'GET',
      setHeader(name, value) {
        res.setHeader(name, value)
      },
      status(code) {
        statusCode = code
        res.statusCode = code
      },
      json(data) {
        if (!res.headersSent) res.setHeader('Content-Type', 'application/json; charset=utf-8')
        res.status(statusCode).send(JSON.stringify(data))
      },
      text(data) {
        if (!res.headersSent) res.setHeader('Content-Type', 'text/plain; charset=utf-8')
        res.status(statusCode).send(data)
      },
      bytes(data, contentType) {
        if (contentType) res.setHeader('Content-Type', contentType)
        res.status(statusCode).send(Buffer.from(data))
      },
      write(chunk) {
        return res.write(chunk)
      },
      flushHeaders() {
        res.flushHeaders?.()
      },
      onClose(cb) {
        req.on('close', cb)
      },
    }
    try {
      await handler(ctx)
    } catch (error) {
      if (res.headersSent) {
        res.end()
        return
      }
      ctx.status(500)
      ctx.json({ error: error instanceof Error ? error.message : String(error) })
    }
  }
  return {
    get(path, handler) {
      router.get(path, adapt(handler))
    },
    post(path, handler) {
      router.post(path, adapt(handler))
    },
  }
}

export function wrapCordis(server: { get: Function; post?: Function }): HttpRouter {
  const adapt = (handler: HttpHandler) => async (req: any, res: any) => {
    const ctx: HttpContext = {
      params: req.params || {},
      query: req.query || {},
      async body() {
        if (typeof req.json === 'function') return req.json()
        if (req.body && typeof req.body === 'object' && !req.body[Symbol.asyncIterator] && !(typeof ReadableStream !== 'undefined' && req.body instanceof ReadableStream)) {
          return req.body
        }
        return {}
      },
      method: req.method || 'GET',
      setHeader(name, value) {
        res.headers?.set?.(name, value)
      },
      status(code) {
        res.status = code
      },
      json(data) {
        res.headers?.set?.('Content-Type', 'application/json; charset=utf-8')
        if (typeof res.json === 'function') res.json(data)
        else res.text(JSON.stringify(data))
      },
      text(data) {
        res.text(data)
      },
      bytes(data, contentType) {
        if (contentType) res.headers?.set?.('Content-Type', contentType)
        res.bytes(data)
      },
      write(chunk) {
        return res.write?.(chunk)
      },
      onClose(cb) {
        req.on?.('close', cb)
      },
    }
    await handler(ctx)
  }
  return {
    get(path, handler) {
      server.get(path, adapt(handler))
    },
    post(path, handler) {
      const post = server.post?.bind(server) || server.get.bind(server)
      post(path, adapt(handler))
    },
  }
}

function snapshot(host: NekoaiHost) {
  return {
    config: host.data.config,
    progress: host.data.progress,
    uiOptions: host.data.uiOptions,
  }
}

export function attachHostHttp(router: HttpRouter, host: NekoaiHost, options: { basePath?: string } = {}) {
  const base = options.basePath || ''
  const methods = new Set<string>(HOST_RPC_METHODS)

  router.get(joinPath(base, '/state'), async (ctx) => {
    ctx.json(snapshot(host))
  })

  router.get(joinPath(base, '/health'), async (ctx) => {
    ctx.json({ ok: true, hasToken: host.data.config.hasToken })
  })

  router.post(joinPath(base, '/rpc'), async (ctx) => {
    const payload = await ctx.body() as { method?: string; args?: unknown[] }
    const method = payload?.method
    if (!method || !methods.has(method)) {
      ctx.status(400)
      ctx.json({ error: `Unknown method: ${method || ''}` })
      return
    }
    const args = (Array.isArray(payload.args) ? payload.args : []).map((item) => (item === null ? undefined : item))
    try {
      const fn = host.data[method as HostRpcMethod] as (...fnArgs: unknown[]) => unknown
      const result = await fn.apply(host.data, args)
      ctx.json({ result, config: host.data.config, progress: host.data.progress })
    } catch (error) {
      ctx.status(400)
      ctx.json({ error: error instanceof Error ? error.message : String(error) })
    }
  })

  router.get(joinPath(base, '/events'), async (ctx) => {
    ctx.setHeader('Content-Type', 'text/event-stream; charset=utf-8')
    ctx.setHeader('Cache-Control', 'no-cache, no-transform')
    ctx.setHeader('Connection', 'keep-alive')
    ctx.flushHeaders?.()
    const send = (payload: unknown) => {
      ctx.write(`data: ${JSON.stringify(payload)}\n\n`)
    }
    send({ type: 'state', ...snapshot(host) })
    const unsubscribe = host.subscribe((event) => send(event))
    ctx.onClose(unsubscribe)
  })

  router.get(joinPath(base, '/history/:id'), async (ctx) => {
    const id = ctx.params.id
    if (!isSafeId(id)) {
      ctx.status(400)
      ctx.text('Invalid id')
      return
    }
    const record = await host.persist.findHistory(id)
    if (!record) {
      ctx.status(404)
      ctx.text('Not found')
      return
    }
    const buf = await host.persist.readHistoryFile(record)
    ctx.bytes(buf, record.file.endsWith('.png') ? 'image/png' : 'image/jpeg')
  })
}

export function invokeHostMethod(host: NekoaiHost, method: string, args: unknown[]) {
  if (!HOST_RPC_METHODS.includes(method as HostRpcMethod)) {
    throw new Error(`Unknown method: ${method}`)
  }
  const fn = host.data[method as keyof HostData]
  if (typeof fn !== 'function') throw new Error(`Unknown method: ${method}`)
  return (fn as (...fnArgs: unknown[]) => unknown).apply(host.data, args)
}
