import { LinkIpcClient } from '@fumika/plugin-link-ipc/renderer'
import { Context } from 'cordis'
import metadata from '../../package.json'

const surface = new URLSearchParams(window.location.search).get('surface')

async function bootstrap() {
  if (surface === 'tray') {
    await bootstrapTray()
    return
  }

  await bootstrapMain()
}

async function bootstrapTray(): Promise<void> {
  const { default: TrayClient } = await import('@fumika/tray')
  const root = new Context()

  await connectIpc(root)

  const trayFiber = root.plugin(TrayClient, { target: '#app' })
  await trayFiber.await()

  window.addEventListener('beforeunload', () => void root.fiber.dispose(), { once: true })
}

async function bootstrapMain(): Promise<void> {
  const { client, mailFiber, root, stateFiber } = await import('@fumika/webui')

  root.provide('version', metadata.version)
  window.addEventListener('fumika:navigate', (event) => {
    const path = (event as CustomEvent<unknown>).detail
    if (typeof path === 'string' && path.startsWith('/'))
      void client.router.router.push(path)
  })

  await connectIpc(root)
  await Promise.all([stateFiber.await(), mailFiber.await()])
  client.mount('#app')

  window.addEventListener('beforeunload', () => {
    client.unmount()
    void root.fiber.dispose()
  }, { once: true })
}

async function connectIpc(root: Context): Promise<void> {
  const linkFiber = root.plugin(LinkIpcClient)
  await linkFiber.await()
}

void bootstrap().catch((error) => {
  console.error(`[renderer:${surface ?? 'main'}] bootstrap failed`, error)
})
