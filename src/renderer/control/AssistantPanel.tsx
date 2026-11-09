import { useMemo, useState } from 'react'
import { ASSISTANT_MAX_QUESTION_CHARS } from '../../shared/constants'
import { languageShort } from '../../shared/languages'
import { countSpokenSegments } from '../../shared/pause'
import { AskEntry, Entry, useCollapsible, useCopy } from './QaWidgets'
import { useControlStore, type AssistantItem } from './store'

// Trợ lý cuộc họp: hỏi về nội dung đã dịch + gợi ý câu trả lời cho điều vừa được hỏi
export function AssistantPanel(): React.JSX.Element {
  const hasKey = useControlStore((s) => s.hasKey)
  const segments = useControlStore((s) => s.segments)
  const items = useControlStore((s) => s.assistantItems)
  const askAssistant = useControlStore((s) => s.askAssistant)
  const suggestReplies = useControlStore((s) => s.suggestReplies)
  const clearAssistant = useControlStore((s) => s.clearAssistant)
  const [question, setQuestion] = useState('')
  const { copied, copy } = useCopy()
  const collapse = useCollapsible(items.map((i) => i.id))

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

  return (
    <section className="card qa">
      <div className="card-head">
        <h2>🤖 Trợ lý cuộc họp</h2>
        {items.length > 1 && (
          <button className="link-btn" onClick={() => collapse.setAll(!collapse.anyOpen)}>
            {collapse.anyOpen ? 'Thu gọn tất cả' : 'Mở tất cả'}
          </button>
        )}
        {items.length > 0 && (
          <button className="link-btn" onClick={clearAssistant} disabled={busy}>
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
        <button className="btn-ask" onClick={submit} disabled={!!blocked || busy || !question.trim()}>
          Hỏi
        </button>
        <button
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
          {items.map((item, idx) => {
            const open = collapse.isOpen(item.id, idx)
            const onToggle = (): void => collapse.toggle(item.id, idx)
            return item.kind === 'ask' ? (
              <AskEntry
                key={item.id}
                item={item}
                open={open}
                onToggle={onToggle}
                copied={copied === `ask-${item.id}`}
                onCopy={(text) => copy(`ask-${item.id}`, text)}
              />
            ) : (
              <ReplyEntry
                key={item.id}
                item={item}
                open={open}
                onToggle={onToggle}
                copied={copied}
                onCopy={copy}
              />
            )
          })}
        </div>
      )}
    </section>
  )
}

function ReplyEntry({
  item,
  open,
  onToggle,
  copied,
  onCopy
}: {
  item: Extract<AssistantItem, { kind: 'reply' }>
  open: boolean
  onToggle(): void
  copied: string | null
  onCopy: (key: string, text: string) => void
}): React.JSX.Element {
  const result = item.result
  const replyLang = result?.replyLanguage ? languageShort(result.replyLanguage) : ''
  const preview =
    item.state === 'running'
      ? '⏳ Đang soạn câu trả lời…'
      : item.state === 'error'
        ? `⚠ ${item.error ?? 'Lỗi'}`
        : result?.asked
          ? `Họ đang hỏi: ${result.asked}`
          : (result?.suggestions?.[0]?.text ?? '')
  return (
    <Entry
      icon="💬"
      title="Gợi ý trả lời"
      at={item.at}
      open={open}
      onToggle={onToggle}
      preview={preview}
    >
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
    </Entry>
  )
}
