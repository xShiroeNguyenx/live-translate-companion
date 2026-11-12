import { GoogleGenAI } from '@google/genai'
import {
  OUTPUT_SAMPLE_RATE,
  TTS_AUDIO_TOKENS_PER_SECOND,
  TTS_MODEL,
  TTS_PRICE_USD_PER_M_INPUT,
  TTS_PRICE_USD_PER_M_OUTPUT
} from '../../shared/constants'
import { decodeWavToPcm16, downmixToMono, resampleLinear } from '../audio/wav'

// Đọc văn bản thành giọng bằng model TTS của Gemini (Interactions API), trả PCM đúng định dạng
// mà PcmPlayer ở engine phát: 24 kHz, mono, 16-bit little-endian.

export interface TtsRequest {
  apiKey: string
  text: string
  // tên giọng dựng sẵn, vd. 'Kore'
  voice: string
  model?: string
  timeoutMs?: number
}

export interface TtsUsage {
  inputTokens: number
  outputTokens: number
}

export interface TtsResult {
  pcm: Buffer
  durationMs: number
  usage: TtsUsage
}

// Audio model trả về → PCM 24 kHz mono 16-bit. Mặc định là WAV (có header RIFF); nếu là PCM thô
// (audio/l16) thì dùng sample rate / số kênh model báo kèm.
export function pcm24kFromAudio(
  audio: Buffer,
  meta: { mimeType?: string; sampleRate?: number; channels?: number } = {}
): Buffer {
  let samples: Int16Array
  let sampleRate: number
  let channels: number
  if (audio.length >= 12 && audio.toString('ascii', 0, 4) === 'RIFF') {
    const wav = decodeWavToPcm16(audio)
    samples = wav.samples
    sampleRate = wav.sampleRate
    channels = wav.channels
  } else if (!meta.mimeType || /l16|pcm/i.test(meta.mimeType)) {
    const even = audio.length - (audio.length % 2)
    samples = new Int16Array(audio.buffer.slice(audio.byteOffset, audio.byteOffset + even))
    sampleRate = meta.sampleRate || OUTPUT_SAMPLE_RATE
    channels = meta.channels || 1
  } else {
    throw new Error(`Model trả về audio dạng ${meta.mimeType}, app chỉ phát được WAV/PCM`)
  }
  const mono = resampleLinear(downmixToMono(samples, channels), sampleRate, OUTPUT_SAMPLE_RATE)
  return Buffer.from(mono.buffer, mono.byteOffset, mono.byteLength)
}

export function pcmDurationMs(pcm: Buffer): number {
  return Math.round((pcm.length / 2 / OUTPUT_SAMPLE_RATE) * 1000)
}

// Model không báo số token thì ước tính: chữ vào ~1 token/ký tự (CJK), audio ra 25 token/giây
export function ttsUsage(
  reported: { total_input_tokens?: number; total_output_tokens?: number } | undefined,
  text: string,
  durationMs: number
): TtsUsage {
  return {
    inputTokens: reported?.total_input_tokens || text.length,
    outputTokens:
      reported?.total_output_tokens ||
      Math.ceil((durationMs / 1000) * TTS_AUDIO_TOKENS_PER_SECOND)
  }
}

export function ttsCostUsd(usage: TtsUsage): number {
  return (
    (usage.inputTokens * TTS_PRICE_USD_PER_M_INPUT +
      usage.outputTokens * TTS_PRICE_USD_PER_M_OUTPUT) /
    1_000_000
  )
}

export async function synthesizeSpeech(req: TtsRequest): Promise<TtsResult> {
  const ai = new GoogleGenAI({
    apiKey: req.apiKey,
    httpOptions: req.timeoutMs ? { timeout: req.timeoutMs } : {}
  })
  const interaction = await ai.interactions.create({
    model: req.model ?? TTS_MODEL,
    input: req.text,
    response_format: { type: 'audio' },
    generation_config: { speech_config: [{ voice: req.voice }] }
  })
  const audio = interaction.output_audio
  if (!audio?.data) throw new Error('Model không trả về audio')
  const pcm = pcm24kFromAudio(Buffer.from(audio.data, 'base64'), {
    mimeType: audio.mime_type,
    sampleRate: audio.sample_rate,
    channels: audio.channels
  })
  if (pcm.length < 2) throw new Error('Model trả về audio rỗng')
  const durationMs = pcmDurationMs(pcm)
  return { pcm, durationMs, usage: ttsUsage(interaction.usage, req.text, durationMs) }
}
