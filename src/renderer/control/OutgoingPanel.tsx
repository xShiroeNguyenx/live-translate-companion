import { useState } from 'react'
import type { OutgoingMode } from '../../shared/types'
import { useControlStore } from './store'
import { formatDuration, isVirtualCable, STATE_COLORS, STATE_LABELS } from './ui-helpers'
import { LevelMeter, SegmentList, VadSlider, Warn } from './widgets'

const TARGET_OPTIONS: Array<{ code: string; label: string }> = [
  { code: 'ja', label: 'Tiếng Nhật' },
  { code: 'en', label: 'Tiếng Anh' },
  { code: 'ko', label: 'Tiếng Hàn' },
  { code: 'zh', label: 'Tiếng Trung' }
]

// Tab "Dịch": bật/tắt chiều đi, PTT, transcript
export function OutgoingPanel({ onOpenSettings }: { onOpenSettings: () => void }): React.JSX.Element {
  const api = window.controlApi
  const { settings, outgoing, outgoingMetrics, outgoingSegments, outgoingSinkState } =
    useControlStore()
  const [busy, setBusy] = useState(false)
  const [error, setError] = useState<string | null>(null)

  if (!api || !settings) return <></>

  const running = !['idle', 'error'].includes(outgoing.state)
  const isPtt = settings.outgoingMode === 'ptt'
  const talking = outgoing.state === 'streaming'
  const sinkLabel = outgoingSinkState?.label || settings.outgoingDeviceLabel
  // chiều đi nguy hiểm nếu KHÔNG phải mic ảo → giọng dịch phát ra loa thật cho cả phòng nghe
  const notVirtual = running && sinkLabel !== '' && !isVirtualCable(sinkLabel)
  const sinkError = running && outgoingSinkState && !outgoingSinkState.ok ? outgoingSinkState.error : null
  const targetLabel =
    TARGET_OPTIONS.find((o) => o.code === settings.outgoingTargetLanguage)?.label ??
    settings.outgoingTargetLanguage

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

  return (
    <section className="card">
      <div className="card-head">
        <span className="led" style={{ background: STATE_COLORS[outgoing.state] }} />
        <h2>Chiều đi · Việt → {targetLabel}</h2>
        <span className="state-label">{STATE_LABELS[outgoing.state]}</span>
        {outgoing.usingFallbackClient && <span className="badge">raw-ws</span>}
      </div>

      {error && <div className="alert error">{error}</div>}
      {sinkError && (
        <Warn onFix={onOpenSettings}>Không route được tới thiết bị “Phát vào” ({sinkError}).</Warn>
      )}
      {notVirtual && (
        <Warn onFix={onOpenSettings}>
          Đang phát ra “{sinkLabel}” — không phải mic ảo, cả phòng sẽ nghe thấy.
        </Warn>
      )}

      <div className="row">
        <button
          className={running ? 'btn-stop' : 'btn-start'}
          onClick={() => void toggle()}
          disabled={busy}
        >
          {running ? '■ Tắt' : '▶ Bật chiều đi'}
        </button>
        <div className="metrics">
          <span>⏱ {formatDuration(outgoingMetrics.sessionSeconds)}</span>
          <span>📤 {outgoingMetrics.secondsSent.toFixed(0)}s</span>
          <span>≈ ${outgoingMetrics.estimatedCostUsd.toFixed(3)}</span>
          {outgoingMetrics.reconnects > 0 && <span>🔁 {outgoingMetrics.reconnects}</span>}
        </div>
      </div>

      {isPtt ? (
        <button
          className={`ptt-btn ${talking ? 'talking' : ''}`}
          disabled={!running}
          title="Hoặc nhấn Ctrl+Space (bật/tắt) khi đang ở cửa sổ meeting"
          onPointerDown={() => press(true)}
          onPointerUp={() => press(false)}
          onPointerLeave={() => press(false)}
        >
          {talking ? '🔴 Đang nói… (thả ra để gửi)' : '🎤 Giữ để nói · Ctrl+Space'}
        </button>
      ) : (
        <LevelMeter rmsDb={outgoingMetrics.rmsDb} thresholdDb={settings.outgoingVadThresholdDb} />
      )}

      <SegmentList segments={outgoingSegments} placeholder="Chưa nói gì…" className="outgoing" />
    </section>
  )
}

// Tab "Cài đặt": thiết bị, ngôn ngữ, chế độ của chiều đi
export function OutgoingSettings(): React.JSX.Element {
  const { settings, inputDevices, outputDevices, outgoing, outgoingMetrics, patchSettings } =
    useControlStore()
  if (!settings) return <></>

  const running = !['idle', 'error'].includes(outgoing.state)
  const hasCable = outputDevices.some((d) => isVirtualCable(d.label))

  return (
    <section className="card">
      <h2>Chiều đi (nói vào meeting)</h2>
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
      <div className="row">
        <span className="field-label">🌐 Dịch sang</span>
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
        <select
          value={settings.outgoingMode}
          onChange={(e) => void patchSettings({ outgoingMode: e.target.value as OutgoingMode })}
        >
          <option value="ptt">Giữ để nói (PTT)</option>
          <option value="vad">Tự động (VAD)</option>
        </select>
      </div>
      {settings.outgoingMode === 'vad' && (
        <VadSlider
          label="Ngưỡng VAD micro"
          rmsDb={outgoingMetrics.rmsDb}
          value={settings.outgoingVadThresholdDb}
          onChange={(db) => void patchSettings({ outgoingVadThresholdDb: db })}
        />
      )}
      {!hasCable && (
        <p className="hint">
          Chưa thấy “CABLE Input”. Cài VB-Audio Virtual Cable (vb-audio.com/Cable, miễn phí, cần
          restart), rồi trong Meet/Zoom chọn Micro = “CABLE Output (VB-Audio Virtual Cable)”.
        </p>
      )}
    </section>
  )
}
