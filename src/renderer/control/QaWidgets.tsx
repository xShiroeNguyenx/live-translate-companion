import { useCallback, useMemo, useState } from 'react'
import { answerPreview, parseAnswer, type AnswerPart } from '../../shared/answer-format'
import { wallClock } from '../../shared/pause'
import type { AskItem } from './store'

// Dùng chung cho Trợ lý cuộc họp (tab Dịch) và "Hỏi về cuộc họp này" (tab Lịch sử).

// Danh sách mới → cũ: mục mới nhất mở sẵn, mục cũ thu gọn — trừ khi người dùng đã tự mở/thu.
// Hỏi câu mới thì câu trước tự thu lại, danh sách không dài ra mãi.
export function useCollapsible(ids: number[]): {
  isOpen(id: number, index: number): boolean
  toggle(id: number, index: number): void
  anyOpen: boolean
  setAll(open: boolean): void
} {
  const [override, setOverride] = useState<Record<number, boolean>>({})
  const isOpen = useCallback(
    (id: number, index: number): boolean => override[id] ?? index === 0,
    [override]
  )
  const toggle = useCallback((id: number, index: number): void => {
    setOverride((o) => ({ ...o, [id]: !(o[id] ?? index === 0) }))
  }, [])
  const setAll = useCallback(
    (open: boolean): void => setOverride(Object.fromEntries(ids.map((id) => [id, open]))),
    [ids]
  )
  return { isOpen, toggle, anyOpen: ids.some((id, i) => isOpen(id, i)), setAll }
}

export function useCopy(): { copied: string | null; copy(key: string, text: string): void } {
  const [copied, setCopied] = useState<string | null>(null)
  const copy = useCallback((key: string, text: string): void => {
    void window.controlApi?.copyText(text).then(() => {
      setCopied(key)
      setTimeout(() => setCopied((c) => (c === key ? null : c)), 1500)
    })
  }, [])
  return { copied, copy }
}

// 1 mục thu gọn được: đầu mục bấm để mở/thu; thu gọn thì chỉ còn 1 dòng tóm lược
export function Entry({
  icon,
  title,
  at,
  open,
  onToggle,
  preview,
  children
}: {
  icon: string
  title: string
  at: number
  open: boolean
  onToggle(): void
  preview?: string
  children: React.ReactNode
}): React.JSX.Element {
  return (
    <div className={`assistant-item ${open ? 'open' : 'collapsed'}`}>
      <button
        className="entry-head"
        onClick={onToggle}
        aria-expanded={open}
        title={open ? 'Thu gọn' : 'Mở ra'}
      >
        <span className="entry-chev">{open ? '▾' : '▸'}</span>
        <span className="entry-title">
          {icon} {title}
        </span>
        <span className="assistant-time">{wallClock(at)}</span>
      </button>
      {open ? children : preview && <p className="entry-preview">{preview}</p>}
    </div>
  )
}

function Parts({ parts }: { parts: AnswerPart[] }): React.JSX.Element {
  return (
    <>
      {parts.map((p, i) =>
        p.kind === 'time' ? (
          <span key={i} className="time-ref" title="Giờ trong cuộc họp — đối chiếu transcript">
            {p.time}
          </span>
        ) : (
          <span key={i}>{p.text}</span>
        )
      )}
    </>
  )
}

// Câu trả lời: gạch đầu dòng → danh sách, "(lúc 16:08)" → nhãn giờ
export function AnswerText({ text }: { text: string }): React.JSX.Element {
  const blocks = useMemo(() => parseAnswer(text), [text])
  return (
    <div className="answer">
      {blocks.map((b, i) =>
        b.kind === 'para' ? (
          <p key={i}>
            <Parts parts={b.parts} />
          </p>
        ) : (
          <ul key={i}>
            {b.items.map((item, j) => (
              <li key={j} className={item.level ? 'sub' : undefined}>
                <Parts parts={item.parts} />
              </li>
            ))}
          </ul>
        )
      )}
    </div>
  )
}

// 1 lượt hỏi đáp
export function AskEntry({
  item,
  open,
  onToggle,
  copied,
  onCopy
}: {
  item: AskItem
  open: boolean
  onToggle(): void
  copied: boolean
  onCopy(text: string): void
}): React.JSX.Element {
  const preview =
    item.state === 'running'
      ? '⏳ Đang tìm trong transcript…'
      : item.state === 'error'
        ? `⚠ ${item.error ?? 'Lỗi'}`
        : answerPreview(item.answer ?? '')
  return (
    <Entry icon="❓" title={item.question} at={item.at} open={open} onToggle={onToggle} preview={preview}>
      {item.state === 'running' && <p className="hint">⏳ Đang tìm trong transcript…</p>}
      {item.state === 'done' && item.answer && (
        <>
          <AnswerText text={item.answer} />
          <div className="answer-actions">
            <button className="link-btn" onClick={() => onCopy(item.answer ?? '')}>
              {copied ? '✓ Đã copy' : '📋 Copy câu trả lời'}
            </button>
          </div>
        </>
      )}
      {item.state === 'error' && <p className="assistant-error">⚠ {item.error}</p>}
    </Entry>
  )
}
