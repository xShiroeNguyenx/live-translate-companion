import {
  GoogleGenAI,
  Modality,
  type LiveConnectConfig,
  type LiveServerMessage,
  type Session
} from '@google/genai'
import { MODEL_ID } from '../../shared/constants'

export interface LiveServerEvent {
  inputTranscription?: string
  outputTranscription?: string
  audioBase64?: string
  turnComplete?: boolean
  generationComplete?: boolean
  resumptionHandle?: string
  goAwayTimeLeftMs?: number
}

export interface GeminiLiveCallbacks {
  onOpen(): void
  onMessage(ev: LiveServerEvent): void
  onError(err: Error): void
  onClose(ev: { code: number; reason: string }): void
}

export interface GeminiConnectOptions {
  apiKey: string
  targetLanguage: string
  resumptionHandle?: string
  // ngữ cảnh/thuật ngữ cuộc họp; model có thể từ chối → xem isSystemInstructionRejection
  systemInstruction?: string
  callbacks: GeminiLiveCallbacks
}

export interface GeminiLiveSession {
  sendAudio(pcm: ArrayBuffer): void
  sendAudioStreamEnd(): void
  close(): void
}

export interface GeminiLiveClient {
  readonly name: 'sdk' | 'raw-ws'
  connect(opts: GeminiConnectOptions): Promise<GeminiLiveSession>
}

export function buildLiveConnectConfig(
  targetLanguage: string,
  resumptionHandle?: string,
  systemInstruction?: string
): LiveConnectConfig {
  return {
    ...(systemInstruction ? { systemInstruction: { parts: [{ text: systemInstruction }] } } : {}),
    responseModalities: [Modality.AUDIO],
    inputAudioTranscription: {},
    outputAudioTranscription: {},
    contextWindowCompression: { slidingWindow: {} },
    sessionResumption: resumptionHandle ? { handle: resumptionHandle } : {},
    translationConfig: { targetLanguageCode: targetLanguage, echoTargetLanguage: false }
  }
}

export function parseDurationMs(d: unknown): number | undefined {
  if (typeof d === 'number') return d
  if (typeof d === 'string') {
    const m = /^([\d.]+)\s*s$/.exec(d.trim())
    if (m) return Math.round(parseFloat(m[1]) * 1000)
    const n = Number(d)
    if (!Number.isNaN(n)) return n
  }
  return undefined
}

interface RawServerMessage {
  serverContent?: {
    modelTurn?: { parts?: Array<{ inlineData?: { data?: string; mimeType?: string } }> }
    inputTranscription?: { text?: string }
    outputTranscription?: { text?: string }
    turnComplete?: boolean
    generationComplete?: boolean
  }
  sessionResumptionUpdate?: { newHandle?: string; resumable?: boolean }
  goAway?: { timeLeft?: string | number }
}

export function normalizeServerMessage(msg: LiveServerMessage | RawServerMessage): LiveServerEvent {
  const m = msg as RawServerMessage
  const sc = m.serverContent
  const inline = sc?.modelTurn?.parts?.find((p) => p?.inlineData?.data)?.inlineData
  const ev: LiveServerEvent = {}
  if (sc?.inputTranscription?.text) ev.inputTranscription = sc.inputTranscription.text
  if (sc?.outputTranscription?.text) ev.outputTranscription = sc.outputTranscription.text
  if (inline?.data) ev.audioBase64 = inline.data
  if (sc?.turnComplete) ev.turnComplete = true
  if (sc?.generationComplete) ev.generationComplete = true
  if (m.sessionResumptionUpdate?.resumable && m.sessionResumptionUpdate.newHandle) {
    ev.resumptionHandle = m.sessionResumptionUpdate.newHandle
  }
  if (m.goAway) ev.goAwayTimeLeftMs = parseDurationMs(m.goAway.timeLeft) ?? 0
  return ev
}

export function isTranslationConfigRejection(errOrReason: unknown): boolean {
  const msg = String(
    (errOrReason as { message?: string })?.message ?? errOrReason ?? ''
  ).toLowerCase()
  return (
    msg.includes('translation_config') ||
    msg.includes('translationconfig') ||
    (msg.includes('unknown name') && msg.includes('translation'))
  )
}

export function isSystemInstructionRejection(errOrReason: unknown): boolean {
  const msg = String(
    (errOrReason as { message?: string })?.message ?? errOrReason ?? ''
  ).toLowerCase()
  return (
    msg.includes('system_instruction') ||
    msg.includes('systeminstruction') ||
    msg.includes('system instruction')
  )
}

// Ghép ngữ cảnh user nhập thành chỉ dẫn cho phiên dịch
export function buildContextInstruction(context: string): string | undefined {
  const text = context.trim()
  if (!text) return undefined
  return (
    'Ngữ cảnh cuộc họp và bảng thuật ngữ (giữ đúng tên riêng, dịch thuật ngữ theo bảng này):\n' +
    text
  )
}

export class SdkLiveClient implements GeminiLiveClient {
  readonly name = 'sdk' as const

  async connect(opts: GeminiConnectOptions): Promise<GeminiLiveSession> {
    const ai = new GoogleGenAI({ apiKey: opts.apiKey, httpOptions: { apiVersion: 'v1beta' } })
    const session: Session = await ai.live.connect({
      model: MODEL_ID,
      config: buildLiveConnectConfig(
        opts.targetLanguage,
        opts.resumptionHandle,
        opts.systemInstruction
      ),
      callbacks: {
        onopen: () => opts.callbacks.onOpen(),
        onmessage: (m: LiveServerMessage) => opts.callbacks.onMessage(normalizeServerMessage(m)),
        onerror: (e: ErrorEvent) =>
          opts.callbacks.onError(new Error(e?.message ?? 'Lỗi Live API không xác định')),
        onclose: (e: CloseEvent) =>
          opts.callbacks.onClose({ code: e?.code ?? 0, reason: e?.reason ?? '' })
      }
    })
    return {
      sendAudio: (pcm: ArrayBuffer) =>
        session.sendRealtimeInput({
          audio: {
            data: Buffer.from(new Uint8Array(pcm)).toString('base64'),
            mimeType: 'audio/pcm;rate=16000'
          }
        }),
      sendAudioStreamEnd: () => session.sendRealtimeInput({ audioStreamEnd: true }),
      close: () => session.close()
    }
  }
}
