import { inject, type Ref } from 'vue'
import type { HostData } from '../../nekoai-gui/src/shared'
import { kHost } from '../host-http'

export function useRpc<T = HostData>(): Ref<T> {
  const host = inject(kHost)
  if (!host) throw new Error('NekoAI host is not provided')
  return host as Ref<T>
}

export const icons = {
  register() {},
}

export class Context {}
