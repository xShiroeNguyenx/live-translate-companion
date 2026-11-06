import {
  SEGMENT_GAP_MS,
  SEGMENT_MAX_CHARS,
  SEGMENT_MIN_SPLIT_CHARS
} from '../../shared/constants'
import { isPauseMarker, pauseLabel } from '../../shared/pause'
import type { ExportFormat, SubtitleSegment, SubtitleUpdate } from '../../shared/types'

// Kết câu (Latin + CJK), cho phép đóng ngoặc/nháy theo sau
const SENTENCE_END = /[.!?。！？…]["”'』」)\]]?$/

export interface SubtitleStoreOptions {
  gapMs?: number
  minSplitChars?: number
  maxChars?: number
}

function clone(seg: SubtitleSegment): SubtitleSegment {
  const copy: SubtitleSegment = {
    id: seg.id,
    startedAt: seg.startedAt,
    source: { ...seg.source },
    target: { ...seg.target }
  }
  if (seg.pauseEndedAt !== undefined) copy.pauseEndedAt = seg.pauseEndedAt
  return copy
}

function formatClock(ms: number): string {
  const totalSec = Math.max(0, Math.floor(ms / 1000))
  const h = Math.floor(totalSec / 3600)
  const m = Math.floor((totalSec % 3600) / 60)
  const s = totalSec % 60
  const pad = (n: number): string => String(n).padStart(2, '0')
  return `${pad(h)}:${pad(m)}:${pad(s)}`
}

function formatSrtTime(ms: number): string {
  const clock = formatClock(ms)
  const millis = String(Math.max(0, Math.floor(ms % 1000))).padStart(3, '0')
  return `${clock},${millis}`
}

export class SubtitleStore {
  private segments: SubtitleSegment[] = []
  private openSegment: SubtitleSegment | null = null
  private lastFragmentAt = 0
  private counter = 0
  private readonly gapMs: number
  private readonly minSplitChars: number
  private readonly maxChars: number

  constructor(
    private emit: (u: SubtitleUpdate) => void = () => {},
    private now: () => number = Date.now,
    opts: SubtitleStoreOptions = {}
  ) {
    this.gapMs = opts.gapMs ?? SEGMENT_GAP_MS
    this.minSplitChars = opts.minSplitChars ?? SEGMENT_MIN_SPLIT_CHARS
    this.maxChars = opts.maxChars ?? SEGMENT_MAX_CHARS
  }

  appendSource(text: string): void {
    this.append('source', text)
  }

  appendTarget(text: string): void {
    this.append('target', text)
  }

  private append(side: 'source' | 'target', text: string): void {
    if (!text) return
    const t = this.now()
    if (this.openSegment && this.lastFragmentAt && t - this.lastFragmentAt > this.gapMs) {
      this.finalizeOpenSegment()
    }
    if (!this.openSegment) {
      this.openSegment = {
        id: `seg-${++this.counter}`,
        startedAt: t,
        source: { text: '', final: false },
        target: { text: '', final: false }
      }
    }
    this.openSegment[side].text += text
    this.lastFragmentAt = t
    this.emit({ type: 'segment', segment: clone(this.openSegment) })
    this.maybeAutoSplit()
  }

  // Tự chốt segment để phụ đề không thành "tường chữ" khi người nói liên tục:
  // ngắt theo BẢN DỊCH (dòng người dùng đọc) vì transcript dịch luôn về sau transcript gốc
  private maybeAutoSplit(): void {
    const seg = this.openSegment
    if (!seg) return
    const target = seg.target.text.trimEnd()
    const endsSentence = SENTENCE_END.test(target)
    if (
      (endsSentence && target.length >= this.minSplitChars) ||
      target.length >= this.maxChars ||
      seg.source.text.length >= this.maxChars * 2
    ) {
      this.finalizeOpenSegment()
    }
  }

  finalizeOpenSegment(): void {
    if (!this.openSegment) return
    const seg = this.openSegment
    this.openSegment = null
    if (!seg.source.text.trim() && !seg.target.text.trim()) return
    seg.source.final = true
    seg.target.final = true
    this.segments.push(seg)
    this.emit({ type: 'segment', segment: clone(seg) })
  }

  // Ghi mốc tạm dừng LÚC TIẾP TỤC (không phải lúc bấm tạm dừng): câu dịch dở về muộn trong
  // lúc tạm dừng vẫn nằm trước mốc, và bấm Dừng khi đang tạm dừng thì không để lại mốc thừa.
  addPauseMarker(pausedAt: number, resumedAt: number): void {
    this.finalizeOpenSegment()
    this.lastFragmentAt = 0
    const marker: SubtitleSegment = {
      id: `pause-${++this.counter}`,
      startedAt: pausedAt,
      source: { text: '', final: true },
      target: { text: '', final: true },
      pauseEndedAt: Math.max(pausedAt, resumedAt)
    }
    this.segments.push(marker)
    this.emit({ type: 'segment', segment: clone(marker) })
  }

  history(): SubtitleSegment[] {
    const all = this.segments.map(clone)
    if (this.openSegment) all.push(clone(this.openSegment))
    return all
  }

  clear(): void {
    this.segments = []
    this.openSegment = null
    this.lastFragmentAt = 0
    this.emit({ type: 'clear' })
  }

  isEmpty(): boolean {
    return this.segments.length === 0 && this.openSegment === null
  }

  export(format: ExportFormat): string {
    const all = this.history().filter(
      (s) => isPauseMarker(s) || s.source.text.trim() || s.target.text.trim()
    )
    // chỉ có mốc tạm dừng mà không có lời nào → coi như rỗng
    if (!all.some((s) => !isPauseMarker(s))) return ''
    const t0 = all[0].startedAt

    if (format === 'srt') {
      return all
        .map((seg, i) => {
          const start = seg.startedAt - t0
          const next = i + 1 < all.length ? all[i + 1].startedAt - t0 : start + 4000
          const end = isPauseMarker(seg) ? seg.pauseEndedAt - t0 : next
          const lines = isPauseMarker(seg)
            ? [`⏸ ${pauseLabel(seg)}`]
            : [seg.source.text.trim(), seg.target.text.trim()].filter(Boolean)
          return `${i + 1}\n${formatSrtTime(start)} --> ${formatSrtTime(Math.max(start + 500, end))}\n${lines.join('\n')}`
        })
        .join('\n\n')
    }

    if (format === 'md') {
      const rows = all
        .map((seg) => {
          const time = formatClock(seg.startedAt - t0)
          if (isPauseMarker(seg)) return `**[${time}]** ⏸ *${pauseLabel(seg)}*`
          return `**[${time}]** ${seg.source.text.trim()}\n\n> ${seg.target.text.trim()}`
        })
        .join('\n\n')
      return `# Transcript song ngữ\n\n${rows}\n`
    }

    return all
      .map((seg) => {
        const time = formatClock(seg.startedAt - t0)
        if (isPauseMarker(seg)) return `[${time}] ⏸ ${pauseLabel(seg)}`
        return `[${time}] ${seg.source.text.trim()}\n         → ${seg.target.text.trim()}`
      })
      .join('\n\n')
  }
}
