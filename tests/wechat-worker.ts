import { handleRequest } from '../server/router.ts'
import type { Env } from '../server/http.ts'

// This standalone test entry is never included in the production Pages worker.
// Local transport emulates the canonical HTTPS origin so the production auth
// configuration and secure-cookie checks execute unchanged under workerd.
export default {
  fetch(request: Request, env: Env) {
    const incoming = new URL(request.url)
    if (!['/api/health', '/api/auth/wechat/events', '/api/auth/wechat/qr/poll', '/api/me'].includes(incoming.pathname)) {
      return new Response('Not found', { status: 404 })
    }
    const target = new URL(`${incoming.pathname}${incoming.search}`, 'https://courses.example')
    return handleRequest(new Request(target.href, request), env)
  },
}
