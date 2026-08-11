import type {} from '@fumika/link'

export interface RuntimeInfo {
  name: string
  version: string
  platform: string
  arch: string
  versions: {
    electron: string
    chrome: string
    node: string
  }
}

declare module '@fumika/link' {
  namespace Link {
    interface Actions {
      'data.runtime.get': Action<void, RuntimeInfo>
    }

    interface Events {
      'data.runtime': RuntimeInfo
    }
  }
}

export {}
