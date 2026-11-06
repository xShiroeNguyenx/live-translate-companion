import { beforeEach, describe, expect, it, vi } from 'vitest'

const { generateContent } = vi.hoisted(() => ({ generateContent: vi.fn() }))
vi.mock('@google/genai', () => ({
  GoogleGenAI: class {
    models = { generateContent }
  },
  ThinkingLevel: { LOW: 'LOW' }
}))

import { flashCostUsd, generateFlash, isThinkingConfigError, usageFromMetadata } from './flash'

const ok = (text: string) => ({
  text,
  usageMetadata: { promptTokenCount: 100, candidatesTokenCount: 20, thoughtsTokenCount: 5 }
})

describe('flash: token + chi phí', () => {
  it('output gồm cả thinking; thiếu metadata → 0', () => {
    expect(
      usageFromMetadata({
        promptTokenCount: 100,
        toolUsePromptTokenCount: 10,
        candidatesTokenCount: 20,
        thoughtsTokenCount: 5
      })
    ).toEqual({ inputTokens: 110, outputTokens: 25 })
    expect(usageFromMetadata(undefined)).toEqual({ inputTokens: 0, outputTokens: 0 })
  })

  it('tính theo giá / 1 triệu token', () => {
    expect(flashCostUsd({ inputTokens: 1_000_000, outputTokens: 0 })).toBeCloseTo(1.5)
    expect(flashCostUsd({ inputTokens: 0, outputTokens: 1_000_000 })).toBeCloseTo(7.5)
    expect(flashCostUsd({ inputTokens: 0, outputTokens: 0 })).toBe(0)
  })

  it('nhận diện lỗi do thinkingLevel', () => {
    expect(isThinkingConfigError('Thinking level is not supported for this model.')).toBe(true)
    expect(isThinkingConfigError('{"error":{"message":"thinking_level not supported"}}')).toBe(true)
    expect(isThinkingConfigError('Quota exceeded')).toBe(false)
  })
})

describe('generateFlash', () => {
  beforeEach(() => generateContent.mockReset())

  it('fast: gửi thinkingLevel LOW; JSON schema → responseMimeType', async () => {
    generateContent.mockResolvedValueOnce(ok(' {"a":1} '))
    const res = await generateFlash({
      apiKey: 'k',
      model: 'm-fast',
      prompt: 'p',
      fast: true,
      jsonSchema: { type: 'object' }
    })
    expect(res).toEqual({ text: '{"a":1}', usage: { inputTokens: 100, outputTokens: 25 } })
    const config = generateContent.mock.calls[0][0].config
    expect(config.thinkingConfig).toEqual({ thinkingLevel: 'LOW' })
    expect(config.responseMimeType).toBe('application/json')
    expect(config.responseJsonSchema).toEqual({ type: 'object' })
  })

  it('model không nhận thinkingLevel → gọi lại không kèm, lần sau gọi thẳng', async () => {
    generateContent
      .mockRejectedValueOnce(new Error('Thinking level is not supported for this model.'))
      .mockResolvedValueOnce(ok('xin chào'))
      .mockResolvedValueOnce(ok('lần 2'))
    const req = { apiKey: 'k', model: 'm-old', prompt: 'p', fast: true }
    expect((await generateFlash(req)).text).toBe('xin chào')
    expect(generateContent).toHaveBeenCalledTimes(2)
    expect(generateContent.mock.calls[1][0].config.thinkingConfig).toBeUndefined()

    expect((await generateFlash(req)).text).toBe('lần 2')
    expect(generateContent).toHaveBeenCalledTimes(3)
    expect(generateContent.mock.calls[2][0].config.thinkingConfig).toBeUndefined()
  })

  it('lỗi khác (quota…) → ném ra, không gọi lại', async () => {
    generateContent.mockRejectedValueOnce(new Error('Quota exceeded'))
    await expect(
      generateFlash({ apiKey: 'k', model: 'm-quota', prompt: 'p', fast: true })
    ).rejects.toThrow('Quota exceeded')
    expect(generateContent).toHaveBeenCalledTimes(1)
  })

  it('không fast → không gửi thinkingConfig; không có text → chuỗi rỗng', async () => {
    generateContent.mockResolvedValueOnce({ usageMetadata: { promptTokenCount: 7 } })
    const res = await generateFlash({ apiKey: 'k', model: 'm-plain', prompt: 'p' })
    expect(res).toEqual({ text: '', usage: { inputTokens: 7, outputTokens: 0 } })
    expect(generateContent.mock.calls[0][0].config.thinkingConfig).toBeUndefined()
    expect(generateContent.mock.calls[0][0].config.temperature).toBe(0.3)
  })
})
