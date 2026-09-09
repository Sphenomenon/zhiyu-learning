import { useEffect, useState } from 'react'
import { ArrowLeft, BookOpen, ClipboardList, Copy, Eye, FolderDown, Home, KeyRound, Plus, RefreshCw, Save, UsersRound } from 'lucide-react'
import type { ContentDocument, ContentEntry, ContentKind, Course, CourseResource, Language, RedemptionCode, SessionState, SiteContent, Story, Student } from '../shared/types'
import { api, errorMessage } from './api'
import { LoginBox, Modal, Notice } from './Account'
import { defaultContent, tx } from './catalog'

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
      {entry.kind === 'course' && <><div className="bz-two-fields"><label>{tx(language, '排序编号', 'Sort order')}<input required maxLength={8} value={String(record.index)} onChange={event => setDraft({ ...draft, index: event.target.value } as Course)} /></label><label>{tx(language, '学习单元数', 'Learning units')}<input type="number" required min={0} max={5000} value={Number(record.lessons)} onChange={event => setDraft({ ...draft, lessons: Number(event.target.value) } as Course)} /></label></div><label>{tx(language, '封面图片地址', 'Cover image URL')}<input required maxLength={2000} value={String(record.imageUrl || '')} onChange={event => setDraft({ ...draft, imageUrl: event.target.value } as Course)} /></label><small>{tx(language, '可使用现有 /images/ 图片或 HTTPS 图片地址；文件上传尚未接入。', 'Use an existing /images/ asset or an HTTPS image URL. File upload is not connected yet.')}</small></>}
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
function KeysManager({ language, courses }: { language: Language; courses: ContentEntry[] }) {
  const [items, setItems] = useState<RedemptionCode[]>([])
  const [selected, setSelected] = useState<string[]>([])
  const [expiresAt, setExpiresAt] = useState('')
  const [accessExpiresAt, setAccessExpiresAt] = useState('')
  const [createdCode, setCreatedCode] = useState('')
  const [copied, setCopied] = useState(false)
  const [busy, setBusy] = useState(false)
  const [error, setError] = useState<unknown>(null)
  const load = async () => setItems((await api<{ items: RedemptionCode[] }>('/admin/redemption-codes')).items)
  useEffect(() => { load().catch(setError) }, [])
  const create = async (event: React.FormEvent) => {
    event.preventDefault(); setBusy(true); setError(null)
    try { const result = await api<{ code: string }>('/admin/redemption-codes', { data: { courseIds: selected, expiresAt: expiresAt ? Math.floor(new Date(expiresAt).getTime() / 1000) : null, accessExpiresAt: accessExpiresAt ? Math.floor(new Date(accessExpiresAt).getTime() / 1000) : null } }); setCreatedCode(result.code); setCopied(false); await load() }
    catch (error) { setError(error) } finally { setBusy(false) }
  }
  const revoke = async (id: string) => { if (!window.confirm(tx(language, '停用后，此密钥不能再兑换。确定停用吗？', 'This key will no longer be redeemable. Disable it?'))) return; setBusy(true); setError(null); try { await api(`/admin/redemption-codes/${id}/revoke`, { data: {} }); await load() } catch (error) { setError(error) } finally { setBusy(false) } }
  return <><section className="bz-admin-card bz-padded-card"><h2>{tx(language, '生成课程密钥', 'Create a course key')}</h2><p>{tx(language, '每个密钥限一个账号使用。完整密钥仅生成时显示一次，请复制并妥善交付给学员。', 'Each key is for one account. The full key is shown only once; copy it and deliver it to the learner.')}</p><form className="bz-server-form" onSubmit={create}><fieldset disabled={busy || Boolean(createdCode)}><div className="bz-check-list">{courses.map(course => <label className="bz-checkbox" key={course.id}><input type="checkbox" checked={selected.includes(course.id)} onChange={event => setSelected(event.target.checked ? [...selected, course.id] : selected.filter(id => id !== course.id))} />{titleOf(course)}</label>)}</div><div className="bz-two-fields"><label>{tx(language, '兑换截止（可留空）', 'Redeem before (optional)')}<input type="datetime-local" value={expiresAt} onChange={event => setExpiresAt(event.target.value)} /></label><label>{tx(language, '课程访问截止（可留空）', 'Access until (optional)')}<input type="datetime-local" value={accessExpiresAt} onChange={event => setAccessExpiresAt(event.target.value)} /></label></div><button className="bz-primary" type="submit" disabled={!selected.length}><KeyRound />{tx(language, '生成一个密钥', 'Create one key')}</button></fieldset></form>
      {createdCode && <Notice><p>{tx(language, '完整密钥仅此次可见：', 'Full key — shown only this time:')}</p><code className="bz-code-text">{createdCode}</code><div className="bz-action-row"><button className="bz-secondary" onClick={async () => { try { await navigator.clipboard.writeText(createdCode); setCopied(true) } catch { setCopied(false) } }}><Copy />{copied ? tx(language, '已复制', 'Copied') : tx(language, '复制密钥', 'Copy key')}</button><button className="bz-secondary" onClick={() => { if (window.confirm(tx(language, '确认已保存密钥？关闭后无法再次查看。', 'Have you saved the key? It cannot be viewed again.'))) setCreatedCode('') }}>{tx(language, '已保存，关闭显示', 'Saved — hide key')}</button></div></Notice>}
    </section>{Boolean(error) && <Notice error>{errorMessage(error, language)}</Notice>}<section className="bz-admin-card bz-padded-card"><h2>{tx(language, '密钥记录（最近 200 条）', 'Keys (latest 200)')}</h2><div className="bz-record-list">{items.map(item => <article key={item.id}><div><strong className="bz-code-text">{item.hint}</strong><p>{item.courseIds.map(id => titleOf(courses.find(c => c.id === id) || { kind: 'course', draft: { title: id } } as ContentEntry)).join(' / ')}</p><small>{item.redeemedAt ? tx(language, '已兑换', 'Redeemed') : item.revokedAt ? tx(language, '已停用', 'Disabled') : item.expiresAt && item.expiresAt <= Date.now() / 1000 ? tx(language, '已过期', 'Expired') : tx(language, '待兑换', 'Available')}</small></div>{!item.redeemedAt && !item.revokedAt && <button className="bz-secondary" disabled={busy} onClick={() => revoke(item.id)}>{tx(language, '停用', 'Disable')}</button>}</article>)}</div>{!items.length && <p>{tx(language, '尚未生成密钥。', 'No keys created yet.')}</p>}</section></>
}
function StudentsManager({ language, courses }: { language: Language; courses: ContentEntry[] }) {
  const [students, setStudents] = useState<Student[]>([])
  const [userId, setUserId] = useState('')
  const [courseId, setCourseId] = useState('')
  const [action, setAction] = useState('grant')
  const [reason, setReason] = useState('')
  const [expiresAt, setExpiresAt] = useState('')
  const [paymentConfirmed, setPaymentConfirmed] = useState(false)
  const [amount, setAmount] = useState('')
  const [requestId, setRequestId] = useState(() => crypto.randomUUID())
  const [busy, setBusy] = useState(false)
  const [error, setError] = useState<unknown>(null)
  const [saved, setSaved] = useState(false)
  useEffect(() => { setRequestId(crypto.randomUUID()) }, [userId, courseId, action, reason, expiresAt, paymentConfirmed, amount])
  const load = async () => setStudents((await api<{ items: Student[] }>('/admin/students')).items)
  useEffect(() => { load().catch(setError) }, [])
  const submit = async (event: React.FormEvent) => {
    event.preventDefault()
    if (action === 'revoke' && !window.confirm(tx(language, '确定关闭该学员的这门课程权限？', 'Revoke this learner’s access to this program?'))) return
    setBusy(true); setError(null); setSaved(false)
    try { await api('/admin/entitlements', { data: { requestId, userId, courseId, action, reason, expiresAt: expiresAt ? Math.floor(new Date(expiresAt).getTime() / 1000) : null, paymentConfirmed: action === 'grant' && paymentConfirmed, amountCents: Math.round(Number(amount) * 100) } }); await load(); setSaved(true); setReason(''); setPaymentConfirmed(false); setAmount('') }
    catch (error) { setError(error) } finally { setBusy(false) }
  }
  return <><section className="bz-admin-card bz-padded-card"><h2>{tx(language, '调整学员权限', 'Manage learner access')}</h2><p>{tx(language, '只为已注册账号开通。每次操作都记录管理员、时间和原因。选择“确认已收款”才会创建人工收款记录，网站不会自动扣款。', 'Grant access to registered accounts. Every change records the administrator, time, and reason. A manual payment record is created only when you confirm receipt; the site does not charge anyone.')}</p><form className="bz-server-form" onSubmit={submit}><fieldset disabled={busy}>
    <label>{tx(language, '学员', 'Learner')}<select required value={userId} onChange={event => setUserId(event.target.value)}><option value="">{tx(language, '选择学员', 'Choose a learner')}</option>{students.map(student => <option key={student.id} value={student.id}>{student.identity} · {student.displayName}</option>)}</select></label>
    <div className="bz-two-fields"><label>{tx(language, '课程', 'Program')}<select required value={courseId} onChange={event => setCourseId(event.target.value)}><option value="">{tx(language, '选择课程', 'Choose a program')}</option>{courses.map(course => <option key={course.id} value={course.id}>{titleOf(course)}</option>)}</select></label><label>{tx(language, '操作', 'Action')}<select value={action} onChange={event => setAction(event.target.value)}><option value="grant">{tx(language, '开通 / 更新权限', 'Grant / update access')}</option><option value="revoke">{tx(language, '关闭权限', 'Revoke access')}</option></select></label></div><label>{tx(language, '操作原因', 'Reason')}<textarea required maxLength={500} rows={2} value={reason} onChange={event => setReason(event.target.value)} /></label>
    {action === 'grant' && <><label>{tx(language, '访问截止（留空为不限期）', 'Access until (empty = no expiry)')}<input type="datetime-local" value={expiresAt} onChange={event => setExpiresAt(event.target.value)} /></label><label className="bz-checkbox"><input type="checkbox" checked={paymentConfirmed} onChange={event => setPaymentConfirmed(event.target.checked)} />{tx(language, '我确认已在线下收到这笔款项', 'I confirm receipt of an offline payment')}</label>{paymentConfirmed && <label>{tx(language, '实际收款金额（人民币元）', 'Amount received (CNY)')}<input required type="number" min="0.01" step="0.01" max="1000000" value={amount} onChange={event => setAmount(event.target.value)} /></label>}</>}
    <button className="bz-primary" type="submit"><Save />{tx(language, '保存权限调整', 'Save access change')}</button></fieldset></form>{Boolean(error) && <Notice error>{errorMessage(error, language)}</Notice>}{saved && <Notice>{tx(language, '权限已更新。', 'Access updated.')}</Notice>}</section>
    <section className="bz-admin-card bz-padded-card"><h2>{tx(language, '学员账号（最近 200 个）', 'Learners (latest 200)')}</h2><div className="bz-record-list">{students.map(student => <article key={student.id}><div><strong>{student.displayName}</strong><p>{student.identity}</p><small>{student.role === 'admin' ? tx(language, '管理员', 'Administrator') : tx(language, '学员', 'Learner')} · {student.courseIds.length} {tx(language, '门已开通', 'programs enabled')}</small></div></article>)}</div></section></>
}
function OrdersManager({ language }: { language: Language }) {
  const [items, setItems] = useState<{ id: string; userId: string; courseId: string; amountCents: number; note: string; createdAt: number }[]>([])
  const [error, setError] = useState<unknown>(null)
  useEffect(() => { api<{ items: typeof items }>('/admin/orders').then(result => setItems(result.items)).catch(setError) }, [])
  return <section className="bz-admin-card bz-padded-card"><h2>{tx(language, '人工收款记录', 'Manual payment records')}</h2><p>{tx(language, '仅记录管理员确认的线下收款，不表示已接入支付平台或完成自动对账。', 'These are administrator-confirmed offline payments, not automatic payment processing or reconciliation.')}</p>{Boolean(error) && <Notice error>{errorMessage(error, language)}</Notice>}<div className="bz-record-list">{items.map(item => <article key={item.id}><div><strong>¥{(item.amountCents / 100).toFixed(2)}</strong><p>{item.note}</p><small>{item.courseId} · {new Date(item.createdAt * 1000).toLocaleString(language === 'zh' ? 'zh-CN' : 'en-US')}</small><small>{item.userId}</small></div></article>)}</div>{!items.length && <p>{tx(language, '暂无收款记录。', 'No payment records yet.')}</p>}</section>
}
export function AdminView({ language, session, onRefresh, onPublicChange, onLanguage, onExit }: { language: Language; session: SessionState; onRefresh: () => Promise<void>; onPublicChange: () => void; onLanguage: () => void; onExit: () => void }) {
  const [tab, setTab] = useState<AdminTab>('site')
  const [entries, setEntries] = useState<ContentEntry[]>([])
  const [editing, setEditing] = useState<ContentEntry | null>(null)
  const [resource, setResource] = useState<ContentEntry | null>(null)
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
      {['site', 'course', 'case'].includes(tab) && <><div className="bz-action-row"><button className="bz-secondary" onClick={load} disabled={busy}><RefreshCw />{tx(language, '刷新列表', 'Refresh list')}</button>{(tab !== 'site' || !entries.some(item => item.kind === 'site')) && <button className="bz-primary" onClick={() => setEditing(newEntry(tab as ContentKind))}><Plus />{tx(language, '新建内容', 'New content')}</button>}</div><Notice>{tx(language, '修改先保存为草稿，确认后再发布。网盘链接请在课程的“交付资料”中填写，不要写进公开介绍。', 'Save edits as drafts and publish when ready. Add Netdisk links under “Delivery resources”, never in public descriptions.')}</Notice><section className="bz-admin-card bz-padded-card"><div className="bz-record-list">{entries.filter(entry => entry.kind === tab).map(entry => <article key={entry.id}><div><strong>{titleOf(entry)}</strong><p>{entry.published ? JSON.stringify(entry.draft) === JSON.stringify(entry.published) ? tx(language, '已发布', 'Published') : tx(language, '已发布 · 有未发布修改', 'Published · draft changes') : tx(language, '草稿 / 已下架', 'Draft / hidden')} · v{entry.revision}</p><small>{new Date(entry.updatedAt * 1000).toLocaleString(language === 'zh' ? 'zh-CN' : 'en-US')}</small></div><div className="bz-action-row"><button className="bz-secondary" onClick={() => setEditing(entry)}>{tx(language, '编辑', 'Edit')}</button>{entry.kind === 'course' && <button className="bz-secondary" onClick={() => setResource(entry)}><FolderDown />{tx(language, '交付资料', 'Delivery resources')}</button>}{entry.kind !== 'site' && entry.published && <button className="bz-secondary" disabled={busy} onClick={() => unpublish(entry)}>{tx(language, '下架', 'Hide')}</button>}</div></article>)}</div>{busy && <p role="status">{tx(language, '正在读取…', 'Loading…')}</p>}</section></>}
      {tab === 'students' && <StudentsManager language={language} courses={courses} />}{tab === 'keys' && <KeysManager language={language} courses={courses} />}{tab === 'orders' && <OrdersManager language={language} />}
    </div></section>{editing && <ContentEditor key={`${editing.kind}:${editing.id}`} entry={editing} language={language} onSaved={saved} onClose={() => setEditing(null)} />}{resource && <ResourceEditor key={resource.id} course={resource} language={language} onClose={() => setResource(null)} />}
  </main>
}
