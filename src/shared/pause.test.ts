import { describe, expect, it } from 'vitest'
import { countSpokenSegments, formatPauseDuration, isPauseMarker, pauseLabel, wallClock } from './pause'
import type { SubtitleSegment } from './types'

function seg(text: string, extra: Partial<SubtitleSegment> = {}): SubtitleSegment {
  return {
    id: text || 'x',
    startedAt: 0,
    source: { text, final: true },
    target: { text, final: true },
    ...extra
  }
}

describe('pause helpers', () => {
  it('formatPauseDuration bỏ phần bằng 0', () => {
    expect(formatPauseDuration(45_000)).toBe('45 giây')
    expect(formatPauseDuration(15 * 60_000)).toBe('15 phút')
    expect(formatPauseDuration(15 * 60_000 + 2_000)).toBe('15 phút 2 giây')
    expect(formatPauseDuration(65 * 60_000)).toBe('1 giờ 5 phút')
    expect(formatPauseDuration(2 * 3600_000)).toBe('2 giờ')
    expect(formatPauseDuration(-5)).toBe('0 giây')
  })

  it('wallClock theo giờ máy, có số 0 đứng đầu', () => {
    expect(wallClock(new Date(2026, 10, 6, 9, 5).getTime())).toBe('09:05')
  })

  it('pauseLabel ghi giờ dừng → giờ tiếp tục kèm thời lượng', () => {
    const from = new Date(2026, 10, 6, 14, 30).getTime()
    const marker = seg('', { startedAt: from, pauseEndedAt: from + 15 * 60_000 })
    expect(isPauseMarker(marker)).toBe(true)
    if (isPauseMarker(marker)) expect(pauseLabel(marker)).toBe('Tạm dừng 14:30 → 14:45 (15 phút)')
  })

  it('countSpokenSegments không đếm mốc tạm dừng và segment rỗng', () => {
    expect(
      countSpokenSegments([seg('a'), seg('', { pauseEndedAt: 1 }), seg(''), seg('b')])
    ).toBe(2)
    expect(isPauseMarker(seg('a'))).toBe(false)
  })
})
