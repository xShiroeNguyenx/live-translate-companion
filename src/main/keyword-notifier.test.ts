import { describe, expect, it, vi } from 'vitest'
import type { SubtitleSegment } from '../shared/types'
import { KeywordNotifier } from './keyword-notifier'

function seg(id: string, source: string, target: string): SubtitleSegment {
  return {
    id,
    startedAt: 0,
    source: { text: source, final: false },
    target: { text: target, final: false }
  }
}

describe('KeywordNotifier', () => {
  it('báo đúng 1 lần cho mỗi segment khi xuất hiện từ khoá', () => {
    const notify = vi.fn()
    const n = new KeywordNotifier(() => 'Khánh', notify)
    n.onUpdate({ type: 'segment', segment: seg('a', 'Khanh-san', '') })
    n.onUpdate({ type: 'segment', segment: seg('a', 'Khanh-san, onegai', 'Anh Khánh ơi') })
    n.onUpdate({ type: 'segment', segment: seg('b', 'other', 'chuyện khác') })
    expect(notify).toHaveBeenCalledOnce()
    expect(notify).toHaveBeenCalledWith('khanh', 'Khanh-san')
  })

  it('clear → segment cùng id ở phiên sau vẫn được báo', () => {
    const notify = vi.fn()
    const n = new KeywordNotifier(() => 'deadline', notify)
    n.onUpdate({ type: 'segment', segment: seg('seg-1', '', 'deadline thứ 6') })
    n.onUpdate({ type: 'clear' })
    n.onUpdate({ type: 'segment', segment: seg('seg-1', '', 'deadline thứ 6') })
    expect(notify).toHaveBeenCalledTimes(2)
  })

  it('không cấu hình từ khoá thì không báo', () => {
    const notify = vi.fn()
    const n = new KeywordNotifier(() => '', notify)
    n.onUpdate({ type: 'segment', segment: seg('a', 'x', 'y') })
    expect(notify).not.toHaveBeenCalled()
  })
})
