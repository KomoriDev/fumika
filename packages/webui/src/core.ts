import type { Context } from 'cordis'
import Schema from 'schemastery'
import { mailFolderPattern } from './mail'
import MailListView from './views/MailListView.vue'

const GeneralSettings = Schema.object({
  locale: Schema.union([
    Schema.const('en-US').extra('description', { 'en-US': 'English', 'zh-CN': 'English' }),
    Schema.const('zh-CN').extra('description', { 'en-US': 'Simplified Chinese', 'zh-CN': '简体中文' }),
  ])
    .default('en-US')
    .extra('label', { 'en-US': 'Language', 'zh-CN': '语言' })
    .extra('description', { 'en-US': 'Application language', 'zh-CN': '应用显示语言' }),
})

const AppearanceSettings = Schema.object({
  theme: Schema.object({
    mode: Schema.union([
      Schema.const('auto').extra('description', { 'en-US': 'System', 'zh-CN': '跟随系统' }),
      Schema.const('light').extra('description', { 'en-US': 'Light', 'zh-CN': '浅色' }),
      Schema.const('dark').extra('description', { 'en-US': 'Dark', 'zh-CN': '深色' }),
    ])
      .default('auto')
      .extra('label', { 'en-US': 'Color mode', 'zh-CN': '颜色模式' }),
  }).extra('flatten', true),
  sidebar: Schema.object({
    open: Schema.boolean()
      .default(true)
      .extra('label', { 'en-US': 'Expanded sidebar', 'zh-CN': '展开侧栏' })
      .extra('description', { 'en-US': 'Keep the navigation sidebar expanded', 'zh-CN': '默认保持导航侧栏展开' }),
  }).extra('flatten', true),
})

const MailPreferences = Schema.object({
  preferences: Schema.object({
    messagePreviews: Schema.boolean()
      .default(true)
      .extra('label', { 'en-US': 'Message previews', 'zh-CN': '邮件预览' })
      .extra('description', { 'en-US': 'Show a short preview below each subject', 'zh-CN': '在邮件主题下方显示内容预览' }),
    compactDensity: Schema.boolean()
      .default(false)
      .extra('label', { 'en-US': 'Compact density', 'zh-CN': '紧凑密度' })
      .extra('description', { 'en-US': 'Fit more conversations into the message list', 'zh-CN': '在邮件列表中显示更多会话' }),
    desktopNotifications: Schema.boolean()
      .default(true)
      .extra('label', { 'en-US': 'Desktop notifications', 'zh-CN': '桌面通知' })
      .extra('description', { 'en-US': 'Show a notification when new mail arrives', 'zh-CN': '收到新邮件时显示桌面通知' }),
  }).extra('flatten', true),
})

export function installCore(ctx: Context): void {
  ctx.client.router.page({
    id: 'mail',
    path: `/:folder(${mailFolderPattern})`,
    name: 'Mail',
    description: 'Fumika Mail',
    icon: 'mail',
    home: '/inbox',
    component: MailListView,
  })
  ctx.client.loader.addEntry('runtime')

  ctx.client.action.register('navigation.back', () => ctx.client.router.router.back())
  ctx.client.action.register('navigation.forward', () => ctx.client.router.router.forward())
  ctx.client.action.register('navigation.reload', {
    shortcut: 'mod+r',
    allowInInput: true,
    run: () => window.location.reload(),
  })

  ctx.client.setting.define({
    id: 'general',
    title: { 'en-US': 'General', 'zh-CN': '通用' },
    description: { 'en-US': 'Language and application defaults.', 'zh-CN': '语言与应用默认设置。' },
    order: 100,
    stateKey: 'app',
    schema: GeneralSettings,
  })

  ctx.client.setting.define({
    id: 'appearance',
    title: { 'en-US': 'Appearance', 'zh-CN': '外观' },
    description: { 'en-US': 'Theme and workspace layout.', 'zh-CN': '主题和工作区布局。' },
    order: 200,
    stateKey: 'app',
    schema: AppearanceSettings,
  })

  ctx.client.setting.define({
    id: 'mail-preferences',
    title: { 'en-US': 'Mail preferences', 'zh-CN': '邮件偏好' },
    description: { 'en-US': 'Message list and notification behavior.', 'zh-CN': '邮件列表和通知行为。' },
    order: 300,
    stateKey: 'app',
    schema: MailPreferences,
  })
}
