import { app, clipboard, dialog, ipcMain, shell, type BrowserWindow } from 'electron'
import { existsSync, mkdirSync, writeFileSync } from 'node:fs'
import { IPC, type ListLiveModelsResult } from '../shared/ipc-contract'
import type { Updater } from './updater'
import type {
  AppSettings,
  AudioInputDeviceInfo,
  AudioOutputDeviceInfo,
  ExportFormat,
  PlaybackSinkState,
  UsageSummary
} from '../shared/types'
import {
  listWindowsOutputDevices,
  setWindowsDefaultOutputDevice
} from './audio/windows-default-device'
import type { AssistantService } from './assistant/assistant-service'
import type { DebugRecorder } from './debug-recorder'
import type { HistoryStore } from './history/history-store'
import type { MeetingTitleTracker } from './history/meeting-title-tracker'
import type { TypedSpeechService } from './outgoing/typed-speech'
import type { SummaryService } from './summary/summary-service'
import type { SessionManager } from './gemini/session-manager'
import { listLiveModels } from './gemini/model-list'
import { getApiKey, hasApiKey, setApiKey } from './secrets'
import type { SettingsStore } from './settings'
import type { SubtitleStore } from './subtitles/store'
import { startEngineCapture, stopEngineCapture } from './windows'

export interface IpcContext {
  settings: SettingsStore
  store: SubtitleStore
  sessions: SessionManager
  outgoing: SessionManager
  // start có kiểm tra giới hạn chi phí tháng
  startIncoming(): Promise<{ ok: boolean; error?: string }>
  startOutgoing(): Promise<{ ok: boolean; error?: string }>
  resumeIncoming(): { ok: boolean; error?: string }
  resumeOutgoing(): { ok: boolean; error?: string }
  summarizeCurrent(): Promise<{ ok: boolean; error?: string }>
  history: HistoryStore
  summary: SummaryService
  meetingTitle: MeetingTitleTracker
  // tên cuộc họp hiện tại (ghi vào các phiên đang chạy)
  setMeetingTitle(title: unknown): string
  renameHistory(id: unknown, title: unknown): boolean
  assistant: AssistantService
  typedSpeech: TypedSpeechService
  removeOutgoingSegment(id: unknown): boolean
  usageSummary(): UsageSummary
  debug: DebugRecorder
  updater: Updater
  getAutoSaveDir: () => string
  controlWindow: BrowserWindow
  engineWindow: BrowserWindow
}

const EXPORT_FILTERS: Record<ExportFormat, Electron.FileFilter[]> = {
  txt: [{ name: 'Text', extensions: ['txt'] }],
  srt: [{ name: 'SubRip subtitle', extensions: ['srt'] }],
  md: [{ name: 'Markdown', extensions: ['md'] }]
}

export function registerIpc(ctx: IpcContext): void {
  ipcMain.handle(IPC.settingsGet, () => ctx.settings.get())
  ipcMain.handle(IPC.settingsSet, (_e, patch: Partial<AppSettings>) => ctx.settings.set(patch))

  ipcMain.handle(IPC.secretsSetApiKey, (_e, key: string) => setApiKey(key))
  ipcMain.handle(IPC.secretsHasApiKey, () => hasApiKey())

  ipcMain.handle(IPC.sessionStart, () => ctx.startIncoming())
  ipcMain.handle(IPC.sessionStop, () => ctx.sessions.stop())
  ipcMain.handle(IPC.sessionPause, () => ctx.sessions.pause())
  ipcMain.handle(IPC.sessionResume, () => ctx.resumeIncoming())

  ipcMain.handle(IPC.outgoingStart, () => ctx.startOutgoing())
  ipcMain.handle(IPC.outgoingStop, () => ctx.outgoing.stop())
  ipcMain.handle(IPC.outgoingPtt, (_e, active: boolean) => ctx.outgoing.setPushToTalk(active))
  ipcMain.handle(IPC.outgoingPause, () => ctx.outgoing.pause())
  ipcMain.handle(IPC.outgoingResume, () => ctx.resumeOutgoing())

  ipcMain.handle(IPC.outgoingRemoveSegment, (_e, id: unknown) => ctx.removeOutgoingSegment(id))
  ipcMain.handle(IPC.typedTranslate, (_e, text: unknown) => ctx.typedSpeech.translate(text))
  ipcMain.handle(IPC.typedPrepare, (_e, text: unknown) => ctx.typedSpeech.prepare(text))
  ipcMain.handle(IPC.typedSpeak, (_e, text: unknown, source: unknown, replay: unknown) =>
    ctx.typedSpeech.speak(text, source, replay)
  )
  ipcMain.handle(IPC.typedStop, () => ctx.typedSpeech.stop())
  ipcMain.handle(IPC.typedGetState, () => ctx.typedSpeech.getState())

  ipcMain.handle(IPC.appGetVersion, () => app.getVersion())
  ipcMain.handle(IPC.updateCheck, () => ctx.updater.check())
  ipcMain.handle(IPC.updateInstall, () => ctx.updater.install())

  ipcMain.handle(IPC.autoSaveGetDir, () => ctx.getAutoSaveDir())
  ipcMain.handle(IPC.autoSavePickDir, async () => {
    const { canceled, filePaths } = await dialog.showOpenDialog(ctx.controlWindow, {
      title: 'Chọn thư mục tự lưu transcript',
      defaultPath: ctx.getAutoSaveDir(),
      properties: ['openDirectory', 'createDirectory']
    })
    if (canceled || !filePaths[0]) return null
    ctx.settings.set({ autoSaveDir: filePaths[0] })
    return filePaths[0]
  })
  ipcMain.handle(IPC.autoSaveOpenDir, async () => {
    const dir = ctx.getAutoSaveDir()
    mkdirSync(dir, { recursive: true })
    await shell.openPath(dir)
  })

  ipcMain.handle(IPC.historyList, (_e, query: string) => ctx.history.list(query ?? ''))
  ipcMain.handle(IPC.historyGet, (_e, id: string) => ctx.history.get(id))
  ipcMain.handle(IPC.historyDelete, (_e, id: string) => ctx.history.delete(id))
  ipcMain.handle(IPC.historySummarize, (_e, id: string) => ctx.summary.summarize(id))
  ipcMain.handle(IPC.historySummarizeCurrent, () => ctx.summarizeCurrent())
  ipcMain.handle(IPC.historyRename, (_e, id: unknown, title: unknown) =>
    ctx.renameHistory(id, title)
  )
  ipcMain.handle(IPC.meetingGetTitle, () => ctx.meetingTitle.get())
  ipcMain.handle(IPC.meetingSetTitle, (_e, title: unknown) => ctx.setMeetingTitle(title))
  // mở theo id (không nhận đường dẫn từ renderer) — chỉ mở được file của chính bản ghi
  ipcMain.handle(IPC.historyOpenFile, async (_e, id: string, kind: 'transcript' | 'summary') => {
    const rec = ctx.history.get(id)
    const file = kind === 'summary' ? rec?.summaryFile : rec?.transcriptFile
    if (file && existsSync(file)) await shell.openPath(file)
  })
  ipcMain.handle(IPC.usageGet, () => ctx.usageSummary())

  ipcMain.handle(IPC.assistantAsk, (_e, question: unknown, previous: unknown) =>
    ctx.assistant.ask(question, previous)
  )
  ipcMain.handle(IPC.assistantReplies, () => ctx.assistant.suggestReplies())
  ipcMain.handle(IPC.historyAsk, (_e, id: unknown, question: unknown, previous: unknown) =>
    ctx.assistant.askHistory(id, question, previous)
  )
  ipcMain.handle(IPC.clipboardWrite, (_e, text: unknown) => {
    if (typeof text === 'string') clipboard.writeText(text.slice(0, 10_000))
  })

  ipcMain.handle(IPC.modelsListLive, async (): Promise<ListLiveModelsResult> => {
    const apiKey = getApiKey()
    if (!apiKey) return { ok: false, models: [], error: 'Chưa cấu hình Gemini API key' }
    const apiVersion = ctx.settings.get().apiVersion
    try {
      const models = await listLiveModels(apiKey, apiVersion)
      if (models.length === 0) {
        return {
          ok: false,
          models,
          error: `API key này không thấy model dịch Live nào trên ${apiVersion}`
        }
      }
      return { ok: true, models }
    } catch (err) {
      return { ok: false, models: [], error: err instanceof Error ? err.message : String(err) }
    }
  })

  ipcMain.handle(IPC.transcriptExport, async (_e, format: ExportFormat) => {
    const content = ctx.store.export(format)
    if (!content) return null
    const stamp = new Date().toISOString().slice(0, 19).replace(/[T:]/g, '-')
    const { canceled, filePath } = await dialog.showSaveDialog(ctx.controlWindow, {
      title: 'Xuất transcript',
      defaultPath: `transcript-${stamp}.${format}`,
      filters: EXPORT_FILTERS[format]
    })
    if (canceled || !filePath) return null
    writeFileSync(filePath, content, 'utf-8')
    return filePath
  })

  ipcMain.handle(IPC.overlaySetClickThrough, (_e, on: boolean) => {
    ctx.settings.set({ overlayClickThrough: on })
  })
  ipcMain.handle(IPC.overlaySetVisible, (_e, visible: boolean) => {
    ctx.settings.set({ overlayVisible: visible })
  })

  ipcMain.handle(IPC.debugRecordWav, (_e, seconds: number) => ctx.debug.record(seconds))

  ipcMain.on(IPC.audioChunk, (_e, pcm: ArrayBuffer, rmsDb: number, ts: number) => {
    ctx.debug.tap(pcm)
    ctx.sessions.handleFrame(pcm, rmsDb, ts)
  })

  ipcMain.on(IPC.captureError, (_e, message: string) => {
    console.error('Capture lỗi từ engine:', message)
    ctx.sessions.handleCaptureError(message)
  })

  ipcMain.on(IPC.micChunk, (_e, pcm: ArrayBuffer, rmsDb: number, ts: number) => {
    ctx.outgoing.handleFrame(pcm, rmsDb, ts)
  })

  ipcMain.on(IPC.micCaptureError, (_e, message: string) => {
    console.error('Mic lỗi từ engine:', message)
    ctx.outgoing.handleCaptureError(message)
  })

  // Danh sách thiết bị do ENGINE enumerate (deviceId chỉ hợp lệ trong document đó)
  let outputDevices: AudioOutputDeviceInfo[] = []
  ipcMain.handle(IPC.devicesGetOutputs, () => outputDevices)
  ipcMain.on(IPC.outputDevices, (_e, devices: AudioOutputDeviceInfo[]) => {
    outputDevices = devices
    if (!ctx.controlWindow.isDestroyed()) {
      ctx.controlWindow.webContents.send(IPC.evOutputDevices, devices)
    }
  })

  let inputDevices: AudioInputDeviceInfo[] = []
  ipcMain.handle(IPC.devicesGetInputs, () => inputDevices)
  ipcMain.on(IPC.inputDevices, (_e, devices: AudioInputDeviceInfo[]) => {
    inputDevices = devices
    if (!ctx.controlWindow.isDestroyed()) {
      ctx.controlWindow.webContents.send(IPC.evInputDevices, devices)
    }
  })

  ipcMain.handle(IPC.devicesGetWindowsOutputs, async () => {
    try {
      return await listWindowsOutputDevices()
    } catch (err) {
      console.error('Không liệt kê được thiết bị Windows:', err)
      return []
    }
  })

  ipcMain.handle(IPC.devicesSetWindowsDefault, async (_e, deviceId: string) => {
    try {
      await setWindowsDefaultOutputDevice(deviceId)
    } catch (err) {
      return { ok: false, error: err instanceof Error ? err.message : String(err) }
    }
    // loopback đang thu thiết bị mặc định CŨ — mở lại stream để bám theo thiết bị mới
    if (ctx.sessions.isStarted() && !ctx.engineWindow.isDestroyed()) {
      try {
        await stopEngineCapture(ctx.engineWindow)
        await startEngineCapture(ctx.engineWindow)
      } catch (err) {
        ctx.sessions.handleCaptureError(err instanceof Error ? err.message : String(err))
      }
    }
    // nhắc engine enumerate lại + tính lại cờ "bị thu ngược" của sink TTS
    if (!ctx.engineWindow.isDestroyed()) {
      ctx.engineWindow.webContents.send(IPC.evDevicesRefresh)
    }
    return { ok: true }
  })

  ipcMain.on(IPC.playbackSinkState, (_e, state: PlaybackSinkState) => {
    // engine resolve sink theo label (id lưu trữ đã hỏng vì salt đổi) → ghi lại id mới.
    // Vòng settings→engine→sinkState dừng lại vì lần sau id/label đã khớp.
    const current = ctx.settings.get()
    if (
      state.ok &&
      state.deviceId &&
      state.label &&
      (state.deviceId !== current.playbackDeviceId || state.label !== current.playbackDeviceLabel)
    ) {
      ctx.settings.set({ playbackDeviceId: state.deviceId, playbackDeviceLabel: state.label })
    }
    if (!ctx.controlWindow.isDestroyed()) {
      ctx.controlWindow.webContents.send(IPC.evPlaybackSinkState, state)
    }
  })

  ipcMain.on(IPC.outgoingSinkState, (_e, state: PlaybackSinkState) => {
    // tìm lại CABLE Input theo label khi id đã hỏng — ghi id mới để lần sau khớp ngay
    const current = ctx.settings.get()
    if (
      state.ok &&
      state.deviceId &&
      state.label &&
      (state.deviceId !== current.outgoingDeviceId || state.label !== current.outgoingDeviceLabel)
    ) {
      ctx.settings.set({ outgoingDeviceId: state.deviceId, outgoingDeviceLabel: state.label })
    }
    if (!ctx.controlWindow.isDestroyed()) {
      ctx.controlWindow.webContents.send(IPC.evOutgoingSinkState, state)
    }
  })
}
