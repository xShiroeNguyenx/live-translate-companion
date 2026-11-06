// electron-updater ném lỗi thô (stack + toàn bộ HTTP header). Rút về 1 câu cho người dùng và
// đánh dấu lỗi TẠM THỜI — loại tự hết sau ít phút, app nên tự thử lại thay vì báo động.

export interface UpdateErrorInfo {
  message: string
  transient: boolean
}

const MAX_LEN = 200

// release vừa tạo nhưng CI chưa upload xong latest.yml / installer
const PUBLISHING_RE = /Cannot find latest\.yml|latest\.yml.*\b404\b|HttpError: 404/i
const NETWORK_RE =
  /ENOTFOUND|EAI_AGAIN|ETIMEDOUT|ECONNRESET|ECONNREFUSED|ENETUNREACH|socket hang up|net::ERR_|HttpError: 5\d\d/i

export function describeUpdateError(raw: string): UpdateErrorInfo {
  if (PUBLISHING_RE.test(raw)) {
    return {
      message: 'Bản mới đang được đăng lên GitHub, chưa tải được. App sẽ tự thử lại sau ít phút.',
      transient: true
    }
  }
  if (NETWORK_RE.test(raw)) {
    return {
      message: 'Không kết nối được GitHub để kiểm tra cập nhật. App sẽ tự thử lại sau ít phút.',
      transient: true
    }
  }
  // lỗi khác: chỉ giữ dòng đầu, cắt ngắn — chi tiết đầy đủ vẫn có trong log main process
  const firstLine = raw.split(/\r?\n/)[0].trim() || 'Lỗi không rõ'
  return {
    message: firstLine.length > MAX_LEN ? `${firstLine.slice(0, MAX_LEN)}…` : firstLine,
    transient: false
  }
}
