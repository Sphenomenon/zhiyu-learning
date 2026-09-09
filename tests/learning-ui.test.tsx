import { act } from 'react'
import { beforeEach, describe, expect, it, vi } from 'vitest'
import { render, screen, waitFor, within } from '@testing-library/react'
import userEvent from '@testing-library/user-event'
import { CurriculumEditor, parseVideoShare } from '../src/CurriculumEditor'
import { LearningView } from '../src/LearningView'
import { LessonBlocks, LessonVideoLink } from '../src/LessonContent'
import { api, ApiError } from '../src/api'
import type { Curriculum, CurriculumEntry, LearningContent, SessionState } from '../shared/types'

vi.mock('../src/api', async importOriginal => ({ ...await importOriginal<typeof import('../src/api')>(), api: vi.fn() }))
const mockApi = vi.mocked(api)
const curriculum: Curriculum = { chapters: [{ id: 'chapter', title: '第一章', titleEn: 'Chapter one', lessons: [
  { id: 'text', title: '先读图文', titleEn: 'Read first', blocks: [{ id: 'paragraph', type: 'paragraph', text: '付费正文<script>alert(1)</script>', textEn: 'Read this private text.' }, { id: 'image', type: 'image', url: '/images/course-structure.jpg', caption: '练习示意图' }], video: null },
  { id: 'video', title: '再看影片', titleEn: 'Watch next', blocks: [], video: { url: 'https://pan.baidu.com/s/TESTONLY?pwd=Ab12', extractionCode: 'Ab12', note: '练习示范' } },
] }] }
const initial: CurriculumEntry = { courseId: 'method', draft: curriculum, published: curriculum, revision: 1, updatedAt: 1 }
const content: LearningContent = { course: { id: 'method', title: '测试课程', en: { title: 'Test course' } }, curriculum }
const session: SessionState = { user: { id: 'learner', displayName: 'Learner', role: 'student' }, courseIds: ['method'], authMode: 'local' }
beforeEach(() => { mockApi.mockReset() })
function editMock() {
  mockApi.mockImplementation(async (_path, options) => {
    if (!options?.data) return { item: initial }
    const input = options.data as { draft: Curriculum; action: string; revision: number }
    return { item: { ...initial, draft: input.draft, revision: input.revision + 1, published: input.action === 'publish' ? input.draft : curriculum } }
  })
}
const editor = (onClose = vi.fn()) => render(<CurriculumEditor courseId="method" courseTitle="测试课程" language="zh" onClose={onClose} />)
const readerProps = { session, language: 'zh' as const, onAccount: vi.fn(), onAccess: vi.fn(), onBack: vi.fn() }

describe('lesson authoring', () => {
  it('starts an empty course, creates chapters and lessons, and saves before publishing', async () => {
    const user = userEvent.setup()
    mockApi.mockImplementation(async (_path, options) => {
      if (!options?.data) return { item: { ...initial, draft: { chapters: [] }, published: null, revision: 0 } }
      const input = options.data as { draft: Curriculum; action: string; revision: number }
      return { item: { ...initial, draft: input.draft, published: input.action === 'publish' ? input.draft : null, revision: input.revision + 1 } }
    })
    const onPublicChange = vi.fn()
    render(<CurriculumEditor courseId="method" courseTitle="测试课程" language="zh" onClose={vi.fn()} onPublicChange={onPublicChange} />)
    await user.click(await screen.findByRole('button', { name: '新增章' }))
    await user.type(screen.getByLabelText('章节名称'), '第一章')
    await user.click(screen.getByRole('button', { name: '新增小节' }))
    await user.type(screen.getByLabelText('小节名称'), '从听感开始')
    await user.click(screen.getByRole('button', { name: '添加段落' }))
    await user.type(screen.getByLabelText('段落文字'), '先慢速练习，再逐步提高速度。')
    await user.click(screen.getByRole('button', { name: '保存章节草稿' }))
    expect(await screen.findByText('章节草稿已保存，学员内容未改变。')).toBeTruthy()
    expect(onPublicChange).not.toHaveBeenCalled()
    let last = mockApi.mock.lastCall![1]!.data as { revision: number; draft: Curriculum }
    expect(last.revision).toBe(0)
    expect(last.draft.chapters[0].lessons[0].video).toBeNull()
    await user.click(screen.getByRole('button', { name: '发布章节' }))
    expect(await screen.findByText('章节已发布，学员可以阅读。')).toBeTruthy()
    expect(mockApi.mock.lastCall![1]!.data).toMatchObject({ action: 'publish', revision: 1 })
    expect(onPublicChange).toHaveBeenCalledOnce()
  })
  it('reorders blocks and lessons, and removes the optional video', async () => {
    const user = userEvent.setup()
    editMock(); editor()
    await user.click(await screen.findByRole('button', { name: '上移 图文块 2' }))
    await user.click(screen.getByRole('button', { name: '下移 先读图文' }))
    await user.click(screen.getByRole('button', { name: /1.1再看影片/ }))
    await user.click(screen.getByRole('button', { name: '移除本节影片' }))
    await user.click(screen.getByRole('button', { name: '保存章节草稿' }))
    await screen.findByText('章节草稿已保存，学员内容未改变。')
    const draft = (mockApi.mock.lastCall![1]!.data as { draft: Curriculum }).draft
    expect(draft.chapters[0].lessons.map(item => item.id)).toEqual(['video', 'text'])
    expect(draft.chapters[0].lessons[0].video).toBeNull()
    expect(draft.chapters[0].lessons[1].blocks.map(item => item.id)).toEqual(['image', 'paragraph'])
  })
  it('uploads an image to the selected block and keeps it in the chapter draft', async () => {
    const user = userEvent.setup()
    const uploaded = '/api/courses/method/images/00000000-0000-4000-8000-000000000000'
    mockApi.mockImplementation(async (path, options) => path.endsWith('/images') ? { url: uploaded } : options?.data ? { item: { ...initial, draft: (options.data as { draft: Curriculum }).draft, revision: 2 } } : { item: initial })
    editor()
    const file = new File(['fixture'], 'lesson.png', { type: 'image/png' })
    await user.upload(await screen.findByLabelText('从设备上传图片'), file)
    await waitFor(() => expect((screen.getByLabelText('图片地址') as HTMLInputElement).value).toBe(uploaded))
    expect(mockApi.mock.calls.find(([path]) => path.endsWith('/images'))![1]).toEqual({ file })
    await user.click(screen.getByRole('button', { name: '保存章节草稿' }))
    await screen.findByText('章节草稿已保存，学员内容未改变。')
    expect((mockApi.mock.lastCall![1]!.data as { draft: Curriculum }).draft.chapters[0].lessons[0].blocks[1]).toMatchObject({ url: uploaded })
  })
  it('keeps edits on revision conflict and asks before discarding them', async () => {
    const user = userEvent.setup()
    const onClose = vi.fn()
    vi.spyOn(window, 'confirm').mockReturnValue(false)
    mockApi.mockImplementation(async (_path, options) => { if (options?.data) throw new ApiError('REVISION_CONFLICT'); return { item: initial } })
    editor(onClose)
    await user.type(await screen.findByLabelText('小节名称'), ' 修改')
    await user.click(screen.getByRole('button', { name: '保存章节草稿' }))
    expect(await screen.findByRole('alert')).toBeTruthy()
    expect((screen.getByLabelText('小节名称') as HTMLInputElement).value).toContain('修改')
    await user.click(screen.getByRole('button', { name: '关闭', exact: true }))
    expect(window.confirm).toHaveBeenCalled()
    expect(onClose).not.toHaveBeenCalled()
  })
  it('recognizes Baidu share text and optional access codes', () => {
    expect(parseVideoShare('链接：https://pan.baidu.com/s/EXAMPLE 提取码：Pt7Z')).toEqual({ url: 'https://pan.baidu.com/s/EXAMPLE', extractionCode: 'Pt7Z' })
    expect(parseVideoShare('https://pan.baidu.com/s/EXAMPLE?pwd=Ab12').extractionCode).toBe('Ab12')
    expect(parseVideoShare('')).toEqual({ url: '', extractionCode: '' })
  })
})

describe('course reading', () => {
  it('renders paid text and images safely and omits video controls for a text-only lesson', async () => {
    mockApi.mockResolvedValue(content)
    const { container } = render(<LearningView {...readerProps} route={{ courseId: 'method' }} />)
    expect(await screen.findByText('付费正文<script>alert(1)</script>')).toBeTruthy()
    expect(container.querySelector('script')).toBeNull()
    expect(screen.getByAltText('练习示意图')).toBeTruthy()
    expect(screen.queryByRole('region', { name: '本节影片' })).toBeNull()
    expect(screen.getByRole('link', { name: '下一小节' }).getAttribute('href')).toBe('#learn/method/video')
  })
  it('opens a lesson deep link with video and can return to a text-only lesson', async () => {
    mockApi.mockResolvedValue(content)
    const { rerender } = render(<LearningView {...readerProps} route={{ courseId: 'method', lessonId: 'video' }} />)
    const link = await screen.findByRole('link', { name: '前往百度网盘看影片' })
    expect(link.getAttribute('href')).toBe('https://pan.baidu.com/s/TESTONLY?pwd=Ab12')
    expect(link.getAttribute('rel')).toBe('noopener noreferrer')
    expect(screen.getByText('Ab12')).toBeTruthy()
    rerender(<LearningView {...readerProps} route={{ courseId: 'method', lessonId: 'text' }} />)
    expect(await screen.findByText('付费正文<script>alert(1)</script>')).toBeTruthy()
    expect(screen.queryByRole('link', { name: '前往百度网盘看影片' })).toBeNull()
  })
  it('shows only the public outline to a guest and offers sign-in', async () => {
    const user = userEvent.setup()
    const onAccount = vi.fn()
    mockApi.mockResolvedValue({ course: content.course, chapters: [{ id: 'chapter', title: '第一章', lessons: [{ id: 'text', title: '先读图文', hasVideo: false }] }] })
    render(<LearningView {...readerProps} onAccount={onAccount} session={{ user: null, courseIds: [], authMode: 'local' }} route={{ courseId: 'method' }} />)
    await user.click(await screen.findByRole('button', { name: '登录后继续' }))
    expect(onAccount).toHaveBeenCalledOnce()
    expect(mockApi.mock.calls[0][0]).toBe('/courses/method/outline')
    expect(screen.queryByText(/付费正文/)).toBeNull()
  })
  it('hides previously loaded text when refocusing after access is revoked', async () => {
    mockApi.mockResolvedValueOnce(content).mockRejectedValueOnce(new ApiError('COURSE_ACCESS_REQUIRED'))
    render(<LearningView {...readerProps} route={{ courseId: 'method' }} />)
    await screen.findByText('付费正文<script>alert(1)</script>')
    await act(async () => window.dispatchEvent(new Event('focus')))
    expect(await screen.findByRole('alert')).toBeTruthy()
    expect(screen.queryByText(/付费正文/)).toBeNull()
  })
  it('uses English text with Chinese fallback for untranslated image captions', () => {
    render(<LessonBlocks blocks={curriculum.chapters[0].lessons[0].blocks} language="en" />)
    expect(screen.getByText('Read this private text.')).toBeTruthy()
    expect(screen.getByAltText('练习示意图')).toBeTruthy()
  })
  it('copying a video code inside the editor preview does not submit the form', async () => {
    const user = userEvent.setup()
    const onSubmit = vi.fn(event => event.preventDefault())
    render(<form onSubmit={onSubmit}><LessonVideoLink lesson={curriculum.chapters[0].lessons[1]} language="en" /></form>)
    await user.click(screen.getByRole('button', { name: 'Copy code' }))
    expect(onSubmit).not.toHaveBeenCalled()
    expect(await screen.findByRole('button', { name: 'Copied' })).toBeTruthy()
  })
})
