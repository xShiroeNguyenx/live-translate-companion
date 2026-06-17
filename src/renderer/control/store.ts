import { create } from 'zustand'
import type {
  AppSettings,
  AudioInputDeviceInfo,
  AudioOutputDeviceInfo,
  Metrics,
  PlaybackSinkState,
  SessionStateInfo,
  SubtitleSegment,
  SubtitleUpdate,
  WindowsAudioDevice
} from '../../shared/types'

const MAX_SEGMENTS = 500

const EMPTY_METRICS: Metrics = {
  rmsDb: -100,
  secondsSent: 0,
  estimatedCostUsd: 0,
  sessionSeconds: 0,
  reconnects: 0
}

function applySubtitleUpdate(prev: SubtitleSegment[], update: SubtitleUpdate): SubtitleSegment[] {
  if (update.type === 'clear') return []
  if (update.type === 'history') return update.segments.slice(-MAX_SEGMENTS)
  const segments = [...prev]
  const idx = segments.findIndex((s) => s.id === update.segment.id)
  if (idx >= 0) segments[idx] = update.segment
  else segments.push(update.segment)
  return segments.slice(-MAX_SEGMENTS)
}

interface ControlState {
  settings: AppSettings | null
  session: SessionStateInfo
  metrics: Metrics
  segments: SubtitleSegment[]
  hasKey: boolean
  // enumerate ở engine window — deviceId chỉ hợp lệ với document gọi setSinkId
  outputDevices: AudioOutputDeviceInfo[]
  inputDevices: AudioInputDeviceInfo[]
  sinkState: PlaybackSinkState | null
  // thiết bị theo Core Audio Windows — chọn nơi meeting phát ra (loopback thu luồng này)
  windowsOutputs: WindowsAudioDevice[]
  // ── Chiều đi ──
  outgoing: SessionStateInfo
  outgoingMetrics: Metrics
  outgoingSegments: SubtitleSegment[]
  outgoingSinkState: PlaybackSinkState | null
  init(): void
  setHasKey(v: boolean): void
  patchSettings(patch: Partial<AppSettings>): Promise<void>
  refreshWindowsOutputs(): Promise<void>
  setWindowsDefault(deviceId: string): Promise<{ ok: boolean; error?: string }>
}

const api = window.controlApi

export const useControlStore = create<ControlState>((set, get) => ({
  settings: null,
  session: { state: 'idle' },
  metrics: EMPTY_METRICS,
  segments: [],
  hasKey: false,
  outputDevices: [],
  inputDevices: [],
  sinkState: null,
  windowsOutputs: [],
  outgoing: { state: 'idle' },
  outgoingMetrics: EMPTY_METRICS,
  outgoingSegments: [],
  outgoingSinkState: null,

  init: () => {
    if (!api) return
    void api.getSettings().then((settings) => set({ settings }))
    void api.hasApiKey().then((hasKey) => set({ hasKey }))
    void api.getOutputDevices().then((outputDevices) => set({ outputDevices }))
    void api.getInputDevices().then((inputDevices) => set({ inputDevices }))
    void get().refreshWindowsOutputs()

    api.onSettingsChanged((settings) => set({ settings }))
    api.onSessionState((session) => set({ session }))
    api.onMetrics((metrics) => set({ metrics }))
    api.onOutputDevices((outputDevices) => {
      set({ outputDevices })
      // devicechange (cắm/rút thiết bị) — đồng bộ luôn danh sách phía Windows
      void get().refreshWindowsOutputs()
    })
    api.onInputDevices((inputDevices) => set({ inputDevices }))
    api.onPlaybackSinkState((sinkState) => set({ sinkState }))
    api.onSubtitleUpdate((update) =>
      set((state) => ({ segments: applySubtitleUpdate(state.segments, update) }))
    )

    api.onOutgoingState((outgoing) => set({ outgoing }))
    api.onOutgoingMetrics((outgoingMetrics) => set({ outgoingMetrics }))
    api.onOutgoingSinkState((outgoingSinkState) => set({ outgoingSinkState }))
    api.onOutgoingSubtitle((update) =>
      set((state) => ({ outgoingSegments: applySubtitleUpdate(state.outgoingSegments, update) }))
    )
  },

  setHasKey: (hasKey) => set({ hasKey }),

  patchSettings: async (patch) => {
    if (!api) return
    const settings = await api.setSettings(patch)
    set({ settings })
  },

  refreshWindowsOutputs: async () => {
    if (!api) return
    const windowsOutputs = await api.getWindowsOutputDevices()
    set({ windowsOutputs })
  },

  setWindowsDefault: async (deviceId) => {
    if (!api) return { ok: false, error: 'preload chưa nạp' }
    const result = await api.setWindowsDefaultOutput(deviceId)
    await get().refreshWindowsOutputs()
    return result
  }
}))
