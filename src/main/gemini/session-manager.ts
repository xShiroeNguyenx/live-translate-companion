import { EventEmitter } from 'node:events'
import {
  FRAME_MS,
  IDLE_DISCONNECT_MS,
  PAUSE_DISCONNECT_MS,
  PRICE_USD_PER_MINUTE,
  RESUMPTION_MAX_AGE_MS
} from '../../shared/constants'
import type { GeminiApiVersion } from '../../shared/gemini-api'
import type { Metrics, SessionState, SessionStateInfo } from '../../shared/types'
import type { SubtitleStore } from '../subtitles/store'
import {
  isSystemInstructionRejection,
  isTranslationConfigRejection,
  type GeminiLiveClient,
  type GeminiLiveSession,
  type LiveServerEvent
} from './client'
import { VadGate } from './vad-gate'

export interface SessionManagerDeps {
  getApiKey(): string | null
  getTargetLanguage(): string
  getVadThresholdDb(): number
  startCapture(): Promise<void>
  stopCapture(): Promise<void>
  onPlaybackChunk(pcm: Buffer): void
  onPlaybackFlush(): void
  // 'vad' (mặc định) gửi theo cổng RMS; 'ptt' chỉ gửi khi đang giữ nút nói (chiều đi)
  getGateMode?(): 'vad' | 'ptt'
  // ngữ cảnh cuộc họp gửi làm systemInstruction; bị từ chối thì tự tắt cho phiên đó
  getSystemInstruction?(): string | undefined
  // model + version Gemini đọc lại mỗi lần kết nối, nên đổi trong Cài đặt có hiệu lực từ lần nối sau
  getLiveModel?(): string
  getApiVersion?(): GeminiApiVersion
}

const MAX_PENDING_FRAMES = 50
const MAX_BACKOFF_MS = 15000
const GOAWAY_SAFETY_MS = 2000

export class SessionManager extends EventEmitter {
  private state: SessionState = 'idle'
  private session: GeminiLiveSession | null = null
  private connectPromise: Promise<void> | null = null
  private started = false
  private paused = false
  private pausedAt = 0
  private pausedTotalMs = 0
  private resumptionHandle: string | undefined
  private resumptionHandleAt = 0
  private clientIndex = 0
  private vad = new VadGate()
  private pttActive = false
  private pendingFrames: ArrayBuffer[] = []
  private secondsSent = 0
  private reconnects = 0
  private sessionStartedAt = 0
  private lastRmsDb = -100
  private lastVoiceAt = 0
  private backoffMs = 1000
  private contextDisabled = false
  private metricsTimer: ReturnType<typeof setInterval> | null = null
  private goAwayTimer: ReturnType<typeof setTimeout> | null = null
  private reconnectTimer: ReturnType<typeof setTimeout> | null = null

  constructor(
    private clients: GeminiLiveClient[],
    private store: SubtitleStore,
    private deps: SessionManagerDeps
  ) {
    super()
  }

  getStateInfo(): SessionStateInfo {
    return {
      state: this.state,
      usingFallbackClient: this.clientIndex > 0,
      ...(this.contextDisabled ? { contextDisabled: true } : {})
    }
  }

  isStarted(): boolean {
    return this.started
  }

  isPaused(): boolean {
    return this.paused
  }

  getStartedAt(): number {
    return this.sessionStartedAt
  }

  getMetrics(): Metrics {
    return this.metrics()
  }

  async start(): Promise<{ ok: boolean; error?: string }> {
    if (this.started) return { ok: true }
    if (!this.deps.getApiKey()) {
      return { ok: false, error: 'Chưa cấu hình Gemini API key' }
    }
    this.started = true
    this.paused = false
    this.pausedAt = 0
    this.pausedTotalMs = 0
    this.clientIndex = 0
    this.resumptionHandle = undefined
    this.resumptionHandleAt = 0
    this.secondsSent = 0
    this.reconnects = 0
    this.backoffMs = 1000
    this.contextDisabled = false
    this.pendingFrames = []
    this.pttActive = false
    this.sessionStartedAt = Date.now()
    this.lastVoiceAt = Date.now()
    this.vad.reset()
    this.store.clear()
    this.setState('connecting')
    try {
      try {
        await this.ensureConnected()
      } catch (err) {
        if (!this.disableContextIfRejected(err)) throw err
        await this.ensureConnected()
      }
      await this.deps.startCapture()
      this.metricsTimer = setInterval(() => this.onMetricsTick(), 500)
      this.setState('gated')
      return { ok: true }
    } catch (err) {
      const message = err instanceof Error ? err.message : String(err)
      await this.stop('error', message)
      return { ok: false, error: message }
    }
  }

  async stop(finalState: SessionState = 'idle', error?: string): Promise<void> {
    this.started = false
    this.paused = false
    if (this.metricsTimer) clearInterval(this.metricsTimer)
    if (this.goAwayTimer) clearTimeout(this.goAwayTimer)
    if (this.reconnectTimer) clearTimeout(this.reconnectTimer)
    this.metricsTimer = this.goAwayTimer = this.reconnectTimer = null
    this.pendingFrames = []
    this.pttActive = false
    this.store.finalizeOpenSegment()
    const session = this.session
    this.session = null
    try {
      session?.close()
    } catch {
      /* đã đóng */
    }
    try {
      await this.deps.stopCapture()
    } catch (err) {
      console.error('Không dừng được capture:', err)
    }
    this.deps.onPlaybackFlush()
    this.vad.reset()
    this.setState(finalState, error)
  }

  // Tạm dừng: ngừng gửi audio nhưng KHÔNG kết thúc phiên — phụ đề, file transcript, mục lịch sử,
  // chi phí luỹ kế và resumption handle (ngữ cảnh Gemini) đều giữ nguyên để Tiếp tục nối vào.
  // Capture vẫn chạy (khỏi phải xin lại loopback), frame bị bỏ ngay ở handleFrame.
  pause(): void {
    if (!this.started || this.paused) return
    this.paused = true
    this.pausedAt = Date.now()
    this.pendingFrames = []
    this.lastRmsDb = -100
    if (this.goAwayTimer) clearTimeout(this.goAwayTimer)
    if (this.reconnectTimer) clearTimeout(this.reconnectTimer)
    this.goAwayTimer = this.reconnectTimer = null
    // đang nói dở → báo hết lượt để Gemini dịch nốt câu đó (WS còn mở PAUSE_DISCONNECT_MS)
    if (this.state === 'streaming' || this.pttActive) {
      this.store.finalizeOpenSegment()
      try {
        this.session?.sendAudioStreamEnd()
      } catch (err) {
        console.error('audioStreamEnd lỗi:', err)
      }
    }
    this.pttActive = false
    this.vad.reset()
    this.setState('paused')
  }

  resume(): void {
    if (!this.started || !this.paused) return
    const now = Date.now()
    this.paused = false
    this.pausedTotalMs += now - this.pausedAt
    this.store.addPauseMarker(this.pausedAt, now)
    this.pausedAt = 0
    this.lastVoiceAt = Date.now()
    this.vad.reset()
    this.setState('gated')
    if (this.session) return
    // hâm nóng kết nối (thường đã đóng sau PAUSE_DISCONNECT_MS) để câu đầu tiên không bị trễ
    void this.ensureConnected()
      .then(() => this.setActiveState())
      .catch((err) => this.scheduleReconnect(err instanceof Error ? err.message : String(err)))
  }

  private gateMode(): 'vad' | 'ptt' {
    return this.deps.getGateMode?.() ?? 'vad'
  }

  handleFrame(pcm: ArrayBuffer, rmsDb: number, _ts: number): void {
    if (!this.started || this.paused) return
    this.lastRmsDb = rmsDb

    // Push-to-talk: bỏ qua VAD, chỉ gửi khi đang giữ nút nói
    if (this.gateMode() === 'ptt') {
      if (!this.pttActive) return
      this.lastVoiceAt = Date.now()
      this.sendFrame(pcm)
      if (this.state === 'gated') this.setState('streaming')
      return
    }

    this.vad.setThreshold(this.deps.getVadThresholdDb())
    const result = this.vad.push({ pcm, rmsDb, ts: _ts })

    if (result.send.length > 0) {
      this.lastVoiceAt = Date.now()
      for (const frame of result.send) this.sendFrame(frame)
      if (this.state === 'gated') this.setState('streaming')
    }

    if (result.streamEnd) {
      this.store.finalizeOpenSegment()
      try {
        this.session?.sendAudioStreamEnd()
      } catch (err) {
        console.error('audioStreamEnd lỗi:', err)
      }
      if (this.state === 'streaming') this.setState('gated')
    }
  }

  // Nút "Giữ để nói" (chiều đi): true khi nhấn, false khi nhả → gửi audioStreamEnd
  setPushToTalk(active: boolean): void {
    if (!this.started || this.paused || this.gateMode() !== 'ptt') return
    if (active === this.pttActive) return
    this.pttActive = active
    if (active) {
      this.lastVoiceAt = Date.now()
      // hâm nóng kết nối trước khi tiếng nói tới (có thể đã idle-disconnect)
      void this.ensureConnected().catch(() => {})
      if (this.state === 'gated') this.setState('streaming')
      return
    }
    this.store.finalizeOpenSegment()
    try {
      this.session?.sendAudioStreamEnd()
    } catch (err) {
      console.error('audioStreamEnd lỗi:', err)
    }
    if (this.state === 'streaming') this.setState('gated')
  }

  togglePushToTalk(): void {
    this.setPushToTalk(!this.pttActive)
  }

  isPushToTalkActive(): boolean {
    return this.pttActive
  }

  handleCaptureError(message: string): void {
    if (!this.started) return
    void this.stop('error', `Lỗi bắt audio: ${message}`)
  }

  private sendFrame(pcm: ArrayBuffer): void {
    if (this.session) {
      try {
        this.session.sendAudio(pcm)
        this.secondsSent += FRAME_MS / 1000
      } catch (err) {
        console.error('Gửi audio lỗi:', err)
      }
      return
    }
    this.pendingFrames.push(pcm)
    if (this.pendingFrames.length > MAX_PENDING_FRAMES) this.pendingFrames.shift()
    void this.ensureConnected().catch(() => {
      /* handleClose sẽ lo retry */
    })
  }

  private ensureConnected(): Promise<void> {
    if (this.session) return Promise.resolve()
    if (this.connectPromise) return this.connectPromise
    this.connectPromise = this.connect().finally(() => {
      this.connectPromise = null
    })
    return this.connectPromise
  }

  private async connect(): Promise<void> {
    const apiKey = this.deps.getApiKey()
    if (!apiKey) throw new Error('Chưa cấu hình Gemini API key')
    const client = this.clients[Math.min(this.clientIndex, this.clients.length - 1)]
    // box giữ danh tính kết nối: sự kiện close đến muộn của kết nối cũ không được phép
    // xoá session mới hay kích hoạt reconnect thừa
    const box: { session: GeminiLiveSession | null } = { session: null }
    const session = await client.connect({
      apiKey,
      targetLanguage: this.deps.getTargetLanguage(),
      model: this.deps.getLiveModel?.(),
      apiVersion: this.deps.getApiVersion?.(),
      resumptionHandle: this.freshResumptionHandle(),
      systemInstruction: this.contextDisabled ? undefined : this.deps.getSystemInstruction?.(),
      callbacks: {
        onOpen: () => {},
        onMessage: (ev) => this.handleServerEvent(ev),
        onError: (err) => console.error(`[${client.name}] lỗi:`, err.message),
        onClose: (ev) => this.handleClose(ev, box)
      }
    })
    box.session = session
    // đã Dừng trong lúc đang kết nối → đóng luôn, đừng để WS mồ côi
    if (!this.started) {
      try {
        session.close()
      } catch {
        /* đã đóng */
      }
      return
    }
    this.session = session
    this.backoffMs = 1000
    const queued = this.pendingFrames
    this.pendingFrames = []
    for (const frame of queued) this.sendFrame(frame)
  }

  private handleServerEvent(ev: LiveServerEvent): void {
    if (ev.resumptionHandle) {
      this.resumptionHandle = ev.resumptionHandle
      this.resumptionHandleAt = Date.now()
    }
    if (ev.inputTranscription) this.store.appendSource(ev.inputTranscription)
    if (ev.outputTranscription) this.store.appendTarget(ev.outputTranscription)
    if (ev.audioBase64) this.deps.onPlaybackChunk(Buffer.from(ev.audioBase64, 'base64'))
    if (ev.turnComplete || ev.generationComplete) this.store.finalizeOpenSegment()
    if (ev.goAwayTimeLeftMs !== undefined) this.scheduleRotation(ev.goAwayTimeLeftMs)
  }

  // GoAway: chủ động đóng và mở lại kết nối trước khi server cắt
  private scheduleRotation(timeLeftMs: number): void {
    // đang tạm dừng: kệ server đóng, Tiếp tục sẽ tự nối lại
    if (!this.started || this.paused || this.goAwayTimer) return
    this.setState('draining')
    const delay = Math.max(0, timeLeftMs - GOAWAY_SAFETY_MS)
    this.goAwayTimer = setTimeout(() => {
      this.goAwayTimer = null
      void this.rotateSession()
    }, delay)
  }

  private async rotateSession(): Promise<void> {
    if (!this.started || this.paused) return
    this.store.finalizeOpenSegment()
    const old = this.session
    this.session = null
    try {
      old?.close()
    } catch {
      /* đã đóng */
    }
    this.reconnects += 1
    try {
      await this.ensureConnected()
      this.setActiveState()
    } catch (err) {
      this.scheduleReconnect(err instanceof Error ? err.message : String(err))
    }
  }

  private handleClose(
    ev: { code: number; reason: string },
    box: { session: GeminiLiveSession | null }
  ): void {
    if (box.session && box.session !== this.session) return
    this.session = null
    if (!this.started) return
    // tạm dừng thì không nối lại ngay — resume() lo việc đó
    if (this.paused) return

    if (this.disableContextIfRejected(ev.reason)) {
      this.reconnects += 1
      void this.ensureConnected()
        .then(() => this.setActiveState())
        .catch((err) => this.scheduleReconnect(err instanceof Error ? err.message : String(err)))
      return
    }

    if (this.clientIndex === 0 && this.clients.length > 1 && isTranslationConfigRejection(ev.reason)) {
      this.clientIndex = 1
      console.warn('SDK bị từ chối translationConfig — chuyển sang raw WebSocket client')
      this.reconnects += 1
      void this.ensureConnected()
        .then(() => this.setActiveState())
        .catch((err) => this.scheduleReconnect(err instanceof Error ? err.message : String(err)))
      return
    }

    this.scheduleReconnect(`Kết nối đóng (${ev.code}) ${ev.reason}`.trim())
  }

  // true nếu lỗi do model không nhận systemInstruction và vừa tắt ngữ cảnh → nên kết nối lại ngay
  private disableContextIfRejected(errOrReason: unknown): boolean {
    if (this.contextDisabled || !this.deps.getSystemInstruction?.()) return false
    if (!isSystemInstructionRejection(errOrReason)) return false
    console.warn('Model Live từ chối systemInstruction — chạy phiên này không có ngữ cảnh')
    this.contextDisabled = true
    return true
  }

  private scheduleReconnect(reason: string): void {
    if (!this.started || this.paused || this.reconnectTimer) return
    console.warn('Sẽ kết nối lại sau', this.backoffMs, 'ms —', reason)
    this.setState('reconnecting')
    this.reconnectTimer = setTimeout(() => {
      this.reconnectTimer = null
      if (!this.started || this.paused) return
      this.reconnects += 1
      void this.ensureConnected()
        .then(() => this.setActiveState())
        .catch((err) => {
          this.backoffMs = Math.min(this.backoffMs * 2, MAX_BACKOFF_MS)
          this.scheduleReconnect(err instanceof Error ? err.message : String(err))
        })
    }, this.backoffMs)
  }

  private onMetricsTick(): void {
    // Im lặng kéo dài / tạm dừng: đóng WS để khỏi giữ kết nối, resumption handle còn hạn ~2h
    const now = Date.now()
    const idle = this.paused
      ? now - this.pausedAt > PAUSE_DISCONNECT_MS
      : this.state === 'gated' && now - this.lastVoiceAt > IDLE_DISCONNECT_MS
    if (this.session && idle) {
      const session = this.session
      this.session = null
      try {
        session.close()
      } catch {
        /* đã đóng */
      }
    }
    this.emit('metrics', this.metrics())
  }

  private metrics(): Metrics {
    return {
      rmsDb: Math.round(this.lastRmsDb * 10) / 10,
      secondsSent: Math.round(this.secondsSent * 10) / 10,
      estimatedCostUsd: (this.secondsSent / 60) * PRICE_USD_PER_MINUTE,
      sessionSeconds: this.activeSeconds(),
      reconnects: this.reconnects
    }
  }

  // thời lượng phiên KHÔNG tính khoảng tạm dừng (đồng hồ đứng yên khi tạm dừng)
  private activeSeconds(): number {
    if (!this.started) return 0
    const now = Date.now()
    const pausedMs = this.pausedTotalMs + (this.paused ? now - this.pausedAt : 0)
    return Math.max(0, Math.floor((now - this.sessionStartedAt - pausedMs) / 1000))
  }

  private freshResumptionHandle(): string | undefined {
    if (this.resumptionHandle && Date.now() - this.resumptionHandleAt > RESUMPTION_MAX_AGE_MS) {
      console.warn('Resumption handle đã quá hạn — mở phiên Gemini mới (mất ngữ cảnh trước đó)')
      this.resumptionHandle = undefined
    }
    return this.resumptionHandle
  }

  // đặt lại streaming/gated sau khi (nối lại) kết nối — trừ khi đã dừng hoặc đang tạm dừng
  private setActiveState(): void {
    if (!this.started || this.paused) return
    this.setState(this.vad.open ? 'streaming' : 'gated')
  }

  private setState(state: SessionState, error?: string): void {
    this.state = state
    const info: SessionStateInfo = {
      state,
      usingFallbackClient: this.clientIndex > 0
    }
    if (this.contextDisabled) info.contextDisabled = true
    if (error) info.error = error
    this.emit('state', info)
  }
}
