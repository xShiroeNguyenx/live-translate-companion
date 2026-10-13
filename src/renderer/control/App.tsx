import { useEffect, useMemo, useState } from 'react'
import { INCOMING_TOGGLE_SHORTCUT } from '../../shared/constants'
import { parseKeywords } from '../../shared/keywords'
import { languageShort } from '../../shared/languages'
import type { ExportFormat } from '../../shared/types'
import { HistoryPanel } from './HistoryPanel'
import { OutgoingPanel } from './OutgoingPanel'
import { SettingsPanel } from './SettingsPanel'
import { useControlStore } from './store'
import { formatDuration, isDefaultDevice, STATE_COLORS, STATE_LABELS } from './ui-helpers'
import { LevelMeter, SegmentList, Warn } from './widgets'

type Tab = 'main' | 'history' | 'settings'

const TOGGLE_HINT = INCOMING_TOGGLE_SHORTCUT.replace('CommandOrControl', 'Ctrl')

function UsageBar(): React.JSX.Element {
  const usage = useControlStore((s) => s.usage)
  const ratio = usage.budgetUsd > 0 ? Math.min(1, usage.monthUsd / usage.budgetUsd) : 0
  const level = ratio >= 1 ? 'over' : ratio >= 0.8 ? 'warn' : ''
  return (
    <div className="usage" title="Chi phí ước tính (cả 2 chiều)">
      <span>💰 Hôm nay ${usage.todayUsd.toFixed(2)}</span>
      <span>
        Tháng ${usage.monthUsd.toFixed(2)}
        {usage.budgetUsd > 0 && ` / $${usage.budgetUsd.toFixed(2)}`}
      </span>
      {usage.budgetUsd > 0 && (
        <div className={`usage-bar ${level}`}>
          <div style={{ width: `${ratio * 100}%` }} />
        </div>
      )}
    </div>
  )
}

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
    update,
    lastSummary,
    init
  } = useControlStore()
  const [tab, setTab] = useState<Tab>('main')
  const [historyId, setHistoryId] = useState<string | null>(null)
  const [busy, setBusy] = useState(false)
  const [notice, setNotice] = useState<string | null>(null)
  const [summaryDismissed, setSummaryDismissed] = useState<string | null>(null)
  const keywords = useMemo(
    () => parseKeywords(settings?.highlightKeywords ?? ''),
    [settings?.highlightKeywords]
  )

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
  const openSettings = (): void => setTab('settings')
  const openHistory = (id: string | null): void => {
    setHistoryId(id)
    setTab('history')
  }
  const showSummary = lastSummary && lastSummary.id !== summaryDismissed

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

  return (
    <div className="app">
      <header className="header">
        <span className="led" style={{ background: STATE_COLORS[session.state] }} />
        <h1>Live Translate</h1>
        <nav className="tabs">
          <button className={tab === 'main' ? 'active' : ''} onClick={() => setTab('main')}>
            Dịch
          </button>
          <button className={tab === 'history' ? 'active' : ''} onClick={() => openHistory(null)}>
            Lịch sử
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
      {showSummary && (
        <div className={`alert ${lastSummary.state === 'error' ? 'warn' : 'info'} compact`}>
          <span>
            {lastSummary.state === 'running' && '⏳ Đang tóm tắt cuộc họp…'}
            {lastSummary.state === 'done' && '📝 Đã tóm tắt cuộc họp.'}
            {lastSummary.state === 'error' && `⚠ Tóm tắt thất bại: ${lastSummary.error ?? ''}`}
          </span>
          <span className="row" style={{ gap: 8 }}>
            {lastSummary.state !== 'running' && (
              <button
                className="link-btn"
                onClick={() => {
                  setSummaryDismissed(lastSummary.id)
                  openHistory(lastSummary.id)
                }}
              >
                Xem →
              </button>
            )}
            <button className="link-btn" onClick={() => setSummaryDismissed(lastSummary.id)}>
              ✕
            </button>
          </span>
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

      {tab === 'main' && (
        <>
          <UsageBar />
          <section className="card">
            <div className="card-head">
              <h2>Chiều về · meeting → {languageShort(settings.targetLanguage)}</h2>
              <span className="state-label">{STATE_LABELS[session.state]}</span>
              {session.usingFallbackClient && <span className="badge">raw-ws</span>}
            </div>
            {session.contextDisabled && (
              <Warn onFix={openSettings}>
                Model không nhận “Ngữ cảnh cuộc họp” — phiên này dịch không có ngữ cảnh.
              </Warn>
            )}
            <div className="row">
              <button
                className={running ? 'btn-stop' : 'btn-start'}
                onClick={() => void toggleSession()}
                disabled={busy || (!hasKey && !running)}
                title={`Phím tắt toàn cục: ${TOGGLE_HINT}`}
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
            <SegmentList segments={segments} placeholder="Chưa có nội dung…" keywords={keywords} />
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
      )}

      {tab === 'history' && <HistoryPanel selectedId={historyId} onSelect={setHistoryId} />}

      {tab === 'settings' && <SettingsPanel notify={setNotice} busy={busy} setBusy={setBusy} />}
    </div>
  )
}
