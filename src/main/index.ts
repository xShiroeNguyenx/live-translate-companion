import { app, globalShortcut, type BrowserWindow } from 'electron'
import { join } from 'node:path'
import { OUTGOING_PTT_SHORTCUT, OVERLAY_TOGGLE_SHORTCUT } from '../shared/constants'
import { IPC } from '../shared/ipc-contract'
import type { AppSettings, UpdateStatus } from '../shared/types'
import { DebugRecorder } from './debug-recorder'
import { SdkLiveClient } from './gemini/client'
import { RawWsLiveClient } from './gemini/raw-ws-client'
import { SessionManager } from './gemini/session-manager'
import { registerIpc } from './ipc'
import { getApiKey } from './secrets'
import { SettingsStore } from './settings'
import { TranscriptAutoSaver, type AutoSaveConfig } from './subtitles/autosave'
import { SubtitleStore } from './subtitles/store'
import { initUpdater } from './updater'
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

    const getAutoSaveDir = (): string =>
      settings.get().autoSaveDir || join(app.getPath('documents'), 'LiveTranslate')
    const autoSaveConfig = (): AutoSaveConfig => {
      const s = settings.get()
      return { enabled: s.autoSaveEnabled, format: s.autoSaveFormat, dir: getAutoSaveDir() }
    }

    const store = new SubtitleStore((update) => {
      broadcast(IPC.evSubtitleUpdate, update)
      incomingSaver.onUpdate(update)
    })
    const incomingSaver = new TranscriptAutoSaver({
      exportAs: (format) => store.export(format),
      getConfig: autoSaveConfig,
      suffix: 'chieu-ve'
    })

    const sessions = new SessionManager([new SdkLiveClient(), new RawWsLiveClient()], store, {
      getApiKey: () => getApiKey(),
      getTargetLanguage: () => settings.get().targetLanguage,
      getVadThresholdDb: () => settings.get().vadThresholdDb,
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

    sessions.on('state', (info) => {
      broadcast(IPC.evSessionState, info)
      if (info.state === 'idle' || info.state === 'error') incomingSaver.flush()
    })
    sessions.on('metrics', (m) => {
      if (!control.isDestroyed()) control.webContents.send(IPC.evMetricsUpdate, m)
    })

    // ── Chiều đi: nói tiếng Việt → giọng đích vào meeting qua CABLE Input ──
    const sendToControl = (channel: string, payload: unknown): void => {
      if (!control.isDestroyed()) control.webContents.send(channel, payload)
    }
    const outgoingStore = new SubtitleStore((update) => {
      sendToControl(IPC.evOutgoingSubtitle, update)
      outgoingSaver.onUpdate(update)
    })
    const outgoingSaver = new TranscriptAutoSaver({
      exportAs: (format) => outgoingStore.export(format),
      getConfig: autoSaveConfig,
      suffix: 'chieu-di'
    })
    const outgoing = new SessionManager([new SdkLiveClient(), new RawWsLiveClient()], outgoingStore, {
      getApiKey: () => getApiKey(),
      getTargetLanguage: () => settings.get().outgoingTargetLanguage,
      getVadThresholdDb: () => settings.get().outgoingVadThresholdDb,
      getGateMode: () => settings.get().outgoingMode,
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
    outgoing.on('state', (info) => sendToControl(IPC.evOutgoingState, info))
    outgoing.on('metrics', (m) => sendToControl(IPC.evOutgoingMetrics, m))

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
      if (info.state === 'idle' || info.state === 'error') outgoingSaver.flush()
      sendOutgoingConfigIfChanged()
      syncPttShortcut()
    })

    settings.on('change', (s: AppSettings) => {
      broadcast(IPC.evSettingsChanged, s)
      applyOverlaySettings(s)
      sendPlaybackConfig(s)
      sendOutgoingConfig(s)
      syncPttShortcut()
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
      debug,
      updater,
      getAutoSaveDir,
      controlWindow: control,
      engineWindow: engine
    })

    globalShortcut.register(OVERLAY_TOGGLE_SHORTCUT, () => {
      settings.set({ overlayClickThrough: !settings.get().overlayClickThrough })
    })

    // thoát kiểu nào (cài update, Alt+F4…) cũng ghi nốt phần chưa lưu
    app.on('before-quit', () => {
      incomingSaver.flush()
      outgoingSaver.flush()
    })

    control.on('closed', () => {
      void Promise.allSettled([sessions.stop(), outgoing.stop()]).finally(() => app.quit())
    })
  })

  app.on('second-instance', () => {
    if (controlWindow && !controlWindow.isDestroyed()) {
      if (controlWindow.isMinimized()) controlWindow.restore()
      controlWindow.focus()
    }
  })

  app.on('will-quit', () => globalShortcut.unregisterAll())
  app.on('window-all-closed', () => app.quit())
} else {
  app.quit()
}
