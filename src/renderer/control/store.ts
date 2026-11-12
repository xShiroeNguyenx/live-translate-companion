import { create } from 'zustand'
import { ASSISTANT_PREVIOUS_TURNS } from '../../shared/constants'
import type {
  AppSettings,
  AssistantReplyResult,
  AudioInputDeviceInfo,
  AudioOutputDeviceInfo,
  Metrics,
  PlaybackSinkState,
  QaTurn,
  SessionStateInfo,
  SubtitleSegment,
  SubtitleUpdate,
  SummaryStatus,
  TypedSpeechState,
  UpdateStatus,
  UsageSummary,
  WindowsAudioDevice
} from '../../shared/types'

const MAX_SEGMENTS = 500
const MAX_ASSISTANT_ITEMS = 30

type AssistantItemState = 'running' | 'done' | 'error'

// mục trong khung Trợ lý cuộc họp, mới nhất đứng đầu
export type AssistantItem =
  | {
      id: number
      kind: 'ask'
      at: number
      question: string
      state: AssistantItemState
      answer?: string
      error?: string
    }
  | {
      id: number
      kind: 'reply'
      at: number
      state: AssistantItemState
      result?: AssistantReplyResult
      error?: string
    }

export type AskItem = Extract<AssistantItem, { kind: 'ask' }>

let assistantSeq = 0

// vài lượt hỏi đáp gần nhất đã có câu trả lời (danh sách mới → cũ), trả về cũ → mới
function previousTurns(items: AssistantItem[]): QaTurn[] {
  return items
    .flatMap((i) =>
      i.kind === 'ask' && i.state === 'done' && i.answer
        ? [{ question: i.question, answer: i.answer }]
        : []
    )
    .slice(0, ASSISTANT_PREVIOUS_TURNS)
    .reverse()
}

export interface TypedDraft {
  // câu người dùng gõ
  source: string
  // bản dịch (sửa tay được) — đây là câu sẽ được đọc
  translation: string
  // câu gốc ứng với bản dịch đang hiện; khác `source` = bản dịch đã cũ
  translatedFrom: string
}

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
  // "Gõ để nói": trạng thái phát + bản nháp (giữ ở store để đổi tab không mất chữ đang gõ)
  typedSpeech: TypedSpeechState
  // "Nói thẳng": giọng thật đang đi vào mic ảo (main là nguồn sự thật)
  directMic: boolean
  typedDraft: TypedDraft
  setTypedDraft(patch: Partial<TypedDraft>): void
  appVersion: string
  update: UpdateStatus
  usage: UsageSummary
  // trạng thái tóm tắt gần nhất theo id phiên
  summaries: Record<string, SummaryStatus>
  lastSummary: SummaryStatus | null
  // trợ lý cuộc họp — xoá khi bắt đầu phiên chiều về mới (transcript bị xoá)
  assistantItems: AssistantItem[]
  // tên cuộc họp hiện tại (phiên chiều về đang chạy / vừa dừng); main là nguồn sự thật
  meetingTitle: string
  setMeetingTitle(title: string): Promise<void>
  askAssistant(question: string): Promise<void>
  suggestReplies(): Promise<void>
  clearAssistant(): void
  // hỏi về phiên đã lưu (tab Lịch sử) — theo id phiên, giữ trong bộ nhớ tới khi tắt app
  historyQa: Record<string, AskItem[]>
  askHistory(id: string, question: string): Promise<void>
  clearHistoryQa(id: string): void
  init(): void
  setHasKey(v: boolean): void
  patchSettings(patch: Partial<AppSettings>): Promise<void>
  refreshWindowsOutputs(): Promise<void>
  setWindowsDefault(deviceId: string): Promise<{ ok: boolean; error?: string }>
}

const api = window.controlApi

type SetState = (fn: (state: ControlState) => Partial<ControlState>) => void

function addAssistantItem(set: SetState, item: AssistantItem): void {
  set((s) => ({ assistantItems: [item, ...s.assistantItems].slice(0, MAX_ASSISTANT_ITEMS) }))
}

// mục đã bị xoá (bấm Xoá, hoặc phiên mới) trong lúc chờ → bỏ kết quả
function patchAssistantItem(
  set: SetState,
  id: number,
  patch: {
    state: AssistantItemState
    answer?: string
    result?: AssistantReplyResult
    error?: string
  }
): void {
  set((s) => ({
    assistantItems: s.assistantItems.map((i) =>
      i.id === id ? ({ ...i, ...patch } as AssistantItem) : i
    )
  }))
}

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
  typedSpeech: 'idle',
  directMic: false,
  typedDraft: { source: '', translation: '', translatedFrom: '' },
  setTypedDraft: (patch) => set((s) => ({ typedDraft: { ...s.typedDraft, ...patch } })),
  appVersion: '',
  update: { state: 'idle' },
  usage: { todayUsd: 0, monthUsd: 0, budgetUsd: 0 },
  summaries: {},
  lastSummary: null,
  assistantItems: [],
  historyQa: {},
  meetingTitle: '',

  init: () => {
    if (!api) return
    void api.getSettings().then((settings) => set({ settings }))
    void api.hasApiKey().then((hasKey) => set({ hasKey }))
    void api.getOutputDevices().then((outputDevices) => set({ outputDevices }))
    void api.getInputDevices().then((inputDevices) => set({ inputDevices }))
    void api.getAppVersion().then((appVersion) => set({ appVersion }))
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
      set((state) => ({
        segments: applySubtitleUpdate(state.segments, update),
        // phiên mới → câu trả lời về cuộc họp cũ không còn đúng ngữ cảnh
        ...(update.type === 'clear' ? { assistantItems: [] } : {})
      }))
    )

    api.onOutgoingState((outgoing) => set({ outgoing }))
    api.onOutgoingMetrics((outgoingMetrics) => set({ outgoingMetrics }))
    api.onOutgoingSinkState((outgoingSinkState) => set({ outgoingSinkState }))
    void api.getTypedState().then((typedSpeech) => set({ typedSpeech }))
    api.onTypedState((typedSpeech) => set({ typedSpeech }))
    void api.getDirectMic().then((directMic) => set({ directMic }))
    api.onDirectMic((directMic) => set({ directMic }))
    api.onUpdateStatus((update) => set({ update }))
    void api.getUsage().then((usage) => set({ usage }))
    api.onUsage((usage) => set({ usage }))
    void api.getMeetingTitle().then((meetingTitle) => set({ meetingTitle }))
    api.onMeetingTitle((meetingTitle) => set({ meetingTitle }))
    api.onSummaryStatus((status) =>
      set((state) => ({
        summaries: { ...state.summaries, [status.id]: status },
        lastSummary: status
      }))
    )
    api.onOutgoingSubtitle((update) =>
      set((state) => ({ outgoingSegments: applySubtitleUpdate(state.outgoingSegments, update) }))
    )
  },

  setHasKey: (hasKey) => set({ hasKey }),

  askAssistant: async (question) => {
    if (!api) return
    // vài lượt hỏi đáp gần nhất (cũ → mới) để hỏi nối tiếp được
    const previous = previousTurns(get().assistantItems)
    const id = ++assistantSeq
    addAssistantItem(set, { id, kind: 'ask', at: Date.now(), question, state: 'running' })
    try {
      const r = await api.askAssistant(question, previous)
      patchAssistantItem(
        set,
        id,
        r.ok ? { state: 'done', answer: r.answer } : { state: 'error', error: r.error }
      )
    } catch (err) {
      patchAssistantItem(set, id, { state: 'error', error: String(err) })
    }
  },

  suggestReplies: async () => {
    if (!api) return
    const id = ++assistantSeq
    addAssistantItem(set, { id, kind: 'reply', at: Date.now(), state: 'running' })
    try {
      const r = await api.suggestReplies()
      patchAssistantItem(
        set,
        id,
        r.ok ? { state: 'done', result: r } : { state: 'error', error: r.error }
      )
    } catch (err) {
      patchAssistantItem(set, id, { state: 'error', error: String(err) })
    }
  },

  clearAssistant: () => set({ assistantItems: [] }),

  askHistory: async (sessionId, question) => {
    if (!api) return
    const previous = previousTurns(get().historyQa[sessionId] ?? [])
    const id = ++assistantSeq
    const item: AskItem = { id, kind: 'ask', at: Date.now(), question, state: 'running' }
    set((s) => ({
      historyQa: {
        ...s.historyQa,
        [sessionId]: [item, ...(s.historyQa[sessionId] ?? [])].slice(0, MAX_ASSISTANT_ITEMS)
      }
    }))
    // mục đã bị xoá (bấm Xoá / xoá phiên) trong lúc chờ → map không còn id → bỏ kết quả
    const patch = (p: Partial<AskItem>): void =>
      set((s) => {
        const list = s.historyQa[sessionId]
        if (!list) return {}
        return {
          historyQa: {
            ...s.historyQa,
            [sessionId]: list.map((i) => (i.id === id ? { ...i, ...p } : i))
          }
        }
      })
    try {
      const r = await api.askHistory(sessionId, question, previous)
      patch(r.ok ? { state: 'done', answer: r.answer } : { state: 'error', error: r.error })
    } catch (err) {
      patch({ state: 'error', error: String(err) })
    }
  },

  clearHistoryQa: (sessionId) =>
    set((s) => {
      const next = { ...s.historyQa }
      delete next[sessionId]
      return { historyQa: next }
    }),

  setMeetingTitle: async (title) => {
    if (!api) return
    const meetingTitle = await api.setMeetingTitle(title)
    set({ meetingTitle })
  },

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
