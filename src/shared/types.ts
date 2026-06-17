export type SessionState =
  | 'idle'
  | 'connecting'
  | 'streaming'
  | 'gated'
  | 'draining'
  | 'reconnecting'
  | 'stopping'
  | 'error'

export interface SessionStateInfo {
  state: SessionState
  error?: string
  usingFallbackClient?: boolean
}

export interface Metrics {
  rmsDb: number
  secondsSent: number
  estimatedCostUsd: number
  sessionSeconds: number
  reconnects: number
}

export interface SubtitleSegment {
  id: string
  startedAt: number
  source: { text: string; final: boolean }
  target: { text: string; final: boolean }
}

export type SubtitleUpdate =
  | { type: 'segment'; segment: SubtitleSegment }
  | { type: 'history'; segments: SubtitleSegment[] }
  | { type: 'clear' }

export type OutgoingMode = 'vad' | 'ptt'

export interface AppSettings {
  targetLanguage: string
  playbackEnabled: boolean
  playbackDeviceId: string
  // deviceId bị Chromium salt theo origin/lần chạy — lưu thêm label để engine tìm lại thiết bị
  playbackDeviceLabel: string
  // phát lại audio meeting đã thu vào tai nghe (dùng khi meeting đi vào virtual cable im lặng)
  monitorEnabled: boolean
  vadThresholdDb: number
  // ── Chiều đi: nói tiếng Việt → giọng đích phát vào meeting qua virtual cable ──
  micDeviceId: string
  micDeviceLabel: string
  outgoingTargetLanguage: string
  outgoingMode: OutgoingMode
  outgoingVadThresholdDb: number
  // thiết bị nhận giọng dịch chiều đi — nên là "CABLE Input" để vào meeting như mic ảo
  outgoingDeviceId: string
  outgoingDeviceLabel: string
  overlayFontSize: number
  overlayOpacity: number
  overlayClickThrough: boolean
  overlayVisible: boolean
}

export interface PlaybackConfig {
  enabled: boolean
  deviceId: string
  deviceLabel: string
  monitorEnabled: boolean
}

export interface AudioOutputDeviceInfo {
  deviceId: string
  label: string
  // true = trùng thiết bị render mặc định mà loopback đang thu → phát vào sẽ bị vọng lại
  isCaptured: boolean
}

export interface AudioInputDeviceInfo {
  deviceId: string
  label: string
}

// Cấu hình chiều đi gửi xuống engine: player CABLE + thiết bị nhận
export interface OutgoingConfig {
  enabled: boolean
  deviceId: string
  deviceLabel: string
}

export interface PlaybackSinkState {
  ok: boolean
  deviceId: string
  label: string
  isCaptured: boolean
  error?: string
}

// Thiết bị phát theo Core Audio của Windows (id IMMDevice, không phải deviceId của Chromium)
export interface WindowsAudioDevice {
  id: string
  name: string
  isDefault: boolean
}

export type ExportFormat = 'txt' | 'srt' | 'md'

export type UpdateState =
  | 'idle'
  | 'checking'
  | 'available'
  | 'none'
  | 'downloading'
  | 'downloaded'
  | 'error'

export interface UpdateStatus {
  state: UpdateState
  version?: string
  percent?: number
  error?: string
}
