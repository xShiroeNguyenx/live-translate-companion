import { describe, expect, it } from 'vitest'
import { describeUpdateError } from './update-error'

describe('describeUpdateError', () => {
  it('release chưa có latest.yml (CI đang upload) → tạm thời, câu ngắn', () => {
    const raw =
      'Cannot find latest.yml in the latest release artifacts (https://github.com/o/r/releases/download/v1.0.0/latest.yml): HttpError: 404 "method: GET url: …"\n' +
      'Headers: { "cache-control": "no-cache" }\n    at createHttpError (C:\\Program Files\\App\\resources\\app.asar\\x.js:53:12)'
    const info = describeUpdateError(raw)
    expect(info.transient).toBe(true)
    expect(info.message).toContain('đang được đăng')
    expect(info.message).not.toContain('Headers')
  })

  it('lỗi mạng / 5xx → tạm thời', () => {
    expect(describeUpdateError('getaddrinfo ENOTFOUND github.com').transient).toBe(true)
    expect(describeUpdateError('net::ERR_INTERNET_DISCONNECTED').transient).toBe(true)
    expect(describeUpdateError('HttpError: 503 Service Unavailable').transient).toBe(true)
  })

  it('lỗi khác → không tạm thời, chỉ giữ dòng đầu và cắt ngắn', () => {
    const info = describeUpdateError(`sha512 checksum mismatch\n    at verify (x.js:1:1)`)
    expect(info).toEqual({ message: 'sha512 checksum mismatch', transient: false })
    expect(describeUpdateError('x'.repeat(500)).message).toHaveLength(201)
    expect(describeUpdateError('').message).toBe('Lỗi không rõ')
  })
})
