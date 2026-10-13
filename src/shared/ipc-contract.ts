import type {
  AppSettings,
  AudioInputDeviceInfo,
  AudioOutputDeviceInfo,
  ExportFormat,
  Metrics,
  OutgoingConfig,
  PlaybackConfig,
  PlaybackSinkState,
  SessionStateInfo,
  SubtitleUpdate,
  UpdateStatus,
  WindowsAudioDevice
} from './types'

export const IPC = {
  settingsGet: 'settings:get',
  settingsSet: 'settings:set',
  secretsSetApiKey: 'secrets:setApiKey',
  secretsHasApiKey: 'secrets:hasApiKey',
  sessionStart: 'session:start',
  sessionStop: 'session:stop',
  transcriptExport: 'transcript:export',
  overlaySetClickThrough: 'overlay:setClickThrough',
  overlaySetVisible: 'overlay:setVisible',
  debugRecordWav: 'debug:recordWav',
  devicesGetOutputs: 'devices:getOutputs',
  devicesGetInputs: 'devices:getInputs',
  devicesGetWindowsOutputs: 'devices:getWindowsOutputs',
  devicesSetWindowsDefault: 'devices:setWindowsDefault',
  outgoingStart: 'outgoing:start',
  outgoingStop: 'outgoing:stop',
  outgoingPtt: 'outgoing:ptt',
  appGetVersion: 'app:getVersion',
  updateCheck: 'update:check',
  updateInstall: 'update:install',
  autoSaveGetDir: 'autosave:getDir',
  autoSavePickDir: 'autosave:pickDir',
  autoSaveOpenDir: 'autosave:openDir',

  evSessionState: 'session:state',
  evSubtitleUpdate: 'subtitle:update',
  evMetricsUpdate: 'metrics:update',
  evSettingsChanged: 'settings:changed',
  evPlaybackChunk: 'playback:chunk',
  evPlaybackFlush: 'playback:flush',
  evPlaybackConfig: 'playback:config',
  evOutputDevices: 'devices:changed',
  evInputDevices: 'devices:inputsChanged',
  evPlaybackSinkState: 'playback:sinkStateChanged',
  evDevicesRefresh: 'devices:refresh',
  evOutgoingState: 'outgoing:state',
  evOutgoingMetrics: 'outgoing:metrics',
  evOutgoingSubtitle: 'outgoing:subtitle',
  evOutgoingSinkState: 'outgoing:sinkStateChanged',
  evMicPlaybackChunk: 'mic:playbackChunk',
  evMicPlaybackFlush: 'mic:playbackFlush',
  evOutgoingConfig: 'outgoing:config',
  evUpdateStatus: 'update:status',

  audioChunk: 'audio:chunk',
  captureError: 'capture:error',
  outputDevices: 'devices:outputs',
  inputDevices: 'devices:inputs',
  playbackSinkState: 'playback:sinkState',
  micChunk: 'mic:chunk',
  micCaptureError: 'mic:captureError',
  outgoingSinkState: 'outgoing:sinkState'
} as const

export interface ControlApi {
  getSettings(): Promise<AppSettings>
  setSettings(patch: Partial<AppSettings>): Promise<AppSettings>
  setApiKey(key: string): Promise<boolean>
  hasApiKey(): Promise<boolean>
  startSession(): Promise<{ ok: boolean; error?: string }>
  stopSession(): Promise<void>
  exportTranscript(format: ExportFormat): Promise<string | null>
  setOverlayClickThrough(on: boolean): Promise<void>
  setOverlayVisible(visible: boolean): Promise<void>
  debugRecordWav(seconds: number): Promise<string | null>
  getOutputDevices(): Promise<AudioOutputDeviceInfo[]>
  getInputDevices(): Promise<AudioInputDeviceInfo[]>
  getWindowsOutputDevices(): Promise<WindowsAudioDevice[]>
  setWindowsDefaultOutput(deviceId: string): Promise<{ ok: boolean; error?: string }>
  startOutgoing(): Promise<{ ok: boolean; error?: string }>
  stopOutgoing(): Promise<void>
  setPushToTalk(active: boolean): Promise<void>
  getAppVersion(): Promise<string>
  checkForUpdate(): Promise<void>
  installUpdate(): Promise<void>
  // thư mục tự lưu đã resolve (mặc định nếu setting rỗng)
  getAutoSaveDir(): Promise<string>
  pickAutoSaveDir(): Promise<string | null>
  openAutoSaveDir(): Promise<void>
  onSessionState(cb: (s: SessionStateInfo) => void): () => void
  onSubtitleUpdate(cb: (u: SubtitleUpdate) => void): () => void
  onMetrics(cb: (m: Metrics) => void): () => void
  onSettingsChanged(cb: (s: AppSettings) => void): () => void
  onOutputDevices(cb: (devices: AudioOutputDeviceInfo[]) => void): () => void
  onInputDevices(cb: (devices: AudioInputDeviceInfo[]) => void): () => void
  onPlaybackSinkState(cb: (s: PlaybackSinkState) => void): () => void
  onOutgoingState(cb: (s: SessionStateInfo) => void): () => void
  onOutgoingMetrics(cb: (m: Metrics) => void): () => void
  onOutgoingSubtitle(cb: (u: SubtitleUpdate) => void): () => void
  onOutgoingSinkState(cb: (s: PlaybackSinkState) => void): () => void
  onUpdateStatus(cb: (s: UpdateStatus) => void): () => void
}

export interface OverlayApi {
  getSettings(): Promise<AppSettings>
  onSubtitleUpdate(cb: (u: SubtitleUpdate) => void): () => void
  onSettingsChanged(cb: (s: AppSettings) => void): () => void
}

export interface EngineApi {
  sendAudioChunk(pcm: ArrayBuffer, rmsDb: number, ts: number): void
  sendCaptureError(message: string): void
  sendOutputDevices(devices: AudioOutputDeviceInfo[]): void
  sendInputDevices(devices: AudioInputDeviceInfo[]): void
  sendSinkState(state: PlaybackSinkState): void
  sendMicChunk(pcm: ArrayBuffer, rmsDb: number, ts: number): void
  sendMicCaptureError(message: string): void
  sendOutgoingSinkState(state: PlaybackSinkState): void
  onPlaybackChunk(cb: (pcm: ArrayBuffer) => void): () => void
  onPlaybackFlush(cb: () => void): () => void
  onPlaybackConfig(cb: (c: PlaybackConfig) => void): () => void
  onMicPlaybackChunk(cb: (pcm: ArrayBuffer) => void): () => void
  onMicPlaybackFlush(cb: () => void): () => void
  onOutgoingConfig(cb: (c: OutgoingConfig) => void): () => void
  onDevicesRefresh(cb: () => void): () => void
}

declare global {
  interface Window {
    controlApi?: ControlApi
    overlayApi?: OverlayApi
    engineApi?: EngineApi
  }
}
