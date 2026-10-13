import { findKeyword, parseKeywords } from '../shared/keywords'
import type { SubtitleUpdate } from '../shared/types'

// Theo dõi phụ đề chiều về, báo 1 lần cho mỗi segment khi xuất hiện từ khoá (tên mình…)
export class KeywordNotifier {
  private notified = new Set<string>()
  private cacheRaw = ''
  private cache: string[] = []

  constructor(
    private getRaw: () => string,
    private notify: (keyword: string, text: string) => void
  ) {}

  private keywords(): string[] {
    const raw = this.getRaw()
    if (raw !== this.cacheRaw) {
      this.cacheRaw = raw
      this.cache = parseKeywords(raw)
    }
    return this.cache
  }

  onUpdate(update: SubtitleUpdate): void {
    if (update.type === 'clear') {
      this.notified.clear()
      return
    }
    if (update.type !== 'segment') return
    const seg = update.segment
    if (this.notified.has(seg.id)) return
    const keywords = this.keywords()
    const hit = findKeyword(seg.source.text, keywords) ?? findKeyword(seg.target.text, keywords)
    if (!hit) return
    this.notified.add(seg.id)
    this.notify(hit, seg.target.text.trim() || seg.source.text.trim())
  }
}
