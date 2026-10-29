// Phiên bản endpoint Gemini API. Live API chỉ có trên v1beta/v1alpha (chưa có trên v1).
export const API_VERSIONS = ['v1beta', 'v1alpha'] as const
export type GeminiApiVersion = (typeof API_VERSIONS)[number]

export const DEFAULT_API_VERSION: GeminiApiVersion = 'v1beta'
export const DEFAULT_LIVE_MODEL = 'gemini-3.5-live-translate-preview'

// Giá trị lạ (settings.json sửa tay, bản cũ) → về mặc định thay vì gửi version hỏng lên server
export function normalizeApiVersion(value: unknown): GeminiApiVersion {
  return API_VERSIONS.includes(value as GeminiApiVersion)
    ? (value as GeminiApiVersion)
    : DEFAULT_API_VERSION
}

// User có thể nhập "gemini-…" hoặc "models/gemini-…"; Live API cần dạng có tiền tố "models/"
export function normalizeLiveModel(value: unknown): string {
  const raw = typeof value === 'string' ? value.trim() : ''
  const id = raw.replace(/^models\//, '').trim() || DEFAULT_LIVE_MODEL
  return `models/${id}`
}

export interface LiveModelInfo {
  // không có tiền tố "models/"
  id: string
  displayName: string
}

// Từ kết quả models.list: chỉ giữ model dịch chạy được Live API. Model Live đa năng
// (vd gemini-3.8-live) không nhận translationConfig nên không đưa vào danh sách
export function pickLiveModels(
  models: Array<{ name?: string; displayName?: string; supportedActions?: string[] }>
): LiveModelInfo[] {
  const seen = new Set<string>()
  const out: LiveModelInfo[] = []
  for (const m of models) {
    if (!m.name || !m.supportedActions?.includes('bidiGenerateContent')) continue
    const id = m.name.replace(/^models\//, '')
    if (!/translate/i.test(id) || seen.has(id)) continue
    seen.add(id)
    out.push({ id, displayName: m.displayName?.trim() || id })
  }
  return out.sort((a, b) => a.id.localeCompare(b.id))
}

export function liveWsUrl(apiVersion: GeminiApiVersion): string {
  return `wss://generativelanguage.googleapis.com/ws/google.ai.generativelanguage.${apiVersion}.GenerativeService.BidiGenerateContent`
}
