import { logout, requestCode, requireUser, sessionState, verifyCode } from './auth.ts'
import { adminResource, createCode, listCodes, listStudents, manageEntitlement, redeem, resources, revokeCode } from './access.ts'
import { contentId, contentKind, listContent, publicContent, saveContent } from './content.ts'
import { ApiError, type Env, checkOrigin, fail, json, now } from './http.ts'

async function dispatch(request: Request, env: Env): Promise<Response> {
  checkOrigin(request)
  const path = new URL(request.url).pathname.replace(/\/$/, '')
  const method = request.method
  if (!env.DB) return fail(503, 'DATABASE_NOT_CONFIGURED')
  if (method === 'GET' && path === '/api/health') {
    await env.DB.prepare('SELECT 1 FROM users LIMIT 1').all()
    return json({ ok: true })
  }
  if (method === 'GET' && path === '/api/site') return publicContent(env, 'site')
  if (method === 'GET' && path === '/api/courses') return publicContent(env, 'course')
  if (method === 'GET' && path === '/api/cases') return publicContent(env, 'case')
  if (method === 'GET' && path === '/api/me') return sessionState(request, env)
  if (method === 'GET' && path === '/api/me/courses') {
    const user = await requireUser(request, env)
    // Once unpublished, the last published description is unavailable. Return
    // only a minimal title placeholder, never the working draft, to learners.
    const published = await env.DB.prepare(`SELECT c.id, c.published_json FROM content_entries c
      JOIN entitlements e ON e.course_id = c.id WHERE c.kind = 'course' AND e.user_id = ?
      AND e.revoked_at IS NULL AND (e.expires_at IS NULL OR e.expires_at > ?) ORDER BY c.id`)
      .bind(user.id, now()).all<{ id: string; published_json: string | null }>()
    return json({ items: published.results.map(row => row.published_json ? JSON.parse(row.published_json) : {
      id: row.id, title: '课程资料', label: '', subtitle: '', description: '', lessons: 0, index: '', duration: '', color: 'acid', level: '',
      en: { title: 'Course resources', label: '', subtitle: '', description: '', duration: '', level: '' },
    }) })
  }
  if (method === 'POST' && path === '/api/auth/code/request') return requestCode(request, env)
  if (method === 'POST' && path === '/api/auth/code/verify') return verifyCode(request, env)
  if (method === 'POST' && path === '/api/auth/logout') return logout(request, env)
  if (method === 'POST' && path === '/api/redemptions') return redeem(request, env)
  const resource = path.match(/^\/api\/courses\/([^/]+)\/resources$/)
  if (method === 'GET' && resource) return resources(request, env, contentId(resource[1]))
  if (method === 'GET' && path === '/api/admin/content') return listContent(request, env)
  const content = path.match(/^\/api\/admin\/content\/([^/]+)\/([^/]+)$/)
  if (method === 'PUT' && content) return saveContent(request, env, contentKind(content[1]), contentId(content[2]))
  const privateResource = path.match(/^\/api\/admin\/courses\/([^/]+)\/resource$/)
  if (['GET', 'PUT'].includes(method) && privateResource) return adminResource(request, env, contentId(privateResource[1]))
  if (method === 'GET' && path === '/api/admin/students') return listStudents(request, env)
  if (method === 'POST' && path === '/api/admin/entitlements') return manageEntitlement(request, env)
  if (method === 'GET' && path === '/api/admin/redemption-codes') return listCodes(request, env)
  if (method === 'POST' && path === '/api/admin/redemption-codes') return createCode(request, env)
  const code = path.match(/^\/api\/admin\/redemption-codes\/([^/]+)\/revoke$/)
  if (method === 'POST' && code) return revokeCode(request, env, contentId(code[1]))
  if (method === 'GET' && path === '/api/admin/orders') {
    await requireUser(request, env, true)
    return json({ items: (await env.DB.prepare('SELECT id, user_id AS userId, course_id AS courseId, amount_cents AS amountCents, note, created_at AS createdAt FROM manual_orders ORDER BY created_at DESC LIMIT 100').all()).results })
  }
  if (path.startsWith('/api/admin/')) {
    await requireUser(request, env, true)
  }
  return fail(404, 'NOT_FOUND')
}

export async function handleRequest(request: Request, env: Env): Promise<Response> {
  try {
    return await dispatch(request, env)
  } catch (error) {
    if (error instanceof ApiError) return json({ error: { code: error.code } }, error.status, error.status === 429 ? { 'Retry-After': '60' } : undefined)
    // Do not log request bodies, SQL bindings, tokens or private resource URLs.
    console.error('API request failed', new URL(request.url).pathname, error instanceof Error ? error.name : 'UnknownError')
    return json({ error: { code: 'INTERNAL_ERROR' } }, 500)
  }
}
