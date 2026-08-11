import { LinkIpcClient } from '@fumika/plugin-link-ipc/renderer'
import { client, root, stateFiber } from '@fumika/webui'
import metadata from '../../package.json'

root.provide('version', metadata.version)

async function bootstrap() {
  const linkFiber = root.plugin(LinkIpcClient)
  await Promise.all([linkFiber.await(), stateFiber.await()])
  client.mount('#app')

  window.addEventListener('beforeunload', () => {
    client.unmount()
    void root.fiber.dispose()
  }, { once: true })
}

void bootstrap().catch((error) => {
  console.error('[renderer] bootstrap failed', error)
})
