import { spawn } from 'node:child_process'
import { mkdtemp, writeFile, rm } from 'node:fs/promises'
import { tmpdir } from 'node:os'
import { join } from 'node:path'
import { publicSeedSql } from './public-seed.mjs'

export const wrangler = join(import.meta.dirname, '../node_modules/wrangler/bin/wrangler.js')
export function command(args, options = {}) {
  return new Promise((resolve, reject) => {
    const child = spawn(process.execPath, [wrangler, ...args], { stdio: 'inherit', ...options })
    child.on('error', reject)
    child.on('exit', code => code === 0 ? resolve() : reject(new Error(`Wrangler exited with ${code}`)))
  })
}
export async function prepareLocalDatabase(persistTo) {
  const storage = persistTo ? ['--persist-to', persistTo] : []
  await command(['d1', 'migrations', 'apply', 'DB', '--local', ...storage])
  const temporary = await mkdtemp(join(tmpdir(), 'zhiyu-seed-'))
  try {
    const path = join(temporary, 'public-demo-seed.sql')
    await writeFile(path, publicSeedSql())
    await command(['d1', 'execute', 'DB', '--local', '--file', path, ...storage])
  } finally {
    await rm(temporary, { recursive: true, force: true })
  }
}
if (process.argv[1] === import.meta.filename) await prepareLocalDatabase()
