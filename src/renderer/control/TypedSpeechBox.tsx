import { useEffect, useRef, useState } from 'react'
import {
  TTS_EST_USD_PER_MINUTE,
  TYPED_SPEECH_CACHE_SENTENCES,
  TYPED_SPEECH_MAX_CHARS
} from '../../shared/constants'
import { languageShort } from '../../shared/languages'
import {
  canAddTypedItem,
  canPlay,
  isPreparing,
  isVoiceReady,
  newTypedItem,
  nextToPlay,
  patchTypedItem,
  removeTypedItem,
  voiceKey,
  type TypedItem
} from '../../shared/typed-queue'
import { useControlStore } from './store'
import { isVirtualCable } from './ui-helpers'
import { Warn } from './widgets'

// số câu soạn sẵn tối đa = số câu main giữ sẵn giọng, để câu nào trong danh sách cũng phát ngay được
const MAX_ITEMS = TYPED_SPEECH_CACHE_SENTENCES

let itemSeq = 0
// tạo giọng lần lượt từng câu: gõ nhanh nhiều câu cũng không bắn hàng loạt request cùng lúc
let prepareChain: Promise<void> = Promise.resolve()

const store = useControlStore.getState
const patch = (id: number, p: Partial<Omit<TypedItem, 'id'>>): void =>
  store().updateTypedItems((items) => patchTypedItem(items, id, p))
const findItem = (id: number): TypedItem | undefined => store().typedItems.find((i) => i.id === id)

// Tạo sẵn giọng cho 1 câu (model mất gần bằng độ dài câu, chờ lúc bấm Phát thì quá lâu).
// Lỗi ở bước này không chặn: bấm Phát sẽ thử lại và báo lỗi thật.
function queuePrepare(id: number): void {
  prepareChain = prepareChain.then(async () => {
    const api = window.controlApi
    const item = findItem(id)
    const voice = store().settings?.typedSpeechVoice
    if (!api || !item || !voice || !canPlay(item) || isVoiceReady(item, voice)) return
    const text = item.translation.trim()
    const key = voiceKey(voice, text)
    patch(id, { preparingKey: key })
    let ok = false
    try {
      ok = (await api.prepareTyped(text)).ok
    } catch {
      /* như trên */
    }
    store().updateTypedItems((items) =>
      items.map((i) =>
        i.id !== id
          ? i
          : {
              ...i,
              preparingKey: i.preparingKey === key ? null : i.preparingKey,
              readyKey: ok ? key : i.readyKey
            }
      )
    )
  })
}

async function translateItem(id: number): Promise<void> {
  const api = window.controlApi
  const item = findItem(id)
  if (!api || !item) return
  patch(id, { status: 'translating', error: undefined })
  try {
    const r = await api.translateTyped(item.source)
    if (r.ok && r.translation) {
      patch(id, { status: 'translated', translation: r.translation.trim() })
      queuePrepare(id)
    } else patch(id, { status: 'error', error: r.error ?? 'Không dịch được.' })
  } catch (err) {
    patch(id, { status: 'error', error: String(err) })
  }
}

// Chiều đi "Gõ để nói": gõ tiếng Việt + Enter → câu vào danh sách soạn sẵn (tự dịch + tạo sẵn giọng).
// Tới lượt nói thì bấm ▶ ở câu muốn phát. Không cần bật phiên chiều đi (micro).
export function TypedSpeechBox({ onOpenSettings }: { onOpenSettings: () => void }): React.JSX.Element {
  const api = window.controlApi
  const settings = useControlStore((s) => s.settings)
  const hasKey = useControlStore((s) => s.hasKey)
  const state = useControlStore((s) => s.typedSpeech)
  const input = useControlStore((s) => s.typedInput)
  const setInput = useControlStore((s) => s.setTypedInput)
  const items = useControlStore((s) => s.typedItems)
  const updateItems = useControlStore((s) => s.updateTypedItems)
  const sinkState = useControlStore((s) => s.outgoingSinkState)
  const [starting, setStarting] = useState(false)
  const [playingId, setPlayingId] = useState<number | null>(null)
  const [error, setError] = useState<string | null>(null)
  const listRef = useRef<HTMLUListElement>(null)
  const count = items.length

  // câu mới thêm ở cuối → cuộn xuống cho thấy
  useEffect(() => {
    const el = listRef.current
    if (el) el.scrollTop = el.scrollHeight
  }, [count])

  // phát xong / bị dừng → bỏ đánh dấu, kẻo lần phát lại từ transcript bị hiện nhầm vào câu cũ
  useEffect(() => {
    if (state === 'idle') setPlayingId(null)
  }, [state])

  if (!api || !settings) return <></>

  const targetLabel = languageShort(settings.outgoingTargetLanguage)
  const sinkLabel = settings.outgoingDeviceLabel || sinkState?.label || ''
  const noDevice = !settings.outgoingDeviceId
  const active = state !== 'idle'
  const voice = settings.typedSpeechVoice
  const next = nextToPlay(items)
  const readyCount = items.filter((i) => isVoiceReady(i, voice)).length

  const add = (): void => {
    const source = input.trim()
    if (!source) return
    if (!canAddTypedItem(items, MAX_ITEMS)) {
      setError(`Danh sách đã đủ ${MAX_ITEMS} câu. Xoá bớt câu không dùng rồi gõ tiếp.`)
      return
    }
    setError(null)
    const id = ++itemSeq
    updateItems((list) => [...list, newTypedItem(id, source)])
    setInput('')
    void translateItem(id)
  }

  const speak = async (item: TypedItem): Promise<void> => {
    const text = item.translation.trim()
    if (!text || active || starting) return
    setStarting(true)
    setPlayingId(item.id)
    setError(null)
    try {
      const r = await api.speakTyped(text, item.source)
      // đã phát được = giọng của câu này đang nằm sẵn ở main → phát lại ra ngay, không tốn thêm
      if (r.ok) {
        updateItems((list) =>
          list.map((i) =>
            i.id === item.id ? { ...i, played: i.played + 1, readyKey: voiceKey(voice, text) } : i
          )
        )
      } else {
        setPlayingId(null)
        if (!r.stopped) setError(r.error ?? 'Không phát được.')
      }
    } catch (err) {
      setPlayingId(null)
      setError(String(err))
    } finally {
      setStarting(false)
    }
  }

  const status =
    state === 'synthesizing'
      ? '⏳ Đang tạo giọng…'
      : state === 'playing'
        ? `🔊 Đang phát vào ${sinkLabel || 'thiết bị đã chọn'}…`
        : count === 0
          ? `Phát vào: ${sinkLabel || '(chưa chọn)'} · ≈ $${TTS_EST_USD_PER_MINUTE.toFixed(2)}/phút giọng`
          : `${readyCount}/${count} câu đã sẵn giọng · vào ${sinkLabel || '(chưa chọn)'}`

  const playDisabled = !hasKey || noDevice || active || starting

  return (
    <div className="typed-box">
      {!hasKey && <p className="hint">Chưa có Gemini API key.</p>}
      {noDevice && (
        <Warn onFix={onOpenSettings}>Chưa chọn thiết bị “Phát vào” — nên là CABLE Input.</Warn>
      )}
      {!noDevice && sinkLabel !== '' && !isVirtualCable(sinkLabel) && (
        <Warn onFix={onOpenSettings}>
          “{sinkLabel}” không phải mic ảo — giọng sẽ ra loa/tai nghe, meeting không nhận được.
        </Warn>
      )}
      {error && <div className="alert error">{error}</div>}

      <div className="typed-row">
        <textarea
          rows={2}
          value={input}
          maxLength={TYPED_SPEECH_MAX_CHARS}
          placeholder={`Gõ câu cần nói (tiếng Việt)… Enter: dịch sang ${targetLabel} và lưu vào danh sách · Ctrl+Enter: phát câu kế tiếp`}
          onChange={(e) => setInput(e.target.value)}
          onKeyDown={(e) => {
            // bỏ qua Enter khi bộ gõ đang ghép chữ
            if (e.key !== 'Enter' || e.nativeEvent.isComposing) return
            if (e.ctrlKey) {
              e.preventDefault()
              if (next && !playDisabled) void speak(next)
            } else if (!e.shiftKey) {
              e.preventDefault()
              add()
            }
          }}
        />
        <button
          className="btn-ask"
          onClick={add}
          disabled={!hasKey || !input.trim()}
          title={`Dịch sang ${targetLabel} và lưu vào danh sách (chưa phát)`}
        >
          Lưu
        </button>
      </div>

      {count > 0 && (
        <ul className="typed-list" ref={listRef}>
          {items.map((item) => {
            const ready = isVoiceReady(item, voice)
            const preparing = isPreparing(item, voice)
            const isNext = next?.id === item.id
            const isPlaying = active && playingId === item.id
            return (
              <li
                key={item.id}
                className={`typed-item ${item.played > 0 ? 'played' : ''} ${isNext ? 'next' : ''} ${isPlaying ? 'playing' : ''}`}
              >
                <div className="typed-item-body">
                  <div className="typed-item-src">{item.source}</div>
                  {item.status === 'translating' ? (
                    <div className="hint">⏳ Đang dịch…</div>
                  ) : item.status === 'error' ? (
                    <div className="typed-item-err">
                      {item.error}{' '}
                      <button className="link-btn" onClick={() => void translateItem(item.id)}>
                        Dịch lại
                      </button>
                    </div>
                  ) : (
                    <textarea
                      className="typed-item-tr"
                      rows={Math.min(3, Math.max(1, Math.ceil(item.translation.length / 32)))}
                      value={item.translation}
                      maxLength={TYPED_SPEECH_MAX_CHARS}
                      title="Sửa được trước khi phát · Ctrl+Enter để phát câu này"
                      onChange={(e) => patch(item.id, { translation: e.target.value })}
                      // sửa xong → tạo lại giọng cho câu đã sửa
                      onBlur={() => queuePrepare(item.id)}
                      onKeyDown={(e) => {
                        if (e.key === 'Enter' && e.ctrlKey && !e.nativeEvent.isComposing) {
                          e.preventDefault()
                          if (!playDisabled) void speak(item)
                        }
                      }}
                    />
                  )}
                  <div className="typed-item-meta">
                    {isPlaying
                      ? state === 'synthesizing'
                        ? '⏳ đang tạo giọng…'
                        : '🔊 đang phát'
                      : item.status !== 'translated'
                        ? ''
                        : preparing
                          ? '⏳ đang chuẩn bị giọng'
                          : ready
                            ? '✓ giọng sẵn'
                            : 'chưa có giọng (bấm ▶ sẽ tạo rồi phát)'}
                    {item.played > 0 && ` · đã phát ${item.played} lần`}
                    {isNext && !isPlaying && ' · câu kế tiếp'}
                  </div>
                </div>
                <div className="typed-item-actions">
                  {isPlaying ? (
                    <button className="btn-stop small" onClick={() => void api.stopTyped()}>
                      ■
                    </button>
                  ) : (
                    <button
                      className="btn-start small"
                      onClick={() => void speak(item)}
                      disabled={playDisabled || !canPlay(item)}
                      title="Đọc câu này vào meeting"
                    >
                      ▶
                    </button>
                  )}
                  <button
                    className="link-btn"
                    title="Xoá câu này khỏi danh sách"
                    disabled={isPlaying}
                    onClick={() => updateItems((list) => removeTypedItem(list, item.id))}
                  >
                    ✕
                  </button>
                </div>
              </li>
            )
          })}
        </ul>
      )}

      <div className="typed-foot">
        <span className="hint">{status}</span>
        {active && playingId === null && (
          <button className="btn-stop small" onClick={() => void api.stopTyped()}>
            ■ Dừng
          </button>
        )}
        {count > 0 && !active && (
          <button
            className="link-btn"
            onClick={() => {
              updateItems(() => [])
              setError(null)
            }}
          >
            Xoá hết
          </button>
        )}
      </div>
    </div>
  )
}
