import { readFile, writeFile, mkdtemp, rm } from 'node:fs/promises'
import { spawn } from 'node:child_process'
import { tmpdir } from 'node:os'
import { join } from 'node:path'
import { publicSeedSql } from './public-seed.mjs'

export const projectName = 'zhiyu-learning'
export function deploymentConfig(environment) {
  const account = environment.CLOUDFLARE_ACCOUNT_ID || ''
  const database = environment.CLOUDFLARE_D1_DATABASE_ID || ''
  const bucket = environment.CLOUDFLARE_R2_BUCKET || 'zhiyu-course-images'
  if (!/^[a-f0-9]{32}$/i.test(account)) throw new Error('Set CLOUDFLARE_ACCOUNT_ID in GitHub Actions variables.')
  if (!/^[a-f0-9]{8}-[a-f0-9]{4}-[a-f0-9]{4}-[a-f0-9]{4}-[a-f0-9]{12}$/i.test(database) || /^0{8}-0{4}-0{4}-0{4}-0{12}$/.test(database)) throw new Error('Set the real production CLOUDFLARE_D1_DATABASE_ID; local placeholders are not deployable.')
  if (!/^[a-z0-9][a-z0-9-]{1,61}[a-z0-9]$/.test(bucket)) throw new Error('Invalid CLOUDFLARE_R2_BUCKET.')
  const authMode = environment.AUTH_MODE || 'disabled'
  if (!['disabled', 'wechat'].includes(authMode)) throw new Error('Production AUTH_MODE must be disabled or wechat; local test login cannot be deployed.')
  const vars = { AUTH_MODE: authMode }
  if (authMode === 'wechat') {
    if (!/^wx[a-f0-9]{16}$/i.test(environment.WECHAT_APP_ID || '')) throw new Error('Set the official account WECHAT_APP_ID in GitHub Actions variables.')
    let callback
    try { callback = new URL(environment.WECHAT_SERVER_URL) } catch { throw new Error('Set WECHAT_SERVER_URL to the HTTPS message callback.') }
    if (callback.protocol !== 'https:' || callback.username || callback.password || callback.search || callback.hash ||
      callback.port || callback.pathname !== '/api/auth/wechat/events' || ['localhost', '127.0.0.1', '[::1]'].includes(callback.hostname)) throw new Error('WECHAT_SERVER_URL must use the production HTTPS domain on port 443 and /api/auth/wechat/events path.')
    vars.WECHAT_APP_ID = environment.WECHAT_APP_ID
    vars.WECHAT_SERVER_URL = callback.href
  }
  return {
    name: projectName, account_id: account, pages_build_output_dir: './dist', compatibility_date: '2026-09-09',
    compatibility_flags: ['nodejs_compat'],
    // AppSecret is a separate encrypted Pages secret, never a plaintext var.
    vars,
    d1_databases: [{ binding: 'DB', database_id: database, migrations_dir: 'migrations' }],
    r2_buckets: [{ binding: 'COURSE_IMAGES', bucket_name: bucket }],
  }
}
export function checkProject(project, config) {
  if (project.name !== projectName || project.production_branch !== 'main') throw new Error('Expected existing zhiyu-learning Pages project with production branch main.')
  const production = project.deployment_configs?.production || {}
  const database = production.d1_databases?.DB?.id
  const bucket = production.r2_buckets?.COURSE_IMAGES?.name
  if (database && database !== config.d1_databases[0].database_id) throw new Error('Refusing to replace the existing production DB binding.')
  if (bucket && bucket !== config.r2_buckets[0].bucket_name) throw new Error('Refusing to replace the existing production image bucket.')
  const existing = production.env_vars || {}
  if (existing.AUTH_MODE?.value && existing.AUTH_MODE.value !== 'disabled' && existing.AUTH_MODE.value !== config.vars.AUTH_MODE) throw new Error('Production authentication differs from this release; review it before deploying.')
  if (config.vars.AUTH_MODE === 'wechat') {
    for (const key of ['WECHAT_APP_SECRET', 'WECHAT_WEBHOOK_TOKEN', 'WECHAT_ENCODING_AES_KEY']) {
      if (existing[key]?.type !== 'secret_text') throw new Error(`Configure ${key} as an encrypted secret in Cloudflare Pages production before deploying.`)
    }
    if (existing.WECHAT_APP_ID?.value && existing.WECHAT_APP_ID.value !== config.vars.WECHAT_APP_ID) throw new Error('Refusing to change the official account AppID: existing WeChat identities belong to that account.')
  }
}
async function command(args) {
  await new Promise((resolve, reject) => {
    const child = spawn(process.execPath, ['node_modules/wrangler/bin/wrangler.js', ...args], { stdio: 'inherit' })
    child.on('error', reject)
    child.on('exit', code => code === 0 ? resolve() : reject(new Error(`Wrangler exited with ${code}`)))
  })
}
async function deploy() {
  if (process.env.GITHUB_ACTIONS !== 'true' || process.env.GITHUB_REF !== 'refs/heads/main') throw new Error('Run the GitHub deployment workflow on main.')
  if (!process.env.CLOUDFLARE_API_TOKEN) throw new Error('Missing GitHub Actions secret CLOUDFLARE_API_TOKEN.')
  const config = deploymentConfig(process.env)
  const cloudflare = async path => {
    const response = await fetch(`https://api.cloudflare.com/client/v4/accounts/${config.account_id}${path}`, { headers: { Authorization: `Bearer ${process.env.CLOUDFLARE_API_TOKEN}` }, signal: AbortSignal.timeout(30_000) })
    const data = await response.json()
    if (!response.ok || !data.success) throw new Error(`Cloudflare preflight failed (${response.status}) for ${path}. Check the token permissions and resource configuration.`)
    return data.result
  }
  const project = await cloudflare(`/pages/projects/${projectName}`)
  checkProject(project, config)
  await cloudflare(`/d1/database/${config.d1_databases[0].database_id}`)
  await cloudflare(`/r2/buckets/${config.r2_buckets[0].bucket_name}`)
  const original = await readFile('wrangler.jsonc', 'utf8')
  const temporary = await mkdtemp(join(tmpdir(), 'zhiyu-deploy-'))
  try {
    await writeFile('wrangler.jsonc', JSON.stringify(config, null, 2) + '\n')
    await command(['d1', 'migrations', 'apply', 'DB', '--remote'])
    if (process.env.SEED_PUBLIC_DEMO === 'true') {
      const path = join(temporary, 'public-starter.sql')
      await writeFile(path, publicSeedSql())
      await command(['d1', 'execute', 'DB', '--remote', '--file', path])
    }
    await command(['pages', 'deploy', 'dist', '--project-name', projectName, '--branch', 'main', '--commit-hash', process.env.GITHUB_SHA, '--commit-dirty=true'])
  } finally {
    await writeFile('wrangler.jsonc', original)
    await rm(temporary, { recursive: true, force: true })
  }
  const url = config.vars.AUTH_MODE === 'wechat' ? new URL(config.vars.WECHAT_SERVER_URL).origin : `https://${projectName}.pages.dev`
  let healthy = false
  for (let attempt = 0; attempt < 10; attempt++) {
    try {
      const health = await fetch(`${url}/api/health`, { cache: 'no-store', signal: AbortSignal.timeout(10_000) })
      const site = await fetch(`${url}/api/site`, { cache: 'no-store', signal: AbortSignal.timeout(10_000) })
      const admin = await fetch(`${url}/api/admin/content`, { cache: 'no-store', signal: AbortSignal.timeout(10_000) })
      const me = await fetch(`${url}/api/me`, { cache: 'no-store', signal: AbortSignal.timeout(10_000) })
      const session = me.ok ? await me.json() : null
      if (health.ok && (await health.json()).ok && site.ok && (await site.json()).content && admin.status === 401 &&
        session?.user === null && session.authMode === (config.vars.AUTH_MODE === 'wechat' ? 'wechat' : 'unavailable')) { healthy = true; break }
    } catch { /* Retry while the new deployment propagates. */ }
    await new Promise(resolve => setTimeout(resolve, 3000))
  }
  if (!healthy) throw new Error('Deployment uploaded, but production API verification failed. Inspect the deployment before treating it as ready.')
  console.log(`Production API verified: ${url}. Authentication mode: ${config.vars.AUTH_MODE}.`)
  if (config.vars.AUTH_MODE === 'wechat') console.log('Complete a real QR scan for both a follower and a new follower to verify official-account permissions and the encrypted message callback.')
}
if (process.argv[1] === import.meta.filename) await deploy()
