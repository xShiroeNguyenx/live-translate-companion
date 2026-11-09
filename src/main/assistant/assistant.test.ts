import { describe, expect, it } from 'vitest'
import type { HistoryRecord } from '../../shared/types'
import { transcriptLines, type TranscriptLine } from '../summary/summarizer'
import {
  buildAskPrompt,
  buildReplyPrompt,
  clampLines,
  historyTranscript,
  parseReplyResult,
  pastMeetingLabel,
  recentCutoff,
  sanitizeTurns,
  shortError
} from './assistant'

const T0 = new Date(2026, 10, 6, 14, 0, 0).getTime()
const MIN = 60_000

function line(minute: number, text: string, pause = false): TranscriptLine {
  return { at: T0 + minute * MIN, text, pause }
}

describe('clampLines', () => {
  const lines = [line(0, 'aaaa'), line(1, 'bbbb'), line(2, 'cccc')]

  it('đủ chỗ → giữ hết', () => {
    expect(clampLines(lines, 100)).toEqual({ lines, truncated: false })
  })

  it('thiếu chỗ → giữ phần cuối', () => {
    // mỗi dòng tốn 4 + 1 ký tự
    expect(clampLines(lines, 10)).toEqual({ lines: lines.slice(1), truncated: true })
  })

  it('1 dòng dài hơn giới hạn vẫn được giữ', () => {
    expect(clampLines(lines, 2)).toEqual({ lines: lines.slice(2), truncated: true })
    expect(clampLines([], 2)).toEqual({ lines: [], truncated: false })
  })
})

describe('recentCutoff', () => {
  it('đủ câu trong 3 phút cuối → mốc theo thời gian', () => {
    const lines = Array.from({ length: 10 }, (_, i) => line(20 + i * 0.25, `l${i}`))
    const now = T0 + 23 * MIN
    expect(recentCutoff(lines, now, 3 * MIN, 6)).toBe(now - 3 * MIN)
  })

  it('3 phút cuối vắng lời → lùi về đủ 6 câu có lời (bỏ qua mốc tạm dừng)', () => {
    const lines = [
      ...Array.from({ length: 8 }, (_, i) => line(i, `l${i}`)),
      line(9, 'pause', true)
    ]
    const now = T0 + 30 * MIN
    expect(recentCutoff(lines, now, 3 * MIN, 6)).toBe(T0 + 2 * MIN)
  })

  it('ít hơn 6 câu → lấy từ câu đầu tiên', () => {
    expect(recentCutoff([line(0, 'a'), line(1, 'b')], T0 + 60 * MIN, 3 * MIN, 6)).toBe(T0)
  })
})

describe('buildAskPrompt', () => {
  const base = {
    lines: [line(5, '[14:05] Meeting: 納期は金曜日 (dịch: Hạn là thứ 6)')],
    meetingContext: 'Dự án ABC',
    language: 'vi',
    now: T0 + 10 * MIN,
    maxChars: 10_000,
    question: 'Hạn là ngày nào?',
    previous: []
  }

  it('có câu hỏi, transcript, ngữ cảnh, giờ hiện tại, ngôn ngữ trả lời', () => {
    const p = buildAskPrompt(base)
    expect(p).toContain('--- CÂU HỎI ---\nHạn là ngày nào?')
    expect(p).toContain('Hạn là thứ 6')
    expect(p).toContain('Dự án ABC')
    expect(p).toContain('Bây giờ là 14:10.')
    expect(p).toContain('bằng Tiếng Việt')
    expect(p).not.toContain('CÁC CÂU HỎI TRƯỚC')
    expect(p).not.toContain('TẠM DỪNG DỊCH')
  })

  it('kèm lượt hỏi trước + giải thích mốc tạm dừng + ghi chú bị lược', () => {
    const p = buildAskPrompt({
      ...base,
      lines: [
        line(1, '[14:01] Meeting: ' + 'x'.repeat(50)),
        line(2, '[14:02] (TẠM DỪNG DỊCH 1 phút — đoạn này không có transcript)', true),
        line(5, '[14:05] Meeting: ok')
      ],
      // đủ cho dòng tạm dừng (~63) + dòng cuối (~20), không đủ cho dòng 'x' (~68)
      maxChars: 100,
      previous: [{ question: 'Ai phụ trách?', answer: 'Anh Tanaka (lúc 14:01)' }]
    })
    expect(p).toContain('Hỏi: Ai phụ trách?\nĐáp: Anh Tanaka (lúc 14:01)')
    expect(p).toContain('đừng suy đoán')
    expect(p).toContain('chỉ giữ phần từ 14:02 trở đi')
    expect(p).not.toContain('x'.repeat(50))
  })
})

describe('buildAskPrompt — hỏi về phiên đã lưu', () => {
  const base = {
    lines: [line(5, '[14:05] Meeting: 納期は金曜日 (dịch: Hạn là thứ 6)')],
    meetingContext: 'Dự án ABC',
    language: 'vi',
    now: T0 + 3 * 24 * 60 * MIN, // hỏi 3 ngày sau cuộc họp
    maxChars: 10_000,
    question: 'Hạn là ngày nào?',
    previous: [],
    past: { startedAt: T0, endedAt: T0 + 22 * MIN, title: 'Họp tiến độ', summary: '## Tóm tắt\n- Hạn thứ 6' }
  }

  it('nói rõ cuộc họp đã kết thúc (tên, ngày, giờ), không có "Bây giờ là"', () => {
    const p = buildAskPrompt(base)
    expect(p).toContain('ĐÃ KẾT THÚC: “Họp tiến độ”, ngày 06/11/2026, 14:00–14:22')
    expect(p).not.toContain('Bây giờ là')
    expect(p).not.toContain('đang diễn ra')
  })

  it('kèm bản tóm tắt để định hướng, nhắc đối chiếu transcript; transcript đứng sau', () => {
    const p = buildAskPrompt(base)
    expect(p).toContain('BẢN TÓM TẮT AI ĐÃ VIẾT TRƯỚC ĐÓ')
    expect(p).toContain('luôn đối chiếu với transcript')
    expect(p.indexOf('## Tóm tắt\n- Hạn thứ 6')).toBeLessThan(p.indexOf('--- TRANSCRIPT ---'))
  })

  it('ngữ cảnh trong Cài đặt có thể của cuộc họp khác → chỉ dùng như thuật ngữ', () => {
    const p = buildAskPrompt(base)
    expect(p).toContain('có thể được soạn cho cuộc họp khác')
    expect(p).toContain('Dự án ABC')
  })

  it('không tên / không tóm tắt → bỏ các phần đó; tóm tắt quá dài bị cắt', () => {
    const p = buildAskPrompt({ ...base, past: { startedAt: T0, endedAt: T0 + MIN } })
    expect(p).toContain('ĐÃ KẾT THÚC: ngày 06/11/2026, 14:00–14:01')
    expect(p).not.toContain('BẢN TÓM TẮT')
    const long = buildAskPrompt({ ...base, past: { ...base.past, summary: 'y'.repeat(20_000) } })
    expect(long).not.toContain('y'.repeat(8001))
    expect(long).toContain('y'.repeat(8000))
  })

  it('pastMeetingLabel', () => {
    expect(pastMeetingLabel({ startedAt: T0, endedAt: T0 + 90 * MIN, title: '  ' })).toBe(
      'ngày 06/11/2026, 14:00–15:30'
    )
  })
})

describe('historyTranscript', () => {
  function rec(direction: 'incoming' | 'outgoing', minute: number, src: string): HistoryRecord {
    return {
      id: `${direction}-${minute}`,
      direction,
      startedAt: T0,
      endedAt: T0 + 30 * MIN,
      targetLanguage: direction === 'incoming' ? 'vi' : 'ja',
      secondsSent: 1,
      costUsd: 0,
      transcriptFile: null,
      segments: [
        {
          id: 's',
          startedAt: T0 + minute * MIN,
          source: { text: src, final: true },
          target: { text: '', final: true }
        }
      ]
    }
  }

  it('phiên chiều về: lời họ là "Meeting", lời chiều đi cùng giờ là "Tôi"', () => {
    const lines = transcriptLines(
      historyTranscript(rec('incoming', 1, 'Họ nói'), [rec('outgoing', 2, 'Tôi nói')]),
      { clock: 'wall' }
    ).map((l) => l.text)
    expect(lines).toEqual(['[14:01] Meeting: Họ nói', '[14:02] Tôi: Tôi nói'])
  })

  it('phiên chiều đi: toàn bộ là "Tôi"', () => {
    const lines = transcriptLines(historyTranscript(rec('outgoing', 3, 'Tôi nói'), []), {
      clock: 'wall'
    }).map((l) => l.text)
    expect(lines).toEqual(['[14:03] Tôi: Tôi nói'])
  })
})

describe('buildReplyPrompt', () => {
  const lines = [
    line(0, '[14:00] Meeting: chuyện cũ'),
    ...Array.from({ length: 8 }, (_, i) => line(20 + i * 0.25, `[14:2${i}] Meeting: mới ${i}`))
  ]
  const base = {
    lines,
    meetingContext: '',
    language: 'vi',
    replyLanguage: 'ja',
    now: T0 + 23 * MIN,
    maxChars: 10_000,
    recentMs: 3 * MIN,
    recentMinLines: 6
  }

  it('tách bối cảnh cũ / đoạn gần nhất; song ngữ có kính ngữ tiếng Nhật', () => {
    const p = buildReplyPrompt(base)
    const older = p.indexOf('--- BỐI CẢNH TRƯỚC ĐÓ ---')
    const recent = p.indexOf('--- ĐOẠN GẦN NHẤT ---')
    expect(older).toBeGreaterThan(0)
    expect(recent).toBeGreaterThan(older)
    expect(p.indexOf('chuyện cũ')).toBeLessThan(recent)
    expect(p.indexOf('mới 0')).toBeGreaterThan(recent)
    expect(p).toContain('bằng Tiếng Nhật')
    expect(p).toContain('です/ます')
  })

  it('2 ngôn ngữ trùng → translation rỗng, không có bối cảnh cũ thì bỏ mục', () => {
    const p = buildReplyPrompt({ ...base, replyLanguage: 'vi', lines: lines.slice(1) })
    expect(p).toContain('"translation": để chuỗi rỗng')
    expect(p).not.toContain('です/ます')
    expect(p).not.toContain('BỐI CẢNH TRƯỚC ĐÓ')
  })
})

describe('parseReplyResult', () => {
  it('JSON thường và JSON bọc ```json', () => {
    const json = '{"asked":"Kịp thứ 6 không?","suggestions":[{"text":"Kịp ạ","translation":"間に合います"}]}'
    const expected = {
      asked: 'Kịp thứ 6 không?',
      suggestions: [{ text: 'Kịp ạ', translation: '間に合います' }]
    }
    expect(parseReplyResult(json)).toEqual(expected)
    expect(parseReplyResult('```json\n' + json + '\n```')).toEqual(expected)
  })

  it('bỏ mục hỏng, tối đa 5 gợi ý; không còn gợi ý nào hoặc JSON hỏng → null', () => {
    const many = Array.from({ length: 7 }, (_, i) => ({ text: `t${i}`, translation: '' }))
    const parsed = parseReplyResult(
      JSON.stringify({ suggestions: [null, { text: 1 }, { text: ' ', translation: '' }, ...many] })
    )
    expect(parsed?.asked).toBe('')
    expect(parsed?.suggestions.map((s) => s.text)).toEqual(['t0', 't1', 't2', 't3', 't4'])
    expect(parseReplyResult('{"asked":"x","suggestions":[]}')).toBeNull()
    expect(parseReplyResult('không phải JSON')).toBeNull()
    expect(parseReplyResult('null')).toBeNull()
  })
})

describe('sanitizeTurns', () => {
  it('lọc sai kiểu, giữ N lượt cuối, cắt độ dài', () => {
    const turns = sanitizeTurns(
      [
        { question: 'q1', answer: 'a1' },
        { question: 1, answer: 'x' },
        'rác',
        { question: 'q2', answer: 'a'.repeat(5000) },
        { question: 'q3', answer: 'a3' }
      ],
      2
    )
    expect(turns.map((t) => t.question)).toEqual(['q2', 'q3'])
    expect(turns[0].answer.length).toBe(2000)
    expect(sanitizeTurns('không phải mảng', 3)).toEqual([])
  })
})

describe('shortError', () => {
  it('lấy message trong JSON lỗi của Gemini', () => {
    const err = new Error(
      '{"error":{"code":429,"message":"You exceeded your current quota.\\nPlease retry.","status":"RESOURCE_EXHAUSTED"}}'
    )
    expect(shortError(err)).toBe('You exceeded your current quota. Please retry.')
  })

  it('dòng đầu, cắt 200 ký tự; rỗng → lỗi không rõ', () => {
    expect(shortError(new Error('fetch failed\n    at x'))).toBe('fetch failed')
    expect(shortError('y'.repeat(300))).toBe('y'.repeat(200) + '…')
    expect(shortError(new Error(''))).toBe('Lỗi không rõ')
  })
})
