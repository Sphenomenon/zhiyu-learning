import type { Language } from '../shared/types'

export class ApiError extends Error {
  code: string
  status: number
  constructor(code: string, status = 0) { super(code); this.code = code; this.status = status }
}
export async function api<T>(path: string, options: { method?: string; data?: unknown; file?: File; signal?: AbortSignal } = {}): Promise<T> {
  let response: Response
  try {
    response = await fetch(`/api${path}`, {
      method: options.method || (options.data === undefined && !options.file ? 'GET' : 'POST'),
      credentials: 'same-origin', cache: 'no-store', signal: options.signal,
      headers: options.file ? { 'Content-Type': options.file.type || 'application/octet-stream' } : options.data === undefined ? undefined : { 'Content-Type': 'application/json' },
      body: options.file || (options.data === undefined ? undefined : JSON.stringify(options.data)),
    })
  } catch (error) {
    if (error instanceof Error && error.name === 'AbortError') throw error
    throw new ApiError('NETWORK_ERROR')
  }
  let data
  try { data = await response.json() } catch { throw new ApiError('API_UNAVAILABLE', response.status) }
  if (!response.ok) throw new ApiError(data.error?.code || 'INTERNAL_ERROR', response.status)
  return data as T
}
const messages: Record<string, [string, string]> = {
  CURRICULUM_LIMIT: ['课程最多包含 50 章、500 小节，每小节最多 100 个图文块。', 'A course supports up to 50 chapters, 500 lessons, and 100 blocks per lesson.'],
  DUPLICATE_LESSON_ID: ['章节、小节或图文块的编号重复，请刷新后重试。', 'Chapter, lesson or block IDs are duplicated. Refresh and try again.'],
  LESSON_EMPTY: ['发布前请为每一章添加小节，并为每个小节填写图文或影片链接。', 'Add lessons to every chapter and text, images or a video link to every lesson before publishing.'],
  INVALID_IMAGE_FILE: ['请选择 JPG、PNG 或 WebP 图片。', 'Choose a JPG, PNG or WebP image.'],
  IMAGE_STORAGE_UNAVAILABLE: ['图片存储尚未连接，请联系网站维护者。', 'Image storage is not connected. Please contact the site maintainer.'],
  BODY_TOO_LARGE: ['内容超过大小限制：课程内容最多 1 MB，单张图片最多 5 MB。', 'Size limit exceeded: course content can be up to 1 MB; each image up to 5 MB.'],
  NETWORK_ERROR: ['连接中断，请检查网络后重试。', 'Connection interrupted. Check your network and try again.'],
  API_UNAVAILABLE: ['后端尚未连接。本地开发请运行 pnpm dev。', 'The backend is unavailable. For local development, run pnpm dev.'],
  INTERNAL_ERROR: ['服务暂时不可用，请稍后重试。你的输入仍然保留。', 'The service is temporarily unavailable. Your input has been kept.'],
  LOGIN_REQUIRED: ['请先登录；如果已登录，可能是会话已过期。', 'Please sign in. Your previous session may have expired.'],
  ADMIN_REQUIRED: ['当前账号没有内容管理权限。', 'This account does not have administrator access.'],
  AUTH_NOT_CONFIGURED: ['正式登录服务尚未配置，目前不能注册或登录。', 'Production sign-in has not been configured yet.'],
  INVALID_EMAIL: ['请填写完整的测试邮箱格式，例如 learner@example.com。', 'Enter a test email label, such as learner@example.com.'],
  INVALID_CODE: ['验证码无效、已使用或已过期，请重新获取。', 'The code is invalid, used, or expired. Request a new code.'],
  RATE_LIMITED: ['操作过于频繁，请稍后再试。', 'Too many attempts. Please wait before trying again.'],
  REDEMPTION_INVALID: ['密钥不存在、已使用、已停用或已过期，请向老师核实。', 'This key is invalid, used, disabled, or expired. Please contact the instructor.'],
  COURSE_ACCESS_REQUIRED: ['你目前没有这门课程的访问权限。', 'You do not currently have access to this program.'],
  RESOURCE_NOT_READY: ['老师还没有上传这门课程的网盘资料。', 'The instructor has not added resources for this program yet.'],
  REVISION_CONFLICT: ['内容已被其他人更新。请保留你的修改，关闭编辑器并刷新列表后重新编辑。', 'Someone else updated this content. Keep your edits, close the editor, refresh the list, and reopen it.'],
  IDEMPOTENCY_CONFLICT: ['这次操作编号已用于其他内容，请重新填写操作。', 'This operation ID was used with different details. Start a new operation.'],
  INVALID_RESOURCE_URL: ['请输入 https://pan.baidu.com/s/ 开头的完整分享链接。', 'Enter a complete share URL beginning with https://pan.baidu.com/s/.'],
  INVALID_EXTRACTION_CODE: ['提取码应为 4 位字母或数字。', 'The extraction code must contain 4 letters or digits.'],
  INVALID_IMAGE_URL: ['图片请使用 HTTPS 地址或本站 /images/ 路径。', 'Use an HTTPS image URL or a local /images/ path.'],
  INVALID_INPUT: ['请检查必填项和字段格式。', 'Check required fields and their formats.'],
  CODE_NOT_REVOCABLE: ['密钥已使用或已停用；已开通权限请在学员管理中调整。', 'This key is used or disabled. Manage existing access in the learners tab.'],
  DATABASE_NOT_CONFIGURED: ['数据库尚未绑定，请联系网站维护者。', 'The database is not configured. Please contact the site maintainer.'],
  NOT_FOUND: ['未找到这条记录，请刷新列表。', 'This record was not found. Refresh the list.'],
  ORIGIN_DENIED: ['请求来源校验失败，请刷新页面后再试。', 'Request origin validation failed. Refresh the page and try again.'],
  ACCOUNT_DISABLED: ['账号已停用，请联系老师。', 'This account is disabled. Please contact the instructor.'],
}
export function errorMessage(error: unknown, language: Language) {
  const key = error instanceof ApiError ? error.code : 'INTERNAL_ERROR'
  return (messages[key] || messages.INTERNAL_ERROR)[language === 'zh' ? 0 : 1]
}
