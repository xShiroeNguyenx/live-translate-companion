import { app } from 'electron'
import electronUpdater from 'electron-updater'
import type { UpdateStatus } from '../shared/types'

const { autoUpdater } = electronUpdater

export interface Updater {
  check(): void
  install(): void
}

// Tự cập nhật qua electron-updater. Provider github lấy từ publish trong electron-builder.yml
// (electron-builder nhúng vào app-update.yml lúc đóng gói) → không cần cấu hình thêm ở đây.
// Trên Windows + NSIS chạy được mà KHÔNG cần ký số.
export function initUpdater(emit: (s: UpdateStatus) => void): Updater {
  autoUpdater.autoDownload = true
  autoUpdater.autoInstallOnAppQuit = true

  autoUpdater.on('checking-for-update', () => emit({ state: 'checking' }))
  autoUpdater.on('update-available', (info) => emit({ state: 'available', version: info.version }))
  autoUpdater.on('update-not-available', () => emit({ state: 'none' }))
  autoUpdater.on('download-progress', (p) =>
    emit({ state: 'downloading', percent: Math.round(p.percent) })
  )
  autoUpdater.on('update-downloaded', (info) =>
    emit({ state: 'downloaded', version: info.version })
  )
  autoUpdater.on('error', (err) =>
    emit({ state: 'error', error: err instanceof Error ? err.message : String(err) })
  )

  const check = (): void => {
    // Chỉ chạy trên bản đã đóng gói/cài đặt; dev build không có app-update.yml
    if (!app.isPackaged) {
      emit({ state: 'none' })
      return
    }
    void autoUpdater.checkForUpdates().catch((err) => {
      emit({ state: 'error', error: err instanceof Error ? err.message : String(err) })
    })
  }

  const install = (): void => {
    // setImmediate để renderer kịp xử lý phản hồi invoke trước khi app thoát để cài
    setImmediate(() => autoUpdater.quitAndInstall())
  }

  return { check, install }
}
