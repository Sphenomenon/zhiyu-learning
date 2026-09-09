import { useEffect, useRef, useState } from 'react'
import { ArrowLeft, ArrowRight, BookOpen, LockKeyhole, Video } from 'lucide-react'
import type { CourseOutline, Language, LearningContent, SessionState } from '../shared/types'
import { api, errorMessage } from './api'
import { Notice } from './Account'
import { tx } from './catalog'
import { LessonBlocks, LessonVideoLink } from './LessonContent'

export type LearningRoute = { courseId: string; lessonId?: string }
export function learningRoute(): LearningRoute | null {
  const match = window.location.hash.match(/^#learn\/([a-zA-Z0-9][a-zA-Z0-9_-]{0,63})(?:\/([a-zA-Z0-9][a-zA-Z0-9_-]{0,63}))?$/)
  return match ? { courseId: match[1], lessonId: match[2] } : null
}
export const learningHref = (courseId: string, lessonId?: string) => `#learn/${courseId}${lessonId ? `/${lessonId}` : ''}`

export function LearningView({ route, session, language, onAccount, onAccess, onBack }: {
  route: LearningRoute; session: SessionState | null; language: Language; onAccount: () => void; onAccess: () => void; onBack: () => void;
}) {
  const owned = Boolean(session?.courseIds.includes(route.courseId))
  const [result, setResult] = useState<{ key: string; value: LearningContent | CourseOutline } | null>(null)
  const [error, setError] = useState<unknown>(null)
  const [reload, setReload] = useState(0)
  const [mobileOutline, setMobileOutline] = useState(false)
  const heading = useRef<HTMLHeadingElement>(null)
  const key = `${route.courseId}:${session?.user?.id || 'guest'}:${owned}:${reload}`
  useEffect(() => {
    const focus = () => setReload(value => value + 1)
    window.addEventListener('focus', focus)
    return () => window.removeEventListener('focus', focus)
  }, [])
  useEffect(() => {
    if (!session) return
    const controller = new AbortController()
    setError(null)
    api<LearningContent | CourseOutline>(`/courses/${route.courseId}/${owned ? 'curriculum' : 'outline'}`, { signal: controller.signal })
      .then(value => { if (!controller.signal.aborted) setResult({ key, value }) })
      .catch(error => { if (!controller.signal.aborted) setError(error) })
    return () => controller.abort()
  }, [key, route.courseId, owned, Boolean(session)])
  useEffect(() => { setMobileOutline(false); heading.current?.focus({ preventScroll: true }); heading.current?.scrollIntoView?.({ block: 'start' }) }, [route.lessonId])
  const data = result?.key === key ? result.value : null
  const curriculum = data && 'curriculum' in data ? data.curriculum : null
  const chapters = curriculum?.chapters || (data && 'chapters' in data ? data.chapters : [])
  const lessons = curriculum?.chapters.flatMap(chapter => chapter.lessons.map(lesson => ({ chapter, lesson }))) || []
  const selectedId = route.lessonId || lessons[0]?.lesson.id
  const currentIndex = lessons.findIndex(item => item.lesson.id === selectedId)
  const selected = lessons[currentIndex]
  const title = data ? language === 'en' && data.course.en ? data.course.en.title : data.course.title : tx(language, '课程内容', 'Course content')
  return <main className="bz-inner bz-container bz-learning">
    <button className="bz-secondary" onClick={onBack}><ArrowLeft />{tx(language, '返回课程', 'Back to programs')}</button>
    <header className="bz-learning-heading"><span>COURSE READER</span><h1>{title}</h1><p>{tx(language, '按自己的节奏阅读、练习，随时回到需要的小节。', 'Read and practice at your own pace. Return to any lesson when you need it.')}</p></header>
    {Boolean(error) && <Notice error>{errorMessage(error, language)}<div className="bz-action-row"><button className="bz-secondary" onClick={() => setReload(value => value + 1)}>{tx(language, '重试', 'Retry')}</button><button className="bz-secondary" onClick={onAccount}>{tx(language, '前往个人中心', 'Go to my account')}</button></div></Notice>}
    {!data && !error && <p role="status">{tx(language, '正在读取课程…', 'Loading course…')}</p>}
    {data && <div className="bz-learning-layout">
      <aside className={`bz-learning-outline ${mobileOutline ? 'is-open' : ''}`} aria-label={tx(language, '课程目录', 'Course outline')}>
        <h2>{tx(language, '课程目录', 'Course outline')}</h2>
        <button className="bz-secondary bz-outline-toggle" aria-expanded={mobileOutline} onClick={() => setMobileOutline(!mobileOutline)}><BookOpen />{tx(language, mobileOutline ? '收起目录' : '展开目录', mobileOutline ? 'Hide outline' : 'Show outline')}</button>
        <nav aria-label={tx(language, '章节与小节', 'Chapters and lessons')}>{chapters.map((chapter, index) => <section key={chapter.id}>
          <h3><span>{String(index + 1).padStart(2, '0')}</span>{language === 'en' && chapter.titleEn ? chapter.titleEn : chapter.title}</h3>
          {chapter.lessons.map((lesson, number) => <a href={learningHref(route.courseId, lesson.id)} key={lesson.id} aria-current={lesson.id === selectedId ? 'page' : undefined} onClick={() => setMobileOutline(false)}><span>{index + 1}.{number + 1}</span><span>{language === 'en' && lesson.titleEn ? lesson.titleEn : lesson.title}</span>{('video' in lesson ? lesson.video : lesson.hasVideo) && <Video aria-label={tx(language, '含影片', 'Includes video')} />}</a>)}
        </section>)}</nav>
        {!chapters.length && <p>{tx(language, '章节正在整理中。', 'Chapters are being prepared.')}</p>}
      </aside>
      <article className="bz-learning-article">
        {!owned ? <div className="bz-lesson-locked"><LockKeyhole /><h2>{tx(language, '开通后阅读完整课程', 'Unlock the complete course')}</h2><p>{tx(language, '开通这门课程后，可阅读各小节图文，并打开已提供的影片链接。', 'Course access includes every lesson’s text and images, plus video links where provided.')}</p><button className="bz-primary" onClick={session?.user ? onAccess : onAccount}>{session?.user ? tx(language, '兑换课程权限', 'Redeem course access') : tx(language, '登录后继续', 'Sign in to continue')}</button></div>
          : !curriculum ? <Notice>{tx(language, '老师正在整理课程内容，发布后即可在这里阅读。', 'The instructor is preparing the lessons. Read them here once published.')}</Notice>
          : !selected ? <Notice>{tx(language, '这个小节已调整，请从目录选择其他小节。', 'This lesson has changed. Choose another lesson from the outline.')}</Notice>
          : <>
            <div className="bz-lesson-breadcrumb">{language === 'en' && selected.chapter.titleEn ? selected.chapter.titleEn : selected.chapter.title} · {currentIndex + 1} / {lessons.length}</div>
            <h2 ref={heading} tabIndex={-1} className="bz-lesson-title">{language === 'en' && selected.lesson.titleEn ? selected.lesson.titleEn : selected.lesson.title}</h2>
            <LessonBlocks blocks={selected.lesson.blocks} language={language} />
            <LessonVideoLink key={`${selected.lesson.id}:${key}`} lesson={selected.lesson} language={language} />
            <nav className="bz-lesson-pagination" aria-label={tx(language, '小节导航', 'Lesson navigation')}>
              {currentIndex > 0 && <a className="bz-secondary" href={learningHref(route.courseId, lessons[currentIndex - 1].lesson.id)}><ArrowLeft />{tx(language, '上一小节', 'Previous lesson')}</a>}
              {currentIndex < lessons.length - 1 && <a className="bz-primary" href={learningHref(route.courseId, lessons[currentIndex + 1].lesson.id)}>{tx(language, '下一小节', 'Next lesson')}<ArrowRight /></a>}
              {currentIndex === lessons.length - 1 && <span>{tx(language, '已到本课程最后一节，可随时从目录回顾。', 'This is the last lesson. Revisit any lesson from the outline.')}</span>}
            </nav>
          </>}
      </article>
    </div>}
  </main>
}
