import { mkdtempSync, readFileSync, rmSync } from 'node:fs'
import { tmpdir } from 'node:os'
import { join } from 'node:path'
import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest'
import { captureConsole, FileLogger, LOG_FILE, LOG_FILE_OLD } from './file-logger'

let dir: string
const at = (): Date => new Date('2026-11-13T09:15:02.000Z')

beforeEach(() => {
  dir = mkdtempSync(join(tmpdir(), 'ltc-log-'))
})
afterEach(() => {
  rmSync(dir, { recursive: true, force: true })
})

describe('FileLogger', () => {
  it('ghi từng dòng xuống file ngay', () => {
    // giới hạn đủ rộng để stack trace của Error không làm file xoay vòng giữa test
    const log = new FileLogger(dir, 64 * 1024, at)
    log.info('khởi động', '0.5.7')
    log.error('hỏng:', new Error('boom'))
    const text = readFileSync(join(dir, LOG_FILE), 'utf8')
    expect(text).toContain('2026-11-13T09:15:02.000Z [info] khởi động 0.5.7\n')
    expect(text).toContain('[error] hỏng: Error: boom')
  })

  it('đầy thì xoay vòng sang app.1.log, tail gộp cả hai theo thứ tự cũ → mới', () => {
    const log = new FileLogger(dir, 200, at)
    for (let i = 0; i < 10; i++) log.info(`dòng ${i} ${'x'.repeat(30)}`)
    expect(readFileSync(join(dir, LOG_FILE_OLD), 'utf8')).toContain('dòng')
    const tail = log.tail(4)
    expect(tail).toHaveLength(4)
    expect(tail[3]).toContain('dòng 9')
    expect(tail[0]).toContain('dòng 6')
  })

  it('mở lại trên file sẵn có thì ghi nối, không ghi đè', () => {
    new FileLogger(dir, 1024, at).info('lần 1')
    new FileLogger(dir, 1024, at).info('lần 2')
    expect(new FileLogger(dir, 1024, at).tail(10).map((l) => l.slice(-5))).toEqual(['lần 1', 'lần 2'])
  })

  it('thư mục không ghi được → không ném lỗi, tail rỗng', () => {
    // đường dẫn nằm DƯỚI một file thường → mkdir/append đều thất bại
    new FileLogger(dir, 1024, at).info('x')
    const bad = new FileLogger(join(dir, LOG_FILE, 'sub'), 1024, at)
    expect(() => bad.error('y')).not.toThrow()
    expect(bad.tail(5)).toEqual([])
  })
})

describe('captureConsole', () => {
  it('console.warn/error vẫn in ra như cũ và thêm vào file', () => {
    const warn = vi.fn()
    const fake = { log: vi.fn(), info: vi.fn(), warn, error: vi.fn() } as unknown as Console
    const log = new FileLogger(dir, 1024, at)
    captureConsole(log, fake)
    fake.warn('Sẽ kết nối lại sau', 2000, 'ms')
    expect(warn).toHaveBeenCalledWith('Sẽ kết nối lại sau', 2000, 'ms')
    expect(log.tail(1)[0]).toContain('[warn] Sẽ kết nối lại sau 2000 ms')
  })
})
