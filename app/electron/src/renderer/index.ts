import { LinkIpcClient } from '@fumika/plugin-link-ipc/renderer'
import { client, mailFiber, root, stateFiber } from '@fumika/webui'
import metadata from '../../package.json'

root.provide('version', metadata.version)

window.addEventListener('fumika:navigate', (event) => {
  const path = (event as CustomEvent<unknown>).detail
  if (typeof path === 'string' && path.startsWith('/'))
    void client.router.router.push(path)
})

async function bootstrap() {
  const linkFiber = root.plugin(LinkIpcClient)
  await Promise.all([linkFiber.await(), stateFiber.await(), mailFiber.await()])
  client.mount('#app')

  window.addEventListener('beforeunload', () => {
    client.unmount()
    void root.fiber.dispose()
  }, { once: true })
}

void bootstrap().catch((error) => {
  console.error('[renderer] bootstrap failed', error)
})
