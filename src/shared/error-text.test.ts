import { describe, expect, it } from 'vitest'
import { errorText, micErrorText } from './error-text'

describe('errorText', () => {
  it('Error / chuỗi → message', () => {
    expect(errorText(new Error('Quota exceeded'))).toBe('Quota exceeded')
    expect(errorText('  mất mạng ')).toBe('mất mạng')
  })

  it('object thường (lỗi đi qua IPC) → không bao giờ ra "[object Object]"', () => {
    expect(errorText({ name: 'NotFoundError', message: 'Requested device not found' })).toBe(
      'Requested device not found'
    )
    expect(errorText({ name: 'NotFoundError' })).toBe('NotFoundError')
    expect(errorText({ code: 8 })).toBe('{"code":8}')
    for (const empty of [{}, null, undefined, '']) {
      expect(errorText(empty)).toBe('Lỗi không rõ')
    }
    const loop: Record<string, unknown> = {}
    loop.self = loop
    expect(errorText(loop)).toBe('Lỗi không rõ')
  })
})

describe('micErrorText', () => {
  it('lỗi getUserMedia → nguyên nhân + việc cần làm', () => {
    expect(micErrorText({ name: 'NotFoundError', message: 'Requested device not found' })).toContain(
      'Không tìm thấy micro'
    )
    expect(micErrorText({ name: 'OverconstrainedError' })).toContain('Cài đặt → Chiều đi')
    expect(micErrorText({ name: 'NotAllowedError', message: 'Permission denied' })).toContain(
      'quyền micro'
    )
    expect(micErrorText({ name: 'NotReadableError', message: 'Could not start audio source' })).toBe(
      'Không mở được micro, có thể app khác đang giữ (Could not start audio source).'
    )
  })

  it('lỗi khác → giữ nguyên nội dung', () => {
    expect(micErrorText(new Error('Không lấy được tín hiệu từ micro'))).toBe(
      'Không lấy được tín hiệu từ micro'
    )
  })
})
