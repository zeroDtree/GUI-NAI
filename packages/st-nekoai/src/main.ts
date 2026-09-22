import { createApp } from 'vue'
import ElementPlus from 'element-plus'
import 'element-plus/dist/index.css'
import App from './App.vue'
import { kHost, createHttpHost, pluginError } from './host-http'
import { hydrateGallery } from '../../nekoai-gui/client/store'
import { installChat } from './chat'
import { installInlineGen } from './inline-gen'
import { loadLocalePref } from './locale'
import '../../nekoai-gui/client/index.scss'
import './styles.css'

async function main() {
  const mount = document.getElementById('nekoai-st-app')
  if (!mount) {
    console.error('[NekoAI] #nekoai-st-app missing')
    return
  }
  loadLocalePref()
  const host = await createHttpHost()
  if (!pluginError.value) {
    try {
      await hydrateGallery(host.value)
    } catch {
      // History can be empty on first run.
    }
  }
  installChat()
  installInlineGen(host)
  const app = createApp(App)
  app.use(ElementPlus, { zIndex: 11000 })
  app.provide(kHost, host)
  app.mount(mount)
}

main().catch((error) => {
  console.error('[NekoAI] failed to start', error)
})
