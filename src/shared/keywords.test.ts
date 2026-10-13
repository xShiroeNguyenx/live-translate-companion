import { describe, expect, it } from 'vitest'
import { findKeyword, parseKeywords } from './keywords'

describe('keywords', () => {
  it('tách theo dấu phẩy / xuống dòng / dấu phẩy Nhật, bỏ rỗng', () => {
    expect(parseKeywords('Khánh, deadline\nカーン、 ,')).toEqual(['khanh', 'deadline', 'カーン'])
  })

  it('khớp không phân biệt hoa thường và dấu tiếng Việt', () => {
    const kw = parseKeywords('Khánh, Đức')
    expect(findKeyword('anh KHANH ơi', kw)).toBe('khanh')
    expect(findKeyword('hỏi anh Duc nhé', kw)).toBe('duc')
    expect(findKeyword('không liên quan', kw)).toBeNull()
  })

  it('khớp chữ Nhật', () => {
    expect(findKeyword('カーンさん、お願いします', parseKeywords('カーン'))).toBe('カーン')
  })

  it('không có từ khoá thì không khớp gì', () => {
    expect(findKeyword('bất kỳ', [])).toBeNull()
  })
})
