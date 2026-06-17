import { useState } from 'react'
import type { OutgoingMode } from '../../shared/types'
import { useControlStore } from './store'
import {
  dbToMeterPercent,
  formatDuration,
  isVirtualCable,
  STATE_COLORS,
  STATE_LABELS,
  useStickToBottom
} from './ui-helpers'

const TARGET_OPTIONS: Array<{ code: string; label: string }> = [
  { code: 'ja', label: 'Tiếng Nhật' },
  { code: 'en', label: 'Tiếng Anh' },
  { code: 'ko', label: 'Tiếng Hàn' },
  { code: 'zh', label: 'Tiếng Trung' }
]

export function OutgoingPanel(): React.JSX.Element {
  const api = window.controlApi
  const {
    settings,
    inputDevices,
    outputDevices,
    outgoing,
    outgoingMetrics,
    outgoingSegments,
    outgoingSinkState,
    patchSettings
  } = useControlStore()
  const [busy, setBusy] = useState(false)
  const [error, setError] = useState<string | null>(null)
  const transcript = useStickToBottom(outgoingSegments)

  if (!api || !settings) return <></>

  const running = !['idle', 'error'].includes(outgoing.state)
  const isPtt = settings.outgoingMode === 'ptt'
  const talking = outgoing.state === 'streaming'
  const sinkLabel = outgoingSinkState?.label || settings.outgoingDeviceLabel
  // chiều đi nguy hiểm nếu KHÔNG phải mic ảo → giọng dịch phát ra loa thật cho cả phòng nghe
  const notVirtual = running && sinkLabel !== '' && !isVirtualCable(sinkLabel)
  const sinkError = running && outgoingSinkState && !outgoingSinkState.ok ? outgoingSinkState.error : null
  const hasCable = outputDevices.some((d) => isVirtualCable(d.label))

  const toggle = async (): Promise<void> => {
    setBusy(true)
    setError(null)
    try {
      if (running) await api.stopOutgoing()
      else {
        const result = await api.startOutgoing()
        if (!result.ok) setError(result.error ?? 'Không khởi động được chiều đi.')
      }
    } finally {
      setBusy(false)
    }
  }

  const press = (active: boolean): void => {
    if (running && isPtt) void api.setPushToTalk(active)
  }

  const meterPercent = dbToMeterPercent(outgoingMetrics.rmsDb)
  const thresholdPercent = dbToMeterPercent(settings.outgoingVadThresholdDb)

  return (
    <section className="card">
      <div className="header">
        <span className="led" style={{ background: STATE_COLORS[outgoing.state] }} />
        <h2 style={{ flex: 1 }}>Nói vào meeting (chiều đi)</h2>
        <span className="state-label">{STATE_LABELS[outgoing.state]}</span>
        {outgoing.usingFallbackClient && <span className="badge">raw-ws</span>}
      </div>

      {error && <div className="alert error">{error}</div>}
      {sinkError && (
        <div className="alert warn">
          ⚠ Không route được giọng dịch tới thiết bị đã chọn ({sinkError}). Hãy chọn lại “Phát vào”.
        </div>
      )}
      {notVirtual && (
        <div className="alert warn">
          ⚠ Giọng dịch đang phát ra “{sinkLabel}” — KHÔNG phải mic ảo, cả phòng sẽ nghe thấy. Hãy
          chọn “CABLE Input” ở mục “Phát vào”.
        </div>
      )}

      <div className="row">
        <button
          className={running ? 'btn-stop' : 'btn-start'}
          onClick={() => void toggle()}
          disabled={busy}
        >
          {running ? '■ Tắt chiều đi' : '▶ Bật chiều đi'}
        </button>
        <div className="metrics">
          <span>⏱ {formatDuration(outgoingMetrics.sessionSeconds)}</span>
          <span>📤 {outgoingMetrics.secondsSent.toFixed(0)}s</span>
          <span>≈ ${outgoingMetrics.estimatedCostUsd.toFixed(3)}</span>
          {outgoingMetrics.reconnects > 0 && <span>🔁 {outgoingMetrics.reconnects}</span>}
        </div>
      </div>

      <div className="row">
        <span className="field-label">🎙 Micro</span>
        <select
          value={settings.micDeviceId}
          disabled={running}
          onChange={(e) => {
            const id = e.target.value
            const label = inputDevices.find((d) => d.deviceId === id)?.label ?? ''
            void patchSettings({ micDeviceId: id, micDeviceLabel: label })
          }}
        >
          <option value="">(Micro mặc định)</option>
          {inputDevices.map((d) => (
            <option key={d.deviceId} value={d.deviceId}>
              {d.label}
            </option>
          ))}
        </select>
      </div>

      <div className="row">
        <span className="field-label">📤 Phát vào</span>
        <select
          value={settings.outgoingDeviceId}
          onChange={(e) => {
            const id = e.target.value
            const label = outputDevices.find((d) => d.deviceId === id)?.label ?? ''
            void patchSettings({ outgoingDeviceId: id, outgoingDeviceLabel: label })
          }}
        >
          <option value="">(Chọn thiết bị — nên là CABLE Input)</option>
          {outputDevices
            .filter((d) => d.deviceId !== '')
            .map((d) => (
              <option key={d.deviceId} value={d.deviceId}>
                {isVirtualCable(d.label) ? `${d.label} ✓ mic ảo` : d.label}
              </option>
            ))}
        </select>
      </div>

      <div className="row wrap">
        <label className="field-label" style={{ width: 'auto' }}>
          🌐 Dịch sang
        </label>
        <select
          value={settings.outgoingTargetLanguage}
          disabled={running}
          onChange={(e) => void patchSettings({ outgoingTargetLanguage: e.target.value })}
        >
          {TARGET_OPTIONS.map((o) => (
            <option key={o.code} value={o.code}>
              {o.label}
            </option>
          ))}
        </select>
        <label className="field-label" style={{ width: 'auto' }}>
          Chế độ
        </label>
        <select
          value={settings.outgoingMode}
          onChange={(e) => void patchSettings({ outgoingMode: e.target.value as OutgoingMode })}
        >
          <option value="ptt">Giữ để nói (PTT)</option>
          <option value="vad">Tự động (VAD)</option>
        </select>
      </div>

      {isPtt ? (
        <div className="row">
          <button
            className={`ptt-btn ${talking ? 'talking' : ''}`}
            disabled={!running}
            onPointerDown={() => press(true)}
            onPointerUp={() => press(false)}
            onPointerLeave={() => press(false)}
          >
            {talking ? '🔴 Đang nói… (thả ra để gửi)' : '🎤 Giữ để nói'}
          </button>
          <span className="hint" style={{ flex: 1 }}>
            Hoặc nhấn Ctrl+Space (bật/tắt) khi đang ở cửa sổ meeting.
          </span>
        </div>
      ) : (
        <div className="row">
          <label className="slider-label">
            Ngưỡng VAD micro: {settings.outgoingVadThresholdDb} dB
            <div className="meter-wrap">
              <div className="meter-bar" style={{ width: `${meterPercent}%` }} />
              <div className="meter-threshold" style={{ left: `${thresholdPercent}%` }} />
            </div>
            <input
              type="range"
              min={-80}
              max={-20}
              value={settings.outgoingVadThresholdDb}
              onChange={(e) =>
                void patchSettings({ outgoingVadThresholdDb: Number(e.target.value) })
              }
            />
          </label>
        </div>
      )}

      {!hasCable && (
        <p className="hint">
          Chưa thấy “CABLE Input”. Cài VB-Audio Virtual Cable (vb-audio.com/Cable, miễn phí, cần
          restart), rồi trong Meet/Zoom chọn Micro = “CABLE Output (VB-Audio Virtual Cable)”.
        </p>
      )}

      <div className="subtitle-list outgoing" ref={transcript.ref} onScroll={transcript.onScroll}>
        {outgoingSegments.length === 0 && <p className="placeholder">Chưa nói gì…</p>}
        {outgoingSegments.map((seg) => (
          <div key={seg.id} className={`segment ${seg.target.final ? 'final' : 'partial'}`}>
            {seg.source.text && <p className="src">{seg.source.text}</p>}
            {seg.target.text && <p className="tgt">{seg.target.text}</p>}
          </div>
        ))}
      </div>
    </section>
  )
}
