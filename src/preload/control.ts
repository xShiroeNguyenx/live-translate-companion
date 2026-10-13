import { contextBridge, ipcRenderer } from 'electron'
import type { ControlApi } from '../shared/ipc-contract'
import type {
  AppSettings,
  AudioInputDeviceInfo,
  AudioOutputDeviceInfo,
  ExportFormat,
  Metrics,
  PlaybackSinkState,
  SessionStateInfo,
  SubtitleUpdate,
  SummaryStatus,
  UpdateStatus,
  UsageSummary
} from '../shared/types'

// Tên channel viết literal (không import IPC constants) để preload bundle thành 1 file duy nhất —
// preload sandboxed không require được chunk chia sẻ. Phải khớp src/shared/ipc-contract.ts.

function subscribe<T>(channel: string, cb: (payload: T) => void): () => void {
  const listener = (_e: Electron.IpcRendererEvent, payload: T): void => cb(payload)
  ipcRenderer.on(channel, listener)
  return () => ipcRenderer.removeListener(channel, listener)
}

const api: ControlApi = {
  getSettings: () => ipcRenderer.invoke('settings:get'),
  setSettings: (patch: Partial<AppSettings>) => ipcRenderer.invoke('settings:set', patch),
  setApiKey: (key: string) => ipcRenderer.invoke('secrets:setApiKey', key),
  hasApiKey: () => ipcRenderer.invoke('secrets:hasApiKey'),
  startSession: () => ipcRenderer.invoke('session:start'),
  stopSession: () => ipcRenderer.invoke('session:stop'),
  exportTranscript: (format: ExportFormat) => ipcRenderer.invoke('transcript:export', format),
  setOverlayClickThrough: (on: boolean) => ipcRenderer.invoke('overlay:setClickThrough', on),
  setOverlayVisible: (visible: boolean) => ipcRenderer.invoke('overlay:setVisible', visible),
  debugRecordWav: (seconds: number) => ipcRenderer.invoke('debug:recordWav', seconds),
  getOutputDevices: () => ipcRenderer.invoke('devices:getOutputs'),
  getInputDevices: () => ipcRenderer.invoke('devices:getInputs'),
  getWindowsOutputDevices: () => ipcRenderer.invoke('devices:getWindowsOutputs'),
  setWindowsDefaultOutput: (deviceId: string) =>
    ipcRenderer.invoke('devices:setWindowsDefault', deviceId),
  startOutgoing: () => ipcRenderer.invoke('outgoing:start'),
  stopOutgoing: () => ipcRenderer.invoke('outgoing:stop'),
  setPushToTalk: (active: boolean) => ipcRenderer.invoke('outgoing:ptt', active),
  getAppVersion: () => ipcRenderer.invoke('app:getVersion'),
  checkForUpdate: () => ipcRenderer.invoke('update:check'),
  installUpdate: () => ipcRenderer.invoke('update:install'),
  getAutoSaveDir: () => ipcRenderer.invoke('autosave:getDir'),
  pickAutoSaveDir: () => ipcRenderer.invoke('autosave:pickDir'),
  openAutoSaveDir: () => ipcRenderer.invoke('autosave:openDir'),
  listHistory: (query: string) => ipcRenderer.invoke('history:list', query),
  getHistory: (id: string) => ipcRenderer.invoke('history:get', id),
  deleteHistory: (id: string) => ipcRenderer.invoke('history:delete', id),
  summarizeHistory: (id: string) => ipcRenderer.invoke('history:summarize', id),
  openHistoryFile: (id: string, kind: 'transcript' | 'summary') =>
    ipcRenderer.invoke('history:openFile', id, kind),
  getUsage: () => ipcRenderer.invoke('usage:get'),
  onSessionState: (cb: (s: SessionStateInfo) => void) => subscribe('session:state', cb),
  onSubtitleUpdate: (cb: (u: SubtitleUpdate) => void) => subscribe('subtitle:update', cb),
  onMetrics: (cb: (m: Metrics) => void) => subscribe('metrics:update', cb),
  onSettingsChanged: (cb: (s: AppSettings) => void) => subscribe('settings:changed', cb),
  onOutputDevices: (cb: (devices: AudioOutputDeviceInfo[]) => void) =>
    subscribe('devices:changed', cb),
  onInputDevices: (cb: (devices: AudioInputDeviceInfo[]) => void) =>
    subscribe('devices:inputsChanged', cb),
  onPlaybackSinkState: (cb: (s: PlaybackSinkState) => void) =>
    subscribe('playback:sinkStateChanged', cb),
  onOutgoingState: (cb: (s: SessionStateInfo) => void) => subscribe('outgoing:state', cb),
  onOutgoingMetrics: (cb: (m: Metrics) => void) => subscribe('outgoing:metrics', cb),
  onOutgoingSubtitle: (cb: (u: SubtitleUpdate) => void) => subscribe('outgoing:subtitle', cb),
  onOutgoingSinkState: (cb: (s: PlaybackSinkState) => void) =>
    subscribe('outgoing:sinkStateChanged', cb),
  onUpdateStatus: (cb: (s: UpdateStatus) => void) => subscribe('update:status', cb),
  onHistoryChanged: (cb: () => void) => subscribe('history:changed', cb),
  onSummaryStatus: (cb: (s: SummaryStatus) => void) => subscribe('summary:status', cb),
  onUsage: (cb: (u: UsageSummary) => void) => subscribe('usage:update', cb)
}

contextBridge.exposeInMainWorld('controlApi', api)
