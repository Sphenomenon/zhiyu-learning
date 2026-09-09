import type { CourseResource } from '../shared/types.ts'
import { courseIds, requireUser } from './auth.ts'
import { type Env, audit, body, expiry, fail, hash, integer, json, limit, now, randomToken, text } from './http.ts'

export async function redeem(request: Request, env: Env) {
  const user = await requireUser(request, env)
  await limit(env, `redeem:${user.id}`, 20, 600)
  const input = await body(request)
  const code = text(input.code, 100).replace(/[\s-]/g, '').toUpperCase()
  if (!/^ZY[A-F0-9]{32}$/.test(code)) return fail(400, 'REDEMPTION_INVALID')
  const digest = await hash(code)
  const claimed = await env.DB.prepare(`UPDATE redemption_codes SET redeemed_by = ?, redeemed_at = ?
    WHERE code_hash = ? AND redeemed_by IS NULL AND revoked_at IS NULL
    AND (expires_at IS NULL OR expires_at > ?) AND (access_expires_at IS NULL OR access_expires_at > ?)
    RETURNING id`).bind(user.id, now(), digest, now(), now()).first()
  if (claimed) return json({ ok: true, alreadyRedeemed: false, courseIds: await courseIds(env, user.id) })
  const existing = await env.DB.prepare('SELECT redeemed_by FROM redemption_codes WHERE code_hash = ?').bind(digest).first<{ redeemed_by: string | null }>()
  if (existing?.redeemed_by === user.id) return json({ ok: true, alreadyRedeemed: true, courseIds: await courseIds(env, user.id) })
  return fail(400, 'REDEMPTION_INVALID')
}
export async function resources(request: Request, env: Env, id: string) {
  const user = await requireUser(request, env)
  await limit(env, `resources:${user.id}`, 60, 60)
  // Access and the private resource are read in the same query. An admin is not
  // implicitly enrolled; editing uses a separate admin-only endpoint.
  const resource = await env.DB.prepare(`SELECT r.url, r.extraction_code AS extractionCode, r.note, r.version
    FROM course_resources r JOIN entitlements e ON e.course_id = r.course_id
    WHERE r.course_id = ? AND e.user_id = ? AND e.revoked_at IS NULL AND (e.expires_at IS NULL OR e.expires_at > ?)`)
    .bind(id, user.id, now()).first<CourseResource>()
  if (!resource) {
    if (!(await courseIds(env, user.id)).includes(id)) return fail(403, 'COURSE_ACCESS_REQUIRED')
    return fail(404, 'RESOURCE_NOT_READY')
  }
  await env.DB.prepare('INSERT INTO resource_access_logs (user_id, course_id, resource_version, created_at) VALUES (?, ?, ?, ?)')
    .bind(user.id, id, resource.version, now()).run()
  return json({ resource })
}
export async function adminResource(request: Request, env: Env, id: string) {
  const admin = await requireUser(request, env, true)
  if (!(await env.DB.prepare('SELECT id FROM courses WHERE id = ?').bind(id).first())) return fail(404, 'NOT_FOUND')
  if (request.method === 'GET') {
    const resource = await env.DB.prepare('SELECT url, extraction_code AS extractionCode, note, version FROM course_resources WHERE course_id = ?').bind(id).first<CourseResource>()
    return json({ resource })
  }
  const input = await body(request)
  const version = integer(input.version, 0, Number.MAX_SAFE_INTEGER - 1)
  let url: URL
  try { url = new URL(text(input.url, 2000)) } catch { return fail(400, 'INVALID_RESOURCE_URL') }
  if (url.protocol !== 'https:' || url.hostname !== 'pan.baidu.com' || url.port || url.username || url.password || !/^\/s\/[a-zA-Z0-9_-]+$/.test(url.pathname)) return fail(400, 'INVALID_RESOURCE_URL')
  const extractionCode = text(input.extractionCode, 4)
  if (!/^[a-zA-Z0-9]{4}$/.test(extractionCode)) return fail(400, 'INVALID_EXTRACTION_CODE')
  const note = text(input.note ?? '', 2000, true)
  const change = version === 0
    ? env.DB.prepare('INSERT OR IGNORE INTO course_resources (course_id, url, extraction_code, note, updated_at) VALUES (?, ?, ?, ?, ?)').bind(id, url.href, extractionCode, note, now())
    : env.DB.prepare(`UPDATE course_resources SET url = ?, extraction_code = ?, note = ?, version = version + 1, updated_at = ?
        WHERE course_id = ? AND version = ?`).bind(url.href, extractionCode, note, now(), id, version)
  const result = await env.DB.batch([
    change,
    env.DB.prepare(`INSERT INTO audit_logs (actor_id, action, target_id, detail, created_at)
      SELECT ?, 'resource.updated', ?, ?, ? WHERE changes() > 0`).bind(admin.id, id, `version:${version + 1}`, now()),
  ])
  if (!result[0].meta.changes) return fail(409, 'REVISION_CONFLICT')
  return json({ resource: { url: url.href, extractionCode, note, version: version + 1 } })
}
export async function createCode(request: Request, env: Env) {
  const admin = await requireUser(request, env, true)
  await limit(env, `create-code:${admin.id}`, 60, 600)
  const input = await body(request)
  if (!Array.isArray(input.courseIds) || input.courseIds.length < 1 || input.courseIds.length > 30) return fail(400, 'INVALID_INPUT')
  const ids = [...new Set(input.courseIds.map(value => text(value, 64)))]
  for (const id of ids) {
    if (!(await env.DB.prepare('SELECT id FROM courses WHERE id = ?').bind(id).first())) return fail(400, 'COURSE_NOT_FOUND')
  }
  const expiresAt = expiry(input.expiresAt)
  const accessExpiresAt = expiry(input.accessExpiresAt)
  const raw = randomToken().slice(0, 32).toUpperCase()
  const code = `ZY-${raw.match(/.{8}/g)!.join('-')}`
  const id = crypto.randomUUID()
  await env.DB.batch([
    env.DB.prepare('INSERT INTO redemption_codes (id, code_hash, hint, created_by, created_at, expires_at, access_expires_at) VALUES (?, ?, ?, ?, ?, ?, ?)')
      .bind(id, await hash(`ZY${raw}`), `…${raw.slice(-8)}`, admin.id, now(), expiresAt, accessExpiresAt),
    ...ids.map(courseId => env.DB.prepare('INSERT INTO code_courses (code_id, course_id) VALUES (?, ?)').bind(id, courseId)),
    audit(env, admin.id, 'code.created', id),
  ])
  return json({ id, code }, 201)
}
export async function revokeCode(request: Request, env: Env, id: string) {
  const admin = await requireUser(request, env, true)
  const result = await env.DB.batch([
    env.DB.prepare('UPDATE redemption_codes SET revoked_at = ? WHERE id = ? AND redeemed_by IS NULL AND revoked_at IS NULL').bind(now(), id),
    env.DB.prepare(`INSERT INTO audit_logs (actor_id, action, target_id, created_at)
      SELECT ?, 'code.revoked', ?, ? WHERE changes() > 0`).bind(admin.id, id, now()),
  ])
  if (!result[0].meta.changes) return fail(409, 'CODE_NOT_REVOCABLE')
  return json({ ok: true })
}
export async function manageEntitlement(request: Request, env: Env) {
  const admin = await requireUser(request, env, true)
  const input = await body(request)
  const userId = text(input.userId, 64)
  const courseId = text(input.courseId, 64)
  const action = text(input.action, 20)
  const reason = text(input.reason, 500)
  if (!['grant', 'revoke'].includes(action)) return fail(400, 'INVALID_INPUT')
  if (!(await env.DB.prepare('SELECT id FROM users WHERE id = ?').bind(userId).first())) return fail(404, 'NOT_FOUND')
  if (!(await env.DB.prepare('SELECT id FROM courses WHERE id = ?').bind(courseId).first())) return fail(404, 'NOT_FOUND')
  const id = text(input.requestId, 64)
  if (!/^[a-f0-9]{8}-[a-f0-9]{4}-4[a-f0-9]{3}-[89ab][a-f0-9]{3}-[a-f0-9]{12}$/i.test(id)) return fail(400, 'INVALID_INPUT')
  const expiresAt = action === 'grant' ? expiry(input.expiresAt) : null
  const amountCents = action === 'grant' && input.paymentConfirmed === true ? integer(input.amountCents, 1, 100_000_000) : null
  const digest = await hash(JSON.stringify({ userId, courseId, action, reason, expiresAt, amountCents }))
  const existing = async () => env.DB.prepare('SELECT actor_id, payload_hash FROM admin_operations WHERE id = ?').bind(id).first<{ actor_id: string; payload_hash: string }>()
  const replay = (operation: { actor_id: string; payload_hash: string }) => {
    if (operation.actor_id !== admin.id || operation.payload_hash !== digest) return fail(409, 'IDEMPOTENCY_CONFLICT')
    return json({ ok: true, replayed: true })
  }
  const prior = await existing()
  if (prior) return replay(prior)
  const statements: D1PreparedStatement[] = [env.DB.prepare('INSERT INTO admin_operations (id, actor_id, payload_hash, created_at) VALUES (?, ?, ?, ?)').bind(id, admin.id, digest, now())]
  if (action === 'grant') {
    statements.push(env.DB.prepare(`INSERT INTO entitlements (user_id, course_id, source, source_id, granted_at, expires_at)
      VALUES (?, ?, 'manual', ?, ?, ?) ON CONFLICT(user_id, course_id) DO UPDATE SET
      source = 'manual', source_id = excluded.source_id, granted_at = excluded.granted_at, expires_at = excluded.expires_at, revoked_at = NULL`)
      .bind(userId, courseId, id, now(), expiresAt))
    if (amountCents !== null) {
      statements.push(env.DB.prepare('INSERT INTO manual_orders (id, user_id, course_id, amount_cents, note, recorded_by, created_at) VALUES (?, ?, ?, ?, ?, ?, ?)')
        .bind(id, userId, courseId, amountCents, reason, admin.id, now()))
    }
  } else {
    statements.push(env.DB.prepare('UPDATE entitlements SET revoked_at = ? WHERE user_id = ? AND course_id = ?').bind(now(), userId, courseId))
  }
  statements.push(audit(env, admin.id, `entitlement.${action}`, `${userId}:${courseId}`, reason))
  try { await env.DB.batch(statements) }
  catch (error) {
    // A concurrent retry rolls back its entire batch at the unique operation ID.
    if (error instanceof Error && error.message.includes('UNIQUE constraint')) {
      const completed = await existing()
      if (completed) return replay(completed)
    }
    throw error
  }
  return json({ ok: true })
}
