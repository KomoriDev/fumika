import type { Context } from 'cordis'
import type { NativeImage } from 'electron'
import { Service } from 'cordis'
import { Menu, nativeImage, Tray } from 'electron'
import electronIcon from './assets/electron-icon.png?inline'

export default class TrayService extends Service {
  static inject = ['app', 'window', 'appState']

  private tray: Tray | null = null

  constructor(ctx: Context) {
    super(ctx, 'tray')
  }

  async* [Service.init]() {
    await this.ctx.app.whenReady()
    const tray = new Tray(createTrayIcon())
    this.tray = tray
    this.applyMenu()
    tray.on('click', () => void this.ctx.window.show())
    tray.on('double-click', () => void this.ctx.window.show())
    yield this.ctx.on('state/changed', () => this.applyMenu())
    yield () => {
      tray.destroy()
      this.tray = null
    }
  }

  private applyMenu(): void {
    const tray = this.tray
    if (!tray)
      return
    const zh = this.ctx.appState.data.app.locale.startsWith('zh')
    tray.setToolTip('Fumika')
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
