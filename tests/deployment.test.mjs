import test from 'node:test'
import assert from 'node:assert/strict'
import { execFile } from 'node:child_process'
import { mkdtemp, rm, writeFile } from 'node:fs/promises'
import { tmpdir } from 'node:os'
import { join, resolve } from 'node:path'
import { promisify } from 'node:util'
import { deploymentConfig, checkProject } from '../scripts/deploy-cloudflare.mjs'
import { publicSeedSql } from '../scripts/public-seed.mjs'

const environment = { CLOUDFLARE_ACCOUNT_ID: 'a'.repeat(32), CLOUDFLARE_D1_DATABASE_ID: '12345678-1234-1234-1234-123456789abc' }
test('generated production config passes the installed Wrangler Pages validator and compiles Functions', async () => {
  const temporary = await mkdtemp(join(tmpdir(), 'zhiyu-pages-config-'))
  try {
    await writeFile(join(temporary, 'wrangler.jsonc'), JSON.stringify(deploymentConfig(environment)))
    await promisify(execFile)(process.execPath, [resolve('node_modules/wrangler/bin/wrangler.js'),
      'pages', 'functions', 'build', resolve('functions'), '--project-directory', temporary,
      '--outdir', join(temporary, 'compiled')], { env: { ...process.env, WRANGLER_SEND_METRICS: 'false' } })
  } finally { await rm(temporary, { recursive: true, force: true }) }
})
test('production configuration rejects missing or local database IDs and always disables development login', () => {
  assert.throws(() => deploymentConfig({}))
  assert.throws(() => deploymentConfig({ ...environment, CLOUDFLARE_D1_DATABASE_ID: '00000000-0000-0000-0000-000000000000' }))
  assert.throws(() => deploymentConfig({ ...environment, AUTH_MODE: 'local' }))
  const config = deploymentConfig(environment)
  assert.deepEqual(config.vars, { AUTH_MODE: 'disabled' })
})
test('WeChat deployment requires a production callback and preserves the secret outside generated config', () => {
  const wechat = { ...environment, AUTH_MODE: 'wechat', WECHAT_APP_ID: 'wx1234567890abcdef', WECHAT_SERVER_URL: 'https://courses.example/api/auth/wechat/events' }
  const config = deploymentConfig({ ...wechat, WECHAT_APP_SECRET: 'must-not-be-serialized' })
  assert.deepEqual(config.vars, { AUTH_MODE: 'wechat', WECHAT_APP_ID: wechat.WECHAT_APP_ID, WECHAT_SERVER_URL: wechat.WECHAT_SERVER_URL })
  assert.deepEqual(config.compatibility_flags, ['nodejs_compat'])
  assert.equal(JSON.stringify(config).includes('must-not-be-serialized'), false)
  assert.throws(() => deploymentConfig({ ...wechat, WECHAT_APP_ID: '' }))
  for (const uri of ['http://courses.example/api/auth/wechat/events', 'https://localhost/api/auth/wechat/events', 'https://courses.example/wrong', 'https://courses.example/api/auth/wechat/events?next=evil', 'https://name:password@courses.example/api/auth/wechat/events', 'https://courses.example:8443/api/auth/wechat/events']) {
    assert.throws(() => deploymentConfig({ ...wechat, WECHAT_SERVER_URL: uri }))
  }
  const project = { name: 'zhiyu-learning', production_branch: 'main', deployment_configs: { production: { env_vars: {
    AUTH_MODE: { value: 'disabled' }, WECHAT_APP_SECRET: { type: 'secret_text' },
    WECHAT_WEBHOOK_TOKEN: { type: 'secret_text' }, WECHAT_ENCODING_AES_KEY: { type: 'secret_text' },
  } } } }
  assert.doesNotThrow(() => checkProject(project, config))
  assert.throws(() => checkProject({ ...project, deployment_configs: {} }, config))
  for (const key of ['WECHAT_APP_SECRET', 'WECHAT_WEBHOOK_TOKEN', 'WECHAT_ENCODING_AES_KEY']) {
    project.deployment_configs.production.env_vars[key].type = 'plain_text'
    assert.throws(() => checkProject(project, config))
    project.deployment_configs.production.env_vars[key].type = 'secret_text'
  }
  project.deployment_configs.production.env_vars.WECHAT_APP_SECRET.type = 'plain_text'
  assert.throws(() => checkProject(project, config))
  project.deployment_configs.production.env_vars.WECHAT_APP_SECRET.type = 'secret_text'
  project.deployment_configs.production.env_vars.WECHAT_APP_ID = { value: 'wx0000000000000000' }
  assert.throws(() => checkProject(project, config))
})
test('image storage is optional and binds only an explicitly configured bucket', () => {
  assert.deepEqual(deploymentConfig(environment).r2_buckets, [])
  assert.deepEqual(deploymentConfig({ ...environment, CLOUDFLARE_R2_BUCKET: '' }).r2_buckets, [])
  const config = deploymentConfig({ ...environment, CLOUDFLARE_R2_BUCKET: 'private-images' })
  assert.deepEqual(config.r2_buckets, [{ binding: 'COURSE_IMAGES', bucket_name: 'private-images' }])
  assert.throws(() => deploymentConfig({ ...environment, CLOUDFLARE_R2_BUCKET: 'invalid bucket' }))
  const project = { name: 'zhiyu-learning', production_branch: 'main', deployment_configs: { production: { r2_buckets: { COURSE_IMAGES: { name: 'private-images' } } } } }
  assert.doesNotThrow(() => checkProject(project, config))
  assert.throws(() => checkProject(project, deploymentConfig(environment)), /replace or remove/)
})
test('deployment preflight refuses another project, branch or existing production database', () => {
  const config = deploymentConfig(environment)
  const project = { name: 'zhiyu-learning', production_branch: 'main' }
  assert.doesNotThrow(() => checkProject(project, config))
  assert.throws(() => checkProject({ ...project, name: 'unrelated-project' }, config))
  assert.throws(() => checkProject({ ...project, production_branch: 'release' }, config))
  assert.throws(() => checkProject({ ...project, deployment_configs: { production: { d1_databases: { DB: { id: 'other-database' } } } } }, config))
  assert.throws(() => checkProject({ ...project, deployment_configs: { production: { r2_buckets: { COURSE_IMAGES: { name: 'other-bucket' } } } } }, config))
  assert.throws(() => checkProject({ ...project, deployment_configs: { production: { env_vars: { AUTH_MODE: { value: 'production-provider' } } } } }, config))
})
test('starter seed only inserts missing public catalog content without replacing records or importing local data', () => {
  const sql = publicSeedSql()
  const tables = [...sql.matchAll(/INSERT OR IGNORE INTO (\w+)/g)].map(match => match[1])
  assert.deepEqual([...new Set(tables)].sort(), ['content_entries', 'courses'])
  assert.equal(tables.length, 11)
  assert.doesNotMatch(sql, /\b(?:DELETE|UPDATE|REPLACE)\b|pan\.baidu\.com|zhiyu_session|lesson-demo/)
})
