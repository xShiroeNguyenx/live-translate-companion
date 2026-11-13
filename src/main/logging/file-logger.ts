import { appendFileSync, existsSync, mkdirSync, readFileSync, renameSync, statSync } from 'node:fs'
import { join } from 'node:path'
import { formatLogLine, type LogLevel } from './log-format'

export const LOG_FILE = 'app.log'
export const LOG_FILE_OLD = 'app.1.log'
// đầy thì xoay vòng: app.log → app.1.log (ghi đè bản cũ) → tối đa ~2 MB trên đĩa
export const LOG_MAX_BYTES = 1024 * 1024

// Ghi log ra file trong userData/logs. Ghi đồng bộ từng dòng: lượng log rất ít (lỗi, cảnh báo,
// đổi trạng thái), đổi lại dòng cuối trước khi app chết vẫn kịp xuống đĩa.
// Không bao giờ ném lỗi: ghi log hỏng (đĩa đầy, mất quyền) không được làm hỏng app.
export class FileLogger {
  private bytes = 0

  constructor(
    readonly dir: string,
    private maxBytes: number = LOG_MAX_BYTES,
    private now: () => Date = () => new Date()
  ) {
    try {
      mkdirSync(dir, { recursive: true })
      this.bytes = existsSync(this.file) ? statSync(this.file).size : 0
    } catch {
      /* không tạo được thư mục → write() sẽ im lặng bỏ qua */
    }
  }

  get file(): string {
    return join(this.dir, LOG_FILE)
  }

  info(...args: unknown[]): void {
    this.write('info', args)
  }

  warn(...args: unknown[]): void {
    this.write('warn', args)
  }

  error(...args: unknown[]): void {
    this.write('error', args)
  }

  write(level: LogLevel, args: unknown[]): void {
    try {
      const line = `${formatLogLine(this.now(), level, args)}\n`
      const size = Buffer.byteLength(line)
      if (this.bytes > 0 && this.bytes + size > this.maxBytes) {
        renameSync(this.file, join(this.dir, LOG_FILE_OLD))
        this.bytes = 0
      }
      appendFileSync(this.file, line)
      this.bytes += size
    } catch {
      /* xem ghi chú ở đầu class */
    }
  }

  // N dòng cuối (gộp cả file đã xoay vòng nếu file hiện tại còn ngắn), cũ → mới
  tail(maxLines: number): string[] {
    const read = (name: string): string[] => {
      try {
        return readFileSync(join(this.dir, name), 'utf8').split('\n').filter((l) => l !== '')
      } catch {
        return []
      }
    }
    let lines = read(LOG_FILE)
    if (lines.length < maxLines) lines = [...read(LOG_FILE_OLD), ...lines]
    return lines.slice(-maxLines)
  }
}

// Mọi console.log/warn/error sẵn có ở main cũng xuống file, không phải sửa từng chỗ gọi.
export function captureConsole(logger: FileLogger, target: Console = console): void {
  const levels: [keyof Pick<Console, 'log' | 'info' | 'warn' | 'error'>, LogLevel][] = [
    ['log', 'info'],
    ['info', 'info'],
    ['warn', 'warn'],
    ['error', 'error']
  ]
  for (const [method, level] of levels) {
    const original = target[method].bind(target)
    target[method] = (...args: unknown[]): void => {
      logger.write(level, args)
      original(...args)
    }
  }
}
