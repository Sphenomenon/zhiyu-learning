import { spawn } from 'node:child_process'
import { mkdtemp, rm } from 'node:fs/promises'
import { tmpdir } from 'node:os'
import { join } from 'node:path'
import { createServer } from 'node:net'
import { once } from 'node:events'
import { setTimeout as delay } from 'node:timers/promises'
import { prepareLocalDatabase, wrangler } from './db-local.mjs'
import { prepareAdminListFixtures } from '../tests/admin-list-fixtures.mjs'

const temporary = await mkdtemp(join(tmpdir(), 'zhiyu-api-test-'))
let server
let output = ''
try {
  await prepareLocalDatabase(temporary)
  await prepareAdminListFixtures(temporary)
  const socket = createServer()
  socket.listen(0, '127.0.0.1')
  await once(socket, 'listening')
  const port = socket.address().port
  await new Promise(resolve => socket.close(resolve))
  const base = `http://127.0.0.1:${port}`
  server = spawn(process.execPath, [wrangler, 'pages', 'dev', 'public', '--ip', '127.0.0.1', '--port', String(port), '--persist-to', temporary,
    '--binding', 'AUTH_MODE=local', '--binding', 'LOCAL_ADMIN_EMAIL=admin@zhiyu.local'], { stdio: ['ignore', 'pipe', 'pipe'] })
  server.stdout.on('data', data => { output = (output + data).slice(-20000) })
  server.stderr.on('data', data => { output = (output + data).slice(-20000) })
  let ready = false
  for (let attempt = 0; attempt < 100; attempt++) {
    if (server.exitCode !== null) throw new Error(`Local runtime exited: ${output}`)
    try { ready = (await fetch(`${base}/api/health`, { signal: AbortSignal.timeout(1000) })).ok } catch { /* still starting */ }
    if (ready) break
    await delay(200)
  }
  if (!ready) throw new Error(`Local runtime did not start: ${output}`)
  const tests = spawn(process.execPath, ['--test', 'tests/backend.test.mjs', 'tests/local-auth.test.mjs'], { stdio: 'inherit', env: { ...process.env, TEST_API_BASE: base } })
  const [code] = await once(tests, 'exit')
  if (code !== 0) { console.error(output); process.exitCode = code || 1 }
} finally {
  if (server && server.exitCode === null) {
    const exited = once(server, 'exit')
    server.kill('SIGTERM')
    await Promise.race([exited, delay(5000)])
    if (server.exitCode === null) { server.kill('SIGKILL'); await exited }
  }
  // Only the isolated test directory created above is removed; developer data stays.
  await rm(temporary, { recursive: true, force: true })
}
