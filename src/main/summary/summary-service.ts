import { EventEmitter } from 'node:events'
import { mkdirSync, writeFileSync } from 'node:fs'
import { dirname, join } from 'node:path'
import type { AppSettings, HistoryRecord, SummaryStatus } from '../../shared/types'
import type { HistoryStore } from '../history/history-store'
import { buildSummaryPrompt, generateSummary } from './summarizer'

export interface SummaryServiceDeps {
  history: HistoryStore
  getApiKey(): string | null
  getSettings(): AppSettings
  // thư mục ghi file tóm tắt khi phiên không có file transcript
  fallbackDir(): string
  generate?: typeof generateSummary
}

// Tóm tắt 1 phiên chiều về (kèm lời chiều đi chồng thời gian) → lưu vào lịch sử + file .md
export class SummaryService extends EventEmitter {
  private running = new Set<string>()

  constructor(private deps: SummaryServiceDeps) {
    super()
  }

  isRunning(id: string): boolean {
    return this.running.has(id)
  }

  private overlappingOutgoing(rec: HistoryRecord): HistoryRecord[] {
    return this.deps.history
      .all()
      .filter(
        (r) => r.direction === 'outgoing' && r.startedAt <= rec.endedAt && r.endedAt >= rec.startedAt
      )
  }

  async summarize(id: string): Promise<{ ok: boolean; error?: string }> {
    if (this.running.has(id)) return { ok: false, error: 'Đang tóm tắt phiên này' }
    const rec = this.deps.history.get(id)
    if (!rec) return { ok: false, error: 'Không tìm thấy phiên' }
    const apiKey = this.deps.getApiKey()
    if (!apiKey) return { ok: false, error: 'Chưa cấu hình Gemini API key' }

    const s = this.deps.getSettings()
    const prompt = buildSummaryPrompt({
      incoming: rec,
      // tóm tắt phiên chiều đi thì chỉ dùng chính nó
      outgoing: rec.direction === 'incoming' ? this.overlappingOutgoing(rec) : [],
      meetingContext: s.meetingContext,
      language: s.targetLanguage
    })

    this.running.add(id)
    this.emitStatus({ id, state: 'running' })
    try {
      const summary = await (this.deps.generate ?? generateSummary)(
        apiKey,
        s.summaryModel,
        prompt,
        s.apiVersion
      )
      const base = rec.transcriptFile
        ? rec.transcriptFile.replace(/\.[^./\\]+$/, '')
        : join(this.deps.fallbackDir(), id)
      const summaryFile = `${base}_tom-tat.md`
      mkdirSync(dirname(summaryFile), { recursive: true })
      writeFileSync(summaryFile, summary + '\n', 'utf-8')
      this.deps.history.upsert({ id, summary, summaryFile })
      this.emitStatus({ id, state: 'done' })
      return { ok: true }
    } catch (err) {
      const error = err instanceof Error ? err.message : String(err)
      console.error('Tóm tắt thất bại:', error)
      this.emitStatus({ id, state: 'error', error })
      return { ok: false, error }
    } finally {
      this.running.delete(id)
    }
  }

  private emitStatus(status: SummaryStatus): void {
    this.emit('status', status)
  }
}
