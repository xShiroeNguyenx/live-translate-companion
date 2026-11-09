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

describe('SubtitleStore mốc tạm dừng', () => {
  const MIN = 60_000

  it('addPauseMarker chốt segment đang mở, thêm mốc và phát update', () => {
    const { store, updates, clock } = makeStore()
    store.appendSource('Hello')
    store.appendTarget('Xin chào')
    store.addPauseMarker(clock.now + 1000, clock.now + 15 * MIN)
    const history = store.history()
    expect(history).toHaveLength(2)
    expect(history[0].target.final).toBe(true)
    expect(history[1].pauseEndedAt).toBe(clock.now + 15 * MIN)
    const last = updates.at(-1)
    expect(last?.type === 'segment' && last.segment.pauseEndedAt).toBe(clock.now + 15 * MIN)
  })

  it('lời sau khi tiếp tục mở segment mới, không dính vào segment trước mốc', () => {
    const { store, clock } = makeStore({ gapMs: 10 * MIN })
    store.appendTarget('Trước')
    store.addPauseMarker(clock.now, clock.now + MIN)
    clock.now += MIN
    store.appendTarget('Sau')
    const texts = store.history().map((s) => s.target.text)
    expect(texts).toEqual(['Trước', '', 'Sau'])
  })

  it('export txt/md/srt có dòng tạm dừng kèm thời lượng', () => {
    const { store, clock } = makeStore()
    clock.now = new Date(2026, 10, 6, 14, 0).getTime()
    store.appendSource('Hello')
    store.appendTarget('Xin chào')
    store.finalizeOpenSegment()
    const pausedAt = new Date(2026, 10, 6, 14, 30).getTime()
    store.addPauseMarker(pausedAt, pausedAt + 15 * MIN)
    clock.now = pausedAt + 15 * MIN
    store.appendTarget('Tiếp')

    const txt = store.export('txt')
    expect(txt).toContain('[00:30:00] ⏸ Tạm dừng 14:30 → 14:45 (15 phút)')
    expect(txt).toContain('[00:45:00]')
    expect(store.export('md')).toContain('**[00:30:00]** ⏸ *Tạm dừng 14:30 → 14:45 (15 phút)*')
    const srt = store.export('srt')
    expect(srt).toContain('00:30:00,000 --> 00:45:00,000\n⏸ Tạm dừng 14:30 → 14:45 (15 phút)')
    expect(srt.split('\n\n')).toHaveLength(3)
  })

  it('chỉ có mốc tạm dừng, không có lời → export rỗng', () => {
    const { store, clock } = makeStore()
    store.addPauseMarker(clock.now, clock.now + MIN)
    expect(store.export('txt')).toBe('')
  })
})

describe('SubtitleStore — chế độ chỉ chữ (interim + điền bản dịch sau)', () => {
  it('interim thay hẳn câu gốc mỗi lần, cùng 1 id', () => {
    const { store, updates } = makeStore()
    store.setInterim('Good')
    store.setInterim('Good morning')
    const ids = updates.flatMap((u) => (u.type === 'segment' ? [u.segment.id] : []))
    expect(ids).toHaveLength(2)
    expect(new Set(ids).size).toBe(1)
    expect(store.history().map((s) => s.source.text)).toEqual(['Good morning'])
    expect(store.history()[0].source.final).toBe(false)
  })

  it('commitSource dùng lại id của interim, chờ dịch; fillTarget điền đúng câu', () => {
    const { store } = makeStore()
    store.setInterim('Good morning everyone')
    const interimId = store.history()[0].id
    const id = store.commitSource(' Good morning everyone. ')
    expect(id).toBe(interimId)
    expect(store.hasInterim()).toBe(false)
    let seg = store.history()[0]
    expect(seg.source).toEqual({ text: 'Good morning everyone.', final: true })
    expect(seg.target).toEqual({ text: '', final: false })

    expect(store.fillTarget(id!, ' Chào buổi sáng mọi người. ')).toBe(true)
    seg = store.history()[0]
    expect(seg.target).toEqual({ text: 'Chào buổi sáng mọi người.', final: true })
  })

  it('bản dịch về lệch thứ tự vẫn điền đúng theo id', () => {
    const { store } = makeStore()
    const a = store.commitSource('One.')!
    const b = store.commitSource('Two.')!
    store.fillTarget(b, 'Hai.')
    store.fillTarget(a, 'Một.')
    expect(store.history().map((s) => s.target.text)).toEqual(['Một.', 'Hai.'])
  })

  it('finalizeOpenSegment / mốc tạm dừng không chốt interim', () => {
    const { store, clock } = makeStore()
    store.setInterim('Still talking')
    store.finalizeOpenSegment()
    store.addPauseMarker(clock.now, clock.now + 1000)
    expect(store.hasInterim()).toBe(true)
    const id = store.commitSource('Still talking about it.')
    // không có câu trùng: chỉ mốc tạm dừng + câu đã chốt
    const spoken = store.history().filter((s) => s.pauseEndedAt === undefined)
    expect(spoken).toHaveLength(1)
    expect(spoken[0].id).toBe(id)
  })

  it('final rỗng → bỏ interim khỏi giao diện, không tạo câu', () => {
    const { store, updates } = makeStore()
    store.setInterim('uh')
    expect(store.commitSource('  ')).toBeNull()
    expect(store.isEmpty()).toBe(true)
    expect(updates.at(-1)).toEqual({ type: 'history', segments: [] })
  })

  it('commitInterim chốt câu đang dở khi Dừng; không có interim → null', () => {
    const { store } = makeStore()
    expect(store.commitInterim()).toBeNull()
    store.setInterim('Half a sentence')
    const res = store.commitInterim()
    expect(res?.text).toBe('Half a sentence')
    expect(store.history()[0].source.final).toBe(true)
  })

  it('id của phiên trước (đã clear) → fillTarget bỏ qua', () => {
    const { store } = makeStore()
    const old = store.commitSource('Old.')!
    store.clear()
    expect(store.fillTarget(old, 'Cũ.')).toBe(false)
    expect(store.isEmpty()).toBe(true)
  })

  it('clear xoá interim; isEmpty tính cả interim', () => {
    const { store } = makeStore()
    store.setInterim('x')
    expect(store.isEmpty()).toBe(false)
    store.clear()
    expect(store.isEmpty()).toBe(true)
    expect(store.hasInterim()).toBe(false)
  })

  it('export khi còn câu chưa dịch: vẫn có câu gốc', () => {
    const { store } = makeStore()
    const a = store.commitSource('Translated.')!
    store.fillTarget(a, 'Đã dịch.')
    store.commitSource('Pending.')
    const txt = store.export('txt')
    expect(txt).toContain('Translated.\n         → Đã dịch.')
    expect(txt).toContain('Pending.')
  })
})
