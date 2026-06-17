import { useEffect, useRef, useState } from 'react'
import type { AppSettings, SubtitleSegment, SubtitleUpdate } from '../../shared/types'

const HISTORY_LIMIT = 50
const LOCKED_VISIBLE = 3

export function App(): React.JSX.Element {
  const api = window.overlayApi
  const [settings, setSettings] = useState<AppSettings | null>(null)
  const [segments, setSegments] = useState<SubtitleSegment[]>([])
  const stackRef = useRef<HTMLDivElement>(null)

  useEffect(() => {
    if (!api) return
    void api.getSettings().then(setSettings)
    const offSettings = api.onSettingsChanged(setSettings)
    const offSubtitles = api.onSubtitleUpdate((update: SubtitleUpdate) => {
      if (update.type === 'clear') {
        setSegments([])
        return
      }
      if (update.type === 'history') {
        setSegments(update.segments.slice(-HISTORY_LIMIT))
        return
      }
      setSegments((prev) => {
        const next = [...prev]
        const idx = next.findIndex((s) => s.id === update.segment.id)
        if (idx >= 0) next[idx] = update.segment
        else next.push(update.segment)
        return next.slice(-HISTORY_LIMIT)
      })
    })
    return () => {
      offSettings()
      offSubtitles()
    }
  }, [api])

  useEffect(() => {
    const el = stackRef.current
    if (el) el.scrollTop = el.scrollHeight
  }, [segments, settings?.overlayClickThrough])

  if (!api || !settings) return <div />

  const fontSize = settings.overlayFontSize
  const background = `rgba(10, 12, 16, ${settings.overlayOpacity})`
  // khoá click: chỉ hiện vài câu cuối neo đáy; mở khoá: cuộn lại được toàn bộ lịch sử
  const visible = settings.overlayClickThrough ? segments.slice(-LOCKED_VISIBLE) : segments

  return (
    <div className={`overlay ${settings.overlayClickThrough ? 'locked' : 'interactive'}`}>
      {!settings.overlayClickThrough && (
        <div className="grip" title="Kéo để di chuyển — Ctrl+Shift+O để khoá click">
          ⠿ Phụ đề — kéo để di chuyển · cuộn để xem lại
        </div>
      )}
      <div className="stack" ref={stackRef}>
        {visible.map((seg) => (
          <div key={seg.id} className="line" style={{ background }}>
            {seg.source.text && (
              <p className="src" style={{ fontSize: Math.max(11, Math.round(fontSize * 0.62)) }}>
                {seg.source.text}
              </p>
            )}
            {seg.target.text && (
              <p className={`tgt ${seg.target.final ? '' : 'partial'}`} style={{ fontSize }}>
                {seg.target.text}
              </p>
            )}
          </div>
        ))}
      </div>
    </div>
  )
}
