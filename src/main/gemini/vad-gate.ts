import {
  FRAME_MS,
  VAD_DEFAULT_THRESHOLD_DB,
  VAD_HANGOVER_MS,
  VAD_OPEN_FRAMES,
  VAD_PREROLL_MS
} from '../../shared/constants'

export interface VadFrame {
  pcm: ArrayBuffer
  rmsDb: number
  ts: number
}

export interface VadResult {
  send: ArrayBuffer[]
  streamEnd: boolean
  open: boolean
}

export interface VadGateOptions {
  thresholdDb?: number
  openFrames?: number
  hangoverMs?: number
  preRollMs?: number
  frameMs?: number
}

export class VadGate {
  private thresholdDb: number
  private readonly openFrames: number
  private readonly hangoverFrames: number
  private readonly preRollFrames: number
  private preRoll: ArrayBuffer[] = []
  private consecutiveLoud = 0
  private silentFrames = 0
  private isOpen = false

  constructor(opts: VadGateOptions = {}) {
    const frameMs = opts.frameMs ?? FRAME_MS
    this.thresholdDb = opts.thresholdDb ?? VAD_DEFAULT_THRESHOLD_DB
    this.openFrames = Math.max(1, opts.openFrames ?? VAD_OPEN_FRAMES)
    this.hangoverFrames = Math.max(1, Math.round((opts.hangoverMs ?? VAD_HANGOVER_MS) / frameMs))
    this.preRollFrames = Math.max(0, Math.round((opts.preRollMs ?? VAD_PREROLL_MS) / frameMs))
  }

  get open(): boolean {
    return this.isOpen
  }

  setThreshold(db: number): void {
    this.thresholdDb = db
  }

  push(frame: VadFrame): VadResult {
    const loud = frame.rmsDb > this.thresholdDb

    if (!this.isOpen) {
      this.preRoll.push(frame.pcm)
      if (this.preRoll.length > this.preRollFrames + this.openFrames) this.preRoll.shift()
      this.consecutiveLoud = loud ? this.consecutiveLoud + 1 : 0
      if (this.consecutiveLoud >= this.openFrames) {
        this.isOpen = true
        this.consecutiveLoud = 0
        this.silentFrames = 0
        const send = this.preRoll
        this.preRoll = []
        return { send, streamEnd: false, open: true }
      }
      return { send: [], streamEnd: false, open: false }
    }

    if (loud) this.silentFrames = 0
    else this.silentFrames += 1

    if (this.silentFrames >= this.hangoverFrames) {
      this.isOpen = false
      this.silentFrames = 0
      this.preRoll = []
      return { send: [frame.pcm], streamEnd: true, open: false }
    }
    return { send: [frame.pcm], streamEnd: false, open: true }
  }

  reset(): void {
    this.preRoll = []
    this.consecutiveLoud = 0
    this.silentFrames = 0
    this.isOpen = false
  }
}
