import { useState } from 'react'
import { Copy, ExternalLink, Video } from 'lucide-react'
import type { Language, Lesson, LessonBlock } from '../shared/types'
import { tx } from './catalog'

export function LessonBlocks({ blocks, language }: { blocks: LessonBlock[]; language: Language }) {
  return <div className="bz-lesson-prose">{blocks.map(block => {
    if (block.type === 'image') {
      const caption = language === 'en' && block.captionEn ? block.captionEn : block.caption
      return block.url ? <figure key={block.id}><img src={block.url} alt={caption} loading="lazy" referrerPolicy="no-referrer" /><figcaption>{caption}</figcaption></figure> : null
    }
    const text = language === 'en' && block.textEn ? block.textEn : block.text
    return block.type === 'heading' ? <h3 key={block.id}>{text}</h3> : <p key={block.id}>{text}</p>
  })}</div>
}
export function LessonVideoLink({ lesson, language }: { lesson: Lesson; language: Language }) {
  const [copied, setCopied] = useState(false)
  const [copyFailed, setCopyFailed] = useState(false)
  if (!lesson.video?.url) return null
  const video = lesson.video
  return <section className="bz-lesson-video" aria-label={tx(language, '本节影片', 'Lesson video')}>
    <div><Video /><h3>{tx(language, '本节影片', 'Lesson video')}</h3></div>
    <p>{tx(language, '影片在百度网盘打开，图文内容可继续在本站阅读。', 'Open the video in Baidu Netdisk. Read the lesson text and images here.')}</p>
    {video.note && <p className="bz-preserve-lines">{video.note}</p>}
    {video.extractionCode && <div className="bz-action-row"><span>{tx(language, '提取码：', 'Access code: ')}<code>{video.extractionCode}</code></span><button type="button" className="bz-secondary" onClick={async () => { try { await navigator.clipboard.writeText(video.extractionCode); setCopied(true); setCopyFailed(false) } catch { setCopyFailed(true) } }}><Copy />{copied ? tx(language, '已复制', 'Copied') : tx(language, '复制提取码', 'Copy code')}</button></div>}
    {copyFailed && <p role="status">{tx(language, '请选中上方提取码手动复制。', 'Select the access code above to copy it manually.')}</p>}
    <a className="bz-primary" href={video.url} target="_blank" rel="noopener noreferrer" referrerPolicy="no-referrer"><ExternalLink />{tx(language, '前往百度网盘看影片', 'Watch video in Baidu Netdisk')}</a>
  </section>
}
