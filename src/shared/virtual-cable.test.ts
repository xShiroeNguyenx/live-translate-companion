import { describe, expect, it } from 'vitest'
import type { PlaybackSinkState } from './types'
import { directMicBlocker, isVirtualCable } from './virtual-cable'

const sink = (patch: Partial<PlaybackSinkState>): PlaybackSinkState => ({
  ok: true,
  deviceId: 'id',
  label: 'CABLE Input (VB-Audio Virtual Cable)',
  isCaptured: false,
  ...patch
})

describe('isVirtualCable', () => {
  it('nhận cả CABLE Input và biến thể 16 kênh', () => {
    expect(isVirtualCable('CABLE Input (VB-Audio Virtual Cable)')).toBe(true)
    expect(isVirtualCable('CABLE In 16ch (VB-Audio Virtual Cable)')).toBe(true)
    expect(isVirtualCable('Communications - CABLE In 16ch (VB-Audio Virtual Cable)')).toBe(true)
  })

  it('loa thật và CABLE Output không phải mic ảo', () => {
    expect(isVirtualCable('Speakers (Realtek(R) Audio)')).toBe(false)
    expect(isVirtualCable('CABLE Output (VB-Audio Virtual Cable)')).toBe(false)
    expect(isVirtualCable('')).toBe(false)
  })
})

describe('directMicBlocker', () => {
  it('mic ảo route được → cho bật', () => {
    expect(directMicBlocker(sink({}))).toBeNull()
  })

  it('không route được → nói rõ lỗi của thiết bị', () => {
    expect(directMicBlocker(sink({ ok: false, error: 'NotFoundError' }))).toContain('NotFoundError')
  })

  it('loa thật → chặn và nêu tên thiết bị', () => {
    const reason = directMicBlocker(sink({ label: 'Speakers (Realtek(R) Audio)' }))
    expect(reason).toContain('Speakers (Realtek(R) Audio)')
    expect(reason).toContain('hú')
  })
})
