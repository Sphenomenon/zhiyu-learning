import { useEffect, useState } from 'react'
import { ArrowLeft, BookOpen, ClipboardList, Eye, FolderDown, Home, KeyRound, Plus, RefreshCw, Save, UsersRound } from 'lucide-react'
import type { ContentDocument, ContentEntry, ContentKind, Course, CourseResource, Language, SessionState, SiteContent, Story } from '../shared/types'
import { api, errorMessage } from './api'
import { LoginBox, Modal, Notice } from './Account'
import { defaultContent, tx } from './catalog'
import { KeysManager, OrdersManager, StudentsManager } from './AdminAccess'
import { CurriculumEditor } from './CurriculumEditor'

type AdminTab = 'site' | 'course' | 'case' | 'students' | 'keys' | 'orders'
function titleOf(entry: ContentEntry) {
  if (entry.kind === 'site') return (entry.draft as SiteContent).heroTitle
  if (entry.kind === 'course') return (entry.draft as Course).title
  return (entry.draft as Story).name
}
function newEntry(kind: ContentKind): ContentEntry {
  const id = kind === 'site' ? 'home' : crypto.randomUUID()
  const draft: ContentDocument = kind === 'site' ? defaultContent : kind === 'course'
    ? { id, index: '04', title: '', label: '', subtitle: '', description: '', lessons: 0, duration: '', level: '', color: 'acid', imageUrl: '/images/course-structure.jpg' }
    : { id, name: '', role: '', result: '', quote: '', published: true }
  return { kind, id, draft, published: null, revision: 0, updatedAt: 0 }
}
const siteFields: [string, string, string, boolean][] = [
  ['heroTitle', '首页标题', 'Headline', false], ['heroAccent', '标题强调文字', 'Headline accent', false],
  ['heroDescription', '首页介绍', 'Introduction', true], ['instructorName', '讲师姓名', 'Instructor name', false], ['instructorBio', '讲师介绍', 'Instructor bio', true],
]
const courseFields: [string, string, string, boolean][] = [
  ['title', '课程名称', 'Program title', false], ['label', '课程类别', 'Category', false], ['subtitle', '副标题', 'Subtitle', false],
  ['description', '课程介绍', 'Description', true], ['duration', '课程时长', 'Duration', false], ['level', '适合阶段', 'Level', false],
]
const storyFields: [string, string, string, boolean][] = [
  ['name', '学员姓名', 'Learner name', false], ['role', '身份与城市', 'Role and city', false], ['result', '学习成果', 'Outcome', false], ['quote', '案例内容', 'Case story', true],
]
function ContentEditor({ entry, language, onSaved, onClose }: { entry: ContentEntry; language: Language; onSaved: (entry: ContentEntry) => void; onClose: () => void }) {
  const [draft, setDraft] = useState(entry.draft)
  const [revision, setRevision] = useState(entry.revision)
  const [baseline, setBaseline] = useState(JSON.stringify(entry.draft))
  const [editLanguage, setEditLanguage] = useState<Language>('zh')
  const [busy, setBusy] = useState(false)
  const [error, setError] = useState<unknown>(null)
  const [saved, setSaved] = useState<string | null>(null)
  const dirty = JSON.stringify(draft) !== baseline
  useEffect(() => {
    const handler = (event: BeforeUnloadEvent) => { if (dirty) { event.preventDefault(); event.returnValue = '' } }
    window.addEventListener('beforeunload', handler)
    return () => window.removeEventListener('beforeunload', handler)
  }, [dirty])
  const close = () => { if (!busy && (!dirty || window.confirm(tx(language, '还有未保存的修改，确定关闭吗？', 'Discard unsaved changes?')))) onClose() }
  const fields = entry.kind === 'site' ? siteFields : entry.kind === 'course' ? courseFields : storyFields
  const record = draft as unknown as Record<string, unknown>
  const translated = entry.kind !== 'site' && editLanguage === 'en'
  const active = translated ? (record.en || {}) as Record<string, unknown> : record
  const set = (key: string, value: unknown) => {
    setSaved(null)
    const field = entry.kind === 'site' && editLanguage === 'en' ? `${key}En` : key
    setDraft({ ...record, ...(translated ? { en: { ...active, [field]: value } } : { [field]: value }) } as unknown as ContentDocument)
  }
  const submit = async (event: React.FormEvent<HTMLFormElement>) => {
    event.preventDefault()
    const action = ((event.nativeEvent as SubmitEvent).submitter as HTMLButtonElement)?.value || 'draft'
    setBusy(true); setError(null); setSaved(null)
    try {
      const result = await api<{ item: ContentEntry }>(`/admin/content/${entry.kind}/${entry.id}`, { method: 'PUT', data: { draft, revision, action } })
      setRevision(result.item.revision); setDraft(result.item.draft); setBaseline(JSON.stringify(result.item.draft)); onSaved(result.item); setSaved(action)
    } catch (error) { setError(error) } finally { setBusy(false) }
  }
  return <Modal title={tx(language, '编辑内容', 'Edit content')} language={language} onClose={close}>
    <p>{tx(language, '草稿不会显示在公开网站。确认内容后，点击“发布到网站”。', 'Drafts stay private. Choose “Publish to site” when the content is ready.')} · v{revision}</p>
    <div className="bz-editor-tabs"><button className={editLanguage === 'zh' ? 'active' : ''} onClick={() => setEditLanguage('zh')}>中文</button><button className={editLanguage === 'en' ? 'active' : ''} onClick={() => setEditLanguage('en')}>English</button></div>
    <form className="bz-server-form" onSubmit={submit}><fieldset disabled={busy}>
      {translated && <label className="bz-checkbox"><input type="checkbox" checked={Boolean(record.en)} onChange={event => setDraft({ ...record, en: event.target.checked ? Object.fromEntries(fields.map(([key]) => [key, ''])) : undefined } as unknown as ContentDocument)} />{tx(language, '提供英文版本（未启用时显示中文）', 'Provide an English version (otherwise show Chinese)')}</label>}
      {(!translated || Boolean(record.en)) && fields.map(([key, zh, en, multiline]) => {
        const name = entry.kind === 'site' && editLanguage === 'en' ? `${key}En` : key
        return <label key={name}>{tx(language, zh, en)}{multiline ? <textarea required rows={4} maxLength={4000} value={String(active[name] || '')} onChange={event => set(key, event.target.value)} /> : <input required maxLength={key === 'result' ? 500 : key === 'subtitle' ? 240 : 160} value={String(active[name] || '')} onChange={event => set(key, event.target.value)} />}</label>
      })}
      {entry.kind === 'course' && <><div className="bz-two-fields"><label>{tx(language, '排序编号', 'Sort order')}<input required maxLength={8} value={String(record.index)} onChange={event => setDraft({ ...draft, index: event.target.value } as Course)} /></label><label>{tx(language, '预计单元数', 'Planned units')}<input type="number" required min={0} max={5000} value={Number(record.lessons)} onChange={event => setDraft({ ...draft, lessons: Number(event.target.value) } as Course)} /></label></div><small>{tx(language, '章节发布后，前台自动显示实际小节数。', 'Published lessons determine the unit count shown on the site.')}</small><label>{tx(language, '封面图片地址', 'Cover image URL')}<input required maxLength={2000} value={String(record.imageUrl || '')} onChange={event => setDraft({ ...draft, imageUrl: event.target.value } as Course)} /></label><small>{tx(language, '可使用现有 /images/ 图片或 HTTPS 图片地址；封面上传尚未接入；小节插图可在“章节与小节”中上传。', 'Use an existing /images/ asset or an HTTPS image URL. Cover upload is not connected yet; upload lesson images under “Chapters & lessons”.')}</small></>}
      <details className="bz-draft-preview"><summary>{tx(language, '预览当前文字', 'Preview current copy')}</summary><h3>{String(active[entry.kind === 'site' ? editLanguage === 'en' ? 'heroTitleEn' : 'heroTitle' : entry.kind === 'course' ? 'title' : 'result'] || '')}</h3><p className="bz-preserve-lines">{String(active[entry.kind === 'site' ? editLanguage === 'en' ? 'heroDescriptionEn' : 'heroDescription' : entry.kind === 'course' ? 'description' : 'quote'] || '')}</p></details>
      {entry.kind === 'course' && /^(https:\/\/|\/images\/)/.test(String(record.imageUrl || '')) && <figure className="bz-cover-preview"><img src={String(record.imageUrl)} alt={tx(language, '课程封面预览', 'Course cover preview')} /><figcaption>{tx(language, '封面预览', 'Cover preview')}</figcaption></figure>}
      {Boolean(error) && <Notice error>{errorMessage(error, language)}</Notice>}{saved && <Notice>{saved === 'publish' ? tx(language, '已发布，公开网站已更新。', 'Published. The public site has been updated.') : tx(language, '草稿已保存，公开网站没有变化。', 'Draft saved. The public site is unchanged.')}</Notice>}
      <div className="bz-action-row bz-sticky-actions"><button className="bz-secondary" type="submit" value="draft"><Save />{tx(language, '保存草稿', 'Save draft')}</button><button className="bz-primary" type="submit" value="publish"><Eye />{busy ? tx(language, '保存中…', 'Saving…') : tx(language, '发布到网站', 'Publish to site')}</button></div>
    </fieldset></form>
  </Modal>
}
function ResourceEditor({ course, language, onClose }: { course: ContentEntry; language: Language; onClose: () => void }) {
  const [resource, setResource] = useState<CourseResource | null>(null)
  const [busy, setBusy] = useState(false)
  const [error, setError] = useState<unknown>(null)
  const [saved, setSaved] = useState(false)
  useEffect(() => { api<{ resource: CourseResource | null }>(`/admin/courses/${course.id}/resource`).then(data => setResource(data.resource || { url: '', extractionCode: '', note: '', version: 0 })).catch(setError) }, [course.id])
  const submit = async (event: React.FormEvent) => {
    event.preventDefault(); setBusy(true); setError(null); setSaved(false)
    try { const result = await api<{ resource: CourseResource }>(`/admin/courses/${course.id}/resource`, { method: 'PUT', data: resource }); setResource(result.resource); setSaved(true) }
    catch (error) { setError(error) } finally { setBusy(false) }
  }
  return <Modal title={tx(language, '课程交付资料', 'Course delivery resources')} language={language} onClose={() => { if (!busy) onClose() }}><p>{titleOf(course)}</p><Notice>{tx(language, '这里保存的链接和提取码不会出现在公开课程介绍中。更新后，已开通学员下次领取时会看到新版本。此操作立即生效，不属于内容草稿。', 'Links and codes are private. Enrolled learners receive the latest version on their next request. Resource updates take effect immediately and are separate from content drafts.')}</Notice>
    {Boolean(error) && <Notice error>{errorMessage(error, language)}</Notice>}{resource && <form className="bz-server-form" onSubmit={submit}><fieldset disabled={busy}><label>{tx(language, '百度网盘分享链接', 'Baidu Netdisk share URL')}<input type="url" required value={resource.url} onChange={event => { setSaved(false); setResource({ ...resource, url: event.target.value }) }} placeholder="https://pan.baidu.com/s/…" /></label><label>{tx(language, '提取码', 'Extraction code')}<input required maxLength={4} minLength={4} pattern="[a-zA-Z0-9]{4}" value={resource.extractionCode} onChange={event => { setSaved(false); setResource({ ...resource, extractionCode: event.target.value }) }} /></label><label>{tx(language, '资料说明', 'Resource note')}<textarea maxLength={2000} rows={4} value={resource.note} onChange={event => { setSaved(false); setResource({ ...resource, note: event.target.value }) }} /></label><button className="bz-primary" type="submit"><Save />{tx(language, '保存私有资料', 'Save private resources')}</button></fieldset>{saved && <Notice>{tx(language, '已保存资料版本：', 'Saved resource version: ')}{resource.version}</Notice>}</form>}
  </Modal>
}
export function AdminView({ language, session, onRefresh, onPublicChange, onLanguage, onExit }: { language: Language; session: SessionState; onRefresh: () => Promise<void>; onPublicChange: () => void; onLanguage: () => void; onExit: () => void }) {
  const [tab, setTab] = useState<AdminTab>('site')
  const [entries, setEntries] = useState<ContentEntry[]>([])
  const [editing, setEditing] = useState<ContentEntry | null>(null)
  const [resource, setResource] = useState<ContentEntry | null>(null)
  const [curriculum, setCurriculum] = useState<ContentEntry | null>(null)
  const [error, setError] = useState<unknown>(null)
  const [busy, setBusy] = useState(false)
  const load = async () => { setBusy(true); setError(null); try { setEntries((await api<{ items: ContentEntry[] }>('/admin/content')).items) } catch (error) { setError(error) } finally { setBusy(false) } }
  useEffect(() => { if (session.user?.role === 'admin') void load() }, [session.user?.id])
  const saved = (entry: ContentEntry) => { setEntries(current => [...current.filter(item => item.kind !== entry.kind || item.id !== entry.id), entry]); onPublicChange() }
  const unpublish = async (entry: ContentEntry) => {
    if (!window.confirm(tx(language, '下架后，公开网站将不再显示此内容。已开通课程权限不会被取消。确定下架吗？', 'Hide this content from the public site? Existing course access is not revoked.'))) return
    setBusy(true); setError(null)
    try { const result = await api<{ item: ContentEntry }>(`/admin/content/${entry.kind}/${entry.id}`, { method: 'PUT', data: { draft: entry.draft, revision: entry.revision, action: 'unpublish' } }); saved(result.item) }
    catch (error) { setError(error) } finally { setBusy(false) }
  }
  if (!session.user) return <main className="bz-inner bz-container"><button className="bz-secondary" onClick={onExit}><ArrowLeft />{tx(language, '返回网站', 'Back to site')}</button><LoginBox language={language} authMode={session.authMode} onLogin={onRefresh} /></main>
  if (session.user.role !== 'admin') return <main className="bz-inner bz-container"><Notice error>{tx(language, '此账号没有后台管理权限。', 'This account does not have administrator access.')}</Notice><button className="bz-secondary" onClick={onExit}>{tx(language, '返回网站', 'Back to site')}</button></main>
  const tabs = [
    { id: 'site', label: tx(language, '首页与讲师', 'Homepage & instructor'), icon: Home }, { id: 'course', label: tx(language, '课程管理', 'Programs'), icon: BookOpen },
    { id: 'case', label: tx(language, '案例墙', 'Case wall'), icon: ClipboardList }, { id: 'students', label: tx(language, '学员权限', 'Learner access'), icon: UsersRound },
    { id: 'keys', label: tx(language, '课程密钥', 'Course keys'), icon: KeyRound }, { id: 'orders', label: tx(language, '收款记录', 'Payment records'), icon: ClipboardList },
  ]
  const courses = entries.filter(entry => entry.kind === 'course')
  return <main className="bz-admin"><aside className="bz-admin-sidebar"><div className="bz-admin-brand"><strong>{tx(language, '知屿课程 · 内容后台', 'ZHIYU · CONTENT ADMIN')}</strong><span>CREATOR WORKSPACE</span></div><nav>{tabs.map(({ id, label, icon: Icon }) => <button key={id} className={tab === id ? 'active' : ''} onClick={() => setTab(id as AdminTab)}><Icon />{label}</button>)}</nav><button className="bz-exit-admin" onClick={onExit}><ArrowLeft />{tx(language, '返回网站', 'Back to site')}</button></aside>
    <section className="bz-admin-main"><header><div><span>{tx(language, '内容与交付管理', 'CONTENT & DELIVERY')}</span><h1>{tabs.find(item => item.id === tab)?.label}</h1></div><div className="bz-action-row"><button className="bz-secondary" onClick={onLanguage}>中 / EN</button><button className="bz-secondary" onClick={onExit}><Eye />{tx(language, '查看网站', 'View site')}</button></div></header><div className="bz-admin-mobile-nav">{tabs.map(({ id, label }) => <button key={id} className={tab === id ? 'active' : ''} onClick={() => setTab(id as AdminTab)}>{label}</button>)}</div>
    <div className="bz-admin-content">{Boolean(error) && <Notice error>{errorMessage(error, language)}</Notice>}
      {['site', 'course', 'case'].includes(tab) && <><div className="bz-action-row"><button className="bz-secondary" onClick={load} disabled={busy}><RefreshCw />{tx(language, '刷新列表', 'Refresh list')}</button>{(tab !== 'site' || !entries.some(item => item.kind === 'site')) && <button className="bz-primary" onClick={() => setEditing(newEntry(tab as ContentKind))}><Plus />{tx(language, '新建内容', 'New content')}</button>}</div><Notice>{tx(language, '修改先保存为草稿，确认后再发布。正文与影片请在“章节与小节”中编辑，不要写进公开介绍。', 'Save edits as drafts and publish when ready. Edit lesson text, images and videos under “Chapters & lessons”. Keep them out of public descriptions.')}</Notice><section className="bz-admin-card bz-padded-card"><div className="bz-record-list">{entries.filter(entry => entry.kind === tab).map(entry => <article key={entry.id}><div><strong>{titleOf(entry)}</strong><p>{entry.published ? JSON.stringify(entry.draft) === JSON.stringify(entry.published) ? tx(language, '已发布', 'Published') : tx(language, '已发布 · 有未发布修改', 'Published · draft changes') : tx(language, '草稿 / 已下架', 'Draft / hidden')} · v{entry.revision}</p><small>{new Date(entry.updatedAt * 1000).toLocaleString(language === 'zh' ? 'zh-CN' : 'en-US')}</small></div><div className="bz-action-row"><button className="bz-secondary" onClick={() => setEditing(entry)}>{tx(language, '编辑', 'Edit')}</button>{entry.kind === 'course' && <button className="bz-secondary" onClick={() => setCurriculum(entry)}><BookOpen />{tx(language, '章节与小节', 'Chapters & lessons')}</button>}{entry.kind === 'course' && <button className="bz-secondary" onClick={() => setResource(entry)}><FolderDown />{tx(language, '整课影片（旧版）', 'Video archive (legacy)')}</button>}{entry.kind !== 'site' && entry.published && <button className="bz-secondary" disabled={busy} onClick={() => unpublish(entry)}>{tx(language, '下架', 'Hide')}</button>}</div></article>)}</div>{busy && <p role="status">{tx(language, '正在读取…', 'Loading…')}</p>}</section></>}
      {tab === 'students' && <StudentsManager language={language} courses={courses} />}{tab === 'keys' && <KeysManager language={language} courses={courses} />}{tab === 'orders' && <OrdersManager language={language} courses={courses} />}
    </div></section>{editing && <ContentEditor key={`${editing.kind}:${editing.id}`} entry={editing} language={language} onSaved={saved} onClose={() => setEditing(null)} />}{curriculum && <CurriculumEditor key={curriculum.id} courseId={curriculum.id} courseTitle={titleOf(curriculum)} language={language} onPublicChange={onPublicChange} onClose={() => setCurriculum(null)} />}{resource && <ResourceEditor key={resource.id} course={resource} language={language} onClose={() => setResource(null)} />}
  </main>
}
