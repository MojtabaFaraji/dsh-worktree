import { defineConfig } from 'tsdown'

export default defineConfig({
  name: '@deepseek-ai/dsh-worktree/client',
  entry: { client: 'lib/types/client/index.js' },
  outDir: 'lib',
  format: 'cjs',
  platform: 'browser',
  dts: false,
  sourcemap: true,
  clean: false,
  deps: {
    neverBundle: (specifier) => {
      const externals = ['react', '@deepseek-ai/dsh-client-ui-conversation', '@deepseek-ai/dsh-client-ui-primitives']
      return externals.includes(specifier) || specifier.startsWith('@deepseek-ai/dsh-client-ui-') || specifier === 'react'
    },
    alwaysBundle: (specifier) => {
      const externals = ['react', '@deepseek-ai/dsh-client-ui-conversation', '@deepseek-ai/dsh-client-ui-primitives']
      return !externals.includes(specifier) && !specifier.startsWith('@deepseek-ai/dsh-client-ui-') && specifier !== 'react'
    },
  },
  define: {
    'process.env.NODE_ENV': JSON.stringify(process.env.NODE_ENV ?? 'production'),
    'import.meta.env.MODE': JSON.stringify(process.env.NODE_ENV ?? 'production'),
    'import.meta.env': JSON.stringify({ MODE: process.env.NODE_ENV ?? 'production' }),
  },
  outputOptions: {
    entryFileNames: 'client.js',
    chunkFileNames: 'client.[name].js',
    sourcemapExcludeSources: false,
    banner: (chunk) => {
      const id = JSON.stringify('@deepseek-ai/dsh-worktree')
      const registration = chunk.isEntry
        ? `window.__ModuleLoader__.load({ id: ${id}, factory: (require) => {`
        : `window.__ModuleLoader__.load({ id: ${id}, chunk: ${JSON.stringify(chunk.fileName)}, factory: (require) => {`
      return registration
    },
    footer: 'return module.exports; } });',
    intro: 'var module = { exports: {} }; var exports = module.exports;',
  },
})
