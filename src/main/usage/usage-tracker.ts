import { mkdirSync, readFileSync, renameSync, writeFileSync } from 'node:fs'
import { dirname } from 'node:path'
import type { SessionDirection } from '../../shared/types'

const KEEP_DAYS = 400

interface UsageFile {
  // 'YYYY-MM-DD' (giờ máy) → USD
  days: Record<string, number>
}

function dayKey(d: Date): string {
  const pad = (n: number): string => String(n).padStart(2, '0')
  return `${d.getFullYear()}-${pad(d.getMonth() + 1)}-${pad(d.getDate())}`
}

// Cộng dồn chi phí ước tính theo ngày cho cả 2 chiều, bền qua các lần mở app.
// Nhận chi phí LUỸ KẾ của phiên từ metrics → tự tính phần tăng thêm.
export class UsageTracker {
  private data: UsageFile = { days: {} }
  private lastCost: Record<SessionDirection, number> = { incoming: 0, outgoing: 0 }
  private dirty = false
  private timer: ReturnType<typeof setTimeout> | null = null

  constructor(
    private file: string,
    private now: () => Date = () => new Date(),
    private saveDelayMs = 10_000
  ) {
    try {
      const parsed = JSON.parse(readFileSync(file, 'utf-8')) as UsageFile
      if (parsed && typeof parsed.days === 'object') this.data = parsed
    } catch {
      /* chưa có file */
    }
  }

  // cumulativeUsd reset về 0 khi bắt đầu phiên mới → coi như phiên mới
  record(direction: SessionDirection, cumulativeUsd: number): void {
    const prev = this.lastCost[direction]
    const delta = cumulativeUsd >= prev ? cumulativeUsd - prev : cumulativeUsd
    this.lastCost[direction] = cumulativeUsd
    if (delta > 0) this.add(delta)
  }

  add(usd: number): void {
    const key = dayKey(this.now())
    this.data.days[key] = (this.data.days[key] ?? 0) + usd
    this.dirty = true
    if (!this.timer) this.timer = setTimeout(() => this.flush(), this.saveDelayMs)
  }

  today(): number {
    return this.data.days[dayKey(this.now())] ?? 0
  }

  month(): number {
    const prefix = dayKey(this.now()).slice(0, 7)
    return Object.entries(this.data.days)
      .filter(([k]) => k.startsWith(prefix))
      .reduce((sum, [, v]) => sum + v, 0)
  }

  monthKey(): string {
    return dayKey(this.now()).slice(0, 7)
  }

  flush(): void {
    if (this.timer) clearTimeout(this.timer)
    this.timer = null
    if (!this.dirty) return
    const keys = Object.keys(this.data.days).sort()
    for (const k of keys.slice(0, Math.max(0, keys.length - KEEP_DAYS))) delete this.data.days[k]
    try {
      mkdirSync(dirname(this.file), { recursive: true })
      writeFileSync(`${this.file}.tmp`, JSON.stringify(this.data), 'utf-8')
      renameSync(`${this.file}.tmp`, this.file)
      this.dirty = false
    } catch (err) {
      console.error('Không lưu được thống kê chi phí:', err)
    }
  }
}
