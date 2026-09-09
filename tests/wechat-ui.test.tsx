import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest'
import { act, cleanup, fireEvent, render, screen } from '@testing-library/react'
import { AccountView, LoginBox } from '../src/Account'
import { api, ApiError } from '../src/api'
import type { SessionState } from '../shared/types'

vi.mock('../src/api', async importOriginal => ({ ...await importOriginal<typeof import('../src/api')>(), api: vi.fn() }))
const mockApi = vi.mocked(api)
const learner: SessionState = { user: { id: 'wechat-student', displayName: 'Learner', role: 'student' }, courseIds: [], authMode: 'wechat', wechat: { linked: false } }
const qr = (id = 'challenge-1', lifetime = 120) => ({ challengeId: id, qrCodeUrl: `https://mp.weixin.qq.com/qr/${id}`, expiresAt: Date.now() / 1000 + lifetime })
const calls = (path: string) => mockApi.mock.calls.filter(([candidate]) => candidate === path)
const advance = (milliseconds: number) => act(async () => { await vi.advanceTimersByTimeAsync(milliseconds) })
const click = (name: string) => act(async () => { fireEvent.click(screen.getByRole('button', { name, exact: true })) })
const renderLogin = (onLogin = vi.fn(async () => {}), language: 'zh' | 'en' = 'zh') => render(<LoginBox language={language} authMode="wechat" onLogin={onLogin} />)
function deferred<T>() {
  let resolve!: (value: T) => void
  const promise = new Promise<T>(done => { resolve = done })
  return { promise, resolve }
}

beforeEach(() => {
  vi.useFakeTimers()
  vi.setSystemTime(new Date('2026-09-09T10:00:00Z'))
  mockApi.mockReset().mockImplementation(async path => {
    if (path === '/auth/wechat/qr/start') return qr()
    if (path === '/auth/wechat/qr/poll') return { status: 'waiting' }
    return { items: [] }
  })
})
afterEach(() => { cleanup(); vi.useRealTimers() })

describe('WeChat QR login and linking', () => {
  it.each(['Mozilla/5.0 Safari/605.1', 'Mozilla/5.0 MicroMessenger/8.0'])('requires a click to create a QR code in browser %s', async userAgent => {
    vi.spyOn(navigator, 'userAgent', 'get').mockReturnValue(userAgent)
    renderLogin()
    expect(mockApi).not.toHaveBeenCalled()
    expect(screen.queryByLabelText('测试账号邮箱')).toBeNull()
    await click('微信扫码登录')
    expect(mockApi).toHaveBeenCalledWith('/auth/wechat/qr/start', { data: { intent: 'login' }, signal: expect.any(AbortSignal) })
    expect(screen.getByRole('img', { name: '微信登录二维码' }).getAttribute('src')).toBe(qr().qrCodeUrl)
    expect(screen.getByText(/首次需关注公众号/)).toBeTruthy()
    expect(screen.getByText(/手机上可尝试长按图片/)).toBeTruthy()
    expect(screen.queryByText(/请在微信内打开本站/)).toBeNull()
  })

  it('polls every 2.5 seconds and refreshes the account only after confirmed authentication', async () => {
    const onLogin = vi.fn(async () => {})
    mockApi.mockResolvedValueOnce(qr()).mockResolvedValueOnce({ status: 'waiting' }).mockResolvedValueOnce({ status: 'authenticated' })
    renderLogin(onLogin)
    await click('微信扫码登录')
    await advance(2_499)
    expect(calls('/auth/wechat/qr/poll')).toHaveLength(0)
    await advance(1)
    expect(onLogin).not.toHaveBeenCalled()
    expect(calls('/auth/wechat/qr/poll')[0][1]).toEqual({ data: { challengeId: 'challenge-1' }, signal: expect.any(AbortSignal) })
    await advance(2_500)
    expect(onLogin).toHaveBeenCalledOnce()
    expect(screen.queryByRole('img')).toBeNull()
    await advance(30_000)
    expect(calls('/auth/wechat/qr/poll')).toHaveLength(2)
  })

  it('does not overlap poll requests when the server is slow', async () => {
    const pending = deferred<{ status: 'waiting' }>()
    mockApi.mockResolvedValueOnce(qr()).mockReturnValueOnce(pending.promise).mockResolvedValue({ status: 'waiting' })
    renderLogin()
    await click('微信扫码登录')
    await advance(20_000)
    expect(calls('/auth/wechat/qr/poll')).toHaveLength(1)
    await act(async () => { pending.resolve({ status: 'waiting' }) })
    await advance(2_500)
    expect(calls('/auth/wechat/qr/poll')).toHaveLength(2)
  })

  it('links the existing account and invokes its refresh callback', async () => {
    const onRefresh = vi.fn(async () => {})
    mockApi.mockImplementation(async path => path === '/auth/wechat/qr/start' ? qr() : path === '/auth/wechat/qr/poll' ? { status: 'linked' } : { items: [] })
    render(<AccountView language="en" session={learner} onRefresh={onRefresh} onAdmin={vi.fn()} />)
    await click('Link with WeChat QR')
    expect(calls('/auth/wechat/qr/start')[0][1]?.data).toEqual({ intent: 'bind' })
    await advance(2_500)
    expect(onRefresh).toHaveBeenCalledOnce()
    expect(screen.getByText(/WeChat linked. Updating your account/)).toBeTruthy()
  })

  it('shows server-confirmed linking and keeps the local test form when enabled', () => {
    const view = render(<LoginBox language="zh" authMode="local" wechat={{ linked: false }} onLogin={vi.fn()} />)
    expect(screen.getByLabelText('测试账号邮箱')).toBeTruthy()
    expect(screen.getByRole('button', { name: '微信扫码登录' })).toBeTruthy()
    view.unmount()
    render(<AccountView language="zh" session={{ ...learner, wechat: { linked: true } }} onRefresh={vi.fn()} onAdmin={vi.fn()} />)
    expect(screen.getByText('已绑定微信')).toBeTruthy()
    expect(screen.queryByRole('button', { name: '微信扫码绑定' })).toBeNull()
  })

  it('does not advertise QR login when WeChat is unavailable', () => {
    render(<LoginBox language="zh" authMode="local" onLogin={vi.fn()} />)
    expect(screen.getByLabelText('测试账号邮箱')).toBeTruthy()
    expect(screen.queryByRole('button', { name: '微信扫码登录' })).toBeNull()
    expect(mockApi).not.toHaveBeenCalled()
  })

  it('retries account loading after a completed scan without starting another challenge', async () => {
    const onLogin = vi.fn(async () => {}).mockRejectedValueOnce(new ApiError('NETWORK_ERROR'))
    mockApi.mockResolvedValueOnce(qr()).mockResolvedValueOnce({ status: 'authenticated' })
    renderLogin(onLogin)
    await click('微信扫码登录')
    await advance(2_500)
    expect(screen.getByRole('alert').textContent).toContain('连接中断')
    await click('重新加载账号')
    expect(onLogin).toHaveBeenCalledTimes(2)
    expect(calls('/auth/wechat/qr/start')).toHaveLength(1)
    expect(calls('/auth/wechat/qr/poll')).toHaveLength(1)
  })
})

describe('WeChat QR expiration and cancellation', () => {
  it('expires locally, aborts an outstanding poll, and ignores its late success', async () => {
    const pending = deferred<{ status: 'authenticated' }>()
    const onLogin = vi.fn(async () => {})
    mockApi.mockResolvedValueOnce(qr('short-lived', 3)).mockReturnValueOnce(pending.promise)
    renderLogin(onLogin)
    await click('微信扫码登录')
    await advance(3_000)
    expect(screen.getByText(/二维码已过期/)).toBeTruthy()
    expect(calls('/auth/wechat/qr/poll')[0][1]?.signal?.aborted).toBe(true)
    await act(async () => { pending.resolve({ status: 'authenticated' }) })
    await advance(30_000)
    expect(onLogin).not.toHaveBeenCalled()
    expect(calls('/auth/wechat/qr/poll')).toHaveLength(1)
  })

  it('stops on server expiry and only creates a replacement when requested', async () => {
    mockApi.mockResolvedValueOnce(qr()).mockResolvedValueOnce({ status: 'expired' }).mockResolvedValueOnce(qr('fresh'))
    renderLogin()
    await click('微信扫码登录')
    await advance(2_500)
    expect(screen.getByText(/二维码已过期/)).toBeTruthy()
    await advance(10_000)
    expect(calls('/auth/wechat/qr/start')).toHaveLength(1)
    await click('刷新二维码')
    expect(screen.getByRole('img').getAttribute('src')).toContain('/fresh')
  })

  it('aborts the previous QR attempt and ignores stale results after refreshing', async () => {
    const pending = deferred<{ status: 'authenticated' }>()
    const onLogin = vi.fn(async () => {})
    mockApi.mockResolvedValueOnce(qr()).mockReturnValueOnce(pending.promise).mockResolvedValueOnce(qr('replacement'))
    renderLogin(onLogin)
    await click('微信扫码登录')
    await advance(2_500)
    const oldSignal = calls('/auth/wechat/qr/poll')[0][1]?.signal
    await click('刷新二维码')
    expect(oldSignal?.aborted).toBe(true)
    await act(async () => { pending.resolve({ status: 'authenticated' }) })
    expect(onLogin).not.toHaveBeenCalled()
    expect(screen.getByRole('img').getAttribute('src')).toContain('/replacement')
  })

  it('aborts an unfinished start request when the account page unmounts', async () => {
    const pending = deferred<ReturnType<typeof qr>>()
    mockApi.mockReturnValueOnce(pending.promise)
    const view = renderLogin()
    await click('微信扫码登录')
    const signal = calls('/auth/wechat/qr/start')[0][1]?.signal
    view.unmount()
    expect(signal?.aborted).toBe(true)
    await act(async () => { pending.resolve(qr()) })
    await advance(30_000)
    expect(calls('/auth/wechat/qr/poll')).toHaveLength(0)
  })

  it('aborts polling and suppresses account updates after unmounting', async () => {
    const pending = deferred<{ status: 'authenticated' }>()
    const onLogin = vi.fn(async () => {})
    mockApi.mockResolvedValueOnce(qr()).mockReturnValueOnce(pending.promise)
    const view = renderLogin(onLogin)
    await click('微信扫码登录')
    await advance(2_500)
    const signal = calls('/auth/wechat/qr/poll')[0][1]?.signal
    view.unmount()
    expect(signal?.aborted).toBe(true)
    await act(async () => { pending.resolve({ status: 'authenticated' }) })
    expect(onLogin).not.toHaveBeenCalled()
    await advance(30_000)
    expect(calls('/auth/wechat/qr/poll')).toHaveLength(1)
  })
})

describe('WeChat QR failure recovery', () => {
  it('provides explicit recovery when the QR image cannot load', async () => {
    renderLogin()
    await click('微信扫码登录')
    fireEvent.error(screen.getByRole('img', { name: '微信登录二维码' }))
    expect(screen.getByRole('alert').textContent).toContain('二维码图片加载失败')
    await advance(10_000)
    expect(calls('/auth/wechat/qr/poll')).toHaveLength(0)
    await click('刷新二维码')
    expect(calls('/auth/wechat/qr/start')).toHaveLength(2)
    expect(screen.getByRole('img')).toBeTruthy()
  })

  it('backs off after a network failure and resumes polling', async () => {
    const onLogin = vi.fn(async () => {})
    mockApi.mockResolvedValueOnce(qr()).mockRejectedValueOnce(new ApiError('NETWORK_ERROR')).mockResolvedValueOnce({ status: 'authenticated' })
    renderLogin(onLogin)
    await click('微信扫码登录')
    await advance(2_500)
    expect(screen.getByText('连接暂时中断，正在重试…')).toBeTruthy()
    await advance(4_999)
    expect(calls('/auth/wechat/qr/poll')).toHaveLength(1)
    await advance(1)
    expect(onLogin).toHaveBeenCalledOnce()
  })

  it('stops after three automatic retries for persistent gateway failures', async () => {
    mockApi.mockResolvedValueOnce(qr()).mockRejectedValue(new ApiError('API_UNAVAILABLE', 502))
    renderLogin()
    await click('微信扫码登录')
    await advance(32_500)
    expect(calls('/auth/wechat/qr/poll')).toHaveLength(4)
    expect(screen.getByRole('alert')).toBeTruthy()
    expect(screen.getByRole('button', { name: '刷新二维码' })).toBeTruthy()
    await advance(30_000)
    expect(calls('/auth/wechat/qr/poll')).toHaveLength(4)
  })

  it.each([
    ['WECHAT_SESSION_CHANGED', 401, '登录状态发生变化'],
    ['WECHAT_IDENTITY_CONFLICT', 409, '此微信已绑定其他账号'],
    ['ACCOUNT_DISABLED', 403, '账号已停用'],
  ])('stops polling on terminal error %s', async (code, status, message) => {
    mockApi.mockResolvedValueOnce(qr()).mockRejectedValueOnce(new ApiError(String(code), Number(status)))
    renderLogin()
    await click('微信扫码登录')
    await advance(2_500)
    expect(screen.getByRole('alert').textContent).toContain(message)
    await advance(30_000)
    expect(calls('/auth/wechat/qr/poll')).toHaveLength(1)
  })

  it('allows explicit retry after the service rejects QR creation', async () => {
    mockApi.mockRejectedValueOnce(new ApiError('WECHAT_UNAVAILABLE', 503)).mockResolvedValueOnce(qr())
    renderLogin(vi.fn(async () => {}), 'en')
    await click('Sign in with WeChat QR')
    expect(screen.getByRole('alert').textContent).toContain('temporarily unavailable')
    expect(calls('/auth/wechat/qr/poll')).toHaveLength(0)
    await click('Refresh QR code')
    expect(screen.getByRole('img', { name: 'WeChat sign-in QR code' })).toBeTruthy()
  })
})
