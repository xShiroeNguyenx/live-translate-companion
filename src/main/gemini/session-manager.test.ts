import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest'
import type { SessionStateInfo, SubtitleUpdate } from '../../shared/types'
import { SubtitleStore } from '../subtitles/store'
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
  constructor(readonly name: 'sdk' | 'raw-ws') {}

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
