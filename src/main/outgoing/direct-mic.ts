import { EventEmitter } from 'node:events'
import { errorText } from '../../shared/error-text'
import type { AppSettings, DirectMicResult, PlaybackSinkState } from '../../shared/types'
import { directMicBlocker } from '../../shared/virtual-cable'

export interface DirectMicDeps {
  getSettings(): AppSettings
  // bật player CABLE + route tới "Phát vào", trả kết quả route thật
  prepareSink(): Promise<PlaybackSinkState>
  // nối / ngắt micro thật vào player CABLE (ở engine)
  startMic(deviceId: string): Promise<void>
  stopMic(): Promise<void>
  // hết nói thẳng → để main tắt player CABLE nếu không còn ai dùng
  release(): void
  // phiên dịch chiều đi đang chạy và không tạm dừng
  isTranslating(): boolean
  isTranslationPaused(): boolean
  pauseTranslation(): void
  resumeTranslation(): { ok: boolean; error?: string }
}

// "Nói thẳng": đưa giọng thật (không dịch) vào thiết bị "Phát vào", để Meet/Zoom cứ để nguyên
// micro = CABLE Output mà vẫn nghe được bạn nói trực tiếp. Không gọi API, không tốn tiền.
//
// Loại trừ với phiên dịch chiều đi: bật nói thẳng thì tạm dừng dịch (nếu không meeting nghe cả
// giọng thật lẫn giọng dịch), tắt thì dịch tiếp. Ai bật sau thì người đó thắng.
export class DirectMicController extends EventEmitter {
  private active = false
  private pausedTranslation = false
  private queue: Promise<unknown> = Promise.resolve()

  constructor(private deps: DirectMicDeps) {
    super()
  }

  isOn(): boolean {
    return this.active
  }

  // các lần bật/tắt chạy nối tiếp nhau: bấm nhanh 2 lần không để micro treo ở trạng thái lửng
  set(want: unknown): Promise<DirectMicResult> {
    const run = this.queue.then(() => (want === true ? this.turnOn() : this.turnOff()))
    this.queue = run.catch(() => undefined)
    return run
  }

  toggle(): Promise<DirectMicResult> {
    return this.set(!this.active)
  }

  // phiên dịch vừa chạy lại (user bấm Bật / Tiếp tục) trong lúc đang nói thẳng → nhường cho dịch
  onTranslationActive(): void {
    if (!this.active) return
    this.pausedTranslation = false
    void this.set(false)
  }

  // micro bị rút / Windows thu hồi giữa chừng
  onMicLost(): void {
    if (this.active) void this.set(false)
  }

  private async turnOn(): Promise<DirectMicResult> {
    if (this.active) return { ok: true, on: true }
    const settings = this.deps.getSettings()
    if (!settings.outgoingDeviceId) {
      return {
        ok: false,
        on: false,
        error: 'Chưa chọn thiết bị “Phát vào”. Chọn “CABLE Input” ở Cài đặt → Chiều đi.'
      }
    }

    // dừng dịch TRƯỚC khi mở micro thẳng, để không có khoảnh khắc nào cả hai cùng vào meeting
    const wasTranslating = this.deps.isTranslating()
    if (wasTranslating) this.deps.pauseTranslation()
    this.active = true // từ đây player CABLE được coi là đang dùng
    try {
      const blocker = directMicBlocker(await this.deps.prepareSink())
      if (blocker) throw new Error(blocker)
      await this.deps.startMic(settings.micDeviceId)
    } catch (err) {
      this.active = false
      await this.deps.stopMic().catch(() => undefined)
      this.deps.release()
      if (wasTranslating && this.deps.isTranslationPaused()) this.deps.resumeTranslation()
      return { ok: false, on: false, error: errorText(err) }
    }
    this.pausedTranslation = wasTranslating
    this.emit('state', true)
    return { ok: true, on: true }
  }

  private async turnOff(): Promise<DirectMicResult> {
    if (!this.active) return { ok: true, on: false }
    this.active = false
    await this.deps.stopMic().catch(() => undefined)
    this.deps.release()
    const resume = this.pausedTranslation
    this.pausedTranslation = false
    this.emit('state', false)
    if (resume && this.deps.isTranslationPaused()) {
      const r = this.deps.resumeTranslation()
      if (!r.ok) {
        return {
          ok: true,
          on: false,
          error: `Đã tắt nói thẳng, nhưng chiều đi chưa dịch tiếp được: ${r.error ?? 'lỗi không rõ'}`
        }
      }
    }
    return { ok: true, on: false }
  }
}
