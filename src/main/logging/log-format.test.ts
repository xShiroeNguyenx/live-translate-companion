import { describe, expect, it } from 'vitest'
import { formatLogArg, formatLogLine, redactSecrets } from './log-format'

// key giả sinh lúc chạy — không nhúng chuỗi trông như key thật vào repo
const fakeKey = `AIza${'x'.repeat(35)}`

describe('redactSecrets', () => {
  it('che Google API key ở bất cứ đâu trong chuỗi', () => {
    const out = redactSecrets(`lỗi khi gọi với ${fakeKey} xong`)
    expect(out).not.toContain(fakeKey)
    expect(out).toContain('[đã che]')
  })

  it('che key trong query string, giữ phần còn lại của URL', () => {
    const out = redactSecrets('wss://example.com/ws?key=abc123SECRET&alt=sse')
    expect(out).toBe('wss://example.com/ws?key=[đã che]&alt=sse')
  })

  it('che header x-goog-api-key và Authorization', () => {
    expect(redactSecrets('{"x-goog-api-key":"abc123SECRET"}')).not.toContain('abc123SECRET')
    expect(redactSecrets('Authorization: Bearer abcdef123456.tok')).not.toContain('abcdef123456')
  })

  it('không đụng tới chữ thường', () => {
    const text = 'Sẽ kết nối lại sau 2000 ms — WebSocket đóng (1006)'
    expect(redactSecrets(text)).toBe(text)
  })
})

describe('formatLogArg', () => {
  it('Error → có tên và message', () => {
    expect(formatLogArg(new TypeError('hỏng'))).toContain('TypeError: hỏng')
  })

  it('object → JSON; object vòng không làm vỡ', () => {
    expect(formatLogArg({ a: 1 })).toBe('{"a":1}')
    const loop: Record<string, unknown> = {}
    loop.self = loop
    expect(formatLogArg(loop)).toBe('[object Object]')
  })

  it('chuỗi quá dài bị cắt', () => {
    expect(formatLogArg('x'.repeat(5000)).length).toBeLessThan(2100)
  })
})

describe('formatLogLine', () => {
  const at = new Date('2026-11-13T09:15:02.123Z')

  it('mốc thời gian ISO + mức + nội dung', () => {
    expect(formatLogLine(at, 'warn', ['Sẽ kết nối lại sau', 2000, 'ms'])).toBe(
      '2026-11-13T09:15:02.123Z [warn] Sẽ kết nối lại sau 2000 ms'
    )
  })

  it('che key cả khi nó nằm trong Error', () => {
    const line = formatLogLine(at, 'error', ['lỗi:', new Error(`403 for ?key=${fakeKey}`)])
    expect(line).not.toContain(fakeKey)
  })

  it('nội dung nhiều dòng được thụt vào, không tạo mục log giả', () => {
    const line = formatLogLine(at, 'error', ['a\nb'])
    expect(line.split('\n')[1]).toBe('    b')
  })
})
