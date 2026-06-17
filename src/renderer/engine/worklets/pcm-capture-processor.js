// AudioWorklet: downmix mono, Float32 -> Int16 LE, đóng khung 100ms (1600 mẫu @16kHz), tính RMS dBFS
const SAMPLES_PER_FRAME = 1600

class PcmCaptureProcessor extends AudioWorkletProcessor {
  constructor() {
    super()
    this._buf = new Int16Array(SAMPLES_PER_FRAME)
    this._idx = 0
    this._sumSquares = 0
  }

  process(inputs) {
    const input = inputs[0]
    if (!input || input.length === 0 || !input[0]) return true
    const channels = input.length
    const n = input[0].length
    for (let i = 0; i < n; i++) {
      let s = 0
      for (let c = 0; c < channels; c++) s += input[c][i]
      s /= channels
      if (s > 1) s = 1
      else if (s < -1) s = -1
      this._sumSquares += s * s
      this._buf[this._idx++] = s < 0 ? s * 0x8000 : s * 0x7fff
      if (this._idx === SAMPLES_PER_FRAME) {
        const rms = Math.sqrt(this._sumSquares / SAMPLES_PER_FRAME)
        const rmsDb = rms > 0 ? 20 * Math.log10(rms) : -100
        const pcm = this._buf.buffer.slice(0)
        this.port.postMessage({ pcm, rmsDb, ts: currentTime }, [pcm])
        this._idx = 0
        this._sumSquares = 0
      }
    }
    return true
  }
}

registerProcessor('pcm-capture-processor', PcmCaptureProcessor)
