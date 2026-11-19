// "Gõ để nói" dạng danh sách soạn sẵn: mỗi lần gõ + Enter thành 1 câu (câu gốc + bản dịch + giọng
// tạo sẵn), người dùng bấm Phát câu nào thì câu đó vào meeting. Hàm thuần, không đụng IPC.

export type TypedItemStatus = 'translating' | 'translated' | 'error'

export interface TypedItem {
  id: number
  // câu người dùng gõ (không sửa được nữa; muốn khác thì gõ câu mới)
  source: string
  // bản dịch, sửa tay được — đây là câu sẽ được đọc
  translation: string
  status: TypedItemStatus
  error?: string
  // khoá "giọng + câu" đã tạo sẵn giọng ở main / đang tạo; khác khoá hiện tại = chưa sẵn
  readyKey: string | null
  preparingKey: string | null
  // số lần đã phát vào meeting
  played: number
}

export function voiceKey(voice: string, text: string): string {
  return `${voice}\n${text.trim()}`
}

export function newTypedItem(id: number, source: string): TypedItem {
  return {
    id,
    source: source.trim(),
    translation: '',
    status: 'translating',
    readyKey: null,
    preparingKey: null,
    played: 0
  }
}

// danh sách đầy → không thêm, để không lặng lẽ đẩy mất câu người dùng đã soạn
export function canAddTypedItem(items: TypedItem[], max: number): boolean {
  return items.length < max
}

export function patchTypedItem(
  items: TypedItem[],
  id: number,
  patch: Partial<Omit<TypedItem, 'id'>>
): TypedItem[] {
  return items.map((i) => (i.id === id ? { ...i, ...patch } : i))
}

export function removeTypedItem(items: TypedItem[], id: number): TypedItem[] {
  return items.filter((i) => i.id !== id)
}

export function isVoiceReady(item: TypedItem, voice: string): boolean {
  return item.translation.trim() !== '' && item.readyKey === voiceKey(voice, item.translation)
}

export function isPreparing(item: TypedItem, voice: string): boolean {
  return item.translation.trim() !== '' && item.preparingKey === voiceKey(voice, item.translation)
}

export function canPlay(item: TypedItem): boolean {
  return item.status === 'translated' && item.translation.trim() !== ''
}

// câu kế tiếp nên phát: câu đầu tiên (theo thứ tự soạn) chưa phát lần nào và đã dịch xong
export function nextToPlay(items: TypedItem[]): TypedItem | null {
  return items.find((i) => i.played === 0 && canPlay(i)) ?? null
}
