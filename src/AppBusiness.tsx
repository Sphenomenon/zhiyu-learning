import { useCallback, useEffect, useMemo, useState } from 'react'
import { ArrowRight, BadgeCheck, BookOpen, Check, ChevronRight, CircleUserRound, ClipboardList, FolderDown, Home, Library, LockKeyhole, Menu, Moon, Sun, UserRound, X } from 'lucide-react'
import type { Course, Language, SessionState, SiteContent, Story } from '../shared/types'
import { courseImages, tx } from './catalog'
import { api, errorMessage } from './api'
import { AccountView, Modal, Notice, RedeemForm } from './Account'
import { AdminView } from './Admin'
import { LearningView, learningHref, learningRoute } from './LearningView'

type View = 'home' | 'courses' | 'cases' | 'profile' | 'admin' | 'learn'
type Theme = 'light' | 'dark'
const courseCopy = (course: Course, language: Language): Course => language === 'en' && course.en ? { ...course, ...course.en } : course
const storyCopy = (story: Story, language: Language): Story => language === 'en' && story.en ? { ...story, ...story.en } : story

function Brand({ language = 'zh' }: { language?: Language }) {
  return <span className="bz-brand"><span className="bz-brand-mark">知</span><span><strong>{tx(language, '知屿课程', 'ZHIYU LEARNING')}</strong><small>{tx(language, 'ZHIYU LEARNING', 'COURSES & PRACTICE')}</small></span></span>
}

function LanguageButton({ language, onToggle }: { language: Language; onToggle: () => void }) {
  return <button className="bz-language-toggle" onClick={onToggle} aria-label={tx(language, '切换为英文', 'Switch to Chinese')} title={tx(language, '中英切换', 'Language')}><span className={language === 'zh' ? 'active' : ''}>中</span><i /><span className={language === 'en' ? 'active' : ''}>EN</span></button>
}

function ThemeButton({ theme, language, onToggle }: { theme: Theme; language: Language; onToggle: () => void }) {
  return <button className="bz-icon-button" onClick={onToggle} aria-label={tx(language, `切换为${theme === 'dark' ? '亮色' : '暗色'}模式`, `Switch to ${theme === 'dark' ? 'light' : 'dark'} mode`)}>{theme === 'dark' ? <Sun /> : <Moon />}</button>
}

function PublicHeader({ view, theme, language, onNavigate, onAbout, onToggleTheme, onToggleLanguage }: { view: View; theme: Theme; language: Language; onNavigate: (view: View) => void; onAbout: () => void; onToggleTheme: () => void; onToggleLanguage: () => void }) {
  const [menuOpen, setMenuOpen] = useState(false)
  const go = (next: View) => { setMenuOpen(false); onNavigate(next) }
  return <>
    <div className="bz-announcement"><span>{tx(language, '2026 秋季课程现已开放', 'Enrollment is open for Autumn 2026')}</span><button onClick={() => go('courses')}>{tx(language, '查看课程', 'View programs')} <ArrowRight /></button></div>
    <header className="bz-header">
      <button className="bz-brand-button" onClick={() => go('home')}><Brand language={language} /></button>
      <nav className="bz-desktop-nav" aria-label={tx(language, '网站导航', 'Main navigation')}>
        <button className={view === 'home' ? 'active' : ''} onClick={() => go('home')}>{tx(language, '首页', 'Home')}</button>
        <button className={view === 'courses' ? 'active' : ''} onClick={() => go('courses')}>{tx(language, '课程体系', 'Programs')}</button>
        <button className={view === 'cases' ? 'active' : ''} onClick={() => go('cases')}>{tx(language, '案例墙', 'Results')}</button>
        <button onClick={onAbout}>{tx(language, '关于讲师', 'Instructor')}</button>
      </nav>
      <div className="bz-header-actions">
        <LanguageButton language={language} onToggle={onToggleLanguage} />
        <ThemeButton theme={theme} language={language} onToggle={onToggleTheme} />
        <button className="bz-login" onClick={() => go('profile')}><CircleUserRound /> {tx(language, '个人中心', 'My account')}</button>
        <button className="bz-menu-button" onClick={() => setMenuOpen(true)} aria-label={tx(language, '打开菜单', 'Open menu')}><Menu /></button>
      </div>
    </header>
    <div className={`bz-mobile-menu ${menuOpen ? 'open' : ''}`} aria-hidden={!menuOpen} inert={!menuOpen}>
      <div><Brand language={language} /><button onClick={() => setMenuOpen(false)} aria-label={tx(language, '关闭菜单', 'Close menu')}><X /></button></div>
      <nav>{[[tx(language, '首页', 'Home'), 'home'], [tx(language, '课程体系', 'Programs'), 'courses'], [tx(language, '案例墙', 'Results'), 'cases'], [tx(language, '个人中心', 'My account'), 'profile']].map(([label, target], i) => <button key={target} onClick={() => go(target as View)}><span>0{i + 1}</span>{label}<ArrowRight /></button>)}</nav>
      <button className="bz-primary bz-full" onClick={() => go('courses')}>{tx(language, '浏览全部课程', 'Explore all programs')} <ArrowRight /></button>
    </div>
  </>
}

function CourseMedia({ course, index, language = 'zh' }: { course: Course; index: number; language?: Language }) {
  const item = courseCopy(course, language)
  return <div className="bz-course-media"><img src={course.imageUrl || courseImages[index % courseImages.length]} alt={tx(language, '课程内容与学习资料示意', 'Course materials and learning resources')} /><span>{item.label}</span><strong>0{index + 1}</strong></div>
}

function HomeView({ content, stories, courses, language, onNavigate }: { content: SiteContent; stories: Story[]; courses: Course[]; language: Language; onNavigate: (view: View) => void }) {
  const featured = stories[0] ? storyCopy(stories[0], language) : null
  return <main>
    <section className="bz-hero">
      <div className="bz-container bz-hero-grid">
        <div className="bz-hero-copy">
          <span className="bz-eyebrow"><i /> {tx(language, '专业知识课程与实践指导', 'PROFESSIONAL COURSES & GUIDED PRACTICE')}</span>
          <h1>{language === 'zh' ? content.heroTitle : content.heroTitleEn}<em>{language === 'zh' ? content.heroAccent : content.heroAccentEn}</em></h1>
          <p>{language === 'zh' ? content.heroDescription : content.heroDescriptionEn}</p>
          <div className="bz-actions"><button className="bz-primary" onClick={() => onNavigate('courses')}>{tx(language, '浏览课程', 'Explore programs')} <ArrowRight /></button><button className="bz-secondary" onClick={() => onNavigate('cases')}>{tx(language, '查看学员成果', 'See student results')}</button></div>
          <div className="bz-proof"><div><strong>1,284</strong><span>{tx(language, '累计学习者', 'LEARNERS')}</span></div><div><strong>92%</strong><span>{tx(language, '课程满意度', 'COURSE SATISFACTION')}</span></div><div><strong>08</strong><span>{tx(language, '年教学与实践经验', 'YEARS OF PRACTICE')}</span></div></div>
        </div>
        <div className="bz-hero-media">
          <img src="/images/hero-course.jpg" alt={tx(language, '讲师与学习者进行课程讨论的示意照片', 'Instructor discussing course work with learners')} />
          <span className="bz-media-label">{tx(language, '讲师主视觉 · 可在后台替换', 'INSTRUCTOR IMAGE · EDITABLE')}</span>
          <div className="bz-media-card"><BadgeCheck /><span><strong>{tx(language, '结构化课程', 'Structured learning')}</strong><small>{tx(language, '持续更新 · 长期访问', 'Ongoing updates · Continued access')}</small></span></div>
        </div>
      </div>
    </section>

    <section className="bz-trust"><div className="bz-container"><span>{tx(language, '课程设计原则', 'HOW WE TEACH')}</span><div><strong>{tx(language, '有依据', 'Evidence-led')}</strong><small>{tx(language, '从真实问题出发', 'Built from real problems')}</small></div><div><strong>{tx(language, '可实践', 'Practical')}</strong><small>{tx(language, '每个模块都有练习', 'Practice in every module')}</small></div><div><strong>{tx(language, '能复用', 'Repeatable')}</strong><small>{tx(language, '形成自己的工作方法', 'Build your own method')}</small></div></div></section>

    <section className="bz-section bz-container">
      <div className="bz-section-heading"><span>FEATURED PROGRAMS</span><div><h2>{tx(language, '从理解方法，到真正用起来。', 'From understanding the method to putting it to work.')}</h2><p>{tx(language, '每门课程都处理一个具体问题。清楚的讲解、真实案例和可执行练习，共同组成一条完整的学习路径。', 'Each program addresses a specific problem through clear instruction, real examples, and practical exercises.')}</p></div></div>
      <div className="bz-program-grid">{courses.map((course, index) => { const item = courseCopy(course, language); return <article className="bz-program-card" key={course.id}><CourseMedia course={course} index={index} language={language} /><div><span className="bz-card-meta">{item.level} · {item.lessons} {tx(language, '个单元', 'LESSONS')} · {item.duration}</span><h3>{item.title}</h3><p>{item.description}</p><button onClick={() => onNavigate('courses')}>{tx(language, '了解课程', 'Explore program')} <ArrowRight /></button></div></article> })}</div>
    </section>

    <section className="bz-membership">
      <div className="bz-container bz-membership-grid"><div><span className="bz-eyebrow">A CLEAR LEARNING PATH</span><h2>{tx(language, '课程、资料和学习记录，都在一个地方。', 'Your programs, resources, and progress in one place.')}</h2><p>{tx(language, '登录个人中心，按章节阅读图文、回顾练习。需要影片的小节会提供百度网盘入口。', 'Sign in to read lesson text and images by chapter and revisit exercises. Video links appear only where provided.')}</p><button className="bz-primary" onClick={() => onNavigate('profile')}>{tx(language, '进入个人中心', 'Open my account')} <ArrowRight /></button></div><div className="bz-dashboard-preview"><div className="bz-preview-head"><span>{tx(language, '个人中心功能示意', 'ACCOUNT PREVIEW')}</span><small>{tx(language, '已解锁 2 门课程', '2 programs unlocked')}</small></div><div className="bz-preview-progress"><span>{tx(language, '本月学习进度', 'Progress this month')}</span><strong>68%</strong><i><b /></i></div>{courses.slice(0, 2).map((course, i) => { const item = courseCopy(course, language); return <div className="bz-preview-course" key={course.id}><span>0{i + 1}</span><div><strong>{item.title}</strong><small>{i ? tx(language, '查看课程资料', 'View resources') : tx(language, '继续当前路径', 'Continue learning')}</small></div><ChevronRight /></div> })}</div></div>
    </section>

    {featured && <section className="bz-section bz-container bz-story-preview">
      <div className="bz-section-heading"><span>STUDENT RESULTS</span><div><h2>{tx(language, '真正的成果，比一句好评更有说服力。', 'Real outcomes say more than a review.')}</h2><p>{tx(language, '案例墙记录学员遇到的问题、采用的方法，以及最终完成的成果。', 'The case wall documents the problem, the method used, and the result each learner produced.')}</p></div></div>
      <div className="bz-story-feature"><div><span className="bz-quote">“</span><blockquote>{featured.quote}</blockquote><div className="bz-person"><span>{featured.name.slice(0, 1)}</span><div><strong>{featured.name}</strong><small>{featured.role}</small></div></div></div><aside><span>RESULT / 01</span><strong>{featured.result}</strong><p>{tx(language, '查看学习过程与最终作品。', 'See the full process and final work.')}</p><button onClick={() => onNavigate('cases')}>{tx(language, '进入案例墙', 'Explore results')} <ArrowRight /></button></aside></div>
    </section>}

    <section className="bz-about" id="about"><div className="bz-container bz-about-grid"><div className="bz-about-image"><img src="/images/instructor-work.jpg" alt={tx(language, '讲师工作与内容研讨示意', 'Instructor at work')} /><span>INSTRUCTOR / PROFILE</span></div><div><span className="bz-eyebrow">ABOUT THE INSTRUCTOR</span><h2>{language === 'zh' ? content.instructorName : content.instructorNameEn}</h2><p>{language === 'zh' ? content.instructorBio : content.instructorBioEn}</p><ul><li><Check /> {tx(language, '8 年课程与内容实践', '8 years of teaching and content practice')}</li><li><Check /> {tx(language, '服务 1,200+ 位学习者', '1,200+ learners served')}</li><li><Check /> {tx(language, '方法强调可执行、可验证', 'Methods designed to be applied and tested')}</li></ul><button className="bz-secondary">{tx(language, '了解教学方法', 'How the teaching works')} <ArrowRight /></button></div></div></section>
  </main>
}

function CoursesView({ courses, unlocked, language, onUnlock, onCourse }: { courses: Course[]; unlocked: string[]; language: Language; onUnlock: (course: Course) => void; onCourse: (courseId: string) => void }) {
  return <main className="bz-inner bz-container">
    <div className="bz-page-intro"><span>COURSE LIBRARY</span><h1>{tx(language, '从一个具体问题开始，建立一套长期能用的方法。', 'Start with a real problem. Build a method you can keep using.')}</h1><p>{tx(language, '课程按学习阶段设计。你可以按顺序完成，也可以从当前最需要解决的主题开始。', 'Programs are organized by learning stage. Follow the complete path or begin with the subject you need now.')}</p></div>
    <div className="bz-course-list">{courses.map((course, index) => { const active = unlocked.includes(course.id); const item = courseCopy(course, language); return <article key={course.id}><CourseMedia course={course} index={index} language={language} /><div className="bz-course-detail"><div className="bz-card-meta">{tx(language, '课程', 'PROGRAM')} {item.index} / {item.level}</div><h2>{item.title}</h2><h3>{item.subtitle}</h3><p>{item.description}</p><div className="bz-course-facts"><span><BookOpen /> {item.lessons} {tx(language, '个学习单元', 'learning units')}</span><span><FolderDown /> {tx(language, '章节图文在线阅读，影片按需打开', 'Read lessons here, open videos when provided')}</span><span><BadgeCheck /> {tx(language, '包含后续课程更新', 'Future course updates included')}</span></div>{active ? <button className="bz-primary" onClick={() => onCourse(course.id)}>{tx(language, '进入我的课程', 'Open my program')} <ArrowRight /></button> : <button className="bz-primary" onClick={() => onUnlock(course)}><LockKeyhole /> {tx(language, '获取课程权限', 'Get access')}</button>}{!active && <button className="bz-secondary" onClick={() => onCourse(course.id)}><BookOpen />{tx(language, '查看课程目录', 'View course outline')}</button>}</div></article> })}</div>
  </main>
}

function CasesView({ stories, language }: { stories: Story[]; language: Language }) {
  const [selected, setSelected] = useState<Story | null>(null)
  const visible = stories.filter(story => story.published).map(story => storyCopy(story, language))
  return <main className="bz-inner bz-container">
    <div className="bz-page-intro bz-case-intro"><span>STUDENT CASES / {String(visible.length).padStart(2, '0')}</span><h1>{tx(language, '案例墙', 'Student Results')}</h1><p>{tx(language, '这里不只收录评价。每个案例都会说明学员解决了什么问题，以及课程怎样帮助他们完成成果。', 'These are more than reviews. Each case explains the learner’s problem, the method they used, and the work they completed.')}</p></div>
    {!visible.length && <Notice>{tx(language, '案例正在整理，发布后会在这里展示。', 'Cases are being prepared and will appear here when published.')}</Notice>}
    <div className="bz-case-grid">{visible.map((story, index) => <article className={index === 0 ? 'featured' : ''} key={story.id}><div className="bz-case-number">CASE / {String(index + 1).padStart(2, '0')}</div><div className="bz-case-result"><span>{tx(language, '最终成果', 'OUTCOME')}</span><strong>{story.result}</strong></div><blockquote>“{story.quote}”</blockquote><div className="bz-person"><span>{story.name.slice(0, 1)}</span><div><strong>{story.name}</strong><small>{story.role}</small></div></div><button onClick={() => setSelected(story)}>{tx(language, '阅读完整案例', 'Read the full case')} <ArrowRight /></button></article>)}</div>
    <section className="bz-submit-story"><div><span>SHARE YOUR STORY</span><h2>{tx(language, '已经完成了自己的作品？', 'Completed work you are proud of?')}</h2><p>{tx(language, '欢迎向老师分享学习过程与成果，经审核后可收录到案例墙。网站暂未开放直接投稿。', 'Share your progress and work with the instructor. Approved stories can appear here. Direct submissions are not open yet.')}</p></div></section>
    {selected && <Modal title={selected.result} language={language} onClose={() => setSelected(null)}><p>{selected.name} · {selected.role}</p><p className="bz-preserve-lines">{selected.quote}</p></Modal>}
  </main>
}

function Footer({ language, onNavigate }: { language: Language; onNavigate: (view: View) => void }) {
  return <footer className="bz-footer"><div className="bz-container"><div><Brand language={language} /><p>{tx(language, '把知识整理成方法，把方法用于真实工作。', 'Turn knowledge into methods, and methods into better work.')}</p></div><div><strong>{tx(language, '浏览', 'EXPLORE')}</strong><button onClick={() => onNavigate('courses')}>{tx(language, '课程体系', 'Programs')}</button><button onClick={() => onNavigate('cases')}>{tx(language, '案例墙', 'Student results')}</button><button onClick={() => onNavigate('profile')}>{tx(language, '个人中心', 'My account')}</button></div><div><strong>{tx(language, '联系', 'CONTACT')}</strong><span>{tx(language, '微信', 'WeChat')}：zhiyu-course</span><span>{tx(language, '邮箱', 'Email')}：hello@example.com</span></div></div><div className="bz-container bz-footer-bottom"><span>© 2026 ZHIYU LEARNING</span><span>{tx(language, '专业知识课程与实践指导', 'PROFESSIONAL COURSES & GUIDED PRACTICE')}</span></div></footer>
}

function currentView(): View {
  if (learningRoute()) return 'learn'
  const hash = window.location.hash.slice(1)
  return ['home', 'courses', 'cases', 'profile', 'admin'].includes(hash) ? hash as View : 'home'
}
function preference(key: string, fallback: string) {
  try { return localStorage.getItem(key) || fallback } catch { return fallback }
}
function AppBusiness() {
  const [view, setView] = useState<View>(currentView)
  const [lessonRoute, setLessonRoute] = useState(learningRoute)
  const [theme, setTheme] = useState<Theme>(() => preference('zhiyu-theme', 'dark') === 'light' ? 'light' : 'dark')
  const [language, setLanguage] = useState<Language>(() => preference('zhiyu-language', 'zh') === 'en' ? 'en' : 'zh')
  const [content, setContent] = useState<SiteContent | null>(null)
  const [stories, setStories] = useState<Story[]>([])
  const [courses, setCourses] = useState<Course[]>([])
  const [session, setSession] = useState<SessionState | null>(null)
  const [contentReady, setContentReady] = useState(false)
  const [error, setError] = useState<unknown>(null)
  const [accountError, setAccountError] = useState<unknown>(null)
  const [unlockCourse, setUnlockCourse] = useState<Course | null>(null)
  const refreshSession = useCallback(async () => {
    try { setSession(await api<SessionState>('/me')); setAccountError(null) }
    catch (error) { setAccountError(error); throw error }
  }, [])
  const refreshContent = useCallback(async () => {
    try {
      const [site, programs, cases] = await Promise.all([api<{ content: SiteContent | null }>('/site'), api<{ items: Course[] }>('/courses'), api<{ items: Story[] }>('/cases')])
      setContent(site.content); setCourses(programs.items); setStories(cases.items); setContentReady(true); setError(null)
    } catch (error) { setError(error) }
  }, [])
  useEffect(() => { void refreshContent(); void refreshSession().catch(() => {}) }, [refreshContent, refreshSession])
  useEffect(() => {
    const reload = () => { void refreshSession().catch(() => {}); void refreshContent() }
    window.addEventListener('focus', reload)
    return () => window.removeEventListener('focus', reload)
  }, [refreshSession, refreshContent])
  const navigate = (next: View) => { setView(next); window.location.hash = next; window.scrollTo({ top: 0, behavior: 'smooth' }) }
  const openCourse = (courseId: string) => { window.location.hash = learningHref(courseId); setLessonRoute({ courseId }); setView('learn'); window.scrollTo({ top: 0 }) }
  const toggleLanguage = () => setLanguage(current => current === 'zh' ? 'en' : 'zh')
  useEffect(() => { document.documentElement.dataset.theme = theme; try { localStorage.setItem('zhiyu-theme', theme) } catch { /* storage is optional */ } }, [theme])
  useEffect(() => { document.documentElement.lang = language === 'zh' ? 'zh-CN' : 'en'; try { localStorage.setItem('zhiyu-language', language) } catch { /* storage is optional */ } }, [language])
  useEffect(() => { const listener = () => { setView(currentView()); setLessonRoute(learningRoute()) }; window.addEventListener('hashchange', listener); return () => window.removeEventListener('hashchange', listener) }, [])
  const title = useMemo(() => language === 'zh' ? ({ home: '知屿课程 · 专业知识课程', courses: '课程体系 · 知屿课程', cases: '案例墙 · 知屿课程', profile: '个人中心 · 知屿课程', admin: '内容后台 · 知屿课程', learn: '课程阅读 · 知屿课程' })[view] : ({ home: 'ZHIYU Learning · Professional Courses', courses: 'Programs · ZHIYU Learning', cases: 'Student Results · ZHIYU Learning', profile: 'My Account · ZHIYU Learning', admin: 'Creator Admin · ZHIYU Learning', learn: 'Course Reader · ZHIYU Learning' })[view], [view, language])
  useEffect(() => { document.title = title }, [title])
  useEffect(() => {
    if (!('IntersectionObserver' in window) || window.matchMedia('(prefers-reduced-motion: reduce)').matches) return
    document.documentElement.classList.add('bz-reveal-armed')
    const io = new IntersectionObserver(entries => {
      for (const entry of entries) if (entry.isIntersecting) { entry.target.classList.add('bz-in'); io.unobserve(entry.target) }
    }, { threshold: 0.1, rootMargin: '0px 0px -6% 0px' })
    const targets = document.querySelectorAll('.bz-program-card, .bz-story-feature, .bz-about-grid, .bz-dashboard-preview, .bz-case-grid article, .bz-course-list > article, .bz-trust .bz-container > div, .bz-submit-story')
    targets.forEach(el => { el.classList.add('bz-will'); io.observe(el) })
    return () => { io.disconnect(); targets.forEach(el => el.classList.add('bz-in')) }
  }, [view, content, stories, courses])
  const about = () => { if (view !== 'home') { navigate('home'); window.setTimeout(() => document.querySelector('#about')?.scrollIntoView({ behavior: 'smooth' }), 100) } else document.querySelector('#about')?.scrollIntoView({ behavior: 'smooth' }) }
  const openAccess = (course: Course) => { if (!session?.user) navigate('profile'); else setUnlockCourse(course) }
  const status = <div className="bz-container bz-connection-status">{Boolean(error) && <Notice error>{errorMessage(error, language)} <button onClick={() => void refreshContent()}>{tx(language, '重试', 'Retry')}</button></Notice>}{Boolean(accountError) && <Notice error>{errorMessage(accountError, language)} <button onClick={() => void refreshSession().catch(() => {})}>{tx(language, '重新连接账号', 'Reconnect account')}</button></Notice>}</div>
  if (view === 'admin') return <>{status}{session ? <AdminView language={language} session={session} onRefresh={refreshSession} onPublicChange={() => void refreshContent()} onLanguage={toggleLanguage} onExit={() => navigate('home')} /> : <main className="bz-inner bz-container"><p role="status">{tx(language, '正在连接后台…', 'Connecting to admin…')}</p></main>}</>
  const bottomItems = [{ id: 'home', label: tx(language, '首页', 'Home'), icon: Home }, { id: 'courses', label: tx(language, '课程', 'Programs'), icon: Library }, { id: 'cases', label: tx(language, '案例', 'Results'), icon: ClipboardList }, { id: 'profile', label: tx(language, '我的', 'Account'), icon: UserRound }]
  return <div className={'bz-app bz-lang-' + language}>
    <PublicHeader view={view} theme={theme} language={language} onNavigate={navigate} onAbout={about} onToggleTheme={() => setTheme(theme === 'dark' ? 'light' : 'dark')} onToggleLanguage={toggleLanguage} />{status}
    {!contentReady && view !== 'profile' && view !== 'learn' && !error && <main className="bz-inner bz-container"><p role="status">{tx(language, '正在读取课程内容…', 'Loading course content…')}</p></main>}
    {view === 'home' && contentReady && (content ? <HomeView content={content} stories={stories} courses={courses} language={language} onNavigate={navigate} /> : <main className="bz-inner bz-container"><Notice>{tx(language, '首页内容尚未发布。', 'Homepage content has not been published yet.')}</Notice></main>)}
    {view === 'courses' && contentReady && <CoursesView courses={courses} unlocked={session?.courseIds || []} language={language} onUnlock={openAccess} onCourse={openCourse} />}
    {view === 'learn' && lessonRoute && <LearningView route={lessonRoute} session={session} language={language} onAccount={() => navigate('profile')} onAccess={() => { const course = courses.find(item => item.id === lessonRoute.courseId); if (course) openAccess(course); else navigate('profile') }} onBack={() => navigate('courses')} />}
    {view === 'cases' && contentReady && <CasesView stories={stories} language={language} />}
    {view === 'profile' && (session ? <AccountView key={session.user?.id || 'guest'} language={language} session={session} onRefresh={refreshSession} onAdmin={() => navigate('admin')} onCourse={openCourse} /> : <main className="bz-inner bz-container"><p role="status">{tx(language, '正在连接账号服务…', 'Connecting to account services…')}</p></main>)}
    <Footer language={language} onNavigate={navigate} /><nav className="bz-mobile-bottom" aria-label={tx(language, '手机导航', 'Mobile navigation')}>{bottomItems.map(({ id, label, icon: Icon }) => <button className={view === id ? 'active' : ''} key={id} onClick={() => navigate(id as View)}><Icon /><span>{label}</span></button>)}</nav>
    {unlockCourse && <Modal title={tx(language, '获取课程权限', 'Get course access')} language={language} onClose={() => setUnlockCourse(null)}><p>{courseCopy(unlockCourse, language).title}</p><RedeemForm language={language} onRedeemed={refreshSession} /><button className="bz-secondary" onClick={() => { setUnlockCourse(null); navigate('profile') }}>{tx(language, '查看我的课程', 'View my programs')}</button></Modal>}
  </div>
}

export default AppBusiness
