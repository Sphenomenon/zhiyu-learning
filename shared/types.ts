export type Language = 'zh' | 'en'
export type SiteContent = {
  heroTitle: string
  heroAccent: string
  heroDescription: string
  instructorName: string
  instructorBio: string
  heroTitleEn: string
  heroAccentEn: string
  heroDescriptionEn: string
  instructorNameEn: string
  instructorBioEn: string
}

export type CourseText = {
  label: string
  title: string
  subtitle: string
  description: string
  duration: string
  level: string
}
export type Course = CourseText & {
  id: string
  index: string
  lessons: number
  color: string
  imageUrl?: string
  en?: CourseText
  hasVideoArchive?: boolean
}

export type LessonBlock =
  | { id: string; type: 'paragraph' | 'heading'; text: string; textEn?: string }
  | { id: string; type: 'image'; url: string; caption: string; captionEn?: string }
export type LessonVideo = { url: string; extractionCode: string; note: string }
export type Lesson = { id: string; title: string; titleEn?: string; blocks: LessonBlock[]; video: LessonVideo | null }
export type Chapter = { id: string; title: string; titleEn?: string; lessons: Lesson[] }
export type Curriculum = { chapters: Chapter[] }
export type CurriculumEntry = { courseId: string; draft: Curriculum; published: Curriculum | null; revision: number; updatedAt: number }
export type CourseOutline = { course: { id: string; title: string; en?: { title: string } }; chapters: { id: string; title: string; titleEn?: string; lessons: { id: string; title: string; titleEn?: string; hasVideo: boolean }[] }[] }
export type LearningContent = { course: CourseOutline['course']; curriculum: Curriculum | null }
export type StoryText = { name: string; role: string; result: string; quote: string }
export type Story = StoryText & { id: string | number; published: boolean; en?: StoryText }
export type ContentKind = 'site' | 'course' | 'case'
export type ContentDocument = SiteContent | Course | Story
export type ContentEntry = {
  kind: ContentKind
  id: string
  draft: ContentDocument
  published: ContentDocument | null
  revision: number
  updatedAt: number
}
export type User = { id: string; displayName: string; role: 'student' | 'admin' }
export type SessionState = {
  user: User | null
  courseIds: string[]
  authMode: 'local' | 'unavailable'
}
export type CourseResource = { url: string; extractionCode: string; note: string; version: number }
export type Student = User & { identity: string; courseIds: string[] }
export type Pagination = { page: number; pageSize: number; total: number }
export type Paginated<T> = { items: T[]; pagination: Pagination }
export type ManualOrder = { id: string; userId: string; displayName: string; courseId: string; amountCents: number; note: string; createdAt: number }
export type RedemptionCode = {
  id: string
  hint: string
  courseIds: string[]
  createdAt: number
  expiresAt: number | null
  accessExpiresAt: number | null
  status: 'available' | 'redeemed' | 'revoked' | 'expired'
  redeemedBy: string | null
  redeemedAt: number | null
  revokedAt: number | null
}
