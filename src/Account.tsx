import { useEffect, useId, useRef, useState } from 'react'
import { ArrowRight, Copy, FolderDown, KeyRound, LogOut, Settings, X } from 'lucide-react'
import type { Course, CourseResource, Language, SessionState } from '../shared/types'
import { api, errorMessage } from './api'
import { tx } from './catalog'

export function Notice({ children, error = false }: { children: React.ReactNode; error?: boolean }) {
  return <div className={`bz-notice ${error ? 'is-error' : ''}`} role={error ? 'alert' : 'status'}>{children}</div>
}
export function Modal({ title, language, onClose, children }: { title: string; language: Language; onClose: () => void; children: React.ReactNode }) {
  const ref = useRef<HTMLDialogElement>(null)
  const titleId = useId()
  useEffect(() => { ref.current?.showModal(); return () => ref.current?.close() }, [])
  return <dialog ref={ref} className="bz-dialog" aria-labelledby={titleId} onCancel={event => { event.preventDefault(); onClose() }} onClick={event => { if (event.target === event.currentTarget) onClose() }}>
    <div className="bz-modal"><button className="bz-modal-close" onClick={onClose} aria-label={tx(language, '关闭', 'Close')}><X /></button><h2 id={titleId}>{title}</h2>{children}</div>
  </dialog>
}
export function LoginBox({ language, authMode, onLogin }: { language: Language; authMode: SessionState['authMode']; onLogin: () => Promise<void> }) {
  const [email, setEmail] = useState('')
  const [challenge, setChallenge] = useState<{ challengeId: string; developmentCode: string } | null>(null)
  const [code, setCode] = useState('')
  const [busy, setBusy] = useState(false)
  const [error, setError] = useState<unknown>(null)
  const [cooldown, setCooldown] = useState(0)
  useEffect(() => { if (cooldown <= 0) return; const timeout = setTimeout(() => setCooldown(cooldown - 1), 1000); return () => clearTimeout(timeout) }, [cooldown])
  const request = async () => {
    setBusy(true); setError(null)
    try { const next = await api<{ challengeId: string; developmentCode: string }>('/auth/code/request', { data: { email } }); setChallenge(next); setCode(''); setCooldown(30) }
    catch (error) { setError(error) } finally { setBusy(false) }
  }
  const verify = async (event: React.FormEvent) => {
    event.preventDefault()
    if (!challenge) { await request(); return }
    setBusy(true); setError(null)
    try { await api('/auth/code/verify', { data: { challengeId: challenge.challengeId, code } }); await onLogin() }
    catch (error) { setError(error) } finally { setBusy(false) }
  }
  return <section className="bz-panel bz-login-panel"><span className="bz-eyebrow">MY ACCOUNT</span><h1>{tx(language, '登录课程空间', 'Sign in to your courses')}</h1><p>{tx(language, '已开通的课程会随账号保存，换设备登录也能继续领取资料。', 'Course access is saved to your account and available when you sign in on another device.')}</p>
    {authMode !== 'local' ? <Notice>{tx(language, '正式登录服务尚未接入。当前不开放注册、付款或兑换；请等待上线通知。', 'Production sign-in is not connected. Registration, payments, and redemption are not open yet.')}</Notice> : <>
      <Notice>{tx(language, '本机联调模式：邮箱仅用于区分测试账号，不会发送邮件或短信。测试管理员：admin@zhiyu.local；其他邮箱为普通学员。正式网站不会开放此入口。', 'Local testing only: email labels identify test accounts; no email or SMS is sent. Test admin: admin@zhiyu.local. Other addresses are learners. This adapter is disabled on the live site.')}</Notice>
      <form onSubmit={verify} className="bz-server-form"><fieldset disabled={busy}>
        <label>{tx(language, '测试账号邮箱', 'Test account email')}<input required type="email" autoComplete="username" maxLength={180} value={email} onChange={event => { setEmail(event.target.value); setChallenge(null); setCode('') }} placeholder="learner@example.com" /></label>
        {challenge && <><Notice>{tx(language, '本机验证码（5 分钟内有效）：', 'Local code (valid for 5 minutes): ')}<strong className="bz-code-text">{challenge.developmentCode}</strong></Notice><label>{tx(language, '验证码', 'Verification code')}<input required inputMode="numeric" pattern="[0-9]{6}" maxLength={6} autoComplete="one-time-code" value={code} onChange={event => setCode(event.target.value)} /></label></>}
        {Boolean(error) && <Notice error>{errorMessage(error, language)}</Notice>}
        <button className="bz-primary" type="submit">{busy ? tx(language, '处理中…', 'Please wait…') : challenge ? tx(language, '登录', 'Sign in') : tx(language, '获取测试验证码', 'Get a test code')}<ArrowRight /></button>
        {challenge && <button className="bz-secondary" type="button" disabled={cooldown > 0} onClick={request}>{cooldown > 0 ? `${cooldown}s` : tx(language, '重新获取', 'Request another code')}</button>}
      </fieldset></form>
    </>}
  </section>
}
export function RedeemForm({ language, onRedeemed }: { language: Language; onRedeemed: () => Promise<void> }) {
  const [code, setCode] = useState('')
  const [busy, setBusy] = useState(false)
  const [error, setError] = useState<unknown>(null)
  const [done, setDone] = useState<'new' | 'existing' | null>(null)
  const submit = async (event: React.FormEvent) => {
    event.preventDefault(); setBusy(true); setError(null); setDone(null)
    try { const result = await api<{ alreadyRedeemed: boolean }>('/redemptions', { data: { code } }); await onRedeemed(); setCode(''); setDone(result.alreadyRedeemed ? 'existing' : 'new') }
    catch (error) { setError(error) } finally { setBusy(false) }
  }
  return <form className="bz-server-form" onSubmit={submit}><p>{tx(language, '使用老师发给你的课程密钥。每个密钥绑定一个账号，可开通密钥指定的课程。', 'Redeem a key from your instructor. A key belongs to one account and unlocks its assigned programs.')}</p><fieldset disabled={busy}><label>{tx(language, '课程密钥', 'Course key')}<input required value={code} maxLength={100} autoComplete="off" spellCheck={false} onChange={event => setCode(event.target.value)} placeholder="ZY-XXXXXXXX-XXXXXXXX-XXXXXXXX-XXXXXXXX" /></label><button className="bz-primary" type="submit"><KeyRound />{busy ? tx(language, '核验中…', 'Verifying…') : tx(language, '兑换课程权限', 'Redeem course access')}</button></fieldset>{Boolean(error) && <Notice error>{errorMessage(error, language)}</Notice>}{done && <Notice>{done === 'new' ? tx(language, '课程权限已开通，可在下方领取资料。', 'Access is enabled. Your resources are available below.') : tx(language, '此密钥已由你的账号兑换，未重复开通。课程权限以当前列表为准。', 'This account already redeemed this key. No duplicate access was granted; the list shows your current access.')}</Notice>}</form>
}
function ResourceDialog({ course, language, onClose }: { course: Course; language: Language; onClose: () => void }) {
  const [resource, setResource] = useState<CourseResource | null>(null)
  const [error, setError] = useState<unknown>(null)
  const [copied, setCopied] = useState(false)
  useEffect(() => {
    const controller = new AbortController()
    api<{ resource: CourseResource }>(`/courses/${course.id}/resources`, { signal: controller.signal }).then(data => setResource(data.resource)).catch(error => { if (error.name !== 'AbortError') setError(error) })
    return () => controller.abort()
  }, [course.id])
  const copy = async () => { try { await navigator.clipboard.writeText(resource!.extractionCode); setCopied(true) } catch { setCopied(false); setError(new Error('Clipboard unavailable')) } }
  return <Modal title={language === 'en' && course.en ? course.en.title : course.title} language={language} onClose={onClose}>
    {Boolean(error) && <Notice error>{errorMessage(error, language)}</Notice>}{!resource && !error && <p role="status">{tx(language, '正在核验课程权限…', 'Checking course access…')}</p>}
    {resource && <div className="bz-resource-delivery"><p>{tx(language, '视频和课件通过百度网盘交付，本站不播放付费视频。请勿转发课程资料。', 'Video and materials are delivered through Baidu Netdisk, not streamed here. Please do not redistribute them.')}</p><label>{tx(language, '提取码', 'Extraction code')}<strong className="bz-code-text">{resource.extractionCode}</strong></label><button className="bz-secondary" onClick={copy}><Copy />{copied ? tx(language, '已复制', 'Copied') : tx(language, '复制提取码', 'Copy code')}</button><a className="bz-primary" href={resource.url} target="_blank" rel="noopener noreferrer" referrerPolicy="no-referrer"><FolderDown />{tx(language, '打开百度网盘', 'Open Baidu Netdisk')}</a>{resource.note && <p className="bz-preserve-lines">{resource.note}</p>}</div>}
  </Modal>
}
export function AccountView({ language, session, onRefresh, onAdmin }: { language: Language; session: SessionState; onRefresh: () => Promise<void>; onAdmin: () => void }) {
  const [courses, setCourses] = useState<Course[]>([])
  const [resource, setResource] = useState<Course | null>(null)
  const [error, setError] = useState<unknown>(null)
  const [busy, setBusy] = useState(false)
  const load = async () => { const result = await api<{ items: Course[] }>('/me/courses'); setCourses(result.items) }
  useEffect(() => { if (session.user) load().catch(setError); else setCourses([]) }, [session.user?.id, session.courseIds.join(',')])
  const refresh = async () => { await onRefresh(); await load() }
  const logout = async () => { setBusy(true); setError(null); try { await api('/auth/logout', { data: {} }); setResource(null); await onRefresh() } catch (error) { setError(error) } finally { setBusy(false) } }
  if (!session.user) return <main className="bz-inner bz-container"><LoginBox language={language} authMode={session.authMode} onLogin={onRefresh} /></main>
  return <main className="bz-inner bz-container bz-live-account"><section className="bz-welcome"><div><span>MY LEARNING SPACE</span><h1>{tx(language, '欢迎回来，', 'Welcome back, ')}{session.user.displayName}</h1><p>{tx(language, `已开通 ${session.courseIds.length} 门课程。学习资料与账号权限都在这里。`, `${session.courseIds.length} programs unlocked. Manage your resources and account access here.`)}</p><small>{tx(language, '账号编号：', 'Account ID: ')}{session.user.id}</small></div></section>
    <div className="bz-action-row">{session.user.role === 'admin' && <button className="bz-secondary" onClick={onAdmin}><Settings />{tx(language, '内容管理后台', 'Content admin')}</button>}<button className="bz-secondary" onClick={logout} disabled={busy}><LogOut />{tx(language, '退出登录', 'Sign out')}</button></div>
    {Boolean(error) && <Notice error>{errorMessage(error, language)}</Notice>}
    <section className="bz-panel"><h2>{tx(language, '密钥兑换', 'Redeem a key')}</h2><RedeemForm language={language} onRedeemed={refresh} /></section>
    <section className="bz-panel"><h2>{tx(language, '我的课程与资料', 'My programs and resources')}</h2>{!session.courseIds.length && <p>{tx(language, '还没有开通课程。可联系老师开通，或在上方兑换课程密钥。', 'No programs unlocked yet. Contact the instructor or redeem a course key above.')}</p>}
      <div className="bz-owned-courses">{courses.map(course => <article className="bz-owned-course" key={course.id}><img src={course.imageUrl || '/images/course-structure.jpg'} alt="" /><div><span>{tx(language, '已开通', 'ACCESS ENABLED')}</span><h3>{language === 'en' && course.en ? course.en.title : course.title}</h3><p>{tx(language, '网盘资料与提取码', 'Netdisk files and extraction code')}</p></div><button className="bz-primary" onClick={() => setResource(course)}><FolderDown />{tx(language, '领取资料', 'Get resources')}</button></article>)}</div>
    </section><section className="bz-panel"><h2>{tx(language, '账号说明', 'About your account')}</h2><p>{tx(language, '当前使用本机测试身份。手机号、微信绑定及账号找回尚未开放，不会显示未经验证的“已绑定”状态。网盘内的播放进度无法同步到本站。', 'This is a local test identity. Phone/WeChat binding and account recovery are not available yet. Playback progress inside Netdisk cannot be synchronized with this site.')}</p></section>
    {resource && <ResourceDialog key={resource.id} course={resource} language={language} onClose={() => setResource(null)} />}
  </main>
}
