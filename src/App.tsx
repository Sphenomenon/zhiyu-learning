import { useEffect, useMemo, useState } from 'react'
import {
  ArrowDown,
  ArrowRight,
  BookOpen,
  Check,
  ChevronDown,
  CircleUserRound,
  Clock3,
  Copy,
  ExternalLink,
  FolderDown,
  Grid2X2,
  Home,
  KeyRound,
  Library,
  LockKeyhole,
  Mail,
  Menu,
  MessageCircle,
  Moon,
  Play,
  Route,
  ShieldCheck,
  Sparkles,
  Sun,
  Unlock,
  UserRound,
  UsersRound,
  X,
} from 'lucide-react'
import { chapters, courses, type Course } from './data'

type View = 'home' | 'courses' | 'journey' | 'profile'
type ProfileTab = 'learning' | 'access' | 'account' | 'admin'
type Theme = 'light' | 'dark'

const navItems: { id: View; label: string; icon: typeof Home }[] = [
  { id: 'home', label: '首页', icon: Home },
  { id: 'courses', label: '课程', icon: Library },
  { id: 'journey', label: '路径', icon: Route },
  { id: 'profile', label: '我的', icon: UserRound },
]

function Brand() {
  return (
    <div className="brand" aria-label="知屿课程空间">
      <span className="brand-mark"><span /></span>
      <span className="brand-name">知屿</span>
      <span className="brand-en">ZHIYU STUDIO</span>
    </div>
  )
}

function CourseArtwork({ course, compact = false }: { course: Course; compact?: boolean }) {
  return (
    <div className={`course-art course-art--${course.color} ${compact ? 'course-art--compact' : ''}`} aria-hidden="true">
      <span className="art-grid" />
      <span className="art-orbit art-orbit--one" />
      <span className="art-orbit art-orbit--two" />
      <span className="art-core">{course.index}</span>
      <span className="art-caption">KNOWLEDGE<br />IN MOTION</span>
    </div>
  )
}

function BootScreen({ onDone }: { onDone: () => void }) {
  const [progress, setProgress] = useState(6)

  useEffect(() => {
    const timer = window.setInterval(() => {
      setProgress((value) => Math.min(100, value + Math.ceil((100 - value) / 5)))
    }, 80)
    const done = window.setTimeout(onDone, 1250)
    return () => {
      window.clearInterval(timer)
      window.clearTimeout(done)
    }
  }, [onDone])

  return (
    <div className="boot" onClick={onDone} role="button" tabIndex={0} aria-label="跳过载入动画">
      <div className="boot-top mono"><span>COURSE SPACE / INITIALIZING</span><span>SYS.01</span></div>
      <div className="boot-center">
        <Brand />
        <div className="boot-progress"><span style={{ width: `${progress}%` }} /></div>
        <div className="boot-number">{String(progress).padStart(3, '0')}<small>%</small></div>
      </div>
      <div className="boot-bottom mono"><span>SYNCING LEARNING PATH</span><span>点击跳过</span></div>
    </div>
  )
}

function Header({ view, theme, onNavigate, onOpenKey, onToggleTheme }: { view: View; theme: Theme; onNavigate: (view: View) => void; onOpenKey: () => void; onToggleTheme: () => void }) {
  const [open, setOpen] = useState(false)

  const go = (next: View) => {
    onNavigate(next)
    setOpen(false)
  }

  return (
    <>
      <header className="topbar">
        <button className="brand-button" onClick={() => go('home')}><Brand /></button>
        <nav className="desktop-nav" aria-label="主导航">
          {navItems.map((item) => (
            <button key={item.id} className={view === item.id ? 'active' : ''} onClick={() => go(item.id)}>{item.label}</button>
          ))}
        </nav>
        <div className="header-actions">
          <button className="key-chip" onClick={onOpenKey}><KeyRound size={15} /> 兑换密钥</button>
          <button className="theme-toggle" aria-label={`切换为${theme === 'dark' ? '亮色' : '暗色'}模式`} title={`切换为${theme === 'dark' ? '亮色' : '暗色'}模式`} onClick={onToggleTheme}>{theme === 'dark' ? <Sun /> : <Moon />}</button>
          <button className="avatar-button" aria-label="打开个人中心" onClick={() => go('profile')}>YL<span className="online-dot" /></button>
          <button className="menu-button" aria-label="打开菜单" onClick={() => setOpen(true)}><Menu /></button>
        </div>
      </header>
      <div className={`mobile-drawer ${open ? 'is-open' : ''}`} aria-hidden={!open}>
        <div className="drawer-head"><Brand /><button aria-label="关闭菜单" onClick={() => setOpen(false)}><X /></button></div>
        <div className="drawer-links">
          {navItems.map((item, index) => (
            <button key={item.id} onClick={() => go(item.id)}>
              <span className="mono">0{index + 1}</span>{item.label}<ArrowRight />
            </button>
          ))}
        </div>
        <button className="button button--acid button--full" onClick={() => { setOpen(false); onOpenKey() }}><KeyRound /> 兑换课程密钥</button>
      </div>
    </>
  )
}

function HomeView({ onNavigate, onOpenKey }: { onNavigate: (view: View) => void; onOpenKey: () => void }) {
  return (
    <main>
      <section className="hero shell">
        <div className="hero-kicker mono"><span className="signal-dot" /> CREATOR-LED LEARNING · 2026</div>
        <div className="hero-copy">
          <h1>把经验，变成<br /><em>可以反复抵达的路。</em></h1>
          <p>为认真学习的人设计的知识空间。循序推进的课程、真实案例与持续更新的实践笔记，都在这里发生连接。</p>
          <div className="hero-actions">
            <button className="button button--acid" onClick={() => onNavigate('courses')}>开始探索 <ArrowRight /></button>
            <button className="button button--ghost" onClick={() => onNavigate('journey')}><Play /> 了解学习路径</button>
          </div>
        </div>
        <div className="hero-stage" aria-label="课程结构预览">
          <div className="stage-meta mono"><span>LEARNING SYSTEM</span><span>01 — 03</span></div>
          <CourseArtwork course={courses[0]} />
          <div className="floating-note floating-note--left"><span>累计学习者</span><strong>1,284<small>+</small></strong></div>
          <div className="floating-note floating-note--right"><span className="pulse" /> <b>本周持续更新</b></div>
        </div>
        <button className="scroll-cue" onClick={() => document.querySelector('#approach')?.scrollIntoView({ behavior: 'smooth' })}><ArrowDown /> 向下探索</button>
      </section>

      <section className="manifesto" id="approach">
        <div className="shell manifesto-grid">
          <div className="section-label mono">01 / OUR APPROACH</div>
          <div>
            <h2>不是更多信息，<br />而是更好的<span className="underline">理解方式。</span></h2>
            <div className="manifesto-copy">
              <p>真正有效的课程，不该只是视频的堆叠。我们从问题出发，把知识拆成可以理解、练习和验证的路径。</p>
              <p>每一节课都要回答三个问题：为什么、怎么做，以及你是否真的掌握了。</p>
            </div>
          </div>
        </div>
      </section>

      <section className="course-feature shell">
        <div className="section-head">
          <div><div className="section-label mono">02 / FEATURED COURSE</div><h2>从这里，建立你的<br />第一套知识系统。</h2></div>
          <button className="text-link" onClick={() => onNavigate('courses')}>查看全部课程 <ArrowRight /></button>
        </div>
        <div className="feature-card">
          <CourseArtwork course={courses[0]} />
          <div className="feature-info">
            <div className="eyebrow"><span>{courses[0].label}</span><span>·</span><span>{courses[0].level}</span></div>
            <h3>{courses[0].title}</h3>
            <p className="feature-subtitle">{courses[0].subtitle}</p>
            <p className="feature-description">{courses[0].description}</p>
            <div className="course-stats"><span><BookOpen /> {courses[0].lessons} 节课程</span><span><Clock3 /> {courses[0].duration}</span></div>
            <div className="feature-actions"><button className="button button--light" onClick={() => onNavigate('courses')}>查看课程介绍 <ArrowRight /></button><button className="round-button" onClick={onOpenKey} aria-label="使用密钥解锁"><Unlock /></button></div>
          </div>
        </div>
      </section>

      <section className="path-section">
        <div className="shell">
          <div className="section-label mono">03 / LEARNING PATH</div>
          <div className="path-intro"><h2>每一步，都有迹可循。</h2><p>不是看完，而是完成。从建立认知，到动手实践，再到形成自己的系统。</p></div>
          <div className="path-list">
            {[
              ['01', '看见问题', '厘清现状与目标，找到真正值得投入的问题。', 'OBSERVE'],
              ['02', '建立结构', '理解关键概念，并把零散知识连接成系统。', 'STRUCTURE'],
              ['03', '刻意实践', '跟随任务动手做，在反馈中修正理解。', 'PRACTICE'],
              ['04', '形成作品', '完成可展示、可复用，也真正属于你的成果。', 'CREATE'],
            ].map(([number, title, copy, en]) => (
              <div className="path-row" key={number}><span className="path-number mono">{number}</span><span className="path-icon"><Sparkles /></span><div><h3>{title}</h3><p>{copy}</p></div><span className="path-en mono">{en}</span></div>
            ))}
          </div>
          <button className="button button--acid path-button" onClick={() => onNavigate('journey')}>查看完整成长路径 <ArrowRight /></button>
        </div>
      </section>

      <section className="cases shell">
        <div className="section-head"><div><div className="section-label mono">04 / STUDENT STORIES</div><h2>学习发生之后。</h2></div><div className="case-count"><strong>86</strong><span>份真实成长记录</span></div></div>
        <div className="case-grid">
          <article className="case-card case-card--large"><div className="quote">“</div><blockquote>过去我只是不断收藏资料。现在我有了一套能真正帮助自己做决定、产出内容的方法。</blockquote><div className="case-person"><span className="person-avatar">YC</span><div><strong>陈亦川</strong><small>产品设计师 · 上海</small></div></div><span className="case-tag mono">CASE / 014</span></article>
          <article className="case-card case-card--accent"><div className="metric"><strong>12</strong><span>周持续输出</span></div><p>“第一次把脑中的经验，变成了一套别人能够理解的内容。”</p><div className="case-person"><span className="person-avatar">MW</span><div><strong>孟文</strong><small>独立创作者 · 杭州</small></div></div></article>
          <article className="case-card"><div className="metric"><strong>03</strong><span>个完整作品</span></div><p>从无从下手到拥有稳定流程，我终于知道下一步该做什么。</p><div className="case-person"><span className="person-avatar">LX</span><div><strong>林曦</strong><small>内容策划 · 成都</small></div></div></article>
        </div>
      </section>

      <section className="final-cta">
        <div className="shell final-grid"><div className="section-label mono">START YOUR PATH</div><div><h2>准备好，开始建立<br />自己的知识系统了吗？</h2><p>你不需要知道所有答案，只需要从第一个真正的问题开始。</p><div className="hero-actions"><button className="button button--acid" onClick={() => onNavigate('courses')}>浏览全部课程 <ArrowRight /></button><button className="button button--ghost" onClick={onOpenKey}><KeyRound /> 我已有密钥</button></div></div></div>
      </section>
    </main>
  )
}

function CoursesView({ unlocked, onOpenKey, onNavigate }: { unlocked: string[]; onOpenKey: (course?: Course) => void; onNavigate: (view: View) => void }) {
  return (
    <main className="inner-page shell">
      <div className="page-heading"><div className="section-label mono">COURSE LIBRARY / 03</div><h1>选择一条值得<br /><em>长期走下去的路。</em></h1><p>从基础方法到完整的个人知识业务。按顺序学习，也可以从你当下最需要的模块开始。</p></div>
      <div className="filter-row"><button className="active">全部课程 <span>3</span></button><button>入门 <span>1</span></button><button>进阶 <span>1</span></button><button>系统课 <span>1</span></button></div>
      <div className="course-grid">
        {courses.map((course) => {
          const hasAccess = unlocked.includes(course.id)
          return (
            <article className="library-card" key={course.id}>
              <CourseArtwork course={course} compact />
              <div className="library-info">
                <div className="eyebrow"><span>{course.label}</span><span>·</span><span>{course.level}</span></div>
                <h2>{course.title}</h2><p>{course.description}</p>
                <div className="course-stats"><span><BookOpen /> {course.lessons} 节</span><span><Clock3 /> {course.duration}</span></div>
                {hasAccess ? <button className="button button--light button--full" onClick={() => onNavigate('profile')}><Play /> 继续学习</button> : <button className="button button--outline button--full" onClick={() => onOpenKey(course)}><LockKeyhole /> 解锁课程</button>}
              </div>
            </article>
          )
        })}
      </div>
      <div className="help-strip"><div><ShieldCheck /><span><strong>不知道从哪门开始？</strong><small>告诉我们你的目标，获取学习路径建议。</small></span></div><button className="text-link">获取选课建议 <ArrowRight /></button></div>
    </main>
  )
}

function JourneyView({ onNavigate }: { onNavigate: (view: View) => void }) {
  const steps = [
    { no: 'PHASE 01', title: '建立坐标', time: '第 1—2 周', desc: '认识自己的经验、目标与表达对象，建立第一张问题地图。', tasks: ['完成能力盘点', '建立问题清单', '选择一个真实课题'] },
    { no: 'PHASE 02', title: '组织知识', time: '第 3—5 周', desc: '用模块、关系与证据重新组织材料，让复杂内容拥有清晰结构。', tasks: ['拆解知识单元', '绘制内容结构', '完成一次讲解'] },
    { no: 'PHASE 03', title: '投入实践', time: '第 6—8 周', desc: '通过真实任务验证理解，在反复输出与反馈中形成稳定能力。', tasks: ['执行每周任务', '获得同伴反馈', '完成阶段作品'] },
    { no: 'PHASE 04', title: '沉淀系统', time: '长期', desc: '把一次成功整理成可复用流程，让个人成长不断产生复利。', tasks: ['整理个人 SOP', '建立素材系统', '发布完整作品'] },
  ]

  return (
    <main className="inner-page shell journey-page">
      <div className="page-heading"><div className="section-label mono">GROWTH MAP / 01—04</div><h1>看见成长发生的<br /><em>每一个刻度。</em></h1><p>一张为期八周、也可以陪伴更久的学习地图。每个阶段都有目标、行动和看得见的成果。</p></div>
      <div className="journey-map">
        {steps.map((step, index) => <article className="journey-step" key={step.no}><div className="journey-line"><span>{index + 1}</span></div><div className="journey-meta"><span className="mono">{step.no}</span><span>{step.time}</span></div><div className="journey-copy"><h2>{step.title}</h2><p>{step.desc}</p><ul>{step.tasks.map((task) => <li key={task}><Check /> {task}</li>)}</ul></div></article>)}
      </div>
      <div className="journey-cta"><div><span className="mono">YOUR NEXT STEP</span><h2>从第一阶段开始。</h2><p>当前推荐：《知识结构化入门》</p></div><button className="button button--acid" onClick={() => onNavigate('courses')}>进入推荐课程 <ArrowRight /></button></div>
    </main>
  )
}

function ProgressRing({ value }: { value: number }) {
  return <div className="progress-ring" style={{ '--progress': `${value * 3.6}deg` } as React.CSSProperties}><span><strong>{value}</strong><small>%</small></span></div>
}

function ResourceModal({ course, onClose }: { course: Course; onClose: () => void }) {
  const [copied, setCopied] = useState(false)
  const extractionCode = 'ZHYU'

  useEffect(() => {
    const close = (event: KeyboardEvent) => event.key === 'Escape' && onClose()
    document.addEventListener('keydown', close)
    document.body.classList.add('modal-open')
    return () => { document.removeEventListener('keydown', close); document.body.classList.remove('modal-open') }
  }, [onClose])

  const copyCode = async () => {
    await navigator.clipboard?.writeText(extractionCode)
    setCopied(true)
    window.setTimeout(() => setCopied(false), 1800)
  }

  return (
    <div className="modal-backdrop" onMouseDown={(event) => event.currentTarget === event.target && onClose()}>
      <div className="access-modal resource-modal" role="dialog" aria-modal="true" aria-labelledby="resource-title">
        <button className="modal-close" onClick={onClose} aria-label="关闭"><X /></button>
        <span className="modal-kicker mono">COURSE RESOURCES / {course.index}</span>
        <div className="resource-heading"><span><FolderDown /></span><div><h2 id="resource-title">课程资料已开放</h2><p>《{course.title}》· 百度网盘交付</p></div></div>
        <div className="netdisk-card">
          <div className="netdisk-head"><span>BAIDU NETDISK</span><small>演示内容</small></div>
          <div className="netdisk-link"><span>pan.baidu.com/s/1ZHIYU-DEMO</span><ExternalLink /></div>
          <div className="extract-code"><div><span>提取码</span><strong>{extractionCode}</strong></div><button onClick={copyCode}>{copied ? <Check /> : <Copy />}{copied ? '已复制' : '复制提取码'}</button></div>
        </div>
        <a className="button button--acid button--full" href="https://pan.baidu.com/" target="_blank" rel="noreferrer">打开百度网盘 <ExternalLink /></a>
        <div className="key-help"><ShieldCheck /><p>链接和提取码仅供已购学习者使用。正式版会在登录与课程权限校验通过后，由服务端返回对应资料。</p></div>
      </div>
    </div>
  )
}

function LearningPanel({ unlocked, onOpenKey }: { unlocked: string[]; onOpenKey: () => void }) {
  const current = courses[0]
  const canStudy = unlocked.includes(current.id)
  const [resourceOpen, setResourceOpen] = useState(false)
  return (
    <div className="dashboard-panel">
      <section className="welcome-card"><div><span className="mono">TUESDAY · 08 SEP</span><h2>晚上好，雨林。</h2><p>{canStudy ? '课程资料已开放，可前往百度网盘获取视频、课件与后续更新。' : '你的学习空间已经准备好。使用课程密钥，解锁第一条学习路径。'}</p>{canStudy ? <button className="button button--acid" onClick={() => setResourceOpen(true)}><FolderDown /> 查看课程资料</button> : <button className="button button--acid" onClick={onOpenKey}><KeyRound /> 兑换课程密钥</button>}</div><ProgressRing value={canStudy ? 42 : 0} /></section>
      <section className="dashboard-section"><div className="dashboard-title"><div><span className="mono">CURRENT COURSE</span><h3>正在学习</h3></div><button>查看全部 <ArrowRight /></button></div>
        {canStudy ? <div className="current-course"><CourseArtwork course={current} compact /><div><span className="eyebrow">{current.label} · 已解锁</span><h3>{current.title}</h3><div className="mini-progress"><span style={{ width: '42%' }} /></div><small>已获取 7 / 18 节资料</small></div><button className="circle-play" onClick={() => setResourceOpen(true)} aria-label="查看课程资料"><FolderDown /></button></div> : <div className="empty-access"><LockKeyhole /><div><strong>暂无已解锁课程</strong><p>购买课程后，使用老师发送的密钥获得访问权限。</p></div><button onClick={onOpenKey}>立即兑换</button></div>}
      </section>
      <section className="dashboard-section"><div className="dashboard-title"><div><span className="mono">CHAPTERS</span><h3>课程目录</h3></div><span className="completion">2 / 4 已领取</span></div><div className="chapter-list">{chapters.map((chapter, index) => <div className={`chapter-row ${!canStudy ? 'is-locked' : ''}`} key={chapter.title}><span className={`chapter-check ${chapter.done && canStudy ? 'done' : ''}`}>{chapter.done && canStudy ? <Check /> : String(index + 1).padStart(2, '0')}</span><div><strong>{chapter.title}</strong><small>{chapter.meta}</small></div>{!canStudy ? <LockKeyhole /> : <ArrowRight />}</div>)}</div></section>
      {resourceOpen && <ResourceModal course={current} onClose={() => setResourceOpen(false)} />}
    </div>
  )
}

function AccessPanel({ unlocked, onOpenKey }: { unlocked: string[]; onOpenKey: () => void }) {
  return (
    <div className="dashboard-panel"><section className="access-hero"><div className="access-icon"><KeyRound /></div><div><span className="mono">ACCESS CENTER</span><h2>课程与访问权限</h2><p>在这里查看已解锁内容，或使用老师发送的专属密钥添加新课程。</p></div><button className="button button--acid" onClick={onOpenKey}>兑换新密钥 <ArrowRight /></button></section>
      <section className="dashboard-section"><div className="dashboard-title"><div><span className="mono">ENTITLEMENTS</span><h3>我的课程权限</h3></div><span className="completion">{unlocked.length} / {courses.length}</span></div><div className="entitlement-list">{courses.map((course) => { const active = unlocked.includes(course.id); return <div className="entitlement-row" key={course.id}><div className={`entitlement-index ${course.color}`}>{course.index}</div><div><strong>{course.title}</strong><small>{active ? '永久观看 · 已激活' : '尚未解锁'}</small></div><span className={`status-pill ${active ? 'is-active' : ''}`}>{active ? <><Check /> 已解锁</> : <><LockKeyhole /> 未解锁</>}</span></div> })}</div></section>
      <div className="security-note"><ShieldCheck /><div><strong>密钥仅用于绑定课程权限</strong><p>正式上线后，兑换将在服务端完成验证，密钥不会以明文存放在网页或浏览器中。</p></div></div>
    </div>
  )
}

function AdminPanel() {
  const [users, setUsers] = useState([
    { name: '陈亦川', email: 'yi****@mail.com', course: '知识结构化入门', active: true },
    { name: '孟文', email: 'me****@mail.com', course: '高密度表达训练', active: true },
    { name: '林曦', email: 'li****@mail.com', course: '个人知识产品工作室', active: false },
  ])
  return (
    <div className="dashboard-panel"><section className="creator-toolbar"><div><span className="mono">CONTENT STUDIO</span><h2>内容工作台</h2><p>像整理文件夹一样搭建课程、案例墙和图文分区。</p></div><div><button><span>＋</span> 新建分区</button><button><span>↥</span> 上传图文</button><button><span>▷</span> 上传视频</button></div></section><div className="admin-stats"><div><span>总学习者</span><strong>1,284</strong><small>+6.8% 本月</small></div><div><span>活跃学习者</span><strong>306</strong><small>近 7 天</small></div><div><span>密钥待使用</span><strong>48</strong><small>共生成 520</small></div></div>
      <section className="dashboard-section"><div className="dashboard-title"><div><span className="mono">USER ACCESS</span><h3>学习者权限</h3></div><button className="admin-action"><KeyRound /> 生成密钥</button></div><div className="admin-list"><div className="admin-head"><span>学习者</span><span>已分配课程</span><span>访问状态</span></div>{users.map((user, index) => <div className="admin-row" key={user.email}><div><span className="person-avatar">{user.name.slice(0, 1)}</span><span><strong>{user.name}</strong><small>{user.email}</small></span></div><span>{user.course}</span><button className={`access-switch ${user.active ? 'on' : ''}`} aria-label={`${user.active ? '关闭' : '开启'} ${user.name} 的课程权限`} onClick={() => setUsers((current) => current.map((item, i) => i === index ? { ...item, active: !item.active } : item))}><span /> {user.active ? '已开启' : '已关闭'}</button></div>)}</div></section>
      <div className="security-note"><ShieldCheck /><div><strong>管理员操作演示</strong><p>当前仅演示学习者列表与权限开关。正式版需接入管理员身份验证、操作日志与服务端权限校验。</p></div></div>
    </div>
  )
}

function AccountPanel() {
  return (
    <div className="dashboard-panel">
      <section className="access-hero account-hero"><div className="access-icon"><CircleUserRound /></div><div><span className="mono">ACCOUNT PROFILE</span><h2>账户与个人资料</h2><p>管理公开资料、登录方式与账号安全。</p></div><button className="button button--outline">编辑个人资料</button></section>
      <section className="dashboard-section"><div className="dashboard-title"><div><span className="mono">SIGN-IN METHODS</span><h3>登录与绑定</h3></div></div><div className="login-methods"><div><span className="login-icon wechat"><MessageCircle /></span><div><strong>微信登录</strong><small>已绑定 · 昵称「雨林」</small></div><span className="status-pill is-active"><Check /> 已绑定</span></div><div><span className="login-icon email"><Mail /></span><div><strong>邮箱登录</strong><small>yu****@example.com</small></div><button>更换邮箱</button></div></div></section>
      <section className="dashboard-section"><div className="dashboard-title"><div><span className="mono">PUBLIC PROFILE</span><h3>个人主页</h3></div><button>预览主页 <ArrowRight /></button></div><div className="profile-fields"><div><span>显示名称</span><strong>雨林</strong></div><div><span>个人简介</span><strong>正在把复杂问题整理成清晰路径。</strong></div><div><span>学习编号</span><strong>ZH-0814</strong></div></div></section>
      <div className="security-note"><ShieldCheck /><div><strong>支持微信或邮箱登录</strong><p>正式版可接入微信开放平台 OAuth；邮箱使用一次性验证码登录，避免在站内保存用户密码。</p></div></div>
    </div>
  )
}

function ProfileView({ unlocked, onOpenKey }: { unlocked: string[]; onOpenKey: () => void }) {
  const [tab, setTab] = useState<ProfileTab>('learning')
  return (
    <main className="profile-page shell">
      <aside className="profile-sidebar"><div className="profile-user"><span className="large-avatar">YL</span><div><strong>雨林</strong><small>学习者 · No. 0814</small></div></div><nav><button className={tab === 'learning' ? 'active' : ''} onClick={() => setTab('learning')}><BookOpen /> 我的学习</button><button className={tab === 'access' ? 'active' : ''} onClick={() => setTab('access')}><KeyRound /> 课程权限 <span>{unlocked.length}</span></button><button className={tab === 'account' ? 'active' : ''} onClick={() => setTab('account')}><CircleUserRound /> 账户资料</button><button className={tab === 'admin' ? 'active' : ''} onClick={() => setTab('admin')}><UsersRound /> 创作者工作台</button></nav><div className="sidebar-foot"><ShieldCheck /><span>账户与权限安全<br /><small>所有访问均受保护</small></span></div></aside>
      <div className="profile-main"><div className="profile-mobile-head"><div className="profile-user"><span className="large-avatar">YL</span><div><strong>晚上好，雨林</strong><small>学习者 · No. 0814</small></div></div><div className="profile-tabs"><button className={tab === 'learning' ? 'active' : ''} onClick={() => setTab('learning')}>学习</button><button className={tab === 'access' ? 'active' : ''} onClick={() => setTab('access')}>权限</button><button className={tab === 'account' ? 'active' : ''} onClick={() => setTab('account')}>账户</button><button className={tab === 'admin' ? 'active' : ''} onClick={() => setTab('admin')}>管理</button></div></div>{tab === 'learning' && <LearningPanel unlocked={unlocked} onOpenKey={onOpenKey} />}{tab === 'access' && <AccessPanel unlocked={unlocked} onOpenKey={onOpenKey} />}{tab === 'account' && <AccountPanel />}{tab === 'admin' && <AdminPanel />}</div>
    </main>
  )
}

function AccessModal({ course, onClose, onUnlock }: { course?: Course; onClose: () => void; onUnlock: (course: Course) => void }) {
  const [mode, setMode] = useState<'options' | 'key'>('options')
  const [key, setKey] = useState('')
  const [error, setError] = useState('')
  const selected = course ?? courses[0]

  useEffect(() => {
    const close = (event: KeyboardEvent) => event.key === 'Escape' && onClose()
    document.addEventListener('keydown', close)
    document.body.classList.add('modal-open')
    return () => { document.removeEventListener('keydown', close); document.body.classList.remove('modal-open') }
  }, [onClose])

  const submit = (event: React.FormEvent) => {
    event.preventDefault()
    if (key.trim().toUpperCase() === 'ZHIYU-2026-DEMO') onUnlock(selected)
    else setError('密钥无效，请检查字符或联系课程老师。')
  }

  return (
    <div className="modal-backdrop" onMouseDown={(event) => event.currentTarget === event.target && onClose()}>
      <div className="access-modal" role="dialog" aria-modal="true" aria-labelledby="access-title"><button className="modal-close" onClick={onClose} aria-label="关闭"><X /></button>
        {mode === 'options' ? <><span className="modal-kicker mono">UNLOCK COURSE / {selected.index}</span><h2 id="access-title">解锁《{selected.title}》</h2><p>选择适合你的方式，获得完整课程与后续更新。</p><div className="unlock-options"><button onClick={() => setMode('key')}><span className="option-icon"><KeyRound /></span><span><strong>我已有课程密钥</strong><small>输入老师发送的专属密钥</small></span><ArrowRight /></button><button onClick={() => setError('付款二维码将在接入支付渠道后显示。')}><span className="option-icon option-icon--dark"><Grid2X2 /></span><span><strong>扫码购买课程</strong><small>微信 / 支付宝扫码付款</small></span><ArrowRight /></button></div>{error && <div className="inline-message">{error}</div>}<div className="modal-demo"><span>原型演示</span><p>可使用密钥 <button onClick={() => { navigator.clipboard?.writeText('ZHIYU-2026-DEMO'); setMode('key'); setKey('ZHIYU-2026-DEMO') }}><code>ZHIYU-2026-DEMO</code><Copy /></button></p></div></> : <><button className="modal-back" onClick={() => { setMode('options'); setError('') }}><ArrowRight /> 返回</button><span className="modal-kicker mono">ACCESS KEY</span><h2 id="access-title">输入课程密钥</h2><p>兑换后，课程会立即加入你的个人中心。</p><form className="key-form" onSubmit={submit}><label htmlFor="course-key">课程密钥</label><div className="key-input"><KeyRound /><input id="course-key" autoFocus value={key} onChange={(event) => { setKey(event.target.value); setError('') }} placeholder="XXXX-XXXX-XXXX" autoCapitalize="characters" /></div>{error && <div className="form-error">{error}</div>}<button className="button button--acid button--full" type="submit">验证并解锁 <ArrowRight /></button></form><div className="key-help"><ShieldCheck /><p>一枚密钥只能绑定一个账号。遇到问题，请联系课程老师处理。</p></div></>}
      </div>
    </div>
  )
}

function UnlockToast({ course, onClose, onProfile }: { course: Course; onClose: () => void; onProfile: () => void }) {
  useEffect(() => { const timer = window.setTimeout(onClose, 6000); return () => window.clearTimeout(timer) }, [onClose])
  return <div className="unlock-toast"><span><Check /></span><div><strong>课程已成功解锁</strong><p>《{course.title}》已加入个人中心</p></div><button onClick={onProfile}>开始学习 <ArrowRight /></button><button className="toast-close" onClick={onClose} aria-label="关闭"><X /></button></div>
}

function App() {
  const [booting, setBooting] = useState(() => !sessionStorage.getItem('zhiyu-booted'))
  const [view, setView] = useState<View>(() => (window.location.hash.slice(1) as View) || 'home')
  const [theme, setTheme] = useState<Theme>(() => {
    const saved = localStorage.getItem('zhiyu-theme')
    if (saved === 'light' || saved === 'dark') return saved
    return window.matchMedia('(prefers-color-scheme: light)').matches ? 'light' : 'dark'
  })
  const [modalCourse, setModalCourse] = useState<Course | undefined>()
  const [modalOpen, setModalOpen] = useState(false)
  const [unlocked, setUnlocked] = useState<string[]>(() => JSON.parse(localStorage.getItem('zhiyu-access') || '[]'))
  const [toastCourse, setToastCourse] = useState<Course | undefined>()

  const currentTitle = useMemo(() => ({ home: '知屿 · 课程空间', courses: '全部课程 · 知屿', journey: '成长路径 · 知屿', profile: '个人中心 · 知屿' })[view], [view])

  useEffect(() => { document.title = currentTitle }, [currentTitle])
  useEffect(() => {
    document.documentElement.dataset.theme = theme
    localStorage.setItem('zhiyu-theme', theme)
    document.querySelector('meta[name="theme-color"]')?.setAttribute('content', theme === 'dark' ? '#0b0d0c' : '#f3f0e8')
  }, [theme])
  useEffect(() => {
    const onHash = () => setView((window.location.hash.slice(1) as View) || 'home')
    window.addEventListener('hashchange', onHash)
    return () => window.removeEventListener('hashchange', onHash)
  }, [])

  const navigate = (next: View) => { setView(next); window.location.hash = next; window.scrollTo({ top: 0, behavior: 'smooth' }) }
  const finishBoot = () => { sessionStorage.setItem('zhiyu-booted', '1'); setBooting(false) }
  const openKey = (course?: Course) => { setModalCourse(course); setModalOpen(true) }
  const unlock = (course: Course) => { const next = Array.from(new Set([...unlocked, course.id])); setUnlocked(next); localStorage.setItem('zhiyu-access', JSON.stringify(next)); setModalOpen(false); setToastCourse(course) }

  return (
    <div className="app">
      {booting && <BootScreen onDone={finishBoot} />}
      <Header view={view} theme={theme} onNavigate={navigate} onOpenKey={() => openKey()} onToggleTheme={() => setTheme((current) => current === 'dark' ? 'light' : 'dark')} />
      {view === 'home' && <HomeView onNavigate={navigate} onOpenKey={() => openKey()} />}
      {view === 'courses' && <CoursesView unlocked={unlocked} onOpenKey={openKey} onNavigate={navigate} />}
      {view === 'journey' && <JourneyView onNavigate={navigate} />}
      {view === 'profile' && <ProfileView unlocked={unlocked} onOpenKey={() => openKey()} />}
      <footer className="footer"><div className="shell"><Brand /><p>把知识整理成路径，把路径走成作品。</p><div className="footer-links"><button onClick={() => navigate('courses')}>全部课程</button><button onClick={() => navigate('journey')}>成长路径</button><button onClick={() => navigate('profile')}>个人中心</button></div><div className="footer-bottom mono"><span>© 2026 ZHIYU STUDIO</span><span>SHANGHAI · ONLINE</span></div></div></footer>
      <nav className="mobile-bottom-nav" aria-label="手机导航">{navItems.map((item) => { const Icon = item.icon; return <button key={item.id} className={view === item.id ? 'active' : ''} onClick={() => navigate(item.id)}><Icon /><span>{item.label}</span></button> })}</nav>
      {modalOpen && <AccessModal course={modalCourse} onClose={() => setModalOpen(false)} onUnlock={unlock} />}
      {toastCourse && <UnlockToast course={toastCourse} onClose={() => setToastCourse(undefined)} onProfile={() => { setToastCourse(undefined); navigate('profile') }} />}
    </div>
  )
}

export default App
