import { useState } from 'react'
import { TTS_EST_USD_PER_MINUTE, TYPED_SPEECH_MAX_CHARS } from '../../shared/constants'
import { languageShort } from '../../shared/languages'
import { useControlStore } from './store'
import { isVirtualCable } from './ui-helpers'
import { Warn } from './widgets'

// Chiều đi "Gõ để nói": gõ tiếng Việt → Dịch (bản dịch để đó, sửa được) → Phát thành giọng vào
// thiết bị "Phát vào". Không cần bật phiên chiều đi (micro).
export function TypedSpeechBox({ onOpenSettings }: { onOpenSettings: () => void }): React.JSX.Element {
  const api = window.controlApi
  const settings = useControlStore((s) => s.settings)
  const hasKey = useControlStore((s) => s.hasKey)
  const state = useControlStore((s) => s.typedSpeech)
  const draft = useControlStore((s) => s.typedDraft)
  const setDraft = useControlStore((s) => s.setTypedDraft)
  const sinkState = useControlStore((s) => s.outgoingSinkState)
  const [translating, setTranslating] = useState(false)
  const [starting, setStarting] = useState(false)
  const [error, setError] = useState<string | null>(null)
  // khoá "giọng + câu" đang được tạo sẵn / đã có sẵn ở main
  const [preparing, setPreparing] = useState<string | null>(null)
  const [ready, setReady] = useState<string | null>(null)

  if (!api || !settings) return <></>

  const targetLabel = languageShort(settings.outgoingTargetLanguage)
  const sinkLabel = settings.outgoingDeviceLabel || sinkState?.label || ''
  const noDevice = !settings.outgoingDeviceId
  const active = state !== 'idle'
  const source = draft.source.trim()
  const translation = draft.translation.trim()
  // câu gốc đã đổi sau lần dịch gần nhất → bản dịch đang hiện không còn khớp
  const stale = translation !== '' && draft.translatedFrom !== '' && source !== draft.translatedFrom

  const voice = settings.typedSpeechVoice
  const isReady = translation !== '' && ready === `${voice}\n${translation}`

  // tạo sẵn giọng ngay sau khi dịch: model mất gần bằng độ dài câu, chờ lúc bấm Phát thì quá lâu
  const prepare = async (text: string): Promise<void> => {
    const key = `${voice}\n${text}`
    setPreparing(key)
    try {
      const r = await api.prepareTyped(text)
      if (r.ok) setReady(key)
      // lỗi ở bước này không chặn: bấm Phát sẽ thử lại và báo lỗi thật
    } catch {
      /* như trên */
    } finally {
      setPreparing((p) => (p === key ? null : p))
    }
  }

  const translate = async (): Promise<void> => {
    if (!source || translating) return
    setTranslating(true)
    setError(null)
    try {
      const r = await api.translateTyped(source)
      if (r.ok && r.translation) {
        setDraft({ translation: r.translation, translatedFrom: source })
        void prepare(r.translation.trim())
      } else setError(r.error ?? 'Không dịch được.')
    } catch (err) {
      setError(String(err))
    } finally {
      setTranslating(false)
    }
  }

  const speak = async (): Promise<void> => {
    if (!translation || active || starting) return
    setStarting(true)
    setError(null)
    try {
      const r = await api.speakTyped(translation, draft.translatedFrom)
      // đã phát được = giọng của câu này đang nằm sẵn ở main → phát lại ra ngay, không tốn thêm
      if (r.ok) setReady(`${voice}\n${translation}`)
      else if (!r.stopped) setError(r.error ?? 'Không phát được.')
    } catch (err) {
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
        : stale
          ? 'Câu gốc đã đổi. Bấm Dịch để cập nhật bản dịch trước khi phát.'
          : preparing !== null
            ? '⏳ Đang chuẩn bị giọng… (bấm Phát ngay cũng được, sẽ chờ nốt)'
            : isReady
              ? `✓ Giọng đã sẵn: bấm Phát là ra tiếng ngay · vào ${sinkLabel || '(chưa chọn)'}`
              : `Phát vào: ${sinkLabel || '(chưa chọn)'} · ≈ $${TTS_EST_USD_PER_MINUTE.toFixed(2)}/phút giọng`

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
          value={draft.source}
          maxLength={TYPED_SPEECH_MAX_CHARS}
          placeholder="Gõ câu cần nói (tiếng Việt)… Enter để dịch, Shift+Enter xuống dòng"
          onChange={(e) => setDraft({ source: e.target.value })}
          onKeyDown={(e) => {
            // bỏ qua Enter khi bộ gõ đang ghép chữ
            if (e.key === 'Enter' && !e.shiftKey && !e.nativeEvent.isComposing) {
              e.preventDefault()
              void translate()
            }
          }}
        />
        <button
          className="btn-ask"
          onClick={() => void translate()}
          disabled={!hasKey || !source || translating}
          title={`Dịch sang ${targetLabel} (chưa phát)`}
        >
          {translating ? '⏳' : 'Dịch'}
        </button>
      </div>

      <div className="typed-row">
        <textarea
          rows={2}
          className="typed-translation"
          value={draft.translation}
          maxLength={TYPED_SPEECH_MAX_CHARS}
          placeholder={`Bản dịch ${targetLabel} hiện ở đây. Sửa được trước khi phát (Ctrl+Enter để phát)`}
          onChange={(e) => setDraft({ translation: e.target.value })}
          onKeyDown={(e) => {
            if (e.key === 'Enter' && e.ctrlKey && !e.nativeEvent.isComposing) {
              e.preventDefault()
              void speak()
            }
          }}
        />
        {active ? (
          <button className="btn-stop" onClick={() => void api.stopTyped()}>
            ■ Dừng
          </button>
        ) : (
          <button
            className="btn-start"
            onClick={() => void speak()}
            disabled={!hasKey || !translation || starting || noDevice}
            title="Đọc bản dịch thành giọng vào meeting"
          >
            ▶ Phát
          </button>
        )}
      </div>

      <div className="typed-foot">
        <span className={`hint ${stale && !active ? 'stale' : ''}`}>{status}</span>
        {(draft.source || draft.translation) && !active && (
          <button
            className="link-btn"
            onClick={() => {
              setDraft({ source: '', translation: '', translatedFrom: '' })
              setError(null)
            }}
          >
            Xoá
          </button>
        )}
      </div>
    </div>
  )
}
