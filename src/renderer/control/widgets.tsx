import type { SubtitleSegment } from '../../shared/types'
import { findKeyword } from '../../shared/keywords'
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
  keywords = []
}: {
  segments: SubtitleSegment[]
  placeholder: string
  className?: string
  // đã chuẩn hoá bằng parseKeywords — segment chứa từ khoá được tô sáng
  keywords?: string[]
}): React.JSX.Element {
  const list = useStickToBottom(segments)
  return (
    <div className={`subtitle-list ${className}`} ref={list.ref} onScroll={list.onScroll}>
      {segments.length === 0 && <p className="placeholder">{placeholder}</p>}
      {segments.map((seg) => (
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
        </div>
      ))}
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
