import { useEffect, useState } from 'react'
import type { ExportFormat } from '../../shared/types'
import { OutgoingPanel, OutgoingSettings } from './OutgoingPanel'
import { useControlStore } from './store'
import { formatDuration, isDefaultDevice, STATE_COLORS, STATE_LABELS } from './ui-helpers'
import { LevelMeter, SegmentList, VadSlider, Warn } from './widgets'

type Tab = 'main' | 'settings'

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
    appVersion,
    update,
    init,
    patchSettings,
    setHasKey,
    setWindowsDefault
  } = useControlStore()
  const [tab, setTab] = useState<Tab>('main')
  const [keyInput, setKeyInput] = useState('')
  const [busy, setBusy] = useState(false)
  const [changingDefault, setChangingDefault] = useState(false)
  const [notice, setNotice] = useState<string | null>(null)

  const [autoSaveDir, setAutoSaveDir] = useState('')

  useEffect(() => init(), [init])
  useEffect(() => {
    void api?.getAutoSaveDir().then(setAutoSaveDir)
  }, [api, settings?.autoSaveDir])

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
  const openSettings = (): void => setTab('settings')

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

  return (
    <div className="app">
      <header className="header">
        <span className="led" style={{ background: STATE_COLORS[session.state] }} />
        <h1>Live Translate</h1>
        <nav className="tabs">
          <button className={tab === 'main' ? 'active' : ''} onClick={() => setTab('main')}>
            Dịch
          </button>
          <button className={tab === 'settings' ? 'active' : ''} onClick={openSettings}>
            ⚙ Cài đặt
          </button>
        </nav>
      </header>

      {session.state === 'error' && session.error && (
        <div className="alert error">{session.error}</div>
      )}
      {notice && (
        <div className="alert info compact">
          <span>{notice}</span>
          <button className="link-btn" onClick={() => setNotice(null)}>
            ✕
          </button>
        </div>
      )}
      {update.state === 'downloaded' && (
        <div className="alert info compact">
          <span>✅ Đã tải bản mới {update.version}.</span>
          <button className="btn-start" onClick={() => void api.installUpdate()}>
            Cài &amp; khởi động lại
          </button>
        </div>
      )}
      {(update.state === 'available' || update.state === 'downloading') && (
        <div className="alert info">
          ⬇ Đang tải bản mới {update.version}…
          {update.percent !== undefined ? ` ${update.percent}%` : ''}
        </div>
      )}
      {update.state === 'error' && <Warn>Lỗi kiểm tra cập nhật: {update.error}</Warn>}
      {!hasKey && <Warn onFix={openSettings}>Chưa có Gemini API key.</Warn>}
      {sinkError && (
        <Warn onFix={openSettings}>
          Không route được giọng dịch tới thiết bị đã chọn — đang phát ra thiết bị mặc định.
        </Warn>
      )}
      {feedbackRisk && (
        <Warn onFix={openSettings}>
          Giọng dịch phát vào đúng thiết bị đang bị thu — có thể sót lời. Nên chọn thiết bị khác.
        </Warn>
      )}

      {tab === 'main' ? (
        <>
          <section className="card">
            <div className="card-head">
              <h2>Chiều về · meeting → Việt</h2>
              <span className="state-label">{STATE_LABELS[session.state]}</span>
              {session.usingFallbackClient && <span className="badge">raw-ws</span>}
            </div>
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
                <span>📤 {metrics.secondsSent.toFixed(0)}s</span>
                <span>≈ ${metrics.estimatedCostUsd.toFixed(3)}</span>
                {metrics.reconnects > 0 && <span>🔁 {metrics.reconnects}</span>}
              </div>
            </div>
            <LevelMeter rmsDb={metrics.rmsDb} thresholdDb={settings.vadThresholdDb} />
            <SegmentList segments={segments} placeholder="Chưa có nội dung…" />
            <div className="row export-row">
              <span className="hint">Xuất:</span>
              <button className="small" onClick={() => void exportTranscript('txt')}>
                .txt
              </button>
              <button className="small" onClick={() => void exportTranscript('srt')}>
                .srt
              </button>
              <button className="small" onClick={() => void exportTranscript('md')}>
                .md
              </button>
            </div>
          </section>

          <OutgoingPanel onOpenSettings={openSettings} />
        </>
      ) : (
        <>
          <section className="card">
            <h2>Gemini API key</h2>
            <div className="row">
              <input
                type="password"
                placeholder={
                  hasKey ? 'Đã lưu ✓ — nhập để thay key mới' : 'Dán API key từ Google AI Studio'
                }
                value={keyInput}
                onChange={(e) => setKeyInput(e.target.value)}
              />
              <button onClick={() => void saveKey()} disabled={!keyInput.trim()}>
                Lưu
              </button>
            </div>
          </section>

          <section className="card">
            <h2>Chiều về (nghe meeting)</h2>
            <div className="row">
              <span
                className="field-label"
                title="Đổi thiết bị mặc định của Windows — meeting phát ra đây và app thu & dịch chính luồng này"
              >
                🎧 Nghe meeting
              </span>
              <select
                value={windowsOutputs.find((d) => d.isDefault)?.id ?? ''}
                disabled={changingDefault || windowsOutputs.length === 0}
                onChange={(e) => void changeMeetingDevice(e.target.value)}
              >
                {windowsOutputs.length === 0 && (
                  <option value="">(Không đọc được danh sách)</option>
                )}
                {windowsOutputs.map((d) => (
                  <option key={d.id} value={d.id}>
                    {d.name}
                  </option>
                ))}
              </select>
            </div>
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
            <div className="row wrap">
              <label className="checkbox">
                <input
                  type="checkbox"
                  checked={settings.playbackEnabled}
                  onChange={(e) => void patchSettings({ playbackEnabled: e.target.checked })}
                />
                Phát giọng dịch
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
            <VadSlider
              label="Ngưỡng VAD"
              rmsDb={metrics.rmsDb}
              value={settings.vadThresholdDb}
              onChange={(db) => void patchSettings({ vadThresholdDb: db })}
            />
            {settings.monitorEnabled && sinkCaptured && (
              <p className="hint">
                ⚠ Monitor đang tạm tắt: thiết bị giọng dịch trùng với thiết bị bị thu.
              </p>
            )}
            {hasVirtualCable ? (
              <p className="hint">
                Im lặng tuyệt đối: “Nghe meeting” → CABLE Input, “Giọng dịch” → tai nghe, bật cả 2
                ô trên.
              </p>
            ) : (
              settings.monitorEnabled && (
                <p className="hint">
                  Mẹo: cài VB-Audio Virtual Cable (vb-audio.com/Cable) rồi đặt “Nghe meeting” →
                  CABLE Input để meeting im lặng với người xung quanh.
                </p>
              )
            )}
          </section>

          <OutgoingSettings />

          <section className="card">
            <h2>Tự lưu transcript</h2>
            <div className="row wrap">
              <label className="checkbox">
                <input
                  type="checkbox"
                  checked={settings.autoSaveEnabled}
                  onChange={(e) => void patchSettings({ autoSaveEnabled: e.target.checked })}
                />
                Tự lưu mỗi phiên (cả 2 chiều)
              </label>
              <select
                className="narrow"
                value={settings.autoSaveFormat}
                disabled={!settings.autoSaveEnabled}
                onChange={(e) => void patchSettings({ autoSaveFormat: e.target.value as ExportFormat })}
              >
                <option value="txt">.txt</option>
                <option value="md">.md</option>
                <option value="srt">.srt</option>
              </select>
            </div>
            <div className="row">
              <span className="path" title={autoSaveDir}>
                📁 {autoSaveDir || '—'}
              </span>
              <button className="small" onClick={() => void api.pickAutoSaveDir()}>
                Đổi…
              </button>
              <button className="small" onClick={() => void api.openAutoSaveDir()}>
                Mở
              </button>
            </div>
            <p className="hint">
              Mỗi phiên 1 file (…_chieu-ve / …_chieu-di), ghi liên tục khi đang dịch nên không mất
              nội dung nếu app bị tắt đột ngột.
            </p>
          </section>

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
                  onChange={(e) =>
                    void patchSettings({ overlayOpacity: Number(e.target.value) / 100 })
                  }
                />
              </label>
            </div>
          </section>

          <section className="card">
            <h2>Khác</h2>
            <div className="row wrap">
              <button onClick={() => void recordDebugWav()} disabled={busy}>
                Thu thử 10s audio → WAV
              </button>
              <span className="hint" style={{ flex: 1, textAlign: 'right' }}>
                Phiên bản {appVersion || '—'}
              </span>
              <button
                className="link-btn"
                disabled={update.state === 'checking' || update.state === 'downloading'}
                onClick={() => void api.checkForUpdate()}
              >
                {update.state === 'checking'
                  ? 'Đang kiểm tra…'
                  : update.state === 'none'
                    ? 'Đã là bản mới nhất ✓'
                    : 'Kiểm tra cập nhật'}
              </button>
            </div>
          </section>
        </>
      )}
    </div>
  )
}
