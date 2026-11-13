import { useState } from 'react'
import { DIRECT_MIC_SHORTCUT, TTS_VOICES } from '../../shared/constants'
import { LANGUAGES, languageShort } from '../../shared/languages'
import type { OutgoingMode, SubtitleSegment } from '../../shared/types'
import { useControlStore } from './store'
import { TypedSpeechBox } from './TypedSpeechBox'
import { formatDuration, isVirtualCable, STATE_COLORS, STATE_LABELS } from './ui-helpers'
import { LevelMeter, SegmentList, VadSlider, Warn } from './widgets'

// chiều đi: người dùng nói tiếng Việt → dịch sang ngôn ngữ khác
const TARGET_OPTIONS = LANGUAGES.filter((l) => l.code !== 'vi')

// chiều đi có 3 cách nói, chọn một: nói qua micro có dịch, gõ rồi cho máy đọc, hoặc nói thẳng không dịch
type InputMode = 'speak' | 'type' | 'direct'
const INPUT_MODE_KEY = 'outgoingInputMode'
const DIRECT_HINT = DIRECT_MIC_SHORTCUT.replace('CommandOrControl', 'Ctrl')
const MODES: { id: InputMode; label: string; title: string }[] = [
  { id: 'speak', label: '🎤 Nói có dịch', title: 'Nói tiếng Việt, meeting nghe giọng đã dịch' },
  { id: 'type', label: '⌨ Gõ để nói', title: 'Gõ chữ, app dịch rồi đọc thành giọng vào meeting' },
  {
    id: 'direct',
    label: '🎙 Nói thẳng',
    title: 'Meeting nghe giọng thật của bạn, không dịch, không tốn tiền'
  }
]

function loadInputMode(): InputMode {
  try {
    const saved = localStorage.getItem(INPUT_MODE_KEY)
    return saved === 'type' || saved === 'direct' ? saved : 'speak'
  } catch {
    return 'speak'
  }
}

// Tab "Dịch": bật/tắt chiều đi, PTT hoặc gõ để nói, transcript
export function OutgoingPanel({ onOpenSettings }: { onOpenSettings: () => void }): React.JSX.Element {
  const api = window.controlApi
  const {
    settings,
    outgoing,
    outgoingMetrics,
    outgoingSegments,
    outgoingSinkState,
    typedSpeech,
    directMic
  } = useControlStore()
  const [directBusy, setDirectBusy] = useState(false)
  const [busy, setBusy] = useState(false)
  const [error, setError] = useState<string | null>(null)
  const [mode, setMode] = useState<InputMode>(loadInputMode)

  if (!api || !settings) return <></>

  const chooseMode = (next: InputMode): void => {
    setMode(next)
    try {
      localStorage.setItem(INPUT_MODE_KEY, next)
    } catch {
      /* không lưu được thì lần sau về mặc định */
    }
  }

  const running = !['idle', 'error'].includes(outgoing.state)
  const paused = outgoing.state === 'paused'
  const isPtt = settings.outgoingMode === 'ptt'
  const talking = outgoing.state === 'streaming'
  const sinkLabel = outgoingSinkState?.label || settings.outgoingDeviceLabel
  // chiều đi nguy hiểm nếu KHÔNG phải mic ảo → giọng dịch phát ra loa thật cho cả phòng nghe
  const notVirtual = running && sinkLabel !== '' && !isVirtualCable(sinkLabel)
  const sinkError = running && outgoingSinkState && !outgoingSinkState.ok ? outgoingSinkState.error : null
  const targetLabel = languageShort(settings.outgoingTargetLanguage)

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

  const togglePause = async (): Promise<void> => {
    setBusy(true)
    setError(null)
    try {
      if (paused) {
        const result = await api.resumeOutgoing()
        if (!result.ok) setError(result.error ?? 'Không tiếp tục được chiều đi.')
      } else {
        await api.pauseOutgoing()
      }
    } finally {
      setBusy(false)
    }
  }

  // phát lại 1 câu trong transcript bằng giọng đọc (câu nói qua micro cũng phát lại được)
  const replay = async (seg: SubtitleSegment): Promise<void> => {
    setError(null)
    try {
      const r = await api.speakTyped(seg.target.text, seg.source.text, true)
      if (!r.ok && !r.stopped) setError(r.error ?? 'Không phát lại được.')
    } catch (err) {
      setError(String(err))
    }
  }

  // nói thẳng: giọng thật vào mic ảo, không dịch. Bật thì main tự tạm dừng phiên dịch chiều đi.
  const toggleDirect = async (): Promise<void> => {
    setDirectBusy(true)
    setError(null)
    try {
      const r = await api.setDirectMic(!directMic)
      if (r.error) setError(r.error)
    } catch (err) {
      setError(String(err))
    } finally {
      setDirectBusy(false)
    }
  }

  const press = (active: boolean): void => {
    if (running && !paused && isPtt) void api.setPushToTalk(active)
  }

  // một dòng trả lời câu "meeting đang nghe gì từ mình?" (giả định Meet/Zoom dùng micro = CABLE Output)
  const hear: { text: string; live: boolean } = directMic
    ? { text: 'giọng thật', live: true }
    : typedSpeech === 'playing'
      ? { text: 'giọng đọc', live: true }
      : talking
        ? { text: 'giọng dịch', live: true }
        : running
          ? { text: STATE_LABELS[outgoing.state].toLowerCase(), live: false }
          : { text: 'im lặng', live: false }

  return (
    <section className="card">
      <div className="card-head">
        <span className="led" style={{ background: STATE_COLORS[outgoing.state] }} />
        <h2>Chiều đi · Tôi → {targetLabel}</h2>
        <span
          className={`hear-chip ${hear.live ? 'live' : ''}`}
          title="Thứ đang đi vào thiết bị “Phát vào” (mic ảo của meeting)"
        >
          Vào meeting: {hear.text}
        </span>
        {outgoing.usingFallbackClient && <span className="badge">raw-ws</span>}
      </div>

      {/* chọn MỘT cách nói; mỗi cách chỉ hiện đúng các nút của nó */}
      <div className="tabs mode-switch">
        {MODES.map((m) => (
          <button
            key={m.id}
            className={mode === m.id ? 'active' : ''}
            title={m.title}
            onClick={() => chooseMode(m.id)}
          >
            {m.label}
            {/* chấm đỏ: cách này đang chạy dù bạn đang xem tab khác */}
            {((m.id === 'direct' && directMic) || (m.id === 'speak' && running && !paused)) && (
              <span className="mode-dot" />
            )}
          </button>
        ))}
      </div>

      {error && <div className="alert error">{error}</div>}
      {outgoing.contextDisabled && (
        <Warn onFix={onOpenSettings}>Model không nhận “Ngữ cảnh cuộc họp” — phiên này dịch không có ngữ cảnh.</Warn>
      )}
      {sinkError && (
        <Warn onFix={onOpenSettings}>Không route được tới thiết bị “Phát vào” ({sinkError}).</Warn>
      )}
      {notVirtual && (
        <Warn onFix={onOpenSettings}>
          Đang phát ra “{sinkLabel}” — không phải mic ảo, cả phòng sẽ nghe thấy.
        </Warn>
      )}

      {/* đang xem tab khác mà micro vẫn mở → luôn có chỗ tắt ngay */}
      {directMic && mode !== 'direct' && (
        <div className="live-strip">
          <span>🔴 Meeting đang nghe giọng thật của bạn</span>
          <button className="small" onClick={() => void toggleDirect()} disabled={directBusy}>
            Tắt
          </button>
        </div>
      )}
      {running && mode !== 'speak' && (
        <div className="live-strip calm">
          <span>
            🎤 Dịch giọng nói đang bật ({STATE_LABELS[outgoing.state].toLowerCase()}) · ≈ $
            {outgoingMetrics.estimatedCostUsd.toFixed(3)}
          </span>
          <button className="small" onClick={() => void toggle()} disabled={busy}>
            ■ Tắt
          </button>
        </div>
      )}

      {mode === 'type' && <TypedSpeechBox onOpenSettings={onOpenSettings} />}

      {mode === 'direct' && (
        <>
          <button
            className={`ptt-btn ${directMic ? 'talking' : ''}`}
            onClick={() => void toggleDirect()}
            disabled={directBusy}
          >
            {directMic ? '🔴 Đang nói thẳng · bấm để tắt' : `🎙 Bật micro nói thẳng · ${DIRECT_HINT}`}
          </button>
          <p className="hint">
            {directMic
              ? paused
                ? 'Meeting đang nghe giọng thật của bạn. Dịch giọng nói tạm dừng, sẽ chạy lại khi bạn tắt.'
                : 'Meeting đang nghe giọng thật của bạn.'
              : 'Giọng thật của bạn vào meeting, không dịch, không tốn tiền. Meet/Zoom cứ để micro = CABLE Output.'}
          </p>
        </>
      )}

      {mode === 'speak' && !running && (
        <>
          <button className="ptt-btn start" onClick={() => void toggle()} disabled={busy}>
            ▶ Bật dịch giọng nói
          </button>
          <p className="hint">
            {isPtt
              ? 'Bật xong thì giữ nút (hoặc Ctrl+Space) trong lúc nói. Chỉ tốn tiền khi bạn nói.'
              : 'Bật xong thì cứ nói, app tự nhận lúc bạn nói và dịch.'}
          </p>
        </>
      )}

      {mode === 'speak' && running && (
        <>
          {isPtt ? (
            <button
              className={`ptt-btn ${talking ? 'talking' : ''}`}
              disabled={paused}
              title="Hoặc nhấn Ctrl+Space (bật/tắt) khi đang ở cửa sổ meeting"
              onPointerDown={() => press(true)}
              onPointerUp={() => press(false)}
              onPointerLeave={() => press(false)}
            >
              {paused
                ? '⏸ Đang tạm dừng'
                : talking
                  ? '🔴 Đang nói… (thả ra để gửi)'
                  : '🎤 Giữ để nói · Ctrl+Space'}
            </button>
          ) : (
            <LevelMeter rmsDb={outgoingMetrics.rmsDb} thresholdDb={settings.outgoingVadThresholdDb} />
          )}
          <div className="row">
            <button className="btn-stop small" onClick={() => void toggle()} disabled={busy}>
              ■ Tắt
            </button>
            <button
              className={`small ${paused ? 'btn-start' : 'btn-pause'}`}
              onClick={() => void togglePause()}
              disabled={busy || outgoing.state === 'connecting'}
              title="Ngừng gửi giọng nói nhưng giữ nguyên transcript chiều đi"
            >
              {paused ? '▶ Tiếp tục' : '⏸ Tạm dừng'}
            </button>
            <div className="metrics">
              <span>⏱ {formatDuration(outgoingMetrics.sessionSeconds)}</span>
              <span>📤 {outgoingMetrics.secondsSent.toFixed(0)}s</span>
              <span>≈ ${outgoingMetrics.estimatedCostUsd.toFixed(3)}</span>
              {outgoingMetrics.reconnects > 0 && <span>🔁 {outgoingMetrics.reconnects}</span>}
            </div>
          </div>
        </>
      )}

      <SegmentList
        segments={outgoingSegments}
        placeholder={
          mode === 'type'
            ? 'Câu đã phát sẽ hiện ở đây…'
            : mode === 'direct'
              ? 'Lời nói thẳng không được ghi lại. Câu đã dịch hoặc đã phát hiện ở đây…'
              : 'Chưa nói gì…'
        }
        className="outgoing"
        onReplay={(seg) => void replay(seg)}
        replayDisabled={typedSpeech !== 'idle'}
        onDelete={(seg) => void api.removeOutgoingSegment(seg.id)}
      />
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
      <div className="row">
        <span className="field-label">🗣 Giọng đọc</span>
        <select
          value={settings.typedSpeechVoice}
          title="Giọng dùng cho “⌨ Gõ” ở tab Dịch (gõ chữ rồi cho máy đọc vào meeting)"
          onChange={(e) => void patchSettings({ typedSpeechVoice: e.target.value })}
        >
          {TTS_VOICES.map((v) => (
            <option key={v.id} value={v.id}>
              {v.label}
            </option>
          ))}
        </select>
      </div>
      {!hasCable && (
        <p className="hint">
          Chưa thấy “CABLE Input”. Cài VB-Audio Virtual Cable (vb-audio.com/Cable, miễn phí, cần
          restart), rồi trong Meet/Zoom chọn Micro = “CABLE Output (VB-Audio Virtual Cable)”.
        </p>
      )}
    </section>
  )
}
