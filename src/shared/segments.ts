import type { SubtitleSegment } from './types'

// Chế độ chỉ chữ: câu gốc đã chốt nhưng bản dịch chưa về → hiện "… đang dịch".
// (Chế độ giọng chốt câu gốc và bản dịch cùng lúc nên không bao giờ rơi vào trường hợp này.)
export function isAwaitingTranslation(seg: SubtitleSegment): boolean {
  return seg.source.final && !seg.target.final && !seg.target.text.trim()
}

export const AWAITING_TRANSLATION_LABEL = '… đang dịch'
