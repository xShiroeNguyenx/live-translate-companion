import { useEffect, useState } from 'react'
import type { ExportFormat } from '../../shared/types'
import { OutgoingPanel } from './OutgoingPanel'
import { useControlStore } from './store'
import {
  dbToMeterPercent,
  formatDuration,
  isDefaultDevice,
  STATE_COLORS,
  STATE_LABELS,
  useStickToBottom
} from './ui-helpers'

export function App(): React.JSX.Element {
  const api = window.controlApi
  const {
    settings,
    session,
    metrics,
    segments,
    hasKey,
    outputDevices,
    sinkState,
    windowsOutputs,
    init,
    patchSettings,
    setHasKey,
    setWindowsDefault
  } = useControlStore()
  const [keyInput, setKeyInput] = useState('')
  const [busy, setBusy] = useState(false)
  const [changingDefault, setChangingDefault] = useState(false)
  const [notice, setNotice] = useState<string | null>(null)
  const subtitles = useStickToBottom(segments)

  useEffect(() => init(), [init])

  if (!api) return <div className="app">Lỗi: preload chưa nạp được.</div>
  if (!settings) return <div className="app">Đang tải…</div>

  const running = !['idle', 'error'].includes(session.state)
  // sinkState là sự thật từ engine (sink thực tế); chưa có thì đoán theo lựa chọn hiện tại
  const selectedDevice = outputDevices.find((d) => d.deviceId === settings.playbackDeviceId)
  const sinkCaptured = sinkState
    ? sinkState.isCaptured
    : (selectedDevice?.isCaptured ?? isDefaultDevice(settings.playbackDeviceId))
  const feedbackRisk = settings.playbackEnabled && sinkCaptured
  const sinkError = settings.playbackEnabled && sinkState && !sinkState.ok ? sinkState.error : null
  const hasVirtualCable = windowsOutputs.some((d) => /CABLE Input/i.test(d.name))

  const saveKey = async (): Promise<void> => {
    if (!keyInput.trim()) return
    const ok = await api.setApiKey(keyInput)
    if (ok) {
      setHasKey(true)
      setKeyInput('')
      setNotice('Đã lưu API key (mã hoá bằng safeStorage).')
    } else {
      setNotice('Không mã hoá được API key trên máy này.')
    }
  }

  const toggleSession = async (): Promise<void> => {
    setBusy(true)
    setNotice(null)
    try {
      if (running) {
        await api.stopSession()
      } else {
        const result = await api.startSession()
        if (!result.ok) setNotice(result.error ?? 'Không khởi động được phiên dịch.')
      }
    } finally {
      setBusy(false)
    }
  }

  const exportTranscript = async (format: ExportFormat): Promise<void> => {
    const path = await api.exportTranscript(format)
    setNotice(path ? `Đã xuất: ${path}` : 'Chưa có nội dung để xuất hoặc đã huỷ.')
  }

  const changeMeetingDevice = async (deviceId: string): Promise<void> => {
    setChangingDefault(true)
    try {
      const result = await setWindowsDefault(deviceId)
      if (!result.ok) {
        setNotice(`Không đổi được thiết bị mặc định Windows: ${result.error ?? 'lỗi không rõ'}`)
      }
    } finally {
      setChangingDefault(false)
    }
  }

  const recordDebugWav = async (): Promise<void> => {
    setBusy(true)
    setNotice('Đang thu 10 giây audio hệ thống… hãy phát thử âm thanh.')
    try {
      const path = await api.debugRecordWav(10)
      setNotice(path ? `Đã ghi file kiểm tra: ${path}` : 'Thu thử thất bại.')
    } catch (err) {
      setNotice(`Thu thử thất bại: ${err instanceof Error ? err.message : String(err)}`)
    } finally {
      setBusy(false)
    }
  }

  const meterPercent = dbToMeterPercent(metrics.rmsDb)
  const thresholdPercent = dbToMeterPercent(settings.vadThresholdDb)

  return (
    <div className="app">
      <header className="header">
        <span className="led" style={{ background: STATE_COLORS[session.state] }} />
        <h1>Live Translate Companion</h1>
        <span className="state-label">{STATE_LABELS[session.state]}</span>
        {session.usingFallbackClient && <span className="badge">raw-ws</span>}
      </header>

      {session.state === 'error' && session.error && (
        <div className="alert error">{session.error}</div>
      )}
      {notice && <div className="alert info">{notice}</div>}
      {sinkError && (
        <div className="alert warn">
          ⚠ Không route được giọng dịch tới thiết bị đã chọn ({sinkError}) — tạm phát ra thiết bị
          mặc định. Hãy chọn lại thiết bị trong danh sách.
        </div>
      )}
      {feedbackRisk && (
        <div className="alert warn">
          ⚠ Giọng dịch đang phát vào đúng thiết bị mà loopback thu — app sẽ tạm ngắt thu trong lúc
          phát để tránh vọng, nên có thể sót lời thoại. Tốt nhất hãy chọn thiết bị khác (ví dụ loa
          laptop) ở mục “Phát giọng dịch”.
        </div>
      )}

      <section className="card">
        <h2>Gemini API key</h2>
        <div className="row">
          <input
            type="password"
            placeholder={hasKey ? 'Đã lưu ✓ — nhập để thay key mới' : 'Dán API key từ Google AI Studio'}
            value={keyInput}
            onChange={(e) => setKeyInput(e.target.value)}
          />
          <button onClick={() => void saveKey()} disabled={!keyInput.trim()}>
            Lưu
          </button>
        </div>
      </section>

      <section className="card">
        <h2>Phiên dịch</h2>
        <div className="row">
          <button
            className={running ? 'btn-stop' : 'btn-start'}
            onClick={() => void toggleSession()}
            disabled={busy || (!hasKey && !running)}
          >
            {running ? '■ Dừng' : '▶ Bắt đầu dịch'}
          </button>
          <div className="metrics">
            <span>⏱ {formatDuration(metrics.sessionSeconds)}</span>
            <span>📤 {metrics.secondsSent.toFixed(0)}s đã gửi</span>
            <span>≈ ${metrics.estimatedCostUsd.toFixed(3)}</span>
            {metrics.reconnects > 0 && <span>🔁 {metrics.reconnects}</span>}
          </div>
        </div>
        <div className="row">
          <label className="slider-label">
            Ngưỡng VAD: {settings.vadThresholdDb} dB
            <div className="meter-wrap">
              <div className="meter-bar" style={{ width: `${meterPercent}%` }} />
              <div className="meter-threshold" style={{ left: `${thresholdPercent}%` }} />
            </div>
            <input
              type="range"
              min={-80}
              max={-20}
              value={settings.vadThresholdDb}
              onChange={(e) => void patchSettings({ vadThresholdDb: Number(e.target.value) })}
            />
          </label>
        </div>
      </section>

      <section className="card">
        <h2>Âm thanh</h2>
        <div className="row">
          <span className="field-label">🎧 Nghe meeting</span>
          <select
            value={windowsOutputs.find((d) => d.isDefault)?.id ?? ''}
            disabled={changingDefault || windowsOutputs.length === 0}
            onChange={(e) => void changeMeetingDevice(e.target.value)}
          >
            {windowsOutputs.length === 0 && <option value="">(Không đọc được danh sách)</option>}
            {windowsOutputs.map((d) => (
              <option key={d.id} value={d.id}>
                {d.name}
              </option>
            ))}
          </select>
        </div>
        <p className="hint">
          Đổi thiết bị mặc định của Windows — meeting phát ra đây và app thu &amp; dịch chính luồng
          này.
        </p>
        <div className="row">
          <span className="field-label">🔊 Giọng dịch</span>
          <select
            value={settings.playbackDeviceId}
            onChange={(e) => {
              const deviceId = e.target.value
              const label = outputDevices.find((d) => d.deviceId === deviceId)?.label ?? ''
              void patchSettings({ playbackDeviceId: deviceId, playbackDeviceLabel: label })
            }}
          >
            <option value="">(Thiết bị mặc định — không khuyến nghị)</option>
            {outputDevices
              .filter((d) => d.deviceId !== '')
              .map((d) => (
                <option key={d.deviceId} value={d.deviceId}>
                  {d.isCaptured ? `${d.label} — ⚠ bị thu ngược` : d.label}
                </option>
              ))}
          </select>
        </div>
        <div className="row">
          <label className="checkbox">
            <input
              type="checkbox"
              checked={settings.playbackEnabled}
              onChange={(e) => void patchSettings({ playbackEnabled: e.target.checked })}
            />
            Bật phát audio dịch (tiếng Việt)
          </label>
          <label className="checkbox">
            <input
              type="checkbox"
              checked={settings.monitorEnabled}
              onChange={(e) => void patchSettings({ monitorEnabled: e.target.checked })}
            />
            Nghe cả meeting qua thiết bị giọng dịch
          </label>
        </div>
        {settings.monitorEnabled && sinkCaptured && (
          <p className="hint">
            ⚠ Monitor đang tạm tắt: thiết bị giọng dịch trùng với thiết bị bị thu — chọn thiết bị
            khác để nghe meeting qua app.
          </p>
        )}
        {hasVirtualCable ? (
          <p className="hint">
            Chế độ im lặng tuyệt đối: “Nghe meeting” → CABLE Input, “Giọng dịch” → tai nghe, bật cả
            2 ô trên. Meeting không phát ra ngoài, tai nghe nhận cả meeting lẫn giọng dịch.
          </p>
        ) : (
          settings.monitorEnabled && (
            <p className="hint">
              Mẹo: cài VB-Audio Virtual Cable (vb-audio.com/Cable, miễn phí) rồi đặt “Nghe meeting”
              → CABLE Input để meeting im lặng tuyệt đối với người xung quanh.
            </p>
          )
        )}
      </section>

      <OutgoingPanel />

      <section className="card">
        <h2>Overlay phụ đề</h2>
        <div className="row wrap">
          <label className="checkbox">
            <input
              type="checkbox"
              checked={settings.overlayVisible}
              onChange={(e) => void api.setOverlayVisible(e.target.checked)}
            />
            Hiện overlay
          </label>
          <label className="checkbox">
            <input
              type="checkbox"
              checked={settings.overlayClickThrough}
              onChange={(e) => void api.setOverlayClickThrough(e.target.checked)}
            />
            Click xuyên qua (Ctrl+Shift+O)
          </label>
        </div>
        <div className="row wrap">
          <label className="slider-label small">
            Cỡ chữ: {settings.overlayFontSize}px
            <input
              type="range"
              min={14}
              max={40}
              value={settings.overlayFontSize}
              onChange={(e) => void patchSettings({ overlayFontSize: Number(e.target.value) })}
            />
          </label>
          <label className="slider-label small">
            Độ mờ nền: {Math.round(settings.overlayOpacity * 100)}%
            <input
              type="range"
              min={0}
              max={100}
              value={Math.round(settings.overlayOpacity * 100)}
              onChange={(e) => void patchSettings({ overlayOpacity: Number(e.target.value) / 100 })}
            />
          </label>
        </div>
      </section>

      <section className="card subtitles">
        <h2>Phụ đề trực tiếp</h2>
        <div className="subtitle-list" ref={subtitles.ref} onScroll={subtitles.onScroll}>
          {segments.length === 0 && <p className="placeholder">Chưa có nội dung…</p>}
          {segments.map((seg) => (
            <div key={seg.id} className={`segment ${seg.target.final ? 'final' : 'partial'}`}>
              {seg.source.text && <p className="src">{seg.source.text}</p>}
              {seg.target.text && <p className="tgt">{seg.target.text}</p>}
            </div>
          ))}
        </div>
        <div className="row">
          <button onClick={() => void exportTranscript('txt')}>Xuất .txt</button>
          <button onClick={() => void exportTranscript('srt')}>Xuất .srt</button>
          <button onClick={() => void exportTranscript('md')}>Xuất .md</button>
        </div>
      </section>

      <section className="card">
        <h2>Kiểm tra (M1)</h2>
        <div className="row">
          <button onClick={() => void recordDebugWav()} disabled={busy}>
            Thu 10s audio hệ thống → WAV
          </button>
        </div>
      </section>
    </div>
  )
}
