import { useEffect, useRef, useState } from 'react'
import { ArrowDown, ArrowUp, Eye, ImagePlus, Plus, Save, Trash2, Upload } from 'lucide-react'
import type { Chapter, Curriculum, CurriculumEntry, Language, Lesson, LessonBlock } from '../shared/types'
import { api, ApiError, errorMessage } from './api'
import { Modal, Notice } from './Account'
import { tx } from './catalog'
import { LessonBlocks, LessonVideoLink } from './LessonContent'

const uuid = () => crypto.randomUUID()
const move = <T,>(items: T[], index: number, direction: number) => {
  const next = [...items]
  const target = index + direction
  if (target < 0 || target >= items.length) return items
  ;[next[index], next[target]] = [next[target], next[index]]
  return next
}
export function parseVideoShare(value: string) {
  const match = value.match(/https:\/\/pan\.baidu\.com\/s\/[a-zA-Z0-9_-]+(?:\?[^\s，。；「」“”"<>]+)?/)
  if (!match) return { url: value, extractionCode: '' }
  const url = new URL(match[0])
  const code = value.match(/(?:提取[码碼]|密码|密碼)\s*[:：]?\s*([a-zA-Z0-9]{4})/)?.[1] || url.searchParams.get('pwd') || ''
  return { url: url.href, extractionCode: code }
}
function OrderButtons({ index, count, label, language, onMove, onRemove }: { index: number; count: number; label: string; language: Language; onMove: (direction: number) => void; onRemove: () => void }) {
  return <div className="bz-block-actions">
    <button type="button" disabled={index === 0} aria-label={`${tx(language, '上移', 'Move up')} ${label}`} onClick={() => onMove(-1)}><ArrowUp /></button>
    <button type="button" disabled={index === count - 1} aria-label={`${tx(language, '下移', 'Move down')} ${label}`} onClick={() => onMove(1)}><ArrowDown /></button>
    <button type="button" aria-label={`${tx(language, '移除', 'Remove')} ${label}`} onClick={onRemove}><Trash2 /></button>
  </div>
}

export function CurriculumEditor({ courseId, courseTitle, language, onClose, onPublicChange }: { courseId: string; courseTitle: string; language: Language; onClose: () => void; onPublicChange?: () => void }) {
  const [entry, setEntry] = useState<CurriculumEntry | null>(null)
  const [error, setError] = useState<unknown>(null)
  const [reload, setReload] = useState(0)
  const closeHandler = useRef(onClose)
  useEffect(() => {
    const controller = new AbortController()
    setError(null)
    api<{ item: CurriculumEntry }>(`/admin/courses/${courseId}/curriculum`, { signal: controller.signal }).then(result => setEntry(result.item)).catch(error => { if (!controller.signal.aborted) setError(error) })
    return () => controller.abort()
  }, [courseId, reload])
  return <Modal title={tx(language, '章节与小节', 'Chapters & lessons')} language={language} className="bz-curriculum-dialog" onClose={() => closeHandler.current()}>
    <p>{courseTitle}</p>
    {Boolean(error) && <Notice error>{errorMessage(error, language)}<button className="bz-secondary" onClick={() => setReload(value => value + 1)}>{tx(language, '重试', 'Retry')}</button></Notice>}
    {!entry && !error && <p role="status">{tx(language, '正在读取章节…', 'Loading chapters…')}</p>}
    {entry && <CurriculumForm entry={entry} language={language} closeHandler={closeHandler} onClose={onClose} onPublicChange={onPublicChange} />}
  </Modal>
}

function CurriculumForm({ entry, language, closeHandler, onClose, onPublicChange }: { entry: CurriculumEntry; language: Language; closeHandler: React.RefObject<() => void>; onClose: () => void; onPublicChange?: () => void }) {
  const [draft, setDraft] = useState<Curriculum>(entry.draft)
  const [revision, setRevision] = useState(entry.revision)
  const [baseline, setBaseline] = useState(JSON.stringify(entry.draft))
  const [published, setPublished] = useState(entry.published)
  const [chapterId, setChapterId] = useState(entry.draft.chapters[0]?.id || '')
  const [lessonId, setLessonId] = useState(entry.draft.chapters[0]?.lessons[0]?.id || '')
  const [editLanguage, setEditLanguage] = useState<Language>('zh')
  const [preview, setPreview] = useState(false)
  const [busy, setBusy] = useState(false)
  const [uploading, setUploading] = useState(false)
  const [error, setError] = useState<unknown>(null)
  const [saved, setSaved] = useState<string | null>(null)
  const dirty = JSON.stringify(draft) !== baseline
  const chapter = draft.chapters.find(item => item.id === chapterId)
  const lesson = chapter?.lessons.find(item => item.id === lessonId)
  const unavailable = busy || uploading
  useEffect(() => {
    closeHandler.current = () => {
      if (!unavailable && (!dirty || window.confirm(tx(language, '还有未保存的章节修改，确定关闭吗？', 'Discard unsaved chapter changes?')))) onClose()
    }
    const handler = (event: BeforeUnloadEvent) => { if (dirty || uploading) { event.preventDefault(); event.returnValue = '' } }
    window.addEventListener('beforeunload', handler)
    return () => { closeHandler.current = onClose; window.removeEventListener('beforeunload', handler) }
  }, [dirty, unavailable, uploading, language, onClose, closeHandler])
  const change = (update: (value: Curriculum) => Curriculum) => { setSaved(null); setDraft(update) }
  const updateChapter = (update: (chapter: Chapter) => Chapter) => change(value => ({ chapters: value.chapters.map(item => item.id === chapterId ? update(item) : item) }))
  const updateLesson = (update: (lesson: Lesson) => Lesson) => updateChapter(item => ({ ...item, lessons: item.lessons.map(value => value.id === lessonId ? update(value) : value) }))
  const updateBlock = (id: string, patch: Partial<LessonBlock>) => updateLesson(item => ({ ...item, blocks: item.blocks.map(block => block.id === id ? { ...block, ...patch } as LessonBlock : block) }))
  const addChapter = () => {
    const id = uuid()
    change(value => ({ chapters: [...value.chapters, { id, title: '', lessons: [] }] }))
    setChapterId(id); setLessonId(''); setPreview(false)
  }
  const addLesson = () => {
    const id = uuid()
    updateChapter(value => ({ ...value, lessons: [...value.lessons, { id, title: '', blocks: [], video: null }] }))
    setLessonId(id); setPreview(false)
  }
  const addBlock = (type: LessonBlock['type']) => updateLesson(value => ({ ...value, blocks: [...value.blocks, type === 'image' ? { id: uuid(), type, url: '', caption: '' } : { id: uuid(), type, text: '' }] }))
  const remove = (label: string, action: () => void) => { if (window.confirm(tx(language, `从草稿移除「${label}」？保存并发布后才影响学员。`, `Remove “${label}” from the draft? Learners are affected only after publishing.`))) action() }
  const upload = async (blockId: string, file: File) => {
    setError(null)
    if (file.size > 5 * 1024 * 1024) { setError(new ApiError('BODY_TOO_LARGE')); return }
    if (!['image/jpeg', 'image/png', 'image/webp'].includes(file.type)) { setError(new ApiError('INVALID_IMAGE_FILE')); return }
    setUploading(true)
    try { const result = await api<{ url: string }>(`/admin/courses/${entry.courseId}/images`, { file }); updateBlock(blockId, { url: result.url }) }
    catch (error) { setError(error) } finally { setUploading(false) }
  }
  const save = async (action: string) => {
    if (action === 'unpublish' && !window.confirm(tx(language, '暂停发布后，学员将暂时看不到章节图文及影片链接，确定继续吗？', 'Hide all lessons and video links from learners until you publish again?'))) return
    setBusy(true); setError(null); setSaved(null)
    try {
      const result = await api<{ item: CurriculumEntry }>(`/admin/courses/${entry.courseId}/curriculum`, { method: 'PUT', data: { draft, revision, action } })
      setDraft(result.item.draft); setBaseline(JSON.stringify(result.item.draft)); setRevision(result.item.revision); setPublished(result.item.published); setSaved(action)
      if (action !== 'draft') onPublicChange?.()
    } catch (error) { setError(error) } finally { setBusy(false) }
  }
  const translated = editLanguage === 'en'
  const titleField = translated ? 'titleEn' : 'title'
  return <form className="bz-server-form bz-curriculum-form" onSubmit={event => {
    event.preventDefault()
    void save(((event.nativeEvent as SubmitEvent).submitter as HTMLButtonElement)?.value || 'draft')
  }}>
    <p className="bz-editor-status">{published ? tx(language, '已有发布版本', 'Published version available') : tx(language, '尚未发布', 'Not published')} · v{revision}{dirty && ` · ${tx(language, '有未保存修改', 'Unsaved changes')}`}</p>
    <p>{tx(language, '图文在本站阅读。每节影片为选填，未填链接就不显示影片入口。', 'Text and images are read here. Video links are optional and hidden when empty.')}</p>
    <fieldset disabled={unavailable}>
      <div className="bz-curriculum-workspace">
        <aside className="bz-curriculum-outline" aria-label={tx(language, '编辑课程目录', 'Edit course outline')}>
          <div className="bz-outline-heading"><strong>{tx(language, '课程目录', 'Course outline')}</strong><button type="button" className="bz-secondary" onClick={addChapter} disabled={draft.chapters.length >= 50}><Plus />{tx(language, '新增章', 'Add chapter')}</button></div>
          {!draft.chapters.length && <p>{tx(language, '先新增一章，再添加小节。', 'Add a chapter, then add lessons.')}</p>}
          {draft.chapters.map((item, index) => <section key={item.id}>
            <button type="button" className={`bz-chapter-select ${chapterId === item.id ? 'active' : ''}`} onClick={() => { setChapterId(item.id); setLessonId(item.lessons[0]?.id || ''); setPreview(false) }}><span>{String(index + 1).padStart(2, '0')}</span>{(translated && item.titleEn ? item.titleEn : item.title) || tx(language, '未命名章节', 'Untitled chapter')}</button>
            <div className="bz-outline-lessons">{item.lessons.map((section, number) => <button type="button" className={lessonId === section.id ? 'active' : ''} key={section.id} onClick={() => { setChapterId(item.id); setLessonId(section.id); setPreview(false) }}><span>{index + 1}.{number + 1}</span>{(translated && section.titleEn ? section.titleEn : section.title) || tx(language, '未命名小节', 'Untitled lesson')}</button>)}</div>
          </section>)}
        </aside>
        <div className="bz-curriculum-detail">
          {chapter && <>
            <div className="bz-editor-tabs"><button type="button" className={!translated ? 'active' : ''} onClick={() => setEditLanguage('zh')}>中文</button><button type="button" className={translated ? 'active' : ''} onClick={() => setEditLanguage('en')}>English</button></div>
            {translated && <small>{tx(language, '英文留空时显示中文。插图与影片由两个语言版本共用。', 'Empty English fields fall back to Chinese. Images and videos are shared across languages.')}</small>}
            <div className="bz-editor-section-title"><label>{tx(language, '章节名称', 'Chapter title')}<input maxLength={160} value={chapter[titleField] || ''} onChange={event => updateChapter(item => ({ ...item, [titleField]: event.target.value }))} /></label>
              <OrderButtons index={draft.chapters.indexOf(chapter)} count={draft.chapters.length} language={language} label={chapter.title || tx(language, '本章', 'chapter')} onMove={direction => change(value => ({ chapters: move(value.chapters, value.chapters.findIndex(item => item.id === chapterId), direction) }))} onRemove={() => remove(chapter.title || tx(language, '本章', 'chapter'), () => { change(value => ({ chapters: value.chapters.filter(item => item.id !== chapterId) })); setChapterId(''); setLessonId('') })} />
            </div>
            <button type="button" className="bz-secondary" onClick={addLesson} disabled={chapter.lessons.length >= 100}><Plus />{tx(language, '新增小节', 'Add lesson')}</button>
          </>}
          {lesson && <section className="bz-lesson-editor">
            <div className="bz-editor-section-title"><label>{tx(language, '小节名称', 'Lesson title')}<input maxLength={160} value={lesson[titleField] || ''} onChange={event => updateLesson(item => ({ ...item, [titleField]: event.target.value }))} /></label>
              <OrderButtons index={chapter!.lessons.indexOf(lesson)} count={chapter!.lessons.length} language={language} label={lesson.title || tx(language, '本节', 'lesson')} onMove={direction => updateChapter(item => ({ ...item, lessons: move(item.lessons, item.lessons.findIndex(value => value.id === lessonId), direction) }))} onRemove={() => remove(lesson.title || tx(language, '本节', 'lesson'), () => { updateChapter(item => ({ ...item, lessons: item.lessons.filter(value => value.id !== lessonId) })); setLessonId('') })} />
            </div>
            <button type="button" className="bz-secondary" onClick={() => setPreview(!preview)}><Eye />{preview ? tx(language, '继续编辑', 'Continue editing') : tx(language, '预览本节', 'Preview lesson')}</button>
            {preview ? <div className="bz-lesson-preview"><h2>{(translated && lesson.titleEn ? lesson.titleEn : lesson.title) || tx(language, '未命名小节', 'Untitled lesson')}</h2><LessonBlocks blocks={lesson.blocks} language={editLanguage} /><LessonVideoLink key={lesson.id} lesson={lesson} language={editLanguage} /></div> : <>
              {lesson.blocks.map((block, index) => <div className="bz-content-block" key={block.id}>
                <div className="bz-block-heading"><strong>{tx(language, block.type === 'image' ? '图片' : block.type === 'heading' ? '标题' : '段落', block.type === 'image' ? 'Image' : block.type === 'heading' ? 'Heading' : 'Paragraph')} {index + 1}</strong>
                  <OrderButtons index={index} count={lesson.blocks.length} language={language} label={`${tx(language, '图文块', 'block')} ${index + 1}`} onMove={direction => updateLesson(item => ({ ...item, blocks: move(item.blocks, index, direction) }))} onRemove={() => remove(`${tx(language, '图文块', 'block')} ${index + 1}`, () => updateLesson(item => ({ ...item, blocks: item.blocks.filter(value => value.id !== block.id) })))} />
                </div>
                {block.type === 'image' ? <>
                  {block.url && <img className="bz-block-image" src={block.url} alt={block.caption} referrerPolicy="no-referrer" />}
                  <label>{tx(language, '图片地址', 'Image URL')}<input maxLength={2000} value={block.url} onChange={event => updateBlock(block.id, { url: event.target.value })} placeholder="https://…" /></label>
                  <label className="bz-upload-label"><span><Upload />{tx(language, '从设备上传图片', 'Upload an image')}</span><input type="file" accept="image/jpeg,image/png,image/webp" onChange={event => { const file = event.target.files?.[0]; event.target.value = ''; if (file) void upload(block.id, file) }} /></label>
                  <small>{tx(language, 'JPG、PNG、WebP，单张最多 5 MB。上传的插图仅供本课程学员阅读。', 'JPG, PNG or WebP, up to 5 MB each. Uploaded images are available only to enrolled learners.')}</small>
                  <label>{tx(language, '图片说明', 'Image caption')}<input maxLength={500} value={(translated ? block.captionEn : block.caption) || ''} onChange={event => updateBlock(block.id, { [translated ? 'captionEn' : 'caption']: event.target.value })} /></label>
                </> : <label>{tx(language, block.type === 'heading' ? '标题文字' : '段落文字', block.type === 'heading' ? 'Heading text' : 'Paragraph text')}<textarea rows={block.type === 'heading' ? 2 : 6} maxLength={block.type === 'heading' ? 240 : 12000} value={(translated ? block.textEn : block.text) || ''} onChange={event => updateBlock(block.id, { [translated ? 'textEn' : 'text']: event.target.value })} /></label>}
              </div>)}
              <div className="bz-action-row"><button type="button" className="bz-secondary" onClick={() => addBlock('paragraph')} disabled={lesson.blocks.length >= 100}><Plus />{tx(language, '添加段落', 'Add paragraph')}</button><button type="button" className="bz-secondary" onClick={() => addBlock('heading')} disabled={lesson.blocks.length >= 100}>{tx(language, '添加标题', 'Add heading')}</button><button type="button" className="bz-secondary" onClick={() => addBlock('image')} disabled={lesson.blocks.length >= 100}><ImagePlus />{tx(language, '添加图片', 'Add image')}</button></div>
              <div className="bz-video-fields"><label>{tx(language, '影片链接（选填）', 'Video link (optional)')}<textarea rows={3} value={lesson.video?.url || ''} maxLength={2000} placeholder="https://pan.baidu.com/s/…" onChange={event => {
                const parsed = parseVideoShare(event.target.value)
                updateLesson(item => ({ ...item, video: parsed.url.trim() ? { url: parsed.url, extractionCode: parsed.extractionCode || item.video?.extractionCode || '', note: item.video?.note || '' } : null }))
              }} /></label><small>{tx(language, '可粘贴完整的百度网盘分享文字，自动识别链接和提取码。留空时，本节只显示图文。', 'Paste a Baidu Netdisk link or share text to fill the link and access code. Leave empty for a text-and-image lesson.')}</small>
                {lesson.video && <><label>{tx(language, '影片提取码（选填）', 'Video access code (optional)')}<input maxLength={4} value={lesson.video.extractionCode} onChange={event => updateLesson(item => ({ ...item, video: { ...item.video!, extractionCode: event.target.value } }))} /></label><label>{tx(language, '影片说明（选填）', 'Video note (optional)')}<textarea rows={2} maxLength={2000} value={lesson.video.note} onChange={event => updateLesson(item => ({ ...item, video: { ...item.video!, note: event.target.value } }))} /></label><button type="button" className="bz-secondary" onClick={() => updateLesson(item => ({ ...item, video: null }))}>{tx(language, '移除本节影片', 'Remove lesson video')}</button></>}
              </div>
            </>}
          </section>}
        </div>
      </div>
      <div className="bz-curriculum-save bz-sticky-actions">
        {Boolean(error) && <Notice error>{errorMessage(error, language)}</Notice>}
        {saved && <Notice>{saved === 'publish' ? tx(language, '章节已发布，学员可以阅读。', 'Lessons published and available to enrolled learners.') : saved === 'unpublish' ? tx(language, '章节已暂停发布，草稿已保留。', 'Lessons hidden. Your draft is retained.') : tx(language, '章节草稿已保存，学员内容未改变。', 'Chapter draft saved. Learner content is unchanged.')}</Notice>}
        {uploading && <p role="status">{tx(language, '正在上传图片…', 'Uploading image…')}</p>}
        <div className="bz-action-row"><button type="submit" value="draft" className="bz-secondary"><Save />{tx(language, '保存章节草稿', 'Save chapter draft')}</button><button type="submit" value="publish" className="bz-primary"><Eye />{busy ? tx(language, '保存中…', 'Saving…') : tx(language, '发布章节', 'Publish lessons')}</button>{published && <button type="button" className="bz-secondary" onClick={() => void save('unpublish')}>{tx(language, '暂停发布', 'Unpublish lessons')}</button>}</div>
      </div>
    </fieldset>
  </form>
}
