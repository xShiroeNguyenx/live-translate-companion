import { describe, expect, it } from 'vitest'
import { answerPreview, parseAnswer, splitTimeRefs } from './answer-format'

describe('splitTimeRefs', () => {
  it('"(lúc …)" → nhãn giờ, giữ chữ trước/sau', () => {
    expect(splitTimeRefs('Hạn là thứ Sáu (lúc 15:49).')).toEqual([
      { kind: 'text', text: 'Hạn là thứ Sáu' },
      { kind: 'time', time: '15:49' },
      { kind: 'text', text: '.' }
    ])
  })

  it('nhiều giờ trong 1 ngoặc, khoảng giờ', () => {
    expect(splitTimeRefs('Điền cột O (lúc 16:08, 16:09)')).toEqual([
      { kind: 'text', text: 'Điền cột O' },
      { kind: 'time', time: '16:08' },
      { kind: 'time', time: '16:09' }
    ])
    expect(splitTimeRefs('x (lúc 16:05–16:07)').filter((p) => p.kind === 'time')).toHaveLength(2)
  })

  it('ngoặc thường không phải giờ → giữ nguyên', () => {
    expect(splitTimeRefs('Phiên bản 2 (bản lớn)')).toEqual([
      { kind: 'text', text: 'Phiên bản 2 (bản lớn)' }
    ])
  })
})

describe('parseAnswer', () => {
  it('đoạn mở đầu + gạch đầu dòng cách nhau dòng trống → 1 danh sách', () => {
    const blocks = parseAnswer(
      'Team cần làm:\n\n- Việc A (lúc 16:08).\n\n- Việc B\n  - Chi tiết B1\n* Việc C'
    )
    expect(blocks.map((b) => b.kind)).toEqual(['para', 'list'])
    const list = blocks[1]
    expect(list.kind === 'list' && list.items.map((i) => i.level)).toEqual([0, 0, 1, 0])
    expect(list.kind === 'list' && list.items[0].parts).toContainEqual({ kind: 'time', time: '16:08' })
  })

  it('bỏ dấu **đậm**, đánh số "1." cũng là danh sách, đoạn văn chen giữa cắt danh sách', () => {
    const blocks = parseAnswer('**Kết luận:**\n1. Một\n2) Hai\nGhi chú\n- Ba')
    expect(blocks.map((b) => b.kind)).toEqual(['para', 'list', 'para', 'list'])
    expect(blocks[0]).toEqual({ kind: 'para', parts: [{ kind: 'text', text: 'Kết luận:' }] })
  })

  it('văn bản rỗng → không có khối nào', () => {
    expect(parseAnswer('  \n\n')).toEqual([])
  })
})

describe('answerPreview', () => {
  it('dòng có chữ đầu tiên, bỏ gạch đầu dòng, giờ, dấu đậm', () => {
    expect(answerPreview('\n- **Hạn** là thứ Sáu (lúc 15:49).\n- khác')).toBe('Hạn là thứ Sáu.')
  })

  it('cắt dòng quá dài', () => {
    expect(answerPreview('a'.repeat(300), 10)).toBe('aaaaaaaaaa…')
    expect(answerPreview('')).toBe('')
  })
})
