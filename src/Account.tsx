import { useCallback, useEffect, useId, useRef, useState } from 'react'
import { ArrowRight, BookOpen, Copy, FolderDown, KeyRound, LogOut, MessageCircle, Settings, X } from 'lucide-react'
import type { Course, CourseResource, Language, SessionState } from '../shared/types'
import { api, ApiError, errorMessage } from './api'
import { tx } from './catalog'

export function Notice({ children, error = false }: { children: React.ReactNode; error?: boolean }) {
  return <div className={`bz-notice ${error ? 'is-error' : ''}`} role={error ? 'alert' : 'status'}>{children}</div>
}
export function Modal({ title, language, onClose, children, className = '' }: { title: string; language: Language; onClose: () => void; children: React.ReactNode; className?: string }) {
  const ref = useRef<HTMLDialogElement>(null)
  const titleId = useId()
  useEffect(() => { ref.current?.showModal(); return () => ref.current?.close() }, [])
  return <dialog ref={ref} className={`bz-dialog ${className}`} aria-labelledby={titleId} onCancel={event => { event.preventDefault(); onClose() }} onClick={event => { if (event.target === event.currentTarget) onClose() }}>
    <div className="bz-modal"><button className="bz-modal-close" onClick={onClose} aria-label={tx(language, '关闭', 'Close')}><X /></button><h2 id={titleId}>{title}</h2>{children}</div>
  </dialog>
}
type WechatQrChallenge = { challengeId: string; qrCodeUrl: string; expiresAt: number; run: number }
type WechatQrPoll = { status: 'waiting' | 'authenticated' | 'linked' | 'expired'; expiresAt?: number; retryAfter?: number }
function WechatEntry({ language, intent, onComplete }: { language: Language; intent: 'login' | 'bind'; onComplete: () => Promise<void> }) {
  const [phase, setPhase] = useState<'idle' | 'starting' | 'waiting' | 'expired' | 'completed' | 'error'>('idle')
  const [challenge, setChallenge] = useState<WechatQrChallenge | null>(null)
  const [error, setError] = useState<unknown>(null)
  const [retrying, setRetrying] = useState(false)
  const [refreshing, setRefreshing] = useState(false)
  const runRef = useRef(0)
  const controllerRef = useRef<AbortController | null>(null)
  const pollTimer = useRef<ReturnType<typeof setTimeout> | undefined>(undefined)
  const expiryTimer = useRef<ReturnType<typeof setTimeout> | undefined>(undefined)
  const completeRef = useRef(onComplete)
  useEffect(() => { completeRef.current = onComplete }, [onComplete])
  const stop = useCallback(() => {
    runRef.current += 1
    clearTimeout(pollTimer.current); clearTimeout(expiryTimer.current)
    controllerRef.current?.abort(); controllerRef.current = null
  }, [])
  useEffect(() => stop, [stop, intent])
  const refreshAccount = async () => {
    const run = runRef.current
    setRefreshing(true); setError(null)
    try { await completeRef.current() }
    catch (error) { if (run === runRef.current) setError(error) }
    finally { if (run === runRef.current) setRefreshing(false) }
  }
  const start = async () => {
    stop()
    const run = runRef.current
    const controller = new AbortController()
    controllerRef.current = controller
    const current = () => run === runRef.current && !controller.signal.aborted
    setPhase('starting'); setChallenge(null); setError(null); setRetrying(false)
    const expire = () => {
      if (!current()) return
      stop(); setPhase('expired'); setRetrying(false)
    }
    const setExpiry = (expiresAt: number) => {
      clearTimeout(expiryTimer.current)
      const remaining = expiresAt * 1000 - Date.now()
      if (remaining <= 0) { expire(); return false }
      expiryTimer.current = setTimeout(expire, remaining)
      return true
    }
    try {
      const next = await api<Omit<WechatQrChallenge, 'run'>>('/auth/wechat/qr/start', { data: { intent }, signal: controller.signal })
      if (!current()) return
      if (!setExpiry(next.expiresAt)) return
      setChallenge({ ...next, run }); setPhase('waiting')
      let failures = 0
      const poll = async () => {
        if (!current()) return
        try {
          const result = await api<WechatQrPoll>('/auth/wechat/qr/poll', { data: { challengeId: next.challengeId }, signal: controller.signal })
          if (!current()) return
          if (result.status === 'expired') { expire(); return }
          if (result.status === 'authenticated' || result.status === 'linked') {
            stop(); setPhase('completed'); setRetrying(false)
            await refreshAccount()
            return
          }
          if (result.status !== 'waiting') throw new ApiError('WECHAT_QR_INVALID')
          if (result.expiresAt !== undefined && !setExpiry(result.expiresAt)) return
          failures = 0; setRetrying(false)
          pollTimer.current = setTimeout(poll, Math.min(30, Math.max(2.5, result.retryAfter ?? 2.5)) * 1000)
        } catch (error) {
          if (!current()) return
          const transient = error instanceof ApiError && (error.code === 'NETWORK_ERROR' || [502, 503, 504].includes(error.status))
          if (transient && failures < 3) {
            failures += 1; setRetrying(true)
            pollTimer.current = setTimeout(poll, Math.min(15_000, 2_500 * 2 ** failures))
          } else { stop(); setPhase('error'); setError(error); setRetrying(false) }
        }
      }
      pollTimer.current = setTimeout(poll, 2_500)
    } catch (error) {
      if (!current()) return
      stop(); setPhase('error'); setError(error)
    }
  }
  const imageFailed = () => {
    if (!challenge || challenge.run !== runRef.current || phase !== 'waiting') return
    stop(); setPhase('error'); setError(new ApiError('WECHAT_QR_IMAGE_FAILED')); setRetrying(false)
  }
  return <div className="bz-wechat-entry">
    <p>{intent === 'login' ? tx(language, '用微信扫一扫；首次需关注公众号，完成后此网页会自动登录。已关注的用户直接扫码即可。', 'Scan with WeChat. Follow the Official Account on your first visit; this page will sign you in automatically. Existing followers can scan directly.') : tx(language, '用微信扫一扫，将微信绑定到当前课程账号，保留已有课程权限。首次需关注公众号，完成后此网页会自动更新。', 'Scan with WeChat to link it to this course account and keep your course access. Follow the Official Account if needed; this page will update automatically.')}</p>
    {phase === 'waiting' && challenge && <figure className="bz-wechat-qr">
      <img key={challenge.challengeId} src={challenge.qrCodeUrl} width="240" height="240" alt={tx(language, intent === 'login' ? '微信登录二维码' : '微信绑定二维码', intent === 'login' ? 'WeChat sign-in QR code' : 'WeChat linking QR code')} onError={imageFailed} referrerPolicy="no-referrer" />
      <figcaption role="status">{retrying ? tx(language, '连接暂时中断，正在重试…', 'Connection interrupted. Reconnecting…') : tx(language, '等待扫码…', 'Waiting for you to scan…')}</figcaption>
      <p>{tx(language, '手机上可尝试长按图片，选择识别二维码；若未出现此选项，请用另一台设备展示二维码后扫码。', 'On a phone, try long-pressing the image to recognize the QR code. If that option is unavailable, display this page on another device and scan it.')}</p>
    </figure>}
    {phase === 'expired' && <Notice>{tx(language, '二维码已过期，请刷新二维码后重新扫码。', 'This QR code has expired. Refresh it and scan again.')}</Notice>}
    {phase === 'completed' && <Notice>{intent === 'login' ? tx(language, '扫码成功，正在加载账号。', 'Scan confirmed. Loading your account.') : tx(language, '微信绑定成功，正在更新账号。', 'WeChat linked. Updating your account.')}</Notice>}
    {Boolean(error) && <Notice error>{errorMessage(error, language)}</Notice>}
    {phase === 'completed' ? Boolean(error) && <button className="bz-secondary" type="button" onClick={refreshAccount} disabled={refreshing}>{refreshing ? tx(language, '正在加载…', 'Loading…') : tx(language, '重新加载账号', 'Reload account')}</button> : <button className={phase === 'idle' || phase === 'starting' ? 'bz-primary' : 'bz-secondary'} type="button" onClick={start} disabled={phase === 'starting'}><MessageCircle />{phase === 'starting' ? tx(language, '正在生成二维码…', 'Creating QR code…') : phase === 'idle' ? intent === 'login' ? tx(language, '微信扫码登录', 'Sign in with WeChat QR') : tx(language, '微信扫码绑定', 'Link with WeChat QR') : tx(language, '刷新二维码', 'Refresh QR code')}</button>}
  </div>
}
export function LoginBox({ language, authMode, wechat, onLogin }: { language: Language; authMode: SessionState['authMode']; wechat?: SessionState['wechat']; onLogin: () => Promise<void> }) {
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
    {(authMode === 'wechat' || wechat) && <WechatEntry language={language} intent="login" onComplete={onLogin} />}
    {authMode === 'unavailable' ? <Notice>{tx(language, '正式登录服务尚未接入。微信公众号登录配置完成后即可使用，请联系老师了解开放时间。', 'Production sign-in is not connected. WeChat Official Account sign-in will be available after setup. Contact the instructor for availability.')}</Notice> : authMode === 'local' ? <>
      <Notice>{tx(language, '本机联调模式：邮箱仅用于区分测试账号，不会发送邮件或短信。测试管理员：admin@zhiyu.local；其他邮箱为普通学员。正式网站不会开放此入口。', 'Local testing only: email labels identify test accounts; no email or SMS is sent. Test admin: admin@zhiyu.local. Other addresses are learners. This adapter is disabled on the live site.')}</Notice>
      <form onSubmit={verify} className="bz-server-form"><fieldset disabled={busy}>
        <label>{tx(language, '测试账号邮箱', 'Test account email')}<input required type="email" autoComplete="username" maxLength={180} value={email} onChange={event => { setEmail(event.target.value); setChallenge(null); setCode('') }} placeholder="learner@example.com" /></label>
        {challenge && <><Notice>{tx(language, '本机验证码（5 分钟内有效）：', 'Local code (valid for 5 minutes): ')}<strong className="bz-code-text">{challenge.developmentCode}</strong></Notice><label>{tx(language, '验证码', 'Verification code')}<input required inputMode="numeric" pattern="[0-9]{6}" maxLength={6} autoComplete="one-time-code" value={code} onChange={event => setCode(event.target.value)} /></label></>}
        {Boolean(error) && <Notice error>{errorMessage(error, language)}</Notice>}
        <button className="bz-primary" type="submit">{busy ? tx(language, '处理中…', 'Please wait…') : challenge ? tx(language, '登录', 'Sign in') : tx(language, '获取测试验证码', 'Get a test code')}<ArrowRight /></button>
        {challenge && <button className="bz-secondary" type="button" disabled={cooldown > 0} onClick={request}>{cooldown > 0 ? `${cooldown}s` : tx(language, '重新获取', 'Request another code')}</button>}
      </fieldset></form>
    </> : null}
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
    {resource && <div className="bz-resource-delivery"><p>{tx(language, '这是原有的整课影片链接。小节图文请进入课程阅读，影片在百度网盘打开。', 'This is the existing course video archive. Read lesson text and images in the course; videos open in Baidu Netdisk.')}</p><label>{tx(language, '提取码', 'Extraction code')}<strong className="bz-code-text">{resource.extractionCode}</strong></label><button className="bz-secondary" onClick={copy}><Copy />{copied ? tx(language, '已复制', 'Copied') : tx(language, '复制提取码', 'Copy code')}</button><a className="bz-primary" href={resource.url} target="_blank" rel="noopener noreferrer" referrerPolicy="no-referrer"><FolderDown />{tx(language, '打开百度网盘', 'Open Baidu Netdisk')}</a>{resource.note && <p className="bz-preserve-lines">{resource.note}</p>}</div>}
  </Modal>
}
export function AccountView({ language, session, onRefresh, onAdmin, onCourse }: { language: Language; session: SessionState; onRefresh: () => Promise<void>; onAdmin: () => void; onCourse?: (courseId: string) => void }) {
  const [courses, setCourses] = useState<Course[]>([])
  const [resource, setResource] = useState<Course | null>(null)
  const [error, setError] = useState<unknown>(null)
  const [busy, setBusy] = useState(false)
  const load = async () => { const result = await api<{ items: Course[] }>('/me/courses'); setCourses(result.items) }
  useEffect(() => { if (session.user) load().catch(setError); else setCourses([]) }, [session.user?.id, session.courseIds.join(',')])
  const refresh = async () => { await onRefresh(); await load() }
  const logout = async () => { setBusy(true); setError(null); try { await api('/auth/logout', { data: {} }); setResource(null); await onRefresh() } catch (error) { setError(error) } finally { setBusy(false) } }
  if (!session.user) return <main className="bz-inner bz-container"><LoginBox language={language} authMode={session.authMode} wechat={session.wechat} onLogin={onRefresh} /></main>
  return <main className="bz-inner bz-container bz-live-account"><section className="bz-welcome"><div><span>MY LEARNING SPACE</span><h1>{tx(language, '欢迎回来，', 'Welcome back, ')}{session.user.displayName}</h1><p>{tx(language, `已开通 ${session.courseIds.length} 门课程。学习资料与账号权限都在这里。`, `${session.courseIds.length} programs unlocked. Manage your resources and account access here.`)}</p><small>{tx(language, '账号编号：', 'Account ID: ')}{session.user.id}</small></div></section>
    <div className="bz-action-row">{session.user.role === 'admin' && <button className="bz-secondary" onClick={onAdmin}><Settings />{tx(language, '内容管理后台', 'Content admin')}</button>}<button className="bz-secondary" onClick={logout} disabled={busy}><LogOut />{tx(language, '退出登录', 'Sign out')}</button></div>
    {Boolean(error) && <Notice error>{errorMessage(error, language)}</Notice>}
    <section className="bz-panel"><h2>{tx(language, '密钥兑换', 'Redeem a key')}</h2><RedeemForm language={language} onRedeemed={refresh} /></section>
    <section className="bz-panel"><h2>{tx(language, '我的课程与资料', 'My programs and resources')}</h2>{!session.courseIds.length && <p>{tx(language, '还没有开通课程。可联系老师开通，或在上方兑换课程密钥。', 'No programs unlocked yet. Contact the instructor or redeem a course key above.')}</p>}
      <div className="bz-owned-courses">{courses.map(course => <article className="bz-owned-course" key={course.id}><img src={course.imageUrl || '/images/course-structure.jpg'} alt="" /><div><span>{tx(language, '已开通', 'ACCESS ENABLED')}</span><h3>{language === 'en' && course.en ? course.en.title : course.title}</h3><p>{tx(language, '章节图文与选填影片', 'Lesson text, images and optional videos')}</p></div><div className="bz-owned-actions"><button className="bz-primary" onClick={() => onCourse ? onCourse(course.id) : (window.location.hash = `learn/${course.id}`)}><BookOpen />{tx(language, '进入课程', 'Read course')}</button>{course.hasVideoArchive && <button className="bz-secondary" onClick={() => setResource(course)}><FolderDown />{tx(language, '整课影片（旧版）', 'Video archive (legacy)')}</button>}</div></article>)}</div>
    </section>
    {session.wechat && <section className="bz-panel"><h2>{tx(language, '微信账号', 'WeChat account')}</h2><p className="bz-wechat-status"><MessageCircle />{session.wechat.linked ? tx(language, '已绑定微信', 'WeChat linked') : tx(language, '尚未绑定微信', 'WeChat not linked')}</p>{session.wechat.linked ? <p>{tx(language, '你可以使用已绑定的微信扫码登录，继续学习当前账号的课程。', 'Scan a sign-in QR code with your linked WeChat account to continue your courses.')}</p> : <WechatEntry language={language} intent="bind" onComplete={onRefresh} />}</section>}
    <section className="bz-panel"><h2>{tx(language, '账号说明', 'About your account')}</h2><p>{session.authMode === 'local' ? tx(language, '当前站点处于本机联调模式，测试邮箱不会接收验证码。', 'This site is in local testing mode. Test email addresses do not receive verification codes.') : session.authMode === 'wechat' ? tx(language, '本站通过微信公众号提供扫码登录。课程权限保存在课程账号中。', 'This site supports QR sign-in through the WeChat Official Account. Course access is saved to your course account.') : tx(language, '登录服务目前尚未配置，请联系老师获取账号协助。', 'Sign-in has not been configured. Contact the instructor for account assistance.')}{tx(language, ' 手机号登录与自助账号找回暂未开放。网盘内的播放进度无法同步到本站。', ' Phone sign-in and self-service account recovery are not available yet. Playback progress inside Netdisk cannot be synchronized with this site.')}</p></section>
    {resource && <ResourceDialog key={resource.id} course={resource} language={language} onClose={() => setResource(null)} />}
  </main>
}
