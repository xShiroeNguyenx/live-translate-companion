import { PRICE_USD_PER_MINUTE, TRANSCRIBE_PRICE_USD_PER_MINUTE } from '../../shared/constants'
import type { SubtitleStore } from '../subtitles/store'
import {
  SegmentTranslator,
  type TranslateRequest,
  type TranslateResult
} from '../translate/segment-translator'
import type { LiveServerEvent } from './client'

// Cách SessionManager biến sự kiện server thành phụ đề (+ âm thanh), theo chế độ dịch.
// Phần kết nối / VAD / tạm dừng / nối lại không phụ thuộc chế độ nên nằm ở SessionManager.
export interface SubtitleSink {
  // USD mỗi phút audio thực gửi lên
  readonly pricePerMinute: number
  handle(ev: LiveServerEvent): void
  // hết lượt nói (VAD đóng cổng, nhả PTT, tạm dừng) — ngay sau đó SessionManager gửi audioStreamEnd
  endTurn(): void
  // Dừng / xoay kết nối: chốt phần đang dở
  flush(): void
  // kết nối rớt bất ngờ (sẽ nối lại)
  connectionLost(): void
  // bắt đầu phiên mới
  reset(): void
  // chi phí không tỉ lệ với số giây audio (gọi Flash dịch từng câu)
  extraCostUsd(): number
}

// Giọng + chữ: model dịch Live trả transcript gốc/dịch theo từng mẩu và audio giọng dịch
export class SpeechSink implements SubtitleSink {
  readonly pricePerMinute = PRICE_USD_PER_MINUTE

  constructor(
    private store: SubtitleStore,
    private onPlaybackChunk: (pcm: Buffer) => void
  ) {}

  handle(ev: LiveServerEvent): void {
    if (ev.inputTranscription) this.store.appendSource(ev.inputTranscription)
    if (ev.outputTranscription) this.store.appendTarget(ev.outputTranscription)
    if (ev.audioBase64) this.onPlaybackChunk(Buffer.from(ev.audioBase64, 'base64'))
    if (ev.turnComplete || ev.generationComplete) this.store.finalizeOpenSegment()
  }

  endTurn(): void {
    this.store.finalizeOpenSegment()
  }

  flush(): void {
    this.store.finalizeOpenSegment()
  }

  connectionLost(): void {
    /* giữ nguyên hành vi cũ: segment đang mở chờ phần tiếp theo sau khi nối lại */
  }

  reset(): void {
    /* store.clear() do SessionManager gọi */
  }

  extraCostUsd(): number {
    return 0
  }
}

export interface TextSinkHooks {
  // có thêm chi phí dịch (kể cả sau khi đã Dừng — câu cuối dịch xong muộn)
  onCost(): void
  // lỗi dịch liên tiếp → message; dịch lại được → null
  onTranslateError(message: string | null): void
}

// Chỉ chữ: model chép lời trả câu gốc (interim → final), mỗi câu final dịch riêng bằng Flash.
// Không có audio giọng dịch.
export class TextSink implements SubtitleSink {
  readonly pricePerMinute = TRANSCRIBE_PRICE_USD_PER_MINUTE
  private cost = 0
  private readonly translator: SegmentTranslator

  constructor(
    private store: SubtitleStore,
    translate: (req: TranslateRequest) => Promise<TranslateResult>,
    hooks: TextSinkHooks
  ) {
    this.translator = new SegmentTranslator({
      translate,
      onResult: (id, text) => this.store.fillTarget(id, text),
      onCost: (usd) => {
        this.cost += usd
        hooks.onCost()
      },
      onErrorStreak: (message) => hooks.onTranslateError(message)
    })
  }

  handle(ev: LiveServerEvent): void {
    if (ev.interimInputTranscription) this.store.setInterim(ev.interimInputTranscription)
    if (ev.inputTranscription) {
      const text = ev.inputTranscription
      const id = this.store.commitSource(text)
      if (id) this.translator.enqueue(id, text)
    }
  }

  // chờ bản final của server (audioStreamEnd làm server chốt ngay), không tự chốt interim
  endTurn(): void {}

  flush(): void {
    const committed = this.store.commitInterim()
    if (committed) this.translator.enqueue(committed.id, committed.text)
  }

  // kết nối cũ không còn gửi bản final cho câu đang dở → chốt luôn phần đã nghe được
  connectionLost(): void {
    this.flush()
  }

  reset(): void {
    this.cost = 0
    this.translator.reset()
  }

  extraCostUsd(): number {
    return this.cost
  }

  pendingTranslations(): number {
    return this.translator.pending()
  }
}
