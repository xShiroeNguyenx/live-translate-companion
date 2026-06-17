import { describe, expect, it } from 'vitest'
import { decodeWavToPcm16, downmixToMono, encodeWavPcm16Mono, resampleLinear } from './wav'

describe('wav', () => {
  it('encode rồi decode giữ nguyên PCM (roundtrip)', () => {
    const samples = new Int16Array([0, 1000, -1000, 32767, -32768, 42])
    const pcm = new Uint8Array(samples.buffer)
    const wav = encodeWavPcm16Mono(pcm, 16000)
    const decoded = decodeWavToPcm16(wav)
    expect(decoded.sampleRate).toBe(16000)
    expect(decoded.channels).toBe(1)
    expect(Array.from(decoded.samples)).toEqual(Array.from(samples))
  })

  it('header WAV đúng cấu trúc RIFF/WAVE', () => {
    const wav = encodeWavPcm16Mono(new Uint8Array(3200), 16000)
    expect(wav.toString('ascii', 0, 4)).toBe('RIFF')
    expect(wav.toString('ascii', 8, 12)).toBe('WAVE')
    expect(wav.readUInt32LE(24)).toBe(16000)
    expect(wav.readUInt32LE(40)).toBe(3200)
    expect(wav.length).toBe(44 + 3200)
  })

  it('decode từ chối file không phải WAV', () => {
    expect(() => decodeWavToPcm16(Buffer.from('không phải wav đâu nhé!'))).toThrow()
  })

  it('downmix stereo lấy trung bình 2 kênh', () => {
    const stereo = new Int16Array([100, 200, -100, 100, 0, 0])
    const mono = downmixToMono(stereo, 2)
    expect(Array.from(mono)).toEqual([150, 0, 0])
  })

  it('resample 48k → 16k giảm số mẫu còn 1/3', () => {
    const input = new Int16Array(4800)
    input.fill(1000)
    const output = resampleLinear(input, 48000, 16000)
    expect(output.length).toBe(1600)
    expect(output[800]).toBe(1000)
  })

  it('resample cùng rate trả nguyên mảng', () => {
    const input = new Int16Array([1, 2, 3])
    expect(resampleLinear(input, 16000, 16000)).toBe(input)
  })
})
