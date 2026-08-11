import type {} from '@fumika/contracts'
import { LinkIpcClient } from '@fumika/plugin-link-ipc/renderer'
import { client, root, stateFiber } from '@fumika/webui'

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
