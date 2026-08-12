import type { MailProvider } from '@fumika/state'
import { Buffer } from 'node:buffer'
import { randomBytes } from 'node:crypto'
import { createServer } from 'node:http'
import { URL, URLSearchParams } from 'node:url'
import { net, shell } from 'electron'
import OAUTH_CALLBACK_SUCCESS_HTML from './oauth-callback.html?raw'

export interface OAuthProviderConfig {
  provider: 'google' | 'outlook'
  clientId: string
  clientSecret?: string
  authorizeUrl: string
  tokenUrl: string
  userInfoUrl: string
  scopes: string[]
  imapHost: string
  smtpHost: string
  extraAuthorizeParams?: Record<string, string>
}

export interface OAuthAuthorization {
  accessToken: string
  refreshToken: string
  expiresAt: number
  tokenType: string
  grantedScopes: string[]
}

export interface OAuthUserInfo {
  sub?: string
  email?: string
  name?: string
  preferred_username?: string
}

interface OAuthTokenResponse {
  access_token?: string
  refresh_token?: string
  expires_in?: number
  token_type?: string
  scope?: string
  error?: string
  error_description?: string
}

const GOOGLE_SCOPES = [
  'openid',
  'email',
  'profile',
  'https://mail.google.com/',
]

const OUTLOOK_SCOPES = [
  'openid',
  'email',
  'profile',
  'offline_access',
  'https://outlook.office.com/IMAP.AccessAsUser.All',
  'https://outlook.office.com/SMTP.Send',
]

export function createOAuthProviders(): Record<'google' | 'outlook', OAuthProviderConfig | undefined> {
  return {
    google: createGoogleConfig(),
    outlook: createOutlookConfig(),
  }
}

export async function authorizeWithBrowser(config: OAuthProviderConfig): Promise<OAuthAuthorization> {
  const state = randomBase64Url(32)
  const codeVerifier = randomBase64Url(64)
  const codeChallenge = await sha256Base64Url(codeVerifier)
  const callback = await createOAuthCallback(state)

  try {
    const authorizeUrl = new URL(config.authorizeUrl)
    authorizeUrl.search = new URLSearchParams({
      client_id: config.clientId,
      redirect_uri: callback.redirectUri,
      response_type: 'code',
      scope: config.scopes.join(' '),
      state,
      code_challenge: codeChallenge,
      code_challenge_method: 'S256',
      ...config.extraAuthorizeParams,
    }).toString()

    await shell.openExternal(authorizeUrl.toString())
    const code = await callback.code
    const response = await fetchOAuth(config.provider, 'token exchange', config.tokenUrl, {
      method: 'POST',
      headers: { 'Content-Type': 'application/x-www-form-urlencoded' },
      body: new URLSearchParams({
        client_id: config.clientId,
        ...(config.clientSecret && { client_secret: config.clientSecret }),
        redirect_uri: callback.redirectUri,
        grant_type: 'authorization_code',
        code,
        code_verifier: codeVerifier,
        scope: config.scopes.join(' '),
      }),
    })
    const token = await response.json() as OAuthTokenResponse
    if (!response.ok || token.error || !token.access_token)
      throw new Error(token.error_description || token.error || `${providerName(config.provider)} token exchange failed.`)
    if (!token.refresh_token)
      throw new Error(`${providerName(config.provider)} did not issue a refresh token. Revoke the existing grant and try again.`)

    return {
      accessToken: token.access_token,
      refreshToken: token.refresh_token,
      expiresAt: Date.now() + Math.max(0, token.expires_in ?? 0) * 1000,
      tokenType: token.token_type ?? 'Bearer',
      grantedScopes: token.scope?.split(/\s+/).filter(Boolean) ?? config.scopes,
    }
  }
  finally {
    callback.close()
  }
}

export async function fetchUserInfo(config: OAuthProviderConfig, accessToken: string): Promise<OAuthUserInfo> {
  const response = await fetchOAuth(config.provider, 'account lookup', config.userInfoUrl, {
    headers: { Authorization: `Bearer ${accessToken}` },
  })
  const data = await response.json() as OAuthUserInfo & { error?: { message?: string } | string }
  if (!response.ok)
    throw new Error(typeof data.error === 'string' ? data.error : data.error?.message || 'Failed to load mailbox identity.')
  return data
}

export function providerName(provider: Exclude<MailProvider, 'imap-smtp'>): string {
  return provider === 'google' ? 'Google' : 'Outlook'
}

function createGoogleConfig(): OAuthProviderConfig | undefined {
  const clientId = __FUMIKA_GOOGLE_CLIENT_ID__.trim()
  if (!clientId)
    return undefined
  const clientSecret = __FUMIKA_GOOGLE_CLIENT_SECRET__.trim()
  if (!clientSecret)
    return undefined
  return {
    provider: 'google',
    clientId,
    clientSecret,
    authorizeUrl: 'https://accounts.google.com/o/oauth2/v2/auth',
    tokenUrl: 'https://oauth2.googleapis.com/token',
    userInfoUrl: 'https://openidconnect.googleapis.com/v1/userinfo',
    scopes: GOOGLE_SCOPES,
    imapHost: 'imap.gmail.com',
    smtpHost: 'smtp.gmail.com',
    extraAuthorizeParams: {
      access_type: 'offline',
      prompt: 'consent',
    },
  }
}

function createOutlookConfig(): OAuthProviderConfig | undefined {
  const clientId = __FUMIKA_OUTLOOK_CLIENT_ID__.trim()
  if (!clientId)
    return undefined
  const tenant = __FUMIKA_OUTLOOK_TENANT__.trim() || 'common'
  return {
    provider: 'outlook',
    clientId,
    authorizeUrl: `https://login.microsoftonline.com/${encodeURIComponent(tenant)}/oauth2/v2.0/authorize`,
    tokenUrl: `https://login.microsoftonline.com/${encodeURIComponent(tenant)}/oauth2/v2.0/token`,
    userInfoUrl: 'https://graph.microsoft.com/oidc/userinfo',
    scopes: OUTLOOK_SCOPES,
    imapHost: 'outlook.office365.com',
    smtpHost: 'smtp.office365.com',
    extraAuthorizeParams: {
      prompt: 'select_account',
    },
  }
}

async function fetchOAuth(provider: OAuthProviderConfig['provider'], operation: string, input: string, init?: RequestInit): Promise<Response> {
  try {
    return await net.fetch(input, init)
  }
  catch (error) {
    const detail = error instanceof Error ? error.message : String(error)
    throw new Error(`${providerName(provider)} OAuth ${operation} failed: ${detail}`, { cause: error })
  }
}

async function createOAuthCallback(expectedState: string): Promise<{
  redirectUri: string
  code: Promise<string>
  close: () => void
}> {
  let settle!: (code: string) => void
  let reject!: (error: Error) => void
  const code = new Promise<string>((resolve, rejectPromise) => {
    settle = resolve
    reject = rejectPromise
  })

  const server = createServer((request, response) => {
    try {
      const url = new URL(request.url ?? '/', 'http://127.0.0.1')
      if (url.pathname !== '/oauth/callback') {
        response.writeHead(404).end('Not found')
        return
      }
      if (url.searchParams.get('state') !== expectedState)
        throw new Error('OAuth state validation failed.')
      const error = url.searchParams.get('error')
      if (error)
        throw new Error(url.searchParams.get('error_description') || error)
      const authorizationCode = url.searchParams.get('code')
      if (!authorizationCode)
        throw new Error('OAuth callback did not include an authorization code.')

      response.writeHead(200, { 'Content-Type': 'text/html; charset=utf-8' })
      response.end(OAUTH_CALLBACK_SUCCESS_HTML)
      settle(authorizationCode)
    }
    catch (error) {
      response.writeHead(400, { 'Content-Type': 'text/plain; charset=utf-8' })
      response.end('Mailbox authorization failed. Return to Fumika for details.')
      reject(error instanceof Error ? error : new Error(String(error)))
    }
    finally {
      server.close()
    }
  })

  server.on('error', error => reject(error))
  server.listen(0, '127.0.0.1')
  await new Promise<void>((resolve, rejectListen) => {
    server.once('listening', resolve)
    server.once('error', rejectListen)
  })
  const address = server.address()
  if (!address || typeof address === 'string') {
    server.close()
    throw new Error('Failed to open the local OAuth callback.')
  }

  const timeout = setTimeout(() => {
    reject(new Error('Mailbox authorization timed out.'))
    server.close()
  }, 5 * 60_000)

  return {
    redirectUri: `http://127.0.0.1:${address.port}/oauth/callback`,
    code: code.finally(() => clearTimeout(timeout)),
    close: () => {
      clearTimeout(timeout)
      server.close()
    },
  }
}

function randomBase64Url(size: number): string {
  return randomBytes(size).toString('base64url')
}

async function sha256Base64Url(value: string): Promise<string> {
  const digest = await crypto.subtle.digest('SHA-256', new TextEncoder().encode(value))
  return Buffer.from(digest).toString('base64url')
}
