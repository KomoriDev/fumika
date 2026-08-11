import { builtinModules } from 'node:module'
import { defineConfig } from 'vite'

const external = ['electron', ...builtinModules, ...builtinModules.map(name => `node:${name}`)]

export default defineConfig({
  build: {
    rollupOptions: { external },
  },
})
