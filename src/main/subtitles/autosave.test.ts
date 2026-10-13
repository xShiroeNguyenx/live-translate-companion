import { mkdtempSync, readdirSync, readFileSync, rmSync } from 'node:fs'
import { tmpdir } from 'node:os'
import { join } from 'node:path'
import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest'
import type { ExportFormat } from '../../shared/types'
import { TranscriptAutoSaver, type AutoSaveConfig } from './autosave'
import { SubtitleStore } from './store'

describe('TranscriptAutoSaver', () => {
  let dir: string
  let config: AutoSaveConfig

  beforeEach(() => {
    vi.useFakeTimers()
    dir = mkdtempSync(join(tmpdir(), 'ltc-autosave-'))
    config = { enabled: true, format: 'txt', dir }
  })

  afterEach(() => {
    vi.useRealTimers()
    rmSync(dir, { recursive: true, force: true })
  })

  function setup(): { store: SubtitleStore; saver: TranscriptAutoSaver } {
    let saver: TranscriptAutoSaver | null = null
    const store = new SubtitleStore((u) => saver?.onUpdate(u))
    saver = new TranscriptAutoSaver({
      exportAs: (f: ExportFormat) => store.export(f),
      getConfig: () => config,
      suffix: 'chieu-ve',
      debounceMs: 1000,
      now: () => new Date(2026, 9, 13, 14, 30, 5)
    })
    return { store, saver }
  }

  it('ghi file sau debounce, tên file theo giờ bắt đầu + hậu tố', () => {
    const { store } = setup()
    store.appendSource('Hello')
    store.appendTarget('Xin chào')
    expect(readdirSync(dir)).toEqual([])
    vi.advanceTimersByTime(1000)
    expect(readdirSync(dir)).toEqual(['2026-10-13_14-30-05_chieu-ve.txt'])
    const content = readFileSync(join(dir, readdirSync(dir)[0]), 'utf-8')
    expect(content).toContain('Hello')
    expect(content).toContain('Xin chào')
  })

  it('flush ghi ngay và cập nhật cùng 1 file trong phiên', () => {
    const { store, saver } = setup()
    store.appendTarget('Một.')
    saver.flush()
    store.appendTarget(' Hai.')
    saver.flush()
    const files = readdirSync(dir)
    expect(files).toHaveLength(1)
    expect(readFileSync(join(dir, files[0]), 'utf-8')).toContain('Hai.')
  })

  it('clear() = phiên mới → mở file mới', () => {
    const { store, saver } = setup()
    let n = 0
    // giờ khác nhau cho mỗi phiên
    ;(saver as unknown as { now: () => Date }).now = () => new Date(2026, 9, 13, 14, 30, n++)
    store.appendTarget('Phiên 1')
    saver.flush()
    store.clear()
    store.appendTarget('Phiên 2')
    saver.flush()
    expect(readdirSync(dir)).toHaveLength(2)
  })

  it('tắt tự lưu thì không ghi gì', () => {
    config.enabled = false
    const { store, saver } = setup()
    store.appendTarget('abc')
    vi.advanceTimersByTime(5000)
    saver.flush()
    expect(readdirSync(dir)).toEqual([])
  })

  it('đổi định dạng giữa phiên vẫn giữ định dạng của file đã mở', () => {
    const { store, saver } = setup()
    store.appendTarget('abc')
    saver.flush()
    config.format = 'srt'
    store.appendTarget(' def')
    saver.flush()
    const files = readdirSync(dir)
    expect(files).toEqual(['2026-10-13_14-30-05_chieu-ve.txt'])
    expect(readFileSync(join(dir, files[0]), 'utf-8')).not.toContain('-->')
  })
})
