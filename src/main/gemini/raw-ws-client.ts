import WebSocket from 'ws'
import { liveWsUrl, normalizeApiVersion, normalizeLiveModel } from '../../shared/gemini-api'
import {
  normalizeServerMessage,
  type GeminiConnectOptions,
  type GeminiLiveCallbacks,
  type GeminiLiveClient,
  type GeminiLiveSession
} from './client'

export class RawWsLiveClient implements GeminiLiveClient {
  readonly name = 'raw-ws' as const

  connect(opts: GeminiConnectOptions): Promise<GeminiLiveSession> {
    return openLiveSocket({
      url: liveWsUrl(normalizeApiVersion(opts.apiVersion)),
      apiKey: opts.apiKey,
      setup: {
        model: normalizeLiveModel(opts.model),
        ...(opts.systemInstruction
          ? { systemInstruction: { parts: [{ text: opts.systemInstruction }] } }
          : {}),
        generationConfig: {
          responseModalities: ['AUDIO'],
          translationConfig: {
            targetLanguageCode: opts.targetLanguage,
            echoTargetLanguage: false
          }
        },
        inputAudioTranscription: {},
        outputAudioTranscription: {},
        contextWindowCompression: { slidingWindow: {} },
        sessionResumption: opts.resumptionHandle ? { handle: opts.resumptionHandle } : {}
      },
      callbacks: opts.callbacks
    })
  }
}

// Mở WebSocket Live API thô: gửi setup, resolve khi server báo setupComplete
export function openLiveSocket(opts: {
  url: string
  apiKey: string
  setup: unknown
  callbacks: GeminiLiveCallbacks
}): Promise<GeminiLiveSession> {
  return new Promise((resolve, reject) => {
    const ws = new WebSocket(`${opts.url}?key=${encodeURIComponent(opts.apiKey)}`)
    let settled = false

    ws.on('open', () => {
      ws.send(JSON.stringify({ setup: opts.setup }))
    })

    ws.on('message', (data) => {
      let msg: unknown
      try {
        msg = JSON.parse(data.toString('utf-8'))
      } catch {
        return
      }
      const record = msg as Record<string, unknown>
      if (record.setupComplete !== undefined) {
        if (!settled) {
          settled = true
          opts.callbacks.onOpen()
          resolve(makeSession(ws))
        }
        return
      }
      opts.callbacks.onMessage(normalizeServerMessage(record))
    })

    ws.on('error', (err) => {
      if (!settled) {
        settled = true
        reject(err)
      } else {
        opts.callbacks.onError(err instanceof Error ? err : new Error(String(err)))
      }
    })

    ws.on('close', (code, reason) => {
      const r = reason?.toString('utf-8') ?? ''
      if (!settled) {
        settled = true
        reject(new Error(`Kết nối đóng trước khi setup xong: ${code} ${r}`))
      } else {
        opts.callbacks.onClose({ code, reason: r })
      }
    })
  })
}

function makeSession(ws: WebSocket): GeminiLiveSession {
  return {
    sendAudio: (pcm: ArrayBuffer) => {
      if (ws.readyState !== WebSocket.OPEN) return
      ws.send(
        JSON.stringify({
          realtimeInput: {
            audio: {
              data: Buffer.from(new Uint8Array(pcm)).toString('base64'),
              mimeType: 'audio/pcm;rate=16000'
            }
          }
        })
      )
    },
    sendAudioStreamEnd: () => {
      if (ws.readyState !== WebSocket.OPEN) return
      ws.send(JSON.stringify({ realtimeInput: { audioStreamEnd: true } }))
    },
    close: () => {
      try {
        ws.close(1000)
      } catch {
        /* đã đóng */
      }
    }
  }
}
