import { describe, expect, it } from 'vitest'
import { estimateHistoryAskUsd } from './cost'

describe('estimateHistoryAskUsd', () => {
  it('tăng theo độ dài transcript; họp ~30 phút (~40k ký tự) ≈ 3 cent', () => {
    const short = estimateHistoryAskUsd(5_000)
    const meeting = estimateHistoryAskUsd(40_000)
    expect(meeting).toBeGreaterThan(short)
    expect(meeting).toBeGreaterThan(0.02)
    expect(meeting).toBeLessThan(0.04)
  })

  it('transcript rỗng / số âm → vẫn còn phần hướng dẫn + trả lời, không âm', () => {
    expect(estimateHistoryAskUsd(0)).toBeGreaterThan(0)
    expect(estimateHistoryAskUsd(-10)).toBe(estimateHistoryAskUsd(0))
  })
})
