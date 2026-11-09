import { FLASH_PRICE_USD_PER_M_INPUT, FLASH_PRICE_USD_PER_M_OUTPUT } from './constants'

// Ước lượng THÔ, cố ý nghiêng về cao: transcript song ngữ Nhật/Việt ≈ 1 token mỗi 2,5 ký tự;
// cộng ~600 token phần hướng dẫn và ~600 token trả lời + "thinking" (tính giá output).
const CHARS_PER_TOKEN = 2.5
const PROMPT_OVERHEAD_TOKENS = 600
const ANSWER_TOKENS = 600

// Chi phí ước tính (USD) của 1 câu hỏi về phiên đã lưu — mỗi câu hỏi gửi lại cả transcript
export function estimateHistoryAskUsd(transcriptChars: number): number {
  const input = Math.max(0, transcriptChars) / CHARS_PER_TOKEN + PROMPT_OVERHEAD_TOKENS
  return (input * FLASH_PRICE_USD_PER_M_INPUT + ANSWER_TOKENS * FLASH_PRICE_USD_PER_M_OUTPUT) / 1e6
}
