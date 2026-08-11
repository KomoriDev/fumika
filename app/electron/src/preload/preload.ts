import type { FumikaBridge } from '@fumika/plugin-link-ipc/bridge'
import { toActionChannel, toEventChannel } from '@fumika/plugin-link-ipc/bridge'
import { contextBridge, ipcRenderer } from 'electron'

type SubscriptionListener = (event: Electron.IpcRendererEvent, ...args: unknown[]) => void

let nextSubscriptionId = 0
const subscriptions = new Map<number, { channel: string, listener: SubscriptionListener }>()

const bridge: FumikaBridge = {
  invoke(action, payload) {
    return ipcRenderer.invoke(toActionChannel(action), payload)
  },
  subscribe(event, callback) {
    const id = ++nextSubscriptionId
    const channel = toEventChannel(event)
    const listener: SubscriptionListener = (_event, data) => callback(data)
    subscriptions.set(id, { channel, listener })
    ipcRenderer.on(channel, listener)
    return id
  },
  unsubscribe(id) {
    const subscription = subscriptions.get(id)
    if (!subscription)
      return
    ipcRenderer.off(subscription.channel, subscription.listener)
    subscriptions.delete(id)
  },
}

contextBridge.exposeInMainWorld('fumika', bridge)
