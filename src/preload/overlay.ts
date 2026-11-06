import { contextBridge, ipcRenderer } from 'electron'
import type { OverlayApi } from '../shared/ipc-contract'
import type { AppSettings, SessionStateInfo, SubtitleUpdate } from '../shared/types'

// Tên channel viết literal — xem ghi chú trong control.ts. Phải khớp src/shared/ipc-contract.ts.

function subscribe<T>(channel: string, cb: (payload: T) => void): () => void {
  const listener = (_e: Electron.IpcRendererEvent, payload: T): void => cb(payload)
  ipcRenderer.on(channel, listener)
  return () => ipcRenderer.removeListener(channel, listener)
}

const api: OverlayApi = {
  getSettings: () => ipcRenderer.invoke('settings:get'),
  onSessionState: (cb: (s: SessionStateInfo) => void) => subscribe('session:state', cb),
  onSubtitleUpdate: (cb: (u: SubtitleUpdate) => void) => subscribe('subtitle:update', cb),
  onSettingsChanged: (cb: (s: AppSettings) => void) => subscribe('settings:changed', cb)
}

contextBridge.exposeInMainWorld('overlayApi', api)
