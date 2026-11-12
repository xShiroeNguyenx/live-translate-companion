import { EventEmitter } from 'node:events'
import {
  TEXT_TRANSLATE_MODEL,
  TEXT_TRANSLATE_PRICE_USD_PER_M_INPUT,
  TEXT_TRANSLATE_PRICE_USD_PER_M_OUTPUT,
  TEXT_TRANSLATE_TIMEOUT_MS,
  TTS_TIMEOUT_MS,
  TYPED_SPEECH_MAX_CHARS,
  TYPED_SPEECH_TAIL_MS
} from '../../shared/constants'
import type {
  AppSettings,
  PlaybackSinkState,
  TypedSpeakResult,
  TypedSpeechState,
  TypedTranslateResult
} from '../../shared/types'
import { shortError } from '../assistant/assistant'
import { flashCostUsd, generateFlash } from '../gemini/flash'
import { synthesizeSpeech, ttsCostUsd } from '../gemini/tts'
import { buildTypedSpeechPrompt } from '../translate/translate-prompt'

export interface TypedSpeechDeps {
  getApiKey(): string | null
  getSettings(): AppSettings
  // khác null = đã chạm giới hạn chi phí tháng → không gọi model
  budgetError(): string | null
  onCost(usd: number): void
  // bật player CABLE + route tới thiết bị "Phát vào", trả về kết quả route THẬT của engine
  prepareSink(): Promise<PlaybackSinkState>
  play(pcm: Buffer): void
  // cắt tiếng đang phát
  flush(): void
  // phát xong / bị dừng → player CABLE được tắt nếu phiên chiều đi không chạy
  release(): void
  // ghi câu vừa nói vào transcript chiều đi (source = câu gõ, target = câu đã đọc)
  onSpoken(source: string, target: string): void
  generate?: typeof generateFlash
  synthesize?: typeof synthesizeSpeech
}

const STOPPED: TypedSpeakResult = { ok: false, stopped: true, error: 'Đã dừng.' }

// giọng đã tạo cho 1 câu; key = giọng + chữ
interface Audio {
  key: string
  pcm: Buffer
  durationMs: number
}

type Text = { ok: false; error: string } | { ok: true; text: string }
type Access = { ok: false; error: string } | { ok: true; apiKey: string; settings: AppSettings }

// "Gõ để nói" của chiều đi: người dùng gõ → dịch sang ngôn ngữ đích (để đó cho họ xem/sửa) →
// khi họ bấm Phát thì đọc bản dịch thành giọng vào thiết bị "Phát vào" (mic ảo của meeting).
// Không cần phiên chiều đi (micro) đang chạy.
export class TypedSpeechService extends EventEmitter {
  private state: TypedSpeechState = 'idle'
  // tăng mỗi lần Phát/Dừng: kết quả của lần cũ về muộn thì bỏ
  private generation = 0
  private timer: ReturnType<typeof setTimeout> | null = null
  private cached: Audio | null = null
  private inflight: { key: string; promise: Promise<Audio> } | null = null

  constructor(private deps: TypedSpeechDeps) {
    super()
  }

  getState(): TypedSpeechState {
    return this.state
  }

  // true = player CABLE phải đang bật (đang route hoặc đang phát)
  isPlaying(): boolean {
    return this.state === 'playing'
  }

  private setState(state: TypedSpeechState): void {
    if (this.state === state) return
    this.state = state
    this.emit('state', state)
  }

  private checkText(text: unknown, empty: string): Text {
    const t = typeof text === 'string' ? text.trim() : ''
    if (!t) return { ok: false, error: empty }
    if (t.length > TYPED_SPEECH_MAX_CHARS) {
      return { ok: false, error: `Câu quá dài (tối đa ${TYPED_SPEECH_MAX_CHARS} ký tự).` }
    }
    return { ok: true, text: t }
  }

  private access(): Access {
    const apiKey = this.deps.getApiKey()
    if (!apiKey) return { ok: false, error: 'Chưa cấu hình Gemini API key.' }
    const budget = this.deps.budgetError()
    if (budget) return { ok: false, error: budget }
    return { ok: true, apiKey, settings: this.deps.getSettings() }
  }

  async translate(text: unknown): Promise<TypedTranslateResult> {
    const input = this.checkText(text, 'Gõ câu cần nói trước đã.')
    if (!input.ok) return input
    const access = this.access()
    if (!access.ok) return access
    try {
      const res = await (this.deps.generate ?? generateFlash)({
        apiKey: access.apiKey,
        model: TEXT_TRANSLATE_MODEL,
        apiVersion: 'v1beta',
        temperature: 0.2,
        timeoutMs: TEXT_TRANSLATE_TIMEOUT_MS,
        prompt: buildTypedSpeechPrompt({
          text: input.text,
          context: access.settings.meetingContext,
          targetLanguage: access.settings.outgoingTargetLanguage
        })
      })
      this.deps.onCost(
        flashCostUsd(res.usage, {
          input: TEXT_TRANSLATE_PRICE_USD_PER_M_INPUT,
          output: TEXT_TRANSLATE_PRICE_USD_PER_M_OUTPUT
        })
      )
      if (!res.text) return { ok: false, error: 'Model không trả về bản dịch, thử lại.' }
      return { ok: true, translation: res.text }
    } catch (err) {
      console.error('Gõ để nói: dịch thất bại:', err)
      return { ok: false, error: shortError(err) }
    }
  }

  // Giọng cho 1 câu: lấy bản đã tạo sẵn nếu khớp chữ + giọng, đang tạo dở thì chờ chung,
  // còn không thì gọi model (model tạo giọng gần bằng thời gian thực: câu 6 giây mất ~6 giây).
  private audioFor(apiKey: string, text: string, voice: string): Promise<Audio> {
    const key = `${voice}\n${text}`
    if (this.cached?.key === key) return Promise.resolve(this.cached)
    if (this.inflight?.key === key) return this.inflight.promise
    const promise = (async (): Promise<Audio> => {
      const res = await (this.deps.synthesize ?? synthesizeSpeech)({
        apiKey,
        text,
        voice,
        timeoutMs: TTS_TIMEOUT_MS
      })
      this.deps.onCost(ttsCostUsd(res.usage))
      const audio: Audio = { key, pcm: res.pcm, durationMs: res.durationMs }
      // chỉ giữ câu gần nhất (để phát ngay, và phát lại không tốn tiền)
      this.cached = audio
      return audio
    })()
    const entry = { key, promise }
    this.inflight = entry
    const clear = (): void => {
      if (this.inflight === entry) this.inflight = null
    }
    promise.then(clear, clear)
    return promise
  }

  // Tạo sẵn giọng cho bản dịch (gọi ngay sau khi dịch) để lúc bấm Phát là ra tiếng liền
  async prepare(text: unknown): Promise<TypedSpeakResult> {
    const input = this.checkText(text, 'Chưa có câu để tạo giọng.')
    if (!input.ok) return input
    const access = this.access()
    if (!access.ok) return access
    try {
      const audio = await this.audioFor(access.apiKey, input.text, access.settings.typedSpeechVoice)
      return { ok: true, durationMs: audio.durationMs }
    } catch (err) {
      console.error('Gõ để nói: tạo sẵn giọng thất bại:', err)
      return { ok: false, error: shortError(err) }
    }
  }

  // text = câu sẽ đọc (bản dịch, có thể đã được người dùng sửa); source = câu gốc đã gõ
  async speak(text: unknown, source: unknown): Promise<TypedSpeakResult> {
    const input = this.checkText(text, 'Chưa có câu để phát. Bấm Dịch trước.')
    if (!input.ok) return input
    if (this.state !== 'idle') return { ok: false, error: 'Đang phát câu trước, chờ xong hoặc bấm Dừng.' }
    const access = this.access()
    if (!access.ok) return access
    // không có thiết bị thì engine sẽ phát ra loa mặc định: người trong meeting không nghe thấy
    if (!access.settings.outgoingDeviceId) {
      return {
        ok: false,
        error: 'Chưa chọn thiết bị “Phát vào” (Cài đặt → Chiều đi). Nên chọn CABLE Input.'
      }
    }

    const gen = ++this.generation
    this.setState('synthesizing')
    let pcm: Buffer
    let durationMs: number
    try {
      const audio = await this.audioFor(access.apiKey, input.text, access.settings.typedSpeechVoice)
      pcm = audio.pcm
      durationMs = audio.durationMs
    } catch (err) {
      console.error('Gõ để nói: tạo giọng thất bại:', err)
      if (gen === this.generation) this.setState('idle')
      return { ok: false, error: shortError(err) }
    }
    // bấm Dừng trong lúc chờ model
    if (gen !== this.generation) return STOPPED

    // 'playing' trước khi route: mọi lần gửi cấu hình xen vào đều giữ player CABLE bật
    this.setState('playing')
    let sink: PlaybackSinkState
    try {
      sink = await this.deps.prepareSink()
    } catch (err) {
      sink = {
        ok: false,
        deviceId: '',
        label: '',
        isCaptured: true,
        error: err instanceof Error ? err.message : String(err)
      }
    }
    if (gen !== this.generation) return STOPPED
    if (!sink.ok) {
      // engine đã lùi về loa mặc định → KHÔNG phát, kẻo người dùng tưởng meeting đã nghe
      this.finish()
      const name = access.settings.outgoingDeviceLabel || 'đã chọn'
      return {
        ok: false,
        error: `Không phát được vào thiết bị “${name}” (${sink.error ?? 'không rõ lỗi'}). Kiểm tra Cài đặt → Chiều đi.`
      }
    }

    this.deps.play(pcm)
    this.deps.onSpoken(typeof source === 'string' ? source.trim() : '', input.text)
    this.timer = setTimeout(() => {
      if (gen === this.generation) this.finish()
    }, durationMs + TYPED_SPEECH_TAIL_MS)
    return { ok: true, durationMs }
  }

  stop(): void {
    if (this.state === 'idle') return
    this.generation++
    if (this.state === 'playing') this.deps.flush()
    this.finish()
  }

  private finish(): void {
    if (this.timer) clearTimeout(this.timer)
    this.timer = null
    const wasPlaying = this.state === 'playing'
    this.setState('idle')
    if (wasPlaying) this.deps.release()
  }
}
