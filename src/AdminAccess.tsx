import { useEffect, useRef, useState } from 'react'
import { Copy, KeyRound, Save } from 'lucide-react'
import type { ContentEntry, Course, Language, ManualOrder, RedemptionCode, Student } from '../shared/types'
import { api, errorMessage } from './api'
import { Notice } from './Account'
import { tx } from './catalog'
import { RecordFeedback, RecordPagination, RecordSearch, useAdminRecords } from './AdminRecords'

type Props = { language: Language; courses: ContentEntry[] }
const title = (course: ContentEntry) => (course.draft as Course).title
const courseTitle = (courses: ContentEntry[], id: string) => {
  const course = courses.find(item => item.id === id)
  return course ? title(course) : id
}
const timestamp = (value: string) => value ? Math.floor(new Date(value).getTime() / 1000) : null
const date = (value: number, language: Language) => new Date(value * 1000).toLocaleString(language === 'zh' ? 'zh-CN' : 'en-US')

export function KeysManager({ language, courses }: Props) {
  const records = useAdminRecords<RedemptionCode>('/admin/redemption-codes')
  const [selected, setSelected] = useState<string[]>([])
  const [expiresAt, setExpiresAt] = useState('')
  const [accessExpiresAt, setAccessExpiresAt] = useState('')
  const [createdCode, setCreatedCode] = useState('')
  const [copied, setCopied] = useState(false)
  const [copyFailed, setCopyFailed] = useState(false)
  const [busy, setBusy] = useState(false)
  const [error, setError] = useState<unknown>(null)
  const create = async (event: React.FormEvent) => {
    event.preventDefault(); setBusy(true); setError(null)
    try {
      const result = await api<{ code: string }>('/admin/redemption-codes', { data: { courseIds: selected, expiresAt: timestamp(expiresAt), accessExpiresAt: timestamp(accessExpiresAt) } })
      setCreatedCode(result.code); setCopied(false); setCopyFailed(false); records.reload()
    } catch (error) { setError(error) } finally { setBusy(false) }
  }
  const revoke = async (id: string) => {
    if (!window.confirm(tx(language, '停用后，此密钥不能再兑换。确定停用吗？', 'This key will no longer be redeemable. Disable it?'))) return
    setBusy(true); setError(null)
    try { await api(`/admin/redemption-codes/${id}/revoke`, { data: {} }); records.reload() }
    catch (error) { setError(error) } finally { setBusy(false) }
  }
  const statuses: Record<RedemptionCode['status'], string> = {
    available: tx(language, '待兑换', 'Available'), redeemed: tx(language, '已兑换', 'Redeemed'),
    revoked: tx(language, '已停用', 'Disabled'), expired: tx(language, '已过期', 'Expired'),
  }
  return <>
    <section className="bz-admin-card bz-padded-card">
      <h2>{tx(language, '生成课程密钥', 'Create a course key')}</h2>
      <p>{tx(language, '每个密钥限一个账号使用。完整密钥仅生成时显示一次，请复制并妥善交付给学员。', 'Each key is for one account. The full key is shown only once; copy it and deliver it to the learner.')}</p>
      <form className="bz-server-form" onSubmit={create}><fieldset disabled={busy || Boolean(createdCode)}>
        <div className="bz-check-list">{courses.map(course => <label className="bz-checkbox" key={course.id}><input type="checkbox" checked={selected.includes(course.id)} onChange={event => setSelected(event.target.checked ? [...selected, course.id] : selected.filter(id => id !== course.id))} />{title(course)}</label>)}</div>
        <div className="bz-two-fields">
          <label>{tx(language, '兑换截止（可留空）', 'Redeem by (optional)')}<input type="datetime-local" value={expiresAt} onChange={event => setExpiresAt(event.target.value)} /></label>
          <label>{tx(language, '课程访问截止（可留空）', 'Access until (optional)')}<input type="datetime-local" value={accessExpiresAt} onChange={event => setAccessExpiresAt(event.target.value)} /></label>
        </div>
        <button className="bz-primary" type="submit" disabled={!selected.length}><KeyRound />{tx(language, '生成一个密钥', 'Create one key')}</button>
      </fieldset></form>
      {createdCode && <Notice><p>{tx(language, '完整密钥仅此次可见：', 'Full key — shown only this time:')}</p><code className="bz-code-text">{createdCode}</code>
        <div className="bz-action-row"><button className="bz-secondary" onClick={async () => { try { await navigator.clipboard.writeText(createdCode); setCopied(true); setCopyFailed(false) } catch { setCopied(false); setCopyFailed(true) } }}><Copy />{copied ? tx(language, '已复制', 'Copied') : tx(language, '复制密钥', 'Copy key')}</button>
          <button className="bz-secondary" onClick={() => { if (window.confirm(tx(language, '确认已保存密钥？关闭后无法再次查看。', 'Have you saved the key? It cannot be viewed again.'))) setCreatedCode('') }}>{tx(language, '已保存，关闭显示', 'Saved — hide key')}</button></div>
        {copyFailed && <p>{tx(language, '自动复制未成功，请长按或选中上方密钥复制。', 'Automatic copying failed. Select or long-press the key above to copy it.')}</p>}
      </Notice>}
      {Boolean(error) && <Notice error>{errorMessage(error, language)}</Notice>}
    </section>
    <section className="bz-admin-card bz-padded-card">
      <h2>{tx(language, '密钥记录', 'Course keys')}</h2>
      <RecordSearch records={records} language={language} label={tx(language, '搜索密钥尾号', 'Search key suffix')} filters={{ label: tx(language, '密钥状态', 'Key status'), options: [['all', tx(language, '全部状态', 'All statuses')], ...Object.entries(statuses)] }} />
      <RecordFeedback records={records} language={language} empty={tx(language, '尚未生成密钥。', 'No keys created yet.')} />
      <div className="bz-record-list" aria-busy={records.loading}>{records.items.map(item => <article key={item.id}>
        <div><strong className="bz-code-text">{item.hint}</strong><p>{item.courseIds.map(id => courseTitle(courses, id)).join(' / ')}</p>
          <span className={`bz-record-badge is-${item.status}`}>{statuses[item.status]}</span>
          <small>{tx(language, '创建：', 'Created: ')}{date(item.createdAt, language)}</small>
          {item.expiresAt && <small>{tx(language, '兑换截止：', 'Redeem by: ')}{date(item.expiresAt, language)}</small>}
          {item.accessExpiresAt && <small>{tx(language, '访问截止：', 'Access until: ')}{date(item.accessExpiresAt, language)}</small>}
        </div>
        {item.status === 'available' && <button className="bz-secondary" disabled={busy} onClick={() => revoke(item.id)}>{tx(language, '停用', 'Disable')}</button>}
      </article>)}</div>
      <RecordPagination records={records} language={language} />
    </section>
  </>
}

export function StudentsManager({ language, courses }: Props) {
  const records = useAdminRecords<Student>('/admin/students', 'role')
  const [selected, setSelected] = useState<Student | null>(null)
  const userId = selected?.id || ''
  const courseInput = useRef<HTMLSelectElement>(null)
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
  useEffect(() => { setRequestId(crypto.randomUUID()); setSaved(false) }, [userId, courseId, action, reason, expiresAt, paymentConfirmed, amount])
  const choose = (student: Student) => {
    if (student.id !== userId && (reason || paymentConfirmed || amount) && !window.confirm(tx(language, '切换学员会清空当前未提交的权限调整，确定继续吗？', 'Switch learners and discard the unsubmitted access change?'))) return
    if (student.id !== userId) {
      setSelected(student); setCourseId(''); setAction('grant'); setReason(''); setExpiresAt(''); setPaymentConfirmed(false); setAmount(''); setSaved(false); setError(null)
    }
    courseInput.current?.focus()
  }
  const submit = async (event: React.FormEvent) => {
    event.preventDefault()
    if (!selected) return
    if (action === 'revoke' && !window.confirm(tx(language, '确定关闭该学员的这门课程权限？', 'Revoke this learner’s access to this program?'))) return
    setBusy(true); setError(null); setSaved(false)
    try {
      await api('/admin/entitlements', { data: { requestId, userId, courseId, action, reason, expiresAt: timestamp(expiresAt), paymentConfirmed: action === 'grant' && paymentConfirmed, amountCents: Math.round(Number(amount) * 100) } })
      records.reload(); setSaved(true)
      // Keep the operation ID for safe retries. Choose another learner or change
      // the form to start a new operation; a double submit cannot log two payments.
    } catch (error) { setError(error) } finally { setBusy(false) }
  }
  return <>
    <section className="bz-admin-card bz-padded-card">
      <h2>{tx(language, '学员账号', 'Learner accounts')}</h2>
      <p>{tx(language, '先搜索并选择学员，再调整课程权限。翻页或更改搜索条件会保留已选学员。', 'Find and select a learner before changing access. Your selection stays when searching or changing pages.')}</p>
      <RecordSearch records={records} language={language} label={tx(language, '搜索姓名、账号或编号', 'Search name, account or ID')} filters={{ label: tx(language, '账号角色', 'Account role'), options: [['all', tx(language, '全部角色', 'All roles')], ['student', tx(language, '学员', 'Learners')], ['admin', tx(language, '管理员', 'Administrators')]] }} />
      <RecordFeedback records={records} language={language} empty={tx(language, '暂无注册账号。', 'No registered accounts yet.')} />
      <div className="bz-record-list" aria-busy={records.loading}>{records.items.map(student => <article key={student.id} className={userId === student.id ? 'is-selected' : ''}>
        <div><strong>{student.displayName}</strong><p>{student.identity}</p><small>{student.role === 'admin' ? tx(language, '管理员', 'Administrator') : tx(language, '学员', 'Learner')} · {student.courseIds.length} {tx(language, '门已开通', 'programs enabled')}</small></div>
        <button className="bz-secondary" disabled={busy} aria-pressed={userId === student.id} onClick={() => choose(student)}>{userId === student.id ? tx(language, '已选中', 'Selected') : tx(language, '选择学员', 'Select learner')}</button>
      </article>)}</div>
      <RecordPagination records={records} language={language} />
    </section>
    <section className="bz-admin-card bz-padded-card">
      <h2>{tx(language, '调整学员权限', 'Manage learner access')}</h2>
      <p>{tx(language, '每次操作都记录管理员、时间和原因。勾选“确认已收款”才会创建人工收款记录，网站不会自动扣款。', 'Every change records the administrator, time, and reason. A payment record is created only when you confirm receipt; the site does not charge anyone.')}</p>
      <div className="bz-selected-learner" aria-live="polite">{selected ? <><span>{tx(language, '当前学员', 'Selected learner')}</span><strong>{selected.displayName}</strong><span>{selected.identity}</span><small>{selected.id}</small></> : <p>{tx(language, '请先在上方列表选择学员。', 'Select a learner from the list above.')}</p>}</div>
      <form className="bz-server-form" onSubmit={submit}><fieldset disabled={busy}>
        <div className="bz-two-fields">
          <label>{tx(language, '课程', 'Program')}<select ref={courseInput} required value={courseId} onChange={event => setCourseId(event.target.value)}><option value="">{tx(language, '选择课程', 'Choose a program')}</option>{courses.map(course => <option key={course.id} value={course.id}>{title(course)}</option>)}</select></label>
          <label>{tx(language, '操作', 'Action')}<select value={action} onChange={event => setAction(event.target.value)}><option value="grant">{tx(language, '开通 / 更新权限', 'Grant / update access')}</option><option value="revoke">{tx(language, '关闭权限', 'Revoke access')}</option></select></label>
        </div>
        <label>{tx(language, '操作原因', 'Reason')}<textarea required maxLength={500} rows={2} value={reason} onChange={event => setReason(event.target.value)} /></label>
        {action === 'grant' && <>
          <label>{tx(language, '访问截止（留空为不限期）', 'Access until (empty = no expiry)')}<input type="datetime-local" value={expiresAt} onChange={event => setExpiresAt(event.target.value)} /></label>
          <label className="bz-checkbox"><input type="checkbox" checked={paymentConfirmed} onChange={event => setPaymentConfirmed(event.target.checked)} />{tx(language, '我确认已在线下收到这笔款项', 'I confirm receipt of an offline payment')}</label>
          {paymentConfirmed && <label>{tx(language, '实际收款金额（人民币元）', 'Amount received (CNY)')}<input required type="number" min="0.01" step="0.01" max="1000000" value={amount} onChange={event => setAmount(event.target.value)} /></label>}
        </>}
        <button className="bz-primary" type="submit" disabled={!selected || saved}><Save />{busy ? tx(language, '保存中…', 'Saving…') : tx(language, '保存权限调整', 'Save access change')}</button>
      </fieldset></form>
      {Boolean(error) && <Notice error>{errorMessage(error, language)}</Notice>}
      {saved && <Notice>{tx(language, '权限已更新。修改表单可开始下一次调整。', 'Access updated. Edit the form to start another change.')}</Notice>}
    </section>
  </>
}

export function OrdersManager({ language, courses }: Props) {
  const records = useAdminRecords<ManualOrder>('/admin/orders')
  return <section className="bz-admin-card bz-padded-card">
    <h2>{tx(language, '人工收款记录', 'Manual payment records')}</h2>
    <p>{tx(language, '仅记录管理员确认的线下收款，不表示已接入支付平台或完成自动对账。', 'These are administrator-confirmed offline payments, not automatic payment processing or reconciliation.')}</p>
    <RecordSearch records={records} language={language} label={tx(language, '搜索学员或收款备注', 'Search learner or payment note')} />
    <RecordFeedback records={records} language={language} empty={tx(language, '暂无收款记录。', 'No payment records yet.')} />
    <div className="bz-record-list" aria-busy={records.loading}>{records.items.map(item => <article key={item.id}>
      <div><strong>¥{(item.amountCents / 100).toFixed(2)} · {item.displayName}</strong><p>{item.note}</p><small>{courseTitle(courses, item.courseId)} · {date(item.createdAt, language)}</small><small>{item.userId}</small></div>
    </article>)}</div>
    <RecordPagination records={records} language={language} />
  </section>
}
