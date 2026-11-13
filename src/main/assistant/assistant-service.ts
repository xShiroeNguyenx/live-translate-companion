import {
  ASSISTANT_MAX_QUESTION_CHARS,
  ASSISTANT_MAX_TRANSCRIPT_CHARS,
  ASSISTANT_PREVIOUS_TURNS,
  ASSISTANT_RECENT_MIN_LINES,
  ASSISTANT_RECENT_MS,
  HISTORY_ASK_MAX_TRANSCRIPT_CHARS
} from '../../shared/constants'
import { meetingTitleOf } from '../../shared/meeting-title'
import type {
  AppSettings,
  AssistantAskResult,
  AssistantReplyResult,
  HistoryRecord
} from '../../shared/types'
import { flashCostUsd, generateFlash, type FlashRequest } from '../gemini/flash'
import { transcriptLines, type TranscriptInput, type TranscriptLine } from '../summary/summarizer'
import {
  buildAskPrompt,
  buildReplyPrompt,
  historyTranscript,
  parseReplyResult,
  REPLY_JSON_SCHEMA,
  sanitizeTurns,
  shortError,
  type PastMeeting
} from './assistant'

export interface AssistantServiceDeps {
  getApiKey(): string | null
  getSettings(): AppSettings
  // transcript đang có trong bộ nhớ; null = chưa có lời nào
  getTranscript(): TranscriptInput | null
  // khác null = đã chạm giới hạn chi phí tháng → không gọi model
  budgetError(): string | null
  // chi phí ước tính (USD) của mỗi lần gọi model
  onCost(usd: number): void
  // ── hỏi về phiên đã lưu (tab Lịch sử) ──
  getRecord?(id: string): HistoryRecord | null
  // các phiên chiều đi chạy chồng thời gian với 1 phiên chiều về
  getOverlappingOutgoing?(rec: HistoryRecord): HistoryRecord[]
  generate?: typeof generateFlash
  now?: () => number
}

type Access = { ok: false; error: string } | { ok: true; apiKey: string; settings: AppSettings }

type Ready =
  | { ok: false; error: string }
  | { ok: true; apiKey: string; settings: AppSettings; lines: TranscriptLine[] }

type Question = { ok: false; error: string } | { ok: true; question: string }

// Trợ lý cuộc họp: hỏi đáp và gợi ý trả lời, dựa trên transcript của phiên chiều về hiện tại
// (đang chạy, tạm dừng, hoặc vừa dừng cho tới lần Bắt đầu sau), và hỏi đáp về 1 phiên đã lưu
// trong tab Lịch sử. Không giữ trạng thái.
export class AssistantService {
  constructor(private deps: AssistantServiceDeps) {}

  private now(): number {
    return this.deps.now?.() ?? Date.now()
  }

  private checkQuestion(question: unknown): Question {
    const q = typeof question === 'string' ? question.trim() : ''
    if (!q) return { ok: false, error: 'Nhập câu hỏi trước đã.' }
    if (q.length > ASSISTANT_MAX_QUESTION_CHARS) {
      return { ok: false, error: `Câu hỏi quá dài (tối đa ${ASSISTANT_MAX_QUESTION_CHARS} ký tự).` }
    }
    return { ok: true, question: q }
  }

  // có key + chưa chạm giới hạn chi phí tháng
  private access(): Access {
    const apiKey = this.deps.getApiKey()
    if (!apiKey) return { ok: false, error: 'Chưa cấu hình Gemini API key.' }
    const budget = this.deps.budgetError()
    if (budget) return { ok: false, error: budget }
    return { ok: true, apiKey, settings: this.deps.getSettings() }
  }

  private prepare(): Ready {
    const access = this.access()
    if (!access.ok) return access
    const transcript = this.deps.getTranscript()
    const lines = transcript ? transcriptLines(transcript, { clock: 'wall' }) : []
    if (!lines.some((l) => !l.pause)) {
      return { ok: false, error: 'Chưa có nội dung cuộc họp. Bắt đầu dịch chiều về rồi hỏi lại.' }
    }
    return { ...access, lines }
  }

  // gọi model + ghi chi phí (kể cả khi kết quả rỗng/hỏng — model vẫn tính tiền)
  private async call(
    ready: { apiKey: string; settings: AppSettings },
    prompt: string,
    extra: Pick<FlashRequest, 'jsonSchema' | 'temperature'>
  ): Promise<string> {
    const res = await (this.deps.generate ?? generateFlash)({
      apiKey: ready.apiKey,
      model: ready.settings.summaryModel,
      apiVersion: ready.settings.apiVersion,
      prompt,
      fast: true,
      ...extra
    })
    this.deps.onCost(flashCostUsd(res.usage))
    return res.text
  }

  private async answer(
    ready: { apiKey: string; settings: AppSettings; lines: TranscriptLine[] },
    question: string,
    previous: unknown,
    opts: { maxChars: number; past?: PastMeeting }
  ): Promise<AssistantAskResult> {
    const prompt = buildAskPrompt({
      lines: ready.lines,
      meetingContext: ready.settings.meetingContext,
      language: ready.settings.targetLanguage,
      now: this.now(),
      maxChars: opts.maxChars,
      question,
      previous: sanitizeTurns(previous, ASSISTANT_PREVIOUS_TURNS),
      past: opts.past
    })
    try {
      const answer = await this.call(ready, prompt, { temperature: 0.3 })
      if (!answer) return { ok: false, error: 'Model không trả lời, thử hỏi lại.' }
      return { ok: true, answer }
    } catch (err) {
      console.error('Trợ lý: hỏi đáp thất bại:', err)
      return { ok: false, error: shortError(err) }
    }
  }

  async ask(question: unknown, previous: unknown): Promise<AssistantAskResult> {
    const q = this.checkQuestion(question)
    if (!q.ok) return q
    const ready = this.prepare()
    if (!ready.ok) return ready
    return this.answer(ready, q.question, previous, { maxChars: ASSISTANT_MAX_TRANSCRIPT_CHARS })
  }

  // Hỏi về 1 phiên đã lưu: gửi cả transcript (kèm lời chiều đi cùng giờ) + bản tóm tắt nếu có
  async askHistory(id: unknown, question: unknown, previous: unknown): Promise<AssistantAskResult> {
    const q = this.checkQuestion(question)
    if (!q.ok) return q
    const rec = typeof id === 'string' ? (this.deps.getRecord?.(id) ?? null) : null
    if (!rec) return { ok: false, error: 'Không tìm thấy phiên này trong Lịch sử.' }
    const access = this.access()
    if (!access.ok) return access
    const outgoing =
      rec.direction === 'incoming' ? (this.deps.getOverlappingOutgoing?.(rec) ?? []) : []
    const lines = transcriptLines(historyTranscript(rec, outgoing), { clock: 'wall' })
    if (!lines.some((l) => !l.pause)) {
      return { ok: false, error: 'Phiên này không có lời nào để hỏi.' }
    }
    return this.answer({ ...access, lines }, q.question, previous, {
      maxChars: HISTORY_ASK_MAX_TRANSCRIPT_CHARS,
      past: {
        startedAt: rec.startedAt,
        endedAt: rec.endedAt,
        title: meetingTitleOf(rec),
        summary: rec.summary
      }
    })
  }

  async suggestReplies(): Promise<AssistantReplyResult> {
    const ready = this.prepare()
    if (!ready.ok) return ready
    const replyLanguage = ready.settings.outgoingTargetLanguage
    const prompt = buildReplyPrompt({
      lines: ready.lines,
      meetingContext: ready.settings.meetingContext,
      language: ready.settings.targetLanguage,
      replyLanguage,
      now: this.now(),
      maxChars: ASSISTANT_MAX_TRANSCRIPT_CHARS,
      recentMs: ASSISTANT_RECENT_MS,
      recentMinLines: ASSISTANT_RECENT_MIN_LINES
    })
    try {
      const raw = await this.call(ready, prompt, {
        jsonSchema: REPLY_JSON_SCHEMA,
        // cao hơn hỏi đáp để 3 gợi ý khác nhau thật
        temperature: 0.7
      })
      const parsed = parseReplyResult(raw)
      if (!parsed) {
        // chỉ ghi độ dài: nội dung là lời trong cuộc họp, không được nằm trong file log
        console.error(`Trợ lý: gợi ý trả lời không đọc được (${raw.length} ký tự)`)
        return { ok: false, error: 'Model trả về gợi ý không đọc được, thử lại.' }
      }
      return { ok: true, ...parsed, replyLanguage }
    } catch (err) {
      console.error('Trợ lý: gợi ý trả lời thất bại:', err)
      return { ok: false, error: shortError(err) }
    }
  }
}
