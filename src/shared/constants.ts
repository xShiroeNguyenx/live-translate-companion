export const INPUT_SAMPLE_RATE = 16000
export const OUTPUT_SAMPLE_RATE = 24000
export const FRAME_MS = 100
export const SAMPLES_PER_FRAME = (INPUT_SAMPLE_RATE * FRAME_MS) / 1000
export const BYTES_PER_FRAME = SAMPLES_PER_FRAME * 2

export const PRICE_USD_PER_MINUTE = 0.023

export const VAD_DEFAULT_THRESHOLD_DB = -50
export const VAD_OPEN_FRAMES = 2
export const VAD_HANGOVER_MS = 2000
export const VAD_PREROLL_MS = 500
export const IDLE_DISCONNECT_MS = 5 * 60 * 1000

export const SEGMENT_GAP_MS = 2000
export const SEGMENT_MIN_SPLIT_CHARS = 50
export const SEGMENT_MAX_CHARS = 250
export const OVERLAY_TOGGLE_SHORTCUT = 'CommandOrControl+Shift+O'
// bật/tắt chiều về từ bất cứ đâu (tránh Ctrl+Shift+T của trình duyệt)
export const INCOMING_TOGGLE_SHORTCUT = 'CommandOrControl+Alt+T'

// alias luôn trỏ tới bản Flash mới nhất — đổi được trong Cài đặt
export const DEFAULT_SUMMARY_MODEL = 'gemini-flash-latest'
// phiên quá ngắn thì không tự tóm tắt (tính theo ký tự bản dịch)
export const SUMMARY_MIN_CHARS = 200
export const BUDGET_WARN_RATIO = 0.8

// Chiều đi (nói tiếng Việt → giọng đích vào meeting)
export const OUTGOING_DEFAULT_TARGET = 'ja'
export const OUTGOING_PTT_SHORTCUT = 'CommandOrControl+Space'
export const VIRTUAL_MIC_HINT = 'CABLE Input'
