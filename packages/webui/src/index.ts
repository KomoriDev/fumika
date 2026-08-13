import { Context } from 'cordis'
import { ClientService } from './client'
import { installCore } from './core'
import MailModule from './plugins/mail'
import FrontendStateService from './plugins/state'
import './style.css'

export * from './client'
export * from './components/slot'
export * from './context'
export * from './core'
export * from './plugins/action'
export * from './plugins/i18n'
export * from './plugins/router'
export * from './plugins/setting'
export * from './plugins/state'
export * from './plugins/theme'

export const root = new Context()
export const stateFiber = root.plugin(FrontendStateService)
export const mailFiber = root.plugin(MailModule)
export const client = new ClientService(root)

installCore(root)
