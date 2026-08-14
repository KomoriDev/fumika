import type { Link } from '@fumika/link'
import type { AppStateGetReply, ThemeState } from '@fumika/state'
import type { Context } from 'cordis'
import type { App as VueApp } from 'vue'
import { Service } from 'cordis'
import { createApp, defineComponent, h, reactive } from 'vue'
import TrayMenu from './TrayMenu.vue'
import './style.css'

export interface Config {
  target?: string | Element
}

interface TrayViewState {
  locale: string
  themeMode: ThemeState['mode']
  busy: boolean
}

type TrayAction = Link.Action<void, { ok: true }>
type TrayActionName = 'tray-menu.open' | 'tray-menu.quit' | 'tray-menu.dismiss'

declare module '@fumika/link' {
  namespace Link {
    interface Actions {
      'tray-menu.open': TrayAction
      'tray-menu.quit': TrayAction
      'tray-menu.dismiss': TrayAction
    }
  }
}

declare module 'cordis' {
  interface Context {
    trayClient: TrayClient
  }
}

export default class TrayClient extends Service<Config> {
  static inject = ['link']

  private readonly config: Config
  private readonly view = reactive<TrayViewState>({
    locale: navigator.language || 'en-US',
    themeMode: 'auto',
    busy: false,
  })

  private app: VueApp | null = null

  constructor(ctx: Context, config: Config = {}) {
    super(ctx, 'trayClient')
    this.config = config
  }

  async* [Service.init]() {
    const disposeState = this.ctx.link.on('app-state.updated', () => {
      void this.refreshState()
    })

    await this.refreshState()
    const root = defineComponent(() => () => h(TrayMenu, {
      locale: this.view.locale,
      themeMode: this.view.themeMode,
      busy: this.view.busy,
      onOpen: () => void this.runAction('tray-menu.open'),
      onQuit: () => void this.runAction('tray-menu.quit'),
      onDismiss: () => void this.runAction('tray-menu.dismiss'),
    }))
    const app = createApp(root)
    this.app = app
    app.mount(this.config.target ?? '#app')

    yield disposeState
    yield () => {
      app.unmount()
      if (this.app === app)
        this.app = null
    }
  }

  private async refreshState(): Promise<void> {
    try {
      const reply = await this.ctx.link.action('app-state.get') as AppStateGetReply
      this.view.locale = reply.state.app.locale
      this.view.themeMode = reply.state.app.theme.mode
    }
    catch (error) {
      this.ctx.logger('tray').warn(
        'failed to refresh tray state: %s',
        error instanceof Error ? error.message : String(error),
      )
    }
  }

  private async runAction(action: TrayActionName): Promise<void> {
    if (action !== 'tray-menu.dismiss' && this.view.busy)
      return

    const tracksBusy = action !== 'tray-menu.dismiss'
    if (tracksBusy)
      this.view.busy = true
    try {
      await this.ctx.link.action(action)
    }
    catch (error) {
      this.ctx.logger('tray').warn(
        '%s failed: %s',
        action,
        error instanceof Error ? error.message : String(error),
      )
    }
    finally {
      if (tracksBusy)
        this.view.busy = false
    }
  }
}
