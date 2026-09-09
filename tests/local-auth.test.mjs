import test from 'node:test'
import assert from 'node:assert/strict'
import { localAuth } from '../server/http.ts'
import { handleRequest } from '../server/router.ts'

test('local login requires both loopback HTTP and explicit local mode', async () => {
  for (const url of ['https://zhiyu-learning.pages.dev', 'https://localhost', 'http://192.168.1.10', 'https://custom.example.com']) {
    assert.equal(localAuth(new Request(url), { AUTH_MODE: 'local' }), false)
  }
  assert.equal(localAuth(new Request('http://127.0.0.1:8788'), { AUTH_MODE: 'local' }), true)
  assert.equal(localAuth(new Request('http://localhost:5173'), { AUTH_MODE: 'disabled' }), false)
  assert.equal(localAuth(new Request('http://localhost:5173'), {}), false)
  const request = new Request('https://zhiyu-learning.pages.dev/api/auth/code/request', { method: 'POST', headers: { Origin: 'https://zhiyu-learning.pages.dev', 'Content-Type': 'application/json' }, body: JSON.stringify({ email: 'admin@zhiyu.local' }) })
  const response = await handleRequest(request, { AUTH_MODE: 'local', DB: {} })
  assert.equal(response.status, 503)
  assert.equal((await response.json()).error.code, 'AUTH_NOT_CONFIGURED')
})

test('unconfigured database fails closed without revealing internal details', async () => {
  const response = await handleRequest(new Request('https://site.example/api/me'), {})
  assert.equal(response.status, 503)
  assert.equal((await response.json()).error.code, 'DATABASE_NOT_CONFIGURED')
})
