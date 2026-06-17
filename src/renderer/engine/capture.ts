import { INPUT_SAMPLE_RATE } from '../../shared/constants'
import workletUrl from './worklets/pcm-capture-processor.js?url'

export type FrameHandler = (pcm: ArrayBuffer, rmsDb: number, ts: number) => void

interface WorkletFrame {
  pcm: ArrayBuffer
  rmsDb: number
  ts: number
}

export class LoopbackCapture {
  private ctx: AudioContext | null = null
  private stream: MediaStream | null = null
  private node: AudioWorkletNode | null = null

  get running(): boolean {
    return this.ctx !== null
  }

  // stream gốc full-quality — monitor dùng để phát lại meeting vào tai nghe
  get mediaStream(): MediaStream | null {
    return this.stream
  }

  async start(onFrame: FrameHandler): Promise<void> {
    if (this.running) return

    // setDisplayMediaRequestHandler ở main tự grant loopback; video bắt buộc theo spec rồi bỏ ngay
    const stream = await navigator.mediaDevices.getDisplayMedia({ video: true, audio: true })
    stream.getVideoTracks().forEach((t) => t.stop())
    if (stream.getAudioTracks().length === 0) {
      stream.getTracks().forEach((t) => t.stop())
      throw new Error('Không lấy được audio loopback từ hệ thống')
    }

    const ctx = new AudioContext({ sampleRate: INPUT_SAMPLE_RATE })
    await ctx.audioWorklet.addModule(workletUrl)
    const source = ctx.createMediaStreamSource(stream)
    const node = new AudioWorkletNode(ctx, 'pcm-capture-processor')
    node.port.onmessage = (e: MessageEvent<WorkletFrame>) => {
      onFrame(e.data.pcm, e.data.rmsDb, e.data.ts)
    }
    source.connect(node)
    // worklet không ghi gì vào output nên nhánh này im lặng — chỉ để graph được pull
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
