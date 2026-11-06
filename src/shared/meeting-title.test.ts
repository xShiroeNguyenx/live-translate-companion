import { describe, expect, it } from 'vitest'
import { MAX_TITLE_CHARS, meetingTitleOf, normalizeTitle, splitSummaryTitle } from './meeting-title'

describe('normalizeTitle', () => {
  it('gộp khoảng trắng, bỏ ký tự điều khiển, cắt độ dài', () => {
    expect(normalizeTitle('  Họp   tiến độ\n\tsprint 3 ')).toBe('Họp tiến độ sprint 3')
    expect(normalizeTitle('a'.repeat(200))).toHaveLength(MAX_TITLE_CHARS)
    expect(normalizeTitle('   ')).toBe('')
    expect(normalizeTitle(42)).toBe('')
    expect(normalizeTitle(undefined)).toBe('')
  })
})

describe('meetingTitleOf', () => {
  it('tên người dùng đặt > tên AI đặt > rỗng', () => {
    expect(meetingTitleOf({ title: 'Họp khách', autoTitle: 'AI' })).toBe('Họp khách')
    expect(meetingTitleOf({ title: '  ', autoTitle: 'Báo cáo tuần' })).toBe('Báo cáo tuần')
    expect(meetingTitleOf({})).toBe('')
  })
})

describe('splitSummaryTitle', () => {
  it('tách dòng "# tên" ở đầu, bỏ dòng trống theo sau', () => {
    expect(splitSummaryTitle('# Họp chốt hạn giao hàng\n\n## Tóm tắt\n- a')).toEqual({
      title: 'Họp chốt hạn giao hàng',
      body: '## Tóm tắt\n- a'
    })
  })

  it('bỏ dấu ngoặc/in đậm quanh tên', () => {
    expect(splitSummaryTitle('# **"Báo cáo tuần"**\n## Tóm tắt').title).toBe('Báo cáo tuần')
  })

  it('không có dòng "# " (tóm tắt cũ) → giữ nguyên', () => {
    const old = '## Tóm tắt\n- a'
    expect(splitSummaryTitle(old)).toEqual({ title: '', body: old })
    expect(splitSummaryTitle('')).toEqual({ title: '', body: '' })
    expect(splitSummaryTitle('#\n## Tóm tắt')).toEqual({ title: '', body: '#\n## Tóm tắt' })
  })
})
