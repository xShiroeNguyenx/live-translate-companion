import { useCallback, useEffect, useState } from 'react'
import { languageShort } from '../../shared/languages'
import type { HistoryEntry, HistoryRecord } from '../../shared/types'
import { useControlStore } from './store'
import { formatDuration } from './ui-helpers'
import { SegmentList } from './widgets'

function formatDate(ms: number): string {
  const d = new Date(ms)
  const pad = (n: number): string => String(n).padStart(2, '0')
  return `${pad(d.getDate())}/${pad(d.getMonth() + 1)} ${pad(d.getHours())}:${pad(d.getMinutes())}`
}

function durationOf(e: { startedAt: number; endedAt: number }): string {
  return formatDuration(Math.max(0, Math.round((e.endedAt - e.startedAt) / 1000)))
}

export function HistoryPanel({
  selectedId,
  onSelect
}: {
  selectedId: string | null
  onSelect: (id: string | null) => void
}): React.JSX.Element {
  const api = window.controlApi
  const summaries = useControlStore((s) => s.summaries)
  const [query, setQuery] = useState('')
  const [entries, setEntries] = useState<HistoryEntry[]>([])
  const [record, setRecord] = useState<HistoryRecord | null>(null)
  const [error, setError] = useState<string | null>(null)

  const reload = useCallback(() => {
    void api?.listHistory(query).then(setEntries)
  }, [api, query])

  // gõ tìm kiếm: chờ người dùng ngừng gõ một chút rồi mới tìm
  useEffect(() => {
    const t = setTimeout(reload, 200)
    return () => clearTimeout(t)
  }, [reload])

  // autosave ghi lịch sử mỗi ~1,5s khi đang dịch → gom lại, tải lại tối đa 2s/lần
  useEffect(() => {
    if (!api) return
    let t: ReturnType<typeof setTimeout> | null = null
    const off = api.onHistoryChanged(() => {
      if (t) return
      t = setTimeout(() => {
        t = null
        reload()
        if (selectedId) void api.getHistory(selectedId).then(setRecord)
      }, 2000)
    })
    return () => {
      off()
      if (t) clearTimeout(t)
    }
  }, [api, reload, selectedId])

  useEffect(() => {
    setError(null)
    if (!api || !selectedId) {
      setRecord(null)
      return
    }
    void api.getHistory(selectedId).then(setRecord)
  }, [api, selectedId])

  // tóm tắt xong → tải lại bản ghi đang mở
  const status = selectedId ? summaries[selectedId] : undefined
  useEffect(() => {
    if (status?.state === 'done' && selectedId) void api?.getHistory(selectedId).then(setRecord)
    if (status?.state === 'error') setError(status.error ?? 'Tóm tắt thất bại')
  }, [api, status, selectedId])

  if (!api) return <></>

  if (selectedId && record) {
    const summarizing = status?.state === 'running'
    const remove = async (): Promise<void> => {
      if (!window.confirm('Xoá phiên này cùng file transcript/tóm tắt đã lưu?')) return
      await api.deleteHistory(record.id)
      onSelect(null)
      reload()
    }
    const summarize = async (): Promise<void> => {
      setError(null)
      const result = await api.summarizeHistory(record.id)
      if (!result.ok) setError(result.error ?? 'Tóm tắt thất bại')
    }
    return (
      <>
        <section className="card">
          <div className="card-head">
            <button className="small" onClick={() => onSelect(null)}>
              ← Danh sách
            </button>
            <h2>
              {record.direction === 'incoming' ? '🎧 Chiều về' : '🎙 Chiều đi'} ·{' '}
              {formatDate(record.startedAt)}
            </h2>
          </div>
          <div className="metrics">
            <span>⏱ {durationOf(record)}</span>
            <span>🌐 → {languageShort(record.targetLanguage)}</span>
            <span>≈ ${record.costUsd.toFixed(3)}</span>
            <span>{record.segments.length} câu</span>
          </div>
          <div className="row wrap">
            <button className="small" disabled={summarizing} onClick={() => void summarize()}>
              {summarizing ? '⏳ Đang tóm tắt…' : record.summary ? '↻ Tóm tắt lại' : '📝 Tóm tắt'}
            </button>
            {record.transcriptFile && (
              <button
                className="small"
                onClick={() => void api.openHistoryFile(record.id, 'transcript')}
              >
                Mở transcript
              </button>
            )}
            {record.summaryFile && (
              <button className="small" onClick={() => void api.openHistoryFile(record.id, 'summary')}>
                Mở tóm tắt
              </button>
            )}
            <button className="small danger" style={{ marginLeft: 'auto' }} onClick={() => void remove()}>
              Xoá
            </button>
          </div>
          {error && <div className="alert error">{error}</div>}
        </section>

        {record.summary && (
          <section className="card">
            <h2>Tóm tắt</h2>
            <div className="summary-text">{record.summary}</div>
          </section>
        )}

        <section className="card">
          <h2>Transcript</h2>
          <SegmentList segments={record.segments} placeholder="Không có nội dung" className="history" />
        </section>
      </>
    )
  }

  return (
    <section className="card">
      <div className="row">
        <input
          type="search"
          placeholder="🔍 Tìm trong transcript & tóm tắt…"
          value={query}
          onChange={(e) => setQuery(e.target.value)}
        />
      </div>
      {entries.length === 0 && (
        <p className="placeholder static">
          {query ? 'Không tìm thấy phiên nào.' : 'Chưa có phiên nào được lưu (cần bật Tự lưu).'}
        </p>
      )}
      <div className="history-list">
        {entries.map((e) => (
          <button key={e.id} className="history-item" onClick={() => onSelect(e.id)}>
            <div className="history-meta">
              <span>{e.direction === 'incoming' ? '🎧' : '🎙'}</span>
              <span>{formatDate(e.startedAt)}</span>
              <span>⏱ {durationOf(e)}</span>
              <span>≈ ${e.costUsd.toFixed(3)}</span>
              {summaries[e.id]?.state === 'running' ? (
                <span title="Đang tóm tắt">⏳</span>
              ) : (
                e.hasSummary && <span title="Đã có tóm tắt">📝</span>
              )}
            </div>
            <div className="history-preview">{e.preview || '(trống)'}</div>
          </button>
        ))}
      </div>
    </section>
  )
}
