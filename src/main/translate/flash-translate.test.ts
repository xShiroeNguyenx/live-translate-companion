import { beforeEach, describe, expect, it, vi } from 'vitest'

const { generateFlash } = vi.hoisted(() => ({ generateFlash: vi.fn() }))
vi.mock('../gemini/flash', async (orig) => ({
  ...(await orig<typeof import('../gemini/flash')>()),
  generateFlash
}))

import { TEXT_TRANSLATE_MODEL } from '../../shared/constants'
import { createFlashTranslate } from './flash-translate'

describe('createFlashTranslate', () => {
  beforeEach(() => generateFlash.mockReset())

  it('gọi Flash-lite với prompt dịch, đọc ngôn ngữ + ngữ cảnh mỗi câu, tính giá lite', async () => {
    let lang = 'vi'
    const translate = createFlashTranslate({
      getApiKey: () => 'k',
      getTargetLanguage: () => lang,
      getContext: () => 'Dự án X'
    })
    generateFlash.mockResolvedValue({
      text: 'Xin chào',
      usage: { inputTokens: 1_000_000, outputTokens: 1_000_000 }
    })
    const res = await translate({ text: 'Hello', previous: ['Before.'] })
    expect(res.text).toBe('Xin chào')
    // 0.30 + 2.50 USD cho 1 triệu token vào + 1 triệu token ra
    expect(res.costUsd).toBeCloseTo(2.8)

    const req = generateFlash.mock.calls[0][0]
    expect(req.model).toBe(TEXT_TRANSLATE_MODEL)
    expect(req.apiVersion).toBe('v1beta')
    expect(req.timeoutMs).toBeGreaterThan(0)
    expect(req.fast).toBeUndefined() // không gửi thinkingConfig
    expect(req.prompt).toContain('into Vietnamese (vi)')
    expect(req.prompt).toContain('Dự án X')
    expect(req.prompt).toContain('Before.')

    lang = 'ja'
    await translate({ text: 'Hello', previous: [] })
    expect(generateFlash.mock.calls[1][0].prompt).toContain('into Japanese (ja)')
  })

  it('chưa có API key → lỗi, không gọi API', async () => {
    const translate = createFlashTranslate({
      getApiKey: () => null,
      getTargetLanguage: () => 'vi',
      getContext: () => ''
    })
    await expect(translate({ text: 'Hi', previous: [] })).rejects.toThrow('API key')
    expect(generateFlash).not.toHaveBeenCalled()
  })
})
