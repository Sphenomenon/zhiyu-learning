export type Env = { DB: D1Database; AUTH_MODE?: string; LOCAL_ADMIN_EMAIL?: string }

export class ApiError extends Error {
  status: number
  code: string
  constructor(status: number, code: string) {
    super(code)
    this.status = status
    this.code = code
  }
}
export const fail = (status: number, code: string): never => { throw new ApiError(status, code) }
export const now = () => Math.floor(Date.now() / 1000)
export const randomToken = () => Array.from(crypto.getRandomValues(new Uint8Array(32)), b => b.toString(16).padStart(2, '0')).join('')
export async function hash(value: string) {
  return Array.from(new Uint8Array(await crypto.subtle.digest('SHA-256', new TextEncoder().encode(value))), b => b.toString(16).padStart(2, '0')).join('')
}
export function json(data: unknown, status = 200, extra?: HeadersInit) {
  const headers = new Headers(extra)
  headers.set('Content-Type', 'application/json; charset=utf-8')
  headers.set('Cache-Control', 'no-store')
  headers.set('X-Content-Type-Options', 'nosniff')
  headers.set('Referrer-Policy', 'no-referrer')
  headers.set('Content-Security-Policy', "default-src 'none'; frame-ancestors 'none'")
  headers.set('Vary', 'Cookie')
  return new Response(JSON.stringify(data), { status, headers })
}
export async function body(request: Request): Promise<Record<string, unknown>> {
  if (!request.headers.get('content-type')?.startsWith('application/json')) fail(415, 'JSON_REQUIRED')
  // Bound the actual stream, not just the untrusted Content-Length header.
  const reader = request.body?.getReader()
  if (!reader) return fail(400, 'INVALID_INPUT')
  const chunks: Uint8Array[] = []
  let size = 0
  while (true) {
    const { done, value } = await reader.read()
    if (done) break
    size += value.byteLength
    if (size > 48_000) { await reader.cancel(); return fail(413, 'BODY_TOO_LARGE') }
    chunks.push(value)
  }
  const bytes = new Uint8Array(size)
  let offset = 0
  for (const chunk of chunks) { bytes.set(chunk, offset); offset += chunk.length }
  let parsed: unknown
  try { parsed = JSON.parse(new TextDecoder().decode(bytes)) } catch { return fail(400, 'INVALID_INPUT') }
  if (!parsed || typeof parsed !== 'object' || Array.isArray(parsed)) return fail(400, 'INVALID_INPUT')
  return parsed as Record<string, unknown>
}
export function text(value: unknown, max = 200, allowEmpty = false) {
  if (typeof value !== 'string' || value.length > max || (!allowEmpty && !value.trim())) return fail(400, 'INVALID_INPUT')
  return value.trim()
}
export function integer(value: unknown, min: number, max: number) {
  if (!Number.isSafeInteger(value) || Number(value) < min || Number(value) > max) return fail(400, 'INVALID_INPUT')
  return Number(value)
}
export function expiry(value: unknown) {
  return value == null || value === '' ? null : integer(value, now() + 60, now() + 10 * 365 * 86400)
}
export function checkOrigin(request: Request) {
  if (['GET', 'HEAD', 'OPTIONS'].includes(request.method)) return
  if (request.headers.get('origin') !== new URL(request.url).origin) fail(403, 'ORIGIN_DENIED')
  if (request.headers.get('sec-fetch-site') === 'cross-site') fail(403, 'ORIGIN_DENIED')
}
export function localAuth(request: Request, env: Env) {
  const url = new URL(request.url)
  return env.AUTH_MODE === 'local' && url.protocol === 'http:' && ['localhost', '127.0.0.1', '[::1]'].includes(url.hostname)
}
export async function limit(env: Env, key: string, maximum: number, seconds: number) {
  const stamp = now()
  const row = await env.DB.prepare(`INSERT INTO rate_limits (key, hits, reset_at) VALUES (?, 1, ?)
    ON CONFLICT(key) DO UPDATE SET hits = CASE WHEN reset_at <= ? THEN 1 ELSE hits + 1 END,
    reset_at = CASE WHEN reset_at <= ? THEN excluded.reset_at ELSE reset_at END RETURNING hits`)
    .bind(key, stamp + seconds, stamp, stamp).first<{ hits: number }>()
  if (!row || row.hits > maximum) fail(429, 'RATE_LIMITED')
}
export function audit(env: Env, actor: string, action: string, target: string, detail = '') {
  return env.DB.prepare('INSERT INTO audit_logs (actor_id, action, target_id, detail, created_at) VALUES (?, ?, ?, ?, ?)')
    .bind(actor, action, target, detail, now())
}
