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
// Tạm dừng: giữ kết nối thêm chút để nhận nốt câu đang dịch dở, rồi mới đóng WS
export const PAUSE_DISCONNECT_MS = 15 * 1000
// resumption handle của Gemini Live còn hạn ~2h → bỏ handle cũ hơn mức này, mở phiên Gemini mới
export const RESUMPTION_MAX_AGE_MS = 110 * 60 * 1000

export const SEGMENT_GAP_MS = 2000
export const SEGMENT_MIN_SPLIT_CHARS = 50
export const SEGMENT_MAX_CHARS = 250
export const OVERLAY_TOGGLE_SHORTCUT = 'CommandOrControl+Shift+O'
// bật/tắt chiều về từ bất cứ đâu (tránh Ctrl+Shift+T của trình duyệt)
export const INCOMING_TOGGLE_SHORTCUT = 'CommandOrControl+Alt+T'
// tạm dừng / tiếp tục chiều về (giữ nguyên phụ đề, file transcript, mục lịch sử)
export const INCOMING_PAUSE_SHORTCUT = 'CommandOrControl+Alt+P'

// alias luôn trỏ tới bản Flash mới nhất — đổi được trong Cài đặt
export const DEFAULT_SUMMARY_MODEL = 'gemini-flash-latest'
// phiên quá ngắn thì không tự tóm tắt (tính theo ký tự bản dịch)
export const SUMMARY_MIN_CHARS = 200
export const BUDGET_WARN_RATIO = 0.8

// Giá Gemini Flash (tóm tắt + trợ lý cuộc họp), USD / 1 triệu token — theo
// ai.google.dev/gemini-api/docs/pricing (tra 2026-11-06). Lấy giá CHUẨN chứ không lấy giá khuyến
// mãi, để ước tính không thấp hơn thực tế; token "thinking" tính như output.
export const FLASH_PRICE_USD_PER_M_INPUT = 1.5
export const FLASH_PRICE_USD_PER_M_OUTPUT = 7.5

// Trợ lý cuộc họp (hỏi đáp + gợi ý trả lời) dựa trên transcript đang có
// ~30–40k token; transcript dài hơn thì giữ phần gần nhất
export const ASSISTANT_MAX_TRANSCRIPT_CHARS = 120_000
// "đoạn gần nhất" để gợi ý trả lời: 3 phút cuối, nhưng ít nhất 6 câu có lời
export const ASSISTANT_RECENT_MS = 3 * 60 * 1000
export const ASSISTANT_RECENT_MIN_LINES = 6
export const ASSISTANT_MAX_QUESTION_CHARS = 500
// số lượt hỏi đáp trước gửi kèm để hỏi nối tiếp ("còn phương án 2 thì sao?")
export const ASSISTANT_PREVIOUS_TURNS = 3

// Chiều đi (nói tiếng Việt → giọng đích vào meeting)
export const OUTGOING_DEFAULT_TARGET = 'ja'
export const OUTGOING_PTT_SHORTCUT = 'CommandOrControl+Space'
export const VIRTUAL_MIC_HINT = 'CABLE Input'
