import { app, dialog, ipcMain, type BrowserWindow } from 'electron'
import { writeFileSync } from 'node:fs'
import { IPC } from '../shared/ipc-contract'
import type { Updater } from './updater'
import type {
  AppSettings,
  AudioInputDeviceInfo,
  AudioOutputDeviceInfo,
  ExportFormat,
  PlaybackSinkState
} from '../shared/types'
import {
  listWindowsOutputDevices,
  setWindowsDefaultOutputDevice
} from './audio/windows-default-device'
import type { DebugRecorder } from './debug-recorder'
import type { SessionManager } from './gemini/session-manager'
import { hasApiKey, setApiKey } from './secrets'
import type { SettingsStore } from './settings'
import type { SubtitleStore } from './subtitles/store'
import { startEngineCapture, stopEngineCapture } from './windows'

export interface IpcContext {
  settings: SettingsStore
  store: SubtitleStore
  sessions: SessionManager
  outgoing: SessionManager
  debug: DebugRecorder
  updater: Updater
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

  ipcMain.handle(IPC.sessionStart, () => ctx.sessions.start())
  ipcMain.handle(IPC.sessionStop, () => ctx.sessions.stop())

  ipcMain.handle(IPC.outgoingStart, () => ctx.outgoing.start())
  ipcMain.handle(IPC.outgoingStop, () => ctx.outgoing.stop())
  ipcMain.handle(IPC.outgoingPtt, (_e, active: boolean) => ctx.outgoing.setPushToTalk(active))

  ipcMain.handle(IPC.appGetVersion, () => app.getVersion())
  ipcMain.handle(IPC.updateCheck, () => ctx.updater.check())
  ipcMain.handle(IPC.updateInstall, () => ctx.updater.install())

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
