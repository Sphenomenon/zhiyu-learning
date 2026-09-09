import type { User } from '../shared/types.ts'
import { type Env, body, fail, hash, json, limit, localAuth, now, randomToken, text } from './http.ts'
import { wechatConfig } from './wechat-config.ts'

function cookieName(request: Request) {
  return new URL(request.url).protocol === 'https:' ? '__Host-zhiyu_session' : 'zhiyu_session'
}
export function sessionCookie(request: Request, token: string, age: number) {
  return `${cookieName(request)}=${token}; Path=/; HttpOnly; SameSite=Lax; Max-Age=${age}${new URL(request.url).protocol === 'https:' ? '; Secure' : ''}`
}
export async function tokenHash(request: Request) {
  const raw = request.headers.get('cookie')?.split(';').map(s => s.trim()).find(s => s.startsWith(`${cookieName(request)}=`))?.split('=')[1]
  return raw && /^[a-f0-9]{64}$/.test(raw) ? hash(raw) : null
}
export async function currentUser(request: Request, env: Env): Promise<User | null> {
  const token = await tokenHash(request)
  if (!token) return null
  return env.DB.prepare(`SELECT u.id, u.display_name AS displayName, u.role FROM sessions s
    JOIN users u ON u.id = s.user_id WHERE s.token_hash = ? AND s.expires_at > ? AND u.status = 'active'`)
    .bind(token, now()).first<User>()
}
export async function requireUser(request: Request, env: Env, admin = false) {
  const user = await currentUser(request, env)
  if (!user) return fail(401, 'LOGIN_REQUIRED')
  if (admin && user.role !== 'admin') return fail(403, 'ADMIN_REQUIRED')
  return user
}
export async function courseIds(env: Env, userId: string) {
  const rows = await env.DB.prepare(`SELECT course_id FROM entitlements
    WHERE user_id = ? AND revoked_at IS NULL AND (expires_at IS NULL OR expires_at > ?) ORDER BY course_id`)
    .bind(userId, now()).all<{ course_id: string }>()
  return rows.results.map(row => row.course_id)
}
export async function sessionState(request: Request, env: Env) {
  const user = await currentUser(request, env)
  const config = wechatConfig(request, env)
  const linked = config && user ? Boolean(await env.DB.prepare(`SELECT 1 FROM auth_identities
    WHERE provider = 'wechat' AND user_id = ? AND subject LIKE ?`).bind(user.id, `${config.appId}:%`).first()) : false
  return json({ user, courseIds: user ? await courseIds(env, user.id) : [],
    authMode: config ? 'wechat' : localAuth(request, env) ? 'local' : 'unavailable',
    ...(config ? { wechat: { linked } } : {}),
  })
}
export async function requestCode(request: Request, env: Env) {
  if (!localAuth(request, env)) return fail(503, 'AUTH_NOT_CONFIGURED')
  const input = await body(request)
  const email = text(input.email, 180).toLowerCase()
  if (!/^[a-z0-9.!#$%&'*+/=?^_`{|}~-]+@[a-z0-9.-]+\.[a-z]{2,}$/i.test(email)) return fail(400, 'INVALID_EMAIL')
  const fingerprint = await hash(request.headers.get('cf-connecting-ip') || 'loopback')
  await limit(env, `auth-request-ip:${fingerprint}`, 30, 600)
  await limit(env, `auth-request-subject:${await hash(email)}`, 1, 30)
  const id = randomToken()
  const code = String(crypto.getRandomValues(new Uint32Array(1))[0] % 1_000_000).padStart(6, '0')
  await env.DB.batch([
    env.DB.prepare('DELETE FROM verification_challenges WHERE expires_at < ?').bind(now() - 3600),
    env.DB.prepare('DELETE FROM sessions WHERE expires_at < ?').bind(now()),
    env.DB.prepare('DELETE FROM rate_limits WHERE reset_at < ?').bind(now() - 3600),
    env.DB.prepare('INSERT INTO verification_challenges (id, subject, code_hash, expires_at) VALUES (?, ?, ?, ?)')
      .bind(id, email, await hash(`${id}:${code}`), now() + 300),
  ])
  // This endpoint is a development adapter, not an email/SMS sender. Both the
  // loopback HTTP check and an explicit server setting are required to expose it.
  return json({ challengeId: id, expiresIn: 300, retryAfter: 30, developmentCode: code, delivery: 'local-only' })
}
export async function verifyCode(request: Request, env: Env) {
  if (!localAuth(request, env)) return fail(503, 'AUTH_NOT_CONFIGURED')
  const input = await body(request)
  const id = text(input.challengeId, 64)
  const code = text(input.code, 6)
  await limit(env, `auth-verify-ip:${await hash(request.headers.get('cf-connecting-ip') || 'loopback')}`, 60, 600)
  if (!/^[a-f0-9]{64}$/.test(id) || !/^\d{6}$/.test(code)) return fail(400, 'INVALID_CODE')
  const attempt = await env.DB.prepare(`UPDATE verification_challenges SET attempts = attempts + 1
    WHERE id = ? AND consumed_at IS NULL AND expires_at > ? AND attempts < 5 RETURNING id`)
    .bind(id, now()).first()
  if (!attempt) return fail(400, 'INVALID_CODE')
  const challenge = await env.DB.prepare(`UPDATE verification_challenges SET consumed_at = ?
    WHERE id = ? AND code_hash = ? AND consumed_at IS NULL AND expires_at > ? RETURNING subject`)
    .bind(now(), id, await hash(`${id}:${code}`), now()).first<{ subject: string }>()
  if (!challenge) return fail(400, 'INVALID_CODE')

  const candidateId = crypto.randomUUID()
  const role = env.LOCAL_ADMIN_EMAIL?.trim().toLowerCase() === challenge.subject ? 'admin' : 'student'
  const token = randomToken()
  const tokenDigest = await hash(token)
  const age = role === 'admin' ? 8 * 3600 : 7 * 86400
  // Unique identities + one batch prevent two simultaneous first logins from
  // creating two owners of the same identity. No client-supplied role is read.
  await env.DB.batch([
    env.DB.prepare(`INSERT INTO users (id, display_name, role, created_at)
      SELECT ?, ?, ?, ? WHERE NOT EXISTS (SELECT 1 FROM auth_identities WHERE provider = 'local' AND subject = ?)`)
      .bind(candidateId, challenge.subject.split('@')[0].slice(0, 40), role, now(), challenge.subject),
    env.DB.prepare(`INSERT OR IGNORE INTO auth_identities (provider, subject, user_id)
      SELECT 'local', ?, id FROM users WHERE id = ?`).bind(challenge.subject, candidateId),
    env.DB.prepare(`INSERT INTO sessions (token_hash, user_id, expires_at, created_at)
      SELECT ?, u.id, ?, ? FROM auth_identities i JOIN users u ON u.id = i.user_id
      WHERE i.provider = 'local' AND i.subject = ? AND u.status = 'active'`)
      .bind(tokenDigest, now() + age, now(), challenge.subject),
  ])
  const session = await env.DB.prepare('SELECT user_id FROM sessions WHERE token_hash = ?').bind(tokenDigest).first()
  if (!session) return fail(403, 'ACCOUNT_DISABLED')
  return json({ ok: true }, 200, { 'Set-Cookie': sessionCookie(request, token, age) })
}
export async function logout(request: Request, env: Env) {
  const digest = await tokenHash(request)
  if (digest) await env.DB.prepare('DELETE FROM sessions WHERE token_hash = ?').bind(digest).run()
  return json({ ok: true }, 200, { 'Set-Cookie': sessionCookie(request, '', 0) })
}
