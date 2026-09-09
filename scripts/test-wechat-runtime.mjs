import assert from 'node:assert/strict'
import { spawn } from 'node:child_process'
import { createCipheriv, createHash, randomBytes } from 'node:crypto'
import { once } from 'node:events'
import { mkdtemp, rm, writeFile } from 'node:fs/promises'
import { createServer } from 'node:net'
import { tmpdir } from 'node:os'
import { join, resolve } from 'node:path'
import { setTimeout as delay } from 'node:timers/promises'
import { command, prepareLocalDatabase, wrangler } from './db-local.mjs'

const project = resolve(import.meta.dirname, '..')
const temporary = await mkdtemp(join(tmpdir(), 'zhiyu-wechat-runtime-'))
const origin = 'https://courses.example'
const appId = 'wx0123456789abcdef'
const token = 'fixtureWebhookToken123'
const key = Buffer.from('0123456789abcdef0123456789abcdef')
const openid = 'oRuntimeFixtureWechatIdentity'
const now = () => Math.floor(Date.now() / 1000)
const hash = value => createHash('sha256').update(value).digest('hex')
const signature = parts => createHash('sha1').update([...parts].sort().join('')).digest('hex')
const quote = value => `'${String(value).replaceAll("'", "''")}'`
let server
let output = ''

function encrypted(text) {
  const message = Buffer.from(text)
  const length = Buffer.alloc(4)
  length.writeUInt32BE(message.length)
  const plain = Buffer.concat([randomBytes(16), length, message, Buffer.from(appId)])
  const padding = 32 - plain.length % 32
  const cipher = createCipheriv('aes-256-cbc', key, key.subarray(0, 16))
  cipher.setAutoPadding(false)
  return Buffer.concat([cipher.update(Buffer.concat([plain, Buffer.alloc(padding, padding)])), cipher.final()]).toString('base64')
}

function flowFixture(index) {
  return { id: randomBytes(32).toString('hex'), scene: randomBytes(32).toString('hex'),
    browser: randomBytes(32).toString('hex'), ticket: `runtime-fixture-ticket-${index}+with/slash=padding` }
}

async function json(response) {
  assert.equal(response.status, 200, await response.clone().text())
  return response.json()
}

async function availablePort() {
  const socket = createServer()
  socket.listen(0, '127.0.0.1')
  await once(socket, 'listening')
  const port = socket.address().port
  await new Promise(resolve => socket.close(resolve))
  return port
}

try {
  // Every migration, fixture, and runtime D1 write uses this invocation's fresh
  // temporary directory. The developer's persistent database is never opened.
  await prepareLocalDatabase(temporary)
  const flows = [flowFixture(1), flowFixture(2)]
  const fixturePath = join(temporary, 'wechat-fixtures.sql')
  await writeFile(fixturePath, flows.map(flow => `INSERT INTO wechat_qr_logins
    (id, scene_hash, ticket_hash, browser_hash, app_id, origin, intent, created_at, expires_at)
    VALUES (${[flow.id, hash(flow.scene), hash(flow.ticket), hash(flow.browser), appId, origin, 'login'].map(quote).join(', ')}, ${now()}, ${now() + 180});`).join('\n'))
  await command(['d1', 'execute', 'DB', '--local', '--file', fixturePath, '--persist-to', temporary], { cwd: project })
  const configPath = join(temporary, 'wrangler.json')
  await writeFile(configPath, JSON.stringify({
    name: 'zhiyu-wechat-runtime-test', main: join(project, 'tests/wechat-worker.ts'),
    compatibility_date: '2026-09-09', compatibility_flags: ['nodejs_compat'],
    vars: { AUTH_MODE: 'wechat', WECHAT_APP_ID: appId, WECHAT_APP_SECRET: 'runtime-fixture-unused-secret',
      WECHAT_SERVER_URL: `${origin}/api/auth/wechat/events`, WECHAT_WEBHOOK_TOKEN: token,
      WECHAT_ENCODING_AES_KEY: key.toString('base64').replace(/=$/, '') },
    d1_databases: [{ binding: 'DB', database_name: 'zhiyu-learning-local',
      database_id: '00000000-0000-0000-0000-000000000000', migrations_dir: join(project, 'migrations') }],
  }, null, 2))
  const port = await availablePort()
  const base = `http://127.0.0.1:${port}`
  server = spawn(process.execPath, [wrangler, 'dev', '--config', configPath, '--local', '--ip', '127.0.0.1',
    '--port', String(port), '--persist-to', temporary], { cwd: project, stdio: ['ignore', 'pipe', 'pipe'] })
  server.stdout.on('data', data => { output = (output + data).slice(-20000) })
  server.stderr.on('data', data => { output = (output + data).slice(-20000) })
  let ready = false
  for (let attempt = 0; attempt < 100; attempt++) {
    if (server.exitCode !== null) throw new Error(`WeChat test worker exited: ${output}`)
    try { ready = (await fetch(`${base}/api/health`, { signal: AbortSignal.timeout(1000) })).ok } catch { /* startup */ }
    if (ready) break
    await delay(200)
  }
  assert.ok(ready, `WeChat test worker did not start: ${output}`)

  const local = (path, options = {}) => fetch(`${base}${path}`, { ...options, signal: AbortSignal.timeout(5000) })
  const poll = flow => local('/api/auth/wechat/qr/poll', { method: 'POST',
    headers: { Origin: origin, 'Content-Type': 'application/json', Cookie: `__Host-zhiyu_wechat_qr=${flow.browser}` },
    body: JSON.stringify({ challengeId: flow.id }) })

  // Execute SHA-1 and both verification modes inside Workers, not Node mocks.
  for (const encryptedEcho of [false, true]) {
    const timestamp = String(now())
    const nonce = 'runtime-echo-nonce'
    const expected = 'runtime-verification-echo'
    const echo = encryptedEcho ? encrypted(expected) : expected
    const params = new URLSearchParams({ timestamp, nonce, echostr: echo })
    params.set(encryptedEcho ? 'msg_signature' : 'signature', signature([token, timestamp, nonce, ...(encryptedEcho ? [echo] : [])]))
    if (encryptedEcho) params.set('encrypt_type', 'aes')
    const response = await local(`/api/auth/wechat/events?${params}`)
    assert.equal(response.status, 200, await response.clone().text())
    assert.equal(await response.text(), expected)
  }

  let firstUser
  for (const [index, flow] of flows.entries()) {
    assert.equal((await json(await poll(flow))).status, 'waiting')
    const event = index === 0 ? 'SCAN' : 'subscribe'
    const eventKey = `${event === 'subscribe' ? 'qrscene_' : ''}${flow.scene}`
    const message = `<xml><ToUserName><![CDATA[gh_runtimeFixture]]></ToUserName><FromUserName><![CDATA[${openid}]]></FromUserName><CreateTime>${now()}</CreateTime><MsgType><![CDATA[event]]></MsgType><Event><![CDATA[${event}]]></Event><EventKey><![CDATA[${eventKey}]]></EventKey><Ticket><![CDATA[${flow.ticket}]]></Ticket></xml>`
    const envelope = encrypted(message)
    const timestamp = String(now())
    const nonce = `runtime-event-${index}`
    const params = new URLSearchParams({ encrypt_type: 'aes', timestamp, nonce,
      msg_signature: signature([token, timestamp, nonce, envelope]) })
    const payload = { method: 'POST', headers: { 'Content-Type': 'text/xml' },
      body: `<xml><Encrypt><![CDATA[${envelope}]]></Encrypt></xml>` }
    const invalid = new URLSearchParams(params)
    invalid.set('msg_signature', '0'.repeat(40))
    const rejected = await local(`/api/auth/wechat/events?${invalid}`, payload)
    assert.equal(rejected.status, 403)
    assert.deepEqual(await rejected.json(), { error: { code: 'WECHAT_SIGNATURE_INVALID' } })

    const scanned = await local(`/api/auth/wechat/events?${params}`, payload)
    assert.equal(scanned.status, 200, await scanned.clone().text())
    assert.equal(await scanned.text(), 'success')
    assert.equal(scanned.headers.getSetCookie().length, 0)
    assert.equal((await json(await local('/api/me'))).user, null)

    const authenticated = await poll(flow)
    assert.deepEqual(await json(authenticated.clone()), { status: 'authenticated' })
    const session = authenticated.headers.getSetCookie().find(value => value.startsWith('__Host-zhiyu_session='))
    assert.ok(session, 'Workers must issue a session only to the browser poll')
    for (const flag of ['HttpOnly', 'Secure', 'SameSite=Lax', 'Path=/']) assert.ok(session.includes(flag))
    const state = await json(await local('/api/me', { headers: { Cookie: session.split(';')[0] } }))
    assert.equal(state.authMode, 'wechat')
    assert.equal(state.user.role, 'student')
    assert.deepEqual(state.wechat, { linked: true })
    if (firstUser) assert.equal(state.user.id, firstUser)
    else firstUser = state.user.id
    assert.deepEqual(await json(await poll(flow)), { status: 'expired' })
  }
  console.log('WeChat Workers runtime smoke passed: SHA-1/AES verification, SCAN/subscribe callbacks, real D1 sessions, identity reuse, and replay rejection.')
} catch (error) {
  if (output) console.error(output)
  throw error
} finally {
  if (server && server.exitCode === null) {
    const exited = once(server, 'exit')
    server.kill('SIGTERM')
    await Promise.race([exited, delay(5000)])
    if (server.exitCode === null) { server.kill('SIGKILL'); await exited }
  }
  await rm(temporary, { recursive: true, force: true })
}
