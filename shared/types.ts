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
}
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
export type RedemptionCode = {
  id: string
  hint: string
  courseIds: string[]
  createdAt: number
  expiresAt: number | null
  redeemedBy: string | null
  redeemedAt: number | null
  revokedAt: number | null
}
