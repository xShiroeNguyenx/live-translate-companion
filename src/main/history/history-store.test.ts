import { existsSync, mkdtempSync, rmSync, writeFileSync } from 'node:fs'
import { tmpdir } from 'node:os'
import { join } from 'node:path'
import { afterEach, beforeEach, describe, expect, it } from 'vitest'
import type { HistoryRecord } from '../../shared/types'
import { HistoryStore } from './history-store'

function record(id: string, startedAt: number, target: string): HistoryRecord {
  return {
    id,
    direction: 'incoming',
    startedAt,
    endedAt: startedAt + 60_000,
    targetLanguage: 'vi',
    secondsSent: 30,
    costUsd: 0.01,
    transcriptFile: null,
    segments: [
      {
        id: 's1',
        startedAt,
        source: { text: 'Hello', final: true },
        target: { text: target, final: true }
      }
    ]
  }
}

describe('HistoryStore', () => {
  let dir: string
  beforeEach(() => {
    dir = mkdtempSync(join(tmpdir(), 'ltc-history-'))
  })
  afterEach(() => rmSync(dir, { recursive: true, force: true }))

  it('upsert giữ trường cũ (summary) khi autosave ghi lại segments', () => {
    const h = new HistoryStore(join(dir, 'history'))
    h.upsert(record('a', 1, 'Xin chào'))
    h.upsert({ id: 'a', summary: '## Tóm tắt' })
    h.upsert(record('a', 1, 'Xin chào mọi người'))
    const r = h.get('a')
    expect(r?.summary).toBe('## Tóm tắt')
    expect(r?.segments[0].target.text).toBe('Xin chào mọi người')
  })

  it('upsert một phần cho id chưa có thì bỏ qua', () => {
    const h = new HistoryStore(join(dir, 'history'))
    expect(h.upsert({ id: 'x', summary: 'abc' })).toBeNull()
    expect(h.list()).toEqual([])
  })

  it('list mới nhất trước, có preview, tìm kiếm không dấu', () => {
    const h = new HistoryStore(join(dir, 'history'))
    h.upsert(record('old', 1, 'Báo giá dự án'))
    h.upsert(record('new', 2, 'Hạn giao hàng'))
    expect(h.list().map((e) => e.id)).toEqual(['new', 'old'])
    expect(h.list()[0].preview).toBe('Hạn giao hàng')
    expect(h.list('bao gia').map((e) => e.id)).toEqual(['old'])
  })

  it('delete xoá cả file transcript', () => {
    const h = new HistoryStore(join(dir, 'history'))
    const file = join(dir, 't.txt')
    writeFileSync(file, 'x')
    h.upsert({ ...record('a', 1, 'x'), transcriptFile: file })
    expect(h.delete('a')).toBe(true)
    expect(existsSync(file)).toBe(false)
    expect(h.get('a')).toBeNull()
  })

  it('từ chối id có ký tự đường dẫn', () => {
    const h = new HistoryStore(join(dir, 'history'))
    expect(h.get('../secrets')).toBeNull()
  })
})
