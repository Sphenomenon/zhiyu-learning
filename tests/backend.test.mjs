import test from 'node:test'
import assert from 'node:assert/strict'

const base = process.env.TEST_API_BASE
if (!base?.startsWith('http://127.0.0.1:')) throw new Error('Tests only run against the isolated local runtime')
async function call(path, { cookie, data, method, origin, headers = {} } = {}) {
  const response = await fetch(`${base}/api${path}`, {
    method: method || (data === undefined ? 'GET' : 'POST'),
    headers: { ...(cookie ? { Cookie: cookie } : {}), ...(data === undefined ? {} : { 'Content-Type': 'application/json', Origin: origin || base }), ...headers },
    body: data === undefined ? undefined : JSON.stringify(data),
  })
  return { status: response.status, headers: response.headers, data: await response.json() }
}
async function login(email) {
  const request = await call('/auth/code/request', { data: { email } })
  assert.equal(request.status, 200)
  const verification = await call('/auth/code/verify', { data: { challengeId: request.data.challengeId, code: request.data.developmentCode, role: 'admin' } })
  assert.equal(verification.status, 200)
  const cookie = verification.headers.get('set-cookie').split(';')[0]
  assert.match(verification.headers.get('set-cookie'), /HttpOnly/)
  assert.match(verification.headers.get('set-cookie'), /SameSite=Lax/)
  return { cookie, challenge: request.data, me: (await call('/me', { cookie })).data }
}

test('real Workers + D1 integration', async t => {
  const startedAt = Date.now()
  const admin = await login('admin@zhiyu.local')
  const alice = await login('alice@example.com')
  const bob = await login('bob@example.com')
  let code
  let winner
  let loser
  const privateUrl = 'https://pan.baidu.com/s/TESTPRIVATEONLY'
  await t.test('server owns role and cookie identity; forged client role is ignored', async () => {
    assert.equal(admin.me.user.role, 'admin')
    assert.equal(alice.me.user.role, 'student')
    assert.equal(bob.me.user.role, 'student')
    assert.equal((await call('/me', { cookie: 'zhiyu_session=' + 'a'.repeat(64) })).data.user, null)
    assert.equal((await call('/admin/content')).status, 401)
    assert.equal((await call('/admin/content', { cookie: alice.cookie })).status, 403)
    assert.equal((await call('/admin/redemption-codes', { cookie: alice.cookie, data: { courseIds: ['method'] } })).status, 403)
  })
  await t.test('verification challenge is single-use and resend is rate limited', async () => {
    assert.equal((await call('/auth/code/verify', { data: { challengeId: alice.challenge.challengeId, code: alice.challenge.developmentCode } })).status, 400)
    assert.equal((await call('/auth/code/request', { data: { email: 'alice@example.com' } })).status, 429)
    const challenge = await call('/auth/code/request', { data: { email: 'attempts@example.com' } })
    const wrong = challenge.data.developmentCode === '000000' ? '111111' : '000000'
    for (let i = 0; i < 5; i++) assert.equal((await call('/auth/code/verify', { data: { challengeId: challenge.data.challengeId, code: wrong } })).status, 400)
    assert.equal((await call('/auth/code/verify', { data: { challengeId: challenge.data.challengeId, code: challenge.data.developmentCode } })).status, 400)
  })
  await t.test('concurrent verification of one challenge creates only one session', async () => {
    const challenge = await call('/auth/code/request', { data: { email: 'concurrent-login@example.com' } })
    const results = await Promise.all([1, 2].map(() => call('/auth/code/verify', { data: { challengeId: challenge.data.challengeId, code: challenge.data.developmentCode } })))
    assert.deepEqual(results.map(result => result.status).sort(), [200, 400])
  })
  await t.test('CSRF origin checks and JSON-only mutations are enforced', async () => {
    assert.equal((await call('/auth/logout', { cookie: admin.cookie, data: {}, origin: 'https://attacker.example' })).status, 403)
    const missingOrigin = await fetch(`${base}/api/auth/logout`, { method: 'POST', headers: { Cookie: admin.cookie } })
    assert.equal(missingOrigin.status, 403)
    assert.equal((await call('/auth/code/request', { data: {}, headers: { 'Content-Type': 'text/plain' } })).status, 415)
    assert.equal((await call('/auth/code/request', { data: { email: 'a'.repeat(49_000) } })).status, 413)
  })
  await t.test('published content exists, private resources are absent by default', async () => {
    assert.equal((await call('/courses')).data.items.length, 3)
    assert.equal((await call('/cases')).data.items.length, 4)
    assert.equal((await call('/courses/method/resources')).status, 401)
    assert.equal((await call('/courses/method/resources', { cookie: alice.cookie })).status, 403)
    assert.equal((await call('/admin/courses/method/resource', { cookie: alice.cookie })).status, 403)
  })
  await t.test('private resources validate URL/code and use version checking', async () => {
    assert.equal((await call('/admin/courses/method/resource', { cookie: admin.cookie, method: 'PUT', data: { url: 'https://evil.example/s/secret', extractionCode: 'abcd', note: '', version: 0 } })).status, 400)
    const result = await call('/admin/courses/method/resource', { cookie: admin.cookie, method: 'PUT', data: { url: privateUrl, extractionCode: 'abcd', note: 'Private fixture', version: 0 } })
    assert.equal(result.status, 200)
    assert.equal((await call('/admin/courses/method/resource', { cookie: admin.cookie, method: 'PUT', data: { ...result.data.resource, version: 0 } })).status, 409)
    assert.equal(JSON.stringify((await call('/courses')).data).includes(privateUrl), false)
  })
  await t.test('keys are high entropy, only returned at creation, and course constrained', async () => {
    assert.equal((await call('/admin/redemption-codes', { cookie: admin.cookie, data: { courseIds: ['missing'] } })).status, 400)
    assert.equal((await call('/admin/redemption-codes', { cookie: admin.cookie, data: { courseIds: ['method'], expiresAt: 1 } })).status, 400)
    const result = await call('/admin/redemption-codes', { cookie: admin.cookie, data: { courseIds: ['method', 'practice'] } })
    assert.equal(result.status, 201)
    code = result.data.code
    assert.match(code, /^ZY-(?:[A-F0-9]{8}-){3}[A-F0-9]{8}$/)
    assert.equal(JSON.stringify((await call('/admin/redemption-codes', { cookie: admin.cookie })).data).includes(code), false)
  })
  await t.test('concurrent redemption by two users grants exactly one account', async () => {
    const results = await Promise.all([alice, bob].map(user => call('/redemptions', { cookie: user.cookie, data: { code } })))
    assert.deepEqual(results.map(result => result.status).sort(), [200, 400])
    winner = results[0].status === 200 ? alice : bob
    loser = winner === alice ? bob : alice
    assert.deepEqual((await call('/me', { cookie: winner.cookie })).data.courseIds, ['method', 'practice'])
    assert.deepEqual((await call('/me', { cookie: loser.cookie })).data.courseIds, [])
    assert.equal((await call('/redemptions', { cookie: winner.cookie, data: { code } })).data.alreadyRedeemed, true)
  })
  await t.test('resource endpoint checks current entitlement and never caches', async () => {
    const result = await call('/courses/method/resources', { cookie: winner.cookie })
    assert.equal(result.status, 200)
    assert.equal(result.data.resource.url, privateUrl)
    assert.equal(result.headers.get('cache-control'), 'no-store')
    assert.equal((await call('/courses/method/resources', { cookie: loser.cookie })).status, 403)
    assert.equal((await call('/courses/practice/resources', { cookie: winner.cookie })).status, 404)
    assert.equal((await call('/me/courses', { cookie: winner.cookie })).data.items.length, 2)
  })
  await t.test('revocation takes effect immediately; replay cannot re-grant', async () => {
    assert.equal((await call('/admin/entitlements', { cookie: loser.cookie, data: { userId: loser.me.user.id, courseId: 'method', action: 'grant', reason: 'forgery' } })).status, 403)
    assert.equal((await call('/admin/entitlements', { cookie: admin.cookie, data: { requestId: crypto.randomUUID(), userId: winner.me.user.id, courseId: 'method', action: 'revoke', reason: 'test revoke' } })).status, 200)
    assert.equal((await call('/courses/method/resources', { cookie: winner.cookie })).status, 403)
    const replay = await call('/redemptions', { cookie: winner.cookie, data: { code } })
    assert.equal(replay.data.alreadyRedeemed, true)
    assert.deepEqual(replay.data.courseIds, ['practice'])
    assert.equal((await call('/courses/method/resources', { cookie: winner.cookie })).status, 403)
  })
  await t.test('disabled unused key cannot be redeemed', async () => {
    const result = await call('/admin/redemption-codes', { cookie: admin.cookie, data: { courseIds: ['studio'] } })
    assert.equal((await call(`/admin/redemption-codes/${result.data.id}/revoke`, { cookie: admin.cookie, data: {} })).status, 200)
    assert.equal((await call('/redemptions', { cookie: loser.cookie, data: { code: result.data.code } })).status, 400)
  })
  await t.test('draft/publish separation, bilingual data and stale-edit protection', async () => {
    const entry = (await call('/admin/content', { cookie: admin.cookie })).data.items.find(item => item.kind === 'site')
    const draft = { ...entry.draft, heroTitle: 'DRAFT-PRIVATE', heroTitleEn: 'ENGLISH DRAFT', secretLink: privateUrl }
    const save = await call('/admin/content/site/home', { cookie: admin.cookie, method: 'PUT', data: { draft, revision: entry.revision, action: 'draft' } })
    assert.equal(save.status, 200)
    assert.equal((await call('/site')).data.content.heroTitle, entry.draft.heroTitle)
    assert.equal((await call('/admin/content/site/home', { cookie: admin.cookie, method: 'PUT', data: { draft, revision: entry.revision, action: 'publish' } })).status, 409)
    const publish = await call('/admin/content/site/home', { cookie: admin.cookie, method: 'PUT', data: { draft, revision: save.data.item.revision, action: 'publish' } })
    assert.equal(publish.status, 200)
    const site = await call('/site')
    assert.equal(site.data.content.heroTitleEn, 'ENGLISH DRAFT')
    assert.equal(site.data.content.secretLink, undefined)
  })
  await t.test('two administrators editing the same revision cannot overwrite each other', async () => {
    const entry = (await call('/admin/content', { cookie: admin.cookie })).data.items.find(item => item.kind === 'course' && item.id === 'method')
    const results = await Promise.all(['Concurrent A', 'Concurrent B'].map(title => call('/admin/content/course/method', { cookie: admin.cookie, method: 'PUT', data: { draft: { ...entry.draft, title }, revision: entry.revision, action: 'draft' } })))
    assert.deepEqual(results.map(result => result.status).sort(), [200, 409])
  })
  await t.test('case drafts stay private and publishing/hiding updates the case wall', async () => {
    const draft = { name: 'Test learner', role: 'Guitar student', result: 'Completed practice', quote: 'CASE-DRAFT-PRIVATE', en: { name: 'Learner', role: 'Guitar', result: 'Progress', quote: 'English case' } }
    const save = await call('/admin/content/case/test-case', { cookie: admin.cookie, method: 'PUT', data: { draft, revision: 0, action: 'draft' } })
    assert.equal(save.status, 200)
    assert.equal((await call('/cases')).data.items.some(item => item.id === 'test-case'), false)
    const publish = await call('/admin/content/case/test-case', { cookie: admin.cookie, method: 'PUT', data: { draft, revision: 1, action: 'publish' } })
    assert.equal(publish.status, 200)
    assert.equal((await call('/cases')).data.items.some(item => item.id === 'test-case'), true)
    assert.equal((await call('/admin/content/case/test-case', { cookie: admin.cookie, method: 'PUT', data: { draft, revision: 2, action: 'unpublish' } })).status, 200)
    assert.equal((await call('/cases')).data.items.some(item => item.id === 'test-case'), false)
  })
  await t.test('hiding a course does not reveal its working draft to enrolled users', async () => {
    const entry = (await call('/admin/content', { cookie: admin.cookie })).data.items.find(item => item.kind === 'course' && item.id === 'practice')
    const draft = { ...entry.draft, title: 'HIDDEN-DRAFT-PRIVATE' }
    assert.equal((await call('/admin/content/course/practice', { cookie: admin.cookie, method: 'PUT', data: { draft, revision: entry.revision, action: 'unpublish' } })).status, 200)
    assert.equal((await call('/courses')).data.items.some(item => item.id === 'practice'), false)
    assert.equal(JSON.stringify((await call('/me/courses', { cookie: winner.cookie })).data).includes('HIDDEN-DRAFT-PRIVATE'), false)
  })
  await t.test('manual grants and explicitly confirmed payments are recorded separately', async () => {
    const grant = { requestId: crypto.randomUUID(), userId: loser.me.user.id, courseId: 'studio', action: 'grant', reason: 'Test complimentary access' }
    assert.equal((await call('/admin/entitlements', { cookie: admin.cookie, data: grant })).status, 200)
    assert.equal((await call('/admin/orders', { cookie: admin.cookie })).data.items.length, 0)
    assert.equal((await call('/admin/entitlements', { cookie: admin.cookie, data: { ...grant, requestId: crypto.randomUUID(), courseId: 'method', paymentConfirmed: true, amountCents: 19900, reason: 'Offline receipt' } })).status, 200)
    const orders = (await call('/admin/orders', { cookie: admin.cookie })).data.items
    assert.equal(orders.length, 1)
    assert.equal(orders[0].amountCents, 19900)
  })
  await t.test('concurrent payment retries create one record and cannot overwrite revoked access', async () => {
    const operation = { requestId: crypto.randomUUID(), userId: loser.me.user.id, courseId: 'studio', action: 'grant', reason: 'Retry-safe payment', paymentConfirmed: true, amountCents: 12900 }
    const results = await Promise.all([1, 2].map(() => call('/admin/entitlements', { cookie: admin.cookie, data: operation })))
    assert.deepEqual(results.map(result => result.status), [200, 200])
    assert.equal((await call('/admin/orders', { cookie: admin.cookie })).data.items.length, 2)
    assert.equal((await call('/admin/entitlements', { cookie: admin.cookie, data: { ...operation, amountCents: 999 } })).status, 409)
    await call('/admin/entitlements', { cookie: admin.cookie, data: { requestId: crypto.randomUUID(), userId: loser.me.user.id, courseId: 'studio', action: 'revoke', reason: 'Revoke after payment' } })
    assert.equal((await call('/admin/entitlements', { cookie: admin.cookie, data: operation })).data.replayed, true)
    assert.equal((await call('/me', { cookie: loser.cookie })).data.courseIds.includes('studio'), false)
  })
  await t.test('logout revokes server session, not just browser state', async () => {
    const logout = await call('/auth/logout', { cookie: loser.cookie, data: {} })
    assert.equal(logout.status, 200)
    assert.match(logout.headers.get('set-cookie'), /Max-Age=0/)
    assert.equal((await call('/me', { cookie: loser.cookie })).data.user, null)
    assert.equal((await call('/courses/method/resources', { cookie: loser.cookie })).status, 401)
  })
  await t.test('a fresh login session finds the same account and purchased courses', async () => {
    // Observe the real resend cooldown rather than bypassing production logic.
    await new Promise(resolve => setTimeout(resolve, Math.max(0, 31_000 - (Date.now() - startedAt))))
    const email = winner === alice ? 'alice@example.com' : 'bob@example.com'
    const secondSession = await login(email)
    assert.notEqual(secondSession.cookie, winner.cookie)
    assert.equal(secondSession.me.user.id, winner.me.user.id)
    assert.deepEqual(secondSession.me.courseIds, (await call('/me', { cookie: winner.cookie })).data.courseIds)
  })
})
