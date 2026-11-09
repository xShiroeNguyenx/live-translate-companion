import {
  TEXT_TRANSLATE_MODEL,
  TEXT_TRANSLATE_PRICE_USD_PER_M_INPUT,
  TEXT_TRANSLATE_PRICE_USD_PER_M_OUTPUT,
  TEXT_TRANSLATE_TIMEOUT_MS
} from '../../shared/constants'
import { flashCostUsd, generateFlash } from '../gemini/flash'
import type { TranslateRequest, TranslateResult } from './segment-translator'
import { buildTranslatePrompt } from './translate-prompt'

export interface FlashTranslateDeps {
  getApiKey(): string | null
  // đọc mỗi câu: đổi ngữ cảnh giữa phiên có hiệu lực ngay từ câu sau
  getTargetLanguage(): string
  getContext(): string
}

// Dịch 1 câu bằng Flash-lite. Không gửi thinkingConfig: Flash-lite mặc định không "suy nghĩ"
// (đo 2026-11-09: 0 token thinking, ~0.7s/câu). Endpoint v1beta — bản đã kiểm chứng.
export function createFlashTranslate(
  deps: FlashTranslateDeps
): (req: TranslateRequest) => Promise<TranslateResult> {
  return async (req) => {
    const apiKey = deps.getApiKey()
    if (!apiKey) throw new Error('Chưa cấu hình Gemini API key')
    const res = await generateFlash({
      apiKey,
      model: TEXT_TRANSLATE_MODEL,
      apiVersion: 'v1beta',
      temperature: 0.2,
      timeoutMs: TEXT_TRANSLATE_TIMEOUT_MS,
      prompt: buildTranslatePrompt({
        text: req.text,
        previous: req.previous,
        context: deps.getContext(),
        targetLanguage: deps.getTargetLanguage()
      })
    })
    return {
      text: res.text,
      costUsd: flashCostUsd(res.usage, {
        input: TEXT_TRANSLATE_PRICE_USD_PER_M_INPUT,
        output: TEXT_TRANSLATE_PRICE_USD_PER_M_OUTPUT
      })
    }
  }
}
