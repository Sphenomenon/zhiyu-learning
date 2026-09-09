import type { ContentDocument, ContentEntry, ContentKind, CourseText, SiteContent, StoryText } from '../shared/types.ts'
import { type Env, audit, body, fail, integer, json, now, text } from './http.ts'
import { requireUser } from './auth.ts'

type EntryRow = { kind: ContentKind; id: string; draft_json: string; published_json: string | null; revision: number; updated_at: number }
export function decodeEntry(row: EntryRow): ContentEntry {
  return { kind: row.kind, id: row.id, draft: JSON.parse(row.draft_json), published: row.published_json ? JSON.parse(row.published_json) : null, revision: row.revision, updatedAt: row.updated_at }
}
export function contentKind(value: string): ContentKind {
  if (!['site', 'course', 'case'].includes(value)) return fail(404, 'NOT_FOUND')
  return value as ContentKind
}
export function contentId(value: string) {
  if (!/^[a-zA-Z0-9][a-zA-Z0-9_-]{0,63}$/.test(value)) return fail(400, 'INVALID_INPUT')
  return value
}
function object(value: unknown) {
  if (!value || typeof value !== 'object' || Array.isArray(value)) return fail(400, 'INVALID_INPUT')
  return value as Record<string, unknown>
}
function courseText(value: unknown): CourseText {
  const row = object(value)
  return { title: text(row.title, 160), label: text(row.label, 80), subtitle: text(row.subtitle, 240), description: text(row.description, 4000), duration: text(row.duration, 80), level: text(row.level, 80) }
}
function storyText(value: unknown): StoryText {
  const row = object(value)
  return { name: text(row.name, 80), role: text(row.role, 160), result: text(row.result, 500), quote: text(row.quote, 4000) }
}
function imageUrl(value: unknown) {
  const url = text(value || '/images/course-structure.jpg', 2000)
  if (/^\/images\/[a-zA-Z0-9_./-]+$/.test(url) && !url.includes('..')) return url
  try { const parsed = new URL(url); if (parsed.protocol === 'https:' && !parsed.username && !parsed.password) return parsed.href } catch { /* validated below */ }
  return fail(400, 'INVALID_IMAGE_URL')
}
// Whitelist every public field. Accidental private fields in an admin request
// (or a future UI change) can never leak through a generic JSON document.
export function validateDocument(kind: ContentKind, id: string, value: unknown): ContentDocument {
  const data = object(value)
  if (kind === 'site') {
    if (id !== 'home') return fail(400, 'INVALID_INPUT')
    const result = {} as SiteContent
    for (const key of ['heroTitle', 'heroAccent', 'heroDescription', 'instructorName', 'instructorBio', 'heroTitleEn', 'heroAccentEn', 'heroDescriptionEn', 'instructorNameEn', 'instructorBioEn'] as const) {
      result[key] = text(data[key], key.includes('Bio') || key.includes('Description') ? 4000 : 160)
    }
    return result
  }
  if (kind === 'course') return {
    ...courseText(data), id, index: text(data.index, 8), lessons: integer(data.lessons, 0, 5000),
    color: ['acid', 'coral', 'violet'].includes(String(data.color)) ? String(data.color) : 'acid',
    imageUrl: imageUrl(data.imageUrl), ...(data.en ? { en: courseText(data.en) } : {}),
  }
  return { ...storyText(data), id, published: true, ...(data.en ? { en: storyText(data.en) } : {}) }
}
export async function publicContent(env: Env, kind: ContentKind) {
  const rows = await env.DB.prepare(`SELECT c.published_json,
    (SELECT SUM(json_array_length(chapter.value, '$.lessons')) FROM course_curricula l, json_each(l.published_json, '$.chapters') chapter
      WHERE l.course_id = c.id AND c.kind = 'course') AS lesson_count
    FROM content_entries c WHERE c.kind = ? AND c.published_json IS NOT NULL ORDER BY c.id`)
    .bind(kind).all<{ published_json: string; lesson_count: number | null }>()
  const items = rows.results.map(row => ({ ...JSON.parse(row.published_json), ...(row.lesson_count !== null ? { lessons: row.lesson_count } : {}) }))
  if (kind === 'course') items.sort((a, b) => a.index.localeCompare(b.index))
  return json(kind === 'site' ? { content: items[0] ?? null } : { items })
}
export async function listContent(request: Request, env: Env) {
  await requireUser(request, env, true)
  const rows = await env.DB.prepare('SELECT * FROM content_entries ORDER BY kind, id').all<EntryRow>()
  return json({ items: rows.results.map(decodeEntry) })
}
export async function saveContent(request: Request, env: Env, kind: ContentKind, id: string) {
  const admin = await requireUser(request, env, true)
  const input = await body(request)
  const revision = integer(input.revision, 0, Number.MAX_SAFE_INTEGER - 1)
  const action = text(input.action, 20)
  if (!['draft', 'publish', 'unpublish'].includes(action)) return fail(400, 'INVALID_INPUT')
  if (kind === 'site' && action === 'unpublish') return fail(400, 'INVALID_INPUT')
  const draft = JSON.stringify(validateDocument(kind, id, input.draft))
  const published = action === 'publish' ? draft : null
  if (revision === 0) {
    // A unique insert fails on stale/new-item collisions, preserving the first save.
    try {
      await env.DB.batch([
        ...(kind === 'course' ? [env.DB.prepare('INSERT OR IGNORE INTO courses (id) VALUES (?)').bind(id)] : []),
        env.DB.prepare('INSERT INTO content_entries (kind, id, draft_json, published_json, updated_at) VALUES (?, ?, ?, ?, ?)')
          .bind(kind, id, draft, published, now()),
        audit(env, admin.id, `content.${action}`, `${kind}:${id}`, 'revision:1'),
      ])
    } catch (error) {
      if (error instanceof Error && error.message.includes('UNIQUE constraint')) return fail(409, 'REVISION_CONFLICT')
      throw error
    }
  } else {
    // Compare-and-swap and its conditional audit run in the same transaction.
    const result = await env.DB.batch([
      env.DB.prepare(`UPDATE content_entries SET draft_json = ?,
        published_json = CASE WHEN ? = 'draft' THEN published_json ELSE ? END,
        revision = revision + 1, updated_at = ? WHERE kind = ? AND id = ? AND revision = ?`)
        .bind(draft, action, published, now(), kind, id, revision),
      env.DB.prepare(`INSERT INTO audit_logs (actor_id, action, target_id, detail, created_at)
        SELECT ?, ?, ?, ?, ? WHERE changes() > 0`).bind(admin.id, `content.${action}`, `${kind}:${id}`, `revision:${revision + 1}`, now()),
    ])
    if (!result[0].meta.changes) return fail(409, 'REVISION_CONFLICT')
  }
  const row = await env.DB.prepare('SELECT * FROM content_entries WHERE kind = ? AND id = ?').bind(kind, id).first<EntryRow>()
  return json({ item: decodeEntry(row!) })
}
