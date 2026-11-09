import {
  TEXT_TRANSLATE_CONCURRENCY,
  TEXT_TRANSLATE_CONTEXT_SEGMENTS,
  TEXT_TRANSLATE_ERROR_STREAK,
  TEXT_TRANSLATE_FAILED_MARK
} from '../../shared/constants'

export interface TranslateRequest {
  text: string
  // câu gốc ngay trước (cũ → mới), chỉ làm ngữ cảnh
  previous: string[]
}

export interface TranslateResult {
  text: string
  // chi phí thật của lần gọi (kể cả khi bản dịch rỗng)
  costUsd: number
}

export interface SegmentTranslatorDeps {
  translate(req: TranslateRequest): Promise<TranslateResult>
  // điền bản dịch (hoặc dấu báo lỗi) vào đúng câu
  onResult(id: string, text: string): void
  onCost(usd: number): void
  // lỗi liên tiếp chạm ngưỡng → message; dịch lại được → null
  onErrorStreak?(message: string | null): void
  concurrency?: number
  contextSegments?: number
  errorStreak?: number
  retryDelayMs?: number
}

interface Job {
  id: string
  text: string
  previous: string[]
  generation: number
}

// Dịch từng câu của chế độ chỉ chữ: chạy song song có giới hạn, kết quả về lệch thứ tự vẫn điền
// đúng câu theo id. Lỗi thì thử lại 1 lần, vẫn lỗi thì điền dấu báo lỗi chứ không để trống im lặng.
export class SegmentTranslator {
  private queue: Job[] = []
  private active = 0
  private generation = 0
  private recent: string[] = []
  private failures = 0
  private reported = false
  private readonly concurrency: number
  private readonly contextSegments: number
  private readonly errorStreak: number
  private readonly retryDelayMs: number

  constructor(private deps: SegmentTranslatorDeps) {
    this.concurrency = Math.max(1, deps.concurrency ?? TEXT_TRANSLATE_CONCURRENCY)
    this.contextSegments = Math.max(0, deps.contextSegments ?? TEXT_TRANSLATE_CONTEXT_SEGMENTS)
    this.errorStreak = Math.max(1, deps.errorStreak ?? TEXT_TRANSLATE_ERROR_STREAK)
    this.retryDelayMs = deps.retryDelayMs ?? 1000
  }

  enqueue(id: string, text: string): void {
    const clean = text.trim()
    if (!clean) return
    const previous = this.contextSegments > 0 ? this.recent.slice(-this.contextSegments) : []
    this.recent.push(clean)
    if (this.recent.length > this.contextSegments) this.recent.shift()
    this.queue.push({ id, text: clean, previous, generation: this.generation })
    this.pump()
  }

  // Phiên mới: bỏ hàng đợi, kết quả muộn của phiên cũ không được điền / báo lỗi nữa
  // (chi phí của chúng vẫn được ghi vì đã tốn tiền thật)
  reset(): void {
    this.generation += 1
    this.queue = []
    this.recent = []
    this.failures = 0
    this.reported = false
  }

  pending(): number {
    return this.queue.length + this.active
  }

  private pump(): void {
    while (this.active < this.concurrency && this.queue.length > 0) {
      const job = this.queue.shift()!
      this.active += 1
      void this.run(job).finally(() => {
        this.active -= 1
        this.pump()
      })
    }
  }

  private async run(job: Job): Promise<void> {
    let lastError = ''
    for (let attempt = 0; attempt < 2; attempt++) {
      if (attempt > 0) {
        await new Promise((resolve) => setTimeout(resolve, this.retryDelayMs))
        if (job.generation !== this.generation) return
      }
      try {
        const res = await this.deps.translate({ text: job.text, previous: job.previous })
        if (res.costUsd > 0) this.deps.onCost(res.costUsd)
        if (!res.text.trim()) {
          lastError = 'model trả về bản dịch rỗng'
          continue
        }
        if (job.generation !== this.generation) return
        this.deps.onResult(job.id, res.text.trim())
        this.succeeded()
        return
      } catch (err) {
        lastError = err instanceof Error ? err.message : String(err)
        if (job.generation !== this.generation) return
      }
    }
    if (job.generation !== this.generation) return
    console.error('Không dịch được câu:', lastError)
    this.deps.onResult(job.id, TEXT_TRANSLATE_FAILED_MARK)
    this.failed(lastError)
  }

  private succeeded(): void {
    this.failures = 0
    if (this.reported) {
      this.reported = false
      this.deps.onErrorStreak?.(null)
    }
  }

  private failed(message: string): void {
    this.failures += 1
    if (this.failures >= this.errorStreak && !this.reported) {
      this.reported = true
      this.deps.onErrorStreak?.(`Không dịch được ${this.failures} câu liên tiếp: ${message}`.slice(0, 300))
    }
  }
}
