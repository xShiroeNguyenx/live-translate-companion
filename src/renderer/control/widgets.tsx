import type { SubtitleSegment } from '../../shared/types'
import { findKeyword } from '../../shared/keywords'
import { isPauseMarker, pauseLabel } from '../../shared/pause'
import { AWAITING_TRANSLATION_LABEL, isAwaitingTranslation } from '../../shared/segments'
import { dbToMeterPercent, useStickToBottom } from './ui-helpers'

// Thanh đo mức âm thanh + vạch ngưỡng VAD
export function LevelMeter({
  rmsDb,
  thresholdDb
}: {
  rmsDb: number
  thresholdDb: number
}): React.JSX.Element {
  return (
    <div className="meter-wrap" title={`Ngưỡng VAD: ${thresholdDb} dB`}>
      <div className="meter-bar" style={{ width: `${dbToMeterPercent(rmsDb)}%` }} />
      <div className="meter-threshold" style={{ left: `${dbToMeterPercent(thresholdDb)}%` }} />
    </div>
  )
}

// Slider ngưỡng VAD kèm thanh đo trực tiếp để chỉnh cho dễ
export function VadSlider({
  label,
  rmsDb,
  value,
  onChange
}: {
  label: string
  rmsDb: number
  value: number
  onChange: (db: number) => void
}): React.JSX.Element {
  return (
    <label className="slider-label">
      <span>
        {label}: {value} dB
      </span>
      <LevelMeter rmsDb={rmsDb} thresholdDb={value} />
      <input
        type="range"
        min={-80}
        max={-20}
        value={value}
        onChange={(e) => onChange(Number(e.target.value))}
      />
    </label>
  )
}

export function SegmentList({
  segments,
  placeholder,
  className = '',
  keywords = [],
  onReplay,
  replayDisabled = false,
  onDelete
}: {
  segments: SubtitleSegment[]
  placeholder: string
  className?: string
  // đã chuẩn hoá bằng parseKeywords — segment chứa từ khoá được tô sáng
  keywords?: string[]
  // có = mỗi câu đã chốt có nút phát lại (chiều đi: đọc lại bản dịch vào meeting)
  onReplay?: (segment: SubtitleSegment) => void
  replayDisabled?: boolean
  // có = mỗi câu đã chốt có nút xoá khỏi transcript
  onDelete?: (segment: SubtitleSegment) => void
}): React.JSX.Element {
  const list = useStickToBottom(segments)
  return (
    <div className={`subtitle-list ${className}`} ref={list.ref} onScroll={list.onScroll}>
      {segments.length === 0 && <p className="placeholder">{placeholder}</p>}
      {segments.map((seg) =>
        isPauseMarker(seg) ? (
          <div key={seg.id} className="segment pause-marker">
            ⏸ {pauseLabel(seg)}
          </div>
        ) : (
        <div
          key={seg.id}
          className={`segment ${seg.target.final ? 'final' : 'partial'} ${
            findKeyword(seg.source.text, keywords) || findKeyword(seg.target.text, keywords)
              ? 'hit'
              : ''
          }`}
        >
          {seg.source.text && <p className="src">{seg.source.text}</p>}
          {seg.target.text && <p className="tgt">{seg.target.text}</p>}
          {(onReplay || onDelete) && seg.target.final && (
            <div className="seg-actions">
              {onReplay && seg.target.text.trim() && (
                <button
                  className="link-btn"
                  disabled={replayDisabled}
                  onClick={() => onReplay(seg)}
                  title="Phát lại câu này vào meeting. Câu vừa phát trong lần mở app này thì không tốn thêm tiền."
                >
                  🔁 Phát lại
                </button>
              )}
              {onDelete && (
                <button
                  className="link-btn seg-delete"
                  onClick={() => onDelete(seg)}
                  title="Xoá câu này khỏi transcript chiều đi (cả file tự lưu và lịch sử)"
                >
                  ✕ Xoá
                </button>
              )}
            </div>
          )}
          {isAwaitingTranslation(seg) && <p className="tgt pending">{AWAITING_TRANSLATION_LABEL}</p>}
        </div>
        )
      )}
    </div>
  )
}

// Cảnh báo ngắn gọn, có nút nhảy sang tab Cài đặt
export function Warn({
  children,
  onFix
}: {
  children: React.ReactNode
  onFix?: () => void
}): React.JSX.Element {
  return (
    <div className="alert warn compact">
      <span>⚠ {children}</span>
      {onFix && (
        <button className="link-btn" onClick={onFix}>
          Sửa →
        </button>
      )}
    </div>
  )
}
