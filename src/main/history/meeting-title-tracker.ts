import { EventEmitter } from 'node:events'
import { normalizeTitle } from '../../shared/meeting-title'
import type { HistoryStore } from './history-store'

// Tên của cuộc họp hiện tại (gắn với phiên chiều về đang chạy, hoặc vừa dừng tới lần Bắt đầu sau).
// Bản ghi lịch sử chỉ được tạo ở lần autosave đầu tiên, nên tên đặt sớm hơn sẽ được gắn vào lúc đó.
// Phát 'change' (tên mới) để UI đồng bộ.
export class MeetingTitleTracker extends EventEmitter {
  private title = ''
  // bản ghi đã nhận tên hiện tại → autosave ghi lại bản ghi không cần ghi tên lần nữa
  private applied = new Set<string>()

  constructor(private history: HistoryStore) {
    super()
  }

  get(): string {
    return this.title
  }

  // đặt (hoặc xoá, nếu rỗng) tên cho cuộc họp hiện tại; ghi ngay vào các bản ghi đã có
  set(raw: unknown, sessionIds: (string | null | undefined)[]): string {
    this.title = normalizeTitle(raw)
    this.applied.clear()
    for (const id of sessionIds) if (id) this.apply(id)
    this.emit('change', this.title)
    return this.title
  }

  // gọi sau mỗi lần autosave ghi bản ghi lịch sử của cuộc họp hiện tại
  onRecordWritten(id: string): void {
    if (this.title && !this.applied.has(id)) this.apply(id)
  }

  // bắt đầu phiên chiều về mới → cuộc họp mới, chưa có tên
  reset(): void {
    if (!this.title && this.applied.size === 0) return
    this.title = ''
    this.applied.clear()
    this.emit('change', '')
  }

  private apply(id: string): void {
    // chưa có bản ghi (chưa autosave lần nào) → chờ onRecordWritten
    if (!this.history.get(id)) return
    // title rỗng → undefined → JSON bỏ trường, tức là xoá tên
    this.history.upsert({ id, title: this.title || undefined })
    this.applied.add(id)
  }
}
