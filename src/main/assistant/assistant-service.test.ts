import { tmpdir } from 'node:os'
import { describe, expect, it, vi } from 'vitest'
import type { AppSettings, SubtitleSegment } from '../../shared/types'
import type { FlashRequest, FlashResult } from '../gemini/flash'
import { DEFAULT_SETTINGS } from '../settings'
import type { TranscriptInput } from '../summary/summarizer'
import { AssistantService, type AssistantServiceDeps } from './assistant-service'

vi.mock('electron', () => ({ app: { getPath: () => tmpdir() } }))

const T0 = new Date(2026, 10, 6, 14, 0, 0).getTime()

function seg(at: number, source: string, target: string, pauseEndedAt?: number): SubtitleSegment {
  return {
    id: `s${at}`,
    startedAt: at,
    source: { text: source, final: true },
    target: { text: target, final: true },
    ...(pauseEndedAt !== undefined ? { pauseEndedAt } : {})
  }
}

const transcript: TranscriptInput = {
  incoming: {
    startedAt: T0,
    endedAt: T0 + 600_000,
    segments: [seg(T0 + 60_000, '納期は金曜日です', 'Hạn là thứ 6')]
  },
  outgoing: [{ segments: [seg(T0 + 120_000, 'Tôi đồng ý', '賛成です')] }]
}

const settings: AppSettings = {
  ...DEFAULT_SETTINGS,
  summaryModel: 'm-test',
  targetLanguage: 'vi',
  outgoingTargetLanguage: 'ja'
}

function setup(
  overrides: Partial<AssistantServiceDeps> = {},
  result: FlashResult | Error = {
    text: 'Thứ 6 (lúc 14:01)',
    usage: { inputTokens: 1_000_000, outputTokens: 0 }
  }
) {
  const generate = vi.fn(async (_req: FlashRequest): Promise<FlashResult> => {
    if (result instanceof Error) throw result
    return result
  })
  const onCost = vi.fn()
  const svc = new AssistantService({
    getApiKey: () => 'k',
    getSettings: () => settings,
    getTranscript: () => transcript,
    budgetError: () => null,
    onCost,
    generate,
    now: () => T0 + 600_000,
    ...overrides
  })
  return { svc, generate, onCost }
}

describe('AssistantService: điều kiện trước khi gọi model', () => {
  it('thiếu API key / chạm giới hạn / chưa có lời → báo lỗi, không gọi model', async () => {
    const cases: [Partial<AssistantServiceDeps>, string][] = [
      [{ getApiKey: () => null }, 'Chưa cấu hình Gemini API key.'],
      [{ budgetError: () => 'Đã chạm giới hạn' }, 'Đã chạm giới hạn'],
      [{ getTranscript: () => null }, 'Chưa có nội dung cuộc họp'],
      [
        {
          getTranscript: () => ({
            incoming: { startedAt: T0, endedAt: T0 + 1, segments: [seg(T0, '', '', T0 + 9)] },
            outgoing: []
          })
        },
        'Chưa có nội dung cuộc họp'
      ]
    ]
    for (const [deps, error] of cases) {
      const { svc, generate } = setup(deps)
      expect((await svc.ask('Hạn?', [])).error).toContain(error)
      expect((await svc.suggestReplies()).error).toContain(error)
      expect(generate).not.toHaveBeenCalled()
    }
  })

  it('câu hỏi rỗng / quá dài bị từ chối', async () => {
    const { svc, generate } = setup()
    expect(await svc.ask('   ', [])).toEqual({ ok: false, error: 'Nhập câu hỏi trước đã.' })
    expect((await svc.ask('x'.repeat(501), [])).error).toContain('quá dài')
    expect(await svc.ask(42, [])).toEqual({ ok: false, error: 'Nhập câu hỏi trước đã.' })
    expect(generate).not.toHaveBeenCalled()
  })
})

describe('AssistantService.ask', () => {
  it('gửi transcript 2 chiều + lượt trước, ghi chi phí, trả câu trả lời', async () => {
    const { svc, generate, onCost } = setup()
    const r = await svc.ask('  Hạn là ngày nào? ', [
      { question: 'Ai phụ trách?', answer: 'Anh Tanaka' },
      { bogus: true }
    ])
    expect(r).toEqual({ ok: true, answer: 'Thứ 6 (lúc 14:01)' })
    const req = generate.mock.calls[0][0]
    expect(req).toMatchObject({ apiKey: 'k', model: 'm-test', fast: true, temperature: 0.3 })
    expect(req.jsonSchema).toBeUndefined()
    expect(req.prompt).toContain('[14:01] Meeting: 納期は金曜日です (dịch: Hạn là thứ 6)')
    expect(req.prompt).toContain('[14:02] Tôi: Tôi đồng ý (dịch: 賛成です)')
    expect(req.prompt).toContain('Hỏi: Ai phụ trách?\nĐáp: Anh Tanaka')
    expect(req.prompt).toContain('--- CÂU HỎI ---\nHạn là ngày nào?')
    expect(req.prompt).toContain('Bây giờ là 14:10.')
    expect(onCost).toHaveBeenCalledWith(expect.closeTo(1.5, 6))
  })

  it('model trả về rỗng → lỗi nhưng vẫn ghi chi phí', async () => {
    const { svc, onCost } = setup({}, { text: '', usage: { inputTokens: 1000, outputTokens: 0 } })
    expect(await svc.ask('Hạn?', [])).toEqual({ ok: false, error: 'Model không trả lời, thử hỏi lại.' })
    expect(onCost).toHaveBeenCalledTimes(1)
  })

  it('lỗi API → message ngắn, không ghi chi phí', async () => {
    const { svc, onCost } = setup(
      {},
      new Error('{"error":{"code":429,"message":"Quota exceeded","status":"RESOURCE_EXHAUSTED"}}')
    )
    expect(await svc.ask('Hạn?', [])).toEqual({ ok: false, error: 'Quota exceeded' })
    expect(onCost).not.toHaveBeenCalled()
  })
})

describe('AssistantService.suggestReplies', () => {
  it('JSON hợp lệ → gợi ý + ngôn ngữ chiều đi', async () => {
    const { svc, generate, onCost } = setup(
      {},
      {
        text: '{"asked":"Kịp thứ 6 không?","suggestions":[{"text":"Kịp ạ","translation":"間に合います"}]}',
        usage: { inputTokens: 0, outputTokens: 1_000_000 }
      }
    )
    expect(await svc.suggestReplies()).toEqual({
      ok: true,
      asked: 'Kịp thứ 6 không?',
      suggestions: [{ text: 'Kịp ạ', translation: '間に合います' }],
      replyLanguage: 'ja'
    })
    const req = generate.mock.calls[0][0]
    expect(req.jsonSchema).toBeDefined()
    expect(req.fast).toBe(true)
    expect(req.prompt).toContain('--- ĐOẠN GẦN NHẤT ---')
    expect(req.prompt).toContain('Tiếng Nhật')
    expect(onCost).toHaveBeenCalledWith(expect.closeTo(7.5, 6))
  })

  it('JSON hỏng → lỗi dễ hiểu, vẫn ghi chi phí', async () => {
    const { svc, onCost } = setup({}, { text: 'xin lỗi', usage: { inputTokens: 10, outputTokens: 10 } })
    expect(await svc.suggestReplies()).toEqual({
      ok: false,
      error: 'Model trả về gợi ý không đọc được, thử lại.'
    })
    expect(onCost).toHaveBeenCalledTimes(1)
  })
})
