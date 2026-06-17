import { contextBridge, ipcRenderer } from 'electron'
import type { EngineApi } from '../shared/ipc-contract'
import type {
  AudioInputDeviceInfo,
  AudioOutputDeviceInfo,
  OutgoingConfig,
  PlaybackConfig,
  PlaybackSinkState
} from '../shared/types'

// Tên channel viết literal — xem ghi chú trong control.ts. Phải khớp src/shared/ipc-contract.ts.

function subscribe<T>(channel: string, cb: (payload: T) => void): () => void {
  const listener = (_e: Electron.IpcRendererEvent, payload: T): void => cb(payload)
  ipcRenderer.on(channel, listener)
  return () => ipcRenderer.removeListener(channel, listener)
}

const api: EngineApi = {
  sendAudioChunk: (pcm: ArrayBuffer, rmsDb: number, ts: number) =>
    ipcRenderer.send('audio:chunk', pcm, rmsDb, ts),
  sendCaptureError: (message: string) => ipcRenderer.send('capture:error', message),
  sendOutputDevices: (devices: AudioOutputDeviceInfo[]) =>
    ipcRenderer.send('devices:outputs', devices),
  sendInputDevices: (devices: AudioInputDeviceInfo[]) =>
    ipcRenderer.send('devices:inputs', devices),
  sendSinkState: (state: PlaybackSinkState) => ipcRenderer.send('playback:sinkState', state),
  sendMicChunk: (pcm: ArrayBuffer, rmsDb: number, ts: number) =>
    ipcRenderer.send('mic:chunk', pcm, rmsDb, ts),
  sendMicCaptureError: (message: string) => ipcRenderer.send('mic:captureError', message),
  sendOutgoingSinkState: (state: PlaybackSinkState) =>
    ipcRenderer.send('outgoing:sinkState', state),
  onPlaybackChunk: (cb: (pcm: ArrayBuffer) => void) => subscribe('playback:chunk', cb),
  onPlaybackFlush: (cb: () => void) => subscribe('playback:flush', cb),
  onPlaybackConfig: (cb: (c: PlaybackConfig) => void) => subscribe('playback:config', cb),
  onMicPlaybackChunk: (cb: (pcm: ArrayBuffer) => void) => subscribe('mic:playbackChunk', cb),
  onMicPlaybackFlush: (cb: () => void) => subscribe('mic:playbackFlush', cb),
  onOutgoingConfig: (cb: (c: OutgoingConfig) => void) => subscribe('outgoing:config', cb),
  onDevicesRefresh: (cb: () => void) => subscribe('devices:refresh', cb)
}

contextBridge.exposeInMainWorld('engineApi', api)
