import type { Plugin } from 'vite'
import { dirname, resolve } from 'node:path'
import { fileURLToPath } from 'node:url'
import { defineConfig, loadEnv } from 'vite'

const root = resolve(dirname(fileURLToPath(import.meta.url)), '../..')

// @cordisjs/plugin-database-sqlite does `await import('node:sqlite')` then
// `new DatabaseSync(path)`. If Vite cannot resolve that builtin it emits an
// empty `__vite-browser-external` stub and the packaged app dies with
// `TypeError: e is not a constructor` on startup.
function externalNodeSqlite(): Plugin {
  return {
    name: 'external-node-sqlite',
    resolveId(id) {
      if (id === 'node:sqlite' || id === 'sqlite')
        return { id: 'node:sqlite', external: true }
    },
  }
}

export default defineConfig(({ mode }) => {
  const env = loadEnv(mode, root, 'FUMIKA_')
  return {
    define: {
      __FUMIKA_GOOGLE_CLIENT_ID__: JSON.stringify(env.FUMIKA_GOOGLE_CLIENT_ID ?? ''),
      __FUMIKA_GOOGLE_CLIENT_SECRET__: JSON.stringify(env.FUMIKA_GOOGLE_CLIENT_SECRET ?? ''),
      __FUMIKA_OUTLOOK_CLIENT_ID__: JSON.stringify(env.FUMIKA_OUTLOOK_CLIENT_ID ?? ''),
      __FUMIKA_OUTLOOK_TENANT__: JSON.stringify(env.FUMIKA_OUTLOOK_TENANT ?? ''),
    },
    plugins: [externalNodeSqlite()],
    build: {
      rollupOptions: {
        external: ['node:sqlite'],
      },
    },
  }
})
