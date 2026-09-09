import assert from 'node:assert/strict'

export async function checkAdminLists(t, call, adminCookie, learnerCookie) {
  const admin = { cookie: adminCookie }
  await t.test('admin lists require authentication before parsing search parameters', async () => {
    for (const path of ['/admin/students', '/admin/redemption-codes', '/admin/orders']) {
      assert.equal((await call(`${path}?page=invalid`)).status, 401)
      assert.equal((await call(`${path}?page=invalid`, { cookie: learnerCookie })).status, 403)
      for (const query of ['page=0', 'page=-1', 'page=1.5', 'page=1000001', 'pageSize=101', 'pageSize=NaN', `q=${'a'.repeat(181)}`]) {
        assert.equal((await call(`${path}?${query}`, admin)).status, 400, query)
      }
    }
    assert.equal((await call('/admin/students?role=owner', admin)).status, 400)
    assert.equal((await call('/admin/redemption-codes?status=unknown', admin)).status, 400)
  })
  await t.test('search and deterministic pagination reach learners beyond the old 200-record limit', async () => {
    const seen = []
    for (let page = 1; page <= 12; page++) {
      const result = await call(`/admin/students?q=${encodeURIComponent('分页学员')}&page=${page}`, admin)
      assert.equal(result.status, 200)
      assert.deepEqual(result.data.pagination, { page, pageSize: 20, total: 225 })
      seen.push(...result.data.items.map(item => item.id))
      assert.equal(result.data.items.length, page === 12 ? 5 : 20)
      assert.deepEqual(result.data.items[0].courseIds, [])
    }
    assert.equal(new Set(seen).size, 225)
    assert.equal(seen[224], 'fixture-learner-224')
    assert.equal((await call('/admin/students?q=PAGE224%40EXAMPLE.TEST&role=student', admin)).data.items[0].id, 'fixture-learner-224')
    assert.equal((await call('/admin/students?q=page224&role=admin', admin)).data.pagination.total, 0)
    for (const query of ['%', '_', "' OR 1=1 --"]) {
      assert.equal((await call(`/admin/students?q=${encodeURIComponent(query)}`, admin)).data.pagination.total, 0)
    }
    const beyond = await call('/admin/students?q=page224&page=2', admin)
    assert.equal(beyond.data.pagination.total, 1)
    assert.deepEqual(beyond.data.items, [])
  })
  await t.test('key filtering includes both expiry deadlines and keeps hashes private', async () => {
    for (const [status, total] of [['available', 45], ['redeemed', 45], ['revoked', 45], ['expired', 90]]) {
      const result = await call(`/admin/redemption-codes?q=TEST&status=${status}&pageSize=100`, admin)
      assert.equal(result.status, 200)
      assert.equal(result.data.pagination.total, total)
      assert.equal(result.data.items.length, total)
      for (const item of result.data.items) {
        assert.equal(item.status, status)
        assert.deepEqual(item.courseIds, ['method'])
        assert.equal('code_hash' in item || 'code' in item, false)
      }
    }
    const last = await call('/admin/redemption-codes?q=test&page=12', admin)
    assert.equal(last.data.pagination.total, 225)
    assert.equal(last.data.items.at(-1).id, 'fixture-key-224')
    assert.equal((await call('/admin/redemption-codes?q=TEST003&status=expired', admin)).data.items[0].accessExpiresAt, 1)
  })
  await t.test('payment records support pagination and learner/note searches', async () => {
    const first = await call('/admin/orders?pageSize=1', admin)
    const second = await call('/admin/orders?pageSize=1&page=2', admin)
    assert.equal(first.status, 200)
    assert.equal(first.data.pagination.total, 2)
    assert.notEqual(first.data.items[0].id, second.data.items[0].id)
    const note = await call('/admin/orders?q=retry-safe', admin)
    assert.equal(note.data.pagination.total, 1)
    assert.equal(note.data.items[0].amountCents, 12900)
    const learner = await call(`/admin/orders?q=${note.data.items[0].userId}`, admin)
    assert.equal(learner.data.pagination.total, 2)
    assert.ok(learner.data.items[0].displayName)
    assert.match(learner.headers.get('cache-control'), /no-store/)
  })
}
