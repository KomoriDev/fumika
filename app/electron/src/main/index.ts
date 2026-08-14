import type { App } from 'electron'
import type { RuntimeEnvironment } from './window'
import path from 'node:path'
import process from 'node:process'
import { pathToFileURL } from 'node:url'
import Database from '@cordisjs/plugin-database'
import { LinkIpcMain } from '@fumika/plugin-link-ipc/main'
import BackendStateService from '@fumika/plugin-state'
import { Context } from 'cordis'
import { dialog, app as electronApp } from 'electron'
import MailAccountService from './mail'
import MailNotificationService from './mail/notification'
import FumikaSQLiteDriver from './sqlite'
import TrayService from './tray'
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
  context.get('window')?.prepareQuit()
  await context.fiber.dispose()
  electronApp.exit(0)
}

async function bootstrap() {
  const env: RuntimeEnvironment = {
    preloadPath: path.join(__dirname, 'preload.js'),
    rendererUrl: MAIN_WINDOW_VITE_DEV_SERVER_URL,
    rendererFile: path.join(__dirname, `../renderer/${MAIN_WINDOW_VITE_NAME}/index.html`),
  }

  if (process.platform === 'win32' && !electronApp.isPackaged)
    electronApp.setAppUserModelId(process.execPath)

  context.provide('app', electronApp)
  context.provide('env', env)
  context.provide('version', electronApp.getVersion())

  const linkFiber = context.plugin(LinkIpcMain)
  const modelFiber = context.plugin(Database)
  await Promise.all([linkFiber.await(), modelFiber.await()])

  const databaseFiber = context.plugin(FumikaSQLiteDriver, {
    path: new URL('mail.db', pathToFileURL(`${electronApp.getPath('userData')}${path.sep}`)).href,
  })
  await databaseFiber.await()

  const fibers = await Promise.all([
    context.plugin(BackendStateService, {
      file: path.join(electronApp.getPath('userData'), 'state.json'),
    }),
    context.plugin(MailAccountService),
    context.plugin(WindowService, {
      width: 1180,
      height: 760,
    }),
    context.plugin(MailNotificationService),
    context.plugin(TrayService),
  ])
  await Promise.all(fibers.map(fiber => fiber.await()))
}

electronApp.on('window-all-closed', () => {
  // Stay alive in the tray so IMAP watchers keep receiving mail
})

electronApp.on('before-quit', (event) => {
  if (shuttingDown)
    return
  event.preventDefault()
  void shutdown()
})

process.on('SIGINT', () => void shutdown())
process.on('SIGTERM', () => void shutdown())

void bootstrap().catch(async (error) => {
  console.error('[bootstrap] failed', error)
  try {
    if (!electronApp.isReady())
      await electronApp.whenReady()
    dialog.showErrorBox(
      'Fumika failed to start',
      error instanceof Error ? error.stack ?? error.message : String(error),
    )
  }
  finally {
    electronApp.exit(1)
  }
})
