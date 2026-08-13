import type { Context } from 'cordis'
import type { BrowserWindowConstructorOptions } from 'electron'
import process from 'node:process'
import { Service } from 'cordis'
import { BrowserWindow, shell } from 'electron'

export interface RuntimeEnvironment {
  preloadPath: string
  rendererUrl?: string
  rendererFile: string
}

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
  private readonly config: Config

  constructor(ctx: Context, config: Config) {
    super(ctx, 'window')
    this.config = config
  }

  async* [Service.init]() {
    await this.ctx.app.whenReady()
    await this.createWindow()

    const handleActivate = () => {
      if (!this.window)
        void this.createWindow()
    }
    this.ctx.app.on('activate', handleActivate)

    yield () => {
      this.ctx.app.off('activate', handleActivate)
      this.window?.destroy()
      this.window = null
    }
  }

  private async createWindow() {
    const isDevelopment = Boolean(this.ctx.env.rendererUrl)

    const webPreferences: BrowserWindowConstructorOptions['webPreferences'] = {
      preload: this.ctx.env.preloadPath,
      contextIsolation: true,
      nodeIntegration: false,
      sandbox: true,
      webSecurity: true,
      devTools: isDevelopment,
    }

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
      webPreferences,
    })
    this.window = window

    window.once('ready-to-show', () => window.show())
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

    if (this.ctx.env.rendererUrl)
      await window.loadURL(this.ctx.env.rendererUrl)
    else
      await window.loadFile(this.ctx.env.rendererFile)
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
