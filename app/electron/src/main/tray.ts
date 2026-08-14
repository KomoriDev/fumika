import type { Context } from 'cordis'
import type { NativeImage, Point, Size } from 'electron'
import process from 'node:process'
import { Service } from 'cordis'
import { BrowserWindow, Menu, nativeImage, screen, Tray } from 'electron'
import electronIcon from './assets/electron-icon.png?inline'
import { createRendererWebPreferences, loadRendererSurface } from './renderer-window'

const MENU_WIDTH = 180
const MENU_HEIGHT = 87
const MENU_PANEL_INSET = 6
const MENU_BLUR_HIDE_DELAY = 100

export default class TrayService extends Service {
  static inject = ['app', 'window', 'appState', 'env', 'link']

  private tray: Tray | null = null
  private menuWindow: BrowserWindow | null = null
  private menuHideTimer: ReturnType<typeof setTimeout> | null = null
  private useCustomMenu = process.platform !== 'linux'

  constructor(ctx: Context) {
    super(ctx, 'tray')
  }

  async* [Service.init]() {
    await this.ctx.app.whenReady()
    const tray = new Tray(createTrayIcon())
    this.tray = tray
    tray.setToolTip('Fumika')

    if (this.useCustomMenu) {
      try {
        await this.ensureMenuWindow()
      }
      catch (error) {
        this.fallbackToNativeMenu(error)
      }
    }

    if (this.useCustomMenu) {
      tray.on('right-click', () => {
        const cursor = screen.getCursorScreenPoint()
        void this.showMenu(cursor)
      })
    }
    else {
      this.applyNativeMenu()
    }

    const openMainWindow = () => {
      this.hideMenu()
      void this.ctx.window.show()
    }
    tray.on('click', openMainWindow)
    tray.on('double-click', openMainWindow)

    yield this.ctx.link.action('tray-menu.open', async () => {
      this.hideMenu()
      await this.ctx.window.show()
      return { ok: true as const }
    })
    yield this.ctx.link.action('tray-menu.dismiss', () => {
      this.hideMenu()
      return { ok: true as const }
    })
    yield this.ctx.link.action('tray-menu.quit', () => {
      this.hideMenu()
      this.ctx.window.prepareQuit()
      setTimeout(() => this.ctx.app.quit(), 0)
      return { ok: true as const }
    })
    yield this.ctx.on('state/changed', () => this.applyNativeMenu())
    yield () => {
      this.cancelScheduledMenuHide()
      this.menuWindow?.destroy()
      this.menuWindow = null
      tray.destroy()
      this.tray = null
    }
  }

  private applyNativeMenu(): void {
    const tray = this.tray
    if (!tray || this.useCustomMenu)
      return
    const zh = this.ctx.appState.data.app.locale.startsWith('zh')
    tray.setContextMenu(Menu.buildFromTemplate([
      {
        label: zh ? '打开' : 'Open',
        click: () => void this.ctx.window.show(),
      },
      { type: 'separator' },
      {
        label: zh ? '退出' : 'Quit',
        click: () => {
          this.ctx.window.prepareQuit()
          this.ctx.app.quit()
        },
      },
    ]))
  }

  private async ensureMenuWindow(): Promise<BrowserWindow> {
    const current = this.menuWindow
    if (current && !current.isDestroyed())
      return current

    const menuWindow = new BrowserWindow({
      width: MENU_WIDTH,
      height: MENU_HEIGHT,
      show: false,
      frame: false,
      thickFrame: false,
      transparent: true,
      resizable: false,
      minimizable: false,
      maximizable: false,
      fullscreenable: false,
      skipTaskbar: true,
      alwaysOnTop: true,
      hasShadow: false,
      autoHideMenuBar: true,
      backgroundColor: '#00000000',
      webPreferences: createRendererWebPreferences(this.ctx.env),
    })
    this.menuWindow = menuWindow

    menuWindow.on('blur', () => this.scheduleMenuHide(menuWindow))
    menuWindow.once('closed', () => {
      this.cancelScheduledMenuHide()
      if (this.menuWindow === menuWindow)
        this.menuWindow = null
    })
    menuWindow.webContents.setWindowOpenHandler(() => ({ action: 'deny' }))
    menuWindow.webContents.on('before-input-event', (event, input) => {
      if (input.type !== 'keyDown' || input.key !== 'Escape')
        return
      event.preventDefault()
      menuWindow.hide()
    })

    try {
      await loadRendererSurface(menuWindow, this.ctx.env, 'tray')
    }
    catch (error) {
      menuWindow.destroy()
      throw error
    }
    return menuWindow
  }

  private async showMenu(cursor: Point): Promise<void> {
    if (!this.useCustomMenu)
      return

    this.cancelScheduledMenuHide()
    try {
      const menuWindow = await this.ensureMenuWindow()
      const [width, height] = menuWindow.getContentSize()
      const position = resolveMenuPosition(cursor, { width, height })
      menuWindow.setPosition(position.x, position.y, false)
      if (!menuWindow.isVisible())
        menuWindow.show()
      menuWindow.focus()
    }
    catch (error) {
      this.fallbackToNativeMenu(error)
    }
  }

  private hideMenu(): void {
    this.cancelScheduledMenuHide()
    const menuWindow = this.menuWindow
    if (menuWindow && !menuWindow.isDestroyed())
      menuWindow.hide()
  }

  private scheduleMenuHide(menuWindow: BrowserWindow): void {
    this.cancelScheduledMenuHide()
    this.menuHideTimer = setTimeout(() => {
      this.menuHideTimer = null
      if (this.menuWindow === menuWindow && !menuWindow.isDestroyed())
        menuWindow.hide()
    }, MENU_BLUR_HIDE_DELAY)
  }

  private cancelScheduledMenuHide(): void {
    if (!this.menuHideTimer)
      return
    clearTimeout(this.menuHideTimer)
    this.menuHideTimer = null
  }

  private fallbackToNativeMenu(error: unknown): void {
    this.ctx.logger('tray').warn(
      'custom tray menu unavailable, using native menu: %s',
      error instanceof Error ? error.message : String(error),
    )
    this.cancelScheduledMenuHide()
    this.menuWindow?.destroy()
    this.menuWindow = null
    this.useCustomMenu = false
    this.applyNativeMenu()
  }
}
function resolveMenuPosition(cursor: Point, menuSize: Size): { x: number, y: number } {
  const displayBounds = screen.getDisplayNearestPoint(cursor).bounds
  const minimumX = displayBounds.x
  const maximumX = displayBounds.x + displayBounds.width - menuSize.width
  const leftCornerX = cursor.x - MENU_PANEL_INSET
  const rightCornerX = cursor.x - menuSize.width + MENU_PANEL_INSET
  const canAnchorLeftCorner = leftCornerX <= maximumX
  const canAnchorRightCorner = rightCornerX >= minimumX

  let x: number
  if (canAnchorLeftCorner) {
    x = leftCornerX
  }
  else if (canAnchorRightCorner) {
    x = rightCornerX
  }
  else {
    x = clamp(leftCornerX, minimumX, maximumX)
  }

  const minimumY = displayBounds.y
  const maximumY = displayBounds.y + displayBounds.height - menuSize.height
  const y = clamp(cursor.y - menuSize.height + MENU_PANEL_INSET, minimumY, maximumY)
  return { x: Math.round(x), y: Math.round(y) }
}

function clamp(value: number, minimum: number, maximum: number): number {
  return Math.min(Math.max(value, minimum), maximum)
}

function createTrayIcon(): NativeImage {
  const source = nativeImage.createFromDataURL(electronIcon)
  const icon = nativeImage.createEmpty()
  icon.addRepresentation({
    scaleFactor: 1,
    width: 16,
    height: 16,
    buffer: source.resize({ width: 16, height: 16, quality: 'best' }).toPNG(),
  })
  icon.addRepresentation({
    scaleFactor: 2,
    width: 32,
    height: 32,
    buffer: source.resize({ width: 32, height: 32, quality: 'best' }).toPNG(),
  })
  return icon
}
