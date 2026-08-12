import { builtinModules } from 'node:module'
import { dirname, resolve } from 'node:path'
import { fileURLToPath } from 'node:url'
import { defineConfig, loadEnv } from 'vite'

const external = ['electron', ...builtinModules, ...builtinModules.map(name => `node:${name}`)]
const root = resolve(dirname(fileURLToPath(import.meta.url)), '../..')

export default defineConfig(({ mode }) => {
  const env = loadEnv(mode, root, 'FUMIKA_')
  return {
    define: {
      __FUMIKA_GOOGLE_CLIENT_ID__: JSON.stringify(env.FUMIKA_GOOGLE_CLIENT_ID ?? ''),
      __FUMIKA_GOOGLE_CLIENT_SECRET__: JSON.stringify(env.FUMIKA_GOOGLE_CLIENT_SECRET ?? ''),
      __FUMIKA_OUTLOOK_CLIENT_ID__: JSON.stringify(env.FUMIKA_OUTLOOK_CLIENT_ID ?? ''),
      __FUMIKA_OUTLOOK_TENANT__: JSON.stringify(env.FUMIKA_OUTLOOK_TENANT ?? ''),
    },
    build: {
      rollupOptions: { external },
    },
  }
})
