import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest'
import { TEXT_TRANSLATE_FAILED_MARK } from '../../shared/constants'
import { SegmentTranslator, type TranslateRequest, type TranslateResult } from './segment-translator'

interface Deferred {
  req: TranslateRequest
  resolve(r: TranslateResult): void
  reject(e: Error): void
}

function setup(opts: { concurrency?: number; errorStreak?: number; contextSegments?: number } = {}) {
  const calls: Deferred[] = []
  const results: Array<[string, string]> = []
  const errors: Array<string | null> = []
  let cost = 0
  const translator = new SegmentTranslator({
    translate: (req) =>
      new Promise<TranslateResult>((resolve, reject) => calls.push({ req, resolve, reject })),
    onResult: (id, text) => results.push([id, text]),
    onCost: (usd) => (cost += usd),
    onErrorStreak: (m) => errors.push(m),
    concurrency: opts.concurrency ?? 2,
    errorStreak: opts.errorStreak ?? 2,
    contextSegments: opts.contextSegments ?? 2,
    retryDelayMs: 10
  })
  return { translator, calls, results, errors, cost: () => cost }
}

const flush = (): Promise<void> => vi.advanceTimersByTimeAsync(0).then(() => undefined)

describe('SegmentTranslator', () => {
  beforeEach(() => vi.useFakeTimers())
  afterEach(() => vi.useRealTimers())

  it('chạy song song có giới hạn; kết quả lệch thứ tự vẫn điền đúng id', async () => {
    const { translator, calls, results } = setup({ concurrency: 2 })
    translator.enqueue('a', 'One.')
    translator.enqueue('b', 'Two.')
    translator.enqueue('c', 'Three.')
    expect(calls).toHaveLength(2)
    expect(translator.pending()).toBe(3)

    calls[1].resolve({ text: ' Hai. ', costUsd: 0.001 })
    await flush()
    expect(results).toEqual([['b', 'Hai.']])
    expect(calls).toHaveLength(3) // ô trống → chạy câu thứ 3

    calls[0].resolve({ text: 'Một.', costUsd: 0.001 })
    calls[2].resolve({ text: 'Ba.', costUsd: 0.001 })
    await flush()
    expect(results).toEqual([
      ['b', 'Hai.'],
      ['a', 'Một.'],
      ['c', 'Ba.']
    ])
    expect(translator.pending()).toBe(0)
  })

  it('gửi kèm các câu gốc trước đó làm ngữ cảnh (tối đa contextSegments)', () => {
    const { translator, calls } = setup({ concurrency: 5, contextSegments: 2 })
    translator.enqueue('a', 'One.')
    translator.enqueue('b', 'Two.')
    translator.enqueue('c', 'Three.')
    expect(calls.map((c) => c.req.previous)).toEqual([[], ['One.'], ['One.', 'Two.']])
  })

  it('câu rỗng không gửi đi', () => {
    const { translator, calls } = setup()
    translator.enqueue('a', '   ')
    expect(calls).toHaveLength(0)
  })

  it('cộng chi phí mỗi lần gọi, kể cả khi bản dịch rỗng', async () => {
    const { translator, calls, cost } = setup()
    translator.enqueue('a', 'One.')
    calls[0].resolve({ text: '', costUsd: 0.002 })
    await vi.advanceTimersByTimeAsync(20) // chờ thử lại
    calls[1].resolve({ text: 'Một.', costUsd: 0.003 })
    await flush()
    expect(cost()).toBeCloseTo(0.005)
  })

  it('lỗi → thử lại 1 lần; vẫn lỗi → điền dấu báo lỗi, không để trống', async () => {
    const { translator, calls, results } = setup({ errorStreak: 5 })
    translator.enqueue('a', 'One.')
    calls[0].reject(new Error('503'))
    await vi.advanceTimersByTimeAsync(20)
    expect(calls).toHaveLength(2)
    calls[1].reject(new Error('503'))
    await flush()
    expect(results).toEqual([['a', TEXT_TRANSLATE_FAILED_MARK]])
  })

  it('lỗi liên tiếp chạm ngưỡng → báo 1 lần; dịch lại được → báo hết lỗi', async () => {
    const { translator, calls, errors } = setup({ concurrency: 1, errorStreak: 2 })
    for (const id of ['a', 'b']) {
      translator.enqueue(id, `${id}.`)
      calls.at(-1)!.reject(new Error('API key not valid'))
      await vi.advanceTimersByTimeAsync(20)
      calls.at(-1)!.reject(new Error('API key not valid'))
      await flush()
    }
    expect(errors).toHaveLength(1)
    expect(errors[0]).toContain('API key not valid')

    translator.enqueue('c', 'c.')
    calls.at(-1)!.resolve({ text: 'ok', costUsd: 0 })
    await flush()
    expect(errors).toEqual([errors[0], null])
  })

  it('reset: bỏ hàng đợi, kết quả muộn của phiên cũ không điền nhưng chi phí vẫn ghi', async () => {
    const { translator, calls, results, cost } = setup({ concurrency: 1 })
    translator.enqueue('a', 'Old one.')
    translator.enqueue('b', 'Old two.')
    translator.reset()
    calls[0].resolve({ text: 'Cũ.', costUsd: 0.004 })
    await flush()
    expect(results).toEqual([])
    expect(cost()).toBeCloseTo(0.004)
    expect(calls).toHaveLength(1) // câu 'b' trong hàng đợi đã bị bỏ
    expect(translator.pending()).toBe(0)

    translator.enqueue('n', 'New.')
    expect(calls.at(-1)!.req.previous).toEqual([]) // ngữ cảnh phiên cũ không lọt sang
  })
})
