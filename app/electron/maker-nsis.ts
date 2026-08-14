import type { MakerOptions } from '@electron-forge/maker-base'
import type { ForgePlatform } from '@electron-forge/shared-types'
import path from 'node:path'
import process from 'node:process'
import { MakerBase } from '@electron-forge/maker-base'
import { build } from 'app-builder-lib'

const BUILDER_BINARIES_MIRROR = 'https://npmmirror.com/mirrors/electron-builder-binaries/'

export interface MakerNsisConfig {
  oneClick?: boolean
  allowToChangeInstallationDirectory?: boolean
  artifactName?: string
  shortcutName?: string
  uninstallDisplayName?: string
}

export default class MakerNsis extends MakerBase<MakerNsisConfig> {
  name = 'nsis'
  defaultPlatforms: ForgePlatform[] = ['win32']

  isSupportedOnCurrentPlatform(): boolean {
    return true
  }

  async make({ dir, makeDir, targetArch }: MakerOptions): Promise<string[]> {
    process.env.ELECTRON_BUILDER_BINARIES_MIRROR ??= BUILDER_BINARIES_MIRROR

    const output = path.join(makeDir, 'nsis', targetArch)
    await this.ensureDirectory(output)

    return build({
      prepackaged: dir,
      win: [`nsis:${targetArch}`],
      config: {
        appId: 'dev.komorebi.fumika',
        productName: 'Fumika',
        executableName: 'fumika',
        directories: { output },
        nsis: {
          oneClick: false,
          allowToChangeInstallationDirectory: true,
          artifactName: `FumikaSetup.\${ext}`,
          shortcutName: 'Fumika',
          uninstallDisplayName: 'Fumika',
          createDesktopShortcut: true,
          createStartMenuShortcut: true,
          ...this.config,
        },
      },
    })
  }
}
