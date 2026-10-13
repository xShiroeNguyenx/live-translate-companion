import { app, globalShortcut, Notification, type BrowserWindow } from 'electron'
import { join } from 'node:path'
import {
  BUDGET_WARN_RATIO,
  INCOMING_TOGGLE_SHORTCUT,
  OUTGOING_PTT_SHORTCUT,
  OVERLAY_TOGGLE_SHORTCUT,
  SUMMARY_MIN_CHARS
} from '../shared/constants'
import { IPC } from '../shared/ipc-contract'
import type {
  AppSettings,
  SessionDirection,
  UpdateStatus,
  UsageSummary
} from '../shared/types'
import { DebugRecorder } from './debug-recorder'
import { buildContextInstruction, SdkLiveClient } from './gemini/client'
import { RawWsLiveClient } from './gemini/raw-ws-client'
import { SessionManager } from './gemini/session-manager'
import { HistoryStore } from './history/history-store'
import { registerIpc } from './ipc'
import { KeywordNotifier } from './keyword-notifier'
import { getApiKey } from './secrets'
import { SettingsStore } from './settings'
import { SummaryService } from './summary/summary-service'
import {
  TranscriptAutoSaver,
  type AutoSaveConfig,
  type AutoSaveSession
} from './subtitles/autosave'
import { SubtitleStore } from './subtitles/store'
import { AppTray } from './tray'
import { initUpdater } from './updater'
import { UsageTracker } from './usage/usage-tracker'
import {
  createControlWindow,
  createEngineWindow,
  createOverlayWindow,
  installLoopbackHandler,
  startEngineCapture,
  startEngineMic,
  stopEngineCapture,
  stopEngineMic
} from './windows'

const gotLock = app.requestSingleInstanceLock()
if (gotLock) {
  let controlWindow: BrowserWindow | null = null
  // true khi đang thoát thật (menu tray, cài update…) — lúc đó không chặn close để ẩn xuống tray
  let quitting = false

  app.setAppUserModelId('com.nguyenkhanh.livetranslatecompanion')

  app.whenReady().then(() => {
    installLoopbackHandler()

    const settings = new SettingsStore()
    const control = createControlWindow()
    const overlay = createOverlayWindow()
    const engine = createEngineWindow()
    controlWindow = control

    const broadcast = (channel: string, payload: unknown): void => {
      for (const win of [control, overlay]) {
        if (!win.isDestroyed()) win.webContents.send(channel, payload)
      }
    }
    const sendToControl = (channel: string, payload: unknown): void => {
      if (!control.isDestroyed()) control.webContents.send(channel, payload)
    }

    const showWindow = (): void => {
      if (control.isDestroyed()) return
      if (control.isMinimized()) control.restore()
      control.show()
      control.focus()
    }

    const notify = (title: string, body: string): void => {
      if (!Notification.isSupported()) return
      const n = new Notification({ title, body })
      n.on('click', showWindow)
      n.show()
    }

    // ── Lịch sử + tự lưu ──
    const history = new HistoryStore(join(app.getPath('userData'), 'history'))
    const getAutoSaveDir = (): string =>
      settings.get().autoSaveDir || join(app.getPath('documents'), 'LiveTranslate')
    const autoSaveConfig = (): AutoSaveConfig => {
      const s = settings.get()
      return { enabled: s.autoSaveEnabled, format: s.autoSaveFormat, dir: getAutoSaveDir() }
    }
    const contextInstruction = (): string | undefined =>
      buildContextInstruction(settings.get().meetingContext)

    // ghi bản ghi lịch sử mỗi lần file transcript được ghi
    const recordHistory = (
      direction: SessionDirection,
      session: AutoSaveSession,
      manager: SessionManager,
      subtitles: SubtitleStore,
      targetLanguage: string
    ): void => {
      const m = manager.getMetrics()
      history.upsert({
        id: session.id,
        direction,
        startedAt: manager.getStartedAt() || session.startedAt,
        endedAt: Date.now(),
        targetLanguage,
        secondsSent: m.secondsSent,
        costUsd: m.estimatedCostUsd,
        transcriptFile: session.transcriptFile,
        segments: subtitles.history()
      })
    }

    const keywordNotifier = new KeywordNotifier(
      () => settings.get().highlightKeywords,
      (keyword, text) => {
        if (control.isFocused()) return
        notify(`🔔 Nhắc tới “${keyword}”`, text.slice(0, 200))
      }
    )

    const store = new SubtitleStore((update) => {
      broadcast(IPC.evSubtitleUpdate, update)
      incomingSaver.onUpdate(update)
      keywordNotifier.onUpdate(update)
    })
    const incomingSaver = new TranscriptAutoSaver({
      exportAs: (format) => store.export(format),
      getConfig: autoSaveConfig,
      suffix: 'chieu-ve',
      onFlush: (session) =>
        recordHistory('incoming', session, sessions, store, settings.get().targetLanguage)
    })

    const sessions = new SessionManager([new SdkLiveClient(), new RawWsLiveClient()], store, {
      getApiKey: () => getApiKey(),
      getTargetLanguage: () => settings.get().targetLanguage,
      getVadThresholdDb: () => settings.get().vadThresholdDb,
      getSystemInstruction: contextInstruction,
      startCapture: () => startEngineCapture(engine),
      stopCapture: () => stopEngineCapture(engine),
      onPlaybackChunk: (pcm) => {
        if (!settings.get().playbackEnabled || engine.isDestroyed()) return
        engine.webContents.send(
          IPC.evPlaybackChunk,
          pcm.buffer.slice(pcm.byteOffset, pcm.byteOffset + pcm.byteLength)
        )
      },
      onPlaybackFlush: () => {
        if (!engine.isDestroyed()) engine.webContents.send(IPC.evPlaybackFlush)
      }
    })

    // ── Chiều đi: nói tiếng Việt → giọng đích vào meeting qua CABLE Input ──
    const outgoingStore = new SubtitleStore((update) => {
      sendToControl(IPC.evOutgoingSubtitle, update)
      outgoingSaver.onUpdate(update)
    })
    const outgoingSaver = new TranscriptAutoSaver({
      exportAs: (format) => outgoingStore.export(format),
      getConfig: autoSaveConfig,
      suffix: 'chieu-di',
      onFlush: (session) =>
        recordHistory(
          'outgoing',
          session,
          outgoing,
          outgoingStore,
          settings.get().outgoingTargetLanguage
        )
    })
    const outgoing = new SessionManager([new SdkLiveClient(), new RawWsLiveClient()], outgoingStore, {
      getApiKey: () => getApiKey(),
      getTargetLanguage: () => settings.get().outgoingTargetLanguage,
      getVadThresholdDb: () => settings.get().outgoingVadThresholdDb,
      getGateMode: () => settings.get().outgoingMode,
      getSystemInstruction: contextInstruction,
      startCapture: () => startEngineMic(engine, settings.get().micDeviceId),
      stopCapture: () => stopEngineMic(engine),
      onPlaybackChunk: (pcm) => {
        if (engine.isDestroyed()) return
        engine.webContents.send(
          IPC.evMicPlaybackChunk,
          pcm.buffer.slice(pcm.byteOffset, pcm.byteOffset + pcm.byteLength)
        )
      },
      onPlaybackFlush: () => {
        if (!engine.isDestroyed()) engine.webContents.send(IPC.evMicPlaybackFlush)
      }
    })

    // ── Tóm tắt cuộc họp ──
    const summary = new SummaryService({
      history,
      getApiKey: () => getApiKey(),
      getSettings: () => settings.get(),
      fallbackDir: getAutoSaveDir
    })
    summary.on('status', (status) => {
      sendToControl(IPC.evSummaryStatus, status)
      if (status.state === 'done' && !control.isFocused()) {
        notify('📝 Đã tóm tắt cuộc họp', 'Mở tab Lịch sử để xem.')
      }
    })
    history.on('change', () => sendToControl(IPC.evHistoryChanged, null))

    const maybeAutoSummarize = (): void => {
      const s = settings.get()
      const id = incomingSaver.currentSession?.id
      if (!s.autoSummary || !s.autoSaveEnabled || !id) return
      const chars = store.history().reduce((n, seg) => n + seg.target.text.trim().length, 0)
      if (chars < SUMMARY_MIN_CHARS) return
      void summary.summarize(id)
    }

    // ── Chi phí + giới hạn tháng ──
    const usage = new UsageTracker(join(app.getPath('userData'), 'usage.json'))
    const usageSummary = (): UsageSummary => ({
      todayUsd: usage.today(),
      monthUsd: usage.month(),
      budgetUsd: settings.get().monthlyBudgetUsd
    })
    const budgetError = (): string | null => {
      const budget = settings.get().monthlyBudgetUsd
      if (budget > 0 && usage.month() >= budget) {
        return `Đã chạm giới hạn chi phí tháng ($${budget.toFixed(2)}). Tăng giới hạn trong Cài đặt để tiếp tục.`
      }
      return null
    }
    let warnedMonth = ''
    const checkBudget = (): void => {
      const budget = settings.get().monthlyBudgetUsd
      if (budget <= 0) return
      const spent = usage.month()
      const err = budgetError()
      if (err) {
        if (sessions.isStarted() || outgoing.isStarted()) {
          if (sessions.isStarted()) void sessions.stop('error', err)
          if (outgoing.isStarted()) void outgoing.stop('error', err)
          notify('⛔ Đã dừng dịch', err)
        }
      } else if (spent >= budget * BUDGET_WARN_RATIO && warnedMonth !== usage.monthKey()) {
        warnedMonth = usage.monthKey()
        notify(
          '⚠ Sắp chạm giới hạn chi phí',
          `Đã dùng $${spent.toFixed(2)} / $${budget.toFixed(2)} trong tháng này.`
        )
      }
    }
    const onMetrics = (direction: SessionDirection, cost: number): void => {
      usage.record(direction, cost)
      sendToControl(IPC.evUsageUpdate, usageSummary())
      checkBudget()
    }

    const guardedStart = async (
      manager: SessionManager
    ): Promise<{ ok: boolean; error?: string }> => {
      const err = budgetError()
      if (err) return { ok: false, error: err }
      return manager.start()
    }
    const startIncoming = (): Promise<{ ok: boolean; error?: string }> => guardedStart(sessions)
    const startOutgoing = (): Promise<{ ok: boolean; error?: string }> => guardedStart(outgoing)

    // dùng cho tray + phím tắt (không có UI để hiện lỗi → báo bằng notification)
    const toggle = async (manager: SessionManager, start: typeof startIncoming): Promise<void> => {
      if (manager.isStarted()) {
        await manager.stop()
        return
      }
      const result = await start()
      if (!result.ok) notify('Không bắt đầu được', result.error ?? 'Lỗi không rõ')
    }

    // ── Tray ──
    const tray = new AppTray(
      () => ({
        incomingRunning: sessions.isStarted(),
        outgoingRunning: outgoing.isStarted(),
        overlayVisible: settings.get().overlayVisible
      }),
      {
        showWindow,
        toggleIncoming: () => void toggle(sessions, startIncoming),
        toggleOutgoing: () => void toggle(outgoing, startOutgoing),
        toggleOverlay: () => {
          settings.set({ overlayVisible: !settings.get().overlayVisible })
        },
        quit: () => {
          quitting = true
          app.quit()
        }
      }
    )

    sessions.on('state', (info) => {
      broadcast(IPC.evSessionState, info)
      if (info.state === 'idle' || info.state === 'error') {
        incomingSaver.flush()
        usage.flush()
        maybeAutoSummarize()
      }
      tray.refresh()
    })
    sessions.on('metrics', (m) => {
      sendToControl(IPC.evMetricsUpdate, m)
      onMetrics('incoming', m.estimatedCostUsd)
    })

    const debug = new DebugRecorder({
      isCaptureNeededBySession: () => sessions.isStarted(),
      startCapture: () => startEngineCapture(engine),
      stopCapture: () => stopEngineCapture(engine),
      outPath: () => join(app.getPath('userData'), 'capture-test.wav')
    })

    const applyOverlaySettings = (s: AppSettings): void => {
      if (overlay.isDestroyed()) return
      overlay.setIgnoreMouseEvents(s.overlayClickThrough, { forward: true })
      if (s.overlayVisible && !overlay.isVisible()) overlay.showInactive()
      if (!s.overlayVisible && overlay.isVisible()) overlay.hide()
    }

    const sendPlaybackConfig = (s: AppSettings): void => {
      if (engine.isDestroyed()) return
      engine.webContents.send(IPC.evPlaybackConfig, {
        enabled: s.playbackEnabled,
        deviceId: s.playbackDeviceId,
        deviceLabel: s.playbackDeviceLabel,
        monitorEnabled: s.monitorEnabled
      })
    }

    // CABLE player chỉ phát khi phiên chiều đi đang chạy
    const sendOutgoingConfig = (s: AppSettings): void => {
      if (engine.isDestroyed()) return
      engine.webContents.send(IPC.evOutgoingConfig, {
        enabled: outgoing.isStarted(),
        deviceId: s.outgoingDeviceId,
        deviceLabel: s.outgoingDeviceLabel
      })
    }

    // Tránh re-route sink mỗi lần PTT lật streaming↔gated: chỉ gửi config khi bật/tắt thật sự đổi
    let lastOutgoingEnabled = false
    const sendOutgoingConfigIfChanged = (): void => {
      if (outgoing.isStarted() === lastOutgoingEnabled) return
      lastOutgoingEnabled = outgoing.isStarted()
      sendOutgoingConfig(settings.get())
    }

    // PTT toàn cục chỉ sống khi chiều đi đang chạy ở chế độ push-to-talk
    const syncPttShortcut = (): void => {
      const want = outgoing.isStarted() && settings.get().outgoingMode === 'ptt'
      const registered = globalShortcut.isRegistered(OUTGOING_PTT_SHORTCUT)
      if (want && !registered) {
        const ok = globalShortcut.register(OUTGOING_PTT_SHORTCUT, () => outgoing.togglePushToTalk())
        if (!ok) console.warn('Không đăng ký được phím PTT toàn cục (có thể bị app khác chiếm)')
      } else if (!want && registered) {
        globalShortcut.unregister(OUTGOING_PTT_SHORTCUT)
      }
    }

    outgoing.on('state', (info) => {
      sendToControl(IPC.evOutgoingState, info)
      if (info.state === 'idle' || info.state === 'error') {
        outgoingSaver.flush()
        usage.flush()
      }
      sendOutgoingConfigIfChanged()
      syncPttShortcut()
      tray.refresh()
    })
    outgoing.on('metrics', (m) => {
      sendToControl(IPC.evOutgoingMetrics, m)
      onMetrics('outgoing', m.estimatedCostUsd)
    })

    settings.on('change', (s: AppSettings) => {
      broadcast(IPC.evSettingsChanged, s)
      applyOverlaySettings(s)
      sendPlaybackConfig(s)
      sendOutgoingConfig(s)
      syncPttShortcut()
      sendToControl(IPC.evUsageUpdate, usageSummary())
      tray.refresh()
    })

    engine.webContents.on('did-finish-load', () => {
      sendPlaybackConfig(settings.get())
      sendOutgoingConfig(settings.get())
    })
    applyOverlaySettings(settings.get())

    // lưu trạng thái cập nhật gần nhất để gửi lại khi control window load xong / mở lại
    let lastUpdateStatus: UpdateStatus = { state: 'idle' }
    const updater = initUpdater((status) => {
      lastUpdateStatus = status
      sendToControl(IPC.evUpdateStatus, status)
    })
    control.webContents.on('did-finish-load', () => {
      sendToControl(IPC.evUpdateStatus, lastUpdateStatus)
    })
    // tự kiểm tra cập nhật sau khi app ổn định (no-op khi chạy dev chưa đóng gói)
    setTimeout(() => updater.check(), 4000)

    registerIpc({
      settings,
      store,
      sessions,
      outgoing,
      startIncoming,
      startOutgoing,
      debug,
      updater,
      history,
      summary,
      usageSummary,
      getAutoSaveDir,
      controlWindow: control,
      engineWindow: engine
    })

    globalShortcut.register(OVERLAY_TOGGLE_SHORTCUT, () => {
      settings.set({ overlayClickThrough: !settings.get().overlayClickThrough })
    })
    if (!globalShortcut.register(INCOMING_TOGGLE_SHORTCUT, () => void toggle(sessions, startIncoming))) {
      console.warn('Không đăng ký được phím bật/tắt chiều về (có thể bị app khác chiếm)')
    }

    // thoát kiểu nào (tray, cài update, tắt cửa sổ khi không dùng tray…) cũng ghi nốt phần chưa lưu
    app.on('before-quit', () => {
      quitting = true
      incomingSaver.flush()
      outgoingSaver.flush()
      usage.flush()
    })

    // đóng cửa sổ = ẩn xuống tray (nếu bật), phiên dịch vẫn chạy
    let trayHintShown = false
    control.on('close', (e) => {
      if (quitting || !settings.get().minimizeToTray) return
      e.preventDefault()
      control.hide()
      if (!trayHintShown) {
        trayHintShown = true
        tray.balloon(
          'Live Translate vẫn đang chạy',
          'App đã thu nhỏ xuống khay hệ thống. Chuột phải icon để thoát.'
        )
      }
    })

    control.on('closed', () => {
      tray.destroy()
      void Promise.allSettled([sessions.stop(), outgoing.stop()]).finally(() => app.quit())
    })
  })

  app.on('second-instance', () => {
    if (controlWindow && !controlWindow.isDestroyed()) {
      if (controlWindow.isMinimized()) controlWindow.restore()
      controlWindow.show()
      controlWindow.focus()
    }
  })

  app.on('will-quit', () => globalShortcut.unregisterAll())
  app.on('window-all-closed', () => app.quit())
} else {
  app.quit()
}
