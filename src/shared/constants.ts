export const INPUT_SAMPLE_RATE = 16000
export const OUTPUT_SAMPLE_RATE = 24000
export const FRAME_MS = 100
export const SAMPLES_PER_FRAME = (INPUT_SAMPLE_RATE * FRAME_MS) / 1000
export const BYTES_PER_FRAME = SAMPLES_PER_FRAME * 2

// Model dịch Live (gemini-3.5-live-translate-preview): $0.0053/phút audio vào + $0.0315/phút audio ra,
// tính theo 25 token/giây cho CẢ vào lẫn ra — theo ai.google.dev/gemini-api/docs/pricing (tra 2026-11-09).
// Đã đối chiếu usageMetadata thật: 34s audio → 850 token vào + 850 token ra. Áp cho cả 2 chiều.
export const PRICE_USD_PER_MINUTE = 0.0368

// ── Chế độ "Chỉ chữ" (chiều về): chép lời bằng Live rồi dịch từng câu bằng Flash-lite ──
// Model dịch Live luôn sinh (và tính tiền) audio dù yêu cầu TEXT, nên chế độ chỉ chữ dùng model khác.
export const TRANSCRIBE_LIVE_MODEL = 'gemini-3.5-transcribe-live'
// $3.50/1M token audio vào (~$0.005/phút) + chữ ra ~175 token/phút (~$0.004/phút), theo bảng giá
export const TRANSCRIBE_PRICE_USD_PER_MINUTE = 0.009
// phiên transcribe tối đa 10 phút: xoay sớm lúc im lặng, quá mốc này thì xoay bắt buộc
export const TRANSCRIBE_ROTATE_WHEN_QUIET_MS = 8 * 60 * 1000
export const TRANSCRIBE_MAX_SESSION_MS = 9 * 60 * 1000 + 30 * 1000
// Flash-lite: không "suy nghĩ" mặc định → ~0.7s/câu (Flash thường mất 4–6s vì thinking)
export const TEXT_TRANSLATE_MODEL = 'gemini-flash-lite-latest'
// USD / 1 triệu token — lấy mức CAO nhất trong các bản Flash-lite (3.5-flash-lite) để không ước tính thấp
export const TEXT_TRANSLATE_PRICE_USD_PER_M_INPUT = 0.3
export const TEXT_TRANSLATE_PRICE_USD_PER_M_OUTPUT = 2.5
// số câu gốc trước đó gửi kèm làm ngữ cảnh khi dịch 1 câu
// Ước tính để hiện cho người dùng: chép lời + Flash-lite dịch (~8 câu/phút × ~130 token ≈ $0.001)
export const TEXT_MODE_EST_USD_PER_MINUTE = TRANSCRIBE_PRICE_USD_PER_MINUTE + 0.001
export const TEXT_TRANSLATE_CONTEXT_SEGMENTS = 3
export const TEXT_TRANSLATE_CONCURRENCY = 3
export const TEXT_TRANSLATE_TIMEOUT_MS = 15_000
// lỗi dịch liên tiếp tới mức này → báo lên thẻ Chiều về (sai key, hết quota…)
export const TEXT_TRANSLATE_ERROR_STREAK = 3
export const TEXT_TRANSLATE_FAILED_MARK = '⚠ Không dịch được câu này'
// Dừng phiên chỉ chữ: chờ câu cuối dịch xong tối đa chừng này rồi mới tự tóm tắt
export const TEXT_TRANSLATE_SETTLE_MS = 8000

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
// Hỏi về phiên đã lưu (tab Lịch sử): câu hỏi có thể về bất kỳ đoạn nào nên gửi cả transcript —
// ~100–160k token, đủ cho cuộc họp vài giờ. Họp 30 phút ≈ 40k ký tự ≈ $0.03/câu hỏi (shared/cost.ts).
export const HISTORY_ASK_MAX_TRANSCRIPT_CHARS = 400_000

// Chiều đi (nói tiếng Việt → giọng đích vào meeting)
export const OUTGOING_DEFAULT_TARGET = 'ja'
export const OUTGOING_PTT_SHORTCUT = 'CommandOrControl+Space'
export const VIRTUAL_MIC_HINT = 'CABLE Input'

// ── Chiều đi "Gõ để nói": gõ tiếng Việt → Flash-lite dịch → model TTS đọc thành giọng vào meeting ──
// Tên model, định dạng audio (WAV 24 kHz mono 16-bit) và giá theo ai.google.dev/gemini-api/docs
// (speech-generation + pricing, tra 2026-11-12).
export const TTS_MODEL = 'gemini-3.8-flash-tts'
// USD / 1 triệu token. Lấy giá CHUẨN (áp từ 2027-01-01), không lấy giá khuyến mãi tới hết 2026
// ($0.50 / $9.00), để ước tính không thấp hơn thực tế.
export const TTS_PRICE_USD_PER_M_INPUT = 1.0
export const TTS_PRICE_USD_PER_M_OUTPUT = 18.0
// audio ra: 25 token/giây → ~$0.027/phút giọng
export const TTS_AUDIO_TOKENS_PER_SECOND = 25
export const TTS_EST_USD_PER_MINUTE =
  (TTS_PRICE_USD_PER_M_OUTPUT * TTS_AUDIO_TOKENS_PER_SECOND * 60) / 1_000_000
export const TTS_TIMEOUT_MS = 45_000
export const TYPED_SPEECH_MAX_CHARS = 600
// số câu gần nhất giữ sẵn giọng trong bộ nhớ để phát lại không tốn tiền (~0,3 MB mỗi câu 6 giây)
export const TYPED_SPEECH_CACHE_SENTENCES = 30
// đệm sau khi audio hết, trước khi nhả player CABLE (bù độ trễ lịch phát + endpoint)
export const TYPED_SPEECH_TAIL_MS = 400
// giọng dựng sẵn của Gemini TTS (một phần nhỏ trong 30 giọng), tự nhận ngôn ngữ theo chữ
export const TTS_VOICES: { id: string; label: string }[] = [
  { id: 'Kore', label: 'Kore (nữ, rõ ràng)' },
  { id: 'Aoede', label: 'Aoede (nữ, nhẹ nhàng)' },
  { id: 'Leda', label: 'Leda (nữ, trẻ)' },
  { id: 'Charon', label: 'Charon (nam, điềm đạm)' },
  { id: 'Orus', label: 'Orus (nam, chắc giọng)' },
  { id: 'Puck', label: 'Puck (nam, tươi)' }
]
export const DEFAULT_TTS_VOICE = 'Kore'
