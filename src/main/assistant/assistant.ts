import { ASSISTANT_MAX_QUESTION_CHARS } from '../../shared/constants'
import { languageLabel } from '../../shared/languages'
import { wallClock } from '../../shared/pause'
import type { HistoryRecord, QaTurn, ReplySuggestion } from '../../shared/types'
import type { TranscriptInput, TranscriptLine } from '../summary/summarizer'

// Trợ lý cuộc họp — phần thuần: dựng prompt, cắt transcript, đọc kết quả.

// Cuộc họp ĐÃ KẾT THÚC (hỏi từ tab Lịch sử)
export interface PastMeeting {
  startedAt: number
  endedAt: number
  title?: string
  // bản tóm tắt AI đã viết (nếu có) — chỉ để định hướng, transcript vẫn là nguồn chính
  summary?: string
}

export interface AssistantPromptBase {
  lines: TranscriptLine[]
  meetingContext: string
  // ngôn ngữ của người dùng (đích chiều về) — model trả lời bằng ngôn ngữ này
  language: string
  now: number
  maxChars: number
  // có = hỏi lại về một phiên đã lưu; không có = cuộc họp đang diễn ra
  past?: PastMeeting
}

export interface AskPromptInput extends AssistantPromptBase {
  question: string
  previous: QaTurn[]
}

export interface ReplyPromptInput extends AssistantPromptBase {
  // ngôn ngữ nói vào meeting (đích chiều đi)
  replyLanguage: string
  recentMs: number
  recentMinLines: number
}

const MAX_ANSWER_CHARS = 2000
const MAX_SUGGESTIONS = 5
const MAX_SUMMARY_CHARS = 8000

function meetingDate(ms: number): string {
  const d = new Date(ms)
  const pad = (n: number): string => String(n).padStart(2, '0')
  return `${pad(d.getDate())}/${pad(d.getMonth() + 1)}/${d.getFullYear()}`
}

// "“Họp tiến độ”, ngày 29/10/2026, 15:47–16:10"
export function pastMeetingLabel(past: PastMeeting): string {
  const title = past.title?.trim()
  const when = `ngày ${meetingDate(past.startedAt)}, ${wallClock(past.startedAt)}–${wallClock(past.endedAt)}`
  return title ? `“${title}”, ${when}` : when
}

// Transcript của 1 phiên đã lưu. Phiên chiều về: kèm lời chiều đi chạy chồng thời gian ("Tôi"),
// như khi tóm tắt. Phiên chiều đi: toàn bộ là lời của "Tôi".
export function historyTranscript(
  rec: HistoryRecord,
  overlappingOutgoing: HistoryRecord[]
): TranscriptInput {
  if (rec.direction === 'incoming') return { incoming: rec, outgoing: overlappingOutgoing }
  return {
    incoming: { segments: [], startedAt: rec.startedAt, endedAt: rec.endedAt },
    outgoing: [rec]
  }
}

// Giữ phần CUỐI transcript trong giới hạn ký tự (câu hỏi thường về đoạn gần đây)
export function clampLines(
  lines: TranscriptLine[],
  maxChars: number
): { lines: TranscriptLine[]; truncated: boolean } {
  let total = 0
  let start = lines.length
  while (start > 0 && total + lines[start - 1].text.length + 1 <= maxChars) {
    total += lines[start - 1].text.length + 1
    start--
  }
  // 1 dòng dài hơn cả giới hạn vẫn phải giữ, không thì prompt rỗng
  if (start === lines.length && lines.length > 0) start = lines.length - 1
  return { lines: lines.slice(start), truncated: start > 0 }
}

// Mốc bắt đầu "đoạn gần nhất": recentMs cuối, nhưng lùi thêm để có ít nhất minLines câu có lời
// (vd. vừa tạm dừng lâu, 3 phút cuối không có ai nói)
export function recentCutoff(
  lines: TranscriptLine[],
  now: number,
  recentMs: number,
  minLines: number
): number {
  const spoken = lines.filter((l) => !l.pause)
  const byTime = now - recentMs
  if (spoken.length === 0) return byTime
  const nth = spoken[Math.max(0, spoken.length - minLines)]
  return Math.min(byTime, nth.at)
}

function header(input: AssistantPromptBase): string[] {
  const context = input.meetingContext.trim()
  const past = input.past
  return [
    past
      ? `Bạn là trợ lý riêng của người dùng. Người dùng đang hỏi lại về một cuộc họp ĐÃ KẾT THÚC: ${pastMeetingLabel(past)}.`
      : `Bạn là trợ lý riêng của người dùng trong một cuộc họp đang diễn ra.`,
    `Transcript bên dưới là song ngữ (lời gốc + bản dịch máy). "Meeting" là những người khác trong cuộc họp, "Tôi" là người dùng. Mỗi dòng bắt đầu bằng giờ [HH:MM].`,
    `Bản dịch máy có thể sai — dựa vào cả lời gốc lẫn bản dịch để hiểu đúng ý.`,
    input.lines.some((l) => l.pause)
      ? `Dòng "TẠM DỪNG DỊCH" là khoảng người dùng tắt dịch — nội dung đoạn đó bị thiếu, đừng suy đoán.`
      : '',
    past ? '' : `Bây giờ là ${wallClock(input.now)}.`,
    !context
      ? ''
      : past
        ? `\nNgữ cảnh / thuật ngữ hiện có trong Cài đặt (có thể được soạn cho cuộc họp khác — chỉ dùng để hiểu tên riêng, thuật ngữ):\n${context}`
        : `\nNgữ cảnh / thuật ngữ do người dùng cung cấp:\n${context}`
  ]
}

function transcriptBlock(title: string, lines: TranscriptLine[], truncated: boolean): string {
  const note = truncated && lines.length > 0
    ? `(transcript dài nên chỉ giữ phần từ ${wallClock(lines[0].at)} trở đi)\n`
    : ''
  return `\n--- ${title} ---\n${note}${lines.map((l) => l.text).join('\n') || '(trống)'}`
}

export function buildAskPrompt(input: AskPromptInput): string {
  const lang = languageLabel(input.language)
  const { lines, truncated } = clampLines(input.lines, input.maxChars)
  const previous = input.previous.length
    ? `\n--- CÁC CÂU HỎI TRƯỚC (để hiểu câu hỏi nối tiếp) ---\n${input.previous
        .map((t) => `Hỏi: ${t.question}\nĐáp: ${t.answer}`)
        .join('\n\n')}`
    : ''
  const summary = input.past?.summary?.trim().slice(0, MAX_SUMMARY_CHARS)
  return [
    ...header(input),
    `\nTrả lời câu hỏi của người dùng bằng ${lang}:`,
    input.past
      ? `- Đi thẳng vào ý. Câu hỏi cần liệt kê (việc cần làm, các con số, ai nói gì…) thì dùng gạch đầu dòng "- ", đủ ý nhưng không lan man.`
      : `- Ngắn gọn, đi thẳng vào ý: tối đa khoảng 5 câu, hoặc gạch đầu dòng "- ".`,
    `- Chỉ dựa vào transcript và ngữ cảnh. Khi nêu một ý cụ thể, ghi kèm giờ dạng (lúc 14:32).`,
    `- Nếu transcript không có thông tin đó, nói rõ là không thấy trong transcript. Không bịa.`,
    `- Viết văn bản thuần: không dùng tiêu đề, in đậm hay bảng Markdown.`,
    previous,
    summary
      ? `\n--- BẢN TÓM TẮT AI ĐÃ VIẾT TRƯỚC ĐÓ (chỉ để định hướng; có thể thiếu hoặc sai — luôn đối chiếu với transcript) ---\n${summary}`
      : '',
    transcriptBlock('TRANSCRIPT', lines, truncated),
    `\n--- CÂU HỎI ---\n${input.question}`
  ]
    .filter(Boolean)
    .join('\n')
}

// Schema JSON cho gợi ý trả lời (responseJsonSchema)
export const REPLY_JSON_SCHEMA = {
  type: 'object',
  properties: {
    asked: { type: 'string' },
    suggestions: {
      type: 'array',
      items: {
        type: 'object',
        properties: {
          text: { type: 'string' },
          translation: { type: 'string' }
        },
        required: ['text', 'translation']
      }
    }
  },
  required: ['asked', 'suggestions']
}

export function buildReplyPrompt(input: ReplyPromptInput): string {
  const lang = languageLabel(input.language)
  const bilingual = input.replyLanguage !== input.language
  const replyLang = languageLabel(input.replyLanguage)
  const cutoff = recentCutoff(input.lines, input.now, input.recentMs, input.recentMinLines)
  const recent = input.lines.filter((l) => l.at >= cutoff)
  const older = clampLines(
    input.lines.filter((l) => l.at < cutoff),
    Math.max(0, input.maxChars - recent.reduce((n, l) => n + l.text.length + 1, 0))
  )
  const politeness =
    input.replyLanguage === 'ja' ? ' (tiếng Nhật dùng thể です/ます, đúng phép lịch sự công sở)' : ''
  return [
    ...header(input),
    `\nNgười dùng cần phản hồi NGAY điều vừa được nói hoặc hỏi trong "ĐOẠN GẦN NHẤT". Trả về JSON:`,
    `- "asked": 1 câu ngắn bằng ${lang} nêu điều người khác vừa hỏi, đề nghị hoặc đang chờ người dùng phản hồi. Nếu không có câu hỏi rõ ràng, nêu ý chính vừa được nói.`,
    `- "suggestions": 3 câu trả lời khác hướng nhau (ví dụ: đồng ý / cần thêm thông tin hoặc thời gian / hỏi lại cho rõ). Mỗi câu 1–2 câu ngắn, dễ nói thành lời.`,
    `  - "text": câu trả lời bằng ${lang}.`,
    bilingual
      ? `  - "translation": cùng ý đó bằng ${replyLang}, giọng lịch sự phù hợp họp công việc${politeness}.`
      : `  - "translation": để chuỗi rỗng.`,
    `Chỉ dựa vào transcript và ngữ cảnh. Không tự đưa ra số liệu, ngày tháng hay cam kết mà transcript không có — dùng chỗ trống như [ngày] để người dùng tự điền.`,
    older.lines.length ? transcriptBlock('BỐI CẢNH TRƯỚC ĐÓ', older.lines, older.truncated) : '',
    transcriptBlock('ĐOẠN GẦN NHẤT', recent, false)
  ]
    .filter(Boolean)
    .join('\n')
}

// Model đôi khi bọc JSON trong ```json … ``` dù đã đặt responseMimeType
export function parseReplyResult(
  raw: string
): { asked: string; suggestions: ReplySuggestion[] } | null {
  const cleaned = raw
    .trim()
    .replace(/^```(?:json)?\s*/i, '')
    .replace(/\s*```$/, '')
  let data: unknown
  try {
    data = JSON.parse(cleaned)
  } catch {
    return null
  }
  if (!data || typeof data !== 'object') return null
  const obj = data as { asked?: unknown; suggestions?: unknown }
  const list = Array.isArray(obj.suggestions) ? obj.suggestions : []
  const suggestions = list
    .flatMap((s): ReplySuggestion[] => {
      if (!s || typeof s !== 'object') return []
      const item = s as { text?: unknown; translation?: unknown }
      const text = typeof item.text === 'string' ? item.text.trim() : ''
      const translation = typeof item.translation === 'string' ? item.translation.trim() : ''
      return text || translation ? [{ text, translation }] : []
    })
    .slice(0, MAX_SUGGESTIONS)
  if (suggestions.length === 0) return null
  return { asked: typeof obj.asked === 'string' ? obj.asked.trim() : '', suggestions }
}

// Lượt hỏi đáp trước gửi từ renderer — kiểm kiểu + cắt độ dài trước khi đưa vào prompt
export function sanitizeTurns(raw: unknown, max: number): QaTurn[] {
  if (!Array.isArray(raw)) return []
  return raw
    .filter(
      (t): t is QaTurn =>
        !!t &&
        typeof (t as QaTurn).question === 'string' &&
        typeof (t as QaTurn).answer === 'string'
    )
    .slice(-max)
    .map((t) => ({
      question: t.question.slice(0, ASSISTANT_MAX_QUESTION_CHARS),
      answer: t.answer.slice(0, MAX_ANSWER_CHARS)
    }))
}

// Lỗi Gemini thường là cả khối JSON {"error":{"message":…}} → lấy message (hoặc dòng đầu),
// tối đa 200 ký tự
export function shortError(err: unknown): string {
  const raw = err instanceof Error ? err.message : String(err)
  const fromJson = raw.match(/"message"\s*:\s*"((?:[^"\\]|\\.)*)"/)?.[1]?.replace(/\\[nrt]/g, ' ')
  const first = (fromJson ?? raw.split('\n').find((l) => l.trim()) ?? '').trim()
  if (!first) return 'Lỗi không rõ'
  return first.length > 200 ? `${first.slice(0, 200)}…` : first
}
