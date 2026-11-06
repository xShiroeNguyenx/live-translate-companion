import { app } from 'electron'
import electronUpdater from 'electron-updater'
import type { UpdateStatus } from '../shared/types'
import { describeUpdateError } from './update-error'

const { autoUpdater } = electronUpdater

// lỗi tạm thời → tự thử lại, giới hạn số lần để không gõ GitHub mãi khi mất mạng dài
const RETRY_MS = 5 * 60 * 1000
const MAX_RETRIES = 6

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

  let retries = 0
  let retryTimer: ReturnType<typeof setTimeout> | null = null

  // lỗi có thể tới 2 lần (event 'error' + promise reject) → hẹn giờ thử lại chỉ 1 lần
  const onError = (err: unknown): void => {
    const raw = err instanceof Error ? (err.stack ?? err.message) : String(err)
    console.error('Lỗi kiểm tra cập nhật:', raw)
    const info = describeUpdateError(err instanceof Error ? err.message : String(err))
    emit({ state: 'error', error: info.message, transient: info.transient })
    if (info.transient && !retryTimer && retries < MAX_RETRIES) {
      retries += 1
      retryTimer = setTimeout(() => {
        retryTimer = null
        check()
      }, RETRY_MS)
    }
  }
  const settled = (): void => {
    retries = 0
  }

  autoUpdater.on('checking-for-update', () => emit({ state: 'checking' }))
  autoUpdater.on('update-available', (info) => {
    settled()
    emit({ state: 'available', version: info.version })
  })
  autoUpdater.on('update-not-available', () => {
    settled()
    emit({ state: 'none' })
  })
  autoUpdater.on('download-progress', (p) =>
    emit({ state: 'downloading', percent: Math.round(p.percent) })
  )
  autoUpdater.on('update-downloaded', (info) =>
    emit({ state: 'downloaded', version: info.version })
  )
  autoUpdater.on('error', onError)

  const check = (): void => {
    // Chỉ chạy trên bản đã đóng gói/cài đặt; dev build không có app-update.yml
    if (!app.isPackaged) {
      emit({ state: 'none' })
      return
    }
    if (retryTimer) {
      clearTimeout(retryTimer)
      retryTimer = null
    }
    void autoUpdater.checkForUpdates().catch(onError)
  }

  const install = (): void => {
    // setImmediate để renderer kịp xử lý phản hồi invoke trước khi app thoát để cài
    setImmediate(() => autoUpdater.quitAndInstall())
  }

  return { check, install }
}
