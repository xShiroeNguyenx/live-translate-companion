import { useEffect, useMemo, useState } from 'react'
import {
  INCOMING_PAUSE_SHORTCUT,
  INCOMING_TOGGLE_SHORTCUT,
  PRICE_USD_PER_MINUTE,
  TEXT_MODE_EST_USD_PER_MINUTE
} from '../../shared/constants'
import { parseKeywords } from '../../shared/keywords'
import { languageShort } from '../../shared/languages'
import { MAX_TITLE_CHARS } from '../../shared/meeting-title'
import type { ExportFormat, IncomingMode } from '../../shared/types'
import { AssistantPanel } from './AssistantPanel'
import { HistoryPanel } from './HistoryPanel'
import { OutgoingPanel } from './OutgoingPanel'
import { SettingsPanel, type SettingsSection } from './SettingsPanel'
import { useControlStore } from './store'
import { formatDuration, isDefaultDevice, STATE_COLORS, STATE_LABELS, useDraft } from './ui-helpers'
import { LevelMeter, SegmentList, Warn } from './widgets'

type Tab = 'main' | 'history' | 'settings'

const TOGGLE_HINT = INCOMING_TOGGLE_SHORTCUT.replace('CommandOrControl', 'Ctrl')
const PAUSE_HINT = INCOMING_PAUSE_SHORTCUT.replace('CommandOrControl', 'Ctrl')
const perMinute = (usd: number): string => `≈ $${usd.toFixed(3)}/phút nói`

// Chọn cách dịch cho cuộc họp sắp bắt đầu (khoá trong lúc đang dịch)
function IncomingModeField(): React.JSX.Element {
  const mode = useControlStore((s) => s.settings?.incomingMode ?? 'speech')
  const patchSettings = useControlStore((s) => s.patchSettings)
  return (
    <>
      <div className="row">
        <span className="field-label">🎚 Cách dịch</span>
        <select
          value={mode}
          onChange={(e) => void patchSettings({ incomingMode: e.target.value as IncomingMode })}
        >
          <option value="speech">🔊 Giọng + chữ ({perMinute(PRICE_USD_PER_MINUTE)})</option>
          <option value="text">📝 Chỉ chữ ({perMinute(TEXT_MODE_EST_USD_PER_MINUTE)})</option>
        </select>
      </div>
      {mode === 'text' && (
        <p className="hint">
          Không có giọng dịch. Bản dịch hiện theo từng câu, sau khi người nói ngừng 1–2 giây (câu
          gốc hiện dần trong lúc chờ). Ngữ cảnh cuộc họp được dùng khi dịch.
        </p>
      )}
    </>
  )
}

function UsageBar(): React.JSX.Element {
  const usage = useControlStore((s) => s.usage)
  const ratio = usage.budgetUsd > 0 ? Math.min(1, usage.monthUsd / usage.budgetUsd) : 0
  const level = ratio >= 1 ? 'over' : ratio >= 0.8 ? 'warn' : ''
  return (
    <div className="usage" title="Chi phí ước tính: dịch 2 chiều + tóm tắt + trợ lý cuộc họp">
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

// Tên cuộc họp hiện tại: lưu khi rời ô hoặc Enter, ghi vào mục Lịch sử của phiên này
function MeetingTitleField(): React.JSX.Element {
  const title = useControlStore((s) => s.meetingTitle)
  const setMeetingTitle = useControlStore((s) => s.setMeetingTitle)
  const autoSave = useControlStore((s) => s.settings?.autoSaveEnabled ?? true)
  const [draft, setDraft] = useDraft(title)
  const save = (): void => {
    if (draft.trim() !== title) void setMeetingTitle(draft)
  }
  return (
    <>
      <div className="row">
        <span className="field-label">📌 Tên cuộc họp</span>
        <input
          type="text"
          value={draft}
          maxLength={MAX_TITLE_CHARS}
          placeholder="vd. Họp tiến độ với khách hàng"
          onChange={(e) => setDraft(e.target.value)}
          onBlur={save}
          onKeyDown={(e) => {
            if (e.key === 'Enter' && !e.nativeEvent.isComposing) e.currentTarget.blur()
          }}
        />
      </div>
      {!autoSave && (
        <p className="hint">
          Bật “Tự lưu mỗi phiên” (Cài đặt → Cuộc họp) để tên được lưu vào Lịch sử.
        </p>
      )}
    </>
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
  const [settingsSection, setSettingsSection] = useState<SettingsSection>('api')
  const [historyId, setHistoryId] = useState<string | null>(null)
  const [busy, setBusy] = useState(false)
  const [notice, setNotice] = useState<string | null>(null)
  const [summaryDismissed, setSummaryDismissed] = useState<string | null>(null)
  const keywords = useMemo(
    () => parseKeywords(settings?.highlightKeywords ?? ''),
    [settings?.highlightKeywords]
  )

  useEffect(() => init(), [init])
  // "tóm tắt đến giờ" và bản cuối dùng chung id phiên → lượt tóm tắt mới phải hiện lại banner
  // dù user đã đóng banner của lượt trước
  useEffect(() => {
    if (lastSummary?.state === 'running') setSummaryDismissed(null)
  }, [lastSummary])

  if (!api) return <div className="app">Lỗi: preload chưa nạp được.</div>
  if (!settings) return <div className="app">Đang tải…</div>

  const running = !['idle', 'error'].includes(session.state)
  const paused = session.state === 'paused'
  // sinkState là sự thật từ engine (sink thực tế); chưa có thì đoán theo lựa chọn hiện tại
  const selectedDevice = outputDevices.find((d) => d.deviceId === settings.playbackDeviceId)
  const sinkCaptured = sinkState
    ? sinkState.isCaptured
    : (selectedDevice?.isCaptured ?? isDefaultDevice(settings.playbackDeviceId))
  // chỉ chữ không phát giọng dịch → các cảnh báo về thiết bị phát không áp dụng
  const textOnly = running ? !!session.textOnly : settings.incomingMode === 'text'
  const playing = settings.playbackEnabled && !textOnly
  const feedbackRisk = playing && sinkCaptured
  const sinkError = playing && sinkState && !sinkState.ok ? sinkState.error : null
  // nút “Sửa →” mở thẳng nhóm cài đặt có thứ cần sửa; không truyền gì thì giữ nhóm đang xem
  const openSettings = (section?: SettingsSection): void => {
    if (section) setSettingsSection(section)
    setTab('settings')
  }
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

  const togglePause = async (): Promise<void> => {
    setBusy(true)
    setNotice(null)
    try {
      if (paused) {
        const result = await api.resumeSession()
        if (!result.ok) setNotice(result.error ?? 'Không tiếp tục được phiên dịch.')
      } else {
        await api.pauseSession()
      }
    } finally {
      setBusy(false)
    }
  }

  const summarizeNow = async (): Promise<void> => {
    setNotice(null)
    const result = await api.summarizeCurrent()
    if (!result.ok) setNotice(result.error ?? 'Không tóm tắt được.')
  }
  const summarizing = lastSummary?.state === 'running'

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
          <button className={tab === 'settings' ? 'active' : ''} onClick={() => openSettings()}>
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
      {update.state === 'error' && update.transient && (
        <div className="alert info compact">
          <span>⏳ {update.error}</span>
        </div>
      )}
      {update.state === 'error' && !update.transient && (
        <Warn>Lỗi kiểm tra cập nhật: {update.error}</Warn>
      )}
      {!hasKey && <Warn onFix={() => openSettings('api')}>Chưa có Gemini API key.</Warn>}
      {sinkError && (
        <Warn onFix={() => openSettings('audio')}>
          Không route được giọng dịch tới thiết bị đã chọn — đang phát ra thiết bị mặc định.
          {sinkCaptured && ' Thiết bị đó đang bị thu nên có thể sót lời.'}
        </Warn>
      )}
      {/* route hỏng đã nói luôn chuyện bị thu ở cảnh báo trên → không hiện 2 cảnh báo cho 1 nguyên nhân */}
      {feedbackRisk && !sinkError && (
        <Warn onFix={() => openSettings('audio')}>
          Giọng dịch phát vào đúng thiết bị đang bị thu — có thể sót lời. Nên chọn thiết bị khác.
        </Warn>
      )}

      {tab === 'main' && (
        <>
          <UsageBar />
          <section className="card fill">
            <div className="card-head">
              <h2>Chiều về · meeting → {languageShort(settings.targetLanguage)}</h2>
              <span className="state-label">{STATE_LABELS[session.state]}</span>
              {session.usingFallbackClient && <span className="badge">raw-ws</span>}
              {running && session.textOnly && <span className="badge">📝 Chỉ chữ</span>}
            </div>
            {session.contextDisabled && (
              <Warn onFix={() => openSettings('meeting')}>
                Model không nhận “Ngữ cảnh cuộc họp” — phiên này dịch không có ngữ cảnh.
              </Warn>
            )}
            {running && session.translateError && <Warn>{session.translateError}</Warn>}
            {!running && <IncomingModeField />}
            <div className="row">
              <button
                className={running ? 'btn-stop' : 'btn-start'}
                onClick={() => void toggleSession()}
                disabled={busy || (!hasKey && !running)}
                title={`Phím tắt toàn cục: ${TOGGLE_HINT}`}
              >
                {running ? '■ Dừng' : '▶ Bắt đầu dịch'}
              </button>
              {running && (
                <button
                  className={paused ? 'btn-start' : 'btn-pause'}
                  onClick={() => void togglePause()}
                  disabled={busy || session.state === 'connecting'}
                  title={`Giữ nguyên phụ đề, file transcript và mục lịch sử · Phím tắt toàn cục: ${PAUSE_HINT}`}
                >
                  {paused ? '▶ Tiếp tục' : '⏸ Tạm dừng'}
                </button>
              )}
              <div className="metrics">
                <span>⏱ {formatDuration(metrics.sessionSeconds)}</span>
                <span>📤 {metrics.secondsSent.toFixed(0)}s</span>
                <span>≈ ${metrics.estimatedCostUsd.toFixed(3)}</span>
                {metrics.reconnects > 0 && <span>🔁 {metrics.reconnects}</span>}
              </div>
            </div>
            {paused && (
              <p className="hint">
                ⏸ Đang tạm dừng: không gửi audio lên Gemini. Bấm Tiếp tục để dịch nối vào cùng
                transcript; bấm Dừng để kết thúc phiên.
              </p>
            )}
            {(running || segments.length > 0) && <MeetingTitleField />}
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
              {running && (
                <button
                  className="small push-right"
                  disabled={summarizing || !hasKey}
                  onClick={() => void summarizeNow()}
                  title="Tóm tắt phần đã dịch mà không dừng phiên — bản tóm tắt cuối vẫn chạy khi bấm Dừng"
                >
                  {summarizing ? '⏳ Đang tóm tắt…' : '📝 Tóm tắt đến giờ'}
                </button>
              )}
            </div>
          </section>

          <AssistantPanel />

          <OutgoingPanel onOpenSettings={() => openSettings('audio')} />
        </>
      )}

      {tab === 'history' && <HistoryPanel selectedId={historyId} onSelect={setHistoryId} />}

      {tab === 'settings' && (
        <SettingsPanel
          notify={setNotice}
          busy={busy}
          setBusy={setBusy}
          section={settingsSection}
          onSection={setSettingsSection}
        />
      )}
    </div>
  )
}
