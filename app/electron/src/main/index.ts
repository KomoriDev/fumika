import type { App } from 'electron'
import type { RuntimeEnvironment } from './window'
import path from 'node:path'
import process from 'node:process'
import { LinkIpcMain } from '@fumika/plugin-link-ipc/main'
import BackendStateService from '@fumika/plugin-state'
import { Context } from 'cordis'
import { app as electronApp } from 'electron'
import started from 'electron-squirrel-startup'
import WindowService from './window'

declare module 'cordis' {
  interface Context {
    app: App
    env: RuntimeEnvironment
    version: string
  }
}

const context = new Context()
let shuttingDown = false

async function shutdown() {
  if (shuttingDown)
    return
  shuttingDown = true
  await context.fiber.dispose()
  electronApp.exit(0)
}

async function bootstrap() {
  const env: RuntimeEnvironment = {
    preloadPath: path.join(__dirname, 'preload.js'),
    rendererUrl: MAIN_WINDOW_VITE_DEV_SERVER_URL,
    rendererFile: path.join(__dirname, `../renderer/${MAIN_WINDOW_VITE_NAME}/index.html`),
  }

  context.provide('app', electronApp)
  context.provide('env', env)
  context.provide('version', electronApp.getVersion())

  const fibers = await Promise.all([
    context.plugin(LinkIpcMain),
    context.plugin(BackendStateService, {
      file: path.join(electronApp.getPath('userData'), 'state.json'),
    }),
    context.plugin(WindowService, {
      width: 1180,
      height: 760,
    }),
  ])
  await Promise.all(fibers.map(fiber => fiber.await()))
}

if (started) {
  electronApp.exit(0)
}
else {
  electronApp.on('window-all-closed', () => {
    if (process.platform !== 'darwin')
      void shutdown()
  })

  electronApp.on('before-quit', (event) => {
    if (shuttingDown)
      return
    event.preventDefault()
    void shutdown()
  })

  process.on('SIGINT', () => void shutdown())
  process.on('SIGTERM', () => void shutdown())

  void bootstrap().catch((error) => {
    console.error('[bootstrap] failed', error)
    electronApp.exit(1)
  })
}
