// Bỏ dấu + chữ thường để "Khánh" khớp cả "khanh"; giữ nguyên ký tự CJK
export function normalizeForMatch(text: string): string {
  return text
    .normalize('NFD')
    .replace(/[\u0300-\u036f]/g, '')
    .replace(/đ/g, 'd')
    .replace(/Đ/g, 'D')
    .toLowerCase()
}

export function parseKeywords(raw: string): string[] {
  return raw
    .split(/[,\n;、，]/)
    .map((k) => normalizeForMatch(k.trim()))
    .filter((k) => k.length > 0)
}

// Trả về từ khoá đầu tiên xuất hiện trong text (đã chuẩn hoá), hoặc null
export function findKeyword(text: string, keywords: string[]): string | null {
  if (keywords.length === 0 || !text) return null
  const hay = normalizeForMatch(text)
  return keywords.find((k) => hay.includes(k)) ?? null
}
