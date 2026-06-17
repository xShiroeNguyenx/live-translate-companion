// Kiểm chứng M2: stream 1 file WAV (tiếng Nhật/Anh) lên Gemini Live Translate,
// in transcript vào/ra và lưu audio dịch thành echo-out.wav (24kHz).
//
// Cách chạy:  $env:GEMINI_API_KEY = "..."; npm run echo-test -- duong\dan\file.wav [vi]
import { readFileSync, writeFileSync } from 'node:fs'
import {
  decodeWavToPcm16,
  downmixToMono,
  encodeWavPcm16Mono,
  resampleLinear
} from '../src/main/audio/wav'
import {
  isTranslationConfigRejection,
  SdkLiveClient,
  type GeminiLiveCallbacks,
  type GeminiLiveClient
} from '../src/main/gemini/client'
import { RawWsLiveClient } from '../src/main/gemini/raw-ws-client'
import {
  BYTES_PER_FRAME,
  FRAME_MS,
  INPUT_SAMPLE_RATE,
  OUTPUT_SAMPLE_RATE
} from '../src/shared/constants'

const wavPath = process.argv[2]
const targetLanguage = process.argv[3] ?? 'vi'
const apiKey = process.env.GEMINI_API_KEY

if (!wavPath || !apiKey) {
  console.error('Cách dùng: GEMINI_API_KEY=... npm run echo-test -- <file.wav> [ngôn ngữ đích, mặc định vi]')
  process.exit(1)
}

async function main(): Promise<void> {
  const decoded = decodeWavToPcm16(readFileSync(wavPath!))
  console.log(`WAV vào: ${decoded.sampleRate}Hz, ${decoded.channels} kênh, ${decoded.samples.length} mẫu`)
  const mono = downmixToMono(decoded.samples, decoded.channels)
  const pcm16k = resampleLinear(mono, decoded.sampleRate, INPUT_SAMPLE_RATE)
  const bytes = new Uint8Array(pcm16k.buffer, pcm16k.byteOffset, pcm16k.length * 2)
  const totalFrames = Math.floor(bytes.length / BYTES_PER_FRAME)
  console.log(`Sẽ gửi ${totalFrames} khung × ${FRAME_MS}ms (${(totalFrames * FRAME_MS) / 1000}s audio)`)

  const outputChunks: Buffer[] = []
  let inputText = ''
  let outputText = ''
  let generationComplete = false
  let closed = false

  const callbacks: GeminiLiveCallbacks = {
    onOpen: () => console.log('✓ Kết nối thành công'),
    onMessage: (ev) => {
      if (ev.inputTranscription) {
        inputText += ev.inputTranscription
        process.stdout.write(`\n[VÀO ] ${ev.inputTranscription}`)
      }
      if (ev.outputTranscription) {
        outputText += ev.outputTranscription
        process.stdout.write(`\n[DỊCH] ${ev.outputTranscription}`)
      }
      if (ev.audioBase64) outputChunks.push(Buffer.from(ev.audioBase64, 'base64'))
      if (ev.generationComplete) generationComplete = true
    },
    onError: (err) => console.error('\nLỗi:', err.message),
    onClose: (ev) => {
      closed = true
      console.log(`\nKết nối đóng: ${ev.code} ${ev.reason}`)
    }
  }

  const connect = async (client: GeminiLiveClient) =>
    client.connect({ apiKey: apiKey!, targetLanguage, callbacks })

  let clientName = 'sdk'
  let session
  try {
    session = await connect(new SdkLiveClient())
  } catch (err) {
    if (!isTranslationConfigRejection(err)) throw err
    console.warn('SDK bị từ chối translationConfig — thử raw WebSocket client…')
    clientName = 'raw-ws'
    session = await connect(new RawWsLiveClient())
  }
  console.log(`Client: ${clientName}`)

  for (let i = 0; i < totalFrames; i++) {
    const frame = bytes.slice(i * BYTES_PER_FRAME, (i + 1) * BYTES_PER_FRAME)
    session.sendAudio(frame.buffer.slice(frame.byteOffset, frame.byteOffset + frame.byteLength))
    await new Promise((r) => setTimeout(r, FRAME_MS))
  }
  session.sendAudioStreamEnd()
  console.log('\n— Đã gửi hết audio, chờ phần dịch còn lại (tối đa 20s)…')

  const deadline = Date.now() + 20_000
  let lastChunkCount = 0
  while (Date.now() < deadline && !closed) {
    await new Promise((r) => setTimeout(r, 1000))
    if (generationComplete && outputChunks.length === lastChunkCount) break
    lastChunkCount = outputChunks.length
  }
  session.close()

  console.log('\n===== KẾT QUẢ =====')
  console.log('Transcript vào :', inputText.trim() || '(trống)')
  console.log('Transcript dịch:', outputText.trim() || '(trống)')
  if (outputChunks.length > 0) {
    const wav = encodeWavPcm16Mono(Buffer.concat(outputChunks), OUTPUT_SAMPLE_RATE)
    writeFileSync('echo-out.wav', wav)
    console.log(`Audio dịch     : echo-out.wav (${outputChunks.length} chunk, ${wav.length} bytes)`)
  } else {
    console.log('Audio dịch     : không nhận được chunk nào')
  }
  process.exit(0)
}

main().catch((err) => {
  console.error('Echo test thất bại:', err)
  process.exit(1)
})
