import { describe, expect, it } from 'vitest'
import { isAwaitingTranslation } from './segments'
import type { SubtitleSegment } from './types'

function seg(source: SubtitleSegment['source'], target: SubtitleSegment['target']): SubtitleSegment {
  return { id: 's', startedAt: 0, source, target }
}

describe('isAwaitingTranslation', () => {
  it('chỉ đúng với câu gốc đã chốt mà chưa có bản dịch', () => {
    // interim (chưa chốt)
    expect(isAwaitingTranslation(seg({ text: 'Hello', final: false }, { text: '', final: false }))).toBe(false)
    // đã chốt, chờ dịch
    expect(isAwaitingTranslation(seg({ text: 'Hello.', final: true }, { text: '', final: false }))).toBe(true)
    // đã có bản dịch
    expect(isAwaitingTranslation(seg({ text: 'Hello.', final: true }, { text: 'Chào.', final: true }))).toBe(false)
  })

  it('chế độ giọng chốt 2 bên cùng lúc → không bao giờ là "đang dịch"', () => {
    expect(isAwaitingTranslation(seg({ text: 'Hello', final: true }, { text: '', final: true }))).toBe(false)
  })
})
