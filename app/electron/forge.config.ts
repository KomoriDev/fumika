import type { ForgeConfig } from '@electron-forge/shared-types'
import { copyFileSync, existsSync } from 'node:fs'
import { createRequire } from 'node:module'
import { dirname, join } from 'node:path'
import process from 'node:process'
import { MakerDeb } from '@electron-forge/maker-deb'
import { MakerRpm } from '@electron-forge/maker-rpm'
import { MakerSquirrel } from '@electron-forge/maker-squirrel'
import { MakerZIP } from '@electron-forge/maker-zip'
import { FusesPlugin } from '@electron-forge/plugin-fuses'
import { VitePlugin } from '@electron-forge/plugin-vite'
import { FuseV1Options, FuseVersion } from '@electron/fuses'

function ensureSquirrel7z(): void {
  const require = createRequire(join(process.cwd(), 'package.json'))
  const vendor = join(dirname(require.resolve('electron-winstaller')), '..', 'vendor')
  const arch = process.arch === 'arm64' ? 'arm64' : 'x64'
  for (const ext of ['exe', 'dll'] as const) {
    const dest = join(vendor, `7z.${ext}`)
    if (existsSync(dest))
      continue
    const src = join(vendor, `7z-${arch}.${ext}`)
    if (!existsSync(src))
      throw new Error(`electron-winstaller is missing ${src}`)
    copyFileSync(src, dest)
  }
}

const config: ForgeConfig = {
  packagerConfig: {
    asar: true,
    prune: false,
    name: 'Fumika',
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
  hooks: {
    preMake: async () => {
      // i'don't know why the fucking electron-winstaller needs 7z but doesn't put it
      // https://github.com/electron/windows-installer/issues/559
      ensureSquirrel7z()
    },
  },
  makers: [
    new MakerSquirrel({
      name: 'Fumika',
      exe: 'fumika.exe',
      setupExe: 'FumikaSetup.exe',
      title: 'Fumika',
      authors: 'KomoriDev',
      description: '轻量现代的邮件客户端 / A simple, elegant mail client',
    }),
    new MakerZIP({}, ['darwin']),
    new MakerRpm({ options: { name: 'fumika' } }),
    new MakerDeb({ options: { name: 'fumika' } }),
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
