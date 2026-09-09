import { courses } from '../src/data.ts'
import { defaultContent, defaultStories, englishCourses, englishStories, courseImages } from '../src/catalog.ts'

const sqlString = value => `'${value.replaceAll("'", "''")}'`

// Only public starter content. Never read the local database or uploaded files.
export function publicSeedSql() {
  const documents = [
    ['site', 'home', defaultContent],
    ...courses.map((course, index) => ['course', course.id, { ...course, imageUrl: courseImages[index], en: englishCourses[course.id] }]),
    ...defaultStories.map(story => ['case', String(story.id), { ...story, id: String(story.id), en: englishStories[story.id] }]),
  ]
  return [
    ...courses.map(course => `INSERT OR IGNORE INTO courses (id) VALUES (${sqlString(course.id)});`),
    ...documents.map(([kind, id, document]) => `INSERT OR IGNORE INTO content_entries (kind, id, draft_json, published_json, updated_at) VALUES (${sqlString(kind)}, ${sqlString(id)}, ${sqlString(JSON.stringify(document))}, ${sqlString(JSON.stringify(document))}, unixepoch());`),
  ].join('\n')
}
