import { mkdirSync, renameSync, writeFileSync } from 'node:fs'
import { join } from 'node:path'
import type { ExportFormat, SubtitleUpdate } from '../../shared/types'

export interface AutoSaveConfig {
  enabled: boolean
  format: ExportFormat
  dir: string
}

export interface AutoSaveSession {
  id: string
  startedAt: number
  transcriptFile: string
}

export interface TranscriptAutoSaverDeps {
  exportAs: (format: ExportFormat) => string
  getConfig: () => AutoSaveConfig
  // hậu tố tên file để phân biệt 2 chiều, ví dụ "chieu-ve"
  suffix: string
  debounceMs?: number
  now?: () => Date
  // gọi sau mỗi lần ghi file thành công — dùng để ghi kèm bản ghi lịch sử
  onFlush?: (session: AutoSaveSession) => void
}

export function fileStamp(d: Date): string {
  const pad = (n: number): string => String(n).padStart(2, '0')
  return (
    `${d.getFullYear()}-${pad(d.getMonth() + 1)}-${pad(d.getDate())}_` +
    `${pad(d.getHours())}-${pad(d.getMinutes())}-${pad(d.getSeconds())}`
  )
}

// Tự lưu transcript của mỗi phiên ra 1 file riêng. Mỗi lần ghi là ghi lại TOÀN BỘ phiên
// (tmp → rename) nên file luôn hợp lệ kể cả với .srt, và crash chỉ mất tối đa debounceMs cuối.
export class TranscriptAutoSaver {
  private session: AutoSaveSession | null = null
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
    return this.session?.transcriptFile ?? null
  }

  get currentSession(): AutoSaveSession | null {
    return this.session
  }

  onUpdate(update: SubtitleUpdate): void {
    if (update.type === 'clear') {
      // store.clear() = bắt đầu phiên mới → chốt file cũ, phiên sau mở file mới
      this.flush()
      this.session = null
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
      if (!this.session) {
        mkdirSync(config.dir, { recursive: true })
        const started = this.now()
        const id = `${fileStamp(started)}_${this.deps.suffix}`
        this.session = {
          id,
          startedAt: started.getTime(),
          transcriptFile: join(config.dir, `${id}.${format}`)
        }
        this.fileFormat = format
      }
      const file = this.session.transcriptFile
      const tmp = `${file}.tmp`
      writeFileSync(tmp, content, 'utf-8')
      renameSync(tmp, file)
    } catch (err) {
      console.error('Không tự lưu được transcript:', err)
      return
    }
    this.deps.onFlush?.(this.session)
  }
}
