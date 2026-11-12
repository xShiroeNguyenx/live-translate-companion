import { tmpdir } from 'node:os'
import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest'
import type { AppSettings, PlaybackSinkState, TypedSpeechState } from '../../shared/types'
import type { FlashRequest, FlashResult } from '../gemini/flash'
import type { TtsRequest, TtsResult } from '../gemini/tts'
import { DEFAULT_SETTINGS } from '../settings'
import { TypedSpeechService, type TypedSpeechDeps } from './typed-speech'

vi.mock('electron', () => ({ app: { getPath: () => tmpdir() } }))

const settings: AppSettings = {
  ...DEFAULT_SETTINGS,
  outgoingTargetLanguage: 'ja',
  outgoingDeviceId: 'cable-id',
  outgoingDeviceLabel: 'CABLE Input (VB-Audio Virtual Cable)',
  typedSpeechVoice: 'Charon',
  meetingContext: 'Dự án Sakura'
}

const SINK_OK: PlaybackSinkState = {
  ok: true,
  deviceId: 'cable-id',
  label: 'CABLE Input (VB-Audio Virtual Cable)',
  isCaptured: false
}

// 1 giây audio 24 kHz mono 16-bit
const PCM = Buffer.alloc(48000)

function deferred<T>() {
  let resolve!: (v: T) => void
  let reject!: (e: unknown) => void
  const promise = new Promise<T>((res, rej) => {
    resolve = res
    reject = rej
  })
  return { promise, resolve, reject }
}

function setup(overrides: Partial<TypedSpeechDeps> = {}) {
  const generate = vi.fn(
    async (_req: FlashRequest): Promise<FlashResult> => ({
      text: '賛成です。',
      usage: { inputTokens: 1_000_000, outputTokens: 0 }
    })
  )
  const synthesize = vi.fn(
    async (_req: TtsRequest): Promise<TtsResult> => ({
      pcm: PCM,
      durationMs: 1000,
      usage: { inputTokens: 0, outputTokens: 1_000_000 }
    })
  )
  const deps = {
    getApiKey: () => 'k' as string | null,
    getSettings: () => settings,
    budgetError: () => null as string | null,
    onCost: vi.fn(),
    prepareSink: vi.fn(async () => SINK_OK),
    play: vi.fn(),
    flush: vi.fn(),
    release: vi.fn(),
    onSpoken: vi.fn(),
    generate,
    synthesize,
    ...overrides
  }
  const svc = new TypedSpeechService(deps)
  const states: TypedSpeechState[] = []
  svc.on('state', (s: TypedSpeechState) => states.push(s))
  return { svc, deps, generate, synthesize, states }
}

describe('TypedSpeechService.translate', () => {
  it('dịch sang ngôn ngữ đích chiều đi bằng Flash-lite, kèm ngữ cảnh; ghi chi phí', async () => {
    const { svc, generate, deps } = setup()
    expect(await svc.translate('  Tôi đồng ý.  ')).toEqual({ ok: true, translation: '賛成です。' })
    const req = generate.mock.calls[0][0]
    expect(req.model).toBe('gemini-flash-lite-latest')
    expect(req.prompt).toContain('Japanese (ja)')
    expect(req.prompt).toContain('Dự án Sakura')
    expect(req.prompt).toContain('MESSAGE:\nTôi đồng ý.')
    // 1 triệu token vào × $0.30
    expect(deps.onCost).toHaveBeenCalledWith(expect.closeTo(0.3))
  })

  it('rỗng / quá dài / thiếu key / chạm giới hạn → báo lỗi, không gọi model', async () => {
    const cases: [unknown, Partial<TypedSpeechDeps>, string][] = [
      ['   ', {}, 'Gõ câu cần nói'],
      [42, {}, 'Gõ câu cần nói'],
      ['a'.repeat(601), {}, 'quá dài'],
      ['Xin chào', { getApiKey: () => null }, 'API key'],
      ['Xin chào', { budgetError: () => 'Đã chạm giới hạn' }, 'Đã chạm giới hạn']
    ]
    for (const [text, overrides, error] of cases) {
      const { svc, generate } = setup(overrides)
      const r = await svc.translate(text)
      expect(r.ok).toBe(false)
      expect(r.error).toContain(error)
      expect(generate).not.toHaveBeenCalled()
    }
  })

  it('model lỗi / trả rỗng → lỗi ngắn gọn; trả rỗng vẫn tính tiền', async () => {
    const failing = setup({
      generate: vi.fn(async () => {
        throw new Error('{"error":{"message":"API key not valid."}}')
      })
    })
    expect(await failing.svc.translate('Xin chào')).toEqual({
      ok: false,
      error: 'API key not valid.'
    })

    const empty = setup({
      generate: vi.fn(async () => ({ text: '', usage: { inputTokens: 10, outputTokens: 0 } }))
    })
    expect((await empty.svc.translate('Xin chào')).ok).toBe(false)
    expect(empty.deps.onCost).toHaveBeenCalledTimes(1)
  })
})

describe('TypedSpeechService.speak', () => {
  beforeEach(() => vi.useFakeTimers())
  afterEach(() => vi.useRealTimers())

  it('tạo giọng → route xong mới phát → ghi transcript → hết audio thì nhả player', async () => {
    const { svc, deps, synthesize, states } = setup()
    const r = await svc.speak(' 賛成です。 ', 'Tôi đồng ý.')
    expect(r).toEqual({ ok: true, durationMs: 1000 })
    expect(synthesize.mock.calls[0][0]).toMatchObject({ text: '賛成です。', voice: 'Charon' })
    // 1 triệu token audio ra × $18
    expect(deps.onCost).toHaveBeenCalledWith(expect.closeTo(18))
    expect(vi.mocked(deps.prepareSink).mock.invocationCallOrder[0]).toBeLessThan(
      vi.mocked(deps.play).mock.invocationCallOrder[0]
    )
    expect(deps.play).toHaveBeenCalledWith(PCM)
    expect(deps.onSpoken).toHaveBeenCalledWith('Tôi đồng ý.', '賛成です。')
    expect(svc.isPlaying()).toBe(true)
    expect(deps.release).not.toHaveBeenCalled()

    vi.advanceTimersByTime(1000 + 399)
    expect(svc.isPlaying()).toBe(true)
    vi.advanceTimersByTime(1)
    expect(svc.getState()).toBe('idle')
    expect(deps.release).toHaveBeenCalledTimes(1)
    expect(deps.flush).not.toHaveBeenCalled()
    expect(states).toEqual(['synthesizing', 'playing', 'idle'])
  })

  it('chưa chọn thiết bị “Phát vào” → từ chối, không tốn tiền tạo giọng', async () => {
    const { svc, synthesize } = setup({
      getSettings: () => ({ ...settings, outgoingDeviceId: '' })
    })
    const r = await svc.speak('賛成です。', '')
    expect(r.ok).toBe(false)
    expect(r.error).toContain('Phát vào')
    expect(synthesize).not.toHaveBeenCalled()
  })

  it('không route được tới thiết bị → KHÔNG phát, báo tên thiết bị + nguyên nhân, nhả player', async () => {
    const { svc, deps } = setup({
      prepareSink: vi.fn(async () => ({
        ok: false,
        deviceId: 'cable-id',
        label: '',
        isCaptured: true,
        error: 'Không tìm thấy thiết bị phát đã chọn'
      }))
    })
    const r = await svc.speak('賛成です。', 'Tôi đồng ý.')
    expect(r.ok).toBe(false)
    expect(r.error).toContain('CABLE Input')
    expect(r.error).toContain('Không tìm thấy thiết bị phát đã chọn')
    expect(deps.play).not.toHaveBeenCalled()
    expect(deps.onSpoken).not.toHaveBeenCalled()
    expect(deps.release).toHaveBeenCalledTimes(1)
    expect(svc.getState()).toBe('idle')
  })

  it('engine chưa sẵn sàng (prepareSink ném lỗi) → coi như không route được', async () => {
    const { svc, deps } = setup({
      prepareSink: vi.fn(async () => {
        throw new Error('Engine chưa sẵn sàng')
      })
    })
    const r = await svc.speak('賛成です。', '')
    expect(r.error).toContain('Engine chưa sẵn sàng')
    expect(deps.play).not.toHaveBeenCalled()
  })

  it('tạo giọng lỗi → về idle, báo lỗi, không đụng tới player', async () => {
    const { svc, deps } = setup({
      synthesize: vi.fn(async () => {
        throw new Error('Quota exceeded')
      })
    })
    expect(await svc.speak('賛成です。', '')).toEqual({ ok: false, error: 'Quota exceeded' })
    expect(svc.getState()).toBe('idle')
    expect(deps.prepareSink).not.toHaveBeenCalled()
    expect(deps.release).not.toHaveBeenCalled()
  })

  it('đang phát thì không nhận câu mới', async () => {
    const { svc, synthesize } = setup()
    await svc.speak('一つ目。', '')
    const r = await svc.speak('二つ目。', '')
    expect(r.ok).toBe(false)
    expect(r.error).toContain('Đang phát')
    expect(synthesize).toHaveBeenCalledTimes(1)
  })

  it('Dừng khi đang phát → cắt tiếng, nhả player, không chờ hết audio', async () => {
    const { svc, deps } = setup()
    await svc.speak('賛成です。', '')
    svc.stop()
    expect(deps.flush).toHaveBeenCalledTimes(1)
    expect(deps.release).toHaveBeenCalledTimes(1)
    expect(svc.getState()).toBe('idle')
    // timer cũ đã huỷ → không nhả lần 2
    vi.advanceTimersByTime(5000)
    expect(deps.release).toHaveBeenCalledTimes(1)
  })

  it('Dừng khi đang chờ model → kết quả về muộn bị bỏ, không phát', async () => {
    const pending = deferred<TtsResult>()
    const { svc, deps } = setup({ synthesize: vi.fn(() => pending.promise) })
    const speaking = svc.speak('賛成です。', '')
    expect(svc.getState()).toBe('synthesizing')
    svc.stop()
    expect(svc.getState()).toBe('idle')
    pending.resolve({ pcm: PCM, durationMs: 1000, usage: { inputTokens: 1, outputTokens: 25 } })
    expect(await speaking).toMatchObject({ ok: false, stopped: true })
    expect(deps.prepareSink).not.toHaveBeenCalled()
    expect(deps.play).not.toHaveBeenCalled()
    expect(deps.flush).not.toHaveBeenCalled()
    // model vẫn tính tiền cho audio đã tạo
    expect(deps.onCost).toHaveBeenCalledTimes(1)
  })

  it('Dừng trong lúc đang route → không phát', async () => {
    const routing = deferred<PlaybackSinkState>()
    const { svc, deps } = setup({ prepareSink: vi.fn(() => routing.promise) })
    const speaking = svc.speak('賛成です。', '')
    await vi.waitFor(() => expect(svc.getState()).toBe('playing'))
    svc.stop()
    routing.resolve(SINK_OK)
    expect(await speaking).toMatchObject({ ok: false, stopped: true })
    expect(deps.play).not.toHaveBeenCalled()
    expect(deps.release).toHaveBeenCalledTimes(1)
  })

  it('đã tạo sẵn giọng (prepare) → Phát dùng lại, không gọi model lần 2; phát lại cũng không tốn', async () => {
    const { svc, deps, synthesize } = setup()
    expect(await svc.prepare(' 賛成です。 ')).toEqual({ ok: true, durationMs: 1000 })
    // tạo sẵn không đụng tới player, không đổi trạng thái
    expect(svc.getState()).toBe('idle')
    expect(deps.prepareSink).not.toHaveBeenCalled()

    expect((await svc.speak('賛成です。', 'Tôi đồng ý.')).ok).toBe(true)
    vi.advanceTimersByTime(2000)
    expect((await svc.speak('賛成です。', 'Tôi đồng ý.')).ok).toBe(true)
    expect(synthesize).toHaveBeenCalledTimes(1)
    expect(deps.onCost).toHaveBeenCalledTimes(1)
    expect(deps.play).toHaveBeenCalledTimes(2)
  })

  it('bấm Phát khi đang tạo sẵn dở → chờ chung 1 lần gọi model', async () => {
    const pending = deferred<TtsResult>()
    const synthesize = vi.fn(() => pending.promise)
    const { svc, deps } = setup({ synthesize })
    const preparing = svc.prepare('賛成です。')
    const speaking = svc.speak('賛成です。', '')
    pending.resolve({ pcm: PCM, durationMs: 1000, usage: { inputTokens: 1, outputTokens: 25 } })
    expect((await preparing).ok).toBe(true)
    expect((await speaking).ok).toBe(true)
    expect(synthesize).toHaveBeenCalledTimes(1)
    expect(deps.play).toHaveBeenCalledTimes(1)
  })

  it('sửa câu hoặc đổi giọng → tạo giọng mới', async () => {
    let voice = 'Charon'
    const { svc, synthesize } = setup({
      // synthesize mặc định của setup()
      getSettings: () => ({ ...settings, typedSpeechVoice: voice })
    })
    await svc.prepare('賛成です。')
    await svc.prepare('賛成です。')
    expect(synthesize).toHaveBeenCalledTimes(1)
    await svc.prepare('賛成いたします。')
    voice = 'Kore'
    await svc.prepare('賛成いたします。')
    expect(synthesize).toHaveBeenCalledTimes(3)
  })

  it('tạo sẵn lỗi → báo lỗi, lần sau gọi lại model (không giữ lỗi)', async () => {
    const synthesize = vi
      .fn<(req: TtsRequest) => Promise<TtsResult>>()
      .mockRejectedValueOnce(new Error('Quota exceeded'))
      .mockResolvedValueOnce({
        pcm: PCM,
        durationMs: 1000,
        usage: { inputTokens: 1, outputTokens: 25 }
      })
    const { svc } = setup({ synthesize })
    expect(await svc.prepare('賛成です。')).toEqual({ ok: false, error: 'Quota exceeded' })
    expect((await svc.speak('賛成です。', '')).ok).toBe(true)
    expect(synthesize).toHaveBeenCalledTimes(2)
  })

  it('phát xong thì phát được câu tiếp theo', async () => {
    const { svc, deps } = setup()
    await svc.speak('一つ目。', '')
    vi.advanceTimersByTime(2000)
    expect((await svc.speak('二つ目。', '')).ok).toBe(true)
    expect(deps.play).toHaveBeenCalledTimes(2)
  })
})
