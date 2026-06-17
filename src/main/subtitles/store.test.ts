import { describe, expect, it } from 'vitest'
import type { SubtitleUpdate } from '../../shared/types'
import { SubtitleStore } from './store'

function makeStore(opts: { gapMs?: number; minSplitChars?: number; maxChars?: number } = {}): {
  store: SubtitleStore
  updates: SubtitleUpdate[]
  clock: { now: number }
} {
  const updates: SubtitleUpdate[] = []
  const clock = { now: 1000 }
  const store = new SubtitleStore((u) => updates.push(u), () => clock.now, {
    gapMs: 2000,
    ...opts
  })
  return { store, updates, clock }
}

describe('SubtitleStore', () => {
  it('ghép fragment vào/ra cùng 1 segment đang mở', () => {
    const { store } = makeStore()
    store.appendSource('こんにち')
    store.appendSource('は')
    store.appendTarget('Xin ')
    store.appendTarget('chào')
    const history = store.history()
    expect(history).toHaveLength(1)
    expect(history[0].source.text).toBe('こんにちは')
    expect(history[0].target.text).toBe('Xin chào')
    expect(history[0].source.final).toBe(false)
  })

  it('finalize chốt segment và mở segment mới cho fragment sau', () => {
    const { store } = makeStore()
    store.appendSource('Hello')
    store.appendTarget('Xin chào')
    store.finalizeOpenSegment()
    store.appendSource('Bye')
    const history = store.history()
    expect(history).toHaveLength(2)
    expect(history[0].source.final).toBe(true)
    expect(history[1].source.text).toBe('Bye')
    expect(history[1].source.final).toBe(false)
  })

  it('khoảng trống > gapMs tự chốt segment cũ', () => {
    const { store, clock } = makeStore({ gapMs: 2000 })
    store.appendSource('Câu một')
    clock.now += 3000
    store.appendSource('Câu hai')
    const history = store.history()
    expect(history).toHaveLength(2)
    expect(history[0].source.text).toBe('Câu một')
    expect(history[0].source.final).toBe(true)
  })

  it('segment rỗng bị bỏ khi finalize, không phát update', () => {
    const { store, updates } = makeStore()
    store.finalizeOpenSegment()
    expect(updates).toHaveLength(0)
    expect(store.history()).toHaveLength(0)
  })

  it('partial update phát đè theo cùng id (update tại chỗ, không append)', () => {
    const { store, updates } = makeStore()
    store.appendTarget('Xin ')
    store.appendTarget('chào')
    const segmentUpdates = updates.filter((u) => u.type === 'segment')
    expect(segmentUpdates).toHaveLength(2)
    const ids = new Set(segmentUpdates.map((u) => (u.type === 'segment' ? u.segment.id : '')))
    expect(ids.size).toBe(1)
  })

  it('export srt có timestamp và 2 dòng song ngữ', () => {
    const { store, clock } = makeStore()
    store.appendSource('こんにちは')
    store.appendTarget('Xin chào')
    store.finalizeOpenSegment()
    clock.now += 5000
    store.appendSource('Goodbye')
    store.appendTarget('Tạm biệt')
    store.finalizeOpenSegment()

    const srt = store.export('srt')
    expect(srt).toContain('1\n00:00:00,000 --> 00:00:05,000')
    expect(srt).toContain('こんにちは\nXin chào')
    expect(srt).toContain('2\n00:00:05,000 -->')
    expect(srt).toContain('Goodbye\nTạm biệt')
  })

  it('export txt/md có nội dung; store trống export rỗng', () => {
    const { store } = makeStore()
    expect(store.export('txt')).toBe('')
    store.appendSource('Hello')
    store.appendTarget('Xin chào')
    expect(store.export('txt')).toContain('→ Xin chào')
    expect(store.export('md')).toContain('> Xin chào')
  })

  it('tự ngắt segment khi bản dịch kết câu và đủ dài', () => {
    const { store } = makeStore({ minSplitChars: 20 })
    store.appendSource('This is the first sentence of the podcast and ')
    store.appendTarget('Đây là câu đầu tiên của podcast và nó khá dài.')
    store.appendTarget(' Câu thứ hai bắt đầu')
    const history = store.history()
    expect(history).toHaveLength(2)
    expect(history[0].target.text).toBe('Đây là câu đầu tiên của podcast và nó khá dài.')
    expect(history[0].target.final).toBe(true)
    expect(history[1].target.text).toBe(' Câu thứ hai bắt đầu')
    expect(history[1].target.final).toBe(false)
  })

  it('câu ngắn có dấu chấm chưa đủ minSplitChars thì không ngắt', () => {
    const { store } = makeStore({ minSplitChars: 50 })
    store.appendTarget('Vâng.')
    store.appendTarget(' Đúng vậy.')
    expect(store.history()).toHaveLength(1)
  })

  it('vượt trần maxChars thì ngắt dù không có dấu câu', () => {
    const { store } = makeStore({ maxChars: 30 })
    store.appendTarget('một hai ba bốn năm sáu bảy tám')
    store.appendTarget(' chín mười')
    const history = store.history()
    expect(history).toHaveLength(2)
    expect(history[0].target.final).toBe(true)
  })

  it('ngắt được với dấu câu tiếng Nhật/CJK ở transcript dịch', () => {
    const { store } = makeStore({ minSplitChars: 10 })
    store.appendTarget('これは日本語のテストです。')
    store.appendTarget('次の文')
    expect(store.history()).toHaveLength(2)
  })

  it('clear xoá hết và phát update clear', () => {
    const { store, updates } = makeStore()
    store.appendSource('A')
    store.clear()
    expect(store.history()).toHaveLength(0)
    expect(updates.at(-1)).toEqual({ type: 'clear' })
  })
})
