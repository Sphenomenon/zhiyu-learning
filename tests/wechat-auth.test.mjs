import test from 'node:test'
import assert from 'node:assert/strict'
import { createHash, createCipheriv, randomBytes } from 'node:crypto'
import { readFileSync, readdirSync } from 'node:fs'
import { DatabaseSync } from 'node:sqlite'
import { handleRequest } from '../server/router.ts'

const origin = 'https://courses.example'
const appId = 'wx0123456789abcdef'
const secret = 'fixture-app-secret-never-expose'
const webhookToken = 'fixtureWebhookToken123'
const aesKey = Buffer.from('0123456789abcdef0123456789abcdef')
const encodingAESKey = aesKey.toString('base64').replace(/=$/, '')
const openid = 'oFixtureWechatIdentity001'
const stamp = () => Math.floor(Date.now() / 1000)
const digest = value => createHash('sha256').update(value).digest('hex')
const signature = values => createHash('sha1').update([...values].sort().join('')).digest('hex')
// Execute the actual production SQL against SQLite, including transactional D1
// batches, so replay/uniqueness tests exercise constraints rather than canned rows.
function database(t) {
  const sqlite = new DatabaseSync(':memory:')
  for (const file of readdirSync(new URL('../migrations/', import.meta.url)).filter(file => file.endsWith('.sql')).sort()) {
    sqlite.exec(readFileSync(new URL(`../migrations/${file}`, import.meta.url), 'utf8'))
  }
  t.after(() => sqlite.close())
  function statement(sql, values = []) {
    return {
      bind: (...bindings) => statement(sql, bindings),
      async first(column) {
        const row = sqlite.prepare(sql).get(...values)
        return row ? column ? row[column] : row : null
      },
      async all() {
        return { success: true, results: sqlite.prepare(sql).all(...values), meta: {} }
      },
      execute() {
        const prepared = sqlite.prepare(sql)
        const results = prepared.columns().length ? prepared.all(...values) : []
        if (!prepared.columns().length) prepared.run(...values)
        const changes = sqlite.prepare('SELECT changes() AS count').get().count
        return { success: true, results, meta: { changes } }
      },
      async run() { return this.execute() },
    }
  }
  return {
    sqlite,
    prepare: statement,
    async batch(statements) {
      sqlite.exec('BEGIN')
      try {
        const results = statements.map(item => item.execute())
        sqlite.exec('COMMIT')
        return results
      } catch (error) {
        sqlite.exec('ROLLBACK')
        throw error
      }
    },
  }
}

function fixture(t, overrides = {}) {
  return { DB: database(t), AUTH_MODE: 'wechat', WECHAT_APP_ID: appId, WECHAT_APP_SECRET: secret,
    WECHAT_SERVER_URL: `${origin}/api/auth/wechat/events`, WECHAT_WEBHOOK_TOKEN: webhookToken,
    WECHAT_ENCODING_AES_KEY: encodingAESKey, ...overrides }
}

function request(path, { method = 'GET', cookie, json, headers, base = origin } = {}) {
  return new Request(`${base}${path}`, {
    method,
    headers: { 'User-Agent': 'Mozilla/5.0 Chrome/128.0.0.0', ...(method === 'POST' ? { Origin: base, 'Content-Type': 'application/json' } : {}),
      ...(cookie ? { Cookie: cookie } : {}), ...headers },
    ...(json !== undefined ? { body: JSON.stringify(json) } : {}),
  })
}

function cookies(response) { return response.headers.getSetCookie() }
function cookieValue(response, name) {
  const cookie = cookies(response).find(value => value.startsWith(`${name}=`))
  assert.ok(cookie, `Expected ${name} cookie`)
  return cookie.split(';')[0]
}

async function apiError(response, status, code) {
  assert.equal(response.status, status, await response.clone().text())
  assert.deepEqual(await response.json(), { error: { code } })
  assert.equal(response.headers.get('Cache-Control'), 'no-store')
}

function upstream(t, options = {}) {
  const calls = { token: 0, qr: 0, records: [], tokens: [] }
  calls.mock = t.mock.method(globalThis, 'fetch', async (input, init) => {
    const url = new URL(input instanceof Request ? input.url : input)
    assert.equal(url.origin, 'https://api.weixin.qq.com')
    assert.equal(init?.method, 'POST')
    assert.equal(init?.redirect, 'error', 'Provider credentials must not follow redirects')
    assert.ok(init?.signal instanceof AbortSignal, 'Provider requests need a timeout signal')
    if (options.error) throw options.error
    const body = JSON.parse(init.body)
    if (url.pathname === '/cgi-bin/stable_token') {
      calls.token++
      assert.deepEqual(body, { grant_type: 'client_credential', appid: appId, secret, force_refresh: false })
      const token = `fixture-access-token-${calls.token}-never-expose`
      calls.tokens.push(token)
      const value = options.tokenPayload ?? { access_token: token, expires_in: 7200 }
      return new Response(options.tokenRaw ?? JSON.stringify(value), { status: options.status ?? 200 })
    }
    assert.equal(url.pathname, '/cgi-bin/qrcode/create')
    assert.ok(calls.tokens.includes(url.searchParams.get('access_token')))
    assert.equal(body.action_name, 'QR_STR_SCENE')
    assert.equal(body.expire_seconds, 180)
    assert.match(body.action_info?.scene?.scene_str, /^[a-f0-9]{64}$/)
    calls.qr++
    const ticket = `fixture-ticket-${calls.qr}-with+slash/and=padding`
    calls.records.push({ ticket, scene: body.action_info.scene.scene_str })
    const data = options.qrPayloads?.[calls.qr - 1] ?? options.qrPayload ?? { ticket, expire_seconds: 180, url: 'http://weixin.qq.com/q/fixture' }
    return new Response(options.qrRaw ?? JSON.stringify(data), { status: options.status ?? 200 })
  })
  return calls
}

async function start(env, provider, options = {}) {
  const response = await handleRequest(request('/api/auth/wechat/qr/start', { method: 'POST', json: { intent: 'login' }, ...options }), env)
  assert.equal(response.status, 200, await response.clone().text())
  const data = await response.json()
  const ticket = new URL(data.qrCodeUrl).searchParams.get('ticket')
  const record = provider.records.find(item => item.ticket === ticket)
  assert.ok(record, 'Returned QR image must refer to the provider-issued ticket')
  return { ...data, response, cookie: cookieValue(response, '__Host-zhiyu_wechat_qr'), ...record }
}

async function poll(env, flow, options = {}) {
  return handleRequest(request('/api/auth/wechat/qr/poll', { method: 'POST', json: { challengeId: flow.challengeId }, cookie: flow.cookie, ...options }), env)
}

async function pollStatus(response, expected) {
  assert.equal(response.status, 200, await response.clone().text())
  const data = await response.json()
  if (expected === 'waiting') {
    assert.equal(data.status, expected)
    assert.ok(data.expiresAt > stamp() && data.expiresAt <= stamp() + 180)
    assert.ok(data.retryAfter > 0 && data.retryAfter <= 10)
  } else assert.deepEqual(data, { status: expected })
  assert.equal(response.headers.get('Cache-Control'), 'no-store')
}

function eventXml(flow, options = {}) {
  const event = options.event ?? 'SCAN'
  const fields = { ToUserName: 'gh_fixtureOfficialAccount', FromUserName: options.openid ?? openid,
    CreateTime: options.createTime ?? stamp(), MsgType: options.msgType ?? 'event', Event: event,
    EventKey: options.scene ?? `${event === 'subscribe' ? 'qrscene_' : ''}${flow.scene}`, Ticket: options.ticket ?? flow.ticket }
  return `<xml>${Object.entries(fields).map(([key, value]) => `<${key}><![CDATA[${value}]]></${key}>`).join('')}</xml>`
}

// Construct protocol fixtures independently of the application parser: random16,
// uint32 network-order XML length, UTF-8 XML, AppID, PKCS#7 with 32-byte blocks.
function encrypt(xml, { targetAppId = appId, badPadding = false } = {}) {
  const text = Buffer.from(xml)
  const length = Buffer.alloc(4)
  length.writeUInt32BE(text.length)
  const plain = Buffer.concat([randomBytes(16), length, text, Buffer.from(targetAppId)])
  const pad = 32 - plain.length % 32
  const padded = Buffer.concat([plain, Buffer.alloc(pad, pad)])
  if (badPadding) padded[padded.length - 1] = 0
  const cipher = createCipheriv('aes-256-cbc', aesKey, aesKey.subarray(0, 16))
  cipher.setAutoPadding(false)
  return Buffer.concat([cipher.update(padded), cipher.final()]).toString('base64')
}

function eventRequest(flow, options = {}) {
  const encrypted = options.encrypted ?? encrypt(options.xml ?? eventXml(flow, options), options)
  const timestamp = String(options.timestamp ?? stamp())
  const nonce = options.nonce ?? 'fixture-nonce'
  const params = new URLSearchParams({ encrypt_type: 'aes', timestamp, nonce,
    msg_signature: options.signature ?? signature([webhookToken, timestamp, nonce, encrypted]) })
  const xml = `<xml><ToUserName><![CDATA[gh_fixtureOfficialAccount]]></ToUserName><Encrypt><![CDATA[${encrypted}]]></Encrypt></xml>`
  return new Request(`${origin}/api/auth/wechat/events?${params}${options.suffix ?? ''}`, {
    method: 'POST', headers: { 'Content-Type': 'text/xml' }, body: options.outerXml ?? xml,
  })
}

async function scan(env, flow, options = {}) {
  const response = await handleRequest(eventRequest(flow, options), env)
  assert.equal(response.status, 200, await response.clone().text())
  assert.equal(await response.text(), 'success')
  assert.equal(cookies(response).length, 0, 'Provider webhook must not establish browser sessions')
  return response
}

async function me(env, session) {
  const response = await handleRequest(request('/api/me', { cookie: session }), env)
  assert.equal(response.status, 200)
  return response.json()
}

function seedSession(env, { id = 'existing-student', role = 'student', token = 'a'.repeat(64) } = {}) {
  env.DB.sqlite.prepare('INSERT INTO users (id, display_name, role, created_at) VALUES (?, ?, ?, ?)').run(id, 'Existing student', role, stamp())
  env.DB.sqlite.prepare('INSERT INTO sessions (token_hash, user_id, expires_at, created_at) VALUES (?, ?, ?, ?)')
    .run(digest(token), id, stamp() + 3600, stamp())
  return { id, cookie: `__Host-zhiyu_session=${token}`, token }
}

function grantCourse(env, userId) {
  env.DB.sqlite.prepare('INSERT INTO courses (id) VALUES (?)').run('paid-course')
  env.DB.sqlite.prepare("INSERT INTO entitlements (user_id, course_id, source, source_id, granted_at) VALUES (?, ?, 'manual', ?, ?)")
    .run(userId, 'paid-course', 'existing-purchase', stamp())
}

function count(env, table) { return env.DB.sqlite.prepare(`SELECT COUNT(*) AS count FROM ${table}`).get().count }

async function authenticate(env, provider, options = {}) {
  const flow = await start(env, provider)
  await scan(env, flow, options)
  const result = await poll(env, flow)
  await pollStatus(result.clone(), 'authenticated')
  return { flow, result, cookie: cookieValue(result, '__Host-zhiyu_session') }
}

function handshake(options = {}) {
  const timestamp = String(options.timestamp ?? stamp())
  const nonce = 'fixture-nonce'
  const echo = options.echo ?? 'fixture-verification-echo'
  const parts = [webhookToken, timestamp, nonce]
  if (options.encrypted) parts.push(echo)
  const params = new URLSearchParams({ timestamp, nonce, echostr: echo,
    [options.encrypted ? 'msg_signature' : 'signature']: options.signature ?? signature(parts) })
  if (options.encrypted) params.set('encrypt_type', 'aes')
  return request(`/api/auth/wechat/events?${params}${options.suffix ?? ''}`)
}

test('QR login requires complete HTTPS configuration and a same-origin event URL', async t => {
  const env = fixture(t)
  const provider = upstream(t)
  for (const settings of [
    { AUTH_MODE: 'disabled' }, { AUTH_MODE: 'local' }, { WECHAT_APP_ID: '' }, { WECHAT_APP_ID: 'bad-appid' },
    { WECHAT_APP_SECRET: '' }, { WECHAT_SERVER_URL: '' }, { WECHAT_WEBHOOK_TOKEN: 'a' },
    { WECHAT_ENCODING_AES_KEY: 'invalid' }, { WECHAT_ENCODING_AES_KEY: '' },
    { WECHAT_SERVER_URL: 'https://other.example/api/auth/wechat/events' },
    { WECHAT_SERVER_URL: `${origin}/wrong-path` },
    { WECHAT_SERVER_URL: `${origin}/api/auth/wechat/events?redirect=evil` },
    { WECHAT_SERVER_URL: `${origin}/api/auth/wechat/events#fragment` },
  ]) {
    const configured = { ...env, ...settings }
    await apiError(await handleRequest(request('/api/auth/wechat/qr/start', { method: 'POST', json: { intent: 'login' } }), configured), 503, 'AUTH_NOT_CONFIGURED')
    assert.equal((await me(configured)).authMode, 'unavailable')
  }
  for (const base of ['http://courses.example', 'http://127.0.0.1:5173']) {
    await apiError(await handleRequest(request('/api/auth/wechat/qr/start', { base, method: 'POST', json: { intent: 'login' } }), env), 503, 'AUTH_NOT_CONFIGURED')
  }
  assert.equal(provider.token, 0)
  assert.equal(count(env, 'wechat_qr_logins'), 0)
})

test('browser QR endpoints require same-origin POSTs and work outside the WeChat browser', async t => {
  const env = fixture(t)
  const provider = upstream(t)
  for (const path of ['/api/auth/wechat/qr/start', '/api/auth/wechat/qr/poll']) {
    for (const headers of [{ Origin: '' }, { Origin: 'https://evil.example' }, { 'Sec-Fetch-Site': 'cross-site' }]) {
      await apiError(await handleRequest(request(path, { method: 'POST', json: { intent: 'login' }, headers }), env), 403, 'ORIGIN_DENIED')
    }
  }
  const flow = await start(env, provider)
  await pollStatus(await poll(env, flow), 'waiting')
  assert.equal(provider.qr, 1)
})

test('QR challenges expire in three minutes and store only hashes of the browser nonce, scene and ticket', async t => {
  const env = fixture(t)
  const provider = upstream(t)
  const flow = await start(env, provider, { json: { intent: 'login', role: 'admin', returnTo: 'https://evil.example' } })
  assert.match(flow.challengeId, /^[a-f0-9]{64}$/)
  assert.ok(flow.expiresAt >= stamp() + 175 && flow.expiresAt <= stamp() + 180)
  const qrUrl = new URL(flow.qrCodeUrl)
  assert.equal(qrUrl.origin, 'https://mp.weixin.qq.com')
  assert.equal(qrUrl.pathname, '/cgi-bin/showqrcode')
  assert.equal(qrUrl.searchParams.get('ticket'), flow.ticket)
  const header = cookies(flow.response).find(value => value.startsWith('__Host-zhiyu_wechat_qr='))
  for (const flag of ['HttpOnly', 'Secure', 'SameSite=Lax', 'Path=/']) assert.ok(header.includes(flag))
  assert.match(header, /Max-Age=180(?:;|$)/)
  assert.doesNotMatch(header, /Domain=/i)
  const row = env.DB.sqlite.prepare('SELECT * FROM wechat_qr_logins WHERE id = ?').get(flow.challengeId)
  assert.equal(row.browser_hash, digest(flow.cookie.split('=')[1]))
  assert.equal(row.scene_hash, digest(flow.scene))
  assert.equal(row.ticket_hash, digest(flow.ticket))
  assert.equal(row.expires_at, flow.expiresAt)
  const persisted = JSON.stringify(row)
  for (const value of [flow.cookie.split('=')[1], flow.scene, flow.ticket, secret]) assert.ok(!persisted.includes(value))
  const client = JSON.stringify({ challengeId: flow.challengeId, qrCodeUrl: flow.qrCodeUrl, expiresAt: flow.expiresAt })
  for (const value of [secret, webhookToken, encodingAESKey, ...provider.tokens]) assert.ok(!client.includes(value))
})

test('server verification supports signed plaintext and AES echoes without a browser Origin', async t => {
  const env = fixture(t)
  let response = await handleRequest(handshake(), env)
  assert.equal(response.status, 200)
  assert.equal(await response.text(), 'fixture-verification-echo')
  response = await handleRequest(handshake({ encrypted: true, echo: encrypt('encrypted-verification-echo') }), env)
  assert.equal(response.status, 200)
  assert.equal(await response.text(), 'encrypted-verification-echo')
})

test('verification and event signatures reject tampering, replay timestamps and ambiguous query parameters', async t => {
  const env = fixture(t)
  for (const options of [{ signature: '0'.repeat(40) }, { timestamp: stamp() - 301 }, { suffix: '&nonce=duplicate' }]) {
    await apiError(await handleRequest(handshake(options), env), 403, 'WECHAT_SIGNATURE_INVALID')
  }
  const provider = upstream(t)
  const flow = await start(env, provider)
  for (const options of [{ signature: '0'.repeat(40) }, { timestamp: stamp() - 301 }, { suffix: '&msg_signature=duplicate' }, { targetAppId: 'wx0000000000000000' }]) {
    await apiError(await handleRequest(eventRequest(flow, options), env), 403, 'WECHAT_SIGNATURE_INVALID')
  }
  assert.equal(env.DB.sqlite.prepare('SELECT subject FROM wechat_qr_logins WHERE id = ?').get(flow.challengeId).subject, null)
})

test('only valid encrypted event XML can record a scanner', async t => {
  const env = fixture(t)
  const provider = upstream(t)
  const flow = await start(env, provider)
  const plain = new Request(`${origin}/api/auth/wechat/events`, { method: 'POST', headers: { 'Content-Type': 'text/xml' }, body: eventXml(flow) })
  await apiError(await handleRequest(plain, env), 403, 'WECHAT_SIGNATURE_INVALID')
  for (const options of [
    { badPadding: true },
    { xml: `<!DOCTYPE xml [<!ENTITY secret SYSTEM "file:///etc/passwd">]>${eventXml(flow)}` },
    { xml: eventXml(flow).replace('</xml>', '<FromUserName>other-user</FromUserName></xml>') },
    { xml: eventXml(flow).replace('<MsgType><![CDATA[event]]></MsgType>', '<MsgType><nested>event</nested></MsgType>') },
    { xml: eventXml(flow).replace('<ToUserName><![CDATA[gh_fixtureOfficialAccount]]></ToUserName>', '<ToUserName>&unknown;</ToUserName>') },
    { outerXml: '<xml><Encrypt>malformed</Encrypt><Encrypt>duplicate</Encrypt></xml>' },
    { outerXml: '<xml>' + 'x'.repeat(65_537) + '</xml>' },
  ]) {
    await apiError(await handleRequest(eventRequest(flow, options), env), 400, 'WECHAT_MESSAGE_INVALID')
  }
  assert.equal(count(env, 'users'), 0)
  await pollStatus(await poll(env, flow), 'waiting')
})

test('a scan records identity but only the initiating browser poll creates a student session', async t => {
  const env = fixture(t)
  const provider = upstream(t)
  const flow = await start(env, provider, { json: { intent: 'login', role: 'admin' } })
  await pollStatus(await poll(env, flow), 'waiting')
  await scan(env, flow)
  assert.equal(count(env, 'users'), 0)
  assert.equal(count(env, 'sessions'), 0)
  const response = await poll(env, flow)
  await pollStatus(response.clone(), 'authenticated')
  const session = cookieValue(response, '__Host-zhiyu_session')
  const state = await me(env, session)
  assert.equal(state.authMode, 'wechat')
  assert.equal(state.user.role, 'student')
  assert.deepEqual(state.wechat, { linked: true })
  assert.deepEqual(state.courseIds, [])
  const identity = env.DB.sqlite.prepare("SELECT * FROM auth_identities WHERE provider = 'wechat'").get()
  assert.equal(identity.subject, `${appId}:${openid}`)
  assert.equal(identity.user_id, state.user.id)
  const row = env.DB.sqlite.prepare('SELECT * FROM sessions WHERE token_hash = ?').get(digest(session.split('=')[1]))
  assert.ok(Math.abs(row.expires_at - row.created_at - 7 * 86400) <= 1)
  const header = cookies(response).find(value => value.startsWith('__Host-zhiyu_session='))
  for (const flag of ['Secure', 'HttpOnly', 'SameSite=Lax', 'Path=/']) assert.ok(header.includes(flag))
  await pollStatus(await poll(env, flow), 'expired')
})

test('subscribe QR events log into the same existing user and preserve paid courses', async t => {
  const env = fixture(t)
  const provider = upstream(t)
  const first = await authenticate(env, provider)
  const firstUser = (await me(env, first.cookie)).user
  grantCourse(env, firstUser.id)
  const repeat = await authenticate(env, provider, { event: 'subscribe' })
  const state = await me(env, repeat.cookie)
  assert.equal(state.user.id, firstUser.id)
  assert.deepEqual(state.courseIds, ['paid-course'])
  assert.equal(count(env, 'users'), 1)
  assert.equal(provider.token, 1, 'Usable server API tokens should be cached')
  assert.equal(provider.qr, 2)
})

test('unknown or mismatched QR scenes, tickets and unrelated events cannot authorize a challenge', async t => {
  const env = fixture(t)
  const provider = upstream(t)
  const flow = await start(env, provider)
  for (const options of [{ scene: 'b'.repeat(64) }, { ticket: 'wrong-ticket' }, { event: 'unsubscribe' }, { event: 'subscribe', scene: '' }, { msgType: 'text' }]) {
    await scan(env, flow, options)
    await pollStatus(await poll(env, flow), 'waiting')
  }
  assert.equal(count(env, 'users'), 0)
})

test('first scan wins and duplicate or later scanners cannot replace its identity', async t => {
  const env = fixture(t)
  const provider = upstream(t)
  const flow = await start(env, provider)
  await scan(env, flow)
  await scan(env, flow)
  await scan(env, flow, { openid: 'oOtherWechatIdentity002' })
  const response = await poll(env, flow)
  await pollStatus(response, 'authenticated')
  assert.equal(env.DB.sqlite.prepare("SELECT subject FROM auth_identities WHERE provider = 'wechat'").get().subject, `${appId}:${openid}`)
  assert.equal(count(env, 'auth_identities'), 1)
})

test('polling requires the original browser nonce and unknown or malformed challenges fail closed', async t => {
  const env = fixture(t)
  const provider = upstream(t)
  const flow = await start(env, provider)
  await scan(env, flow)
  for (const options of [{ cookie: '' }, { cookie: '__Host-zhiyu_wechat_qr=' + 'b'.repeat(64) }, { json: { challengeId: 'b'.repeat(64) } }, { json: { challengeId: 'malformed' } }]) {
    await apiError(await poll(env, flow, options), 400, 'WECHAT_QR_INVALID')
  }
  await pollStatus(await poll(env, flow), 'authenticated')
  assert.equal(count(env, 'sessions'), 1)
})

test('expired QR challenges cannot be scanned or redeemed', async t => {
  const env = fixture(t)
  const provider = upstream(t)
  const flow = await start(env, provider)
  env.DB.sqlite.prepare('UPDATE wechat_qr_logins SET expires_at = ? WHERE id = ?').run(stamp() - 1, flow.challengeId)
  await scan(env, flow)
  assert.equal(env.DB.sqlite.prepare('SELECT subject FROM wechat_qr_logins WHERE id = ?').get(flow.challengeId).subject, null)
  await pollStatus(await poll(env, flow), 'expired')
  assert.equal(count(env, 'users'), 0)
})

test('refreshing a QR invalidates the old browser challenge and rotates the browser nonce', async t => {
  const env = fixture(t)
  const provider = upstream(t)
  const original = await start(env, provider)
  const refreshed = await start(env, provider, { cookie: original.cookie })
  assert.notEqual(original.challengeId, refreshed.challengeId)
  assert.notEqual(original.cookie, refreshed.cookie)
  assert.notEqual(original.scene, refreshed.scene)
  await scan(env, original)
  const delayedOldPoll = await poll(env, original)
  await pollStatus(delayedOldPoll, 'expired')
  // Browsers apply response cookies even when the UI ignores a stale result.
  // The expired response must not erase a replacement QR's browser nonce.
  assert.equal(cookies(delayedOldPoll).some(value => value.startsWith('__Host-zhiyu_wechat_qr=')), false)
  await pollStatus(await poll(env, refreshed), 'waiting')
  await scan(env, refreshed)
  await pollStatus(await poll(env, refreshed), 'authenticated')
  assert.equal(count(env, 'users'), 1)
})

test('malformed scanner identity, ticket and event time are rejected before recording a scan', async t => {
  const env = fixture(t)
  const provider = upstream(t)
  const flow = await start(env, provider)
  for (const options of [{ openid: '../invalid-identity' }, { openid: '' }, { ticket: '' }, { createTime: 'not-a-time' }]) {
    await apiError(await handleRequest(eventRequest(flow, options), env), 400, 'WECHAT_MESSAGE_INVALID')
  }
  for (const createTime of [stamp() - 301, stamp() + 301]) {
    await scan(env, flow, { createTime })
    await pollStatus(await poll(env, flow), 'waiting')
  }
  assert.equal(count(env, 'users'), 0)
})

test('concurrent poll requests consume one scanned challenge at most once', async t => {
  const env = fixture(t)
  const provider = upstream(t)
  const flow = await start(env, provider)
  await scan(env, flow)
  const responses = await Promise.all([poll(env, flow), poll(env, flow)])
  const statuses = await Promise.all(responses.map(response => response.json().then(data => data.status)))
  assert.deepEqual(statuses.sort(), ['authenticated', 'expired'])
  assert.equal(count(env, 'users'), 1)
  assert.equal(count(env, 'sessions'), 1)
})

test('independent simultaneous QR logins share a single identity owner without orphan users', async t => {
  const env = fixture(t)
  const provider = upstream(t)
  const flows = await Promise.all([start(env, provider), start(env, provider)])
  await Promise.all(flows.map(flow => scan(env, flow)))
  const responses = await Promise.all(flows.map(flow => poll(env, flow)))
  const users = []
  for (const response of responses) {
    await pollStatus(response.clone(), 'authenticated')
    users.push((await me(env, cookieValue(response, '__Host-zhiyu_session'))).user.id)
  }
  assert.equal(users[0], users[1])
  assert.equal(count(env, 'users'), 1)
  assert.equal(count(env, 'auth_identities'), 1)
  assert.equal(count(env, 'sessions'), 2)
})

test('existing administrators keep their role with an eight-hour session', async t => {
  const env = fixture(t)
  const provider = upstream(t)
  const user = seedSession(env, { role: 'admin' })
  env.DB.sqlite.prepare("INSERT INTO auth_identities (provider, subject, user_id) VALUES ('wechat', ?, ?)").run(`${appId}:${openid}`, user.id)
  const result = await authenticate(env, provider)
  assert.equal((await me(env, result.cookie)).user.role, 'admin')
  const row = env.DB.sqlite.prepare('SELECT * FROM sessions WHERE token_hash = ?').get(digest(result.cookie.split('=')[1]))
  assert.ok(Math.abs(row.expires_at - row.created_at - 8 * 3600) <= 1)
})

test('disabled owners cannot sign in and no second account is created', async t => {
  const env = fixture(t)
  const provider = upstream(t)
  const user = seedSession(env)
  env.DB.sqlite.prepare("INSERT INTO auth_identities (provider, subject, user_id) VALUES ('wechat', ?, ?)").run(`${appId}:${openid}`, user.id)
  env.DB.sqlite.prepare("UPDATE users SET status = 'disabled' WHERE id = ?").run(user.id)
  const flow = await start(env, provider)
  await scan(env, flow)
  await apiError(await poll(env, flow), 403, 'ACCOUNT_DISABLED')
  assert.equal(count(env, 'users'), 1)
  assert.equal(count(env, 'sessions'), 1)
})

test('logged-in users must explicitly bind and unauthenticated users cannot bind', async t => {
  const env = fixture(t)
  const user = seedSession(env)
  await apiError(await handleRequest(request('/api/auth/wechat/qr/start', { method: 'POST', cookie: user.cookie, json: { intent: 'login' } }), env), 409, 'ACCOUNT_ALREADY_SIGNED_IN')
  await apiError(await handleRequest(request('/api/auth/wechat/qr/start', { method: 'POST', json: { intent: 'bind' } }), env), 401, 'LOGIN_REQUIRED')
})

test('explicit linking preserves the existing account and courses without creating a new session', async t => {
  const env = fixture(t)
  const provider = upstream(t)
  const user = seedSession(env)
  grantCourse(env, user.id)
  const flow = await start(env, provider, { cookie: user.cookie, json: { intent: 'bind' } })
  await scan(env, flow)
  const response = await poll(env, flow, { cookie: `${flow.cookie}; ${user.cookie}` })
  await pollStatus(response.clone(), 'linked')
  assert.ok(!cookies(response).some(cookie => cookie.startsWith('__Host-zhiyu_session=')))
  const state = await me(env, user.cookie)
  assert.equal(state.user.id, user.id)
  assert.deepEqual(state.courseIds, ['paid-course'])
  assert.deepEqual(state.wechat, { linked: true })
  assert.equal(count(env, 'users'), 1)
  assert.equal(count(env, 'sessions'), 1)
  const login = await authenticate(env, provider)
  assert.equal((await me(env, login.cookie)).user.id, user.id)
})

test('linking requires the exact still-valid initiating session, even for the same user', async t => {
  const env = fixture(t)
  const provider = upstream(t)
  const user = seedSession(env)
  const other = seedSession(env, { id: 'another-student', token: 'b'.repeat(64) })
  const sameUserToken = 'd'.repeat(64)
  env.DB.sqlite.prepare('INSERT INTO sessions (token_hash, user_id, expires_at, created_at) VALUES (?, ?, ?, ?)')
    .run(digest(sameUserToken), user.id, stamp() + 3600, stamp())
  for (const session of ['', other.cookie, `__Host-zhiyu_session=${sameUserToken}`]) {
    const flow = await start(env, provider, { cookie: user.cookie, json: { intent: 'bind' } })
    await scan(env, flow)
    await apiError(await poll(env, flow, { cookie: `${flow.cookie}; ${session}` }), 401, 'WECHAT_SESSION_CHANGED')
  }
  const expired = await start(env, provider, { cookie: user.cookie, json: { intent: 'bind' } })
  await scan(env, expired)
  env.DB.sqlite.prepare('UPDATE sessions SET expires_at = ? WHERE token_hash = ?').run(stamp() - 1, digest(user.token))
  await apiError(await poll(env, expired, { cookie: `${expired.cookie}; ${user.cookie}` }), 401, 'WECHAT_SESSION_CHANGED')
  assert.equal(count(env, 'auth_identities'), 0)
})

test('signing into another account after QR creation cannot silently replace the active login', async t => {
  const env = fixture(t)
  const provider = upstream(t)
  const flow = await start(env, provider)
  await scan(env, flow)
  const user = seedSession(env)
  await apiError(await poll(env, flow, { cookie: `${flow.cookie}; ${user.cookie}` }), 409, 'ACCOUNT_ALREADY_SIGNED_IN')
  assert.equal(count(env, 'auth_identities'), 0)
  assert.equal(count(env, 'sessions'), 1)
})

test('linking cannot take an identity already owned by another user', async t => {
  const env = fixture(t)
  const provider = upstream(t)
  const owner = seedSession(env)
  const other = seedSession(env, { id: 'another-student', token: 'b'.repeat(64) })
  env.DB.sqlite.prepare("INSERT INTO auth_identities (provider, subject, user_id) VALUES ('wechat', ?, ?)").run(`${appId}:${openid}`, owner.id)
  const flow = await start(env, provider, { cookie: other.cookie, json: { intent: 'bind' } })
  await scan(env, flow)
  await apiError(await poll(env, flow, { cookie: `${flow.cookie}; ${other.cookie}` }), 409, 'WECHAT_IDENTITY_CONFLICT')
  assert.equal(env.DB.sqlite.prepare("SELECT user_id FROM auth_identities WHERE provider = 'wechat' AND subject = ?").get(`${appId}:${openid}`).user_id, owner.id)
  assert.equal(count(env, 'users'), 2)
})

test('a user cannot add a second WeChat identity for the same AppID', async t => {
  const env = fixture(t)
  const provider = upstream(t)
  const user = seedSession(env)
  const flow = await start(env, provider, { cookie: user.cookie, json: { intent: 'bind' } })
  await scan(env, flow)
  env.DB.sqlite.prepare("INSERT INTO auth_identities (provider, subject, user_id) VALUES ('wechat', ?, ?)").run(`${appId}:oAnotherWechatIdentity`, user.id)
  await apiError(await poll(env, flow, { cookie: `${flow.cookie}; ${user.cookie}` }), 409, 'WECHAT_ALREADY_LINKED')
  assert.equal(count(env, 'auth_identities'), 1)
  await apiError(await handleRequest(request('/api/auth/wechat/qr/start', { method: 'POST', cookie: user.cookie, json: { intent: 'bind' } }), env), 409, 'WECHAT_ALREADY_LINKED')
})

test('concurrent linking by different users preserves exactly one owner and one audit event', async t => {
  const env = fixture(t)
  const provider = upstream(t)
  const users = [seedSession(env), seedSession(env, { id: 'another-student', token: 'b'.repeat(64) })]
  const flows = await Promise.all(users.map(user => start(env, provider, { cookie: user.cookie, json: { intent: 'bind' } })))
  await Promise.all(flows.map(flow => scan(env, flow)))
  const responses = await Promise.all(flows.map((flow, i) => poll(env, flow, { cookie: `${flow.cookie}; ${users[i].cookie}` })))
  const results = await Promise.all(responses.map(response => response.json()))
  assert.equal(results.filter(result => result.status === 'linked').length, 1)
  assert.equal(results.filter(result => result.error?.code === 'WECHAT_IDENTITY_CONFLICT').length, 1)
  const winner = users[results.findIndex(result => result.status === 'linked')]
  assert.equal(env.DB.sqlite.prepare("SELECT user_id FROM auth_identities WHERE provider = 'wechat' AND subject = ?").get(`${appId}:${openid}`).user_id, winner.id)
  assert.equal(env.DB.sqlite.prepare("SELECT COUNT(*) AS count FROM audit_logs WHERE action = 'identity.wechat.bound'").get().count, 1)
  assert.equal(count(env, 'users'), 2)
})

test('concurrent different WeChat identities cannot both bind to one account and AppID', async t => {
  const env = fixture(t)
  const provider = upstream(t)
  const user = seedSession(env)
  const flows = await Promise.all([start(env, provider, { cookie: user.cookie, json: { intent: 'bind' } }), start(env, provider, { cookie: user.cookie, json: { intent: 'bind' } })])
  await Promise.all(flows.map((flow, i) => scan(env, flow, { openid: i === 0 ? openid : 'oDifferentWechatIdentity003' })))
  const responses = await Promise.all(flows.map(flow => poll(env, flow, { cookie: `${flow.cookie}; ${user.cookie}` })))
  const results = await Promise.all(responses.map(response => response.json()))
  assert.equal(results.filter(result => result.status === 'linked').length, 1)
  assert.equal(results.filter(result => result.error?.code === 'WECHAT_ALREADY_LINKED').length, 1)
  assert.equal(count(env, 'auth_identities'), 1)
  assert.equal(env.DB.sqlite.prepare("SELECT COUNT(*) AS count FROM audit_logs WHERE action = 'identity.wechat.bound'").get().count, 1)
})

test('distinct OpenIDs remain separate accounts and cannot inherit another account courses', async t => {
  const env = fixture(t)
  const provider = upstream(t)
  const first = await authenticate(env, provider)
  const firstUser = (await me(env, first.cookie)).user
  grantCourse(env, firstUser.id)
  const second = await authenticate(env, provider, { openid: 'oDistinctWechatIdentity002' })
  const state = await me(env, second.cookie)
  assert.notEqual(state.user.id, firstUser.id)
  assert.deepEqual(state.courseIds, [])
  assert.equal(count(env, 'users'), 2)
})

test('expired server tokens refresh and valid tokens are reused without reaching the browser', async t => {
  const env = fixture(t)
  const provider = upstream(t)
  await start(env, provider)
  await start(env, provider)
  assert.equal(provider.token, 1)
  env.DB.sqlite.prepare('UPDATE wechat_api_tokens SET expires_at = ?').run(stamp() - 1)
  const third = await start(env, provider)
  assert.equal(provider.token, 2)
  const state = await me(env)
  const client = JSON.stringify({ challengeId: third.challengeId, qrCodeUrl: third.qrCodeUrl, expiresAt: third.expiresAt, state })
  for (const value of [secret, webhookToken, encodingAESKey, ...provider.tokens]) assert.ok(!client.includes(value))
  const cached = env.DB.sqlite.prepare('SELECT * FROM wechat_api_tokens WHERE app_id = ?').get(appId)
  assert.equal(cached.access_token, provider.tokens.at(-1))
})

test('invalid or expired provider tokens are refreshed and QR creation retries only once', async t => {
  for (const errcode of [40014, 42001]) {
    const env = fixture(t)
    const provider = upstream(t, { qrPayloads: [{ errcode, errmsg: 'expired token' }] })
    await start(env, provider)
    assert.equal(provider.token, 2)
    assert.equal(provider.qr, 2)
    assert.equal(count(env, 'wechat_qr_logins'), 1)
    provider.mock.mock.restore()
  }
  const env = fixture(t)
  const provider = upstream(t, { qrPayload: { errcode: 40014, errmsg: `secret ${secret}` } })
  const response = await handleRequest(request('/api/auth/wechat/qr/start', { method: 'POST', json: { intent: 'login' } }), env)
  await apiError(response, 502, 'WECHAT_UNAVAILABLE')
  assert.equal(provider.token, 2)
  assert.equal(provider.qr, 2)
  assert.equal(count(env, 'wechat_qr_logins'), 0)
})

test('provider permission failures, bad payloads and unbounded responses fail without leaking credentials', async t => {
  for (const options of [
    { tokenPayload: { errcode: 48001, errmsg: `denied ${secret}` } },
    { tokenPayload: { access_token: '', expires_in: 7200 } },
    { tokenPayload: { access_token: 'bad-expiry-token', expires_in: -1 } },
    { tokenRaw: '{malformed' }, { tokenRaw: 'null' }, { tokenRaw: '[]' },
    { tokenRaw: JSON.stringify({ access_token: 'x'.repeat(70_000), expires_in: 7200 }) },
    { qrPayload: { errcode: 48001, errmsg: `denied ${secret}` } },
    { qrPayload: { ticket: '', expire_seconds: 180 } },
    { qrRaw: '{malformed' }, { status: 502 },
  ]) {
    const env = fixture(t)
    const provider = upstream(t, options)
    const response = await handleRequest(request('/api/auth/wechat/qr/start', { method: 'POST', json: { intent: 'login' } }), env)
    await apiError(response.clone(), 502, 'WECHAT_UNAVAILABLE')
    const output = `${await response.text()} ${JSON.stringify(cookies(response))}`
    for (const value of [secret, webhookToken, encodingAESKey, ...provider.tokens]) assert.ok(!output.includes(value))
    assert.equal(count(env, 'wechat_qr_logins'), 0)
    provider.mock.mock.restore()
  }
})

test('network failures and timeouts return a recoverable error without creating login challenges', async t => {
  for (const error of [new TypeError(`network failure ${secret}`), new DOMException(`timeout ${secret}`, 'TimeoutError')]) {
    const env = fixture(t)
    const provider = upstream(t, { error })
    await apiError(await handleRequest(request('/api/auth/wechat/qr/start', { method: 'POST', json: { intent: 'login' } }), env), 502, 'WECHAT_UNAVAILABLE')
    assert.equal(count(env, 'wechat_qr_logins'), 0)
    provider.mock.mock.restore()
  }
})
