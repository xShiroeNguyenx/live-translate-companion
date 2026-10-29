import { GoogleGenAI } from '@google/genai'
import { normalizeApiVersion, type GeminiApiVersion } from '../../shared/gemini-api'
import { languageLabel } from '../../shared/languages'
import type { HistoryRecord, SubtitleSegment } from '../../shared/types'

export interface SummaryInput {
  // phiên chiều về cần tóm tắt
  incoming: HistoryRecord
  // các phiên chiều đi chạy chồng thời gian — lời của "Tôi"
  outgoing: HistoryRecord[]
  meetingContext: string
  language: string
}

interface Line {
  at: number
  speaker: 'Meeting' | 'Tôi'
  seg: SubtitleSegment
}

function clock(ms: number): string {
  const s = Math.max(0, Math.floor(ms / 1000))
  const pad = (n: number): string => String(n).padStart(2, '0')
  return `${pad(Math.floor(s / 3600))}:${pad(Math.floor((s % 3600) / 60))}:${pad(s % 60)}`
}

// Trộn 2 chiều theo thời gian; chỉ lấy lời chiều đi nằm trong khoảng của phiên chiều về
export function mergeTranscript(input: SummaryInput): string {
  const { incoming } = input
  const lines: Line[] = incoming.segments.map((seg) => ({
    at: seg.startedAt,
    speaker: 'Meeting',
    seg
  }))
  for (const rec of input.outgoing) {
    for (const seg of rec.segments) {
      if (seg.startedAt >= incoming.startedAt && seg.startedAt <= incoming.endedAt) {
        lines.push({ at: seg.startedAt, speaker: 'Tôi', seg })
      }
    }
  }
  lines.sort((a, b) => a.at - b.at)
  return lines
    .filter((l) => l.seg.source.text.trim() || l.seg.target.text.trim())
    .map((l) => {
      const src = l.seg.source.text.trim()
      const tgt = l.seg.target.text.trim()
      const text = src && tgt ? `${src} (dịch: ${tgt})` : src || tgt
      return `[${clock(l.at - incoming.startedAt)}] ${l.speaker}: ${text}`
    })
    .join('\n')
}

export function buildSummaryPrompt(input: SummaryInput): string {
  const lang = languageLabel(input.language)
  const context = input.meetingContext.trim()
  return [
    `Bạn là thư ký cuộc họp. Dưới đây là transcript song ngữ (lời gốc + bản dịch máy) của một cuộc họp.`,
    `"Meeting" là những người khác trong cuộc họp, "Tôi" là người dùng app.`,
    `Bản dịch máy có thể sai — hãy dựa vào cả lời gốc lẫn bản dịch để hiểu đúng ý.`,
    context ? `\nNgữ cảnh / thuật ngữ do người dùng cung cấp:\n${context}` : '',
    `\nHãy viết bằng ${lang}, định dạng Markdown, đúng các mục sau (bỏ mục nào không có nội dung):`,
    `## Tóm tắt\n3–6 gạch đầu dòng nội dung chính.`,
    `## Quyết định\nCác điều đã thống nhất.`,
    `## Việc cần làm\nDạng "- [ ] Ai — việc gì — hạn (nếu có)".`,
    `## Câu hỏi còn mở\nNhững điểm chưa rõ hoặc cần hỏi lại.`,
    `Không bịa thông tin không có trong transcript.`,
    `\n--- TRANSCRIPT ---\n${mergeTranscript(input)}`
  ]
    .filter(Boolean)
    .join('\n')
}

export async function generateSummary(
  apiKey: string,
  model: string,
  prompt: string,
  apiVersion?: GeminiApiVersion
): Promise<string> {
  const ai = new GoogleGenAI({
    apiKey,
    httpOptions: { apiVersion: normalizeApiVersion(apiVersion) }
  })
  const res = await ai.models.generateContent({
    model,
    contents: prompt,
    config: { temperature: 0.3 }
  })
  const text = res.text?.trim()
  if (!text) throw new Error('Model không trả về nội dung tóm tắt')
  return text
}
