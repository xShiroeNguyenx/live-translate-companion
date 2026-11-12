import type { GeminiApiVersion } from './gemini-api'

export type SessionState =
  | 'idle'
  | 'connecting'
  | 'streaming'
  | 'gated'
  // phiên vẫn mở (phụ đề, transcript, lịch sử giữ nguyên) nhưng không gửi audio
  | 'paused'
  | 'draining'
  | 'reconnecting'
  | 'stopping'
  | 'error'

export interface SessionStateInfo {
  state: SessionState
  error?: string
  usingFallbackClient?: boolean
  // model Live từ chối systemInstruction → phiên này chạy không có ngữ cảnh cuộc họp
  contextDisabled?: boolean
  // phiên đang chạy ở chế độ chỉ chữ (chép lời + dịch từng câu, không có giọng dịch)
  textOnly?: boolean
  // chế độ chỉ chữ: dịch câu lỗi liên tiếp (sai key, hết quota…)
  translateError?: string
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
  // có giá trị = mốc TẠM DỪNG (không có lời): tạm dừng lúc startedAt, tiếp tục lúc pauseEndedAt
  pauseEndedAt?: number
}

export type SubtitleUpdate =
  | { type: 'segment'; segment: SubtitleSegment }
  | { type: 'history'; segments: SubtitleSegment[] }
  | { type: 'clear' }

export type OutgoingMode = 'vad' | 'ptt'

// Chiều về: 'speech' = model dịch Live (giọng + chữ); 'text' = chỉ chữ (rẻ hơn, không có giọng dịch)
export type IncomingMode = 'speech' | 'text'

export interface AppSettings {
  targetLanguage: string
  incomingMode: IncomingMode
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
  // giọng đọc của "Gõ để nói" (id trong TTS_VOICES)
  typedSpeechVoice: string
  overlayFontSize: number
  overlayOpacity: number
  overlayClickThrough: boolean
  overlayVisible: boolean
  // tự lưu transcript mỗi phiên (cả 2 chiều); autoSaveDir rỗng = Documents/LiveTranslate
  autoSaveEnabled: boolean
  autoSaveFormat: ExportFormat
  autoSaveDir: string
  // ngữ cảnh/thuật ngữ cuộc họp — gửi kèm phiên Live (nếu model nhận) và luôn dùng cho tóm tắt
  meetingContext: string
  // từ khoá cần chú ý (phân tách bằng dấu phẩy/xuống dòng) — tô sáng + thông báo Windows
  highlightKeywords: string
  autoSummary: boolean
  summaryModel: string
  // Gemini API: version endpoint (Live + tóm tắt) và model dịch Live; áp dụng từ lần kết nối sau
  apiVersion: GeminiApiVersion
  liveModel: string
  // 0 = không giới hạn
  monthlyBudgetUsd: number
  minimizeToTray: boolean
}

export type SessionDirection = 'incoming' | 'outgoing'

// Bản ghi lịch sử 1 phiên — userData/history/<id>.json
export interface HistoryRecord {
  id: string
  direction: SessionDirection
  startedAt: number
  endedAt: number
  targetLanguage: string
  secondsSent: number
  costUsd: number
  transcriptFile: string | null
  summaryFile?: string
  summary?: string
  // tên cuộc họp do người dùng đặt (tab Dịch hoặc tab Lịch sử)
  title?: string
  // tên AI đặt từ dòng "# …" đầu bản tóm tắt — chỉ dùng khi chưa có title
  autoTitle?: string
  segments: SubtitleSegment[]
}

export interface HistoryEntry extends Omit<HistoryRecord, 'segments' | 'summary'> {
  preview: string
  segmentCount: number
  hasSummary: boolean
}

export interface SummaryStatus {
  id: string
  state: 'running' | 'done' | 'error'
  error?: string
}

// ── Trợ lý cuộc họp ──
export interface QaTurn {
  question: string
  answer: string
}

export interface ReplySuggestion {
  // câu trả lời bằng ngôn ngữ của người dùng (đích chiều về)
  text: string
  // cùng ý, bằng ngôn ngữ nói vào meeting (đích chiều đi); rỗng khi 2 ngôn ngữ trùng nhau
  translation: string
}

export interface AssistantAskResult {
  ok: boolean
  answer?: string
  error?: string
}

export interface AssistantReplyResult {
  ok: boolean
  // điều người khác vừa hỏi/đề nghị, theo cách model hiểu
  asked?: string
  suggestions?: ReplySuggestion[]
  // mã ngôn ngữ của `translation` (đích chiều đi)
  replyLanguage?: string
  error?: string
}

// ── Chiều đi "Gõ để nói" ──
// synthesizing = đang chờ model tạo giọng; playing = đang phát vào thiết bị "Phát vào"
export type TypedSpeechState = 'idle' | 'synthesizing' | 'playing'

export interface TypedTranslateResult {
  ok: boolean
  translation?: string
  error?: string
}

export interface TypedSpeakResult {
  ok: boolean
  // độ dài đoạn giọng sẽ phát (ms)
  durationMs?: number
  // người dùng bấm Dừng trong lúc chờ — không phải lỗi
  stopped?: boolean
  error?: string
}

export interface UsageSummary {
  todayUsd: number
  monthUsd: number
  budgetUsd: number
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
// "Nói thẳng": kết quả bật/tắt. error có thể đi kèm ok=true (đã tắt nhưng chưa dịch tiếp được)
export interface DirectMicResult {
  ok: boolean
  on: boolean
  error?: string
}

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
  // lỗi tự hết sau ít phút (release đang đăng dở, mất mạng) — app tự thử lại, UI báo nhẹ
  transient?: boolean
}
