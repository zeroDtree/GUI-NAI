import { cp, mkdir, writeFile } from 'node:fs/promises'
import { dirname, join } from 'node:path'
import { fileURLToPath } from 'node:url'
import * as esbuild from 'esbuild'
import { build as viteBuild } from 'vite'

const root = dirname(fileURLToPath(import.meta.url))

await viteBuild({ configFile: join(root, 'vite.config.ts') })

await esbuild.build({
  absWorkingDir: root,
  entryPoints: ['src/plugin.ts'],
  bundle: true,
  platform: 'node',
  format: 'esm',
  outfile: 'dist/plugin/index.mjs',
  external: ['canvas'],
  logOverride: { 'empty-import-meta': 'silent' },
})

await cp(join(root, 'extension/manifest.json'), join(root, 'dist/extension/manifest.json'))
await cp(join(root, 'extension/bootstrap.js'), join(root, 'dist/extension/bootstrap.js'))
await mkdir(join(root, 'dist/plugin'), { recursive: true })
await writeFile(join(root, 'dist/plugin/package.json'), `${JSON.stringify({
  name: 'nekoai-gui',
  type: 'module',
  main: 'index.mjs',
}, null, 2)}\n`)

console.log('[st-nekoai] wrote dist/extension and dist/plugin')
