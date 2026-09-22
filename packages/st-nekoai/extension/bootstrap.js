/**
 * SillyTavern loads this file from the extension manifest.
 * It mounts a root node and then loads the Vite bundle.
 */
(function () {
  'use strict'

  const extensionName = 'nekoai-gui'
  const extensionPath = `/scripts/extensions/third-party/${extensionName}`

  function createMountPoint() {
    let root = document.getElementById('nekoai-st-app')
    if (!root) {
      root = document.createElement('div')
      root.id = 'nekoai-st-app'
      document.body.appendChild(root)
    }
    return root
  }

  function load() {
    createMountPoint()

    if (!document.querySelector('link[data-nekoai-st]')) {
      const css = document.createElement('link')
      css.rel = 'stylesheet'
      css.href = `${extensionPath}/index.css`
      css.dataset.nekoaiSt = '1'
      document.head.appendChild(css)
    }

    if (!document.querySelector('script[data-nekoai-st]')) {
      const script = document.createElement('script')
      script.type = 'module'
      script.src = `${extensionPath}/index.js`
      script.dataset.nekoaiSt = '1'
      script.onerror = () => {
        console.error('[NekoAI] Failed to load index.js. Run pnpm --filter st-nekoai build.')
      }
      document.head.appendChild(script)
    }
  }

  if (typeof jQuery === 'function') {
    jQuery(load)
  } else if (document.readyState === 'loading') {
    document.addEventListener('DOMContentLoaded', load)
  } else {
    load()
  }
})()
