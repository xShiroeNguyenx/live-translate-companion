// Tên cuộc họp: do người dùng đặt (title) hoặc AI đặt từ bản tóm tắt (autoTitle).

export const MAX_TITLE_CHARS = 120

// bỏ ký tự điều khiển, gộp khoảng trắng, cắt độ dài; không phải chuỗi → rỗng
export function normalizeTitle(raw: unknown): string {
  if (typeof raw !== 'string') return ''
  return raw
    .replace(/[\u0000-\u001f\u007f]/g, ' ')
    .replace(/\s+/g, ' ')
    .trim()
    .slice(0, MAX_TITLE_CHARS)
    .trim()
}

// tên để hiển thị: tên người dùng đặt được ưu tiên hơn tên AI đặt
export function meetingTitleOf(rec: { title?: string; autoTitle?: string }): string {
  return rec.title?.trim() || rec.autoTitle?.trim() || ''
}

// Bản tóm tắt mở đầu bằng 1 dòng "# <tên cuộc họp>" (xem buildSummaryPrompt) → tách tên ra.
// Tóm tắt cũ không có dòng này thì title rỗng, body giữ nguyên.
export function splitSummaryTitle(summary: string): { title: string; body: string } {
  const lines = summary.split('\n')
  const idx = lines.findIndex((l) => l.trim() !== '')
  // "# Tên" (đúng 1 dấu #) — không nhận "## Tóm tắt"
  const m = idx >= 0 ? lines[idx].trim().match(/^#\s+(.+?)\s*#*$/) : null
  if (!m) return { title: '', body: summary }
  const title = normalizeTitle(m[1].replace(/^[*"“”'`]+|[*"“”'`]+$/g, ''))
  if (!title) return { title: '', body: summary }
  const rest = lines.slice(idx + 1)
  while (rest.length && rest[0].trim() === '') rest.shift()
  return { title, body: rest.join('\n') }
}
