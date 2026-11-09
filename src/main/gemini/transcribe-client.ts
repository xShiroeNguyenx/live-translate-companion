import { TRANSCRIBE_LIVE_MODEL } from '../../shared/constants'
import { liveWsUrl } from '../../shared/gemini-api'
import type { GeminiConnectOptions, GeminiLiveClient, GeminiLiveSession } from './client'
import { openLiveSocket } from './raw-ws-client'

// Chế độ chỉ chữ: model chép lời Live trả chữ (interim + final), không sinh audio nên không tốn
// tiền audio ra. Bản dịch làm riêng bằng Flash (xem translate/segment-translator).
// Không có translationConfig / systemInstruction / resumption: chép lời không cần ngữ cảnh phiên,
// nối lại là mở phiên mới. Endpoint cố định v1beta — bản đã kiểm chứng (2026-11-09).
export function buildTranscribeSetup(): Record<string, unknown> {
  return {
    model: `models/${TRANSCRIBE_LIVE_MODEL}`,
    generationConfig: { responseModalities: ['TEXT'] },
    // [] = tự nhận ngôn ngữ nói
    inputAudioTranscription: { languageCodes: [] }
  }
}

export class TranscribeLiveClient implements GeminiLiveClient {
  readonly name = 'transcribe' as const

  connect(opts: GeminiConnectOptions): Promise<GeminiLiveSession> {
    return openLiveSocket({
      url: liveWsUrl('v1beta'),
      apiKey: opts.apiKey,
      setup: buildTranscribeSetup(),
      callbacks: opts.callbacks
    })
  }
}
