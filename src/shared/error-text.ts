// Lỗi → câu đọc được. Lỗi đi qua ranh giới tiến trình (executeJavaScript, IPC) có thể không còn
// là Error: DOMException của getUserMedia về tới main thành object thường, String() ra
// "[object Object]".

function field(err: unknown, key: 'name' | 'message'): string {
  if (typeof err !== 'object' || err === null) return ''
  const v = (err as Record<string, unknown>)[key]
  return typeof v === 'string' ? v.trim() : ''
}

export function errorText(err: unknown): string {
  if (typeof err === 'string') return err.trim() || 'Lỗi không rõ'
  const message = field(err, 'message')
  if (message) return message
  const name = field(err, 'name')
  if (name && name !== 'Error') return name
  if (typeof err === 'object' && err !== null) {
    try {
      const json = JSON.stringify(err)
      if (json && json !== '{}') return json.slice(0, 300)
    } catch {
      /* object vòng */
    }
    return 'Lỗi không rõ'
  }
  return err === undefined || err === null ? 'Lỗi không rõ' : String(err)
}

// Lỗi mở micro (getUserMedia) → nguyên nhân + việc cần làm
export function micErrorText(err: unknown): string {
  const detail = errorText(err)
  switch (field(err, 'name')) {
    case 'NotFoundError':
    case 'OverconstrainedError':
      return 'Không tìm thấy micro đã chọn. Cắm lại micro hoặc chọn micro khác ở Cài đặt → Chiều đi.'
    case 'NotAllowedError':
    case 'SecurityError':
      return 'Windows đang chặn quyền micro. Bật ở Settings → Privacy & security → Microphone, cho phép ứng dụng desktop.'
    case 'NotReadableError':
    case 'AbortError':
      return `Không mở được micro, có thể app khác đang giữ (${detail}).`
    default:
      return detail
  }
}
