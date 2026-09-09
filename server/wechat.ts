import { currentUser, requireUser, sessionCookie, tokenHash } from './auth.ts'
import { type Env, body, fail, hash, json, limit, now, randomToken, readBytes, text } from './http.ts'
import { wechatConfig } from './wechat-config.ts'
import { readWechatEvent, verifyWechatServer } from './wechat-webhook.ts'

const qrAge = 180
const browserCookieName = '__Host-zhiyu_wechat_qr'
const browserCookie = (token: string, age: number) => `${browserCookieName}=${token}; Path=/; HttpOnly; Secure; SameSite=Lax; Max-Age=${age}`
type Config = NonNullable<ReturnType<typeof wechatConfig>>
type Challenge = {
  id: string; intent: 'login' | 'bind'; user_id: string | null; session_hash: string | null
  subject: string | null; expires_at: number; consumed_at: number | null
}
function browserToken(request: Request) {
  const value = request.headers.get('cookie')?.split(';').map(part => part.trim())
    .find(part => part.startsWith(`${browserCookieName}=`))?.slice(browserCookieName.length + 1) || ''
  return /^[a-f0-9]{64}$/.test(value) ? value : null
}
async function providerPost(url: string, data: unknown) {
  try {
    const response = await fetch(url, { method: 'POST', headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify(data), redirect: 'error', signal: AbortSignal.timeout(8000) })
    if (!response.ok) return fail(502, 'WECHAT_UNAVAILABLE')
    const result: unknown = JSON.parse(new TextDecoder().decode(await readBytes(response, 16_000)))
    if (!result || typeof result !== 'object' || Array.isArray(result)) return fail(502, 'WECHAT_UNAVAILABLE')
    return result as Record<string, unknown>
  } catch { return fail(502, 'WECHAT_UNAVAILABLE') }
}
async function accessToken(env: Env, config: Config) {
  const existing = await env.DB.prepare('SELECT access_token FROM wechat_api_tokens WHERE app_id = ? AND expires_at > ?')
    .bind(config.appId, now()).first<{ access_token: string }>()
  if (existing) return existing.access_token
  // stable_token preserves an existing credential during concurrent refreshes.
  // D1 shares this server-only cache across Workers isolates.
  const result = await providerPost('https://api.weixin.qq.com/cgi-bin/stable_token', {
    grant_type: 'client_credential', appid: config.appId, secret: config.secret, force_refresh: false,
  })
  if ((result.errcode !== undefined && result.errcode !== 0) || typeof result.access_token !== 'string' ||
    !result.access_token || result.access_token.length > 4096 || !Number.isSafeInteger(result.expires_in) ||
    Number(result.expires_in) <= 120 || Number(result.expires_in) > 86400) return fail(502, 'WECHAT_UNAVAILABLE')
  await env.DB.prepare(`INSERT INTO wechat_api_tokens (app_id, access_token, expires_at) VALUES (?, ?, ?)
    ON CONFLICT(app_id) DO UPDATE SET access_token = excluded.access_token, expires_at = excluded.expires_at`)
    .bind(config.appId, result.access_token, now() + Number(result.expires_in) - 120).run()
  return result.access_token
}
async function createQr(env: Env, config: Config, scene: string) {
  for (let attempt = 0; attempt < 2; attempt++) {
    const token = await accessToken(env, config)
    const url = new URL('https://api.weixin.qq.com/cgi-bin/qrcode/create')
    url.searchParams.set('access_token', token)
    const result = await providerPost(url.href, { expire_seconds: qrAge, action_name: 'QR_STR_SCENE', action_info: { scene: { scene_str: scene } } })
    if (attempt === 0 && [40014, 42001].includes(Number(result.errcode))) {
      // Do not remove a newer token that another instance just refreshed.
      await env.DB.prepare('DELETE FROM wechat_api_tokens WHERE app_id = ? AND access_token = ?').bind(config.appId, token).run()
      continue
    }
    if ((result.errcode !== undefined && result.errcode !== 0) || typeof result.ticket !== 'string' ||
      !result.ticket || result.ticket.length > 2048 || !Number.isSafeInteger(result.expire_seconds) ||
      Number(result.expire_seconds) <= 0) return fail(502, 'WECHAT_UNAVAILABLE')
    return { ticket: result.ticket, age: Math.min(qrAge, Number(result.expire_seconds)) }
  }
  return fail(502, 'WECHAT_UNAVAILABLE')
}

export async function startWechatQr(request: Request, env: Env) {
  const config = wechatConfig(request, env)
  if (!config) return fail(503, 'AUTH_NOT_CONFIGURED')
  const input = await body(request)
  if (input.intent !== 'login' && input.intent !== 'bind') return fail(400, 'INVALID_INPUT')
  const user = input.intent === 'bind' ? await requireUser(request, env) : await currentUser(request, env)
  if (input.intent === 'login' && user) return fail(409, 'ACCOUNT_ALREADY_SIGNED_IN')
  if (user && await env.DB.prepare(`SELECT 1 FROM auth_identities WHERE provider = 'wechat'
    AND user_id = ? AND subject LIKE ?`).bind(user.id, `${config.appId}:%`).first()) return fail(409, 'WECHAT_ALREADY_LINKED')
  await limit(env, `wechat-start-ip:${await hash(request.headers.get('cf-connecting-ip') || 'unknown')}`, 20, 600)
  const id = randomToken()
  const scene = randomToken()
  const browser = randomToken()
  const stamp = now()
  const qr = await createQr(env, config, scene)
  const expiresAt = stamp + qr.age
  const previous = browserToken(request)
  await env.DB.batch([
    env.DB.prepare('DELETE FROM wechat_qr_logins WHERE expires_at <= ?').bind(now()),
    env.DB.prepare('DELETE FROM sessions WHERE expires_at <= ?').bind(now()),
    env.DB.prepare('DELETE FROM rate_limits WHERE reset_at < ?').bind(now() - 3600),
    env.DB.prepare(`UPDATE wechat_qr_logins SET expires_at = ? WHERE browser_hash = ? AND app_id = ? AND origin = ? AND consumed_at IS NULL`)
      .bind(now(), previous ? await hash(previous) : '', config.appId, config.origin),
    env.DB.prepare(`INSERT INTO wechat_qr_logins
      (id, scene_hash, ticket_hash, browser_hash, app_id, origin, intent, user_id, session_hash, created_at, expires_at)
      VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?)`).bind(id, await hash(scene), await hash(qr.ticket), await hash(browser),
      config.appId, config.origin, input.intent, user?.id || null, user ? await tokenHash(request) : null, stamp, expiresAt),
  ])
  const image = new URL('https://mp.weixin.qq.com/cgi-bin/showqrcode')
  image.searchParams.set('ticket', qr.ticket)
  return json({ challengeId: id, qrCodeUrl: image.href, expiresAt }, 200, { 'Set-Cookie': browserCookie(browser, qrAge) })
}
function finished(status: 'authenticated' | 'linked' | 'expired', session?: string) {
  const headers = new Headers()
  // Let the short-lived QR cookie expire naturally. A delayed response from an
  // old poll must not delete the cookie set by a newly generated QR code.
  if (session) headers.append('Set-Cookie', session)
  return json({ status }, 200, headers)
}
async function bindIdentity(request: Request, env: Env, challenge: Challenge, appId: string) {
  // Recheck the original session in the transaction after consuming the QR.
  await env.DB.batch([
    env.DB.prepare(`INSERT OR IGNORE INTO auth_identities (provider, subject, user_id)
      SELECT 'wechat', ?, u.id FROM sessions s JOIN users u ON u.id = s.user_id
      WHERE s.token_hash = ? AND u.id = ? AND s.expires_at > ? AND u.status = 'active'
      AND NOT EXISTS (SELECT 1 FROM auth_identities WHERE provider = 'wechat' AND user_id = u.id AND subject LIKE ?)`)
      .bind(challenge.subject, challenge.session_hash, challenge.user_id, now(), `${appId}:%`),
    env.DB.prepare(`INSERT INTO audit_logs (actor_id, action, target_id, detail, created_at)
      SELECT ?, 'identity.wechat.bound', ?, ?, ? WHERE changes() = 1`)
      .bind(challenge.user_id, challenge.user_id, appId, now()),
  ])
  if ((await currentUser(request, env))?.id !== challenge.user_id) return fail(401, 'WECHAT_SESSION_CHANGED')
  const owner = await env.DB.prepare(`SELECT user_id FROM auth_identities WHERE provider = 'wechat' AND subject = ?`)
    .bind(challenge.subject).first<{ user_id: string }>()
  if (owner?.user_id === challenge.user_id) return finished('linked')
  if (owner) return fail(409, 'WECHAT_IDENTITY_CONFLICT')
  return fail(409, 'WECHAT_ALREADY_LINKED')
}
async function loginIdentity(request: Request, env: Env, subject: string) {
  const candidateId = crypto.randomUUID()
  const token = randomToken()
  const digest = await hash(token)
  const stamp = now()
  await env.DB.batch([
    env.DB.prepare(`INSERT INTO users (id, display_name, role, created_at)
      SELECT ?, ?, 'student', ? WHERE NOT EXISTS (SELECT 1 FROM auth_identities WHERE provider = 'wechat' AND subject = ?)`)
      .bind(candidateId, `微信学员 ${candidateId.slice(0, 8)}`, stamp, subject),
    env.DB.prepare(`INSERT OR IGNORE INTO auth_identities (provider, subject, user_id)
      SELECT 'wechat', ?, id FROM users WHERE id = ?`).bind(subject, candidateId),
    env.DB.prepare(`INSERT INTO sessions (token_hash, user_id, expires_at, created_at)
      SELECT ?, u.id, ? + CASE WHEN u.role = 'admin' THEN 28800 ELSE 604800 END, ?
      FROM auth_identities i JOIN users u ON u.id = i.user_id
      WHERE i.provider = 'wechat' AND i.subject = ? AND u.status = 'active'`).bind(digest, stamp, stamp, subject),
  ])
  const session = await env.DB.prepare('SELECT expires_at FROM sessions WHERE token_hash = ?').bind(digest).first<{ expires_at: number }>()
  if (!session) return fail(403, 'ACCOUNT_DISABLED')
  return finished('authenticated', sessionCookie(request, token, Math.max(0, session.expires_at - now())))
}

export async function pollWechatQr(request: Request, env: Env) {
  const config = wechatConfig(request, env)
  if (!config) return fail(503, 'AUTH_NOT_CONFIGURED')
  const input = await body(request)
  const id = text(input.challengeId, 64)
  const browser = browserToken(request)
  if (!/^[a-f0-9]{64}$/.test(id) || !browser) return fail(400, 'WECHAT_QR_INVALID')
  await limit(env, `wechat-poll:${await hash(browser)}`, 150, 300)
  const browserHash = await hash(browser)
  const challenge = await env.DB.prepare(`SELECT id, intent, user_id, session_hash, subject, expires_at, consumed_at
    FROM wechat_qr_logins WHERE id = ? AND browser_hash = ? AND app_id = ? AND origin = ?`)
    .bind(id, browserHash, config.appId, config.origin).first<Challenge>()
  if (!challenge) return fail(400, 'WECHAT_QR_INVALID')
  if (challenge.expires_at <= now() || challenge.consumed_at !== null) return finished('expired')
  if (challenge.intent === 'bind') {
    if (await tokenHash(request) !== challenge.session_hash || (await currentUser(request, env))?.id !== challenge.user_id) return fail(401, 'WECHAT_SESSION_CHANGED')
  } else if (await currentUser(request, env)) return fail(409, 'ACCOUNT_ALREADY_SIGNED_IN')
  if (!challenge.subject) return json({ status: 'waiting', expiresAt: challenge.expires_at, retryAfter: 2.5 })
  const consumed = await env.DB.prepare(`UPDATE wechat_qr_logins SET consumed_at = ? WHERE id = ? AND browser_hash = ?
    AND consumed_at IS NULL AND subject IS NOT NULL AND expires_at > ? RETURNING id`)
    .bind(now(), id, browserHash, now()).first()
  if (!consumed) return finished('expired')
  return challenge.intent === 'bind' ? bindIdentity(request, env, challenge, config.appId) : loginIdentity(request, env, challenge.subject)
}

export async function wechatEvents(request: Request, env: Env) {
  const config = wechatConfig(request, env)
  if (!config) return fail(503, 'AUTH_NOT_CONFIGURED')
  if (request.method === 'GET') return verifyWechatServer(request, config)
  const event = await readWechatEvent(request, config)
  if (event.MsgType === 'event' && (event.Event === 'SCAN' || event.Event === 'subscribe')) {
    const scene = event.Event === 'subscribe' && event.EventKey?.startsWith('qrscene_') ? event.EventKey.slice(8) : event.Event === 'SCAN' ? event.EventKey : ''
    // Ordinary follows and unrelated events have no login scene.
    if (scene && /^[a-f0-9]{64}$/.test(scene)) {
      if (!/^[a-zA-Z0-9_-]{1,128}$/.test(event.FromUserName || '') || !event.Ticket || event.Ticket.length > 2048 ||
        !/^\d{10}$/.test(event.CreateTime || '')) return fail(400, 'WECHAT_MESSAGE_INVALID')
      const eventTime = Number(event.CreateTime)
      if (Math.abs(now() - eventTime) <= 300) {
        // First valid scan owns the challenge. Retries and later scans cannot
        // overwrite it, and no site session is sent to WeChat's server.
        await env.DB.prepare(`UPDATE wechat_qr_logins SET subject = ?, scanned_at = ?
          WHERE scene_hash = ? AND ticket_hash = ? AND app_id = ? AND origin = ?
          AND expires_at > ? AND created_at <= ? AND subject IS NULL AND consumed_at IS NULL`)
          .bind(`${config.appId}:${event.FromUserName}`, now(), await hash(scene), await hash(event.Ticket), config.appId,
            config.origin, now(), eventTime + 30).run()
      }
    }
  }
  return new Response('success', { headers: { 'Content-Type': 'text/plain; charset=utf-8', 'Cache-Control': 'no-store' } })
}
