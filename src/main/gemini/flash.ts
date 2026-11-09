import { GoogleGenAI, ThinkingLevel } from '@google/genai'
import { FLASH_PRICE_USD_PER_M_INPUT, FLASH_PRICE_USD_PER_M_OUTPUT } from '../../shared/constants'
import { normalizeApiVersion, type GeminiApiVersion } from '../../shared/gemini-api'

// Gọi Gemini Flash dạng văn bản (tóm tắt, trợ lý cuộc họp), trả kèm số token để tính chi phí.

export interface FlashUsage {
  inputTokens: number
  // gồm cả token "thinking" (tính giá như output)
  outputTokens: number
}

export interface FlashResult {
  // có thể rỗng — bên gọi tự quyết định lỗi, sau khi đã ghi chi phí
  text: string
  usage: FlashUsage
}

export interface FlashRequest {
  apiKey: string
  model: string
  prompt: string
  apiVersion?: GeminiApiVersion
  temperature?: number
  // trả JSON theo schema này
  jsonSchema?: unknown
  // nghĩ ít (thinkingLevel LOW) để trả lời nhanh; model không nhận thì tự gọi lại không kèm
  fast?: boolean
  // huỷ request treo quá lâu (ms)
  timeoutMs?: number
}

interface UsageMeta {
  promptTokenCount?: number
  candidatesTokenCount?: number
  thoughtsTokenCount?: number
  toolUsePromptTokenCount?: number
}

export function usageFromMetadata(meta: UsageMeta | undefined): FlashUsage {
  return {
    inputTokens: (meta?.promptTokenCount ?? 0) + (meta?.toolUsePromptTokenCount ?? 0),
    outputTokens: (meta?.candidatesTokenCount ?? 0) + (meta?.thoughtsTokenCount ?? 0)
  }
}

// USD / 1 triệu token
export interface FlashPrices {
  input: number
  output: number
}

const FLASH_PRICES: FlashPrices = {
  input: FLASH_PRICE_USD_PER_M_INPUT,
  output: FLASH_PRICE_USD_PER_M_OUTPUT
}

export function flashCostUsd(usage: FlashUsage, prices: FlashPrices = FLASH_PRICES): number {
  return (usage.inputTokens * prices.input + usage.outputTokens * prices.output) / 1_000_000
}

// API trả 400 khi model không nhận thinkingLevel (vd. dòng 2.x) — message có nhắc "thinking"
export function isThinkingConfigError(message: string): boolean {
  return /thinking/i.test(message)
}

// model đã biết không nhận thinkingLevel → các lần sau gọi thẳng, khỏi tốn 1 request hỏng
const noThinkingLevel = new Set<string>()

export async function generateFlash(req: FlashRequest): Promise<FlashResult> {
  const ai = new GoogleGenAI({
    apiKey: req.apiKey,
    httpOptions: {
      apiVersion: normalizeApiVersion(req.apiVersion),
      ...(req.timeoutMs ? { timeout: req.timeoutMs } : {})
    }
  })
  const call = async (withThinkingLevel: boolean): Promise<FlashResult> => {
    const res = await ai.models.generateContent({
      model: req.model,
      contents: req.prompt,
      config: {
        temperature: req.temperature ?? 0.3,
        ...(req.jsonSchema !== undefined
          ? { responseMimeType: 'application/json', responseJsonSchema: req.jsonSchema }
          : {}),
        ...(withThinkingLevel ? { thinkingConfig: { thinkingLevel: ThinkingLevel.LOW } } : {})
      }
    })
    return { text: res.text?.trim() ?? '', usage: usageFromMetadata(res.usageMetadata) }
  }

  if (!req.fast || noThinkingLevel.has(req.model)) return call(false)
  try {
    return await call(true)
  } catch (err) {
    if (!isThinkingConfigError(err instanceof Error ? err.message : String(err))) throw err
    console.warn(`Model ${req.model} không nhận thinkingLevel — gọi lại không kèm`)
    noThinkingLevel.add(req.model)
    return call(false)
  }
}
