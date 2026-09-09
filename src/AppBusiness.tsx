import { useEffect, useMemo, useState } from 'react'
import {
  ArrowLeft,
  ArrowRight,
  BadgeCheck,
  BookOpen,
  Check,
  ChevronRight,
  CircleUserRound,
  ClipboardList,
  Copy,
  Eye,
  FileText,
  FolderDown,
  GripVertical,
  Home,
  Image as ImageIcon,
  KeyRound,
  LayoutDashboard,
  Library,
  LockKeyhole,
  Mail,
  Menu,
  MessageCircle,
  Moon,
  MoreHorizontal,
  Pencil,
  Plus,
  Save,
  Search,
  Settings,
  ShieldCheck,
  Sparkles,
  Sun,
  Trash2,
  Upload,
  UserRound,
  UsersRound,
  X,
} from 'lucide-react'
import { courses, type Course } from './data'

type View = 'home' | 'courses' | 'cases' | 'profile' | 'admin'
type Theme = 'light' | 'dark'
type Language = 'zh' | 'en'
type ProfileTab = 'overview' | 'path' | 'resources' | 'access' | 'account'
type AdminTab = 'overview' | 'site' | 'courses' | 'cases' | 'students' | 'keys' | 'settings'

type SiteContent = {
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

type Story = {
  id: number
  name: string
  role: string
  result: string
  quote: string
  published: boolean
}

const defaultContent: SiteContent = {
  heroTitle: '好方法，',
  heroAccent: '值得被认真讲清楚。',
  heroDescription: '我们把经过实践检验的知识整理成结构清晰的课程，帮助你理解关键方法，并把它用于真实工作。',
  instructorName: '林岚',
  instructorBio: '林岚长期研究知识组织、专业表达与个人业务。八年来，她把一线项目经验整理成可学习、可复用的方法，已为超过 1,200 位学习者提供课程与实践指导。',
  heroTitleEn: 'Good methods deserve',
  heroAccentEn: 'a clear explanation.',
  heroDescriptionEn: 'We turn field-tested knowledge into structured courses, so you can understand the method and apply it to real work.',
  instructorNameEn: 'Lan Lin',
  instructorBioEn: 'Lan Lin studies knowledge systems, professional communication, and independent business. Over eight years, she has turned practical experience into teachable methods for more than 1,200 learners.',
}

const defaultStories: Story[] = [
  { id: 1, name: '陈亦川', role: '产品设计师 · 上海', result: '建立了一套稳定的内容生产流程', quote: '以前我总在收藏资料，却很少真正使用。现在我能判断什么值得留下，也知道怎样把它写成完整内容。', published: true },
  { id: 2, name: '孟文', role: '独立创作者 · 杭州', result: '连续 12 周完成公开输出', quote: '课程把每一步为什么这样做讲得很清楚。我不再靠灵感推进，工作节奏稳定了很多。', published: true },
  { id: 3, name: '林曦', role: '内容策划 · 成都', result: '完成了第一套线上专题内容', quote: '从选题到交付都有清楚的判断标准。我第一次把零散经验做成了一套完整作品。', published: true },
  { id: 4, name: '周然', role: '咨询顾问 · 深圳', result: '把服务经验整理成标准流程', quote: '有了可以复用的流程之后，交付质量更稳定，和客户沟通也更直接。', published: true },
]

const courseImages = [
  '/images/course-structure.jpg',
  '/images/course-expression.jpg',
  '/images/course-studio.jpg',
]

const tx = (language: Language, zh: string, en: string) => language === 'zh' ? zh : en

const englishCourses: Record<string, Pick<Course, 'label' | 'title' | 'subtitle' | 'description' | 'duration' | 'level'>> = {
  method: { label: 'Foundations', title: 'Structuring Knowledge', subtitle: 'Turn experience into a usable system', description: 'Learn a repeatable way to organize practical experience into knowledge that others can understand and use.', duration: '4.5 hours', level: 'Foundation' },
  practice: { label: 'Focused Practice', title: 'Clear, High-Value Communication', subtitle: 'Make every idea easier to understand', description: 'Build a practical workflow for choosing a subject, developing an argument, and presenting professional content with clarity.', duration: '6 hours', level: 'Intermediate' },
  studio: { label: 'Long-term Program', title: 'The Knowledge Business Studio', subtitle: 'Build a durable body of work', description: 'Design your content system, product path, and publishing rhythm to develop a sustainable independent knowledge business.', duration: '8 weeks', level: 'Complete program' },
}

const englishStories: Record<number, Pick<Story, 'name' | 'role' | 'result' | 'quote'>> = {
  1: { name: 'Yichuan Chen', role: 'Product Designer · Shanghai', result: 'Built a reliable content production system', quote: 'I used to collect information without putting it to work. Now I can decide what matters and turn it into complete, useful content.' },
  2: { name: 'Wen Meng', role: 'Independent Creator · Hangzhou', result: 'Published consistently for 12 weeks', quote: 'The course explains the reasoning behind each step. I no longer depend on inspiration, and my work has become much more consistent.' },
  3: { name: 'Xi Lin', role: 'Content Strategist · Chengdu', result: 'Completed a first online learning series', quote: 'I now have clear criteria from topic selection through delivery. For the first time, I turned scattered experience into a complete body of work.' },
  4: { name: 'Ran Zhou', role: 'Consultant · Shenzhen', result: 'Turned service experience into a repeatable process', quote: 'A repeatable process made the quality of my delivery more consistent and client conversations more direct.' },
}

const courseCopy = (course: Course, language: Language): Course => language === 'zh' ? course : { ...course, ...englishCourses[course.id] }
const storyCopy = (story: Story, language: Language): Story => language === 'zh' || !englishStories[story.id] ? story : { ...story, ...englishStories[story.id] }

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
    <div className={`bz-mobile-menu ${menuOpen ? 'open' : ''}`} aria-hidden={!menuOpen}>
      <div><Brand language={language} /><button onClick={() => setMenuOpen(false)} aria-label={tx(language, '关闭菜单', 'Close menu')}><X /></button></div>
      <nav>{[[tx(language, '首页', 'Home'), 'home'], [tx(language, '课程体系', 'Programs'), 'courses'], [tx(language, '案例墙', 'Results'), 'cases'], [tx(language, '个人中心', 'My account'), 'profile']].map(([label, target], i) => <button key={target} onClick={() => go(target as View)}><span>0{i + 1}</span>{label}<ArrowRight /></button>)}</nav>
      <button className="bz-primary bz-full" onClick={() => go('courses')}>{tx(language, '浏览全部课程', 'Explore all programs')} <ArrowRight /></button>
    </div>
  </>
}

function CourseMedia({ course, index, language = 'zh' }: { course: Course; index: number; language?: Language }) {
  const item = courseCopy(course, language)
  return <div className="bz-course-media"><img src={courseImages[index]} alt={tx(language, '课程内容与学习资料示意', 'Course materials and learning resources')} /><span>{item.label}</span><strong>0{index + 1}</strong></div>
}

function HomeView({ content, stories, language, onNavigate }: { content: SiteContent; stories: Story[]; language: Language; onNavigate: (view: View) => void }) {
  const featured = storyCopy(stories[0] || defaultStories[0], language)
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
      <div className="bz-container bz-membership-grid"><div><span className="bz-eyebrow">A CLEAR LEARNING PATH</span><h2>{tx(language, '课程、资料和学习记录，都在一个地方。', 'Your programs, resources, and progress in one place.')}</h2><p>{tx(language, '登录个人中心即可查看已购课程、学习路径、百度网盘链接和提取码。需要继续学习时，不必再翻找聊天记录。', 'Sign in to access purchased programs, your learning path, and all Baidu Netdisk links and extraction codes without searching through old messages.')}</p><button className="bz-primary" onClick={() => onNavigate('profile')}>{tx(language, '进入个人中心', 'Open my account')} <ArrowRight /></button></div><div className="bz-dashboard-preview"><div className="bz-preview-head"><span>{tx(language, '我的学习', 'My learning')}</span><small>{tx(language, '已解锁 2 门课程', '2 programs unlocked')}</small></div><div className="bz-preview-progress"><span>{tx(language, '本月学习进度', 'Progress this month')}</span><strong>68%</strong><i><b /></i></div>{courses.slice(0, 2).map((course, i) => { const item = courseCopy(course, language); return <div className="bz-preview-course" key={course.id}><span>0{i + 1}</span><div><strong>{item.title}</strong><small>{i ? tx(language, '查看课程资料', 'View resources') : tx(language, '继续当前路径', 'Continue learning')}</small></div><ChevronRight /></div> })}</div></div>
    </section>

    <section className="bz-section bz-container bz-story-preview">
      <div className="bz-section-heading"><span>STUDENT RESULTS</span><div><h2>{tx(language, '真正的成果，比一句好评更有说服力。', 'Real outcomes say more than a review.')}</h2><p>{tx(language, '案例墙记录学员遇到的问题、采用的方法，以及最终完成的成果。', 'The case wall documents the problem, the method used, and the result each learner produced.')}</p></div></div>
      <div className="bz-story-feature"><div><span className="bz-quote">“</span><blockquote>{featured.quote}</blockquote><div className="bz-person"><span>{featured.name.slice(0, 1)}</span><div><strong>{featured.name}</strong><small>{featured.role}</small></div></div></div><aside><span>RESULT / 01</span><strong>{featured.result}</strong><p>{tx(language, '查看学习过程与最终作品。', 'See the full process and final work.')}</p><button onClick={() => onNavigate('cases')}>{tx(language, '进入案例墙', 'Explore results')} <ArrowRight /></button></aside></div>
    </section>

    <section className="bz-about" id="about"><div className="bz-container bz-about-grid"><div className="bz-about-image"><img src="/images/instructor-work.jpg" alt={tx(language, '讲师工作与内容研讨示意', 'Instructor at work')} /><span>INSTRUCTOR / PROFILE</span></div><div><span className="bz-eyebrow">ABOUT THE INSTRUCTOR</span><h2>{language === 'zh' ? content.instructorName : content.instructorNameEn}</h2><p>{language === 'zh' ? content.instructorBio : content.instructorBioEn}</p><ul><li><Check /> {tx(language, '8 年课程与内容实践', '8 years of teaching and content practice')}</li><li><Check /> {tx(language, '服务 1,200+ 位学习者', '1,200+ learners served')}</li><li><Check /> {tx(language, '方法强调可执行、可验证', 'Methods designed to be applied and tested')}</li></ul><button className="bz-secondary">{tx(language, '了解教学方法', 'How the teaching works')} <ArrowRight /></button></div></div></section>
  </main>
}

function CoursesView({ unlocked, language, onUnlock, onProfile }: { unlocked: string[]; language: Language; onUnlock: (course: Course) => void; onProfile: () => void }) {
  return <main className="bz-inner bz-container">
    <div className="bz-page-intro"><span>COURSE LIBRARY</span><h1>{tx(language, '从一个具体问题开始，建立一套长期能用的方法。', 'Start with a real problem. Build a method you can keep using.')}</h1><p>{tx(language, '课程按学习阶段设计。你可以按顺序完成，也可以从当前最需要解决的主题开始。', 'Programs are organized by learning stage. Follow the complete path or begin with the subject you need now.')}</p></div>
    <div className="bz-course-list">{courses.map((course, index) => { const active = unlocked.includes(course.id); const item = courseCopy(course, language); return <article key={course.id}><CourseMedia course={course} index={index} language={language} /><div className="bz-course-detail"><div className="bz-card-meta">{tx(language, '课程', 'PROGRAM')} {item.index} / {item.level}</div><h2>{item.title}</h2><h3>{item.subtitle}</h3><p>{item.description}</p><div className="bz-course-facts"><span><BookOpen /> {item.lessons} {tx(language, '个学习单元', 'learning units')}</span><span><FolderDown /> {tx(language, '视频与课件通过百度网盘交付', 'Video and course files via Baidu Netdisk')}</span><span><BadgeCheck /> {tx(language, '包含后续课程更新', 'Future course updates included')}</span></div>{active ? <button className="bz-primary" onClick={onProfile}>{tx(language, '进入我的课程', 'Open my program')} <ArrowRight /></button> : <button className="bz-primary" onClick={() => onUnlock(course)}><LockKeyhole /> {tx(language, '获取课程权限', 'Get access')}</button>}</div></article> })}</div>
  </main>
}

function CasesView({ stories, language }: { stories: Story[]; language: Language }) {
  const visible = stories.filter((story) => story.published).map((story) => storyCopy(story, language))
  return <main className="bz-inner bz-container">
    <div className="bz-page-intro bz-case-intro"><span>STUDENT CASES / {String(visible.length).padStart(2, '0')}</span><h1>{tx(language, '案例墙', 'Student Results')}</h1><p>{tx(language, '这里不只收录评价。每个案例都会说明学员解决了什么问题，以及课程怎样帮助他们完成成果。', 'These are more than reviews. Each case explains the learner’s problem, the method they used, and the work they completed.')}</p></div>
    <div className="bz-case-filters"><button className="active">{tx(language, '全部案例', 'All results')}</button><button>{tx(language, '内容创作', 'Content')}</button><button>{tx(language, '知识整理', 'Knowledge systems')}</button><button>{tx(language, '个人业务', 'Independent business')}</button></div>
    <div className="bz-case-grid">{visible.map((story, index) => <article className={index === 0 ? 'featured' : ''} key={story.id}><div className="bz-case-number">CASE / {String(index + 1).padStart(2, '0')}</div><div className="bz-case-result"><span>{tx(language, '最终成果', 'OUTCOME')}</span><strong>{story.result}</strong></div><blockquote>“{story.quote}”</blockquote><div className="bz-person"><span>{story.name.slice(0, 1)}</span><div><strong>{story.name}</strong><small>{story.role}</small></div></div><button>{tx(language, '阅读完整案例', 'Read the full case')} <ArrowRight /></button></article>)}</div>
    <section className="bz-submit-story"><div><span>SHARE YOUR STORY</span><h2>{tx(language, '已经完成了自己的作品？', 'Completed work you are proud of?')}</h2><p>{tx(language, '欢迎提交你的学习过程与成果。确认后，我们会将它收录到案例墙。', 'Share your learning process and result. Selected stories will be published here.')}</p></div><button className="bz-secondary">{tx(language, '提交我的案例', 'Submit my story')}</button></section>
  </main>
}

function AccessModal({ course, language, onClose, onUnlock }: { course: Course; language: Language; onClose: () => void; onUnlock: (course: Course) => void }) {
  const [key, setKey] = useState('')
  const [error, setError] = useState('')
  const item = courseCopy(course, language)
  const submit = (event: React.FormEvent) => { event.preventDefault(); if (key.trim().toUpperCase() === 'ZHIYU-2026-DEMO') onUnlock(course); else setError(tx(language, '密钥不正确，请检查后重新输入。', 'That key is not valid. Check it and try again.')) }
  return <div className="bz-modal-backdrop" onMouseDown={(event) => event.target === event.currentTarget && onClose()}><div className="bz-modal" role="dialog" aria-modal="true"><button className="bz-modal-close" onClick={onClose} aria-label={tx(language, '关闭', 'Close')}><X /></button><span className="bz-modal-label">COURSE ACCESS</span><h2>{tx(language, `获取《${item.title}》`, `Get access to ${item.title}`)}</h2><p>{tx(language, '付款后，老师可以直接为你的账号开通课程，也可以发送一枚课程密钥。', 'After payment, the instructor can enable your account directly or send you a course key.')}</p><div className="bz-pay-option"><MessageCircle /><div><strong>{tx(language, '联系老师完成付款', 'Contact the instructor to pay')}</strong><small>{tx(language, '确认到账后开通课程权限', 'Access is enabled after payment is confirmed')}</small></div><ArrowRight /></div><div className="bz-or"><span />{tx(language, '或使用课程密钥', 'OR USE A COURSE KEY')}<span /></div><form onSubmit={submit}><label>{tx(language, '课程密钥', 'Course key')}</label><div><KeyRound /><input value={key} onChange={(event) => { setKey(event.target.value); setError('') }} placeholder="XXXX-XXXX-XXXX" /></div>{error && <small className="bz-error">{error}</small>}<button className="bz-primary bz-full" type="submit">{tx(language, '验证并解锁', 'Verify and unlock')}</button></form><div className="bz-demo-key">{tx(language, '原型演示密钥：', 'Demo key:')}<button onClick={() => setKey('ZHIYU-2026-DEMO')}>ZHIYU-2026-DEMO <Copy /></button></div></div></div>
}

function ResourceModal({ course, language, onClose }: { course: Course; language: Language; onClose: () => void }) {
  const [copied, setCopied] = useState(false)
  const item = courseCopy(course, language)
  return <div className="bz-modal-backdrop" onMouseDown={(event) => event.target === event.currentTarget && onClose()}><div className="bz-modal" role="dialog" aria-modal="true"><button className="bz-modal-close" onClick={onClose} aria-label={tx(language, '关闭', 'Close')}><X /></button><span className="bz-modal-label">COURSE RESOURCES</span><h2>{item.title}</h2><p>{tx(language, '课程视频和课件通过百度网盘交付。', 'Course videos and files are delivered through Baidu Netdisk.')}</p><div className="bz-netdisk"><div><span>{tx(language, '百度网盘链接', 'Baidu Netdisk link')}</span><strong>pan.baidu.com/s/1ZHIYU-DEMO</strong></div><div><span>{tx(language, '提取码', 'Extraction code')}</span><strong>ZHYU</strong><button onClick={async () => { await navigator.clipboard?.writeText('ZHYU'); setCopied(true) }}>{copied ? <Check /> : <Copy />} {copied ? tx(language, '已复制', 'Copied') : tx(language, '复制', 'Copy')}</button></div></div><a className="bz-primary bz-full" href="https://pan.baidu.com/" target="_blank" rel="noreferrer">{tx(language, '打开百度网盘', 'Open Baidu Netdisk')} <ArrowRight /></a><div className="bz-security"><ShieldCheck /><span>{tx(language, '正式版只会在登录并验证课程权限后显示网盘信息。', 'The production site will reveal these details only after sign-in and access verification.')}</span></div></div></div>
}

function ProfileView({ unlocked, language, onOpenKey, onAdmin }: { unlocked: string[]; language: Language; onOpenKey: () => void; onAdmin: () => void }) {
  const [tab, setTab] = useState<ProfileTab>('overview')
  const [resource, setResource] = useState<Course | null>(null)
  const activeCourse = courses.find((course) => unlocked.includes(course.id))
  const tabs: { id: ProfileTab; label: string; icon: typeof Home }[] = [
    { id: 'overview', label: tx(language, '学习概览', 'Overview'), icon: LayoutDashboard }, { id: 'path', label: tx(language, '成长路径', 'Learning path'), icon: ClipboardList }, { id: 'resources', label: tx(language, '课程资料', 'Resources'), icon: FolderDown }, { id: 'access', label: tx(language, '密钥与权限', 'Access & keys'), icon: KeyRound }, { id: 'account', label: tx(language, '账户资料', 'Account'), icon: UserRound },
  ]
  const activeItem = activeCourse ? courseCopy(activeCourse, language) : undefined
  return <main className="bz-profile bz-container"><aside><div className="bz-user-card"><span>YL</span><div><strong>{tx(language, '雨林', 'Yulin')}</strong><small>{tx(language, '学习者 · ZH-0814', 'LEARNER · ZH-0814')}</small></div></div><nav>{tabs.map(({ id, label, icon: Icon }) => <button key={id} className={tab === id ? 'active' : ''} onClick={() => setTab(id)}><Icon />{label}<ChevronRight /></button>)}</nav><button className="bz-admin-entry" onClick={onAdmin}><Settings /><span><strong>{tx(language, '创作者内容后台', 'Creator admin')}</strong><small>{tx(language, '编辑网站、课程与案例', 'Edit the site, programs, and cases')}</small></span><ArrowRight /></button></aside><section className="bz-profile-main"><button className="bz-mobile-admin-entry" onClick={onAdmin}><Settings /><span><strong>{tx(language, '创作者内容后台', 'Creator admin')}</strong><small>{tx(language, '编辑网站、课程与案例', 'Edit the site, programs, and cases')}</small></span><ArrowRight /></button><div className="bz-profile-mobile-tabs">{tabs.map(({ id, label }) => <button key={id} className={tab === id ? 'active' : ''} onClick={() => setTab(id)}>{label}</button>)}</div>
    {tab === 'overview' && <><div className="bz-welcome"><div><span>{tx(language, '学习概览', 'LEARNING OVERVIEW')}</span><h1>{tx(language, '晚上好，雨林。', 'Good evening, Yulin.')}</h1><p>{activeCourse ? tx(language, '课程资料已经准备好，可以继续当前的学习路径。', 'Your course resources are ready. Continue from your current learning path.') : tx(language, '兑换课程密钥后，相关资料会出现在这里。', 'Redeem a course key and your resources will appear here.')}</p>{activeCourse ? <button className="bz-primary" onClick={() => setResource(activeCourse)}>{tx(language, '查看课程资料', 'View resources')} <ArrowRight /></button> : <button className="bz-primary" onClick={onOpenKey}>{tx(language, '兑换课程密钥', 'Redeem a course key')}</button>}</div><div className="bz-progress-ring" style={{ '--ring-pct': activeCourse ? '42%' : '0%' } as React.CSSProperties}><strong>{activeCourse ? '42' : '0'}%</strong><span>{tx(language, '当前进度', 'PROGRESS')}</span></div></div><ProfileCourse activeCourse={activeCourse} language={language} onResource={setResource} onOpenKey={onOpenKey} /></>}
    {tab === 'path' && <ProfilePath language={language} />}
    {tab === 'resources' && <div className="bz-panel"><PanelHeading eyebrow="MY RESOURCES" title={tx(language, '课程资料', 'Course resources')} description={tx(language, '已解锁课程的网盘链接与提取码。', 'Netdisk links and extraction codes for unlocked programs.')} />{activeCourse && activeItem ? <div className="bz-resource-row"><CourseMedia course={activeCourse} index={0} language={language} /><div><span>{tx(language, '已解锁', 'UNLOCKED')}</span><h3>{activeItem.title}</h3><p>{tx(language, '视频、课件与后续更新', 'Videos, files, and future updates')}</p></div><button className="bz-primary" onClick={() => setResource(activeCourse)}>{tx(language, '查看网盘资料', 'View Netdisk resources')}</button></div> : <EmptyAccess language={language} onOpen={onOpenKey} />}</div>}
    {tab === 'access' && <div className="bz-panel"><PanelHeading eyebrow="ACCESS & KEYS" title={tx(language, '密钥与课程权限', 'Keys and course access')} description={tx(language, '查看已开通课程，或兑换老师发送的密钥。', 'Review your active programs or redeem a key from the instructor.')} /><div className="bz-entitlements">{courses.map((course) => { const item = courseCopy(course, language); return <div key={course.id}><span className={unlocked.includes(course.id) ? 'active' : ''}>{unlocked.includes(course.id) ? <Check /> : <LockKeyhole />}</span><div><strong>{item.title}</strong><small>{unlocked.includes(course.id) ? tx(language, '已解锁 · 长期访问', 'Unlocked · Continued access') : tx(language, '尚未解锁', 'Not unlocked')}</small></div></div> })}</div><button className="bz-secondary" onClick={onOpenKey}><KeyRound /> {tx(language, '兑换新密钥', 'Redeem a new key')}</button></div>}
    {tab === 'account' && <div className="bz-panel"><PanelHeading eyebrow="ACCOUNT" title={tx(language, '账户资料', 'Account details')} description={tx(language, '管理登录方式与公开资料。', 'Manage sign-in methods and profile details.')} /><div className="bz-account-method"><MessageCircle /><div><strong>{tx(language, '微信登录', 'WeChat sign-in')}</strong><small>{tx(language, '已绑定 · 昵称“雨林”', 'Connected · Display name “Yulin”')}</small></div><span>{tx(language, '已绑定', 'Connected')}</span></div><div className="bz-account-method"><Mail /><div><strong>{tx(language, '邮箱登录', 'Email sign-in')}</strong><small>yu****@example.com</small></div><button>{tx(language, '更换', 'Change')}</button></div></div>}
    {resource && <ResourceModal course={resource} language={language} onClose={() => setResource(null)} />}
  </section></main>
}

function PanelHeading({ eyebrow, title, description }: { eyebrow: string; title: string; description: string }) {
  return <div className="bz-panel-heading"><span>{eyebrow}</span><h2>{title}</h2><p>{description}</p></div>
}

function ProfileCourse({ activeCourse, language, onResource, onOpenKey }: { activeCourse?: Course; language: Language; onResource: (course: Course) => void; onOpenKey: () => void }) {
  const item = activeCourse ? courseCopy(activeCourse, language) : undefined
  return <div className="bz-panel"><PanelHeading eyebrow="CURRENT COURSE" title={tx(language, '我的课程', 'My programs')} description={tx(language, '课程、资料和学习记录都集中在个人中心。', 'Programs, resources, and learning records live in one place.')} />{activeCourse && item ? <div className="bz-current-course"><CourseMedia course={activeCourse} index={0} language={language} /><div><span>{tx(language, '正在学习', 'IN PROGRESS')}</span><h3>{item.title}</h3><i><b /></i><small>{tx(language, '当前路径完成 42%', '42% of the current path complete')}</small></div><button className="bz-secondary" onClick={() => onResource(activeCourse)}>{tx(language, '查看资料', 'View resources')}</button></div> : <EmptyAccess language={language} onOpen={onOpenKey} />}</div>
}

function EmptyAccess({ language, onOpen }: { language: Language; onOpen: () => void }) {
  return <div className="bz-empty"><LockKeyhole /><div><strong>{tx(language, '还没有已解锁课程', 'No programs unlocked yet')}</strong><p>{tx(language, '付款后由老师开通，或使用收到的课程密钥。', 'The instructor can enable access after payment, or you can redeem a course key.')}</p></div><button onClick={onOpen}>{tx(language, '兑换密钥', 'Redeem key')}</button></div>
}

function ProfilePath({ language }: { language: Language }) {
  const items = language === 'zh' ? [['01', '明确问题', '找到当前最值得投入的真实问题', true], ['02', '建立结构', '把零散经验组织成清楚的方法', true], ['03', '完成实践', '用行动验证方法并获得反馈', false], ['04', '形成作品', '沉淀一套可以长期复用的成果', false]] : [['01', 'Define the problem', 'Identify the real problem worth solving now', true], ['02', 'Build the structure', 'Organize experience into a clear method', true], ['03', 'Put it into practice', 'Test the method through action and feedback', false], ['04', 'Produce the work', 'Create an outcome you can continue to use', false]]
  return <div className="bz-panel"><PanelHeading eyebrow="GROWTH PATH" title={tx(language, '我的成长路径', 'My learning path')} description={tx(language, '所有阶段目标与进度都收在这里。', 'Review each stage, its objective, and your progress.')} /><div className="bz-path-list">{items.map(([no, title, description, done]) => <div key={String(no)}><span className={done ? 'done' : ''}>{done ? <Check /> : no}</span><div><strong>{String(title)}</strong><small>{String(description)}</small></div><em>{done ? tx(language, '已完成', 'Complete') : tx(language, '待开始', 'Not started')}</em></div>)}</div></div>
}

function AdminView({ content, setContent, stories, setStories, language, onToggleLanguage, onExit }: { content: SiteContent; setContent: (content: SiteContent) => void; stories: Story[]; setStories: (stories: Story[]) => void; language: Language; onToggleLanguage: () => void; onExit: () => void }) {
  const [tab, setTab] = useState<AdminTab>('overview')
  const [editContent, setEditContent] = useState(false)
  const [addStory, setAddStory] = useState(false)
  const [keys, setKeys] = useState(['ZHYU-A7K2-P9QM', 'ZHYU-H4NX-82JD'])
  const [students, setStudents] = useState([{ name: '陈亦川', course: '知识结构化入门', active: true }, { name: '孟文', course: '高密度表达训练', active: true }, { name: '林曦', course: '个人知识产品工作室', active: false }])
  const items: { id: AdminTab; label: string; icon: typeof Home }[] = [{ id: 'overview', label: tx(language, '后台首页', 'Dashboard'), icon: LayoutDashboard }, { id: 'site', label: tx(language, '编辑网站', 'Edit site'), icon: FileText }, { id: 'courses', label: tx(language, '课程管理', 'Programs'), icon: Library }, { id: 'cases', label: tx(language, '案例墙', 'Case wall'), icon: ClipboardList }, { id: 'students', label: tx(language, '学员与权限', 'Learners & access'), icon: UsersRound }, { id: 'keys', label: tx(language, '课程密钥', 'Course keys'), icon: KeyRound }, { id: 'settings', label: tx(language, '网站设置', 'Site settings'), icon: Settings }]
  const title = items.find((item) => item.id === tab)?.label
  return <main className="bz-admin"><aside className="bz-admin-sidebar"><div className="bz-admin-brand"><Brand language={language} /><span>{tx(language, '内容后台', 'CREATOR ADMIN')}</span></div><nav>{items.map(({ id, label, icon: Icon }) => <button className={tab === id ? 'active' : ''} key={id} onClick={() => setTab(id)}><Icon />{label}</button>)}</nav><button className="bz-exit-admin" onClick={onExit}><ArrowLeft /> {tx(language, '返回网站', 'Back to site')}</button></aside><section className="bz-admin-main"><header><div><span>{tx(language, '知屿课程 / 内容后台', 'ZHIYU LEARNING / CREATOR ADMIN')}</span><h1>{title}</h1></div><div className="bz-admin-header-actions"><LanguageButton language={language} onToggle={onToggleLanguage} /><button className="bz-secondary" onClick={onExit}><Eye /> {tx(language, '预览网站', 'Preview site')}</button></div></header><div className="bz-admin-mobile-nav">{items.map(({ id, label }) => <button className={tab === id ? 'active' : ''} key={id} onClick={() => setTab(id)}>{label}</button>)}</div>
    {tab === 'overview' && <AdminOverview language={language} onAction={setTab} />}
    {tab === 'site' && <SiteManager content={content} language={language} onEdit={() => setEditContent(true)} />}
    {tab === 'courses' && <CourseManager language={language} />}
    {tab === 'cases' && <CaseManager stories={stories} language={language} setStories={setStories} onAdd={() => setAddStory(true)} />}
    {tab === 'students' && <StudentManager students={students} language={language} setStudents={setStudents} />}
    {tab === 'keys' && <KeyManager keys={keys} language={language} setKeys={setKeys} />}
    {tab === 'settings' && <SettingsPanel language={language} />}
  </section>{editContent && <ContentEditModal content={content} language={language} onSave={(next) => { setContent(next); setEditContent(false) }} onClose={() => setEditContent(false)} />}{addStory && <StoryModal language={language} onAdd={(story) => { setStories([...stories, { ...story, id: Date.now(), published: true }]); setAddStory(false) }} onClose={() => setAddStory(false)} />}</main>
}

function AdminOverview({ language, onAction }: { language: Language; onAction: (tab: AdminTab) => void }) {
  return <div className="bz-admin-content"><section className="bz-admin-welcome"><div><span>{tx(language, '今天要更新什么？', 'WHAT WOULD YOU LIKE TO UPDATE?')}</span><h2>{tx(language, '网站内容，都可以在这里完成。', 'Manage the complete site from one place.')}</h2><p>{tx(language, '选择一项任务，填写内容并保存。整个过程不需要接触代码。', 'Choose a task, enter the content, and save. No code is required.')}</p></div><Sparkles /></section><div className="bz-stat-grid"><div><span>{tx(language, '网站状态', 'SITE STATUS')}</span><strong><i /> {tx(language, '正常发布', 'Live')}</strong><small>{tx(language, '最后更新：今天 14:30', 'Last updated today at 14:30')}</small></div><div><span>{tx(language, '已发布课程', 'PUBLISHED PROGRAMS')}</span><strong>3</strong><small>{tx(language, '1 门正在更新', '1 update in progress')}</small></div><div><span>{tx(language, '案例墙', 'CASE WALL')}</span><strong>4</strong><small>{tx(language, '全部已发布', 'All published')}</small></div><div><span>{tx(language, '注册学员', 'REGISTERED LEARNERS')}</span><strong>1,284</strong><small>{tx(language, '本月新增 36', '36 added this month')}</small></div></div><section className="bz-admin-card"><AdminCardHead title={tx(language, '常用操作', 'Common tasks')} description={tx(language, '选择你要完成的工作', 'Choose what you want to update')} /><div className="bz-quick-actions"><button onClick={() => onAction('site')}><ImageIcon /><span><strong>{tx(language, '修改首页', 'Edit homepage')}</strong><small>{tx(language, '标题、介绍和讲师照片', 'Headlines, descriptions, and images')}</small></span><ArrowRight /></button><button onClick={() => onAction('courses')}><BookOpen /><span><strong>{tx(language, '更新课程', 'Update a program')}</strong><small>{tx(language, '介绍、价格和网盘资料', 'Details, price, and Netdisk resources')}</small></span><ArrowRight /></button><button onClick={() => onAction('cases')}><ClipboardList /><span><strong>{tx(language, '发布新案例', 'Publish a case')}</strong><small>{tx(language, '添加学员故事与成果', 'Add a learner story and outcome')}</small></span><ArrowRight /></button><button onClick={() => onAction('students')}><UsersRound /><span><strong>{tx(language, '开通课程权限', 'Enable course access')}</strong><small>{tx(language, '为已付款学员解锁', 'Unlock access after payment')}</small></span><ArrowRight /></button></div></section><section className="bz-help-card"><MessageCircle /><div><strong>{tx(language, '第一次使用后台？', 'New to the admin?')}</strong><p>{tx(language, '每个页面都有简短说明。保存前可以预览，误点不会立刻发布。', 'Each page includes a short explanation. You can preview changes before anything is published.')}</p></div><button>{tx(language, '查看使用指南', 'View guide')}</button></section></div>
}

function AdminCardHead({ title, description, action }: { title: string; description: string; action?: React.ReactNode }) {
  return <div className="bz-admin-card-head"><div><h2>{title}</h2><p>{description}</p></div>{action}</div>
}

function SiteManager({ content, language, onEdit }: { content: SiteContent; language: Language; onEdit: () => void }) {
  const [visible, setVisible] = useState([true, true, true, true, true])
  const hero = language === 'zh' ? `${content.heroTitle}${content.heroAccent}` : `${content.heroTitleEn} ${content.heroAccentEn}`
  const instructor = language === 'zh' ? content.instructorName : content.instructorNameEn
  const blocks = [{ title: tx(language, '首屏介绍', 'Hero introduction'), description: hero, type: tx(language, '文字与主图', 'Copy and image') }, { title: tx(language, '课程体系', 'Programs'), description: tx(language, '展示 3 门主要课程', 'Displays 3 featured programs'), type: tx(language, '课程列表', 'Program list') }, { title: tx(language, '个人中心介绍', 'Account introduction'), description: tx(language, '说明学习与资料获取方式', 'Explains learning and resource access'), type: tx(language, '功能介绍', 'Feature') }, { title: tx(language, '案例墙精选', 'Featured cases'), description: tx(language, '展示最新学员成果', 'Displays recent student results'), type: tx(language, '案例列表', 'Case list') }, { title: tx(language, '关于讲师', 'About the instructor'), description: `${instructor} · ${tx(language, '讲师介绍', 'Profile')}`, type: tx(language, '文字与照片', 'Copy and image') }]
  return <div className="bz-admin-content"><section className="bz-admin-tip"><Check /><div><strong>{tx(language, '这是首页目前的内容顺序', 'This is the current homepage order')}</strong><p>{tx(language, '拖动可排序；关闭右侧开关可暂时隐藏某一部分。', 'Drag to reorder. Use the switch to temporarily hide a section.')}</p></div></section><section className="bz-admin-card"><AdminCardHead title={tx(language, '首页内容', 'Homepage content')} description={tx(language, '共 5 个内容区块', '5 content sections')} action={<button className="bz-admin-primary"><Plus /> {tx(language, '添加内容区块', 'Add section')}</button>} /><div className="bz-block-list">{blocks.map((block, index) => <div key={block.title}><GripVertical /><span className="bz-block-thumb">0{index + 1}</span><div><strong>{block.title}</strong><small>{block.description}</small><em>{block.type}</em></div><button className="bz-edit-button" onClick={index === 0 || index === 4 ? onEdit : undefined}><Pencil /> {tx(language, '编辑', 'Edit')}</button><button className={`bz-switch ${visible[index] ? 'on' : ''}`} onClick={() => setVisible((current) => current.map((item, i) => i === index ? !item : item))} aria-label={tx(language, '切换显示状态', 'Toggle visibility')}><span /></button></div>)}</div></section></div>
}

function CourseManager({ language }: { language: Language }) {
  const [published, setPublished] = useState([true, true, false])
  return <div className="bz-admin-content"><section className="bz-admin-card"><AdminCardHead title={tx(language, '全部课程', 'All programs')} description={tx(language, '管理课程介绍、价格、状态和网盘资料', 'Manage descriptions, pricing, status, and Netdisk resources')} action={<button className="bz-admin-primary"><Plus /> {tx(language, '新建课程', 'New program')}</button>} /><div className="bz-manage-list">{courses.map((course, index) => { const item = courseCopy(course, language); return <div key={course.id}><span className="bz-manage-image"><img src={courseImages[index]} alt="" /></span><div><strong>{item.title}</strong><small>{item.lessons} {tx(language, '个单元 · 百度网盘交付', 'units · Delivered via Baidu Netdisk')}</small></div><span className={`bz-publish-status ${published[index] ? 'published' : ''}`}>{published[index] ? tx(language, '已发布', 'Published') : tx(language, '草稿', 'Draft')}</span><button className="bz-edit-button"><Pencil /> {tx(language, '编辑课程', 'Edit')}</button><button className="bz-more" aria-label={tx(language, '更多操作', 'More actions')}><MoreHorizontal /></button></div> })}</div></section></div>
}

function CaseManager({ stories, language, setStories, onAdd }: { stories: Story[]; language: Language; setStories: (stories: Story[]) => void; onAdd: () => void }) {
  return <div className="bz-admin-content"><section className="bz-admin-card"><AdminCardHead title={tx(language, '案例墙内容', 'Case wall content')} description={tx(language, '新增、修改或暂时隐藏学员案例', 'Add, edit, or temporarily hide learner cases')} action={<button className="bz-admin-primary" onClick={onAdd}><Plus /> {tx(language, '发布新案例', 'Publish a case')}</button>} /><div className="bz-manage-list bz-story-manage">{stories.map((original) => { const story = storyCopy(original, language); return <div key={story.id}><span className="bz-student-avatar">{story.name.slice(0, 1)}</span><div><strong>{story.name} · {story.result}</strong><small>{story.quote.slice(0, 45)}…</small></div><span className={`bz-publish-status ${story.published ? 'published' : ''}`}>{story.published ? tx(language, '已发布', 'Published') : tx(language, '已隐藏', 'Hidden')}</span><button className="bz-edit-button"><Pencil /> {tx(language, '编辑', 'Edit')}</button><button className={`bz-switch ${story.published ? 'on' : ''}`} onClick={() => setStories(stories.map((item) => item.id === story.id ? { ...item, published: !item.published } : item))} aria-label={tx(language, '切换发布状态', 'Toggle publish status')}><span /></button></div> })}</div></section></div>
}

function StudentManager({ students, language, setStudents }: { students: { name: string; course: string; active: boolean }[]; language: Language; setStudents: (value: { name: string; course: string; active: boolean }[]) => void }) {
  return <div className="bz-admin-content"><section className="bz-admin-card"><AdminCardHead title={tx(language, '学员与课程权限', 'Learners and course access')} description={tx(language, '确认付款后，可直接为学员开通或关闭课程', 'Enable or revoke access after checking payment status')} action={<div className="bz-admin-search"><Search /><input placeholder={tx(language, '搜索姓名或邮箱', 'Search name or email')} /></div>} /><div className="bz-student-table"><div><span>{tx(language, '学员', 'LEARNER')}</span><span>{tx(language, '课程', 'PROGRAM')}</span><span>{tx(language, '访问权限', 'ACCESS')}</span></div>{students.map((student, index) => { const original = courses.find((course) => course.title === student.course); const courseName = original ? courseCopy(original, language).title : student.course; return <div key={student.name}><span><i>{student.name.slice(0, 1)}</i><strong>{student.name}</strong></span><span>{courseName}</span><button className={`bz-access-button ${student.active ? 'active' : ''}`} onClick={() => setStudents(students.map((item, i) => i === index ? { ...item, active: !item.active } : item))}>{student.active ? <><Check /> {tx(language, '已开通', 'Enabled')}</> : <><LockKeyhole /> {tx(language, '未开通', 'Disabled')}</>}</button></div> })}</div></section></div>
}

function KeyManager({ keys, language, setKeys }: { keys: string[]; language: Language; setKeys: (keys: string[]) => void }) {
  const generate = () => { const chars = Math.random().toString(36).slice(2, 10).toUpperCase(); setKeys([`ZHYU-${chars.slice(0, 4)}-${chars.slice(4, 8)}`, ...keys]) }
  return <div className="bz-admin-content"><section className="bz-admin-card"><AdminCardHead title={tx(language, '课程密钥', 'Course keys')} description={tx(language, '生成一次性密钥，发送给已经付款的学员', 'Generate a single-use key for a learner who has paid')} action={<button className="bz-admin-primary" onClick={generate}><Plus /> {tx(language, '生成密钥', 'Generate key')}</button>} /><div className="bz-key-list">{keys.map((key) => <div key={key}><KeyRound /><code>{key}</code><span>{tx(language, '未使用', 'Unused')}</span><button onClick={() => navigator.clipboard?.writeText(key)}><Copy /> {tx(language, '复制', 'Copy')}</button></div>)}</div></section><section className="bz-help-card"><ShieldCheck /><div><strong>{tx(language, '密钥如何使用？', 'How do keys work?')}</strong><p>{tx(language, '一枚密钥只能绑定一个账号。学员兑换后，课程会自动出现在个人中心。', 'Each key can be linked to one account. Once redeemed, the program appears in the learner’s account.')}</p></div></section></div>
}

function SettingsPanel({ language }: { language: Language }) {
  return <div className="bz-admin-content"><section className="bz-admin-card"><AdminCardHead title={tx(language, '网站基本设置', 'Basic site settings')} description={tx(language, '这些信息会显示在网站和浏览器中', 'These details appear on the site and in the browser')} /><div className="bz-settings-form"><label>{tx(language, '网站名称', 'Site name')}<input defaultValue={tx(language, '知屿课程', 'ZHIYU LEARNING')} /></label><label>{tx(language, '联系微信', 'WeChat contact')}<input defaultValue="zhiyu-course" /></label><label>{tx(language, '页脚说明', 'Footer description')}<input defaultValue={tx(language, '把知识整理成方法，把方法用于真实工作。', 'Turn knowledge into methods, and methods into better work.')} /></label><button className="bz-admin-primary"><Save /> {tx(language, '保存设置', 'Save settings')}</button></div></section></div>
}

function ContentEditModal({ content, language, onSave, onClose }: { content: SiteContent; language: Language; onSave: (content: SiteContent) => void; onClose: () => void }) {
  const [draft, setDraft] = useState(content)
  const fields = language === 'zh' ? { heroTitle: 'heroTitle', heroAccent: 'heroAccent', heroDescription: 'heroDescription', instructorName: 'instructorName', instructorBio: 'instructorBio' } as const : { heroTitle: 'heroTitleEn', heroAccent: 'heroAccentEn', heroDescription: 'heroDescriptionEn', instructorName: 'instructorNameEn', instructorBio: 'instructorBioEn' } as const
  const update = (field: keyof SiteContent, value: string) => setDraft({ ...draft, [field]: value })
  return <div className="bz-admin-modal-backdrop"><div className="bz-admin-modal"><header><div><span>{tx(language, '编辑中文内容', 'EDIT ENGLISH CONTENT')}</span><h2>{tx(language, '首屏与讲师介绍', 'Hero and instructor profile')}</h2></div><button onClick={onClose} aria-label={tx(language, '关闭', 'Close')}><X /></button></header><div className="bz-admin-form"><div className="bz-language-note"><strong>{tx(language, '当前编辑：中文', 'Editing: English')}</strong><span>{tx(language, '如需编辑英文，请先在后台顶部切换语言。', 'Switch the language at the top of the admin to edit Chinese.')}</span></div><label>{tx(language, '首屏第一行', 'Hero first line')}<input value={draft[fields.heroTitle]} onChange={(event) => update(fields.heroTitle, event.target.value)} /></label><label>{tx(language, '首屏重点文字', 'Hero highlighted line')}<input value={draft[fields.heroAccent]} onChange={(event) => update(fields.heroAccent, event.target.value)} /></label><label>{tx(language, '课程介绍', 'Program introduction')}<textarea rows={4} value={draft[fields.heroDescription]} onChange={(event) => update(fields.heroDescription, event.target.value)} /></label><div className="bz-upload-field"><ImageIcon /><div><strong>{tx(language, '更换讲师主图', 'Replace instructor image')}</strong><small>{tx(language, '建议横向照片，至少 1600 × 1000 像素', 'Use a landscape image at least 1600 × 1000 pixels')}</small></div><button><Upload /> {tx(language, '选择照片', 'Choose image')}</button></div><label>{tx(language, '讲师姓名', 'Instructor name')}<input value={draft[fields.instructorName]} onChange={(event) => update(fields.instructorName, event.target.value)} /></label><label>{tx(language, '讲师介绍', 'Instructor profile')}<textarea rows={4} value={draft[fields.instructorBio]} onChange={(event) => update(fields.instructorBio, event.target.value)} /></label></div><footer><button className="bz-secondary" onClick={onClose}>{tx(language, '取消', 'Cancel')}</button><button className="bz-admin-primary" onClick={() => onSave(draft)}><Save /> {tx(language, '保存并更新网站', 'Save and update site')}</button></footer></div></div>
}

function StoryModal({ language, onAdd, onClose }: { language: Language; onAdd: (story: Omit<Story, 'id' | 'published'>) => void; onClose: () => void }) {
  const [story, setStory] = useState({ name: '', role: '', result: '', quote: '' })
  return <div className="bz-admin-modal-backdrop"><div className="bz-admin-modal"><header><div><span>{tx(language, '案例墙', 'CASE WALL')}</span><h2>{tx(language, '发布新案例', 'Publish a new case')}</h2></div><button onClick={onClose} aria-label={tx(language, '关闭', 'Close')}><X /></button></header><div className="bz-admin-form"><label>{tx(language, '学员姓名', 'Learner name')}<input value={story.name} onChange={(e) => setStory({ ...story, name: e.target.value })} placeholder={tx(language, '例如：陈亦川', 'Example: Yichuan Chen')} /></label><label>{tx(language, '身份与城市', 'Role and city')}<input value={story.role} onChange={(e) => setStory({ ...story, role: e.target.value })} placeholder={tx(language, '例如：产品设计师 · 上海', 'Example: Product Designer · Shanghai')} /></label><label>{tx(language, '最终成果', 'Outcome')}<input value={story.result} onChange={(e) => setStory({ ...story, result: e.target.value })} placeholder={tx(language, '例如：完成第一套线上课程', 'Example: Completed a first online course')} /></label><label>{tx(language, '案例内容', 'Case story')}<textarea rows={5} value={story.quote} onChange={(e) => setStory({ ...story, quote: e.target.value })} placeholder={tx(language, '说明学习前后的具体变化……', 'Describe the specific change before and after the program…')} /></label></div><footer><button className="bz-secondary" onClick={onClose}>{tx(language, '取消', 'Cancel')}</button><button className="bz-admin-primary" disabled={!story.name || !story.quote} onClick={() => onAdd(story)}><Save /> {tx(language, '保存并发布', 'Save and publish')}</button></footer></div></div>
}

function Footer({ language, onNavigate }: { language: Language; onNavigate: (view: View) => void }) {
  return <footer className="bz-footer"><div className="bz-container"><div><Brand language={language} /><p>{tx(language, '把知识整理成方法，把方法用于真实工作。', 'Turn knowledge into methods, and methods into better work.')}</p></div><div><strong>{tx(language, '浏览', 'EXPLORE')}</strong><button onClick={() => onNavigate('courses')}>{tx(language, '课程体系', 'Programs')}</button><button onClick={() => onNavigate('cases')}>{tx(language, '案例墙', 'Student results')}</button><button onClick={() => onNavigate('profile')}>{tx(language, '个人中心', 'My account')}</button></div><div><strong>{tx(language, '联系', 'CONTACT')}</strong><span>{tx(language, '微信', 'WeChat')}：zhiyu-course</span><span>{tx(language, '邮箱', 'Email')}：hello@example.com</span></div></div><div className="bz-container bz-footer-bottom"><span>© 2026 ZHIYU LEARNING</span><span>{tx(language, '专业知识课程与实践指导', 'PROFESSIONAL COURSES & GUIDED PRACTICE')}</span></div></footer>
}

function loadContent(): SiteContent {
  try { return { ...defaultContent, ...JSON.parse(localStorage.getItem('zhiyu-content') || '{}') } }
  catch { return defaultContent }
}

function AppBusiness() {
  const [view, setView] = useState<View>(() => (window.location.hash.slice(1) as View) || 'home')
  const [theme, setTheme] = useState<Theme>(() => (localStorage.getItem('zhiyu-theme') as Theme) || 'dark')
  const [language, setLanguage] = useState<Language>(() => (localStorage.getItem('zhiyu-language') as Language) || 'zh')
  const [content, setContentState] = useState<SiteContent>(loadContent)
  const [stories, setStoriesState] = useState<Story[]>(() => JSON.parse(localStorage.getItem('zhiyu-stories') || JSON.stringify(defaultStories)))
  const [unlocked, setUnlocked] = useState<string[]>(() => JSON.parse(localStorage.getItem('zhiyu-access') || '[]'))
  const [unlockCourse, setUnlockCourse] = useState<Course | null>(null)
  const setContent = (next: SiteContent) => { setContentState(next); localStorage.setItem('zhiyu-content', JSON.stringify(next)) }
  const setStories = (next: Story[]) => { setStoriesState(next); localStorage.setItem('zhiyu-stories', JSON.stringify(next)) }
  const navigate = (next: View) => { setView(next); window.location.hash = next; window.scrollTo({ top: 0, behavior: 'smooth' }) }
  const toggleLanguage = () => setLanguage((current) => current === 'zh' ? 'en' : 'zh')
  useEffect(() => { document.documentElement.dataset.theme = theme; localStorage.setItem('zhiyu-theme', theme) }, [theme])
  useEffect(() => { document.documentElement.lang = language === 'zh' ? 'zh-CN' : 'en'; localStorage.setItem('zhiyu-language', language) }, [language])
  useEffect(() => { const listener = () => setView((window.location.hash.slice(1) as View) || 'home'); window.addEventListener('hashchange', listener); return () => window.removeEventListener('hashchange', listener) }, [])
  const title = useMemo(() => language === 'zh' ? ({ home: '知屿课程 · 专业知识课程', courses: '课程体系 · 知屿课程', cases: '案例墙 · 知屿课程', profile: '个人中心 · 知屿课程', admin: '内容后台 · 知屿课程' })[view] : ({ home: 'ZHIYU Learning · Professional Courses', courses: 'Programs · ZHIYU Learning', cases: 'Student Results · ZHIYU Learning', profile: 'My Account · ZHIYU Learning', admin: 'Creator Admin · ZHIYU Learning' })[view], [view, language])
  useEffect(() => { document.title = title }, [title])
  useEffect(() => {
    if (!('IntersectionObserver' in window) || window.matchMedia('(prefers-reduced-motion: reduce)').matches) return
    document.documentElement.classList.add('bz-reveal-armed')
    const io = new IntersectionObserver((entries) => {
      for (const entry of entries) if (entry.isIntersecting) { entry.target.classList.add('bz-in'); io.unobserve(entry.target) }
    }, { threshold: 0.1, rootMargin: '0px 0px -6% 0px' })
    document.querySelectorAll('.bz-program-card, .bz-story-feature, .bz-about-grid, .bz-dashboard-preview, .bz-case-grid article, .bz-course-list > article, .bz-trust .bz-container > div, .bz-submit-story').forEach((el) => { el.classList.add('bz-will'); io.observe(el) })
    return () => io.disconnect()
  }, [view])
  const completeUnlock = (course: Course) => { const next = Array.from(new Set([...unlocked, course.id])); setUnlocked(next); localStorage.setItem('zhiyu-access', JSON.stringify(next)); setUnlockCourse(null); navigate('profile') }
  const about = () => { if (view !== 'home') { navigate('home'); window.setTimeout(() => document.querySelector('#about')?.scrollIntoView({ behavior: 'smooth' }), 100) } else document.querySelector('#about')?.scrollIntoView({ behavior: 'smooth' }) }
  if (view === 'admin') return <AdminView content={content} setContent={setContent} stories={stories} setStories={setStories} language={language} onToggleLanguage={toggleLanguage} onExit={() => navigate('home')} />
  const bottomItems = [{ id: 'home', label: tx(language, '首页', 'Home'), icon: Home }, { id: 'courses', label: tx(language, '课程', 'Programs'), icon: Library }, { id: 'cases', label: tx(language, '案例', 'Results'), icon: ClipboardList }, { id: 'profile', label: tx(language, '我的', 'Account'), icon: UserRound }]
  return <div className={`bz-app bz-lang-${language}`}><PublicHeader view={view} theme={theme} language={language} onNavigate={navigate} onAbout={about} onToggleTheme={() => setTheme(theme === 'dark' ? 'light' : 'dark')} onToggleLanguage={toggleLanguage} />{view === 'home' && <HomeView content={content} stories={stories.filter((story) => story.published)} language={language} onNavigate={navigate} />}{view === 'courses' && <CoursesView unlocked={unlocked} language={language} onUnlock={setUnlockCourse} onProfile={() => navigate('profile')} />}{view === 'cases' && <CasesView stories={stories} language={language} />}{view === 'profile' && <ProfileView unlocked={unlocked} language={language} onOpenKey={() => setUnlockCourse(courses[0])} onAdmin={() => navigate('admin')} />}<Footer language={language} onNavigate={navigate} /><nav className="bz-mobile-bottom" aria-label={tx(language, '手机导航', 'Mobile navigation')}>{bottomItems.map(({ id, label, icon: Icon }) => <button className={view === id ? 'active' : ''} key={id} onClick={() => navigate(id as View)}><Icon /><span>{label}</span></button>)}</nav>{unlockCourse && <AccessModal course={unlockCourse} language={language} onClose={() => setUnlockCourse(null)} onUnlock={completeUnlock} />}</div>
}

export default AppBusiness
