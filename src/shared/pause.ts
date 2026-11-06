import type { SubtitleSegment } from './types'

// Mốc tạm dừng là 1 segment không có lời, nằm xen trong transcript (xem SubtitleStore.addPauseMarker)
export function isPauseMarker(
  seg: SubtitleSegment
): seg is SubtitleSegment & { pauseEndedAt: number } {
  return typeof seg.pauseEndedAt === 'number'
}

// "45 giây" / "15 phút" / "15 phút 2 giây" / "1 giờ 5 phút"
export function formatPauseDuration(ms: number): string {
  const total = Math.max(0, Math.round(ms / 1000))
  const h = Math.floor(total / 3600)
  const m = Math.floor((total % 3600) / 60)
  const s = total % 60
  if (h > 0) return m > 0 ? `${h} giờ ${m} phút` : `${h} giờ`
  if (m > 0) return s > 0 ? `${m} phút ${s} giây` : `${m} phút`
  return `${s} giây`
}

// giờ:phút theo giờ máy, vd. "14:05"
export function wallClock(ms: number): string {
  const d = new Date(ms)
  return `${String(d.getHours()).padStart(2, '0')}:${String(d.getMinutes()).padStart(2, '0')}`
}

// "Tạm dừng 14:30 → 14:45 (15 phút)"
export function pauseLabel(seg: SubtitleSegment & { pauseEndedAt: number }): string {
  const duration = formatPauseDuration(seg.pauseEndedAt - seg.startedAt)
  return `Tạm dừng ${wallClock(seg.startedAt)} → ${wallClock(seg.pauseEndedAt)} (${duration})`
}

// segment có lời (bỏ mốc tạm dừng và segment rỗng) — dùng để đếm "câu"
export function countSpokenSegments(segments: SubtitleSegment[]): number {
  return segments.filter(
    (s) => !isPauseMarker(s) && (s.source.text.trim() !== '' || s.target.text.trim() !== '')
  ).length
}
