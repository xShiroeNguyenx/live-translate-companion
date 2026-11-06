import { generateFlash, type FlashResult } from '../gemini/flash'
import type { GeminiApiVersion } from '../../shared/gemini-api'
import { languageLabel } from '../../shared/languages'
import { normalizeTitle } from '../../shared/meeting-title'
import { formatPauseDuration, isPauseMarker, wallClock } from '../../shared/pause'
import type { HistoryRecord, SubtitleSegment } from '../../shared/types'

// Transcript 2 chiều: phiên chiều về + lời chiều đi ("Tôi") chạy chồng thời gian.
// HistoryRecord thoả kiểu này; trợ lý cuộc họp dựng nó từ store đang chạy.
export interface TranscriptInput {
  incoming: { segments: SubtitleSegment[]; startedAt: number; endedAt: number }
  outgoing: { segments: SubtitleSegment[] }[]
}

export interface SummaryInput extends TranscriptInput {
  // phiên chiều về cần tóm tắt
  incoming: HistoryRecord
  // các phiên chiều đi chạy chồng thời gian — lời của "Tôi"
  outgoing: HistoryRecord[]
  meetingContext: string
  language: string
}

export interface TranscriptLine {
  at: number
  // dòng đã định dạng, có giờ ở đầu
  text: string
  pause: boolean
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

// Trộn 2 chiều theo thời gian; chỉ lấy lời chiều đi nằm trong khoảng của phiên chiều về.
// clock 'relative' = tính từ đầu phiên (00:12:30), 'wall' = giờ máy (14:32)
export function transcriptLines(
  input: TranscriptInput,
  opts: { clock?: 'relative' | 'wall' } = {}
): TranscriptLine[] {
  const { incoming } = input
  const stamp = (at: number): string =>
    opts.clock === 'wall' ? wallClock(at) : clock(at - incoming.startedAt)
  const lines: Line[] = incoming.segments.map((seg) => ({
    at: seg.startedAt,
    speaker: 'Meeting',
    seg
  }))
  for (const rec of input.outgoing) {
    for (const seg of rec.segments) {
      // mốc tạm dừng của chiều đi không nói lên gì về nội dung cuộc họp → bỏ
      if (isPauseMarker(seg)) continue
      if (seg.startedAt >= incoming.startedAt && seg.startedAt <= incoming.endedAt) {
        lines.push({ at: seg.startedAt, speaker: 'Tôi', seg })
      }
    }
  }
  lines.sort((a, b) => a.at - b.at)
  return lines
    .filter((l) => isPauseMarker(l.seg) || l.seg.source.text.trim() || l.seg.target.text.trim())
    .map((l) => {
      if (isPauseMarker(l.seg)) {
        const duration = formatPauseDuration(l.seg.pauseEndedAt - l.seg.startedAt)
        return {
          at: l.at,
          pause: true,
          text: `[${stamp(l.at)}] (TẠM DỪNG DỊCH ${duration} — đoạn này không có transcript)`
        }
      }
      const src = l.seg.source.text.trim()
      const tgt = l.seg.target.text.trim()
      const text = src && tgt ? `${src} (dịch: ${tgt})` : src || tgt
      return { at: l.at, pause: false, text: `[${stamp(l.at)}] ${l.speaker}: ${text}` }
    })
}

export function mergeTranscript(input: TranscriptInput): string {
  return transcriptLines(input)
    .map((l) => l.text)
    .join('\n')
}

export function buildSummaryPrompt(input: SummaryInput): string {
  const lang = languageLabel(input.language)
  const context = input.meetingContext.trim()
  const title = normalizeTitle(input.incoming.title)
  return [
    `Bạn là thư ký cuộc họp. Dưới đây là transcript song ngữ (lời gốc + bản dịch máy) của một cuộc họp.`,
    `"Meeting" là những người khác trong cuộc họp, "Tôi" là người dùng app.`,
    `Bản dịch máy có thể sai — hãy dựa vào cả lời gốc lẫn bản dịch để hiểu đúng ý.`,
    input.incoming.segments.some(isPauseMarker)
      ? `Dòng "TẠM DỪNG DỊCH" là khoảng người dùng tắt dịch — nội dung đoạn đó bị thiếu, đừng suy đoán.`
      : '',
    context ? `\nNgữ cảnh / thuật ngữ do người dùng cung cấp:\n${context}` : '',
    `\nHãy viết bằng ${lang}, định dạng Markdown.`,
    // dòng "# …" được tách làm tên cuộc họp (splitSummaryTitle) khi người dùng chưa đặt tên
    title
      ? `Dòng đầu tiên: "# ${title}" (tên cuộc họp do người dùng đặt, giữ nguyên).`
      : `Dòng đầu tiên: "# " + tên ngắn cho cuộc họp, 4–10 từ, nêu chủ đề chính (không ghi ngày giờ).`,
    `Sau đó là đúng các mục sau (bỏ mục nào không có nội dung):`,
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

// text có thể rỗng — SummaryService ghi chi phí trước rồi mới báo lỗi
export function generateSummary(
  apiKey: string,
  model: string,
  prompt: string,
  apiVersion?: GeminiApiVersion
): Promise<FlashResult> {
  return generateFlash({ apiKey, model, prompt, apiVersion, temperature: 0.3 })
}
