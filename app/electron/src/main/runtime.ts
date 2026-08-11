import type { RuntimeInfo } from '@fumika/contracts'
import type { Context } from 'cordis'
import process from 'node:process'
import { Service } from 'cordis'

declare module 'cordis' {
  interface Context {
    runtimeInfo: RuntimeService
  }
}

export default class RuntimeService extends Service {
  static inject = ['app', 'link', 'version']

  constructor(ctx: Context) {
    super(ctx, 'runtimeInfo')
  }

  private getInfo(): RuntimeInfo {
    return {
      name: this.ctx.app.getName(),
      version: this.ctx.version,
      platform: process.platform,
      arch: process.arch,
      versions: {
        electron: process.versions.electron ?? 'unknown',
        chrome: process.versions.chrome ?? 'unknown',
        node: process.versions.node,
      },
    }
  }

  async* [Service.init]() {
    yield this.ctx.link.action('data.runtime.get', () => this.getInfo())
    this.ctx.emit('link/send', 'data.runtime', this.getInfo())
  }
}
