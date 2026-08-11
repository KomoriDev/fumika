import type { Context } from 'cordis'
import type { IpcMainInvokeEvent, WebContents } from 'electron'
import { Link } from '@fumika/link'
import { Service } from 'cordis'
import { ipcMain, webContents } from 'electron'
import { toActionChannel, toEventChannel } from './bridge.js'

export class LinkIpcMain<C extends Context = Context> extends Link<C> {
  private readonly handlers = new Map<string, Link.ActionHandler>()
  private bound = false

  async* [Service.init]() {
    if (!this.bound) {
      for (const path of this.handlers.keys()) this.bindIpc(path)

      this.ctx.on('link/send', (event, data) => {
        for (const listener of this.eventListeners.get(event) ?? []) listener(data)
        const channel = toEventChannel(event)
        for (const content of webContents.getAllWebContents()) this.trySend(content, channel, data)
      })

      this.bound = true
      this.log.info('IPC link started (%d handlers)', this.handlers.size)
    }

    yield () => {
      if (this.bound) {
        for (const path of this.handlers.keys()) ipcMain.removeHandler(toActionChannel(path))
        this.bound = false
      }
      this.handlers.clear()
      this.eventListeners.clear()
    }
  }

  protected handle<T, R>(path: string, handler: Link.ActionHandler<T, R>) {
    this.handlers.set(path, handler)
    if (this.bound)
      this.bindIpc(path)
    return () => {
      this.handlers.delete(path)
      if (this.bound)
        ipcMain.removeHandler(toActionChannel(path))
    }
  }

  protected async call<T, R>(path: string, payload?: T): Promise<Link.Response<R>> {
    const handler = this.handlers.get(path)
    if (!handler)
      return { id: path, error: { code: Link.ErrorCode.ENOENT, message: `action not registered: ${path}` } }
    try {
      return { id: path, data: await handler(payload) }
    }
    catch (err) {
      return { id: path, error: { code: Link.ErrorCode.EINTERNAL, message: err instanceof Error ? err.message : String(err) } }
    }
  }

  private bindIpc(path: string) {
    const channel = toActionChannel(path)
    ipcMain.removeHandler(channel)
    ipcMain.handle(channel, async (_event: IpcMainInvokeEvent, payload: unknown) => {
      this.log.info('← %s (frame %d)', path, _event.frameId)
      const handler = this.handlers.get(path)
      if (!handler)
        return { id: path, error: { code: Link.ErrorCode.ENOENT, message: `action not registered: ${path}` } }
      try {
        const data = await handler(payload)
        this.log.info('→ %s success', path)
        return { id: path, data }
      }
      catch (err) {
        this.log.warn('→ %s error: %s', path, err instanceof Error ? err.message : String(err))
        return { id: path, error: { code: Link.ErrorCode.EINTERNAL, message: err instanceof Error ? err.message : String(err) } }
      }
    })
  }

  private trySend(content: WebContents, channel: string, data: unknown) {
    try {
      if (!content.isDestroyed())
        content.send(channel, data)
    }
    catch (err) {
      this.log.warn('broadcast %s failed: %s', channel, err instanceof Error ? err.message : String(err))
    }
  }
}

export default LinkIpcMain
