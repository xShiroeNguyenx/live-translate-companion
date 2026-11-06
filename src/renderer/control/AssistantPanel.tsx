import { useMemo, useState } from 'react'
import { ASSISTANT_MAX_QUESTION_CHARS } from '../../shared/constants'
import { languageShort } from '../../shared/languages'
import { countSpokenSegments, wallClock } from '../../shared/pause'
import { useControlStore, type AssistantItem } from './store'

// Trợ lý cuộc họp: hỏi về nội dung đã dịch + gợi ý câu trả lời cho điều vừa được hỏi
export function AssistantPanel(): React.JSX.Element {
  const api = window.controlApi
  const hasKey = useControlStore((s) => s.hasKey)
  const segments = useControlStore((s) => s.segments)
  const items = useControlStore((s) => s.assistantItems)
  const askAssistant = useControlStore((s) => s.askAssistant)
  const suggestReplies = useControlStore((s) => s.suggestReplies)
  const clearAssistant = useControlStore((s) => s.clearAssistant)
  const [question, setQuestion] = useState('')
  const [copied, setCopied] = useState<string | null>(null)

  const hasTranscript = useMemo(() => countSpokenSegments(segments) > 0, [segments])
  const busy = items.some((i) => i.state === 'running')
  const blocked = !hasKey
    ? 'Chưa có Gemini API key.'
    : !hasTranscript
      ? 'Bắt đầu dịch chiều về, khi đã có phụ đề thì hỏi được về cuộc họp hoặc nhờ gợi ý trả lời.'
      : null

  const submit = (): void => {
    const q = question.trim()
    if (!q || blocked || busy) return
    setQuestion('')
    void askAssistant(q)
  }

  const copy = (key: string, text: string): void => {
    void api?.copyText(text).then(() => {
      setCopied(key)
      setTimeout(() => setCopied((c) => (c === key ? null : c)), 1500)
    })
  }

  return (
    <section className="card">
      <div className="card-head">
        <h2>🤖 Trợ lý cuộc họp</h2>
        {items.length > 0 && (
          <button
            className="link-btn"
            style={{ marginLeft: 'auto' }}
            onClick={clearAssistant}
            disabled={busy}
          >
            Xoá
          </button>
        )}
      </div>
      <div className="row">
        <input
          type="text"
          value={question}
          maxLength={ASSISTANT_MAX_QUESTION_CHARS}
          placeholder="Hỏi về cuộc họp… vd. Họ vừa chốt hạn ngày nào?"
          disabled={!!blocked}
          onChange={(e) => setQuestion(e.target.value)}
          onKeyDown={(e) => {
            // bỏ qua Enter khi bộ gõ đang ghép chữ
            if (e.key === 'Enter' && !e.nativeEvent.isComposing) submit()
          }}
        />
        <button className="small" onClick={submit} disabled={!!blocked || busy || !question.trim()}>
          Hỏi
        </button>
        <button
          className="small"
          onClick={() => void suggestReplies()}
          disabled={!!blocked || busy}
          title="Soạn 3 câu trả lời cho điều người khác vừa hỏi (dựa vào khoảng 3 phút gần nhất)"
        >
          💬 Gợi ý trả lời
        </button>
      </div>
      {blocked && <p className="hint">{blocked}</p>}
      {items.length > 0 && (
        <div className="assistant-list">
          {items.map((item) => (
            <AssistantEntry key={item.id} item={item} copied={copied} onCopy={copy} />
          ))}
        </div>
      )}
    </section>
  )
}

function AssistantEntry({
  item,
  copied,
  onCopy
}: {
  item: AssistantItem
  copied: string | null
  onCopy: (key: string, text: string) => void
}): React.JSX.Element {
  const time = <span className="assistant-time">{wallClock(item.at)}</span>

  if (item.kind === 'ask') {
    return (
      <div className="assistant-item">
        <div className="assistant-q">
          <span>❓ {item.question}</span>
          {time}
        </div>
        {item.state === 'running' && <p className="hint">⏳ Đang tìm trong transcript…</p>}
        {item.state === 'done' && <p className="assistant-answer">{item.answer}</p>}
        {item.state === 'error' && <p className="assistant-error">⚠ {item.error}</p>}
      </div>
    )
  }

  const result = item.result
  const replyLang = result?.replyLanguage ? languageShort(result.replyLanguage) : ''
  return (
    <div className="assistant-item">
      <div className="assistant-q">
        <span>💬 Gợi ý trả lời</span>
        {time}
      </div>
      {item.state === 'running' && <p className="hint">⏳ Đang soạn câu trả lời…</p>}
      {item.state === 'error' && <p className="assistant-error">⚠ {item.error}</p>}
      {item.state === 'done' && result && (
        <>
          {result.asked && <p className="assistant-asked">Họ đang hỏi: {result.asked}</p>}
          {result.suggestions?.map((s, idx) => {
            const key = `${item.id}-${idx}`
            // bản để nói/dán vào meeting; 2 ngôn ngữ trùng nhau thì chỉ có text
            const outgoingText = s.translation || s.text
            return (
              <div className="suggestion" key={key}>
                <div className="suggestion-text">
                  {s.text && <p className="mine">{s.text}</p>}
                  {s.translation && <p className="theirs">{s.translation}</p>}
                </div>
                <button
                  className="link-btn"
                  onClick={() => onCopy(key, outgoingText)}
                  title={s.translation ? `Copy câu ${replyLang} để dán vào chat meeting` : 'Copy'}
                >
                  {copied === key ? '✓ Đã copy' : '📋 Copy'}
                </button>
              </div>
            )
          })}
        </>
      )}
    </div>
  )
}
