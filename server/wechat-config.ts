import type { Env } from './http.ts'

export function wechatConfig(request: Request, env: Env) {
  if (env.AUTH_MODE !== 'wechat' || !/^wx[a-f0-9]{16}$/i.test(env.WECHAT_APP_ID || '') ||
    !env.WECHAT_APP_SECRET || env.WECHAT_APP_SECRET.length > 256 || /\s/.test(env.WECHAT_APP_SECRET) ||
    !/^[a-zA-Z0-9]{3,32}$/.test(env.WECHAT_WEBHOOK_TOKEN || '') ||
    !/^[a-zA-Z0-9+/]{43}$/.test(env.WECHAT_ENCODING_AES_KEY || '')) return null
  try {
    const callback = new URL(env.WECHAT_SERVER_URL || '')
    if (callback.protocol !== 'https:' || callback.username || callback.password || callback.search || callback.hash ||
      callback.port || callback.pathname !== '/api/auth/wechat/events' || callback.origin !== new URL(request.url).origin ||
      ['localhost', '127.0.0.1', '[::1]'].includes(callback.hostname)) return null
    return { appId: env.WECHAT_APP_ID!, secret: env.WECHAT_APP_SECRET, serverUrl: callback.href, origin: callback.origin,
      token: env.WECHAT_WEBHOOK_TOKEN!, encodingAesKey: env.WECHAT_ENCODING_AES_KEY! }
  } catch { return null }
}
