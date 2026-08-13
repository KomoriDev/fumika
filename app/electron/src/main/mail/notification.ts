import type { AppStateNamespaces, MailMessageSummary } from '@fumika/state'
import type { Context } from 'cordis'
import type { Notification as ElectronNotification } from 'electron'
import { Service } from 'cordis'
import { Notification } from 'electron'
import { createNotificationContent, selectNotifiableMessages } from './notification-content'

export default class MailNotificationService extends Service {
  static inject = ['app', 'appState', 'window']
  private readonly active = new Set<ElectronNotification>()

  constructor(ctx: Context) {
    super(ctx, 'mailNotification')
  }

  async* [Service.init]() {
    await this.ctx.app.whenReady()
    if (!Notification.isSupported())
      return

    yield this.ctx.on('mail/received', messages => this.notifyReceived(messages))
    yield () => {
      for (const notification of this.active)
        notification.close()
      this.active.clear()
    }
  }

  notifyReceived(messages: MailMessageSummary[]): void {
    for (const message of selectNotifiableMessages(messages, notificationsEnabled(this.ctx.appState.data)))
      this.show(message)
  }

  private show(message: MailMessageSummary): void {
    const notification = new Notification(createNotificationContent(message))
    this.active.add(notification)
    notification.once('click', () => {
      void this.ctx.window.openMail(message.id)
    })
    notification.once('close', () => this.active.delete(notification))
    notification.once('failed', (_event, error) => {
      this.active.delete(notification)
      this.ctx.logger('mail').warn('failed to show mail notification: %s', error)
    })
    notification.show()
  }
}

function notificationsEnabled(state: AppStateNamespaces): boolean {
  return state.app.preferences.desktopNotifications
}
