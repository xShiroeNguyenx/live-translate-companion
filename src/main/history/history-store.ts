import { EventEmitter } from 'node:events'
import { existsSync, mkdirSync, readdirSync, readFileSync, renameSync, rmSync, writeFileSync } from 'node:fs'
import { join } from 'node:path'
import { normalizeForMatch } from '../../shared/keywords'
import type { HistoryEntry, HistoryRecord } from '../../shared/types'

const ID_RE = /^[\w-]+$/

function toEntry(r: HistoryRecord): HistoryEntry {
  const { segments, summary, ...rest } = r
  const first = segments.find((s) => s.target.text.trim() || s.source.text.trim())
  return {
    ...rest,
    preview: (first?.target.text.trim() || first?.source.text.trim() || '').slice(0, 140),
    segmentCount: segments.length,
    hasSummary: !!summary
  }
}

function matches(r: HistoryRecord, needle: string): boolean {
  if (normalizeForMatch(r.summary ?? '').includes(needle)) return true
  return r.segments.some(
    (s) =>
      normalizeForMatch(s.source.text).includes(needle) ||
      normalizeForMatch(s.target.text).includes(needle)
  )
}

// Mỗi phiên = 1 file JSON trong userData/history. Ghi tmp → rename để không hỏng khi crash.
// Phát 'change' sau mỗi lần ghi/xoá để UI tải lại danh sách.
export class HistoryStore extends EventEmitter {
  constructor(private dir: string) {
    super()
  }

  private file(id: string): string {
    if (!ID_RE.test(id)) throw new Error(`id lịch sử không hợp lệ: ${id}`)
    return join(this.dir, `${id}.json`)
  }

  get(id: string): HistoryRecord | null {
    try {
      return JSON.parse(readFileSync(this.file(id), 'utf-8')) as HistoryRecord
    } catch {
      return null
    }
  }

  // ghi đè các trường mới, giữ nguyên trường cũ (vd. summary khi autosave ghi lại segments)
  upsert(record: Partial<HistoryRecord> & { id: string }): HistoryRecord | null {
    const prev = this.get(record.id)
    if (!prev && !record.segments) return null
    const next = { ...prev, ...record } as HistoryRecord
    try {
      mkdirSync(this.dir, { recursive: true })
      const file = this.file(record.id)
      writeFileSync(`${file}.tmp`, JSON.stringify(next), 'utf-8')
      renameSync(`${file}.tmp`, file)
    } catch (err) {
      console.error('Không ghi được lịch sử:', err)
      return null
    }
    this.emit('change')
    return next
  }

  all(): HistoryRecord[] {
    if (!existsSync(this.dir)) return []
    const records: HistoryRecord[] = []
    for (const name of readdirSync(this.dir)) {
      if (!name.endsWith('.json')) continue
      const r = this.get(name.slice(0, -5))
      if (r) records.push(r)
    }
    return records.sort((a, b) => b.startedAt - a.startedAt)
  }

  list(query = ''): HistoryEntry[] {
    const needle = normalizeForMatch(query.trim())
    const records = this.all()
    return (needle ? records.filter((r) => matches(r, needle)) : records).map(toEntry)
  }

  // xoá cả bản ghi lẫn file transcript/tóm tắt đã xuất
  delete(id: string): boolean {
    const r = this.get(id)
    if (!r) return false
    for (const f of [r.transcriptFile, r.summaryFile]) {
      if (f) rmSync(f, { force: true })
    }
    rmSync(this.file(id), { force: true })
    this.emit('change')
    return true
  }
}
