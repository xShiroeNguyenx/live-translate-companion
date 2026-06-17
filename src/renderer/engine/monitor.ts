import type { PlaybackSinkState } from '../../shared/types'

interface SinkCapableAudioContext extends AudioContext {
  setSinkId(deviceId: string): Promise<void>
}

// Phát lại nguyên văn audio meeting đã thu (loopback) vào tai nghe — thay cho tính năng
// "Listen to this device" của Windows. Dùng cho setup virtual cable: meeting → CABLE Input
// (im lặng), app thu CABLE rồi monitor sang tai nghe + phát giọng dịch cùng chỗ.
export class MeetingMonitor {
  private ctx: SinkCapableAudioContext | null = null
  private source: MediaStreamAudioSourceNode | null = null
  private currentStream: MediaStream | null = null
  private currentSinkId: string | null = null

  async update(opts: {
    enabled: boolean
    sink: PlaybackSinkState | null
    stream: MediaStream | null
  }): Promise<void> {
    const { enabled, sink, stream } = opts
    // KHOÁ AN TOÀN: chỉ monitor khi sink KHÔNG bị loopback thu — nếu không chính tiếng
    // meeting sẽ bị thu lại và khuếch đại thành vọng vô tận
    const active = enabled && stream !== null && sink !== null && sink.ok && !sink.isCaptured
    if (!active) {
      this.disconnect()
      return
    }

    const ctx = await this.ensureContext(sink.deviceId)
    if (!ctx) {
      this.disconnect()
      return
    }
    if (this.source && this.currentStream === stream) return

    this.disconnect()
    this.source = ctx.createMediaStreamSource(stream)
    this.source.connect(ctx.destination)
    this.currentStream = stream
    if (ctx.state === 'suspended') await ctx.resume().catch(() => undefined)
  }

  // context riêng ở sample rate gốc — giữ nguyên chất lượng meeting, không ép 24kHz như TTS
  private async ensureContext(deviceId: string): Promise<SinkCapableAudioContext | null> {
    if (!this.ctx) {
      this.ctx = new AudioContext() as SinkCapableAudioContext
    }
    if (this.currentSinkId !== deviceId) {
      if (typeof this.ctx.setSinkId !== 'function') return null
      try {
        await this.ctx.setSinkId(deviceId)
        this.currentSinkId = deviceId
      } catch {
        return null
      }
    }
    return this.ctx
  }

  private disconnect(): void {
    this.source?.disconnect()
    this.source = null
    this.currentStream = null
  }
}
