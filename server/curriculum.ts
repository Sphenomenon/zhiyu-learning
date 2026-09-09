import type { Course, Curriculum, CurriculumEntry, LessonBlock, LessonVideo } from '../shared/types.ts'
import { currentUser, requireUser } from './auth.ts'
import { contentId } from './content.ts'
import { type Env, audit, body, fail, integer, json, limit, now, readBytes, text } from './http.ts'

type CurriculumRow = { course_id: string; draft_json: string; published_json: string | null; revision: number; updated_at: number }
const decode = (row: CurriculumRow): CurriculumEntry => ({ courseId: row.course_id, draft: JSON.parse(row.draft_json), published: row.published_json ? JSON.parse(row.published_json) : null, revision: row.revision, updatedAt: row.updated_at })
const object = (value: unknown): Record<string, unknown> => {
  if (!value || typeof value !== 'object' || Array.isArray(value)) return fail(400, 'INVALID_INPUT')
  return value as Record<string, unknown>
}
function array(value: unknown, maximum: number): unknown[] {
  if (!Array.isArray(value) || value.length > maximum) return fail(400, 'CURRICULUM_LIMIT')
  return value
}
function imageUrl(value: unknown, courseId: string, publishing: boolean) {
  const url = text(value, 2000, !publishing)
  if (!url) return ''
  if (url.startsWith(`/api/courses/${courseId}/images/`) && /^[a-f0-9-]{36}$/.test(url.split('/').at(-1)!)) return url
  if (/^\/images\/[a-zA-Z0-9_./-]+$/.test(url) && !url.includes('..')) return url
  try { const parsed = new URL(url); if (parsed.protocol === 'https:' && !parsed.username && !parsed.password) return parsed.href } catch { /* rejected below */ }
  return fail(400, 'INVALID_IMAGE_URL')
}
function video(value: unknown): LessonVideo | null {
  if (value == null) return null
  const data = object(value)
  const raw = text(data.url ?? '', 2000, true)
  if (!raw) return null
  let url: URL
  try { url = new URL(raw) } catch { return fail(400, 'INVALID_RESOURCE_URL') }
  if (url.protocol !== 'https:' || url.hostname !== 'pan.baidu.com' || url.username || url.password || url.port || !/^\/s\/[a-zA-Z0-9_-]+$/.test(url.pathname)) return fail(400, 'INVALID_RESOURCE_URL')
  const extractionCode = text(data.extractionCode || url.searchParams.get('pwd') || '', 4, true)
  if (extractionCode && !/^[a-zA-Z0-9]{4}$/.test(extractionCode)) return fail(400, 'INVALID_EXTRACTION_CODE')
  if (extractionCode) url.searchParams.set('pwd', extractionCode)
  return { url: url.href, extractionCode, note: text(data.note ?? '', 2000, true) }
}
export function validateCurriculum(value: unknown, courseId: string, publishing: boolean): Curriculum {
  const ids = new Set<string>()
  const id = (value: unknown) => {
    const result = contentId(text(value, 64))
    if (ids.has(result)) return fail(400, 'DUPLICATE_LESSON_ID')
    ids.add(result); return result
  }
  let lessonCount = 0
  const chapters = array(object(value).chapters, 50).map(value => {
    const chapter = object(value)
    const chapterId = id(chapter.id)
    const lessons = array(chapter.lessons, 100).map(value => {
      if (++lessonCount > 500) return fail(400, 'CURRICULUM_LIMIT')
      const lesson = object(value)
      const lessonId = id(lesson.id)
      const blocks: LessonBlock[] = array(lesson.blocks, 100).map(value => {
        const block = object(value)
        const blockId = id(block.id)
        if (block.type === 'image') return { id: blockId, type: 'image', url: imageUrl(block.url, courseId, publishing), caption: text(block.caption ?? '', 500, true), captionEn: text(block.captionEn ?? '', 500, true) }
        if (block.type !== 'paragraph' && block.type !== 'heading') return fail(400, 'INVALID_INPUT')
        const maximum = block.type === 'heading' ? 240 : 12000
        return { id: blockId, type: block.type, text: text(block.text, maximum, !publishing), textEn: text(block.textEn ?? '', maximum, true) }
      })
      const lessonVideo = video(lesson.video)
      if (publishing && !blocks.length && !lessonVideo) return fail(400, 'LESSON_EMPTY')
      return { id: lessonId, title: text(lesson.title, 160, !publishing), titleEn: text(lesson.titleEn ?? '', 160, true), blocks, video: lessonVideo }
    })
    if (publishing && !lessons.length) return fail(400, 'LESSON_EMPTY')
    return { id: chapterId, title: text(chapter.title, 160, !publishing), titleEn: text(chapter.titleEn ?? '', 160, true), lessons }
  })
  if (publishing && !chapters.length) return fail(400, 'LESSON_EMPTY')
  return { chapters }
}
async function requireCourse(env: Env, id: string) {
  if (!await env.DB.prepare('SELECT id FROM courses WHERE id = ?').bind(id).first()) return fail(404, 'NOT_FOUND')
}
export async function adminCurriculum(request: Request, env: Env, id: string) {
  const admin = await requireUser(request, env, true)
  await requireCourse(env, id)
  const select = () => env.DB.prepare('SELECT * FROM course_curricula WHERE course_id = ?').bind(id)
  if (request.method === 'GET') {
    const row = await select().first<CurriculumRow>()
    return json({ item: row ? decode(row) : { courseId: id, draft: { chapters: [] }, published: null, revision: 0, updatedAt: 0 } })
  }
  const input = await body(request, 1_000_000)
  const revision = integer(input.revision, 0, Number.MAX_SAFE_INTEGER - 1)
  const action = text(input.action, 20)
  if (!['draft', 'publish', 'unpublish'].includes(action)) return fail(400, 'INVALID_INPUT')
  const draft = JSON.stringify(validateCurriculum(input.draft, id, action === 'publish'))
  const published = action === 'publish' ? draft : null
  let result: D1Result[]
  if (revision === 0) {
    try {
      result = await env.DB.batch([
        env.DB.prepare('INSERT INTO course_curricula (course_id, draft_json, published_json, updated_at) VALUES (?, ?, ?, ?)').bind(id, draft, published, now()),
        audit(env, admin.id, `curriculum.${action}`, id, 'revision:1'), select(),
      ])
    } catch (error) {
      if (error instanceof Error && error.message.includes('UNIQUE constraint')) return fail(409, 'REVISION_CONFLICT')
      throw error
    }
  } else {
    result = await env.DB.batch([
      env.DB.prepare(`UPDATE course_curricula SET draft_json = ?, published_json = CASE WHEN ? = 'draft' THEN published_json ELSE ? END,
        revision = revision + 1, updated_at = ? WHERE course_id = ? AND revision = ?`).bind(draft, action, published, now(), id, revision),
      env.DB.prepare(`INSERT INTO audit_logs (actor_id, action, target_id, detail, created_at) SELECT ?, ?, ?, ?, ? WHERE changes() > 0`)
        .bind(admin.id, `curriculum.${action}`, id, `revision:${revision + 1}`, now()), select(),
    ])
    if (!result[0].meta.changes) return fail(409, 'REVISION_CONFLICT')
  }
  return json({ item: decode(result[2].results[0] as CurriculumRow) })
}
function courseSummary(id: string, value: string | null) {
  const course = value ? JSON.parse(value) as Course : null
  return { id, title: course?.title || '课程内容', en: course?.en || { title: 'Course content' } }
}
export async function courseOutline(env: Env, id: string) {
  const row = await env.DB.prepare(`SELECT c.published_json AS course, l.published_json AS curriculum FROM content_entries c
    LEFT JOIN course_curricula l ON l.course_id = c.id WHERE c.kind = 'course' AND c.id = ? AND c.published_json IS NOT NULL`)
    .bind(id).first<{ course: string; curriculum: string | null }>()
  if (!row) return fail(404, 'NOT_FOUND')
  const curriculum: Curriculum = row.curriculum ? JSON.parse(row.curriculum) : { chapters: [] }
  return json({ course: courseSummary(id, row.course), chapters: curriculum.chapters.map(chapter => ({
    id: chapter.id, title: chapter.title, titleEn: chapter.titleEn,
    lessons: chapter.lessons.map(lesson => ({ id: lesson.id, title: lesson.title, titleEn: lesson.titleEn, hasVideo: Boolean(lesson.video) })),
  })) })
}
async function authorizedCurriculum(request: Request, env: Env, id: string) {
  const user = await requireUser(request, env)
  const row = await env.DB.prepare(`SELECT l.published_json AS curriculum, c.published_json AS course FROM entitlements e
    LEFT JOIN course_curricula l ON l.course_id = e.course_id
    LEFT JOIN content_entries c ON c.kind = 'course' AND c.id = e.course_id
    WHERE e.user_id = ? AND e.course_id = ? AND e.revoked_at IS NULL AND (e.expires_at IS NULL OR e.expires_at > ?)`)
    .bind(user.id, id, now()).first<{ curriculum: string | null; course: string | null }>()
  if (!row) return fail(403, 'COURSE_ACCESS_REQUIRED')
  return { course: courseSummary(id, row.course), curriculum: row.curriculum ? JSON.parse(row.curriculum) as Curriculum : null }
}
export async function learningContent(request: Request, env: Env, id: string) {
  return json(await authorizedCurriculum(request, env, id))
}
function imageType(bytes: Uint8Array) {
  if (bytes.length > 8 && [137,80,78,71,13,10,26,10].every((byte, index) => bytes[index] === byte)) return 'image/png'
  if (bytes.length > 3 && bytes[0] === 255 && bytes[1] === 216 && bytes[2] === 255) return 'image/jpeg'
  if (bytes.length > 12 && new TextDecoder().decode(bytes.slice(0,4)) === 'RIFF' && new TextDecoder().decode(bytes.slice(8,12)) === 'WEBP') return 'image/webp'
  return fail(400, 'INVALID_IMAGE_FILE')
}
export async function uploadCourseImage(request: Request, env: Env, id: string) {
  const admin = await requireUser(request, env, true)
  await requireCourse(env, id)
  if (!env.COURSE_IMAGES) return fail(503, 'IMAGE_STORAGE_UNAVAILABLE')
  await limit(env, `image-upload:${admin.id}`, 60, 600)
  const bytes = await readBytes(request, 5 * 1024 * 1024)
  const contentType = imageType(bytes)
  const imageId = crypto.randomUUID()
  await env.COURSE_IMAGES.put(`${id}/${imageId}`, bytes, { httpMetadata: { contentType } })
  await audit(env, admin.id, 'curriculum.image-upload', `${id}:${imageId}`).run()
  return json({ url: `/api/courses/${id}/images/${imageId}` }, 201)
}
export async function courseImage(request: Request, env: Env, id: string, imageId: string) {
  const user = await currentUser(request, env)
  if (!user) return fail(401, 'LOGIN_REQUIRED')
  if (user.role !== 'admin') {
    const content = await authorizedCurriculum(request, env, id)
    const url = `/api/courses/${id}/images/${imageId}`
    if (!content.curriculum?.chapters.some(chapter => chapter.lessons.some(lesson => lesson.blocks.some(block => block.type === 'image' && block.url === url)))) return fail(404, 'NOT_FOUND')
  }
  if (!env.COURSE_IMAGES) return fail(503, 'IMAGE_STORAGE_UNAVAILABLE')
  const image = await env.COURSE_IMAGES.get(`${id}/${imageId}`)
  if (!image) return fail(404, 'NOT_FOUND')
  return new Response(image.body, { headers: {
    'Content-Type': image.httpMetadata?.contentType || 'application/octet-stream', 'Cache-Control': 'no-store',
    'Content-Security-Policy': "default-src 'none'; sandbox", 'X-Content-Type-Options': 'nosniff', 'Vary': 'Cookie',
    'Referrer-Policy': 'no-referrer',
  } })
}
