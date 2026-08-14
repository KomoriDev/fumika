import { fileURLToPath } from 'node:url'
import tailwindcss from '@tailwindcss/vite'
import vue from '@vitejs/plugin-vue'
import { defineConfig } from 'vite'
import VueDevTools from 'vite-plugin-vue-devtools'

const webuiSource = fileURLToPath(new URL('../../packages/webui/src/', import.meta.url))
const webuiEntry = fileURLToPath(new URL('../../packages/webui/src/index.ts', import.meta.url))

export default defineConfig({
  base: './',
  plugins: [
    vue(),
    tailwindcss(),
    VueDevTools(),
  ],
  resolve: {
    alias: [
      { find: /^@fumika\/webui$/, replacement: webuiEntry },
      { find: '@', replacement: webuiSource },
    ],
    preserveSymlinks: false,
  },
  optimizeDeps: {
    exclude: ['@fumika/tray', '@fumika/webui'],
  },
})
