import { spawn } from 'node:child_process'
import { mkdtemp, writeFile, rm } from 'node:fs/promises'
import { tmpdir } from 'node:os'
import { join } from 'node:path'
import { courses } from '../src/data.ts'
import { defaultContent, defaultStories, englishCourses, englishStories, courseImages } from '../src/catalog.ts'

export const wrangler = join(import.meta.dirname, '../node_modules/wrangler/bin/wrangler.js')
export function command(args, options = {}) {
  return new Promise((resolve, reject) => {
    const child = spawn(process.execPath, [wrangler, ...args], { stdio: 'inherit', ...options })
    child.on('error', reject)
    child.on('exit', code => code === 0 ? resolve() : reject(new Error(`Wrangler exited with ${code}`)))
  })
}
const sqlString = value => `'${value.replaceAll("'", "''")}'`
export async function prepareLocalDatabase(persistTo) {
  const storage = persistTo ? ['--persist-to', persistTo] : []
  await command(['d1', 'migrations', 'apply', 'DB', '--local', ...storage])
  const temporary = await mkdtemp(join(tmpdir(), 'zhiyu-seed-'))
  try {
    const documents = [
      ['site', 'home', defaultContent],
      ...courses.map((course, index) => ['course', course.id, { ...course, imageUrl: courseImages[index], en: englishCourses[course.id] }]),
      ...defaultStories.map(story => ['case', String(story.id), { ...story, id: String(story.id), en: englishStories[story.id] }]),
    ]
    const sql = [
      ...courses.map(course => `INSERT OR IGNORE INTO courses (id) VALUES (${sqlString(course.id)});`),
      ...documents.map(([kind, id, document]) => `INSERT OR IGNORE INTO content_entries (kind, id, draft_json, published_json, updated_at) VALUES (${sqlString(kind)}, ${sqlString(id)}, ${sqlString(JSON.stringify(document))}, ${sqlString(JSON.stringify(document))}, unixepoch());`),
    ].join('\n')
    const path = join(temporary, 'public-demo-seed.sql')
    await writeFile(path, sql)
    await command(['d1', 'execute', 'DB', '--local', '--file', path, ...storage])
  } finally {
    await rm(temporary, { recursive: true, force: true })
  }
}
if (process.argv[1] === import.meta.filename) await prepareLocalDatabase()
