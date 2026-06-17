import { INPUT_SAMPLE_RATE } from '../../shared/constants'
import workletUrl from './worklets/pcm-capture-processor.js?url'

export type FrameHandler = (pcm: ArrayBuffer, rmsDb: number, ts: number) => void

interface WorkletFrame {
  pcm: ArrayBuffer
  rmsDb: number
  ts: number
}

// Thu micro của user cho chiều đi (nói tiếng Việt). Tái dùng đúng worklet của loopback —
// cùng định dạng 16kHz/PCM16/khung 100ms + RMS. Bật echo/noise/AGC để bớt nghe lỏm loa.
export class MicCapture {
  private ctx: AudioContext | null = null
  private stream: MediaStream | null = null
  private node: AudioWorkletNode | null = null

  get running(): boolean {
    return this.ctx !== null
  }

  async start(deviceId: string, onFrame: FrameHandler): Promise<void> {
    if (this.running) return

    const audio: MediaTrackConstraints = {
      echoCancellation: true,
      noiseSuppression: true,
      autoGainControl: true
    }
    if (deviceId) audio.deviceId = { exact: deviceId }

    const stream = await navigator.mediaDevices.getUserMedia({ audio })
    if (stream.getAudioTracks().length === 0) {
      stream.getTracks().forEach((t) => t.stop())
      throw new Error('Không lấy được tín hiệu từ micro')
    }

    const ctx = new AudioContext({ sampleRate: INPUT_SAMPLE_RATE })
    await ctx.audioWorklet.addModule(workletUrl)
    const source = ctx.createMediaStreamSource(stream)
    const node = new AudioWorkletNode(ctx, 'pcm-capture-processor')
    node.port.onmessage = (e: MessageEvent<WorkletFrame>) => {
      onFrame(e.data.pcm, e.data.rmsDb, e.data.ts)
    }
    source.connect(node)
    node.connect(ctx.destination)

    this.ctx = ctx
    this.stream = stream
    this.node = node
  }

  async stop(): Promise<void> {
    this.node?.port.close()
    this.node?.disconnect()
    this.node = null
    this.stream?.getTracks().forEach((t) => t.stop())
    this.stream = null
    if (this.ctx) {
      const ctx = this.ctx
      this.ctx = null
      await ctx.close().catch(() => undefined)
    }
  }
}
