import { OUTPUT_SAMPLE_RATE } from '../../shared/constants'
import type { PlaybackConfig, PlaybackSinkState } from '../../shared/types'
import { DEFAULT_ALIAS_IDS, isCapturedDevice } from './devices'

// Đệm thêm sau khi nguồn cuối kết thúc: bù độ trễ render/endpoint trước khi loopback hết tiếng TTS
const ECHO_GUARD_TAIL_S = 0.5

interface SinkCapableAudioContext extends AudioContext {
  setSinkId(deviceId: string): Promise<void>
}

export class PcmPlayer {
  private ctx: SinkCapableAudioContext
  private gain: GainNode
  private nextStart = 0
  private audibleUntil = 0
  private sources = new Set<AudioBufferSourceNode>()
  private enabled = false
  // chưa resolve được sink → mặc định an toàn: coi như đang phát vào thiết bị bị loopback thu
  private sinkCaptured = true

  constructor() {
    this.ctx = new AudioContext({ sampleRate: OUTPUT_SAMPLE_RATE }) as SinkCapableAudioContext
    this.gain = this.ctx.createGain()
    this.gain.gain.value = 0
    this.gain.connect(this.ctx.destination)
  }

  async applyConfig(config: PlaybackConfig): Promise<PlaybackSinkState> {
    this.enabled = config.enabled
    this.gain.gain.value = config.enabled ? 1 : 0
    if (!config.enabled) this.flush()
    const state = await this.resolveSink(config)
    this.sinkCaptured = state.isCaptured
    if (config.enabled && this.ctx.state === 'suspended') {
      await this.ctx.resume().catch(() => undefined)
    }
    return state
  }

  // true khi giọng dịch (có thể) đang lọt vào loopback — engine dùng để bỏ frame thu,
  // tránh dịch lại chính câu vừa phát (vòng lặp vô tận)
  blocksCapture(): boolean {
    return (
      this.enabled &&
      this.sinkCaptured &&
      this.ctx.currentTime < this.audibleUntil + ECHO_GUARD_TAIL_S
    )
  }

  enqueue(pcm: ArrayBuffer): void {
    if (!this.enabled || pcm.byteLength < 2) return
    const int16 = new Int16Array(pcm.slice(0, pcm.byteLength - (pcm.byteLength % 2)))
    const float32 = new Float32Array(int16.length)
    for (let i = 0; i < int16.length; i++) {
      float32[i] = int16[i] / (int16[i] < 0 ? 0x8000 : 0x7fff)
    }
    const buffer = this.ctx.createBuffer(1, float32.length, OUTPUT_SAMPLE_RATE)
    buffer.copyToChannel(float32, 0)

    const source = this.ctx.createBufferSource()
    source.buffer = buffer
    source.connect(this.gain)
    const startAt = Math.max(this.ctx.currentTime + 0.05, this.nextStart)
    source.start(startAt)
    this.nextStart = startAt + buffer.duration
    this.audibleUntil = this.nextStart
    this.sources.add(source)
    source.onended = () => this.sources.delete(source)
  }

  flush(): void {
    for (const source of this.sources) {
      try {
        source.stop()
      } catch {
        /* chưa start hoặc đã stop */
      }
    }
    this.sources.clear()
    this.nextStart = 0
    this.audibleUntil = this.ctx.currentTime
  }

  private async resolveSink(config: PlaybackConfig): Promise<PlaybackSinkState> {
    const wanted = config.deviceId || ''
    if (typeof this.ctx.setSinkId !== 'function') {
      return {
        ok: false,
        deviceId: '',
        label: '',
        isCaptured: true,
        error: 'AudioContext.setSinkId không được hỗ trợ'
      }
    }

    let outputs: MediaDeviceInfo[] = []
    try {
      const all = await navigator.mediaDevices.enumerateDevices()
      outputs = all.filter((d) => d.kind === 'audiooutput')
    } catch {
      /* vẫn thử setSinkId trực tiếp */
    }
    const defaultDevice = outputs.find((d) => d.deviceId === 'default')

    let lastError = ''
    const tryApply = async (deviceId: string): Promise<PlaybackSinkState | null> => {
      try {
        await this.ctx.setSinkId(deviceId)
        const device = outputs.find((d) => d.deviceId === deviceId)
        const isCaptured = device ? isCapturedDevice(device, defaultDevice) : true
        return { ok: true, deviceId, label: device?.label ?? '', isCaptured }
      } catch (err) {
        lastError = err instanceof Error ? err.message : String(err)
        return null
      }
    }

    const direct = await tryApply(wanted)
    if (direct) return direct

    // deviceId cũ (salt đổi giữa các cửa sổ/lần chạy) — tìm lại thiết bị theo label đã lưu
    if (config.deviceLabel) {
      const byLabel = outputs.find(
        (d) => d.label === config.deviceLabel && !DEFAULT_ALIAS_IDS.includes(d.deviceId)
      )
      if (byLabel) {
        const fallback = await tryApply(byLabel.deviceId)
        if (fallback) return fallback
      }
    }

    // không route được — quay về default để chắc chắn có tiếng, báo lỗi và coi là bị thu
    await this.ctx.setSinkId('').catch(() => undefined)
    return {
      ok: false,
      deviceId: wanted,
      label: config.deviceLabel,
      isCaptured: true,
      error: lastError || 'Không tìm thấy thiết bị phát đã chọn'
    }
  }
}
