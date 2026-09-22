import { fileURLToPath, URL } from 'node:url'
import { defineConfig } from 'vite'
import vue from '@vitejs/plugin-vue'

const nekoaiClient = fileURLToPath(new URL('../nekoai-gui/client', import.meta.url))
const cordisShim = fileURLToPath(new URL('./src/shims/cordis-client.ts', import.meta.url))

export default defineConfig({
  plugins: [vue()],
  resolve: {
    alias: {
      '@cordisjs/client': cordisShim,
      'nekoai-gui/client': nekoaiClient,
    },
    dedupe: ['vue'],
  },
  server: {
    fs: {
      allow: ['..'],
    },
  },
  build: {
    outDir: 'dist/extension',
    emptyOutDir: true,
    cssCodeSplit: false,
    rollupOptions: {
      input: fileURLToPath(new URL('./src/main.ts', import.meta.url)),
      output: {
        entryFileNames: 'index.js',
        chunkFileNames: 'chunks/[name]-[hash].js',
        assetFileNames: 'index.[ext]',
      },
    },
  },
})
