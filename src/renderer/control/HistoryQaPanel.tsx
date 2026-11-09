import { useMemo, useState } from 'react'
import { ASSISTANT_MAX_QUESTION_CHARS } from '../../shared/constants'
import { estimateHistoryAskUsd } from '../../shared/cost'
import { countSpokenSegments } from '../../shared/pause'
import type { HistoryRecord } from '../../shared/types'
import { AskEntry, useCollapsible, useCopy } from './QaWidgets'
import { useControlStore, type AskItem } from './store'

const NO_ITEMS: AskItem[] = []

// Câu hỏi hay dùng sau cuộc họp — bấm là hỏi luôn
const QUICK_QUESTIONS: { label: string; question: string }[] = [
  { label: '📋 Việc tôi cần làm', question: 'Sau cuộc họp này tôi cần làm những việc gì, hạn khi nào?' },
  { label: '✅ Đã chốt gì', question: 'Cuộc họp đã thống nhất, quyết định những gì?' },
  { label: '📅 Các mốc thời gian', question: 'Liệt kê các hạn chót và mốc thời gian được nhắc tới.' },
  { label: '❓ Còn bỏ ngỏ', question: 'Những vấn đề hay câu hỏi nào còn chưa được giải quyết?' }
]

// Hỏi về 1 phiên đã lưu: AI đọc lại cả transcript (+ lời chiều đi cùng giờ, + bản tóm tắt nếu có)
// rồi trích câu trả lời, kèm giờ để đối chiếu. Lượt hỏi đáp giữ theo phiên tới khi tắt app.
export function HistoryQaPanel({ record }: { record: HistoryRecord }): React.JSX.Element {
  const hasKey = useControlStore((s) => s.hasKey)
  const items = useControlStore((s) => s.historyQa[record.id] ?? NO_ITEMS)
  const askHistory = useControlStore((s) => s.askHistory)
  const clearHistoryQa = useControlStore((s) => s.clearHistoryQa)
  const [question, setQuestion] = useState('')
  const { copied, copy } = useCopy()
  const collapse = useCollapsible(items.map((i) => i.id))

  const spoken = useMemo(() => countSpokenSegments(record.segments), [record.segments])
  const costPerQuestion = useMemo(() => {
    const chars = record.segments.reduce(
      (n, s) => n + s.source.text.length + s.target.text.length,
      record.summary?.length ?? 0
    )
    return estimateHistoryAskUsd(chars)
  }, [record.segments, record.summary])

  const busy = items.some((i) => i.state === 'running')
  const blocked = !hasKey
    ? 'Chưa có Gemini API key.'
    : spoken === 0
      ? 'Phiên này không có lời nào để hỏi.'
      : null

  const ask = (q: string): void => {
    if (!q || blocked || busy) return
    void askHistory(record.id, q)
  }
  const submit = (): void => {
    const q = question.trim()
    if (!q || blocked || busy) return
    setQuestion('')
    ask(q)
  }

  return (
    <section className="card qa">
      <div className="card-head">
        <h2>🤖 Hỏi về cuộc họp này</h2>
        {!blocked && (
          <span
            className="qa-meta"
            title="Mỗi câu hỏi gửi lại cả transcript cho AI; chi phí được tính vào chi phí tháng"
          >
            ≈ ${costPerQuestion.toFixed(3)}/câu
          </span>
        )}
        {items.length > 1 && (
          <button className="link-btn" onClick={() => collapse.setAll(!collapse.anyOpen)}>
            {collapse.anyOpen ? 'Thu gọn tất cả' : 'Mở tất cả'}
          </button>
        )}
        {items.length > 0 && (
          <button className="link-btn" onClick={() => clearHistoryQa(record.id)} disabled={busy}>
            Xoá
          </button>
        )}
      </div>
      <div className="row">
        <input
          type="text"
          value={question}
          maxLength={ASSISTANT_MAX_QUESTION_CHARS}
          placeholder="Hỏi gì cũng được… vd. Ai phụ trách việc test, hạn khi nào?"
          disabled={!!blocked}
          onChange={(e) => setQuestion(e.target.value)}
          onKeyDown={(e) => {
            // bỏ qua Enter khi bộ gõ đang ghép chữ
            if (e.key === 'Enter' && !e.nativeEvent.isComposing) submit()
          }}
        />
        <button className="btn-ask" onClick={submit} disabled={!!blocked || busy || !question.trim()}>
          {busy ? '⏳' : 'Hỏi'}
        </button>
      </div>
      {blocked ? (
        <p className="hint">{blocked}</p>
      ) : (
        <div className="chips">
          {QUICK_QUESTIONS.map((c) => (
            <button
              key={c.label}
              className="chip"
              disabled={busy}
              title={c.question}
              onClick={() => ask(c.question)}
            >
              {c.label}
            </button>
          ))}
        </div>
      )}
      {!blocked && items.length === 0 && (
        <p className="hint">
          AI đọc lại toàn bộ transcript{record.summary ? ' và bản tóm tắt' : ''} của phiên này để trả
          lời, kèm giờ để đối chiếu. Thông tin không có trong transcript thì AI nói là không thấy.
        </p>
      )}
      {items.length > 0 && (
        <div className="assistant-list history">
          {items.map((item, idx) => (
            <AskEntry
              key={item.id}
              item={item}
              open={collapse.isOpen(item.id, idx)}
              onToggle={() => collapse.toggle(item.id, idx)}
              copied={copied === String(item.id)}
              onCopy={(text) => copy(String(item.id), text)}
            />
          ))}
        </div>
      )}
    </section>
  )
}
