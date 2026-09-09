import { useEffect, useState } from 'react'
import { ChevronLeft, ChevronRight, RefreshCw, Search } from 'lucide-react'
import type { Language, Paginated } from '../shared/types'
import { api, errorMessage } from './api'
import { Notice } from './Account'
import { tx } from './catalog'

export function useAdminRecords<T>(path: string, filterName = 'status') {
  const [query, setQuery] = useState({ q: '', filter: 'all', page: 1 })
  const [revision, setRevision] = useState(0)
  const params = new URLSearchParams({ page: String(query.page), pageSize: '20' })
  if (query.q) params.set('q', query.q)
  if (query.filter !== 'all') params.set(filterName, query.filter)
  const url = `${path}?${params}`
  const key = `${url}:${revision}`
  const [result, setResult] = useState<{ key: string; data?: Paginated<T>; error?: unknown }>({ key: '' })
  useEffect(() => {
    const controller = new AbortController()
    let active = true
    api<Paginated<T>>(url, { signal: controller.signal }).then(data => {
      if (!active) return
      const lastPage = Math.max(1, Math.ceil(data.pagination.total / data.pagination.pageSize))
      if (data.pagination.page > lastPage) {
        setQuery(current => ({ ...current, page: lastPage }))
      } else setResult({ key, data })
    }).catch(error => { if (active) setResult({ key, error }) })
    return () => { active = false; controller.abort() }
  }, [url, key])
  const current = result.key === key ? result : undefined
  return {
    items: current?.data?.items || [], pagination: current?.data?.pagination,
    loading: !current, error: current?.error, query,
    search: (q: string, filter: string) => { setQuery({ q: q.trim(), filter, page: 1 }); setRevision(value => value + 1) },
    goTo: (page: number) => setQuery(current => ({ ...current, page })),
    reload: () => setRevision(value => value + 1),
  }
}

type RecordsState = ReturnType<typeof useAdminRecords<unknown>>
export function RecordSearch({ records, language, label, filters }: {
  records: RecordsState; language: Language; label: string;
  filters?: { label: string; options: [string, string][] };
}) {
  const [input, setInput] = useState(records.query.q)
  return <form role="search" aria-label={label} className="bz-server-form bz-record-search" onSubmit={event => { event.preventDefault(); records.search(input, records.query.filter) }}>
    <label>{label}<input type="search" maxLength={180} value={input} onChange={event => setInput(event.target.value)} /></label>
    {filters && <label>{filters.label}<select value={records.query.filter} onChange={event => records.search(input, event.target.value)}>{filters.options.map(([value, text]) => <option key={value} value={value}>{text}</option>)}</select></label>}
    <div className="bz-action-row"><button type="submit" className="bz-primary"><Search />{tx(language, '搜索', 'Search')}</button><button type="button" className="bz-secondary" onClick={() => { setInput(''); records.search('', 'all') }}>{tx(language, '重置', 'Reset')}</button></div>
  </form>
}

export function RecordFeedback({ records, language, empty }: { records: RecordsState; language: Language; empty: string }) {
  if (records.loading) return <p role="status">{tx(language, '正在读取…', 'Loading…')}</p>
  if (records.error) return <Notice error>{errorMessage(records.error, language)}<div className="bz-action-row"><button className="bz-secondary" onClick={records.reload}><RefreshCw />{tx(language, '重试', 'Retry')}</button></div></Notice>
  if (!records.items.length) return <p role="status">{records.query.q || records.query.filter !== 'all' ? tx(language, '没有匹配的记录，请调整搜索条件。', 'No matching records. Try different search criteria.') : empty}</p>
  return null
}

export function RecordPagination({ records, language }: { records: RecordsState; language: Language }) {
  const page = records.pagination
  if (!page) return null
  const pages = Math.max(1, Math.ceil(page.total / page.pageSize))
  return <nav className="bz-record-pagination" aria-label={tx(language, '记录分页', 'Record pages')}>
    <span role="status">{tx(language, `共 ${page.total} 条 · 第 ${page.page} / ${pages} 页`, `${page.total} records · Page ${page.page} of ${pages}`)}</span>
    <div className="bz-action-row"><button className="bz-secondary" disabled={page.page <= 1} onClick={() => records.goTo(page.page - 1)}><ChevronLeft />{tx(language, '上一页', 'Previous')}</button><button className="bz-secondary" disabled={page.page >= pages} onClick={() => records.goTo(page.page + 1)}>{tx(language, '下一页', 'Next')}<ChevronRight /></button></div>
  </nav>
}
