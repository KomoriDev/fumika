import type { BrowserWindow, BrowserWindowConstructorOptions } from 'electron'

export type RendererSurface = 'main' | 'tray'

export interface RuntimeEnvironment {
  preloadPath: string
  rendererUrl?: string
  rendererFile: string
}

export function createRendererWebPreferences(
  env: RuntimeEnvironment,
): BrowserWindowConstructorOptions['webPreferences'] {
  return {
    preload: env.preloadPath,
    contextIsolation: true,
    nodeIntegration: false,
    sandbox: true,
    webSecurity: true,
    devTools: Boolean(env.rendererUrl),
  }
}

export async function loadRendererSurface(
  browserWindow: BrowserWindow,
  env: RuntimeEnvironment,
  surface: RendererSurface = 'main',
): Promise<void> {
  if (env.rendererUrl) {
    const url = new URL(env.rendererUrl)
    if (surface !== 'main')
      url.searchParams.set('surface', surface)
    await browserWindow.loadURL(url.toString())
    return
  }

  if (surface === 'main') {
    await browserWindow.loadFile(env.rendererFile)
    return
  }

  await browserWindow.loadFile(env.rendererFile, {
    query: { surface },
  })
}
