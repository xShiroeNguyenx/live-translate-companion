import { beforeEach, describe, expect, it, vi } from 'vitest'

const { create, ctorOptions } = vi.hoisted(() => ({
  create: vi.fn(),
  ctorOptions: [] as unknown[]
}))
vi.mock('@google/genai', () => ({
  GoogleGenAI: class {
    interactions = { create }
    constructor(opts: unknown) {
      ctorOptions.push(opts)
    }
  }
}))

import { encodeWavPcm16Mono } from '../audio/wav'
import { pcm24kFromAudio, pcmDurationMs, synthesizeSpeech, ttsCostUsd, ttsUsage } from './tts'

// n mẫu 16-bit tăng dần
function pcm(n: number): Buffer {
  const samples = new Int16Array(n)
  for (let i = 0; i < n; i++) samples[i] = i
  return Buffer.from(samples.buffer)
}

describe('tts: audio model trả về → PCM 24 kHz mono', () => {
  it('WAV 24 kHz mono: bỏ header, giữ nguyên mẫu', () => {
    const raw = pcm(2400)
    const out = pcm24kFromAudio(encodeWavPcm16Mono(raw, 24000))
    expect(out.equals(raw)).toBe(true)
    expect(pcmDurationMs(out)).toBe(100)
  })

  it('WAV 48 kHz → resample về 24 kHz (độ dài giữ nguyên)', () => {
    const out = pcm24kFromAudio(encodeWavPcm16Mono(pcm(4800), 48000))
    expect(out.length).toBe(2400 * 2)
    expect(pcmDurationMs(out)).toBe(100)
  })

  it('PCM thô (audio/l16): dùng sample rate model báo, mặc định 24 kHz', () => {
    const raw = pcm(1600)
    expect(pcm24kFromAudio(raw, { mimeType: 'audio/l16' }).equals(raw)).toBe(true)
    const from16k = pcm24kFromAudio(raw, { mimeType: 'audio/l16;rate=16000', sampleRate: 16000 })
    expect(from16k.length).toBe(2400 * 2)
  })

  it('định dạng nén (mp3…) → báo lỗi rõ, không phát rác', () => {
    expect(() => pcm24kFromAudio(Buffer.from('ID3xxxxxxxxxxxx'), { mimeType: 'audio/mp3' })).toThrow(
      'audio/mp3'
    )
  })
})

describe('tts: token + chi phí', () => {
  it('dùng số token model báo; thiếu thì ước tính 25 token/giây audio', () => {
    expect(ttsUsage({ total_input_tokens: 12, total_output_tokens: 80 }, 'こんにちは', 2000)).toEqual({
      inputTokens: 12,
      outputTokens: 80
    })
    expect(ttsUsage(undefined, 'こんにちは', 2000)).toEqual({ inputTokens: 5, outputTokens: 50 })
  })

  it('1 phút giọng ≈ $0.027', () => {
    expect(ttsCostUsd({ inputTokens: 0, outputTokens: 25 * 60 })).toBeCloseTo(0.027)
    expect(ttsCostUsd({ inputTokens: 1_000_000, outputTokens: 0 })).toBeCloseTo(1)
  })
})

describe('synthesizeSpeech', () => {
  beforeEach(() => {
    create.mockReset()
    ctorOptions.length = 0
  })

  it('gửi chữ + giọng, trả PCM 24 kHz kèm thời lượng và token', async () => {
    const raw = pcm(24000)
    create.mockResolvedValueOnce({
      output_audio: { data: encodeWavPcm16Mono(raw, 24000).toString('base64'), mime_type: 'audio/wav' },
      usage: { total_input_tokens: 9, total_output_tokens: 25 }
    })
    const res = await synthesizeSpeech({
      apiKey: 'k',
      text: 'こんにちは',
      voice: 'Kore',
      timeoutMs: 45000
    })
    expect(res.pcm.equals(raw)).toBe(true)
    expect(res.durationMs).toBe(1000)
    expect(res.usage).toEqual({ inputTokens: 9, outputTokens: 25 })
    expect(create.mock.calls[0][0]).toMatchObject({
      model: 'gemini-3.8-flash-tts',
      input: 'こんにちは',
      response_format: { type: 'audio' },
      generation_config: { speech_config: [{ voice: 'Kore' }] }
    })
    expect(ctorOptions[0]).toMatchObject({ apiKey: 'k', httpOptions: { timeout: 45000 } })
  })

  it('không có audio / audio rỗng → ném lỗi', async () => {
    create.mockResolvedValueOnce({ output_text: 'xin lỗi' })
    await expect(synthesizeSpeech({ apiKey: 'k', text: 'a', voice: 'Kore' })).rejects.toThrow(
      'không trả về audio'
    )
    create.mockResolvedValueOnce({
      output_audio: { data: encodeWavPcm16Mono(Buffer.alloc(0), 24000).toString('base64') }
    })
    await expect(synthesizeSpeech({ apiKey: 'k', text: 'a', voice: 'Kore' })).rejects.toThrow()
  })
})
