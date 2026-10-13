import { mkdirSync, renameSync, writeFileSync } from 'node:fs'
import { join } from 'node:path'
import type { ExportFormat, SubtitleUpdate } from '../../shared/types'

export interface AutoSaveConfig {
  enabled: boolean
  format: ExportFormat
  dir: string
}

export interface TranscriptAutoSaverDeps {
  exportAs: (format: ExportFormat) => string
  getConfig: () => AutoSaveConfig
  // hậu tố tên file để phân biệt 2 chiều, ví dụ "chieu-ve"
  suffix: string
  debounceMs?: number
  now?: () => Date
}

function fileStamp(d: Date): string {
  const pad = (n: number): string => String(n).padStart(2, '0')
  return (
    `${d.getFullYear()}-${pad(d.getMonth() + 1)}-${pad(d.getDate())}_` +
    `${pad(d.getHours())}-${pad(d.getMinutes())}-${pad(d.getSeconds())}`
  )
}

// Tự lưu transcript của mỗi phiên ra 1 file riêng. Mỗi lần ghi là ghi lại TOÀN BỘ phiên
// (tmp → rename) nên file luôn hợp lệ kể cả với .srt, và crash chỉ mất tối đa debounceMs cuối.
export class TranscriptAutoSaver {
  private filePath: string | null = null
  // chốt định dạng theo file đã mở — đổi setting giữa phiên chỉ áp cho phiên sau
  private fileFormat: ExportFormat | null = null
  private timer: ReturnType<typeof setTimeout> | null = null
  private readonly debounceMs: number
  private readonly now: () => Date

  constructor(private deps: TranscriptAutoSaverDeps) {
    this.debounceMs = deps.debounceMs ?? 1500
    this.now = deps.now ?? (() => new Date())
  }

  get currentFile(): string | null {
    return this.filePath
  }

  onUpdate(update: SubtitleUpdate): void {
    if (update.type === 'clear') {
      // store.clear() = bắt đầu phiên mới → chốt file cũ, phiên sau mở file mới
      this.flush()
      this.filePath = null
      this.fileFormat = null
      return
    }
    if (update.type !== 'segment' || !this.deps.getConfig().enabled) return
    if (this.timer) return
    this.timer = setTimeout(() => this.flush(), this.debounceMs)
  }

  flush(): void {
    if (this.timer) clearTimeout(this.timer)
    this.timer = null
    const config = this.deps.getConfig()
    if (!config.enabled) return
    const format = this.fileFormat ?? config.format
    const content = this.deps.exportAs(format)
    if (!content) return
    try {
      if (!this.filePath) {
        mkdirSync(config.dir, { recursive: true })
        this.filePath = join(config.dir, `${fileStamp(this.now())}_${this.deps.suffix}.${format}`)
        this.fileFormat = format
      }
      const tmp = `${this.filePath}.tmp`
      writeFileSync(tmp, content, 'utf-8')
      renameSync(tmp, this.filePath)
    } catch (err) {
      console.error('Không tự lưu được transcript:', err)
    }
  }
}
