import {
  ASSISTANT_MAX_QUESTION_CHARS,
  ASSISTANT_MAX_TRANSCRIPT_CHARS,
  ASSISTANT_PREVIOUS_TURNS,
  ASSISTANT_RECENT_MIN_LINES,
  ASSISTANT_RECENT_MS
} from '../../shared/constants'
import type {
  AppSettings,
  AssistantAskResult,
  AssistantReplyResult
} from '../../shared/types'
import { flashCostUsd, generateFlash, type FlashRequest } from '../gemini/flash'
import { transcriptLines, type TranscriptInput, type TranscriptLine } from '../summary/summarizer'
import {
  buildAskPrompt,
  buildReplyPrompt,
  parseReplyResult,
  REPLY_JSON_SCHEMA,
  sanitizeTurns,
  shortError
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
  generate?: typeof generateFlash
  now?: () => number
}

type Ready =
  | { ok: false; error: string }
  | { ok: true; apiKey: string; settings: AppSettings; lines: TranscriptLine[] }

// Trợ lý cuộc họp: hỏi đáp và gợi ý trả lời, dựa trên transcript của phiên chiều về hiện tại
// (đang chạy, tạm dừng, hoặc vừa dừng cho tới lần Bắt đầu sau). Không giữ trạng thái.
export class AssistantService {
  constructor(private deps: AssistantServiceDeps) {}

  private now(): number {
    return this.deps.now?.() ?? Date.now()
  }

  private prepare(): Ready {
    const apiKey = this.deps.getApiKey()
    if (!apiKey) return { ok: false, error: 'Chưa cấu hình Gemini API key.' }
    const budget = this.deps.budgetError()
    if (budget) return { ok: false, error: budget }
    const transcript = this.deps.getTranscript()
    const lines = transcript ? transcriptLines(transcript, { clock: 'wall' }) : []
    if (!lines.some((l) => !l.pause)) {
      return { ok: false, error: 'Chưa có nội dung cuộc họp. Bắt đầu dịch chiều về rồi hỏi lại.' }
    }
    return { ok: true, apiKey, settings: this.deps.getSettings(), lines }
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

  async ask(question: unknown, previous: unknown): Promise<AssistantAskResult> {
    const q = typeof question === 'string' ? question.trim() : ''
    if (!q) return { ok: false, error: 'Nhập câu hỏi trước đã.' }
    if (q.length > ASSISTANT_MAX_QUESTION_CHARS) {
      return { ok: false, error: `Câu hỏi quá dài (tối đa ${ASSISTANT_MAX_QUESTION_CHARS} ký tự).` }
    }
    const ready = this.prepare()
    if (!ready.ok) return ready
    const prompt = buildAskPrompt({
      lines: ready.lines,
      meetingContext: ready.settings.meetingContext,
      language: ready.settings.targetLanguage,
      now: this.now(),
      maxChars: ASSISTANT_MAX_TRANSCRIPT_CHARS,
      question: q,
      previous: sanitizeTurns(previous, ASSISTANT_PREVIOUS_TURNS)
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
        console.error('Trợ lý: gợi ý trả lời không đọc được:', raw.slice(0, 500))
        return { ok: false, error: 'Model trả về gợi ý không đọc được, thử lại.' }
      }
      return { ok: true, ...parsed, replyLanguage }
    } catch (err) {
      console.error('Trợ lý: gợi ý trả lời thất bại:', err)
      return { ok: false, error: shortError(err) }
    }
  }
}
