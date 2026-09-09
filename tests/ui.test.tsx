import { beforeEach, describe, expect, it, vi } from 'vitest'
import { render, screen, waitFor, within } from '@testing-library/react'
import userEvent from '@testing-library/user-event'
import { AccountView, LoginBox, RedeemForm } from '../src/Account'
import { AdminView } from '../src/Admin'
import App from '../src/AppBusiness'
import { api, ApiError } from '../src/api'
import { defaultContent, defaultStories, englishCourses } from '../src/catalog'
import { courses } from '../src/data'
import type { ContentEntry, SessionState } from '../shared/types'

vi.mock('../src/api', async importOriginal => ({ ...await importOriginal<typeof import('../src/api')>(), api: vi.fn() }))
const mockApi = vi.mocked(api)
const student: SessionState = { user: { id: 'test-student', displayName: 'Test Learner', role: 'student' }, courseIds: [], authMode: 'local' }
beforeEach(() => { mockApi.mockReset() })

describe('account workflows', () => {
  it('does not offer fake production login or a development code', () => {
    render(<LoginBox language="zh" authMode="unavailable" onLogin={vi.fn()} />)
    expect(screen.queryByRole('textbox')).toBeNull()
    expect(screen.getByText(/正式登录服务尚未接入/)).toBeTruthy()
  })
  it('gets a local challenge and verifies it before reporting login', async () => {
    const user = userEvent.setup()
    const onLogin = vi.fn(async () => {})
    mockApi.mockResolvedValueOnce({ challengeId: 'challenge', developmentCode: '123456' }).mockResolvedValueOnce({ ok: true })
    render(<LoginBox language="en" authMode="local" onLogin={onLogin} />)
    await user.type(screen.getByLabelText('Test account email'), 'learner@example.com')
    await user.click(screen.getByRole('button', { name: 'Get a test code' }))
    expect(await screen.findByText('123456')).toBeTruthy()
    expect(onLogin).not.toHaveBeenCalled()
    await user.type(screen.getByLabelText('Verification code'), '123456')
    await user.click(screen.getByRole('button', { name: 'Sign in', exact: true }))
    await waitFor(() => expect(onLogin).toHaveBeenCalledOnce())
    expect(mockApi).toHaveBeenLastCalledWith('/auth/code/verify', { data: { challengeId: 'challenge', code: '123456' } })
  })
  it('keeps entered key and displays server rejection without faking access', async () => {
    const user = userEvent.setup()
    const refreshed = vi.fn()
    mockApi.mockRejectedValue(new ApiError('REDEMPTION_INVALID', 400))
    render(<RedeemForm language="zh" onRedeemed={refreshed} />)
    await user.type(screen.getByLabelText('课程密钥'), 'ZHIYU-2026-DEMO')
    await user.click(screen.getByRole('button', { name: '兑换课程权限' }))
    expect(await screen.findByRole('alert')).toBeTruthy()
    expect((screen.getByLabelText('课程密钥') as HTMLInputElement).value).toBe('ZHIYU-2026-DEMO')
    expect(refreshed).not.toHaveBeenCalled()
  })
  it('ordinary learners cannot see the admin entry', async () => {
    mockApi.mockResolvedValue({ items: [] })
    render(<AccountView language="zh" session={student} onRefresh={vi.fn()} onAdmin={vi.fn()} />)
    await waitFor(() => expect(mockApi).toHaveBeenCalledWith('/me/courses'))
    expect(screen.queryByRole('button', { name: '内容管理后台' })).toBeNull()
    expect(screen.getByText(/还没有开通课程/)).toBeTruthy()
  })
  it('does not show a Netdisk link when resource access is denied', async () => {
    const user = userEvent.setup()
    mockApi.mockImplementation(async path => {
      if (path === '/me/courses') return { items: [{ ...courses[0], hasVideoArchive: true }] }
      throw new ApiError('COURSE_ACCESS_REQUIRED', 403)
    })
    render(<AccountView language="zh" session={{ ...student, courseIds: ['method'] }} onRefresh={vi.fn()} onAdmin={vi.fn()} />)
    await user.click(await screen.findByRole('button', { name: '整课影片（旧版）' }))
    expect(await screen.findByRole('alert')).toBeTruthy()
    expect(screen.queryByRole('link', { name: '打开百度网盘' })).toBeNull()
  })
})

describe('admin and public site', () => {
  it('blocks a learner navigating directly to the admin route', () => {
    render(<AdminView language="en" session={student} onRefresh={vi.fn()} onPublicChange={vi.fn()} onLanguage={vi.fn()} onExit={vi.fn()} />)
    expect(screen.getByRole('alert').textContent).toContain('does not have administrator access')
    expect(mockApi).not.toHaveBeenCalled()
  })
  it('saves a draft separately from publishing and advances the revision', async () => {
    const user = userEvent.setup()
    const entry: ContentEntry = { kind: 'site', id: 'home', draft: defaultContent, published: defaultContent, revision: 1, updatedAt: 1 }
    mockApi.mockImplementation(async (path, options) => {
      if (path === '/admin/content') return { items: [entry] }
      const data = options!.data as { draft: typeof defaultContent; action: string; revision: number }
      return { item: { ...entry, draft: data.draft, published: data.action === 'publish' ? data.draft : defaultContent, revision: data.revision + 1 } }
    })
    render(<AdminView language="zh" session={{ ...student, user: { ...student.user!, role: 'admin' } }} onRefresh={vi.fn()} onPublicChange={vi.fn()} onLanguage={vi.fn()} onExit={vi.fn()} />)
    await user.click(await screen.findByRole('button', { name: '编辑', exact: true }))
    const dialog = screen.getByRole('dialog')
    const headline = within(dialog).getByLabelText('首页标题')
    await user.clear(headline)
    await user.type(headline, '新的课程介绍')
    await user.click(within(dialog).getByRole('button', { name: '保存草稿' }))
    expect(await screen.findByText('草稿已保存，公开网站没有变化。')).toBeTruthy()
    const firstSave = mockApi.mock.calls.find(([path]) => path === '/admin/content/site/home')!
    expect(firstSave[1]!.data).toMatchObject({ action: 'draft', revision: 1, draft: { heroTitle: '新的课程介绍' } })
    await user.click(within(dialog).getByRole('button', { name: '发布到网站' }))
    expect(await screen.findByText('已发布，公开网站已更新。')).toBeTruthy()
    expect(mockApi.mock.lastCall![1]!.data).toMatchObject({ action: 'publish', revision: 2 })
  })
  it('ignores old localStorage entitlements and preserves language/theme switching', async () => {
    const user = userEvent.setup()
    localStorage.setItem('zhiyu-access', JSON.stringify(['method', 'practice', 'studio']))
    mockApi.mockImplementation(async path => {
      if (path === '/site') return { content: defaultContent }
      if (path === '/courses') return { items: courses.map(course => ({ ...course, en: englishCourses[course.id] })) }
      if (path === '/cases') return { items: defaultStories }
      if (path === '/me') return { user: null, courseIds: [], authMode: 'unavailable' }
      return { items: [] }
    })
    render(<App />)
    expect(await screen.findByRole('heading', { name: /好方法/ })).toBeTruthy()
    await user.click(screen.getByRole('button', { name: '切换为亮色模式' }))
    expect(document.documentElement.dataset.theme).toBe('light')
    await user.click(screen.getByRole('button', { name: '切换为英文' }))
    expect(await screen.findByRole('heading', { name: /Good methods deserve/ })).toBeTruthy()
    expect(document.documentElement.lang).toBe('en')
    await user.click(within(screen.getByRole('banner')).getByRole('button', { name: 'My account', exact: true }))
    expect(await screen.findByText(/Production sign-in is not connected/)).toBeTruthy()
    expect(screen.queryByText('Test Learner')).toBeNull()
    expect(screen.queryByRole('button', { name: 'Get resources' })).toBeNull()
  })
})
