export function encodeWavPcm16Mono(pcm: Uint8Array, sampleRate: number): Buffer {
  const header = Buffer.alloc(44)
  header.write('RIFF', 0, 'ascii')
  header.writeUInt32LE(36 + pcm.length, 4)
  header.write('WAVE', 8, 'ascii')
  header.write('fmt ', 12, 'ascii')
  header.writeUInt32LE(16, 16)
  header.writeUInt16LE(1, 20)
  header.writeUInt16LE(1, 22)
  header.writeUInt32LE(sampleRate, 24)
  header.writeUInt32LE(sampleRate * 2, 28)
  header.writeUInt16LE(2, 32)
  header.writeUInt16LE(16, 34)
  header.write('data', 36, 'ascii')
  header.writeUInt32LE(pcm.length, 40)
  return Buffer.concat([header, Buffer.from(pcm)])
}

export interface DecodedWav {
  sampleRate: number
  channels: number
  samples: Int16Array
}

export function decodeWavToPcm16(wav: Buffer): DecodedWav {
  if (wav.length < 12 || wav.toString('ascii', 0, 4) !== 'RIFF' || wav.toString('ascii', 8, 12) !== 'WAVE') {
    throw new Error('Không phải file WAV hợp lệ')
  }
  let offset = 12
  let sampleRate = 0
  let channels = 0
  let bits = 0
  let data: Buffer | null = null
  while (offset + 8 <= wav.length) {
    const id = wav.toString('ascii', offset, offset + 4)
    const size = wav.readUInt32LE(offset + 4)
    if (id === 'fmt ') {
      const format = wav.readUInt16LE(offset + 8)
      if (format !== 1) throw new Error(`WAV format ${format} không hỗ trợ (cần PCM không nén)`)
      channels = wav.readUInt16LE(offset + 10)
      sampleRate = wav.readUInt32LE(offset + 12)
      bits = wav.readUInt16LE(offset + 22)
    } else if (id === 'data') {
      data = wav.subarray(offset + 8, Math.min(offset + 8 + size, wav.length))
    }
    offset += 8 + size + (size % 2)
  }
  if (!data || !sampleRate || !channels) throw new Error('File WAV thiếu chunk fmt/data')
  if (bits !== 16) throw new Error(`Bit depth ${bits} không hỗ trợ (cần 16-bit)`)
  const samples = new Int16Array(data.buffer.slice(data.byteOffset, data.byteOffset + data.length - (data.length % 2)))
  return { sampleRate, channels, samples }
}

export function downmixToMono(samples: Int16Array, channels: number): Int16Array {
  if (channels <= 1) return samples
  const frames = Math.floor(samples.length / channels)
  const out = new Int16Array(frames)
  for (let i = 0; i < frames; i++) {
    let sum = 0
    for (let c = 0; c < channels; c++) sum += samples[i * channels + c]
    out[i] = Math.round(sum / channels)
  }
  return out
}

export function resampleLinear(samples: Int16Array, fromRate: number, toRate: number): Int16Array {
  if (fromRate === toRate) return samples
  const outLen = Math.floor((samples.length * toRate) / fromRate)
  const out = new Int16Array(outLen)
  const ratio = fromRate / toRate
  for (let i = 0; i < outLen; i++) {
    const pos = i * ratio
    const i0 = Math.floor(pos)
    const i1 = Math.min(i0 + 1, samples.length - 1)
    const frac = pos - i0
    out[i] = Math.round(samples[i0] * (1 - frac) + samples[i1] * frac)
  }
  return out
}
