import test from 'node:test'
import assert from 'node:assert/strict'
import { deploymentConfig, checkProject } from '../scripts/deploy-cloudflare.mjs'
import { publicSeedSql } from '../scripts/public-seed.mjs'

const environment = { CLOUDFLARE_ACCOUNT_ID: 'a'.repeat(32), CLOUDFLARE_D1_DATABASE_ID: '12345678-1234-1234-1234-123456789abc' }
test('production configuration rejects missing or local database IDs and always disables development login', () => {
  assert.throws(() => deploymentConfig({}))
  assert.throws(() => deploymentConfig({ ...environment, CLOUDFLARE_D1_DATABASE_ID: '00000000-0000-0000-0000-000000000000' }))
  const config = deploymentConfig({ ...environment, AUTH_MODE: 'local' })
  assert.deepEqual(config.vars, { AUTH_MODE: 'disabled' })
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
