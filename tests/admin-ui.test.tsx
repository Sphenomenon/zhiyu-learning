import { beforeEach, describe, expect, it, vi } from 'vitest'
import { act } from 'react'
import { render, screen, waitFor } from '@testing-library/react'
import userEvent from '@testing-library/user-event'
import { KeysManager, OrdersManager, StudentsManager } from '../src/AdminAccess'
import { api, ApiError } from '../src/api'
import { courses } from '../src/data'
import type { ContentEntry, Student } from '../shared/types'

vi.mock('../src/api', async importOriginal => ({ ...await importOriginal<typeof import('../src/api')>(), api: vi.fn() }))
const mockApi = vi.mocked(api)
const courseEntries: ContentEntry[] = courses.map(draft => ({ kind: 'course', id: draft.id, draft, published: draft, revision: 1, updatedAt: 1 }))
const alice: Student = { id: 'alice', displayName: 'Alice', identity: 'alice@example.test', role: 'student', courseIds: [] }
const bob: Student = { ...alice, id: 'bob', displayName: 'Bob', identity: 'bob@example.test' }
const page = (items: unknown[], page = 1, total = items.length) => ({ items, pagination: { page, pageSize: 20, total } })
beforeEach(() => { mockApi.mockReset(); vi.restoreAllMocks() })

describe('admin record workflows', () => {
  it('keeps the chosen learner through pagination and search, and submits only for that learner', async () => {
    const user = userEvent.setup()
    mockApi.mockImplementation(async (path) => {
      if (path === '/admin/entitlements') return { ok: true }
      const url = new URL(path, 'http://test')
      return url.searchParams.get('page') === '2' ? page([bob], 2, 21) : url.searchParams.has('q') ? page([bob]) : page([alice], 1, 21)
    })
    render(<StudentsManager language="zh" courses={courseEntries} />)
    await user.click(await screen.findByRole('button', { name: '选择学员', exact: true }))
    expect(screen.getByLabelText('课程')).toBe(document.activeElement)
    await user.click(screen.getByRole('button', { name: '下一页' }))
    expect(await screen.findByText('Bob')).toBeTruthy()
    expect(screen.getByText('Alice')).toBeTruthy()
    await user.type(screen.getByRole('searchbox'), 'bob')
    await user.click(screen.getByRole('button', { name: '搜索', exact: true }))
    await waitFor(() => expect(mockApi.mock.lastCall![0]).toContain('page=1&pageSize=20&q=bob'))
    await user.selectOptions(screen.getByLabelText('课程'), 'method')
    await user.type(screen.getByLabelText('操作原因'), '已核实线下开通')
    await user.click(screen.getByRole('button', { name: '保存权限调整' }))
    expect(await screen.findByText('权限已更新。修改表单可开始下一次调整。')).toBeTruthy()
    expect(mockApi.mock.calls.find(([path]) => path === '/admin/entitlements')![1]!.data).toMatchObject({ userId: 'alice', courseId: 'method', paymentConfirmed: false })
    expect((screen.getByRole('button', { name: '保存权限调整' }) as HTMLButtonElement).disabled).toBe(true)
  })
  it('keeps a payment retry id and prevents a second submission after success', async () => {
    const user = userEvent.setup()
    let attempts = 0
    mockApi.mockImplementation(async path => {
      if (path !== '/admin/entitlements') return page([alice])
      if (++attempts === 1) throw new ApiError('NETWORK_ERROR')
      return { ok: true, replayed: true }
    })
    render(<StudentsManager language="en" courses={courseEntries} />)
    await user.click(await screen.findByRole('button', { name: 'Select learner' }))
    await user.selectOptions(screen.getByLabelText('Program'), 'method')
    await user.type(screen.getByLabelText('Reason'), 'Offline receipt')
    await user.click(screen.getByLabelText('I confirm receipt of an offline payment'))
    await user.type(screen.getByLabelText('Amount received (CNY)'), '199')
    await user.click(screen.getByRole('button', { name: 'Save access change' }))
    expect(await screen.findByRole('alert')).toBeTruthy()
    await user.click(screen.getByRole('button', { name: 'Save access change' }))
    expect(await screen.findByText('Access updated. Edit the form to start another change.')).toBeTruthy()
    const calls = mockApi.mock.calls.filter(([path]) => path === '/admin/entitlements')
    expect(calls[0][1]!.data).toEqual(calls[1][1]!.data)
    expect(calls[1][1]!.data).toMatchObject({ amountCents: 19900, paymentConfirmed: true })
  })
  it('does not carry a pending payment over to another learner', async () => {
    const user = userEvent.setup()
    const confirm = vi.spyOn(window, 'confirm').mockReturnValue(false)
    mockApi.mockResolvedValue(page([alice, bob]))
    render(<StudentsManager language="en" courses={courseEntries} />)
    await user.click((await screen.findAllByRole('button', { name: 'Select learner' }))[0])
    await user.type(screen.getByLabelText('Reason'), 'Alice only')
    await user.click(screen.getByRole('button', { name: 'Select learner', exact: true }))
    expect(confirm).toHaveBeenCalledOnce()
    expect((screen.getByLabelText('Reason') as HTMLTextAreaElement).value).toBe('Alice only')
    confirm.mockReturnValue(true)
    await user.click(screen.getByRole('button', { name: 'Select learner', exact: true }))
    expect((screen.getByLabelText('Reason') as HTMLTextAreaElement).value).toBe('')
    expect(screen.getAllByText('Bob').length).toBe(2)
  })
  it('ignores an older response after a new search finishes', async () => {
    const user = userEvent.setup()
    let resolveOld!: (data: unknown) => void
    mockApi.mockImplementation(path => path.includes('q=bob') ? Promise.resolve(page([bob])) : new Promise(resolve => { resolveOld = resolve }))
    render(<StudentsManager language="en" courses={courseEntries} />)
    await user.type(screen.getByRole('searchbox'), 'bob')
    await user.click(screen.getByRole('button', { name: 'Search', exact: true }))
    expect(await screen.findByText('Bob')).toBeTruthy()
    await act(async () => resolveOld(page([alice])))
    expect(screen.queryByText('Alice')).toBeNull()
  })
  it('shows a retry action on load failure and only shows empty state after success', async () => {
    const user = userEvent.setup()
    mockApi.mockRejectedValueOnce(new ApiError('NETWORK_ERROR')).mockResolvedValue(page([]))
    render(<OrdersManager language="en" courses={courseEntries} />)
    expect(await screen.findByRole('alert')).toBeTruthy()
    expect(screen.queryByText('No payment records yet.')).toBeNull()
    await user.click(screen.getByRole('button', { name: 'Retry' }))
    expect(await screen.findByText('No payment records yet.')).toBeTruthy()
    expect(screen.queryByRole('alert')).toBeNull()
  })
  it('filters keys on the server and resets pagination when changing status', async () => {
    const user = userEvent.setup()
    mockApi.mockImplementation(async path => {
      const params = new URL(path, 'http://test').searchParams
      return page([], Number(params.get('page')), params.get('status') === 'expired' ? 0 : 21)
    })
    render(<KeysManager language="en" courses={courseEntries} />)
    await user.click(await screen.findByRole('button', { name: 'Next' }))
    expect(await screen.findByText('21 records · Page 2 of 2')).toBeTruthy()
    await user.selectOptions(screen.getByLabelText('Key status'), 'expired')
    expect(await screen.findByText('No matching records. Try different search criteria.')).toBeTruthy()
    expect(mockApi.mock.lastCall![0]).toBe('/admin/redemption-codes?page=1&pageSize=20&status=expired')
  })
  it('returns to the remaining last page when records disappear', async () => {
    const user = userEvent.setup()
    let requests = 0
    mockApi.mockImplementation(async path => {
      const current = Number(new URL(path, 'http://test').searchParams.get('page'))
      return page([], current, ++requests === 1 ? 21 : 20)
    })
    render(<OrdersManager language="en" courses={courseEntries} />)
    await user.click(await screen.findByRole('button', { name: 'Next' }))
    expect(await screen.findByText('20 records · Page 1 of 1')).toBeTruthy()
    expect(mockApi.mock.lastCall![0]).toContain('page=1')
  })
})
