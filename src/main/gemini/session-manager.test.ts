import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest'
import { TEXT_TRANSLATE_FAILED_MARK, TRANSCRIBE_PRICE_USD_PER_MINUTE } from '../../shared/constants'
import type { Metrics, SessionStateInfo, SubtitleUpdate } from '../../shared/types'
import { SubtitleStore } from '../subtitles/store'
import type { TranslateRequest, TranslateResult } from '../translate/segment-translator'
import type {
  GeminiConnectOptions,
  GeminiLiveClient,
  GeminiLiveSession
} from './client'
import { SessionManager, type SessionManagerDeps } from './session-manager'

class FakeSession implements GeminiLiveSession {
  sent: ArrayBuffer[] = []
  streamEnds = 0
  closed = false
  sendAudio(pcm: ArrayBuffer): void {
    this.sent.push(pcm)
  }
  sendAudioStreamEnd(): void {
    this.streamEnds += 1
  }
  close(): void {
    this.closed = true
  }
}

class FakeClient implements GeminiLiveClient {
  sessions: FakeSession[] = []
  opts: GeminiConnectOptions[] = []
  failNext: Error | null = null
  constructor(readonly name: 'sdk' | 'raw-ws' | 'transcribe') {}

  async connect(opts: GeminiConnectOptions): Promise<GeminiLiveSession> {
    this.opts.push(opts)
    if (this.failNext) {
      const err = this.failNext
      this.failNext = null
      throw err
    }
    const session = new FakeSession()
    this.sessions.push(session)
    return session
  }

  get last(): FakeSession {
    return this.sessions[this.sessions.length - 1]
  }

  get lastOpts(): GeminiConnectOptions {
    return this.opts[this.opts.length - 1]
  }
}

function frame(id: number): ArrayBuffer {
  const pcm = new ArrayBuffer(4)
  new Int16Array(pcm)[0] = id
  return pcm
}

function setup(overrides: Partial<SessionManagerDeps> = {}): {
  manager: SessionManager
  sdk: FakeClient
  raw: FakeClient
  states: SessionStateInfo[]
  updates: SubtitleUpdate[]
  deps: SessionManagerDeps & { startCapture: ReturnType<typeof vi.fn> }
} {
  const sdk = new FakeClient('sdk')
  const raw = new FakeClient('raw-ws')
  const updates: SubtitleUpdate[] = []
  const store = new SubtitleStore((u) => updates.push(u))
  const deps = {
    getApiKey: overrides.getApiKey ?? ((): string | null => 'test-key'),
    getTargetLanguage: overrides.getTargetLanguage ?? ((): string => 'vi'),
    getVadThresholdDb: overrides.getVadThresholdDb ?? ((): number => -50),
    getGateMode: overrides.getGateMode,
    getSystemInstruction: overrides.getSystemInstruction,
    getMode: overrides.getMode,
    startCapture: vi.fn(async () => {}),
    stopCapture: vi.fn(async () => {}),
    onPlaybackChunk: vi.fn(),
    onPlaybackFlush: vi.fn()
  }
  const manager = new SessionManager([sdk, raw], store, deps)
  const states: SessionStateInfo[] = []
  manager.on('state', (s: SessionStateInfo) => states.push(s))
  return { manager, sdk, raw, states, updates, deps }
}

// nói đủ lớn 2 khung liên tiếp để mở cổng VAD
function speak(manager: SessionManager, fromId: number, count: number): void {
  for (let i = 0; i < count; i++) manager.handleFrame(frame(fromId + i), -30, (fromId + i) / 10)
}

function silence(manager: SessionManager, fromId: number, count: number): void {
  for (let i = 0; i < count; i++) manager.handleFrame(frame(fromId + i), -90, (fromId + i) / 10)
}

describe('SessionManager state machine', () => {
  beforeEach(() => {
    vi.useFakeTimers()
  })
  afterEach(() => {
    vi.useRealTimers()
  })

  it('start: connecting → gated, gọi startCapture, config đúng ngôn ngữ đích', async () => {
    const { manager, sdk, states, deps } = setup()
    const result = await manager.start()
    expect(result.ok).toBe(true)
    expect(states.map((s) => s.state)).toEqual(['connecting', 'gated'])
    expect(deps.startCapture).toHaveBeenCalledOnce()
    expect(sdk.lastOpts.targetLanguage).toBe('vi')
    expect(sdk.lastOpts.resumptionHandle).toBeUndefined()
    await manager.stop()
  })

  it('không có API key thì start thất bại, vẫn idle', async () => {
    const { manager, deps } = setup()
    deps.getApiKey = (): string | null => null
    const result = await manager.start()
    expect(result.ok).toBe(false)
    expect(manager.isStarted()).toBe(false)
  })

  it('tiếng nói mở cổng → streaming và gửi khung; im lặng dài → streamEnd + gated', async () => {
    const { manager, sdk, states } = setup()
    await manager.start()
    speak(manager, 1, 2)
    expect(states.at(-1)?.state).toBe('streaming')
    expect(sdk.last.sent.length).toBe(2)
    silence(manager, 10, 20) // hangover 2000ms / 100ms = 20 khung
    expect(sdk.last.streamEnds).toBe(1)
    expect(states.at(-1)?.state).toBe('gated')
    await manager.stop()
  })

  it('transcript từ server được ghép vào store, audio chuyển cho playback', async () => {
    const { manager, sdk, updates, deps } = setup()
    await manager.start()
    const cb = sdk.lastOpts.callbacks
    cb.onMessage({ inputTranscription: 'Hello' })
    cb.onMessage({ outputTranscription: 'Xin chào' })
    cb.onMessage({ audioBase64: Buffer.from('abc').toString('base64') })
    const seg = updates.filter((u) => u.type === 'segment').at(-1)
    expect(seg?.type === 'segment' && seg.segment.source.text).toBe('Hello')
    expect(seg?.type === 'segment' && seg.segment.target.text).toBe('Xin chào')
    expect(deps.onPlaybackChunk).toHaveBeenCalledOnce()
    await manager.stop()
  })

  it('rớt kết nối bất ngờ → reconnecting, kết nối lại kèm resumption handle', async () => {
    const { manager, sdk, states } = setup()
    await manager.start()
    const cb = sdk.lastOpts.callbacks
    cb.onMessage({ resumptionHandle: 'handle-123' })
    cb.onClose({ code: 1011, reason: 'server hiccup' })
    expect(states.at(-1)?.state).toBe('reconnecting')
    await vi.advanceTimersByTimeAsync(1100)
    expect(sdk.sessions.length).toBe(2)
    expect(sdk.lastOpts.resumptionHandle).toBe('handle-123')
    expect(states.at(-1)?.state).toBe('gated')
    await manager.stop()
  })

  it('GoAway → draining, chủ động xoay kết nối trước hạn', async () => {
    const { manager, sdk, states } = setup()
    await manager.start()
    sdk.lastOpts.callbacks.onMessage({ goAwayTimeLeftMs: 5000 })
    expect(states.at(-1)?.state).toBe('draining')
    const first = sdk.last
    await vi.advanceTimersByTimeAsync(3100) // 5000 - 2000 an toàn
    expect(first.closed).toBe(true)
    expect(sdk.sessions.length).toBe(2)
    expect(states.at(-1)?.state).toBe('gated')
    await manager.stop()
  })

  it('close của kết nối cũ đến muộn không phá session mới (stale close)', async () => {
    const { manager, sdk, states } = setup()
    await manager.start()
    const firstOpts = sdk.lastOpts
    sdk.lastOpts.callbacks.onMessage({ goAwayTimeLeftMs: 2000 })
    await vi.advanceTimersByTimeAsync(100)
    expect(sdk.sessions.length).toBe(2)
    const statesBefore = states.length
    firstOpts.callbacks.onClose({ code: 1000, reason: 'old connection closed late' })
    expect(states.length).toBe(statesBefore) // không phát state mới, không reconnect thừa
    speak(manager, 1, 2)
    expect(sdk.sessions[1].sent.length).toBe(2) // session mới vẫn nhận audio
    await manager.stop()
  })

  it('server từ chối translationConfig → tự chuyển sang raw-ws client', async () => {
    const { manager, sdk, raw, states } = setup()
    await manager.start()
    sdk.lastOpts.callbacks.onClose({
      code: 1007,
      reason: 'Invalid argument: Unknown name "translation_config"'
    })
    await vi.advanceTimersByTimeAsync(10)
    expect(raw.sessions.length).toBe(1)
    expect(states.at(-1)?.usingFallbackClient).toBe(true)
    await manager.stop()
  })

  it('gửi ngữ cảnh cuộc họp làm systemInstruction', async () => {
    const { manager, sdk, deps } = setup()
    deps.getSystemInstruction = (): string => 'Ngữ cảnh: dự án X'
    await manager.start()
    expect(sdk.lastOpts.systemInstruction).toBe('Ngữ cảnh: dự án X')
    expect(manager.getStateInfo().contextDisabled).toBeUndefined()
    await manager.stop()
  })

  it('đọc model + API version từ Cài đặt mỗi lần kết nối', async () => {
    const { manager, sdk, deps } = setup()
    let version: 'v1beta' | 'v1alpha' = 'v1beta'
    deps.getLiveModel = (): string => 'gemini-x-preview'
    deps.getApiVersion = () => version
    await manager.start()
    expect(sdk.lastOpts.model).toBe('gemini-x-preview')
    expect(sdk.lastOpts.apiVersion).toBe('v1beta')
    await manager.stop()

    version = 'v1alpha'
    await manager.start()
    expect(sdk.lastOpts.apiVersion).toBe('v1alpha')
    await manager.stop()
  })

  it('connect bị từ chối systemInstruction lúc start → thử lại không ngữ cảnh', async () => {
    const { manager, sdk, states, deps } = setup()
    deps.getSystemInstruction = (): string => 'ctx'
    sdk.failNext = new Error('Invalid JSON payload: Unknown name "system_instruction"')
    const result = await manager.start()
    expect(result.ok).toBe(true)
    expect(sdk.opts.length).toBe(2)
    expect(sdk.lastOpts.systemInstruction).toBeUndefined()
    expect(states.at(-1)?.contextDisabled).toBe(true)
    await manager.stop()
  })

  it('server đóng vì systemInstruction giữa phiên → kết nối lại không ngữ cảnh, vẫn dùng SDK', async () => {
    const { manager, sdk, raw, deps } = setup()
    deps.getSystemInstruction = (): string => 'ctx'
    await manager.start()
    sdk.lastOpts.callbacks.onClose({ code: 1007, reason: 'system instruction is not supported' })
    await vi.advanceTimersByTimeAsync(10)
    expect(sdk.sessions.length).toBe(2)
    expect(sdk.lastOpts.systemInstruction).toBeUndefined()
    expect(raw.sessions.length).toBe(0)
    await manager.stop()
  })

  it('lỗi khác (không liên quan systemInstruction) vẫn làm start thất bại', async () => {
    const { manager, sdk, deps } = setup()
    deps.getSystemInstruction = (): string => 'ctx'
    sdk.failNext = new Error('API key not valid')
    const result = await manager.start()
    expect(result.ok).toBe(false)
    expect(sdk.opts.length).toBe(1)
  })

  it('stop: đóng session, dừng capture, flush playback, về idle', async () => {
    const { manager, sdk, states, deps } = setup()
    await manager.start()
    const session = sdk.last
    await manager.stop()
    expect(session.closed).toBe(true)
    expect(deps.stopCapture).toHaveBeenCalledOnce()
    expect(deps.onPlaybackFlush).toHaveBeenCalledOnce()
    expect(states.at(-1)?.state).toBe('idle')
    expect(manager.isStarted()).toBe(false)
  })

  it('connect thất bại liên tục → backoff tăng dần, hồi phục khi server sống lại', async () => {
    const { manager, sdk, states } = setup()
    await manager.start()
    sdk.failNext = new Error('mạng rớt')
    sdk.lastOpts.callbacks.onClose({ code: 1006, reason: '' })
    await vi.advanceTimersByTimeAsync(1100) // retry 1 thất bại (1000ms)
    expect(states.at(-1)?.state).toBe('reconnecting')
    await vi.advanceTimersByTimeAsync(2100) // retry 2 (backoff 2000ms) thành công
    expect(sdk.sessions.length).toBe(2)
    expect(states.at(-1)?.state).toBe('gated')
    await manager.stop()
  })
})

describe('SessionManager tạm dừng / tiếp tục', () => {
  beforeEach(() => vi.useFakeTimers())
  afterEach(() => vi.useRealTimers())

  it('tạm dừng: bỏ frame, giữ phụ đề; tiếp tục: gửi lại, không clear store, không bắt lại capture', async () => {
    const { manager, sdk, states, updates, deps } = setup()
    await manager.start()
    sdk.lastOpts.callbacks.onMessage({ inputTranscription: 'Hello', outputTranscription: 'Xin chào' })

    manager.pause()
    expect(manager.isPaused()).toBe(true)
    expect(manager.isStarted()).toBe(true)
    expect(states.at(-1)?.state).toBe('paused')
    speak(manager, 1, 5)
    expect(sdk.last.sent.length).toBe(0)
    expect(manager.getMetrics().rmsDb).toBe(-100) // thanh đo về đáy khi tạm dừng

    manager.resume()
    expect(manager.isPaused()).toBe(false)
    expect(states.at(-1)?.state).toBe('gated')
    speak(manager, 10, 2)
    expect(sdk.last.sent.length).toBe(2)

    expect(updates.some((u) => u.type === 'clear')).toBe(true) // chỉ 1 lần lúc start
    expect(updates.filter((u) => u.type === 'clear').length).toBe(1)
    expect(deps.startCapture).toHaveBeenCalledOnce()
    expect(deps.stopCapture).not.toHaveBeenCalled()
    await manager.stop()
  })

  it('tạm dừng giữa lúc đang nói → gửi audioStreamEnd để Gemini dịch nốt câu', async () => {
    const { manager, sdk } = setup()
    await manager.start()
    speak(manager, 1, 2)
    manager.pause()
    expect(sdk.last.streamEnds).toBe(1)
    expect(sdk.last.closed).toBe(false) // WS còn mở để nhận nốt bản dịch
    await manager.stop()
  })

  it('tạm dừng lâu → đóng WS, không reconnect; tiếp tục → nối lại kèm resumption handle', async () => {
    const { manager, sdk, states } = setup()
    await manager.start()
    sdk.lastOpts.callbacks.onMessage({ resumptionHandle: 'handle-abc' })
    manager.pause()
    await vi.advanceTimersByTimeAsync(16_000)
    expect(sdk.last.closed).toBe(true)
    sdk.lastOpts.callbacks.onClose({ code: 1000, reason: '' })
    await vi.advanceTimersByTimeAsync(5_000)
    expect(sdk.sessions.length).toBe(1) // không tự nối lại khi đang tạm dừng
    expect(states.at(-1)?.state).toBe('paused')

    manager.resume()
    await vi.advanceTimersByTimeAsync(10)
    expect(sdk.sessions.length).toBe(2)
    expect(sdk.lastOpts.resumptionHandle).toBe('handle-abc')
    expect(states.at(-1)?.state).toBe('gated')
    await manager.stop()
  })

  it('server đóng kết nối trong lúc tạm dừng → không reconnect, vẫn paused', async () => {
    const { manager, sdk, states } = setup()
    await manager.start()
    manager.pause()
    sdk.lastOpts.callbacks.onClose({ code: 1011, reason: 'server hiccup' })
    await vi.advanceTimersByTimeAsync(20_000)
    expect(sdk.sessions.length).toBe(1)
    expect(states.at(-1)?.state).toBe('paused')
    await manager.stop()
  })

  it('đồng hồ phiên không tính thời gian tạm dừng', async () => {
    const { manager } = setup()
    await manager.start()
    await vi.advanceTimersByTimeAsync(10_000)
    manager.pause()
    await vi.advanceTimersByTimeAsync(60_000)
    expect(manager.getMetrics().sessionSeconds).toBe(10)
    manager.resume()
    await vi.advanceTimersByTimeAsync(5_000)
    expect(manager.getMetrics().sessionSeconds).toBe(15)
    await manager.stop()
  })

  it('resumption handle quá hạn (tạm dừng quá lâu) → mở phiên Gemini mới', async () => {
    const { manager, sdk } = setup()
    await manager.start()
    sdk.lastOpts.callbacks.onMessage({ resumptionHandle: 'old-handle' })
    manager.pause()
    await vi.advanceTimersByTimeAsync(2 * 60 * 60 * 1000)
    manager.resume()
    await vi.advanceTimersByTimeAsync(10)
    expect(sdk.sessions.length).toBe(2)
    expect(sdk.lastOpts.resumptionHandle).toBeUndefined()
    await manager.stop()
  })

  it('dừng khi đang tạm dừng → idle; bắt đầu lại là phiên mới, hết paused', async () => {
    const { manager, states, updates } = setup()
    await manager.start()
    manager.pause()
    await manager.stop()
    expect(states.at(-1)?.state).toBe('idle')
    expect(manager.isPaused()).toBe(false)
    await manager.start()
    expect(manager.isPaused()).toBe(false)
    expect(updates.filter((u) => u.type === 'clear').length).toBe(2)
    await manager.stop()
  })

  it('tiếp tục → thêm mốc tạm dừng (giờ dừng → giờ tiếp tục); dừng khi đang tạm dừng → không có mốc', async () => {
    const { manager, updates } = setup()
    await manager.start()
    const pausedAt = Date.now()
    manager.pause()
    await vi.advanceTimersByTimeAsync(30_000)
    manager.resume()
    const markers = updates.filter((u) => u.type === 'segment' && u.segment.pauseEndedAt)
    expect(markers).toHaveLength(1)
    const m = markers[0]
    expect(m.type === 'segment' && m.segment.startedAt).toBe(pausedAt)
    expect(m.type === 'segment' && m.segment.pauseEndedAt).toBe(pausedAt + 30_000)

    manager.pause()
    await manager.stop()
    expect(updates.filter((u) => u.type === 'segment' && u.segment.pauseEndedAt)).toHaveLength(1)
  })

  it('pause/resume là no-op khi chưa start; ptt bị chặn khi tạm dừng', async () => {
    const idle = setup()
    idle.manager.pause()
    idle.manager.resume()
    expect(idle.states.length).toBe(0)

    const { manager, sdk } = setup({ getGateMode: () => 'ptt' })
    await manager.start()
    manager.setPushToTalk(true)
    manager.pause()
    expect(manager.isPushToTalkActive()).toBe(false)
    expect(sdk.last.streamEnds).toBe(1)
    manager.setPushToTalk(true)
    expect(manager.isPushToTalkActive()).toBe(false)
    await manager.stop()
  })
})

describe('SessionManager push-to-talk (chiều đi)', () => {
  beforeEach(() => vi.useFakeTimers())
  afterEach(() => vi.useRealTimers())

  it('ptt: chỉ gửi khi đang giữ nút; nhả ra → streamEnd + gated', async () => {
    const { manager, sdk, states } = setup({
      getGateMode: () => 'ptt',
      getTargetLanguage: () => 'ja'
    })
    await manager.start()
    expect(sdk.lastOpts.targetLanguage).toBe('ja')

    // chưa giữ nút: frame bị bỏ dù to
    speak(manager, 1, 3)
    expect(sdk.last.sent.length).toBe(0)

    // giữ nút → streaming, frame được gửi (không cần 2 khung như VAD)
    manager.setPushToTalk(true)
    expect(states.at(-1)?.state).toBe('streaming')
    speak(manager, 10, 3)
    expect(sdk.last.sent.length).toBe(3)

    // nhả nút → gửi audioStreamEnd, về gated, frame sau lại bị bỏ
    manager.setPushToTalk(false)
    expect(sdk.last.streamEnds).toBe(1)
    expect(states.at(-1)?.state).toBe('gated')
    speak(manager, 20, 3)
    expect(sdk.last.sent.length).toBe(3)
    await manager.stop()
  })

  it('togglePushToTalk lật trạng thái; setPushToTalk là no-op ở chế độ vad', async () => {
    const { manager, sdk } = setup({ getGateMode: () => 'ptt' })
    await manager.start()
    manager.togglePushToTalk()
    expect(manager.isPushToTalkActive()).toBe(true)
    manager.togglePushToTalk()
    expect(manager.isPushToTalkActive()).toBe(false)
    expect(sdk.last.streamEnds).toBe(1)
    await manager.stop()

    const vadCase = setup() // mặc định vad
    await vadCase.manager.start()
    vadCase.manager.setPushToTalk(true)
    expect(vadCase.manager.isPushToTalkActive()).toBe(false)
    await vadCase.manager.stop()
  })

  it('2 instance độc lập: dừng phiên này không đụng phiên kia', async () => {
    const incoming = setup()
    const outgoing = setup({ getGateMode: () => 'ptt', getTargetLanguage: () => 'ja' })
    await incoming.manager.start()
    await outgoing.manager.start()

    outgoing.manager.setPushToTalk(true)
    speak(outgoing.manager, 1, 2)
    expect(outgoing.sdk.last.sent.length).toBe(2)

    await incoming.manager.stop()
    expect(incoming.manager.isStarted()).toBe(false)
    // outgoing vẫn chạy và vẫn nhận audio
    expect(outgoing.manager.isStarted()).toBe(true)
    speak(outgoing.manager, 10, 2)
    expect(outgoing.sdk.last.sent.length).toBe(4)
    await outgoing.manager.stop()
  })
})

// ── Chế độ chỉ chữ (chiều về): model chép lời + dịch từng câu ──

interface PendingTranslation {
  req: TranslateRequest
  resolve(r: TranslateResult): void
  reject(e: Error): void
}

function setupText(
  opts: {
    mode?: () => 'speech' | 'text'
    translate?: (req: TranslateRequest) => Promise<TranslateResult>
  } = {}
) {
  const sdk = new FakeClient('sdk')
  const raw = new FakeClient('raw-ws')
  const tx = new FakeClient('transcribe')
  const updates: SubtitleUpdate[] = []
  const store = new SubtitleStore((u) => updates.push(u))
  const translations: PendingTranslation[] = []
  const deps = {
    getApiKey: (): string | null => 'test-key',
    getTargetLanguage: (): string => 'vi',
    getVadThresholdDb: (): number => -50,
    getMode: opts.mode ?? ((): 'speech' | 'text' => 'text'),
    textMode: {
      client: tx,
      translate:
        opts.translate ??
        ((req: TranslateRequest) =>
          new Promise<TranslateResult>((resolve, reject) =>
            translations.push({ req, resolve, reject })
          ))
    },
    startCapture: vi.fn(async () => {}),
    stopCapture: vi.fn(async () => {}),
    onPlaybackChunk: vi.fn(),
    onPlaybackFlush: vi.fn()
  }
  const manager = new SessionManager([sdk, raw], store, deps)
  const states: SessionStateInfo[] = []
  const metrics: Metrics[] = []
  manager.on('state', (s: SessionStateInfo) => states.push(s))
  manager.on('metrics', (m: Metrics) => metrics.push(m))
  return { manager, sdk, raw, tx, store, updates, translations, states, metrics, deps }
}

describe('SessionManager chế độ chỉ chữ', () => {
  beforeEach(() => vi.useFakeTimers())
  afterEach(() => vi.useRealTimers())

  it('kết nối model chép lời thay vì model dịch Live; state báo textOnly', async () => {
    const { manager, sdk, raw, tx, states } = setupText()
    await manager.start()
    expect(tx.sessions).toHaveLength(1)
    expect(sdk.sessions).toHaveLength(0)
    expect(raw.sessions).toHaveLength(0)
    expect(manager.getMode()).toBe('text')
    expect(states.at(-1)?.textOnly).toBe(true)
    await manager.stop()
  })

  it('interim hiện câu gốc; final → chốt câu + gửi dịch; bản dịch điền đúng câu', async () => {
    const { manager, tx, store, translations } = setupText()
    await manager.start()
    const cb = tx.lastOpts.callbacks
    cb.onMessage({ interimInputTranscription: 'Good morning' })
    expect(store.history()[0].source).toEqual({ text: 'Good morning', final: false })

    cb.onMessage({ inputTranscription: 'Good morning everyone.' })
    expect(translations.map((t) => t.req.text)).toEqual(['Good morning everyone.'])
    expect(store.history()).toHaveLength(1)
    expect(store.history()[0].target.final).toBe(false)

    translations[0].resolve({ text: 'Chào buổi sáng mọi người.', costUsd: 0.001 })
    await vi.advanceTimersByTimeAsync(0)
    expect(store.history()[0].target).toEqual({ text: 'Chào buổi sáng mọi người.', final: true })
    await manager.stop()
  })

  it('hết lượt nói (VAD) vẫn gửi audioStreamEnd nhưng không tự chốt interim — chờ bản final', async () => {
    const { manager, tx, store, translations } = setupText()
    await manager.start()
    speak(manager, 1, 2)
    tx.lastOpts.callbacks.onMessage({ interimInputTranscription: 'Hello there' })
    silence(manager, 10, 20)
    expect(tx.last.streamEnds).toBe(1)
    expect(store.hasInterim()).toBe(true)
    expect(translations).toHaveLength(0)
    await manager.stop()
  })

  it('chi phí = giây gửi × giá chép lời + tiền dịch; không phát audio', async () => {
    const { manager, tx, translations, deps } = setupText()
    await manager.start()
    speak(manager, 1, 2) // 0.2s
    const cb = tx.lastOpts.callbacks
    cb.onMessage({ audioBase64: Buffer.from('abc').toString('base64') })
    cb.onMessage({ inputTranscription: 'One.' })
    translations[0].resolve({ text: 'Một.', costUsd: 0.001 })
    await vi.advanceTimersByTimeAsync(0)
    const m = manager.getMetrics()
    expect(m.estimatedCostUsd).toBeCloseTo((0.2 / 60) * TRANSCRIBE_PRICE_USD_PER_MINUTE + 0.001, 6)
    expect(deps.onPlaybackChunk).not.toHaveBeenCalled()
    await manager.stop()
  })

  it('Dừng giữa câu: chốt interim, vẫn dịch nốt; chi phí muộn phát thêm metrics, giữ đồng hồ phiên', async () => {
    const { manager, tx, store, translations, metrics } = setupText()
    await manager.start()
    await vi.advanceTimersByTimeAsync(3000)
    tx.lastOpts.callbacks.onMessage({ interimInputTranscription: 'Half a sentence' })
    await manager.stop()
    expect(translations.map((t) => t.req.text)).toEqual(['Half a sentence'])

    const before = metrics.length
    translations[0].resolve({ text: 'Nửa câu', costUsd: 0.002 })
    await vi.advanceTimersByTimeAsync(0)
    expect(store.history()[0].target).toEqual({ text: 'Nửa câu', final: true })
    expect(metrics.length).toBe(before + 1)
    expect(metrics.at(-1)?.estimatedCostUsd).toBeCloseTo(0.002, 6)
    expect(metrics.at(-1)?.sessionSeconds).toBe(3)
  })

  it('settleTranslations chờ câu đang dịch xong (hoặc hết hạn)', async () => {
    const { manager, tx, translations } = setupText()
    await manager.start()
    tx.lastOpts.callbacks.onMessage({ inputTranscription: 'One.' })
    await manager.stop()
    let settled = false
    void manager.settleTranslations(5000).then(() => (settled = true))
    await vi.advanceTimersByTimeAsync(500)
    expect(settled).toBe(false)
    translations[0].resolve({ text: 'Một.', costUsd: 0 })
    await vi.advanceTimersByTimeAsync(200)
    expect(settled).toBe(true)

    // không bao giờ xong → hết hạn vẫn trả về
    await manager.start()
    tx.lastOpts.callbacks.onMessage({ inputTranscription: 'Two.' })
    await manager.stop()
    settled = false
    void manager.settleTranslations(1000).then(() => (settled = true))
    await vi.advanceTimersByTimeAsync(1200)
    expect(settled).toBe(true)
  })

  it('rớt kết nối giữa câu → chốt phần đã nghe, nối lại model chép lời', async () => {
    const { manager, sdk, tx, translations } = setupText()
    await manager.start()
    tx.lastOpts.callbacks.onMessage({ interimInputTranscription: 'We plan to ship' })
    tx.lastOpts.callbacks.onClose({ code: 1011, reason: 'server hiccup' })
    expect(translations.map((t) => t.req.text)).toEqual(['We plan to ship'])
    await vi.advanceTimersByTimeAsync(1100)
    expect(tx.sessions).toHaveLength(2)
    expect(sdk.sessions).toHaveLength(0)
    await manager.stop()
  })

  it('tạm dừng lâu → tự đóng WS; câu chưa có bản final được chốt + dịch, không treo', async () => {
    const { manager, tx, store, translations } = setupText()
    await manager.start()
    speak(manager, 1, 2)
    tx.lastOpts.callbacks.onMessage({ interimInputTranscription: 'Before the pause' })
    manager.pause()
    expect(translations).toHaveLength(0) // còn chờ bản final
    await vi.advanceTimersByTimeAsync(16_000)
    expect(tx.last.closed).toBe(true)
    expect(store.hasInterim()).toBe(false)
    expect(translations.map((t) => t.req.text)).toEqual(['Before the pause'])
    await manager.stop()
  })

  it('xoay phiên chép lời (giới hạn 10 phút) lúc đang im lặng sau 8 phút', async () => {
    const { manager, tx } = setupText()
    await manager.start()
    await vi.advanceTimersByTimeAsync(4 * 60_000)
    speak(manager, 1, 2)
    silence(manager, 10, 20) // còn tiếng nói trong 5 phút gần nhất → chưa idle-disconnect
    await vi.advanceTimersByTimeAsync(3 * 60_000)
    expect(tx.sessions).toHaveLength(1)
    await vi.advanceTimersByTimeAsync(60_000 + 1000)
    expect(tx.sessions).toHaveLength(2)
    expect(tx.sessions[0].closed).toBe(true)
    await manager.stop()
  })

  it('đang nói liên tục quá 9.5 phút → xoay bắt buộc, câu đang dở được chốt + dịch', async () => {
    const { manager, tx, translations } = setupText()
    await manager.start()
    speak(manager, 1, 2) // cổng VAD mở, không có khung im lặng nào → vẫn streaming
    tx.lastOpts.callbacks.onMessage({ interimInputTranscription: 'A very long talk' })
    await vi.advanceTimersByTimeAsync(9 * 60_000)
    expect(tx.sessions).toHaveLength(1)
    await vi.advanceTimersByTimeAsync(31_000)
    expect(tx.sessions).toHaveLength(2)
    expect(translations.map((t) => t.req.text)).toEqual(['A very long talk'])
    await manager.stop()
  })

  it('dịch lỗi liên tiếp → state báo translateError, câu lỗi có dấu báo', async () => {
    const { manager, tx, states, store } = setupText({
      translate: () => Promise.reject(new Error('API key not valid'))
    })
    await manager.start()
    for (const s of ['One.', 'Two.', 'Three.']) {
      tx.lastOpts.callbacks.onMessage({ inputTranscription: s })
    }
    await vi.advanceTimersByTimeAsync(1100) // thử lại sau 1s
    expect(states.at(-1)?.translateError).toContain('API key not valid')
    expect(store.history().every((s) => s.target.text === TEXT_TRANSLATE_FAILED_MARK)).toBe(true)
    await manager.stop()
  })

  it('chế độ giọng giữ nguyên; đổi chế độ giữa phiên chỉ áp cho phiên sau', async () => {
    let mode: 'speech' | 'text' = 'speech'
    const { manager, sdk, tx, states, deps } = setupText({ mode: () => mode })
    await manager.start()
    expect(sdk.sessions).toHaveLength(1)
    expect(tx.sessions).toHaveLength(0)
    expect(states.at(-1)?.textOnly).toBeUndefined()
    sdk.lastOpts.callbacks.onMessage({ audioBase64: Buffer.from('abc').toString('base64') })
    expect(deps.onPlaybackChunk).toHaveBeenCalledOnce()

    mode = 'text'
    expect(manager.getMode()).toBe('speech')
    await manager.stop()
    await manager.start()
    expect(manager.getMode()).toBe('text')
    expect(tx.sessions).toHaveLength(1)
    await manager.stop()
  })

  it('không có textMode (chiều đi) → luôn chế độ giọng dù getMode trả text', async () => {
    const { manager, sdk } = setup({ getMode: () => 'text' })
    await manager.start()
    expect(manager.getMode()).toBe('speech')
    expect(sdk.sessions).toHaveLength(1)
    await manager.stop()
  })
})
