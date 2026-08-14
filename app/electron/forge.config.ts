import type { ForgeConfig } from '@electron-forge/shared-types'
import { MakerDeb } from '@electron-forge/maker-deb'
import { MakerRpm } from '@electron-forge/maker-rpm'
import { MakerZIP } from '@electron-forge/maker-zip'
import { FusesPlugin } from '@electron-forge/plugin-fuses'
import { VitePlugin } from '@electron-forge/plugin-vite'
import { FuseV1Options, FuseVersion } from '@electron/fuses'
import MakerNsis from './maker-nsis'

const config: ForgeConfig = {
  packagerConfig: {
    asar: true,
    prune: false,
    name: 'Fumika',
    executableName: 'fumika',
    download: {
      unsafelyDisableChecksums: true,
    },
    ignore(filePath) {
      if (!filePath)
        return false
      const normalized = filePath.replaceAll('\\', '/')
      return normalized !== '/package.json' && !normalized.startsWith('/.vite')
    },
  },
  rebuildConfig: {},
  makers: [
    new MakerNsis({}),
    new MakerZIP({}, ['darwin']),
    new MakerRpm({ options: { name: 'fumika', bin: 'fumika' } }),
    new MakerDeb({ options: { name: 'fumika', bin: 'fumika' } }),
  ],
  plugins: [
    new VitePlugin({
      build: [
        {
          entry: 'src/main/index.ts',
          config: 'vite.main.config.ts',
          target: 'main',
        },
        {
          entry: 'src/preload/preload.ts',
          config: 'vite.preload.config.ts',
          target: 'preload',
        },
      ],
      renderer: [
        {
          name: 'main_window',
          config: 'vite.renderer.config.mts',
        },
      ],
    }),
    new FusesPlugin({
      version: FuseVersion.V1,
      [FuseV1Options.RunAsNode]: false,
      [FuseV1Options.EnableCookieEncryption]: true,
      [FuseV1Options.EnableNodeOptionsEnvironmentVariable]: false,
      [FuseV1Options.EnableNodeCliInspectArguments]: false,
      [FuseV1Options.EnableEmbeddedAsarIntegrityValidation]: true,
      [FuseV1Options.OnlyLoadAppFromAsar]: true,
    }),
  ],
}

export default config
