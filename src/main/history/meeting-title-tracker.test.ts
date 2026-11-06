import { mkdtempSync, rmSync } from 'node:fs'
import { tmpdir } from 'node:os'
import { join } from 'node:path'
import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest'
import type { HistoryRecord } from '../../shared/types'
import { HistoryStore } from './history-store'
import { MeetingTitleTracker } from './meeting-title-tracker'

function rec(id: string): HistoryRecord {
  return {
    id,
    direction: 'incoming',
    startedAt: 0,
    endedAt: 1,
    targetLanguage: 'vi',
    secondsSent: 0,
    costUsd: 0,
    transcriptFile: null,
    segments: []
  }
}

describe('MeetingTitleTracker', () => {
  let dir: string
  let history: HistoryStore
  let tracker: MeetingTitleTracker
  beforeEach(() => {
    dir = mkdtempSync(join(tmpdir(), 'ltc-title-'))
    history = new HistoryStore(join(dir, 'history'))
    tracker = new MeetingTitleTracker(history)
  })
  afterEach(() => rmSync(dir, { recursive: true, force: true }))

  it('đặt tên khi bản ghi đã có → ghi ngay, chuẩn hoá tên, phát change', () => {
    history.upsert(rec('a'))
    const changes: string[] = []
    tracker.on('change', (t: string) => changes.push(t))
    expect(tracker.set('  Họp   khách hàng ', ['a', null])).toBe('Họp khách hàng')
    expect(history.get('a')?.title).toBe('Họp khách hàng')
    expect(changes).toEqual(['Họp khách hàng'])
  })

  it('đặt tên trước khi có bản ghi → gắn ở lần autosave đầu, các lần sau không ghi lại', () => {
    tracker.set('Daily', ['b'])
    expect(history.get('b')).toBeNull()
    history.upsert(rec('b'))
    const upsert = vi.spyOn(history, 'upsert')
    tracker.onRecordWritten('b')
    expect(history.get('b')?.title).toBe('Daily')
    tracker.onRecordWritten('b')
    expect(upsert).toHaveBeenCalledTimes(1)
  })

  it('autosave ghi lại segments không làm mất tên', () => {
    history.upsert(rec('c'))
    tracker.set('Họp tuần', ['c'])
    history.upsert({ ...rec('c'), endedAt: 99 })
    expect(history.get('c')?.title).toBe('Họp tuần')
  })

  it('xoá tên (chuỗi rỗng) → bỏ trường title khỏi bản ghi', () => {
    history.upsert({ ...rec('d'), title: 'Cũ' })
    tracker.set('   ', ['d'])
    expect(history.get('d')?.title).toBeUndefined()
    expect(tracker.get()).toBe('')
  })

  it('reset (phiên mới) → không gắn tên cũ vào bản ghi mới', () => {
    tracker.set('Họp A', [])
    const changes: string[] = []
    tracker.on('change', (t: string) => changes.push(t))
    tracker.reset()
    tracker.reset() // không có gì để xoá → không phát lại
    history.upsert(rec('e'))
    tracker.onRecordWritten('e')
    expect(history.get('e')?.title).toBeUndefined()
    expect(changes).toEqual([''])
  })
})
