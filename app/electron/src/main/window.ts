import type { Context } from 'cordis'
import type { IpcMainEvent } from 'electron'
import process from 'node:process'
import { Service } from 'cordis'
import { BrowserWindow, ipcMain, shell } from 'electron'
import { createRendererWebPreferences, loadRendererSurface } from './renderer-window'

export interface Config {
  width?: number
  height?: number
}

declare module 'cordis' {
  interface Context {
    window: WindowService
  }
}

export default class WindowService extends Service<Config> {
  static inject = ['app', 'env']

  private window: BrowserWindow | null = null
  private quitting = false
  private readonly config: Config
  private pendingRoute?: string

  constructor(ctx: Context, config: Config) {
    super(ctx, 'window')
    this.config = config
  }

  async show(): Promise<void> {
    if (!this.window)
      await this.createWindow()
    const window = this.window
    if (!window || window.isDestroyed())
      return
    window.setSkipTaskbar(false)
    if (window.isMinimized())
      window.restore()
    window.show()
    window.focus()
  }

  private hideToTray(): void {
    const window = this.window
    if (!window || window.isDestroyed())
      return
    window.hide()
    window.setSkipTaskbar(true)
  }

  prepareQuit(): void {
    this.quitting = true
  }

  async openMail(id: string): Promise<void> {
    await this.show()
    this.pendingRoute = `/mail/${encodeURIComponent(id)}`
    this.sendPendingRoute()
  }

  async* [Service.init]() {
    await this.ctx.app.whenReady()
    await this.createWindow()

    const handleActivate = () => {
      void this.show()
    }
    this.ctx.app.on('activate', handleActivate)

    const handleRendererReady = (event: IpcMainEvent) => {
      if (this.window?.webContents === event.sender)
        this.sendPendingRoute()
    }
    ipcMain.on('fumika:renderer-ready', handleRendererReady)

    yield () => {
      ipcMain.off('fumika:renderer-ready', handleRendererReady)
      this.ctx.app.off('activate', handleActivate)
      this.window?.destroy()
      this.window = null
    }
  }

  private sendPendingRoute(): void {
    if (!this.pendingRoute || !this.window || this.window.webContents.isLoadingMainFrame())
      return
    const route = this.pendingRoute
    this.pendingRoute = undefined
    this.window.webContents.send('fumika:navigate', route)
  }

  private async createWindow() {
    const isDevelopment = Boolean(this.ctx.env.rendererUrl)

    const window = new BrowserWindow({
      width: this.config.width ?? 1180,
      height: this.config.height ?? 760,
      minWidth: 900,
      minHeight: 600,
      show: false,
      autoHideMenuBar: true,
      titleBarStyle: 'hidden',
      ...(process.platform !== 'darwin'
        ? {
            titleBarOverlay: {
              color: '#00000000',
              symbolColor: '#3f3f46',
              height: 36,
            },
          }
        : {}),
      backgroundColor: '#f4f4f5',
      webPreferences: createRendererWebPreferences(this.ctx.env),
    })
    this.window = window

    window.once('ready-to-show', () => window.show())
    window.on('close', (event) => {
      if (this.quitting)
        return
      event.preventDefault()
      this.hideToTray()
    })
    window.once('closed', () => {
      if (this.window === window)
        this.window = null
    })
    window.webContents.setWindowOpenHandler(({ url }) => {
      const externalUrl = toSafeExternalUrl(url)
      if (externalUrl)
        void shell.openExternal(externalUrl)
      return { action: 'deny' }
    })
    if (isDevelopment) {
      window.webContents.on('before-input-event', (event, input) => {
        if (input.type !== 'keyDown' || input.key !== 'F12' || input.isAutoRepeat)
          return

        event.preventDefault()
        window.webContents.toggleDevTools()
      })
    }

    await loadRendererSurface(window, this.ctx.env)
    this.sendPendingRoute()
  }
}
function toSafeExternalUrl(value: string): string | undefined {
  try {
    const url = new URL(value)
    if (url.protocol === 'http:' || url.protocol === 'https:' || url.protocol === 'mailto:' || url.protocol === 'tel:')
      return url.toString()
  }
  catch {}
  return undefined
}
