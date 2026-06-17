import type { OutgoingConfig, PlaybackConfig, PlaybackSinkState } from '../../shared/types'
import { LoopbackCapture } from './capture'
import { listInputDevices, listOutputDevices } from './devices'
import { MicCapture } from './mic-capture'
import { MeetingMonitor } from './monitor'
import { PcmPlayer } from './playback'

declare global {
  interface Window {
    __startCapture?: () => Promise<void>
    __stopCapture?: () => Promise<void>
    __startMic?: (deviceId: string) => Promise<void>
    __stopMic?: () => Promise<void>
  }
}

const api = window.engineApi
if (!api) throw new Error('engineApi không tồn tại — preload chưa nạp')

// Chiều về: loopback → dịch → tai nghe
const capture = new LoopbackCapture()
const player = new PcmPlayer()
const monitor = new MeetingMonitor()
// Chiều đi: micro → dịch → CABLE Input (mic ảo của meeting)
const micCapture = new MicCapture()
const cablePlayer = new PcmPlayer()

let playbackConfig: PlaybackConfig | null = null
let sinkState: PlaybackSinkState | null = null

const syncMonitor = (): void => {
  void monitor.update({
    enabled: playbackConfig?.monitorEnabled ?? false,
    sink: sinkState,
    stream: capture.mediaStream
  })
}

window.__startCapture = async (): Promise<void> => {
  try {
    await capture.start((pcm, rmsDb, ts) => {
      // giọng dịch đang phát vào đúng thiết bị bị loopback thu → bỏ frame,
      // nếu không Gemini sẽ nghe lại chính câu vừa dịch và lặp vô tận
      if (player.blocksCapture()) return
      api.sendAudioChunk(pcm, rmsDb, ts)
    })
    syncMonitor()
  } catch (err) {
    const message = err instanceof Error ? err.message : String(err)
    api.sendCaptureError(message)
    throw err
  }
}

window.__stopCapture = async (): Promise<void> => {
  await capture.stop()
  syncMonitor()
}

window.__startMic = async (deviceId: string): Promise<void> => {
  try {
    await micCapture.start(deviceId, (pcm, rmsDb, ts) => api.sendMicChunk(pcm, rmsDb, ts))
    void pushInputDevices() // sau khi cấp quyền, label micro mới hiện đầy đủ
  } catch (err) {
    const message = err instanceof Error ? err.message : String(err)
    api.sendMicCaptureError(message)
    throw err
  }
}

window.__stopMic = async (): Promise<void> => {
  await micCapture.stop()
}

const applyPlayback = async (config: PlaybackConfig): Promise<void> => {
  sinkState = await player.applyConfig(config)
  api.sendSinkState(sinkState)
  syncMonitor()
}

const applyOutgoing = async (config: OutgoingConfig): Promise<void> => {
  const state = await cablePlayer.applyConfig({
    enabled: config.enabled,
    deviceId: config.deviceId,
    deviceLabel: config.deviceLabel,
    monitorEnabled: false
  })
  api.sendOutgoingSinkState(state)
}

const pushOutputDevices = async (): Promise<void> => {
  try {
    api.sendOutputDevices(await listOutputDevices())
  } catch {
    api.sendOutputDevices([])
  }
}

const pushInputDevices = async (): Promise<void> => {
  try {
    api.sendInputDevices(await listInputDevices())
  } catch {
    api.sendInputDevices([])
  }
}

api.onPlaybackChunk((pcm) => player.enqueue(pcm))
api.onPlaybackFlush(() => player.flush())
api.onPlaybackConfig((config) => {
  playbackConfig = config
  void applyPlayback(config)
})
api.onMicPlaybackChunk((pcm) => cablePlayer.enqueue(pcm))
api.onMicPlaybackFlush(() => cablePlayer.flush())
api.onOutgoingConfig((config) => {
  void applyOutgoing(config)
})

const refreshDevices = (): void => {
  void pushOutputDevices()
  void pushInputDevices()
  // thiết bị vừa đổi (BT kết nối lại / đổi default từ app) — route lại sink theo cấu hình hiện tại
  if (playbackConfig) void applyPlayback(playbackConfig)
}

api.onDevicesRefresh(refreshDevices)
navigator.mediaDevices?.addEventListener?.('devicechange', refreshDevices)
void pushOutputDevices()
void pushInputDevices()
