import { spawn } from 'node:child_process'
import { prepareLocalDatabase, wrangler } from './db-local.mjs'

await prepareLocalDatabase()
const children = []
let stopping = false
function start(executable, args) {
  const child = spawn(process.execPath, [executable, ...args], { stdio: 'inherit' })
  children.push(child)
  child.on('error', error => { console.error(error.message); stop(1) })
  child.on('exit', code => { if (!stopping) stop(code || 0) })
  return child
}
function stop(code) {
  if (stopping) return
  stopping = true
  for (const child of children) child.kill('SIGTERM')
  process.exitCode = code
}
process.on('SIGINT', () => stop(0))
process.on('SIGTERM', () => stop(0))
console.log('\nLocal-only login: admin@zhiyu.local is the test administrator. Other email labels create test learners.\nOpen http://127.0.0.1:5173 — verification codes appear on the local login form; no messages are sent.\n')
start(wrangler, ['pages', 'dev', 'public', '--ip', '127.0.0.1', '--port', '8788', '--binding', 'AUTH_MODE=local', '--binding', 'LOCAL_ADMIN_EMAIL=admin@zhiyu.local'])
start(new URL('../node_modules/vite/bin/vite.js', import.meta.url).pathname, ['--config', 'vite.config.ts', '--host', '127.0.0.1'])
