import { useEffect, useState } from 'react'
import { DEFAULT_SUMMARY_MODEL, INCOMING_TOGGLE_SHORTCUT } from '../../shared/constants'
import {
  API_VERSIONS,
  DEFAULT_API_VERSION,
  DEFAULT_LIVE_MODEL,
  normalizeApiVersion,
  normalizeLiveModel,
  type LiveModelInfo
} from '../../shared/gemini-api'
import { LANGUAGES } from '../../shared/languages'
import type { ExportFormat } from '../../shared/types'
import { OutgoingSettings } from './OutgoingPanel'
import { useControlStore } from './store'
import { isDefaultDevice } from './ui-helpers'
import { VadSlider } from './widgets'

// Ô nhập text chỉ lưu khi rời ô (tránh ghi settings.json mỗi phím gõ)
function useDraft(value: string): [string, (v: string) => void] {
  const [draft, setDraft] = useState(value)
  useEffect(() => setDraft(value), [value])
  return [draft, setDraft]
}

export function SettingsPanel({
  notify,
  busy,
  setBusy
}: {
  notify: (msg: string) => void
  busy: boolean
  setBusy: (v: boolean) => void
}): React.JSX.Element {
  const api = window.controlApi
  const {
    settings,
    session,
    metrics,
    hasKey,
    outputDevices,
    sinkState,
    windowsOutputs,
    appVersion,
    update,
    patchSettings,
    setHasKey,
    setWindowsDefault
  } = useControlStore()
  const [keyInput, setKeyInput] = useState('')
  const [changingDefault, setChangingDefault] = useState(false)
  const [autoSaveDir, setAutoSaveDir] = useState('')
  const [context, setContext] = useDraft(settings?.meetingContext ?? '')
  const [keywords, setKeywords] = useDraft(settings?.highlightKeywords ?? '')
  const [model, setModel] = useDraft(settings?.summaryModel ?? '')
  const [liveModel, setLiveModel] = useDraft(settings?.liveModel ?? '')
  const [liveModels, setLiveModels] = useState<LiveModelInfo[]>([])
  const [loadingModels, setLoadingModels] = useState(false)

  // danh sách model phụ thuộc API version → đổi version thì bỏ danh sách cũ
  useEffect(() => setLiveModels([]), [settings?.apiVersion])
  const [budget, setBudget] = useDraft(String(settings?.monthlyBudgetUsd ?? 0))

  useEffect(() => {
    void api?.getAutoSaveDir().then(setAutoSaveDir)
  }, [api, settings?.autoSaveDir])

  if (!api || !settings) return <></>

  const running = !['idle', 'error'].includes(session.state)
  const selectedDevice = outputDevices.find((d) => d.deviceId === settings.playbackDeviceId)
  const sinkCaptured = sinkState
    ? sinkState.isCaptured
    : (selectedDevice?.isCaptured ?? isDefaultDevice(settings.playbackDeviceId))
  const hasVirtualCable = windowsOutputs.some((d) => /CABLE Input/i.test(d.name))

  const saveKey = async (): Promise<void> => {
    if (!keyInput.trim()) return
    const ok = await api.setApiKey(keyInput)
    if (ok) {
      setHasKey(true)
      setKeyInput('')
      notify('Đã lưu API key (mã hoá bằng safeStorage).')
    } else {
      notify('Không mã hoá được API key trên máy này.')
    }
  }

  const changeMeetingDevice = async (deviceId: string): Promise<void> => {
    setChangingDefault(true)
    try {
      const result = await setWindowsDefault(deviceId)
      if (!result.ok) {
        notify(`Không đổi được thiết bị mặc định Windows: ${result.error ?? 'lỗi không rõ'}`)
      }
    } finally {
      setChangingDefault(false)
    }
  }

  const recordDebugWav = async (): Promise<void> => {
    setBusy(true)
    notify('Đang thu 10 giây audio hệ thống… hãy phát thử âm thanh.')
    try {
      const path = await api.debugRecordWav(10)
      notify(path ? `Đã ghi file kiểm tra: ${path}` : 'Thu thử thất bại.')
    } catch (err) {
      notify(`Thu thử thất bại: ${err instanceof Error ? err.message : String(err)}`)
    } finally {
      setBusy(false)
    }
  }

  const saveLiveModel = (input: string): void => {
    const value = normalizeLiveModel(input).replace(/^models\//, '')
    setLiveModel(value)
    void patchSettings({ liveModel: value })
  }

  const loadLiveModels = async (): Promise<void> => {
    setLoadingModels(true)
    try {
      const result = await api.listLiveModels()
      setLiveModels(result.models)
      notify(
        result.ok
          ? `Tìm thấy ${result.models.length} model dịch trên ${settings.apiVersion}.`
          : `Không tải được danh sách model: ${result.error ?? 'lỗi không rõ'}`
      )
    } catch (err) {
      notify(`Không tải được danh sách model: ${err instanceof Error ? err.message : String(err)}`)
    } finally {
      setLoadingModels(false)
    }
  }

  const saveBudget = (): void => {
    const n = Number(budget.replace(',', '.'))
    const value = Number.isFinite(n) && n > 0 ? Math.round(n * 100) / 100 : 0
    setBudget(String(value))
    void patchSettings({ monthlyBudgetUsd: value })
  }

  return (
    <>
      <section className="card">
        <h2>Gemini API</h2>
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
        <div className="row">
          <span className="field-label">🔖 API version</span>
          <select
            className="narrow"
            value={settings.apiVersion}
            onChange={(e) =>
              void patchSettings({ apiVersion: normalizeApiVersion(e.target.value) })
            }
          >
            {API_VERSIONS.map((v) => (
              <option key={v} value={v}>
                {v}
                {v === DEFAULT_API_VERSION ? ' (mặc định)' : ''}
              </option>
            ))}
          </select>
        </div>
        <div className="row">
          <span className="field-label">🎧 Model dịch</span>
          <input
            type="text"
            value={liveModel}
            placeholder={DEFAULT_LIVE_MODEL}
            onChange={(e) => setLiveModel(e.target.value)}
            onBlur={() => saveLiveModel(liveModel)}
          />
          <button
            className="small"
            disabled={loadingModels || !hasKey}
            title={hasKey ? 'Lấy danh sách model dịch từ Google' : 'Cần lưu API key trước'}
            onClick={() => void loadLiveModels()}
          >
            {loadingModels ? 'Đang tải…' : 'Tải'}
          </button>
        </div>
        {liveModels.length > 0 && (
          <div className="row">
            <span className="field-label" />
            <select
              value={liveModels.some((m) => m.id === liveModel) ? liveModel : ''}
              onChange={(e) => e.target.value && saveLiveModel(e.target.value)}
            >
              <option value="">— Chọn trong {liveModels.length} model dịch —</option>
              {liveModels.map((m) => (
                <option key={m.id} value={m.id}>
                  {m.displayName === m.id ? m.id : `${m.displayName} (${m.id})`}
                </option>
              ))}
            </select>
          </div>
        )}
        <p className="hint">
          Áp dụng cho cả dịch Live lẫn tóm tắt, có hiệu lực từ lần kết nối sau
          {running ? ' (đang dịch: hãy Dừng rồi Bắt đầu lại)' : ''}. Live API chỉ có trên v1beta /
          v1alpha; model phải hỗ trợ Live translate, sai tên thì kết nối sẽ báo lỗi.
        </p>
      </section>

      <section className="card">
        <h2>Chiều về (nghe meeting)</h2>
        <div className="row">
          <span className="field-label">🌐 Dịch sang</span>
          <select
            value={settings.targetLanguage}
            disabled={running}
            title={running ? 'Dừng dịch để đổi ngôn ngữ' : undefined}
            onChange={(e) => void patchSettings({ targetLanguage: e.target.value })}
          >
            {LANGUAGES.map((l) => (
              <option key={l.code} value={l.code}>
                {l.label}
              </option>
            ))}
          </select>
        </div>
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
            {windowsOutputs.length === 0 && <option value="">(Không đọc được danh sách)</option>}
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
          <p className="hint">⚠ Monitor đang tạm tắt: thiết bị giọng dịch trùng với thiết bị bị thu.</p>
        )}
        {hasVirtualCable ? (
          <p className="hint">
            Im lặng tuyệt đối: “Nghe meeting” → CABLE Input, “Giọng dịch” → tai nghe, bật cả 2 ô
            trên.
          </p>
        ) : (
          settings.monitorEnabled && (
            <p className="hint">
              Mẹo: cài VB-Audio Virtual Cable (vb-audio.com/Cable) rồi đặt “Nghe meeting” → CABLE
              Input để meeting im lặng với người xung quanh.
            </p>
          )
        )}
      </section>

      <OutgoingSettings />

      <section className="card">
        <h2>Ngữ cảnh &amp; từ khoá</h2>
        <label className="field-col">
          <span>Ngữ cảnh cuộc họp / thuật ngữ</span>
          <textarea
            rows={3}
            placeholder={'VD: Họp dự án Webike với team Nhật.\n見積 → báo giá; 納期 → hạn giao hàng'}
            value={context}
            onChange={(e) => setContext(e.target.value)}
            onBlur={() => void patchSettings({ meetingContext: context })}
          />
        </label>
        <p className="hint">
          Dùng cho bản tóm tắt, và gửi kèm phiên dịch nếu model chấp nhận (nếu không app sẽ báo và
          dịch không có ngữ cảnh). Áp dụng từ phiên sau.
        </p>
        <label className="field-col">
          <span>Từ khoá cần chú ý (phân cách bằng dấu phẩy)</span>
          <input
            type="text"
            placeholder="VD: Khánh, Khanh, カーン, deadline"
            value={keywords}
            onChange={(e) => setKeywords(e.target.value)}
            onBlur={() => void patchSettings({ highlightKeywords: keywords })}
          />
        </label>
        <p className="hint">
          Câu có từ khoá được tô vàng trên phụ đề/overlay và hiện thông báo Windows khi bạn đang ở
          cửa sổ khác. Không phân biệt hoa thường, có dấu hay không dấu.
        </p>
      </section>

      <section className="card">
        <h2>Tự lưu &amp; tóm tắt</h2>
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
        <label className="checkbox">
          <input
            type="checkbox"
            checked={settings.autoSummary}
            disabled={!settings.autoSaveEnabled}
            onChange={(e) => void patchSettings({ autoSummary: e.target.checked })}
          />
          Tự tóm tắt cuộc họp khi dừng dịch
        </label>
        <div className="row">
          <span className="field-label">🤖 Model</span>
          <input
            type="text"
            value={model}
            placeholder={DEFAULT_SUMMARY_MODEL}
            onChange={(e) => setModel(e.target.value)}
            onBlur={() => {
              const value = model.trim() || DEFAULT_SUMMARY_MODEL
              setModel(value)
              void patchSettings({ summaryModel: value })
            }}
          />
        </div>
        <p className="hint">
          Mỗi phiên 1 file (…_chieu-ve / …_chieu-di), ghi liên tục nên không mất nội dung khi app
          tắt đột ngột. Tóm tắt lưu thành …_tom-tat.md cạnh transcript; phiên quá ngắn sẽ bỏ qua.
        </p>
      </section>

      <section className="card">
        <h2>Chi phí</h2>
        <div className="row">
          <span className="field-label">💰 Giới hạn/tháng</span>
          <span className="hint">$</span>
          <input
            type="text"
            inputMode="decimal"
            className="narrow-input"
            value={budget}
            onChange={(e) => setBudget(e.target.value)}
            onBlur={saveBudget}
            onKeyDown={(e) => e.key === 'Enter' && saveBudget()}
          />
          <span className="hint" style={{ flex: 1 }}>
            0 = không giới hạn
          </span>
        </div>
        <p className="hint">
          Tới 80% app báo trước; tới 100% app tự dừng cả 2 chiều và không cho bắt đầu lại trong
          tháng. Chi phí là ước tính theo số giây audio đã gửi (chưa gồm tóm tắt).
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
              onChange={(e) => void patchSettings({ overlayOpacity: Number(e.target.value) / 100 })}
            />
          </label>
        </div>
      </section>

      <section className="card">
        <h2>Khác</h2>
        <label className="checkbox">
          <input
            type="checkbox"
            checked={settings.minimizeToTray}
            onChange={(e) => void patchSettings({ minimizeToTray: e.target.checked })}
          />
          Đóng cửa sổ = thu nhỏ xuống khay hệ thống (vẫn dịch tiếp)
        </label>
        <p className="hint">
          Phím tắt toàn cục: {INCOMING_TOGGLE_SHORTCUT.replace('CommandOrControl', 'Ctrl')} bật/tắt
          chiều về · Ctrl+Space giữ-để-nói chiều đi · Ctrl+Shift+O khoá overlay.
        </p>
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
  )
}
