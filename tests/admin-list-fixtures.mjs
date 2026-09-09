import { writeFile } from 'node:fs/promises'
import { join } from 'node:path'
import { hash } from '../server/http.ts'
import { command } from '../scripts/db-local.mjs'

// Only the isolated integration database receives these synthetic records.
export async function prepareAdminListFixtures(directory) {
  const sql = []
  for (let index = 0; index < 225; index++) {
    const suffix = String(index).padStart(3, '0')
    sql.push(`INSERT INTO users (id, display_name, role, created_at) VALUES ('fixture-learner-${suffix}', '分页学员 ${suffix}', 'student', 1);`)
    sql.push(`INSERT INTO auth_identities (provider, subject, user_id) VALUES ('local', 'page${suffix}@example.test', 'fixture-learner-${suffix}');`)
  }
  for (let index = 0; index < 225; index++) {
    const suffix = String(index).padStart(3, '0')
    const status = index % 5
    sql.push(`INSERT INTO redemption_codes (id, code_hash, hint, created_by, created_at, expires_at, access_expires_at, revoked_at, redeemed_at, redeemed_by)
      VALUES ('fixture-key-${suffix}', '${await hash(`unredeemable-fixture-${suffix}`)}', '…TEST${suffix}', 'fixture-learner-000', 1,
      ${status === 2 ? 1 : 'NULL'}, ${status === 3 ? 1 : 'NULL'}, ${status === 1 ? 1 : 'NULL'}, ${status === 4 ? 1 : 'NULL'}, ${status === 4 ? "'fixture-learner-000'" : 'NULL'});`)
    sql.push(`INSERT INTO code_courses (code_id, course_id) VALUES ('fixture-key-${suffix}', 'method');`)
  }
  const path = join(directory, 'admin-list-fixtures.sql')
  await writeFile(path, sql.join('\n'))
  await command(['d1', 'execute', 'DB', '--local', '--persist-to', directory, '--file', path, '--yes'], { stdio: 'ignore' })
}
