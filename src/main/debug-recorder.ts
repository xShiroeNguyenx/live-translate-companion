import { shell } from 'electron'
import { writeFileSync } from 'node:fs'
import { INPUT_SAMPLE_RATE } from '../shared/constants'
import { encodeWavPcm16Mono } from './audio/wav'

export interface DebugRecorderDeps {
  isCaptureNeededBySession(): boolean
  startCapture(): Promise<void>
  stopCapture(): Promise<void>
  outPath(): string
}

// Thu PCM thô (bỏ qua VAD) ra file WAV để kiểm chứng pipeline capture (M1)
export class DebugRecorder {
  private collecting: {
    frames: Buffer[]
    until: number
    startedCapture: boolean
    resolve: (path: string | null) => void
  } | null = null

  constructor(private deps: DebugRecorderDeps) {}

  async record(seconds: number): Promise<string | null> {
    if (this.collecting) return null
    let startedCapture = false
    if (!this.deps.isCaptureNeededBySession()) {
      await this.deps.startCapture()
      startedCapture = true
    }
    return new Promise<string | null>((resolve) => {
      this.collecting = {
        frames: [],
        until: Date.now() + Math.max(1, seconds) * 1000,
        startedCapture,
        resolve
      }
    })
  }

  tap(pcm: ArrayBuffer): void {
    const c = this.collecting
    if (!c) return
    c.frames.push(Buffer.from(new Uint8Array(pcm)))
    if (Date.now() >= c.until) void this.finish()
  }

  private async finish(): Promise<void> {
    const c = this.collecting
    if (!c) return
    this.collecting = null
    let path: string | null = null
    try {
      const wav = encodeWavPcm16Mono(Buffer.concat(c.frames), INPUT_SAMPLE_RATE)
      path = this.deps.outPath()
      writeFileSync(path, wav)
      shell.showItemInFolder(path)
    } catch (err) {
      console.error('Ghi WAV debug lỗi:', err)
      path = null
    }
    if (c.startedCapture && !this.deps.isCaptureNeededBySession()) {
      try {
        await this.deps.stopCapture()
      } catch (err) {
        console.error('Dừng capture debug lỗi:', err)
      }
    }
    c.resolve(path)
  }
}
