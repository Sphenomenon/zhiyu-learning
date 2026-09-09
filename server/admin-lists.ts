import type { ManualOrder, RedemptionCode, Student } from '../shared/types.ts'
import { requireUser } from './auth.ts'
import { type Env, fail, integer, json, now, text } from './http.ts'

function listQuery(request: Request, filterName: string, filters: string[]) {
  const params = new URL(request.url).searchParams
  const number = (key: string, fallback: number, max: number) => {
    const value = params.get(key)
    if (value === null) return fallback
    if (!/^[1-9]\d*$/.test(value)) return fail(400, 'INVALID_INPUT')
    return integer(Number(value), 1, max)
  }
  const filter = params.get(filterName) || 'all'
  if (!filters.includes(filter)) return fail(400, 'INVALID_INPUT')
  return { page: number('page', 1, 1_000_000), pageSize: number('pageSize', 20, 100), q: text(params.get('q') || '', 180, true), filter }
}

async function paged<T>(env: Env, query: { page: number; pageSize: number }, from: string, fields: string, order: string, bindings: (string | number)[]) {
  // Count and rows share a transaction, including while an administrator writes.
  const [count, rows] = await env.DB.batch([
    env.DB.prepare(`SELECT COUNT(*) AS total ${from}`).bind(...bindings),
    env.DB.prepare(`SELECT ${fields} ${from} ORDER BY ${order} LIMIT ? OFFSET ?`)
      .bind(...bindings, query.pageSize, (query.page - 1) * query.pageSize),
  ])
  const total = (count.results[0] as { total: number }).total
  return { items: rows.results as T[], pagination: { page: query.page, pageSize: query.pageSize, total } }
}

export async function listStudents(request: Request, env: Env) {
  await requireUser(request, env, true)
  const query = listQuery(request, 'role', ['all', 'student', 'admin'])
  const clauses = ['1 = 1']
  const bindings: (string | number)[] = [now()]
  if (query.q) {
    // instr treats %, _ and quotes as literal search text, not SQL wildcards.
    clauses.push(`(instr(lower(u.display_name), lower(?)) > 0 OR instr(lower(u.id), lower(?)) > 0
      OR EXISTS (SELECT 1 FROM auth_identities i WHERE i.user_id = u.id AND instr(lower(i.subject), lower(?)) > 0))`)
    bindings.push(query.q, query.q, query.q)
  }
  if (query.filter !== 'all') { clauses.push('u.role = ?'); bindings.push(query.filter) }
  const result = await paged<Omit<Student, 'courseIds'> & { courseIds: string }>(env, query,
    `FROM users u CROSS JOIN (SELECT ? AS stamp) clock WHERE ${clauses.join(' AND ')}`,
    `u.id, u.display_name AS displayName, u.role,
      (SELECT subject FROM auth_identities WHERE user_id = u.id ORDER BY provider, subject LIMIT 1) AS identity,
      (SELECT json_group_array(course_id) FROM entitlements WHERE user_id = u.id AND revoked_at IS NULL
        AND (expires_at IS NULL OR expires_at > clock.stamp)) AS courseIds`,
    'u.created_at DESC, u.id', bindings)
  return json({ ...result, items: result.items.map(row => ({ ...row, courseIds: JSON.parse(row.courseIds) })) })
}

export async function listCodes(request: Request, env: Env) {
  await requireUser(request, env, true)
  const query = listQuery(request, 'status', ['all', 'available', 'redeemed', 'revoked', 'expired'])
  const clauses = ['1 = 1']
  const bindings: (string | number)[] = [now(), now()]
  if (query.q) { clauses.push('instr(lower(r.hint), lower(?)) > 0'); bindings.push(query.q) }
  if (query.filter !== 'all') { clauses.push('r.status = ?'); bindings.push(query.filter) }
  // Either deadline can make a key unusable. Match the redemption endpoint.
  const result = await paged<Omit<RedemptionCode, 'courseIds'> & { courseIds: string }>(env, query,
    `FROM (SELECT *, CASE WHEN redeemed_at IS NOT NULL THEN 'redeemed'
      WHEN revoked_at IS NOT NULL THEN 'revoked'
      WHEN expires_at <= ? OR access_expires_at <= ? THEN 'expired'
      ELSE 'available' END AS status FROM redemption_codes) r WHERE ${clauses.join(' AND ')}`,
    `r.id, r.hint, r.created_at AS createdAt, r.expires_at AS expiresAt, r.access_expires_at AS accessExpiresAt,
      r.redeemed_by AS redeemedBy, r.redeemed_at AS redeemedAt, r.revoked_at AS revokedAt, r.status,
      (SELECT json_group_array(course_id) FROM code_courses WHERE code_id = r.id) AS courseIds`,
    'r.created_at DESC, r.id', bindings)
  return json({ ...result, items: result.items.map(row => ({ ...row, courseIds: JSON.parse(row.courseIds) })) })
}

export async function listOrders(request: Request, env: Env) {
  await requireUser(request, env, true)
  const query = listQuery(request, 'status', ['all'])
  const bindings = query.q ? Array<string>(4).fill(query.q) : []
  const where = query.q ? `WHERE instr(lower(o.note), lower(?)) > 0 OR instr(lower(o.user_id), lower(?)) > 0
    OR instr(lower(u.display_name), lower(?)) > 0 OR EXISTS
    (SELECT 1 FROM auth_identities i WHERE i.user_id = u.id AND instr(lower(i.subject), lower(?)) > 0)` : ''
  return json(await paged<ManualOrder>(env, query,
    `FROM manual_orders o JOIN users u ON u.id = o.user_id ${where}`,
    'o.id, o.user_id AS userId, u.display_name AS displayName, o.course_id AS courseId, o.amount_cents AS amountCents, o.note, o.created_at AS createdAt',
    'o.created_at DESC, o.id', bindings))
}
