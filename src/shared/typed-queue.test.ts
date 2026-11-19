import { describe, expect, it } from 'vitest'
import {
  canAddTypedItem,
  canPlay,
  isPreparing,
  isVoiceReady,
  newTypedItem,
  nextToPlay,
  patchTypedItem,
  removeTypedItem,
  voiceKey,
  type TypedItem
} from './typed-queue'

const done = (id: number, translation: string, played = 0): TypedItem => ({
  ...newTypedItem(id, `câu ${id}`),
  status: 'translated',
  translation,
  played
})

describe('typed-queue', () => {
  it('câu mới: cắt khoảng trắng, đang dịch, chưa phát', () => {
    const item = newTypedItem(1, '  xin chào  ')
    expect(item).toMatchObject({ id: 1, source: 'xin chào', status: 'translating', played: 0 })
    expect(canPlay(item)).toBe(false)
  })

  it('đầy thì không thêm', () => {
    const items = [done(1, 'a'), done(2, 'b')]
    expect(canAddTypedItem(items, 3)).toBe(true)
    expect(canAddTypedItem(items, 2)).toBe(false)
  })

  it('patch / remove chỉ đụng đúng câu', () => {
    const items = [done(1, 'a'), done(2, 'b')]
    const patched = patchTypedItem(items, 2, { played: 1 })
    expect(patched[0]).toBe(items[0])
    expect(patched[1].played).toBe(1)
    expect(removeTypedItem(items, 1).map((i) => i.id)).toEqual([2])
  })

  it('giọng sẵn chỉ khi khớp cả giọng lẫn chữ (sửa bản dịch / đổi giọng = chưa sẵn)', () => {
    const item = { ...done(1, 'こんにちは'), readyKey: voiceKey('Kore', ' こんにちは ') }
    expect(isVoiceReady(item, 'Kore')).toBe(true)
    expect(isVoiceReady(item, 'Puck')).toBe(false)
    expect(isVoiceReady({ ...item, translation: 'こんばんは' }, 'Kore')).toBe(false)
    expect(isVoiceReady({ ...item, translation: '  ' }, 'Kore')).toBe(false)
  })

  it('đang tạo giọng theo đúng khoá', () => {
    const item = { ...done(1, 'a'), preparingKey: voiceKey('Kore', 'a') }
    expect(isPreparing(item, 'Kore')).toBe(true)
    expect(isPreparing({ ...item, translation: 'b' }, 'Kore')).toBe(false)
  })

  it('câu kế tiếp = câu đầu tiên chưa phát và đã dịch xong', () => {
    const items: TypedItem[] = [
      done(1, 'a', 1),
      { ...newTypedItem(2, 'đang dịch') },
      { ...done(3, 'c'), status: 'error', error: 'x' },
      done(4, 'd'),
      done(5, 'e')
    ]
    expect(nextToPlay(items)?.id).toBe(4)
    expect(nextToPlay([done(1, 'a', 2)])).toBeNull()
  })
})
